const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('app/index.html','utf8');
const css=fs.readFileSync('assets/app.css','utf8');
const ads=fs.readFileSync('config/ads.js','utf8');

test('mobile CLIENT header keeps compact actions and cart on the right',()=>{
  assert.match(html,/mobile-header-action/);
  assert.match(html,/id="ordersLink"[\s\S]*id="authLink"[\s\S]*id="cartLink"/);
  assert.match(css,/@media\(max-width:760px\)[\s\S]*\.header-actions\{[\s\S]*flex-wrap:nowrap/);
  assert.match(css,/#cartLink\{[\s\S]*min-width:48px/);
});

test('mobile search and categories remain sticky while browsing',()=>{
  assert.match(html,/id="clientSearchShell"/);
  assert.match(html,/id="clientCategoriesShell"/);
  assert.match(css,/\.client-search-shell\{[\s\S]*position:sticky[\s\S]*top:60px/);
  assert.match(css,/\.client-categories-shell\{[\s\S]*position:sticky[\s\S]*top:120px/);
});

test('mobile category filtering prioritizes local results over advertising',()=>{
  assert.match(html,/function updateMobileFilterLayout/);
  assert.match(html,/localsSection\.insertAdjacentElement\("afterend", adSection\)/);
  assert.match(html,/focusFilteredResults/);
  assert.match(ads,/mobileFilterActive/);
  assert.match(ads,/localsSection\.insertAdjacentElement\("afterend", section\)/);
});
