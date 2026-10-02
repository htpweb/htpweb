const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
function inlineScripts(file){
  const html=read(file);
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim());
}

test("LOCAL growth analytics records source and campaign without DELIVERY dependency",()=>{
  const sql=read("supabase/migrations/20261002220500_local_growth_analytics.sql");
  assert.match(sql,/record_local_storefront_event/);
  assert.match(sql,/WHATSAPP_ORDER/);
  assert.match(sql,/PROMOTION_VIEW/);
  assert.match(sql,/session_id/);
  assert.match(sql,/source/);
  assert.match(sql,/analytics_local_growth_summary/);
});

test("LOCAL store preserves social attribution into cart and WhatsApp",()=>{
  const shop=read("app/tienda.html");
  const cart=read("app/tienda-carrito.html");
  assert.match(shop,/params\.get\("src"\)/);
  assert.match(shop,/params\.get\("campaign"\)/);
  assert.match(shop,/record_local_storefront_event/);
  assert.match(cart,/WHATSAPP_ORDER/);
  assert.match(cart,/CHECKOUT_VIEW/);
  assert.match(cart,/p_source:source/);
});

test("LOCAL standalone page surfaces promotions and hybrid catalogue",()=>{
  const shop=read("app/tienda.html");
  assert.match(shop,/public_local_promotions_catalog/);
  assert.match(shop,/renderPromotions/);
  assert.match(shop,/PROMOTION_VIEW/);
  assert.match(shop,/public_local_menu_pages/);
});

test("LOCAL_ADMIN has Marketing, Analytics attribution and Inventory workspaces",()=>{
  const html=read("admin/index.html");
  const js=read("admin/admin.js");
  assert.match(html,/data-section="marketing"/);
  assert.match(html,/data-section="inventory"/);
  assert.match(html,/Resultados · últimos 30 días/);
  assert.match(js,/analytics_local_growth_summary/);
  assert.match(js,/save_my_local_social_content/);
  assert.match(js,/save_my_local_inventory/);
});

test("DELIVERY can accept or reject LOCAL partnership requests",()=>{
  const html=read("admin/index.html");
  const js=read("admin/admin.js");
  const sql=read("supabase/migrations/20261002220500_local_growth_analytics.sql");
  assert.match(html,/Solicitudes de LOCAL para trabajar contigo/);
  assert.match(js,/delivery_review_local_partnership/);
  assert.match(sql,/local_partnership_requests_snapshot/);
});

test("new LOCAL storefront inline scripts compile",()=>{
  for(const file of ["app/tienda.html","app/tienda-carrito.html"]){
    for(const script of inlineScripts(file))new vm.Script(script,{filename:file});
  }
});
