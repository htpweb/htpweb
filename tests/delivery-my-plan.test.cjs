const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('admin/index.html','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260925121037_delivery_my_plan_summary.sql','utf8');

test('DELIVERY_ADMIN tiene una pantalla Mi Plan propia',()=>{
  assert.match(html,/data-section="myplan">Mi Plan/);
  assert.match(html,/id="section-myplan"/);
  const roleBlock=admin.match(/const roleSections = \{[\s\S]*?\n\};/)?.[0]||'';
  const deliveryLine=roleBlock.match(/DELIVERY_ADMIN:\s*\[[^\]]*\]/)?.[0]||'';
  const masterLine=roleBlock.match(/MASTER:\s*\[[^\]]*\]/)?.[0]||'';
  assert.match(deliveryLine,/"myplan"/);
  assert.doesNotMatch(masterLine,/"myplan"/);
});

test('Mi Plan muestra contrato, capacidad usada y funciones incluidas',()=>{
  assert.match(admin,/delivery_my_plan_summary/);
  assert.match(admin,/Zonas activas/);
  assert.match(admin,/Áreas restringidas/);
  assert.match(admin,/Operadores/);
  assert.match(admin,/Repartidores/);
  assert.match(admin,/Etapa 2/);
  assert.match(admin,/Versión contratada|versión /);
  assert.match(html,/id="myPlanFeatures"/);
});

test('backend calcula consumo frente a límites del plan',()=>{
  assert.match(migration,/zones\.active\.max/);
  assert.match(migration,/restricted_areas\.active\.max/);
  assert.match(migration,/operators\.active\.max/);
  assert.match(migration,/drivers\.active\.max/);
  assert.match(migration,/delivery_zones/);
  assert.match(migration,/delivery_restricted_areas/);
  assert.match(migration,/DELIVERY_OPERATOR/);
});

test('DELIVERY decide operadores dentro del cupo contratado',()=>{
  const fn=migration.match(/create or replace function public\.delivery_set_operator[\s\S]*?grant execute on function public\.delivery_set_operator/)?.[0]||'';
  assert.match(fn,/current_role_code\(\)<>'DELIVERY_ADMIN'/);
  assert.match(fn,/has_permission\('users\.manage'\)/);
  assert.match(fn,/operators\.active\.max/);
  assert.doesNotMatch(fn,/delivery_has_capability\([\s\S]*?'users\.manage'/);
});
