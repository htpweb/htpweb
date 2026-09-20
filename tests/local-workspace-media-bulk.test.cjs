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
  assert.match(bulk,/master_save_local_v2/);
  assert.match(bulk,/p_active:false/);
});

test("carga masiva reutiliza Google y límites geográficos",()=>{
  assert.match(maps,/return \{contains,create,googleAPI\}/);
  assert.match(bulk,/AutocompleteSuggestion\.fetchAutocompleteSuggestions/);
  assert.match(bulk,/ZoneMaps\.contains/);
  assert.match(bulk,/Posible duplicado/);
});
