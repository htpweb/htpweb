-- Código #73
-- Disponibilidad de LOCAL para checkout.
-- Sí modifica: crea una función service-only que evalúa horarios usando hora oficial continental de Ecuador.

create or replace function public.check_locals_order_availability(
  p_local_ids uuid[],
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now_local timestamp without time zone;
  v_day smallint;
  v_time time without time zone;
  v_result jsonb;
begin
  if p_local_ids is null
     or cardinality(p_local_ids) = 0
  then
    raise exception 'HTPWEB: p_local_ids no puede estar vacío';
  end if;

  if exists (
    select 1
    from unnest(p_local_ids) x(local_id)
    left join public.locals l on l.id = x.local_id
    where l.id is null
  ) then
    raise exception 'HTPWEB: uno o más LOCAL no existen';
  end if;

  -- HTPWEB opera actualmente con hora continental de Ecuador.
  -- 0=Domingo ... 6=Sábado, igual que local_schedules.day_of_week.
  v_now_local := p_at at time zone 'America/Guayaquil';
  v_day := extract(dow from v_now_local)::smallint;
  v_time := v_now_local::time;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'local_id', base.local_id,
        'configured', base.schedule_count > 0,
        'day_of_week', v_day,
        'local_time', to_char(v_now_local, 'YYYY-MM-DD HH24:MI:SS'),
        'is_open',
          case
            when base.schedule_count = 0 then true
            when s.id is null then false
            when s.is_closed then false
            when v_time >= s.opening_time and v_time < s.closing_time then true
            else false
          end,
        'reason',
          case
            when base.schedule_count = 0 then 'NO_SCHEDULE_CONFIGURED'
            when s.id is null then 'DAY_NOT_CONFIGURED'
            when s.is_closed then 'CLOSED_TODAY'
            when v_time < s.opening_time then 'BEFORE_OPENING'
            when v_time >= s.closing_time then 'AFTER_CLOSING'
            else 'OPEN'
          end,
        'opening_time',
          case when s.opening_time is null then null else to_char(s.opening_time, 'HH24:MI') end,
        'closing_time',
          case when s.closing_time is null then null else to_char(s.closing_time, 'HH24:MI') end
      )
      order by base.ordinality
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      x.local_id,
      x.ordinality,
      (
        select count(*)
        from public.local_schedules all_s
        where all_s.local_id = x.local_id
      )::integer as schedule_count
    from unnest(p_local_ids) with ordinality x(local_id, ordinality)
  ) base
  left join public.local_schedules s
    on s.local_id = base.local_id
   and s.day_of_week = v_day;

  return v_result;
end;
$function$;

revoke all on function public.check_locals_order_availability(uuid[], timestamptz) from public;
revoke all on function public.check_locals_order_availability(uuid[], timestamptz) from anon;
revoke all on function public.check_locals_order_availability(uuid[], timestamptz) from authenticated;
grant execute on function public.check_locals_order_availability(uuid[], timestamptz) to service_role;

comment on function public.check_locals_order_availability(uuid[], timestamptz) is
  'Evalúa si uno o más LOCAL pueden recibir pedidos según local_schedules. Sin horarios configurados mantiene compatibilidad y permite pedidos; si hay horarios parciales, un día no configurado se considera cerrado. Zona horaria actual: America/Guayaquil.';
