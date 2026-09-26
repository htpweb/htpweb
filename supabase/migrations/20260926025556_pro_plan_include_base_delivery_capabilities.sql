with base_caps as (
  select c.code,c.name,c.description,
         row_number() over(order by c.code) as rn
  from public.capabilities c
  where c.active=true
    and c.scope in ('DELIVERY','BOTH')
)
insert into public.plan_feature_catalog(
  code,entitlement_type,family,label,description,stage,unit,active,display_order
)
select
  b.code,
  'CAPABILITY',
  'Base HTPWEB',
  b.name,
  b.description,
  1,
  null,
  true,
  900 + b.rn
from base_caps b
on conflict(code) do nothing;

with pro as (
  select sp.id
  from public.subscription_plans sp
  where sp.code='PLA_02'
    and sp.target_type='DELIVERY'
    and sp.active=true
  limit 1
),
base_caps as (
  select c.code
  from public.capabilities c
  where c.active=true
    and c.scope in ('DELIVERY','BOTH')
)
insert into public.plan_entitlements(plan_id,entitlement_type,code,value)
select pro.id,'CAPABILITY',b.code,'true'::jsonb
from pro
cross join base_caps b
on conflict(plan_id,entitlement_type,code)
do update set value=excluded.value;

with pro as (
  select sp.id
  from public.subscription_plans sp
  where sp.code='PLA_02'
    and sp.target_type='DELIVERY'
    and sp.active=true
  limit 1
),
active_pro as (
  select a.id
  from public.plan_assignments a
  join pro on pro.id=a.plan_id
  where a.status in ('ACTIVE','TRIAL')
    and a.starts_at<=now()
    and (a.ends_at is null or a.ends_at>now())
),
base_caps as (
  select c.code
  from public.capabilities c
  where c.active=true
    and c.scope in ('DELIVERY','BOTH')
)
insert into public.plan_assignment_entitlements(
  assignment_id,entitlement_type,code,value
)
select a.id,'CAPABILITY',b.code,'true'::jsonb
from active_pro a
cross join base_caps b
on conflict(assignment_id,entitlement_type,code)
do update set value=excluded.value;

update public.subscription_plans
set plan_version=plan_version+1,
    updated_at=now()
where code='PLA_02'
  and target_type='DELIVERY'
  and active=true;

update public.plan_assignments a
set plan_version_snapshot=sp.plan_version,
    updated_at=now()
from public.subscription_plans sp
where a.plan_id=sp.id
  and sp.code='PLA_02'
  and a.status in ('ACTIVE','TRIAL')
  and a.starts_at<=now()
  and (a.ends_at is null or a.ends_at>now());
