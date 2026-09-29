create table if not exists private.driver_order_routes(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_user_id uuid not null references public.profiles(id) on delete restrict,
  version integer not null check(version>0),
  source text not null check(source in ('MANUAL','AUTO')),
  route jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id,version)
);

create unique index if not exists driver_order_routes_one_active_idx
  on private.driver_order_routes(order_id)
  where active=true;

create index if not exists driver_order_routes_delivery_order_idx
  on private.driver_order_routes(delivery_id,order_id,created_at desc);

create index if not exists driver_order_routes_driver_idx
  on private.driver_order_routes(delivery_id,driver_user_id,created_at desc);

alter table private.driver_order_routes enable row level security;
revoke all on table private.driver_order_routes from public,anon,authenticated;

drop policy if exists driver_order_routes_deny_all on private.driver_order_routes;
create policy driver_order_routes_deny_all
on private.driver_order_routes
for all
to public
using(false)
with check(false);

create or replace function private.driver_order_route_valid(p_order_id uuid,p_route jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path=''
as $function$
declare
  v_geometry jsonb;
  v_coordinates jsonb;
  v_point jsonb;
  i integer;
  v_lng numeric;
  v_lat numeric;
begin
  if p_order_id is null or p_route is null or jsonb_typeof(p_route)<>'object' then return false; end if;
  if coalesce(p_route->>'order_id','')<>p_order_id::text then return false; end if;
  if jsonb_typeof(p_route->'stops')<>'array' then return false; end if;

  v_geometry:=p_route->'geometry';
  if jsonb_typeof(v_geometry)<>'object' or v_geometry->>'type'<>'LineString' then return false; end if;
  v_coordinates:=v_geometry->'coordinates';
  if jsonb_typeof(v_coordinates)<>'array'
     or jsonb_array_length(v_coordinates)<2
     or jsonb_array_length(v_coordinates)>10000
  then return false; end if;

  for i in 0..jsonb_array_length(v_coordinates)-1 loop
    v_point:=v_coordinates->i;
    if jsonb_typeof(v_point)<>'array' or jsonb_array_length(v_point)<2 then return false; end if;
    begin
      v_lng:=(v_point->>0)::numeric;
      v_lat:=(v_point->>1)::numeric;
    exception when others then
      return false;
    end;
    if v_lng<-180 or v_lng>180 or v_lat<-90 or v_lat>90 then return false; end if;
  end loop;
  return true;
end;
$function$;

revoke execute on function private.driver_order_route_valid(uuid,jsonb)
from public,anon,authenticated;

create or replace function public.quick_driver_route_snapshot(p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_token record;
  v_routes jsonb;
begin
  select t.delivery_id,t.driver_user_id
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
        select 1
        from public.order_driver_assignments ax
        join public.orders ox on ox.id=ax.order_id
        where ax.delivery_id=ud.delivery_id
          and ax.driver_user_id=ud.user_id
          and ax.status='ACTIVE'
          and ax.unassigned_at is null
          and ox.status in ('READY','EN_ROUTE')
      )
    )
  limit 1;

  if not found then
    raise exception 'HTPWEB: acceso de repartidor inválido o vencido';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',r.order_id,
    'delivery_id',r.delivery_id,
    'version',r.version,
    'source',r.source,
    'route',r.route,
    'updated_at',r.updated_at
  ) order by r.order_id),'[]'::jsonb)
  into v_routes
  from private.driver_order_routes r
  join public.orders o on o.id=r.order_id and o.delivery_id=r.delivery_id
  join public.order_driver_assignments a
    on a.order_id=r.order_id
   and a.delivery_id=r.delivery_id
   and a.driver_user_id=r.driver_user_id
   and a.status='ACTIVE'
   and a.unassigned_at is null
  where r.delivery_id=v_token.delivery_id
    and r.driver_user_id=v_token.driver_user_id
    and r.active=true
    and o.status in ('READY','EN_ROUTE');

  return jsonb_build_object('routes',coalesce(v_routes,'[]'::jsonb));
end;
$function$;

revoke all on function public.quick_driver_route_snapshot(text)
from public,anon,authenticated;
grant execute on function public.quick_driver_route_snapshot(text)
to service_role;

