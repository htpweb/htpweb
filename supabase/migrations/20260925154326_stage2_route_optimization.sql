create or replace function public.driver_route_context(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_orders jsonb;
  v_count integer:=0;
  v_en_route integer:=0;
  v_invalid integer:=0;
  v_reason text;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  if not exists(
    select 1
    from public.user_deliveries ud
    where ud.user_id=auth.uid()
      and ud.delivery_id=p_delivery_id
      and ud.active=true
  ) then
    raise exception 'HTPWEB: no perteneces a este DELIVERY';
  end if;

  if not public.delivery_service_is_active(p_delivery_id) then
    return jsonb_build_object(
      'delivery_id',p_delivery_id,
      'can_optimize',false,
      'reason','PLAN_INACTIVE',
      'orders','[]'::jsonb
    );
  end if;

  if not public.delivery_has_capability(p_delivery_id,'routes.optimize') then
    return jsonb_build_object(
      'delivery_id',p_delivery_id,
      'can_optimize',false,
      'reason','ROUTES_NOT_INCLUDED',
      'orders','[]'::jsonb
    );
  end if;

  select
    count(*)::integer,
    count(*) filter(where o.status='EN_ROUTE')::integer,
    count(*) filter(
      where o.latitude is null
         or o.longitude is null
         or o.latitude::numeric<-90
         or o.latitude::numeric>90
         or o.longitude::numeric<-180
         or o.longitude::numeric>180
    )::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'order_id',o.id,
      'status',o.status,
      'customer_name',o.customer_name,
      'delivery_address',o.delivery_address,
      'address_reference',o.address_reference,
      'latitude',o.latitude,
      'longitude',o.longitude,
      'assigned_at',a.assigned_at
    ) order by a.assigned_at,o.id),'[]'::jsonb)
  into v_count,v_en_route,v_invalid,v_orders
  from public.order_driver_assignments a
  join public.orders o on o.id=a.order_id
  where a.driver_user_id=auth.uid()
    and a.delivery_id=p_delivery_id
    and a.status='ACTIVE'
    and a.unassigned_at is null
    and o.status in ('READY','EN_ROUTE');

  if v_count=0 then
    v_reason:='NO_ACTIVE_ORDERS';
  elsif v_invalid>0 then
    v_reason:='INVALID_COORDINATES';
  elsif v_en_route>0 then
    v_reason:='ORDER_EN_ROUTE';
  elsif v_count<2 then
    v_reason:='NOT_ENOUGH_STOPS';
  else
    v_reason:=null;
  end if;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'can_optimize',v_reason is null,
    'reason',v_reason,
    'routes_optimize',true,
    'order_count',v_count,
    'orders',v_orders
  );
end;
$$;

revoke execute on function public.driver_route_context(uuid)
from public,anon;
grant execute on function public.driver_route_context(uuid)
to authenticated;
