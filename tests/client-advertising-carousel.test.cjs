const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const ads=fs.readFileSync('config/ads.js','utf8');
const css=fs.readFileSync('assets/app.css','utf8');
const index=fs.readFileSync('app/index.html','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');

test('client home advertising uses continuous infinite horizontal carousel',()=>{
  assert.match(ads,/client_home_carousel/);
  assert.match(ads,/client-ad-rail/);
  assert.match(ads,/\[0, 1, 2\][\s\S]*flatMap/);
  assert.match(ads,/requestAnimationFrame\(step\)/);
  assert.match(ads,/SCROLL_PX_PER_SECOND/);
  assert.match(ads,/normalizeLoopPosition/);
  assert.doesNotMatch(ads,/setInterval\(rotate/);
  assert.match(css,/\.client-ad-rail\{[\s\S]*overflow-x:auto[\s\S]*scroll-snap-type:none/);
  assert.match(css,/\.client-ad-card\{[\s\S]*scroll-snap-align:none/);
  assert.match(index,/ads\.js\?v=20261002-continuous3/);
});

test('advertising is limited to client home and old fixed banner is disabled',()=>{
  assert.match(ads,/function isClientHome/);
  assert.match(ads,/if \(!isClientHome\(\)\) return/);
  assert.match(css,/\.htpweb-ad-banner\{[\s\S]*display:none!important/);
  assert.match(index,/ads\.js\?v=20261002-continuous3/);
});

test('client requests ads by delivery coverage zones and sends valid impression key',()=>{
  assert.match(ads,/public_delivery_advertisements/);
  assert.match(ads,/p_delivery_id: delivery\.id/);
  assert.match(ads,/HTPWEB_AD_VISITOR_V1/);
  assert.match(ads,/metadata\.impression_key/);
});

test('advertisements remain visibly marked as sponsored',()=>{
  assert.match(ads,/PUBLICIDAD/);
  assert.match(ads,/Locales patrocinados/);
});

test('MASTER controls campaign splits and zone targeting',()=>{
  assert.match(adminHtml,/id="advertisingHtpwebPct"/);
  assert.match(adminHtml,/id="advertisingOriginPct"/);
  assert.match(adminHtml,/id="advertisingTrafficPct"/);
  assert.match(adminHtml,/id="advertisementZones"/);
  assert.match(admin,/save_advertising_split/);
  assert.match(admin,/save_advertisement_commercial/);
  assert.match(admin,/selectedAdvertisingZoneIds/);
});

test('DELIVERY can request advertising and see traffic dividend statistics',()=>{
  assert.match(adminHtml,/id="submitAdvertisingRequestBtn"/);
  assert.match(adminHtml,/id="advertisingDeliveryStats"/);
  assert.match(adminHtml,/50 \/ 309 impresiones/);
  assert.match(admin,/submit_advertising_request/);
  assert.match(admin,/advertising_delivery_stats/);
  assert.match(admin,/delivery_impressions/);
  assert.match(admin,/traffic_commission/);
  assert.match(admin,/origin_commission/);
});
