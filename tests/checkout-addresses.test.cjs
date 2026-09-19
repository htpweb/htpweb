const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function checkout() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', checked: false, textContent: '',
      classList: { add() {}, remove() {}, toggle() {} },
      scrollIntoView() {}
    });
    return elements.get(id);
  };
  const ctx = vm.createContext({
    document: { getElementById: element }, console,
    obtenerUsuarioActual: async () => ({ id: 'client' }),
    confirm: () => true, setTimeout: () => {},
    desactivarMiDireccionCliente: async () => {},
    listarMisDireccionesCliente: async () => [],
    fetch: async () => ({ ok: true, json: async () => ({ display_name: 'Old location' }) })
  });
  const html = fs.readFileSync('app/carrito.html', 'utf8');
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).find(s => s.includes('async function openCheckout'));
  vm.runInContext(script.replace(/\binit\(\);\s*$/, ''), ctx);
  const run = code => vm.runInContext(code, ctx);
  run(`items = [{product_id:'p'}]; map = {removeLayer(){}, invalidateSize(){}};
    savedAddresses = [{id:'a',label:'Casa',address:'Original',latitude:1,longitude:2}];`);
  return { ctx, element, run };
}

test('reopening checkout preserves edited location and address', async () => {
  const { element, run } = checkout();
  element('savedAddressSelect').value = 'a';
  element('address').value = 'Edited';
  run('latitude=3; longitude=4; locationAccepted=false;');
  await run('openCheckout()');
  assert.equal(element('address').value, 'Edited');
  assert.equal(run('latitude'), 3);
  assert.equal(run('locationAccepted'), false);
});

test('deactivating selected address clears accepted destination and marker', async () => {
  const { element, run } = checkout();
  element('savedAddressSelect').value = 'a';
  element('address').value = 'Original';
  run('latitude=1; longitude=2; locationAccepted=true; marker={};');
  await run('deactivateSelectedAddress()');
  assert.equal(element('address').value, '');
  assert.equal(run('latitude'), null);
  assert.equal(run('marker'), null);
  assert.equal(run('locationAccepted'), false);
});

test('late reverse geocoding cannot fill a newly reset destination', async () => {
  const { ctx, element, run } = checkout();
  let resolve;
  ctx.fetch = () => new Promise(done => { resolve = done; });
  run('latitude=1; longitude=2;');
  const pending = element('acceptLocation').onclick();
  run('resetCheckoutAddress()');
  resolve({ ok: true, json: async () => ({ display_name: 'Old location' }) });
  await pending;
  assert.equal(element('address').value, '');
  assert.equal(run('locationAccepted'), false);
});

test('reverse geocoding still fills the unchanged accepted location', async () => {
  const { element, run } = checkout();
  run('latitude=1; longitude=2;');
  await element('acceptLocation').onclick();
  assert.equal(element('address').value, 'Old location');
  assert.equal(run('locationAccepted'), true);
});
