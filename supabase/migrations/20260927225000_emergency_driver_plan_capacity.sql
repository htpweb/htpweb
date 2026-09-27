alter table public.user_deliveries
  add column if not exists driver_mode text not null default 'REGULAR',
  add column if not exists emergency_started_at timestamptz,
  add column if not exists emergency_expires_at timestamptz,
  add column if not exists emergency_created_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.user_deliveries'::regclass
      and conname='user_deliveries_driver_mode_check'
  ) then
    alter table public.user_deliveries
      add constraint user_deliveries_driver_mode_check
      check (driver_mode in ('REGULAR','EMERGENCY'));
  end if;
end $$;

create index if not exists user_deliveries_driver_mode_idx
  on public.user_deliveries(delivery_id,active,driver_mode,emergency_expires_at);

insert into public.plan_feature_catalog(
  code,entitlement_type,family,label,description,stage,unit,active,display_order,updated_at
)
values(
  'drivers.emergency.max','LIMIT','Capacidad','Cupos de repartidor de emergencia',
  'Máximo de repartidores temporales de emergencia activos simultáneamente. Cada alta rápida dura 24 horas y, si vence durante una entrega, puede terminar únicamente esa entrega.',
  2,'repartidores',true,25,now()
)
on conflict(code) do update
set entitlement_type=excluded.entitlement_type,
    family=excluded.family,
    label=excluded.label,
    description=excluded.description,
    stage=excluded.stage,
    unit=excluded.unit,
    active=true,
    display_order=excluded.display_order,
    updated_at=now();

insert into public.plan_entitlements(plan_id,entitlement_type,code,value,updated_at)
select p.id,'LIMIT','drivers.emergency.max',
  case when upper(p.name) like '%PRO%' or upper(p.code) like '%PRO%'
    then '2'::jsonb else '1'::jsonb end,
  now()
from public.subscription_plans p
where p.target_type='DELIVERY'
on conflict(plan_id,entitlement_type,code) do update
set value=excluded.value,updated_at=now();

