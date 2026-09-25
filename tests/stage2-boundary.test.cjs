const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const catalog=fs.readFileSync('supabase/migrations/20260925045945_commercial_plan_catalog.sql','utf8');
const promote=fs.readFileSync('supabase/migrations/20260925125259_promote_restricted_areas_to_stage1.sql','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const monetization=fs.readFileSync('admin/monetization.js','utf8');
const page=fs.readFileSync('admin/monetizacion.html','utf8');
const drivers=fs.readFileSync('supabase/migrations/20260925132943_stage2_drivers_manual_dispatch.sql','utf8');

test('áreas restringidas ya pertenecen a Etapa 1',()=>{
  assert.match(promote,/restricted_areas\.active\.max/);
  assert.match(promote,/restricted_areas\.manage/);
  assert.match(promote,/restricted_areas\.schedule/);
  assert.match(promote,/set stage=1/);
  assert.match(admin,/delivery_restricted_area_context/);
  assert.match(admin,/delivery_save_restricted_area/);
});

test('logística avanzada permanece explícitamente en Etapa 2',()=>{
  for(const code of [
    'drivers.active.max',
    'orders.concurrent_per_driver.max',
    'gps_history.days',
    'gps.live',
    'tracking.customer',
    'dispatch.manual',
    'dispatch.hybrid',
    'dispatch.auto',
    'multi_order',
    'routes.optimize',
    'delivery_proof.pin',
    'delivery_proof.photo',
    'delivery_proof.signature',
    'safety.sos',
    'safety.route_deviation'
  ]){
    const line=catalog.split('\n').find(x=>x.includes("('"+code+"',"));
    assert.ok(line,'Falta '+code+' en catálogo');
    assert.match(line,/,2,/,'Debe seguir en Etapa 2: '+code);
  }
});

test('MASTER identifica visualmente funciones Etapa 2 como activación posterior',()=>{
  assert.match(monetization,/Etapa /);
  assert.match(page,/funciones de Etapa 2 pueden comercializarse desde ahora/i);
  assert.match(page,/operación se active posteriormente/i);
});

test('Repartidores y despacho manual ya son operativos dentro de Etapa 2',()=>{
  assert.match(drivers,/DELIVERY_DRIVER/);
  assert.match(drivers,/drivers\.active\.max/);
  assert.match(drivers,/dispatch\.manual/);
  assert.match(drivers,/orders\.concurrent_per_driver\.max/);
  assert.match(drivers,/usage_available',true/);
  assert.match(admin,/Gestiona cuáles cuentas están activas desde Repartidores/);
  assert.doesNotMatch(admin,/consumo se habilitará con el módulo de repartidores/);
});
