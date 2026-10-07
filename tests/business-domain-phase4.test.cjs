const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const read=rel=>fs.readFileSync(path.join(root,rel),"utf8");

test("phase 4 persists business ids without destructive legacy removal",()=>{
  const sql=read("supabase/migrations/20261007134542_business_domain_phase4_persistence_writes.sql");
  assert.match(sql,/add column if not exists business_id uuid/i);
  assert.match(sql,/origin_business_id uuid/i);
  assert.match(sql,/sync_business_id_legacy_local_id/);
  assert.match(sql,/sync_origin_business_id_legacy_origin_local_id/);
  assert.doesNotMatch(sql,/rename\s+column|drop\s+column/i);
});

test("admin canonicalizes legacy business role and uses BUSINESS_ADMIN",()=>{
  const admin=read("admin/admin.js");
  assert.match(admin,/BUSINESS_ADMIN:/);
  assert.match(admin,/toCanonicalRole\(role\)/);
  assert.match(admin,/master_review_business_request/);
  assert.match(admin,/master_apply_business_request/);
  assert.match(admin,/master_assign_business_admin/);
  assert.match(admin,/master_unassign_business_admin/);
  assert.match(admin,/master_set_business_capability/);
  assert.match(admin,/update_my_business_content/);
  assert.match(admin,/save_my_business_commerce_settings/);
  assert.match(admin,/save_my_business_inventory/);
});

test("MASTER business module uses canonical business write RPCs",()=>{
  const master=read("admin/negocios-master.js");
  for(const name of [
    "master_list_businesses",
    "master_save_business_v3",
    "master_set_business_active",
    "master_set_businesses_active",
    "master_delete_business",
    "master_assign_business_plan",
    "master_set_business_categories",
    "master_set_business_menu_design",
    "master_list_business_domain_requests",
    "master_update_business_domain_request"
  ]) assert.match(master,new RegExp(name));
});

test("admin loads canonical business modules",()=>{
  const html=read("admin/index.html");
  for(const file of [
    "business-page-editor.js",
    "business-subscriptions.js",
    "negocios-bulk.js",
    "negocios-master.js",
    "business-categories-master.js"
  ]) assert.match(html,new RegExp(file.replace(".","\\.")));
});

test("legacy admin module names are compatibility shims",()=>{
  for(const file of [
    "admin/"+"locales-master.js",
    "admin/"+"locales-bulk.js",
    "admin/"+"local-page-editor.js",
    "admin/"+"local-subscriptions.js",
    "admin/"+"local-categories-master.js"
  ]){
    const source=read(file);
    assert.match(source,/LEGACY COMPATIBILITY SHIM/);
    assert.ok(source.split(/\r?\n/).length<10,file);
  }
});

test("canonical business admin modules call canonical writer APIs",()=>{
  assert.match(read("admin/business-page-editor.js"),/save_my_business_editor_overrides/);
  assert.match(read("admin/business-page-editor.js"),/save_my_business_services/);
  assert.match(read("admin/business-subscriptions.js"),/business_create_subscription_payment/);
  assert.match(read("admin/business-categories-master.js"),/master_save_business_category/);
  assert.match(read("admin/negocios-bulk.js"),/master_save_business_import_v1/);
  assert.match(read("admin/negocios-bulk.js"),/bulk_import_business_catalog_v3/);
});

test("canonical phase 4 JavaScript parses",()=>{
  for(const file of [
    "admin/admin.js",
    "admin/negocios-master.js",
    "admin/negocios-bulk.js",
    "admin/business-page-editor.js",
    "admin/business-subscriptions.js",
    "admin/business-categories-master.js"
  ]) new vm.Script(read(file),{filename:file});
});
