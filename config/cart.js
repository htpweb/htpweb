const HTPWEB_CART_VERSION = 2;

function cartKey(deliverySlug) {
  return `HTPWEB_CART_V${HTPWEB_CART_VERSION}:${deliverySlug}`;
}

function normalizarItemCart(item) {
  const localId = String(item.local_id || "");
  const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
  const promotionId = item.promotion_id ? String(item.promotion_id) : null;

  if (promotionId) {
    return {
      kind: "PROMOTION",
      local_id: localId,
      promotion_id: promotionId,
      promotion_item_id: item.promotion_item_id ? String(item.promotion_item_id) : null,
      quantity,
      snapshot: item.snapshot || null
    };
  }

  return {
    kind: "PRODUCT",
    local_id: localId,
    product_id: String(item.product_id || ""),
    variant_id: item.variant_id ? String(item.variant_id) : null,
    quantity,
    snapshot: item.snapshot || null
  };
}

function carritoObtener(deliverySlug) {
  try {
    const raw = sessionStorage.getItem(cartKey(deliverySlug));
    const data = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    return data
      .filter(x => x?.local_id && (x?.product_id || x?.promotion_id))
      .map(normalizarItemCart);
  } catch {
    return [];
  }
}

function carritoGuardar(deliverySlug, items) {
  const clean = (items || [])
    .filter(x => x?.local_id && (x?.product_id || x?.promotion_id) && Number(x.quantity) > 0)
    .map(normalizarItemCart);

  sessionStorage.setItem(cartKey(deliverySlug), JSON.stringify(clean));
  window.dispatchEvent(new CustomEvent("htpweb:cart", { detail: clean }));
  return clean;
}

function carritoCoincide(item, matcher) {
  const localId = String(matcher?.local_id || "");
  const promotionId = matcher?.promotion_id ? String(matcher.promotion_id) : null;

  if (promotionId) {
    const promotionItemId = matcher?.promotion_item_id ? String(matcher.promotion_item_id) : null;
    return item.local_id === localId &&
      item.promotion_id === promotionId &&
      (item.promotion_item_id || null) === promotionItemId;
  }

  const productId = String(matcher?.product_id || "");
  const variantId = matcher?.variant_id ? String(matcher.variant_id) : null;
  return item.local_id === localId &&
    item.product_id === productId &&
    (item.variant_id || null) === variantId &&
    !item.promotion_id;
}

function carritoAgregar(deliverySlug, item, quantity = 1) {
  const items = carritoObtener(deliverySlug);
  const incoming = normalizarItemCart({ ...item, quantity });
  const index = items.findIndex(x => carritoCoincide(x, incoming));

  if (index >= 0) {
    items[index].quantity += incoming.quantity;
    if (incoming.snapshot) items[index].snapshot = incoming.snapshot;
  } else {
    items.push(incoming);
  }

  return carritoGuardar(deliverySlug, items);
}

function carritoCantidadItem(deliverySlug, matcher) {
  return carritoObtener(deliverySlug)
    .filter(item => carritoCoincide(item, matcher))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function carritoCantidadPromocion(deliverySlug, matcher) {
  return carritoCantidadItem(deliverySlug, {
    local_id: matcher?.local_id,
    promotion_id: matcher?.promotion_id,
    promotion_item_id: matcher?.promotion_item_id || null
  });
}

function carritoCambiarCantidad(deliverySlug, matcher, quantity) {
  const items = carritoObtener(deliverySlug);
  const next = items.map(item =>
    carritoCoincide(item, matcher)
      ? { ...item, quantity: Number(quantity) }
      : item
  );

  return carritoGuardar(deliverySlug, next);
}

function carritoEliminar(deliverySlug, matcher) {
  const items = carritoObtener(deliverySlug)
    .filter(item => !carritoCoincide(item, matcher));

  return carritoGuardar(deliverySlug, items);
}

function carritoVaciar(deliverySlug) {
  sessionStorage.removeItem(cartKey(deliverySlug));
  window.dispatchEvent(new CustomEvent("htpweb:cart", { detail: [] }));
}

function carritoCantidad(deliverySlug) {
  return carritoObtener(deliverySlug)
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}
