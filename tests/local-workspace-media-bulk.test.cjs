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

test("Locales muestra carga masiva Excel con plantilla validación e importación",()=>{
  assert.match(locals,/masterLocalBulkBtn/);
  assert.match(locals,/Descargar plantilla Excel/);
  assert.match(html,/xlsx\.full\.min\.js/);
  assert.match(bulk,/HTPWEB_Plantilla_Carga_Masiva_Locales\.xlsx/);
  assert.match(bulk,/validateBulkLocalFile/);
  assert.match(bulk,/resolveBulkGooglePlace/);
  assert.match(bulk,/bulkLocalZoneFor/);
  assert.match(bulk,/master_save_local_v3/);
  assert.match(bulk,/p_active:false/);
});

test("carga masiva usa plantilla simple y deriva ubicación y zona",()=>{
  assert.match(bulk,/\["NOMBRE","CATEGORIA","LINK_UBICACION","TELEFONO","WHATSAPP","DESCRIPCION"\]/);
  assert.doesNotMatch(bulk,/const headers=\[[^\]]*"LATITUD"/);
  assert.doesNotMatch(bulk,/const headers=\[[^\]]*"LONGITUD"/);
  assert.doesNotMatch(bulk,/const headers=\[[^\]]*"PROVINCIA"/);
  assert.match(bulk,/CATEGORIAS_DISPONIBLES/);
  assert.match(bulk,/businessCategories/);
  assert.match(bulk,/localAddressPart/);
  assert.match(bulk,/bulkFindCity/);
});

test("carga masiva reutiliza Google y límites geográficos",()=>{
  assert.match(maps,/return \{contains,create,googleAPI\}/);
  assert.match(bulk,/AutocompleteSuggestion\.fetchAutocompleteSuggestions/);
  assert.match(bulk,/ZoneMaps\.contains/);
  assert.match(bulk,/Posible duplicado/);
});


test("carga masiva acepta enlaces cortos de Google Maps mediante Edge Function",()=>{
  const resolver=fs.readFileSync("supabase/functions/resolver-google-maps/index.ts","utf8");
  assert.match(bulk,/isGoogleMapsLink/);
  assert.match(bulk,/resolver-google-maps/);
  assert.match(bulk,/maps\.app\.goo\.gl/);
  assert.match(resolver,/maps\.app\.goo\.gl/);
  assert.match(resolver,/redirect:\s*"follow"/);
  assert.match(resolver,/extractLocation/);
  assert.match(resolver,/query_place_id/);
  assert.match(resolver,/Operación exclusiva de MASTER/);
});

test("diagnóstico Google separa Maps Places y Geocoding",()=>{
  assert.match(locals,/googleMapsDiagnosticBtn/);
  assert.match(locals,/diagnoseGoogleMaps/);
  assert.match(locals,/importLibrary\("places"\)/);
  assert.match(locals,/importLibrary\("geocoding"\)/);
  assert.match(locals,/REQUEST_DENIED/);
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
