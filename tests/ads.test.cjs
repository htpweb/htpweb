const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = p => fs.readFileSync(p, "utf8");

test("motor de publicidad usa cobertura del DELIVERY y conserva deep links", () => {
  const js = read("config/ads.js");
  assert.match(js, /rpc\("public_delivery_advertisements"/);
  assert.match(js, /p_delivery_id:\s*delivery\.id/);
  assert.match(js, /urlDelivery\("local\.html", params\)/);
  assert.match(js, /SCROLL_PX_PER_SECOND = 130/);
});

test("publicidad se renderiza solo en el inicio del CLIENT", () => {
  const js = read("config/ads.js");
  const index = read("app/index.html");
  assert.match(js, /function isClientHome\(\)/);
  assert.match(js, /if \(!isClientHome\(\)\) return/);
  assert.match(index, /config\/ads\.js/);
});

test("carrusel reemplaza el banner fijo anterior y recorre en bucle continuo", () => {
  const css = read("assets/app.css");
  const js = read("config/ads.js");
  assert.match(css, /\.client-ad-rail\{[\s\S]*overflow-x:auto[\s\S]*scroll-snap-type:none/);
  assert.match(css, /\.client-ad-card\{[\s\S]*scroll-snap-align:none/);
  assert.match(css, /\.htpweb-ad-banner\{[\s\S]*display:none!important/);
  assert.match(js, /requestAnimationFrame\(step\)/);
  assert.match(js, /normalizeLoopPosition/);
});