create or replace function public.delivery_cleanup_expired_emergency_drivers(p_delivery_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid;
  v_count integer:=0;
  v_client_role_id uuid;
begin
  if p_delivery_id is null then return 0; end if;

  select id into v_client_role_id
  from public.roles where code='CLIENT' and active=true limit 1;

  for v_user_id in
    select ud.user_id
    from public.user_deliveries ud
    join public.profiles p on p.id=ud.user_id and p.active=true
    join public.roles r on r.id=p.role_id and r.active=true and r.code='DELIVERY_DRIVER'
    where ud.delivery_id=p_delivery_id
      and ud.active=true
      and ud.driver_mode='EMERGENCY'
      and ud.emergency_expires_at is not null
      and ud.emergency_expires_at<=now()
      and not exists(
        select 1
        from public.order_driver_assignments a
        join public.orders o on o.id=a.order_id
        where a.delivery_id=p_delivery_id
          and a.driver_user_id=ud.user_id
          and a.status='ACTIVE'
          and a.unassigned_at is null
          and o.status in ('READY','EN_ROUTE')
      )
    for update
  loop
    update public.user_deliveries
    set active=false
    where user_id=v_user_id and delivery_id=p_delivery_id
      and active=true and driver_mode='EMERGENCY';

    update private.quick_driver_tracking_tokens
    set active=false
    where delivery_id=p_delivery_id and driver_user_id=v_user_id and active=true;

    if v_client_role_id is not null
       and not exists(select 1 from public.user_deliveries where user_id=v_user_id and active=true)
    then
      update public.profiles p
      set role_id=v_client_role_id,updated_at=now()
      where p.id=v_user_id
        and exists(select 1 from public.roles r where r.id=p.role_id and r.code='DELIVERY_DRIVER');
    end if;

    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function public.delivery_cleanup_expired_emergency_drivers(uuid)
from public,anon,authenticated;

create or replace function public.quick_driver_attach(
  p_delivery_id uuid,p_user_id uuid,p_phone text,p_token_hash text,p_created_by uuid
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
  v_expires_at timestamptz:=now()+interval '24 hours';
begin
  if p_delivery_id is null or p_user_id is null or p_created_by is null then
    raise exception 'HTPWEB: datos incompletos para crear repartidor de emergencia';
  end if;
  if v_phone_key is null then raise exception 'HTPWEB: número de WhatsApp inválido'; end if;
  if nullif(trim(coalesce(p_token_hash,'')),'') is null then
    raise exception 'HTPWEB: token de seguimiento inválido';
  end if;

  perform public.delivery_cleanup_expired_emergency_drivers(p_delivery_id);

  select r.code into v_actor_role
  from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=p_created_by and p.active=true and r.active=true;

  if v_actor_role<>'DELIVERY_ADMIN'
     or not exists(
       select 1 from public.user_deliveries ud
       where ud.user_id=p_created_by and ud.delivery_id=p_delivery_id and ud.active=true
     )
  then raise exception 'HTPWEB: administrador DELIVERY no autorizado'; end if;

  if exists(
    select 1
    from public.user_deliveries ud
    join public.profiles p on p.id=ud.user_id and p.active=true
    join public.roles r on r.id=p.role_id and r.active=true and r.code='DELIVERY_DRIVER'
    where ud.user_id=p_user_id and ud.delivery_id=p_delivery_id
      and ud.active=true and ud.driver_mode='REGULAR'
  ) then
    raise exception 'HTPWEB: este número ya pertenece a un repartidor regular activo';
  end if;

  select r.code into v_target_role
  from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=p_user_id and p.active=true and r.active=true;

  if v_target_role is null then raise exception 'HTPWEB: usuario de repartidor inexistente o inactivo'; end if;
  if v_target_role not in ('CLIENT','DELIVERY_DRIVER') then
    raise exception 'HTPWEB: el número pertenece a una cuenta administrativa y no puede convertirse en repartidor';
  end if;

  v_limit:=public.delivery_limit_value(p_delivery_id,'drivers.emergency.max');
  if v_limit is null or v_limit<=0 then
    raise exception 'HTPWEB: el plan no incluye cupos de repartidor de emergencia';
  end if;

  select count(*)::integer into v_count
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.delivery_id=p_delivery_id and ud.active=true and ud.user_id<>p_user_id
    and r.code='DELIVERY_DRIVER' and ud.driver_mode='EMERGENCY';

  if v_count>=v_limit then
    raise exception 'HTPWEB: el DELIVERY alcanzó el máximo de repartidores de emergencia activos (%)',v_limit;
  end if;

  if v_target_role='CLIENT' then
    select id into v_driver_role_id from public.roles
    where code='DELIVERY_DRIVER' and active=true limit 1;
    if v_driver_role_id is null then raise exception 'HTPWEB: rol DELIVERY_DRIVER no disponible'; end if;
    update public.profiles
    set role_id=v_driver_role_id,
        phone=coalesce(nullif(trim(p_phone),''),phone),
        full_name=coalesce(nullif(trim(full_name),''),'Repartidor emergencia '||right(v_phone_key,4)),
        updated_at=now()
    where id=p_user_id;
  else
    update public.profiles
    set phone=coalesce(nullif(trim(p_phone),''),phone),
        full_name=coalesce(nullif(trim(full_name),''),'Repartidor emergencia '||right(v_phone_key,4)),
        updated_at=now()
    where id=p_user_id;
  end if;

  insert into public.user_deliveries(
    user_id,delivery_id,active,created_at,driver_mode,
    emergency_started_at,emergency_expires_at,emergency_created_by
  )
  values(p_user_id,p_delivery_id,true,now(),'EMERGENCY',now(),v_expires_at,p_created_by)
  on conflict(user_id,delivery_id)
  do update set active=true,driver_mode='EMERGENCY',
    emergency_started_at=now(),emergency_expires_at=v_expires_at,
    emergency_created_by=p_created_by;

  update private.quick_driver_tracking_tokens
  set active=false
  where delivery_id=p_delivery_id and driver_user_id=p_user_id and active=true;

  insert into private.quick_driver_tracking_tokens(
    delivery_id,driver_user_id,token_hash,active,created_by,created_at,expires_at
  )
  values(p_delivery_id,p_user_id,p_token_hash,true,p_created_by,now(),now()+interval '90 days');

  select coalesce(nullif(trim(p.full_name),''),'Repartidor emergencia '||right(v_phone_key,4))
  into v_name from public.profiles p where p.id=p_user_id;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,'user_id',p_user_id,'full_name',v_name,'phone',p_phone,
    'active',true,'driver_mode','EMERGENCY','emergency_started_at',now(),
    'emergency_expires_at',v_expires_at,'tracking_token_expires_at',now()+interval '90 days'
  );
end;
$function$;

create or replace function public.quick_driver_rotate_token(
  p_delivery_id uuid,p_user_id uuid,p_token_hash text,p_created_by uuid
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
  v_mode text;
  v_emergency_expires_at timestamptz;
begin
  perform public.delivery_cleanup_expired_emergency_drivers(p_delivery_id);

  select r.code into v_actor_role
  from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=p_created_by and p.active=true and r.active=true;

  if v_actor_role<>'DELIVERY_ADMIN'
     or not exists(
       select 1 from public.user_deliveries ud
       where ud.user_id=p_created_by and ud.delivery_id=p_delivery_id and ud.active=true
     )
  then raise exception 'HTPWEB: administrador DELIVERY no autorizado'; end if;

  select ud.driver_mode,ud.emergency_expires_at
  into v_mode,v_emergency_expires_at
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.code='DELIVERY_DRIVER' and r.active=true
  where ud.user_id=p_user_id and ud.delivery_id=p_delivery_id and ud.active=true;

  if v_mode is null then raise exception 'HTPWEB: repartidor no activo en este DELIVERY'; end if;

  if v_mode='EMERGENCY' and v_emergency_expires_at<=now()
     and not exists(
       select 1 from public.order_driver_assignments a
       join public.orders o on o.id=a.order_id
       where a.delivery_id=p_delivery_id and a.driver_user_id=p_user_id
         and a.status='ACTIVE' and a.unassigned_at is null
         and o.status in ('READY','EN_ROUTE')
     )
  then raise exception 'HTPWEB: el cupo de emergencia de este repartidor ya venció'; end if;

  update private.quick_driver_tracking_tokens
  set active=false
  where delivery_id=p_delivery_id and driver_user_id=p_user_id and active=true;

  insert into private.quick_driver_tracking_tokens(
    delivery_id,driver_user_id,token_hash,active,created_by,created_at,expires_at
  )
  values(p_delivery_id,p_user_id,p_token_hash,true,p_created_by,now(),now()+interval '90 days');

  select p.full_name,p.phone into v_name,v_phone from public.profiles p where p.id=p_user_id;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,'user_id',p_user_id,'full_name',v_name,'phone',v_phone,
    'active',true,'driver_mode',v_mode,'emergency_expires_at',v_emergency_expires_at,
    'tracking_token_expires_at',now()+interval '90 days'
  );
end;
$function$;

create or replace function public.delivery_set_driver(
  p_delivery_id uuid,p_user_id uuid,p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_target_role text;
  v_driver_role_id uuid;
  v_client_role_id uuid;
  v_limit integer;
  v_count integer;
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('users.manage')
  then raise exception 'HTPWEB: solo DELIVERY_ADMIN puede gestionar repartidores'; end if;

  perform public.delivery_cleanup_expired_emergency_drivers(p_delivery_id);

  select r.code into v_target_role
  from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=p_user_id and p.active=true and r.active=true;
  if v_target_role is null then raise exception 'HTPWEB: usuario inexistente o inactivo'; end if;

  if coalesce(p_active,false) then
    if v_target_role not in ('CLIENT','DELIVERY_DRIVER') then
      raise exception 'HTPWEB: usa una cuenta CLIENT o DELIVERY_DRIVER para el repartidor';
    end if;

    v_limit:=public.delivery_limit_value(p_delivery_id,'drivers.active.max');
    if v_limit is null or v_limit<=0 then raise exception 'HTPWEB: el plan no incluye repartidores activos'; end if;

    select count(*)::integer into v_count
    from public.user_deliveries ud
    join public.profiles p on p.id=ud.user_id and p.active=true
    join public.roles r on r.id=p.role_id and r.active=true
    where ud.delivery_id=p_delivery_id and ud.active=true and ud.user_id<>p_user_id
      and r.code='DELIVERY_DRIVER' and ud.driver_mode='REGULAR';

    if v_count>=v_limit then
      raise exception 'HTPWEB: el DELIVERY alcanzó el máximo de repartidores regulares activos (%)',v_limit;
    end if;

    if v_target_role='CLIENT' then
      select id into v_driver_role_id from public.roles
      where code='DELIVERY_DRIVER' and active=true limit 1;
      if v_driver_role_id is null then raise exception 'HTPWEB: rol DELIVERY_DRIVER no disponible'; end if;
      update public.profiles set role_id=v_driver_role_id,updated_at=now() where id=p_user_id;
    end if;

    insert into public.user_deliveries(
      user_id,delivery_id,active,created_at,driver_mode,
      emergency_started_at,emergency_expires_at,emergency_created_by
    )
    values(p_user_id,p_delivery_id,true,now(),'REGULAR',null,null,null)
    on conflict(user_id,delivery_id)
    do update set active=true,driver_mode='REGULAR',
      emergency_started_at=null,emergency_expires_at=null,emergency_created_by=null;
  else
    if exists(
      select 1 from public.order_driver_assignments a
      join public.orders o on o.id=a.order_id
      where a.delivery_id=p_delivery_id and a.driver_user_id=p_user_id
        and a.status='ACTIVE' and a.unassigned_at is null and o.status in ('READY','EN_ROUTE')
    ) then
      raise exception 'HTPWEB: el repartidor tiene pedidos activos; reasígnalos o complétalos antes de desactivarlo';
    end if;

    update public.user_deliveries
    set active=false,emergency_started_at=null,emergency_expires_at=null,emergency_created_by=null
    where user_id=p_user_id and delivery_id=p_delivery_id and active=true;

    update private.quick_driver_tracking_tokens
    set active=false
    where delivery_id=p_delivery_id and driver_user_id=p_user_id and active=true;

    if not exists(select 1 from public.user_deliveries where user_id=p_user_id and active=true) then
      select r.code into v_target_role
      from public.profiles p join public.roles r on r.id=p.role_id where p.id=p_user_id;
      if v_target_role='DELIVERY_DRIVER' then
        select id into v_client_role_id from public.roles where code='CLIENT' and active=true limit 1;
        update public.profiles set role_id=v_client_role_id,updated_at=now() where id=p_user_id;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,'user_id',p_user_id,
    'active',coalesce(p_active,false),
    'driver_mode',case when coalesce(p_active,false) then 'REGULAR' else null end
  );
end;
$function$;

create or replace function private.assign_order_driver_internal(
  p_delivery_id uuid,p_order_id uuid,p_driver_user_id uuid,
  p_assigned_by uuid default null,p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assignment uuid;
  v_current record;
  v_concurrent_limit integer;
  v_concurrent integer;
  v_regular_limit integer;
  v_regular_count integer;
  v_emergency_limit integer;
  v_emergency_count integer;
  v_driver record;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_delivery_id::text||':'||p_driver_user_id::text,0)
  );
  perform public.delivery_cleanup_expired_emergency_drivers(p_delivery_id);

  if not exists(
    select 1 from public.orders o
    where o.id=p_order_id and o.delivery_id=p_delivery_id and o.status='READY'
    for update
  ) then raise exception 'HTPWEB: solo se asignan repartidores a pedidos READY de este DELIVERY'; end if;

  select ud.driver_mode,ud.emergency_expires_at into v_driver
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.user_id=p_driver_user_id and ud.delivery_id=p_delivery_id
    and ud.active=true and r.code='DELIVERY_DRIVER';

  if v_driver.driver_mode is null then
    raise exception 'HTPWEB: repartidor inexistente o inactivo para este DELIVERY';
  end if;

  if v_driver.driver_mode='EMERGENCY'
     and (v_driver.emergency_expires_at is null or v_driver.emergency_expires_at<=now())
  then
    raise exception 'HTPWEB: el cupo de emergencia venció; este repartidor no puede recibir pedidos nuevos';
  end if;

  v_regular_limit:=public.delivery_limit_value(p_delivery_id,'drivers.active.max');
  v_emergency_limit:=public.delivery_limit_value(p_delivery_id,'drivers.emergency.max');

  select count(*)::integer into v_regular_count
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.delivery_id=p_delivery_id and ud.active=true
    and r.code='DELIVERY_DRIVER' and ud.driver_mode='REGULAR';

  select count(*)::integer into v_emergency_count
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.delivery_id=p_delivery_id and ud.active=true
    and r.code='DELIVERY_DRIVER' and ud.driver_mode='EMERGENCY';

  if v_regular_count>coalesce(v_regular_limit,0) then
    raise exception 'HTPWEB: la selección de repartidores regulares supera la capacidad del plan';
  end if;
  if v_emergency_count>coalesce(v_emergency_limit,0) then
    raise exception 'HTPWEB: la selección de repartidores de emergencia supera la capacidad del plan';
  end if;

  v_concurrent_limit:=private.effective_driver_concurrent_limit(p_delivery_id);
  if v_concurrent_limit<=0 then
    raise exception 'HTPWEB: el plan no define capacidad operativa por repartidor';
  end if;

  select a.* into v_current
  from public.order_driver_assignments a
  where a.order_id=p_order_id and a.status='ACTIVE' and a.unassigned_at is null
  limit 1 for update;

  if v_current.id is not null and v_current.driver_user_id=p_driver_user_id then
    return v_current.id;
  end if;

  select count(*)::integer into v_concurrent
  from public.order_driver_assignments a
  join public.orders o on o.id=a.order_id
  where a.driver_user_id=p_driver_user_id and a.delivery_id=p_delivery_id
    and a.status='ACTIVE' and a.unassigned_at is null and a.order_id<>p_order_id
    and o.status in ('READY','EN_ROUTE');

  if v_concurrent>=v_concurrent_limit then
    raise exception 'HTPWEB: el repartidor alcanzó su máximo efectivo de pedidos simultáneos (%)',v_concurrent_limit;
  end if;

  if v_current.id is not null then
    update public.order_driver_assignments
    set status='REASSIGNED',unassigned_at=now(),updated_at=now()
    where id=v_current.id;
  end if;

  insert into public.order_driver_assignments(
    order_id,delivery_id,driver_user_id,status,assigned_by,assigned_at,note
  )
  values(
    p_order_id,p_delivery_id,p_driver_user_id,'ACTIVE',p_assigned_by,now(),
    nullif(trim(coalesce(p_note,'')),'')
  )
  returning id into v_assignment;

  return v_assignment;
