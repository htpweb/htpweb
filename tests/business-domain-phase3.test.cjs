const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const read=rel=>fs.readFileSync(path.join(root,rel),"utf8");
const inlineScripts=file=>[...read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim());

test("phase 3 exposes canonical BUSINESS RPC aliases",()=>{
  const sql=read("supabase/migrations/20261007123906_business_domain_phase3_rpc_aliases.sql");
  const helpers=read("supabase/migrations/20261007125031_business_domain_phase3_public_helpers.sql");
  const ads=read("supabase/migrations/20261007125856_business_domain_phase3_ads_alias.sql");
  for(const name of [
    "public_business_storefront",
    "public_business_inventory",
    "public_business_menu_pages",
    "public_business_promotions_catalog",
    "public_business_claim_state",
    "create_direct_business_order",
    "my_business_account_modes",
    "switch_my_business_account_mode",
    "my_business_plans_and_subscriptions"
  ]) assert.match(sql,new RegExp(name));
  assert.match(helpers,/public_active_business_promotions/);
  assert.match(helpers,/public_business_delivery_choices/);
  assert.match(ads,/public_business_advertisements/);
  for(const source of [sql,helpers,ads]){
    assert.doesNotMatch(source,/drop table|alter table\s+public\.locals\s+rename/i);
  }
});

test("canonical BUSINESS storefront response no longer exposes top-level local",()=>{
  const sql=read("supabase/migrations/20261007123906_business_domain_phase3_rpc_aliases.sql");
  assert.match(sql,/payload - 'local'/);
  assert.match(sql,/jsonb_build_object\('business',payload->'local'\)/);
});

test("public storefront callers use BUSINESS RPC names",()=>{
  const shop=read("app/tienda.html");
  const cart=read("app/tienda-carrito.html");
  const deliveryBusiness=read("app/local.html");
  const generalBusiness=read("app/local-general.html");
  const menu=read("config/menu-viewer.js");
  const promotions=read("config/promotions.js");
  for(const name of [
    "public_business_storefront",
    "public_business_inventory",
    "record_business_storefront_event"
  ]) assert.match(shop,new RegExp(name));
  assert.match(shop,/public_business_menu_pages/);
  assert.match(shop,/public_business_promotions_catalog/);
  assert.match(cart,/create_direct_business_order/);
  assert.match(cart,/public_business_storefront/);
  assert.match(deliveryBusiness,/public_business_claim_state/);
  assert.match(deliveryBusiness,/public_businesses_order_availability/);
  assert.match(menu,/public_business_menu_pages/);
  assert.match(promotions,/public_business_promotions_catalog/);
  assert.match(promotions,/public_active_business_promotions/);
  assert.match(generalBusiness,/public_business_delivery_choices/);
  assert.match(generalBusiness,/from\("businesses"\)/);
  assert.match(generalBusiness,/from\("business_products"\)/);
});

test("account and claim flows call canonical BUSINESS RPCs",()=>{
  const auth=read("config/auth.js");
  const account=read("app/mi-cuenta.html");
  const claim=read("app/reclamar-negocio.html");
  assert.match(auth,/my_business_account_modes/);
  assert.match(auth,/switch_my_business_account_mode/);
  assert.match(account,/my_business_claims/);
  assert.match(account,/my_business_plans_and_subscriptions/);
  assert.match(account,/switch_my_business_account_mode/);
  assert.match(claim,/prepare_business_claim_challenge/);
  assert.match(claim,/submit_business_claim/);
  assert.match(claim,/business_claim_context/);
});

test("canonical storefront URLs accept business while preserving local fallback",()=>{
  const shop=read("app/tienda.html");
  const cart=read("app/tienda-carrito.html");
  assert.match(shop,/params\.get\("business"\)\|\|params\.get\("local"\)/);
  assert.match(cart,/params\.get\("business"\)\|\|params\.get\("local"\)/);
  assert.match(cart,/tienda\.html\?business=/);
});

test("modified phase 3 pages keep valid inline JavaScript",()=>{
  for(const file of ["app/tienda.html","app/tienda-carrito.html","app/local.html","app/mi-cuenta.html","app/reclamar-negocio.html"]){
    for(const script of inlineScripts(file))new vm.Script(script,{filename:file});
  }
});
