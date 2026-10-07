const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("LOCAL owner-managed backend blocks MASTER commercial edits only with live plan",()=>{
  const sql=read("supabase/migrations/20261002214654_local_owner_commerce_core.sql");
  assert.match(sql,/local_is_owner_managed/);
  assert.match(sql,/master_save_local_v3_unclaimed_legacy/);
  assert.match(sql,/este LOCAL está administrado por su propietario mientras su plan esté vigente/);
  assert.match(sql,/return not public\.local_is_owner_managed\(p_local_id\)/);
});

test("LOCAL commerce keeps one global LOCAL and existing local_deliveries network",()=>{
  const sql=read("supabase/migrations/20261002214654_local_owner_commerce_core.sql");
  assert.match(sql,/references public\.locals\(id\) on delete cascade/);
  assert.match(sql,/public\.local_deliveries/);
  assert.doesNotMatch(sql,/create table if not exists public\.storefront_locals/i);
});

test("Storefront supports cards visual menu and hybrid with predefined layouts",()=>{
  const sql=read("supabase/migrations/20261002214654_local_owner_commerce_core.sql");
  for(const mode of ["CARDS","VISUAL_MENU","HYBRID"])assert.match(sql,new RegExp(mode));
  for(const preset of ["FOOD_VISUAL","GROCERY_DENSE","FASHION_EDITORIAL","HEALTH_CLEAN","HARDWARE_CATALOG","SERVICES_SHOWCASE","GENERAL_MODERN"])assert.match(sql,new RegExp(preset));
});

test("Standalone LOCAL storefront and WhatsApp cart exist",()=>{
  const shop=read("app/tienda.html"),cart=read("app/tienda-carrito.html");
  assert.match(shop,/public_business_storefront/);
  assert.match(shop,/public_business_menu_pages/);
  assert.match(shop,/carritoAgregar/);
  assert.match(cart,/public_local_delivery_choices/);
  assert.match(cart,/wa\.me/);
  assert.match(cart,/Pedido enviado desde HTPWEB Local/);
});

test("LOCAL panel exposes design QR and DELIVERY partnership controls",()=>{
  const html=read("admin/index.html"),js=read("admin/admin.js");
  assert.match(html,/Diseño prediseñado/);
  assert.match(html,/Tarjetas de productos/);
  assert.match(html,/Menú visual/);
  assert.match(html,/Híbrido · menú \+ tarjetas/);
  assert.match(js,/save_my_local_commerce_settings/);
  assert.match(js,/request_local_delivery_partnership/);
  assert.match(js,/QRCode/);
});

test("MASTER list visibly locks owner-managed LOCAL and supports LOCAL plan assignment",()=>{
  const js=read("admin/locales-master.js");
  assert.match(js,/Propietario/);
  assert.match(js,/Bloqueado/);
  assert.match(js,/master_assign_local_plan/);
});

test("Inventory social content and LOCAL plans are provisioned without changing DELIVERY plans",()=>{
  const core=read("supabase/migrations/20261002214654_local_owner_commerce_core.sql");
  const ops=read("supabase/migrations/20261002214816_local_commerce_operations.sql");
  assert.match(core,/LOC_PRESENCE/);
  assert.match(core,/LOC_STORE/);
  assert.match(core,/LOC_PRO/);
  assert.match(ops,/local_inventory_items/);
  assert.match(ops,/local_social_content/);
  assert.match(ops,/public_local_delivery_choices/);
});


test("Block 2 LOCAL websites expose conventional sections, vertical templates and theme palettes",()=>{
  const migration=read("supabase/migrations/20261003212800_local_owner_block2_websites.sql");
  const html=read("admin/index.html"),js=read("admin/admin.js"),shop=read("app/tienda.html");
  for(const preset of ["BOOKS_STATIONERY","FLOWERS_GIFTS","HEALTH_SERVICES","ENGINEERING_PRO","BEAUTY_BOOKING"])assert.match(migration,new RegExp(preset));
  for(const sector of ["HEALTH","PROFESSIONAL","HOME_CONSTRUCTION","EDUCATION","BEAUTY","AUTOMOTIVE","TECHNOLOGY"])assert.match(migration,new RegExp(sector));
  assert.match(migration,/local_storefront_themes/);
  assert.match(migration,/save_my_local_storefront_content/);
  assert.match(html,/Estructura de la página web/);
  assert.match(html,/localStoreTheme/);
  assert.match(js,/renderLocalStorePreview/);
  assert.match(js,/save_my_local_storefront_content/);
  assert.match(shop,/Quiénes somos/);
  assert.match(shop,/catalogSection/);
  assert.match(shop,/contactSection/);
  assert.match(shop,/applyStoreTheme/);
});
