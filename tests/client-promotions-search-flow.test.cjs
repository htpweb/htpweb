const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const index=fs.readFileSync('app/index.html','utf8');
const local=fs.readFileSync('app/local.html','utf8');
const promotions=fs.readFileSync('config/promotions.js','utf8');
const css=fs.readFileSync('assets/app.css','utf8');

test('daily promotions are exposed as a system filter, not a fixed homepage strip',()=>{
  assert.match(index,/__PROMOTIONS__/);
  assert.match(index,/>🔥 Promociones<\/button>/);
  assert.doesNotMatch(index,/id="deliveryPromotionsCard"/);
  assert.doesNotMatch(index,/id="deliveryPromotionsList"/);
});

test('promotion filter shows only locals with promotions today and combines with search',()=>{
  assert.match(index,/promotionCountForLocal\(local\.id\) > 0/);
  assert.match(index,/return textMatch && categoryMatch/);
  assert.match(index,/No hay locales con promociones para hoy/);
});

test('locals advertise today promotions and open promotion tab from filter',()=>{
  assert.match(index,/local-promo-line/);
  assert.match(index,/promo-today-badge/);
  assert.match(index,/promo\$\{promoCount === 1 \? "" : "s"\} hoy/);
  assert.match(index,/promotion:'" \+ promo\.id/);
  assert.match(index,/Ver promociones/);
  assert.match(css,/\.promo-today-badge\{/);
});

test('local keeps menu and promotions tabs and shows promotion count',()=>{
  assert.match(local,/menu-viewer\.js/);
  assert.match(local,/promotions\.js/);
  assert.match(promotions,/visualPromotionsTab/);
  assert.match(promotions,/"PROMOCIONES · " \+ publicPromotions\.length/);
});
