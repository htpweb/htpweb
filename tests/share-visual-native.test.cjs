const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const css=fs.readFileSync('assets/admin.css','utf8');

test('Compartir muestra solo LOCAL y no productos',()=>{
  assert.match(html,/LOCAL disponibles/);
  assert.match(html,/id="shareLocalsGrid"/);
  assert.doesNotMatch(html,/id="shareProductsGrid"/);
  assert.doesNotMatch(html,/Productos del LOCAL/);
});

test('al entrar a un LOCAL abre su Galería real',()=>{
  assert.match(html,/id="shareGalleryView"/);
  assert.match(html,/Galería del LOCAL/);
  assert.match(admin,/delivery_share_local_gallery/);
  assert.match(admin,/openShareLocalGallery/);
  assert.match(admin,/renderShareGallery/);
});

test('cada foto se comparte sin generar una pieza nueva',()=>{
  assert.match(admin,/data-share-gallery-image/);
  assert.match(admin,/shareOriginalGalleryImage/);
  assert.match(admin,/galleryImageFile/);
  assert.match(admin,/navigator\.share\(\{files:\[file\]\}\)/);
  assert.doesNotMatch(admin,/drawShareArtwork/);
});

test('cada foto permite copiar PIDE AQUÍ del LOCAL',()=>{
  assert.match(html,/id="shareCopyLocalLinkBtn"/);
  assert.match(admin,/data-share-gallery-copy/);
  assert.match(admin,/function copyShareLocalOrderLink/);
  assert.match(admin,/PIDE AQUÍ \| /);
  assert.match(admin,/buildShortSharedLocalUrl/);
  assert.match(admin,/\.\.\/p\//);
});

test('la portada del LOCAL prioriza su propia Galería',()=>{
  assert.match(admin,/first_gallery_image_url \|\| local\?\.banner_url/);
});

test('Galería tiene diseño visual propio',()=>{
  assert.match(css,/\.share-gallery-grid/);
  assert.match(css,/\.share-gallery-card/);
  assert.match(css,/object-fit:contain/);
});


test('enlace corto elimina UUID y destaca el DELIVERY',()=>{
  assert.match(admin,/function buildShortSharedLocalUrl/);
  assert.match(admin,/local\?\.share_code/);
  assert.match(admin,/PIDE AQUÍ \| /);
  assert.match(admin,/delivery\.name/);
  assert.match(admin,/\.\.\/p\//);
});

test('resolver corto abre el LOCAL real',()=>{
  const page=fs.readFileSync('p/index.html','utf8');
  const edge=fs.readFileSync('supabase/functions/share-resolve/index.ts','utf8');
  assert.match(page,/location\.hash/);
  assert.match(page,/share-resolve\?s=/);
  assert.match(edge,/share_code/);
  assert.match(edge,/Response\.redirect\(target\.toString\(\),302\)/);
});

test('preview de chat resalta PIDE AQUÍ y el DELIVERY',()=>{
  const edge=fs.readFileSync('supabase/functions/share-preview/index.ts','utf8');
  assert.match(edge,/const title = `PIDE AQUÍ \| \$\{delivery\.name\}`/);
  assert.match(edge,/og:title/);
});


test('WEBP se convierte a JPG al compartir para WhatsApp',()=>{
  assert.match(admin,/function imageBlobToJpeg/);
  assert.match(admin,/canvas\.toBlob/);
  assert.match(admin,/"image\/jpeg"/);
  assert.match(admin,/\.jpg"/);
});

test('enlace corto usa query estable y conserva hash antiguo como compatibilidad',()=>{
  const page=fs.readFileSync('p/index.html','utf8');
  assert.match(admin,/\.\.\/p\//);
  assert.match(page,/params\.get\("s"\)/);
  assert.match(page,/location\.hash/);
});
