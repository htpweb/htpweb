insert into public.roles(code,name,description,active)
values(
  'DELIVERY_DRIVER',
  'Delivery Driver',
  'Repartidor operativo de un DELIVERY. Solo accede a entregas que le fueron asignadas.',
  true
)
on conflict(code) do update set
  name=excluded.name,
  description=excluded.description,
  active=true;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.code in ('dashboard.view','orders.view')
where r.code='DELIVERY_DRIVER'
on conflict do nothing;

create or replace function public.validate_user_delivery_role()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role_code text;
  v_role_active boolean;
  v_profile_active boolean;
begin
  select r.code,r.active,p.active
  into v_role_code,v_role_active,v_profile_active
  from public.profiles p
  left join public.roles r on r.id=p.role_id
  where p.id=new.user_id;

  if not found then
    raise exception 'HTPWEB: el usuario % no tiene profile',new.user_id;
  end if;

  if v_role_code is null then
    raise exception 'HTPWEB: el usuario % no tiene un rol asignado',new.user_id;
  end if;

  if v_role_active is not true then
    raise exception 'HTPWEB: el rol del usuario % está inactivo',new.user_id;
  end if;

  if v_role_code not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR','DELIVERY_DRIVER') then
    raise exception 'HTPWEB: el rol % no puede pertenecer a user_deliveries',v_role_code;
  end if;

  if new.active is true and v_profile_active is not true then
    raise exception 'HTPWEB: no se puede activar la relación de un profile inactivo';
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_user_delivery_role() from public,anon,authenticated;

