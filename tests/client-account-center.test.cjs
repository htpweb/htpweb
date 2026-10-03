const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
function scripts(file){return [...read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean)}

test("CLIENT has a dedicated Mi cuenta center",()=>{
 const page=read("app/mi-cuenta.html");
 assert.match(page,/Mis pedidos/);
 assert.match(page,/Mis direcciones/);
 assert.match(page,/Mis reclamaciones/);
 assert.match(page,/Mis DELIVERY/);
 assert.match(page,/Mis datos/);
 assert.match(page,/Cambiar contraseña/);
 assert.match(page,/Código de referido/);
 assert.match(page,/Agregar dirección/);
 assert.match(page,/Editar dirección/);
 assert.match(page,/Usar mi ubicación actual/);
});

test("Mi cuenta aggregates orders across DELIVERY and preserves detail links",()=>{
 const page=read("app/mi-cuenta.html");
 assert.match(page,/from\("orders"\)/);
 assert.match(page,/from\("customer_deliveries"\)/);
 assert.match(page,/Todos los DELIVERY/);
 assert.match(page,/pedidos\.html\?delivery=/);
 assert.match(page,/Comprar nuevamente/);
});
test("Mi cuenta reuses protected profile customer address and claim flows",()=>{
 const page=read("app/mi-cuenta.html");
 assert.match(page,/update_my_profile/);
 assert.match(page,/upsert_my_customer/);
 assert.match(page,/listarMisDireccionesCliente/);
 assert.match(page,/guardarMiDireccionCliente/);
 assert.match(page,/desactivarMiDireccionCliente/);
 assert.match(page,/my_local_claims/);
 assert.match(page,/claim_delivery_referral/);
});

test("CLIENT storefront sends authenticated users to Mi cuenta",()=>{
 const index=read("app/index.html");
 const access=read("app/acceso.html");
 const orders=read("app/pedidos.html");
 assert.match(index,/user[\s\S]*mi-cuenta\.html/);
 assert.match(access,/id="accountLink"/);
 assert.match(access,/Mi cuenta/);
 assert.match(orders,/mi-cuenta\.html/);
});

test("account page inline script compiles",()=>{
 for(const script of scripts("app/mi-cuenta.html"))new vm.Script(script,{filename:"app/mi-cuenta.html"});
});
