create table if not exists public.driver_live_locations(
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_user_id uuid not null references public.profiles(id) on delete cascade,
  latitude numeric(9,6) not null check(latitude between -90 and 90),
  longitude numeric(9,6) not null check(longitude between -180 and 180),
  accuracy_m numeric(10,2) check(accuracy_m is null or accuracy_m>=0),
  heading_deg numeric(6,2) check(heading_deg is null or (heading_deg>=0 and heading_deg<=360)),
  speed_mps numeric(8,2) check(speed_mps is null or speed_mps>=0),
  captured_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(delivery_id,driver_user_id)
);

create table if not exists public.driver_location_history(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_user_id uuid not null references public.profiles(id) on delete cascade,
  latitude numeric(9,6) not null check(latitude between -90 and 90),
  longitude numeric(9,6) not null check(longitude between -180 and 180),
  accuracy_m numeric(10,2) check(accuracy_m is null or accuracy_m>=0),
  heading_deg numeric(6,2) check(heading_deg is null or (heading_deg>=0 and heading_deg<=360)),
  speed_mps numeric(8,2) check(speed_mps is null or speed_mps>=0),
  captured_at timestamptz not null,
  received_at timestamptz not null default now()
);

create index if not exists driver_location_history_delivery_driver_time_idx
  on public.driver_location_history(delivery_id,driver_user_id,captured_at desc);

create index if not exists driver_location_history_delivery_time_idx
  on public.driver_location_history(delivery_id,captured_at);

alter table public.driver_live_locations enable row level security;
alter table public.driver_location_history enable row level security;
revoke all on table public.driver_live_locations from anon,authenticated;
revoke all on table public.driver_location_history from anon,authenticated;

create or replace function private.can_receive_order_tracking_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_order_id uuid;
  v_delivery_id uuid;
  v_customer_id uuid;
  v_status text;
  v_role text;
begin
  if auth.uid() is null
     or p_topic is null
     or p_topic !~* '^order-tracking:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  v_order_id:=split_part(p_topic,':',2)::uuid;

  select o.delivery_id,o.customer_id,o.status
  into v_delivery_id,v_customer_id,v_status
  from public.orders o
  where o.id=v_order_id;

  if not found then return false; end if;

  if v_status='EN_ROUTE'
     and public.current_customer_id()=v_customer_id
     and public.delivery_has_capability(v_delivery_id,'gps.live')
     and public.delivery_has_capability(v_delivery_id,'tracking.customer')
  then
    return true;
  end if;

  v_role:=public.current_role_code();

  if v_role in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
     and public.user_has_delivery(v_delivery_id)
     and public.has_permission('orders.view')
     and public.delivery_has_capability(v_delivery_id,'gps.live')
  then
    return true;
  end if;

  if v_role='DELIVERY_DRIVER'
     and public.delivery_has_capability(v_delivery_id,'gps.live')
     and exists(
       select 1
       from public.order_driver_assignments a
       where a.order_id=v_order_id
         and a.delivery_id=v_delivery_id
         and a.driver_user_id=auth.uid()
         and a.status='ACTIVE'
         and a.unassigned_at is null
     )
  then
    return true;
  end if;

  return false;
exception
  when invalid_text_representation then return false;
end;
$$;

grant usage on schema private to authenticated;
revoke execute on function private.can_receive_order_tracking_topic(text) from public,anon;
grant execute on function private.can_receive_order_tracking_topic(text) to authenticated;

drop policy if exists htpweb_order_tracking_receive on realtime.messages;
create policy htpweb_order_tracking_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension='broadcast'
  and private.can_receive_order_tracking_topic((select realtime.topic()))
);

drop function if exists public.can_receive_order_tracking_topic(text);

create or replace function public.driver_gps_context(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_history_days integer;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER'
     or not public.user_has_delivery(p_delivery_id)
  then
    raise exception 'HTPWEB: acceso GPS no autorizado';
  end if;

  v_history_days:=public.delivery_limit_value(p_delivery_id,'gps_history.days');

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'gps_live',public.delivery_has_capability(p_delivery_id,'gps.live'),
    'tracking_customer',public.delivery_has_capability(p_delivery_id,'tracking.customer'),
    'history_days',coalesce(v_history_days,0),
    'has_en_route',exists(
      select 1
      from public.order_driver_assignments a
      join public.orders o on o.id=a.order_id
      where a.delivery_id=p_delivery_id
        and a.driver_user_id=auth.uid()
        and a.status='ACTIVE'
        and a.unassigned_at is null
        and o.status='EN_ROUTE'
    )
  );
