const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const h=fs.readFileSync("admin/monetizacion.html","utf8");
const j=fs.readFileSync("admin/monetization.js","utf8");

test("MASTER construye catálogo comercial por límites y funciones",()=>{
  assert.match(h,/Planes y Suscripciones/);
  assert.match(h,/Capacidad y funciones incluidas/);
  assert.match(j,/master_list_plan_feature_catalog/);
  assert.match(j,/master_save_commercial_plan/);
});

test("MASTER asigna renueva cambia plan y consulta vencimientos",()=>{
  assert.match(h,/Asignar, renovar o cambiar plan/);
  assert.match(h,/Suscripciones y vencimientos/);
  assert.match(j,/master_assign_commercial_plan/);
  assert.match(j,/master_list_delivery_subscriptions/);
  assert.match(h,/NEXT_CYCLE/);
});

test("MASTER gestiona excepciones",()=>{
  assert.match(j,/master_set_plan_override/);
  assert.match(h,/Excepción MASTER/);
});

test("frontend no consulta directamente tablas comerciales protegidas",()=>{
  assert.doesNotMatch(j,/\.from\(["']subscription_plans["']\)/);
  assert.doesNotMatch(j,/\.from\(["']plan_entitlements["']\)/);
  assert.doesNotMatch(j,/\.from\(["']plan_assignments["']\)/);
});

test("módulo es exclusivo MASTER",()=>{
  assert.match(j,/current_role_code/);
  assert.match(j,/state\.role!=="MASTER"/);
});
