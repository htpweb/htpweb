
-- Restricted-area management surface and containment validation.

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
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
  then
    raise exception 'HTPWEB: no autorizado';
  end if;

  if not public.delivery_has_capability(p_delivery_id,'restricted_areas.manage') then
    raise exception 'HTPWEB: tu plan no incluye áreas restringidas';
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

  if coalesce(p_active,true) and v_limit is not null then
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

create or replace function public.delivery_restricted_areas_snapshot(
  p_delivery_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
  if not (
    public.is_master()
    or exists(
      select 1
      from public.user_deliveries ud
      where ud.user_id=auth.uid()
        and ud.delivery_id=p_delivery_id
        and ud.active=true
    )
  )
  then
    raise exception 'HTPWEB: no autorizado';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'delivery_id',a.delivery_id,
    'zone_id',a.zone_id,
    'zone_code',z.code,
    'zone_name',z.name,
    'name',a.name,
    'reason',a.reason,
    'boundary',a.boundary,
    'restriction_mode',a.restriction_mode,
    'active',a.active,
    'rules',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,
        'day_of_week',r.day_of_week,
        'start_time',r.start_time,
        'end_time',r.end_time,
        'active',r.active
      ) order by r.day_of_week,r.start_time)
      from public.delivery_restricted_area_rules r
      where r.area_id=a.id
    ),'[]'::jsonb)
  ) order by lower(a.name),a.created_at),'[]'::jsonb)
  into v_result
  from public.delivery_restricted_areas a
  join public.zones z on z.id=a.zone_id
  where a.delivery_id=p_delivery_id;

  return v_result;
end;
$$;

revoke all on function public.delivery_restricted_areas_snapshot(uuid)
  from public,anon;
grant execute on function public.delivery_restricted_areas_snapshot(uuid)
  to authenticated;
