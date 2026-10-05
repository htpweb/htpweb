async function obtenerSesionActual() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

async function obtenerUsuarioActual() {
  const session = await obtenerSesionActual();
  return session?.user || null;
}

function rutaActualRelativa() {
  return location.pathname + location.search + location.hash;
}

function retornoSeguro(raw, fallback = "index.html") {
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw, location.href);
    if (parsed.origin !== location.origin) return fallback;
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return fallback;
  }
}

function irAAcceso(returnTo = rutaActualRelativa()) {
  const params = new URLSearchParams();
  const delivery = typeof obtenerDeliverySlug === "function" ? obtenerDeliverySlug() : "";

  if (delivery) params.set("delivery", delivery);
  params.set("return", returnTo);

  const base = location.pathname.includes("/admin/")
    ? "../app/acceso.html"
    : "acceso.html";

  location.href = `${base}?${params.toString()}`;
}

async function asegurarCustomerActual({ name, phone, email, marketingConsent = false }) {
  const user = await obtenerUsuarioActual();

  if (!user) {
    throw new Error("Debes iniciar sesión para continuar.");
  }

  const cleanName = String(name || "").trim();
  const cleanPhone = String(phone || "").trim();
  const cleanEmail = String(email || user.email || "").trim();

  if (!cleanName) throw new Error("Ingresa tu nombre.");
  if (!cleanPhone) throw new Error("Ingresa tu teléfono.");

  const { data, error } = await supabaseClient.rpc("upsert_my_customer", {
    p_name: cleanName,
    p_phone: cleanPhone,
    p_email: cleanEmail || null,
    p_marketing_consent: Boolean(marketingConsent)
  });

  if (error) throw error;
  return data;
}

async function cerrarSesion() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
}


function _htpwebAuthPageName() {
  return (location.pathname.split("/").pop() || "").toLowerCase();
}

function _htpwebIsBrandedPublicShell() {
  // Las URLs limpias de LOCAL terminan en /slug/ y no tienen nombre de archivo.
  // Detectamos el shell por marcadores del DOM para impedir que auth.js
  // inyecte la cabecera corporativa HTPWEB sobre la marca del LOCAL/DELIVERY.
  if (document.documentElement?.dataset?.localSlug) return true;
  if (document.body?.classList?.contains("local-store")) return true;
  return Boolean(document.querySelector(
    ".delivery-brand-shell,.delivery-brand-strip,.delivery-public-header,.local-store-header"
  ));
}

function _htpwebAuthHeaderAllowed() {
  // El encabezado corporativo HTPWEB solo pertenece al entorno HTPWEB.
  // Nunca debe superponerse sobre sitios/carritos/pedidos públicos de LOCAL o DELIVERY.
  if (_htpwebIsBrandedPublicShell()) return false;
  const excluded = new Set([
    "acceso.html",
    "index.html",
    "local.html",
    "local-general.html",
    "local-pedido.html",
    "tienda.html",
    "tienda-carrito.html",
    "carrito.html",
    "carrito-general.html",
    "pedido-directo.html",
    "pedidos.html",
    "repartidor-rapido.html"
  ]);
  return !excluded.has(_htpwebAuthPageName());
}

function _htpwebCompactProfilePage(){
  // En sitios públicos se permite únicamente el control compacto "Mi cuenta"
  // dentro de la cabecera propia del LOCAL/DELIVERY; no la cabecera HTPWEB.
  return new Set(["index.html","local.html","tienda.html"]).has(_htpwebAuthPageName());
}

function _htpwebAuthActiveHref() {
  const page=_htpwebAuthPageName();
  if (["mi-cuenta.html","configuracion.html"].includes(page)) return "account";
  if (["crear-local.html","reclamar-local.html","mis-reclamaciones.html"].includes(page)) return "business";
  return "";
}

async function _htpwebAccountModes(){
  try{
    const result=await supabaseClient.rpc("my_account_modes");
    return result.error?null:(result.data||null);
  }catch{return null}
}

