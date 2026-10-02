create table if not exists private.quick_driver_tracking_tokens(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '90 days'),
  last_used_at timestamptz
);

create index if not exists quick_driver_tracking_tokens_driver_idx
  on private.quick_driver_tracking_tokens(delivery_id,driver_user_id,active);

alter table private.quick_driver_tracking_tokens enable row level security;
revoke all on table private.quick_driver_tracking_tokens from public,anon,authenticated;

create or replace function public.delivery_quick_driver_authorize(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('users.manage')
  then
    raise exception 'HTPWEB: solo DELIVERY_ADMIN puede crear repartidores rápidos';
  end if;

  return jsonb_build_object(
    'allowed',true,
    'actor_user_id',auth.uid(),
    'delivery_id',p_delivery_id
  );
end;
$function$;

revoke all on function public.delivery_quick_driver_authorize(uuid)
from public,anon;
grant execute on function public.delivery_quick_driver_authorize(uuid)
to authenticated;

create or replace function public.quick_driver_find_by_phone(p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_key text:=public.htp_normalize_contact_phone(p_phone);
  v_result jsonb;
begin
  if v_key is null then
    return null;
  end if;

  select jsonb_build_object(
    'user_id',p.id,
    'full_name',p.full_name,
    'phone',coalesce(p.phone,u.phone),
    'role_code',r.code,
    'active',p.active
  )
  into v_result
  from public.profiles p
  join public.roles r on r.id=p.role_id
  left join auth.users u on u.id=p.id
  where public.htp_normalize_contact_phone(coalesce(p.phone,u.phone))=v_key
  order by p.created_at
  limit 1;

  return v_result;
end;
$function$;

revoke all on function public.quick_driver_find_by_phone(text)
from public,anon,authenticated;
grant execute on function public.quick_driver_find_by_phone(text)
to service_role;

create or replace function public.quick_driver_attach(
  p_delivery_id uuid,
  p_user_id uuid,
  p_phone text,
  p_token_hash text,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor_role text;
  v_target_role text;
  v_driver_role_id uuid;
  v_limit integer;
  v_count integer;
  v_phone_key text:=public.htp_normalize_contact_phone(p_phone);
  v_name text;
begin
  if p_delivery_id is null or p_user_id is null or p_created_by is null then
    raise exception 'HTPWEB: datos incompletos para crear repartidor rápido';
  end if;

  if v_phone_key is null then
    raise exception 'HTPWEB: número de WhatsApp inválido';
  end if;

  if nullif(trim(coalesce(p_token_hash,'')),'') is null then
    raise exception 'HTPWEB: token de seguimiento inválido';
  end if;

  select r.code into v_actor_role
  from public.profiles p
  join public.roles r on r.id=p.role_id
  where p.id=p_created_by and p.active=true and r.active=true;

  if v_actor_role<>'DELIVERY_ADMIN'
     or not exists(
       select 1 from public.user_deliveries ud
       where ud.user_id=p_created_by
         and ud.delivery_id=p_delivery_id
         and ud.active=true
     )
  then
    raise exception 'HTPWEB: administrador DELIVERY no autorizado';
  end if;

  select r.code into v_target_role
  from public.profiles p
  join public.roles r on r.id=p.role_id
  where p.id=p_user_id and p.active=true and r.active=true;

  if v_target_role is null then
    raise exception 'HTPWEB: usuario de repartidor inexistente o inactivo';
  end if;

  if v_target_role not in ('CLIENT','DELIVERY_DRIVER') then
    raise exception 'HTPWEB: el número pertenece a una cuenta administrativa y no puede convertirse en repartidor';
  end if;

  v_limit:=public.delivery_limit_value(p_delivery_id,'drivers.active.max');
  if v_limit is null or v_limit<=0 then
    raise exception 'HTPWEB: el plan no incluye repartidores activos';
  end if;

  select count(*)::integer into v_count
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.delivery_id=p_delivery_id
    and ud.active=true
    and ud.user_id<>p_user_id
    and r.code='DELIVERY_DRIVER';

  if v_count>=v_limit then
    raise exception 'HTPWEB: el DELIVERY alcanzó el máximo de repartidores activos (%)',v_limit;
  end if;

  if v_target_role='CLIENT' then
    select id into v_driver_role_id
    from public.roles
    where code='DELIVERY_DRIVER' and active=true
    limit 1;

    if v_driver_role_id is null then
      raise exception 'HTPWEB: rol DELIVERY_DRIVER no disponible';
    end if;

    update public.profiles
    set role_id=v_driver_role_id,
        phone=coalesce(nullif(trim(p_phone),''),phone),
        full_name=coalesce(nullif(trim(full_name),''),'Repartidor '||right(v_phone_key,4)),
        updated_at=now()
    where id=p_user_id;
  else
    update public.profiles
    set phone=coalesce(nullif(trim(p_phone),''),phone),
        full_name=coalesce(nullif(trim(full_name),''),'Repartidor '||right(v_phone_key,4)),
        updated_at=now()
    where id=p_user_id;
  end if;

  insert into public.user_deliveries(user_id,delivery_id,active,created_at)
  values(p_user_id,p_delivery_id,true,now())
  on conflict(user_id,delivery_id)
  do update set active=true;

  update private.quick_driver_tracking_tokens
  set active=false
  where delivery_id=p_delivery_id
    and driver_user_id=p_user_id
    and active=true;

  insert into private.quick_driver_tracking_tokens(
    delivery_id,driver_user_id,token_hash,active,created_by,created_at,expires_at
  )
  values(p_delivery_id,p_user_id,p_token_hash,true,p_created_by,now(),now()+interval '90 days');

  select coalesce(nullif(trim(p.full_name),''),'Repartidor '||right(v_phone_key,4))
  into v_name
  from public.profiles p
  where p.id=p_user_id;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'user_id',p_user_id,
    'full_name',v_name,
    'phone',p_phone,
    'active',true,
    'expires_at',now()+interval '90 days'
  );
end;
$function$;

revoke all on function public.quick_driver_attach(uuid,uuid,text,text,uuid)
from public,anon,authenticated;
grant execute on function public.quick_driver_attach(uuid,uuid,text,text,uuid)
to service_role;

create or replace function public.quick_driver_rotate_token(
  p_delivery_id uuid,
  p_user_id uuid,
  p_token_hash text,
  p_created_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor_role text;
  v_name text;
  v_phone text;
begin
  select r.code into v_actor_role
  from public.profiles p
  join public.roles r on r.id=p.role_id
  where p.id=p_created_by and p.active=true and r.active=true;

  if v_actor_role<>'DELIVERY_ADMIN'
     or not exists(
       select 1 from public.user_deliveries ud
       where ud.user_id=p_created_by
         and ud.delivery_id=p_delivery_id
         and ud.active=true
     )
  then
    raise exception 'HTPWEB: administrador DELIVERY no autorizado';
  end if;

  if not exists(
    select 1
    from public.user_deliveries ud
    join public.profiles p on p.id=ud.user_id and p.active=true
    join public.roles r on r.id=p.role_id and r.code='DELIVERY_DRIVER' and r.active=true
    where ud.user_id=p_user_id
      and ud.delivery_id=p_delivery_id
      and ud.active=true
  ) then
    raise exception 'HTPWEB: repartidor no activo en este DELIVERY';
  end if;

  update private.quick_driver_tracking_tokens
  set active=false
  where delivery_id=p_delivery_id and driver_user_id=p_user_id and active=true;

  insert into private.quick_driver_tracking_tokens(
    delivery_id,driver_user_id,token_hash,active,created_by,created_at,expires_at
  )
  values(p_delivery_id,p_user_id,p_token_hash,true,p_created_by,now(),now()+interval '90 days');

  select p.full_name,p.phone into v_name,v_phone
  from public.profiles p
  where p.id=p_user_id;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'user_id',p_user_id,
    'full_name',v_name,
    'phone',v_phone,
    'active',true,
    'expires_at',now()+interval '90 days'
  );
end;
$function$;

revoke all on function public.quick_driver_rotate_token(uuid,uuid,text,uuid)
from public,anon,authenticated;
grant execute on function public.quick_driver_rotate_token(uuid,uuid,text,uuid)
to service_role;

create or replace function public.quick_driver_tracking_context(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_token record;
  v_orders jsonb;
  v_gps boolean:=false;
begin
  select t.delivery_id,t.driver_user_id,t.expires_at,p.full_name,p.phone,d.name as delivery_name
  into v_token
  from private.quick_driver_tracking_tokens t
  join public.profiles p on p.id=t.driver_user_id and p.active=true
  join public.deliveries d on d.id=t.delivery_id and d.active=true
  join public.user_deliveries ud on ud.user_id=t.driver_user_id and ud.delivery_id=t.delivery_id and ud.active=true
  where t.token_hash=p_token_hash and t.active=true and t.expires_at>now()
  limit 1;

  if not found then
    raise exception 'HTPWEB: enlace de seguimiento inválido o vencido';
  end if;

  v_gps:=public.delivery_service_is_active(v_token.delivery_id)
         and public.delivery_has_capability(v_token.delivery_id,'gps.live');

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',o.id,'status',o.status,'customer_name',o.customer_name,
    'delivery_address',o.delivery_address,'address_reference',o.address_reference,
    'latitude',o.latitude,'longitude',o.longitude,'assigned_at',a.assigned_at
  ) order by a.assigned_at,o.id),'[]'::jsonb)
  into v_orders
  from public.order_driver_assignments a
  join public.orders o on o.id=a.order_id
  where a.delivery_id=v_token.delivery_id
    and a.driver_user_id=v_token.driver_user_id
    and a.status='ACTIVE' and a.unassigned_at is null
    and o.status in ('READY','EN_ROUTE');

  return jsonb_build_object(
    'delivery_id',v_token.delivery_id,'delivery_name',v_token.delivery_name,
    'driver_user_id',v_token.driver_user_id,'driver_name',v_token.full_name,
    'phone',v_token.phone,'gps_live',v_gps,
    'can_share',v_gps and jsonb_array_length(v_orders)>0,
    'orders',v_orders,'expires_at',v_token.expires_at
  );
