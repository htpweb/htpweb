-- Código #70
-- Cobertura geográfica por zonas + invariantes de ciudad.
-- Sí modifica: crea una RPC de lectura segura y triggers de integridad.

create or replace function public.delivery_zone_context(
  p_delivery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_delivery record;
  v_city record;
  v_current integer;
  v_limit integer;
  v_capability boolean;
  v_zones jsonb;
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  select d.id, d.name, d.active, d.city_id
    into v_delivery
  from public.deliveries d
  where d.id = p_delivery_id;

  if not found then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  if not public.is_master() then
    if not public.has_permission('zones.view') then
      raise exception 'HTPWEB: no tiene permiso zones.view';
    end if;

    if not public.user_has_delivery(p_delivery_id) then
      raise exception 'HTPWEB: no pertenece a este DELIVERY';
    end if;
  end if;

  if v_delivery.city_id is not null then
    select c.id, c.name, c.province, c.country, c.active
      into v_city
    from public.cities c
    where c.id = v_delivery.city_id;
  end if;

  select count(*)::integer
    into v_current
  from public.delivery_zones dz
  where dz.delivery_id = p_delivery_id
    and dz.active = true;

  v_limit := public.delivery_limit_value(p_delivery_id, 'max_zones');
  v_capability := public.delivery_has_capability(p_delivery_id, 'zones.manage');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', z.id,
        'name', z.name,
        'city_id', z.city_id,
        'active', z.active,
        'assigned', coalesce(dz.active, false)
      )
      order by lower(z.name), z.id
    ),
    '[]'::jsonb
  )
    into v_zones
  from public.zones z
  left join public.delivery_zones dz
    on dz.delivery_id = p_delivery_id
   and dz.zone_id = z.id
  where v_delivery.city_id is not null
    and z.city_id = v_delivery.city_id
    and z.active = true;

  return jsonb_build_object(
    'delivery', jsonb_build_object(
      'id', v_delivery.id,
      'name', v_delivery.name,
      'active', v_delivery.active,
      'city_id', v_delivery.city_id
    ),
    'city', case
      when v_city.id is null then null
      else jsonb_build_object(
        'id', v_city.id,
        'name', v_city.name,
        'province', v_city.province,
        'country', v_city.country,
        'active', v_city.active
      )
    end,
    'current_zones', coalesce(v_current, 0),
    'max_zones', v_limit,
    'zones_manage_enabled', coalesce(v_capability, false),
    'zones', coalesce(v_zones, '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.delivery_zone_context(uuid) from public;
revoke all on function public.delivery_zone_context(uuid) from anon;
grant execute on function public.delivery_zone_context(uuid) to authenticated;


create or replace function public.validate_delivery_city_zone_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.city_id is distinct from old.city_id
     and exists (
       select 1
       from public.delivery_zones dz
       join public.zones z on z.id = dz.zone_id
       where dz.delivery_id = old.id
         and dz.active = true
         and z.city_id is distinct from new.city_id
     )
  then
    raise exception
      'HTPWEB: desactive las zonas del DELIVERY antes de cambiar su ciudad';
  end if;

  return new;
end;
$function$;

revoke all on function public.validate_delivery_city_zone_integrity() from public;
revoke all on function public.validate_delivery_city_zone_integrity() from anon;
revoke all on function public.validate_delivery_city_zone_integrity() from authenticated;

drop trigger if exists trg_validate_delivery_city_zone_integrity on public.deliveries;

create trigger trg_validate_delivery_city_zone_integrity
before update of city_id on public.deliveries
for each row
execute function public.validate_delivery_city_zone_integrity();


create or replace function public.validate_zone_delivery_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.active is true
     and new.active is not true
     and exists (
       select 1
       from public.delivery_zones dz
       where dz.zone_id = old.id
         and dz.active = true
     )
  then
    raise exception
      'HTPWEB: desactive la zona en todos los DELIVERY antes de desactivar la zona';
  end if;

  if new.city_id is distinct from old.city_id
     and exists (
       select 1
       from public.delivery_zones dz
       join public.deliveries d on d.id = dz.delivery_id
       where dz.zone_id = old.id
         and dz.active = true
         and d.city_id is distinct from new.city_id
     )
  then
    raise exception
      'HTPWEB: desactive las asignaciones de la zona antes de cambiarla de ciudad';
  end if;

  return new;
end;
$function$;

revoke all on function public.validate_zone_delivery_integrity() from public;
revoke all on function public.validate_zone_delivery_integrity() from anon;
revoke all on function public.validate_zone_delivery_integrity() from authenticated;

drop trigger if exists trg_validate_zone_delivery_integrity on public.zones;

create trigger trg_validate_zone_delivery_integrity
before update of city_id, active on public.zones
for each row
execute function public.validate_zone_delivery_integrity();


create or replace function public.validate_delivery_zone_row_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_delivery_active boolean;
  v_delivery_city_id uuid;
  v_zone_active boolean;
  v_zone_city_id uuid;
begin
  if new.active is not true then
    return new;
  end if;

  select d.active, d.city_id
    into v_delivery_active, v_delivery_city_id
  from public.deliveries d
  where d.id = new.delivery_id;

  if not found then
    raise exception 'HTPWEB: DELIVERY inexistente';
  end if;

  select z.active, z.city_id
    into v_zone_active, v_zone_city_id
  from public.zones z
  where z.id = new.zone_id;

  if not found then
    raise exception 'HTPWEB: zona inexistente';
  end if;

  if v_delivery_active is not true then
    raise exception 'HTPWEB: DELIVERY inactivo';
  end if;

  if v_zone_active is not true then
    raise exception 'HTPWEB: zona inactiva';
  end if;

  if v_delivery_city_id is null then
    raise exception 'HTPWEB: el DELIVERY no tiene ciudad configurada';
  end if;

  if v_delivery_city_id is distinct from v_zone_city_id then
    raise exception 'HTPWEB: la zona no pertenece a la ciudad del DELIVERY';
  end if;

  return new;
end;
$function$;

revoke all on function public.validate_delivery_zone_row_integrity() from public;
revoke all on function public.validate_delivery_zone_row_integrity() from anon;
revoke all on function public.validate_delivery_zone_row_integrity() from authenticated;

drop trigger if exists trg_validate_delivery_zone_row_integrity on public.delivery_zones;

create trigger trg_validate_delivery_zone_row_integrity
before insert or update of delivery_id, zone_id, active on public.delivery_zones
for each row
execute function public.validate_delivery_zone_row_integrity();
