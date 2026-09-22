-- HTPWEB Código 119 — paquetes completos pueden crear LOCAL nuevos como borrador.

create or replace function public.master_save_local_package_v1(
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
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_zone jsonb:=null;
  v_zone_id uuid:=null;
  v_id uuid:=gen_random_uuid();
  v_name text:=nullif(trim(p_name),'');
  v_slug text;
  v_needs_location boolean:=false;
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

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'HTPWEB: latitud y longitud deben proporcionarse juntas';
  end if;

  if p_latitude is not null then
    if p_latitude < -90 or p_latitude > 90 then
      raise exception 'HTPWEB: latitud inválida';
    end if;
    if p_longitude < -180 or p_longitude > 180 then
      raise exception 'HTPWEB: longitud inválida';
    end if;

    v_zone:=public.master_detect_local_zone(p_latitude,p_longitude);
    v_zone_id:=(v_zone->>'id')::uuid;
  else
    v_needs_location:=true;
  end if;

  if exists(
    select 1
    from public.locals l
    where l.city_id=p_city_id
      and lower(trim(l.name))=lower(v_name)
  ) then
    raise exception 'HTPWEB: ya existe un LOCAL con ese nombre en el cantón seleccionado';
  end if;

  v_slug:=regexp_replace(lower(v_name),'[^a-z0-9]+','-','g');
  v_slug:=trim(both '-' from v_slug);
  if v_slug='' then v_slug:='local'; end if;
  v_slug:=v_slug||'-'||substr(replace(v_id::text,'-',''),1,8);

  insert into public.locals(
    id,city_id,zone_id,business_category_id,name,slug,description,address,
    latitude,longitude,phone,whatsapp,google_place_id,google_maps_url,
    location_source,active,created_at,updated_at
  )
  values(
    v_id,p_city_id,v_zone_id,p_business_category_id,v_name,v_slug,
    nullif(trim(coalesce(p_description,'')),''),
    nullif(trim(coalesce(p_address,'')),''),
    p_latitude,p_longitude,
    nullif(trim(coalesce(p_phone,'')),''),
    nullif(trim(coalesce(p_whatsapp,'')),''),
    null,
    nullif(trim(coalesce(p_location_url,'')),''),
    'IMPORT',
    false,
    now(),now()
  );

  insert into public.local_change_history(
    local_id,request_id,change_type,before_data,after_data,changed_by,created_at
  )
  select
    v_id,null,'MASTER_IMPORT',null,to_jsonb(l),auth.uid(),now()
  from public.locals l
  where l.id=v_id;

  return jsonb_build_object(
    'id',v_id,
    'name',v_name,
    'zone_id',v_zone_id,
    'zone',v_zone,
    'needs_location',v_needs_location,
    'active',false
  );
end;
$$;

revoke all on function public.master_save_local_package_v1(
  uuid,uuid,text,text,text,numeric,numeric,text,text,text
) from public,anon;

grant execute on function public.master_save_local_package_v1(
  uuid,uuid,text,text,text,numeric,numeric,text,text,text
) to authenticated;
