const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const localHtml = fs.readFileSync("app/local.html", "utf8");

test("tarjeta muestra cantidad real del carrito y no un 1 fijo", () => {
  assert.match(localHtml, /value="\$\{cartQuantityForProduct\(product\.id, vs\[0\]\?\.id \|\| null\)\}"/);
  assert.match(localHtml, /aria-label="Cantidad en carrito" readonly/);
  assert.doesNotMatch(localHtml, /id="qty-\$\{product\.id\}"[^>]*value="1"/);
});

test("Agregar desde la tarjeta suma exactamente una unidad", () => {
  const start = localHtml.indexOf("function addProduct(productId)");
  const end = localHtml.indexOf("function updateCartCount()");
  const block = localHtml.slice(start, end);
  assert.match(block, /carritoAgregar\([\s\S]*\}, 1\);/);
  assert.doesNotMatch(block, /Number\.parseInt\(\$\("qty-" \+ productId\)\.value/);
  assert.match(block, /syncProductCartQuantity\(productId\)/);
});

test("cerrar visor conserva en tarjeta la cantidad acumulada", () => {
  assert.match(localHtml, /function syncProductCartQuantity\(productId\)/);
  assert.match(localHtml, /input\.value = total/);
  assert.match(localHtml, /window\.addEventListener\("htpweb:cart",[\s\S]*syncAllProductCartQuantities\(\)/);
});

test("cambiar variante actualiza precio y cantidad de esa variante", () => {
  const start = localHtml.indexOf("function syncVariantPrice(productId)");
  const end = localHtml.indexOf("function addProduct(productId)");
  const block = localHtml.slice(start, end);
  assert.match(block, /syncProductCartQuantity\(productId\)/);
  assert.match(localHtml, /variant_id: variantId/);
});
