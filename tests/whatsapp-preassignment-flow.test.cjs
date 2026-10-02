const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync(
  'supabase/migrations/20260930015358_automatic_local_whatsapp_and_preassigned_dispatch.sql',
  'utf8'
);
const edge=fs.readFileSync('supabase/functions/whatsapp-notify/index.ts','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');

test('confirmar pedido encola WhatsApp automático para cada LOCAL',()=>{
  assert.match(migration,/queue_local_orders_after_confirmation/);
  assert.match(migration,/new\.status<>'CONFIRMED'/);
  assert.match(migration,/'LOCAL_ORDER_AUTO'/);
  assert.match(migration,/trg_orders_whatsapp_local_after_confirm/);
});

test('mensaje saliente queda vinculado a pedido y LOCAL',()=>{
  assert.match(edge,/whatsapp_record_outbound/);
  assert.match(edge,/messageType: "pedido_local"/);
  assert.match(edge,/localId,/);
  assert.match(edge,/prep_requested_at/);
});

test('cada respuesta de tiempo recalcula la preasignación',()=>{
  assert.match(migration,/auto_plan_driver_after_local_eta/);
  assert.match(migration,/after update of prep_response_at/i);
  assert.match(migration,/on conflict\(order_id\) do update/);
  assert.doesNotMatch(
    migration.match(/create or replace function private\.auto_plan_driver_after_local_eta[\s\S]*?\$function\$;/)?.[0]||'',
    /prep_response_at is null[\s\S]*return new;[\s\S]*prep_response_at is null/
  );
});

test('la asignación real espera hora de salida y repartidor libre',()=>{
  assert.match(migration,/ideal_departure_at/);
  assert.match(migration,/driver_is_free_now/);
  assert.match(migration,/activate_due_planned_drivers/);
  assert.match(migration,/htpweb-asignar-preasignados/);
  assert.match(migration,/Repartidor todavía ocupado/);
});

test('marcar entregado libera y reintenta preasignaciones vencidas',()=>{
  assert.match(migration,/activate_waiting_plan_after_delivery/);
  assert.match(migration,/new\.status='DELIVERED'/);
  assert.match(migration,/activate_due_planned_drivers\(new\.delivery_id\)/);
});

test('repartidor ve recogidas y puede confirmar llegada y recogida',()=>{
  assert.match(migration,/driver_set_local_pickup_status/);
  assert.match(migration,/'ARRIVED','PICKED_UP'/);
  assert.match(migration,/'locals',coalesce/);
  assert.match(admin,/Llegué al LOCAL/);
  assert.match(admin,/Pedido recogido/);
  assert.match(admin,/renderDriverPickupList/);
});

test('recogida física sustituye LISTO si el LOCAL no lo envió',()=>{
  const fn=migration.match(/create or replace function public\.driver_set_local_pickup_status[\s\S]*?\$function\$;/)?.[0]||'';
  assert.match(fn,/set status='READY'/);
  assert.match(fn,/Repartidor confirmó que recibió el pedido del LOCAL/);
  assert.match(fn,/Todas las recogidas fueron confirmadas por el repartidor/);
});

test('preasignado no avisa y asignado obliga a abrir HTPWEB',()=>{
  assert.match(admin,/Preasignado/);
  assert.match(admin,/Salida calculada/);
  assert.doesNotMatch(
    admin.match(/if\(plan\?\.status==="PLANNED"\)[\s\S]*?if\(\["CONFIRMED","PREPARING"\]/)?.[0]||'',
    /orderControlNotifyPlannedDriver/
  );
  assert.match(edge,/"Ver detalles en " \+ \(cfg\.verifiedName \|\| "el DELIVERY"\)/);
  assert.match(edge,/driverConsoleUrl\(cfg\.publicUrl\)/);
  assert.doesNotMatch(
    edge.match(/const parameters = kind === "DRIVER_ASSIGNED"[\s\S]*?: \[orderRef\(order\.id\)\];/)?.[0]||'',
    /order\.delivery_address/
  );
});

test('interfaz operativa usa términos claros en español',()=>{
  assert.match(admin,/Preasignados/);
  assert.match(admin,/Aceptado/);
  assert.match(admin,/Preparando/);
  assert.match(admin,/Recogiendo/);
  assert.match(admin,/Modo de operación/);
  assert.match(admin,/WhatsApp cliente/);
  assert.match(admin,/Repartidores operativos/);
});