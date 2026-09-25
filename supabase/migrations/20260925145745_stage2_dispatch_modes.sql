create table if not exists private.delivery_dispatch_settings(
  delivery_id uuid primary key references public.deliveries(id) on delete cascade,
  mode text not null check (mode in ('MANUAL','HYBRID','AUTO')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table private.delivery_dispatch_settings enable row level security;
revoke all on table private.delivery_dispatch_settings from public,anon,authenticated;

create or replace function private.dispatch_mode_allowed(p_delivery_id uuid,p_mode text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case upper(coalesce(p_mode,''))
    when 'MANUAL' then public.delivery_has_capability(p_delivery_id,'dispatch.manual')
    when 'HYBRID' then public.delivery_has_capability(p_delivery_id,'dispatch.hybrid')
    when 'AUTO' then public.delivery_has_capability(p_delivery_id,'dispatch.auto')
    else false
  end;
$$;

revoke execute on function private.dispatch_mode_allowed(uuid,text) from public,anon,authenticated;

create or replace function private.dispatch_allowed_modes(p_delivery_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(jsonb_agg(x.mode order by x.ord),'[]'::jsonb)
  from (
    select 'MANUAL'::text mode,10 ord
    where public.delivery_has_capability(p_delivery_id,'dispatch.manual')
    union all
    select 'HYBRID',20
    where public.delivery_has_capability(p_delivery_id,'dispatch.hybrid')
    union all
    select 'AUTO',30
    where public.delivery_has_capability(p_delivery_id,'dispatch.auto')
  ) x;
$$;

revoke execute on function private.dispatch_allowed_modes(uuid) from public,anon,authenticated;

create or replace function private.effective_dispatch_mode(p_delivery_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_configured text;
begin
  select s.mode into v_configured
  from private.delivery_dispatch_settings s
  where s.delivery_id=p_delivery_id;

  if v_configured is not null
     and private.dispatch_mode_allowed(p_delivery_id,v_configured)
  then
    return v_configured;
  end if;

  if public.delivery_has_capability(p_delivery_id,'dispatch.manual') then return 'MANUAL'; end if;
  if public.delivery_has_capability(p_delivery_id,'dispatch.hybrid') then return 'HYBRID'; end if;
  if public.delivery_has_capability(p_delivery_id,'dispatch.auto') then return 'AUTO'; end if;
  return 'NONE';
end;
$$;

revoke execute on function private.effective_dispatch_mode(uuid) from public,anon,authenticated;

create or replace function private.effective_driver_concurrent_limit(p_delivery_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base integer;
begin
  v_base:=public.delivery_limit_value(p_delivery_id,'orders.concurrent_per_driver.max');
  if v_base is null or v_base<=0 then return 0; end if;

  if public.delivery_has_capability(p_delivery_id,'multi_order') then
    return v_base;
  end if;

  return least(v_base,1);
end;
$$;

revoke execute on function private.effective_driver_concurrent_limit(uuid) from public,anon,authenticated;

create or replace function private.dispatch_pick_driver(
  p_delivery_id uuid,
  p_order_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_limit integer;
  v_driver uuid;
begin
  v_limit:=private.effective_driver_concurrent_limit(p_delivery_id);
  if v_limit<=0 then return null; end if;

  select ud.user_id
  into v_driver
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true and r.code='DELIVERY_DRIVER'
  left join lateral (
    select count(*)::integer active_orders,max(a.assigned_at) last_assigned
    from public.order_driver_assignments a
    join public.orders o on o.id=a.order_id
    where a.delivery_id=p_delivery_id
      and a.driver_user_id=ud.user_id
      and a.status='ACTIVE'
      and a.unassigned_at is null
      and (p_order_id is null or a.order_id<>p_order_id)
      and o.status in ('READY','EN_ROUTE')
  ) load on true
  where ud.delivery_id=p_delivery_id
    and ud.active=true
    and coalesce(load.active_orders,0)<v_limit
  order by coalesce(load.active_orders,0),load.last_assigned nulls first,ud.user_id
  limit 1;

  return v_driver;
end;
$$;

revoke execute on function private.dispatch_pick_driver(uuid,uuid) from public,anon,authenticated;

create or replace function private.assign_order_driver_internal(
  p_delivery_id uuid,
  p_order_id uuid,
  p_driver_user_id uuid,
  p_assigned_by uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_assignment uuid;
  v_current record;
  v_concurrent_limit integer;
  v_concurrent integer;
  v_driver_limit integer;
  v_driver_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_delivery_id::text||':'||p_driver_user_id::text,0)
  );

  if not exists(
    select 1 from public.orders o
    where o.id=p_order_id and o.delivery_id=p_delivery_id and o.status='READY'
    for update
  ) then
    raise exception 'HTPWEB: solo se asignan repartidores a pedidos READY de este DELIVERY';
  end if;

  if not exists(
    select 1
    from public.user_deliveries ud
    join public.profiles p on p.id=ud.user_id and p.active=true
    join public.roles r on r.id=p.role_id and r.active=true
    where ud.user_id=p_driver_user_id
      and ud.delivery_id=p_delivery_id
      and ud.active=true
      and r.code='DELIVERY_DRIVER'
  ) then
    raise exception 'HTPWEB: repartidor inexistente o inactivo para este DELIVERY';
  end if;

  v_driver_limit:=public.delivery_limit_value(p_delivery_id,'drivers.active.max');

  select count(*)::integer into v_driver_count
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.delivery_id=p_delivery_id
    and ud.active=true
    and r.code='DELIVERY_DRIVER';

  if v_driver_limit is null or v_driver_limit<=0 or v_driver_count>v_driver_limit then
    raise exception 'HTPWEB: la selección de repartidores supera la capacidad del plan';
  end if;

  v_concurrent_limit:=private.effective_driver_concurrent_limit(p_delivery_id);
  if v_concurrent_limit<=0 then
    raise exception 'HTPWEB: el plan no define capacidad operativa por repartidor';
  end if;

  select a.* into v_current
  from public.order_driver_assignments a
  where a.order_id=p_order_id
    and a.status='ACTIVE'
    and a.unassigned_at is null
  limit 1
  for update;

  if v_current.id is not null and v_current.driver_user_id=p_driver_user_id then
    return v_current.id;
  end if;

  select count(*)::integer into v_concurrent
  from public.order_driver_assignments a
  join public.orders o on o.id=a.order_id
  where a.driver_user_id=p_driver_user_id
    and a.delivery_id=p_delivery_id
    and a.status='ACTIVE'
    and a.unassigned_at is null
    and a.order_id<>p_order_id
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
$$;

revoke execute on function private.assign_order_driver_internal(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;

create or replace function private.try_auto_assign_order(p_delivery_id uuid,p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_driver uuid;
  v_assignment uuid;
begin
  if private.effective_dispatch_mode(p_delivery_id)<>'AUTO' then return null; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dispatch:'||p_delivery_id::text,0)
  );

  if exists(
    select 1 from public.order_driver_assignments a
    where a.order_id=p_order_id and a.status='ACTIVE' and a.unassigned_at is null
  ) then
    select a.id into v_assignment
    from public.order_driver_assignments a
    where a.order_id=p_order_id and a.status='ACTIVE' and a.unassigned_at is null
    limit 1;
    return v_assignment;
  end if;

  if not exists(
    select 1 from public.orders o
    where o.id=p_order_id and o.delivery_id=p_delivery_id and o.status='READY'
  ) then return null; end if;

  v_driver:=private.dispatch_pick_driver(p_delivery_id,p_order_id);
  if v_driver is null then return null; end if;

  return private.assign_order_driver_internal(
    p_delivery_id,p_order_id,v_driver,null,'AUTO'
  );
end;
$$;

revoke execute on function private.try_auto_assign_order(uuid,uuid) from public,anon,authenticated;

create or replace function private.auto_dispatch_delivery(p_delivery_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order record;
  v_driver uuid;
  v_count integer:=0;
begin
  if private.effective_dispatch_mode(p_delivery_id)<>'AUTO' then return 0; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('dispatch:'||p_delivery_id::text,0)
  );

  for v_order in
    select o.id
    from public.orders o
    where o.delivery_id=p_delivery_id
      and o.status='READY'
      and not exists(
        select 1 from public.order_driver_assignments a
        where a.order_id=o.id and a.status='ACTIVE' and a.unassigned_at is null
      )
    order by o.created_at,o.id
  loop
    v_driver:=private.dispatch_pick_driver(p_delivery_id,v_order.id);
    exit when v_driver is null;

    perform private.assign_order_driver_internal(
      p_delivery_id,v_order.id,v_driver,null,'AUTO'
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function private.auto_dispatch_delivery(uuid) from public,anon,authenticated;

create or replace function public.delivery_dispatch_mode_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_configured text;
begin
  if public.current_role_code() not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.view')
  then
    raise exception 'HTPWEB: no autorizado para consultar el modo de despacho';
  end if;

  select s.mode into v_configured
  from private.delivery_dispatch_settings s
  where s.delivery_id=p_delivery_id;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'configured_mode',v_configured,
    'mode',private.effective_dispatch_mode(p_delivery_id),
    'allowed_modes',private.dispatch_allowed_modes(p_delivery_id),
    'multi_order',public.delivery_has_capability(p_delivery_id,'multi_order'),
    'base_concurrent_per_driver',public.delivery_limit_value(p_delivery_id,'orders.concurrent_per_driver.max'),
    'concurrent_per_driver',private.effective_driver_concurrent_limit(p_delivery_id)
  );
end;
$$;

revoke execute on function public.delivery_dispatch_mode_snapshot(uuid) from public,anon;
grant execute on function public.delivery_dispatch_mode_snapshot(uuid) to authenticated;

create or replace function public.delivery_set_dispatch_mode(p_delivery_id uuid,p_mode text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_mode text:=upper(trim(coalesce(p_mode,'')));
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.manage')
  then
    raise exception 'HTPWEB: solo el administrador del DELIVERY puede cambiar el modo de despacho';
  end if;

  if v_mode not in ('MANUAL','HYBRID','AUTO') then
    raise exception 'HTPWEB: modo de despacho inválido';
  end if;

  if not private.dispatch_mode_allowed(p_delivery_id,v_mode) then
    raise exception 'HTPWEB: el plan vigente no incluye el modo de despacho %',v_mode;
  end if;

  insert into private.delivery_dispatch_settings(delivery_id,mode,updated_by,updated_at)
  values(p_delivery_id,v_mode,auth.uid(),now())
  on conflict(delivery_id)
  do update set mode=excluded.mode,updated_by=excluded.updated_by,updated_at=now();

  if v_mode='AUTO' then
    perform private.auto_dispatch_delivery(p_delivery_id);
  end if;

  return public.delivery_dispatch_mode_snapshot(p_delivery_id);
end;
$$;

revoke execute on function public.delivery_set_dispatch_mode(uuid,text) from public,anon;
grant execute on function public.delivery_set_dispatch_mode(uuid,text) to authenticated;

create or replace function public.delivery_dispatch_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_orders jsonb;
  v_mode text;
  v_configured text;
begin
  if public.current_role_code() not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.view')
  then raise exception 'HTPWEB: no autorizado para consultar despacho'; end if;

  v_mode:=private.effective_dispatch_mode(p_delivery_id);
  select s.mode into v_configured
  from private.delivery_dispatch_settings s
  where s.delivery_id=p_delivery_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',o.id,'status',o.status,'customer_name',o.customer_name,
    'delivery_address',o.delivery_address,'total',o.total,'created_at',o.created_at,
    'assignment',case when a.id is null then null else jsonb_build_object(
      'assignment_id',a.id,'driver_user_id',a.driver_user_id,
      'driver_name',p.full_name,'assigned_at',a.assigned_at
    ) end,
    'suggestion',case
      when s.suggested_user_id is null then null
      else jsonb_build_object(
        'driver_user_id',s.suggested_user_id,
        'driver_name',sp.full_name
      )
    end
  ) order by o.created_at),'[]'::jsonb)
  into v_orders
  from public.orders o
  left join public.order_driver_assignments a
    on a.order_id=o.id and a.status='ACTIVE' and a.unassigned_at is null
  left join public.profiles p on p.id=a.driver_user_id
  left join lateral (
    select case
      when v_mode='HYBRID' and o.status='READY' and a.id is null
      then private.dispatch_pick_driver(p_delivery_id,o.id)
      else null
    end suggested_user_id
  ) s on true
  left join public.profiles sp on sp.id=s.suggested_user_id
  where o.delivery_id=p_delivery_id and o.status in ('READY','EN_ROUTE');

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'configured_mode',v_configured,
    'mode',v_mode,
    'allowed_modes',private.dispatch_allowed_modes(p_delivery_id),
    'multi_order',public.delivery_has_capability(p_delivery_id,'multi_order'),
    'base_concurrent_per_driver',public.delivery_limit_value(p_delivery_id,'orders.concurrent_per_driver.max'),
    'concurrent_per_driver',private.effective_driver_concurrent_limit(p_delivery_id),
    'orders',v_orders
  );
end;
$$;

revoke execute on function public.delivery_dispatch_snapshot(uuid) from public,anon;
grant execute on function public.delivery_dispatch_snapshot(uuid) to authenticated;

create or replace function public.delivery_assign_order_driver(
  p_delivery_id uuid,p_order_id uuid,p_driver_user_id uuid,p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  if public.current_role_code() not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.manage')
  then raise exception 'HTPWEB: no autorizado para asignar repartidores'; end if;

  if private.effective_dispatch_mode(p_delivery_id)<>'MANUAL'
     or not public.delivery_has_capability(p_delivery_id,'dispatch.manual')
  then
    raise exception 'HTPWEB: el DELIVERY no está operando en modo MANUAL';
  end if;

  return private.assign_order_driver_internal(
    p_delivery_id,p_order_id,p_driver_user_id,auth.uid(),p_note
  );
end;
$$;

revoke execute on function public.delivery_assign_order_driver(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.delivery_assign_order_driver(uuid,uuid,uuid,text) to authenticated;

create or replace function public.delivery_accept_dispatch_suggestion(
  p_delivery_id uuid,p_order_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_driver uuid;
  v_existing_assignment uuid;
begin
  if public.current_role_code() not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.manage')
  then raise exception 'HTPWEB: no autorizado para confirmar sugerencias de despacho'; end if;

  if private.effective_dispatch_mode(p_delivery_id)<>'HYBRID'
     or not public.delivery_has_capability(p_delivery_id,'dispatch.hybrid')
  then
    raise exception 'HTPWEB: el DELIVERY no está operando en modo HYBRID';
  end if;

  select a.id
  into v_existing_assignment
  from public.order_driver_assignments a
  where a.order_id=p_order_id
    and a.delivery_id=p_delivery_id
    and a.status='ACTIVE'
    and a.unassigned_at is null
  limit 1;

  if v_existing_assignment is not null then
    return v_existing_assignment;
  end if;

  v_driver:=private.dispatch_pick_driver(p_delivery_id,p_order_id);
  if v_driver is null then
    raise exception 'HTPWEB: no hay repartidor con capacidad disponible';
  end if;

  return private.assign_order_driver_internal(
    p_delivery_id,p_order_id,v_driver,auth.uid(),'HYBRID_SUGGESTION'
  );
end;
$$;

revoke execute on function public.delivery_accept_dispatch_suggestion(uuid,uuid) from public,anon;
grant execute on function public.delivery_accept_dispatch_suggestion(uuid,uuid) to authenticated;

create or replace function public.delivery_unassign_order_driver(
  p_delivery_id uuid,p_order_id uuid,p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_assignment uuid;
  v_mode text;
begin
  if public.current_role_code() not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.manage')
  then raise exception 'HTPWEB: no autorizado para quitar repartidores'; end if;

  v_mode:=private.effective_dispatch_mode(p_delivery_id);
  if v_mode not in ('MANUAL','HYBRID') then
    raise exception 'HTPWEB: el modo % no permite quitar asignaciones manualmente',v_mode;
  end if;

  if not exists(
    select 1 from public.orders
    where id=p_order_id and delivery_id=p_delivery_id and status='READY'
  ) then raise exception 'HTPWEB: solo se puede quitar el repartidor mientras el pedido está READY'; end if;

  select id into v_assignment
  from public.order_driver_assignments
  where order_id=p_order_id and delivery_id=p_delivery_id
    and status='ACTIVE' and unassigned_at is null
  limit 1 for update;

  if v_assignment is null then return false; end if;

  update public.order_driver_assignments
  set status='UNASSIGNED',unassigned_at=now(),
      note=coalesce(nullif(trim(coalesce(p_note,'')),''),note),updated_at=now()
  where id=v_assignment;

  return true;
end;
$$;

revoke execute on function public.delivery_unassign_order_driver(uuid,uuid,text) from public,anon;
grant execute on function public.delivery_unassign_order_driver(uuid,uuid,text) to authenticated;

create or replace function public.enforce_manual_dispatch_assignment()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_mode text;
begin
  if old.status='READY' and new.status='EN_ROUTE' then
    v_mode:=private.effective_dispatch_mode(new.delivery_id);

    if v_mode<>'NONE'
       and not exists(
         select 1 from public.order_driver_assignments a
         where a.order_id=new.id
           and a.delivery_id=new.delivery_id
           and a.status='ACTIVE'
           and a.unassigned_at is null
       )
    then
      raise exception 'HTPWEB: el pedido requiere repartidor antes de pasar a EN_ROUTE (modo %)',v_mode;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_manual_dispatch_assignment() from public,anon,authenticated;

create or replace function private.orders_auto_dispatch()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='READY' and old.status is distinct from new.status then
    perform private.try_auto_assign_order(new.delivery_id,new.id);
  elsif new.status in ('DELIVERED','CANCELLED')
        and old.status is distinct from new.status
  then
    perform private.auto_dispatch_delivery(new.delivery_id);
  end if;

  return new;
end;
$$;

revoke execute on function private.orders_auto_dispatch() from public,anon,authenticated;

drop trigger if exists trg_zz_orders_auto_dispatch on public.orders;
create trigger trg_zz_orders_auto_dispatch
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function private.orders_auto_dispatch();

create or replace function private.driver_activation_auto_dispatch()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_became_active boolean:=false;
begin
  if tg_op='INSERT' then
    v_became_active:=new.active=true;
  elsif tg_op='UPDATE' then
    v_became_active:=new.active=true and old.active is distinct from new.active;
  end if;

  if v_became_active
     and exists(
       select 1
       from public.profiles p
       join public.roles r on r.id=p.role_id and r.active=true
       where p.id=new.user_id and p.active=true and r.code='DELIVERY_DRIVER'
     )
  then
    perform private.auto_dispatch_delivery(new.delivery_id);
  end if;

  return new;
end;
$$;

revoke execute on function private.driver_activation_auto_dispatch() from public,anon,authenticated;

drop trigger if exists trg_user_deliveries_auto_dispatch on public.user_deliveries;
create trigger trg_user_deliveries_auto_dispatch
after insert or update of active on public.user_deliveries
for each row
execute function private.driver_activation_auto_dispatch();
