const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const index=fs.readFileSync('app/index.html','utf8');
const css=fs.readFileSync('assets/app.css','utf8');

test('promotions sit below categories in a compact strip',()=>{
  assert.ok(index.indexOf('id="categories"') < index.indexOf('id="deliveryPromotionsCard"'));
  assert.match(index,/class="promo-strip"/);
  assert.match(css,/.promo-strip{[sS]*overflow-x:auto/);
  assert.match(css,/.promo-strip-card{[sS]*flex:0 0 250px/);
});

test('promotions hide while user searches',()=>{
  assert.match(index,/function syncSearchMode/);
  assert.match(index,/deliveryPromotionsCard").classList.toggle("hidden", searching)/);
  assert.match(index,/syncSearchMode()/);
});
