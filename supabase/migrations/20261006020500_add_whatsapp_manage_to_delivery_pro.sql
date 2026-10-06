begin;

insert into public.plan_feature_catalog
  (code, entitlement_type, family, label, description, stage, unit, active, display_order)
values
  (
    'whatsapp.manage',
    'CAPABILITY',
    'WhatsApp',
    'WhatsApp automático con Meta',
    'Conecta el número del DELIVERY con la API oficial de Meta y permite automatizar mensajes de pedidos, locales y repartidores.',
    1,
    null,
    true,
    740
  )
on conflict (code) do update
set entitlement_type = excluded.entitlement_type,
    family = excluded.family,
    label = excluded.label,
    description = excluded.description,
    stage = excluded.stage,
    unit = excluded.unit,
    active = excluded.active,
    display_order = excluded.display_order,
    updated_at = now();

insert into public.plan_entitlements
  (plan_id, entitlement_type, code, value)
select id, 'CAPABILITY', 'whatsapp.manage', 'true'::jsonb
from public.subscription_plans
where code='PLA_02' and target_type='DELIVERY'
on conflict (plan_id, entitlement_type, code) do update
set value=excluded.value,
    updated_at=now();

insert into public.plan_assignment_entitlements
  (assignment_id, entitlement_type, code, value)
select pa.id, 'CAPABILITY', 'whatsapp.manage', 'true'::jsonb
from public.plan_assignments pa
join public.subscription_plans sp on sp.id=pa.plan_id
where sp.code='PLA_02'
  and sp.target_type='DELIVERY'
  and pa.status='ACTIVE'
on conflict (assignment_id, entitlement_type, code) do update
set value=excluded.value;

commit;