create or replace function public.convert_profile_to_delivery_role(
  p_user_id uuid,
  p_role_code text,
  p_convert_customer boolean
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_current_role text;
  v_target_role text;
  v_target_role_id uuid;
begin
  v_target_role:=upper(trim(coalesce(p_role_code,'')));

  if v_target_role not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR','DELIVERY_DRIVER') then
    raise exception 'HTPWEB: role_code debe ser DELIVERY_ADMIN, DELIVERY_OPERATOR o DELIVERY_DRIVER';
  end if;

  select r.code into v_current_role
  from public.profiles p
  join public.roles r on r.id=p.role_id
  where p.id=p_user_id and p.active=true;

  if v_current_role is null then
    raise exception 'HTPWEB: profile inexistente o inactivo';
  end if;

  if v_current_role='MASTER' then
    raise exception 'HTPWEB: una cuenta MASTER no se convierte a DELIVERY';
  end if;

  if v_current_role='LOCAL_ADMIN' then
    raise exception 'HTPWEB: esta cuenta administra LOCAL; usa otra cuenta o migra su acceso antes de asignarla a DELIVERY';
  end if;

  if v_current_role='DELIVERY_ADMIN' and v_target_role<>'DELIVERY_ADMIN' then
    raise exception 'HTPWEB: una cuenta DELIVERY_ADMIN no puede degradarse automáticamente';
  end if;

  if v_current_role='DELIVERY_OPERATOR' and v_target_role='DELIVERY_DRIVER' then
    raise exception 'HTPWEB: una cuenta DELIVERY_OPERATOR no puede convertirse automáticamente en repartidor';
  end if;

  if v_current_role=v_target_role then return; end if;

  select r.id into v_target_role_id
  from public.roles r
  where r.code=v_target_role and r.active=true
  limit 1;

  if v_target_role_id is null then
    raise exception 'HTPWEB: rol destino inexistente o inactivo';
  end if;

  update public.profiles
  set role_id=v_target_role_id,updated_at=now()
  where id=p_user_id;
end;
$$;

revoke execute on function public.convert_profile_to_delivery_role(uuid,text,boolean)
  from public,anon,authenticated;
grant execute on function public.convert_profile_to_delivery_role(uuid,text,boolean)
  to service_role;

create table if not exists public.order_driver_assignments(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'ACTIVE'
    check(status in ('ACTIVE','COMPLETED','CANCELLED','REASSIGNED','UNASSIGNED')),
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists order_driver_assignments_one_active_order_idx
  on public.order_driver_assignments(order_id)
  where status='ACTIVE' and unassigned_at is null;

create index if not exists order_driver_assignments_driver_active_idx
  on public.order_driver_assignments(driver_user_id,delivery_id,status,assigned_at desc);

create index if not exists order_driver_assignments_delivery_status_idx
  on public.order_driver_assignments(delivery_id,status,assigned_at desc);

alter table public.order_driver_assignments enable row level security;
revoke all on table public.order_driver_assignments from anon,authenticated;

create or replace function public.delivery_driver_lookup(p_delivery_id uuid,p_identifier text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_identifier text:=trim(coalesce(p_identifier,''));
  v_phone_key text;
  v_result jsonb;
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('users.manage')
  then raise exception 'HTPWEB: no autorizado para buscar repartidores'; end if;

  if v_identifier='' then raise exception 'HTPWEB: escribe un correo o teléfono exacto'; end if;
  v_phone_key:=public.htp_normalize_contact_phone(v_identifier);

  select jsonb_build_object(
    'user_id',p.id,'full_name',p.full_name,'phone',p.phone,'email',u.email,
    'role_code',r.code,'active',p.active,
    'already_active',exists(
      select 1 from public.user_deliveries ud
      where ud.user_id=p.id and ud.delivery_id=p_delivery_id and ud.active=true
    )
  )
  into v_result
  from public.profiles p
  join public.roles r on r.id=p.role_id
  left join auth.users u on u.id=p.id
  where p.active=true
    and (
      (position('@' in v_identifier)>0 and lower(u.email)=lower(v_identifier))
      or
      (position('@' in v_identifier)=0 and v_phone_key is not null
       and public.htp_normalize_contact_phone(coalesce(p.phone,u.phone))=v_phone_key)
    )
  order by p.created_at
  limit 1;

  return v_result;
end;
$$;

revoke execute on function public.delivery_driver_lookup(uuid,text) from public,anon;
grant execute on function public.delivery_driver_lookup(uuid,text) to authenticated;

create or replace function public.delivery_set_driver(p_delivery_id uuid,p_user_id uuid,p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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

  select r.code into v_target_role
  from public.profiles p
  join public.roles r on r.id=p.role_id
  where p.id=p_user_id and p.active=true and r.active=true;

  if v_target_role is null then raise exception 'HTPWEB: usuario inexistente o inactivo'; end if;

  if coalesce(p_active,false) then
    if v_target_role not in ('CLIENT','DELIVERY_DRIVER') then
      raise exception 'HTPWEB: usa una cuenta CLIENT o DELIVERY_DRIVER para el repartidor';
    end if;

    v_limit:=public.delivery_limit_value(p_delivery_id,'drivers.active.max');
    if v_limit is null or v_limit<=0 then
      raise exception 'HTPWEB: el plan no incluye repartidores activos';
    end if;

    select count(*)::integer into v_count
    from public.user_deliveries ud
    join public.profiles p on p.id=ud.user_id and p.active=true
    join public.roles r on r.id=p.role_id and r.active=true
    where ud.delivery_id=p_delivery_id and ud.active=true
      and ud.user_id<>p_user_id and r.code='DELIVERY_DRIVER';

    if v_count>=v_limit then
      raise exception 'HTPWEB: el DELIVERY alcanzó el máximo de repartidores activos (%)',v_limit;
    end if;

    if v_target_role='CLIENT' then
      select id into v_driver_role_id
      from public.roles where code='DELIVERY_DRIVER' and active=true limit 1;
      if v_driver_role_id is null then raise exception 'HTPWEB: rol DELIVERY_DRIVER no disponible'; end if;
      update public.profiles set role_id=v_driver_role_id,updated_at=now() where id=p_user_id;
    end if;

    insert into public.user_deliveries(user_id,delivery_id,active,created_at)
    values(p_user_id,p_delivery_id,true,now())
    on conflict(user_id,delivery_id) do update set active=true;
  else
    if exists(
      select 1
      from public.order_driver_assignments a
      join public.orders o on o.id=a.order_id
      where a.delivery_id=p_delivery_id and a.driver_user_id=p_user_id
        and a.status='ACTIVE' and a.unassigned_at is null
        and o.status in ('READY','EN_ROUTE')
    ) then
      raise exception 'HTPWEB: el repartidor tiene pedidos activos; reasígnalos o complétalos antes de desactivarlo';
    end if;

    update public.user_deliveries
    set active=false
    where user_id=p_user_id and delivery_id=p_delivery_id and active=true;

    if not exists(select 1 from public.user_deliveries where user_id=p_user_id and active=true) then
      select r.code into v_target_role
      from public.profiles p join public.roles r on r.id=p.role_id
      where p.id=p_user_id;

      if v_target_role='DELIVERY_DRIVER' then
        select id into v_client_role_id from public.roles
        where code='CLIENT' and active=true limit 1;
        update public.profiles set role_id=v_client_role_id,updated_at=now() where id=p_user_id;
      end if;
    end if;
  end if;

  return jsonb_build_object('delivery_id',p_delivery_id,'user_id',p_user_id,'active',coalesce(p_active,false));
end;
$$;

revoke execute on function public.delivery_set_driver(uuid,uuid,boolean) from public,anon;
grant execute on function public.delivery_set_driver(uuid,uuid,boolean) to authenticated;

create or replace function public.delivery_drivers_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_limit integer;
  v_concurrent_limit integer;
  v_drivers jsonb;
begin
  if not (
    public.is_master()
    or (
      public.current_role_code() in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
      and public.user_has_delivery(p_delivery_id)
      and public.has_permission('orders.view')
    )
  ) then raise exception 'HTPWEB: no autorizado para consultar repartidores'; end if;

  v_limit:=public.delivery_limit_value(p_delivery_id,'drivers.active.max');
  v_concurrent_limit:=public.delivery_limit_value(p_delivery_id,'orders.concurrent_per_driver.max');

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',p.id,'full_name',p.full_name,'phone',p.phone,'active',ud.active,
    'active_orders',(
      select count(*)::integer
      from public.order_driver_assignments a
      join public.orders o on o.id=a.order_id
      where a.driver_user_id=p.id and a.delivery_id=p_delivery_id
        and a.status='ACTIVE' and a.unassigned_at is null
        and o.status in ('READY','EN_ROUTE')
    )
  ) order by lower(coalesce(p.full_name,'')),p.id),'[]'::jsonb)
  into v_drivers
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.delivery_id=p_delivery_id and ud.active=true and r.code='DELIVERY_DRIVER';

  return jsonb_build_object(
    'delivery_id',p_delivery_id,'used',jsonb_array_length(v_drivers),'limit',v_limit,
    'concurrent_per_driver',v_concurrent_limit,
    'manual_dispatch',public.delivery_has_capability(p_delivery_id,'dispatch.manual'),
    'drivers',v_drivers
  );
end;
$$;

revoke execute on function public.delivery_drivers_snapshot(uuid) from public,anon;
grant execute on function public.delivery_drivers_snapshot(uuid) to authenticated;

create or replace function public.delivery_dispatch_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_orders jsonb;
begin
  if public.current_role_code() not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.view')
  then raise exception 'HTPWEB: no autorizado para consultar despacho'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',o.id,'status',o.status,'customer_name',o.customer_name,
    'delivery_address',o.delivery_address,'total',o.total,'created_at',o.created_at,
    'assignment',case when a.id is null then null else jsonb_build_object(
      'assignment_id',a.id,'driver_user_id',a.driver_user_id,
      'driver_name',p.full_name,'assigned_at',a.assigned_at
    ) end
  ) order by o.created_at),'[]'::jsonb)
  into v_orders
  from public.orders o
  left join public.order_driver_assignments a
    on a.order_id=o.id and a.status='ACTIVE' and a.unassigned_at is null
  left join public.profiles p on p.id=a.driver_user_id
  where o.delivery_id=p_delivery_id and o.status in ('READY','EN_ROUTE');

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'manual_dispatch',public.delivery_has_capability(p_delivery_id,'dispatch.manual'),
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
declare
  v_assignment uuid;
  v_current record;
  v_concurrent_limit integer;
  v_concurrent integer;
  v_driver_limit integer;
  v_driver_count integer;