end;
$$;

revoke execute on function public.driver_gps_context(uuid) from public,anon;
grant execute on function public.driver_gps_context(uuid) to authenticated;

create or replace function public.driver_update_location(
  p_delivery_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_m numeric default null,
  p_heading_deg numeric default null,
  p_speed_mps numeric default null,
  p_captured_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_captured_at timestamptz:=coalesce(p_captured_at,now());
  v_previous_captured_at timestamptz;
  v_previous_updated_at timestamptz;
  v_history_days integer;
  v_topics integer:=0;
  v_order record;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER'
     or not public.user_has_delivery(p_delivery_id)
  then
    raise exception 'HTPWEB: acceso GPS no autorizado';
  end if;

  if not public.delivery_has_capability(p_delivery_id,'gps.live') then
    raise exception 'HTPWEB: el plan no incluye GPS en vivo';
  end if;

  if p_latitude is null or p_latitude<-90 or p_latitude>90
     or p_longitude is null or p_longitude<-180 or p_longitude>180
  then
    raise exception 'HTPWEB: coordenadas GPS inválidas';
  end if;

  if p_accuracy_m is not null and p_accuracy_m<0 then
    raise exception 'HTPWEB: precisión GPS inválida';
  end if;

  if p_heading_deg is not null and (p_heading_deg<0 or p_heading_deg>360) then
    raise exception 'HTPWEB: rumbo GPS inválido';
  end if;

  if p_speed_mps is not null and p_speed_mps<0 then
    raise exception 'HTPWEB: velocidad GPS inválida';
  end if;

  if v_captured_at<now()-interval '10 minutes'
     or v_captured_at>now()+interval '2 minutes'
  then
    raise exception 'HTPWEB: hora de captura GPS fuera de rango';
  end if;

  if not exists(
    select 1
    from public.order_driver_assignments a
    join public.orders o on o.id=a.order_id
    where a.delivery_id=p_delivery_id
      and a.driver_user_id=auth.uid()
      and a.status='ACTIVE'
      and a.unassigned_at is null
      and o.status='EN_ROUTE'
  ) then
    raise exception 'HTPWEB: comparte ubicación solo mientras tengas una entrega EN_ROUTE';
  end if;

  select l.captured_at,l.updated_at
  into v_previous_captured_at,v_previous_updated_at
  from public.driver_live_locations l
  where l.delivery_id=p_delivery_id
    and l.driver_user_id=auth.uid()
  for update;

  if found and v_captured_at<=v_previous_captured_at then
    return jsonb_build_object('status','STALE','captured_at',v_previous_captured_at);
  end if;

  if v_previous_updated_at is not null
     and v_previous_updated_at>now()-interval '5 seconds'
  then
    return jsonb_build_object('status','THROTTLED','retry_after_ms',5000);
  end if;

  insert into public.driver_live_locations(
    delivery_id,driver_user_id,latitude,longitude,
    accuracy_m,heading_deg,speed_mps,captured_at,updated_at
  )
  values(
    p_delivery_id,auth.uid(),p_latitude,p_longitude,
    p_accuracy_m,p_heading_deg,p_speed_mps,v_captured_at,now()
  )
  on conflict(delivery_id,driver_user_id)
  do update set
    latitude=excluded.latitude,
    longitude=excluded.longitude,
    accuracy_m=excluded.accuracy_m,
    heading_deg=excluded.heading_deg,
    speed_mps=excluded.speed_mps,
    captured_at=excluded.captured_at,
    updated_at=now();

  v_history_days:=public.delivery_limit_value(p_delivery_id,'gps_history.days');

  if coalesce(v_history_days,0)>0 then
    insert into public.driver_location_history(
      delivery_id,driver_user_id,latitude,longitude,
      accuracy_m,heading_deg,speed_mps,captured_at,received_at
    )
    values(
      p_delivery_id,auth.uid(),p_latitude,p_longitude,
      p_accuracy_m,p_heading_deg,p_speed_mps,v_captured_at,now()
    );
  end if;

  for v_order in
    select o.id
    from public.order_driver_assignments a
    join public.orders o on o.id=a.order_id
    where a.delivery_id=p_delivery_id
      and a.driver_user_id=auth.uid()
      and a.status='ACTIVE'
      and a.unassigned_at is null
      and o.status='EN_ROUTE'
  loop
    perform realtime.send(
      jsonb_build_object(
        'latitude',p_latitude,
        'longitude',p_longitude,
        'accuracy_m',p_accuracy_m,
        'heading_deg',p_heading_deg,
        'speed_mps',p_speed_mps,
        'captured_at',v_captured_at
      ),
      'location',
      'order-tracking:'||v_order.id::text,
      true
    );
    v_topics:=v_topics+1;
  end loop;

  return jsonb_build_object(
    'status','UPDATED',
    'captured_at',v_captured_at,
    'broadcast_topics',v_topics,
    'history_days',coalesce(v_history_days,0)
  );
end;
$$;

revoke execute on function public.driver_update_location(uuid,numeric,numeric,numeric,numeric,numeric,timestamptz)
  from public,anon;
grant execute on function public.driver_update_location(uuid,numeric,numeric,numeric,numeric,numeric,timestamptz)
  to authenticated;

create or replace function public.customer_order_tracking_snapshot(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_customer_id uuid:=public.current_customer_id();
  v_order record;
  v_location record;
begin
  if v_customer_id is null then
    raise exception 'HTPWEB: perfil CLIENT requerido';
  end if;

  select o.id,o.delivery_id,o.status
  into v_order
  from public.orders o
  where o.id=p_order_id
    and o.customer_id=v_customer_id;

  if v_order.id is null then
    raise exception 'HTPWEB: pedido no disponible para esta cuenta';
  end if;

  if not public.delivery_has_capability(v_order.delivery_id,'gps.live')
     or not public.delivery_has_capability(v_order.delivery_id,'tracking.customer')
  then
    return jsonb_build_object('enabled',false,'reason','PLAN_DISABLED','status',v_order.status);
  end if;

  if v_order.status<>'EN_ROUTE' then
    return jsonb_build_object('enabled',false,'reason','ORDER_NOT_EN_ROUTE','status',v_order.status);
  end if;

  select l.latitude,l.longitude,l.accuracy_m,l.heading_deg,l.speed_mps,l.captured_at
  into v_location
  from public.order_driver_assignments a
  join public.driver_live_locations l
    on l.delivery_id=a.delivery_id
   and l.driver_user_id=a.driver_user_id
  where a.order_id=v_order.id
    and a.status='ACTIVE'
    and a.unassigned_at is null
  order by a.assigned_at desc
  limit 1;

  return jsonb_build_object(
    'enabled',true,
    'reason',null,
    'status',v_order.status,
    'topic','order-tracking:'||v_order.id::text,
    'location',case when v_location.captured_at is null then null else jsonb_build_object(
      'latitude',v_location.latitude,
      'longitude',v_location.longitude,
      'accuracy_m',v_location.accuracy_m,
      'heading_deg',v_location.heading_deg,
      'speed_mps',v_location.speed_mps,
      'captured_at',v_location.captured_at
    ) end
  );
end;
$$;

revoke execute on function public.customer_order_tracking_snapshot(uuid) from public,anon;
grant execute on function public.customer_order_tracking_snapshot(uuid) to authenticated;

create or replace function public.delivery_driver_gps_snapshot(
  p_delivery_id uuid,
  p_driver_user_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_history_days integer;
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),500));
  v_current jsonb;
  v_history jsonb:='[]'::jsonb;
