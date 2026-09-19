const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const analytics = fs.readFileSync('config/analytics.js', 'utf8');
const ads = fs.readFileSync('config/ads.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260919161000_analytics_instrumentation.sql', 'utf8');

 test('el navegador usa RPC y no INSERT directo de analytics', () => {
  assert.match(analytics, /rpc\("record_analytics_event"/);
  assert.doesNotMatch(analytics, /from\(["']analytics_events["']\).*insert/s);
  assert.match(migration, /revoke insert, update, delete on table public\.analytics_events from anon, authenticated/i);
});

test('publicidad registra impresión y click con advertisement_id', () => {
  assert.match(ads, /AD_IMPRESSION/);
  assert.match(ads, /AD_CLICK/);
  assert.match(ads, /advertisement_id: ad\.id/);
});

test('RPC limita eventos y valida contexto DELIVERY', () => {
  assert.match(migration, /Evento analytics no permitido/);
  assert.match(migration, /LOCAL fuera del DELIVERY/);
  assert.match(migration, /PRODUCTO fuera del DELIVERY/);
  assert.match(migration, /PUBLICIDAD inválida/);
});

test('analytics cubre navegación comercial', () => {
  for (const event of ['PAGE_VIEW','LOCAL_VIEW','PRODUCT_VIEW','CART_VIEW','ORDERS_VIEW']) {
    assert.ok(analytics.includes(event), `falta ${event}`);
  }
});
