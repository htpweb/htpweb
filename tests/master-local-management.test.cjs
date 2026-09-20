const test=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");const path=require("node:path");
const sql=fs.readFileSync(path.join(__dirname,"../supabase/migrations/20260920003000_master_local_management.sql"),"utf8");
const js=fs.readFileSync(path.join(__dirname,"../admin/locales-master.js"),"utf8");
test("MASTER dispone de listado y CRUD seguro de LOCAL",()=>{assert.match(sql,/master_list_locals/);assert.match(sql,/master_save_local/);assert.match(sql,/master_set_local_active/);assert.match(sql,/master_delete_local/);assert.match(sql,/operación exclusiva de MASTER/);});
test("LOCAL activo requiere ubicación confirmada",()=>{assert.match(sql,/para activar el LOCAL complete latitud y longitud/);assert.match(js,/Para activar el LOCAL confirma su ubicación/);});
test("la nueva ficha asigna zona y no DELIVERY",()=>{assert.match(js,/p_zone_id/);assert.doesNotMatch(js,/p_delivery_ids/);});
test("eliminación protege historial operativo",()=>{assert.match(sql,/order_locals/);assert.match(sql,/INACTIVATED_HISTORY/);assert.match(sql,/foreign_key_violation/);assert.match(js,/se inactivará para proteger los pedidos/);});
test("interfaz permite crear editar activar inactivar y eliminar",()=>{assert.match(js,/clearMasterLocalForm/);assert.match(js,/saveMasterLocal/);assert.match(js,/toggleMasterLocal/);assert.match(js,/deleteMasterLocal/);});
