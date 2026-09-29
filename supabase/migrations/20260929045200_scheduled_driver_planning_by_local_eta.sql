create table if not exists private.order_driver_plans(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'PLANNED'
    check (status in ('PLANNED','ACTIVATED','CANCELLED')),
  planned_for timestamptz not null,
  ideal_departure_at timestamptz,
  planned_by uuid references public.profiles(id) on delete set null,
  source text not null default 'MANUAL'
    check (source in ('MANUAL','HYBRID','AUTO')),
  note text,
  activation_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists idx_order_driver_plans_delivery_status
  on private.order_driver_plans(delivery_id,status,planned_for);

create index if not exists idx_order_driver_plans_driver_status
  on private.order_driver_plans(driver_user_id,status,planned_for);

alter table private.order_driver_plans enable row level security;
revoke all on table private.order_driver_plans from public,anon,authenticated;

drop policy if exists order_driver_plans_deny_all on private.order_driver_plans;
create policy order_driver_plans_deny_all
on private.order_driver_plans
for all to public
using (false)
with check (false);

create or replace function private.order_planned_ready_at(p_order_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path=''
as $function$
  select coalesce(
    max(ol.estimated_ready_at) filter (where ol.status<>'CANCELLED'),
    max(ol.ready_at) filter (where ol.status='READY'),
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
    and o.status in ('READY','EN_ROUTE');
$function$;

revoke all on function private.driver_projected_available_at(uuid,uuid,uuid)
from public,anon,authenticated;

create or replace function private.order_pickup_anchor(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'local_id',q.local_id,
    'local_name',q.local_name,
    'latitude',q.latitude,
    'longitude',q.longitude,
    'estimated_ready_at',q.estimated_ready_at
  )
  from (
    select
      ol.local_id,l.name local_name,l.latitude,l.longitude,
      coalesce(ol.estimated_ready_at,ol.ready_at,now()+interval '20 minutes') estimated_ready_at
    from public.order_locals ol
    join public.locals l on l.id=ol.local_id
    where ol.order_id=p_order_id
      and ol.status<>'CANCELLED'
    order by
      coalesce(ol.estimated_ready_at,ol.ready_at,now()+interval '20 minutes'),
      l.name
    limit 1
  ) q;
$function$;

revoke all on function private.order_pickup_anchor(uuid)
from public,anon,authenticated;

create or replace function private.driver_plan_suggestion_json(
  p_delivery_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_ready_at timestamptz;
  v_anchor jsonb;
  v_anchor_lat numeric;
  v_anchor_lng numeric;
  v_result jsonb;
begin
  if not exists(
    select 1 from public.orders o
    where o.id=p_order_id
      and o.delivery_id=p_delivery_id
      and o.status in ('CONFIRMED','PREPARING','READY')
  ) then
    return null;
  end if;

  v_ready_at:=private.order_planned_ready_at(p_order_id);
  v_anchor:=private.order_pickup_anchor(p_order_id);
  v_anchor_lat:=nullif(v_anchor->>'latitude','')::numeric;
  v_anchor_lng:=nullif(v_anchor->>'longitude','')::numeric;

  select jsonb_build_object(
    'driver_user_id',x.user_id,
    'driver_name',x.full_name,
    'driver_phone',x.phone,
    'driver_mode',x.driver_mode,
    'active_orders',x.active_orders,
    'planned_orders',x.planned_orders,
    'available_at',x.available_at,
    'planned_for',v_ready_at,
    'distance_km',x.distance_km,
    'travel_minutes',x.travel_minutes,
    'ideal_departure_at',x.ideal_departure_at,
    'score',round(x.score::numeric,2),
    'anchor',v_anchor
  )
  into v_result
  from (
    select c.*,
      abs(extract(epoch from (c.available_at-c.ideal_departure_at))/60)
        + c.active_orders*2
        + c.planned_orders*60
        + case when c.available_at>c.ideal_departure_at then
            extract(epoch from (c.available_at-c.ideal_departure_at))/60*2
          else 0 end as score
    from (
      select d.*,
        greatest(5,least(45,ceil(coalesce(d.distance_km,3)/25.0*60)::integer)) travel_minutes,
        v_ready_at
          - make_interval(mins=>greatest(5,least(45,ceil(coalesce(d.distance_km,3)/25.0*60)::integer)))
          - interval '5 minutes' as ideal_departure_at
      from (
        select
          ud.user_id,p.full_name,p.phone,ud.driver_mode,
          private.driver_projected_available_at(
            p_delivery_id,ud.user_id,p_order_id
          ) available_at,
          (
            select count(*)::integer
            from public.order_driver_assignments a
            join public.orders ao on ao.id=a.order_id
            where a.delivery_id=p_delivery_id
              and a.driver_user_id=ud.user_id
              and a.status='ACTIVE'
              and a.unassigned_at is null
              and a.order_id<>p_order_id
              and ao.status in ('READY','EN_ROUTE')
          ) active_orders,
          (
            select count(*)::integer
            from private.order_driver_plans pp
            where pp.delivery_id=p_delivery_id
              and pp.driver_user_id=ud.user_id
              and pp.status='PLANNED'
              and pp.order_id<>p_order_id
              and pp.planned_for between v_ready_at-interval '45 minutes'
                                     and v_ready_at+interval '45 minutes'
          ) planned_orders,
          case
            when dl.latitude is null or dl.longitude is null
              or v_anchor_lat is null or v_anchor_lng is null
            then null
            else 2*6371*asin(
              least(1::double precision,sqrt(
                power(sin(radians((v_anchor_lat::double precision-dl.latitude::double precision)/2)),2)
                + cos(radians(dl.latitude::double precision))
                * cos(radians(v_anchor_lat::double precision))
                * power(sin(radians((v_anchor_lng::double precision-dl.longitude::double precision)/2)),2)
              ))
            )
          end distance_km
        from public.user_deliveries ud
        join public.profiles p on p.id=ud.user_id and p.active=true
        join public.roles r on r.id=p.role_id and r.active=true and r.code='DELIVERY_DRIVER'
        left join public.driver_live_locations dl
          on dl.delivery_id=ud.delivery_id
         and dl.driver_user_id=ud.user_id
        where ud.delivery_id=p_delivery_id
          and ud.active=true
          and (
            ud.driver_mode<>'EMERGENCY'
            or ud.emergency_expires_at is null
            or ud.emergency_expires_at>now()
          )
      ) d
    ) c
  ) x
  order by x.score,x.active_orders,x.planned_orders,x.user_id
  limit 1;

  return v_result;
end;
$function$;

revoke all on function private.driver_plan_suggestion_json(uuid,uuid)
from public,anon,authenticated;

create or replace function public.delivery_driver_plan_suggestion(
  p_delivery_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not public.is_master()
     and not public.user_can_manage_delivery_resource(
       p_delivery_id,'orders.view','orders.manage'
     )
  then
    raise exception 'HTPWEB: no autorizado para consultar planificación de repartidor';
  end if;

  return private.driver_plan_suggestion_json(p_delivery_id,p_order_id);
end;
$function$;

revoke all on function public.delivery_driver_plan_suggestion(uuid,uuid)
from public,anon;
grant execute on function public.delivery_driver_plan_suggestion(uuid,uuid)
to authenticated,service_role;

create or replace function public.delivery_plan_order_driver(
  p_delivery_id uuid,
  p_order_id uuid,
  p_driver_user_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_mode text;
  v_driver uuid:=p_driver_user_id;
  v_source text;
  v_suggestion jsonb;
  v_ready_at timestamptz;
  v_ideal_departure timestamptz;
  v_plan_id uuid;
begin
  if not public.is_master()
     and not public.user_can_manage_delivery_resource(
       p_delivery_id,'orders.view','orders.manage'
     )
  then
    raise exception 'HTPWEB: no autorizado para programar repartidores';
  end if;

  if not exists(
    select 1 from public.orders o
    where o.id=p_order_id
      and o.delivery_id=p_delivery_id
      and o.status in ('CONFIRMED','PREPARING','READY')
    for update
  ) then
    raise exception 'HTPWEB: el pedido no admite programación de repartidor';
  end if;

  if exists(
    select 1 from public.order_driver_assignments a
    where a.order_id=p_order_id
      and a.status='ACTIVE'
      and a.unassigned_at is null
  ) then
    raise exception 'HTPWEB: el pedido ya tiene un repartidor asignado';
  end if;

  v_mode:=private.effective_dispatch_mode(p_delivery_id);
  v_suggestion:=private.driver_plan_suggestion_json(p_delivery_id,p_order_id);

  if v_driver is null then
    v_driver:=nullif(v_suggestion->>'driver_user_id','')::uuid;
  end if;

  if v_driver is null then
    raise exception 'HTPWEB: no hay repartidor disponible para programar';
  end if;

  if not exists(
    select 1
    from public.user_deliveries ud
    join public.profiles p on p.id=ud.user_id and p.active=true
    join public.roles r on r.id=p.role_id and r.active=true and r.code='DELIVERY_DRIVER'
    where ud.delivery_id=p_delivery_id
      and ud.user_id=v_driver
      and ud.active=true
      and (
        ud.driver_mode<>'EMERGENCY'
        or ud.emergency_expires_at is null
        or ud.emergency_expires_at>now()
      )
  ) then
    raise exception 'HTPWEB: repartidor inexistente o inactivo para este DELIVERY';
  end if;

  v_ready_at:=private.order_planned_ready_at(p_order_id);

  if v_suggestion is not null
     and nullif(v_suggestion->>'driver_user_id','')::uuid=v_driver
  then
    v_ideal_departure:=nullif(v_suggestion->>'ideal_departure_at','')::timestamptz;
  else
    v_ideal_departure:=v_ready_at-interval '10 minutes';
  end if;

  v_source:=case
    when v_mode='AUTO' then 'AUTO'
    when v_mode='HYBRID' then 'HYBRID'
    else 'MANUAL'
  end;

  insert into private.order_driver_plans(
    order_id,delivery_id,driver_user_id,status,planned_for,
    ideal_departure_at,planned_by,source,note,activation_error,
    created_at,updated_at,activated_at,cancelled_at
  )
  values(
    p_order_id,p_delivery_id,v_driver,'PLANNED',v_ready_at,
    v_ideal_departure,auth.uid(),v_source,
    nullif(trim(coalesce(p_note,'')),''),
    null,now(),now(),null,null
  )
  on conflict(order_id) do update
  set driver_user_id=excluded.driver_user_id,
      status='PLANNED',
      planned_for=excluded.planned_for,
      ideal_departure_at=excluded.ideal_departure_at,
      planned_by=excluded.planned_by,
      source=excluded.source,
      note=excluded.note,
      activation_error=null,
      updated_at=now(),
      activated_at=null,
      cancelled_at=null
  returning id into v_plan_id;

  return jsonb_build_object(
    'plan_id',v_plan_id,
    'order_id',p_order_id,
    'driver_user_id',v_driver,
    'planned_for',v_ready_at,
    'ideal_departure_at',v_ideal_departure,
    'source',v_source
  );
end;
$function$;

revoke all on function public.delivery_plan_order_driver(uuid,uuid,uuid,text)
from public,anon;
grant execute on function public.delivery_plan_order_driver(uuid,uuid,uuid,text)
to authenticated,service_role;

create or replace function public.delivery_cancel_order_driver_plan(
  p_delivery_id uuid,
  p_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not public.is_master()
     and not public.user_can_manage_delivery_resource(
       p_delivery_id,'orders.view','orders.manage'
     )
  then
    raise exception 'HTPWEB: no autorizado para cancelar planificación';
  end if;

  update private.order_driver_plans
  set status='CANCELLED',
      cancelled_at=now(),
      updated_at=now()
  where delivery_id=p_delivery_id
    and order_id=p_order_id
    and status='PLANNED';

  return found;
end;
$function$;

revoke all on function public.delivery_cancel_order_driver_plan(uuid,uuid)
from public,anon;
grant execute on function public.delivery_cancel_order_driver_plan(uuid,uuid)
to authenticated,service_role;

create or replace function public.delivery_driver_planning_snapshot(
  p_delivery_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_rows jsonb;
begin
  if not public.is_master()
     and not public.user_can_manage_delivery_resource(
       p_delivery_id,'orders.view','orders.manage'
     )
  then
    raise exception 'HTPWEB: no autorizado para consultar planificación';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',o.id,
    'plan',case when pp.id is null then null else jsonb_build_object(
      'plan_id',pp.id,
      'driver_user_id',pp.driver_user_id,
      'driver_name',p.full_name,
      'driver_phone',p.phone,
      'status',pp.status,
      'planned_for',pp.planned_for,
      'ideal_departure_at',pp.ideal_departure_at,
      'source',pp.source,
      'activation_error',pp.activation_error,
      'created_at',pp.created_at,
      'activated_at',pp.activated_at
    ) end,
    'suggestion',case
      when pp.id is not null or o.status not in ('CONFIRMED','PREPARING')
      then null
      else private.driver_plan_suggestion_json(p_delivery_id,o.id)
    end
  ) order by o.created_at),'[]'::jsonb)
  into v_rows
  from public.orders o
  left join private.order_driver_plans pp
    on pp.order_id=o.id
   and pp.status in ('PLANNED','ACTIVATED')
  left join public.profiles p on p.id=pp.driver_user_id
  where o.delivery_id=p_delivery_id
    and o.status in ('CONFIRMED','PREPARING','READY','EN_ROUTE');

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'mode',private.effective_dispatch_mode(p_delivery_id),
    'generated_at',now(),
    'orders',v_rows
  );
end;
$function$;

revoke all on function public.delivery_driver_planning_snapshot(uuid)
from public,anon;
grant execute on function public.delivery_driver_planning_snapshot(uuid)
to authenticated,service_role;

create or replace function private.activate_planned_order_driver(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_plan private.order_driver_plans%rowtype;
  v_assignment uuid;
begin
  select *
  into v_plan
  from private.order_driver_plans
  where order_id=p_order_id
    and status='PLANNED'
  limit 1
  for update;

  if not found then
    return null;
  end if;

  begin
    v_assignment:=private.assign_order_driver_internal(
      v_plan.delivery_id,
      v_plan.order_id,
      v_plan.driver_user_id,
      v_plan.planned_by,
      'PLAN_'||v_plan.source
    );

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

create or replace function private.activate_planned_driver_when_ready()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='READY'
     and old.status is distinct from new.status
  then
    perform private.activate_planned_order_driver(new.id);
  elsif new.status in ('DELIVERED','CANCELLED')
        and old.status is distinct from new.status
  then
    update private.order_driver_plans
    set status='CANCELLED',
        cancelled_at=coalesce(cancelled_at,now()),
        updated_at=now()
    where order_id=new.id
      and status='PLANNED';
  end if;
  return new;
end;
$function$;

revoke all on function private.activate_planned_driver_when_ready()
from public,anon,authenticated;

drop trigger if exists trg_ay_activate_planned_driver on public.orders;
create trigger trg_ay_activate_planned_driver
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function private.activate_planned_driver_when_ready();

create or replace function private.auto_plan_driver_after_local_eta()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_delivery_id uuid;
  v_driver uuid;
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
    from public.order_locals ol
    where ol.order_id=new.order_id
      and ol.status<>'CANCELLED'
      and ol.prep_response_at is null
  ) then
    return new;
  end if;

  if exists(
    select 1 from private.order_driver_plans pp
    where pp.order_id=new.order_id
      and pp.status in ('PLANNED','ACTIVATED')
  ) then
    return new;
  end if;

  v_driver:=nullif(
    private.driver_plan_suggestion_json(v_delivery_id,new.order_id)->>'driver_user_id',
    ''
  )::uuid;

  if v_driver is null then
    return new;
  end if;

  insert into private.order_driver_plans(
    order_id,delivery_id,driver_user_id,status,planned_for,
    ideal_departure_at,planned_by,source,note,created_at,updated_at
  )
  select
    new.order_id,v_delivery_id,v_driver,'PLANNED',
    private.order_planned_ready_at(new.order_id),
    nullif(
      private.driver_plan_suggestion_json(v_delivery_id,new.order_id)->>'ideal_departure_at',
      ''
    )::timestamptz,
    null,'AUTO','Programación automática por ETA del LOCAL',now(),now()
  on conflict(order_id) do nothing;

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

comment on table private.order_driver_plans is
  'Programación anticipada de repartidor basada en ETA del LOCAL. Se activa al pasar el pedido a READY.';
