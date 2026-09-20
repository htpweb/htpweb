-- HTPWEB Código 96 — categoría comercial del LOCAL y ubicación administrativa independiente de la zona.
-- La zona determina cobertura por polígono. Provincia/cantón describen la ubicación administrativa real del LOCAL.

create table if not exists public.local_business_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists local_business_categories_name_uidx
  on public.local_business_categories(lower(name));

alter table public.local_business_categories enable row level security;

drop policy if exists local_business_categories_read on public.local_business_categories;
create policy local_business_categories_read
  on public.local_business_categories
  for select
  to anon, authenticated
  using(active or public.is_master());

grant select on public.local_business_categories to anon, authenticated;

alter table public.locals
  add column if not exists city_id uuid references public.cities(id),
  add column if not exists business_category_id uuid references public.local_business_categories(id);

update public.locals l
set city_id=z.city_id
from public.zones z
where l.zone_id=z.id
  and l.city_id is null;

create index if not exists locals_city_id_idx on public.locals(city_id);
create index if not exists locals_business_category_id_idx on public.locals(business_category_id);

create or replace function public.master_list_local_business_categories()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select case when not public.is_master() then '[]'::jsonb else
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,
        'name',c.name,
        'description',c.description,
        'active',c.active,
        'local_count',(select count(*) from public.locals l where l.business_category_id=c.id)
      ) order by lower(c.name),c.id)
      from public.local_business_categories c
    ),'[]'::jsonb)
  end;
$$;

create or replace function public.master_save_local_business_category(
  p_category_id uuid,
  p_name text,
  p_description text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid:=coalesce(p_category_id,gen_random_uuid());
  v_name text:=nullif(trim(p_name),'');
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;
  if v_name is null then
    raise exception 'HTPWEB: nombre de categoría requerido';
  end if;
  if exists(
    select 1 from public.local_business_categories c
    where lower(trim(c.name))=lower(v_name) and c.id<>v_id
  ) then
    raise exception 'HTPWEB: ya existe una categoría de LOCAL con ese nombre';
  end if;
  if p_category_id is not null
     and not exists(select 1 from public.local_business_categories c where c.id=p_category_id) then
    raise exception 'HTPWEB: categoría inexistente';
  end if;
  if coalesce(p_active,false)=false
     and exists(select 1 from public.locals l where l.business_category_id=v_id and l.active=true) then
    raise exception 'HTPWEB: no puede inactivar una categoría utilizada por LOCAL activos';
  end if;

  insert into public.local_business_categories(id,name,description,active,created_at,updated_at)
  values(v_id,v_name,nullif(trim(coalesce(p_description,'')),''),coalesce(p_active,true),now(),now())
  on conflict(id) do update set
    name=excluded.name,
    description=excluded.description,
    active=excluded.active,
    updated_at=now();

  return v_id;
end;
$$;

create or replace function public.master_list_locals()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,
    'name',l.name,
    'slug',l.slug,
    'description',l.description,
    'address',l.address,
    'latitude',l.latitude,
    'longitude',l.longitude,
    'phone',l.phone,
    'whatsapp',l.whatsapp,
    'active',l.active,
    'logo_url',l.logo_url,
    'banner_url',l.banner_url,
    'zone_id',l.zone_id,
    'business_category_id',l.business_category_id,
    'business_category_name',bc.name,
    'google_place_id',l.google_place_id,
    'google_maps_url',l.google_maps_url,
    'location_source',l.location_source,
    'zone_code',z.code,
    'zone_name',z.name,
    'city_id',coalesce(l.city_id,z.city_id),
    'canton',coalesce(lc.name,zc.name),
    'province',coalesce(lc.province,zc.province)
  ) order by coalesce(lc.province,zc.province),coalesce(lc.name,zc.name),lower(l.name)),'[]'::jsonb)
  from public.locals l
  left join public.zones z on z.id=l.zone_id
  left join public.cities zc on zc.id=z.city_id
  left join public.cities lc on lc.id=l.city_id
  left join public.local_business_categories bc on bc.id=l.business_category_id
  where public.is_master();
$$;

