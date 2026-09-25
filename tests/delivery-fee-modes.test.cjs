const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260925033600_master_controls_fee_modes.sql','utf8');

test('MASTER muestra Tarifa fija y Por distancia como filas independientes',()=>{
  assert.match(admin,/MODALIDAD/);
  assert.match(admin,/Tarifa fija/);
  assert.match(admin,/Por distancia/);
  assert.match(admin,/data-dw-fee-mode/);
  assert.match(admin,/Habilitada/);
  assert.match(admin,/Deshabilitada/);
  assert.match(admin,/Habilitar/);
  assert.match(admin,/Deshabilitar/);
});

test('MASTER controla cada modalidad con RPC dedicado y no fija precios',()=>{
  assert.match(admin,/master_delivery_fee_modes_status/);
  assert.match(admin,/master_set_delivery_fee_mode/);
  assert.doesNotMatch(admin,/deliveryWorkspaceToggleFeeCapability/);
  assert.doesNotMatch(admin,/data-delivery-workspace-tab="fees"/);
});

test('un DELIVERY nuevo no recibe modalidades de tarifa automáticamente',()=>{
  const save=admin.match(/async function saveDelivery\(\)[\s\S]*?function feeDeliveryRecord/)?.[0]||'';
  assert.match(save,/delivery\.info\.manage/);
  assert.match(save,/zones\.manage/);
  assert.doesNotMatch(save,/delivery_fees\.manage",p_enabled:true/);
});

test('DELIVERY_ADMIN solo ve modalidades habilitadas por MASTER',()=>{
  const load=admin.match(/async function loadFeeDelivery\(\)[\s\S]*?async function saveFeeConfig/)?.[0]||'';
  assert.match(load,/delivery_fees\.fixed/);
  assert.match(load,/delivery_fees\.distance/);
  assert.match(load,/allowedModes/);
  assert.match(load,/MASTER no ha habilitado ninguna modalidad/);
});

test('backend separa FIXED y DISTANCE y protege también el cálculo final',()=>{
  assert.match(migration,/delivery_fees\.fixed/);
  assert.match(migration,/delivery_fees\.distance/);
  assert.match(migration,/master_set_delivery_fee_mode/);
  assert.match(migration,/assert_delivery_admin_can_manage_fee_mode/);
  assert.match(migration,/perform public\.assert_delivery_admin_can_manage_fee_mode\([\s\S]*?'DISTANCE'/);
  assert.match(migration,/if not public\.delivery_fee_mode_enabled\(p_delivery_id,v_mode\)/);
  assert.match(migration,/La modalidad de tarifa % no está habilitada por HTPWEB/);
});
