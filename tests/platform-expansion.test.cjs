const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
function scripts(file){return [...read(file).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim())}

test("HTPWEB home is institutional and business exploration has its own page",()=>{
 const home=read("index.html");
 const explore=read("explorar-negocios.html");
 assert.match(home,/Haz que tu negocio venda/);
 assert.match(home,/se organice y/);
 assert.match(home,/HTPWEB te da un espacio propio/);
 assert.match(home,/\.\/explorar-negocios\.html/);
 assert.doesNotMatch(home,/Qué puede hacer HTPWEB con/);
 assert.doesNotMatch(home,/Negocios destacados/);
 assert.doesNotMatch(home,/public_htpweb_directory/);
 assert.match(explore,/public_htpweb_directory/);
 assert.match(explore,/Buscar negocio, producto o servicio/);
 assert.match(explore,/local-general\.html/);
 assert.match(explore,/No reclamado/);
 assert.doesNotMatch(home,/carrito-general\.html/);
 const how=read("como-funciona.html");
 assert.doesNotMatch(how,/carrito-general\.html/);
 assert.match(explore,/carrito-general\.html/);
 assert.doesNotMatch(how,/>Para negocios<|>Para deliverys</);
 assert.doesNotMatch(explore,/>Para negocios<|>Para deliverys</);
});

test("MASTER has business sectors above categories",()=>{
 const js=read("admin/local-categories-master.js");
 const sql=read("supabase/migrations/20261003064016_platform_business_sectors_directory.sql");
 assert.match(js,/master_save_business_sector/);
 assert.match(js,/localBusinessCategorySector/);
 assert.match(sql,/create table if not exists public\.business_sectors/);
 assert.match(sql,/sector_id uuid references public\.business_sectors/);
 assert.match(sql,/RESTAURANTS/);
});
test("one account can switch client LOCAL and DELIVERY modes",()=>{
 const sql=read("supabase/migrations/20261003065902_account_multi_workspace_modes.sql");
 const account=read("app/mi-cuenta.html");
 assert.match(sql,/account_delivery_roles/);
 assert.match(sql,/switch_my_account_mode/);
 assert.match(sql,/my_account_modes/);
 assert.match(account,/Modo cliente/);
 assert.match(account,/data-open-local/);
 assert.match(account,/data-open-delivery/);
});

test("account can request LOCAL independent of DELIVERY",()=>{
 const page=read("app/crear-local.html");
 const sql=read("supabase/migrations/20261003065044_account_local_creation_flow.sql");
 assert.match(page,/Crear mi LOCAL/);
 assert.match(page,/submit_my_local_creation_request/);
 assert.match(sql,/delivery_id is null/);
 assert.match(sql,/local_request_duplicates/);
 assert.match(sql,/user_locals/);
});

test("account can request DELIVERY and MASTER reviews it",()=>{
 const page=read("app/crear-delivery.html");
 const admin=read("admin/admin.js");
 const sql=read("supabase/migrations/20261003070243_delivery_creation_requests.sql");
 assert.match(page,/submit_my_delivery_creation_request/);
 assert.match(admin,/master_list_delivery_creation_requests/);
 assert.match(admin,/master_review_delivery_creation_request/);
 assert.match(sql,/account_delivery_roles/);
 assert.match(sql,/r\.whatsapp,false,now\(\),now\(\)/);
});

test("new inline scripts compile",()=>{
 for(const file of ["index.html","app/local-general.html","app/crear-local.html","app/crear-delivery.html","app/mi-cuenta.html"])
  for(const script of scripts(file)) new vm.Script(script,{filename:file});
});
test("HTPWEB general cart resolves one or many LOCAL at checkout",()=>{
 const store=read("app/tienda.html");
 const cart=read("app/carrito-general.html");
 const resolver=read("supabase/migrations/20261003081618_platform_cart_channel_resolver.sql");
 assert.match(store,/source==="htpweb"\?"HTPWEB"/);
 assert.match(store,/carrito-general\.html/);
 assert.match(cart,/Tu carrito contiene productos de/);
 assert.match(cart,/Hacer pedidos separados/);
 assert.match(cart,/commonDeliveries/);
 assert.match(cart,/carritoGuardar\(delivery\.slug/);
 assert.match(resolver,/public_htpweb_cart_channels/);
 assert.match(resolver,/public_local_delivery_choices/);
 assert.match(resolver,/direct_enabled/);
});

test("direct LOCAL orders reuse guest customers and appear in account history",()=>{
 const account=read("app/mi-cuenta.html");
 const detail=read("app/pedido-directo.html");
 const reuse=read("supabase/migrations/20261003081623_direct_local_guest_customer_reuse.sql");
 assert.match(account,/order_channel/);
 assert.match(account,/Pedidos directos a LOCAL/);
 assert.match(account,/pedido-directo\.html\?order=/);
 assert.match(detail,/DIRECT_LOCAL/);
 assert.match(reuse,/profile_id is null/);
 assert.match(reuse,/regexp_replace\(coalesce\(c\.phone/);
});

test("platform cart and direct detail inline scripts compile",()=>{
 for(const file of ["app/carrito-general.html","app/pedido-directo.html","app/tienda.html"])
  for(const script of scripts(file)) new vm.Script(script,{filename:file});
});


test("creating a LOCAL requires private ownership evidence and supports NEEDS_INFO resubmission",()=>{
 const page=read("app/crear-local.html");
 const admin=read("admin/admin.js");
 const sql=read("supabase/migrations/20261003082507_local_creation_evidence_verification.sql");
 assert.match(page,/RUC \/ RIMPE/);
 assert.match(page,/identityPdf/);
 assert.match(page,/Foto exterior/);
 assert.match(page,/Foto interior/);
 assert.match(page,/Foto del negocio mostrando el código HTPWEB/);
 assert.match(page,/prepare_local_creation_challenge/);
 assert.match(page,/local-claim-evidence/);
 assert.match(page,/update_my_local_creation_request/);
 assert.match(sql,/local_creation_challenges/);
 assert.match(sql,/validate_local_creation_payload/);
 assert.match(sql,/ruc_pdf_path/);
 assert.match(sql,/truth_confirmed/);
 assert.match(sql,/review_deadline=now\(\)\+interval '3 days'/);
 assert.match(admin,/renderCreationVerification/);
 assert.match(admin,/creation_files/);
});



test("authenticated public pages expose a reusable account menu",()=>{
  const home=read("index.html"),how=read("como-funciona.html"),explore=read("explorar-negocios.html");
  for(const html of [home,how,explore]){
    assert.match(html,/publicAccountMenu/);
    assert.match(html,/Mi perfil/);
    assert.match(html,/Mis negocios/);
    assert.match(html,/Mis deliverys/);
    assert.match(html,/Mis pedidos/);
    assert.match(html,/public-account-menu\.js/);
  }
  const menu=read("config/public-account-menu.js");
  assert.match(menu,/auth\.getSession/);
  assert.match(menu,/auth\.signOut/);
});


test("public account menu resolves Supabase session on Cómo funciona and account has a home return",()=>{
  const menu=read("config/public-account-menu.js");
  const account=read("app/mi-cuenta.html");
  assert.match(menu,/typeof supabaseClient==="undefined"/);
  assert.doesNotMatch(menu,/window\.supabaseClient/);
  assert.match(account,/← Volver a HTPWEB/);
  assert.match(account,/href="\.\.\/index\.html"/);
});