create or replace function public.master_save_local_v3(
  p_local_id uuid,
  p_city_id uuid,
  p_zone_id uuid,
  p_business_category_id uuid,
  p_name text,
  p_slug text,
  p_description text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_phone text,
  p_whatsapp text,
  p_google_place_id text,
  p_google_maps_url text,
  p_location_source text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid:=coalesce(p_local_id,gen_random_uuid());
  v_name text:=nullif(trim(p_name),'');
  v_slug text:=lower(trim(coalesce(p_slug,'')));
  v_before jsonb;
  v_after jsonb;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;
  if v_name is null then
    raise exception 'HTPWEB: nombre del LOCAL requerido';
  end if;
  if not exists(select 1 from public.cities c where c.id=p_city_id and c.active=true) then
    raise exception 'HTPWEB: provincia/cantón inválido o inactivo';
  end if;
  if not exists(select 1 from public.zones z where z.id=p_zone_id and z.active=true) then
    raise exception 'HTPWEB: seleccione una zona activa';
  end if;
  if not exists(select 1 from public.local_business_categories c where c.id=p_business_category_id and c.active=true) then
    raise exception 'HTPWEB: seleccione una categoría de LOCAL activa';
  end if;
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'HTPWEB: complete ambas coordenadas';
  end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'HTPWEB: latitud inválida';
  end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'HTPWEB: longitud inválida';
  end if;
  if coalesce(p_active,false) and (p_latitude is null or p_longitude is null) then
    raise exception 'HTPWEB: para activar el LOCAL confirme su ubicación';
  end if;
  if upper(coalesce(p_location_source,'MANUAL')) not in ('GOOGLE','MAP','MANUAL') then
    raise exception 'HTPWEB: origen de ubicación inválido';
  end if;
  if nullif(trim(coalesce(p_google_place_id,'')),'') is not null and exists(
    select 1 from public.locals l
    where l.google_place_id=trim(p_google_place_id) and l.id<>v_id
  ) then
    raise exception 'HTPWEB: este establecimiento de Google ya está registrado';
  end if;

  if v_slug='' then
    v_slug:=regexp_replace(lower(v_name),'[^a-z0-9]+','-','g');
  end if;
  if v_slug='' then v_slug:='local'; end if;
  if p_local_id is null then
    v_slug:=trim(both '-' from v_slug)||'-'||substr(replace(v_id::text,'-',''),1,8);
  end if;

  if p_local_id is not null then
    select to_jsonb(l) into v_before
    from public.locals l
    where l.id=p_local_id
    for update;
    if v_before is null then
      raise exception 'HTPWEB: LOCAL inexistente';
    end if;
  end if;

  insert into public.locals(
    id,city_id,zone_id,business_category_id,name,slug,description,address,
    latitude,longitude,phone,whatsapp,google_place_id,google_maps_url,
    location_source,active,created_at,updated_at
  )
  values(
    v_id,p_city_id,p_zone_id,p_business_category_id,v_name,v_slug,
    nullif(trim(coalesce(p_description,'')),''),
    nullif(trim(coalesce(p_address,'')),''),
    p_latitude,p_longitude,
    nullif(trim(coalesce(p_phone,'')),''),
    nullif(trim(coalesce(p_whatsapp,'')),''),
    nullif(trim(coalesce(p_google_place_id,'')),''),
    nullif(trim(coalesce(p_google_maps_url,'')),''),
    upper(coalesce(p_location_source,'MANUAL')),
    coalesce(p_active,false),now(),now()
  )
  on conflict(id) do update set
    city_id=excluded.city_id,
    zone_id=excluded.zone_id,
    business_category_id=excluded.business_category_id,
    name=excluded.name,
    slug=excluded.slug,
    description=excluded.description,
    address=excluded.address,
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    phone=excluded.phone,
    whatsapp=excluded.whatsapp,
    google_place_id=excluded.google_place_id,
    google_maps_url=excluded.google_maps_url,
    location_source=excluded.location_source,
    active=excluded.active,
    updated_at=now();

  select to_jsonb(l) into v_after from public.locals l where l.id=v_id;
  insert into public.local_change_history(
    local_id,request_id,change_type,before_data,after_data,changed_by,created_at
  )
  values(
    v_id,null,
    case when p_local_id is null then 'MASTER_CREATE' else 'MASTER_UPDATE' end,
    v_before,v_after,auth.uid(),now()
  );

  return v_id;
end;
$$;

revoke all on function public.master_list_local_business_categories() from public,anon;
revoke all on function public.master_save_local_business_category(uuid,text,text,boolean) from public,anon;
revoke all on function public.master_save_local_v3(uuid,uuid,uuid,uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,boolean) from public,anon;

grant execute on function public.master_list_local_business_categories() to authenticated;
grant execute on function public.master_save_local_business_category(uuid,text,text,boolean) to authenticated;
grant execute on function public.master_save_local_v3(uuid,uuid,uuid,uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,boolean) to authenticated;
