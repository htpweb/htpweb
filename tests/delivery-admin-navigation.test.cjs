const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const css=fs.readFileSync('assets/admin.css','utf8');

test('Mi Plan ya no duplica accesos operativos',()=>{
  for(const id of ['myPlanGoCoverage','myPlanGoSecurity','myPlanGoFees','myPlanGoDrivers','myPlanGoNetwork']){
    assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
    assert.doesNotMatch(admin,new RegExp(id));
  }
  assert.doesNotMatch(admin,/function openMyPlanResource/);
});

test('Mi Plan queda descrito como pantalla informativa',()=>{
  assert.match(html,/La operación se realiza desde el menú lateral/);
  assert.match(html,/Esta sección es informativa; utiliza el menú lateral para operar cada módulo/);
  assert.match(admin,/Uso actual frente al máximo contratado/);
});

test('DELIVERY_ADMIN se agrupa por áreas de trabajo',()=>{
  const start=admin.indexOf('function organizeDeliveryAdminNavigation');
  const end=admin.indexOf('function configureNavigation',start);
  const block=admin.slice(start,end);
  assert.match(block,/state\.role!=="DELIVERY_ADMIN"/);
  assert.match(block,/label:"Principal",sections:\["overview"\]/);
  assert.match(block,/label:"Operación",sections:\["orders","drivers"\]/);
  assert.match(block,/label:"Mi DELIVERY",sections:\["mydelivery","fees","coverage","security"\]/);
  assert.match(block,/label:"Clientes",sections:\["network","share","requests"\]/);
  assert.match(block,/label:"Imagen y promoción",sections:\["storage","advertising"\]/);
  assert.match(block,/label:"Gestión",sections:\["myplan","analytics"\]/);
});

test('otros roles mantienen roleSections sin cambio de permisos',()=>{
  assert.match(admin,/MASTER: \["overview","share","orders","requests","deliveries","localsmaster","categoriesmaster","zonesmaster","users","coverage","catalog","schedules","advertising","menuimport","analytics"\]/);
  assert.match(admin,/DELIVERY_OPERATOR: \["overview","orders","drivers"\]/);
  assert.match(admin,/LOCAL_ADMIN: \["overview","mylocal","orders","catalog","schedules","storage","advertising","analytics"\]/);
});

test('el menú agrupado tiene estilos discretos',()=>{
  assert.match(css,/\.delivery-nav-group-title/);
  assert.match(css,/text-transform:uppercase/);
  assert.match(css,/color:#94a3b8/);
});
