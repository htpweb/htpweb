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


-- A partir de este punto el cantón de una zona es referencia administrativa,
-- no una frontera de cobertura. Las superposiciones se validan entre todas las
-- zonas activas, aunque tengan distinto city_id.
create or replace function public.htp_validate_zone()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare z record;
begin
  perform pg_advisory_xact_lock(880115);
  perform public.htp_zone_polygon(new.boundary);

  if new.active and new.boundary is not null then
    for z in
      select id,code,boundary
      from public.zones
      where active
        and id<>new.id
        and boundary is not null
    loop
      if public.htp_zones_overlap(new.boundary,z.boundary) then
        raise exception 'La zona se superpone con %',z.code;
      end if;
    end loop;
  end if;

  if tg_op='UPDATE' then
    if new.boundary is distinct from old.boundary
       and new.boundary is not null
       and exists(
         select 1
         from public.locals l
         where l.zone_id=new.id
           and l.latitude is not null
           and not public.htp_zone_contains(new.boundary,l.latitude,l.longitude)
       ) then
      raise exception 'El nuevo límite deja locales fuera: reclasifíquelos antes de guardar';
    end if;
  end if;

  if not new.active
     and exists(select 1 from public.locals where zone_id=new.id and active) then
    raise exception 'Inactive o reclasifique los locales antes de desactivar la zona';
  end if;

  return new;
end;
$$;


-- DELIVERY: el cantón es dato administrativo; la cobertura la define la zona seleccionada.
drop trigger if exists trg_validate_delivery_city_zone_integrity on public.deliveries;

create or replace function public.validate_zone_delivery_integrity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.active is true
     and new.active is not true
     and exists(
       select 1 from public.delivery_zones dz
       where dz.zone_id=old.id and dz.active=true
     ) then
    raise exception 'HTPWEB: desactive la zona en todos los DELIVERY antes de desactivar la zona';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_zone_delivery_integrity on public.zones;
create trigger trg_validate_zone_delivery_integrity
before update of active on public.zones
for each row execute function public.validate_zone_delivery_integrity();

create or replace function public.validate_delivery_zone_row_integrity()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_delivery_active boolean;
  v_zone_active boolean;
begin
  if new.active is not true then return new; end if;

  select d.active into v_delivery_active
  from public.deliveries d
  where d.id=new.delivery_id;
  if not found then raise exception 'HTPWEB: DELIVERY inexistente'; end if;

  select z.active into v_zone_active
  from public.zones z
  where z.id=new.zone_id;
  if not found then raise exception 'HTPWEB: zona inexistente'; end if;

  if v_delivery_active is not true then raise exception 'HTPWEB: DELIVERY inactivo'; end if;
  if v_zone_active is not true then raise exception 'HTPWEB: zona inactiva'; end if;

  return new;
end;
$$;

create or replace function public.delivery_zone_context(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_delivery record;
  v_city record;
  v_current integer;
  v_limit integer;
  v_capability boolean;
  v_zones jsonb;
begin
  if auth.uid() is null then raise exception 'HTPWEB: autenticación requerida'; end if;

  select d.id,d.name,d.active,d.city_id into v_delivery
  from public.deliveries d
  where d.id=p_delivery_id;
  if not found then raise exception 'HTPWEB: DELIVERY inexistente'; end if;

  if not public.is_master() then
    if not public.has_permission('zones.view') then raise exception 'HTPWEB: no tiene permiso zones.view'; end if;
    if not public.user_has_delivery(p_delivery_id) then raise exception 'HTPWEB: no pertenece a este DELIVERY'; end if;
  end if;

  if v_delivery.city_id is not null then
    select c.id,c.name,c.province,c.country,c.active into v_city
    from public.cities c where c.id=v_delivery.city_id;
  end if;

  select count(*)::integer into v_current
  from public.delivery_zones dz
  where dz.delivery_id=p_delivery_id and dz.active=true;

  v_limit:=public.delivery_limit_value(p_delivery_id,'max_zones');
  v_capability:=public.delivery_has_capability(p_delivery_id,'zones.manage');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',z.id,
    'code',z.code,
    'name',z.name,
    'city_id',z.city_id,
    'city_name',c.name,
    'province',c.province,
    'active',z.active,
    'assigned',coalesce(dz.active,false)
  ) order by c.province,c.name,z.code,lower(z.name),z.id),'[]'::jsonb)
  into v_zones
  from public.zones z
  join public.cities c on c.id=z.city_id
  left join public.delivery_zones dz
    on dz.delivery_id=p_delivery_id and dz.zone_id=z.id
  where z.active=true;

  return jsonb_build_object(
    'delivery',jsonb_build_object(
      'id',v_delivery.id,
      'name',v_delivery.name,
      'active',v_delivery.active,
      'city_id',v_delivery.city_id
    ),
    'city',case when v_city.id is null then null else jsonb_build_object(
      'id',v_city.id,'name',v_city.name,'province',v_city.province,
      'country',v_city.country,'active',v_city.active
    ) end,
    'current_zones',coalesce(v_current,0),
    'max_zones',v_limit,
    'zones_manage_enabled',coalesce(v_capability,false),
    'zones',coalesce(v_zones,'[]'::jsonb)
  );
