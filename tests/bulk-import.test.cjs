const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const html=fs.readFileSync("admin/index.html","utf8");
const js=fs.readFileSync("admin/negocios-bulk.js","utf8");
const sql=fs.readFileSync("supabase/migrations/20260919195500_bulk_catalog_import.sql","utf8");

test("canonical bulk import accepts CSV and XLSX",()=>{
  assert.match(html,/xlsx\.full\.min\.js/);
  assert.match(js,/Formato no permitido\. Usa CSV o XLSX/);
  assert.match(js,/XLSX\.read/);
});

test("canonical bulk import validates prices and status before writing",()=>{
  assert.match(js,/PRECIO inv/);
  assert.match(js,/ACTIVO debe ser/);
  assert.match(js,/normalizeBulkProductRows/);
});

test("canonical bulk import uses BUSINESS RPCs",()=>{
  assert.match(js,/bulk_import_business_catalog_v3/);
  assert.match(js,/master_save_business_import_v1/);
  assert.match(sql,/save_local_category/); // historical implementation remains preserved
  assert.match(sql,/save_local_product/);
});

test("retired standalone bulk import files stay deleted",()=>{
  for(const file of ["admin/carga-masiva.html","admin/bulk-import.js","admin/package-import.js"]){
    assert.equal(fs.existsSync(file),false,file);
  }
});
