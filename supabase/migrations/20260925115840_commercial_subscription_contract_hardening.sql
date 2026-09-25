alter table public.plan_assignments
  add column if not exists plan_version_snapshot integer;

create or replace function public.master_save_commercial_plan(
  p_plan_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_price numeric,
  p_currency text,
  p_duration_months integer,
  p_active boolean,
  p_display_order integer,
  p_entitlements jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid:=coalesce(p_plan_id,gen_random_uuid());
  v_item jsonb;
  v_type text;
  v_code text;
  v_value jsonb;
  v_expected text;
  v_currency text:=upper(trim(coalesce(p_currency,'USD')));
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if nullif(trim(p_code),'') is null or nullif(trim(p_name),'') is null then raise exception 'HTPWEB: código y nombre son obligatorios'; end if;
  if p_price is null or p_price<0 then raise exception 'HTPWEB: precio inválido'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'HTPWEB: moneda inválida; usa un código de 3 letras como USD'; end if;
  if p_duration_months is null or p_duration_months<1 or p_duration_months>120 then raise exception 'HTPWEB: duración inválida'; end if;
  if p_entitlements is null or jsonb_typeof(p_entitlements)<>'array' then raise exception 'HTPWEB: prestaciones inválidas'; end if;

  insert into public.subscription_plans(
    id,code,name,description,target_type,price,currency,billing_interval,
    duration_months,active,display_order,plan_version,created_at,updated_at
  )
  values(
    v_id,upper(trim(p_code)),trim(p_name),nullif(trim(coalesce(p_description,'')),''),
    'DELIVERY',round(p_price,2),v_currency,'MONTH',
    p_duration_months,coalesce(p_active,true),coalesce(p_display_order,0),1,now(),now()
  )
  on conflict(id) do update set
    code=excluded.code,
    name=excluded.name,
    description=excluded.description,
    price=excluded.price,
    currency=excluded.currency,
    duration_months=excluded.duration_months,
    active=excluded.active,
    display_order=excluded.display_order,
    plan_version=public.subscription_plans.plan_version+1,
    updated_at=now();

  delete from public.plan_entitlements where plan_id=v_id;

  for v_item in select value from jsonb_array_elements(p_entitlements) loop
    v_type:=upper(trim(coalesce(v_item->>'type','')));
    v_code:=lower(trim(coalesce(v_item->>'code','')));
    v_value:=v_item->'value';

    select entitlement_type into v_expected
    from public.plan_feature_catalog
    where code=v_code and active=true;

    if v_expected is null then raise exception 'HTPWEB: prestación desconocida %',v_code; end if;
    if v_expected<>v_type then raise exception 'HTPWEB: tipo inválido para %',v_code; end if;
    if v_type='CAPABILITY' and jsonb_typeof(v_value)<>'boolean' then raise exception 'HTPWEB: % debe ser booleano',v_code; end if;
    if v_type='LIMIT' and (jsonb_typeof(v_value)<>'number' or (v_value#>>'{}')::numeric<0) then
      raise exception 'HTPWEB: % debe ser numérico no negativo',v_code;
    end if;

    insert into public.plan_entitlements(plan_id,entitlement_type,code,value)
    values(v_id,v_type,v_code,v_value);
  end loop;

  return v_id;
end;
$$;

revoke execute on function public.master_save_commercial_plan(uuid,text,text,text,numeric,text,integer,boolean,integer,jsonb)
  from public, anon;
grant execute on function public.master_save_commercial_plan(uuid,text,text,text,numeric,text,integer,boolean,integer,jsonb)
  to authenticated, service_role;

create or replace function public.master_save_commercial_plan(
  p_plan_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_price numeric,
  p_duration_months integer,
  p_active boolean,
  p_display_order integer,
  p_entitlements jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  return public.master_save_commercial_plan(
    p_plan_id,p_code,p_name,p_description,p_price,'USD',
    p_duration_months,p_active,p_display_order,p_entitlements
  );
end;
$$;

revoke execute on function public.master_save_commercial_plan(uuid,text,text,text,numeric,integer,boolean,integer,jsonb)
  from public, anon;
grant execute on function public.master_save_commercial_plan(uuid,text,text,text,numeric,integer,boolean,integer,jsonb)
  to authenticated, service_role;

create or replace function public.master_assign_commercial_plan(
  p_delivery_id uuid,
  p_plan_id uuid,
  p_effective_mode text default 'AUTO'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
  if not exists(select 1 from public.deliveries d where d.id=p_delivery_id and d.active=true) then
    raise exception 'HTPWEB: DELIVERY inexistente o inactivo';
  end if;

  select p.* into v_plan
  from public.subscription_plans p
  where p.id=p_plan_id and p.target_type='DELIVERY' and p.active=true;

  if v_plan.id is null then raise exception 'HTPWEB: plan comercial activo inexistente'; end if;

  select a.* into v_current
  from public.plan_assignments a
  where a.delivery_id=p_delivery_id
    and a.status in ('ACTIVE','TRIAL')
    and a.starts_at<=now()
    and (a.ends_at is null or a.ends_at>now())
  order by a.starts_at desc,a.created_at desc
  limit 1;

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
        on newe.plan_id=p_plan_id
       and newe.entitlement_type=olde.entitlement_type
       and newe.code=olde.code
      where olde.assignment_id=v_current_id
        and (
          (olde.entitlement_type='LIMIT' and coalesce((newe.value#>>'{}')::numeric,0)<(olde.value#>>'{}')::numeric)
          or
          (olde.entitlement_type='CAPABILITY'
            and (olde.value#>>'{}')::boolean=true
            and coalesce((newe.value#>>'{}')::boolean,false)=false)
        )
    ) into v_downgrade;
    v_change:=case when v_downgrade then 'DOWNGRADE' else 'UPGRADE' end;
  end if;

  if v_mode='AUTO' then
    v_mode:=case
      when v_change in ('RENEW','DOWNGRADE') and v_current_id is not null then 'NEXT_CYCLE'
      else 'NOW'
    end;
  end if;

  update public.plan_assignments
  set status='CANCELLED',updated_at=now()
  where delivery_id=p_delivery_id
    and status in ('ACTIVE','TRIAL')
    and starts_at>now();

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
        on newe.plan_id=p_plan_id
       and newe.entitlement_type='LIMIT'
       and newe.code=olde.code
      where olde.assignment_id=v_current_id
        and olde.entitlement_type='LIMIT'
        and olde.code in ('zones.active.max','drivers.active.max','operators.active.max','restricted_areas.active.max')
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
  from public.plan_entitlements e
  where e.plan_id=p_plan_id;

  return jsonb_build_object(
    'assignment_id',v_assignment,
    'change_type',v_change,
    'effective_mode',v_mode,
    'plan_version',v_plan.plan_version,
    'starts_at',v_start,
    'ends_at',v_end,
    'selection_reset_required',v_reset
  );
end;
$$;

create or replace function public.delivery_plan_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_allowed boolean;
  v_current record;
  v_next record;
  v_entitlements jsonb;
  v_days integer;
begin
  v_allowed:=public.is_master() or exists(
    select 1 from public.user_deliveries ud
    where ud.user_id=auth.uid() and ud.delivery_id=p_delivery_id and ud.active=true
  );
  if not v_allowed then raise exception 'HTPWEB: no autorizado para consultar este plan'; end if;

  select a.*,p.code plan_code,p.name plan_name,p.plan_version catalog_plan_version
  into v_current
  from public.plan_assignments a
  join public.subscription_plans p on p.id=a.plan_id
  where a.delivery_id=p_delivery_id
    and a.status in ('ACTIVE','TRIAL')
    and a.starts_at<=now()
    and (a.ends_at is null or a.ends_at>now())
  order by a.starts_at desc,a.created_at desc
  limit 1;

  select a.*,p.code plan_code,p.name plan_name,p.plan_version catalog_plan_version
  into v_next
  from public.plan_assignments a
  join public.subscription_plans p on p.id=a.plan_id
  where a.delivery_id=p_delivery_id
    and a.status in ('ACTIVE','TRIAL')
    and a.starts_at>now()
  order by a.starts_at,a.created_at
  limit 1;

  if v_current.id is null then
    return jsonb_build_object(
      'delivery_id',p_delivery_id,'active',false,
      'state',case when v_next.id is not null then 'SCHEDULED' else 'NOT_CONFIGURED' end,
      'current',null,
      'next',case when v_next.id is null then null else jsonb_build_object(
        'assignment_id',v_next.id,'plan_id',v_next.plan_id,'plan_code',v_next.plan_code,
        'plan_name',coalesce(v_next.plan_name_snapshot,v_next.plan_name),
        'plan_version',coalesce(v_next.plan_version_snapshot,v_next.catalog_plan_version),
        'starts_at',v_next.starts_at,'ends_at',v_next.ends_at,'change_type',v_next.change_type
      ) end
    );
  end if;

  select coalesce(jsonb_object_agg(s.code,s.value),'{}'::jsonb)
  into v_entitlements
  from public.plan_assignment_entitlements s
  where s.assignment_id=v_current.id;

  v_days:=case when v_current.ends_at is null then null
    else greatest(0,ceil(extract(epoch from (v_current.ends_at-now()))/86400.0)::integer) end;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,'active',true,
    'state',case when v_days is not null and v_days<=5 then 'EXPIRING' else 'ACTIVE' end,
    'days_remaining',v_days,'expiring_soon',coalesce(v_days<=5,false),
    'current',jsonb_build_object(
      'assignment_id',v_current.id,'plan_id',v_current.plan_id,'plan_code',v_current.plan_code,
      'plan_name',coalesce(v_current.plan_name_snapshot,v_current.plan_name),
      'plan_version',coalesce(v_current.plan_version_snapshot,v_current.catalog_plan_version),
      'price',v_current.price_snapshot,'currency',v_current.currency_snapshot,
      'duration_months',v_current.duration_months_snapshot,
      'starts_at',v_current.starts_at,'ends_at',v_current.ends_at,'change_type',v_current.change_type,
      'selection_reset_required',v_current.selection_reset_required,'entitlements',v_entitlements
    ),
    'next',case when v_next.id is null then null else jsonb_build_object(
      'assignment_id',v_next.id,'plan_id',v_next.plan_id,'plan_code',v_next.plan_code,
      'plan_name',coalesce(v_next.plan_name_snapshot,v_next.plan_name),
      'plan_version',coalesce(v_next.plan_version_snapshot,v_next.catalog_plan_version),
      'starts_at',v_next.starts_at,'ends_at',v_next.ends_at,'change_type',v_next.change_type
    ) end
  );
end;
$$;

create or replace function public.master_set_plan_override(
  p_delivery_id uuid,
  p_local_id uuid,
  p_entitlement_type text,
  p_code text,
  p_value jsonb,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_type text:=upper(trim(coalesce(p_entitlement_type,'')));
  v_code text:=lower(trim(coalesce(p_code,'')));
  v_expected text;
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if (p_delivery_id is not null)::integer + (p_local_id is not null)::integer <> 1 then
    raise exception 'Seleccione exactamente un DELIVERY o LOCAL';
  end if;

  select entitlement_type into v_expected
  from public.plan_feature_catalog
  where code=v_code and active=true;

  if v_expected is null then raise exception 'Prestación desconocida %',v_code; end if;
  if v_expected<>v_type then raise exception 'Tipo de prestación inválido para %',v_code; end if;

  if (v_type='CAPABILITY' and jsonb_typeof(p_value)<>'boolean')
     or (v_type='LIMIT' and (jsonb_typeof(p_value)<>'number' or (p_value#>>'{}')::numeric<0))
  then
    raise exception 'Valor de excepción inválido';
  end if;

  insert into public.plan_entitlement_overrides(
    delivery_id,local_id,entitlement_type,code,value,reason,updated_by,updated_at
  )
  values(
    p_delivery_id,p_local_id,v_type,v_code,p_value,
    nullif(trim(coalesce(p_reason,'')),''),
    auth.uid(),now()
  )
  on conflict (delivery_id,local_id,entitlement_type,code)
  do update set
    value=excluded.value,
    reason=excluded.reason,
    updated_by=auth.uid(),
    updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.master_set_plan_override(uuid,uuid,text,text,jsonb,text)
  from public, anon;
grant execute on function public.master_set_plan_override(uuid,uuid,text,text,jsonb,text)
  to authenticated, service_role;
