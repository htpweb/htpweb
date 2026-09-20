const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const admin=fs.readFileSync("admin/admin.js","utf8");
const html=fs.readFileSync("admin/index.html","utf8");
const categories=fs.readFileSync("admin/local-categories-master.js","utf8");
const locals=fs.readFileSync("admin/locales-master.js","utf8");
const bulk=fs.readFileSync("admin/locales-bulk.js","utf8");
const sql=fs.readFileSync("supabase/migrations/20260920043000_local_business_categories.sql","utf8");

test("MASTER tiene módulo independiente Categorías de LOCAL",()=>{
  assert.match(html,/data-section="categoriesmaster">Categorías</);
  assert.match(html,/section-categoriesmaster/);
  assert.match(admin,/MASTER:\s*\[[^\]]*"categoriesmaster"/);
  assert.match(admin,/loadMasterLocalBusinessCategories/);
  assert.match(categories,/Categorías de LOCAL — MASTER/);
  assert.match(categories,/master_save_local_business_category/);
});

test("categoría central se reutiliza al crear un LOCAL manualmente",()=>{
  assert.match(locals,/masterLocalBusinessCategory/);
  assert.match(locals,/businessCategories/);
  assert.match(locals,/p_business_category_id/);
  assert.match(locals,/master_save_local_v3/);
  assert.match(sql,/business_category_id uuid references public\.local_business_categories/);
});

test("plantilla masiva usa la misma categoría central",()=>{
  assert.match(bulk,/CATEGORIA/);
  assert.match(bulk,/masterLocalsState\.businessCategories/);
  assert.match(bulk,/row\.category\.id/);
  assert.match(bulk,/p_business_category_id:row\.category\.id/);
});

test("categorías de LOCAL son distintas de categorías de productos",()=>{
  assert.match(sql,/create table if not exists public\.local_business_categories/);
  assert.match(sql,/master_list_local_business_categories/);
  assert.match(sql,/master_save_local_business_category/);
  assert.doesNotMatch(categories,/save_local_category/);
});

test("zona se detecta por polígono sin exigir mismo cantón",()=>{
  assert.match(locals,/masterLocalsState\.zones\.filter\(z=>z\.active&&Array\.isArray\(z\.boundary\)/);
  assert.doesNotMatch(locals,/matches=masterLocalsState\.zones\.filter\(z=>z\.active&&z\.city_id===/);
  assert.match(sql,/join public\.deliveries d on d\.id=dz\.delivery_id and d\.active/);
  assert.doesNotMatch(sql,/d\.city_id=z\.city_id/);
});
