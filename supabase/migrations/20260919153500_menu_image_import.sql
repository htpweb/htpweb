-- Código #79
-- Importación de menú desde imágenes para MASTER.
-- Extiende la infraestructura de carga masiva de Código #60 sin crear un sistema paralelo.

begin;

-- 1. El bucket privado de importaciones también acepta imágenes de menú.
update storage.buckets
set allowed_mime_types = array[
  'text/csv',
  'application/csv',
  'text/plain',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp'
]::text[]
where id = 'htpweb-imports';

-- 2. El job existente gana estado de preview/aplicación y resultado estructurado.
alter table public.bulk_import_jobs
  add column if not exists preview_data jsonb,
  add column if not exists analysis_model text,
  add column if not exists analyzed_at timestamptz,
  add column if not exists applied_at timestamptz,
  add column if not exists result_local_id uuid references public.locals(id) on delete set null;

alter table public.bulk_import_jobs
  drop constraint if exists bulk_import_jobs_type_check;

alter table public.bulk_import_jobs
  add constraint bulk_import_jobs_type_check
  check (
    import_type in (
      'PRODUCTS',
      'VARIANTS',
      'LOCAL_INFO',
      'MENU_IMAGE'
    )
  );

alter table public.bulk_import_jobs
  drop constraint if exists bulk_import_jobs_status_check;

alter table public.bulk_import_jobs
  add constraint bulk_import_jobs_status_check
  check (
    status in (
      'UPLOADED',
      'QUEUED',
      'PROCESSING',
      'PREVIEW_READY',
      'APPLYING',
      'APPLIED',
      'COMPLETED',
      'COMPLETED_WITH_ERRORS',
      'FAILED',
      'CANCELLED'
    )
  );

alter table public.bulk_import_jobs
  drop constraint if exists bulk_import_jobs_preview_object_check;

alter table public.bulk_import_jobs
  add constraint bulk_import_jobs_preview_object_check
  check (
    preview_data is null
    or jsonb_typeof(preview_data) = 'object'
  );

