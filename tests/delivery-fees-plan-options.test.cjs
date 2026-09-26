const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

test('Tarifas muestra las opciones incluidas en el plan',()=>{
  assert.match(html,/id="feePlanOptions"/);
  assert.match(admin,/Tarifa fija/);
  assert.match(admin,/Por distancia/);
  assert.match(admin,/Día \/ Noche|Día\/Noche/);
  assert.match(admin,/function renderFeePlanOptions/);
});

test('la tarjeta de distancia no depende de que DISTANCE sea la modalidad activa',()=>{
  const start=admin.indexOf('function updateFeeModeUI');
  const end=admin.indexOf('function feePeriodLabel',start);
  const block=admin.slice(start,end);
  assert.match(block,/state\.feeCapabilities/);
  assert.match(block,/distanceRatesCard/);
  assert.doesNotMatch(block,/const distanceMode/);
});

test('Día Noche solo aparece si la capacidad está habilitada',()=>{
  assert.match(admin,/feeDayNightSchedule/);
  assert.match(admin,/caps\.distance&&caps\.day_night/);
  assert.match(admin,/const periods=caps\.day_night\?\["DAY","NIGHT"\]:\["DAY"\]/);
});

test('cambiar de modalidad conserva la tarifa fija configurada',()=>{
  const start=admin.indexOf('async function saveFeeConfig');
  const end=admin.indexOf('async function saveFeeSchedule',start);
  const block=admin.slice(start,end);
  assert.match(block,/state\.feeCapabilities\?\.fixed \? Number\(fixedRaw\)/);
  assert.doesNotMatch(block,/mode === "FIXED" \? Number\(fixedRaw\) : 0/);
});

test('la interfaz distingue modalidad activa de opciones disponibles',()=>{
  assert.match(html,/Modalidad activa/);
  assert.match(html,/Solo una modalidad queda activa/);
  assert.match(admin,/Incluida en el plan/);
  assert.match(admin,/Modalidad activa/);
});
