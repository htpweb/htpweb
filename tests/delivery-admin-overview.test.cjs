const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20260926030315_delivery_admin_operational_overview.sql','utf8');

test('DELIVERY_ADMIN usa un resumen operativo dedicado',()=>{
  assert.match(admin,/state\.role==="DELIVERY_ADMIN"/);
  assert.match(admin,/delivery_admin_overview_snapshot/);
  assert.match(admin,/Ingresos por entregas/);
  assert.match(admin,/Repartidores activos/);
  assert.match(admin,/Pedidos listos sin repartidor/);
  assert.match(admin,/Zonas sobre el límite del plan/);
});

test('el resumen DELIVERY no usa catálogo como indicador operativo',()=>{
  const start=admin.indexOf('async function loadDeliveryAdminOverview');
  const end=admin.indexOf('async function loadOverview',start);
  const block=admin.slice(start,end);
  assert.doesNotMatch(block,/Productos sin foto/);
  assert.doesNotMatch(block,/Productos inactivos/);
  assert.doesNotMatch(block,/Locales inactivos/);
  assert.doesNotMatch(block,/Productos publicados/);
});

test('acciones rápidas DELIVERY apuntan a operación',()=>{
  assert.match(admin,/\["drivers","Repartidores"/);
  assert.match(admin,/\["coverage","Zonas y cobertura"/);
  assert.match(admin,/\["fees","Tarifas"/);
  assert.match(admin,/\["network","Clientes y referidos"/);
  assert.match(admin,/\["myplan","Mi plan"/);
  assert.doesNotMatch(admin,/DELIVERY_ADMIN"[\s\S]{0,500}Gestionar catálogo/);
});

test('los títulos del overview pueden cambiar a modo DELIVERY',()=>{
  assert.match(html,/id="overviewHeadingTitle"/);
  assert.match(html,/id="overviewHealthTitle"/);
  assert.match(admin,/Estado de mi operación/);
  assert.match(admin,/Capacidad operativa/);
});

test('RPC valida ámbito y calcula ingreso de entrega',()=>{
  assert.match(migration,/user_has_delivery\(p_delivery_id\)/);
  assert.match(migration,/sum\(o\.delivery_fee\)/);
  assert.match(migration,/order_driver_assignments/);
  assert.match(migration,/delivery_my_plan_summary/);
});
