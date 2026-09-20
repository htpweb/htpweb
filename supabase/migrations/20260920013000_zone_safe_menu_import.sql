-- HTPWEB Código #88C — compatibilidad del importador de menú con cobertura por zonas.
-- No crea ni reactiva vínculos manuales LOCAL↔DELIVERY.
-- Un LOCAL nuevo debe indicar zone_id y se crea mediante master_save_local_v2.

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
  v_zone_id uuid;
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
    -- No manual DELIVERY↔LOCAL link: visibility is derived from the LOCAL zone.
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

    begin
      v_zone_id := nullif(trim(v_local->>'zone_id'), '')::uuid;
    exception when others then
      raise exception 'HTPWEB: zona inválida para el LOCAL importado';
    end;

    if v_zone_id is null then
      raise exception 'HTPWEB: seleccione una zona para crear el LOCAL importado';
    end if;

    v_local_id := public.master_save_local_v2(
      null,
      v_zone_id,
      v_local_name,
      '',
      v_description,
      v_address,
      v_latitude,
      v_longitude,
      v_phone,
      v_whatsapp,
      null,
      null,
      'MANUAL',
      v_active
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


revoke execute on function public.master_apply_menu_import(uuid,jsonb,uuid)
from public, anon, service_role;

grant execute on function public.master_apply_menu_import(uuid,jsonb,uuid)
to authenticated;

comment on function public.master_apply_menu_import(uuid,jsonb,uuid) is
  'MASTER aplica un menú a un LOCAL existente o crea uno en una zona. DELIVERY es contexto de importación; cobertura se deriva exclusivamente de zonas.';
