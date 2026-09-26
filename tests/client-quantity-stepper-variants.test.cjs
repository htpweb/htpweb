const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const localHtml = fs.readFileSync("app/local.html", "utf8");
const viewer = fs.readFileSync("config/media-viewer.js", "utf8");
const css = fs.readFileSync("assets/app.css", "utf8");

test("tarjeta de producto incluye botones menos y más", () => {
  assert.match(localHtml, /changeProductQuantity\('\$\{product\.id\}', -1\)/);
  assert.match(localHtml, /changeProductQuantity\('\$\{product\.id\}', 1\)/);
  assert.match(localHtml, /class="quantity-stepper"/);
});

test("alta de producto acepta variante explícita", () => {
  assert.match(localHtml, /function addProductUnit\(productId, explicitVariantId = undefined\)/);
  assert.match(localHtml, /resolveProductVariant\(productId, explicitVariantId\)/);
  assert.match(localHtml, /variant_id: variant\?\.id \|\| null/);
  assert.match(localHtml, /window\.htpwebAddProductUnit = addProductUnit/);
});

test("visor no depende del select de la tarjeta para agregar una variante", () => {
  const start = viewer.indexOf("function addFromViewer");
  const end = viewer.indexOf("async function loadGallery");
  const block = viewer.slice(start, end);
  assert.match(block, /const variantId = selectedViewerVariantId\(\)/);
  assert.match(block, /window\.htpwebAddProductUnit\(productId, variantId\)/);
});

test("los botones +/- cambian la cantidad real de la variante", () => {
  assert.match(localHtml, /function changeProductQuantity\(productId, delta, explicitVariantId = undefined\)/);
  assert.match(localHtml, /carritoCantidadItem\(negocioActual\.slug, matcher\)/);
  assert.match(localHtml, /carritoCambiarCantidad\(negocioActual\.slug, matcher, next\)/);
  assert.match(localHtml, /carritoEliminar\(negocioActual\.slug, matcher\)/);
  assert.match(viewer, /window\.htpwebChangeProductQuantity/);
});

test("estilos muestran un stepper compacto", () => {
  assert.match(css, /\.quantity-stepper\{/);
  assert.match(css, /grid-template-columns:34px minmax\(42px,1fr\) 34px/);
  assert.match(css, /\.qty-step-btn/);
});
