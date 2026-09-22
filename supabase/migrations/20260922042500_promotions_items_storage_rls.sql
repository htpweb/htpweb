-- HTPWEB Código 110 — promociones con productos/variantes, cantidades/precios y RLS de imágenes.

-- 1) La promoción puede tener un precio total promocional opcional.
alter table public.local_promotions
  add column if not exists promotion_price numeric;

alter table public.local_promotions
  drop constraint if exists local_promotions_promotion_price_check;

alter table public.local_promotions
  add constraint local_promotions_promotion_price_check
  check (promotion_price is null or promotion_price >= 0);

-- 2) Ítems estructurados de una promoción.
create table if not exists public.local_promotion_items (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.local_promotions(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0 and quantity <= 999),
  promo_price numeric,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  check (promo_price is null or promo_price >= 0)
);

create index if not exists local_promotion_items_promotion_idx
  on public.local_promotion_items(promotion_id,display_order,id);

create index if not exists local_promotion_items_product_idx
  on public.local_promotion_items(product_id);

alter table public.local_promotion_items enable row level security;

revoke all on table public.local_promotion_items from public,anon,authenticated;
grant select on table public.local_promotion_items to authenticated;
grant all on table public.local_promotion_items to service_role;

drop policy if exists local_promotion_items_admin_select on public.local_promotion_items;
create policy local_promotion_items_admin_select
on public.local_promotion_items
for select
to authenticated
using (
  exists (
    select 1
    from public.local_promotions lp
    where lp.id=local_promotion_items.promotion_id
      and (
        public.is_master()
        or exists (
          select 1
          from public.user_locals ul
          where ul.user_id=auth.uid()
            and ul.local_id=lp.local_id
            and ul.active=true
        )
      )
  )
);

-- 3) Guardado transaccional de promoción + ítems.
create or replace function public.save_local_promotion_v2(
  p_promotion_id uuid,
  p_local_id uuid,
  p_title text,
  p_body text,
  p_image_url text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_days_of_week smallint[],
  p_display_order integer,
  p_active boolean,
  p_promotion_price numeric,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid:=coalesce(p_promotion_id,gen_random_uuid());
  v_days smallint[]:=coalesce(p_days_of_week,'{}'::smallint[]);
  v_item jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_quantity integer;
  v_promo_price numeric;
  v_order integer:=0;
begin
  if not public.is_master()
     and not exists(
       select 1
       from public.user_locals ul
       where ul.user_id=auth.uid()
         and ul.local_id=p_local_id
         and ul.active=true
     ) then
    raise exception 'HTPWEB: no autorizado para gestionar promociones de este LOCAL';
  end if;

  if not exists(select 1 from public.locals l where l.id=p_local_id) then
    raise exception 'HTPWEB: LOCAL inexistente';
  end if;

  if p_promotion_id is not null and exists(
    select 1
    from public.local_promotions p
    where p.id=p_promotion_id and p.local_id<>p_local_id
  ) then
    raise exception 'HTPWEB: la promoción no pertenece al LOCAL seleccionado';
  end if;

  if nullif(trim(coalesce(p_title,'')),'') is null then
    raise exception 'HTPWEB: título de promoción requerido';
  end if;

  if p_starts_at is not null and p_ends_at is not null and p_ends_at<=p_starts_at then
    raise exception 'HTPWEB: la fecha final debe ser posterior al inicio';
  end if;

  if coalesce(p_display_order,0)<0 then
    raise exception 'HTPWEB: orden inválido';
  end if;

  if p_promotion_price is not null and p_promotion_price<0 then
    raise exception 'HTPWEB: precio promocional inválido';
  end if;

  if not (v_days <@ array[0,1,2,3,4,5,6]::smallint[]) then
    raise exception 'HTPWEB: días de vigencia inválidos';
  end if;

  if p_items is null or jsonb_typeof(p_items)<>'array' then
    raise exception 'HTPWEB: los productos de la promoción deben enviarse como arreglo';
  end if;

  if jsonb_array_length(p_items)>100 then
    raise exception 'HTPWEB: máximo 100 líneas por promoción';
  end if;

  insert into public.local_promotions(
    id,local_id,product_id,title,body,image_url,starts_at,ends_at,
    days_of_week,display_order,active,promotion_price,created_by,created_at,updated_at
  )
  values(
    v_id,p_local_id,null,trim(p_title),
    nullif(trim(coalesce(p_body,'')),''),
    nullif(trim(coalesce(p_image_url,'')),''),
    p_starts_at,p_ends_at,v_days,coalesce(p_display_order,0),
    coalesce(p_active,true),p_promotion_price,auth.uid(),now(),now()
  )
  on conflict(id) do update set
    local_id=excluded.local_id,
    product_id=null,
    title=excluded.title,
    body=excluded.body,
    image_url=excluded.image_url,
    starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,
    days_of_week=excluded.days_of_week,
    display_order=excluded.display_order,
    active=excluded.active,
    promotion_price=excluded.promotion_price,
    updated_at=now();

  delete from public.local_promotion_items
  where promotion_id=v_id;

  v_order:=0;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id=(trim(coalesce(v_item->>'product_id','')))::uuid;
    exception when others then
      raise exception 'HTPWEB: producto inválido en promoción';
    end;

    if not exists(
      select 1 from public.products p
      where p.id=v_product_id and p.local_id=p_local_id
    ) then
      raise exception 'HTPWEB: un producto de la promoción no pertenece al LOCAL';
    end if;

    v_variant_id:=null;
    if nullif(trim(coalesce(v_item->>'variant_id','')),'') is not null then
      begin
        v_variant_id=(trim(v_item->>'variant_id'))::uuid;
      exception when others then
        raise exception 'HTPWEB: variante inválida en promoción';
      end;

      if not exists(
        select 1 from public.product_variants pv
        where pv.id=v_variant_id and pv.product_id=v_product_id
      ) then
        raise exception 'HTPWEB: la variante no pertenece al producto seleccionado';
      end if;
    end if;

    begin
      v_quantity=coalesce(nullif(trim(v_item->>'quantity'),''),'1')::integer;
    exception when others then
      raise exception 'HTPWEB: cantidad inválida en promoción';
    end;

    if v_quantity<1 or v_quantity>999 then
      raise exception 'HTPWEB: cantidad fuera de rango en promoción';
    end if;

    v_promo_price:=null;
    if nullif(trim(coalesce(v_item->>'promo_price','')),'') is not null then
      begin
        v_promo_price=replace(trim(v_item->>'promo_price'),',','.')::numeric;
      exception when others then
        raise exception 'HTPWEB: precio promocional inválido en una línea';
      end;

      if v_promo_price<0 then
        raise exception 'HTPWEB: precio promocional negativo en una línea';
      end if;
    end if;

    insert into public.local_promotion_items(
      promotion_id,product_id,variant_id,quantity,promo_price,display_order
    )
    values(
      v_id,v_product_id,v_variant_id,v_quantity,v_promo_price,v_order
    );

    v_order:=v_order+1;
  end loop;

  return v_id;
end;
$$;

revoke all on function public.save_local_promotion_v2(
  uuid,uuid,text,text,text,timestamptz,timestamptz,smallint[],integer,boolean,numeric,jsonb
) from public,anon;
grant execute on function public.save_local_promotion_v2(
  uuid,uuid,text,text,text,timestamptz,timestamptz,smallint[],integer,boolean,numeric,jsonb
) to authenticated;

-- 4) Vista pública: devuelve también el precio total y los ítems.
drop function if exists public.public_active_local_promotions(uuid);

