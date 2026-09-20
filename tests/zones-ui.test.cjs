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
test('Google has disabled state, duplicate guard, address autofill and reverse geocoding',()=>{
 const js=fs.readFileSync('admin/locales-master.js','utf8');
 assert.match(js,/pendiente de clave autorizada/);assert.match(js,/google_place_id===place.id/);
 assert.match(js,/addressComponents/);assert.match(js,/formattedAddress/);
 assert.match(js,/includedRegionCodes:\["ec"\]/);assert.match(js,/locationBias/);
 assert.match(js,/importLibrary\("geocoding"\)/);assert.match(js,/reverseGeocodeLocalPoint/);
 assert.match(js,/administrative_area_level_1/);assert.match(js,/administrative_area_level_2/);
 assert.match(js,/nationalPhoneNumber/);assert.match(js,/regularOpeningHours/);
 assert.match(js,/solo sugerencia/);
});
test('menu image import cannot recreate manual DELIVERY-local assignments',()=>{
 const sql=fs.readFileSync('supabase/migrations/20260920013000_zone_safe_menu_import.sql','utf8');
 const admin=fs.readFileSync('admin/admin.js','utf8');
 const html=fs.readFileSync('admin/index.html','utf8');
 assert.match(sql,/master_save_local_v2/);
 assert.doesNotMatch(sql,/insert into public\.local_deliveries/i);
 assert.match(sql,/seleccione una zona/);
 assert.match(admin,/menuLocalZone/);
 assert.match(admin,/zone_id: zoneId/);
 assert.match(html,/cobertura del LOCAL no se asigna aquí: se determina por su zona/);
});