create or replace function public.quick_driver_register_active_route(
  p_token_hash text,
  p_order_id uuid,
  p_route jsonb,
  p_source text default 'MANUAL'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_token record;
  v_order_status text;
  v_source text:=upper(trim(coalesce(p_source,'MANUAL')));
  v_version integer;
  v_payload jsonb;
begin
  if v_source not in ('MANUAL','AUTO') then
    raise exception 'HTPWEB: origen de ruta inválido';
  end if;

  select t.delivery_id,t.driver_user_id
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
        select 1
        from public.order_driver_assignments ax
        join public.orders ox on ox.id=ax.order_id
        where ax.delivery_id=ud.delivery_id
          and ax.driver_user_id=ud.user_id
          and ax.status='ACTIVE'
          and ax.unassigned_at is null
          and ox.status in ('READY','EN_ROUTE')
      )
    )
  limit 1;

  if not found then
    raise exception 'HTPWEB: acceso de repartidor inválido o vencido';
  end if;

  select o.status
  into v_order_status
  from public.orders o
  join public.order_driver_assignments a
    on a.order_id=o.id
   and a.delivery_id=o.delivery_id
   and a.driver_user_id=v_token.driver_user_id
   and a.status='ACTIVE'
   and a.unassigned_at is null
  where o.id=p_order_id
    and o.delivery_id=v_token.delivery_id
    and o.status in ('READY','EN_ROUTE')
  for update of o;

  if v_order_status is null then
    raise exception 'HTPWEB: pedido no asignado o no disponible para esta ruta';
  end if;

  if not private.driver_order_route_valid(p_order_id,p_route) then
    raise exception 'HTPWEB: geometría de ruta inválida';
  end if;

  select coalesce(max(r.version),0)+1
  into v_version
  from private.driver_order_routes r
  where r.order_id=p_order_id;

  update private.driver_order_routes
  set active=false,updated_at=now()
  where order_id=p_order_id and active=true;

  insert into private.driver_order_routes(
    order_id,delivery_id,driver_user_id,version,source,route,active,created_at,updated_at
  ) values(
    p_order_id,v_token.delivery_id,v_token.driver_user_id,v_version,v_source,p_route,true,now(),now()
  );

  v_payload:=jsonb_build_object(
    'order_id',p_order_id,
    'delivery_id',v_token.delivery_id,
    'version',v_version,
    'source',v_source,
    'route',p_route,
    'updated_at',now()
  );

  perform realtime.send(
    v_payload,
    'route_updated',
    'order-tracking:'||p_order_id::text,
    true
  );

  return v_payload;
end;
$function$;

revoke all on function public.quick_driver_register_active_route(text,uuid,jsonb,text)
from public,anon,authenticated;
grant execute on function public.quick_driver_register_active_route(text,uuid,jsonb,text)
to service_role;

create or replace function public.delivery_order_routes_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_routes jsonb;
begin
  if p_delivery_id is null then
    raise exception 'HTPWEB: delivery_id es obligatorio';
  end if;

  if not public.is_master()
     and not public.user_can_manage_delivery_resource(
       p_delivery_id,
       'orders.view',
       'orders.manage'
     )
  then
    raise exception 'HTPWEB: no autorizado para consultar rutas vigentes';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',r.order_id,
    'delivery_id',r.delivery_id,
    'version',r.version,
    'source',r.source,
    'route',r.route,
    'updated_at',r.updated_at
  ) order by r.updated_at desc),'[]'::jsonb)
  into v_routes
  from private.driver_order_routes r
  join public.orders o on o.id=r.order_id and o.delivery_id=r.delivery_id
  where r.delivery_id=p_delivery_id
    and r.active=true
    and o.status in ('READY','EN_ROUTE')
    and exists(
      select 1
      from public.order_driver_assignments a
      where a.order_id=r.order_id
        and a.delivery_id=r.delivery_id
        and a.driver_user_id=r.driver_user_id
        and a.status='ACTIVE'
        and a.unassigned_at is null
    );

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'generated_at',now(),
    'routes',coalesce(v_routes,'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.delivery_order_routes_snapshot(uuid)
from public,anon;
grant execute on function public.delivery_order_routes_snapshot(uuid)
to authenticated,service_role;

create or replace function private.driver_order_routes_terminal()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status in ('DELIVERED','CANCELLED')
     and old.status is distinct from new.status
  then
    update private.driver_order_routes
    set active=false,updated_at=now()
    where order_id=new.id and active=true;
  end if;
  return new;
end;
$function$;

revoke execute on function private.driver_order_routes_terminal()
from public,anon,authenticated;

drop trigger if exists trg_orders_driver_order_routes_terminal on public.orders;
create trigger trg_orders_driver_order_routes_terminal
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function private.driver_order_routes_terminal();
