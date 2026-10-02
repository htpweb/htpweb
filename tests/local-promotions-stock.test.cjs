const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
function scripts(file){return [...read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean)}

test("standalone LOCAL storefront can buy canonical promotions",()=>{
 const shop=read("app/tienda.html");
 assert.match(shop,/promotion_type==="OPTIONS"/);
 assert.match(shop,/kind:"PROMOTION"/);
 assert.match(shop,/promotion_item_id/);
 assert.match(shop,/promotion_selection_required/);
 assert.match(shop,/Agregar combo/);
});

test("standalone LOCAL cart understands promotion snapshots and hands them to DELIVERY",()=>{
 const cart=read("app/tienda-carrito.html");
 assert.match(cart,/item\.promotion_id/);
 assert.match(cart,/promotion_title/);
 assert.match(cart,/promotion_selection/);
 assert.match(cart,/carritoGuardar\(delivery\.slug,items\)/);
});

test("LOCAL inventory blocks quantities above current stock and revalidates at checkout",()=>{
 const shop=read("app/tienda.html");
 const cart=read("app/tienda-carrito.html");
 assert.match(shop,/carritoCantidadItem\(scope\(\),matcher\)/);
 assert.match(shop,/alcanzó el stock disponible/);
 assert.match(cart,/validateFreshStock/);
 assert.match(cart,/solo tiene .*unidad\(es\) disponibles/);
 assert.match(cart,/await validateFreshStock\(\)/);
});

test("standalone store and cart scripts compile after promotions and stock enforcement",()=>{
 for(const file of ["app/tienda.html","app/tienda-carrito.html"]){
  for(const script of scripts(file))new vm.Script(script,{filename:file});
 }
});
