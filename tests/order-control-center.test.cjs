const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260927211500_delivery_order_control_center_snapshot.sql','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const css=fs.readFileSync('assets/admin.css','utf8');

test('snapshot operativo consolida pedido, locales, repartidor, GPS e historial',()=>{
  assert.match(migration,/delivery_order_control_snapshot/);
  assert.match(migration,/user_can_manage_delivery_resource/);
  assert.match(migration,/'items'/);
  assert.match(migration,/'locals'/);
  assert.match(migration,/'assignment'/);
  assert.match(migration,/driver_live_locations/);
  assert.match(migration,/'history'/);
  assert.match(migration,/grant execute on function public\.delivery_order_control_snapshot\(uuid,integer\)/);
});

test('Pedidos tiene KPIs, mapa, cola, filtros y detalle',()=>{
  for(const id of [
    'orderControlKpis','orderControlMap','ordersList','orderControlDetail',
    'orderControlFilter','orderControlSearch','orderControlAutoRefresh','orderControlRefresh'
  ]) assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/Centro de control de pedidos/);
  assert.match(css,/\.order-control-layout/);
  assert.match(css,/\.order-control-map/);
  assert.match(css,/\.order-control-kpis/);
});

test('centro usa snapshot seguro y refresca cada 15 segundos',()=>{
  assert.match(admin,/delivery_order_control_snapshot/);
  assert.match(admin,/delivery_drivers_snapshot/);
  assert.match(admin,/setInterval\([\s\S]*15000/);
  assert.match(admin,/orderControlAutoRefresh/);
  assert.match(admin,/renderOrderControlMap/);
  assert.match(admin,/L\.circleMarker/);
});

test('mapa del centro usa rutas viales ORS y no une puntos con línea recta',()=>{
  assert.match(admin,/functions\.invoke\("calcular-distancia"/);
  assert.match(admin,/include_geometry:true/);
  assert.match(admin,/orderControlRenderRoadRoutes/);
  assert.match(admin,/route\.geometry\.coordinates/);
  assert.match(admin,/Ruta vial ORS/);
  assert.doesNotMatch(admin,/dashArray:"7 7"/);
});

test('mapa recibe GPS por Realtime, anima el marcador y conserva estela del pedido actual',()=>{
  assert.match(admin,/channel\(topic,\{config:\{private:true\}\}\)/);
  assert.match(admin,/event:"location"/);
  assert.match(admin,/orderControlAnimateMarker/);
  assert.match(admin,/driverTrails/);
  assert.match(admin,/Recorrido reciente del repartidor/);
  assert.match(admin,/delivery_driver_gps_snapshot/);
  assert.match(admin,/captured>=assignedAt/);
});

test('detalle integra estados, WhatsApp y asignación de repartidor',()=>{
  assert.match(admin,/changeGlobalOrder/);
  assert.match(admin,/changeLocalOrder/);
  assert.match(admin,/sendLocalOrderWhatsapp/);
  assert.match(admin,/orderControlNotifyDriver/);
  assert.match(admin,/orderControlWhatsappCustomer/);
  assert.match(admin,/delivery_assign_order_driver/);
  assert.match(admin,/delivery_unassign_order_driver/);
});

test('detalle guía al operador con siguiente acción y flujo visual',()=>{
  assert.match(admin,/Siguiente acción/);
  assert.match(admin,/renderOrderControlNextAction/);
  assert.match(admin,/renderOrderControlStepper/);
  assert.match(admin,/orderControlDispatchPanel/);
  assert.match(css,/\.order-control-next-action/);
  assert.match(css,/\.order-control-stepper/);
  assert.match(css,/\.order-control-selected/);
});

test('LOCAL_ADMIN conserva vista compatible',()=>{
  assert.match(admin,/state\.role==="LOCAL_ADMIN"/);
  assert.match(admin,/loadOrdersLegacy/);
  assert.match(admin,/orderControlToggleLegacy\(true\)/);
});

test('JavaScript administrativo compila',()=>{
  assert.doesNotThrow(()=>new Function(admin));
});
