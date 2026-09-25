const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const owner=fs.readFileSync('supabase/migrations/20260925032211_delivery_admin_owns_fees.sql','utf8');
const planFees=fs.readFileSync('supabase/migrations/20260925050557_commercial_plan_fee_integration.sql','utf8');

test('MASTER no expone editor de precios',()=>{
  const roleBlock=admin.match(/const roleSections = \{[\s\S]*?\n\};/)?.[0]||'';
  const masterLine=roleBlock.match(/MASTER:\s*\[[^\]]*\]/)?.[0]||'';
  const deliveryLine=roleBlock.match(/DELIVERY_ADMIN:\s*\[[^\]]*\]/)?.[0]||'';
  assert.doesNotMatch(masterLine,/"fees"/);
  assert.match(deliveryLine,/"fees"/);
  assert.doesNotMatch(admin,/deliveryWorkspacePane-fees/);
});

test('DELIVERY_ADMIN fija precios y el plan decide funciones disponibles',()=>{
  assert.match(admin,/async function loadFees\(\) \{\s*if \(state\.role !== "DELIVERY_ADMIN"\) return;/);
  assert.match(admin,/delivery_has_capability/);
  assert.match(html,/Esta configuración pertenece al DELIVERY_ADMIN/);
  assert.match(planFees,/delivery_has_capability/);
});

test('backend conserva guard DELIVERY_ADMIN para escribir tarifas',()=>{
  assert.match(owner,/current_role_code\(\) is distinct from 'DELIVERY_ADMIN'/);
  assert.match(owner,/assert_delivery_admin_can_manage_fee_mode|assert_delivery_admin_can_manage_fees/);
});

test('MASTER administra prestaciones desde Planes y Suscripciones no desde DELIVERY Cuenta',()=>{
  assert.match(admin,/Planes y Suscripciones/);
  assert.doesNotMatch(admin,/master_set_delivery_fee_mode/);
});
