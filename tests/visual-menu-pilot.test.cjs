const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const local=fs.readFileSync("app/local.html","utf8");
const menu=fs.readFileSync("config/menu-viewer.js","utf8");
const migration=fs.readFileSync("supabase/migrations/20260927003957_pilot_visual_purchasable_menu.sql","utf8");

test("piloto de menú visual está habilitado en la página del LOCAL",()=>{
  assert.match(local,/config\/menu-viewer\.js/);
  assert.match(menu,/public_local_menu_pages/);
  assert.match(menu,/Productos de esta hoja/);
  assert.match(menu,/MENÚ/);
  assert.match(menu,/PROMOCIONES/);
});

test("menú visual compra varios productos usando cantidades del carrito existente",()=>{
  assert.match(menu,/htpwebChangeProductQuantity/);
  assert.match(menu,/htpwebSetProductQuantity/);
  assert.match(menu,/htpwebProductCartMatcher/);
  assert.match(menu,/htpweb:cart/);
  assert.doesNotMatch(menu,/>Agregar<\/button>/);
});

test("navegación soporta varias hojas aunque Cedeño tenga una sola fuente",()=>{
  assert.match(menu,/stepPage/);
  assert.match(menu,/visualMenuPrev/);
  assert.match(menu,/visualMenuNext/);
  assert.match(menu,/menuPages\.length <= 1/);
});

test("piloto de base solo publica hoja para Parrilladas Cedeño",()=>{
  assert.match(migration,/where l\.name='Parrilladas Cedeño'/);
  assert.match(migration,/local_menu_pages/);
  assert.match(migration,/local_menu_page_products/);
  assert.match(migration,/public_local_menu_pages/);
});


test("menú visual usa el cliente Supabase global real de HTPWEB",()=>{
  assert.match(menu,/typeof supabaseClient === "undefined"/);
  assert.doesNotMatch(menu,/!window\.supabaseClient/);
});


test("visor ampliado conserva compra al costado y navegación por hojas",()=>{
  assert.match(menu,/visualMenuViewer/);
  assert.match(menu,/visualMenuViewerImage/);
  assert.match(menu,/visualMenuViewerProducts/);
  assert.match(menu,/visualMenuViewerPrev/);
  assert.match(menu,/visualMenuViewerNext/);
  assert.match(menu,/openViewer/);
});

test("productos del menú se agrupan por categorías internas",()=>{
  assert.match(menu,/groupedPageProducts/);
  assert.match(menu,/visual-menu-category-toggle/);
  assert.match(menu,/first_product_order/);
  const categoryMigration=fs.readFileSync("supabase/migrations/20260927025950_visual_menu_category_groups.sql","utf8");
  assert.match(categoryMigration,/'categories'/);
  assert.match(categoryMigration,/first_product_order/);
});


test("categorías del menú son desplegables y conservan estado",()=>{
  assert.match(menu,/expandedCategories/);
  assert.match(menu,/toggleCategory/);
  assert.match(menu,/aria-expanded/);
  assert.match(menu,/visual-menu-category-toggle/);
  assert.match(menu,/initializedCategoryPages/);
});

test("buscador encuentra productos y variantes en todas las hojas",()=>{
  assert.match(menu,/Buscar producto\.\.\./);
  assert.match(menu,/allMenuSearchResults/);
  assert.match(menu,/menuPages\.forEach/);
  assert.match(menu,/productVariants\(product\.id\)/);
  assert.match(menu,/selectSearchResult/);
  assert.match(menu,/scrollIntoView/);
});


test("variantes del menú se muestran como opciones con cantidad independiente",()=>{
  assert.match(menu,/renderVariantProduct/);
  assert.match(menu,/visual-menu-variant-row/);
  assert.match(menu,/visual-menu-variant-name/);
  assert.match(menu,/data-menu-variant/);
  assert.match(menu,/htpwebChangeProductQuantity[\s\S]*chosenVariantId/);
  assert.match(menu,/htpwebSetProductQuantity[\s\S]*chosenVariantId/);
  assert.doesNotMatch(menu,/visual-menu-add/);
  assert.doesNotMatch(menu,/>Agregar<\/button>/);
});


test("presentación final simple del menú no repite producto ni usa botón Agregar",()=>{
  assert.match(menu,/visual-menu-product-group-heading/);
  assert.match(menu,/visual-menu-variant-row/);
  assert.doesNotMatch(menu,/visual-menu-add/);
  assert.doesNotMatch(menu,/>Agregar<\/button>/);
});


test("pestaña PRODUCTOS se reemplaza por PROMOCIONES en locales con menú visual",()=>{
  assert.match(menu,/visualPromotionsTab/);
  assert.match(menu,/>PROMOCIONES<\/button>/);
  assert.doesNotMatch(menu,/visualProductsTab/);
  assert.match(menu,/promotionsCard\.dataset\.tabManaged/);
});

test("promociones programadas pueden mostrarse bloqueadas fuera de vigencia",()=>{
  const promotions=fs.readFileSync("config/promotions.js","utf8");
  assert.match(promotions,/public_local_promotions_catalog/);
  assert.match(promotions,/available_now/);
  assert.match(promotions,/promotionDisabled/);
  assert.match(promotions,/Disponible los/);
  assert.match(promotions,/promotion-unavailable/);
  assert.match(promotions,/product_image_url/);
});


test("promoción combinable exige exactamente la cantidad configurada",()=>{
  const promotions=fs.readFileSync("config/promotions.js","utf8");
  assert.match(promotions,/promotionMixConfig/);
  assert.match(promotions,/mixSelections/);
  assert.match(promotions,/Elige tus/);
  assert.match(promotions,/promotion-mix-row/);
  assert.match(promotions,/selectedTotal !== mix\.required/);
  assert.match(promotions,/promotion_selection/);
});

test("carrito conserva y envía la selección de variantes promocionales",()=>{
  const cart=fs.readFileSync("app/carrito.html","utf8");
  assert.match(cart,/snapshot\?\.promotion_selection/);
  assert.match(cart,/promotion_selection:/);
  assert.match(cart,/variant_name/);
});

test("crear-pedido valida la mezcla promocional en servidor",()=>{
  const edge=fs.readFileSync("supabase/functions/crear-pedido/index.ts","utf8");
  assert.match(edge,/validatePromotionSelections/);
  assert.match(edge,/totalSelected !== required/);
  assert.match(edge,/product_variants/);
  assert.match(edge,/PROMO /);
});


test("visor de promociones amplía imagen y mantiene compra al costado",()=>{
  const promotions=fs.readFileSync("config/promotions.js","utf8");
  const css=fs.readFileSync("assets/app.css","utf8");
  assert.match(promotions,/promotionViewer/);
  assert.match(promotions,/openPromotionViewer/);
  assert.match(promotions,/promotion-card-copy/);
  assert.match(promotions,/promotion-card-image/);
  assert.match(promotions,/Ver promoción y comprar/);
  assert.match(css,/\.promotion-viewer-panel/);
  assert.match(css,/grid-template-columns:minmax\(0,1\.35fr\) minmax\(360px,\.65fr\)/);
  assert.match(css,/\.promotion-viewer-image/);
  assert.match(css,/\.promotion-viewer-content/);
});


test("visor de promociones contiene el arte completo sin recorte",()=>{
  const css=fs.readFileSync("assets/app.css","utf8");
  assert.match(css,/\.promotion-viewer-image\{/);
  assert.match(css,/width:auto/);
  assert.match(css,/height:auto/);
  assert.match(css,/max-width:100%/);
  assert.match(css,/object-fit:contain/);
  assert.match(css,/object-position:center/);
});
