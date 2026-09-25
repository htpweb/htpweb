const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const h=fs.readFileSync(path.join(__dirname,"../admin/monetizacion.html"),"utf8");
const j=fs.readFileSync(path.join(__dirname,"../admin/monetization.js"),"utf8");

test("MASTER gestiona catálogo comercial por RPC seguro",()=>{
  assert.match(j,/master_list_commercial_plans/);
  assert.match(j,/master_list_plan_feature_catalog/);
  assert.match(j,/master_save_commercial_plan/);
  assert.match(h,/Capacidad y funciones incluidas/);
  assert.doesNotMatch(j,/\.from\("subscription_plans"\)/);
  assert.doesNotMatch(j,/\.from\("plan_entitlements"\)/);
});

test("MASTER asigna y consulta suscripciones",()=>{
  assert.match(j,/master_assign_commercial_plan/);
  assert.match(j,/master_list_delivery_subscriptions/);
  assert.match(h,/Suscripciones/);
  assert.match(h,/Vencimientos/);
});

test("MASTER gestiona excepciones sin modificar el plan general",()=>{
  assert.match(j,/master_set_plan_override/);
  assert.match(j,/plan_usage_snapshot/);
  assert.match(h,/Excepción MASTER/);
});

test("módulo es exclusivo de MASTER",()=>{
  assert.match(j,/current_role_code/);
  assert.match(j,/state\.role!=="MASTER"/);
});