end;
$$;

create or replace function public.set_delivery_zone(
  p_delivery_id uuid,
  p_zone_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_current integer;
  v_limit integer;
begin
  if not public.is_master() then
    raise exception 'Solicite la zona para aprobación del MASTER';
  end if;

  if not exists(select 1 from public.deliveries d where d.id=p_delivery_id and d.active=true) then
    raise exception 'HTPWEB: DELIVERY inexistente o inactivo';
  end if;
  if not exists(select 1 from public.zones z where z.id=p_zone_id and z.active=true) then
    raise exception 'HTPWEB: zona inexistente o inactiva';
  end if;

  perform pg_advisory_xact_lock(880115);

  if coalesce(p_active,false)
     and not exists(
       select 1 from public.delivery_zones dz
       where dz.delivery_id=p_delivery_id and dz.zone_id=p_zone_id and dz.active=true
     ) then
    select count(*)::integer into v_current
    from public.delivery_zones dz
    where dz.delivery_id=p_delivery_id and dz.active=true;

    v_limit:=public.delivery_limit_value(p_delivery_id,'max_zones');
    if v_limit is not null and v_current>=v_limit then
      raise exception 'HTPWEB: alcanzó el máximo de zonas permitidas';
    end if;
  end if;

  insert into public.delivery_zones(delivery_id,zone_id,active,created_at)
  values(p_delivery_id,p_zone_id,coalesce(p_active,false),now())
  on conflict(delivery_id,zone_id) do update
    set active=excluded.active;

  insert into public.delivery_zone_requests(delivery_id,zone_id,status,reviewed_by,updated_at)
  values(
    p_delivery_id,p_zone_id,
    case when coalesce(p_active,false) then 'APPROVED' else 'SUSPENDED' end,
    auth.uid(),now()
  )
  on conflict(delivery_id,zone_id) do update
    set status=excluded.status,reviewed_by=auth.uid(),updated_at=now();
end;
$$;

create or replace function public.request_delivery_zone(
  p_delivery_id uuid,
  p_zone_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null
     or public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('zones.assign')
     or not public.delivery_has_capability(p_delivery_id,'zones.manage') then
    raise exception 'Solicitud no autorizada';
  end if;

  if not exists(select 1 from public.deliveries d where d.id=p_delivery_id and d.active=true) then
    raise exception 'DELIVERY inexistente o inactivo';
  end if;
  if not exists(select 1 from public.zones z where z.id=p_zone_id and z.active=true) then
    raise exception 'Zona inexistente o inactiva';
  end if;

  if exists(
    select 1 from public.delivery_zones
    where delivery_id=p_delivery_id and zone_id=p_zone_id and active=true
  ) then return; end if;

  insert into public.delivery_zone_requests(delivery_id,zone_id,status,requested_by,updated_at)
  values(p_delivery_id,p_zone_id,'PENDING',auth.uid(),now())
  on conflict(delivery_id,zone_id) do update
    set status='PENDING',requested_by=auth.uid(),reviewed_by=null,updated_at=now();
end;
$$;

create or replace function public.htp_delivery_covers_local(
  p_delivery uuid,
  p_local uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.locals l
    join public.zones z on z.id=l.zone_id and z.active
    join public.delivery_zones dz on dz.zone_id=z.id and dz.active
    join public.deliveries d on d.id=dz.delivery_id and d.active
    where l.id=p_local and l.active and d.id=p_delivery
  );
$$;

create or replace function public.htp_refresh_zone_links()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform pg_advisory_xact_lock(880115);

  update public.local_deliveries ld
  set active=false
  where active
    and not public.htp_delivery_covers_local(ld.delivery_id,ld.local_id);

  insert into public.local_deliveries(local_id,delivery_id,active)
  select l.id,dz.delivery_id,true
  from public.locals l
  join public.zones z on z.id=l.zone_id and z.active
  join public.delivery_zones dz on dz.zone_id=z.id and dz.active
  join public.deliveries d on d.id=dz.delivery_id and d.active
  where l.active
  on conflict(local_id,delivery_id) do update
    set active=true
    where not public.local_deliveries.active;

  return null;
end;
$$;

revoke all on function public.delivery_zone_context(uuid) from public,anon;
revoke all on function public.set_delivery_zone(uuid,uuid,boolean) from public,anon;
revoke all on function public.request_delivery_zone(uuid,uuid) from public,anon;
revoke all on function public.htp_delivery_covers_local(uuid,uuid) from public;

grant execute on function public.delivery_zone_context(uuid) to authenticated;
grant execute on function public.set_delivery_zone(uuid,uuid,boolean) to authenticated;
grant execute on function public.request_delivery_zone(uuid,uuid) to authenticated;
grant execute on function public.htp_delivery_covers_local(uuid,uuid) to anon,authenticated,service_role;
