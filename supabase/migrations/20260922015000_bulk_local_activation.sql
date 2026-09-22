-- HTPWEB Código 105 — activación/desactivación masiva de LOCAL.
-- Reutiliza master_set_local_active para conservar todas las validaciones,
-- triggers de zona/cobertura y auditoría existentes.

create or replace function public.master_set_locals_active(
  p_local_ids uuid[],
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_count integer:=0;
  v_distinct_count integer:=0;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if p_local_ids is null or cardinality(p_local_ids)=0 then
    raise exception 'HTPWEB: seleccione al menos un LOCAL';
  end if;

  select count(distinct x)
  into v_distinct_count
  from unnest(p_local_ids) as t(x)
  where x is not null;

  if v_distinct_count=0 then
    raise exception 'HTPWEB: seleccione al menos un LOCAL válido';
  end if;

  if v_distinct_count>1000 then
    raise exception 'HTPWEB: máximo 1000 LOCAL por operación masiva';
  end if;

  if exists(
    select 1
    from (
      select distinct x as id
      from unnest(p_local_ids) as t(x)
      where x is not null
    ) requested
    left join public.locals l on l.id=requested.id
    where l.id is null
  ) then
    raise exception 'HTPWEB: uno o más LOCAL seleccionados ya no existen';
  end if;

  -- La llamada se ejecuta dentro de una sola transacción. Si un LOCAL no cumple
  -- los requisitos de activación, toda la operación se revierte.
  for v_id in
    select distinct x
    from unnest(p_local_ids) as t(x)
    where x is not null
    order by x
  loop
    perform public.master_set_local_active(v_id,coalesce(p_active,false));
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object(
    'updated',v_count,
    'active',coalesce(p_active,false)
  );
end;
$$;

revoke all on function public.master_set_locals_active(uuid[],boolean)
from public,anon;

grant execute on function public.master_set_locals_active(uuid[],boolean)
to authenticated;


-- Compatibilidad con LOCAL creados por plantilla (Código 104).
-- master_save_local_v3 conservaba una validación antigua que no aceptaba IMPORT.
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
  if upper(coalesce(p_location_source,'MANUAL')) not in ('GOOGLE','MAP','MANUAL','IMPORT') then
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

revoke all on function public.master_save_local_v3(
  uuid,uuid,uuid,uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,boolean
) from public,anon;

grant execute on function public.master_save_local_v3(
  uuid,uuid,uuid,uuid,text,text,text,text,numeric,numeric,text,text,text,text,text,boolean
) to authenticated;
