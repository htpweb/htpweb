const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=rel=>fs.readFileSync(path.join(root,rel),"utf8");

test("LOCAL catalog schema supports premium product presentation",()=>{
  const sql=read("supabase/migrations/20261005140500_local_premium_product_cards.sql");
  for(const token of ["compare_price","short_description","badge_type","badge_text","featured","save_local_product_presentation"]){
    assert.match(sql,new RegExp(token));
  }
});

test("LOCAL admin exposes price comparison badge and short description",()=>{
  const html=read("admin/index.html");
  for(const id of ["productComparePrice","productBadgeType","productBadgeText","productFeatured","productShortDescription"]){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  const js=read("admin/admin.js");
  assert.match(js,/save_local_product_presentation/);
  assert.match(js,/compare_price/);
});

test("LOCAL storefront renders premium cards and quantity cart control",()=>{
  const html=read("app/tienda.html");
  assert.match(html,/premium-product-grid/);
  assert.match(html,/catalog-product-card/);
  assert.match(html,/catalog-compare-price/);
  assert.match(html,/catalog-add-btn/);
  assert.match(html,/data-qty-plus/);
  assert.match(html,/data-add-product/);
  assert.match(html,/compare_price/);
  assert.match(html,/short_description/);
});
