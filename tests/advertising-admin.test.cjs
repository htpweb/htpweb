const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const admin = fs.readFileSync("admin/admin.js", "utf8");
const html = fs.readFileSync("admin/index.html", "utf8");

test("Publicidad separa publicación MASTER de solicitud DELIVERY", () => {
  assert.match(admin, /MASTER: \[[^\]]*"advertising"/);
  assert.match(admin, /DELIVERY_ADMIN: \[[^\]]*"advertising"/);
  assert.doesNotMatch(admin, /DELIVERY_OPERATOR: \[[^\]]*"advertising"/);
  assert.doesNotMatch(admin, /LOCAL_ADMIN: \[[^\]]*"advertising"/);
  assert.match(admin, /Solo MASTER puede publicar campañas/);
  assert.match(admin, /submit_advertising_request/);
});

test("ADMIN usa la RPC segura existente save_advertisement", () => {
  assert.match(admin, /rpc\("save_advertisement", args\)/);
  assert.match(admin, /p_scope_type: scope/);
  assert.match(admin, /p_delivery_id: internal \? null : deliveryId/);
  assert.match(admin, /p_local_id: internal \? null : localId/);
  assert.match(admin, /p_product_id: internal \? null : productId/);
});

test("Formulario soporta scopes, banner y cobertura por zonas", () => {
  assert.match(html, /id="section-advertising"/);
  assert.match(html, /id="advertisementScope"/);
  assert.match(html, /id="advertisementImageFile"/);
  assert.match(html, /id="advertisementZones"/);
  assert.match(admin, /\["HTPWEB","DELIVERY","LOCAL","PRODUCT"\]/);
  assert.match(admin, /save_advertisement_commercial/);
  assert.match(admin, /selectedAdvertisingZoneIds/);
});

test("LOCAL y PRODUCTO generan destino sobre el DELIVERY que atiende el local", () => {
  assert.match(admin, /from\("local_deliveries"\)/);
  assert.match(admin, /eq\("local_id",localId\)/);
  assert.match(admin, /url\.searchParams\.set\("delivery",delivery\.slug\)/);
});
