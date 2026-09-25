
create or replace function public.delivery_fee_mode_enabled(p_delivery_id uuid,p_mode text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_code text;
begin
  v_code:=case upper(trim(coalesce(p_mode,'')))
    when 'FIXED' then 'delivery_fees.fixed'
    when 'DISTANCE' then 'delivery_fees.distance'
    else null
  end;
  if v_code is null then return false; end if;
  return public.delivery_has_capability(p_delivery_id,v_code);
end;
$$;

create or replace function public.save_delivery_fee_schedule(
  p_delivery_id uuid,
  p_day_start_time time without time zone,
  p_night_start_time time without time zone
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  perform public.assert_delivery_admin_can_manage_fee_mode(p_delivery_id,'DISTANCE');

  if not public.delivery_has_capability(p_delivery_id,'delivery_fees.day_night') then
    raise exception 'HTPWEB: tu plan no incluye tarifa Día/Noche';
  end if;

  if p_day_start_time is null or p_night_start_time is null then
    raise exception 'HTPWEB: debe indicar inicio de tarifa diurna y nocturna';
  end if;
  if p_day_start_time>=p_night_start_time then
    raise exception 'HTPWEB: el inicio diurno debe ser anterior al inicio nocturno';
  end if;

  update public.delivery_fee_configs
  set day_start_time=p_day_start_time,night_start_time=p_night_start_time,updated_at=now()
  where delivery_id=p_delivery_id
  returning id into v_id;

  if v_id is null then
    raise exception 'HTPWEB: primero guarde la configuración principal de tarifa del DELIVERY';
  end if;
  return v_id;
end;
$$;

create or replace function public.save_delivery_distance_rate(
  p_delivery_id uuid,
  p_period text,
  p_rate_per_km numeric,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_period text:=upper(trim(coalesce(p_period,''))); v_id uuid;
begin
  perform public.assert_delivery_admin_can_manage_fee_mode(p_delivery_id,'DISTANCE');

  if v_period not in ('DAY','NIGHT') then
    raise exception 'HTPWEB: period debe ser DAY o NIGHT';
  end if;
  if v_period='NIGHT' and not public.delivery_has_capability(p_delivery_id,'delivery_fees.day_night') then
    raise exception 'HTPWEB: tu plan no incluye tarifa nocturna';
  end if;
  if p_rate_per_km is null or p_rate_per_km<0 then
    raise exception 'HTPWEB: rate_per_km inválida';
  end if;

  insert into public.delivery_fee_rates(id,delivery_id,period,rate_per_km,active,created_at,updated_at)
  values(gen_random_uuid(),p_delivery_id,v_period,round(p_rate_per_km,4),coalesce(p_active,true),now(),now())
  on conflict(delivery_id,period) do update set
    rate_per_km=excluded.rate_per_km,active=excluded.active,updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.calculate_delivery_fee_at(
  p_delivery_id uuid,
  p_distance_km numeric,
  p_at timestamptz
)
returns numeric
language plpgsql
security definer
set search_path=''
as $$
declare
  v_mode text;
  v_fixed_fee numeric(12,2);
  v_day_start time;
  v_night_start time;
  v_now time;
  v_period text;
  v_rate numeric;
  v_day_night boolean;
begin
  if p_delivery_id is null then raise exception 'delivery_id es obligatorio'; end if;
  if p_distance_km is null or p_distance_km<0 then raise exception 'La distancia debe ser mayor o igual a 0 km'; end if;
  if p_at is null then raise exception 'La fecha/hora de cálculo es obligatoria'; end if;

  select mode,fixed_fee,day_start_time,night_start_time
  into v_mode,v_fixed_fee,v_day_start,v_night_start
  from public.delivery_fee_configs
  where delivery_id=p_delivery_id and active=true
  limit 1;

  if not found then raise exception 'El delivery no tiene una configuración de tarifa activa'; end if;
  if not public.delivery_fee_mode_enabled(p_delivery_id,v_mode) then
    raise exception 'La modalidad de tarifa % no está habilitada por el plan para este DELIVERY',v_mode;
  end if;

  if v_mode='FIXED' then
    return coalesce(v_fixed_fee,0)::numeric(12,2);
  end if;

  if v_mode='DISTANCE' then
    v_day_night:=public.delivery_has_capability(p_delivery_id,'delivery_fees.day_night');
    if v_day_night then
      v_now:=(p_at at time zone 'America/Guayaquil')::time;
      v_period:=case when v_now>=v_day_start and v_now<v_night_start then 'DAY' else 'NIGHT' end;
    else
      v_period:='DAY';
    end if;

    select rate_per_km into v_rate
    from public.delivery_fee_rates
    where delivery_id=p_delivery_id and period=v_period and active=true
    limit 1;

    if v_rate is null then
      raise exception 'No existe una tarifa por km activa para el periodo %',v_period;
    end if;
    return round(p_distance_km*v_rate,2)::numeric(12,2);
  end if;

  raise exception 'Modo de tarifa no válido para el delivery: %',v_mode;
end;
$$;

drop function if exists public.master_set_delivery_service_period(uuid,date,date);
drop function if exists public.master_renew_delivery_service_month(uuid);
drop function if exists public.master_delivery_fee_capability_status(uuid);
drop function if exists public.master_delivery_fee_modes_status(uuid);
drop function if exists public.master_set_delivery_fee_mode(uuid,text,boolean);
