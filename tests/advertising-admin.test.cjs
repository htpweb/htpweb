const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const admin = fs.readFileSync("admin/admin.js", "utf8");
const html = fs.readFileSync("admin/index.html", "utf8");

test("Publicidad está disponible solo para roles administrativos autorizados", () => {
  assert.match(admin, /MASTER: \[[^\]]*"advertising"/);
  assert.match(admin, /DELIVERY_ADMIN: \[[^\]]*"advertising"/);
  assert.match(admin, /LOCAL_ADMIN: \[[^\]]*"advertising"/);
  assert.doesNotMatch(admin, /DELIVERY_OPERATOR: \[[^\]]*"advertising"/);
});

test("ADMIN usa la RPC segura existente save_advertisement", () => {
  assert.match(admin, /rpc\("save_advertisement", args\)/);
  assert.match(admin, /p_scope_type: scope/);
  assert.match(admin, /p_delivery_id: deliveryId/);
  assert.match(admin, /p_local_id: localId/);
  assert.match(admin, /p_product_id: productId/);
});

test("Formulario soporta scopes y banner", () => {
  assert.match(html, /id="section-advertising"/);
  assert.match(html, /id="advertisementScope"/);
  assert.match(html, /id="advertisementImageFile"/);
  assert.match(admin, /\["HTPWEB","DELIVERY","LOCAL","PRODUCT"\]/);
  assert.match(admin, /advertising\/delivery/);
  assert.match(admin, /advertising\/local/);
  assert.match(admin, /advertising\/product/);
});

test("LOCAL y PRODUCTO preservan el DELIVERY", () => {
  assert.match(admin, /from\("local_deliveries"\)/);
  assert.match(admin, /\.eq\("delivery_id", deliveryId\)/);
  assert.match(admin, /base\.searchParams\.set\("delivery", delivery\.slug\)/);
});
