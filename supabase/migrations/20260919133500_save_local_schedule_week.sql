-- Código #71
-- Guardado atómico del horario semanal de un LOCAL.
-- Sí modifica: crea una RPC transaccional que reutiliza save_local_schedule.

create or replace function public.save_local_schedule_week(
  p_local_id uuid,
  p_days jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_item jsonb;
  v_day smallint;
  v_is_closed boolean;
  v_opening time;
  v_closing time;
  v_seen_days integer[];
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  if not public.user_can_manage_local_resource(
    p_local_id,
    'schedules.manage',
    'schedules.manage'
  ) then
    raise exception 'HTPWEB: no está autorizado para administrar horarios de este LOCAL';
  end if;

  if p_days is null or jsonb_typeof(p_days) <> 'array' then
    raise exception 'HTPWEB: p_days debe ser un arreglo JSON';
  end if;

  if jsonb_array_length(p_days) <> 7 then
    raise exception 'HTPWEB: el horario semanal debe contener exactamente 7 días';
  end if;

  v_seen_days := array[]::integer[];

  for v_item in
    select value
    from jsonb_array_elements(p_days)
  loop
    if not (v_item ? 'day_of_week') or not (v_item ? 'is_closed') then
      raise exception 'HTPWEB: cada día requiere day_of_week e is_closed';
    end if;

    begin
      v_day := (v_item->>'day_of_week')::smallint;
      v_is_closed := (v_item->>'is_closed')::boolean;
    exception when others then
      raise exception 'HTPWEB: formato inválido en day_of_week o is_closed';
    end;

    if v_day < 0 or v_day > 6 then
      raise exception 'HTPWEB: day_of_week debe estar entre 0 y 6';
    end if;

    if v_day = any(v_seen_days) then
      raise exception 'HTPWEB: day_of_week duplicado (%)', v_day;
    end if;

    v_seen_days := array_append(v_seen_days, v_day::integer);

    if v_is_closed then
      v_opening := null;
      v_closing := null;
    else
      if nullif(trim(v_item->>'opening_time'), '') is null
         or nullif(trim(v_item->>'closing_time'), '') is null
      then
        raise exception 'HTPWEB: un día abierto requiere opening_time y closing_time';
      end if;

      begin
        v_opening := (v_item->>'opening_time')::time;
        v_closing := (v_item->>'closing_time')::time;
      exception when others then
        raise exception 'HTPWEB: formato de hora inválido para day_of_week %', v_day;
      end;

      if v_opening >= v_closing then
        raise exception 'HTPWEB: opening_time debe ser menor que closing_time para day_of_week %', v_day;
      end if;
    end if;

    perform public.save_local_schedule(
      p_local_id,
      v_day,
      v_is_closed,
      v_opening,
      v_closing
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.save_local_schedule_week(uuid, jsonb) from public;
revoke all on function public.save_local_schedule_week(uuid, jsonb) from anon;
grant execute on function public.save_local_schedule_week(uuid, jsonb) to authenticated;

comment on column public.local_schedules.day_of_week is
  'Convención HTPWEB: 0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado.';
