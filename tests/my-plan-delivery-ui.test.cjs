const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

test('Mi Plan oculta etapas de desarrollo',()=>{
  const start=admin.indexOf('function renderMyPlan');
  const end=admin.indexOf('async function loadMyPlan',start);
  const block=admin.slice(start,end);
  assert.doesNotMatch(block,/Etapa\s+[123]/);
  assert.doesNotMatch(block,/<th>Etapa<\/th>/);
  assert.doesNotMatch(html,/prestaciones de Etapa 2/i);
});

test('Mi Plan agrupa funciones con nombres de usuario',()=>{
  assert.match(admin,/function myPlanFeaturePresentation/);
  assert.match(admin,/Mi DELIVERY/);
  assert.match(admin,/Pedidos y despacho/);
  assert.match(admin,/GPS y rutas/);
  assert.match(admin,/Clientes y referidos/);
  assert.match(admin,/Datos y analítica/);
});

test('Base HTPWEB no se muestra como familia al DELIVERY',()=>{
  const start=admin.indexOf('function renderMyPlanFeatureGroups');
  const end=admin.indexOf('function renderMyPlan',start);
  const block=admin.slice(start,end);
  assert.doesNotMatch(block,/Base HTPWEB/);
});

test('capacidades se muestran aparte de limites',()=>{
  assert.match(admin,/f\.type==="CAPABILITY"&&f\.value===true/);
  assert.match(admin,/Límite contratado:/);
});

test('oculta permisos internos que no son acciones directas',()=>{
  assert.match(admin,/products\.manage/);
  assert.match(admin,/bulk_import\.manage/);
  assert.match(admin,/return null/);
});
