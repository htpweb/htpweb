const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

test('Tarifas muestra tres modalidades separadas',()=>{
  assert.match(html,/id="feeModeCards"/);
  assert.match(html,/id="feeFixedPanel"/);
  assert.match(html,/id="feeDistancePanel"/);
  assert.match(html,/id="feeZonePanel"/);
  assert.match(admin,/Tarifa fija/);
  assert.match(admin,/Por distancia/);
  assert.match(admin,/Por zonas/);
});

test('Día Noche es una configuración común',()=>{
  assert.match(html,/Horario Día \/ Noche/);
  assert.match(html,/Este horario es común para Tarifa fija, Por distancia y Por zonas/);
  assert.match(admin,/save_delivery_fee_schedule/);
});

test('distancia usa rangos editables y botón Nuevo',()=>{
  assert.match(html,/id="addDistanceBandBtn"[^>]*>\+ Nuevo</);
  assert.match(html,/El último rango debe quedar como <strong>Sin límite<\/strong>/);
  assert.match(admin,/delivery_replace_distance_bands/);
  assert.match(admin,/function collectFeeDistanceBands/);
  assert.doesNotMatch(html,/Costo por km \(USD\)/);
  assert.doesNotMatch(admin,/save_delivery_distance_rate/);
});

test('zonas soporta simple y detallada',()=>{
  assert.match(html,/id="feeZoneSimpleTab"[^>]*>Simple</);
  assert.match(html,/id="feeZoneDetailedTab"[^>]*>Detallada</);
  assert.match(html,/Misma zona/);
  assert.match(html,/Otra zona/);
  assert.match(admin,/save_delivery_zone_simple/);
  assert.match(admin,/delivery_replace_zone_rates/);
});

test('abrir una tarjeta no activa la modalidad',()=>{
  const start=admin.indexOf('function selectFeeModePanel');
  const end=admin.indexOf('function renderFeePanelStatus',start);
  const block=admin.slice(start,end);
  assert.match(block,/state\.feePanel=mode/);
  assert.doesNotMatch(block,/delivery_activate_fee_mode/);
});

test('activar una modalidad pasa por un único RPC de activación',()=>{
  const start=admin.indexOf('async function activateFeeMode');
  const end=admin.indexOf('function coverageDeliveryRecord',start);
  const block=admin.slice(start,end);
  assert.match(block,/delivery_activate_fee_mode/);
  assert.match(block,/p_mode:mode/);
});

test('la carga usa un snapshot único del backend',()=>{
  assert.match(admin,/delivery_fee_workspace/);
  assert.match(admin,/workspace\?\.distance_bands/);
  assert.match(admin,/workspace\?\.zone_rates/);
  assert.match(admin,/workspace\?\.zones/);
});


test('activar Zona detallada conserva lo escrito antes de guardar',()=>{
  const bind=admin.indexOf('activateZoneDetailedBtn');
  const tail=admin.slice(bind,bind+240);
  assert.match(tail,/activateFeeMode\("ZONE"\)/);
  assert.doesNotMatch(tail,/setFeeZoneView/);
  assert.match(admin,/function snapshotFeeZoneDetailedInputs/);
});


test('ultimo rango muestra Más de X km en lugar de Sin límite',()=>{
  assert.match(admin,/function feeUnlimitedDistanceLabel/);
  assert.match(admin,/Más de /);
  assert.match(admin,/data-fee-band-unlimited-label/);
  assert.doesNotMatch(admin,/<span class="badge">Sin límite<\/span>/);
  assert.match(html,/Más de 6 km/);
});

test('la tarjeta seleccionada usa el estado visual seleccionado, no la modalidad activa',()=>{
  const start=admin.indexOf('function renderFeeModeCards');
  const end=admin.indexOf('function selectFeeModePanel',start);
  const block=admin.slice(start,end);
  assert.match(block,/selection-button/);
  assert.match(block,/is-selected/);
  assert.match(block,/aria-pressed/);
  assert.doesNotMatch(block,/buttonClass=active/);
});

test('Simple y Detallada usan selección visual consistente',()=>{
  const start=admin.indexOf('function setFeeZoneView');
  const end=admin.indexOf('function renderFeeZonePanel',start);
  const block=admin.slice(start,end);
  assert.match(block,/selection-button/);
  assert.match(block,/is-selected/);
  assert.match(block,/aria-pressed/);
});
