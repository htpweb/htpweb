const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const ads=fs.readFileSync('config/ads.js','utf8');
const css=fs.readFileSync('assets/app.css','utf8');
const index=fs.readFileSync('app/index.html','utf8');

test('client home advertising uses inline horizontal carousel',()=>{
  assert.match(ads,/client_home_carousel/);
  assert.match(ads,/client-ad-rail/);
  assert.match(ads,/scrollTo\(\{ left:/);
  assert.match(ads,/setInterval\(rotate, ROTATE_MS\)/);
  assert.match(css,/\.client-ad-rail\{[\s\S]*overflow-x:auto/);
  assert.match(css,/\.client-ad-card\{[\s\S]*scroll-snap-align:start/);
});

test('advertising is limited to client home and old fixed banner is disabled',()=>{
  assert.match(ads,/function isClientHome/);
  assert.match(ads,/if \(!isClientHome\(\)\) return/);
  assert.match(css,/\.htpweb-ad-banner\{[\s\S]*display:none!important/);
  assert.match(index,/ads\.js\?v=20261002-ads1/);
});

test('advertisements are visibly marked as advertising',()=>{
  assert.match(ads,/PUBLICIDAD/);
  assert.match(ads,/Locales patrocinados/);
});
