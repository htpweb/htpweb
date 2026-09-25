create table if not exists private.driver_sos_incidents(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete restrict,
  driver_user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'OPEN' check(status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
  latitude numeric,
  longitude numeric,
  accuracy_m numeric,
  location_captured_at timestamptz,
  location_source text not null default 'NONE' check(location_source in ('LIVE_GPS','DEVICE','NONE')),
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(latitude is null or (latitude between -90 and 90)),
  check(longitude is null or (longitude between -180 and 180)),
  check(accuracy_m is null or accuracy_m>=0)
);

create unique index if not exists driver_sos_one_open_per_delivery_idx
  on private.driver_sos_incidents(delivery_id,driver_user_id)
  where status in ('OPEN','ACKNOWLEDGED');

create index if not exists driver_sos_delivery_created_idx
  on private.driver_sos_incidents(delivery_id,created_at desc);

create index if not exists driver_sos_driver_created_idx
  on private.driver_sos_incidents(driver_user_id,created_at desc);

alter table private.driver_sos_incidents enable row level security;
revoke all on table private.driver_sos_incidents from public,anon,authenticated;

drop policy if exists driver_sos_incidents_deny_all on private.driver_sos_incidents;
create policy driver_sos_incidents_deny_all
on private.driver_sos_incidents
for all
to public
using(false)
with check(false);

CREATE OR REPLACE FUNCTION private.sos_payload(p_incident_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'incident_id',i.id,
    'delivery_id',i.delivery_id,
    'order_id',i.order_id,
    'driver_user_id',i.driver_user_id,
    'status',i.status,
    'latitude',i.latitude,
    'longitude',i.longitude,
    'accuracy_m',i.accuracy_m,
    'location_captured_at',i.location_captured_at,
    'location_source',i.location_source,
    'acknowledged_at',i.acknowledged_at,
    'resolved_at',i.resolved_at,
    'created_at',i.created_at,
    'updated_at',i.updated_at
  )
  from private.driver_sos_incidents i
  where i.id=p_incident_id;
$function$;

CREATE OR REPLACE FUNCTION private.broadcast_sos_incident(p_incident_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v record;
  v_payload jsonb;
begin
  select i.delivery_id,i.driver_user_id
  into v
  from private.driver_sos_incidents i
  where i.id=p_incident_id;

  if v.delivery_id is null then return; end if;

  v_payload:=private.sos_payload(p_incident_id);

  perform realtime.send(
    v_payload,
    'sos',
    'safety-sos:delivery:'||v.delivery_id::text,
    true
  );

  perform realtime.send(
    v_payload,
    'sos',
    'safety-sos:driver:'||v.driver_user_id::text,
    true
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.sos_user_has_delivery(p_delivery_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.can_receive_safety_sos_topic(p_topic text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_delivery_id uuid;
  v_driver_id uuid;
begin
  if auth.uid() is null or p_topic is null then
    return false;
  end if;

  if p_topic ~* '^safety-sos:delivery:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_delivery_id:=split_part(p_topic,':',3)::uuid;
    return private.sos_user_has_delivery(v_delivery_id)
      and public.has_permission('orders.view');
  end if;

  if p_topic ~* '^safety-sos:driver:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_driver_id:=split_part(p_topic,':',3)::uuid;
    return public.current_role_code()='DELIVERY_DRIVER'
      and auth.uid()=v_driver_id;
  end if;

  return false;
exception
  when invalid_text_representation then return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.driver_trigger_sos(p_order_id uuid, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_accuracy_m numeric DEFAULT NULL::numeric, p_captured_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_assignment record;
  v_incident_id uuid;
  v_live record;
  v_lat numeric;
  v_lng numeric;
  v_accuracy numeric;
  v_captured timestamptz;
  v_source text:='NONE';
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  select a.delivery_id,a.driver_user_id,o.id order_id,o.status
  into v_assignment
  from public.order_driver_assignments a
  join public.orders o on o.id=a.order_id and o.delivery_id=a.delivery_id
  where a.order_id=p_order_id
    and a.driver_user_id=auth.uid()
    and a.status='ACTIVE'
    and a.unassigned_at is null
    and o.status='EN_ROUTE'
  order by a.assigned_at desc
  limit 1;

  if v_assignment.order_id is null then
    raise exception 'HTPWEB: SOS disponible solo en una entrega EN_ROUTE asignada a tu cuenta';
  end if;

  if not public.delivery_has_capability(v_assignment.delivery_id,'safety.sos') then
    raise exception 'HTPWEB: el plan vigente no incluye SOS de repartidor';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'sos:'||v_assignment.delivery_id::text||':'||auth.uid()::text,
      0
    )
  );

  select i.id
  into v_incident_id
  from private.driver_sos_incidents i
  where i.delivery_id=v_assignment.delivery_id
    and i.driver_user_id=auth.uid()
    and i.status in ('OPEN','ACKNOWLEDGED')
  order by i.created_at desc
  limit 1
  for update;

  select l.latitude,l.longitude,l.accuracy_m,l.captured_at
  into v_live
  from public.driver_live_locations l
  where l.delivery_id=v_assignment.delivery_id
    and l.driver_user_id=auth.uid()
    and l.captured_at>=now()-interval '2 minutes';

  if v_live.latitude is not null then
    v_lat:=v_live.latitude;
    v_lng:=v_live.longitude;
    v_accuracy:=v_live.accuracy_m;
    v_captured:=v_live.captured_at;
    v_source:='LIVE_GPS';
  elsif p_latitude is not null
     and p_longitude is not null
     and p_latitude between -90 and 90
     and p_longitude between -180 and 180
     and (p_accuracy_m is null or p_accuracy_m>=0)
     and coalesce(p_captured_at,now()) between now()-interval '10 minutes' and now()+interval '2 minutes'
  then
    v_lat:=p_latitude;
    v_lng:=p_longitude;
    v_accuracy:=p_accuracy_m;
    v_captured:=coalesce(p_captured_at,now());
    v_source:='DEVICE';
  end if;

  if v_incident_id is null then
    insert into private.driver_sos_incidents(
      delivery_id,order_id,driver_user_id,
      latitude,longitude,accuracy_m,location_captured_at,location_source
    )
    values(
      v_assignment.delivery_id,p_order_id,auth.uid(),
      v_lat,v_lng,v_accuracy,v_captured,v_source
    )
    returning id into v_incident_id;
  else
    update private.driver_sos_incidents
    set
      order_id=p_order_id,
      latitude=coalesce(v_lat,latitude),
      longitude=coalesce(v_lng,longitude),
      accuracy_m=case when v_lat is not null then v_accuracy else accuracy_m end,
      location_captured_at=coalesce(v_captured,location_captured_at),
      location_source=case when v_lat is not null then v_source else location_source end,
      updated_at=now()
    where id=v_incident_id;
  end if;

  perform private.broadcast_sos_incident(v_incident_id);

  return private.sos_payload(v_incident_id)
    || jsonb_build_object(
      'already_open',exists(
        select 1
        from private.driver_sos_incidents i
        where i.id=v_incident_id
          and i.created_at<i.updated_at
      )
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.driver_sos_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v jsonb;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'incident_id',i.id,
    'delivery_id',i.delivery_id,
    'order_id',i.order_id,
    'status',i.status,
    'latitude',i.latitude,
    'longitude',i.longitude,
    'accuracy_m',i.accuracy_m,
    'location_captured_at',i.location_captured_at,
    'location_source',i.location_source,
    'acknowledged_at',i.acknowledged_at,
    'resolved_at',i.resolved_at,
    'created_at',i.created_at,
    'updated_at',i.updated_at
  ) order by i.created_at desc),'[]'::jsonb)
  into v
  from private.driver_sos_incidents i
  where i.driver_user_id=auth.uid()
    and i.created_at>=now()-interval '7 days';

  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delivery_sos_snapshot(p_delivery_id uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),200));
  v jsonb;
  v_enabled boolean;
