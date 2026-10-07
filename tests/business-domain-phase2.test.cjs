const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const read=rel=>fs.readFileSync(path.join(root,rel),"utf8");

function inlineScripts(file){
  return [...read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(x=>x[1])
    .filter(x=>x.trim());
}

test("phase 2 adds canonical BUSINESS read views without destructive renames",()=>{
  const sql=read("supabase/migrations/20261007122131_business_domain_phase2_views.sql");
  assert.match(sql,/public\.business_products/);
  assert.match(sql,/public\.business_categories/);
  assert.match(sql,/public\.business_orders/);
  assert.match(sql,/public\.business_order_items/);
  assert.match(sql,/security_invoker\s*=\s*true/i);
  assert.doesNotMatch(sql,/drop table|rename\s+column|rename\s+to/i);
});

test("delivery business page reads canonical BUSINESS views",()=>{
  const page=read("app/local.html");
  assert.match(page,/params\.get\("business"\)/);
  assert.match(page,/from\("business_deliveries"\)/);
  assert.match(page,/from\("businesses"\)/);
  assert.match(page,/from\("business_products"\)/);
  assert.match(page,/from\("business_categories"\)/);
  assert.match(page,/business_id/);
});

test("storefront and carts use canonical BUSINESS product reads",()=>{
  const tienda=read("app/tienda.html");
  const cart=read("app/tienda-carrito.html");
  const general=read("app/carrito-general.html");
  assert.match(tienda,/from\("business_products"\)/);
  assert.match(tienda,/from\("business_categories"\)/);
  assert.match(cart,/from\("business_products"\)/);
  assert.match(general,/from\("business_products"\)/);
  assert.match(general,/from\("businesses"\)/);
});

test("account history reads canonical BUSINESS orders",()=>{
  const account=read("app/mi-cuenta.html");
  assert.match(account,/from\("business_orders"\)/);
  assert.match(account,/origin_business_id/);
});

test("canonical business claim route accepts business and legacy local query params",()=>{
  const claim=read("app/reclamar-negocio.html");
  assert.match(claim,/params\.get\("business"\)\|\|params\.get\("local"\)/);
  assert.match(claim,/p_business_id:businessId/);
});

test("modified business pages keep valid inline JavaScript",()=>{
  for(const file of ["app/local.html","app/tienda.html","app/tienda-carrito.html","app/carrito-general.html","app/mi-cuenta.html","app/reclamar-negocio.html"]){
    for(const script of inlineScripts(file))new vm.Script(script,{filename:file});
  }
});
