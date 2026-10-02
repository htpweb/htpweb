(() => {
  const escPromo = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));

  const dayNames = {
    0: "domingos",
    1: "lunes",
    2: "martes",
    3: "miércoles",
    4: "jueves",
    5: "viernes",
    6: "sábados"
  };

  let publicPromotions = [];
  let tabManaged = false;
  const mixSelections = new Map();
  let promotionViewerCard = null;

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

  function promotionIsAvailableNow(promotion) {
    return Boolean(promotion) && promotion.available_now !== false;
  }

  function formatDateTime(value) {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString("es-EC", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "";
    }
  }

  function promotionAvailabilityText(promotion) {
    if (!promotion) return "No disponible";

    if (promotionIsAvailableNow(promotion)) {
      if (localIsClosed()) {
        const info = typeof availabilityMessage === "function"
          ? availabilityMessage()
          : null;
        return info?.text || "Local cerrado";
      }
      return "Disponible ahora";
    }

    if (promotion.starts_at) {
      const start = new Date(promotion.starts_at);
      if (Number.isFinite(start.getTime()) && start.getTime() > Date.now()) {
        return "Disponible desde " + formatDateTime(promotion.starts_at);
      }
    }

    const days = Array.isArray(promotion.days_of_week)
      ? promotion.days_of_week.map(Number).filter(day => dayNames[day])
      : [];

    if (days.length === 1) return "Disponible los " + dayNames[days[0]];

    if (days.length > 1) {
      const labels = days.map(day => dayNames[day]);
      const last = labels.pop();
      return "Disponible " + labels.join(", ") + (labels.length ? " y " : "") + last;
    }

    return "No disponible en este momento";
  }

  function promotionDisabled(promotion) {
    return !promotionIsAvailableNow(promotion) || localIsClosed();
  }

  function promotionMixConfig(promotion) {
    if (!promotion || promotion.promotion_type !== "COMBO") return null;

    const items = Array.isArray(promotion.items) ? promotion.items : [];
    if (items.length !== 1) return null;

    const item = items[0];
    const variants = Array.isArray(item.variants) ? item.variants : [];
    const required = Number(item.quantity || 0);

    if (item.variant_id || required <= 1 || !variants.length) return null;

    return { item, variants, required };
  }

  function mixState(promotion) {
    const config = promotionMixConfig(promotion);
    if (!config) return null;

    if (!mixSelections.has(promotion.id)) {
      const initial = new Map();
      config.variants.forEach(variant => initial.set(variant.id, 0));
      mixSelections.set(promotion.id, initial);
    }

    return {
      config,
      quantities: mixSelections.get(promotion.id)
    };
  }

  function mixTotal(promotion) {
    const state = mixState(promotion);
    if (!state) return 0;
    return [...state.quantities.values()]
      .reduce((sum, value) => sum + Number(value || 0), 0);
  }

  function promotionSelectionSnapshot(promotion) {
    const state = mixState(promotion);
    if (!state) return [];

    return state.config.variants
      .map(variant => ({
        product_id: state.config.item.product_id,
        product_name: state.config.item.product_name,
        variant_id: variant.id,
        variant_name: variant.name,
        quantity: Number(state.quantities.get(variant.id) || 0)
      }))
      .filter(item => item.quantity > 0);
  }

  function ensurePromotionCanBeAdded(promotion, promotionItemId = null) {
    if (!promotion) throw new Error("La promoción ya no está disponible.");

    if (!promotionIsAvailableNow(promotion)) {
      throw new Error(promotionAvailabilityText(promotion));
    }

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

  function changeMix(promotionId, variantId, delta) {
    const promotion = findPromotion(promotionId);
    const state = mixState(promotion);

    if (!promotion || !state || promotionDisabled(promotion)) return 0;

    const variant = state.config.variants.find(item => item.id === variantId);
    if (!variant) return mixTotal(promotion);

    const current = Number(state.quantities.get(variantId) || 0);
    const total = mixTotal(promotion);
    let next = current + Number(delta || 0);

    if (next < 0) next = 0;
    if (Number(delta) > 0 && total >= state.config.required) next = current;

    state.quantities.set(variantId, next);
    syncMixUi(promotion);
    return mixTotal(promotion);
  }

  function addMixedPromotion(promotionId) {
    const promotion = findPromotion(promotionId);

    try {
      ensurePromotionCanBeAdded(promotion, null);

      const state = mixState(promotion);
      if (!state) throw new Error("Esta promoción no admite selección de variantes.");

      const total = mixTotal(promotion);
      if (total !== state.config.required) {
        throw new Error(
          "Selecciona exactamente " + state.config.required + " opciones para esta promoción."
        );
      }

      const selection = promotionSelectionSnapshot(promotion);

      carritoAgregar(negocioActual.slug, {
        kind: "PROMOTION",
        local_id: currentLocalId(),
        promotion_id: promotion.id,
        promotion_item_id: null,
        snapshot: {
          local_name: typeof localActual !== "undefined" ? localActual?.name || null : null,
          promotion_title: promotion.title,
          promotion_type: promotion.promotion_type,
          promotion_image_url: promotion.image_url || null,
          promotion_selection: selection,
          promotion_selection_required: state.config.required
        }
      }, 1);

      if (typeof updateCartCount === "function") updateCartCount();
      syncPromotionCounts();

      const errorBox = document.getElementById("error");
      errorBox?.classList.add("hidden");
      return promotionQuantity(promotion.id, null);
    } catch (error) {
      const errorBox = document.getElementById("error");
      if (errorBox) {
        errorBox.textContent = error.message || "No se pudo agregar la promoción.";
        errorBox.classList.remove("hidden");
      }
      return promotionQuantity(promotionId, null);
    }
  }

  function quantityControl(promotion, promotionItemId = null) {
    const promotionId = promotion.id;
    const itemArg = promotionItemId ? "'" + escPromo(promotionItemId) + "'" : "null";
    const key = promotionId + ":" + (promotionItemId || "");
    const disabled = promotionDisabled(promotion) ? "disabled" : "";

    return '<div class="promotion-buy-controls">' +
      '<div class="quantity-stepper" aria-label="Cantidad de promociones en carrito">' +
        '<button type="button" class="qty-step-btn" ' + disabled +
          ' onclick="event.stopPropagation();HTPWEBPromotions.change(\'' +
          escPromo(promotionId) + '\',' + itemArg + ',-1)">−</button>' +
        '<input type="number" min="0" value="' +
          promotionQuantity(promotionId, promotionItemId) +
          '" data-promotion-qty="' + escPromo(key) +
          '" aria-label="Cantidad en carrito" readonly>' +
        '<button type="button" class="qty-step-btn" ' + disabled +
          ' onclick="event.stopPropagation();HTPWEBPromotions.change(\'' +
          escPromo(promotionId) + '\',' + itemArg + ',1)">+</button>' +
      '</div>' +
    '</div>';
  }

  function renderMixPromotion(promotion, mix, disabled) {
    const state = mixState(promotion);
    const selectedTotal = mixTotal(promotion);
    const price = comboPrice(promotion);

    const rows = mix.variants.map(variant => {
      const quantity = Number(state.quantities.get(variant.id) || 0);
      const rowClass = quantity > 0 ? "promotion-mix-row has-quantity" : "promotion-mix-row";
      const dis = disabled ? "disabled" : "";

      return '<div id="promotion-mix-row-' + escPromo(promotion.id) + '-' +
        escPromo(variant.id) + '" class="' + rowClass + '">' +
          '<strong>' + escPromo(variant.name).toUpperCase() + '</strong>' +
          '<div class="quantity-stepper promotion-mix-stepper">' +
            '<button type="button" class="qty-step-btn" ' + dis +
              ' onclick="event.stopPropagation();HTPWEBPromotions.changeMix(\'' +
              escPromo(promotion.id) + '\',\'' + escPromo(variant.id) + '\',-1)">−</button>' +
            '<input id="promotion-mix-qty-' + escPromo(promotion.id) + '-' +
              escPromo(variant.id) + '" type="number" min="0" value="' +
              escPromo(quantity) + '" readonly aria-label="Cantidad ' +
              escPromo(variant.name) + '">' +
            '<button type="button" class="qty-step-btn" ' + dis +
              ' onclick="event.stopPropagation();HTPWEBPromotions.changeMix(\'' +
              escPromo(promotion.id) + '\',\'' + escPromo(variant.id) + '\',1)">+</button>' +
          '</div>' +
        '</div>';
    }).join("");

    const buttonDisabled = disabled || selectedTotal !== mix.required;
    const buttonText = disabled
      ? "No disponible"
      : selectedTotal === mix.required
        ? "Agregar promoción — $" + Number(price || 0).toFixed(2)
        : "Selecciona " + (mix.required - selectedTotal) + " más";

    return {
      itemsHtml:
        '<div class="promotion-mix">' +
          '<div class="promotion-mix-heading">' +
            '<strong>Elige tus ' + escPromo(mix.required) + ' picadas</strong>' +
            '<span id="promotion-mix-status-' + escPromo(promotion.id) +
              '" class="promotion-mix-status ' +
              (selectedTotal === mix.required ? "is-complete" : "") + '">' +
              escPromo(selectedTotal) + ' de ' + escPromo(mix.required) +
              ' seleccionadas</span>' +
          '</div>' +
          '<div class="promotion-mix-rows">' + rows + '</div>' +
        '</div>',
      actionHtml:
        '<div class="promotion-mix-action">' +
          '<button id="promotion-mix-add-' + escPromo(promotion.id) +
            '" class="btn btn-primary" type="button" ' +
            (buttonDisabled ? "disabled " : "") +
            'onclick="event.stopPropagation();HTPWEBPromotions.addMix(\'' +
            escPromo(promotion.id) + '\')">' +
            escPromo(buttonText) +
          '</button>' +
          '<span id="promotion-mix-added-' + escPromo(promotion.id) +
            '" class="promotion-mix-added">' +
            (promotionQuantity(promotion.id, null) > 0
              ? 'En carrito: ' + escPromo(promotionQuantity(promotion.id, null))
              : '') +
          '</span>' +
        '</div>'
    };
  }

  function syncMixUi(promotion) {
    const state = mixState(promotion);
    if (!state) return;

    const total = mixTotal(promotion);
    const required = state.config.required;
    const unavailable = promotionDisabled(promotion);

    state.config.variants.forEach(variant => {
      const qty = Number(state.quantities.get(variant.id) || 0);
      const input = document.getElementById(
        "promotion-mix-qty-" + promotion.id + "-" + variant.id
      );
      const row = document.getElementById(
        "promotion-mix-row-" + promotion.id + "-" + variant.id
      );

      if (input) input.value = qty;
      row?.classList.toggle("has-quantity", qty > 0);
    });

    const status = document.getElementById("promotion-mix-status-" + promotion.id);
    if (status) {
      status.textContent = total + " de " + required + " seleccionadas";
      status.classList.toggle("is-complete", total === required);
    }

    const addButton = document.getElementById("promotion-mix-add-" + promotion.id);
    if (addButton) {
      addButton.disabled = unavailable || total !== required;
      addButton.textContent = unavailable
        ? "No disponible"
        : total === required
          ? "Agregar promoción — $" + comboPrice(promotion).toFixed(2)
          : "Selecciona " + (required - total) + " más";
    }

    const added = document.getElementById("promotion-mix-added-" + promotion.id);
    if (added) {
      const quantity = promotionQuantity(promotion.id, null);
      added.textContent = quantity > 0 ? "En carrito: " + quantity : "";
    }
  }

  function ensurePromotionViewer() {
    let viewer = document.getElementById("promotionViewer");
    if (viewer) return viewer;

    viewer = document.createElement("div");
    viewer.id = "promotionViewer";
    viewer.className = "promotion-viewer hidden";
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.setAttribute("aria-label", "Promoción ampliada");
    viewer.innerHTML =
      '<div class="promotion-viewer-backdrop" data-promotion-viewer-backdrop="1"></div>' +
      '<div class="promotion-viewer-panel">' +
        '<button id="promotionViewerClose" class="media-viewer-close" type="button" aria-label="Cerrar">×</button>' +
        '<div class="promotion-viewer-image-wrap">' +
          '<img id="promotionViewerImage" class="promotion-viewer-image" alt="">' +
        '</div>' +
        '<div id="promotionViewerContent" class="promotion-viewer-content"></div>' +
      '</div>';

    document.body.appendChild(viewer);

    document.getElementById("promotionViewerClose").onclick = closePromotionViewer;
    viewer.onclick = event => {
      if (event.target?.dataset?.promotionViewerBackdrop === "1") {
        event.preventDefault();
      }
    };

    return viewer;
  }

  function openPromotionViewer(promotionId) {
    const promotion = findPromotion(promotionId);
    const card = document.getElementById("promotion-" + promotionId);
    if (!promotion || !card) return;

    closePromotionViewer();

    const viewer = ensurePromotionViewer();
    const content = document.getElementById("promotionViewerContent");
    const viewerImage = document.getElementById("promotionViewerImage");
    const sourceImage = card.querySelector(".promotion-card-image");
    const copy = card.querySelector(".promotion-card-copy");

    if (!content || !viewerImage || !sourceImage || !copy) return;

    promotionViewerCard = card;
    viewerImage.src = sourceImage.currentSrc || sourceImage.src;
    viewerImage.alt = sourceImage.alt || promotion.title || "Promoción";
    content.replaceChildren(copy);

    viewer.classList.remove("hidden");
    document.body.classList.add("promotion-viewer-open");
    syncPromotionCounts();
  }

  function closePromotionViewer() {
    const viewer = document.getElementById("promotionViewer");
    const content = document.getElementById("promotionViewerContent");

    if (promotionViewerCard && content) {
      const copy = content.querySelector(".promotion-card-copy");
      if (copy) promotionViewerCard.appendChild(copy);
    }

    promotionViewerCard = null;
    viewer?.classList.add("hidden");
    document.body.classList.remove("promotion-viewer-open");
  }

  function renderPromotionCard(promotion) {
    const items = Array.isArray(promotion.items) ? promotion.items : [];
    const isOptions = promotion.promotion_type === "OPTIONS";
    const disabled = promotionDisabled(promotion);
    const statusText = promotionAvailabilityText(promotion);
    const fallbackImage = items.find(item => item?.product_image_url)?.product_image_url || null;
    const promotionImage = promotion.image_url || fallbackImage;
    const image = promotionImage
      ? '<button class="promotion-image-button" type="button" aria-label="Ampliar promoción y comprar" ' +
          'onclick="HTPWEBPromotions.openViewer(\'' + escPromo(promotion.id) + '\')">' +
          '<img class="promotion-card-image" src="' + escPromo(promotionImage) + '" alt="' + escPromo(promotion.title) + '">' +
          '<span class="promotion-zoom-hint">🔍 Ver promoción y comprar</span>' +
        '</button>'
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
                quantityControl(promotion, item.id) +
                '<button class="btn btn-primary" type="button" ' +
                  (disabled ? 'disabled ' : '') +
                  'onclick="event.stopPropagation();HTPWEBPromotions.add(\'' +
                  escPromo(promotion.id) + '\',\'' + escPromo(item.id) + '\')">' +
                  (disabled ? 'No disponible' : 'Agregar') +
                '</button>' +
              '</div>' +
            '</div>';
          }).join("") + '</div>'
        : '<div class="muted">Esta promoción todavía no tiene opciones disponibles.</div>';
    } else {
      const total = comboPrice(promotion);
      const mix = promotionMixConfig(promotion);

      priceHtml = '<div class="promotion-total">Precio promocional: $' +
        Number(total || 0).toFixed(2) + '</div>';

      if (mix) {
        const renderedMix = renderMixPromotion(promotion, mix, disabled);
        itemsHtml = renderedMix.itemsHtml;
        actionHtml = renderedMix.actionHtml;
      } else {
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
              quantityControl(promotion, null) +
              '<button class="btn btn-primary" type="button" ' +
                (disabled ? 'disabled ' : '') +
                'onclick="event.stopPropagation();HTPWEBPromotions.add(\'' +
                escPromo(promotion.id) + '\',null)">' +
                (disabled ? 'No disponible' : 'Agregar promoción') +
              '</button>' +
            '</div>'
          : "";
      }
    }

    return '<div class="promotion-card ' +
      (disabled ? 'promotion-unavailable' : 'promotion-available') +
      '" id="promotion-' + escPromo(promotion.id) + '">' +
      image +
      '<div class="promotion-card-copy">' +
        '<div class="promotion-card-topline">' +
          '<span class="promotion-badge">PROMOCIÓN</span>' +
          '<span class="promotion-status ' +
            (disabled ? 'is-disabled' : 'is-available') + '">' +
            escPromo(statusText) +
          '</span>' +
        '</div>' +
        '<strong>' + escPromo(promotion.title) + '</strong>' +
        (isOptions
          ? '<div class="promotion-mode-label">Opciones alternativas</div>'
          : '<div class="promotion-mode-label">Combo / paquete</div>') +
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

    publicPromotions.forEach(syncMixUi);
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
      list.innerHTML = '<div class="empty">Este local no tiene promociones programadas.</div>';
      if (!tabManaged) card.classList.add("hidden");
      return;
    }

    list.innerHTML = publicPromotions.map(renderPromotionCard).join("");

    if (!tabManaged) {
      card.classList.remove("hidden");
    }

    syncPromotionCounts();
    requestAnimationFrame(focusRequestedPromotion);
  }

  async function loadPublicPromotions(forceCatalog = false) {
    const localId = currentLocalId();
    const card = document.getElementById("promotionsCard");
    const list = document.getElementById("promotionsListPublic");
    if (!localId || !card || !list || typeof supabaseClient === "undefined") return;

    const useCatalog = Boolean(
      forceCatalog ||
      tabManaged ||
      card.dataset.tabManaged === "true"
    );

    try {
      const rpcName = useCatalog
        ? "public_local_promotions_catalog"
        : "public_active_local_promotions";

      const { data, error } = await supabaseClient.rpc(rpcName, {
        p_local_id: localId
      });
      if (error) throw error;

      publicPromotions = Array.isArray(data) ? data : [];
      tabManaged = useCatalog;
      const promoTab = document.getElementById("visualPromotionsTab");
      if (promoTab) {
        promoTab.textContent = publicPromotions.length
          ? "PROMOCIONES · " + publicPromotions.length
          : "PROMOCIONES";
      }
      renderPublicPromotions();
    } catch (error) {
      console.warn("Promociones no disponibles:", error?.message || error);
      publicPromotions = [];
      renderPublicPromotions();
    }
  }

  function setTabManaged(enabled = true) {
    tabManaged = Boolean(enabled);
    const card = document.getElementById("promotionsCard");

    if (card) {
      card.dataset.tabManaged = tabManaged ? "true" : "false";
      if (tabManaged) card.classList.add("hidden");
    }

    if (tabManaged) {
      loadPublicPromotions(true);
    } else {
      loadPublicPromotions(false);
    }
  }

  function renderTab() {
    const card = document.getElementById("promotionsCard");
    if (!card) return;

    card.classList.remove("hidden");
    renderPublicPromotions();
  }

  window.HTPWEBPromotions = {
    add: addPromotion,
    change: changePromotionQuantity,
    changeMix,
    addMix: addMixedPromotion,
    openViewer: openPromotionViewer,
    closeViewer: closePromotionViewer,
    refresh: renderPublicPromotions,
    renderTab,
    setTabManaged,
    reloadCatalog: () => loadPublicPromotions(true),
    availabilityText: promotionAvailabilityText
  };

  window.addEventListener("htpweb:cart", syncPromotionCounts);
  window.addEventListener("htpweb:local-ready", renderPublicPromotions);
  window.addEventListener("htpweb:visual-menu-ready", () => setTabManaged(true));

  function boot() {
    const card = document.getElementById("promotionsCard");
    tabManaged = card?.dataset?.tabManaged === "true";
    loadPublicPromotions(tabManaged);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