begin
  if public.current_role_code() not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.manage')
  then raise exception 'HTPWEB: no autorizado para asignar repartidores'; end if;

  if not public.delivery_has_capability(p_delivery_id,'dispatch.manual') then
    raise exception 'HTPWEB: el plan no incluye despacho manual';
  end if;

  if not exists(
    select 1 from public.orders
    where id=p_order_id and delivery_id=p_delivery_id and status='READY'
  ) then raise exception 'HTPWEB: solo se asignan repartidores a pedidos READY de este DELIVERY'; end if;

  if not exists(
    select 1
    from public.user_deliveries ud
    join public.profiles p on p.id=ud.user_id and p.active=true
    join public.roles r on r.id=p.role_id and r.active=true
    where ud.user_id=p_driver_user_id and ud.delivery_id=p_delivery_id
      and ud.active=true and r.code='DELIVERY_DRIVER'
  ) then raise exception 'HTPWEB: repartidor inexistente o inactivo para este DELIVERY'; end if;

  v_driver_limit:=public.delivery_limit_value(p_delivery_id,'drivers.active.max');

  select count(*)::integer into v_driver_count
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.delivery_id=p_delivery_id and ud.active=true and r.code='DELIVERY_DRIVER';

  if v_driver_limit is null or v_driver_limit<=0 or v_driver_count>v_driver_limit then
    raise exception 'HTPWEB: la selección de repartidores supera la capacidad del plan';
  end if;

  v_concurrent_limit:=public.delivery_limit_value(p_delivery_id,'orders.concurrent_per_driver.max');
  if v_concurrent_limit is null or v_concurrent_limit<=0 then
    raise exception 'HTPWEB: el plan no define pedidos simultáneos por repartidor';
  end if;

  select a.* into v_current
  from public.order_driver_assignments a
  where a.order_id=p_order_id and a.status='ACTIVE' and a.unassigned_at is null
  limit 1 for update;

  if v_current.id is not null and v_current.driver_user_id=p_driver_user_id then return v_current.id; end if;

  select count(*)::integer into v_concurrent
  from public.order_driver_assignments a
  join public.orders o on o.id=a.order_id
  where a.driver_user_id=p_driver_user_id and a.delivery_id=p_delivery_id
    and a.status='ACTIVE' and a.unassigned_at is null
    and a.order_id<>p_order_id and o.status in ('READY','EN_ROUTE');

  if v_concurrent>=v_concurrent_limit then
    raise exception 'HTPWEB: el repartidor alcanzó su máximo de pedidos simultáneos (%)',v_concurrent_limit;
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
    p_order_id,p_delivery_id,p_driver_user_id,'ACTIVE',auth.uid(),now(),
    nullif(trim(coalesce(p_note,'')),'')
  )
  returning id into v_assignment;

  return v_assignment;
