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
  v_drivers_max integer;
  v_selection_ready boolean:=true;
begin
  if not (
    public.is_master()
    or (
      public.current_role_code()='DELIVERY_ADMIN'
      and public.user_has_delivery(p_delivery_id)
    )
  ) then
    raise exception 'HTPWEB: no autorizado para consultar Mi Plan';
  end if;

  v_plan:=public.delivery_plan_snapshot(p_delivery_id);

  if v_plan->'current' is not null
     and jsonb_typeof(v_plan->'current')='object'
     and nullif(v_plan->'current'->>'assignment_id','') is not null
  then
    v_assignment:=(v_plan->'current'->>'assignment_id')::uuid;

    select coalesce(jsonb_agg(jsonb_build_object(
      'code',s.code,
      'type',s.entitlement_type,
      'value',s.value,
      'family',coalesce(f.family,'Otros'),
      'label',coalesce(f.label,s.code),
      'unit',f.unit,
      'stage',coalesce(f.stage,1)
    ) order by coalesce(f.stage,1),coalesce(f.family,'Otros'),coalesce(f.display_order,9999),s.code),'[]'::jsonb)
    into v_features
    from public.plan_assignment_entitlements s
    left join public.plan_feature_catalog f on f.code=s.code
    where s.assignment_id=v_assignment;
  end if;

  select count(*)::integer into v_zones_used
  from public.delivery_zones dz
  where dz.delivery_id=p_delivery_id and dz.active=true;

  select count(*)::integer into v_areas_used
  from public.delivery_restricted_areas a
  where a.delivery_id=p_delivery_id and a.active=true;

  select count(*)::integer into v_operators_used
  from public.user_deliveries ud
  join public.profiles p on p.id=ud.user_id and p.active=true
  join public.roles r on r.id=p.role_id and r.active=true
  where ud.delivery_id=p_delivery_id
    and ud.active=true
    and r.code='DELIVERY_OPERATOR';

  v_zones_max:=public.delivery_limit_value(p_delivery_id,'zones.active.max');
  v_areas_max:=public.delivery_limit_value(p_delivery_id,'restricted_areas.active.max');
  v_operators_max:=public.delivery_limit_value(p_delivery_id,'operators.active.max');
  v_drivers_max:=public.delivery_limit_value(p_delivery_id,'drivers.active.max');
  v_selection_ready:=public.delivery_plan_selection_ready(p_delivery_id);

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'plan',v_plan,
    'features',coalesce(v_features,'[]'::jsonb),
    'selection_ready',coalesce(v_selection_ready,true),
    'usage',jsonb_build_object(
      'zones',jsonb_build_object(
        'used',coalesce(v_zones_used,0),
        'max',v_zones_max,
        'stage',1,
        'configuration_section','coverage'
      ),
      'restricted_areas',jsonb_build_object(
        'used',coalesce(v_areas_used,0),
        'max',v_areas_max,
        'stage',1,
        'configuration_section','security'
      ),
      'operators',jsonb_build_object(
        'used',coalesce(v_operators_used,0),
        'max',v_operators_max,
        'stage',1
      ),
      'drivers',jsonb_build_object(
        'used',null,
        'max',v_drivers_max,
        'stage',2,
        'usage_available',false
      )
    )
  );
end;
$$;

revoke execute on function public.delivery_my_plan_summary(uuid) from public, anon;
grant execute on function public.delivery_my_plan_summary(uuid) to authenticated, service_role;

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
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('users.manage')
  then
    raise exception 'HTPWEB: solo el DELIVERY_ADMIN autorizado puede administrar operadores';
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
    v_limit:=public.delivery_limit_value(p_delivery_id,'operators.active.max');

    if v_limit is null or v_limit<=0 then
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

  insert into public.user_deliveries(user_id,delivery_id,active,created_at)
  values(p_user_id,p_delivery_id,coalesce(p_active,false),now())
  on conflict(user_id,delivery_id)
  do update set active=excluded.active;
end;
$$;

revoke execute on function public.delivery_set_operator(uuid,uuid,boolean) from public, anon;
grant execute on function public.delivery_set_operator(uuid,uuid,boolean) to authenticated;
