create or replace function public.quick_driver_set_order_status(
  p_token_hash text,p_order_id uuid,p_new_status text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token record;
  v_old_status text;
  v_new_status text:=upper(trim(coalesce(p_new_status,'')));
  v_context jsonb;
begin
  if v_new_status not in ('EN_ROUTE','DELIVERED') then raise exception 'HTPWEB: estado de repartidor inválido'; end if;

  select t.delivery_id,t.driver_user_id into v_token
  from private.quick_driver_tracking_tokens t
  join public.user_deliveries ud on ud.user_id=t.driver_user_id and ud.delivery_id=t.delivery_id and ud.active=true
  where t.token_hash=p_token_hash and t.active=true and t.expires_at>now()
    and (
      ud.driver_mode<>'EMERGENCY' or ud.emergency_expires_at>now()
      or exists(
        select 1 from public.order_driver_assignments ax
        join public.orders ox on ox.id=ax.order_id
        where ax.delivery_id=ud.delivery_id and ax.driver_user_id=ud.user_id
          and ax.status='ACTIVE' and ax.unassigned_at is null and ox.status in ('READY','EN_ROUTE')
      )
    )
  limit 1;

  if not found then raise exception 'HTPWEB: acceso de repartidor inválido o vencido'; end if;

  select o.status into v_old_status
  from public.orders o
  join public.order_driver_assignments a
    on a.order_id=o.id and a.delivery_id=o.delivery_id and a.driver_user_id=v_token.driver_user_id
    and a.status='ACTIVE' and a.unassigned_at is null
  where o.id=p_order_id and o.delivery_id=v_token.delivery_id and public.delivery_service_is_active(o.delivery_id)
  for update of o;

  if v_old_status is null then raise exception 'HTPWEB: pedido no asignado o no disponible para este repartidor'; end if;
  if not ((v_old_status='READY' and v_new_status='EN_ROUTE') or (v_old_status='EN_ROUTE' and v_new_status='DELIVERED')) then
    raise exception 'HTPWEB: transición de repartidor inválida: % → %',v_old_status,v_new_status;
  end if;

  if v_new_status='EN_ROUTE' and exists(
    select 1 from public.order_locals ol
    where ol.order_id=p_order_id and ol.status<>'CANCELLED'
      and not exists(
        select 1 from private.driver_order_stop_progress sp
        where sp.order_id=p_order_id and sp.driver_user_id=v_token.driver_user_id
          and sp.local_id=ol.local_id and sp.status='PICKED_UP'
      )
  ) then
    raise exception 'HTPWEB: debes confirmar la recogida de todos los LOCAL antes de iniciar la entrega';
  end if;

  update public.orders
  set status=v_new_status,
      en_route_at=case when v_new_status='EN_ROUTE' then coalesce(en_route_at,now()) else en_route_at end,
      delivered_at=case when v_new_status='DELIVERED' then coalesce(delivered_at,now()) else delivered_at end,
      updated_at=now()
  where id=p_order_id;

  insert into public.order_status_history(
    order_id,local_id,old_status,new_status,actor_user_id,actor_role,note,created_at
  )
  values(
    p_order_id,null,v_old_status,v_new_status,v_token.driver_user_id,'DELIVERY_DRIVER',
    case when v_new_status='EN_ROUTE'
      then 'Inicio de entrega desde consola móvil HTPWEB'
      else 'Entrega completada desde consola móvil HTPWEB' end,
    now()
  );

  begin
    v_context:=public.quick_driver_tracking_context(p_token_hash);
  exception when others then
    v_context:=jsonb_build_object(
      'delivery_id',v_token.delivery_id,'driver_user_id',v_token.driver_user_id,
      'orders','[]'::jsonb,'access_closed',true,'closed_order_id',p_order_id
    );
  end;

  return v_context;
end;
$function$;

revoke all on function public.quick_driver_set_order_status(text,uuid,text) from public,anon,authenticated;
grant execute on function public.quick_driver_set_order_status(text,uuid,text) to service_role;