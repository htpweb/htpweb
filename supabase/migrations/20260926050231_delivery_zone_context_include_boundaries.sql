
create or replace function public.delivery_zone_context(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_delivery record;
  v_city record;
  v_current integer;
  v_limit integer;
  v_zones jsonb;
  v_reset_pending boolean;
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  select d.id,d.name,d.active,d.city_id
  into v_delivery
  from public.deliveries d
  where d.id=p_delivery_id;

  if not found then raise exception 'HTPWEB: DELIVERY inexistente'; end if;

  if not public.is_master() then
    if not public.has_permission('zones.view') then
      raise exception 'HTPWEB: no tiene permiso zones.view';
    end if;
    if not public.user_has_delivery(p_delivery_id) then
      raise exception 'HTPWEB: no pertenece a este DELIVERY';
    end if;
  end if;

  if v_delivery.city_id is not null then
    select c.id,c.name,c.province,c.country,c.active
    into v_city
    from public.cities c
    where c.id=v_delivery.city_id;
  end if;

  select count(*)::integer into v_current
  from public.delivery_zones dz
  where dz.delivery_id=p_delivery_id and dz.active=true;

  v_limit:=public.delivery_limit_value(p_delivery_id,'zones.active.max');
  v_reset_pending:=not public.delivery_plan_selection_ready(p_delivery_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',z.id,
    'code',z.code,
    'name',z.name,
    'city_id',z.city_id,
    'city_name',c.name,
    'province',c.province,
    'active',z.active,
    'assigned',coalesce(dz.active,false),
    'boundary',z.boundary,
    'color',z.color,
    'description',z.description,
    'local_count',(select count(*) from public.locals l where l.zone_id=z.id and l.active=true)
  ) order by z.code,lower(z.name),z.id),'[]'::jsonb)
  into v_zones
  from public.zones z
  join public.cities c on c.id=z.city_id
  left join public.delivery_zones dz on dz.delivery_id=p_delivery_id and dz.zone_id=z.id
  where z.active=true
    and v_delivery.city_id is not null
    and z.city_id=v_delivery.city_id;

  return jsonb_build_object(
    'delivery',jsonb_build_object(
      'id',v_delivery.id,'name',v_delivery.name,'active',v_delivery.active,'city_id',v_delivery.city_id
    ),
    'city',case when v_city.id is null then null else jsonb_build_object(
      'id',v_city.id,'name',v_city.name,'province',v_city.province,'country',v_city.country,'active',v_city.active
    ) end,
    'current_zones',coalesce(v_current,0),
    'max_zones',v_limit,
    'selection_reset_pending',v_reset_pending,
    'zones',coalesce(v_zones,'[]'::jsonb)
  );
end;
$$;
