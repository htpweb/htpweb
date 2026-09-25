const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20260925050557_commercial_plan_fee_integration.sql','utf8');\nconst hardening=fs.readFileSync('supabase/migrations/20260925114824_commercial_security_hardening.sql','utf8');

test('MASTER no expone editor de precios ni controles manuales de modalidad',()=>{
  const roleBlock=admin.match(/const roleSections = \{[\s\S]*?\n\};/)?.[0]||'';
  const masterLine=roleBlock.match(/MASTER:\s*\[[^\]]*\]/)?.[0]||'';
  const deliveryLine=roleBlock.match(/DELIVERY_ADMIN:\s*\[[^\]]*\]/)?.[0]||'';
  assert.doesNotMatch(masterLine,/"fees"/);
  assert.match(deliveryLine,/"fees"/);
  assert.doesNotMatch(admin,/data-delivery-workspace-tab="fees"/);
  assert.doesNotMatch(admin,/deliveryWorkspacePane-fees/);
  assert.doesNotMatch(html,/id="enableDeliveryFeesBtn"/);
});

test('las modalidades comerciales viven en el catálogo del plan',()=>{
  const catalog=fs.readFileSync('supabase/migrations/20260925045945_commercial_plan_catalog.sql','utf8');
  assert.match(catalog,/delivery_fees\.fixed/);
  assert.match(catalog,/delivery_fees\.distance/);
  assert.match(catalog,/delivery_fees\.day_night/);
  assert.match(admin,/Plan y suscripción/);
  assert.match(admin,/Abrir Planes y suscripciones/);
});

test('DELIVERY_ADMIN solo ve modalidades incluidas en su plan',()=>{
  const load=admin.match(/async function loadFeeDelivery\(\)[\s\S]*?async function saveFeeConfig/)?.[0]||'';
  assert.match(load,/delivery_fee_capability_status/);
  assert.match(load,/capabilityStatus\?\.fixed/);
  assert.match(load,/capabilityStatus\?\.distance/);
  assert.match(load,/allowedModes/);
  assert.match(hardening,/delivery_fees\.fixed/);
  assert.match(hardening,/delivery_fees\.distance/);
});

test('backend protege tarifa fija, distancia y día-noche mediante capabilities del plan',()=>{
  assert.match(migration,/delivery_has_capability\(p_delivery_id,'delivery_fees\.day_night'\)/);
  assert.match(migration,/delivery_fee_mode_enabled/);
  assert.match(migration,/La modalidad de tarifa % no está habilitada por el plan/);
});
