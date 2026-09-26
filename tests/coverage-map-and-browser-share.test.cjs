const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const css=fs.readFileSync('assets/admin.css','utf8');
const maps=fs.readFileSync('admin/zone-maps.js','utf8');

test('Cobertura muestra lista y mapa interactivo',()=>{
  assert.match(html,/id="coverageMap"/);
  assert.match(html,/id="coverageZonesList"/);
  assert.match(admin,/function renderCoverageMap/);
  assert.match(admin,/map\.polygon\(zone\.boundary/);
  assert.match(maps,/fit:\(rings,padding=24\)/);
});

test('Cobertura distingue activas disponibles y seleccionada',()=>{
  assert.match(admin,/zone\.assigned\?"#e53935":"#94a3b8"/);
  assert.match(admin,/return "#2563eb"/);
  assert.match(css,/\.coverage-zone-card\.is-selected/);
});

test('al alcanzar límite bloquea activar pero no visualizar',()=>{
  assert.match(admin,/function coverageLimitReached/);
  assert.match(admin,/activateBlocked=canAssign&&!zone\.assigned&&limitReached/);
  assert.match(admin,/Puedes seguir visualizando todas en el mapa/);
});

test('Compartir obtiene LOCAL y Galería mediante RPC de solo lectura',()=>{
  assert.match(admin,/delivery_share_locals/);
  assert.match(admin,/delivery_share_local_gallery/);
});
