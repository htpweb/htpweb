-- Centro de control: modo operativo y ubicación resumida de repartidores.

create or replace function public.delivery_drivers_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_regular_limit integer;
  v_emergency_limit integer;
  v_concurrent_limit integer;
  v_drivers jsonb;
  v_regular_used integer:=0;
  v_emergency_used integer:=0;
begin
  if not (
    public.is_master()
    or (
      public.current_role_code() in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
      and public.user_has_delivery(p_delivery_id)
      and public.has_permission('orders.view')
    )
  ) then
    raise exception 'HTPWEB: no autorizado para consultar repartidores';
  end if;

  perform public.delivery_cleanup_expired_emergency_drivers(p_delivery_id);

  v_regular_limit:=public.delivery_limit_value(p_delivery_id,'drivers.active.max');
  v_emergency_limit:=public.delivery_limit_value(p_delivery_id,'drivers.emergency.max');
  v_concurrent_limit:=public.delivery_limit_value(p_delivery_id,'orders.concurrent_per_driver.max');

  select
    count(*) filter (where ud.driver_mode='REGULAR')::integer,
    count(*) filter (where ud.driver_mode='EMERGENCY')::integer
  into v_regular_used,v_emergency_used
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.delivery_id=p_delivery_id
    and ud.active=true
    and r.code='DELIVERY_DRIVER';

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',p.id,
    'full_name',p.full_name,
    'phone',p.phone,
    'active',ud.active,
    'driver_mode',ud.driver_mode,
    'emergency_started_at',ud.emergency_started_at,
    'emergency_expires_at',ud.emergency_expires_at,
    'emergency_grace',(
      ud.driver_mode='EMERGENCY'
      and ud.emergency_expires_at is not null
      and ud.emergency_expires_at<=now()
      and exists(
        select 1
        from public.order_driver_assignments ax
        join public.orders ox on ox.id=ax.order_id
        where ax.driver_user_id=p.id
          and ax.delivery_id=p_delivery_id
          and ax.status='ACTIVE'
          and ax.unassigned_at is null
          and ox.status in ('PREPARING','READY','EN_ROUTE')
      )
    ),
    'active_orders',(
      select count(*)::integer
      from public.order_driver_assignments a
      join public.orders o on o.id=a.order_id
      where a.driver_user_id=p.id
        and a.delivery_id=p_delivery_id
        and a.status='ACTIVE'
        and a.unassigned_at is null
        and o.status in ('PREPARING','READY','EN_ROUTE')
    ),
    'location',case when ll.driver_user_id is null then null else jsonb_build_object(
      'latitude',ll.latitude,
      'longitude',ll.longitude,
      'accuracy_m',ll.accuracy_m,
      'captured_at',ll.captured_at,
      'zone_name',loc_zone.name,
      'zone_description',loc_zone.description
    ) end
  ) order by
    case when ud.driver_mode='REGULAR' then 0 else 1 end,
    lower(coalesce(p.full_name,'')),p.id),'[]'::jsonb)
  into v_drivers
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  left join public.driver_live_locations ll
    on ll.delivery_id=ud.delivery_id
   and ll.driver_user_id=ud.user_id
  left join lateral (
    select z.name,z.description
    from public.delivery_zones dz
    join public.zones z on z.id=dz.zone_id and z.active=true
    where dz.delivery_id=p_delivery_id
      and dz.active=true
      and ll.driver_user_id is not null
      and public.htp_zone_contains(z.boundary,ll.latitude,ll.longitude)
    order by z.name
    limit 1
  ) loc_zone on true
  where ud.delivery_id=p_delivery_id
    and ud.active=true
    and r.code='DELIVERY_DRIVER';

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'used',coalesce(v_regular_used,0),
    'limit',v_regular_limit,
    'regular_used',coalesce(v_regular_used,0),
    'regular_limit',v_regular_limit,
    'emergency_used',coalesce(v_emergency_used,0),
    'emergency_limit',v_emergency_limit,
    'total_active',coalesce(v_regular_used,0)+coalesce(v_emergency_used,0),
    'emergency_duration_hours',24,
    'concurrent_per_driver',v_concurrent_limit,
    'manual_dispatch',public.delivery_has_capability(p_delivery_id,'dispatch.manual'),
    'drivers',v_drivers
  );
end;
$function$;

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

  v_mode:=private.effective_dispatch_mode(new.delivery_id);
  if v_mode<>'AUTO' then
    return new;
  end if;

  select s.local_orders
  into v_local_orders
  from private.delivery_whatsapp_settings s
  where s.delivery_id=new.delivery_id;

  if coalesce(v_local_orders,true) is not true then
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

comment on function private.queue_local_orders_after_confirmation() is
  'Envía automáticamente a los LOCAL solo cuando el DELIVERY opera en modo Automático.';

create or replace function private.queue_whatsapp_driver_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_event text;
  v_url text;
  v_secret text;
  v_driver_dispatch boolean;
  v_operation_mode text;
begin
  select s.driver_dispatch
  into v_driver_dispatch
  from private.delivery_whatsapp_settings s
  where s.delivery_id=new.delivery_id;

  v_operation_mode:=private.effective_dispatch_mode(new.delivery_id);

  if coalesce(v_driver_dispatch,true) is not true
     or v_operation_mode='MANUAL'
  then
    return new;
  end if;

  if tg_op='INSERT' and new.status='ACTIVE' then
    v_event:='DRIVER_ASSIGNED';
  elsif tg_op='UPDATE'
        and old.status='ACTIVE'
        and new.status='UNASSIGNED'
  then
    v_event:='DRIVER_UNASSIGNED';
  else
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

  perform net.http_post(
    url := v_url || '/functions/v1/whatsapp-notify',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-htpweb-whatsapp-hook',v_secret
    ),
    body := jsonb_build_object(
      'kind',v_event,
      'assignment_id',new.id,
      'requested_at',now()
    ),
    timeout_milliseconds := 15000
  );

  return new;
exception
  when others then
    raise warning 'HTPWEB WhatsApp: no se pudo encolar evento de repartidor: %',sqlerrm;
    return new;
end;
$function$;

comment on function private.queue_whatsapp_driver_event() is
  'En Automático e Híbrido notifica asignaciones aprobadas; en Manual el operador controla los mensajes.';