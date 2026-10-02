const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const client=fs.readFileSync("app/index.html","utf8");
const local=fs.readFileSync("app/local.html","utf8");
const admin=fs.readFileSync("admin/index.html","utf8");
const adminJs=fs.readFileSync("admin/admin.js","utf8");
const panel=fs.readFileSync("admin/delivery-promotions.js","utf8");
const migration=fs.readFileSync("supabase/migrations/20260926153209_delivery_day_promotions_and_catalog_visibility.sql","utf8");

test("CLIENTE integra promociones del día como filtro del catálogo",()=>{
  assert.match(client,/public_delivery_promotions/);
  assert.match(client,/p_day_offset: 0/);
  assert.match(client,/__PROMOTIONS__/);
  assert.match(client,/🔥 Promociones/);
  assert.match(client,/promotionCountForLocal/);
});

test("productos marcados solo promoción no aparecen en catálogos públicos",()=>{
  assert.match(client,/\.eq\("catalog_visible", true\)/);
  assert.match(local,/\.eq\("catalog_visible", true\)/);
  assert.match(migration,/catalog_visible boolean not null default true/);
});

test("DELIVERY_ADMIN y DELIVERY_OPERATOR pueden consultar Promociones",()=>{
  assert.match(admin,/data-section="promotions"/);
  assert.match(admin,/section-promotions/);
  assert.match(adminJs,/DELIVERY_ADMIN: \[[^\]]*"promotions"/);
  assert.match(adminJs,/DELIVERY_OPERATOR: \[[^\]]*"promotions"/);
  assert.match(adminJs,/loadDeliveryPromotionsPanel/);
  assert.match(panel,/public_delivery_promotions/);
});

test("promociones se resuelven por fecha de Ecuador y no como categoría",()=>{
  assert.match(migration,/America\/Guayaquil/);
  assert.match(migration,/p_day_offset/);
  assert.match(migration,/days_of_week/);
  assert.doesNotMatch(client,/categoryOrder[\s\S]{0,1200}"Promociones"/);
});

test("panel DELIVERY muestra LOCAL, producto y precio promocional",()=>{
  assert.match(panel,/promotion\.local_name/);
  assert.match(panel,/item\.product_name/);
  assert.match(panel,/item\.promo_price/);
  assert.match(panel,/promotion\.promotion_price/);
});

test("promociones activas se compran como promoción y no pierden su precio",()=>{
  const cart=fs.readFileSync("config/cart.js","utf8");
  const promotions=fs.readFileSync("config/promotions.js","utf8");
  const checkout=fs.readFileSync("app/carrito.html","utf8");
  const edge=fs.readFileSync("supabase/functions/crear-pedido/index.ts","utf8");
  assert.match(cart,/promotion_id/);
  assert.match(cart,/promotion_item_id/);
  assert.match(promotions,/Agregar promoción/);
  assert.match(promotions,/carritoAgregar/);
  assert.match(checkout,/promotion_id: item\.promotion_id/);
  assert.match(edge,/promotion_id: item\.promotion_id/);
});