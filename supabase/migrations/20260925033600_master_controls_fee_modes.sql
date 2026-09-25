-- HTPWEB: MASTER habilita por separado las modalidades de tarifa.
-- DELIVERY_ADMIN fija los valores únicamente dentro de las modalidades autorizadas.

insert into public.capabilities(code,name,description,scope,active)
values
  ('delivery_fees.fixed','Tarifa fija','Permite al DELIVERY_ADMIN configurar una tarifa fija de entrega.','DELIVERY',true),
  ('delivery_fees.distance','Tarifa por distancia','Permite al DELIVERY_ADMIN configurar tarifas por distancia con periodos Día/Noche.','DELIVERY',true)
on conflict (code) do update
set name=excluded.name,
    description=excluded.description,
    scope=excluded.scope,
    active=true;

-- Compatibilidad: los DELIVERY que ya tenían la gestión de tarifas habilitada
-- reciben inicialmente ambas modalidades. Luego MASTER puede deshabilitarlas por separado.
insert into public.delivery_capabilities(
  delivery_id,capability_id,enabled,configured_by,created_at,updated_at
)
select
  dc.delivery_id,
  c_mode.id,
  dc.enabled,
  dc.configured_by,
  now(),
  now()
from public.delivery_capabilities dc
join public.capabilities c_manage
  on c_manage.id=dc.capability_id
 and c_manage.code='delivery_fees.manage'
cross join public.capabilities c_mode
where c_mode.code in ('delivery_fees.fixed','delivery_fees.distance')
on conflict (delivery_id,capability_id)
do nothing;


