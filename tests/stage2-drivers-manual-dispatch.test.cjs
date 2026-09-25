const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260925132943_stage2_drivers_manual_dispatch.sql','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const access=fs.readFileSync('app/acceso.html','utf8');

test('DELIVERY_DRIVER es un rol separado de operador y cliente',()=>{
  assert.match(migration,/'DELIVERY_DRIVER'/);
  assert.match(migration,/DELIVERY_ADMIN','DELIVERY_OPERATOR','DELIVERY_DRIVER/);
  assert.match(migration,/dashboard\.view','orders\.view/);
  assert.match(admin,/DELIVERY_DRIVER:\s*\["driverorders"\]/);
  assert.match(html,/data-section="driverorders">Mis entregas/);
});

test('DELIVERY_ADMIN activa repartidores dentro de drivers.active.max',()=>{
  const fn=migration.match(/create or replace function public\.delivery_set_driver[\s\S]*?grant execute on function public\.delivery_set_driver/)?.[0]||'';
  assert.match(fn,/current_role_code\(\)<>'DELIVERY_ADMIN'/);
  assert.match(fn,/has_permission\('users\.manage'\)/);
  assert.match(fn,/drivers\.active\.max/);
  assert.match(fn,/v_count>=v_limit/);
  assert.match(fn,/CLIENT','DELIVERY_DRIVER/);
});

test('búsqueda de repartidor exige correo o teléfono exacto',()=>{
  const fn=migration.match(/create or replace function public\.delivery_driver_lookup[\s\S]*?grant execute on function public\.delivery_driver_lookup/)?.[0]||'';
  assert.match(fn,/lower\(u\.email\)=lower\(v_identifier\)/);
  assert.match(fn,/htp_normalize_contact_phone/);
  assert.doesNotMatch(fn,/ilike|%.*v_identifier/i);
  assert.match(admin,/correo o teléfono exacto/i);
});

test('tabla de asignaciones no queda expuesta al navegador',()=>{
  assert.match(migration,/alter table public\.order_driver_assignments enable row level security/);
  assert.match(migration,/revoke all on table public\.order_driver_assignments from anon,authenticated/);
  assert.match(migration,/order_driver_assignments_one_active_order_idx/);
});

test('despacho manual depende del plan y del límite simultáneo',()=>{
  const fn=migration.match(/create or replace function public\.delivery_assign_order_driver[\s\S]*?grant execute on function public\.delivery_assign_order_driver/)?.[0]||'';
  assert.match(fn,/dispatch\.manual/);
  assert.match(fn,/orders\.concurrent_per_driver\.max/);
  assert.match(fn,/drivers\.active\.max/);
  assert.match(fn,/status='READY'/);
  assert.match(fn,/v_concurrent>=v_concurrent_limit/);
});

test('pedido READY no puede pasar a EN_ROUTE sin repartidor cuando aplica despacho manual',()=>{
  assert.match(migration,/enforce_manual_dispatch_assignment/);
  assert.match(migration,/old\.status='READY'/);
  assert.match(migration,/new\.status='EN_ROUTE'/);
  assert.match(migration,/dispatch\.manual/);
  assert.match(migration,/asigna un repartidor antes de marcar el pedido EN_ROUTE/);
});

test('repartidor solo ve sus asignaciones y solo mueve READY a EN_ROUTE a DELIVERED',()=>{
  const snapshot=migration.match(/create or replace function public\.driver_my_orders[\s\S]*?grant execute on function public\.driver_my_orders/)?.[0]||'';
  const status=migration.match(/create or replace function public\.driver_set_order_status[\s\S]*?grant execute on function public\.driver_set_order_status/)?.[0]||'';
  assert.match(snapshot,/a\.driver_user_id=auth\.uid\(\)/);
  assert.match(snapshot,/ud\.user_id=auth\.uid\(\)/);
  assert.match(status,/current_role_code\(\)<>'DELIVERY_DRIVER'/);
  assert.match(status,/v_old_status='READY' and v_new_status='EN_ROUTE'/);
  assert.match(status,/v_old_status='EN_ROUTE' and v_new_status='DELIVERED'/);
  assert.doesNotMatch(status,/CANCELLED/);
});

test('entrega o cancelación cierra la asignación activa',()=>{
  assert.match(migration,/sync_order_driver_assignment_terminal/);
  assert.match(migration,/new\.status in \('DELIVERED','CANCELLED'\)/);
  assert.match(migration,/COMPLETED/);
  assert.match(migration,/CANCELLED/);
});

test('ADMIN y OPERATOR comparten despacho pero solo ADMIN gestiona altas',()=>{
  assert.match(admin,/DELIVERY_ADMIN: \[[^\]]*"drivers"/);
  assert.match(admin,/DELIVERY_OPERATOR: \[[^\]]*"drivers"/);
  assert.match(admin,/state\.role==="DELIVERY_ADMIN"/);
  assert.match(html,/id="driverAdminTools"/);
  assert.match(admin,/delivery_assign_order_driver/);
  assert.match(admin,/delivery_set_driver/);
});

test('Mi Plan ya muestra consumo real de repartidores',()=>{
  assert.match(migration,/v_drivers_used/);
  assert.match(migration,/usage_available',true/);
  assert.match(migration,/configuration_section','drivers/);
  assert.match(admin,/Gestiona cuáles cuentas están activas desde Repartidores/);
  assert.match(html,/id="myPlanGoDrivers"/);
});

test('login y servicio reconocen DELIVERY_DRIVER sin darle Pedidos globales',()=>{
  assert.match(access,/DELIVERY_DRIVER/);
  assert.match(admin,/\["DELIVERY_ADMIN","DELIVERY_OPERATOR","DELIVERY_DRIVER"\]/);
  const roleBlock=admin.match(/const roleSections = \{[\s\S]*?\n\};/)?.[0]||'';
  const driverLine=roleBlock.match(/DELIVERY_DRIVER:\s*\[[^\]]*\]/)?.[0]||'';
  assert.match(driverLine,/"driverorders"/);
  assert.doesNotMatch(driverLine,/"orders"/);
});

test('scripts principales siguen compilando como JavaScript',()=>{
  assert.doesNotThrow(()=>new Function(admin));
  const scripts=[...access.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline=scripts.at(-1)?.[1]||'';
  assert.ok(inline.length>0);
  assert.doesNotThrow(()=>new Function(inline));
});
