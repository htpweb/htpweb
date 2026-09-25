const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260925145745_stage2_dispatch_modes.sql','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const monetization=fs.readFileSync('admin/monetizacion.html','utf8');

test('configuración de despacho vive en private y no queda expuesta al navegador',()=>{
  assert.match(migration,/create table if not exists private\.delivery_dispatch_settings/);
  assert.match(migration,/mode text not null check \(mode in \('MANUAL','HYBRID','AUTO'\)\)/);
  assert.match(migration,/revoke all on table private\.delivery_dispatch_settings from public,anon,authenticated/);
  assert.doesNotMatch(admin,/\.from\(["']delivery_dispatch_settings/);
});

test('cada modo depende de su capability contratada',()=>{
  const fn=migration.match(/create or replace function private\.dispatch_mode_allowed[\s\S]*?revoke execute on function private\.dispatch_mode_allowed/)?.[0]||'';
  assert.match(fn,/MANUAL'[\s\S]*dispatch\.manual/);
  assert.match(fn,/HYBRID'[\s\S]*dispatch\.hybrid/);
  assert.match(fn,/AUTO'[\s\S]*dispatch\.auto/);
  assert.match(migration,/return 'NONE'/);
});

test('solo DELIVERY_ADMIN cambia el modo y solo a uno incluido en el plan',()=>{
  const fn=migration.match(/create or replace function public\.delivery_set_dispatch_mode[\s\S]*?grant execute on function public\.delivery_set_dispatch_mode/)?.[0]||'';
  assert.match(fn,/current_role_code\(\)<>'DELIVERY_ADMIN'/);
  assert.match(fn,/user_has_delivery\(p_delivery_id\)/);
  assert.match(fn,/has_permission\('orders\.manage'\)/);
  assert.match(fn,/dispatch_mode_allowed\(p_delivery_id,v_mode\)/);
  assert.match(fn,/insert into private\.delivery_dispatch_settings/);
});

test('multi_order es la llave real de pedidos simultáneos',()=>{
  const fn=migration.match(/create or replace function private\.effective_driver_concurrent_limit[\s\S]*?revoke execute on function private\.effective_driver_concurrent_limit/)?.[0]||'';
  assert.match(fn,/orders\.concurrent_per_driver\.max/);
  assert.match(fn,/delivery_has_capability\(p_delivery_id,'multi_order'\)/);
  assert.match(fn,/return least\(v_base,1\)/);
});

test('selector interno ve carga fresca y elige al de menor carga con cupo',()=>{
  const fn=migration.match(/create or replace function private\.dispatch_pick_driver[\s\S]*?revoke execute on function private\.dispatch_pick_driver/)?.[0]||'';
  assert.match(fn,/language plpgsql\s+volatile/);
  assert.match(fn,/active_orders/);
  assert.match(fn,/coalesce\(load\.active_orders,0\)<v_limit/);
  assert.match(fn,/order by coalesce\(load\.active_orders,0\),load\.last_assigned nulls first/);
});

test('todas las asignaciones pasan por un helper único con lock y capacidad efectiva',()=>{
  const fn=migration.match(/create or replace function private\.assign_order_driver_internal[\s\S]*?revoke execute on function private\.assign_order_driver_internal/)?.[0]||'';
  assert.match(fn,/pg_advisory_xact_lock/);
  assert.match(fn,/drivers\.active\.max/);
  assert.match(fn,/effective_driver_concurrent_limit/);
  assert.match(fn,/v_concurrent>=v_concurrent_limit/);
  assert.match(fn,/order_driver_assignments/);
});

test('MANUAL conserva selección explícita y no opera fuera de MANUAL',()=>{
  const fn=migration.match(/create or replace function public\.delivery_assign_order_driver[\s\S]*?grant execute on function public\.delivery_assign_order_driver/)?.[0]||'';
  assert.match(fn,/effective_dispatch_mode\(p_delivery_id\)<>'MANUAL'/);
  assert.match(fn,/dispatch\.manual/);
  assert.match(fn,/assign_order_driver_internal/);
  assert.match(admin,/data-dispatch-assign/);
});

test('HYBRID sugiere pero espera confirmación humana',()=>{
  const snap=migration.match(/create or replace function public\.delivery_dispatch_snapshot[\s\S]*?grant execute on function public\.delivery_dispatch_snapshot/)?.[0]||'';
  const accept=migration.match(/create or replace function public\.delivery_accept_dispatch_suggestion[\s\S]*?grant execute on function public\.delivery_accept_dispatch_suggestion/)?.[0]||'';
  assert.match(snap,/v_mode='HYBRID'/);
  assert.match(snap,/dispatch_pick_driver/);
  assert.match(snap,/'suggestion'/);
  assert.doesNotMatch(snap,/assign_order_driver_internal/);
  assert.match(accept,/effective_dispatch_mode\(p_delivery_id\)<>'HYBRID'/);
  assert.match(accept,/HYBRID_SUGGESTION/);
  assert.match(admin,/Aceptar sugerencia/);
  assert.match(admin,/delivery_accept_dispatch_suggestion/);
});

test('AUTO asigna al quedar READY y reintenta al liberarse capacidad',()=>{
  const auto=migration.match(/create or replace function private\.auto_dispatch_delivery[\s\S]*?revoke execute on function private\.auto_dispatch_delivery/)?.[0]||'';
  const trigger=migration.match(/create or replace function private\.orders_auto_dispatch[\s\S]*?revoke execute on function private\.orders_auto_dispatch/)?.[0]||'';
  assert.match(auto,/effective_dispatch_mode\(p_delivery_id\)<>'AUTO'/);
  assert.match(auto,/status='READY'/);
  assert.match(auto,/order by o\.created_at,o\.id/);
  assert.match(auto,/assign_order_driver_internal/);
  assert.match(trigger,/new\.status='READY'/);
  assert.match(trigger,/new\.status in \('DELIVERED','CANCELLED'\)/);
  assert.match(trigger,/auto_dispatch_delivery/);
  assert.match(migration,/trg_zz_orders_auto_dispatch/);
});

test('activar un repartidor puede liberar cola AUTO sin leer OLD durante INSERT',()=>{
  const fn=migration.match(/create or replace function private\.driver_activation_auto_dispatch[\s\S]*?revoke execute on function private\.driver_activation_auto_dispatch/)?.[0]||'';
  assert.match(fn,/if tg_op='INSERT'/);
  assert.match(fn,/elsif tg_op='UPDATE'/);
  assert.match(fn,/DELIVERY_DRIVER/);
  assert.match(fn,/auto_dispatch_delivery/);
  assert.match(migration,/trg_user_deliveries_auto_dispatch/);
});

test('ningún modo operativo permite EN_ROUTE sin repartidor',()=>{
  const fn=migration.match(/create or replace function public\.enforce_manual_dispatch_assignment[\s\S]*?revoke execute on function public\.enforce_manual_dispatch_assignment/)?.[0]||'';
  assert.match(fn,/old\.status='READY'/);
  assert.match(fn,/new\.status='EN_ROUTE'/);
  assert.match(fn,/v_mode<>'NONE'/);
  assert.match(fn,/pedido requiere repartidor antes de pasar a EN_ROUTE/);
});

test('UI solo ofrece modos incluidos y AUTO no muestra asignación manual',()=>{
  assert.match(html,/id="dispatchModeSelect"/);
  assert.match(html,/id="dispatchModeSave"/);
  assert.match(admin,/allowed_modes/);
  assert.match(admin,/state\.role==="DELIVERY_ADMIN"/);
  assert.match(admin,/mode==="MANUAL"/);
  assert.match(admin,/mode==="HYBRID"/);
  assert.match(admin,/mode==="AUTO"/);
  assert.match(admin,/Esperando capacidad disponible/);
});

test('Etapa 2 ya se describe como rollout por bloques',()=>{
  assert.match(monetization,/Etapa 2 se activa por bloques/i);
  assert.match(monetization,/algunas capacidades ya están operativas/i);
  assert.doesNotMatch(monetization,/su operación se active posteriormente/i);
});

test('admin.js sigue compilando tras modos de despacho',()=>{
  assert.doesNotThrow(()=>new Function(admin));
});
