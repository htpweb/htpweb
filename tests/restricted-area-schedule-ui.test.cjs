const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

test('Seguridad ofrece copiar horario a todos los dias',()=>{
  assert.match(html,/id="restrictedAreaCopyAllDays"/);
  assert.match(html,/Copiar a todos los días/);
  assert.match(admin,/function copyRestrictedAreaRuleToAllDays/);
  assert.match(admin,/\[1,2,3,4,5,6,0\]\.map/);
});

test('+ Regla conserva los valores visibles antes de renderizar',()=>{
  assert.match(admin,/function syncRestrictedAreaRulesFromDom/);
  assert.match(admin,/function addRestrictedAreaRule/);
  const start=admin.indexOf('function addRestrictedAreaRule');
  const end=admin.indexOf('function copyRestrictedAreaRuleToAllDays',start);
  const block=admin.slice(start,end);
  assert.match(block,/syncRestrictedAreaRulesFromDom\(\)/);
  assert.doesNotMatch(block,/day_of_week:1,start_time:"19:00",end_time:"06:00"/);
});

test('+ Regla propone el siguiente dia libre',()=>{
  assert.match(admin,/function nextRestrictedAreaDay/);
  assert.match(admin,/\[1,2,3,4,5,6,0\]\.find\(day=>!used\.has\(day\)\)/);
  assert.match(admin,/Ya tienes una regla para cada día de la semana/);
});

test('cambios de dia y horas se sincronizan al estado',()=>{
  assert.match(admin,/\[data-sec-day\],\[data-sec-start\],\[data-sec-end\]/);
  assert.match(admin,/control\.onchange=sync/);
  assert.match(admin,/control\.oninput=sync/);
});

test('quitar una regla sincroniza antes de eliminar',()=>{
  const start=admin.indexOf('box.querySelectorAll("[data-sec-remove]")');
  const end=admin.indexOf('function collectRestrictedRules',start);
  const block=admin.slice(start,end);
  assert.match(block,/syncRestrictedAreaRulesFromDom\(\)/);
  assert.match(block,/securityState\.rules\.splice/);
});
