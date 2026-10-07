const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../assets/restaurant-menu.js');
test('original menu sheets and repeated images never become dish highlights',()=>{
 const products=[{id:'a',image_url:'https://example.com/menu.jpg?a=1'},{id:'b',image_url:'https://example.com/shared.jpg'},{id:'c',image_url:'https://example.com/shared.jpg?v=2'},{id:'d',image_url:'https://example.com/dish.jpg'},{id:'e',image_url:'javascript:alert(1)'}];
 assert.deepEqual(api.trustedProductPhotos(products,[{image_url:'https://example.com/menu.jpg'}]).map(p=>p.id),['d']);
});
test('every product remains visible exactly once in its category or Otros',()=>{
 const products=[{id:'a',category_id:'one'},{id:'b',category_id:null},{id:'c',category_id:'stale'}];
 const groups=api.groupProducts(products,[{id:'one',name:'Hamburguesas'}]);
 assert.deepEqual(groups.flatMap(g=>g.items).map(p=>p.id),['a','b','c']);
 assert.equal(groups[1].name,'Otros');
});
test('category names are recovered from existing menu page mappings',()=>{
 const cats=api.menuCategories([{id:'a',name:'Bebidas'}],[{categories:[{id:'a',name:'Duplicate'},{id:'b',name:'Combos'}]}]);
 assert.deepEqual(cats,[{id:'a',name:'Bebidas'},{id:'b',name:'Combos'}]);
});
test('subtotal uses the exact variant price and quantities rather than the base price',()=>{
 const products=[{id:'a',local_id:'local',price:3}];
 assert.equal(api.subtotal([{local_id:'local',product_id:'a',variant_id:'large',quantity:2},{local_id:'local',product_id:'a',quantity:1}],products,[{id:'large',product_id:'a',price:5}]),13);
});
