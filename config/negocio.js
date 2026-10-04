let negocio = null;

function obtenerDeliverySlug() {
  const params = new URLSearchParams(window.location.search);
  return params.get("delivery") || params.get("cliente") || "";
}

async function cargarNegocio() {
  const slug = obtenerDeliverySlug();

  if (!slug) {
    throw new Error("No se especificó el delivery.");
  }

  let { data, error } = await supabaseClient
    .from("deliveries")
    .select("id,name,slug,public_share_path,description,logo_url,phone,whatsapp,city_id,theme_key,active")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (!data && !error) {
    const byPublicPath = await supabaseClient
      .from("deliveries")
      .select("id,name,slug,public_share_path,description,logo_url,phone,whatsapp,city_id,theme_key,active")
      .ilike("public_share_path", slug)
      .eq("active", true)
      .maybeSingle();
    data = byPublicPath.data;
    error = byPublicPath.error;
  }

  if (error || !data) {
    throw new Error("Delivery no encontrado o inactivo.");
  }

  negocio = data;
  htpApplyDeliveryTheme(negocio);
  return negocio;
}

function urlDelivery(path, extra = {}) {
  const slug = negocio?.slug || obtenerDeliverySlug();
  const params = new URLSearchParams({ delivery: slug });

  Object.entries(extra).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  return `${path}?${params.toString()}`;
}



const HTPWEB_DELIVERY_THEMES = {
  HTPWEB:    { primary:"#e53935", dark:"#111111", accent:"#e53935", onPrimary:"#ffffff", onDark:"#ffffff", soft:"#fff3f2" },
  OCEAN:     { primary:"#1565c0", dark:"#0d2340", accent:"#42a5f5", onPrimary:"#ffffff", onDark:"#ffffff", soft:"#eef6ff" },
  SKY:       { primary:"#0288d1", dark:"#0b3550", accent:"#4fc3f7", onPrimary:"#ffffff", onDark:"#ffffff", soft:"#eefaff" },
  FOREST:    { primary:"#2e7d32", dark:"#153a20", accent:"#66bb6a", onPrimary:"#ffffff", onDark:"#ffffff", soft:"#f1f8f2" },
  SUNSET:    { primary:"#ef6c00", dark:"#2f1b0d", accent:"#ff9800", onPrimary:"#ffffff", onDark:"#ffffff", soft:"#fff7ed" },
  PURPLE:    { primary:"#7b1fa2", dark:"#2d1238", accent:"#ab47bc", onPrimary:"#ffffff", onDark:"#ffffff", soft:"#faf1fd" },
  TURQUOISE: { primary:"#00897b", dark:"#083c37", accent:"#26a69a", onPrimary:"#ffffff", onDark:"#ffffff", soft:"#eefaf8" },
  GRAPHITE:  { primary:"#455a64", dark:"#172127", accent:"#78909c", onPrimary:"#ffffff", onDark:"#ffffff", soft:"#f3f6f7" }
};

function htpApplyDeliveryTheme(delivery) {
  const key = String(delivery?.theme_key || "HTPWEB").toUpperCase();
  const theme = HTPWEB_DELIVERY_THEMES[key] || HTPWEB_DELIVERY_THEMES.HTPWEB;
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", theme.primary);
  root.style.setProperty("--brand-dark", theme.dark);
  root.style.setProperty("--brand-accent", theme.accent);
  root.style.setProperty("--brand-on-primary", theme.onPrimary);
  root.style.setProperty("--brand-on-dark", theme.onDark);
  root.style.setProperty("--brand-soft", theme.soft);
  const resolvedKey = HTPWEB_DELIVERY_THEMES[key] ? key : "HTPWEB";
  root.dataset.deliveryTheme = resolvedKey;
  root.classList.remove("delivery-theme-pending");
  try {
    const slug = String(delivery?.slug || obtenerDeliverySlug() || "").trim();
    if (slug) window.sessionStorage.setItem("HTPWEB_THEME:" + slug, resolvedKey);
  } catch {}
}

function htpDeliveryInitials(name) {
  return String(name || "D")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("") || "D";
}

function htpApplyDeliveryBrand(delivery, options = {}) {
  if (!delivery) return;
  const name = String(delivery.name || "DELIVERY").trim() || "DELIVERY";
  const brandEl = document.getElementById(options.brandId || "brand");
  const logoEl = document.getElementById(options.logoId || "deliveryLogo");
  const fallbackEl = document.getElementById(options.fallbackId || "deliveryLogoFallback");
  const platformEl = document.getElementById(options.platformId || "platformBrand");

  if (brandEl) brandEl.textContent = name;
  if (platformEl) platformEl.textContent = options.platformText || "by HTPWEB";

  if (fallbackEl) {
    fallbackEl.textContent = htpDeliveryInitials(name);
    fallbackEl.classList.remove("hidden");
  }

  if (logoEl) {
    if (delivery.logo_url) {
      logoEl.src = delivery.logo_url;
      logoEl.alt = "Logo de " + name;
      logoEl.classList.remove("hidden");
      logoEl.onerror = () => {
        logoEl.classList.add("hidden");
        fallbackEl?.classList.remove("hidden");
      };
      logoEl.onload = () => fallbackEl?.classList.add("hidden");
    } else {
      logoEl.removeAttribute("src");
      logoEl.classList.add("hidden");
    }
  }

  const prefix = String(options.titlePrefix || "").trim();
  document.title = prefix ? prefix + " | " + name : name;
}

window.HTPWEB_DELIVERY_THEMES = HTPWEB_DELIVERY_THEMES;
window.htpApplyDeliveryTheme = htpApplyDeliveryTheme;
window.htpDeliveryInitials = htpDeliveryInitials;
window.htpApplyDeliveryBrand = htpApplyDeliveryBrand;
