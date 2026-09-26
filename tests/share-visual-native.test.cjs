const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const css=fs.readFileSync('assets/admin.css','utf8');

test('Compartir es un catálogo visual',()=>{
  assert.match(html,/id="shareSearch"/);
  assert.match(html,/id="shareCategoryFilters"/);
  assert.match(html,/id="shareLocalsGrid"/);
  assert.match(html,/id="shareProductsGrid"/);
  assert.match(html,/id="shareProductSearch"/);
  assert.match(css,/\.share-local-grid/);
  assert.match(css,/\.share-product-grid/);
});

test('elimina botones específicos de WhatsApp Facebook y copiar enlace',()=>{
  assert.doesNotMatch(html,/shareLocalWhatsappBtn/);
  assert.doesNotMatch(html,/shareLocalFacebookBtn/);
  assert.doesNotMatch(html,/copyLocalLinkBtn/);
  assert.doesNotMatch(html,/shareProductWhatsappBtn/);
  assert.doesNotMatch(html,/shareProductFacebookBtn/);
  assert.doesNotMatch(html,/copyProductLinkBtn/);
  assert.doesNotMatch(admin,/function shareWhatsApp/);
  assert.doesNotMatch(admin,/function shareFacebook/);
});

test('PIDE AQUÍ aparece como acceso real y en el mensaje compartido',()=>{
  assert.match(html,/>PIDE AQUÍ<\/a>/);
  assert.match(admin,/PIDE AQUÍ 👇/);
  assert.match(admin,/buildSharedLocalUrl/);
  assert.match(admin,/buildSharedProductUrl/);
});

test('genera una imagen vertical para compartir',()=>{
  assert.match(admin,/canvas\.width = 1080/);
  assert.match(admin,/canvas\.height = 1920/);
  assert.match(admin,/image\/jpeg/);
  assert.match(admin,/new File\(\[blob\]/);
  assert.match(admin,/ctx\.fillText\("PIDE AQUÍ"/);
});

test('usa Web Share con archivo cuando el dispositivo lo permite',()=>{
  assert.match(admin,/navigator\.canShare/);
  assert.match(admin,/navigator\.share\(\{/);
  assert.match(admin,/files: \[file\]/);
  assert.match(admin,/text: payload\.text/);
  assert.match(admin,/url: payload\.url/);
});

test('en escritorio conserva imagen y enlace como fallback',()=>{
  assert.match(admin,/downloadShareFile\(file\)/);
  assert.match(admin,/copyShareLink\(kind\)/);
  assert.match(admin,/Imagen preparada y enlace PIDE AQUÍ copiado/);
});

test('usa imágenes reales de LOCAL y producto',()=>{
  assert.match(admin,/banner_url,logo_url,business_category_id/);
  assert.match(admin,/price,image_url,active/);
  assert.match(admin,/product\.image_url \|\| local\.banner_url/);
});


test('usa foto de producto como portada cuando el LOCAL no tiene banner',()=>{
  assert.match(admin,/function shareLocalVisualUrl/);
  assert.match(admin,/first_product_image_url/);
  assert.match(admin,/select\("local_id,image_url,display_order"\)/);
});
