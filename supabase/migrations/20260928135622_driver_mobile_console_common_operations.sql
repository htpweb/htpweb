create table if not exists private.driver_order_stop_progress(
  order_id uuid not null references public.orders(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_user_id uuid not null references public.profiles(id) on delete cascade,
  local_id uuid not null references public.locals(id) on delete cascade,
  status text not null default 'PENDING',
  arrived_at timestamptz,
  picked_up_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(order_id,driver_user_id,local_id),
  constraint driver_order_stop_progress_status_check check(status in ('PENDING','ARRIVED','PICKED_UP'))
);

alter table private.driver_order_stop_progress enable row level security;
revoke all on table private.driver_order_stop_progress from public,anon,authenticated;

create or replace function private.quick_driver_proof_json(p_order_id uuid,p_driver_user_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  v_order_status text;
  v_proof private.order_delivery_proofs%rowtype;
begin
  select o.status into v_order_status from public.orders o where o.id=p_order_id;
  select p.* into v_proof
  from private.order_delivery_proofs p
  where p.order_id=p_order_id and p.driver_user_id=p_driver_user_id;

  if v_proof.order_id is null then
    return jsonb_build_object('enabled',false,'status',v_order_status,'ready',true);
  end if;

  return jsonb_build_object(
    'enabled',true,'status',v_order_status,
    'require_pin',v_proof.require_pin,'pin_verified',v_proof.pin_verified_at is not null,'pin_attempts',v_proof.pin_attempts,
    'require_photo',v_proof.require_photo,'photo_uploaded',v_proof.photo_uploaded_at is not null,
    'require_signature',v_proof.require_signature,'signature_uploaded',v_proof.signature_uploaded_at is not null,
    'ready',
      (not v_proof.require_pin or v_proof.pin_verified_at is not null)
      and (not v_proof.require_photo or v_proof.photo_uploaded_at is not null)
      and (not v_proof.require_signature or v_proof.signature_uploaded_at is not null),
    'completed_at',v_proof.completed_at,'cancelled_at',v_proof.cancelled_at
  );
end;
$function$;

revoke all on function private.quick_driver_proof_json(uuid,uuid) from public,anon,authenticated;

create or replace function public.quick_driver_tracking_context(p_token_hash text)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  v_token record;
  v_orders jsonb;
  v_gps boolean:=false;
begin
  select t.delivery_id,t.driver_user_id,t.expires_at,p.full_name,p.phone,d.name as delivery_name,
         ud.driver_mode,ud.emergency_expires_at
  into v_token
  from private.quick_driver_tracking_tokens t
  join public.profiles p on p.id=t.driver_user_id and p.active=true
  join public.deliveries d on d.id=t.delivery_id and d.active=true
  join public.user_deliveries ud
    on ud.user_id=t.driver_user_id and ud.delivery_id=t.delivery_id and ud.active=true
  where t.token_hash=p_token_hash and t.active=true and t.expires_at>now()
    and (
      ud.driver_mode<>'EMERGENCY'
      or ud.emergency_expires_at>now()
      or exists(
        select 1 from public.order_driver_assignments ax
        join public.orders ox on ox.id=ax.order_id
        where ax.delivery_id=ud.delivery_id and ax.driver_user_id=ud.user_id
          and ax.status='ACTIVE' and ax.unassigned_at is null
          and ox.status in ('READY','EN_ROUTE')
      )
    )
  limit 1;

  if not found then
    raise exception 'HTPWEB: enlace de seguimiento inválido, vencido o acceso finalizado';
  end if;

  v_gps:=public.delivery_service_is_active(v_token.delivery_id)
         and public.delivery_has_capability(v_token.delivery_id,'gps.live');

  select coalesce(jsonb_agg(order_json order by assigned_at,order_id),'[]'::jsonb)
  into v_orders
  from (
    select a.assigned_at,o.id as order_id,
      jsonb_build_object(
        'order_id',o.id,'status',o.status,
        'customer_name',o.customer_name,'customer_phone',o.customer_phone,
        'delivery_address',o.delivery_address,'address_reference',o.address_reference,
        'latitude',o.latitude,'longitude',o.longitude,
        'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'total',o.total,'notes',o.notes,
        'requires_invoice',coalesce(o.requires_invoice,false),
        'document_type',o.document_type,'document_number',o.document_number,'invoice_email',o.invoice_email,
        'assigned_at',a.assigned_at,'en_route_at',o.en_route_at,'delivered_at',o.delivered_at,
        'all_pickups_complete',not exists(
          select 1 from public.order_locals olx
          where olx.order_id=o.id and olx.status<>'CANCELLED'
            and not exists(
              select 1 from private.driver_order_stop_progress spx
              where spx.order_id=o.id and spx.driver_user_id=v_token.driver_user_id
                and spx.local_id=olx.local_id and spx.status='PICKED_UP'
            )
        ),
        'locals',coalesce((
          select jsonb_agg(jsonb_build_object(
            'order_local_id',ol.id,'local_id',ol.local_id,'status',ol.status,
            'subtotal',ol.subtotal,'delivery_fee',ol.delivery_fee,'delivery_distance_km',ol.delivery_distance_km,
            'name',l.name,'address',l.address,'phone',l.phone,'whatsapp',l.whatsapp,
            'latitude',l.latitude,'longitude',l.longitude,
            'pickup_status',coalesce(sp.status,'PENDING'),'arrived_at',sp.arrived_at,'picked_up_at',sp.picked_up_at,
            'items',coalesce((
              select jsonb_agg(jsonb_build_object(
                'id',oi.id,'product_name',oi.product_name,'variant_name',oi.variant_name,
                'quantity',oi.quantity,'unit_price',oi.unit_price,'subtotal',oi.subtotal,
                'promotion_title',oi.promotion_title
              ) order by oi.created_at,oi.id)
              from public.order_items oi
              where oi.order_id=o.id and oi.local_id=ol.local_id
            ),'[]'::jsonb)
          ) order by l.name,ol.id)
          from public.order_locals ol
          join public.locals l on l.id=ol.local_id
          left join private.driver_order_stop_progress sp
            on sp.order_id=o.id and sp.driver_user_id=v_token.driver_user_id and sp.local_id=ol.local_id
          where ol.order_id=o.id
        ),'[]'::jsonb),
        'proof',private.quick_driver_proof_json(o.id,v_token.driver_user_id)
      ) as order_json
    from public.order_driver_assignments a
    join public.orders o on o.id=a.order_id
    where a.delivery_id=v_token.delivery_id and a.driver_user_id=v_token.driver_user_id
      and a.status='ACTIVE' and a.unassigned_at is null and o.status in ('READY','EN_ROUTE')
  ) q;

  return jsonb_build_object(
    'delivery_id',v_token.delivery_id,'delivery_name',v_token.delivery_name,
    'driver_user_id',v_token.driver_user_id,'driver_name',v_token.full_name,'phone',v_token.phone,
    'driver_mode',v_token.driver_mode,'emergency_expires_at',v_token.emergency_expires_at,
    'emergency_grace',(v_token.driver_mode='EMERGENCY' and v_token.emergency_expires_at<=now() and jsonb_array_length(v_orders)>0),
    'gps_live',v_gps,'can_share',v_gps and jsonb_array_length(v_orders)>0,
    'routes_optimize',public.delivery_has_capability(v_token.delivery_id,'routes.optimize'),
    'orders',v_orders,'tracking_token_expires_at',v_token.expires_at
  );
end;
$function$;

revoke all on function public.quick_driver_tracking_context(text) from public,anon,authenticated;
grant execute on function public.quick_driver_tracking_context(text) to service_role;

create or replace function public.quick_driver_stop_action(
  p_token_hash text,p_order_id uuid,p_local_id uuid,p_action text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token record;
  v_action text:=upper(trim(coalesce(p_action,'')));
  v_local_status text;
  v_current text;
begin
  if v_action not in ('ARRIVED','PICKED_UP') then raise exception 'HTPWEB: acción de recogida inválida'; end if;

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

  if not exists(
    select 1 from public.orders o
    join public.order_driver_assignments a
      on a.order_id=o.id and a.delivery_id=o.delivery_id and a.driver_user_id=v_token.driver_user_id
      and a.status='ACTIVE' and a.unassigned_at is null
    where o.id=p_order_id and o.delivery_id=v_token.delivery_id and o.status='READY'
  ) then raise exception 'HTPWEB: la recogida solo puede actualizarse mientras el pedido está READY'; end if;

  select ol.status into v_local_status
  from public.order_locals ol where ol.order_id=p_order_id and ol.local_id=p_local_id;
  if v_local_status is null then raise exception 'HTPWEB: LOCAL no pertenece a este pedido'; end if;
  if v_local_status='CANCELLED' then raise exception 'HTPWEB: esta recogida fue cancelada'; end if;

  select sp.status into v_current
  from private.driver_order_stop_progress sp
  where sp.order_id=p_order_id and sp.driver_user_id=v_token.driver_user_id and sp.local_id=p_local_id
  for update;

  if v_action='ARRIVED' then
    insert into private.driver_order_stop_progress(
      order_id,delivery_id,driver_user_id,local_id,status,arrived_at,updated_at
    )
    values(p_order_id,v_token.delivery_id,v_token.driver_user_id,p_local_id,'ARRIVED',now(),now())
    on conflict(order_id,driver_user_id,local_id)
    do update set
      status=case when private.driver_order_stop_progress.status='PICKED_UP'
        then private.driver_order_stop_progress.status else 'ARRIVED' end,
      arrived_at=coalesce(private.driver_order_stop_progress.arrived_at,now()),
      updated_at=now();
  else
    if v_local_status<>'READY' then raise exception 'HTPWEB: el LOCAL todavía no marcó este pedido como READY'; end if;
    if coalesce(v_current,'PENDING')='PENDING' then raise exception 'HTPWEB: primero marca que llegaste al LOCAL'; end if;

    update private.driver_order_stop_progress
    set status='PICKED_UP',picked_up_at=coalesce(picked_up_at,now()),updated_at=now()
    where order_id=p_order_id and driver_user_id=v_token.driver_user_id and local_id=p_local_id;
  end if;

  perform realtime.send(
    jsonb_build_object('order_id',p_order_id,'local_id',p_local_id,'action',v_action,
      'driver_user_id',v_token.driver_user_id,'at',now()),
    'pickup_progress','order-tracking:'||p_order_id::text,true
  );

  return public.quick_driver_tracking_context(p_token_hash);
end;
$function$;

revoke all on function public.quick_driver_stop_action(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.quick_driver_stop_action(text,uuid,uuid,text) to service_role;

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
    case when v_new_status='EN_ROUTE' then 'Inicio de entrega desde consola móvil HTPWEB'
      else 'Entrega completada desde consola móvil HTPWEB' end,
    now()
  );

  return public.quick_driver_tracking_context(p_token_hash);
end;
$function$;

revoke all on function public.quick_driver_set_order_status(text,uuid,text) from public,anon,authenticated;
grant execute on function public.quick_driver_set_order_status(text,uuid,text) to service_role;

create or replace function public.quick_driver_verify_delivery_pin(
  p_token_hash text,p_order_id uuid,p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token record;
  v_proof private.order_delivery_proofs%rowtype;
  v_input text:=trim(coalesce(p_pin,''));
  v_verified boolean:=false;
begin
  if v_input !~ '^[0-9]{6}$' then raise exception 'HTPWEB: el PIN debe tener 6 dígitos'; end if;

  select t.delivery_id,t.driver_user_id into v_token
  from private.quick_driver_tracking_tokens t
  join public.user_deliveries ud on ud.user_id=t.driver_user_id and ud.delivery_id=t.delivery_id and ud.active=true
  where t.token_hash=p_token_hash and t.active=true and t.expires_at>now()
  limit 1;
  if not found then raise exception 'HTPWEB: acceso de repartidor inválido o vencido'; end if;

  select p.* into v_proof
  from private.order_delivery_proofs p
  join public.orders o on o.id=p.order_id and o.status='EN_ROUTE'
  join public.order_driver_assignments a
    on a.order_id=o.id and a.delivery_id=o.delivery_id and a.driver_user_id=v_token.driver_user_id
    and a.status='ACTIVE' and a.unassigned_at is null
  where p.order_id=p_order_id and p.driver_user_id=v_token.driver_user_id
  for update of p;

  if v_proof.order_id is null then raise exception 'HTPWEB: prueba de entrega no disponible'; end if;
  if not v_proof.require_pin then raise exception 'HTPWEB: este pedido no requiere PIN'; end if;

  if v_proof.pin_verified_at is not null then
    return jsonb_build_object('verified',true,'proof',private.quick_driver_proof_json(p_order_id,v_token.driver_user_id));
  end if;

  if v_proof.pin_last_attempt_at is not null and v_proof.pin_last_attempt_at>now()-interval '2 seconds' then
    raise exception 'HTPWEB: espera unos segundos antes de intentar otro PIN';
  end if;

  v_verified:=v_proof.pin_code=v_input;

  update private.order_delivery_proofs
  set pin_attempts=pin_attempts+1,pin_last_attempt_at=now(),
      pin_verified_at=case when v_verified then now() else pin_verified_at end,
      updated_at=now()
  where order_id=p_order_id;

  return jsonb_build_object(
    'verified',v_verified,
    'proof',private.quick_driver_proof_json(p_order_id,v_token.driver_user_id)
  );
end;
$function$;

revoke all on function public.quick_driver_verify_delivery_pin(text,uuid,text) from public,anon,authenticated;
grant execute on function public.quick_driver_verify_delivery_pin(text,uuid,text) to service_role;

create or replace function public.quick_driver_proof_upload_context(
  p_token_hash text,p_order_id uuid,p_kind text
)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  v_token record;
  v_kind text:=upper(trim(coalesce(p_kind,'')));
  v_proof private.order_delivery_proofs%rowtype;
begin
  if v_kind not in ('PHOTO','SIGNATURE') then raise exception 'HTPWEB: tipo de evidencia inválido'; end if;

  select t.delivery_id,t.driver_user_id into v_token
  from private.quick_driver_tracking_tokens t
  join public.user_deliveries ud on ud.user_id=t.driver_user_id and ud.delivery_id=t.delivery_id and ud.active=true
  where t.token_hash=p_token_hash and t.active=true and t.expires_at>now()
  limit 1;
  if not found then raise exception 'HTPWEB: acceso de repartidor inválido o vencido'; end if;

  select p.* into v_proof
  from private.order_delivery_proofs p
  join public.orders o on o.id=p.order_id and o.status='EN_ROUTE'
  join public.order_driver_assignments a
    on a.order_id=o.id and a.delivery_id=o.delivery_id and a.driver_user_id=v_token.driver_user_id
    and a.status='ACTIVE' and a.unassigned_at is null
  where p.order_id=p_order_id and p.driver_user_id=v_token.driver_user_id;

  if v_proof.order_id is null then raise exception 'HTPWEB: prueba de entrega no disponible'; end if;
  if v_kind='PHOTO' and not v_proof.require_photo then raise exception 'HTPWEB: este pedido no requiere foto'; end if;
  if v_kind='SIGNATURE' and not v_proof.require_signature then raise exception 'HTPWEB: este pedido no requiere firma'; end if;

  return jsonb_build_object(
    'bucket','delivery-proofs','delivery_id',v_proof.delivery_id,'driver_user_id',v_token.driver_user_id,
    'order_id',v_proof.order_id,'kind',lower(v_kind),
    'existing_path',case when v_kind='PHOTO' then v_proof.photo_path else v_proof.signature_path end
  );
end;
$function$;

revoke all on function public.quick_driver_proof_upload_context(text,uuid,text) from public,anon,authenticated;
grant execute on function public.quick_driver_proof_upload_context(text,uuid,text) to service_role;

create or replace function public.quick_driver_register_proof_media(
  p_token_hash text,p_order_id uuid,p_kind text,p_path text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_context jsonb;
  v_kind text:=upper(trim(coalesce(p_kind,'')));
  v_driver_user_id uuid;
  v_delivery_id uuid;
  v_prefix text;
begin
  v_context:=public.quick_driver_proof_upload_context(p_token_hash,p_order_id,v_kind);
  v_driver_user_id:=(v_context->>'driver_user_id')::uuid;
  v_delivery_id:=(v_context->>'delivery_id')::uuid;
  v_prefix:=v_delivery_id::text||'/'||p_order_id::text||'/'||lower(v_kind)||'/';

  if p_path is null or p_path not like v_prefix||'%' then raise exception 'HTPWEB: ruta de evidencia inválida'; end if;

  if v_kind='PHOTO' then
    update private.order_delivery_proofs
    set photo_path=p_path,photo_uploaded_at=now(),updated_at=now()
    where order_id=p_order_id and driver_user_id=v_driver_user_id;
  else
    update private.order_delivery_proofs
    set signature_path=p_path,signature_uploaded_at=now(),updated_at=now()
    where order_id=p_order_id and driver_user_id=v_driver_user_id;
  end if;

  return private.quick_driver_proof_json(p_order_id,v_driver_user_id);
end;
$function$;

revoke all on function public.quick_driver_register_proof_media(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.quick_driver_register_proof_media(text,uuid,text,text) to service_role;