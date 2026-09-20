-- HTPWEB Código #88B — LOCAL por zona y cobertura DELIVERY derivada.

alter table public.zones add column if not exists code text;
alter table public.zones add column if not exists color text not null default '#2563eb';
alter table public.zones add column if not exists boundary jsonb;
alter table public.zones add column if not exists description text;

update public.zones
set code = 'X' || row_number_value
from (
  select id, row_number() over (partition by city_id order by created_at, id) as row_number_value
  from public.zones
) numbered
where public.zones.id = numbered.id and public.zones.code is null;

alter table public.zones alter column code set not null;
create unique index if not exists zones_city_code_uidx on public.zones(city_id, lower(code));

alter table public.zones drop constraint if exists zones_color_check;
alter table public.zones add constraint zones_color_check check (color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.zones drop constraint if exists zones_boundary_check;
alter table public.zones add constraint zones_boundary_check check (
  boundary is null or (jsonb_typeof(boundary)='array' and jsonb_array_length(boundary)>=3)
);

alter table public.locals add column if not exists google_place_id text;
alter table public.locals add column if not exists google_maps_url text;
alter table public.locals add column if not exists location_source text not null default 'MANUAL';
alter table public.locals drop constraint if exists locals_location_source_check;
alter table public.locals add constraint locals_location_source_check
  check (location_source in ('GOOGLE','MAP','MANUAL'));
create unique index if not exists locals_google_place_uidx
  on public.locals(google_place_id) where google_place_id is not null;

create or replace function public.master_list_zones()
returns jsonb language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',z.id,'city_id',z.city_id,'code',z.code,'name',z.name,
    'description',z.description,'color',z.color,'boundary',z.boundary,'active',z.active,
    'city_name',c.name,'province',c.province,'country',c.country,
    'local_count',(select count(*) from public.locals l where l.zone_id=z.id),
    'delivery_count',(select count(*) from public.delivery_zones dz where dz.zone_id=z.id and dz.active=true)
  ) order by c.province,c.name,z.code),'[]'::jsonb)
  from public.zones z join public.cities c on c.id=z.city_id
  where public.is_master();
$$;

create or replace function public.master_save_zone_v2(
  p_zone_id uuid,p_city_id uuid,p_code text,p_name text,p_description text,
  p_color text,p_boundary jsonb,p_active boolean
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid:=coalesce(p_zone_id,gen_random_uuid());
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if not exists(select 1 from public.cities c where c.id=p_city_id and c.active=true) then
    raise exception 'HTPWEB: provincia/cantón inválido o inactivo';
  end if;
  if nullif(trim(p_code),'') is null or nullif(trim(p_name),'') is null then
    raise exception 'HTPWEB: código y nombre de zona requeridos';
  end if;
  if p_boundary is not null and (jsonb_typeof(p_boundary)<>'array' or jsonb_array_length(p_boundary)<3) then
    raise exception 'HTPWEB: el límite debe contener al menos tres puntos';
  end if;
  insert into public.zones(id,city_id,city,province,country,code,name,description,color,boundary,active)
  select v_id,c.id,c.name,c.province,c.country,upper(trim(p_code)),trim(p_name),nullif(trim(coalesce(p_description,'')),''),
    coalesce(nullif(trim(p_color),''),'#2563eb'),p_boundary,coalesce(p_active,true)
  from public.cities c where c.id=p_city_id
  on conflict(id) do update set city_id=excluded.city_id,code=excluded.code,name=excluded.name,
    city=excluded.city,province=excluded.province,country=excluded.country,
    description=excluded.description,color=excluded.color,boundary=excluded.boundary,active=excluded.active;
  return v_id;
end $$;

create or replace function public.master_list_locals()
returns jsonb language sql stable security definer set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'name',l.name,'slug',l.slug,'description',l.description,
    'address',l.address,'latitude',l.latitude,'longitude',l.longitude,
    'phone',l.phone,'whatsapp',l.whatsapp,'active',l.active,
    'logo_url',l.logo_url,'banner_url',l.banner_url,'zone_id',l.zone_id,
    'google_place_id',l.google_place_id,'google_maps_url',l.google_maps_url,
    'location_source',l.location_source,'zone_code',z.code,'zone_name',z.name,
    'city_id',c.id,'canton',c.name,'province',c.province
  ) order by c.province,c.name,z.code,lower(l.name)),'[]'::jsonb)
  from public.locals l
  left join public.zones z on z.id=l.zone_id
  left join public.cities c on c.id=z.city_id
  where public.is_master();
