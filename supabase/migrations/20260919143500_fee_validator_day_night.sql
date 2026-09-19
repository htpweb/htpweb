-- Código #69B corrección
-- Sustituye la validación legada de rangos por validación compatible con tarifas DAY/NIGHT.
-- Sí modifica: reemplaza el trigger de integridad de delivery_fee_configs.

create or replace function public.validate_delivery_fee_config_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.mode not in ('FIXED','DISTANCE') then
    raise exception 'HTPWEB: modo de tarifa inválido';
  end if;

  if new.fixed_fee is null or new.fixed_fee < 0 then
    raise exception 'HTPWEB: fixed_fee inválida';
  end if;

  if new.day_start_time is null
     or new.night_start_time is null
     or new.day_start_time >= new.night_start_time
  then
    raise exception
      'HTPWEB: horario Día/Noche inválido';
  end if;

  if new.active is true
     and not exists (
       select 1
       from public.deliveries d
       where d.id = new.delivery_id
         and d.active = true
     )
  then
    raise exception
      'HTPWEB: DELIVERY inexistente o inactivo';
  end if;

  -- DISTANCE puede quedar temporalmente incompleta mientras el administrador
  -- configura DAY y NIGHT. calculate_delivery_fee falla de forma segura si
  -- falta la tarifa del periodo aplicable, por lo que no se crea un pedido
  -- con un costo inventado o 0.
  return new;
end;
$function$;

drop trigger if exists trg_validate_delivery_fee_config_state
  on public.delivery_fee_configs;

create trigger trg_validate_delivery_fee_config_state
before insert or update of
  delivery_id,
  mode,
  fixed_fee,
  active,
  day_start_time,
  night_start_time
on public.delivery_fee_configs
for each row
execute function public.validate_delivery_fee_config_state();

revoke all on function public.validate_delivery_fee_config_state() from public;
revoke all on function public.validate_delivery_fee_config_state() from anon;
revoke all on function public.validate_delivery_fee_config_state() from authenticated;