function _htpwebEsc(value){
  return String(value||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

function _htpwebProfileSwitcherHtml(modes){
  if(!modes||modes?.active_context?.mode==="MASTER")return "";
  const active=modes.active_context||{mode:"CLIENT",resource_id:null};
  const items=[];
  items.push(
    '<button type="button" class="htp-profile-option '+(active.mode==="CLIENT"?"active":"")+'" data-htp-profile-mode="CLIENT">'+
      '<span class="htp-profile-avatar client">👤</span><span><strong>Perfil cliente</strong><small>Comprar y usar HTPWEB</small></span>'+
      (active.mode==="CLIENT"?'<b class="htp-profile-check">✓</b>':'')+
    '</button>'
  );
  (modes.deliveries||[]).forEach(d=>{
    const isActive=active.mode==="DELIVERY"&&active.resource_id===d.id;
    items.push(
      '<button type="button" class="htp-profile-option '+(isActive?"active":"")+'" data-htp-profile-mode="DELIVERY" data-htp-profile-resource="'+_htpwebEsc(d.id)+'">'+
        (d.logo_url?'<img class="htp-profile-avatar" src="'+_htpwebEsc(d.logo_url)+'" alt="">':'<span class="htp-profile-avatar delivery">D</span>')+
        '<span><strong>'+_htpwebEsc(d.name)+'</strong><small>Perfil DELIVERY</small></span>'+
        (isActive?'<b class="htp-profile-check">✓</b>':'')+
      '</button>'
    );
  });
  (modes.locals||[]).forEach(l=>{
    const isActive=active.mode==="LOCAL"&&active.resource_id===l.id;
    items.push(
      '<button type="button" class="htp-profile-option '+(isActive?"active":"")+'" data-htp-profile-mode="LOCAL" data-htp-profile-resource="'+_htpwebEsc(l.id)+'">'+
        (l.logo_url?'<img class="htp-profile-avatar" src="'+_htpwebEsc(l.logo_url)+'" alt="">':'<span class="htp-profile-avatar local">L</span>')+
        '<span><strong>'+_htpwebEsc(l.name)+'</strong><small>Perfil LOCAL</small></span>'+
        (isActive?'<b class="htp-profile-check">✓</b>':'')+
      '</button>'
    );
  });
  return '<div class="htp-profile-switcher"><div class="htp-profile-switcher-title">Cambiar perfil</div>'+items.join("")+'</div><div class="htp-auth-account-separator"></div>';
}

function _htpwebBindProfileSwitcher(root,{clientHref,workspaceHref}){
  root.querySelectorAll("[data-htp-profile-mode]").forEach(button=>{
    button.addEventListener("click",async()=>{
      const mode=button.dataset.htpProfileMode;
      const resource=button.dataset.htpProfileResource||null;
      button.disabled=true;
      try{
        const result=await supabaseClient.rpc("switch_my_account_mode",{p_mode:mode,p_resource_id:resource});
        if(result.error)throw result.error;
        location.href=mode==="CLIENT"?clientHref:workspaceHref;
      }catch(error){
        button.disabled=false;
        alert(error?.message||"No se pudo cambiar de perfil.");
      }
    });
  });
}

async function instalarSelectorPerfilesCompacto(){
  if(!_htpwebCompactProfilePage())return;
  if(document.querySelector("[data-htpweb-compact-profiles]"))return;

  let session=null;
  try{session=await obtenerSesionActual()}catch{return}
  if(!session?.user)return;

  const modes=await _htpwebAccountModes();
  if(!modes||modes?.active_context?.mode==="MASTER")return;

  if(!document.querySelector('link[href*="authenticated-shell.css"]')){
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="../assets/authenticated-shell.css?v=20261004-profiles2";
    document.head.appendChild(link);
  }

  const wrap=document.createElement("div");
  wrap.className="htp-auth-account-menu htp-compact-profile-menu";
  wrap.dataset.htpwebCompactProfiles="1";
  wrap.innerHTML=
    '<button class="htp-auth-account" type="button"><span class="htp-auth-account-icon">👤</span><span>Mi cuenta</span><span>⌄</span></button>'+
    '<div class="htp-auth-account-dropdown hidden">'+
      '<div class="htp-auth-account-summary"><strong>'+_htpwebEsc(session.user.user_metadata?.full_name||session.user.user_metadata?.name||"Mi cuenta")+'</strong><small>'+_htpwebEsc(session.user.email||"")+'</small></div>'+
      _htpwebProfileSwitcherHtml(modes)+
      '<a href="mi-cuenta.html">Abrir mi cuenta</a>'+
      '<a href="configuracion.html">Configuración</a>'+
      '<div class="htp-auth-account-separator"></div>'+
      '<a href="crear-local.html">Crear negocio</a>'+
      '<a href="crear-delivery.html">Crear delivery</a>'+
      '<div class="htp-auth-account-separator"></div>'+
      '<button class="logout" type="button">Cerrar sesión</button>'+
    '</div>';

  const preferred=document.querySelector(".header-actions")
    ||document.querySelector(".local-store-header-inner")
    ||document.querySelector("header")
    ||document.body;
  preferred.appendChild(wrap);

  const trigger=wrap.querySelector(".htp-auth-account");
  const dropdown=wrap.querySelector(".htp-auth-account-dropdown");
  trigger.onclick=e=>{e.preventDefault();e.stopPropagation();dropdown.classList.toggle("hidden")};
  document.addEventListener("click",e=>{if(!wrap.contains(e.target))dropdown.classList.add("hidden")});
  _htpwebBindProfileSwitcher(wrap,{clientHref:"../index.html",workspaceHref:"../admin/index.html"});
  wrap.querySelector(".logout").onclick=async()=>{await cerrarSesion();location.href="../index.html"};

  const legacy=document.getElementById("authLink");
  if(legacy)legacy.classList.add("hidden");
}

async function instalarEncabezadoHTPWEB() {
  if (!_htpwebAuthHeaderAllowed()) return;
  if (document.querySelector("[data-htpweb-auth-header]")) return;
  let session=null;
  try { session=await obtenerSesionActual(); } catch { return; }
  if (!session?.user) return;

  if (!document.querySelector('link[href*="authenticated-shell.css"]')) {
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="../assets/authenticated-shell.css?v=20261004-shell3";
    document.head.appendChild(link);
  }

  let accountRole="";
  let accountModes=null;
  try{
    const roleResult=await supabaseClient.rpc("current_role_code");
    if(!roleResult.error)accountRole=roleResult.data||"";
    accountModes=await _htpwebAccountModes();
  }catch{}
  const masterAdminLink=accountRole==="MASTER"
    ? '<a href="../admin/index.html">Administración</a><div class="htp-auth-account-separator"></div>'
    : "";

  const active=_htpwebAuthActiveHref();
  const header=document.createElement("header");
  header.className="htp-auth-header";
  header.dataset.htpwebAuthHeader="1";
  const user=session.user;
  const displayName=user.user_metadata?.full_name||user.user_metadata?.name||"Mi cuenta";
  header.innerHTML=
    '<div class="htp-auth-header-inner">'+
      '<a class="htp-auth-brand" href="../index.html"><img src="../assets/brand/Logo1-header.png" alt="HTPWEB"><span>HTPWEB</span></a>'+
      '<nav class="htp-auth-nav" aria-label="Navegación HTPWEB">'+
        '<a href="../index.html">Inicio</a>'+
        '<a href="../como-funciona.html">Cómo funciona</a>'+
        '<a href="../explorar-negocios.html">Explorar locales</a>'+
      '</nav>'+
      '<div class="htp-auth-account-menu">'+
        '<button id="htpAuthAccountTrigger" class="htp-auth-account '+(active==="account"?"active":"")+'" type="button"><span class="htp-auth-account-icon">👤</span><span>Mi cuenta</span><span>⌄</span></button>'+
        '<div id="htpAuthAccountDropdown" class="htp-auth-account-dropdown hidden">'+
          '<div class="htp-auth-account-summary"><strong>'+_htpwebEsc(displayName)+'</strong><small>'+_htpwebEsc(user.email||"")+'</small></div>'+
          _htpwebProfileSwitcherHtml(accountModes)+
          '<a href="mi-cuenta.html">Abrir mi cuenta</a>'+
          '<a href="configuracion.html">Configuración</a>'+
          masterAdminLink+
          '<div class="htp-auth-account-separator"></div>'+
          '<a href="crear-local.html">Crear negocio</a>'+
          '<a href="crear-delivery.html">Crear delivery</a>'+
          '<div class="htp-auth-account-separator"></div>'+
          '<button id="htpAuthLogout" class="logout" type="button">Cerrar sesión</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  document.body.prepend(header);
  const menu=header.querySelector(".htp-auth-account-menu");
  const trigger=header.querySelector("#htpAuthAccountTrigger");
  const dropdown=header.querySelector("#htpAuthAccountDropdown");
  trigger?.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();dropdown?.classList.toggle("hidden")});
  document.addEventListener("click",e=>{if(menu&&!menu.contains(e.target))dropdown?.classList.add("hidden")});
  _htpwebBindProfileSwitcher(header,{clientHref:"../index.html",workspaceHref:"../admin/index.html"});
  const logout=header.querySelector("#htpAuthLogout");
  logout?.addEventListener("click",async()=>{await cerrarSesion();location.href="../index.html"});
}

