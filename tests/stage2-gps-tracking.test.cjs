const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260925135211_stage2_gps_tracking.sql','utf8');
const retention=fs.readFileSync('supabase/migrations/20260925144627_gps_storage_retention_hardening.sql','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const customer=fs.readFileSync('app/pedidos.html','utf8');

test('tablas GPS quedan cerradas y solo accesibles por RPC',()=>{
  assert.match(migration,/create table if not exists public\.driver_live_locations/);
  assert.match(migration,/create table if not exists public\.driver_location_history/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on table public\.driver_live_locations from anon,authenticated/);
  assert.match(migration,/revoke all on table public\.driver_location_history from anon,authenticated/);
  assert.doesNotMatch(admin,/\.from\(["']driver_live_locations/);
  assert.doesNotMatch(customer,/\.from\(["']driver_live_locations/);
});

test('repartidor solo publica GPS con entrega EN_ROUTE y capability gps.live',()=>{
  const fn=migration.match(/create or replace function public\.driver_update_location[\s\S]*?grant execute on function public\.driver_update_location/)?.[0]||'';
  assert.match(fn,/current_role_code\(\)<>'DELIVERY_DRIVER'/);
  assert.match(fn,/user_has_delivery\(p_delivery_id\)/);
  assert.match(fn,/delivery_has_capability\(p_delivery_id,'gps\.live'\)/);
  assert.match(fn,/o\.status='EN_ROUTE'/);
  assert.match(fn,/coordenadas GPS inválidas/);
  assert.match(fn,/interval '5 seconds'/);
  assert.match(fn,/interval '10 minutes'/);
});

test('historial GPS depende de gps_history.days y tiene limpieza programada',()=>{
  assert.match(migration,/gps_history\.days/);
  assert.match(migration,/driver_location_history/);
  assert.match(migration,/prune_driver_location_history/);
  assert.match(migration,/htpweb-prune-driver-location-history/);
  assert.match(migration,/'17 3 \* \* \*'/);
});

test('broadcast de ubicación usa topic por pedido y canal privado',()=>{
  const fn=migration.match(/create or replace function public\.driver_update_location[\s\S]*?grant execute on function public\.driver_update_location/)?.[0]||'';
  assert.match(fn,/realtime\.send\(/);
  assert.match(fn,/'order-tracking:'\|\|v_order\.id::text/);
  assert.match(fn,/'location'/);
  assert.match(fn,/true\s*\n\s*\)/);
  assert.match(customer,/config:\s*\{\s*private:\s*true\s*\}/);
});

test('Realtime solo deja recibir tracking a actores autorizados',()=>{
  const fn=migration.match(/create or replace function private\.can_receive_order_tracking_topic[\s\S]*?grant execute on function private\.can_receive_order_tracking_topic/)?.[0]||'';
  assert.match(fn,/current_customer_id\(\)=v_customer_id/);
  assert.match(fn,/tracking\.customer/);
  assert.match(fn,/DELIVERY_ADMIN','DELIVERY_OPERATOR/);
  assert.match(fn,/DELIVERY_DRIVER/);
  assert.match(migration,/create policy htpweb_order_tracking_receive/);
  assert.match(migration,/private\.can_receive_order_tracking_topic/);
  assert.match(migration,/drop function if exists public\.can_receive_order_tracking_topic/);
  assert.match(migration,/realtime\.messages\.extension='broadcast'/);
});

test('downgrade de gps.live no filtra coordenadas por snapshot administrativo',()=>{
  const fn=migration.match(/create or replace function public\.delivery_driver_gps_snapshot[\s\S]*?grant execute on function public\.delivery_driver_gps_snapshot/)?.[0]||'';
  assert.match(fn,/if not public\.delivery_has_capability\(p_delivery_id,'gps\.live'\)/);
  assert.match(fn,/'current',null/);
  assert.match(fn,/'history','\[\]'::jsonb/);
  const capabilityCheck=fn.indexOf("delivery_has_capability(p_delivery_id,'gps.live')");
  const liveSelect=fn.indexOf('from public.driver_live_locations');
  assert.ok(capabilityCheck>=0 && liveSelect>capabilityCheck);
});

test('CLIENT solo obtiene tracking de su propio pedido EN_ROUTE y con plan habilitado',()=>{
  const fn=migration.match(/create or replace function public\.customer_order_tracking_snapshot[\s\S]*?grant execute on function public\.customer_order_tracking_snapshot/)?.[0]||'';
  assert.match(fn,/current_customer_id\(\)/);
  assert.match(fn,/o\.customer_id=v_customer_id/);
  assert.match(fn,/gps\.live/);
  assert.match(fn,/tracking\.customer/);
  assert.match(fn,/v_order\.status<>'EN_ROUTE'/);
  assert.match(fn,/order_driver_assignments/);
});

test('Mis pedidos muestra mapa solo para EN_ROUTE y limpia la suscripción',()=>{
  assert.match(customer,/customer_order_tracking_snapshot/);
  assert.match(customer,/order\.status === 'EN_ROUTE'/);
  assert.match(customer,/id="trackingMap"/);
  assert.match(customer,/removeChannel\(channel\)/);
  assert.match(customer,/tracking_ended/);
  assert.match(customer,/void stopCustomerTracking\(\)/);
  assert.match(customer,/leaflet@1\.9\.4/);
});

test('repartidor comparte GPS voluntariamente y con throttling en cliente',()=>{
  assert.match(adminHtml,/id="driverGpsStart"/);
  assert.match(adminHtml,/id="driverGpsStop"/);
  assert.match(admin,/navigator\.geolocation\.watchPosition/);
  assert.match(admin,/driver_update_location/);
  assert.match(admin,/now-driverGpsState\.lastSentAt<10000/);
  assert.match(admin,/Necesitas una entrega EN_ROUTE/);
});

test('DELIVERY ve ubicación e historial solo mediante snapshot autorizado',()=>{
  assert.match(admin,/delivery_driver_gps_snapshot/);
  assert.match(admin,/Ver GPS/);
  assert.match(admin,/OpenStreetMap|openstreetmap/i);
  assert.match(adminHtml,/id="driverGpsMap"/);
});

test('al finalizar una entrega se termina el tracking y se limpia ubicación live si corresponde',()=>{
  assert.match(migration,/tracking_order_terminal/);
  assert.match(migration,/tracking_ended/);
  assert.match(migration,/DELIVERED','CANCELLED/);
  assert.match(migration,/delete from public\.driver_live_locations/);
});

test('retención elimina ubicación live sin servicio, sin gps.live o sin entrega EN_ROUTE',()=>{
  assert.match(retention,/delete from public\.driver_live_locations/);
  assert.match(retention,/not public\.delivery_service_is_active\(l\.delivery_id\)/);
  assert.match(retention,/not public\.delivery_has_capability\(l\.delivery_id,'gps\.live'\)/);
  assert.match(retention,/not exists\([\s\S]*?o\.status='EN_ROUTE'/);
  assert.match(retention,/captured_at<now\(\)-make_interval\(days=>v_days\)/);
  assert.match(retention,/grant execute on function public\.prune_driver_location_history\(\)[\s\S]*?to service_role/);
});

test('scripts modificados siguen compilando',()=>{
  assert.doesNotThrow(()=>new Function(admin));
  const scripts=[...customer.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline=scripts.at(-1)?.[1]||'';
  assert.ok(inline.length>0);
  assert.doesNotThrow(()=>new Function(inline));
});