-- 3. Un menú puede componerse de hasta cinco imágenes.
create table if not exists public.menu_import_files (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.bulk_import_jobs(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint menu_import_files_mime_check
    check (mime_type in ('image/jpeg','image/png','image/webp')),
  constraint menu_import_files_order_check
    check (display_order >= 0)
);

create index if not exists idx_menu_import_files_job
  on public.menu_import_files(job_id, display_order);

alter table public.menu_import_files enable row level security;

drop policy if exists menu_import_files_select_master
  on public.menu_import_files;

create policy menu_import_files_select_master
on public.menu_import_files
for select
to authenticated
using (public.is_master());

revoke all privileges on table public.menu_import_files
from anon, authenticated;

grant select on table public.menu_import_files to authenticated;
grant all privileges on table public.menu_import_files to service_role;

-- 4. Los jobs MENU_IMAGE son visibles únicamente para MASTER.
drop policy if exists bulk_import_jobs_select_authorized
  on public.bulk_import_jobs;

create policy bulk_import_jobs_select_authorized
on public.bulk_import_jobs
for select
to authenticated
using (
  public.is_master()
  or (
    import_type <> 'MENU_IMAGE'
    and public.current_role_code() = 'DELIVERY_ADMIN'
    and public.has_permission('bulk_import.manage')
    and public.user_has_delivery(delivery_id)
    and public.delivery_has_capability(delivery_id, 'bulk_import.manage')
  )
);

drop policy if exists bulk_import_errors_select_authorized
  on public.bulk_import_errors;

create policy bulk_import_errors_select_authorized
on public.bulk_import_errors
for select
to authenticated
using (
  exists (
    select 1
    from public.bulk_import_jobs j
    where j.id = bulk_import_errors.job_id
      and (
        public.is_master()
        or (
          j.import_type <> 'MENU_IMAGE'
          and public.current_role_code() = 'DELIVERY_ADMIN'
          and public.has_permission('bulk_import.manage')
          and public.user_has_delivery(j.delivery_id)
          and public.delivery_has_capability(j.delivery_id, 'bulk_import.manage')
        )
      )
  )
);

-- 5. MASTER registra un job después de subir de 1 a 5 imágenes privadas.
create or replace function public.master_create_menu_image_job(
  p_delivery_id uuid,
  p_files jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job_id uuid;
  v_file jsonb;
  v_path text;
  v_mime text;
  v_order integer := 0;
  v_first_path text;
  v_count integer;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if not exists (
    select 1
    from public.deliveries d
    where d.id = p_delivery_id
      and d.active = true
  ) then
    raise exception 'HTPWEB: DELIVERY inexistente o inactivo';
  end if;

  if p_files is null or jsonb_typeof(p_files) <> 'array' then
    raise exception 'HTPWEB: p_files debe ser un arreglo JSON';
  end if;

  v_count := jsonb_array_length(p_files);

  if v_count < 1 or v_count > 5 then
    raise exception 'HTPWEB: la importación admite entre 1 y 5 imágenes';
  end if;

  -- Validar todos los archivos antes de crear el job.
  for v_file in select value from jsonb_array_elements(p_files)
  loop
    v_path := nullif(trim(v_file->>'storage_path'), '');
    v_mime := lower(nullif(trim(v_file->>'mime_type'), ''));

    if v_path is null then
      raise exception 'HTPWEB: cada imagen requiere storage_path';
    end if;

    if v_mime not in ('image/jpeg','image/png','image/webp') then
      raise exception 'HTPWEB: formato de imagen no permitido (%)', coalesce(v_mime, 'NULL');
    end if;

    if split_part(v_path, '/', 1) <> 'delivery'
       or public.safe_uuid(split_part(v_path, '/', 2)) is distinct from p_delivery_id
    then
      raise exception 'HTPWEB: una ruta de imagen no corresponde al DELIVERY';
    end if;

    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'htpweb-imports'
        and o.name = v_path
    ) then
      raise exception 'HTPWEB: no existe el archivo privado %', v_path;
    end if;

    if v_first_path is null then
      v_first_path := v_path;
    end if;
  end loop;

  insert into public.bulk_import_jobs (
    delivery_id,
    requested_by,
    import_type,
    storage_path,
    status,
    total_rows,
    processed_rows,
    success_rows,
    error_rows,
    created_at,
    updated_at
  )
  values (
    p_delivery_id,
    auth.uid(),
    'MENU_IMAGE',
    v_first_path,
    'UPLOADED',
    null,
    0,
    0,
    0,
    now(),
    now()
  )
  returning id into v_job_id;

  v_order := 0;
  for v_file in select value from jsonb_array_elements(p_files)
  loop
    v_path := trim(v_file->>'storage_path');
    v_mime := lower(trim(v_file->>'mime_type'));

    insert into public.menu_import_files (
      job_id,
      storage_path,
      mime_type,
      display_order,
      created_at
    )
    values (
      v_job_id,
      v_path,
      v_mime,
      v_order,
      now()
    );

    v_order := v_order + 1;
  end loop;

  return v_job_id;
end;
$function$;

revoke all on function public.master_create_menu_image_job(uuid,jsonb)
from public, anon, service_role;

grant execute on function public.master_create_menu_image_job(uuid,jsonb)
to authenticated;

-- 6. Aplicación transaccional del preview corregido por MASTER.
--    - Si se elige un LOCAL existente, no se sobrescriben sus datos globales.
--    - Si se crea uno nuevo, queda inactivo salvo que MASTER marque active=true
--      y proporcione coordenadas válidas.
--    - Categorías/productos/variantes coincidentes por nombre se actualizan,
--      evitando duplicados al reintentar una importación.
create or replace function public.master_apply_menu_import(
  p_job_id uuid,
  p_preview jsonb,
  p_existing_local_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.bulk_import_jobs%rowtype;
  v_local jsonb;
  v_category jsonb;
  v_product jsonb;
  v_variant jsonb;

  v_local_id uuid;
  v_category_id uuid;
  v_product_id uuid;
  v_variant_id uuid;

  v_local_name text;
  v_slug_base text;
  v_slug text;
  v_address text;
  v_phone text;
  v_whatsapp text;
  v_description text;
  v_latitude numeric;
  v_longitude numeric;
  v_active boolean := false;

  v_category_name text;
  v_product_name text;
  v_variant_name text;
  v_price numeric;
  v_existing_image text;

  v_categories integer := 0;
  v_products integer := 0;
  v_variants integer := 0;
  v_display_category integer := 0;
  v_display_product integer;
  v_display_variant integer;

  v_before jsonb;
  v_after jsonb;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  select *
  into v_job
  from public.bulk_import_jobs j
  where j.id = p_job_id
  for update;

  if not found then
    raise exception 'HTPWEB: importación inexistente';
  end if;

  if v_job.import_type <> 'MENU_IMAGE' then
    raise exception 'HTPWEB: el job no es una importación de menú por imagen';
  end if;

  if v_job.status <> 'PREVIEW_READY' then
    raise exception 'HTPWEB: la importación debe estar en PREVIEW_READY antes de aplicarse';
  end if;

  if p_preview is null or jsonb_typeof(p_preview) <> 'object' then
    raise exception 'HTPWEB: preview inválido';
  end if;

  v_local := p_preview->'local';

  if v_local is null or jsonb_typeof(v_local) <> 'object' then
    raise exception 'HTPWEB: preview.local es obligatorio';
  end if;

  if jsonb_typeof(p_preview->'categories') <> 'array'
     or jsonb_array_length(p_preview->'categories') = 0
  then
    raise exception 'HTPWEB: el preview requiere al menos una categoría';
  end if;

  if not exists (
    select 1
    from public.deliveries d
    where d.id = v_job.delivery_id
      and d.active = true
  ) then
    raise exception 'HTPWEB: el DELIVERY del job no existe o está inactivo';
  end if;

  v_local_name := nullif(trim(v_local->>'name'), '');

  if v_local_name is null then
    raise exception 'HTPWEB: el nombre del LOCAL es obligatorio';
  end if;

  update public.bulk_import_jobs
  set status = 'APPLYING',
      preview_data = p_preview,
      updated_at = now(),
      error_message = null
  where id = p_job_id;

  if p_existing_local_id is not null then
    select to_jsonb(l)
    into v_before
    from public.locals l
    where l.id = p_existing_local_id;

    if v_before is null then
      raise exception 'HTPWEB: el LOCAL existente seleccionado no existe';
    end if;

    v_local_id := p_existing_local_id;

    insert into public.local_deliveries (
      local_id,
      delivery_id,
      active,
      created_at
    )
    values (
      v_local_id,
      v_job.delivery_id,
      true,
      now()
    )
    on conflict (local_id, delivery_id)
    do update set active = true;

    insert into public.local_change_history (
      local_id,
      request_id,
      change_type,
      before_data,
      after_data,
      changed_by,
      created_at
    )
    values (
      v_local_id,
      null,
      'MENU_IMPORT_LINK_EXISTING',
      v_before,
      v_before,
      auth.uid(),
      now()
    );
  else
    v_description := nullif(trim(v_local->>'description'), '');
    v_address := nullif(trim(v_local->>'address'), '');
    v_phone := nullif(trim(v_local->>'phone'), '');
    v_whatsapp := nullif(trim(v_local->>'whatsapp'), '');

    begin
      v_latitude := nullif(trim(v_local->>'latitude'), '')::numeric;
    exception when others then
      raise exception 'HTPWEB: latitude inválida';
    end;

    begin
      v_longitude := nullif(trim(v_local->>'longitude'), '')::numeric;
    exception when others then
      raise exception 'HTPWEB: longitude inválida';
    end;

    begin
      v_active := coalesce((v_local->>'active')::boolean, false);
    exception when others then
      raise exception 'HTPWEB: active inválido';
    end;

    if (v_latitude is null) <> (v_longitude is null) then
      raise exception 'HTPWEB: latitude y longitude deben proporcionarse juntas';
    end if;

    if v_latitude is not null and (v_latitude < -90 or v_latitude > 90) then
      raise exception 'HTPWEB: latitude inválida';
    end if;

    if v_longitude is not null and (v_longitude < -180 or v_longitude > 180) then
      raise exception 'HTPWEB: longitude inválida';
    end if;

    if v_active and (v_latitude is null or v_longitude is null) then
      raise exception 'HTPWEB: para publicar un LOCAL nuevo debe completar latitude y longitude';
    end if;

    v_local_id := gen_random_uuid();

    v_slug_base := lower(regexp_replace(v_local_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug_base := regexp_replace(v_slug_base, '(^-+|-+$)', '', 'g');

    if coalesce(v_slug_base, '') = '' then
      v_slug_base := 'local';
    end if;

    v_slug := v_slug_base || '-' ||
      substr(replace(v_local_id::text, '-', ''), 1, 8);

    insert into public.locals (
      id,
      zone_id,
      name,
      slug,
      description,
      banner_url,
      logo_url,
      address,
      latitude,
      longitude,
      google_maps_url,
      phone,
      whatsapp,
      website_url,
      instagram_url,
      facebook_url,
      tiktok_url,
      telegram_url,
      active,
      created_at,
      updated_at
    )
    values (
      v_local_id,
      null,
      v_local_name,
      v_slug,
      v_description,
      null,
      null,
      v_address,
      v_latitude,
      v_longitude,
      null,
      v_phone,
      v_whatsapp,
      null,
      null,
      null,
      null,
      null,
      v_active,
      now(),
      now()
    );

    insert into public.local_deliveries (
      local_id,
      delivery_id,
      active,
      created_at
    )
    values (
      v_local_id,
      v_job.delivery_id,
      true,
      now()
    )
    on conflict (local_id, delivery_id)
    do update set active = true;

    select to_jsonb(l)
    into v_after
    from public.locals l
    where l.id = v_local_id;

    insert into public.local_change_history (
      local_id,
      request_id,
      change_type,
      before_data,
      after_data,
      changed_by,
      created_at
    )
    values (
      v_local_id,
      null,
      'MENU_IMPORT_CREATE',
      null,
      v_after,
      auth.uid(),
      now()
    );
  end if;

  -- Catálogo confirmado por MASTER.
  for v_category in
    select value
    from jsonb_array_elements(p_preview->'categories')
  loop
    if jsonb_typeof(v_category) <> 'object' then
      raise exception 'HTPWEB: categoría inválida en el preview';
    end if;

    v_category_name := nullif(trim(v_category->>'name'), '');

    if v_category_name is null then
      raise exception 'HTPWEB: todas las categorías requieren nombre';
    end if;

    if jsonb_typeof(v_category->'products') <> 'array' then
      raise exception 'HTPWEB: la categoría % requiere products[]', v_category_name;
    end if;

    v_category_id := null;
    v_existing_image := null;

    select c.id, c.image_url
    into v_category_id, v_existing_image
    from public.categories c
    where c.local_id = v_local_id
      and lower(trim(c.name)) = lower(v_category_name)
    order by c.created_at
    limit 1;

    v_category_id := public.save_local_category(
      v_local_id,
      v_category_id,
      v_category_name,
      nullif(trim(v_category->>'description'), ''),
      v_existing_image,
      v_display_category,
      true
    );

    v_categories := v_categories + 1;
    v_display_product := 0;

    for v_product in
      select value
      from jsonb_array_elements(v_category->'products')
    loop
      if jsonb_typeof(v_product) <> 'object' then
        raise exception 'HTPWEB: producto inválido en categoría %', v_category_name;
      end if;

      v_product_name := nullif(trim(v_product->>'name'), '');

      if v_product_name is null then
        raise exception 'HTPWEB: todos los productos requieren nombre';
      end if;

      if jsonb_typeof(v_product->'variants') <> 'array' then
        raise exception 'HTPWEB: el producto % requiere variants[]', v_product_name;
      end if;

      begin
        v_price := nullif(trim(v_product->>'price'), '')::numeric;
      exception when others then
        raise exception 'HTPWEB: precio inválido para producto %', v_product_name;
      end;

      if v_price is null and jsonb_array_length(v_product->'variants') > 0 then
        begin
          select min(nullif(trim(x.value->>'price'), '')::numeric)
          into v_price
          from jsonb_array_elements(v_product->'variants') x
          where nullif(trim(x.value->>'price'), '') is not null;
        exception when others then
          raise exception 'HTPWEB: existe un precio de variante inválido en %', v_product_name;
        end;
      end if;

      if v_price is null or v_price < 0 then
        raise exception 'HTPWEB: completa un precio válido para el producto %', v_product_name;
      end if;

      v_product_id := null;
      v_existing_image := null;

      select p.id, p.image_url
      into v_product_id, v_existing_image
      from public.products p
      where p.local_id = v_local_id
        and lower(trim(p.name)) = lower(v_product_name)
      order by p.created_at
      limit 1;

      v_product_id := public.save_local_product(
        v_local_id,
        v_product_id,
        v_category_id,
        v_product_name,
        nullif(trim(v_product->>'description'), ''),
        v_price,
        v_existing_image,
        v_display_product,
        true
      );

      v_products := v_products + 1;
      v_display_variant := 0;

      for v_variant in
        select value
        from jsonb_array_elements(v_product->'variants')
      loop
        v_variant_name := nullif(trim(v_variant->>'name'), '');

        if v_variant_name is null then
          raise exception 'HTPWEB: todas las variantes requieren nombre';
        end if;

        begin
          v_price := nullif(trim(v_variant->>'price'), '')::numeric;
        exception when others then
          raise exception 'HTPWEB: precio inválido para variante %', v_variant_name;
        end;

        if v_price is null or v_price < 0 then
          raise exception 'HTPWEB: completa un precio válido para la variante %', v_variant_name;
        end if;

        v_variant_id := null;

        select pv.id
        into v_variant_id
        from public.product_variants pv
        where pv.product_id = v_product_id
          and lower(trim(pv.name)) = lower(v_variant_name)
        order by pv.created_at
        limit 1;

        perform public.save_product_variant(
          v_product_id,
          v_variant_id,
          v_variant_name,
          v_price,
          v_display_variant,
          true
        );

        v_variants := v_variants + 1;
        v_display_variant := v_display_variant + 1;
      end loop;

      v_display_product := v_display_product + 1;
    end loop;

    v_display_category := v_display_category + 1;
  end loop;

  update public.bulk_import_jobs
  set status = 'APPLIED',
      preview_data = p_preview,
      processed_rows = v_products,
      success_rows = v_products,
      error_rows = 0,
      result_local_id = v_local_id,
      applied_at = now(),
      finished_at = now(),
      updated_at = now(),
      error_message = null
  where id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'local_id', v_local_id,
    'delivery_id', v_job.delivery_id,
    'categories', v_categories,
    'products', v_products,
    'variants', v_variants,
    'status', 'APPLIED'
  );
end;
$function$;

revoke all on function public.master_apply_menu_import(uuid,jsonb,uuid)
from public, anon, service_role;

grant execute on function public.master_apply_menu_import(uuid,jsonb,uuid)
to authenticated;

comment on function public.master_create_menu_image_job(uuid,jsonb) is
  'MASTER registra 1–5 imágenes privadas como un job MENU_IMAGE.';

comment on function public.master_apply_menu_import(uuid,jsonb,uuid) is
  'MASTER aplica en una transacción el preview corregido: LOCAL, categorías, productos y variantes.';

commit;