end;
$$;

revoke execute on function public.delivery_assign_order_driver(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.delivery_assign_order_driver(uuid,uuid,uuid,text) to authenticated;

create or replace function public.delivery_unassign_order_driver(
  p_delivery_id uuid,p_order_id uuid,p_note text default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_assignment uuid;
begin
  if public.current_role_code() not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR')
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('orders.manage')
  then raise exception 'HTPWEB: no autorizado para quitar repartidores'; end if;

  if not public.delivery_has_capability(p_delivery_id,'dispatch.manual') then
    raise exception 'HTPWEB: el plan no incluye despacho manual';
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
begin
  if old.status='READY' and new.status='EN_ROUTE'
     and public.delivery_has_capability(new.delivery_id,'dispatch.manual')
     and not exists(
       select 1 from public.order_driver_assignments a
       where a.order_id=new.id and a.delivery_id=new.delivery_id
         and a.status='ACTIVE' and a.unassigned_at is null
     )
  then raise exception 'HTPWEB: asigna un repartidor antes de marcar el pedido EN_ROUTE'; end if;
  return new;
end;
$$;

revoke execute on function public.enforce_manual_dispatch_assignment() from public,anon,authenticated;

drop trigger if exists trg_orders_require_driver_for_manual_dispatch on public.orders;
create trigger trg_orders_require_driver_for_manual_dispatch
before update of status on public.orders
for each row when (old.status is distinct from new.status)
execute function public.enforce_manual_dispatch_assignment();

create or replace function public.sync_order_driver_assignment_terminal()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status in ('DELIVERED','CANCELLED') then
    update public.order_driver_assignments
    set status=case when new.status='DELIVERED' then 'COMPLETED' else 'CANCELLED' end,
        unassigned_at=coalesce(unassigned_at,now()),updated_at=now()
    where order_id=new.id and status='ACTIVE' and unassigned_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_order_driver_assignment_terminal() from public,anon,authenticated;

drop trigger if exists trg_orders_close_driver_assignment on public.orders;
create trigger trg_orders_close_driver_assignment
after update of status on public.orders
for each row when (old.status is distinct from new.status)
execute function public.sync_order_driver_assignment_terminal();

create or replace function public.driver_my_orders()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v jsonb;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'assignment_id',a.id,'delivery_id',a.delivery_id,'delivery_name',d.name,
    'order_id',o.id,'status',o.status,'assignment_status',a.status,
    'customer_name',o.customer_name,'customer_phone',o.customer_phone,
    'delivery_address',o.delivery_address,'latitude',o.latitude,'longitude',o.longitude,
    'address_reference',o.address_reference,'total',o.total,'assigned_at',a.assigned_at,
    'en_route_at',o.en_route_at,'delivered_at',o.delivered_at
  ) order by case when a.status='ACTIVE' then 0 else 1 end,a.assigned_at desc),'[]'::jsonb)
  into v
  from public.order_driver_assignments a
  join public.orders o on o.id=a.order_id
  join public.deliveries d on d.id=a.delivery_id and d.active=true
  join public.user_deliveries ud
    on ud.user_id=auth.uid() and ud.delivery_id=a.delivery_id and ud.active=true
  where a.driver_user_id=auth.uid()
    and (a.status='ACTIVE' or (a.status='COMPLETED' and a.unassigned_at>=now()-interval '7 days'));

  return v;
