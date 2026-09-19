const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = p => fs.readFileSync(p, "utf8");

test("motor de publicidad usa DELIVERY y conserva deep links", () => {
  const js = read("config/ads.js");
  assert.match(js, /from\("advertisements"\)/);
  assert.match(js, /eq\("delivery_id", delivery\.id\)/);
  assert.match(js, /urlDelivery\("local\.html", params\)/);
  assert.match(js, /ROTATE_MS = 5000/);
});

test("banner aparece en las pantallas principales del CLIENT", () => {
  for (const file of ["app/index.html", "app/local.html", "app/carrito.html", "app/pedidos.html"]) {
    assert.match(read(file), /config\/ads\.js/, file);
  }
});

test("banner es persistente y deja espacio al contenido", () => {
  const css = read("assets/app.css");
  assert.match(css, /\.htpweb-ad-banner\{position:fixed/);
  assert.match(css, /bottom:0/);
  assert.match(css, /body\.has-htpweb-ad\{padding-bottom:/);
  assert.match(css, /animation:htpwebAdProgress 5s linear forwards/);
});
