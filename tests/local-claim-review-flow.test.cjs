const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
function scripts(file){return [...read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean)}

test("document claim uses private PDF/image evidence and captured location",()=>{
 const page=read("app/reclamar-local.html");
 const sql=read("supabase/migrations/20261003041848_local_claim_review_flow.sql");
 assert.match(page,/local-claim-evidence/);
 assert.match(page,/application\/pdf/);
 assert.match(page,/navigator\.geolocation/);
 assert.match(page,/codePhoto/);
 assert.match(sql,/local-claim-evidence/);
 assert.match(sql,/DOCUMENT_LOCATION/);
 assert.match(sql,/location_distance_m/);
 assert.match(sql,/review_deadline/);
});

test("WhatsApp OTP path is prepared and cannot submit without verification",()=>{
 const page=read("app/reclamar-local.html");
 const sql=read("supabase/migrations/20261003041848_local_claim_review_flow.sql");
 const fn=read("supabase/functions/local-claim-whatsapp-otp/index.ts");
 assert.match(page,/local-claim-whatsapp-otp/);
 assert.match(page,/Solicitar código/);
 assert.match(sql,/local_claim_whatsapp_otps/);
 assert.match(sql,/verifica primero el código enviado al WhatsApp registrado/);
 assert.match(fn,/META_WHATSAPP_PHONE_NUMBER_ID/);
 assert.match(fn,/META_WHATSAPP_OTP_TEMPLATE/);
});

test("CLIENT can track claim progress and MASTER gets private evidence links",()=>{
 const panel=read("app/mis-reclamaciones.html");
 const account=read("app/mi-cuenta.html");
 const admin=read("admin/admin.js");
 const sql=read("supabase/migrations/20261003041848_local_claim_review_flow.sql");
 assert.match(panel,/my_local_claims/);
 assert.match(panel,/INFORMACIÓN ADICIONAL REQUERIDA/);
 assert.match(panel,/Comentario de HTPWEB/);
 assert.match(account,/Mis reclamaciones/);
 assert.match(admin,/createSignedUrl/);
 assert.match(admin,/Evidencias privadas/);
 assert.match(sql,/my_local_claims/);
});

test("new claim pages inline scripts compile",()=>{
 for(const file of ["app/reclamar-local.html","app/mis-reclamaciones.html"]){
  for(const script of scripts(file))new vm.Script(script,{filename:file});
 }
});