begin
  if public.current_role_code() not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.view')
  then
    raise exception 'HTPWEB: no autorizado para consultar GPS';
  end if;

  if not exists(
    select 1
    from public.user_deliveries ud
    join public.profiles p on p.id=ud.user_id and p.active=true
    join public.roles r on r.id=p.role_id and r.active=true
    where ud.delivery_id=p_delivery_id
      and ud.user_id=p_driver_user_id
      and ud.active=true
      and r.code='DELIVERY_DRIVER'
  ) then
    raise exception 'HTPWEB: repartidor inexistente o inactivo para este DELIVERY';
  end if;

  if not public.delivery_has_capability(p_delivery_id,'gps.live') then
    return jsonb_build_object(
      'enabled',false,
      'history_days',0,
      'current',null,
      'history','[]'::jsonb
    );
  end if;

  v_history_days:=public.delivery_limit_value(p_delivery_id,'gps_history.days');

  select jsonb_build_object(
    'latitude',l.latitude,
    'longitude',l.longitude,
    'accuracy_m',l.accuracy_m,
    'heading_deg',l.heading_deg,
    'speed_mps',l.speed_mps,
    'captured_at',l.captured_at
  )
  into v_current
  from public.driver_live_locations l
  where l.delivery_id=p_delivery_id
    and l.driver_user_id=p_driver_user_id;

  if coalesce(v_history_days,0)>0 then
    select coalesce(jsonb_agg(x.item order by x.captured_at),'[]'::jsonb)
    into v_history
    from (
      select h.captured_at,
        jsonb_build_object(
          'latitude',h.latitude,
          'longitude',h.longitude,
          'accuracy_m',h.accuracy_m,
          'heading_deg',h.heading_deg,
          'speed_mps',h.speed_mps,
          'captured_at',h.captured_at
        ) item
      from public.driver_location_history h
      where h.delivery_id=p_delivery_id
        and h.driver_user_id=p_driver_user_id
        and h.captured_at>=now()-make_interval(days=>v_history_days)
      order by h.captured_at desc
      limit v_limit
    ) x;
  end if;

  return jsonb_build_object(
    'enabled',true,
    'history_days',coalesce(v_history_days,0),
    'current',v_current,
    'history',coalesce(v_history,'[]'::jsonb)
  );
