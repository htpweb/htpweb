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
  assert.match(admin,/PIDE AQUÍ 👇/);
  assert.match(admin,/buildSharedLocalUrl/);
});

test('la portada del LOCAL prioriza su propia Galería',()=>{
  assert.match(admin,/first_gallery_image_url \|\| local\?\.banner_url/);
});

test('Galería tiene diseño visual propio',()=>{
  assert.match(css,/\.share-gallery-grid/);
  assert.match(css,/\.share-gallery-card/);
  assert.match(css,/object-fit:contain/);
});
