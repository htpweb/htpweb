const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=rel=>fs.readFileSync(path.join(root,rel),"utf8");

test("clean LOCAL URLs never receive the corporate HTPWEB header",()=>{
  const auth=read("config/auth.js");
  assert.match(auth,/dataset\?\.localSlug/);
  assert.match(auth,/classList\?\.contains\("local-store"\)/);
  assert.match(auth,/if \(_htpwebIsBrandedPublicShell\(\)\) return false/);
});

test("LOCAL Tienda virtual is the catalog section and uses premium product cards",()=>{
  const html=read("app/tienda.html");
  assert.match(html,/shop:\["catalogSection"\]/);
  assert.match(html,/premium-product-grid/);
  assert.match(html,/catalog-product-card/);
  assert.match(html,/catalog-add-btn/);
  assert.match(html,/productComparePrice|compare_price/);
});

test("LOCAL template keeps its own branded header",()=>{
  const html=read("app/tienda.html");
  assert.match(html,/class="local-store-header"/);
  assert.match(html,/id="brandName"/);
  assert.doesNotMatch(html,/class="htp-auth-header"/);
});


test("LOCAL resolves the visible section before remote storefront loading",()=>{
  const html=read("app/tienda.html");
  const resolveIndex=html.indexOf("pageSection=sectionFromLocation();");
  const initIndex=html.indexOf("async function init()");
  assert.ok(resolveIndex>0&&resolveIndex<initIndex);
  assert.match(html,/body\.local-store:not\(\[data-page-section\]\).*visibility:hidden/);
  assert.match(html,/history\.scrollRestoration="manual"/);
});

test("LOCAL clean route parser supports GitHub Pages base path",()=>{
  const html=read("app/tienda.html");
  assert.match(html,/rest\[0\]==="htpweb"\?\(rest\[2\]\|\|""\):\(rest\[1\]\|\|""\)/);
});