$$;

create or replace function public.master_save_local_v2(
  p_local_id uuid,p_zone_id uuid,p_name text,p_slug text,p_description text,
  p_address text,p_latitude numeric,p_longitude numeric,p_phone text,p_whatsapp text,
  p_google_place_id text,p_google_maps_url text,p_location_source text,p_active boolean
) returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_id uuid:=coalesce(p_local_id,gen_random_uuid()); v_name text:=nullif(trim(p_name),'');
  v_slug text:=lower(trim(coalesce(p_slug,''))); v_before jsonb; v_after jsonb;
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if v_name is null then raise exception 'HTPWEB: nombre del LOCAL requerido'; end if;
  if not exists(select 1 from public.zones z where z.id=p_zone_id and z.active=true) then
    raise exception 'HTPWEB: seleccione una zona activa';
  end if;
  if (p_latitude is null) <> (p_longitude is null) then raise exception 'HTPWEB: complete ambas coordenadas'; end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then raise exception 'HTPWEB: latitud inválida'; end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then raise exception 'HTPWEB: longitud inválida'; end if;
  if coalesce(p_active,false) and (p_latitude is null or p_longitude is null) then
    raise exception 'HTPWEB: para activar el LOCAL confirme su ubicación';
  end if;
  if upper(coalesce(p_location_source,'MANUAL')) not in ('GOOGLE','MAP','MANUAL') then
    raise exception 'HTPWEB: origen de ubicación inválido';
  end if;
  if nullif(trim(coalesce(p_google_place_id,'')),'') is not null and exists(
    select 1 from public.locals l where l.google_place_id=trim(p_google_place_id) and l.id<>v_id
  ) then raise exception 'HTPWEB: este establecimiento de Google ya está registrado'; end if;
  if v_slug='' then v_slug:=regexp_replace(lower(v_name),'[^a-z0-9]+','-','g'); end if;
  if v_slug='' then v_slug:='local'; end if;
  if p_local_id is null then v_slug:=trim(both '-' from v_slug)||'-'||substr(replace(v_id::text,'-',''),1,8); end if;
  if p_local_id is not null then
    select to_jsonb(l) into v_before from public.locals l where l.id=p_local_id for update;
    if v_before is null then raise exception 'HTPWEB: LOCAL inexistente'; end if;
  end if;
  insert into public.locals(id,zone_id,name,slug,description,address,latitude,longitude,phone,whatsapp,
    google_place_id,google_maps_url,location_source,active,created_at,updated_at)
  values(v_id,p_zone_id,v_name,v_slug,nullif(trim(coalesce(p_description,'')),''),
    nullif(trim(coalesce(p_address,'')),''),p_latitude,p_longitude,
    nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_whatsapp,'')),''),
    nullif(trim(coalesce(p_google_place_id,'')),''),nullif(trim(coalesce(p_google_maps_url,'')),''),
    upper(coalesce(p_location_source,'MANUAL')),coalesce(p_active,false),now(),now())
  on conflict(id) do update set zone_id=excluded.zone_id,name=excluded.name,slug=excluded.slug,
    description=excluded.description,address=excluded.address,latitude=excluded.latitude,
    longitude=excluded.longitude,phone=excluded.phone,whatsapp=excluded.whatsapp,
    google_place_id=excluded.google_place_id,google_maps_url=excluded.google_maps_url,
    location_source=excluded.location_source,active=excluded.active,updated_at=now();
  select to_jsonb(l) into v_after from public.locals l where l.id=v_id;
  insert into public.local_change_history(local_id,request_id,change_type,before_data,after_data,changed_by,created_at)
  values(v_id,null,case when p_local_id is null then 'MASTER_CREATE' else 'MASTER_UPDATE' end,
    v_before,v_after,auth.uid(),now());
  return v_id;
end $$;

revoke all on function public.master_list_zones() from public,anon;
revoke all on function public.master_save_zone_v2(uuid,uuid,text,text,text,text,jsonb,boolean) from public,anon;
revoke all on function public.master_save_local_v2(uuid,uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.master_list_zones() to authenticated;
grant execute on function public.master_save_zone_v2(uuid,uuid,text,text,text,text,jsonb,boolean) to authenticated;
grant execute on function public.master_save_local_v2(uuid,uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,boolean) to authenticated;
