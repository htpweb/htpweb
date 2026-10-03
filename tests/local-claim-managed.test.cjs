const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
function inlineScripts(file){return [...read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim())}

test("self-service LOCAL claim is authenticated and still MASTER-reviewed",()=>{
 const sql=read("supabase/migrations/20261002222500_local_claim_submit.sql");
 const page=read("app/reclamar-local.html");
 assert.match(sql,/submit_local_claim/);
 assert.match(sql,/v_role<>'CLIENT'/);
 assert.ok(sql.includes("values('CLAIM_LOCAL',null,p_local_id,auth.uid(),'PENDING'"));
 assert.match(sql,/reclamaci.n en revisi.n/);
 assert.match(page,/submit_local_claim/);
 assert.match(page,/nuestro equipo revisará/i);
 assert.match(page,/plazo máximo de <strong>3 días<\/strong>/);
});

test("CLIENT customer context survives conversion to LOCAL_ADMIN",()=>{
 const sql=read("supabase/migrations/20261002222000_local_claim_onboarding.sql");
 assert.match(sql,/CUSTOMER se conserva activo/);
 assert.doesNotMatch(sql,/UPDATE public\.customers[\s\S]*active =\s*false/i);
 assert.doesNotMatch(sql,/UPDATE public\.customer_deliveries[\s\S]*allow_orders =\s*false/i);
 const admin=read("admin/admin.js");
 assert.match(admin,/perfil de compra CUSTOMER se conservar/);
});

test("claim onboarding starts inside each unclaimed DELIVERY-visible LOCAL",()=>{
 const landing=read("index.html");
 const local=read("app/local.html");
 assert.doesNotMatch(landing,/Reclamar mi LOCAL/);
 assert.match(local,/Reclamar este LOCAL/);
 assert.match(local,/public_local_claim_state/);
 assert.match(local,/reclamar-local\.html\?local=/);
});

test("managed LOCAL checkout hands cart to existing DELIVERY checkout",()=>{
 const cart=read("app/tienda-carrito.html");
 const sql=read("supabase/migrations/20261002222000_local_claim_onboarding.sql");
 assert.match(sql,/'slug',d\.slug/);
 assert.match(cart,/HTPWEB_MANAGED/);
 assert.match(cart,/carritoGuardar\(delivery\.slug,items\)/);
 assert.match(cart,/carrito\.html\?delivery=/);
 assert.match(cart,/Continuar con DELIVERY HTPWEB/);
});

test("claim and managed storefront inline scripts compile",()=>{
 for(const file of ["app/reclamar-local.html","app/tienda-carrito.html"]){
   for(const script of inlineScripts(file))new vm.Script(script,{filename:file});
 }
});
