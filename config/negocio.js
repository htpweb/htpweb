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
