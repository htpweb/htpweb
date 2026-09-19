const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const admin = fs.readFileSync("admin/admin.js", "utf8");
const html = fs.readFileSync("admin/index.html", "utf8");
const imports = fs.readFileSync("config/imports.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260919153500_menu_image_import.sql", "utf8");
const edge = fs.readFileSync("supabase/functions/analizar-menu/index.ts", "utf8");
const config = fs.readFileSync("supabase/config.toml", "utf8");

test("Importar menú es exclusivo de MASTER en el ADMIN", () => {
  assert.match(admin, /MASTER: \[[^\]]*"menuimport"/);
  assert.doesNotMatch(admin, /DELIVERY_ADMIN: \[[^\]]*"menuimport"/);
  assert.doesNotMatch(admin, /LOCAL_ADMIN: \[[^\]]*"menuimport"/);
  assert.match(html, /id="section-menuimport"/);
});

test("las imágenes se suben al bucket privado y se limitan a cinco", () => {
  assert.match(imports, /HTPWEB_IMPORT_BUCKET = "htpweb-imports"/);
  assert.match(imports, /HTPWEB_MENU_MAX_IMAGES = 5/);
  assert.match(imports, /10 \* 1024 \* 1024/);
  assert.match(imports, /delivery\/\$\{deliveryId\}\/\$\{batchId\}/);
});

test("backend agrega MENU_IMAGE sin habilitar create_bulk_import_job para DELIVERY_ADMIN", () => {
  assert.match(migration, /'MENU_IMAGE'/);
  assert.match(migration, /master_create_menu_image_job/);
  assert.match(migration, /operación exclusiva de MASTER/);
  assert.match(migration, /import_type <> 'MENU_IMAGE'/);
  assert.match(migration, /between 1 and 5|entre 1 y 5/);
});

test("aplicación del preview es transaccional y no depende del navegador para writes directos", () => {
  assert.match(migration, /create or replace function public\.master_apply_menu_import/);
  assert.match(migration, /public\.save_local_category/);
  assert.match(migration, /public\.save_local_product/);
  assert.match(migration, /public\.save_product_variant/);
  assert.match(migration, /status = 'APPLIED'/);
  assert.match(admin, /rpc\("master_apply_menu_import"/);
});

test("analizar-menu requiere MASTER y usa Structured Outputs", () => {
  assert.match(edge, /role\?\.code !== "MASTER"/);
  assert.match(edge, /openai\.responses\.create/);
  assert.match(edge, /type: "json_schema"/);
  assert.match(edge, /strict: true/);
  assert.match(edge, /store: false/);
  assert.match(edge, /status: "PREVIEW_READY"/);
  assert.doesNotMatch(edge, /master_apply_menu_import/);
});

test("Supabase registra verificar JWT para analizar-menu", () => {
  assert.match(config, /\[functions\.analizar-menu\][\s\S]*verify_jwt = true/);
});
