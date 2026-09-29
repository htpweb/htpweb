const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260929003047_shared_driver_route_sync.sql','utf8');
const edge=fs.readFileSync('supabase/functions/quick-driver-track/index.ts','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const mobile=fs.readFileSync('app/repartidor-rapido.html','utf8');

test('ruta vigente queda versionada y privada',()=>{
  assert.match(migration,/create table if not exists private\.driver_order_routes/);
  assert.match(migration,/unique\(order_id,version\)/);
  assert.match(migration,/driver_order_routes_one_active_idx/);
  assert.match(migration,/revoke all on table private\.driver_order_routes from public,anon,authenticated/);
});

test('ruta del repartidor se publica al centro de control por realtime',()=>{
  assert.match(migration,/quick_driver_register_active_route/);
  assert.match(migration,/'route_updated'/);
  assert.match(migration,/'order-tracking:'\|\|p_order_id::text/);
  assert.match(admin,/event:"route_updated"/);
  assert.match(admin,/current\.active_route=payload/);
});

test('consola móvil persiste y restaura la misma ruta',()=>{
  assert.match(edge,/quick_driver_route_snapshot/);
  assert.match(edge,/quick_driver_register_active_route/);
  assert.match(edge,/active_route:routeByOrder/);
  assert.match(mobile,/savedRouteForOrder/);
  assert.match(mobile,/data\.active_route/);
});

test('desvío sostenido recalcula sin exigir clic',()=>{
  assert.match(mobile,/AUTO_ROUTE_THRESHOLD_M=300/);
  assert.match(mobile,/AUTO_ROUTE_MIN_OUTSIDE_MS=20000/);
  assert.match(mobile,/AUTO_ROUTE_COOLDOWN_MS=60000/);
  assert.match(mobile,/maybeAutoRecalculateRoute/);
  assert.match(mobile,/calculateRoute\(true,'AUTO'\)/);
  assert.match(mobile,/accuracy>150/);
});

test('admin prioriza ruta compartida y conserva fallback ORS',()=>{
  assert.match(admin,/orderControlRenderSharedRoute/);
  assert.match(admin,/Ruta vigente/);
  assert.match(admin,/sharedRoutePoints\.length/);
  assert.match(admin,/orderControlRenderRoadRoutes\(order,generation\)/);
});

test('javascript admin y móvil compila',()=>{
  assert.doesNotThrow(()=>new Function(admin));
  const scripts=[...mobile.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline=scripts.at(-1)?.[1]||'';
  assert.ok(inline.length>0);
  assert.doesNotThrow(()=>new Function(inline));
});