end;
$function$;

revoke all on function public.quick_driver_tracking_context(text)
from public,anon,authenticated;
grant execute on function public.quick_driver_tracking_context(text)
to service_role;

create or replace function public.quick_driver_update_location(
  p_token_hash text,p_latitude numeric,p_longitude numeric,
  p_accuracy_m numeric default null,p_heading_deg numeric default null,
  p_speed_mps numeric default null,p_captured_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token record;
  v_captured_at timestamptz:=coalesce(p_captured_at,now());
  v_previous_captured_at timestamptz;
  v_previous_updated_at timestamptz;
  v_history_days integer;
  v_topics integer:=0;
  v_order record;
begin
  select t.id,t.delivery_id,t.driver_user_id into v_token
  from private.quick_driver_tracking_tokens t
  join public.profiles p on p.id=t.driver_user_id and p.active=true
  join public.user_deliveries ud on ud.user_id=t.driver_user_id and ud.delivery_id=t.delivery_id and ud.active=true
  where t.token_hash=p_token_hash and t.active=true and t.expires_at>now()
  limit 1;

  if not found then raise exception 'HTPWEB: enlace de seguimiento inválido o vencido'; end if;

  if not public.delivery_service_is_active(v_token.delivery_id)
     or not public.delivery_has_capability(v_token.delivery_id,'gps.live')
  then raise exception 'HTPWEB: el plan no incluye GPS en vivo'; end if;

  if p_latitude is null or p_latitude<-90 or p_latitude>90
     or p_longitude is null or p_longitude<-180 or p_longitude>180
  then raise exception 'HTPWEB: coordenadas GPS inválidas'; end if;

  if p_accuracy_m is not null and p_accuracy_m<0 then raise exception 'HTPWEB: precisión GPS inválida'; end if;
  if p_heading_deg is not null and (p_heading_deg<0 or p_heading_deg>360) then raise exception 'HTPWEB: rumbo GPS inválido'; end if;
  if p_speed_mps is not null and p_speed_mps<0 then raise exception 'HTPWEB: velocidad GPS inválida'; end if;

  if v_captured_at<now()-interval '10 minutes' or v_captured_at>now()+interval '2 minutes'
  then raise exception 'HTPWEB: hora de captura GPS fuera de rango'; end if;

  if not exists(
    select 1 from public.order_driver_assignments a
    join public.orders o on o.id=a.order_id
    where a.delivery_id=v_token.delivery_id and a.driver_user_id=v_token.driver_user_id
      and a.status='ACTIVE' and a.unassigned_at is null and o.status in ('READY','EN_ROUTE')
  ) then raise exception 'HTPWEB: no tienes una entrega activa para compartir ubicación'; end if;

  select l.captured_at,l.updated_at into v_previous_captured_at,v_previous_updated_at
  from public.driver_live_locations l
  where l.delivery_id=v_token.delivery_id and l.driver_user_id=v_token.driver_user_id
  for update;

  if found and v_captured_at<=v_previous_captured_at then
    return jsonb_build_object('status','STALE','captured_at',v_previous_captured_at);
  end if;
  if v_previous_updated_at is not null and v_previous_updated_at>now()-interval '5 seconds' then
    return jsonb_build_object('status','THROTTLED','retry_after_ms',5000);
  end if;

  insert into public.driver_live_locations(
    delivery_id,driver_user_id,latitude,longitude,accuracy_m,heading_deg,speed_mps,captured_at,updated_at
  ) values(
    v_token.delivery_id,v_token.driver_user_id,p_latitude,p_longitude,
    p_accuracy_m,p_heading_deg,p_speed_mps,v_captured_at,now()
  )
  on conflict(delivery_id,driver_user_id) do update set
    latitude=excluded.latitude,longitude=excluded.longitude,accuracy_m=excluded.accuracy_m,
    heading_deg=excluded.heading_deg,speed_mps=excluded.speed_mps,
    captured_at=excluded.captured_at,updated_at=now();

  v_history_days:=public.delivery_limit_value(v_token.delivery_id,'gps_history.days');
  if coalesce(v_history_days,0)>0 then
    insert into public.driver_location_history(
      delivery_id,driver_user_id,latitude,longitude,accuracy_m,heading_deg,speed_mps,captured_at,received_at
    ) values(
      v_token.delivery_id,v_token.driver_user_id,p_latitude,p_longitude,
      p_accuracy_m,p_heading_deg,p_speed_mps,v_captured_at,now()
    );
  end if;

  update private.quick_driver_tracking_tokens set last_used_at=now() where id=v_token.id;

  for v_order in
    select o.id from public.order_driver_assignments a
    join public.orders o on o.id=a.order_id
    where a.delivery_id=v_token.delivery_id and a.driver_user_id=v_token.driver_user_id
      and a.status='ACTIVE' and a.unassigned_at is null and o.status in ('READY','EN_ROUTE')
  loop
    perform realtime.send(
      jsonb_build_object(
        'latitude',p_latitude,'longitude',p_longitude,'accuracy_m',p_accuracy_m,
        'heading_deg',p_heading_deg,'speed_mps',p_speed_mps,'captured_at',v_captured_at
      ),
      'location','order-tracking:'||v_order.id::text,true
    );
    v_topics:=v_topics+1;
  end loop;

  return jsonb_build_object(
    'status','UPDATED','captured_at',v_captured_at,
    'broadcast_topics',v_topics,'history_days',coalesce(v_history_days,0)
  );
end;
$function$;

revoke all on function public.quick_driver_update_location(text,numeric,numeric,numeric,numeric,numeric,timestamptz)
from public,anon,authenticated;
grant execute on function public.quick_driver_update_location(text,numeric,numeric,numeric,numeric,numeric,timestamptz)
to service_role;