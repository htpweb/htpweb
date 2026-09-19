(() => {
  const seen = new Set();

  const cleanId = value => {
    const text = String(value || "").trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
      ? text
      : null;
  };

  function contextFromLocation() {
    const params = new URLSearchParams(location.search);
    return {
      local_id: cleanId(params.get("local")),
      product_id: cleanId(params.get("product"))
    };
  }

  async function deliveryId() {
    try {
      const delivery = typeof cargarNegocio === "function" ? await cargarNegocio() : null;
      return cleanId(delivery?.id);
    } catch (_) {
      return null;
    }
  }

  async function track(eventType, details = {}, options = {}) {
    try {
      if (!window.supabaseClient?.rpc) return;

      const locationContext = contextFromLocation();
      const delivery = cleanId(details.delivery_id) || await deliveryId();
      const local = cleanId(details.local_id) || locationContext.local_id;
      const product = cleanId(details.product_id) || locationContext.product_id;
      const advertisement = cleanId(details.advertisement_id);
      const metadata = details.metadata && typeof details.metadata === "object" && !Array.isArray(details.metadata)
        ? details.metadata
        : {};

      const dedupeKey = options.dedupeKey || null;
      if (dedupeKey && seen.has(dedupeKey)) return;
      if (dedupeKey) seen.add(dedupeKey);

      const { error } = await supabaseClient.rpc("record_analytics_event", {
        p_event_type: String(eventType || "").toUpperCase(),
        p_delivery_id: delivery,
        p_local_id: local,
        p_product_id: product,
        p_advertisement_id: advertisement,
        p_metadata: metadata
      });

      if (error) {
        if (dedupeKey) seen.delete(dedupeKey);
        console.warn("Analytics no disponible:", error.message || error);
      }
    } catch (error) {
      console.warn("No se pudo registrar Analytics:", error);
    }
  }

  function pageEvent() {
    const page = location.pathname.split("/").pop() || "index.html";
    if (page === "local.html") return "LOCAL_VIEW";
    if (page === "carrito.html") return "CART_VIEW";
    if (page === "pedidos.html") return "ORDERS_VIEW";
    return "PAGE_VIEW";
  }

  async function trackPage() {
    const event = pageEvent();
    await track(event, { metadata: { page: location.pathname } }, {
      dedupeKey: `page:${location.pathname}:${location.search}`
    });

    const product = contextFromLocation().product_id;
    if (product) {
      await track("PRODUCT_VIEW", { product_id: product }, {
        dedupeKey: `product:${product}:${location.search}`
      });
    }
  }

  window.HTPWEBAnalytics = { track, trackPage };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", trackPage, { once: true });
  } else {
    trackPage();
  }
})();
