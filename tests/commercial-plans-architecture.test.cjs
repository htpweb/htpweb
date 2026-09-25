const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const access=fs.readFileSync('app/acceso.html','utf8');
const orderFn=fs.readFileSync('supabase/functions/crear-pedido/index.ts','utf8');
const catalog=fs.readFileSync('supabase/migrations/20260925045945_commercial_plan_catalog.sql','utf8');
const assignments=fs.readFileSync('supabase/migrations/20260925050023_commercial_plan_assignments_notifications.sql','utf8');
const policies=fs.readFileSync('supabase/migrations/20260925050141_delivery_operational_plan_policies.sql','utf8');
const runtime=fs.readFileSync('supabase/migrations/20260925051120_plan_runtime_policy_enforcement.sql','utf8');
const approvals=fs.readFileSync('supabase/migrations/20260925051854_customer_network_approval.sql','utf8');

test('catálogo comercial prepara Stage 2 sin crear frontend paralelo',()=>{
  for(const token of [
    'zones.active.max','drivers.active.max','operators.active.max',
    'restricted_areas.active.max','gps.live','tracking.customer',
    'dispatch.manual','dispatch.hybrid','dispatch.auto','multi_order',
    'routes.optimize','delivery_proof.pin','safety.sos'
  ]) assert.match(catalog,new RegExp(token.replaceAll('.','\\.')));
});

test('red privada referidos y horarios son prestaciones comercializables',()=>{
  for(const token of [
    'customers.private_network','customers.access_schedule',
    'referrals.links','referrals.codes','customers.approval',
    'customers.groups','referrals.analytics'
  ]) assert.match(catalog,new RegExp(token.replaceAll('.','\\.')));
  assert.match(policies,/delivery_customer_access_rules/);
  assert.match(policies,/start_time>r\.end_time/);
  assert.match(policies,/REFERRAL_CODE/);
});

test('contrato congela precio duración y prestaciones',()=>{
  assert.match(catalog,/plan_assignment_entitlements/);
  assert.match(assignments,/price_snapshot/);
  assert.match(assignments,/duration_months_snapshot/);
  assert.match(assignments,/insert into public\.plan_assignment_entitlements/);
});

test('downgrade no borra historial y bloquea selección operativa hasta reconfigurar',()=>{
  assert.match(assignments,/selection_reset_required/);
  assert.match(policies,/ensure_delivery_plan_transition_applied/);
  assert.match(policies,/update public\.delivery_zones set active=false/);
  assert.match(runtime,/delivery_plan_selection_ready/);
  assert.match(runtime,/htp_delivery_covers_local/);
});

test('DELIVERY elige sus zonas respetando límite del plan',()=>{
  assert.match(policies,/delivery_set_zone_choice/);
  assert.match(policies,/zones\.active\.max/);
  assert.match(policies,/límite del plan alcanzado/);
  assert.match(admin,/delivery_set_zone_choice/);
});

test('áreas restringidas admiten permanente y horario cruzando medianoche',()=>{
  assert.match(policies,/delivery_restricted_areas/);
  assert.match(policies,/PERMANENT/);
  assert.match(policies,/SCHEDULE/);
  assert.match(policies,/start_time>r\.end_time/);
  assert.match(runtime,/delivery_location_is_restricted/);
  assert.match(adminHtml,/Áreas restringidas/);
  assert.match(admin,/saveRestrictedArea/);
});

test('checkout vuelve a validar política privada zonas y seguridad desde backend',()=>{
  assert.match(orderFn,/customer_can_order_delivery/);
  assert.match(orderFn,/delivery_customer_access_mode_at/);
  assert.match(orderFn,/delivery_location_is_restricted/);
  assert.match(orderFn,/htp_delivery_covers_local/);
  assert.match(runtime,/validate_order_customer_delivery/);
});

test('referido se conserva hasta login y se reclama por RPC',()=>{
  assert.match(access,/htpweb_pending_referral/);
  assert.match(access,/claim_delivery_referral/);
  assert.match(access,/claimPendingReferral/);
  assert.match(admin,/delivery_create_referral_code/);
});

test('modo APPROVAL_REQUIRED distingue vínculo de aprobación manual',()=>{
  assert.match(approvals,/APPROVAL_REQUIRED/);
  assert.match(approvals,/approved_at is not null/);
  assert.match(approvals,/delivery_set_customer_order_access/);
  assert.match(admin,/delivery_customer_network_snapshot/);
  assert.match(admin,/Aprobar pedidos/);
});

test('Mi Plan muestra contrato capacidades red privada seguridad y avisos',()=>{
  assert.match(adminHtml,/id="section-myplan"/);
  assert.match(admin,/delivery_plan_snapshot/);
  assert.match(admin,/delivery_customer_access_snapshot/);
  assert.match(admin,/delivery_restricted_area_context/);
  assert.match(admin,/my_notifications/);
});
