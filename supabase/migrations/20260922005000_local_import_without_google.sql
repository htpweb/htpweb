-- HTPWEB Código 104 — carga de LOCAL sin dependencia operativa de Google Maps.
-- La plantilla aporta provincia, cantón, dirección/referencia y coordenadas.
-- Supabase determina autoritativamente la zona por latitud/longitud.

alter table public.locals
  drop constraint if exists locals_location_source_check;

alter table public.locals
  add constraint locals_location_source_check
  check (location_source in ('GOOGLE','MAP','MANUAL','IMPORT'));

create or replace function public.master_detect_local_zone(
  p_latitude numeric,
  p_longitude numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_count integer;
  v_zone record;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'HTPWEB: latitud y longitud son obligatorias';
  end if;
  if p_latitude < -90 or p_latitude > 90 then
    raise exception 'HTPWEB: latitud inválida';
  end if;
  if p_longitude < -180 or p_longitude > 180 then
    raise exception 'HTPWEB: longitud inválida';
  end if;

  select count(*)
  into v_count
  from public.zones z
  where z.active=true
    and z.boundary is not null
    and public.htp_zone_contains(z.boundary,p_latitude,p_longitude);

  if v_count=0 then
    raise exception 'HTPWEB: las coordenadas no pertenecen a ninguna zona activa dibujada';
  end if;
  if v_count>1 then
    raise exception 'HTPWEB: las coordenadas coinciden con más de una zona; revise los límites';
  end if;

  select
    z.id,z.code,z.name,z.city_id,c.name as city_name,c.province
  into v_zone
  from public.zones z
  left join public.cities c on c.id=z.city_id
  where z.active=true
    and z.boundary is not null
    and public.htp_zone_contains(z.boundary,p_latitude,p_longitude)
  limit 1;

  return jsonb_build_object(
    'id',v_zone.id,
    'code',v_zone.code,
    'name',v_zone.name,
    'city_id',v_zone.city_id,
    'city_name',v_zone.city_name,
    'province',v_zone.province
  );
end;
$$;

create or replace function public.master_save_local_import_v1(
  p_city_id uuid,
  p_business_category_id uuid,
  p_name text,
  p_description text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_phone text,
  p_whatsapp text,
  p_location_url text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_zone jsonb;
  v_zone_id uuid;
  v_name text:=nullif(trim(p_name),'');
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if v_name is null then
    raise exception 'HTPWEB: nombre del LOCAL requerido';
  end if;

  if not exists(
    select 1 from public.cities c
    where c.id=p_city_id and c.active=true
  ) then
    raise exception 'HTPWEB: provincia/cantón inválido o inactivo';
  end if;

  if not exists(
    select 1 from public.local_business_categories bc
    where bc.id=p_business_category_id and bc.active=true
  ) then
    raise exception 'HTPWEB: categoría de LOCAL inválida o inactiva';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'HTPWEB: latitud y longitud son obligatorias';
  end if;

  if exists(
    select 1
    from public.locals l
    where l.city_id=p_city_id
      and lower(trim(l.name))=lower(v_name)
  ) then
    raise exception 'HTPWEB: ya existe un LOCAL con ese nombre en el cantón seleccionado';
  end if;

  v_zone:=public.master_detect_local_zone(p_latitude,p_longitude);
  v_zone_id:=(v_zone->>'id')::uuid;

  return public.master_save_local_v3(
    null,
    p_city_id,
    v_zone_id,
    p_business_category_id,
    v_name,
    '',
    p_description,
    p_address,
    p_latitude,
    p_longitude,
    p_phone,
    p_whatsapp,
    null,
    p_location_url,
    'IMPORT',
    false
  );
end;
$$;

revoke all on function public.master_detect_local_zone(numeric,numeric) from public,anon;
revoke all on function public.master_save_local_import_v1(
  uuid,uuid,text,text,text,numeric,numeric,text,text,text
) from public,anon;

grant execute on function public.master_detect_local_zone(numeric,numeric) to authenticated;
grant execute on function public.master_save_local_import_v1(
  uuid,uuid,text,text,text,numeric,numeric,text,text,text
) to authenticated;
