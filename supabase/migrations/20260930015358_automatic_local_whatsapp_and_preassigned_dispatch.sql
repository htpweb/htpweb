-- HTPWEB: pedidos a LOCAL, preasignación y asignación automática.
-- Los nombres internos se conservan por compatibilidad; la interfaz se muestra en español.

create or replace function private.order_planned_ready_at(p_order_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path=''
as $function$
  select coalesce(
    max(coalesce(ol.estimated_ready_at,ol.ready_at,now()+interval '20 minutes'))
      filter (where ol.status<>'CANCELLED'),
    o.ready_at,
    now()+interval '20 minutes'
  )
  from public.orders o
  left join public.order_locals ol on ol.order_id=o.id
  where o.id=p_order_id
  group by o.ready_at;
$function$;

revoke all on function private.order_planned_ready_at(uuid)
from public,anon,authenticated;

create or replace function private.driver_is_free_now(
  p_delivery_id uuid,
  p_driver_user_id uuid,
  p_exclude_order_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select not exists(
    select 1
    from public.order_driver_assignments a
    join public.orders o on o.id=a.order_id
    where a.delivery_id=p_delivery_id
      and a.driver_user_id=p_driver_user_id
      and a.status='ACTIVE'
      and a.unassigned_at is null
      and (p_exclude_order_id is null or a.order_id<>p_exclude_order_id)
      and o.status not in ('DELIVERED','CANCELLED')
  );
$function$;

revoke all on function private.driver_is_free_now(uuid,uuid,uuid)
from public,anon,authenticated;

create or replace function private.driver_projected_available_at(
  p_delivery_id uuid,
  p_driver_user_id uuid,
  p_exclude_order_id uuid default null
)
returns timestamptz
language sql
stable
security definer
set search_path=''
as $function$
  select greatest(
    now(),
    coalesce(max(
      case
        when o.status='PREPARING' then coalesce(
          private.order_planned_ready_at(o.id)+interval '35 minutes',
          now()+interval '45 minutes'
        )
        when o.status='EN_ROUTE' then coalesce(
          r.updated_at + make_interval(mins=>greatest(
            5,
            least(120,round(coalesce((r.route->>'duration_minutes')::numeric,30))::integer)
          )),
          o.en_route_at + interval '30 minutes',
          now()+interval '30 minutes'
        )
        when o.status='READY' then coalesce(
          o.ready_at + interval '35 minutes',
          now()+interval '25 minutes'
        )
        else now()
      end
    ),now())
  )
  from public.order_driver_assignments a
  join public.orders o on o.id=a.order_id
  left join lateral (
    select dor.route,dor.updated_at
    from private.driver_order_routes dor
    where dor.order_id=o.id
      and dor.driver_user_id=p_driver_user_id
      and dor.active=true
    order by dor.version desc
    limit 1
  ) r on true
  where a.delivery_id=p_delivery_id
    and a.driver_user_id=p_driver_user_id
    and a.status='ACTIVE'
    and a.unassigned_at is null
    and (p_exclude_order_id is null or a.order_id<>p_exclude_order_id)
    and o.status in ('PREPARING','READY','EN_ROUTE');
$function$;

revoke all on function private.driver_projected_available_at(uuid,uuid,uuid)
from public,anon,authenticated;

create or replace function private.auto_plan_driver_after_local_eta()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_delivery_id uuid;
  v_suggestion jsonb;
  v_driver uuid;
  v_ready_at timestamptz;
  v_departure timestamptz;
begin
  if new.prep_response_at is null
     or old.prep_response_at is not distinct from new.prep_response_at
  then
    return new;
  end if;

  select o.delivery_id into v_delivery_id
  from public.orders o
  where o.id=new.order_id
    and o.status in ('CONFIRMED','PREPARING');
  if v_delivery_id is null
     or private.effective_dispatch_mode(v_delivery_id)<>'AUTO'
  then
    return new;
  end if;

  if exists(
    select 1
    from private.order_driver_plans pp
    where pp.order_id=new.order_id
      and pp.status='ACTIVATED'
  ) then
    return new;
  end if;

  v_suggestion:=private.driver_plan_suggestion_json(v_delivery_id,new.order_id);
  v_driver:=nullif(v_suggestion->>'driver_user_id','')::uuid;
  if v_driver is null then
    return new;
  end if;

  v_ready_at:=private.order_planned_ready_at(new.order_id);
  v_departure:=coalesce(
    nullif(v_suggestion->>'ideal_departure_at','')::timestamptz,
    v_ready_at-interval '10 minutes'
  );

  insert into private.order_driver_plans(
    order_id,delivery_id,driver_user_id,status,planned_for,
    ideal_departure_at,planned_by,source,note,activation_error,
    created_at,updated_at,activated_at,cancelled_at
  )
  values(
    new.order_id,v_delivery_id,v_driver,'PLANNED',v_ready_at,
    v_departure,null,'AUTO',
    'Preasignación automática según tiempo del LOCAL',
    null,now(),now(),null,null
  )
  on conflict(order_id) do update
  set driver_user_id=excluded.driver_user_id,
      status='PLANNED',
      planned_for=excluded.planned_for,
      ideal_departure_at=excluded.ideal_departure_at,
      planned_by=null,
      source='AUTO',
      note=excluded.note,
      activation_error=null,
      updated_at=now(),
      activated_at=null,
      cancelled_at=null
  where private.order_driver_plans.status='PLANNED';

  return new;
end;
$function$;

revoke all on function private.auto_plan_driver_after_local_eta()
from public,anon,authenticated;

drop trigger if exists trg_order_local_auto_plan_driver on public.order_locals;
create trigger trg_order_local_auto_plan_driver
after update of prep_response_at on public.order_locals
for each row
execute function private.auto_plan_driver_after_local_eta();

create or replace function private.activate_planned_order_driver(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_plan private.order_driver_plans%rowtype;
  v_order_status text;
  v_assignment uuid;
  v_existing uuid;
begin
  select pp.*
  into v_plan
  from private.order_driver_plans pp
  where pp.order_id=p_order_id
    and pp.status='PLANNED'
  limit 1
  for update;
  if not found then
    return null;
  end if;

  select o.status
  into v_order_status
  from public.orders o
  where o.id=p_order_id
  for update;
  if not found then
    return null;
  end if;

  select a.id into v_existing
  from public.order_driver_assignments a
  where a.order_id=p_order_id
    and a.status='ACTIVE'
    and a.unassigned_at is null
  limit 1;

  if v_existing is not null then
    update private.order_driver_plans
    set status='ACTIVATED',
        activated_at=coalesce(activated_at,now()),
        activation_error=null,
        updated_at=now()
    where id=v_plan.id;
    return v_existing;
  end if;

  if v_order_status not in ('PREPARING','READY') then
    return null;
  end if;

  if v_order_status='PREPARING'
     and coalesce(v_plan.ideal_departure_at,v_plan.planned_for)>now()
  then
    return null;
  end if;

  if not private.driver_is_free_now(
    v_plan.delivery_id,v_plan.driver_user_id,v_plan.order_id
  ) then
    update private.order_driver_plans
    set activation_error='Repartidor todavía ocupado; HTPWEB volverá a intentar.',
        updated_at=now()
    where id=v_plan.id;
    return null;
  end if;

  if not exists(
    select 1
    from public.user_deliveries ud
    join public.profiles p on p.id=ud.user_id and p.active=true
    join public.roles r on r.id=p.role_id and r.active=true
    where ud.delivery_id=v_plan.delivery_id
      and ud.user_id=v_plan.driver_user_id
      and ud.active=true
      and r.code='DELIVERY_DRIVER'
      and (
        ud.driver_mode<>'EMERGENCY'
        or ud.emergency_expires_at is null
        or ud.emergency_expires_at>now()
      )
  ) then
    update private.order_driver_plans
    set activation_error='Repartidor inactivo o no disponible.',
        updated_at=now()
    where id=v_plan.id;
    return null;
  end if;

  if private.effective_driver_concurrent_limit(v_plan.delivery_id)<=0 then
    update private.order_driver_plans
    set activation_error='El plan no permite asignaciones activas.',
        updated_at=now()
    where id=v_plan.id;
    return null;
  end if;

  begin
    if v_order_status='READY' then
      v_assignment:=private.assign_order_driver_internal(
        v_plan.delivery_id,
        v_plan.order_id,
        v_plan.driver_user_id,
        v_plan.planned_by,
        'PLAN_'||v_plan.source
      );
    else
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          v_plan.delivery_id::text||':'||v_plan.driver_user_id::text,0
        )
      );

      if not private.driver_is_free_now(
        v_plan.delivery_id,v_plan.driver_user_id,v_plan.order_id
      ) then
        return null;
      end if;
      insert into public.order_driver_assignments(
        order_id,delivery_id,driver_user_id,status,
        assigned_by,assigned_at,note
      )
      values(
        v_plan.order_id,
        v_plan.delivery_id,
        v_plan.driver_user_id,
        'ACTIVE',
        v_plan.planned_by,
        now(),
        'Asignación activada cerca de la hora calculada de salida'
      )
      returning id into v_assignment;
    end if;

    update private.order_driver_plans
    set status='ACTIVATED',
        activated_at=now(),
        activation_error=null,
        updated_at=now()
    where id=v_plan.id;

    return v_assignment;
  exception
    when others then
      update private.order_driver_plans
      set activation_error=left(sqlerrm,500),
          updated_at=now()
      where id=v_plan.id;
      return null;
  end;
end;
$function$;

revoke all on function private.activate_planned_order_driver(uuid)
from public,anon,authenticated;

create or replace function private.activate_due_planned_drivers(
  p_delivery_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row record;
  v_count integer:=0;
begin
  for v_row in
    select pp.order_id
    from private.order_driver_plans pp
    join public.orders o on o.id=pp.order_id
    where pp.status='PLANNED'
      and (p_delivery_id is null or pp.delivery_id=p_delivery_id)
      and o.status in ('PREPARING','READY')
      and (
        o.status='READY'
        or coalesce(pp.ideal_departure_at,pp.planned_for)<=now()
      )
    order by coalesce(pp.ideal_departure_at,pp.planned_for),pp.created_at
  loop
    if private.activate_planned_order_driver(v_row.order_id) is not null then
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end;
$function$;

revoke all on function private.activate_due_planned_drivers(uuid)
from public,anon,authenticated;

do $block$
begin
  if exists(select 1 from cron.job where jobname='htpweb-asignar-preasignados') then
    perform cron.unschedule('htpweb-asignar-preasignados');
  end if;
  perform cron.schedule(
    'htpweb-asignar-preasignados',
    '* * * * *',
    $cron$select private.activate_due_planned_drivers();$cron$
  );
end
$block$;

create or replace function private.activate_waiting_plan_after_delivery()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='DELIVERED' and old.status is distinct from new.status then
    perform private.activate_due_planned_drivers(new.delivery_id);
  end if;
  return new;
end;
$function$;

revoke all on function private.activate_waiting_plan_after_delivery()
from public,anon,authenticated;

drop trigger if exists trg_orders_activate_waiting_plan on public.orders;
create trigger trg_orders_activate_waiting_plan
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function private.activate_waiting_plan_after_delivery();

create or replace function private.queue_local_orders_after_confirmation()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_mode text;
  v_local_orders boolean;
  v_url text;
  v_secret text;
  v_local record;
begin
  if new.status<>'CONFIRMED'
     or old.status is not distinct from new.status
  then
    return new;
  end if;

  select s.mode,s.local_orders
  into v_mode,v_local_orders
  from private.delivery_whatsapp_settings s
  where s.delivery_id=new.delivery_id;

  if coalesce(v_mode,'ASSISTED')<>'AUTOMATIC'
     or coalesce(v_local_orders,true) is not true
  then
    return new;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name='whatsapp_dispatch_project_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='whatsapp_dispatch_hook_secret';

  if nullif(v_url,'') is null or nullif(v_secret,'') is null then
    return new;
  end if;

  for v_local in
    select ol.local_id
    from public.order_locals ol
    join public.locals l on l.id=ol.local_id
    where ol.order_id=new.id
      and ol.status<>'CANCELLED'
      and ol.prep_requested_at is null
      and nullif(regexp_replace(coalesce(l.whatsapp,''),'\D','','g'),'') is not null
  loop
    perform net.http_post(
      url := v_url || '/functions/v1/whatsapp-notify',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-htpweb-whatsapp-hook',v_secret
      ),
      body := jsonb_build_object(
        'kind','LOCAL_ORDER_AUTO',
        'delivery_id',new.delivery_id,
        'order_id',new.id,
        'local_id',v_local.local_id,
        'requested_at',now()
      ),
      timeout_milliseconds := 15000
    );
  end loop;

  return new;
exception
  when others then
    raise warning 'HTPWEB WhatsApp LOCAL: no se pudo encolar pedido: %',sqlerrm;
    return new;
end;
$function$;

revoke all on function private.queue_local_orders_after_confirmation()
from public,anon,authenticated;

drop trigger if exists trg_orders_whatsapp_local_after_confirm on public.orders;
create trigger trg_orders_whatsapp_local_after_confirm
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function private.queue_local_orders_after_confirmation();

comment on function private.activate_due_planned_drivers(uuid) is
  'Convierte preasignaciones vencidas en asignaciones reales solo cuando el repartidor está libre.';

comment on function private.queue_local_orders_after_confirmation() is
  'Envía automáticamente cada subpedido al WhatsApp del LOCAL cuando el operador confirma el pedido.';

create or replace function public.driver_set_local_pickup_status(
  p_order_id uuid,
  p_local_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_delivery_id uuid;
  v_local_status text;
  v_current text;
  v_action text:=upper(trim(coalesce(p_action,'')));
  v_now timestamptz:=now();
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  if v_action not in ('ARRIVED','PICKED_UP') then
    raise exception 'HTPWEB: acción de recogida inválida';
  end if;

  select o.delivery_id,ol.status
  into v_delivery_id,v_local_status
  from public.orders o
  join public.order_locals ol
    on ol.order_id=o.id and ol.local_id=p_local_id
  join public.order_driver_assignments a
    on a.order_id=o.id
   and a.delivery_id=o.delivery_id
   and a.driver_user_id=auth.uid()
   and a.status='ACTIVE'
   and a.unassigned_at is null
  join public.user_deliveries ud
    on ud.user_id=auth.uid()
   and ud.delivery_id=o.delivery_id
   and ud.active=true
  where o.id=p_order_id
    and o.status in ('PREPARING','READY')
  for update of ol;

  if not found then
    raise exception 'HTPWEB: pedido o recogida no disponible para este repartidor';
  end if;
  if v_local_status='CANCELLED' then
    raise exception 'HTPWEB: esta recogida fue cancelada';
  end if;

  select sp.status into v_current
  from private.driver_order_stop_progress sp
  where sp.order_id=p_order_id
    and sp.driver_user_id=auth.uid()
    and sp.local_id=p_local_id
  for update;

  if v_action='ARRIVED' then
    insert into private.driver_order_stop_progress(
      order_id,delivery_id,driver_user_id,local_id,status,arrived_at,updated_at
    )
    values(
      p_order_id,v_delivery_id,auth.uid(),p_local_id,'ARRIVED',v_now,v_now
    )
    on conflict(order_id,driver_user_id,local_id)
    do update set
      status=case
        when private.driver_order_stop_progress.status='PICKED_UP'
          then 'PICKED_UP'
        else 'ARRIVED'
      end,
      arrived_at=coalesce(private.driver_order_stop_progress.arrived_at,v_now),
      updated_at=v_now;
  else
    if coalesce(v_current,'PENDING')='PENDING' then
      raise exception 'HTPWEB: primero marca que llegaste al LOCAL';
    end if;
    update private.driver_order_stop_progress
    set status='PICKED_UP',
        picked_up_at=coalesce(picked_up_at,v_now),
        updated_at=v_now
    where order_id=p_order_id
      and driver_user_id=auth.uid()
      and local_id=p_local_id;

    if v_local_status<>'READY' then
      update public.order_locals
      set status='READY',
          confirmed_at=coalesce(confirmed_at,v_now),
          preparing_at=coalesce(preparing_at,v_now),
          ready_at=coalesce(ready_at,v_now),
          prep_response_at=coalesce(prep_response_at,v_now),
          updated_at=v_now
      where order_id=p_order_id
        and local_id=p_local_id;

      insert into public.order_status_history(
        order_id,local_id,old_status,new_status,
        actor_user_id,actor_role,note,created_at
      )
      values(
        p_order_id,p_local_id,v_local_status,'READY',
        auth.uid(),'DELIVERY_DRIVER',
        'Repartidor confirmó que recibió el pedido del LOCAL',
        v_now
      );
    end if;
    if not exists(
      select 1
      from public.order_locals ol
      where ol.order_id=p_order_id
        and ol.status not in ('READY','CANCELLED')
    ) then
      update public.orders
      set status='READY',
          ready_at=coalesce(ready_at,v_now),
          preparing_at=coalesce(preparing_at,v_now),
          updated_at=v_now
      where id=p_order_id
        and status in ('CONFIRMED','PREPARING');

      if found then
        insert into public.order_status_history(
          order_id,local_id,old_status,new_status,
          actor_user_id,actor_role,note,created_at
        )
        values(
          p_order_id,null,'PREPARING','READY',
          auth.uid(),'DELIVERY_DRIVER',
          'Todas las recogidas fueron confirmadas por el repartidor',
          v_now
        );
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'order_id',p_order_id,
    'local_id',p_local_id,
    'pickup_status',v_action
  );
end;
$function$;

revoke all on function public.driver_set_local_pickup_status(uuid,uuid,text)
from public,anon;
grant execute on function public.driver_set_local_pickup_status(uuid,uuid,text)
to authenticated,service_role;

create or replace function public.driver_set_order_status(
  p_order_id uuid,
  p_new_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_old_status text;
  v_new_status text:=upper(trim(coalesce(p_new_status,'')));
  v_delivery_id uuid;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  if v_new_status not in ('EN_ROUTE','DELIVERED') then
    raise exception 'HTPWEB: el repartidor solo puede iniciar entrega o marcar entregado';
  end if;

  select o.status,o.delivery_id
  into v_old_status,v_delivery_id
  from public.orders o
  join public.order_driver_assignments a
    on a.order_id=o.id
   and a.driver_user_id=auth.uid()
   and a.delivery_id=o.delivery_id
   and a.status='ACTIVE'
   and a.unassigned_at is null
  join public.user_deliveries ud
    on ud.user_id=auth.uid()
   and ud.delivery_id=o.delivery_id
   and ud.active=true
  where o.id=p_order_id
    and public.delivery_service_is_active(o.delivery_id)
  for update of o;

  if not found then
    raise exception 'HTPWEB: pedido no asignado o no disponible para este repartidor';
  end if;

  if v_new_status='EN_ROUTE' then
    if v_old_status<>'READY' then
      raise exception 'HTPWEB: primero completa las recogidas';
    end if;

    if exists(
      select 1
      from public.order_locals ol
      where ol.order_id=p_order_id
        and ol.status<>'CANCELLED'
        and not exists(
          select 1
          from private.driver_order_stop_progress sp
          where sp.order_id=p_order_id
            and sp.driver_user_id=auth.uid()
            and sp.local_id=ol.local_id
            and sp.status='PICKED_UP'
        )
    ) then
      raise exception 'HTPWEB: confirma la recogida de todos los LOCAL antes de iniciar la entrega';
    end if;
  elsif v_old_status<>'EN_ROUTE' then
    raise exception 'HTPWEB: el pedido todavía no está en entrega';
  end if;

  update public.orders
  set status=v_new_status,
      en_route_at=case
        when v_new_status='EN_ROUTE' then coalesce(en_route_at,now())
        else en_route_at
      end,
      delivered_at=case
        when v_new_status='DELIVERED' then coalesce(delivered_at,now())
        else delivered_at
      end,
      updated_at=now()
  where id=p_order_id;

  insert into public.order_status_history(
    order_id,local_id,old_status,new_status,
    actor_user_id,actor_role,note,created_at
  )
  values(
    p_order_id,null,v_old_status,v_new_status,
    auth.uid(),'DELIVERY_DRIVER',
    nullif(trim(coalesce(p_note,'')),''),
    now()
  );
end;
$function$;

revoke all on function public.driver_set_order_status(uuid,text,text)
from public,anon;
grant execute on function public.driver_set_order_status(uuid,text,text)
to authenticated,service_role;

create or replace function public.driver_my_orders()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v jsonb;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_id',a.id,
    'delivery_id',a.delivery_id,
    'delivery_name',d.name,
    'order_id',o.id,
    'status',o.status,
    'assignment_status',a.status,
    'customer_name',o.customer_name,
    'customer_phone',o.customer_phone,
    'delivery_address',o.delivery_address,
    'latitude',o.latitude,
    'longitude',o.longitude,
    'address_reference',o.address_reference,
    'total',o.total,
    'assigned_at',a.assigned_at,
    'en_route_at',o.en_route_at,
    'delivered_at',o.delivered_at,
    'all_pickups_complete',not exists(
      select 1
      from public.order_locals olx
      where olx.order_id=o.id
        and olx.status<>'CANCELLED'
        and not exists(
          select 1
          from private.driver_order_stop_progress spx
          where spx.order_id=o.id
            and spx.driver_user_id=auth.uid()
            and spx.local_id=olx.local_id
            and spx.status='PICKED_UP'
        )
    ),
    'locals',coalesce((
      select jsonb_agg(jsonb_build_object(
        'local_id',ol.local_id,
        'name',l.name,
        'address',l.address,
        'phone',l.phone,
        'whatsapp',l.whatsapp,
        'latitude',l.latitude,
        'longitude',l.longitude,
        'status',ol.status,
        'estimated_ready_at',ol.estimated_ready_at,
        'prep_estimate_minutes',ol.prep_estimate_minutes,
        'pickup_status',coalesce(sp.status,'PENDING'),
        'arrived_at',sp.arrived_at,
        'picked_up_at',sp.picked_up_at,
        'items',coalesce((
          select jsonb_agg(jsonb_build_object(
            'product_name',oi.product_name,
            'variant_name',oi.variant_name,
            'quantity',oi.quantity,
            'promotion_title',oi.promotion_title
          ) order by oi.created_at,oi.id)
          from public.order_items oi
          where oi.order_id=o.id
            and oi.local_id=ol.local_id
        ),'[]'::jsonb)
      ) order by coalesce(ol.estimated_ready_at,ol.ready_at),l.name)
      from public.order_locals ol
      join public.locals l on l.id=ol.local_id
      left join private.driver_order_stop_progress sp
        on sp.order_id=o.id
       and sp.driver_user_id=auth.uid()
       and sp.local_id=ol.local_id
      where ol.order_id=o.id
        and ol.status<>'CANCELLED'
    ),'[]'::jsonb),
    'sos_enabled',
      o.status='EN_ROUTE'
      and public.delivery_has_capability(a.delivery_id,'safety.sos'),
    'sos',case when si.id is null then null else jsonb_build_object(
      'incident_id',si.id,
      'status',si.status,
      'created_at',si.created_at,
      'acknowledged_at',si.acknowledged_at,
      'resolved_at',si.resolved_at
    ) end,
    'proof',case when p.order_id is null then null else jsonb_build_object(
      'enabled',true,
      'require_pin',p.require_pin,
      'pin_verified',p.pin_verified_at is not null,
      'pin_attempts',p.pin_attempts,
      'require_photo',p.require_photo,
      'photo_uploaded',p.photo_uploaded_at is not null,
      'require_signature',p.require_signature,
      'signature_uploaded',p.signature_uploaded_at is not null,
      'ready',
        (not p.require_pin or p.pin_verified_at is not null)
        and (not p.require_photo or p.photo_uploaded_at is not null)
        and (not p.require_signature or p.signature_uploaded_at is not null),
      'completed_at',p.completed_at
    ) end
  ) order by
    case when a.status='ACTIVE' then 0 else 1 end,
    a.assigned_at desc),'[]'::jsonb)
  into v
  from public.order_driver_assignments a
  join public.orders o on o.id=a.order_id
  join public.deliveries d on d.id=a.delivery_id and d.active=true
  join public.user_deliveries ud
    on ud.user_id=auth.uid()
   and ud.delivery_id=a.delivery_id
   and ud.active=true
  left join private.order_delivery_proofs p
    on p.order_id=o.id
   and p.driver_user_id=auth.uid()
  left join lateral (
    select i.id,i.status,i.created_at,i.acknowledged_at,i.resolved_at
    from private.driver_sos_incidents i
    where i.delivery_id=a.delivery_id
      and i.driver_user_id=auth.uid()
      and i.status in ('OPEN','ACKNOWLEDGED')
    order by i.created_at desc
    limit 1
  ) si on true
  where a.driver_user_id=auth.uid()
    and (
      a.status='ACTIVE'
      or (
        a.status='COMPLETED'
        and a.unassigned_at>=now()-interval '7 days'
      )
    );

  return v;
end;
$function$;

revoke all on function public.driver_my_orders()
from public,anon;
grant execute on function public.driver_my_orders()
to authenticated,service_role;