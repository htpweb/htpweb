create or replace function public.delivery_admin_overview_snapshot(
  p_delivery_id uuid,
  p_today_start timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_plan jsonb;
  v_orders_today integer := 0;
  v_open_orders integer := 0;
  v_en_route integer := 0;
  v_ready_unassigned integer := 0;
  v_delivered_today integer := 0;
  v_delivery_revenue numeric := 0;
  v_recent jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  if public.current_role_code() not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
     or not public.user_has_delivery(p_delivery_id)
  then
    raise exception 'HTPWEB: no autorizado para consultar este DELIVERY';
  end if;

  select count(*)::integer
  into v_orders_today
  from public.orders o
  where o.delivery_id=p_delivery_id
    and o.created_at>=p_today_start;

  select count(*)::integer
  into v_open_orders
  from public.orders o
  where o.delivery_id=p_delivery_id
    and o.status in ('PENDING','CONFIRMED','PREPARING','READY','EN_ROUTE');

  select count(*)::integer
  into v_en_route
  from public.orders o
  where o.delivery_id=p_delivery_id
    and o.status='EN_ROUTE';

  select count(*)::integer
  into v_ready_unassigned
  from public.orders o
  where o.delivery_id=p_delivery_id
    and o.status='READY'
    and not exists (
      select 1
      from public.order_driver_assignments oda
      where oda.order_id=o.id
        and oda.delivery_id=p_delivery_id
        and oda.status='ACTIVE'
        and oda.unassigned_at is null
    );

  select count(*)::integer,coalesce(sum(o.delivery_fee),0)
  into v_delivered_today,v_delivery_revenue
  from public.orders o
  where o.delivery_id=p_delivery_id
    and o.status='DELIVERED'
    and coalesce(o.delivered_at,o.updated_at)>=p_today_start;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_recent
  from (
    select o.id,o.status,o.customer_name,o.created_at,o.delivery_fee,o.total
    from public.orders o
    where o.delivery_id=p_delivery_id
    order by o.created_at desc
    limit 5
  ) x;

  v_plan:=public.delivery_my_plan_summary(p_delivery_id);

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'orders_today',v_orders_today,
    'open_orders',v_open_orders,
    'en_route',v_en_route,
    'ready_unassigned',v_ready_unassigned,
    'delivered_today_count',v_delivered_today,
    'delivery_revenue_today',v_delivery_revenue,
    'recent_orders',v_recent,
    'plan_summary',v_plan
  );
end;
$function$;

revoke all on function public.delivery_admin_overview_snapshot(uuid,timestamptz) from public;
grant execute on function public.delivery_admin_overview_snapshot(uuid,timestamptz) to authenticated;
