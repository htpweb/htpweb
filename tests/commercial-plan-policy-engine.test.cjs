const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const catalog=fs.readFileSync('supabase/migrations/20260925045945_commercial_plan_catalog.sql','utf8');
const policies=fs.readFileSync('supabase/migrations/20260925050141_delivery_operational_plan_policies.sql','utf8');
const runtime=fs.readFileSync('supabase/migrations/20260925051120_plan_runtime_policy_enforcement.sql','utf8');
const checkoutBridge=fs.readFileSync('supabase/migrations/20260925053905_checkout_policy_and_referral_snapshot.sql','utf8');
const pedido=fs.readFileSync('supabase/functions/crear-pedido/index.ts','utf8');

test('catálogo comercial incluye capacidad, referidos, horarios, GPS, seguridad y Stage 2',()=>{
  for(const code of [
    'zones.active.max','drivers.active.max','operators.active.max','restricted_areas.active.max',
    'customers.private_network','customers.access_schedule','referrals.links','referrals.codes',
    'restricted_areas.manage','restricted_areas.schedule',
    'gps.live','tracking.customer','dispatch.auto','routes.optimize',
    'delivery_proof.pin','safety.sos'
  ]) assert.match(catalog,new RegExp(code.replace(/[.]/g,'\\.')));
});

test('DELIVERY elige directamente sus zonas dentro del límite contratado',()=>{
  assert.match(policies,/delivery_set_zone_choice/);
  assert.match(policies,/zones\.active\.max/);
  assert.match(admin,/delivery_set_zone_choice/);
  assert.match(admin,/Zona activada para operar/);
  assert.doesNotMatch(admin,/Solicitar cobertura/);
});

test('downgrade bloquea operación hasta reconfigurar recursos',()=>{
  assert.match(runtime,/delivery_plan_selection_ready/);
  assert.match(runtime,/selection_reset_pending/);
  assert.match(runtime,/htp_delivery_covers_local/);
  assert.match(admin,/vuelve a seleccionar las zonas/);
});

test('red privada puede variar por día y hora, incluso cruzando medianoche',()=>{
  assert.match(policies,/delivery_customer_access_mode_at/);
  assert.match(policies,/start_time>r\.end_time/);
  assert.match(policies,/v_prev/);
  assert.match(admin,/Clientes y referidos/);
  assert.match(admin,/18:00/);
  assert.match(admin,/06:00/);
});

test('checkout no puede auto-vincular clientes y saltarse la red privada',()=>{
  assert.match(checkoutBridge,/evaluate_customer_order_policy/);
  assert.match(checkoutBridge,/PRIVATE_NETWORK_REQUIRED/);
  assert.match(checkoutBridge,/APPROVAL_REQUIRED/);
  assert.match(checkoutBridge,/RESTRICTED_AREA/);
  assert.match(pedido,/evaluate_customer_order_policy/);
  assert.match(pedido,/policy\.auto_create === true/);
  assert.doesNotMatch(pedido,/if \(!relation\)[\s\S]{0,800}allow_orders:\s*true/);
});

test('MASTER fija cuántas áreas restringidas permite el plan y DELIVERY decide cuáles',()=>{
  assert.match(catalog,/restricted_areas\.active\.max/);
  assert.match(policies,/delivery_limit_value\(p_delivery_id,'restricted_areas\.active\.max'\)/);
  assert.match(policies,/delivery_save_restricted_area/);
  assert.match(admin,/Guardar área restringida/);
});

test('áreas restringidas admiten permanente o horario y tienen UI de mapa',()=>{
  assert.match(policies,/PERMANENT/);
  assert.match(policies,/SCHEDULE/);
  assert.match(html,/restrictedAreaMap/);
  assert.match(html,/Por horario/);
  assert.match(admin,/delivery_restricted_area_context/);
  assert.match(admin,/delivery_save_restricted_area/);
  assert.match(admin,/19:00/);
  assert.match(admin,/06:00/);
});

test('referidos son una capability de plan y tienen gestión propia',()=>{
  assert.match(catalog,/referrals\.links/);
  assert.match(catalog,/referrals\.codes/);
  assert.match(checkoutBridge,/delivery_referral_codes_snapshot/);
  assert.match(admin,/delivery_create_referral_code/);
  assert.match(admin,/delivery_set_referral_code_active/);
});
