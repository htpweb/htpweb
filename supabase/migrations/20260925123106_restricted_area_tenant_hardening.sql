create or replace function public.delivery_save_restricted_area(
  p_area_id uuid,
  p_delivery_id uuid,
  p_zone_id uuid,
  p_name text,
  p_reason text,
  p_boundary jsonb,
  p_restriction_mode text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid:=coalesce(p_area_id,gen_random_uuid());
  v_mode text:=upper(trim(coalesce(p_restriction_mode,'PERMANENT')));
  v_limit integer;
  v_count integer;
  v_zone_boundary jsonb;
  v_point jsonb;
  v_existing_delivery uuid;
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
  then
    raise exception 'HTPWEB: no autorizado';
  end if;

  if not public.delivery_has_capability(p_delivery_id,'restricted_areas.manage') then
    raise exception 'HTPWEB: tu plan no incluye áreas restringidas';
  end if;

  if p_area_id is not null then
    select a.delivery_id into v_existing_delivery
    from public.delivery_restricted_areas a
    where a.id=p_area_id;

    if v_existing_delivery is not null
       and v_existing_delivery<>p_delivery_id
    then
      raise exception 'HTPWEB: el área restringida no pertenece a este DELIVERY';
    end if;
  end if;

  if nullif(trim(coalesce(p_name,'')),'') is null then
    raise exception 'HTPWEB: escribe un nombre para el área restringida';
  end if;

  if v_mode not in ('PERMANENT','SCHEDULE') then
    raise exception 'HTPWEB: modo inválido';
  end if;

  if v_mode='SCHEDULE'
     and not public.delivery_has_capability(p_delivery_id,'restricted_areas.schedule')
  then
    raise exception 'HTPWEB: tu plan no incluye restricciones por horario';
  end if;

  perform public.htp_zone_polygon(p_boundary);

  select z.boundary into v_zone_boundary
  from public.zones z
  join public.delivery_zones dz
    on dz.zone_id=z.id
   and dz.delivery_id=p_delivery_id
   and dz.active=true
  where z.id=p_zone_id
    and z.active=true;

  if v_zone_boundary is null then
    raise exception 'HTPWEB: solo puedes restringir una zona activa con polígono definido';
  end if;

  for v_point in select value from jsonb_array_elements(p_boundary)
  loop
    if not public.htp_zone_contains(
      v_zone_boundary,
      (v_point->>0)::numeric,
      (v_point->>1)::numeric
    )
    then
      raise exception 'HTPWEB: el área restringida debe quedar completamente dentro de la zona seleccionada';
    end if;
  end loop;

  v_limit:=public.delivery_limit_value(
    p_delivery_id,
    'restricted_areas.active.max'
  );

  if coalesce(p_active,true) and v_limit is null then
    raise exception 'HTPWEB: el plan no define capacidad de áreas restringidas';
  end if;

  if coalesce(p_active,true) then
    select count(*) into v_count
    from public.delivery_restricted_areas a
    where a.delivery_id=p_delivery_id
      and a.active=true
      and a.id<>v_id;

    if v_count>=v_limit then
      raise exception 'HTPWEB: límite de áreas restringidas alcanzado (%)',v_limit;
    end if;
  end if;

  insert into public.delivery_restricted_areas(
    id,delivery_id,zone_id,name,reason,boundary,
    restriction_mode,active,created_by,created_at,updated_at
  )
  values(
    v_id,p_delivery_id,p_zone_id,trim(p_name),
    nullif(trim(coalesce(p_reason,'')),''),
    p_boundary,v_mode,coalesce(p_active,true),
    auth.uid(),now(),now()
  )
  on conflict(id)
  do update set
    zone_id=excluded.zone_id,
    name=excluded.name,
    reason=excluded.reason,
    boundary=excluded.boundary,
    restriction_mode=excluded.restriction_mode,
    active=excluded.active,
    updated_at=now();

  return v_id;
end;
$$;

revoke execute on function public.delivery_location_is_restricted(uuid,numeric,numeric,timestamptz)
  from public,anon,authenticated;
grant execute on function public.delivery_location_is_restricted(uuid,numeric,numeric,timestamptz)
  to service_role;
