const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const retired=[
  "admin/analytics.html",
  "admin/analytics-dashboard.js",
  "assets/analytics-dashboard.css",
  "admin/carga-masiva.html",
  "admin/bulk-import.js",
  "admin/package-import.js"
];

test("retired dead-code files do not return",()=>{
  for(const file of retired) assert.equal(fs.existsSync(file),false,file);
});

test("legacy admin compatibility files remain thin shims",()=>{
  for(const file of [
    "admin/locales-master.js",
    "admin/locales-bulk.js",
    "admin/local-page-editor.js",
    "admin/local-subscriptions.js",
    "admin/local-categories-master.js"
  ]){
    const source=fs.readFileSync(file,"utf8");
    assert.match(source,/LEGACY COMPATIBILITY SHIM/);
    assert.ok(source.length<1500,file+" contains real logic again");
  }
});

test("legacy public creation and claim routes remain redirects only",()=>{
  for(const file of ["app/crear-local.html","app/reclamar-local.html"]){
    const source=fs.readFileSync(file,"utf8");
    assert.match(source,/location\.replace/);
    assert.ok(source.length<1200,file+" contains real logic again");
  }
});

test("legacy policy is documented",()=>{
  const source=fs.readFileSync("docs/CODIGO_LEGACY_Y_LIMPIEZA.md","utf8");
  assert.match(source,/NEGOCIO/);
  assert.match(source,/BUSINESS/);
  assert.match(source,/No se debe agregar lógica nueva/);
});
