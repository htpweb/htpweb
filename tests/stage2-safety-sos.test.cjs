const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260925164245_stage2_safety_sos.sql','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

function sqlFunction(name){
  const start=migration.indexOf('CREATE OR REPLACE FUNCTION '+name);
  assert.ok(start>=0,'No se encontró '+name);
  const next=migration.indexOf('CREATE OR REPLACE FUNCTION ',start+1);
  return migration.slice(start,next>=0?next:migration.length);
}

test('incidentes SOS viven en private con RLS deny-all',()=>{
  assert.match(migration,/create table if not exists private\.driver_sos_incidents/);
  assert.match(migration,/alter table private\.driver_sos_incidents enable row level security/);
  assert.match(migration,/revoke all on table private\.driver_sos_incidents from public,anon,authenticated/);
  assert.match(migration,/create policy driver_sos_incidents_deny_all/);
  assert.match(migration,/using\(false\)/);
  assert.match(migration,/with check\(false\)/);
});

test('solo puede existir un SOS abierto por repartidor y DELIVERY',()=>{
  assert.match(migration,/create unique index if not exists driver_sos_one_open_per_delivery_idx/);
  assert.match(migration,/on private\.driver_sos_incidents\(delivery_id,driver_user_id\)/);
  assert.match(migration,/where status in \('OPEN','ACKNOWLEDGED'\)/);
});

test('driver_trigger_sos exige repartidor, asignación ACTIVE y pedido EN_ROUTE',()=>{
  const fn=migration.match(/CREATE OR REPLACE FUNCTION public\.driver_trigger_sos[\s\S]*?REVOKE EXECUTE ON FUNCTION private\.sos_payload/i)?.[0]||migration;
  assert.match(fn,/current_role_code\(\) <> 'DELIVERY_DRIVER'|current_role_code\(\)<>'DELIVERY_DRIVER'/i);
  assert.match(fn,/a\.driver_user_id = auth\.uid\(\)|a\.driver_user_id=auth\.uid\(\)/i);
  assert.match(fn,/a\.status = 'ACTIVE'|a\.status='ACTIVE'/i);
  assert.match(fn,/a\.unassigned_at IS NULL|a\.unassigned_at is null/i);
  assert.match(fn,/o\.status = 'EN_ROUTE'|o\.status='EN_ROUTE'/i);
});

