const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("admin/index.html", "utf8");
const js = fs.readFileSync("admin/admin.js", "utf8");

test("MASTER dispone de selector de carpeta Branding", () => {
  assert.match(html, /id="masterBrandingFolderCard"/);
  assert.match(html, /id="selectBrandingFolderBtn"/);
  assert.match(html, /id="brandingFolderInput"[^>]*webkitdirectory/);
  assert.match(html, /Cargar banners y logos/);
});

test("importador de branding es exclusivo de MASTER y empareja carpetas", () => {
  assert.match(js, /state\.role !== "MASTER"/);
  assert.match(js, /function brandingNormalizeName/);
  assert.match(js, /function matchBrandingLocal/);
  assert.match(js, /function buildBrandingImportPlan/);
  assert.match(js, /brandingFolderInput"\)\.onchange/);
});

test("branding sube a rutas estables y actualiza LOCAL por RPC", () => {
  assert.match(js, /mediaPathLocal\(local\.id, "logo"\)/);
  assert.match(js, /mediaPathLocal\(local\.id, "banner"\)/);
  assert.match(js, /subirImagenHTPWEB/);
  assert.match(js, /rpc\("update_my_local_content"/);
  assert.match(js, /p_banner_url: nextBanner/);
  assert.match(js, /p_logo_url: nextLogo/);
});
