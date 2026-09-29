create or replace function public.local_order_response_context(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_req record;
  v_items jsonb;
begin
  if length(coalesce(p_token,'')) < 40 then
    return jsonb_build_object('valid',false);
  end if;

  select
    r.id,r.delivery_id,r.order_id,r.local_id,r.status,
    r.requested_at,r.expires_at,r.responded_at,r.preparation_minutes,
    d.name as delivery_name,l.name as local_name,
    o.notes,ol.status as local_status,ol.ready_at,ol.estimated_ready_at
  into v_req
  from private.order_local_response_tokens r
  join public.orders o on o.id=r.order_id and o.delivery_id=r.delivery_id
  join public.order_locals ol on ol.order_id=r.order_id and ol.local_id=r.local_id
  join public.deliveries d on d.id=r.delivery_id
  join public.locals l on l.id=r.local_id
  where r.token_hash=private.hash_local_response_token(p_token)
  limit 1;

  if not found then
    return jsonb_build_object('valid',false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_name',oi.product_name,
    'variant_name',oi.variant_name,
    'quantity',oi.quantity,
    'promotion_title',oi.promotion_title
  ) order by oi.created_at,oi.id),'[]'::jsonb)
  into v_items
  from public.order_items oi
  where oi.order_id=v_req.order_id
    and oi.local_id=v_req.local_id;

  return jsonb_build_object(
    'valid',true,
    'expired',v_req.expires_at<=now() and v_req.status='SENT',
    'status',case
      when v_req.expires_at<=now() and v_req.status='SENT' then 'EXPIRED'
      else v_req.status
    end,
    'local_status',v_req.local_status,
    'order_ref',upper(substr(replace(v_req.order_id::text,'-',''),1,8)),
    'delivery_name',v_req.delivery_name,
    'local_name',v_req.local_name,
    'requested_at',v_req.requested_at,
    'expires_at',v_req.expires_at,
    'responded_at',v_req.responded_at,
    'preparation_minutes',v_req.preparation_minutes,
    'estimated_ready_at',v_req.estimated_ready_at,
    'ready_at',v_req.ready_at,
    'notes',v_req.notes,
    'items',v_items
  );
end;
$function$;

revoke all on function public.local_order_response_context(text) from public;
grant execute on function public.local_order_response_context(text)
to anon,authenticated,service_role;

create or replace function public.local_order_response_mark_ready(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_req private.order_local_response_tokens%rowtype;
  v_old_local_status text;
  v_old_order_status text;
  v_now timestamptz:=now();
begin
  select *
  into v_req
  from private.order_local_response_tokens r
  where r.token_hash=private.hash_local_response_token(p_token)
  limit 1
  for update;

  if not found then
    raise exception 'HTPWEB: enlace inválido';
  end if;

  if v_req.status<>'CONFIRMED' then
    raise exception 'HTPWEB: primero confirma el tiempo de preparación';
  end if;

  select o.status,ol.status
  into v_old_order_status,v_old_local_status
  from public.orders o
  join public.order_locals ol
    on ol.order_id=o.id and ol.local_id=v_req.local_id
  where o.id=v_req.order_id
    and o.delivery_id=v_req.delivery_id
  for update of o,ol;

  if not found or v_old_order_status in ('DELIVERED','CANCELLED')
     or v_old_local_status='CANCELLED'
  then
    raise exception 'HTPWEB: el pedido ya no admite cambios del LOCAL';
  end if;

  if v_old_local_status='READY' then
    return jsonb_build_object('ok',true,'already_ready',true,'ready_at',(
      select ol.ready_at
      from public.order_locals ol
      where ol.order_id=v_req.order_id and ol.local_id=v_req.local_id
    ));
  end if;

  if v_old_local_status not in ('CONFIRMED','PREPARING') then
    raise exception 'HTPWEB: el LOCAL todavía no está en preparación';
  end if;

  update public.order_locals
  set status='READY',
      ready_at=coalesce(ready_at,v_now),
      updated_at=v_now
  where order_id=v_req.order_id
    and local_id=v_req.local_id;

  insert into public.order_status_history(
    order_id,local_id,old_status,new_status,
    actor_user_id,actor_role,note,created_at
  )
  values(
    v_req.order_id,v_req.local_id,v_old_local_status,'READY',
    null,'LOCAL_WHATSAPP_LINK',
    'LOCAL informó que el pedido está listo',
    v_now
  );

  if v_old_order_status in ('CONFIRMED','PREPARING')
     and not exists(
       select 1
       from public.order_locals ol
       where ol.order_id=v_req.order_id
         and ol.status not in ('READY','CANCELLED')
     )
     and exists(
       select 1
       from public.order_locals ol
       where ol.order_id=v_req.order_id and ol.status='READY'
     )
  then
    update public.orders
    set status='READY',
        ready_at=coalesce(ready_at,v_now),
        preparing_at=coalesce(preparing_at,v_now),
        updated_at=v_now
    where id=v_req.order_id
      and status in ('CONFIRMED','PREPARING');

    if found then
      insert into public.order_status_history(
        order_id,local_id,old_status,new_status,
        actor_user_id,actor_role,note,created_at
      )
      values(
        v_req.order_id,null,v_old_order_status,'READY',
        null,'SYSTEM',
        'Todos los LOCAL informaron que el pedido está listo',
        v_now
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'already_ready',false,
    'ready_at',v_now
  );
end;
$function$;

revoke all on function public.local_order_response_mark_ready(text) from public;
grant execute on function public.local_order_response_mark_ready(text)
to anon,authenticated,service_role;
