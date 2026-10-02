const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const supabase=fs.readFileSync('config/supabase.js','utf8');
const cart=fs.readFileSync('config/cart.js','utf8');

test('auth storage is isolated per browser tab',()=>{
  assert.match(supabase,/sessionStorage/);
  assert.match(supabase,/storage:\s*HTPWEB_AUTH_STORAGE/);
  assert.match(supabase,/persistSession:\s*true/);
  assert.match(supabase,/autoRefreshToken:\s*true/);
  assert.match(supabase,/detectSessionInUrl:\s*true/);
  assert.doesNotMatch(supabase,/localStorage/);
});

test('cart remains isolated per tab and per delivery',()=>{
  assert.match(cart,/sessionStorage\.getItem/);
  assert.match(cart,/sessionStorage\.setItem/);
  assert.match(cart,/HTPWEB_CART_V/);
  assert.match(cart,/deliverySlug/);
});
