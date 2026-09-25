-- HTPWEB: el DELIVERY_ADMIN es el único propietario operativo de sus tarifas.
-- MASTER conserva únicamente el control de habilitar/bloquear la capacidad.

create or replace function public.master_delivery_fee_capability_status(
  p_delivery_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_enabled boolean;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if not exists (
    select 1 from public.deliveries d where d.id = p_delivery_id
  ) then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  select dc.enabled
    into v_enabled
  from public.delivery_capabilities dc
  join public.capabilities c on c.id = dc.capability_id
  where dc.delivery_id = p_delivery_id
    and c.code = 'delivery_fees.manage'
  limit 1;

  return coalesce(v_enabled,false);
end;
$function$;

revoke all on function public.master_delivery_fee_capability_status(uuid) from public, anon;
grant execute on function public.master_delivery_fee_capability_status(uuid) to authenticated;


create or replace function public.assert_delivery_admin_can_manage_fees(
  p_delivery_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if public.current_role_code() is distinct from 'DELIVERY_ADMIN'
     or not public.user_can_manage_delivery_resource(
       p_delivery_id,
       'delivery_fees.manage',
       'delivery_fees.manage'
     )
  then
    raise exception 'HTPWEB: las tarifas solo pueden ser configuradas por el DELIVERY_ADMIN autorizado';
  end if;
end;
$function$;

revoke all on function public.assert_delivery_admin_can_manage_fees(uuid) from public, anon, authenticated;


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
  perform public.assert_delivery_admin_can_manage_fees(p_delivery_id);

  v_mode := upper(trim(coalesce(p_mode,'')));

  if v_mode not in ('FIXED','DISTANCE') then
    raise exception 'HTPWEB: mode debe ser FIXED o DISTANCE';
  end if;

  if p_fixed_fee is null or p_fixed_fee < 0 then
    raise exception 'HTPWEB: fixed_fee inválida';
  end if;

  if not exists (
    select 1 from public.deliveries d where d.id = p_delivery_id
  ) then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  insert into public.delivery_fee_configs (
    id, delivery_id, mode, fixed_fee, active, created_at, updated_at
  )
  values (
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
    mode = excluded.mode,
    fixed_fee = excluded.fixed_fee,
    active = excluded.active,
    updated_at = now()
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
  perform public.assert_delivery_admin_can_manage_fees(p_delivery_id);

  if p_day_start_time is null or p_night_start_time is null then
    raise exception 'HTPWEB: debe indicar inicio de tarifa diurna y nocturna';
  end if;

  if p_day_start_time >= p_night_start_time then
    raise exception 'HTPWEB: el inicio diurno debe ser anterior al inicio nocturno';
  end if;

  update public.delivery_fee_configs c
  set day_start_time = p_day_start_time,
      night_start_time = p_night_start_time,
      updated_at = now()
  where c.delivery_id = p_delivery_id
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
  perform public.assert_delivery_admin_can_manage_fees(p_delivery_id);

  v_period := upper(trim(coalesce(p_period,'')));

  if v_period not in ('DAY','NIGHT') then
    raise exception 'HTPWEB: period debe ser DAY o NIGHT';
  end if;

  if p_rate_per_km is null or p_rate_per_km < 0 then
    raise exception 'HTPWEB: rate_per_km inválida';
  end if;

  if not exists (
    select 1 from public.deliveries d where d.id = p_delivery_id
  ) then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  insert into public.delivery_fee_rates(
    id, delivery_id, period, rate_per_km, active, created_at, updated_at
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
  on conflict (delivery_id, period)
  do update set
    rate_per_km = excluded.rate_per_km,
    active = excluded.active,
    updated_at = now()
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
  perform public.assert_delivery_admin_can_manage_fees(p_delivery_id);

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
       select 1
       from public.delivery_fee_ranges r
       where r.delivery_id = p_delivery_id
         and r.active = true
         and (p_range_id is null or r.id <> p_range_id)
         and p_distance_from < r.distance_to
         and p_distance_to > r.distance_from
     )
  then
    raise exception 'HTPWEB: el rango se superpone con otro rango activo';
  end if;

  if p_range_id is null then
    insert into public.delivery_fee_ranges (
      id, delivery_id, distance_from, distance_to, fee, active, created_at, updated_at
    )
    values (
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
    set distance_from = round(p_distance_from,2),
        distance_to = round(p_distance_to,2),
        fee = round(p_fee,2),
        active = coalesce(p_active,true),
        updated_at = now()
    where r.id = p_range_id
      and r.delivery_id = p_delivery_id
    returning r.id into v_range_id;

    if v_range_id is null then
      raise exception 'HTPWEB: rango inexistente o pertenece a otro DELIVERY';
    end if;
  end if;

  return v_range_id;
end;
$function$;

comment on function public.master_delivery_fee_capability_status(uuid) is
  'MASTER consulta si la capacidad legacy delivery_fees.manage está habilitada. No expone precios.';
comment on function public.assert_delivery_admin_can_manage_fees(uuid) is
  'Guard interno: únicamente DELIVERY_ADMIN autorizado puede modificar precios de entrega.';
