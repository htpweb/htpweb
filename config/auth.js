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

function _htpwebAuthHeaderAllowed() {
  const excluded = new Set(["acceso.html","index.html","local.html","tienda.html","tienda-carrito.html","carrito.html"]);
  return !excluded.has(_htpwebAuthPageName());
}

function _htpwebAuthActiveHref() {
  const page=_htpwebAuthPageName();
  if (page==="mi-cuenta.html") return "account";
  if (["crear-local.html","reclamar-local.html","mis-reclamaciones.html"].includes(page)) return "business";
  return "";
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
        '<a href="../explorar-negocios.html">Locales</a>'+
      '</nav>'+
      '<div class="htp-auth-account-menu">'+
        '<button id="htpAuthAccountTrigger" class="htp-auth-account '+(active==="account"?"active":"")+'" type="button"><span class="htp-auth-account-icon">👤</span><span>Mi cuenta</span><span>⌄</span></button>'+
        '<div id="htpAuthAccountDropdown" class="htp-auth-account-dropdown hidden">'+
          '<div class="htp-auth-account-summary"><strong>'+String(displayName).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))+'</strong><small>'+String(user.email||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))+'</small></div>'+
          '<a href="mi-cuenta.html">Abrir mi cuenta</a>'+
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
  const logout=header.querySelector("#htpAuthLogout");
  logout?.addEventListener("click",async()=>{await cerrarSesion();location.href="../index.html"});
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", instalarEncabezadoHTPWEB);
} else {
  instalarEncabezadoHTPWEB();
}
