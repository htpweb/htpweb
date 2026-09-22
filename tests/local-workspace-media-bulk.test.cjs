const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const admin=fs.readFileSync("admin/admin.js","utf8");
const html=fs.readFileSync("admin/index.html","utf8");
const locals=fs.readFileSync("admin/locales-master.js","utf8");
const bulk=fs.readFileSync("admin/locales-bulk.js","utf8");
const maps=fs.readFileSync("admin/zone-maps.js","utf8");
const storage=fs.readFileSync("config/storage.js","utf8");
const gallerySql=fs.readFileSync("supabase/migrations/20260920040000_local_gallery.sql","utf8");
const localGoogleUniqueSql=fs.readFileSync("supabase/migrations/20260920171000_local_google_place_unique.sql","utf8");

test("MASTER no muestra Storage como módulo independiente",()=>{
  const match=admin.match(/MASTER:\s*\[([^\]]+)\]/);
  assert.ok(match);
  assert.doesNotMatch(match[1],/"storage"/);
  assert.match(admin,/DELIVERY_ADMIN:[^\n]*"storage"/);
  assert.match(admin,/LOCAL_ADMIN:[^\n]*"storage"/);
});

test("Imágenes del LOCAL contiene logo banner y galería, no producto",()=>{
  assert.match(html,/localLogoPreview/);
  assert.match(html,/localBannerPreview/);
  assert.match(html,/Galería del LOCAL/);
  assert.match(html,/localGalleryFiles/);
  assert.match(locals,/tab==="images"\?\[\$\("storageLocalCard"\)\]/);
  assert.doesNotMatch(locals,/tab==="images"\?\[\$\("storageLocalCard"\),\$\("storageProductCard"\)\]/);
});

test("producto administra su imagen dentro del propio formulario",()=>{
  assert.match(html,/catalogProductImageFile/);
  assert.match(html,/catalogProductImagePreview/);
  assert.match(admin,/deleteCatalogProductImage/);
  assert.match(admin,/subirImagenHTPWEB\(mediaPathProduct\(savedId\), imageFile\)/);
  assert.doesNotMatch(html,/id="productGoStorageBtn"/);
  assert.doesNotMatch(admin,/\$\("productGoStorageBtn"\)\.onclick/);
});

test("galería usa Supabase Storage y RPC seguro",()=>{
  assert.match(storage,/mediaPathLocalGallery/);
  assert.match(admin,/uploadLocalGallery/);
  assert.match(admin,/subirImagenHTPWEB\(path, file\)/);
  assert.match(gallerySql,/create table if not exists public\.local_gallery_images/);
  assert.match(gallerySql,/save_local_gallery_image/);
  assert.match(gallerySql,/delete_local_gallery_image/);
  assert.match(gallerySql,/can_manage_local_gallery/);
});

test("Locales muestra carga masiva Excel completa sin depender de Google",()=>{
  assert.match(locals,/masterLocalBulkBtn/);
  assert.match(locals,/Descargar plantilla completa de locales/);
  assert.match(html,/xlsx\.full\.min\.js/);
  assert.match(bulk,/HTPWEB_Plantilla_Carga_Masiva_Locales\.xlsx/);
  assert.match(bulk,/validateBulkLocalFile/);
  assert.match(bulk,/bulkLocalZoneFor/);
  assert.match(bulk,/master_save_local_import_v1/);
  assert.match(bulk,/importados como borrador sin consultar Google Maps/);
});

test("plantilla nueva contiene todos los campos necesarios para ubicación",()=>{
  assert.match(bulk,/"NOMBRE","PROVINCIA","CANTON","CATEGORIA","DIRECCION_REFERENCIA"/);
  assert.match(bulk,/"LATITUD","LONGITUD","TELEFONO","WHATSAPP","DESCRIPCION","LINK_UBICACION"/);
  assert.match(bulk,/CATEGORIAS_DISPONIBLES/);
  assert.match(bulk,/CANTONES_DISPONIBLES/);
  assert.match(bulk,/ZONAS_REFERENCIA/);
  assert.match(bulk,/LINK_UBICACION es opcional/);
  assert.match(bulk,/LATITUD y LONGITUD determinan automáticamente la zona/);
});

test("carga masiva valida coordenadas y zona sin consultar Google",()=>{
  assert.match(maps,/provider:"OPENSTREETMAP"/);
  assert.match(maps,/async function googleAPI\(\)\{ return null; \}/);
  assert.match(bulk,/ZoneMaps\.contains/);
  assert.match(bulk,/result\.source="IMPORT"/);
  assert.match(bulk,/Plantilla validada sin consultar Google Maps/);
  assert.match(bulk,/normalizeBulkImportPhone/);
  assert.match(bulk,/Posible duplicado/);
});

test("carga masiva detecta duplicados internos y permite descargar observaciones",()=>{
  assert.match(locals,/downloadBulkLocalErrorsBtn/);
  assert.match(bulk,/downloadBulkLocalErrors/);
  assert.match(bulk,/HTPWEB_Observaciones_Carga_Masiva_Locales\.xlsx/);
  assert.match(bulk,/seenNameCity=new Map\(\)/);
  assert.match(bulk,/Duplicado dentro del archivo/);
  assert.match(bulk,/ZONA_DETECTADA/);
  assert.match(bulk,/ERROR:r\.error/);
});

test("Supabase asigna autoritativamente la zona por coordenadas",()=>{
  const importSql=fs.readFileSync("supabase/migrations/20260922005000_local_import_without_google.sql","utf8");
  assert.match(importSql,/master_detect_local_zone/);
  assert.match(importSql,/htp_zone_contains/);
  assert.match(importSql,/master_save_local_import_v1/);
  assert.match(importSql,/'IMPORT'/);
  assert.match(importSql,/las coordenadas no pertenecen a ninguna zona activa dibujada/);
});

test("PostgreSQL refuerza la unicidad de Google Place ID",()=>{
  assert.match(localGoogleUniqueSql,/locals_google_place_id_uidx/);
  assert.match(localGoogleUniqueSql,/create unique index if not exists/);
  assert.match(localGoogleUniqueSql,/google_place_id is not null/);
  assert.match(localGoogleUniqueSql,/having count\(\*\)>1/);
});

test("ficha LOCAL usa OpenStreetMap y no muestra controles Google",()=>{
  assert.match(locals,/Mapa OpenStreetMap/);
  assert.match(locals,/OpenStreetMap activo/);
  assert.doesNotMatch(locals,/id="googleMapsDiagnosticBtn"/);
  assert.doesNotMatch(locals,/id="googlePlaceDetailsBtn"/);
  assert.doesNotMatch(maps,/maps\.googleapis\.com/);
  assert.doesNotMatch(maps,/mapId:"DEMO_MAP_ID"/);
});

test("funciones Supabase se despliegan al cambiar main",()=>{
  const workflow=fs.readFileSync(".github/workflows/supabase-deploy.yml","utf8");
  const config=fs.readFileSync("supabase/config.toml","utf8");
  assert.match(workflow,/supabase\/functions\/\*\*/);
  assert.match(workflow,/github\.event_name == 'push'/);
  assert.match(workflow,/supabase functions deploy/);
  assert.match(config,/\[functions\.resolver-google-maps\]/);
  assert.match(config,/verify_jwt = true/);
});
