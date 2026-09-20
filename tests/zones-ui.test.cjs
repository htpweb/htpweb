const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const maps=require('../admin/zone-maps.js');
test('point-in-zone: inside, outside, edge and vertex',()=>{
 const ring=[[0,0],[0,2],[2,2],[2,0]];
 assert.equal(maps.contains(ring,1,1),true);assert.equal(maps.contains(ring,3,1),false);
 assert.equal(maps.contains(ring,0,1),true);assert.equal(maps.contains(ring,0,0),true);
 assert.equal(maps.contains(null,0,0),false);
});
test('concave polygon does not accept empty corner',()=>{
 const ring=[[0,0],[0,3],[1,3],[1,1],[3,1],[3,0]];
 assert.equal(maps.contains(ring,2,2),false);assert.equal(maps.contains(ring,2,.5),true);
});
test('one local editor embeds existing schedules/catalog/media',()=>{
 const js=fs.readFileSync('admin/locales-master.js','utf8');
 assert.match(js,/restoreLocalPanels/);assert.match(js,/await loadSchedules/);assert.match(js,/await loadCatalog/);
 assert.match(js,/await loadStorageProducts/);assert.doesNotMatch(js,/p_delivery_ids/);
 assert.match(js,/p_zone_id/);assert.match(js,/data-edit-local/);
});
test('Google has explicit disabled state without key; no scraped data',()=>{
 const js=fs.readFileSync('admin/locales-master.js','utf8');
 assert.match(js,/pendiente de clave autorizada/);assert.match(js,/google_place_id===place.id/);
});
