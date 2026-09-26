const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const app=fs.readFileSync("app/index.html","utf8");
const locals=fs.readFileSync("admin/locales-master.js","utf8");
const migration=fs.readFileSync("supabase/migrations/20260926151315_local_multi_business_categories_max_two.sql","utf8");

test("CLIENTE usa categorías maestras de LOCAL y no categorías internas de productos",()=>{
  assert.match(app,/\.from\("local_business_categories"\)/);
  assert.match(app,/\.from\("local_business_category_assignments"\)/);
  assert.doesNotMatch(app,/\.from\("categories"\)/);
  assert.match(app,/localCategoryAssignments\.some/);
});

test("CLIENTE muestra únicamente las 10 categorías aprobadas",()=>{
  for(const name of ["Desayunos y Cafeterías","Comida rápida","Parrilladas y asados","Pizzerías","Mariscos y ceviche","Almuerzos y comida típica","Postres y heladería","Bebidas alcohólicas","Bebidas no alcohólicas","Restaurantes"]){
    assert.ok(app.includes(name),name);
  }
});

test("MASTER admite categoría principal y secundaria, máximo 2",()=>{
  assert.match(locals,/masterLocalBusinessCategory2/);
  assert.match(locals,/master_set_local_business_categories/);
  assert.match(migration,/position in \(1,2\)/);
  assert.match(migration,/máximo 2 categorías/);
});