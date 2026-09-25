const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const catalog=fs.readFileSync('supabase/migrations/20260925045945_commercial_plan_catalog.sql','utf8');
const fees=fs.readFileSync('supabase/migrations/20260925050557_commercial_plan_fee_integration.sql','utf8');

test('Tarifa fija Por distancia y Día/Noche son funciones del plan',()=>{
  assert.match(catalog,/delivery_fees\.fixed/);
  assert.match(catalog,/delivery_fees\.distance/);
  assert.match(catalog,/delivery_fees\.day_night/);
  assert.match(html,/El plan comercial define/);
});

test('MASTER ya no tiene interruptores manuales de modalidad',()=>{
  assert.doesNotMatch(admin,/master_delivery_fee_modes_status/);
  assert.doesNotMatch(admin,/master_set_delivery_fee_mode/);
  assert.doesNotMatch(admin,/data-dw-fee-mode/);
});

test('DELIVERY_ADMIN ve solo modalidades incluidas en su contrato',()=>{
  const load=admin.match(/async function loadFeeDelivery\(\)[\s\S]*?async function saveFeeConfig/)?.[0]||'';
  assert.match(load,/delivery_fees\.fixed/);
  assert.match(load,/delivery_fees\.distance/);
  assert.match(load,/delivery_fees\.day_night/);
  assert.match(load,/allowedModes/);
  assert.match(load,/feeDayNightEnabled/);
});

test('backend aplica Día todo el día si el plan no incluye Día Noche',()=>{
  assert.match(fees,/delivery_has_capability\(p_delivery_id,'delivery_fees\.day_night'\)/);
  assert.match(fees,/v_period:='DAY'/);
  assert.match(fees,/delivery_fee_mode_enabled/);
  assert.match(fees,/tu plan no incluye tarifa Día\/Noche/);
});
