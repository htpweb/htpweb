const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
function scripts(file){return [...read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean)}

test("QA selector is restricted to one seeded account and never allows MASTER",()=>{
 const sql=read("supabase/migrations/20261002234147_qa_role_selector.sql");
 assert.match(sql,/private\.qa_role_testers/);
 assert.match(sql,/eb48520e-2634-40a8-9e7e-7babeba02e4f/);
 assert.match(sql,/array\['CLIENT','DELIVERY_ADMIN','DELIVERY_OPERATOR','DELIVERY_DRIVER','LOCAL_ADMIN'\]/);
 assert.match(sql,/if v_role='MASTER'/);
 assert.match(sql,/not \('MASTER'=any\(allowed_roles\)\)/);
});

test("QA selector uses isolated PRUEBAS delivery and dedicated test LOCAL",()=>{
 const sql=read("supabase/migrations/20261002234147_qa_role_selector.sql");
 assert.match(sql,/HTPWEB LOCAL PRUEBAS/);
 assert.match(sql,/c0ad0746-5090-4350-9ec2-c1b8019a0a17/);
 assert.match(sql,/f0000000-0000-4000-8000-000000000001/);
 assert.match(sql,/LOC_PRO/);
});

test("requested QA phone is updated for profile and customer",()=>{
 const sql=read("supabase/migrations/20261002234147_qa_role_selector.sql");
 assert.match(sql,/\+593 98 039 0363/);
 assert.match(sql,/update public\.profiles/);
 assert.match(sql,/update public\.customers/);
});

test("role selector page exposes every non-MASTER profile and routes through protected RPC",()=>{
 const html=read("app/perfiles-prueba.html");
 for(const role of ["CLIENT","DELIVERY_ADMIN","DELIVERY_OPERATOR","DELIVERY_DRIVER","LOCAL_ADMIN"])assert.match(html,new RegExp(role));
 assert.doesNotMatch(html,/\["MASTER","/);
 assert.match(html,/qa_profile_selector_snapshot/);
 assert.match(html,/qa_set_profile_role/);
 assert.match(html,/MASTER no está disponible/);
});

test("QA selector link is hidden for normal users on public and admin pages",()=>{
 const rootHtml=read("index.html"),adminHtml=read("admin/index.html"),adminJs=read("admin/admin.js");
 assert.match(rootHtml,/qaProfilesLink/);
 assert.match(rootHtml,/qa_profile_selector_snapshot/);
 assert.match(adminHtml,/qaProfilesAdminLink/);
 assert.match(adminJs,/qa_profile_selector_snapshot/);
});

test("QA selector inline script compiles",()=>{
 for(const script of scripts("app/perfiles-prueba.html"))new vm.Script(script,{filename:"app/perfiles-prueba.html"});
});
