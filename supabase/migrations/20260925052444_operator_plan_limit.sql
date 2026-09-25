-- Operators are plan-governed operational resources.

create or replace function public.delivery_set_operator(
  p_delivery_id uuid,
  p_user_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_target_role text;
  v_limit integer;
  v_current integer;
begin
  if not public.is_master()
     and not public.user_can_manage_delivery_resource(
       p_delivery_id,
       'users.manage',
       'users.manage'
     )
  then
    raise exception 'HTPWEB: no está autorizado para administrar usuarios de este DELIVERY';
  end if;

  select r.code into v_target_role
  from public.profiles p
  join public.roles r on r.id=p.role_id
  where p.id=p_user_id
    and p.active=true
    and r.active=true;

  if v_target_role is distinct from 'DELIVERY_OPERATOR' then
    raise exception 'HTPWEB: solo se pueden gestionar profiles DELIVERY_OPERATOR';
  end if;

  if coalesce(p_active,false) then
    v_limit:=public.delivery_limit_value(
      p_delivery_id,
      'operators.active.max'
    );

    if v_limit is null then
      raise exception 'HTPWEB: el plan no incluye operadores adicionales';
    end if;

    select count(*) into v_current
    from public.user_deliveries ud
    join public.profiles p on p.id=ud.user_id
    join public.roles r on r.id=p.role_id
    where ud.delivery_id=p_delivery_id
      and ud.active=true
      and ud.user_id<>p_user_id
      and p.active=true
      and r.code='DELIVERY_OPERATOR';

    if v_current>=v_limit then
      raise exception 'HTPWEB: el DELIVERY alcanzó el máximo de operadores activos (%)',v_limit;
    end if;
  end if;

  insert into public.user_deliveries(
    user_id,delivery_id,active,created_at
  )
  values(
    p_user_id,p_delivery_id,coalesce(p_active,false),now()
  )
  on conflict(user_id,delivery_id)
  do update set active=excluded.active;
end;
$$;

create or replace function public.ensure_delivery_plan_transition_applied(
  p_delivery_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_assignment uuid;
begin
  if not (
    public.is_master()
    or exists(
      select 1
      from public.user_deliveries ud
      where ud.user_id=auth.uid()
        and ud.delivery_id=p_delivery_id
        and ud.active=true
    )
  )
  then
    raise exception 'HTPWEB: no autorizado';
  end if;

  select a.id into v_assignment
  from public.plan_assignments a
  where a.delivery_id=p_delivery_id
    and a.status in ('ACTIVE','TRIAL')
    and a.starts_at<=now()
    and (a.ends_at is null or a.ends_at>now())
    and a.selection_reset_required=true
    and a.transition_applied_at is null
  order by a.starts_at desc,a.created_at desc
  limit 1;

  if v_assignment is null then return false; end if;

  update public.delivery_zones
  set active=false
  where delivery_id=p_delivery_id
    and active=true;

  update public.delivery_restricted_areas
  set active=false,
      updated_at=now()
  where delivery_id=p_delivery_id
    and active=true;

  update public.user_deliveries ud
  set active=false
  from public.profiles p
  join public.roles r on r.id=p.role_id
  where ud.user_id=p.id
    and ud.delivery_id=p_delivery_id
    and ud.active=true
    and r.code='DELIVERY_OPERATOR';

  update public.plan_assignments
  set transition_applied_at=now(),
      updated_at=now()
  where id=v_assignment;

  return true;
end;
$$;
