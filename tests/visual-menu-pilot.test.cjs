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

test("menú visual compra varios productos usando el carrito existente",()=>{
  assert.match(menu,/htpwebAddProductUnit/);
  assert.match(menu,/htpwebChangeProductQuantity/);
  assert.match(menu,/htpwebSetProductQuantity/);
  assert.match(menu,/htpwebProductCartMatcher/);
  assert.match(menu,/htpweb:cart/);
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
