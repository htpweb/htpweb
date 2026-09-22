const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const locals=fs.readFileSync("admin/locales-master.js","utf8");
const bulk=fs.readFileSync("admin/locales-bulk.js","utf8");
const maps=fs.readFileSync("admin/zone-maps.js","utf8");
const importSql=fs.readFileSync("supabase/migrations/20260922005000_local_import_without_google.sql","utf8");

test("LOCAL manual no depende de controles Google",()=>{
  assert.match(locals,/Mapa OpenStreetMap/);
  assert.match(locals,/Latitud \*/);
  assert.match(locals,/Longitud \*/);
  assert.match(locals,/Ubicar coordenadas y detectar zona/);
  assert.doesNotMatch(locals,/id="googlePlaceDetailsBtn"/);
  assert.doesNotMatch(locals,/id="googleMapsDiagnosticBtn"/);
});

test("mapa administrativo no carga scripts de Google",()=>{
  assert.match(maps,/provider:"OPENSTREETMAP"/);
  assert.match(maps,/async function googleAPI\(\)\{ return null; \}/);
  assert.doesNotMatch(maps,/maps\.googleapis\.com/);
  assert.match(maps,/tile\.openstreetmap\.org/);
});

test("carga masiva usa datos completos del Excel",()=>{
  assert.match(bulk,/DIRECCION_REFERENCIA/);
  assert.match(bulk,/LATITUD/);
  assert.match(bulk,/LONGITUD/);
  assert.match(bulk,/CANTONES_DISPONIBLES/);
  assert.match(bulk,/LINK_UBICACION es opcional/);
  assert.match(bulk,/Plantilla validada sin consultar Google Maps/);
});

test("Supabase vuelve a calcular la zona antes de guardar",()=>{
  assert.match(importSql,/master_detect_local_zone/);
  assert.match(importSql,/htp_zone_contains/);
  assert.match(importSql,/master_save_local_import_v1/);
  assert.match(importSql,/location_source/);
  assert.match(importSql,/'IMPORT'/);
  assert.match(importSql,/false,/);
});
