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

test('usa Web Share priorizando el archivo de imagen',()=>{
  assert.match(admin,/navigator\.canShare/);
  assert.match(admin,/navigator\.share\(\{/);
  assert.match(admin,/files:\[prepared\.file\]/);
  assert.doesNotMatch(admin,/text: payload\.text/);
  const start=admin.indexOf('async function nativeShare');
  const end=admin.indexOf('async function loadLocalProfile',start);
  const block=admin.slice(start,end);
  assert.doesNotMatch(block,/url: payload\.url/);
  assert.doesNotMatch(block,/navigator\.share\(\{[\s\S]*url:/);
});

test('si el navegador no comparte archivos no degrada a solo link',()=>{
  const start=admin.indexOf('async function nativeShare');
  const end=admin.indexOf('async function loadLocalProfile',start);
  const block=admin.slice(start,end);
  assert.match(block,/await downloadShareImage\(kind\)/);
  assert.match(block,/no permite enviar archivos de imagen/);
  assert.doesNotMatch(block,/copyShareLink\(kind\)/);
});

test('usa imágenes reales de LOCAL y producto',()=>{
  assert.match(admin,/banner_url,logo_url,business_category_id/);
  assert.match(admin,/price,image_url,active/);
  assert.match(admin,/product\.image_url \|\| shareLocalVisualUrl\(local\)/);
});


test('usa foto de producto como portada cuando el LOCAL no tiene banner',()=>{
  assert.match(admin,/function shareLocalVisualUrl/);
  assert.match(admin,/first_product_image_url/);
  assert.match(admin,/select\("local_id,image_url,display_order"\)/);
});


test('Compartir abre un modal fijo sin desplazar la página',()=>{
  assert.match(html,/id="shareArtworkPreviewCard" class="share-modal hidden"/);
  assert.match(html,/id="shareModalCloseBtn"/);
  assert.match(css,/\.share-modal\{position:fixed/);
  assert.match(admin,/function closeShareOptions/);
  const start=admin.indexOf('async function openShareOptions');
  const end=admin.indexOf('async function browserShare',start);
  const block=admin.slice(start,end);
  assert.doesNotMatch(block,/scrollIntoView/);
});

test('WhatsApp chat usa el enlace enriquecido del producto o LOCAL',()=>{
  assert.match(admin,/function buildSharePreviewUrl/);
  assert.match(admin,/functions\/v1\/share-preview/);
  const start=admin.indexOf('async function browserShare');
  const end=admin.indexOf('async function nativeShare',start);
  const block=admin.slice(start,end);
  assert.match(block,/whatsapp:\/\/send\?text=/);
  assert.match(block,/payload\.url/);
  assert.match(block,/Para Estado usa el flujo principal/);
});


test('share-preview publica metadatos Open Graph para previews sociales',()=>{
  const edge=fs.readFileSync('supabase/functions/share-preview/index.ts','utf8');
  assert.match(edge,/og:title/);
  assert.match(edge,/og:description/);
  assert.match(edge,/og:image/);
  assert.match(edge,/og:url/);
  assert.match(edge,/twitter:card/);
  assert.match(edge,/setTimeout\(function\(\)\{ location\.replace/);
});


test('Preparar Estado usa imagen y enlace directo al LOCAL o producto',()=>{
  assert.match(html,/Preparar Estado/);
  assert.match(html,/id="shareStatusText"/);
  assert.match(html,/id="shareOpenWhatsappBtn"/);
  assert.match(admin,/function shareStatusText/);
  const start=admin.indexOf('function shareStatusText');
  const end=admin.indexOf('async function copyShareText',start);
  const block=admin.slice(start,end);
  assert.match(block,/payload\.targetUrl\|\|payload\.url/);
  assert.match(block,/PIDE AQUÍ/);
});

test('Preparar Estado no obliga a compartir por chat',()=>{
  assert.match(html,/Estado listo para publicar/);
  assert.match(html,/Abrir WhatsApp → Novedades\/Estado → Mi estado/);
  assert.match(admin,/function openWhatsappForStatus/);
  assert.match(admin,/whatsapp:\/\//);
});
