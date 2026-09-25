const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const hardening=fs.readFileSync('supabase/migrations/20260925123106_restricted_area_tenant_hardening.sql','utf8');
const policies=fs.readFileSync('supabase/migrations/20260925050141_delivery_operational_plan_policies.sql','utf8');
const context=fs.readFileSync('supabase/migrations/20260925051606_restricted_area_context.sql','utf8');
const checkout=fs.readFileSync('supabase/functions/crear-pedido/index.ts','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

test('área existente solo puede editarla su propio DELIVERY',()=>{
  assert.match(hardening,/select a\.delivery_id into v_existing_delivery/);
  assert.match(hardening,/v_existing_delivery<>p_delivery_id/);
  assert.match(hardening,/no pertenece a este DELIVERY/);
});

test('áreas activas requieren límite explícito del plan',()=>{
  assert.match(hardening,/restricted_areas\.active\.max/);
  assert.match(hardening,/v_limit is null/);
  assert.match(hardening,/plan no define capacidad de áreas restringidas/);
  assert.match(hardening,/v_count>=v_limit/);
});

test('restricción solo puede dibujarse dentro de una zona activa del DELIVERY',()=>{
  assert.match(hardening,/join public\.delivery_zones dz/);
  assert.match(hardening,/dz\.delivery_id=p_delivery_id/);
  assert.match(hardening,/dz\.active=true/);
  assert.match(hardening,/htp_zone_contains/);
  assert.match(hardening,/debe quedar completamente dentro de la zona seleccionada/);
});

test('permanente y horario nocturno siguen soportados',()=>{
  assert.match(hardening,/PERMANENT','SCHEDULE/);
  assert.match(hardening,/restricted_areas\.schedule/);
  assert.match(policies,/r\.start_time>r\.end_time/);
  assert.match(policies,/v_prev/);
  assert.match(admin,/19:00/);
  assert.match(admin,/06:00/);
  assert.match(html,/Permanente/);
  assert.match(html,/Por horario/);
});

test('área restringida tiene prioridad antes de clientes en checkout',()=>{
  const policy=policies.match(/create or replace function public\.evaluate_customer_order_policy[\s\S]*/)?.[0]||policies;
  const restricted=policy.indexOf('RESTRICTED_AREA');
  const access=policy.indexOf('delivery_customer_access_mode_at');
  assert.ok(restricted>=0);
  assert.ok(access>=0);
  assert.ok(restricted<access);
  assert.match(checkout,/RESTRICTED_AREA/);
});

test('helper geográfico de checkout no queda expuesto al navegador',()=>{
  assert.match(hardening,/revoke execute on function public\.delivery_location_is_restricted[\s\S]*?from public,anon,authenticated/);
  assert.match(hardening,/grant execute on function public\.delivery_location_is_restricted[\s\S]*?to service_role/);
  assert.doesNotMatch(admin,/rpc\("delivery_location_is_restricted"/);
});
