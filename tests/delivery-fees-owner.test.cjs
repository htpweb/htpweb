const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20260925032211_delivery_admin_owns_fees.sql','utf8');

test('MASTER ya no expone el editor de tarifas',()=>{
  const roleBlock=admin.match(/const roleSections = \{[\s\S]*?\n\};/)?.[0]||'';
  const masterLine=roleBlock.match(/MASTER:\s*\[[^\]]*\]/)?.[0]||'';
  const deliveryLine=roleBlock.match(/DELIVERY_ADMIN:\s*\[[^\]]*\]/)?.[0]||'';

  assert.doesNotMatch(masterLine,/"fees"/);
  assert.match(deliveryLine,/"fees"/);
  assert.doesNotMatch(admin,/data-delivery-workspace-tab="fees"/);
  assert.doesNotMatch(admin,/deliveryWorkspacePane-fees/);
  assert.match(admin,/Las tarifas las configura el propio DELIVERY/);
});

test('editor de tarifas solo carga para DELIVERY_ADMIN',()=>{
  assert.match(admin,/async function loadFees\(\) \{\s*if \(state\.role !== "DELIVERY_ADMIN"\) return;/);
  assert.match(admin,/delivery_has_capability/);
  assert.match(admin,/feeCapabilityNotice/);
  assert.doesNotMatch(html,/id="enableDeliveryFeesBtn"/);
  assert.match(html,/Esta configuración pertenece al DELIVERY_ADMIN/);
});

test('MASTER conserva solo el control de habilitar o bloquear modalidades',()=>{
  assert.match(admin,/master_delivery_fee_modes_status/);
  assert.match(admin,/master_set_delivery_fee_mode/);
  assert.match(admin,/data-dw-fee-mode/);
  assert.match(admin,/El DELIVERY_ADMIN fija los precios/);
  assert.doesNotMatch(admin,/deliveryWorkspaceToggleFeeCapability/);
});

test('backend impide que MASTER u otros roles modifiquen precios',()=>{
  assert.match(migration,/current_role_code\(\) is distinct from 'DELIVERY_ADMIN'/);
  assert.match(migration,/assert_delivery_admin_can_manage_fees/);
  assert.match(migration,/save_delivery_fee_config/);
  assert.match(migration,/save_delivery_fee_schedule/);
  assert.match(migration,/save_delivery_distance_rate/);
  assert.match(migration,/save_delivery_fee_range/);
  const guards=(migration.match(/perform public\.assert_delivery_admin_can_manage_fees\(p_delivery_id\);/g)||[]).length;
  assert.equal(guards,4);
});