create function public.public_active_local_promotions(p_local_id uuid)
returns table(
  id uuid,
  local_id uuid,
  title text,
  body text,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  days_of_week smallint[],
  display_order integer,
  promotion_price numeric,
  items jsonb
)
language sql
stable
security definer
set search_path=''
as $$
  select
    p.id,
    p.local_id,
    p.title,
    p.body,
    p.image_url,
    p.starts_at,
    p.ends_at,
    p.days_of_week,
    p.display_order,
    p.promotion_price,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',i.id,
          'product_id',i.product_id,
          'product_name',pr.name,
          'variant_id',i.variant_id,
          'variant_name',pv.name,
          'quantity',i.quantity,
          'promo_price',i.promo_price,
          'regular_unit_price',coalesce(pv.price,pr.price)
        )
        order by i.display_order,i.id
      )
      from public.local_promotion_items i
      join public.products pr on pr.id=i.product_id
      left join public.product_variants pv on pv.id=i.variant_id
      where i.promotion_id=p.id
        and pr.active=true
        and (i.variant_id is null or pv.active=true)
    ),'[]'::jsonb)
  from public.local_promotions p
  where p.local_id=p_local_id
    and p.active=true
    and exists(select 1 from public.locals l where l.id=p.local_id and l.active=true)
    and (p.starts_at is null or p.starts_at<=now())
    and (p.ends_at is null or p.ends_at>=now())
    and (
      cardinality(p.days_of_week)=0
      or extract(dow from timezone('America/Guayaquil',now()))::smallint=any(p.days_of_week)
    )
  order by p.display_order,p.created_at desc;
$$;

revoke all on function public.public_active_local_promotions(uuid) from public;
grant execute on function public.public_active_local_promotions(uuid) to anon,authenticated;

-- 5) RLS de Storage para imágenes de promociones.
-- La promoción se crea primero; después el navegador sube promotion/<promotion_id>/image.
drop policy if exists htpweb_media_promotion_insert on storage.objects;
create policy htpweb_media_promotion_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='htpweb-media'
  and split_part(name,'/',1)='promotion'
  and split_part(name,'/',3)='image'
  and exists(
    select 1
    from public.local_promotions lp
    where lp.id = case
      when split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(name,'/',2)::uuid
      else null
    end
    and (
      public.is_master()
      or exists(
        select 1
        from public.user_locals ul
        where ul.user_id=auth.uid()
          and ul.local_id=lp.local_id
          and ul.active=true
      )
    )
  )
);

drop policy if exists htpweb_media_promotion_update on storage.objects;
create policy htpweb_media_promotion_update
on storage.objects
for update
to authenticated
using (
  bucket_id='htpweb-media'
  and split_part(name,'/',1)='promotion'
  and exists(
    select 1
    from public.local_promotions lp
    where lp.id = case
      when split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(name,'/',2)::uuid
      else null
    end
    and (
      public.is_master()
      or exists(
        select 1
        from public.user_locals ul
        where ul.user_id=auth.uid()
          and ul.local_id=lp.local_id
          and ul.active=true
      )
    )
  )
)
with check (
  bucket_id='htpweb-media'
  and split_part(name,'/',1)='promotion'
  and split_part(name,'/',3)='image'
);

drop policy if exists htpweb_media_promotion_delete on storage.objects;
create policy htpweb_media_promotion_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id='htpweb-media'
  and split_part(name,'/',1)='promotion'
  and exists(
    select 1
    from public.local_promotions lp
    where lp.id = case
      when split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(name,'/',2)::uuid
      else null
    end
    and (
      public.is_master()
      or exists(
        select 1
        from public.user_locals ul
        where ul.user_id=auth.uid()
          and ul.local_id=lp.local_id
          and ul.active=true
      )
    )
  )
);
