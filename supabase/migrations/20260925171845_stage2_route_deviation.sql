create table if not exists private.driver_route_deviation_plans(
  order_id uuid primary key references public.orders(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_user_id uuid not null references public.profiles(id) on delete restrict,
  route_points jsonb not null,
  route_distance_m numeric,
  route_duration_s numeric,
  threshold_m numeric not null default 300 check(threshold_m between 100 and 2000),
  consecutive_outside integer not null default 0 check(consecutive_outside>=0),
  consecutive_inside integer not null default 0 check(consecutive_inside>=0),
  first_outside_at timestamptz,
  last_distance_m numeric,
  last_checked_at timestamptz,
  active boolean not null default true,
  planned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(jsonb_typeof(route_points)='array')
);

create index if not exists driver_route_deviation_plans_driver_idx
  on private.driver_route_deviation_plans(delivery_id,driver_user_id,active);

alter table private.driver_route_deviation_plans enable row level security;
revoke all on table private.driver_route_deviation_plans from public,anon,authenticated;

drop policy if exists driver_route_deviation_plans_deny_all on private.driver_route_deviation_plans;
create policy driver_route_deviation_plans_deny_all
on private.driver_route_deviation_plans
for all
to public
using(false)
with check(false);

create table if not exists private.driver_route_deviation_incidents(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'OPEN' check(status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
  latitude numeric,
  longitude numeric,
  accuracy_m numeric,
  deviation_m numeric not null check(deviation_m>=0),
  max_deviation_m numeric not null check(max_deviation_m>=0),
  samples_outside integer not null default 0 check(samples_outside>=0),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_reason text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(latitude is null or latitude between -90 and 90),
  check(longitude is null or longitude between -180 and 180),
  check(accuracy_m is null or accuracy_m>=0)
);

create unique index if not exists driver_route_deviation_one_open_order_idx
  on private.driver_route_deviation_incidents(order_id)
  where status in ('OPEN','ACKNOWLEDGED');

create index if not exists driver_route_deviation_delivery_created_idx
  on private.driver_route_deviation_incidents(delivery_id,created_at desc);

create index if not exists driver_route_deviation_driver_created_idx
  on private.driver_route_deviation_incidents(driver_user_id,created_at desc);

alter table private.driver_route_deviation_incidents enable row level security;
revoke all on table private.driver_route_deviation_incidents from public,anon,authenticated;

drop policy if exists driver_route_deviation_incidents_deny_all on private.driver_route_deviation_incidents;
create policy driver_route_deviation_incidents_deny_all
on private.driver_route_deviation_incidents
for all
to public
using(false)
with check(false);

create or replace function private.route_deviation_user_has_delivery(p_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.user_deliveries ud
    join public.profiles p on p.id=ud.user_id and p.active=true
    join public.roles r on r.id=p.role_id and r.active=true
    join public.deliveries d on d.id=ud.delivery_id and d.active=true
    where ud.user_id=auth.uid()
      and ud.delivery_id=p_delivery_id
      and ud.active=true
      and r.code in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
  );
$$;

revoke execute on function private.route_deviation_user_has_delivery(uuid)
from public,anon,authenticated;

create or replace function private.route_point_segment_distance_m(
  p_lat numeric,p_lng numeric,
  p_a_lat numeric,p_a_lng numeric,
  p_b_lat numeric,p_b_lng numeric
)
returns numeric
language plpgsql
immutable
security definer
set search_path=''
as $$
declare
  r constant double precision:=6371000.0;
  lat0 double precision;
  x1 double precision;
  y1 double precision;
  x2 double precision;
  y2 double precision;
  dx double precision;
  dy double precision;
  denom double precision;
  t double precision;
  cx double precision;
  cy double precision;
begin
  lat0:=radians((p_lat::double precision+p_a_lat::double precision+p_b_lat::double precision)/3.0);
  x1:=radians(p_a_lng::double precision-p_lng::double precision)*r*cos(lat0);
  y1:=radians(p_a_lat::double precision-p_lat::double precision)*r;
  x2:=radians(p_b_lng::double precision-p_lng::double precision)*r*cos(lat0);
  y2:=radians(p_b_lat::double precision-p_lat::double precision)*r;
  dx:=x2-x1;
  dy:=y2-y1;
  denom:=dx*dx+dy*dy;

  if denom<=0.000001 then
    return sqrt(x1*x1+y1*y1);
  end if;

  t:=-(x1*dx+y1*dy)/denom;
  t:=greatest(0.0,least(1.0,t));
  cx:=x1+t*dx;
  cy:=y1+t*dy;
  return sqrt(cx*cx+cy*cy);
end;
$$;

revoke execute on function private.route_point_segment_distance_m(numeric,numeric,numeric,numeric,numeric,numeric)
from public,anon,authenticated;

create or replace function private.route_points_valid(p_points jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path=''
as $$
declare
  i integer;
  v jsonb;
  v_lng numeric;
  v_lat numeric;
begin
  if p_points is null
     or jsonb_typeof(p_points)<>'array'
     or jsonb_array_length(p_points)<2
     or jsonb_array_length(p_points)>2000
  then
    return false;
  end if;

  for i in 0..jsonb_array_length(p_points)-1 loop
    v:=p_points->i;
    if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<2 then
      return false;
    end if;
    begin
      v_lng:=(v->>0)::numeric;
      v_lat:=(v->>1)::numeric;
    exception when others then
      return false;
    end;
    if v_lng is null or v_lng<-180 or v_lng>180
       or v_lat is null or v_lat<-90 or v_lat>90
    then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke execute on function private.route_points_valid(jsonb)
from public,anon,authenticated;

create or replace function private.route_polyline_distance_m(
  p_points jsonb,p_lat numeric,p_lng numeric
)
returns numeric
language plpgsql
immutable
security definer
set search_path=''
as $$
declare
  i integer;
  a jsonb;
  b jsonb;
  d numeric;
  best numeric:=null;
begin
  if not private.route_points_valid(p_points) then
    return null;
  end if;

  for i in 0..jsonb_array_length(p_points)-2 loop
    a:=p_points->i;
    b:=p_points->(i+1);
    d:=private.route_point_segment_distance_m(
      p_lat,p_lng,
      (a->>1)::numeric,(a->>0)::numeric,
      (b->>1)::numeric,(b->>0)::numeric
    );
    if best is null or d<best then best:=d; end if;
  end loop;
  return best;
end;
$$;

revoke execute on function private.route_polyline_distance_m(jsonb,numeric,numeric)
from public,anon,authenticated;

create or replace function private.route_deviation_payload(p_incident_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'incident_id',i.id,
    'order_id',i.order_id,
    'delivery_id',i.delivery_id,
    'driver_user_id',i.driver_user_id,
    'status',i.status,
    'latitude',i.latitude,
    'longitude',i.longitude,
    'accuracy_m',i.accuracy_m,
    'deviation_m',i.deviation_m,
    'max_deviation_m',i.max_deviation_m,
    'samples_outside',i.samples_outside,
    'first_detected_at',i.first_detected_at,
    'last_detected_at',i.last_detected_at,
    'acknowledged_at',i.acknowledged_at,
    'resolved_at',i.resolved_at,
    'resolution_reason',i.resolution_reason,
    'created_at',i.created_at,
    'updated_at',i.updated_at
  )
  from private.driver_route_deviation_incidents i
  where i.id=p_incident_id;
$$;

revoke execute on function private.route_deviation_payload(uuid)
from public,anon,authenticated;

create or replace function private.broadcast_route_deviation_incident(p_incident_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v record;
  v_payload jsonb;
begin
  select i.delivery_id,i.driver_user_id
  into v
  from private.driver_route_deviation_incidents i
  where i.id=p_incident_id;

  if v.delivery_id is null then return; end if;
  v_payload:=private.route_deviation_payload(p_incident_id);

  perform realtime.send(
    v_payload,
    'route_deviation',
    'route-deviation:delivery:'||v.delivery_id::text,
    true
  );

  perform realtime.send(
    v_payload,
    'route_deviation',
    'route-deviation:driver:'||v.driver_user_id::text,
    true
  );
end;
$$;

revoke execute on function private.broadcast_route_deviation_incident(uuid)
from public,anon,authenticated;

create or replace function private.can_receive_route_deviation_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_delivery_id uuid;
  v_driver_id uuid;
begin
  if auth.uid() is null or p_topic is null then return false; end if;

  if p_topic ~* '^route-deviation:delivery:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_delivery_id:=split_part(p_topic,':',3)::uuid;
    return private.route_deviation_user_has_delivery(v_delivery_id)
      and public.has_permission('orders.view');
  end if;

  if p_topic ~* '^route-deviation:driver:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_driver_id:=split_part(p_topic,':',3)::uuid;
    return public.current_role_code()='DELIVERY_DRIVER'
      and auth.uid()=v_driver_id;
  end if;

  return false;
exception
  when invalid_text_representation then return false;
end;
$$;

revoke execute on function private.can_receive_route_deviation_topic(text)
from public,anon,authenticated;

create or replace function public.driver_route_deviation_plan_context(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v record;
  v_existing boolean;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  select a.delivery_id,o.id order_id,o.status,o.latitude,o.longitude
  into v
  from public.order_driver_assignments a
  join public.orders o on o.id=a.order_id and o.delivery_id=a.delivery_id
  where a.order_id=p_order_id
    and a.driver_user_id=auth.uid()
    and a.status='ACTIVE'
    and a.unassigned_at is null
    and o.status='EN_ROUTE'
  order by a.assigned_at desc
  limit 1;

  if v.order_id is null then
    raise exception 'HTPWEB: monitoreo de ruta disponible solo en una entrega EN_ROUTE asignada a tu cuenta';
  end if;

  if not public.delivery_has_capability(v.delivery_id,'gps.live') then
    return jsonb_build_object(
      'can_prepare',false,'reason','GPS_NOT_INCLUDED',
      'delivery_id',v.delivery_id,'order_id',v.order_id
    );
  end if;

  if not public.delivery_has_capability(v.delivery_id,'safety.route_deviation') then
    return jsonb_build_object(
      'can_prepare',false,'reason','ROUTE_DEVIATION_NOT_INCLUDED',
      'delivery_id',v.delivery_id,'order_id',v.order_id
    );
  end if;

  if v.latitude is null or v.longitude is null then
    return jsonb_build_object(
      'can_prepare',false,'reason','DESTINATION_COORDINATES_MISSING',
      'delivery_id',v.delivery_id,'order_id',v.order_id
    );
  end if;

  select exists(
    select 1 from private.driver_route_deviation_plans p
    where p.order_id=p_order_id
      and p.driver_user_id=auth.uid()
      and p.active=true
  ) into v_existing;

  return jsonb_build_object(
    'can_prepare',true,
    'delivery_id',v.delivery_id,
    'order_id',v.order_id,
    'destination_latitude',v.latitude,
    'destination_longitude',v.longitude,
    'threshold_m',300,
    'existing_plan',v_existing
  );
end;
$$;

revoke execute on function public.driver_route_deviation_plan_context(uuid)
from public,anon;
grant execute on function public.driver_route_deviation_plan_context(uuid)
to authenticated;

create or replace function public.driver_register_route_deviation_plan(
  p_order_id uuid,
  p_route_points jsonb,
  p_route_distance_m numeric default null,
  p_route_duration_s numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v record;
  v_last jsonb;
  v_destination_distance numeric;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  select a.delivery_id,o.id order_id,o.status,o.latitude,o.longitude
  into v
  from public.order_driver_assignments a
  join public.orders o on o.id=a.order_id and o.delivery_id=a.delivery_id
  where a.order_id=p_order_id
    and a.driver_user_id=auth.uid()
    and a.status='ACTIVE'
    and a.unassigned_at is null
    and o.status='EN_ROUTE'
  order by a.assigned_at desc
  limit 1
  for update of o;

  if v.order_id is null then
    raise exception 'HTPWEB: plan de desvío disponible solo durante una entrega EN_ROUTE';
  end if;

  if not public.delivery_has_capability(v.delivery_id,'gps.live')
     or not public.delivery_has_capability(v.delivery_id,'safety.route_deviation')
  then
    raise exception 'HTPWEB: el plan vigente no incluye monitoreo de desvío con GPS';
  end if;

  if not private.route_points_valid(p_route_points) then
    raise exception 'HTPWEB: geometría de ruta inválida';
  end if;

  v_last:=p_route_points->(jsonb_array_length(p_route_points)-1);
  v_destination_distance:=private.route_point_segment_distance_m(
    v.latitude,v.longitude,
    (v_last->>1)::numeric,(v_last->>0)::numeric,
    (v_last->>1)::numeric,(v_last->>0)::numeric
  );

  if v_destination_distance>500 then
    raise exception 'HTPWEB: la ruta preparada no termina cerca del destino del pedido';
  end if;

  insert into private.driver_route_deviation_plans(
    order_id,delivery_id,driver_user_id,route_points,
    route_distance_m,route_duration_s,threshold_m,
    consecutive_outside,consecutive_inside,first_outside_at,
    last_distance_m,last_checked_at,active,planned_at,updated_at
  )
  values(
    p_order_id,v.delivery_id,auth.uid(),p_route_points,
    p_route_distance_m,p_route_duration_s,300,
    0,0,null,null,null,true,now(),now()
  )
  on conflict(order_id) do update set
    delivery_id=excluded.delivery_id,
    driver_user_id=excluded.driver_user_id,
    route_points=excluded.route_points,
    route_distance_m=excluded.route_distance_m,
    route_duration_s=excluded.route_duration_s,
    threshold_m=300,
    consecutive_outside=0,
    consecutive_inside=0,
    first_outside_at=null,
    last_distance_m=null,
    last_checked_at=null,
    active=true,
    planned_at=now(),
    updated_at=now();

  return jsonb_build_object(
    'active',true,
    'order_id',p_order_id,
    'delivery_id',v.delivery_id,
    'threshold_m',300,
    'route_points',jsonb_array_length(p_route_points),
    'route_distance_m',p_route_distance_m,
    'route_duration_s',p_route_duration_s
  );
end;
$$;

revoke execute on function public.driver_register_route_deviation_plan(uuid,jsonb,numeric,numeric)
from public,anon;
grant execute on function public.driver_register_route_deviation_plan(uuid,jsonb,numeric,numeric)
to authenticated;

create or replace function private.evaluate_route_deviation_location(
  p_delivery_id uuid,
  p_driver_user_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_m numeric,
  p_captured_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_plan record;
  v_distance numeric;
  v_outside integer;
  v_inside integer;
  v_first timestamptz;
  v_incident_id uuid;
  v_open_status text;
  v_changes integer:=0;
begin
  if p_accuracy_m is not null and p_accuracy_m>150 then
    return 0;
  end if;

  for v_plan in
    select p.*
    from private.driver_route_deviation_plans p
    join public.orders o on o.id=p.order_id
    where p.delivery_id=p_delivery_id
      and p.driver_user_id=p_driver_user_id
      and p.active=true
      and o.status='EN_ROUTE'
    for update of p
  loop
    if not public.delivery_has_capability(v_plan.delivery_id,'gps.live')
       or not public.delivery_has_capability(v_plan.delivery_id,'safety.route_deviation')
    then
      update private.driver_route_deviation_plans
      set active=false,updated_at=now()
      where order_id=v_plan.order_id;
      continue;
    end if;

    v_distance:=private.route_polyline_distance_m(
      v_plan.route_points,p_latitude,p_longitude
    );

    if v_distance is null then
      continue;
    end if;

    if v_distance>v_plan.threshold_m then
      v_outside:=v_plan.consecutive_outside+1;
      v_inside:=0;
      v_first:=coalesce(v_plan.first_outside_at,p_captured_at);

      update private.driver_route_deviation_plans
      set
        consecutive_outside=v_outside,
        consecutive_inside=0,
        first_outside_at=v_first,
        last_distance_m=v_distance,
        last_checked_at=p_captured_at,
        updated_at=now()
      where order_id=v_plan.order_id;

      select i.id,i.status
      into v_incident_id,v_open_status
      from private.driver_route_deviation_incidents i
      where i.order_id=v_plan.order_id
        and i.status in ('OPEN','ACKNOWLEDGED')
      order by i.created_at desc
      limit 1
      for update;

      if v_outside>=3
         and p_captured_at>=v_first+interval '20 seconds'
      then
        if v_incident_id is null then
          insert into private.driver_route_deviation_incidents(
            order_id,delivery_id,driver_user_id,
            latitude,longitude,accuracy_m,
            deviation_m,max_deviation_m,samples_outside,
            first_detected_at,last_detected_at
          )
          values(
            v_plan.order_id,v_plan.delivery_id,v_plan.driver_user_id,
            p_latitude,p_longitude,p_accuracy_m,
            v_distance,v_distance,v_outside,
            v_first,p_captured_at
          )
          returning id into v_incident_id;
          perform private.broadcast_route_deviation_incident(v_incident_id);
          v_changes:=v_changes+1;
        else
          update private.driver_route_deviation_incidents
          set
            latitude=p_latitude,
            longitude=p_longitude,
            accuracy_m=p_accuracy_m,
            deviation_m=v_distance,
            max_deviation_m=greatest(max_deviation_m,v_distance),
            samples_outside=greatest(samples_outside,v_outside),
            last_detected_at=p_captured_at,
            updated_at=now()
          where id=v_incident_id;
        end if;
      end if;
    else
      v_inside:=v_plan.consecutive_inside+1;

      update private.driver_route_deviation_plans
      set
        consecutive_outside=0,
        consecutive_inside=v_inside,
        first_outside_at=null,
        last_distance_m=v_distance,
        last_checked_at=p_captured_at,
        updated_at=now()
      where order_id=v_plan.order_id;

      if v_inside>=2 then
        select i.id,i.status
        into v_incident_id,v_open_status
        from private.driver_route_deviation_incidents i
        where i.order_id=v_plan.order_id
          and i.status in ('OPEN','ACKNOWLEDGED')
        order by i.created_at desc
        limit 1
        for update;

        if v_incident_id is not null then
          update private.driver_route_deviation_incidents
          set
            status='RESOLVED',
            resolved_at=now(),
            resolution_reason='RETURNED_TO_ROUTE',
            updated_at=now()
          where id=v_incident_id;
          perform private.broadcast_route_deviation_incident(v_incident_id);
          v_changes:=v_changes+1;
        end if;
      end if;
    end if;
  end loop;

  return v_changes;
end;
$$;

revoke execute on function private.evaluate_route_deviation_location(uuid,uuid,numeric,numeric,numeric,timestamptz)
from public,anon,authenticated;

create or replace function private.driver_live_location_route_deviation_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.evaluate_route_deviation_location(
    new.delivery_id,new.driver_user_id,
    new.latitude,new.longitude,new.accuracy_m,new.captured_at
  );
  return new;
end;
$$;

revoke execute on function private.driver_live_location_route_deviation_trigger()
from public,anon,authenticated;

drop trigger if exists trg_driver_live_route_deviation on public.driver_live_locations;
create trigger trg_driver_live_route_deviation
after insert or update of latitude,longitude,accuracy_m,captured_at
on public.driver_live_locations
for each row
execute function private.driver_live_location_route_deviation_trigger();

create or replace function private.route_deviation_order_terminal()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_incident_id uuid;
begin
  if new.status in ('DELIVERED','CANCELLED')
     and old.status is distinct from new.status
  then
    update private.driver_route_deviation_plans
    set active=false,updated_at=now()
    where order_id=new.id;

    select i.id
    into v_incident_id
    from private.driver_route_deviation_incidents i
    where i.order_id=new.id
      and i.status in ('OPEN','ACKNOWLEDGED')
    order by i.created_at desc
    limit 1
    for update;

    if v_incident_id is not null then
      update private.driver_route_deviation_incidents
      set
        status='RESOLVED',
        resolved_at=now(),
        resolution_reason='ORDER_FINISHED',
        updated_at=now()
      where id=v_incident_id;
      perform private.broadcast_route_deviation_incident(v_incident_id);
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.route_deviation_order_terminal()
from public,anon,authenticated;

drop trigger if exists trg_orders_route_deviation_terminal on public.orders;
create trigger trg_orders_route_deviation_terminal
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function private.route_deviation_order_terminal();

create or replace function public.driver_route_deviation_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_incidents jsonb;
  v_plans jsonb;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'incident_id',i.id,
    'order_id',i.order_id,
    'delivery_id',i.delivery_id,
    'status',i.status,
    'deviation_m',i.deviation_m,
    'max_deviation_m',i.max_deviation_m,
    'samples_outside',i.samples_outside,
    'first_detected_at',i.first_detected_at,
    'last_detected_at',i.last_detected_at,
    'acknowledged_at',i.acknowledged_at,
    'resolved_at',i.resolved_at,
    'resolution_reason',i.resolution_reason,
    'created_at',i.created_at
  ) order by i.created_at desc),'[]'::jsonb)
  into v_incidents
  from private.driver_route_deviation_incidents i
  where i.driver_user_id=auth.uid()
    and i.created_at>=now()-interval '7 days';

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',p.order_id,
    'delivery_id',p.delivery_id,
    'active',p.active,
    'threshold_m',p.threshold_m,
    'last_distance_m',p.last_distance_m,
    'last_checked_at',p.last_checked_at,
    'planned_at',p.planned_at
  ) order by p.planned_at desc),'[]'::jsonb)
  into v_plans
  from private.driver_route_deviation_plans p
  join public.orders o on o.id=p.order_id
  join public.user_deliveries ud
    on ud.user_id=auth.uid()
   and ud.delivery_id=p.delivery_id
   and ud.active=true
  where p.driver_user_id=auth.uid()
    and p.active=true
    and o.status='EN_ROUTE';

  return jsonb_build_object(
    'plans',coalesce(v_plans,'[]'::jsonb),
    'incidents',coalesce(v_incidents,'[]'::jsonb)
  );
end;
$$;

revoke execute on function public.driver_route_deviation_snapshot()
from public,anon;
grant execute on function public.driver_route_deviation_snapshot()
to authenticated;

create or replace function public.delivery_route_deviation_snapshot(
  p_delivery_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),200));
  v_enabled boolean;
  v jsonb;