end;
$$;

revoke execute on function public.delivery_driver_gps_snapshot(uuid,uuid,integer) from public,anon;
grant execute on function public.delivery_driver_gps_snapshot(uuid,uuid,integer) to authenticated;

create or replace function public.tracking_order_terminal()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_driver_user_id uuid;
begin
  if old.status='EN_ROUTE' and new.status in ('DELIVERED','CANCELLED') then
    select a.driver_user_id
    into v_driver_user_id
    from public.order_driver_assignments a
    where a.order_id=new.id
      and a.delivery_id=new.delivery_id
    order by a.assigned_at desc
    limit 1;

    perform realtime.send(
      jsonb_build_object('status',new.status,'ended_at',now()),
      'tracking_ended',
      'order-tracking:'||new.id::text,
      true
    );

    if v_driver_user_id is not null
       and not exists(
         select 1
         from public.order_driver_assignments a
         join public.orders o on o.id=a.order_id
         where a.delivery_id=new.delivery_id
           and a.driver_user_id=v_driver_user_id
           and a.order_id<>new.id
           and a.status='ACTIVE'
           and a.unassigned_at is null
           and o.status='EN_ROUTE'
       )
    then
      delete from public.driver_live_locations
      where delivery_id=new.delivery_id
        and driver_user_id=v_driver_user_id;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.tracking_order_terminal() from public,anon,authenticated;

drop trigger if exists trg_orders_tracking_terminal on public.orders;
create trigger trg_orders_tracking_terminal
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.tracking_order_terminal();

create or replace function public.prune_driver_location_history()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_delivery record;
  v_days integer;
  v_deleted integer;
  v_total integer:=0;
begin
  for v_delivery in
    select distinct h.delivery_id
    from public.driver_location_history h
  loop
    if not public.delivery_service_is_active(v_delivery.delivery_id) then
      delete from public.driver_location_history where delivery_id=v_delivery.delivery_id;
    else
      v_days:=public.delivery_limit_value(v_delivery.delivery_id,'gps_history.days');

      if coalesce(v_days,0)<=0 then
        delete from public.driver_location_history where delivery_id=v_delivery.delivery_id;
      else
        delete from public.driver_location_history
        where delivery_id=v_delivery.delivery_id
          and captured_at<now()-make_interval(days=>v_days);
      end if;
    end if;

    get diagnostics v_deleted=row_count;
    v_total:=v_total+v_deleted;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.prune_driver_location_history() from public,anon,authenticated;

do $$
begin
  if exists(select 1 from cron.job where jobname='htpweb-prune-driver-location-history') then
    perform cron.unschedule('htpweb-prune-driver-location-history');
  end if;

  perform cron.schedule(
    'htpweb-prune-driver-location-history',
    '17 3 * * *',
    'select public.prune_driver_location_history();'
  );
end;
$$;
