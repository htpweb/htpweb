const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const edge=fs.readFileSync('supabase/functions/master-user-account/index.ts','utf8');
const guard=fs.readFileSync('supabase/migrations/20260926020913_master_delivery_account_storage_guard.sql','utf8');
const status=fs.readFileSync('supabase/migrations/20260926021200_master_delivery_account_status_consistency.sql','utf8');

test('MASTER DELIVERY muestra acciones de cuenta separadas de revocar acceso',()=>{
  assert.match(admin,/Desactivar cuenta/);
  assert.match(admin,/Reactivar cuenta/);
  assert.match(admin,/Eliminar cuenta/);
  assert.match(admin,/master-user-account/);
  assert.match(admin,/data-dw-account-action/);
  assert.match(admin,/Revocar acceso/);
});

test('la Edge Function exige MASTER y usa Auth Admin en servidor',()=>{
  assert.match(edge,/rpc\("is_master"\)/);
  assert.match(edge,/MASTER_REQUIRED/);
  assert.match(edge,/auth\.admin\.updateUserById/);
  assert.match(edge,/auth\.admin\.deleteUser/);
  assert.match(edge,/MASTER_TARGET_BLOCKED/);
  assert.match(edge,/authorization_id/);
});

test('el borrado protege historial y objetos Storage',()=>{
  assert.match(guard,/storage\.objects/);
  assert.match(guard,/HISTORY_PROTECTED/);
  assert.match(guard,/order_driver_assignments/);
  assert.match(guard,/driver_location_history|pg_constraint/);
});

test('Activo exige perfil activo y Auth no bloqueada',()=>{
  assert.match(status,/coalesce\(pr\.active,false\)/);
  assert.match(status,/banned_until>now\(\)/);
  assert.match(status,/account_disabled/);
});
