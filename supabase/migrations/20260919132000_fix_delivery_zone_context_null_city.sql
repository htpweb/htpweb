-- Código #70 corrección
-- Corrige delivery_zone_context cuando el DELIVERY todavía no tiene ciudad.
-- Sí modifica: reemplaza únicamente la RPC de lectura segura.

create or replace function public.delivery_zone_context(
  p_delivery_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_delivery_name text;
  v_delivery_active boolean;
  v_delivery_city_id uuid;

  v_city_name text;
  v_city_province text;
  v_city_country text;
  v_city_active boolean;

  v_current integer;
  v_limit integer;
  v_capability boolean;
  v_zones jsonb;
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  select d.name, d.active, d.city_id
    into v_delivery_name, v_delivery_active, v_delivery_city_id
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

  select c.name, c.province, c.country, c.active
    into v_city_name, v_city_province, v_city_country, v_city_active
  from public.cities c
  where c.id = v_delivery_city_id;

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
  where v_delivery_city_id is not null
    and z.city_id = v_delivery_city_id
    and z.active = true;

  return jsonb_build_object(
    'delivery', jsonb_build_object(
      'id', p_delivery_id,
      'name', v_delivery_name,
      'active', v_delivery_active,
      'city_id', v_delivery_city_id
    ),
    'city', case
      when v_delivery_city_id is null or v_city_name is null then null
      else jsonb_build_object(
        'id', v_delivery_city_id,
        'name', v_city_name,
        'province', v_city_province,
        'country', v_city_country,
        'active', v_city_active
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
