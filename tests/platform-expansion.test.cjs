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

test("account can create DELIVERY directly with one evaluation zone",()=>{
 const page=read("app/crear-delivery.html");
 const sql=read("supabase/migrations/20261004003100_delivery_self_service_one_zone.sql");
 assert.match(page,/create_my_delivery/);
 assert.match(page,/available_delivery_zones/);
 assert.doesNotMatch(page,/submit_my_delivery_creation_request/);
 assert.match(sql,/account_delivery_roles/);
 assert.match(sql,/delivery_zones/);
 assert.match(sql,/DELIVERY_TRIAL/);
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



test("authenticated public pages expose a concise reusable account menu",()=>{
  const home=read("index.html"),how=read("como-funciona.html"),explore=read("explorar-negocios.html");
  for(const html of [home,how,explore]){
    assert.match(html,/publicAccountMenu/);
    assert.match(html,/Abrir mi cuenta/);
    assert.match(html,/Crear negocio/);
    assert.match(html,/Crear delivery/);
    assert.doesNotMatch(html,/Mi perfil/);
    assert.doesNotMatch(html,/Mis negocios/);
    assert.doesNotMatch(html,/Mis deliverys/);
    assert.doesNotMatch(html,/Mis pedidos/);
    assert.doesNotMatch(html,/Mis reclamaciones/);
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


test("authenticated app flows share the persistent HTPWEB navigation shell",()=>{
  const auth=read("config/auth.js");
  const css=read("assets/authenticated-shell.css");
  assert.match(auth,/instalarEncabezadoHTPWEB/);
  assert.match(auth,/Inicio/);
  assert.match(auth,/Cómo funciona/);
  assert.match(auth,/Explorar locales/);
  assert.doesNotMatch(auth,/>Mis negocios</);
  assert.match(auth,/Mi cuenta/);
  assert.match(auth,/reclamar-local\.html/);
  assert.match(css,/\.htp-auth-header/);
  assert.match(css,/position:sticky/);
});


test("Mi cuenta hides referral code and authenticated app header keeps account dropdown",()=>{
  const account=read("app/mi-cuenta.html");
  const auth=read("config/auth.js");
  const css=read("assets/authenticated-shell.css");
  assert.doesNotMatch(account,/Código de referido/);
  assert.doesNotMatch(account,/referralCode/);
  assert.doesNotMatch(account,/applyReferralBtn/);
  assert.match(auth,/htpAuthAccountTrigger/);
  assert.match(auth,/htpAuthAccountDropdown/);
  assert.match(auth,/Abrir mi cuenta/);
  assert.match(auth,/Crear negocio/);
  assert.match(auth,/Crear delivery/);
  assert.match(auth,/Cerrar sesión/);
  assert.match(css,/htp-auth-account-dropdown/);
});


test("Mi cuenta groups LOCAL claims inside Mis negocios",()=>{
  const account=read("app/mi-cuenta.html");
  const businessStart=account.indexOf('id="businesses"');
  const deliveryStart=account.indexOf('id="managedDeliveries"');
  const businessBlock=account.slice(businessStart,deliveryStart);
  assert.ok(businessStart>=0&&deliveryStart>businessStart);
  assert.match(businessBlock,/Mis reclamaciones/);
  assert.match(businessBlock,/claimsList/);
  assert.match(businessBlock,/claimsCount/);
  assert.doesNotMatch(account,/Reclamaciones de LOCAL<\/div><div id="claimsCount"/);
});


test("DELIVERY self-service uses one selectable MASTER zone and links plans",()=>{
  const page=read("app/crear-delivery.html");
  const migration=read("supabase/migrations/20261004003100_delivery_self_service_one_zone.sql");
  assert.match(page,/available_delivery_zones/);
  assert.match(page,/selectedZoneId/);
  assert.match(page,/1 de 1 zona seleccionada/);
  assert.match(page,/Ver planes y suscripciones/);
  assert.match(page,/create_my_delivery/);
  assert.doesNotMatch(page,/Enviar solicitud/);
  assert.match(migration,/DELIVERY_TRIAL/);
  assert.match(migration,/zones\.active\.max/);
  assert.match(migration,/create_my_delivery/);
  assert.match(migration,/15 days/);
});

test("Mi cuenta exposes plans subscriptions and visual configuration",()=>{
  const account=read("app/mi-cuenta.html");
  assert.match(account,/id="plans"/);
  assert.match(account,/Planes y suscripciones/);
  assert.match(account,/my_plans_and_subscriptions/);
  assert.match(account,/id="settings"/);
  assert.match(account,/Configuración/);
  assert.match(account,/accountTheme/);
  assert.match(account,/HTPWEB_ACCOUNT_THEME/);
});


test("self-service DELIVERY uses an allowed theme key",()=>{
  const fix=read("supabase/migrations/20261004011600_fix_delivery_trial_theme.sql");
  assert.match(fix,/theme_key/);
  assert.match(fix,/'HTPWEB'/);
  assert.doesNotMatch(fix,/'default'/);
});


test("multi-role CLIENT accounts can own DELIVERY through account_delivery_roles",()=>{
  const sql=read("supabase/migrations/20261004012000_multirole_user_deliveries.sql");
  assert.match(sql,/account_delivery_roles/);
  assert.match(sql,/v_has_delivery_role/);
  assert.match(sql,/DELIVERY_ADMIN/);
  assert.match(sql,/insert into public\.account_delivery_roles/);
  assert.match(sql,/insert into public\.user_deliveries/);
  assert.ok(sql.indexOf("insert into public.account_delivery_roles") < sql.indexOf("insert into public.user_deliveries"));
  assert.doesNotMatch(sql,/el rol % no puede pertenecer a user_deliveries/);
});


test("self-service DELIVERY activates plan before zone coverage refresh",()=>{
  const sql=read("supabase/migrations/20261004012400_fix_delivery_coverage_order.sql");
  const planPos=sql.indexOf("insert into public.plan_assignments");
  const zonePos=sql.indexOf("insert into public.delivery_zones");
  assert.ok(planPos>=0&&zonePos>planPos);
  assert.match(sql,/delivery_zones refresh trigger now sees an active DELIVERY plan/);
});


test("self-service DELIVERY uses valid NEW change_type for initial plan assignment",()=>{
  const sql=read("supabase/migrations/20261004013200_fix_delivery_trial_change_type.sql");
  assert.match(sql,/'NEW'/);
  assert.doesNotMatch(sql,/'INITIAL'/);
  assert.match(sql,/insert into public\.plan_assignments/);
});


test("DELIVERY panel keeps HTPWEB navigation and exposes its own public link with QR",()=>{
  const html=read("admin/index.html");
  const admin=read("admin/admin.js");
  assert.match(html,/id="adminHtpwebHeader"/);
  assert.match(html,/>Inicio<\/a>/);
  assert.match(html,/>Locales<\/a>/);
  assert.match(html,/>Cómo funciona<\/a>/);
  assert.match(html,/>Mi cuenta<\/a>/);
  assert.match(html,/id="deliveryPublicSiteLink"/);
  assert.match(html,/id="profileDeliveryPublicUrl"/);
  assert.match(html,/id="profileQrBtn"/);
  assert.match(admin,/function syncDeliveryPublicAccess/);
  assert.match(admin,/public_share_path/);
  assert.match(admin,/masterDeliveryPublicUrl/);
  assert.match(admin,/DELIVERY_ADMIN/);
  assert.match(admin,/openMasterDeliveryQr/);
});


test("authenticated account header is not captured by DELIVERY dark header styling",()=>{
  const css=read("assets/app.css");
  const account=read("app/mi-cuenta.html");
  assert.match(css,/body>header:not\(\.htp-auth-header\)/);
  assert.doesNotMatch(css,/\nheader\{background:#111/);
  assert.match(account,/app\.css\?v=20261004-accountheader1/);
});

test("self-service DELIVERY gets a unique short public path and public loader resolves it",()=>{
  const sql=read("supabase/migrations/20261004024500_delivery_short_public_path.sql");
  const negocio=read("config/negocio.js");
  const admin=read("admin/admin.js");
  assert.match(sql,/public_share_path/);
  assert.match(sql,/deliveries_public_share_path_uq/);
  assert.match(sql,/unique_violation/);
  assert.match(sql,/insert into public\.deliveries\(id,name,slug,public_share_path/);
  assert.match(negocio,/\.ilike\("public_share_path", slug\)/);
  assert.match(admin,/https:\/\/htpweb\.github\.io\/.*public_share_path/);
});


test("HTPWEB landing header stays white while DELIVERY headers can remain dark",()=>{
  const css=read("assets/app.css");
  const home=read("index.html");
  assert.match(css,/body>header:not\(\.htp-auth-header\):not\(\.top\)/);
  assert.match(home,/app\.css\?v=20261004-headerwhite1/);
  assert.match(home,/<header class="top">/);
});
