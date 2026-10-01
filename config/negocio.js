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

  const { data, error } = await supabaseClient
    .from("deliveries")
    .select("id,name,slug,description,logo_url,phone,whatsapp,city_id,active")
    .eq("slug", slug)
    .eq("active", true)
    .single();

  if (error || !data) {
    throw new Error("Delivery no encontrado o inactivo.");
  }

  negocio = data;
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

window.htpDeliveryInitials = htpDeliveryInitials;
window.htpApplyDeliveryBrand = htpApplyDeliveryBrand;
