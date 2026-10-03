const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
function scripts(file){return [...read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean)}

test("LOCAL claim flow originates from the LOCAL page and hides once claimed or pending",()=>{
 const html=read("app/local.html");
 assert.match(html,/public_local_claim_state/);
 assert.match(html,/Reclamar este LOCAL/);
 assert.match(html,/Información administrada por el negocio/);
 assert.match(html,/proceso de verificación/);
});

test("claim form collects ownership evidence and keeps LOCAL context through auth",()=>{
 const html=read("app/reclamar-local.html");
 assert.match(html,/responsibleName/);
 assert.match(html,/declaredWhatsapp/);
 assert.match(html,/REGISTERED_WHATSAPP/);
 assert.match(html,/DOCUMENT_LOCATION/);
 assert.match(html,/RUC \/ RIMPE/);
 assert.match(html,/application\/pdf/);
 assert.match(html,/Compartir mi ubicación/);
 assert.match(html,/Solicitar código/);
 assert.match(html,/irAAcceso\(rutaActualRelativa\(\)\)/);
 assert.match(html,/claim_local_context/);
});

test("backend enriches claims with challenge and WhatsApp match",()=>{
 const sql=read("supabase/migrations/20261002232256_local_claim_evidence_flow.sql");
 assert.match(sql,/challenge_code/);
 assert.match(sql,/gen_random_bytes/);
 assert.match(sql,/declared_whatsapp_matches_registered/);
 assert.match(sql,/PENDING_MASTER_VERIFICATION/);
 assert.match(sql,/master_claim_verification_snapshot/);
});

test("MASTER sees canonical evidence and can verify through registered WhatsApp",()=>{
 const admin=read("admin/admin.js");
 assert.match(admin,/master_claim_verification_snapshot/);
 assert.match(admin,/OTP por WhatsApp/);
 assert.match(admin,/Código HTPWEB/);
 assert.match(admin,/Distancia al punto registrado/);
 assert.match(admin,/Evidencias privadas/);
 assert.match(admin,/Debes documentar cómo verificaste la propiedad/);
});

test("backend refuses CLAIM approval without a documented verification note",()=>{
 const sql=read("supabase/migrations/20261002232636_claim_approval_guard.sql");
 assert.match(sql,/documenta cómo verificaste/);
 assert.match(sql,/r\.request_type='CLAIM_LOCAL'/);
 assert.match(sql,/p_review_note/);
});

test("NEEDS_INFO claimant can submit additional evidence",()=>{
 const sql=read("supabase/migrations/20261002232422_local_claim_context_followup.sql");
 const html=read("app/reclamar-local.html");
 assert.match(sql,/update_local_claim_evidence/);
 assert.match(sql,/r\.status<>'NEEDS_INFO'/);
 assert.match(html,/Enviar información adicional/);
 assert.match(html,/update_local_claim_evidence/);
});

test("claim related inline scripts compile",()=>{
 for(const file of ["app/local.html","app/reclamar-local.html"]){
  for(const script of scripts(file))new vm.Script(script,{filename:file});
 }
});
