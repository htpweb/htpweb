-- HTPWEB Código 121 — aplicar ficha completa del LOCAL desde paquete validado.
-- Crea o actualiza el LOCAL, detecta zona por coordenadas y puede activarlo en un solo paso.

create or replace function public.master_apply_local_package_profile_v1(
  p_local_id uuid,
  p_city_id uuid,
  p_business_category_id uuid,
  p_name text,
  p_description text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric,
  p_phone text,
  p_whatsapp text,
  p_location_url text,
  p_activate boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid:=p_local_id;
  v_name text:=nullif(trim(p_name),'');
  v_zone jsonb;
  v_zone_id uuid;
  v_slug text;
  v_before jsonb;
  v_after jsonb;
  v_created boolean:=false;
  v_matches integer:=0;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if v_name is null then
    raise exception 'HTPWEB: nombre del LOCAL requerido';
  end if;

  if nullif(trim(coalesce(p_address,'')),'') is null then
    raise exception 'HTPWEB: dirección/referencia requerida';
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
    raise exception 'HTPWEB: la ficha completa requiere latitud y longitud';
  end if;
  if p_latitude < -90 or p_latitude > 90 then
    raise exception 'HTPWEB: latitud inválida';
  end if;
  if p_longitude < -180 or p_longitude > 180 then
    raise exception 'HTPWEB: longitud inválida';
  end if;

  v_zone:=public.master_detect_local_zone(p_latitude,p_longitude);
  v_zone_id:=(v_zone->>'id')::uuid;

  if v_id is null then
    select count(*)
      into v_matches
    from public.locals l
    where l.city_id=p_city_id
      and lower(trim(l.name))=lower(v_name);

    if v_matches>1 then
      raise exception 'HTPWEB: hay más de un LOCAL con ese nombre en el cantón';
    elsif v_matches=1 then
      select l.id into v_id
      from public.locals l
      where l.city_id=p_city_id
        and lower(trim(l.name))=lower(v_name)
      limit 1;
    else
      v_id:=gen_random_uuid();
      v_created:=true;
    end if;
  end if;

  if not v_created then
    select to_jsonb(l),l.slug
      into v_before,v_slug
    from public.locals l
    where l.id=v_id
    for update;

    if v_before is null then
      raise exception 'HTPWEB: LOCAL existente no encontrado';
    end if;
  end if;

  if nullif(trim(coalesce(v_slug,'')),'') is null then
    v_slug:=regexp_replace(lower(v_name),'[^a-z0-9]+','-','g');
    v_slug:=trim(both '-' from v_slug);
    if v_slug='' then v_slug:='local'; end if;
    v_slug:=v_slug||'-'||substr(replace(v_id::text,'-',''),1,8);
  end if;

  insert into public.locals(
    id,city_id,zone_id,business_category_id,name,slug,description,address,
    latitude,longitude,phone,whatsapp,google_place_id,google_maps_url,
    location_source,active,created_at,updated_at
  )
  values(
    v_id,p_city_id,v_zone_id,p_business_category_id,v_name,v_slug,
    nullif(trim(coalesce(p_description,'')),''),
    trim(p_address),
    p_latitude,p_longitude,
    nullif(trim(coalesce(p_phone,'')),''),
    nullif(trim(coalesce(p_whatsapp,'')),''),
    null,
    nullif(trim(coalesce(p_location_url,'')),''),
    'IMPORT',
    coalesce(p_activate,true),
    now(),now()
  )
  on conflict(id) do update set
    city_id=excluded.city_id,
    zone_id=excluded.zone_id,
    business_category_id=excluded.business_category_id,
    name=excluded.name,
    description=excluded.description,
    address=excluded.address,
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    phone=excluded.phone,
    whatsapp=excluded.whatsapp,
    google_maps_url=case
      when excluded.google_maps_url is null then public.locals.google_maps_url
      else excluded.google_maps_url
    end,
    location_source='IMPORT',
    active=excluded.active,
    updated_at=now();

  select to_jsonb(l) into v_after
  from public.locals l
  where l.id=v_id;

  insert into public.local_change_history(
    local_id,request_id,change_type,before_data,after_data,changed_by,created_at
  )
  values(
    v_id,null,
    case when v_created then 'MASTER_IMPORT' else 'MASTER_UPDATE' end,
    v_before,v_after,auth.uid(),now()
  );

  return jsonb_build_object(
    'id',v_id,
    'name',v_name,
    'created',v_created,
    'active',coalesce(p_activate,true),
    'zone_id',v_zone_id,
    'zone',v_zone,
    'latitude',p_latitude,
    'longitude',p_longitude
  );
end;
$$;

revoke all on function public.master_apply_local_package_profile_v1(
  uuid,uuid,uuid,text,text,text,numeric,numeric,text,text,text,boolean
) from public,anon;

grant execute on function public.master_apply_local_package_profile_v1(
  uuid,uuid,uuid,text,text,text,numeric,numeric,text,text,text,boolean
) to authenticated;
