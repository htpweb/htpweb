create or replace function public.delivery_order_control_snapshot(
  p_delivery_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),200));
  v_result jsonb;
begin
  if p_delivery_id is null then raise exception 'HTPWEB: delivery_id es obligatorio'; end if;

  if not public.is_master()
     and not public.user_can_manage_delivery_resource(p_delivery_id,'orders.view','orders.manage')
  then raise exception 'HTPWEB: no autorizado para consultar centro de pedidos'; end if;

  select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb)
  into v_result
  from (
    select o.created_at,
      jsonb_build_object(
        'id',o.id,'delivery_id',o.delivery_id,'status',o.status,
        'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'total',o.total,
        'customer_name',o.customer_name,'customer_phone',o.customer_phone,
        'delivery_address',o.delivery_address,'latitude',o.latitude,'longitude',o.longitude,
        'address_reference',o.address_reference,'notes',o.notes,
        'created_at',o.created_at,'confirmed_at',o.confirmed_at,'preparing_at',o.preparing_at,
        'ready_at',o.ready_at,'en_route_at',o.en_route_at,'delivered_at',o.delivered_at,'cancelled_at',o.cancelled_at,
        'items',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',oi.id,'local_id',oi.local_id,'product_name',oi.product_name,
            'variant_name',oi.variant_name,'unit_price',oi.unit_price,'quantity',oi.quantity,
            'subtotal',oi.subtotal,'promotion_id',oi.promotion_id,'promotion_title',oi.promotion_title
          ) order by oi.created_at,oi.id)
          from public.order_items oi where oi.order_id=o.id
        ),'[]'::jsonb),
        'locals',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',ol.id,'local_id',ol.local_id,'status',ol.status,'subtotal',ol.subtotal,
            'delivery_fee',ol.delivery_fee,'delivery_distance_km',ol.delivery_distance_km,
            'confirmed_at',ol.confirmed_at,'preparing_at',ol.preparing_at,'ready_at',ol.ready_at,
            'cancelled_at',ol.cancelled_at,
            'pickup_status',coalesce((
              select sp.status
              from public.order_driver_assignments a2
              join private.driver_order_stop_progress sp
                on sp.order_id=a2.order_id and sp.driver_user_id=a2.driver_user_id and sp.local_id=ol.local_id
              where a2.order_id=o.id and a2.delivery_id=o.delivery_id
                and a2.status='ACTIVE' and a2.unassigned_at is null
              order by a2.assigned_at desc limit 1
            ),'PENDING'),
            'arrived_at',(
              select sp.arrived_at
              from public.order_driver_assignments a2
              join private.driver_order_stop_progress sp
                on sp.order_id=a2.order_id and sp.driver_user_id=a2.driver_user_id and sp.local_id=ol.local_id
              where a2.order_id=o.id and a2.delivery_id=o.delivery_id
                and a2.status='ACTIVE' and a2.unassigned_at is null
              order by a2.assigned_at desc limit 1
            ),
            'picked_up_at',(
              select sp.picked_up_at
              from public.order_driver_assignments a2
              join private.driver_order_stop_progress sp
                on sp.order_id=a2.order_id and sp.driver_user_id=a2.driver_user_id and sp.local_id=ol.local_id
              where a2.order_id=o.id and a2.delivery_id=o.delivery_id
                and a2.status='ACTIVE' and a2.unassigned_at is null
              order by a2.assigned_at desc limit 1
            ),
            'local',jsonb_build_object(
              'id',l.id,'name',l.name,'address',l.address,'latitude',l.latitude,'longitude',l.longitude,
              'phone',l.phone,'whatsapp',l.whatsapp
            )
          ) order by l.name,ol.id)
          from public.order_locals ol
          join public.locals l on l.id=ol.local_id
          where ol.order_id=o.id
        ),'[]'::jsonb),
        'assignment',(
          select jsonb_build_object(
            'assignment_id',a.id,'driver_user_id',a.driver_user_id,'driver_name',p.full_name,
            'driver_phone',p.phone,'driver_mode',ud.driver_mode,'emergency_expires_at',ud.emergency_expires_at,
            'assigned_at',a.assigned_at,
            'location',case when dl.captured_at is null then null else jsonb_build_object(
              'latitude',dl.latitude,'longitude',dl.longitude,'accuracy_m',dl.accuracy_m,
              'heading_deg',dl.heading_deg,'speed_mps',dl.speed_mps,'captured_at',dl.captured_at
            ) end
          )
          from public.order_driver_assignments a
          join public.profiles p on p.id=a.driver_user_id
          left join public.user_deliveries ud
            on ud.user_id=a.driver_user_id and ud.delivery_id=a.delivery_id and ud.active=true
          left join public.driver_live_locations dl
            on dl.delivery_id=a.delivery_id and dl.driver_user_id=a.driver_user_id
          where a.order_id=o.id and a.delivery_id=o.delivery_id
            and a.status='ACTIVE' and a.unassigned_at is null
          order by a.assigned_at desc limit 1
        ),
        'history',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',h.id,'local_id',h.local_id,'old_status',h.old_status,'new_status',h.new_status,
            'actor_role',h.actor_role,'note',h.note,'created_at',h.created_at
          ) order by h.created_at desc,h.id desc)
          from (
            select * from public.order_status_history h0
            where h0.order_id=o.id
            order by h0.created_at desc,h0.id desc limit 50
          ) h
        ),'[]'::jsonb)
      ) as row_data
    from public.orders o
    where o.delivery_id=p_delivery_id
    order by o.created_at desc,o.id desc
    limit v_limit
  ) q;

  return jsonb_build_object('delivery_id',p_delivery_id,'generated_at',now(),'orders',v_result);
end;
$function$;

revoke all on function public.delivery_order_control_snapshot(uuid,integer) from public,anon;
grant execute on function public.delivery_order_control_snapshot(uuid,integer) to authenticated,service_role;