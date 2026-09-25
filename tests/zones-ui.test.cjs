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
test('one local editor embeds schedules catalog and local-only media',()=>{
 const js=fs.readFileSync('admin/locales-master.js','utf8');
 assert.match(js,/restoreLocalPanels/);assert.match(js,/await loadSchedules/);assert.match(js,/await loadCatalog/);
 assert.match(js,/await refreshLocalMediaPreview/);assert.match(js,/await refreshLocalGallery/);
 assert.doesNotMatch(js,/tab==="images"\?\[\$\("storageLocalCard"\),\$\("storageProductCard"\)\]/);
 assert.doesNotMatch(js,/p_delivery_ids/);
 assert.match(js,/p_zone_id/);assert.match(js,/data-edit-local/);
});
test('OpenStreetMap is primary and zone is derived from coordinates',()=>{
 const js=fs.readFileSync('admin/locales-master.js','utf8');
 const mapJs=fs.readFileSync('admin/zone-maps.js','utf8');
 const sql=fs.readFileSync('supabase/migrations/20260922005000_local_import_without_google.sql','utf8');
 assert.match(js,/OpenStreetMap activo/);assert.match(js,/detectLocalZone/);
 assert.match(js,/ZoneMaps\.contains/);assert.doesNotMatch(js,/id="googleMapsDiagnosticBtn"/);
 assert.match(mapJs,/provider:"OPENSTREETMAP"/);assert.doesNotMatch(mapJs,/maps\.googleapis\.com/);
 assert.match(sql,/master_detect_local_zone/);assert.match(sql,/htp_zone_contains/);
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

test('DELIVERY no crea ciudades y Zonas resuelve provincia/cantón al guardar',()=>{
 const html=fs.readFileSync('admin/index.html','utf8');
 const admin=fs.readFileSync('admin/admin.js','utf8');
 const zones=fs.readFileSync('admin/zones-master.js','utf8');
 assert.doesNotMatch(html,/Crear ciudad/);
 assert.doesNotMatch(html,/id="saveCityBtn"/);
 assert.doesNotMatch(admin,/saveCityBtn/);
 assert.match(html,/id="deliveryCity"/);
 assert.match(html,/<label>Cantón<\/label><select id="deliveryCity"/);
 assert.match(zones,/id="zoneProvince"/);
 assert.match(zones,/id="zoneCity"/);
 assert.match(zones,/master_save_city/);
 assert.match(zones,/resolveZoneCityId/);
 assert.match(zones,/p_city_id:cityId/);
});


test('MASTER no selecciona zonas operativas del DELIVERY',()=>{
 const admin=fs.readFileSync('admin/admin.js','utf8');

 const workspaceStart=admin.indexOf('function bindMasterDeliveryWorkspace');
 const workspaceEnd=admin.indexOf('async function loadDeliveryMasterWorkspace',workspaceStart);
 const workspace=workspaceStart>=0&&workspaceEnd>workspaceStart?admin.slice(workspaceStart,workspaceEnd):'';

 assert.doesNotMatch(workspace,/data-delivery-workspace-tab="zones"/);
 assert.doesNotMatch(workspace,/deliveryWorkspacePane-zones/);
 assert.doesNotMatch(workspace,/section-coverage/);
 assert.match(workspace,/La capacidad de zonas proviene del plan/);

 const renderStart=admin.indexOf('function renderCoverageZones');
 const renderEnd=admin.indexOf('function clearZoneForm',renderStart);
 const render=renderStart>=0&&renderEnd>renderStart?admin.slice(renderStart,renderEnd):'';

 assert.match(render,/state\.role === "MASTER"/);
 assert.match(render,/selección de zonas operativas corresponde al DELIVERY_ADMIN/);
 assert.match(render,/const canAssign = state\.role === "DELIVERY_ADMIN"/);
 assert.match(render,/delivery_set_zone_choice/);
});