begin
  if not private.route_deviation_user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.view')
  then
    raise exception 'HTPWEB: no autorizado para consultar desvíos de ruta';
  end if;

  v_enabled:=
    public.delivery_has_capability(p_delivery_id,'gps.live')
    and public.delivery_has_capability(p_delivery_id,'safety.route_deviation');

  select coalesce(jsonb_agg(x.item order by x.sort_rank,x.created_at desc),'[]'::jsonb)
  into v
  from (
    select
      case i.status when 'OPEN' then 0 when 'ACKNOWLEDGED' then 1 else 2 end sort_rank,
      i.created_at,
      jsonb_build_object(
        'incident_id',i.id,
        'order_id',i.order_id,
        'delivery_id',i.delivery_id,
        'driver_user_id',i.driver_user_id,
        'driver_name',p.full_name,
        'driver_phone',p.phone,
        'status',i.status,
        'latitude',i.latitude,
        'longitude',i.longitude,
        'accuracy_m',i.accuracy_m,
        'deviation_m',i.deviation_m,
        'max_deviation_m',i.max_deviation_m,
        'samples_outside',i.samples_outside,
        'first_detected_at',i.first_detected_at,
        'last_detected_at',i.last_detected_at,
        'acknowledged_at',i.acknowledged_at,
        'resolved_at',i.resolved_at,
        'resolution_reason',i.resolution_reason,
        'resolution_note',i.resolution_note,
        'created_at',i.created_at,
        'updated_at',i.updated_at
      ) item
    from private.driver_route_deviation_incidents i
    join public.profiles p on p.id=i.driver_user_id
    where i.delivery_id=p_delivery_id
      and (
        i.status in ('OPEN','ACKNOWLEDGED')
        or i.created_at>=now()-interval '7 days'
      )
    order by
      case i.status when 'OPEN' then 0 when 'ACKNOWLEDGED' then 1 else 2 end,
      i.created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object(
    'enabled',v_enabled,
    'incidents',coalesce(v,'[]'::jsonb)
  );
end;
$$;

revoke execute on function public.delivery_route_deviation_snapshot(uuid,integer)
from public,anon;
grant execute on function public.delivery_route_deviation_snapshot(uuid,integer)
to authenticated;

create or replace function public.delivery_acknowledge_route_deviation(
  p_delivery_id uuid,
  p_incident_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_status text;
begin
  if not private.route_deviation_user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.manage')
  then
    raise exception 'HTPWEB: no autorizado para reconocer desvíos de ruta';
  end if;

  select i.status
  into v_status
  from private.driver_route_deviation_incidents i
  where i.id=p_incident_id
    and i.delivery_id=p_delivery_id
  for update;

  if v_status is null then
    raise exception 'HTPWEB: alerta de desvío inexistente';
  end if;

  if v_status='OPEN' then
    update private.driver_route_deviation_incidents
    set
      status='ACKNOWLEDGED',
      acknowledged_by=auth.uid(),
      acknowledged_at=now(),
      updated_at=now()
    where id=p_incident_id;
    perform private.broadcast_route_deviation_incident(p_incident_id);
  end if;

  return private.route_deviation_payload(p_incident_id);
end;
$$;

revoke execute on function public.delivery_acknowledge_route_deviation(uuid,uuid)
from public,anon;
grant execute on function public.delivery_acknowledge_route_deviation(uuid,uuid)
to authenticated;

create or replace function public.delivery_resolve_route_deviation(
  p_delivery_id uuid,
  p_incident_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_status text;
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
begin
  if not private.route_deviation_user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.manage')
  then
    raise exception 'HTPWEB: no autorizado para resolver desvíos de ruta';
  end if;

  select i.status
  into v_status
  from private.driver_route_deviation_incidents i
  where i.id=p_incident_id
    and i.delivery_id=p_delivery_id
  for update;

  if v_status is null then
    raise exception 'HTPWEB: alerta de desvío inexistente';
  end if;

  if v_status<>'RESOLVED' then
    update private.driver_route_deviation_incidents
    set
      status='RESOLVED',
      acknowledged_by=coalesce(acknowledged_by,auth.uid()),
      acknowledged_at=coalesce(acknowledged_at,now()),
      resolved_by=auth.uid(),
      resolved_at=now(),
      resolution_reason='MANUAL',
      resolution_note=v_note,
      updated_at=now()
    where id=p_incident_id;
    perform private.broadcast_route_deviation_incident(p_incident_id);
  end if;

  return private.route_deviation_payload(p_incident_id);
end;
$$;

revoke execute on function public.delivery_resolve_route_deviation(uuid,uuid,text)
from public,anon;
grant execute on function public.delivery_resolve_route_deviation(uuid,uuid,text)
to authenticated;

drop policy if exists htpweb_route_deviation_receive on realtime.messages;
create policy htpweb_route_deviation_receive
on realtime.messages
for select
to authenticated
using(
  extension='broadcast'
  and private.can_receive_route_deviation_topic((select realtime.topic()))
);
