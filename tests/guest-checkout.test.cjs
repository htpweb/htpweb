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
  assert.match(cart,/Crear cuenta \/ Iniciar sesión \(opcional\)/);
});

test('javascript inline del carrito compila',()=>{
  const scripts=[...cart.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline=scripts.at(-1)?.[1]||'';
  assert.ok(inline.length>0);
  assert.doesNotThrow(()=>new Function(inline));
});