end;
$$;

revoke execute on function public.driver_my_orders() from public,anon;
grant execute on function public.driver_my_orders() to authenticated;

create or replace function public.driver_set_order_status(
  p_order_id uuid,p_new_status text,p_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_old_status text;
  v_new_status text:=upper(trim(coalesce(p_new_status,'')));
  v_delivery_id uuid;
begin
  if public.current_role_code()<>'DELIVERY_DRIVER' then
    raise exception 'HTPWEB: acceso exclusivo para repartidores';
  end if;

  if v_new_status not in ('EN_ROUTE','DELIVERED') then
    raise exception 'HTPWEB: el repartidor solo puede marcar EN_ROUTE o DELIVERED';
  end if;

  select o.status,o.delivery_id into v_old_status,v_delivery_id
  from public.orders o
  join public.order_driver_assignments a
    on a.order_id=o.id and a.driver_user_id=auth.uid()
   and a.delivery_id=o.delivery_id and a.status='ACTIVE' and a.unassigned_at is null
  join public.user_deliveries ud
    on ud.user_id=auth.uid() and ud.delivery_id=o.delivery_id and ud.active=true
  where o.id=p_order_id and public.delivery_service_is_active(o.delivery_id)
  for update of o;

  if not found then raise exception 'HTPWEB: pedido no asignado o no disponible para este repartidor'; end if;

  if not (
    (v_old_status='READY' and v_new_status='EN_ROUTE')
    or (v_old_status='EN_ROUTE' and v_new_status='DELIVERED')
  ) then raise exception 'HTPWEB: transición de repartidor inválida: % → %',v_old_status,v_new_status; end if;

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
    p_order_id,null,v_old_status,v_new_status,auth.uid(),'DELIVERY_DRIVER',
    nullif(trim(coalesce(p_note,'')),''),now()
  );
