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
