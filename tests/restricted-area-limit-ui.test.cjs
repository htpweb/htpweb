const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

test('muestra un aviso claro al alcanzar el limite',()=>{
  assert.match(html,/id="restrictedAreaLimitNotice"/);
  assert.match(admin,/Límite alcanzado/);
  assert.match(admin,/Ya utilizaste todas las áreas restringidas permitidas por tu plan/);
});

test('oculta el editor solo para crear una nueva area cuando el cupo esta lleno',()=>{
  assert.match(admin,/restrictedAreaLimitReached\(\)&&!restrictedAreaIsEditing\(\)/);
  assert.match(admin,/restrictedAreaEditorBody/);
  assert.match(admin,/classList\.toggle\("hidden",locked\)/);
});

test('editar un area existente vuelve a habilitar el editor',()=>{
  const start=admin.indexOf('box.querySelectorAll("[data-sec-edit]")');
  const end=admin.indexOf('async function loadRestrictedAreas',start);
  const block=admin.slice(start,end);
  assert.match(block,/restrictedAreaId/);
  assert.match(block,/updateRestrictedAreaLimitUi\(\)/);
  assert.match(block,/restrictedAreaEditorTitle/);
});

test('el mapa ignora nuevos puntos si el limite esta lleno y no se edita',()=>{
  assert.match(admin,/if\(restrictedAreaLimitReached\(\)&&!restrictedAreaIsEditing\(\)\)return;/);
});

test('guardar tambien valida el limite en cliente antes del RPC',()=>{
  const start=admin.indexOf('async function saveRestrictedArea');
  const end=admin.indexOf('function bindEvents',start);
  const block=admin.slice(start,end);
  assert.match(block,/Has alcanzado el límite de áreas restringidas de tu plan/);
});

test('el estado del plan muestra usados, limite y disponibles',()=>{
  assert.match(admin,/Áreas activas:/);
  assert.match(admin,/Disponibles:/);
});