end;
$function$;

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
  ) then raise exception 'HTPWEB: no autorizado para consultar repartidores'; end if;

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
  where ud.delivery_id=p_delivery_id and ud.active=true and r.code='DELIVERY_DRIVER';

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',p.id,'full_name',p.full_name,'phone',p.phone,'active',ud.active,
    'driver_mode',ud.driver_mode,'emergency_started_at',ud.emergency_started_at,
    'emergency_expires_at',ud.emergency_expires_at,
    'emergency_grace',(
      ud.driver_mode='EMERGENCY'
      and ud.emergency_expires_at is not null
      and ud.emergency_expires_at<=now()
      and exists(
        select 1 from public.order_driver_assignments ax
        join public.orders ox on ox.id=ax.order_id
        where ax.driver_user_id=p.id and ax.delivery_id=p_delivery_id
          and ax.status='ACTIVE' and ax.unassigned_at is null
          and ox.status in ('READY','EN_ROUTE')
      )
    ),
    'active_orders',(
      select count(*)::integer
      from public.order_driver_assignments a
      join public.orders o on o.id=a.order_id
      where a.driver_user_id=p.id and a.delivery_id=p_delivery_id
        and a.status='ACTIVE' and a.unassigned_at is null
        and o.status in ('READY','EN_ROUTE')
    )
  ) order by case when ud.driver_mode='REGULAR' then 0 else 1 end,
    lower(coalesce(p.full_name,'')),p.id),'[]'::jsonb)
  into v_drivers
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.delivery_id=p_delivery_id and ud.active=true and r.code='DELIVERY_DRIVER';

  return jsonb_build_object(
    'delivery_id',p_delivery_id,'used',coalesce(v_regular_used,0),'limit',v_regular_limit,
    'regular_used',coalesce(v_regular_used,0),'regular_limit',v_regular_limit,
    'emergency_used',coalesce(v_emergency_used,0),'emergency_limit',v_emergency_limit,
    'total_active',coalesce(v_regular_used,0)+coalesce(v_emergency_used,0),
    'emergency_duration_hours',24,'concurrent_per_driver',v_concurrent_limit,
    'manual_dispatch',public.delivery_has_capability(p_delivery_id,'dispatch.manual'),
    'drivers',v_drivers
  );
