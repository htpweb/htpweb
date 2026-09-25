const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260925154326_stage2_route_optimization.sql','utf8');
const edge=fs.readFileSync('supabase/functions/optimizar-ruta/index.ts','utf8');
const shared=fs.readFileSync('supabase/functions/_shared/ors.ts','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

test('driver_route_context es exclusivo del repartidor y de su DELIVERY activo',()=>{
  assert.match(migration,/current_role_code\(\)<>'DELIVERY_DRIVER'/);
  assert.match(migration,/ud\.user_id=auth\.uid\(\)/);
  assert.match(migration,/ud\.delivery_id=p_delivery_id/);
  assert.match(migration,/ud\.active=true/);
  assert.match(migration,/no perteneces a este DELIVERY/);
});

test('routes.optimize se valida en PostgreSQL antes de exponer paradas',()=>{
  const cap=migration.indexOf("delivery_has_capability(p_delivery_id,'routes.optimize')");
  const orders=migration.indexOf('from public.order_driver_assignments');
  assert.ok(cap>=0);
  assert.ok(orders>=0);
  assert.ok(cap<orders);
  assert.match(migration,/ROUTES_NOT_INCLUDED/);
  assert.match(migration,/delivery_service_is_active/);
});

test('contexto solo contiene asignaciones activas propias y pedidos READY o EN_ROUTE',()=>{
  assert.match(migration,/a\.driver_user_id=auth\.uid\(\)/);
  assert.match(migration,/a\.status='ACTIVE'/);
  assert.match(migration,/a\.unassigned_at is null/);
  assert.match(migration,/o\.status in \('READY','EN_ROUTE'\)/);
  assert.match(migration,/'order_id',o\.id/);
  assert.match(migration,/'latitude',o\.latitude/);
  assert.match(migration,/'longitude',o\.longitude/);
});

test('no recalcula una tanda cuando ya existe una entrega EN_ROUTE',()=>{
  assert.match(migration,/count\(\*\) filter\(where o\.status='EN_ROUTE'\)/);
  assert.match(migration,/v_en_route>0/);
  assert.match(migration,/ORDER_EN_ROUTE/);
  assert.match(edge,/ORDER_EN_ROUTE: "Ya existe una entrega EN_ROUTE/);
});

test('optimización requiere al menos dos paradas y coordenadas válidas',()=>{
  assert.match(migration,/v_invalid>0/);
  assert.match(migration,/INVALID_COORDINATES/);
  assert.match(migration,/v_count<2/);
  assert.match(migration,/NOT_ENOUGH_STOPS/);
  assert.match(edge,/orders\.length < 2/);
  assert.match(edge,/validCoordinate/);
});

test('Edge Function usa auth de usuario y RPC autorizado, no service role',()=>{
  assert.match(edge,/withSupabase/);
  assert.match(edge,/\{ auth: "user" \}/);
  assert.match(edge,/ctx\.supabase\.rpc\(\s*"driver_route_context"/);
  assert.doesNotMatch(edge,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(edge,/SUPABASE_SECRET_KEYS/);
  assert.doesNotMatch(edge,/\.from\(["']orders["']/);
  assert.doesNotMatch(edge,/\.from\(["']order_driver_assignments["']/);
});

test('VROOM usa endpoint HeiGIT y recibe solo un vehículo con jobs autorizados',()=>{
  assert.match(shared,/ORS_OPTIMIZATION_URL/);
  assert.match(shared,/https:\/\/api\.heigit\.org\/vroom\/v0/);
  assert.match(edge,/ORS_OPTIMIZATION_URL/);
  assert.match(edge,/vehicles: \[\{/);
  assert.match(edge,/profile: "driving-car"/);
  assert.match(edge,/start: \[originLng, originLat\]/);
  assert.match(edge,/jobs,/);
  assert.match(edge,/description: order\.order_id/);
});

test('respuesta incompleta o con paradas no asignadas se rechaza',()=>{
  assert.match(edge,/optimization\.unassigned\.length > 0/);
  assert.match(edge,/UNASSIGNED_STOPS/);
  assert.match(edge,/jobSteps\.length !== orders\.length/);
  assert.match(edge,/INCOMPLETE_ROUTE/);
  assert.match(edge,/UNKNOWN_STOP/);
});

test('Edge Function devuelve secuencia, distancia y duración sin cambiar estados',()=>{
  assert.match(edge,/sequence: index \+ 1/);
  assert.match(edge,/distance_km/);
  assert.match(edge,/duration_minutes/);
  assert.match(edge,/travel_seconds_from_start/);
  assert.doesNotMatch(edge,/driver_set_order_status/);
  assert.doesNotMatch(edge,/delivery_assign_order_driver/);
});

test('optimizar-ruta exige JWT y permite preflight CORS antes del handler autenticado',()=>{
  assert.match(config,/\[functions\.optimizar-ruta\]\s*\nverify_jwt = true/);
  assert.match(edge,/req\.method === "OPTIONS"/);
  const options=edge.indexOf('req.method === "OPTIONS"');
  const call=edge.lastIndexOf('authenticatedHandler(req)');
  assert.ok(options>=0&&call>options);
});

test('UI obtiene geolocalización y nunca envía lista de pedidos al optimizador',()=>{
  const start=admin.indexOf('async function optimizeDriverRoute(){');
  const end=admin.indexOf('async function loadDriverOrders(){',start);
  assert.ok(start>=0&&end>start);
  const fn=admin.slice(start,end);
  assert.match(fn,/currentPositionOnce/);
  assert.match(fn,/functions\.invoke\("optimizar-ruta"/);
  assert.match(fn,/delivery_id:deliveryId/);
  assert.match(fn,/origin_lat:position\.latitude/);
  assert.match(fn,/origin_lng:position\.longitude/);
  assert.doesNotMatch(fn,/orders\s*:/);
  assert.doesNotMatch(fn,/driver_set_order_status/);
});

test('ruta calculada ordena entregas y bloquea iniciar una parada posterior',()=>{
  assert.match(admin,/driverRouteRank/);
  assert.match(admin,/nextRouteOrderId/);
  assert.match(admin,/Según ruta: espera/);
  assert.match(admin,/Iniciar siguiente parada/);
  assert.match(admin,/Siguiente parada de la ruta optimizada/);
});

test('al completar pedidos la ruta en memoria elimina paradas inactivas',()=>{
  assert.match(admin,/function reconcileDriverRoutePlan/);
  assert.match(admin,/activeIds\.has\(stop\.order_id\)/);
  assert.match(admin,/state\.driverRoutePlan=null/);
  assert.match(admin,/await loadDriverOrders\(\)/);
});

test('pantalla del repartidor incluye controles de optimización sin alterar GPS',()=>{
  assert.match(html,/id="driverRouteDelivery"/);
  assert.match(html,/id="driverRouteOptimize"/);
  assert.match(html,/id="driverRouteResult"/);
  assert.match(html,/id="driverGpsStart"/);
  assert.match(html,/id="driverOrdersList"/);
});

test('admin.js sigue compilando después de integrar rutas',()=>{
  assert.doesNotThrow(()=>new Function(admin));
});