async function prepararEncabezadoDeliveryAdmin(){
  const header=document.getElementById("adminHtpwebHeader");
  if(!header)return;

  let session=null;
  try{session=await obtenerSesionActual()}catch{return}
  if(!session?.user)return;

  const roleResult=await supabaseClient.rpc("current_role_code");
  if(roleResult.error||!["DELIVERY_ADMIN","DELIVERY_OPERATOR","LOCAL_ADMIN"].includes(roleResult.data))return;
  const accountModes=await _htpwebAccountModes();

  if(!document.querySelector('link[href*="authenticated-shell.css"]')){
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="../assets/authenticated-shell.css?v=20261004-shell4";
    document.head.appendChild(link);
  }

  const user=session.user;
  const displayName=user.user_metadata?.full_name||user.user_metadata?.name||"Mi cuenta";
  const escText=value=>String(value||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  header.className="htp-auth-header";
  header.innerHTML=
    '<div class="htp-auth-header-inner">'+
      '<a class="htp-auth-brand" href="../index.html"><img src="../assets/brand/Logo1-header.png" alt="HTPWEB"><span>HTPWEB</span></a>'+
      '<nav class="htp-auth-nav" aria-label="Navegación HTPWEB">'+
        '<a href="../index.html">Inicio</a>'+
        '<a href="../como-funciona.html">Cómo funciona</a>'+
        '<a href="../explorar-negocios.html">Explorar locales</a>'+
      '</nav>'+
      '<div class="htp-auth-account-menu">'+
        '<button id="adminHtpAccountTrigger" class="htp-auth-account" type="button"><span class="htp-auth-account-icon">👤</span><span>Mi cuenta</span><span>⌄</span></button>'+
        '<div id="adminHtpAccountDropdown" class="htp-auth-account-dropdown hidden">'+
          '<div class="htp-auth-account-summary"><strong>'+escText(displayName)+'</strong><small>'+escText(user.email)+'</small></div>'+
          _htpwebProfileSwitcherHtml(accountModes)+
          '<a href="../app/mi-cuenta.html">Abrir mi cuenta</a>'+
          '<a href="../app/configuracion.html">Configuración</a>'+
          '<div class="htp-auth-account-separator"></div>'+
          '<a href="../app/crear-local.html">Crear negocio</a>'+
          '<a href="../app/crear-delivery.html">Crear delivery</a>'+
        '</div>'+
      '</div>'+
    '</div>';

  const menu=header.querySelector(".htp-auth-account-menu");
  const trigger=header.querySelector("#adminHtpAccountTrigger");
  const dropdown=header.querySelector("#adminHtpAccountDropdown");
  if(trigger)trigger.onclick=e=>{e.preventDefault();e.stopPropagation();dropdown?.classList.toggle("hidden")};
  document.addEventListener("click",e=>{if(menu&&!menu.contains(e.target))dropdown?.classList.add("hidden")});
  _htpwebBindProfileSwitcher(header,{clientHref:"../index.html",workspaceHref:"./index.html"});
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded",()=>{instalarEncabezadoHTPWEB();instalarSelectorPerfilesCompacto();prepararEncabezadoDeliveryAdmin();});
} else {
  instalarEncabezadoHTPWEB();
  instalarSelectorPerfilesCompacto();
  prepararEncabezadoDeliveryAdmin();
}