end;
$$;

revoke execute on function public.driver_set_order_status(uuid,text,text) from public,anon;
grant execute on function public.driver_set_order_status(uuid,text,text) to authenticated;

create or replace function public.master_unassign_delivery_user(p_user_id uuid,p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_client_role_id uuid;
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;

  if exists(
    select 1
    from public.order_driver_assignments a
    join public.orders o on o.id=a.order_id
    where a.driver_user_id=p_user_id and a.delivery_id=p_delivery_id
      and a.status='ACTIVE' and a.unassigned_at is null and o.status in ('READY','EN_ROUTE')
  ) then raise exception 'HTPWEB: el usuario tiene entregas activas y no puede desvincularse'; end if;

  update public.user_deliveries
  set active=false
  where user_id=p_user_id and delivery_id=p_delivery_id and active=true;

  if not exists(select 1 from public.user_deliveries where user_id=p_user_id and active=true)
     and exists(
       select 1 from public.profiles p join public.roles r on r.id=p.role_id
       where p.id=p_user_id and r.code in ('DELIVERY_ADMIN','DELIVERY_OPERATOR','DELIVERY_DRIVER')
     )
  then
    select id into v_client_role_id from public.roles where code='CLIENT' and active=true limit 1;
    if v_client_role_id is null then raise exception 'HTPWEB: no existe rol CLIENT activo'; end if;
    update public.profiles set role_id=v_client_role_id,updated_at=now() where id=p_user_id;
  end if;
end;
$$;

create or replace function public.delivery_my_plan_summary(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
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
  v_selection_ready boolean:=true;
begin
  if not (
    public.is_master()
    or (public.current_role_code()='DELIVERY_ADMIN' and public.user_has_delivery(p_delivery_id))
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
  where ud.delivery_id=p_delivery_id and ud.active=true and r.code='DELIVERY_DRIVER';

  v_zones_max:=public.delivery_limit_value(p_delivery_id,'zones.active.max');
  v_areas_max:=public.delivery_limit_value(p_delivery_id,'restricted_areas.active.max');
  v_operators_max:=public.delivery_limit_value(p_delivery_id,'operators.active.max');
  v_drivers_max:=public.delivery_limit_value(p_delivery_id,'drivers.active.max');
  v_selection_ready:=public.delivery_plan_selection_ready(p_delivery_id);

  return jsonb_build_object(
    'delivery_id',p_delivery_id,'plan',v_plan,'features',coalesce(v_features,'[]'::jsonb),
    'selection_ready',coalesce(v_selection_ready,true),
    'usage',jsonb_build_object(
      'zones',jsonb_build_object('used',coalesce(v_zones_used,0),'max',v_zones_max,'stage',1,'configuration_section','coverage'),
      'restricted_areas',jsonb_build_object('used',coalesce(v_areas_used,0),'max',v_areas_max,'stage',1,'configuration_section','security'),
      'operators',jsonb_build_object('used',coalesce(v_operators_used,0),'max',v_operators_max,'stage',1),
      'drivers',jsonb_build_object('used',coalesce(v_drivers_used,0),'max',v_drivers_max,'stage',2,'usage_available',true,'configuration_section','drivers')
    )
  );
end;
$$;
