(() => {
  let bound = false;

  function promotionDayText(value) {
    if (!value) return "día seleccionado";
    return new Date(String(value) + "T12:00:00").toLocaleDateString("es-EC", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function renderDeliveryPromotions(result) {
    const list = $("deliveryPromotionsList");
    const summary = $("deliveryPromotionsSummary");
    if (!list || !summary) return;

    const promotions = Array.isArray(result?.promotions) ? result.promotions : [];
    const localCount = new Set(promotions.map(item => item.local_id)).size;
    const offset = Number(result?.day_offset || 0);
    const prefix = offset === 0 ? "Hoy" : offset === 1 ? "Mañana" : "Día seleccionado";
    summary.innerHTML =
      "<strong>" + esc(prefix + " · " + promotionDayText(result?.target_date)) + "</strong>" +
      "<div style=\"margin-top:5px\">" + esc(promotions.length) + " promociones · " +
      esc(localCount) + " LOCAL</div>";

    if (!promotions.length) {
      list.innerHTML = '<div class="muted">No hay promociones publicadas para este día.</div>';
      return;
    }

    list.innerHTML = promotions.map(promotion => {
      const items = Array.isArray(promotion.items) ? promotion.items : [];
      const itemText = items.length
        ? items.map(item => {
            const price = item.promo_price !== null && item.promo_price !== undefined
              ? " · promo $" + Number(item.promo_price).toFixed(2)
              : "";
            return '<div><strong>' + esc(item.quantity || 1) + '×</strong> ' +
              esc((item.product_name || "Producto") + price) + '</div>';
          }).join("")
        : '<div class="muted">Sin detalle de productos.</div>';

      const total = promotion.promotion_price !== null && promotion.promotion_price !== undefined
        ? '<strong style="font-size:1.05rem">$' + Number(promotion.promotion_price).toFixed(2) + '</strong>'
        : "";

      return '<div class="workspace-note">' +
        '<div class="row between" style="gap:12px;align-items:flex-start">' +
          '<div>' +
            '<span class="badge">PROMOCIÓN</span>' +
            '<h3 style="margin:7px 0 3px">' + esc(promotion.title) + '</h3>' +
            '<div><strong>LOCAL:</strong> ' + esc(promotion.local_name || "—") + '</div>' +
          '</div>' +
          total +
        '</div>' +
        (promotion.body ? '<p style="margin:.65rem 0">' + esc(promotion.body) + '</p>' : '') +
        '<div style="margin-top:8px">' + itemText + '</div>' +
      '</div>';
    }).join("");
  }

  async function loadDeliveryPromotionsPanel() {
    const deliverySelect = $("deliveryPromotionsDelivery");
    const daySelect = $("deliveryPromotionsDay");
    if (!deliverySelect || !daySelect) return;

    const deliveries = Array.isArray(state.deliveries) ? state.deliveries.filter(d => d.active !== false) : [];
    const previous = deliverySelect.value;
    deliverySelect.innerHTML = deliveries.map(d =>
      '<option value="' + esc(d.id) + '">' + esc(d.name) + '</option>'
    ).join("");
    if (previous && deliveries.some(d => d.id === previous)) deliverySelect.value = previous;

    const deliveryId = deliverySelect.value || deliveries[0]?.id || "";
    if (!deliveryId) {
      $("deliveryPromotionsSummary").textContent = "No hay DELIVERY disponible.";
      $("deliveryPromotionsList").innerHTML = "";
      return;
    }

    $("deliveryPromotionsList").innerHTML = '<div class="muted">Cargando promociones...</div>';

    try {
      const result = await rpc("public_delivery_promotions", {
        p_delivery_id: deliveryId,
        p_day_offset: Math.max(0, Math.min(30, Number.parseInt(daySelect.value || "0", 10) || 0))
      });
      renderDeliveryPromotions(result || {});
    } catch (error) {
      $("deliveryPromotionsSummary").textContent = "No se pudieron cargar las promociones.";
      $("deliveryPromotionsList").innerHTML =
        '<div class="message error">' + esc(error.message || "Error al consultar promociones.") + '</div>';
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    $("deliveryPromotionsDelivery")?.addEventListener("change", loadDeliveryPromotionsPanel);
    $("deliveryPromotionsDay")?.addEventListener("change", loadDeliveryPromotionsPanel);
  }

  window.loadDeliveryPromotionsPanel = async function () {
    bind();
    await loadDeliveryPromotionsPanel();
  };

  document.addEventListener("DOMContentLoaded", bind);
})();