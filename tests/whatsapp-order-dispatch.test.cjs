const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260925213358_whatsapp_order_dispatch.sql','utf8');
const customerMigration=fs.readFileSync('supabase/migrations/20260927194814_customer_order_whatsapp_all_delivery_plans.sql','utf8');
const edge=fs.readFileSync('supabase/functions/whatsapp-notify/index.ts','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const helper=fs.readFileSync('config/whatsapp.js','utf8');
const cart=fs.readFileSync('app/carrito.html','utf8');
const orders=fs.readFileSync('config/orders.js','utf8');
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
  assert.match(admin,/Automático quedará disponible cuando el WhatsApp Business de este DELIVERY esté conectado y Meta tenga las plantillas listas/);
});

test('modo asistido abre wa.me con texto precargado',()=>{
  assert.match(helper,/https:\/\/wa\.me\//);
  assert.match(helper,/encodeURIComponent/);
  assert.match(helper,/htpWhatsappOpenAssisted/);
  assert.match(admin,/WhatsApp abierto con el pedido y el enlace de confirmación del LOCAL/);
  assert.match(admin,/WhatsApp abierto con la asignación y el acceso GPS listos para enviar/);
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
  assert.match(admin,/order_items\(local_id,product_name,variant_name,quantity,subtotal,promotion_id,promotion_title\)/);
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

test('Pedido WhatsApp del cliente está incluido en todos los planes DELIVERY',()=>{
  assert.match(customerMigration,/add column if not exists customer_orders boolean not null default true/);
  assert.match(customerMigration,/'whatsapp\.customer_order'/);
  assert.match(customerMigration,/from public\.subscription_plans p[\s\S]*where p\.target_type='DELIVERY'/);
  assert.match(customerMigration,/on conflict\(plan_id,entitlement_type,code\) do update/);
  assert.match(customerMigration,/public_delivery_customer_order_whatsapp/);
  assert.match(customerMigration,/grant execute on function public\.public_delivery_customer_order_whatsapp\(uuid\)[\s\S]*to authenticated,service_role/);
});

test('panel DELIVERY permite activar o desactivar Pedido del cliente por WhatsApp',()=>{
  assert.match(html,/id="whatsappCustomerOrders"/);
  assert.match(html,/Pedido del cliente al DELIVERY por WhatsApp/);
  assert.match(admin,/customer_orders:true/);
  assert.match(admin,/customer_order_available/);
  assert.match(admin,/p_customer_orders:\$\("whatsappCustomerOrders"\)/);
});

test('checkout registra primero en HTPWEB y luego prepara WhatsApp sin about:blank',()=>{
  const createIndex=cart.indexOf('supabaseClient.functions.invoke("crear-pedido"');
  const validateIndex=cart.indexOf('if (!data?.ok || !data?.order?.id)');
  const canonicalIndex=cart.indexOf('data.order_detail ||');
  const whatsappIndex=cart.indexOf('htpWhatsappAssistedUrl(');
  const redirectIndex=cart.lastIndexOf('window.location.href = lastCustomerWhatsappUrl');
  assert.ok(createIndex>=0);
  assert.ok(validateIndex>createIndex);
  assert.ok(canonicalIndex>validateIndex);
  assert.ok(whatsappIndex>canonicalIndex);
  assert.ok(redirectIndex>whatsappIndex);
  assert.match(cart,/htpWhatsappCustomerOrderSetting/);
  assert.doesNotMatch(cart,/window\.open\("", "_blank"\)/);
  assert.match(cart,/Enviar pedido por WhatsApp/);
});

test('mensaje WhatsApp usa el pedido canónico con locales, ubicación y totales',()=>{
  assert.match(orders,/customer_name,customer_phone,delivery_address,latitude,longitude,address_reference,notes/);
  assert.match(helper,/order\.order_locals/);
  assert.match(helper,/order\.order_items/);
  assert.match(helper,/order\.customer_phone/);
  assert.match(helper,/order\.delivery_address/);
  assert.match(helper,/order\.address_reference/);
  assert.match(helper,/https:\/\/www\.google\.com\/maps\?q=/);
  assert.match(helper,/Subtotal productos/);
  assert.match(helper,/\*TOTAL:\*/);
  assert.match(helper,/Pedido registrado correctamente/);
});

test('JavaScript del navegador sigue compilando',()=>{
  assert.doesNotThrow(()=>new Function(helper));
  assert.doesNotThrow(()=>new Function(admin));
  assert.doesNotThrow(()=>new Function(orders));
});
