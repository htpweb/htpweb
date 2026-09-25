const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const planMigration=fs.readFileSync('supabase/migrations/20260925045945_commercial_plan_catalog.sql','utf8');
const feeMigration=fs.readFileSync('supabase/migrations/20260925050557_commercial_plan_fee_integration.sql','utf8');

test('Tarifa fija, distancia y día-noche son capacidades del plan comercial',()=>{
  assert.match(planMigration,/delivery_fees\.fixed/);
  assert.match(planMigration,/delivery_fees\.distance/);
  assert.match(planMigration,/delivery_fees\.day_night/);
});

test('MASTER ya no habilita tarifas manualmente dentro del DELIVERY',()=>{
  assert.doesNotMatch(admin,/data-dw-fee-mode/);
  assert.match(admin,/Abrir Planes y suscripciones/);
});

test('DELIVERY_ADMIN configura precios solo dentro de modalidades contratadas',()=>{
  const load=admin.match(/async function loadFeeDelivery\(\)[\s\S]*?async function saveFeeConfig/)?.[0]||'';
  assert.match(load,/delivery_fees\.fixed/);
  assert.match(load,/delivery_fees\.distance/);
  assert.match(feeMigration,/delivery_fee_mode_enabled/);
  assert.match(feeMigration,/delivery_fees\.day_night/);
});
