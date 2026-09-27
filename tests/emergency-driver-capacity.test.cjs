const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260927225000_emergency_driver_plan_capacity.sql','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const mobile=fs.readFileSync('app/repartidor-rapido.html','utf8');

test('planes DELIVERY incluyen cupos de emergencia separados',()=>{
  assert.match(migration,/drivers\.emergency\.max/);
  assert.match(migration,/Cupos de repartidor de emergencia/);
  assert.match(migration,/upper\(p\.name\) like '%PRO%'[\s\S]*then '2'::jsonb[\s\S]*else '1'::jsonb/);
});

test('user_deliveries distingue REGULAR de EMERGENCY',()=>{
  assert.match(migration,/driver_mode text not null default 'REGULAR'/);
  assert.match(migration,/driver_mode in \('REGULAR','EMERGENCY'\)/);
  assert.match(migration,/emergency_started_at/);
  assert.match(migration,/emergency_expires_at/);
});

test('alta rápida crea emergencia de 24 horas y respeta su límite',()=>{
  const attach=(migration.match(/create or replace function public\.quick_driver_attach[\s\S]*?create or replace function public\.quick_driver_rotate_token/)||[''])[0];
  assert.match(attach,/drivers\.emergency\.max/);
  assert.match(attach,/interval '24 hours'/);
  assert.match(attach,/driver_mode='EMERGENCY'/);
  assert.match(attach,/máximo de repartidores de emergencia activos/);
  assert.doesNotMatch(attach,/drivers\.active\.max/);
});

test('repartidor regular sigue usando drivers.active.max',()=>{
  const regular=(migration.match(/create or replace function public\.delivery_set_driver[\s\S]*?create or replace function private\.assign_order_driver_internal/)||[''])[0];
  assert.match(regular,/drivers\.active\.max/);
  assert.match(regular,/driver_mode='REGULAR'/);
  assert.doesNotMatch(regular,/v_limit:=public\.delivery_limit_value\(p_delivery_id,'drivers\.emergency\.max'\)/);
});

test('emergencia vencida no recibe pedidos nuevos pero termina el activo',()=>{
  assert.match(migration,/el cupo de emergencia venció; este repartidor no puede recibir pedidos nuevos/);
  assert.match(migration,/o\.status in \('READY','EN_ROUTE'\)/);
  assert.match(migration,/emergency_grace/);
  assert.match(migration,/delivery_cleanup_expired_emergency_drivers/);
});

test('cleanup automático corre al terminar o quitar la entrega',()=>{
  assert.match(migration,/htpweb_cleanup_emergency_order_terminal/);
  assert.match(migration,/after update of status on public\.orders/);
  assert.match(migration,/htpweb_cleanup_emergency_assignment_change/);
  assert.match(migration,/after update of status,unassigned_at on public\.order_driver_assignments/);
  assert.match(migration,/quick_driver_tracking_tokens[\s\S]*set active=false/);
});

test('Mi Plan separa regulares y emergencias',()=>{
  assert.match(migration,/'emergency_drivers'/);
  assert.match(admin,/Repartidores de emergencia/);
  assert.match(admin,/usage\.emergency_drivers/);
  assert.match(admin,/Emergencia .*emergencyDrivers\.used/);
});

test('panel y móvil explican duración y gracia',()=>{
  assert.match(html,/Repartidor de emergencia por WhatsApp/);
  assert.match(html,/24 horas/);
  assert.match(html,/Crear emergencia y abrir WhatsApp/);
  assert.match(admin,/EMERGENCIA/);
  assert.match(admin,/Vencido · termina entrega actual/);
  assert.match(mobile,/Cupo temporal hasta/);
  assert.match(mobile,/No recibirás pedidos nuevos/);
});