end;
$function$;

create or replace function public.delivery_my_plan_summary(p_delivery_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  v_plan jsonb;
  v_features jsonb:='[]'::jsonb;
  v_assignment uuid;
  v_zones_used integer:=0;
  v_zones_max integer;
  v_areas_used integer:=0;
  v_areas_max integer;
  v_operators_used integer:=0;
  v_operators_max integer;
  v_drivers_used integer:=0;
  v_drivers_max integer;
  v_emergency_used integer:=0;
  v_emergency_max integer;
  v_selection_ready boolean:=true;
begin
  if not (
    public.is_master()
    or (
      public.current_role_code()='DELIVERY_ADMIN'
      and public.user_has_delivery(p_delivery_id)
    )
  ) then raise exception 'HTPWEB: no autorizado para consultar Mi Plan'; end if;

  v_plan:=public.delivery_plan_snapshot(p_delivery_id);

  if v_plan->'current' is not null
     and jsonb_typeof(v_plan->'current')='object'
     and nullif(v_plan->'current'->>'assignment_id','') is not null
  then
    v_assignment:=(v_plan->'current'->>'assignment_id')::uuid;
    select coalesce(jsonb_agg(jsonb_build_object(
      'code',s.code,'type',s.entitlement_type,'value',s.value,
      'family',coalesce(f.family,'Otros'),'label',coalesce(f.label,s.code),
      'unit',f.unit,'stage',coalesce(f.stage,1)
    ) order by coalesce(f.stage,1),coalesce(f.family,'Otros'),coalesce(f.display_order,9999),s.code),'[]'::jsonb)
    into v_features
    from public.plan_assignment_entitlements s
    left join public.plan_feature_catalog f on f.code=s.code
    where s.assignment_id=v_assignment;
  end if;

  select count(*)::integer into v_zones_used
  from public.delivery_zones where delivery_id=p_delivery_id and active=true;
  select count(*)::integer into v_areas_used
  from public.delivery_restricted_areas where delivery_id=p_delivery_id and active=true;

  select count(*)::integer into v_operators_used
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.delivery_id=p_delivery_id and ud.active=true and r.code='DELIVERY_OPERATOR';

  select count(*)::integer into v_drivers_used
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.delivery_id=p_delivery_id and ud.active=true
    and r.code='DELIVERY_DRIVER' and ud.driver_mode='REGULAR';

  select count(*)::integer into v_emergency_used
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.delivery_id=p_delivery_id and ud.active=true
    and r.code='DELIVERY_DRIVER' and ud.driver_mode='EMERGENCY'
    and (
      ud.emergency_expires_at>now()
      or exists(
        select 1 from public.order_driver_assignments a
        join public.orders o on o.id=a.order_id
        where a.delivery_id=p_delivery_id and a.driver_user_id=ud.user_id
          and a.status='ACTIVE' and a.unassigned_at is null
          and o.status in ('READY','EN_ROUTE')
      )
    );

  v_zones_max:=public.delivery_limit_value(p_delivery_id,'zones.active.max');
  v_areas_max:=public.delivery_limit_value(p_delivery_id,'restricted_areas.active.max');
  v_operators_max:=public.delivery_limit_value(p_delivery_id,'operators.active.max');
  v_drivers_max:=public.delivery_limit_value(p_delivery_id,'drivers.active.max');
  v_emergency_max:=public.delivery_limit_value(p_delivery_id,'drivers.emergency.max');
  v_selection_ready:=public.delivery_plan_selection_ready(p_delivery_id);

  return jsonb_build_object(
    'delivery_id',p_delivery_id,'plan',v_plan,'features',coalesce(v_features,'[]'::jsonb),
    'selection_ready',coalesce(v_selection_ready,true),
    'usage',jsonb_build_object(
      'zones',jsonb_build_object('used',coalesce(v_zones_used,0),'max',v_zones_max,'stage',1,'configuration_section','coverage'),
      'restricted_areas',jsonb_build_object('used',coalesce(v_areas_used,0),'max',v_areas_max,'stage',1,'configuration_section','security'),
      'operators',jsonb_build_object('used',coalesce(v_operators_used,0),'max',v_operators_max,'stage',1),
      'drivers',jsonb_build_object('used',coalesce(v_drivers_used,0),'max',v_drivers_max,'stage',2,'usage_available',true,'configuration_section','drivers'),
      'emergency_drivers',jsonb_build_object('used',coalesce(v_emergency_used,0),'max',v_emergency_max,'stage',2,'usage_available',true,'configuration_section','drivers','duration_hours',24)
    )
  );
end;
$function$;

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
  select t.delivery_id,t.driver_user_id,t.expires_at,p.full_name,p.phone,
         d.name as delivery_name,ud.driver_mode,ud.emergency_expires_at
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
    raise exception 'HTPWEB: enlace de seguimiento inválido, vencido o emergencia finalizada';
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
    'driver_user_id',v_token.driver_user_id,'driver_name',v_token.full_name,'phone',v_token.phone,
    'driver_mode',v_token.driver_mode,'emergency_expires_at',v_token.emergency_expires_at,
    'emergency_grace',(v_token.driver_mode='EMERGENCY' and v_token.emergency_expires_at<=now() and jsonb_array_length(v_orders)>0),
    'gps_live',v_gps,'can_share',v_gps and jsonb_array_length(v_orders)>0,
    'orders',v_orders,'tracking_token_expires_at',v_token.expires_at
  );
