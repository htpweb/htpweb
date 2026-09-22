-- HTPWEB Código 108 — fotos por SKU, promociones temporales y limpieza segura de catálogo.

create table if not exists public.local_promotions (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null references public.locals(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  title text not null,
  body text,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  days_of_week smallint[] not null default '{}'::smallint[],
  display_order integer not null default 0 check (display_order >= 0),
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (days_of_week <@ array[0,1,2,3,4,5,6]::smallint[])
);

create index if not exists local_promotions_local_idx
  on public.local_promotions(local_id,active,display_order);

create index if not exists local_promotions_product_idx
  on public.local_promotions(product_id)
  where product_id is not null;

alter table public.local_promotions enable row level security;

revoke all on table public.local_promotions from public,anon,authenticated;
grant select on table public.local_promotions to authenticated;
grant all on table public.local_promotions to service_role;

drop policy if exists local_promotions_admin_select on public.local_promotions;
create policy local_promotions_admin_select
on public.local_promotions
for select
to authenticated
using (
  public.is_master()
  or exists (
    select 1
    from public.user_locals ul
    where ul.user_id=auth.uid()
      and ul.local_id=local_promotions.local_id
      and ul.active=true
  )
);

create or replace function public.save_local_promotion(
  p_promotion_id uuid,
  p_local_id uuid,
  p_product_id uuid,
  p_title text,
  p_body text,
  p_image_url text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_days_of_week smallint[],
  p_display_order integer,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid:=coalesce(p_promotion_id,gen_random_uuid());
  v_days smallint[]:=coalesce(p_days_of_week,'{}'::smallint[]);
begin
  if not public.is_master()
     and not exists(
       select 1 from public.user_locals ul
       where ul.user_id=auth.uid()
         and ul.local_id=p_local_id
         and ul.active=true
     ) then
    raise exception 'HTPWEB: no autorizado para gestionar promociones de este LOCAL';
  end if;

  if not exists(select 1 from public.locals l where l.id=p_local_id) then
    raise exception 'HTPWEB: LOCAL inexistente';
  end if;

  if nullif(trim(coalesce(p_title,'')),'') is null then
    raise exception 'HTPWEB: título de promoción requerido';
  end if;

  if p_product_id is not null and not exists(
    select 1 from public.products p
    where p.id=p_product_id and p.local_id=p_local_id
  ) then
    raise exception 'HTPWEB: el producto no pertenece al LOCAL';
  end if;

  if p_starts_at is not null and p_ends_at is not null and p_ends_at<=p_starts_at then
    raise exception 'HTPWEB: la fecha final debe ser posterior al inicio';
  end if;

  if coalesce(p_display_order,0)<0 then
    raise exception 'HTPWEB: orden inválido';
  end if;

  if not (v_days <@ array[0,1,2,3,4,5,6]::smallint[]) then
    raise exception 'HTPWEB: días de vigencia inválidos';
  end if;

  insert into public.local_promotions(
    id,local_id,product_id,title,body,image_url,starts_at,ends_at,
    days_of_week,display_order,active,created_by,created_at,updated_at
  )
  values(
    v_id,p_local_id,p_product_id,trim(p_title),
    nullif(trim(coalesce(p_body,'')),''),
    nullif(trim(coalesce(p_image_url,'')),''),
    p_starts_at,p_ends_at,v_days,coalesce(p_display_order,0),
    coalesce(p_active,true),auth.uid(),now(),now()
  )
  on conflict(id) do update set
    local_id=excluded.local_id,
    product_id=excluded.product_id,
    title=excluded.title,
    body=excluded.body,
    image_url=excluded.image_url,
    starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,
    days_of_week=excluded.days_of_week,
    display_order=excluded.display_order,
    active=excluded.active,
    updated_at=now();

  return v_id;
end;
$$;

revoke all on function public.save_local_promotion(
  uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,smallint[],integer,boolean
) from public,anon;
grant execute on function public.save_local_promotion(
  uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,smallint[],integer,boolean
) to authenticated;

create or replace function public.delete_local_promotion(p_promotion_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_local_id uuid;
begin
  select p.local_id into v_local_id
  from public.local_promotions p
  where p.id=p_promotion_id;

  if v_local_id is null then
    return false;
  end if;

  if not public.is_master()
     and not exists(
       select 1 from public.user_locals ul
       where ul.user_id=auth.uid()
         and ul.local_id=v_local_id
         and ul.active=true
     ) then
    raise exception 'HTPWEB: no autorizado para eliminar esta promoción';
  end if;

  delete from public.local_promotions where id=p_promotion_id;
  return true;
end;
$$;

revoke all on function public.delete_local_promotion(uuid) from public,anon;
grant execute on function public.delete_local_promotion(uuid) to authenticated;

create or replace function public.public_active_local_promotions(p_local_id uuid)
returns table(
  id uuid,
  local_id uuid,
  product_id uuid,
  title text,
  body text,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  days_of_week smallint[],
  display_order integer
)
language sql
stable
security definer
set search_path=''
as $$
  select
    p.id,p.local_id,p.product_id,p.title,p.body,p.image_url,
    p.starts_at,p.ends_at,p.days_of_week,p.display_order
  from public.local_promotions p
  where p.local_id=p_local_id
    and p.active=true
    and exists(select 1 from public.locals l where l.id=p.local_id and l.active=true)
    and (
      p.product_id is null
      or exists(select 1 from public.products pr where pr.id=p.product_id and pr.active=true)
    )
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

create or replace function public.master_delete_products(p_product_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_name text;
  v_deleted jsonb:='[]'::jsonb;
  v_blocked jsonb:='[]'::jsonb;
  v_requested integer:=0;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if p_product_ids is null or cardinality(p_product_ids)=0 then
    raise exception 'HTPWEB: seleccione al menos un producto';
  end if;

  if cardinality(p_product_ids)>3000 then
    raise exception 'HTPWEB: máximo 3000 productos por operación';
  end if;

  select count(distinct x)
  into v_requested
  from unnest(p_product_ids) as t(x)
  where x is not null;

  for v_id in
    select distinct x
    from unnest(p_product_ids) as t(x)
    where x is not null
    order by x
  loop
    select p.name into v_name
    from public.products p
    where p.id=v_id;

    if v_name is null then
      v_blocked:=v_blocked||jsonb_build_array(
        jsonb_build_object('id',v_id,'name','Producto inexistente','reason','NOT_FOUND')
      );
      continue;
    end if;

    if exists(select 1 from public.order_items oi where oi.product_id=v_id) then
      update public.products set active=false,updated_at=now() where id=v_id;
      update public.product_variants set active=false,updated_at=now() where product_id=v_id;
      v_blocked:=v_blocked||jsonb_build_array(
        jsonb_build_object('id',v_id,'name',v_name,'reason','ORDER_HISTORY')
      );
      continue;
    end if;

    if to_regclass('public.advertisements') is not null then
      execute 'update public.advertisements set product_id=null where product_id=$1'
      using v_id;
    end if;

    begin
      delete from public.product_variants where product_id=v_id;
      delete from public.products where id=v_id;

      v_deleted:=v_deleted||jsonb_build_array(
        jsonb_build_object('id',v_id,'name',v_name)
      );
    exception
      when foreign_key_violation then
        update public.products set active=false,updated_at=now() where id=v_id;
        update public.product_variants set active=false,updated_at=now() where product_id=v_id;
        v_blocked:=v_blocked||jsonb_build_array(
          jsonb_build_object('id',v_id,'name',v_name,'reason','HISTORY_REFERENCE')
        );
    end;
  end loop;

  return jsonb_build_object(
    'requested',v_requested,
    'deleted',v_deleted,
    'blocked',v_blocked
  );
end;
$$;

revoke all on function public.master_delete_products(uuid[]) from public,anon;
grant execute on function public.master_delete_products(uuid[]) to authenticated;
