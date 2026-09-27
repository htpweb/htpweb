(() => {
  const escPromo = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));

  let publicPromotions = [];

  function currentLocalId() {
    const params = new URLSearchParams(location.search);
    return params.get("local") || params.get("id") || "";
  }

  function localIsClosed() {
    return typeof availability !== "undefined" && availability && availability.is_open !== true;
  }

  function promotionMatcher(promotionId, promotionItemId = null) {
    return {
      local_id: currentLocalId(),
      promotion_id: promotionId,
      promotion_item_id: promotionItemId || null
    };
  }

  function promotionQuantity(promotionId, promotionItemId = null) {
    if (
      typeof negocioActual === "undefined" ||
      !negocioActual?.slug ||
      typeof carritoCantidadPromocion !== "function"
    ) return 0;

    return carritoCantidadPromocion(
      negocioActual.slug,
      promotionMatcher(promotionId, promotionItemId)
    );
  }

  function comboPrice(promotion) {
    if (promotion.promotion_price !== null && promotion.promotion_price !== undefined) {
      return Number(promotion.promotion_price);
    }

    return (promotion.items || []).reduce((sum, item) => {
      const line = item.promo_price !== null && item.promo_price !== undefined
        ? Number(item.promo_price)
        : Number(item.regular_unit_price || 0) * Number(item.quantity || 1);
      return sum + line;
    }, 0);
  }

  function findPromotion(promotionId) {
    return publicPromotions.find(item => item.id === promotionId) || null;
  }

  function findPromotionItem(promotion, promotionItemId) {
    return (promotion?.items || []).find(item => item.id === promotionItemId) || null;
  }

  function ensurePromotionCanBeAdded(promotion, promotionItemId = null) {
    if (!promotion) throw new Error("La promoción ya no está disponible.");
    if (localIsClosed()) {
      const info = typeof availabilityMessage === "function" ? availabilityMessage() : null;
      throw new Error(info?.text || "Este LOCAL no está disponible para pedidos en este momento.");
    }

    const items = Array.isArray(promotion.items) ? promotion.items : [];
    if (!items.length) throw new Error("La promoción no tiene productos disponibles.");

    if (promotion.promotion_type === "OPTIONS") {
      const option = findPromotionItem(promotion, promotionItemId);
      if (!option) throw new Error("Selecciona una opción válida de la promoción.");
      if (option.promo_price === null || option.promo_price === undefined) {
        throw new Error("Esta opción no tiene precio promocional configurado.");
      }
      return option;
    }

    return null;
  }

  function addPromotion(promotionId, promotionItemId = null) {
    const promotion = findPromotion(promotionId);

    try {
      const option = ensurePromotionCanBeAdded(promotion, promotionItemId);

      carritoAgregar(negocioActual.slug, {
        kind: "PROMOTION",
        local_id: currentLocalId(),
        promotion_id: promotion.id,
        promotion_item_id: option?.id || null,
        snapshot: {
          local_name: typeof localActual !== "undefined" ? localActual?.name || null : null,
          promotion_title: promotion.title,
          promotion_type: promotion.promotion_type,
          promotion_image_url: promotion.image_url || null,
          option_name: option
            ? String(option.product_name || "Producto") +
              (option.variant_name ? " · " + option.variant_name : "")
            : null
        }
      }, 1);

      if (typeof updateCartCount === "function") updateCartCount();
      syncPromotionCounts();
      const errorBox = document.getElementById("error");
      errorBox?.classList.add("hidden");
      return promotionQuantity(promotionId, option?.id || null);
    } catch (error) {
      const errorBox = document.getElementById("error");
      if (errorBox) {
        errorBox.textContent = error.message || "No se pudo agregar la promoción.";
        errorBox.classList.remove("hidden");
      }
      return promotionQuantity(promotionId, promotionItemId);
    }
  }

  function changePromotionQuantity(promotionId, promotionItemId = null, delta = 1) {
    const promotion = findPromotion(promotionId);

    try {
      const option = ensurePromotionCanBeAdded(promotion, promotionItemId);
      const matcher = promotionMatcher(promotionId, option?.id || null);
      const current = promotionQuantity(promotionId, option?.id || null);

      if (Number(delta) > 0) {
        return addPromotion(promotionId, option?.id || null);
      }

      if (current <= 0) return 0;
      const next = Math.max(0, current - 1);
      if (next === 0) carritoEliminar(negocioActual.slug, matcher);
      else carritoCambiarCantidad(negocioActual.slug, matcher, next);

      if (typeof updateCartCount === "function") updateCartCount();
      syncPromotionCounts();
      return next;
    } catch (error) {
      const errorBox = document.getElementById("error");
      if (errorBox) {
        errorBox.textContent = error.message || "No se pudo cambiar la cantidad.";
        errorBox.classList.remove("hidden");
      }
      return promotionQuantity(promotionId, promotionItemId);
    }
  }

  function quantityControl(promotionId, promotionItemId = null) {
    const itemArg = promotionItemId ? `'${escPromo(promotionItemId)}'` : "null";
    const key = promotionId + ":" + (promotionItemId || "");
    const disabled = localIsClosed() ? "disabled" : "";
    return `
      <div class="promotion-buy-controls">
        <div class="quantity-stepper" aria-label="Cantidad de promociones en carrito">
          <button type="button" class="qty-step-btn" ${disabled}
            onclick="event.stopPropagation();HTPWEBPromotions.change('${escPromo(promotionId)}',${itemArg},-1)">−</button>
          <input type="number" min="0" value="${promotionQuantity(promotionId, promotionItemId)}"
            data-promotion-qty="${escPromo(key)}" aria-label="Cantidad en carrito" readonly>
          <button type="button" class="qty-step-btn" ${disabled}
            onclick="event.stopPropagation();HTPWEBPromotions.change('${escPromo(promotionId)}',${itemArg},1)">+</button>
        </div>
      </div>
    `;
  }

  function renderPromotionCard(promotion) {
    const items = Array.isArray(promotion.items) ? promotion.items : [];
    const isOptions = promotion.promotion_type === "OPTIONS";
    const image = promotion.image_url
      ? '<img src="' + escPromo(promotion.image_url) + '" alt="' + escPromo(promotion.title) + '">'
      : "";

    let priceHtml = "";
    let itemsHtml = "";
    let actionHtml = "";

    if (isOptions) {
      const optionPrices = items
        .map(item => Number(item.promo_price))
        .filter(Number.isFinite);
      if (optionPrices.length) {
        priceHtml = '<div class="promotion-total">Desde $' +
          Math.min(...optionPrices).toFixed(2) + '</div>';
      }

      itemsHtml = items.length
        ? '<div class="promotion-options"><div class="promotion-mode-label">Elige una opción</div>' +
          items.map(item => {
            const label = String(item.product_name || "Producto") +
              (item.variant_name ? " · " + item.variant_name : "");
            const price = item.promo_price !== null && item.promo_price !== undefined
              ? Number(item.promo_price).toFixed(2)
              : "—";
            return '<div class="promotion-option">' +
              '<div class="promotion-option-copy"><strong>' +
                escPromo(item.quantity || 1) + '× ' + escPromo(label) +
              '</strong><span>$' + escPromo(price) + '</span></div>' +
              '<div class="promotion-option-actions">' +
                quantityControl(promotion.id, item.id) +
                '<button class="btn btn-primary" type="button" ' +
                  (localIsClosed() ? 'disabled ' : '') +
                  'onclick="event.stopPropagation();HTPWEBPromotions.add(\'' + escPromo(promotion.id) + '\',\'' + escPromo(item.id) + '\')">' +
                  (localIsClosed() ? 'Local cerrado' : 'Agregar') +
                '</button>' +
              '</div>' +
            '</div>';
          }).join("") + '</div>'
        : '<div class="muted">Esta promoción todavía no tiene opciones disponibles.</div>';
    } else {
      const total = comboPrice(promotion);
      priceHtml = '<div class="promotion-total">Precio promocional: $' +
        Number(total || 0).toFixed(2) + '</div>';

      itemsHtml = items.length
        ? '<div class="promotion-items">' + items.map(item => {
            const label = String(item.product_name || "Producto") +
              (item.variant_name ? " · " + item.variant_name : "");
            return '<div><strong>' + escPromo(item.quantity || 1) + '×</strong> ' +
              escPromo(label) + '</div>';
          }).join("") + '</div>'
        : '<div class="muted">Este combo todavía no tiene productos disponibles.</div>';

      actionHtml = items.length
        ? '<div class="promotion-combo-action">' +
            quantityControl(promotion.id, null) +
            '<button class="btn btn-primary" type="button" ' +
              (localIsClosed() ? 'disabled ' : '') +
              'onclick="event.stopPropagation();HTPWEBPromotions.add(\'' + escPromo(promotion.id) + '\',null)">' +
              (localIsClosed() ? 'Local cerrado' : 'Agregar promoción') +
            '</button>' +
          '</div>'
        : "";
    }

    return '<div class="promotion-card" id="promotion-' + escPromo(promotion.id) + '">' +
      image +
      '<div class="promotion-card-copy">' +
        '<span class="promotion-badge">PROMOCIÓN</span>' +
        '<strong>' + escPromo(promotion.title) + '</strong>' +
        (isOptions ? '<div class="promotion-mode-label">Opciones alternativas</div>' : '<div class="promotion-mode-label">Combo / paquete</div>') +
        priceHtml +
        itemsHtml +
        (promotion.body ? '<p>' + escPromo(promotion.body) + '</p>' : '') +
        actionHtml +
      '</div>' +
    '</div>';
  }

  function syncPromotionCounts() {
    document.querySelectorAll("[data-promotion-qty]").forEach(input => {
      const key = String(input.dataset.promotionQty || "");
      const splitAt = key.indexOf(":");
      const promotionId = splitAt >= 0 ? key.slice(0, splitAt) : key;
      const promotionItemId = splitAt >= 0 ? key.slice(splitAt + 1) || null : null;
      input.value = promotionQuantity(promotionId, promotionItemId);
    });
  }

  function focusRequestedPromotion() {
    const promotionId = new URLSearchParams(location.search).get("promotion");
    if (!promotionId) return;
    const target = document.getElementById("promotion-" + promotionId);
    if (!target) return;
    target.classList.add("promotion-target");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function renderPublicPromotions() {
    const card = document.getElementById("promotionsCard");
    const list = document.getElementById("promotionsListPublic");
    if (!card || !list) return;

    if (!publicPromotions.length) {
      card.classList.add("hidden");
      return;
    }

    list.innerHTML = publicPromotions.map(renderPromotionCard).join("");
    card.classList.remove("hidden");
    syncPromotionCounts();
    requestAnimationFrame(focusRequestedPromotion);
  }

  async function loadPublicPromotions() {
    const localId = currentLocalId();
    const card = document.getElementById("promotionsCard");
    const list = document.getElementById("promotionsListPublic");
    if (!localId || !card || !list || typeof supabaseClient === "undefined") return;

    try {
      const { data, error } = await supabaseClient.rpc("public_active_local_promotions", {
        p_local_id: localId
      });
      if (error) throw error;

      publicPromotions = Array.isArray(data) ? data : [];
      renderPublicPromotions();
    } catch (error) {
      console.warn("Promociones no disponibles:", error?.message || error);
      publicPromotions = [];
      card.classList.add("hidden");
    }
  }

  window.HTPWEBPromotions = {
    add: addPromotion,
    change: changePromotionQuantity,
    refresh: renderPublicPromotions
  };

  window.addEventListener("htpweb:cart", syncPromotionCounts);
  window.addEventListener("htpweb:local-ready", renderPublicPromotions);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadPublicPromotions, { once: true });
  } else {
    loadPublicPromotions();
  }
})();