end;
$function$;

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
    raise exception 'HTPWEB: enlace de seguimiento inválido, vencido o emergencia finalizada';
  end if;
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
  )
  values(
    v_token.delivery_id,v_token.driver_user_id,p_latitude,p_longitude,
    p_accuracy_m,p_heading_deg,p_speed_mps,v_captured_at,now()
  )
  on conflict(delivery_id,driver_user_id)
  do update set latitude=excluded.latitude,longitude=excluded.longitude,
    accuracy_m=excluded.accuracy_m,heading_deg=excluded.heading_deg,
    speed_mps=excluded.speed_mps,captured_at=excluded.captured_at,updated_at=now();

  v_history_days:=public.delivery_limit_value(v_token.delivery_id,'gps_history.days');
  if coalesce(v_history_days,0)>0 then
    insert into public.driver_location_history(
      delivery_id,driver_user_id,latitude,longitude,accuracy_m,heading_deg,speed_mps,captured_at,received_at
    )
    values(
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

create or replace function public.master_assign_commercial_plan(
  p_delivery_id uuid,p_plan_id uuid,p_effective_mode text default 'AUTO'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_plan record;
  v_current record;
  v_current_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_mode text:=upper(trim(coalesce(p_effective_mode,'AUTO')));
  v_change text;
  v_downgrade boolean:=false;
  v_reset boolean:=false;
  v_assignment uuid;
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if v_mode not in ('AUTO','NOW','NEXT_CYCLE') then raise exception 'HTPWEB: modo de vigencia inválido'; end if;
  if not exists(select 1 from public.deliveries d where d.id=p_delivery_id and d.active=true)
  then raise exception 'HTPWEB: DELIVERY inexistente o inactivo'; end if;

  select p.* into v_plan from public.subscription_plans p
  where p.id=p_plan_id and p.target_type='DELIVERY' and p.active=true;
  if v_plan.id is null then raise exception 'HTPWEB: plan comercial activo inexistente'; end if;

  select a.* into v_current from public.plan_assignments a
  where a.delivery_id=p_delivery_id and a.status in ('ACTIVE','TRIAL')
    and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())
  order by a.starts_at desc,a.created_at desc limit 1;
  v_current_id:=v_current.id;

  if v_current_id is null then
    v_change:='NEW';
  elsif v_current.plan_id=p_plan_id then
    v_change:='RENEW';
  else
    select exists(
      select 1
      from public.plan_assignment_entitlements olde
      left join public.plan_entitlements newe
        on newe.plan_id=p_plan_id and newe.entitlement_type=olde.entitlement_type and newe.code=olde.code
      where olde.assignment_id=v_current_id
        and (
          (olde.entitlement_type='LIMIT' and coalesce((newe.value#>>'{}')::numeric,0)<(olde.value#>>'{}')::numeric)
          or
          (olde.entitlement_type='CAPABILITY' and (olde.value#>>'{}')::boolean=true
            and coalesce((newe.value#>>'{}')::boolean,false)=false)
        )
    ) into v_downgrade;
    v_change:=case when v_downgrade then 'DOWNGRADE' else 'UPGRADE' end;
  end if;

  if v_mode='AUTO' then
    v_mode:=case when v_change in ('RENEW','DOWNGRADE') and v_current_id is not null
      then 'NEXT_CYCLE' else 'NOW' end;
  end if;

  update public.plan_assignments set status='CANCELLED',updated_at=now()
  where delivery_id=p_delivery_id and status in ('ACTIVE','TRIAL') and starts_at>now();

  if v_mode='NEXT_CYCLE' and v_current_id is not null and v_current.ends_at is not null then
    v_start:=v_current.ends_at;
  else
    v_start:=now();
    if v_current_id is not null then
      update public.plan_assignments
      set status='CANCELLED',
          ends_at=case when starts_at<now() then greatest(starts_at+interval '1 second',now()) else ends_at end,
          updated_at=now()
      where id=v_current_id;
    end if;
  end if;

  v_end:=v_start+make_interval(months=>v_plan.duration_months);

  if v_change='DOWNGRADE' and v_current_id is not null then
    select exists(
      select 1
      from public.plan_assignment_entitlements olde
      left join public.plan_entitlements newe
        on newe.plan_id=p_plan_id and newe.entitlement_type='LIMIT' and newe.code=olde.code
      where olde.assignment_id=v_current_id and olde.entitlement_type='LIMIT'
        and olde.code in (
          'zones.active.max','drivers.active.max','drivers.emergency.max',
          'operators.active.max','restricted_areas.active.max'
        )
        and coalesce((newe.value#>>'{}')::numeric,0)<(olde.value#>>'{}')::numeric
    ) into v_reset;
  end if;

  insert into public.plan_assignments(
    plan_id,delivery_id,status,starts_at,ends_at,assigned_by,metadata,
    plan_name_snapshot,price_snapshot,currency_snapshot,duration_months_snapshot,
    plan_version_snapshot,change_type,previous_assignment_id,selection_reset_required
  )
  values(
    p_plan_id,p_delivery_id,'ACTIVE',v_start,v_end,auth.uid(),
    jsonb_build_object('source','MASTER_PLAN_MODULE','effective_mode',v_mode,'plan_version',v_plan.plan_version),
    v_plan.name,v_plan.price,v_plan.currency,v_plan.duration_months,
    v_plan.plan_version,v_change,v_current_id,v_reset
  )
  returning id into v_assignment;

  insert into public.plan_assignment_entitlements(assignment_id,entitlement_type,code,value)
  select v_assignment,e.entitlement_type,e.code,e.value
  from public.plan_entitlements e where e.plan_id=p_plan_id;

  return jsonb_build_object(
    'assignment_id',v_assignment,'change_type',v_change,'effective_mode',v_mode,
    'plan_version',v_plan.plan_version,'starts_at',v_start,'ends_at',v_end,
    'selection_reset_required',v_reset
  );
end;
$function$;

create or replace function private.cleanup_emergency_after_order_terminal()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if tg_table_name='orders' then
    if new.status in ('DELIVERED','CANCELLED') and old.status is distinct from new.status then
      perform public.delivery_cleanup_expired_emergency_drivers(new.delivery_id);
    end if;
  elsif tg_table_name='order_driver_assignments' then
    if old.status is distinct from new.status or old.unassigned_at is distinct from new.unassigned_at then
      perform public.delivery_cleanup_expired_emergency_drivers(new.delivery_id);
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists htpweb_cleanup_emergency_order_terminal on public.orders;
create trigger htpweb_cleanup_emergency_order_terminal
after update of status on public.orders
for each row execute function private.cleanup_emergency_after_order_terminal();

drop trigger if exists htpweb_cleanup_emergency_assignment_change on public.order_driver_assignments;
create trigger htpweb_cleanup_emergency_assignment_change
after update of status,unassigned_at on public.order_driver_assignments
for each row execute function private.cleanup_emergency_after_order_terminal();