begin
  if not private.sos_user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.view')
  then
    raise exception 'HTPWEB: no autorizado para consultar alertas SOS';
  end if;

  v_enabled:=public.delivery_has_capability(p_delivery_id,'safety.sos');

  select coalesce(jsonb_agg(x.item order by x.sort_rank,x.created_at desc),'[]'::jsonb)
  into v
  from (
    select
      case i.status when 'OPEN' then 0 when 'ACKNOWLEDGED' then 1 else 2 end sort_rank,
      i.created_at,
      jsonb_build_object(
        'incident_id',i.id,
        'delivery_id',i.delivery_id,
        'order_id',i.order_id,
        'driver_user_id',i.driver_user_id,
        'driver_name',p.full_name,
        'driver_phone',p.phone,
        'status',i.status,
        'latitude',i.latitude,
        'longitude',i.longitude,
        'accuracy_m',i.accuracy_m,
        'location_captured_at',i.location_captured_at,
        'location_source',i.location_source,
        'acknowledged_at',i.acknowledged_at,
        'resolved_at',i.resolved_at,
        'resolution_note',i.resolution_note,
        'created_at',i.created_at,
        'updated_at',i.updated_at
      ) item
    from private.driver_sos_incidents i
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
$function$;

CREATE OR REPLACE FUNCTION public.delivery_acknowledge_sos(p_delivery_id uuid, p_incident_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text;
begin
  if not private.sos_user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.manage')
  then
    raise exception 'HTPWEB: no autorizado para reconocer alertas SOS';
  end if;

  select i.status
  into v_status
  from private.driver_sos_incidents i
  where i.id=p_incident_id
    and i.delivery_id=p_delivery_id
  for update;

  if v_status is null then
    raise exception 'HTPWEB: alerta SOS inexistente';
  end if;

  if v_status='RESOLVED' then
    return private.sos_payload(p_incident_id);
  end if;

  if v_status='OPEN' then
    update private.driver_sos_incidents
    set
      status='ACKNOWLEDGED',
      acknowledged_by=auth.uid(),
      acknowledged_at=now(),
      updated_at=now()
    where id=p_incident_id;
  end if;

  perform private.broadcast_sos_incident(p_incident_id);
  return private.sos_payload(p_incident_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.delivery_resolve_sos(p_delivery_id uuid, p_incident_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text;
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
begin
  if not private.sos_user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.manage')
  then
    raise exception 'HTPWEB: no autorizado para resolver alertas SOS';
  end if;

  select i.status
  into v_status
  from private.driver_sos_incidents i
  where i.id=p_incident_id
    and i.delivery_id=p_delivery_id
  for update;

  if v_status is null then
    raise exception 'HTPWEB: alerta SOS inexistente';
  end if;

  if v_status<>'RESOLVED' then
    update private.driver_sos_incidents
    set
      status='RESOLVED',
      acknowledged_by=coalesce(acknowledged_by,auth.uid()),
      acknowledged_at=coalesce(acknowledged_at,now()),
      resolved_by=auth.uid(),
      resolved_at=now(),
      resolution_note=v_note,
      updated_at=now()
    where id=p_incident_id;
  end if;

  perform private.broadcast_sos_incident(p_incident_id);
  return private.sos_payload(p_incident_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.driver_my_orders()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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


revoke execute on function private.sos_payload(uuid) from public,anon,authenticated;
revoke execute on function private.broadcast_sos_incident(uuid) from public,anon,authenticated;
revoke execute on function private.sos_user_has_delivery(uuid) from public,anon,authenticated;
revoke execute on function private.can_receive_safety_sos_topic(text) from public,anon,authenticated;

drop policy if exists htpweb_safety_sos_receive on realtime.messages;
create policy htpweb_safety_sos_receive
on realtime.messages
for select
to authenticated
using(
  extension='broadcast'
  and private.can_receive_safety_sos_topic((select realtime.topic()))
);

revoke execute on function public.driver_trigger_sos(uuid,numeric,numeric,numeric,timestamptz) from public,anon;
grant execute on function public.driver_trigger_sos(uuid,numeric,numeric,numeric,timestamptz) to authenticated;

revoke execute on function public.driver_sos_snapshot() from public,anon;
grant execute on function public.driver_sos_snapshot() to authenticated;

revoke execute on function public.delivery_sos_snapshot(uuid,integer) from public,anon;
grant execute on function public.delivery_sos_snapshot(uuid,integer) to authenticated;

revoke execute on function public.delivery_acknowledge_sos(uuid,uuid) from public,anon;
grant execute on function public.delivery_acknowledge_sos(uuid,uuid) to authenticated;

revoke execute on function public.delivery_resolve_sos(uuid,uuid,text) from public,anon;
grant execute on function public.delivery_resolve_sos(uuid,uuid,text) to authenticated;

revoke execute on function public.driver_my_orders() from public,anon;
grant execute on function public.driver_my_orders() to authenticated;
