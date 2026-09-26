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
  assert.match(html,/id="coverageShowAllBtn"/);
  assert.match(html,/id="coverageOnlyActiveBtn"/);
  assert.match(admin,/function renderCoverageMap/);
  assert.match(admin,/function selectCoverageZone/);
  assert.match(admin,/map\.polygon\(zone\.boundary/);
  assert.match(maps,/interactive:colorOrOptions\?\.interactive/);
  assert.match(maps,/fit:\(rings,padding=24\)/);
});

test('Cobertura distingue activas disponibles y seleccionada',()=>{
  assert.match(admin,/return zone\.assigned\?"#e53935":"#94a3b8"/);
  assert.match(admin,/return "#2563eb"/);
  assert.match(html,/Rojo = activa · Gris = disponible · Azul = seleccionada/);
  assert.match(css,/\.coverage-zone-card\.is-selected/);
});

test('al alcanzar el limite bloquea activar pero no visualizar',()=>{
  assert.match(admin,/function coverageLimitReached/);
  assert.match(admin,/activateBlocked=canAssign&&!zone\.assigned&&limitReached/);
  assert.match(admin,/Puedes seguir visualizando todas en el mapa/);
});

test('Compartir usa al DELIVERY como marca comercial',()=>{
  assert.match(admin,/deliveryName: delivery\.name/);
  assert.match(admin,/ctx\.fillText\(String\(payload\.deliveryName\|\|"DELIVERY"\)/);
  assert.match(admin,/Plataforma HTPWEB/);
  assert.match(admin,/Pide directamente con /);
});

test('Compartir desde navegador ofrece WhatsApp Facebook y TikTok',()=>{
  assert.match(html,/id="shareWhatsappWebBtn"/);
  assert.match(html,/id="shareFacebookWebBtn"/);
  assert.match(html,/id="shareTiktokWebBtn"/);
  assert.match(admin,/https:\/\/web\.whatsapp\.com\//);
  assert.match(admin,/facebook\.com\/sharer\/sharer\.php/);
  assert.match(admin,/tiktok\.com\/upload/);
});

test('WhatsApp Web prepara la imagen visual',()=>{
  assert.match(admin,/copyPreparedImageToClipboard/);
  assert.match(admin,/ClipboardItem/);
  assert.match(admin,/downloadShareImage\(kind\)/);
  assert.match(admin,/PIDE AQUÍ/);
});
