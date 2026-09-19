-- Código #69B
-- Tarifas por km diferenciadas entre día y noche.
-- Sí modifica: amplía configuración de tarifas, crea tarifas DAY/NIGHT y reemplaza el cálculo DISTANCE.

alter table public.delivery_fee_configs
  add column if not exists day_start_time time without time zone not null default '06:00',
  add column if not exists night_start_time time without time zone not null default '18:00';

alter table public.delivery_fee_configs
  drop constraint if exists delivery_fee_day_night_time_check;

alter table public.delivery_fee_configs
  add constraint delivery_fee_day_night_time_check
  check (day_start_time < night_start_time);


create table if not exists public.delivery_fee_rates (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  period text not null,
  rate_per_km numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_fee_rates_period_check
    check (period in ('DAY','NIGHT')),
  constraint delivery_fee_rates_value_check
    check (rate_per_km >= 0),
  constraint delivery_fee_rates_delivery_period_key
    unique (delivery_id, period)
);

alter table public.delivery_fee_rates enable row level security;

drop policy if exists delivery_fee_rates_select_authorized
  on public.delivery_fee_rates;

create policy delivery_fee_rates_select_authorized
on public.delivery_fee_rates
for select
to authenticated
using (
  public.is_master()
  or (
    public.has_permission('delivery_fees.manage')
    and public.user_has_delivery(delivery_id)
  )
);

revoke all on table public.delivery_fee_rates from public;
revoke all on table public.delivery_fee_rates from anon;
revoke all on table public.delivery_fee_rates from authenticated;
grant select on table public.delivery_fee_rates to authenticated;
grant select on table public.delivery_fee_rates to service_role;


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
  if not public.user_can_manage_delivery_resource(
    p_delivery_id,
    'delivery_fees.manage',
    'delivery_fees.manage'
  ) then
    raise exception
      'HTPWEB: no está autorizado para administrar tarifas de este DELIVERY';
  end if;

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
    raise exception
      'HTPWEB: primero guarde la configuración principal de tarifa del DELIVERY';
  end if;

  return v_id;
end;
$function$;

revoke all on function public.save_delivery_fee_schedule(uuid,time without time zone,time without time zone) from public;
revoke all on function public.save_delivery_fee_schedule(uuid,time without time zone,time without time zone) from anon;
grant execute on function public.save_delivery_fee_schedule(uuid,time without time zone,time without time zone) to authenticated;


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
  if not public.user_can_manage_delivery_resource(
    p_delivery_id,
    'delivery_fees.manage',
    'delivery_fees.manage'
  ) then
    raise exception
      'HTPWEB: no está autorizado para administrar tarifas de este DELIVERY';
  end if;

  v_period := upper(trim(coalesce(p_period,'')));

  if v_period not in ('DAY','NIGHT') then
    raise exception 'HTPWEB: period debe ser DAY o NIGHT';
  end if;

  if p_rate_per_km is null or p_rate_per_km < 0 then
    raise exception 'HTPWEB: rate_per_km inválida';
  end if;

  if not exists (
    select 1
    from public.deliveries d
    where d.id = p_delivery_id
  ) then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  insert into public.delivery_fee_rates(
    id,
    delivery_id,
    period,
    rate_per_km,
    active,
    created_at,
    updated_at
  )
  values(
    gen_random_uuid(),
    p_delivery_id,
    v_period,
    round(p_rate_per_km, 4),
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

revoke all on function public.save_delivery_distance_rate(uuid,text,numeric,boolean) from public;
revoke all on function public.save_delivery_distance_rate(uuid,text,numeric,boolean) from anon;
grant execute on function public.save_delivery_distance_rate(uuid,text,numeric,boolean) to authenticated;


create or replace function public.calculate_delivery_fee(
  p_delivery_id uuid,
  p_distance_km numeric
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

  select
    c.mode,
    c.fixed_fee,
    c.day_start_time,
    c.night_start_time
  into
    v_mode,
    v_fixed_fee,
    v_day_start,
    v_night_start
  from public.delivery_fee_configs c
  where c.delivery_id = p_delivery_id
    and c.active = true
  limit 1;

  if not found then
    raise exception
      'El delivery no tiene una configuración de tarifa activa';
  end if;

  if v_mode = 'FIXED' then
    return coalesce(v_fixed_fee,0)::numeric(12,2);
  end if;

  if v_mode = 'DISTANCE' then
    v_now_ecuador := (now() at time zone 'America/Guayaquil')::time;

    v_period := case
      when v_now_ecuador >= v_day_start
       and v_now_ecuador < v_night_start
        then 'DAY'
      else 'NIGHT'
    end;

    select r.rate_per_km
      into v_rate
    from public.delivery_fee_rates r
    where r.delivery_id = p_delivery_id
      and r.period = v_period
      and r.active = true
    limit 1;

    if v_rate is null then
      raise exception
        'No existe una tarifa por km activa para el periodo %',
        v_period;
    end if;

    return round(p_distance_km * v_rate, 2)::numeric(12,2);
  end if;

  raise exception
    'Modo de tarifa no válido para el delivery: %',
    v_mode;
end;
$function$;

comment on table public.delivery_fee_rates is
  'Costo por km de cada DELIVERY separado por periodo DAY/NIGHT.';

comment on column public.delivery_fee_configs.day_start_time is
  'Hora desde la que aplica DAY. Zona horaria actual de cálculo: America/Guayaquil.';

comment on column public.delivery_fee_configs.night_start_time is
  'Hora desde la que aplica NIGHT. Zona horaria actual de cálculo: America/Guayaquil.';

comment on function public.calculate_delivery_fee(uuid,numeric) is
  'FIXED devuelve fixed_fee. DISTANCE calcula distancia_km × rate_per_km DAY/NIGHT según hora del servidor en America/Guayaquil.';
