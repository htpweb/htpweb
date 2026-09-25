const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260925213358_whatsapp_order_dispatch.sql','utf8');
const edge=fs.readFileSync('supabase/functions/whatsapp-notify/index.ts','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const helper=fs.readFileSync('config/whatsapp.js','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

test('configuración WhatsApp vive en private con RLS deny-all',()=>{
  assert.match(migration,/create table if not exists private\.delivery_whatsapp_settings/);
  assert.match(migration,/mode text not null default 'ASSISTED' check \(mode in \('ASSISTED','AUTOMATIC'\)\)/);
  assert.match(migration,/alter table private\.delivery_whatsapp_settings enable row level security/);
  assert.match(migration,/revoke all on table private\.delivery_whatsapp_settings from public,anon,authenticated/);
  assert.match(migration,/create policy delivery_whatsapp_settings_deny_all/);
  assert.match(migration,/using \(false\)/);
  assert.match(migration,/with check \(false\)/);
  assert.doesNotMatch(admin,/\.from\(["']delivery_whatsapp_settings/);
});

test('solo roles autorizados consultan y DELIVERY_ADMIN configura',()=>{
  const snapshot=migration.match(/create or replace function public\.delivery_whatsapp_settings_snapshot[\s\S]*?grant execute on function public\.delivery_whatsapp_settings_snapshot/)?.[0]||'';
  const save=migration.match(/create or replace function public\.delivery_set_whatsapp_settings[\s\S]*?grant execute on function public\.delivery_set_whatsapp_settings/)?.[0]||'';
  assert.match(snapshot,/user_can_manage_delivery_resource/);
  assert.match(snapshot,/orders\.view/);
  assert.match(save,/current_role_code\(\)<>'DELIVERY_ADMIN'/);
  assert.match(save,/user_has_delivery\(p_delivery_id\)/);
  assert.match(save,/has_permission\('orders\.manage'\)/);
});

test('hook automático usa secreto Vault y nunca bloquea asignaciones',()=>{
  assert.match(migration,/whatsapp_dispatch_hook_secret/);
  assert.match(migration,/vault\.create_secret/);
  assert.match(migration,/verify_whatsapp_dispatch_hook_secret/);
  assert.match(migration,/grant execute on function public\.verify_whatsapp_dispatch_hook_secret\(text\)\s+to service_role/);
  assert.match(migration,/after insert or update of status\s+on public\.order_driver_assignments/);
  assert.match(migration,/coalesce\(v_mode,'ASSISTED'\)<>'AUTOMATIC'/);
  assert.match(migration,/new\.status='ACTIVE'/);
  assert.match(migration,/new\.status='UNASSIGNED'/);
  assert.match(migration,/exception\s+when others then[\s\S]*return new/);
});

test('Edge Function acepta usuario o hook interno, pero no confía en navegador anónimo',()=>{
  assert.match(edge,/withSupabase\(\s*\{ auth: "user" \}/);
  assert.match(edge,/x-htpweb-whatsapp-hook/);
  assert.match(edge,/verify_whatsapp_dispatch_hook_secret/);
  assert.match(edge,/createAdminClient/);
  assert.match(config,/\[functions\.whatsapp-notify\]\s+verify_jwt = false/);
});

test('credenciales Meta solo provienen de secretos de entorno',()=>{
  for(const name of [
    'WHATSAPP_GRAPH_API_VERSION',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_TEMPLATE_LOCAL_ORDER',
    'WHATSAPP_TEMPLATE_DRIVER_ASSIGNMENT',
    'WHATSAPP_TEMPLATE_DRIVER_UNASSIGNMENT',
    'HTPWEB_PUBLIC_URL'
  ]){
    assert.match(edge,new RegExp('Deno\\.env\\.get\\("'+name+'"\\)'));
  }
  assert.doesNotMatch(edge,/EA[A-Za-z0-9]{40,}/);
  assert.match(edge,/https:\/\/graph\.facebook\.com\//);
});

test('modo automático permanece inactivo si Meta no está configurado',()=>{
  assert.match(edge,/WHATSAPP_NOT_CONFIGURED/);
  assert.match(edge,/localOrderConfigured/);
  assert.match(edge,/driverDispatchConfigured/);
  assert.match(admin,/automaticOption\.disabled=provider\.configured!==true/);
  assert.match(admin,/Primero configura las credenciales y plantillas oficiales de Meta/);
});

test('modo asistido abre wa.me con texto precargado',()=>{
  assert.match(helper,/https:\/\/wa\.me\//);
  assert.match(helper,/encodeURIComponent/);
  assert.match(helper,/htpWhatsappOpenAssisted/);
  assert.match(admin,/WhatsApp abierto con el pedido listo para enviar/);
  assert.match(admin,/WhatsApp abierto con la asignación lista para enviar/);
});

test('pedido al LOCAL no expone dirección ni teléfono del cliente en el mensaje asistido',()=>{
  const start=admin.indexOf('function buildLocalOrderWhatsappText');
  const end=admin.indexOf('async function sendLocalOrderWhatsapp',start);
  const fn=start>=0&&end>start?admin.slice(start,end):'';
  assert.match(fn,/Productos:/);
  assert.match(fn,/Subtotal del local/);
  assert.match(fn,/Observaciones:/);
  assert.doesNotMatch(fn,/customer_phone/);
  assert.doesNotMatch(fn,/delivery_address/);
});

test('panel Pedidos carga productos y WhatsApp del LOCAL para cada subpedido',()=>{
  assert.match(admin,/order_items\(local_id,product_name,variant_name,quantity,subtotal\)/);
  assert.match(admin,/locals\(id,name,whatsapp\)/);
  assert.match(admin,/sendLocalOrderWhatsapp/);
  assert.match(admin,/Enviar por WhatsApp/);
});

test('despacho asistido ofrece WhatsApp al repartidor asignado',()=>{
  assert.match(admin,/data-dispatch-whatsapp/);
  assert.match(admin,/notifyAssignedDriverWhatsapp/);
  assert.match(admin,/driver\?\.phone/);
  assert.match(admin,/Aviso WhatsApp automático gestionado por HTPWEB/);
});

test('configuración WhatsApp aparece en Repartidores y despacho',()=>{
  assert.match(html,/id="whatsappModeSelect"/);
  assert.match(html,/id="whatsappLocalOrders"/);
  assert.match(html,/id="whatsappDriverDispatch"/);
  assert.match(html,/id="whatsappSettingsSave"/);
  assert.match(html,/config\/whatsapp\.js/);
});

test('JavaScript del navegador sigue compilando',()=>{
  assert.doesNotThrow(()=>new Function(helper));
  assert.doesNotThrow(()=>new Function(admin));
});
