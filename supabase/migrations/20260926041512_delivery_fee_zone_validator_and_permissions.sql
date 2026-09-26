
create or replace function public.validate_delivery_fee_config_state()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.mode not in ('FIXED','DISTANCE','ZONE') then
    raise exception 'HTPWEB: modo de tarifa inválido';
  end if;

  if new.fixed_fee is null or new.fixed_fee<0
     or new.fixed_day_fee is null or new.fixed_day_fee<0
     or new.fixed_night_fee is null or new.fixed_night_fee<0
  then
    raise exception 'HTPWEB: tarifa fija inválida';
  end if;

  if new.day_start_time is null
     or new.night_start_time is null
     or new.day_start_time>=new.night_start_time
  then
    raise exception 'HTPWEB: horario Día/Noche inválido';
  end if;

  if new.zone_pricing_mode not in ('SIMPLE','DETAILED') then
    raise exception 'HTPWEB: configuración de tarifa por zonas inválida';
  end if;

  if new.active is true
     and not exists(
       select 1 from public.deliveries d
       where d.id=new.delivery_id and d.active=true
     )
  then
    raise exception 'HTPWEB: DELIVERY inexistente o inactivo';
  end if;

  return new;
end;
$$;

revoke execute on function public.calculate_delivery_fee_for_order(uuid,uuid,numeric,numeric,numeric,timestamptz) from public;
grant execute on function public.calculate_delivery_fee_for_order(uuid,uuid,numeric,numeric,numeric,timestamptz) to authenticated,service_role;
