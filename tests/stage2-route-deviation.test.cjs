const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260925171845_stage2_route_deviation.sql','utf8');
const edge=fs.readFileSync('supabase/functions/preparar-desvio-ruta/index.ts','utf8');
const shared=fs.readFileSync('supabase/functions/_shared/ors.ts','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

function sqlFunction(name){
  const needles=[
    'create or replace function '+name,
    'CREATE OR REPLACE FUNCTION '+name
  ];
  let start=-1;
  for(const needle of needles){
    start=migration.indexOf(needle);
    if(start>=0)break;
  }
  assert.ok(start>=0,'No se encontró '+name);
  const lower=migration.toLowerCase();
  const next=lower.indexOf('create or replace function ',start+20);
  return migration.slice(start,next>=0?next:migration.length);
}

test('planes e incidentes de desvío viven en private con deny-all',()=>{
  assert.match(migration,/create table if not exists private\.driver_route_deviation_plans/);
  assert.match(migration,/create table if not exists private\.driver_route_deviation_incidents/);
  assert.match(migration,/revoke all on table private\.driver_route_deviation_plans from public,anon,authenticated/);
  assert.match(migration,/revoke all on table private\.driver_route_deviation_incidents from public,anon,authenticated/);
  assert.match(migration,/create policy driver_route_deviation_plans_deny_all/);
  assert.match(migration,/create policy driver_route_deviation_incidents_deny_all/);
  assert.match(migration,/using\(false\)/);
  assert.match(migration,/with check\(false\)/);
});

test('cada pedido solo puede tener una alerta de desvío abierta',()=>{
  assert.match(migration,/create unique index if not exists driver_route_deviation_one_open_order_idx/);
  assert.match(migration,/on private\.driver_route_deviation_incidents\(order_id\)/);
  assert.match(migration,/where status in \('OPEN','ACKNOWLEDGED'\)/);
});

test('plan de desvío solo se prepara para DRIVER asignado a pedido EN_ROUTE',()=>{
  const fn=sqlFunction('public.driver_route_deviation_plan_context');
  assert.match(fn,/current_role_code\(\)<>'DELIVERY_DRIVER'/);
  assert.match(fn,/a\.driver_user_id=auth\.uid\(\)/);
  assert.match(fn,/a\.status='ACTIVE'/);
  assert.match(fn,/a\.unassigned_at is null/);
  assert.match(fn,/o\.status='EN_ROUTE'/);
});

test('desvío requiere safety.route_deviation y gps.live',()=>{
  const context=sqlFunction('public.driver_route_deviation_plan_context');
  const register=sqlFunction('public.driver_register_route_deviation_plan');
  const delivery=sqlFunction('public.delivery_route_deviation_snapshot');
  assert.match(context,/delivery_has_capability\(v\.delivery_id,'gps\.live'\)/);
  assert.match(context,/delivery_has_capability\(v\.delivery_id,'safety\.route_deviation'\)/);
  assert.match(register,/delivery_has_capability\(v\.delivery_id,'gps\.live'\)/);
  assert.match(register,/delivery_has_capability\(v\.delivery_id,'safety\.route_deviation'\)/);
  assert.match(delivery,/delivery_has_capability\(p_delivery_id,'gps\.live'\)/);
  assert.match(delivery,/delivery_has_capability\(p_delivery_id,'safety\.route_deviation'\)/);
});

test('geometría privada limita tamaño y valida lon lat',()=>{
  const fn=sqlFunction('private.route_points_valid');
  assert.match(fn,/jsonb_array_length\(p_points\)<2/);
  assert.match(fn,/jsonb_array_length\(p_points\)>2000/);
  assert.match(fn,/v_lng<-180/);
  assert.match(fn,/v_lng>180/);
  assert.match(fn,/v_lat<-90/);
  assert.match(fn,/v_lat>90/);
});

test('distancia al corredor se calcula localmente sin PostGIS',()=>{
  assert.match(migration,/route_point_segment_distance_m/);
  assert.match(migration,/route_polyline_distance_m/);
  assert.match(migration,/6371000\.0/);
  assert.match(migration,/sqrt\(cx\*cx\+cy\*cy\)/);
  assert.doesNotMatch(migration,/(?:\bST_Distance\s*\(|\bST_DWithin\s*\(|::\s*geography\b|\bgeography\s*\()/i);
});

test('ruta registrada debe terminar cerca del destino real del pedido',()=>{
  const fn=sqlFunction('public.driver_register_route_deviation_plan');
  assert.match(fn,/v_last:=p_route_points->\(jsonb_array_length\(p_route_points\)-1\)/);
  assert.match(fn,/v_destination_distance/);
  assert.match(fn,/v_destination_distance>500/);
  assert.match(fn,/la ruta preparada no termina cerca del destino/);
});

test('corredor operativo usa 300 m y descarta GPS con precisión peor a 150 m',()=>{
  const fn=sqlFunction('private.evaluate_route_deviation_location');
  assert.match(migration,/threshold_m numeric not null default 300/);
  assert.match(fn,/p_accuracy_m>150/);
  assert.match(fn,/return 0/);
  assert.match(fn,/v_distance>v_plan\.threshold_m/);
});

test('alerta exige tres muestras y veinte segundos fuera del corredor',()=>{
  const fn=sqlFunction('private.evaluate_route_deviation_location');
  assert.match(fn,/v_outside>=3/);
  assert.match(fn,/v_first\+interval '20 seconds'/);
  assert.match(fn,/insert into private\.driver_route_deviation_incidents/);
  assert.match(fn,/samples_outside/);
});

test('dos muestras consecutivas dentro auto-resuelven como RETURNED_TO_ROUTE',()=>{
  const fn=sqlFunction('private.evaluate_route_deviation_location');
  assert.match(fn,/v_inside>=2/);
  assert.match(fn,/status='RESOLVED'/);
  assert.match(fn,/resolution_reason='RETURNED_TO_ROUTE'/);
  assert.match(fn,/broadcast_route_deviation_incident/);
});

test('finalizar o cancelar pedido apaga plan y resuelve alerta abierta',()=>{
  const fn=sqlFunction('private.route_deviation_order_terminal');
  assert.match(fn,/new\.status in \('DELIVERED','CANCELLED'\)/);
  assert.match(fn,/set active=false/);
  assert.match(fn,/resolution_reason='ORDER_FINISHED'/);
  assert.match(migration,/create trigger trg_orders_route_deviation_terminal/);
});

test('cada actualización real de driver_live_locations evalúa el corredor',()=>{
  assert.match(migration,/create trigger trg_driver_live_route_deviation/);
  assert.match(migration,/after insert or update of latitude,longitude,accuracy_m,captured_at/);
  assert.match(migration,/private\.evaluate_route_deviation_location/);
});

test('broadcast sale solo a topics privados de DELIVERY y DRIVER',()=>{
  const fn=sqlFunction('private.broadcast_route_deviation_incident');
  assert.match(fn,/realtime\.send/);
  assert.match(fn,/route-deviation:delivery:/);
  assert.match(fn,/route-deviation:driver:/);
  assert.match(fn,/true/);
});

test('Realtime autoriza delivery por membership y driver solo por su uid',()=>{
  const fn=sqlFunction('private.can_receive_route_deviation_topic');
  assert.match(fn,/route-deviation:delivery:/);
  assert.match(fn,/route_deviation_user_has_delivery/);
  assert.match(fn,/orders\.view/);
  assert.match(fn,/route-deviation:driver:/);
  assert.match(fn,/auth\.uid\(\)=v_driver_id/);
  assert.match(migration,/create policy htpweb_route_deviation_receive/);
  assert.match(migration,/extension='broadcast'/);
});

test('helpers geométricos y de broadcast no son ejecutables por navegador',()=>{
  assert.match(migration,/revoke execute on function private\.route_point_segment_distance_m/);
  assert.match(migration,/revoke execute on function private\.route_points_valid/);
  assert.match(migration,/revoke execute on function private\.route_polyline_distance_m/);
  assert.match(migration,/revoke execute on function private\.evaluate_route_deviation_location/);
  assert.match(migration,/revoke execute on function private\.broadcast_route_deviation_incident/);
});

test('ADMIN puede reconocer y resolver solo dentro de su DELIVERY y orders.manage',()=>{
  const ack=sqlFunction('public.delivery_acknowledge_route_deviation');
  const resolve=sqlFunction('public.delivery_resolve_route_deviation');
  assert.match(ack,/route_deviation_user_has_delivery\(p_delivery_id\)/);
  assert.match(ack,/has_permission\('orders\.manage'\)/);
  assert.match(resolve,/route_deviation_user_has_delivery\(p_delivery_id\)/);
  assert.match(resolve,/has_permission\('orders\.manage'\)/);
  assert.match(resolve,/resolution_reason='MANUAL'/);
});

test('Edge usa auth=user y PostgreSQL decide destino y capability',()=>{
  assert.match(edge,/withSupabase\(\{ auth: "user" \}/);
  assert.match(edge,/driver_route_deviation_plan_context/);
  assert.match(edge,/destination_latitude/);
  assert.match(edge,/destination_longitude/);
  assert.match(edge,/driver_register_route_deviation_plan/);
  assert.doesNotMatch(edge,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(edge,/destination_lat\s*:\s*body|destination_lng\s*:\s*body/);
});

test('Edge pide GeoJSON simplificado a HeiGIT una sola vez por preparación',()=>{
  assert.match(shared,/ORS_DIRECTIONS_DRIVING_GEOJSON_URL/);
  assert.match(shared,/ORS_DIRECTIONS_DRIVING_URL \+ "\/geojson"/);
  assert.match(edge,/ORS_DIRECTIONS_DRIVING_GEOJSON_URL/);
  assert.match(edge,/geometry_simplify: true/);
  assert.match(edge,/instructions: false/);
  assert.match(edge,/coordinates: \[\[originLng, originLat\], \[destinationLng, destinationLat\]\]/);
});

test('Edge limita geometría antes de registrar plan',()=>{
  assert.match(edge,/if \(valid\.length <= 1400\) return valid/);
  assert.match(edge,/Math\.ceil\(valid\.length \/ 1400\)/);
  assert.match(edge,/route_points: points\.length/);
  assert.match(edge,/p_route_points: points/);
});

test('preparar-desvio-ruta exige JWT',()=>{
  assert.match(config,/\[functions\.preparar-desvio-ruta\]\s*\nverify_jwt = true/);
});

test('DELIVERY UI muestra desvíos y usa canal privado',()=>{
  assert.match(html,/id="deliveryDeviationRefresh"/);
  assert.match(html,/id="deliveryDeviationNotice"/);
  assert.match(html,/id="deliveryDeviationList"/);
  assert.match(admin,/delivery_route_deviation_snapshot/);
  assert.match(admin,/route-deviation:delivery:/);
  assert.match(admin,/config:\{private:true\}/);
  assert.match(admin,/delivery_acknowledge_route_deviation/);
  assert.match(admin,/delivery_resolve_route_deviation/);
});

test('DRIVER UI prepara plan al EN_ROUTE y permite reintento si falla',()=>{
  assert.match(admin,/driver_route_deviation_plan_context/);
  assert.match(admin,/preparar-desvio-ruta/);
  assert.match(admin,/data-driver-deviation-plan/);
  assert.match(admin,/Monitoreo de desvío pendiente/);
  assert.match(admin,/Monitoreo de desvío activo/);
  assert.match(admin,/next==="EN_ROUTE"/);
  assert.match(admin,/no se pudo preparar el monitoreo de desvío/i);
});

test('DRIVER recibe alertas por canal privado propio',()=>{
  assert.match(html,/id="driverRouteDeviationNotice"/);
  assert.match(admin,/route-deviation:driver:/);
  assert.match(admin,/event:"route_deviation"/);
  assert.match(admin,/HTPWEB detectó un desvío sostenido/);
  assert.match(admin,/Volviste al corredor esperado/);
});

test('admin.js sigue compilando',()=>{
  assert.doesNotThrow(()=>new Function(admin));
});
