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
  assert.match(menu,/PRODUCTOS/);
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
