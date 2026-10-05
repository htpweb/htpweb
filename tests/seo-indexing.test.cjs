const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const generator=fs.readFileSync('scripts/generate-seo.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/seo-index.yml','utf8');
const tienda=fs.readFileSync('app/tienda.html','utf8');
const robots=fs.readFileSync('robots.txt','utf8');
const sitemap=fs.readFileSync('sitemap.xml','utf8');
const consiso=fs.readFileSync('consiso/index.html','utf8');
const home=fs.readFileSync('index.html','utf8');

test('HTPWEB exposes crawl metadata and sitemap',()=>{
  assert.match(home,/meta name="description"/);
  assert.match(home,/meta name="robots" content="index,follow,max-image-preview:large"/);
  assert.match(home,/link rel="canonical" href="https:\/\/htpweb\.github\.io\/htpweb\//);
  assert.match(robots,/User-agent: \*/);
  assert.match(robots,/Sitemap: https:\/\/htpweb\.github\.io\/htpweb\/sitemap\.xml/);
  assert.match(sitemap,/<urlset/);
  assert.match(sitemap,/https:\/\/htpweb\.github\.io\/htpweb\//);
});

test('active LOCAL SEO pages are generated with server-visible metadata',()=>{
  assert.match(consiso,/HTPWEB_AUTO_SEO_LOCAL/);
  assert.match(consiso,/data-local-slug="consiso"/);
  assert.match(consiso,/<title>CONSISO \| Sitio oficial<\/title>/);
  assert.match(consiso,/rel="canonical" href="https:\/\/htpweb\.github\.io\/consiso\//);
  assert.match(consiso,/application\/ld\+json/);
  assert.match(sitemap,/https:\/\/htpweb\.github\.io\/consiso\//);
});

test('storefront accepts generated LOCAL pages without query parameters',()=>{
  assert.match(tienda,/document\.documentElement\.dataset\.localSlug/);
  assert.match(tienda,/document\.documentElement\.dataset\.initialSection/);
  assert.match(tienda,/return parts\[0\]==="htpweb"\?"\/htpweb\/"\:"\/"/);
});

test('SEO generator refreshes active locals and excludes internal test local',()=>{
  assert.match(generator,/rest\/v1\/locals/);
  assert.match(generator,/active=eq\.true/);
  assert.match(generator,/htpweb-local-pruebas/);
  assert.match(generator,/sitemap\.xml/);
  assert.match(generator,/robots\.txt/);
});

test('SEO automation runs hourly and can publish generated pages',()=>{
  assert.match(workflow,/cron: "17 \* \* \* \*"/);
  assert.match(workflow,/permissions:\s*\n\s*contents: write/);
  assert.match(workflow,/node scripts\/generate-seo\.mjs/);
  assert.match(workflow,/git push origin HEAD:main/);
});
