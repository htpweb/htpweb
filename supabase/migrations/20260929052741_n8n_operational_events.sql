create or replace function public.delivery_enqueue_local_order_automation(
  p_delivery_id uuid,
  p_order_id uuid,
  p_local_id uuid,
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_req record;
  v_job uuid;
begin
  if not public.is_master()
     and not public.user_can_manage_delivery_resource(
       p_delivery_id,'orders.view','orders.manage'
     )
  then
    raise exception 'HTPWEB: no autorizado para automatizar solicitud al LOCAL';
  end if;

  select r.id,r.expires_at
  into v_req
  from private.order_local_response_tokens r
  where r.delivery_id=p_delivery_id
    and r.order_id=p_order_id
    and r.local_id=p_local_id
    and r.status='SENT'
    and r.expires_at>now()
    and r.token_hash=private.hash_local_response_token(p_token)
  order by r.requested_at desc
  limit 1;

  if not found then
    raise exception 'HTPWEB: solicitud del LOCAL inválida o vencida';
  end if;

  v_job:=private.enqueue_automation_job(
    'LOCAL_ORDER_REQUESTED',
    jsonb_build_object(
      'request_id',v_req.id,
      'response_token',p_token,
      'expires_at',v_req.expires_at
    ),
    p_delivery_id,p_order_id,p_local_id,null,now()
  );

  return v_job;
end;
$function$;

revoke all on function public.delivery_enqueue_local_order_automation(uuid,uuid,uuid,text)
from public,anon;
grant execute on function public.delivery_enqueue_local_order_automation(uuid,uuid,uuid,text)
to authenticated,service_role;

create or replace function private.enqueue_local_operational_events()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_delivery_id uuid;
begin
  select o.delivery_id into v_delivery_id
  from public.orders o
  where o.id=new.order_id;

  if v_delivery_id is null then
    return new;
  end if;

  if new.prep_response_at is not null
     and old.prep_response_at is distinct from new.prep_response_at
  then
    perform private.enqueue_automation_job(
      'LOCAL_ETA_CONFIRMED',
      jsonb_build_object(
        'prep_estimate_minutes',new.prep_estimate_minutes,
        'estimated_ready_at',new.estimated_ready_at,
        'local_status',new.status
      ),
      v_delivery_id,new.order_id,new.local_id,null,now()
    );
  end if;

  if new.status='READY'
     and old.status is distinct from new.status
  then
    perform private.enqueue_automation_job(
      'LOCAL_READY',
      jsonb_build_object(
        'ready_at',new.ready_at,
        'estimated_ready_at',new.estimated_ready_at
      ),
      v_delivery_id,new.order_id,new.local_id,null,now()
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.enqueue_local_operational_events()
from public,anon,authenticated;

drop trigger if exists trg_order_locals_enqueue_n8n_events on public.order_locals;
create trigger trg_order_locals_enqueue_n8n_events
after update of prep_response_at,status on public.order_locals
for each row
execute function private.enqueue_local_operational_events();

create or replace function private.enqueue_driver_plan_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='PLANNED'
     and (
       tg_op='INSERT'
       or old.status is distinct from new.status
       or old.driver_user_id is distinct from new.driver_user_id
       or old.planned_for is distinct from new.planned_for
     )
  then
    perform private.enqueue_automation_job(
      'DRIVER_PLANNED',
      jsonb_build_object(
        'plan_id',new.id,
        'planned_for',new.planned_for,
        'ideal_departure_at',new.ideal_departure_at,
        'source',new.source
      ),
      new.delivery_id,new.order_id,null,new.driver_user_id,now()
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.enqueue_driver_plan_event()
from public,anon,authenticated;

drop trigger if exists trg_order_driver_plans_enqueue_n8n on private.order_driver_plans;
create trigger trg_order_driver_plans_enqueue_n8n
after insert or update of status,driver_user_id,planned_for
on private.order_driver_plans
for each row
execute function private.enqueue_driver_plan_event();

create or replace function private.enqueue_driver_assignment_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='ACTIVE'
     and (
       tg_op='INSERT'
       or old.status is distinct from new.status
       or old.driver_user_id is distinct from new.driver_user_id
     )
  then
    perform private.enqueue_automation_job(
      'DRIVER_ASSIGNED',
      jsonb_build_object(
        'assignment_id',new.id,
        'assigned_at',new.assigned_at,
        'source',new.source,
        'driver_mode',new.driver_mode
      ),
      new.delivery_id,new.order_id,null,new.driver_user_id,now()
    );
  elsif new.status='UNASSIGNED'
        and tg_op='UPDATE'
        and old.status is distinct from new.status
  then
    perform private.enqueue_automation_job(
      'DRIVER_UNASSIGNED',
      jsonb_build_object(
        'assignment_id',new.id,
        'unassigned_at',new.unassigned_at,
        'source',new.source
      ),
      new.delivery_id,new.order_id,null,new.driver_user_id,now()
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.enqueue_driver_assignment_event()
from public,anon,authenticated;

drop trigger if exists trg_order_driver_assignments_enqueue_n8n
on public.order_driver_assignments;
create trigger trg_order_driver_assignments_enqueue_n8n
after insert or update of status,driver_user_id
on public.order_driver_assignments
for each row
execute function private.enqueue_driver_assignment_event();

create or replace function public.automation_local_order_context(
  p_order_id uuid,
  p_local_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
begin
  if not private.automation_bridge_authorized('N8N') then
    raise exception 'HTPWEB: automation bridge unauthorized';
  end if;

  select jsonb_build_object(
    'order_id',o.id,
    'order_ref',upper(substr(replace(o.id::text,'-',''),1,8)),
    'delivery_id',o.delivery_id,
    'delivery_name',d.name,
    'local_id',l.id,
    'local_name',l.name,
    'local_whatsapp',l.whatsapp,
    'notes',o.notes,
    'subtotal',ol.subtotal,
    'status',ol.status,
    'prep_estimate_minutes',ol.prep_estimate_minutes,
    'estimated_ready_at',ol.estimated_ready_at,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name',oi.product_name,
        'variant_name',oi.variant_name,
        'quantity',oi.quantity,
        'subtotal',oi.subtotal,
        'promotion_title',oi.promotion_title
      ) order by oi.created_at,oi.id)
      from public.order_items oi
      where oi.order_id=o.id and oi.local_id=l.id
    ),'[]'::jsonb)
  )
  into v_result
  from public.orders o
  join public.deliveries d on d.id=o.delivery_id
  join public.order_locals ol on ol.order_id=o.id and ol.local_id=p_local_id
  join public.locals l on l.id=ol.local_id
  where o.id=p_order_id;

  if v_result is null then
    raise exception 'HTPWEB: contexto del LOCAL no disponible';
  end if;

  return v_result;
end;
$function$;

revoke all on function public.automation_local_order_context(uuid,uuid) from public;
grant execute on function public.automation_local_order_context(uuid,uuid)
to anon,authenticated,service_role;

create or replace function public.automation_driver_context(
  p_order_id uuid,
  p_driver_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
begin
  if not private.automation_bridge_authorized('N8N') then
    raise exception 'HTPWEB: automation bridge unauthorized';
  end if;

  select jsonb_build_object(
    'order_id',o.id,
    'order_ref',upper(substr(replace(o.id::text,'-',''),1,8)),
    'delivery_id',o.delivery_id,
    'delivery_name',d.name,
    'driver_user_id',p.id,
    'driver_name',p.full_name,
    'driver_phone',p.phone,
    'customer_name',o.customer_name,
    'delivery_address',o.delivery_address,
    'address_reference',o.address_reference,
    'latitude',o.latitude,
    'longitude',o.longitude,
    'locals',coalesce((
      select jsonb_agg(jsonb_build_object(
        'local_id',l.id,
        'local_name',l.name,
        'address',l.address,
        'latitude',l.latitude,
        'longitude',l.longitude,
        'estimated_ready_at',ol.estimated_ready_at,
        'status',ol.status
      ) order by coalesce(ol.estimated_ready_at,ol.ready_at),l.name)
      from public.order_locals ol
      join public.locals l on l.id=ol.local_id
      where ol.order_id=o.id and ol.status<>'CANCELLED'
    ),'[]'::jsonb)
  )
  into v_result
  from public.orders o
  join public.deliveries d on d.id=o.delivery_id
  join public.profiles p on p.id=p_driver_user_id
  where o.id=p_order_id;

  if v_result is null then
    raise exception 'HTPWEB: contexto del repartidor no disponible';
  end if;

  return v_result;
end;
$function$;

revoke all on function public.automation_driver_context(uuid,uuid) from public;
grant execute on function public.automation_driver_context(uuid,uuid)
to anon,authenticated,service_role;