create or replace function public.delivery_fee_mode_enabled(
  p_delivery_id uuid,
  p_mode text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_code text;
begin
  v_code := case upper(trim(coalesce(p_mode,'')))
    when 'FIXED' then 'delivery_fees.fixed'
    when 'DISTANCE' then 'delivery_fees.distance'
    else null
  end;

  if v_code is null then
    return false;
  end if;

  return exists (
    select 1
    from public.delivery_capabilities dc
    join public.capabilities c on c.id=dc.capability_id
    where dc.delivery_id=p_delivery_id
      and c.code=v_code
      and c.active=true
      and dc.enabled=true
  );
end;
$function$;

revoke all on function public.delivery_fee_mode_enabled(uuid,text)
  from public,anon,authenticated;


create or replace function public.master_delivery_fee_modes_status(
  p_delivery_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_fixed boolean := false;
  v_distance boolean := false;
  v_manage boolean := false;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if not exists (
    select 1 from public.deliveries d where d.id=p_delivery_id
  ) then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  select
    coalesce(bool_or(dc.enabled) filter (where c.code='delivery_fees.fixed'),false),
    coalesce(bool_or(dc.enabled) filter (where c.code='delivery_fees.distance'),false),
    coalesce(bool_or(dc.enabled) filter (where c.code='delivery_fees.manage'),false)
  into v_fixed,v_distance,v_manage
  from public.capabilities c
  left join public.delivery_capabilities dc
    on dc.capability_id=c.id
   and dc.delivery_id=p_delivery_id
  where c.code in (
    'delivery_fees.fixed',
    'delivery_fees.distance',
    'delivery_fees.manage'
  );

  return jsonb_build_object(
    'fixed',v_fixed,
    'distance',v_distance,
    'manage',v_manage
  );
end;
$function$;

revoke all on function public.master_delivery_fee_modes_status(uuid)
  from public,anon;
grant execute on function public.master_delivery_fee_modes_status(uuid)
  to authenticated;


create or replace function public.master_set_delivery_fee_mode(
  p_delivery_id uuid,
  p_mode text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mode text := upper(trim(coalesce(p_mode,'')));
  v_code text;
  v_capability_id uuid;
  v_manage_id uuid;
  v_any_enabled boolean;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if not exists (
    select 1 from public.deliveries d where d.id=p_delivery_id
  ) then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  v_code := case v_mode
    when 'FIXED' then 'delivery_fees.fixed'
    when 'DISTANCE' then 'delivery_fees.distance'
    else null
  end;

  if v_code is null then
    raise exception 'HTPWEB: modalidad debe ser FIXED o DISTANCE';
  end if;

  select c.id into v_capability_id
  from public.capabilities c
  where c.code=v_code and c.active=true and c.scope in ('DELIVERY','BOTH')
  limit 1;

  select c.id into v_manage_id
  from public.capabilities c
  where c.code='delivery_fees.manage' and c.active=true and c.scope in ('DELIVERY','BOTH')
  limit 1;

  if v_capability_id is null or v_manage_id is null then
    raise exception 'HTPWEB: capabilities de tarifas no disponibles';
  end if;

  insert into public.delivery_capabilities(
    delivery_id,capability_id,enabled,configured_by,created_at,updated_at
  )
  values(
    p_delivery_id,v_capability_id,coalesce(p_enabled,false),auth.uid(),now(),now()
  )
  on conflict (delivery_id,capability_id)
  do update set
    enabled=excluded.enabled,
    configured_by=excluded.configured_by,
    updated_at=now();

  select exists (
    select 1
    from public.delivery_capabilities dc
    join public.capabilities c on c.id=dc.capability_id
    where dc.delivery_id=p_delivery_id
      and c.code in ('delivery_fees.fixed','delivery_fees.distance')
      and c.active=true
      and dc.enabled=true
  ) into v_any_enabled;

  insert into public.delivery_capabilities(
    delivery_id,capability_id,enabled,configured_by,created_at,updated_at
  )
  values(
    p_delivery_id,v_manage_id,v_any_enabled,auth.uid(),now(),now()
  )
  on conflict (delivery_id,capability_id)
  do update set
    enabled=excluded.enabled,
    configured_by=excluded.configured_by,
    updated_at=now();

  return public.master_delivery_fee_modes_status(p_delivery_id);
end;
$function$;

revoke all on function public.master_set_delivery_fee_mode(uuid,text,boolean)
  from public,anon;
grant execute on function public.master_set_delivery_fee_mode(uuid,text,boolean)
  to authenticated;


create or replace function public.assert_delivery_admin_can_manage_fee_mode(
  p_delivery_id uuid,
  p_mode text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if public.current_role_code() is distinct from 'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('delivery_fees.manage')
     or not public.delivery_fee_mode_enabled(p_delivery_id,p_mode)
  then
    raise exception
      'HTPWEB: la modalidad de tarifa % no está habilitada para este DELIVERY',
      upper(trim(coalesce(p_mode,'')));
  end if;
end;
$function$;

revoke all on function public.assert_delivery_admin_can_manage_fee_mode(uuid,text)
  from public,anon,authenticated;


create or replace function public.save_delivery_fee_config(
  p_delivery_id uuid,
  p_mode text,
  p_fixed_fee numeric,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mode text;
  v_config_id uuid;
begin
  v_mode := upper(trim(coalesce(p_mode,'')));

  if v_mode not in ('FIXED','DISTANCE') then
    raise exception 'HTPWEB: mode debe ser FIXED o DISTANCE';
  end if;

  perform public.assert_delivery_admin_can_manage_fee_mode(
    p_delivery_id,
    v_mode
  );

  if p_fixed_fee is null or p_fixed_fee < 0 then
    raise exception 'HTPWEB: fixed_fee inválida';
  end if;

  if not exists (
    select 1 from public.deliveries d where d.id=p_delivery_id
  ) then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  insert into public.delivery_fee_configs(
    id,delivery_id,mode,fixed_fee,active,created_at,updated_at
  )
  values(
    gen_random_uuid(),
    p_delivery_id,
    v_mode,
    round(p_fixed_fee,2),
    coalesce(p_active,true),
    now(),
    now()
  )
  on conflict (delivery_id)
  do update set
    mode=excluded.mode,
    fixed_fee=excluded.fixed_fee,
    active=excluded.active,
    updated_at=now()
  returning id into v_config_id;

  return v_config_id;
end;
$function$;


create or replace function public.save_delivery_fee_schedule(
  p_delivery_id uuid,
  p_day_start_time time without time zone,
  p_night_start_time time without time zone
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  perform public.assert_delivery_admin_can_manage_fee_mode(
    p_delivery_id,
    'DISTANCE'
  );

  if p_day_start_time is null or p_night_start_time is null then
    raise exception 'HTPWEB: debe indicar inicio de tarifa diurna y nocturna';
  end if;

  if p_day_start_time >= p_night_start_time then
    raise exception 'HTPWEB: el inicio diurno debe ser anterior al inicio nocturno';
  end if;

  update public.delivery_fee_configs c
  set day_start_time=p_day_start_time,
      night_start_time=p_night_start_time,
      updated_at=now()
  where c.delivery_id=p_delivery_id
  returning c.id into v_id;

  if v_id is null then
    raise exception 'HTPWEB: primero guarde la configuración principal de tarifa del DELIVERY';
  end if;

  return v_id;
end;
$function$;


create or replace function public.save_delivery_distance_rate(
  p_delivery_id uuid,
  p_period text,
  p_rate_per_km numeric,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_period text;
  v_id uuid;
begin
  perform public.assert_delivery_admin_can_manage_fee_mode(
    p_delivery_id,
    'DISTANCE'
  );

  v_period := upper(trim(coalesce(p_period,'')));

  if v_period not in ('DAY','NIGHT') then
    raise exception 'HTPWEB: period debe ser DAY o NIGHT';
  end if;

  if p_rate_per_km is null or p_rate_per_km < 0 then
    raise exception 'HTPWEB: rate_per_km inválida';
  end if;

  if not exists (
    select 1 from public.deliveries d where d.id=p_delivery_id
  ) then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  insert into public.delivery_fee_rates(
    id,delivery_id,period,rate_per_km,active,created_at,updated_at
  )
  values(
    gen_random_uuid(),
    p_delivery_id,
    v_period,
    round(p_rate_per_km,4),
    coalesce(p_active,true),
    now(),
    now()
  )
  on conflict (delivery_id,period)
  do update set
    rate_per_km=excluded.rate_per_km,
    active=excluded.active,
    updated_at=now()
  returning id into v_id;

  return v_id;
end;
$function$;


create or replace function public.save_delivery_fee_range(
  p_delivery_id uuid,
  p_range_id uuid,
  p_distance_from numeric,
  p_distance_to numeric,
  p_fee numeric,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_range_id uuid;
begin
  perform public.assert_delivery_admin_can_manage_fee_mode(
    p_delivery_id,
    'DISTANCE'
  );

  if p_distance_from is null or p_distance_from < 0 then
    raise exception 'HTPWEB: distance_from inválida';
  end if;

  if p_distance_to is null or p_distance_to <= p_distance_from then
    raise exception 'HTPWEB: distance_to debe ser mayor que distance_from';
  end if;

  if p_fee is null or p_fee < 0 then
    raise exception 'HTPWEB: fee inválida';
  end if;

  if coalesce(p_active,true)
     and exists (
       select 1 from public.delivery_fee_ranges r
       where r.delivery_id=p_delivery_id
         and r.active=true
         and (p_range_id is null or r.id<>p_range_id)
         and p_distance_from<r.distance_to
         and p_distance_to>r.distance_from
     )
  then
    raise exception 'HTPWEB: el rango se superpone con otro rango activo';
  end if;

  if p_range_id is null then
    insert into public.delivery_fee_ranges(
      id,delivery_id,distance_from,distance_to,fee,active,created_at,updated_at
    )
    values(
      gen_random_uuid(),
      p_delivery_id,
      round(p_distance_from,2),
      round(p_distance_to,2),
      round(p_fee,2),
      coalesce(p_active,true),
      now(),
      now()
    )
    returning id into v_range_id;
  else
    update public.delivery_fee_ranges r
    set distance_from=round(p_distance_from,2),
        distance_to=round(p_distance_to,2),
        fee=round(p_fee,2),
        active=coalesce(p_active,true),
        updated_at=now()
    where r.id=p_range_id
      and r.delivery_id=p_delivery_id
    returning r.id into v_range_id;

    if v_range_id is null then
      raise exception 'HTPWEB: rango inexistente o pertenece a otro DELIVERY';
    end if;
  end if;

  return v_range_id;
end;
$function$;


create or replace function public.calculate_delivery_fee_at(
  p_delivery_id uuid,
  p_distance_km numeric,
  p_at timestamptz
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mode text;
  v_fixed_fee numeric(12,2);
  v_day_start time without time zone;
  v_night_start time without time zone;
  v_now_ecuador time without time zone;
  v_period text;
  v_rate numeric;
begin
  if p_delivery_id is null then
    raise exception 'delivery_id es obligatorio';
  end if;

  if p_distance_km is null or p_distance_km < 0 then
    raise exception 'La distancia debe ser mayor o igual a 0 km';
  end if;

  if p_at is null then
    raise exception 'La fecha/hora de cálculo es obligatoria';
  end if;

  select c.mode,c.fixed_fee,c.day_start_time,c.night_start_time
  into v_mode,v_fixed_fee,v_day_start,v_night_start
  from public.delivery_fee_configs c
  where c.delivery_id=p_delivery_id
    and c.active=true
  limit 1;

  if not found then
    raise exception 'El delivery no tiene una configuración de tarifa activa';
  end if;

  if not public.delivery_fee_mode_enabled(p_delivery_id,v_mode) then
    raise exception
      'La modalidad de tarifa % no está habilitada por HTPWEB para este DELIVERY',
      v_mode;
  end if;

  if v_mode='FIXED' then
    return coalesce(v_fixed_fee,0)::numeric(12,2);
  end if;

  if v_mode='DISTANCE' then
    v_now_ecuador := (p_at at time zone 'America/Guayaquil')::time;

    v_period := case
      when v_now_ecuador>=v_day_start and v_now_ecuador<v_night_start
        then 'DAY'
      else 'NIGHT'
    end;

    select r.rate_per_km
    into v_rate
    from public.delivery_fee_rates r
    where r.delivery_id=p_delivery_id
      and r.period=v_period
      and r.active=true
    limit 1;

    if v_rate is null then
      raise exception 'No existe una tarifa por km activa para el periodo %',v_period;
    end if;

    return round(p_distance_km*v_rate,2)::numeric(12,2);
  end if;

  raise exception 'Modo de tarifa no válido para el delivery: %',v_mode;
end;
$function$;

comment on function public.master_set_delivery_fee_mode(uuid,text,boolean) is
  'MASTER habilita o deshabilita FIXED/DISTANCE para un DELIVERY y sincroniza delivery_fees.manage.';
comment on function public.delivery_fee_mode_enabled(uuid,text) is
  'Guard interno que consulta la modalidad de tarifa habilitada por MASTER.';