test('crear SOS requiere safety.sos del plan pero atender uno existente no',()=>{
  assert.match(migration,/delivery_has_capability\(v_assignment\.delivery_id, 'safety\.sos'\)|delivery_has_capability\(v_assignment\.delivery_id,'safety\.sos'\)/i);
  const membership=sqlFunction('private.sos_user_has_delivery');
  assert.match(membership,/user_deliveries/i);
  assert.doesNotMatch(membership,/delivery_service_is_active/i);

  const snapshot=sqlFunction('public.delivery_sos_snapshot');
  assert.match(snapshot,/sos_user_has_delivery/i);
  assert.match(snapshot,/delivery_has_capability\(p_delivery_id, 'safety\.sos'\)|delivery_has_capability\(p_delivery_id,'safety\.sos'\)/i);
  assert.doesNotMatch(snapshot,/return jsonb_build_object\(\s*'enabled', false,\s*'incidents', '\[\]'/i);
});

test('SOS no depende de que exista ubicación',()=>{
  const fn=sqlFunction('public.driver_trigger_sos');
  assert.match(fn,/v_source text := 'NONE'|v_source text:='NONE'/i);
  assert.match(fn,/location_source/i);
  assert.match(fn,/insert into private\.driver_sos_incidents/i);
  assert.doesNotMatch(fn,/coalesce\(p_latitude|p_latitude is null.*raise exception/is);
});

test('SOS prefiere GPS en vivo reciente y usa dispositivo como respaldo',()=>{
  const fn=sqlFunction('public.driver_trigger_sos');
  assert.match(fn,/driver_live_locations/i);
  assert.match(fn,/interval '2 minutes'/i);
  assert.match(fn,/v_source := 'LIVE_GPS'|v_source:='LIVE_GPS'/i);
  assert.match(fn,/v_source := 'DEVICE'|v_source:='DEVICE'/i);
  assert.match(fn,/interval '10 minutes'/i);
});

test('doble toque usa advisory lock y reutiliza incidente abierto',()=>{
  const fn=sqlFunction('public.driver_trigger_sos');
  assert.match(fn,/pg_advisory_xact_lock/i);
  assert.match(fn,/status in \('OPEN','ACKNOWLEDGED'\)/i);
  assert.match(fn,/for update/i);
  assert.match(fn,/if v_incident_id is null/i);
  assert.match(fn,/already_open/i);
});

test('broadcast SOS sale solo a dos topics privados específicos',()=>{
  const fn=sqlFunction('private.broadcast_sos_incident');
  assert.match(fn,/realtime\.send/i);
  assert.match(fn,/safety-sos:delivery:/i);
  assert.match(fn,/safety-sos:driver:/i);
  assert.match(fn,/true/i);
});

test('Realtime autoriza admin por DELIVERY y driver solo por su propio user id',()=>{
  const fn=sqlFunction('private.can_receive_safety_sos_topic');
  assert.match(fn,/safety-sos:delivery:/i);
  assert.match(fn,/sos_user_has_delivery/i);
  assert.match(fn,/orders\.view/i);
  assert.match(fn,/safety-sos:driver:/i);
  assert.match(fn,/auth\.uid\(\) = v_driver_id|auth\.uid\(\)=v_driver_id/i);
  assert.match(migration,/create policy htpweb_safety_sos_receive/i);
  assert.match(migration,/extension='broadcast'|extension = 'broadcast'/i);
});

test('helpers SOS privados no son ejecutables por navegador',()=>{
  assert.match(migration,/revoke execute on function private\.sos_payload\(uuid\) from public,anon,authenticated/i);
  assert.match(migration,/revoke execute on function private\.broadcast_sos_incident\(uuid\) from public,anon,authenticated/i);
  assert.match(migration,/revoke execute on function private\.sos_user_has_delivery\(uuid\) from public,anon,authenticated/i);
  assert.match(migration,/revoke execute on function private\.can_receive_safety_sos_topic\(text\) from public,anon,authenticated/i);
});

test('snapshot ADMIN prioriza OPEN luego ACKNOWLEDGED y conserva 7 días resueltos',()=>{
  const fn=sqlFunction('public.delivery_sos_snapshot');
  assert.match(fn,/case i\.status when 'OPEN' then 0 when 'ACKNOWLEDGED' then 1 else 2 end/i);
  assert.match(fn,/order by x\.sort_rank, x\.created_at desc|order by x\.sort_rank,x\.created_at desc/i);
  assert.match(fn,/interval '7 days'/i);
});

test('reconocer y resolver requieren membresía activa y orders.manage',()=>{
  const ack=sqlFunction('public.delivery_acknowledge_sos');
  const resolve=sqlFunction('public.delivery_resolve_sos');
  for(const fn of [ack,resolve]){
    assert.match(fn,/sos_user_has_delivery/i);
    assert.match(fn,/orders\.manage/i);
    assert.match(fn,/for update/i);
    assert.match(fn,/broadcast_sos_incident/i);
  }
  assert.match(ack,/ACKNOWLEDGED/i);
  assert.match(resolve,/RESOLVED/i);
  assert.match(resolve,/resolution_note/i);
});

test('driver_my_orders expone solo estado SOS, no tablas privadas completas',()=>{
  const fn=sqlFunction('public.driver_my_orders');
  assert.match(fn,/'sos_enabled'/i);
  assert.match(fn,/delivery_has_capability\(a\.delivery_id, 'safety\.sos'\)|delivery_has_capability\(a\.delivery_id,'safety\.sos'\)/i);
  assert.match(fn,/'incident_id'/i);
  assert.match(fn,/'status'/i);
  assert.doesNotMatch(fn,/resolution_note.*'sos'/is);
});

test('ADMIN UI tiene panel SOS con reconocer resolver y ubicación',()=>{
  assert.match(html,/id="deliverySosList"/);
  assert.match(html,/id="deliverySosRefresh"/);
  assert.match(admin,/function renderDeliverySos/);
  assert.match(admin,/data-sos-ack/);
  assert.match(admin,/data-sos-resolve/);
  assert.match(admin,/Abrir ubicación/);
  assert.match(admin,/delivery_acknowledge_sos/);
  assert.match(admin,/delivery_resolve_sos/);
});

test('ADMIN usa canal privado por DELIVERY sin listeners duplicados',()=>{
  assert.match(admin,/safety-sos:delivery:/);
  assert.match(admin,/config:\{private:true\}/);
  assert.match(admin,/stopDeliverySosSubscription/);
  assert.match(admin,/safetySosState\.deliveryId===deliveryId/);
  assert.match(admin,/removeChannel/);
});

test('DRIVER muestra SOS solo en EN_ROUTE cuando el plan lo habilita',()=>{
  assert.match(admin,/o\.assignment_status==="ACTIVE"&&o\.status==="EN_ROUTE"/);
  assert.match(admin,/if\(o\.sos_enabled\)/);
  assert.match(admin,/data-driver-sos/);
  assert.match(admin,/>SOS<\/button>/);
  assert.match(admin,/la alerta de seguridad sigue activa/);
});

test('DRIVER dispara SOS aunque getCurrentPosition falle',()=>{
  const fn=admin.match(/async function triggerDriverSos\(orderId\)[\s\S]*?\n}/)?.[0]||'';
  assert.match(fn,/let position=null/);
  assert.match(fn,/try\{position=await currentPositionOnce\(\);\}catch\{\}/);
  assert.match(fn,/p_latitude:position\?\.latitude\?\?null/);
  assert.match(fn,/driver_trigger_sos/);
});

test('fallback del dispositivo conserva precisión y timestamp',()=>{
  const fn=admin.match(/function currentPositionOnce\(\)[\s\S]*?\n}/)?.[0]||'';
  assert.match(fn,/accuracy:/);
  assert.match(fn,/captured_at:/);
  assert.match(admin,/p_accuracy_m:position\?\.accuracy\?\?null/);
  assert.match(admin,/p_captured_at:position\?\.captured_at\?\?null/);
});

test('DRIVER recibe reconocida y resuelta por canal privado personal',()=>{
  assert.match(admin,/safety-sos:driver:/);
  assert.match(admin,/Tu alerta SOS fue reconocida por el DELIVERY/);
  assert.match(admin,/Tu alerta SOS fue marcada como resuelta/);
  assert.match(admin,/startDriverSosSubscription/);
});

test('suscripciones SOS se cierran al salir',()=>{
  assert.match(admin,/beforeunload/);
  assert.match(admin,/stopDeliverySosSubscription/);
  assert.match(admin,/stopDriverSosSubscription/);
});

test('SOS no llama automáticamente servicios externos de emergencia',()=>{
  assert.doesNotMatch(admin,/\b911\b|\bpolic[ií]a\b|\bemergency api\b/i);
  assert.doesNotMatch(migration,/http_|net\.http|pg_net/i);
});

test('admin.js sigue compilando después de SOS',()=>{
  assert.doesNotThrow(()=>new Function(admin));
});
