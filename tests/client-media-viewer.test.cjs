const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const localHtml = fs.readFileSync("app/local.html", "utf8");
const viewer = fs.readFileSync("config/media-viewer.js", "utf8");
const ads = fs.readFileSync("config/ads.js", "utf8");
const css = fs.readFileSync("assets/app.css", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260926192702_public_local_gallery_client_viewer.sql", "utf8");

test("LOCAL carga el visor multimedia del cliente", () => {
  assert.match(localHtml, /config\/media-viewer\.js/);
  assert.match(viewer, /mediaViewerPurchase/);
  assert.match(viewer, /openProduct\(productId\)/);
  assert.match(viewer, /window\.htpwebAddProductUnit\(productId, variantId\)/);
});

test("visor conserva la lógica existente de carrito y variantes", () => {
  assert.match(viewer, /const variantId = selectedViewerVariantId\(\)/);
  assert.match(viewer, /typeof window\.htpwebAddProductUnit !== "function"/);
  assert.match(viewer, /window\.htpwebAddProductUnit\(productId, variantId\)/);
  assert.doesNotMatch(viewer, /carritoAgregar\(/);
});

test("CLIENT puede ver la galería pública del LOCAL", () => {
  assert.match(viewer, /rpc\("public_list_local_gallery"/);
  assert.match(viewer, /local-gallery-public/);
  assert.match(viewer, /openGallery\(Number\(button\.dataset\.galleryIndex\)\)/);
  assert.match(migration, /create or replace function public\.public_list_local_gallery/);
  assert.match(migration, /grant execute .* to anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /storage_path'.*g\.storage_path/s);
});

test("banner de LOCAL y publicidad abren la experiencia ampliada", () => {
  assert.match(viewer, /function openBanner\(/);
  assert.match(viewer, /localCard.*addEventListener\("click"/s);
  assert.match(ads, /params\.view = "banner"/);
});

test("visor es responsive y bloquea scroll de fondo", () => {
  assert.match(css, /\.media-viewer\{/);
  assert.match(css, /body\.media-viewer-open\{overflow:hidden\}/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.local-gallery-public/);
});


test("agregar desde el visor no lo cierra automáticamente", () => {
  const start = viewer.indexOf("function addFromViewer");
  const end = viewer.indexOf("async function loadGallery");
  const block = viewer.slice(start, end);
  assert.match(block, /window\.htpwebAddProductUnit\(productId, variantId\)/);
  assert.doesNotMatch(block, /close\(\)/);
  assert.match(block, /En carrito:/);
});

test("el visor se cierra de forma explícita con la X", () => {
  assert.match(viewer, /mediaViewerClose"\)\.onclick = close/);
  assert.doesNotMatch(viewer, /event\.key === "Escape"\) close\(\)/);
  assert.match(viewer, /el CLIENT decide cuándo salir usando la X/);
});


test("cantidad del visor refleja el acumulado real del carrito", () => {
  assert.match(viewer, /Cantidad en carrito/);
  assert.match(viewer, /readonly/);
  assert.match(viewer, /carritoCantidadItem\(negocioActual\.slug, viewerMatcher\(productId\)\)/);
  assert.match(viewer, /En carrito: \${total} ✓/);
  assert.doesNotMatch(viewer, /mediaViewerQty"\)\.value = 1/);
});

test("cambiar variante sincroniza su propia cantidad en carrito", () => {
  assert.match(viewer, /function viewerMatcher\(productId\)/);
  assert.match(viewer, /variant_id: variantId/);
  assert.match(viewer, /function syncVariantPrice\(\)[\s\S]*syncViewerCartQuantity\(\)/);
});


test("visor no reinicia la cantidad visible de la tarjeta", () => {
  const start = viewer.indexOf("function addFromViewer");
  const end = viewer.indexOf("async function loadGallery");
  const block = viewer.slice(start, end);
  assert.doesNotMatch(block, /qtyInput/);
  assert.match(block, /window\.htpwebAddProductUnit\(productId, variantId\)/);
  assert.match(block, /syncViewerCartQuantity\(productId\)/);
});


test("visor incluye controles explícitos para subir y bajar cantidad", () => {
  assert.match(viewer, /id="mediaViewerMinus"/);
  assert.match(viewer, /id="mediaViewerPlus"/);
  assert.match(viewer, /adjustViewerQuantity\(-1\)/);
  assert.match(viewer, /adjustViewerQuantity\(1\)/);
});

test("visor agrega la variante seleccionada de forma explícita", () => {
  assert.match(viewer, /function selectedViewerVariantId\(\)/);
  assert.match(viewer, /const variantId = selectedViewerVariantId\(\)/);
  assert.match(viewer, /window\.htpwebAddProductUnit\(productId, variantId\)/);
  assert.match(viewer, /window\.htpwebChangeProductQuantity\([\s\S]*selectedViewerVariantId\(\)/);
});
