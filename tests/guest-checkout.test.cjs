const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const cart=fs.readFileSync('app/carrito.html','utf8');
const edge=fs.readFileSync('supabase/functions/crear-pedido/index.ts','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

test('checkout abre sin exigir inicio de sesión',()=>{
  const start=cart.indexOf('async function openCheckout()');
  const end=cart.indexOf('async function loadSavedAddresses',start);
  const block=cart.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(block,/irAAcceso/);
  assert.match(block,/checkoutCard/);
});

test('confirmar pedido acepta invitado y envía su identidad al servidor',()=>{
  const start=cart.indexOf('async function confirmOrder()');
  const end=cart.indexOf('\ninit();',start);
  const block=cart.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(block,/if \(!user\)\s*\{\s*irAAcceso/);
  assert.match(block,/customer_name: name/);
  assert.match(block,/customer_phone: phone/);
  assert.match(block,/if \(user\) \{\s*await asegurarCustomerActual/);
});

test('crear-pedido permite JWT opcional en checkout',()=>{
  assert.match(config,/\[functions\.crear-pedido\]\s*\nverify_jwt = false/);
  assert.match(edge,/getOptionalAuthenticatedUser/);
  assert.doesNotMatch(edge,/Se requiere iniciar sesión para crear el pedido/);
});

test('invitado usa customer interno sin apropiarse de una cuenta registrada',()=>{
  assert.match(edge,/getOrCreateGuestCustomer/);
  assert.match(edge,/\.is\("profile_id", null\)/);
  assert.match(edge,/profile_id: null/);
  assert.match(edge,/customer_mode: user \? "ACCOUNT" : "GUEST"/);
});

test('respuesta incluye detalle del pedido para WhatsApp de invitado',()=>{
  assert.match(edge,/order_detail: orderDetail/);
  assert.match(cart,/data\.order_detail \|\|/);
  assert.match(cart,/Ver y seguir mi pedido/);
});

test('javascript inline del carrito compila',()=>{
  const scripts=[...cart.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline=scripts.at(-1)?.[1]||'';
  assert.ok(inline.length>0);
  assert.doesNotThrow(()=>new Function(inline));
});


test('checkout invitado puede leer la configuración pública de WhatsApp',()=>{
  const migration=fs.readFileSync('supabase/migrations/20260929005735_guest_checkout_public_whatsapp_setting.sql','utf8');
  assert.match(migration,/grant execute on function public\.public_delivery_customer_order_whatsapp\(uuid\) to anon/);
});


test('checkout no abre about:blank antes de crear el pedido',()=>{
  const start=cart.indexOf('async function confirmOrder()');
  const end=cart.indexOf('\ninit();',start);
  const block=cart.slice(start,end);
  assert.doesNotMatch(block,/window\.open\("", "_blank"\)/);
  assert.doesNotMatch(block,/Preparando WhatsApp/);
});

test('WhatsApp se abre aparte y la confirmación permanece visible',()=>{
  const start=cart.indexOf('async function confirmOrder()');
  const end=cart.indexOf('\ninit();',start);
  const block=cart.slice(start,end);
  const invokeIndex=block.indexOf('functions.invoke("crear-pedido"');
  const popupIndex=block.indexOf('window.open(lastCustomerWhatsappUrl, "_blank"');
  assert.ok(invokeIndex>=0);
  assert.ok(popupIndex>invokeIndex);
  assert.doesNotMatch(block,/window\.location\.href = lastCustomerWhatsappUrl/);
  assert.match(block,/Esta página seguirá disponible/);
});

test('crear-pedido reintenta fallas transitorias de OpenRouteService',()=>{
  assert.match(edge,/const maxAttempts = 3/);
  assert.match(edge,/for \(let attempt = 1; attempt <= maxAttempts; attempt\+\+\)/);
  assert.match(edge,/response\.status === 408 \|\| response\.status === 429 \|\| response\.status >= 500/);
  assert.match(edge,/HTTP\/2 connection resets are transient/);
});


test('error de checkout no usa popup eliminado y se muestra junto al botón',()=>{
  const start=cart.indexOf('async function confirmOrder()');
  const end=cart.indexOf('\ninit();',start);
  const block=cart.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.doesNotMatch(block,/whatsappPopup/);
  assert.match(cart,/id="checkoutMessage"/);
  assert.match(block,/showCheckoutMessage\(message\)/);
  assert.match(block,/button\.textContent = "Confirmar pedido"/);
});

test('fuera de cobertura muestra mensaje claro en checkout',()=>{
  assert.match(cart,/Esta ubicación está fuera de la cobertura de/);
  assert.match(cart,/Cambia el punto de entrega en el mapa para continuar/);
});


test('invitado solo ve guardar dirección después de aceptar ubicación y vuelve al carrito',()=>{
  assert.match(cart,/id="guestSaveAfterLocation"/);
  assert.match(cart,/locationAccepted&&latitude!==null&&longitude!==null/);
  assert.match(cart,/saveGuestCheckoutDraft\(\)/);
  assert.match(cart,/irAAcceso\(rutaActualRelativa\(\)\)/);
  assert.match(cart,/restoreGuestCheckoutDraft\(\)/);
  assert.doesNotMatch(cart,/id="guestSaveAddressLink"/);
  assert.doesNotMatch(cart,/id="guestOrdersLink"/);
});

test('seguimiento invitado pasa por HTPWEB y conserva pedido para vincularlo',()=>{
  const orders=fs.readFileSync('app/pedidos.html','utf8');
  const migration=fs.readFileSync('supabase/migrations/20261005024500_claim_guest_order_after_signup.sql','utf8');
  assert.match(cart,/beginGuestOrderTracking/);
  assert.match(cart,/urlDelivery\("pedidos\.html",\{order:orderId\}\)/);
  assert.match(orders,/claim_my_guest_order/);
  assert.match(migration,/create or replace function public\.claim_my_guest_order/);
  assert.match(migration,/grant execute on function public\.claim_my_guest_order\(uuid,text\) to authenticated/);
});
