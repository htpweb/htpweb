const HTPWEB_CART_VERSION = 2;

function cartKey(deliverySlug) {
  return `HTPWEB_CART_V${HTPWEB_CART_VERSION}:${deliverySlug}`;
}

function normalizarItemCart(item) {
  return {
    local_id: String(item.local_id),
    product_id: String(item.product_id),
    variant_id: item.variant_id ? String(item.variant_id) : null,
    quantity: Math.max(1, Number.parseInt(item.quantity, 10) || 1),
    snapshot: item.snapshot || null
  };
}

function carritoObtener(deliverySlug) {
  try {
    const raw = sessionStorage.getItem(cartKey(deliverySlug));
    const data = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    return data
      .filter(x => x?.local_id && x?.product_id)
      .map(normalizarItemCart);
  } catch {
    return [];
  }
}

function carritoGuardar(deliverySlug, items) {
  const clean = (items || [])
    .filter(x => x?.local_id && x?.product_id && Number(x.quantity) > 0)
    .map(normalizarItemCart);

  sessionStorage.setItem(cartKey(deliverySlug), JSON.stringify(clean));
  window.dispatchEvent(new CustomEvent("htpweb:cart", { detail: clean }));
  return clean;
}

function carritoAgregar(deliverySlug, item, quantity = 1) {
  const items = carritoObtener(deliverySlug);
  const incoming = normalizarItemCart({ ...item, quantity });
  const index = items.findIndex(x =>
    x.local_id === incoming.local_id &&
    x.product_id === incoming.product_id &&
    (x.variant_id || null) === (incoming.variant_id || null)
  );

  if (index >= 0) {
    items[index].quantity += incoming.quantity;
    if (incoming.snapshot) items[index].snapshot = incoming.snapshot;
  } else {
    items.push(incoming);
  }

  return carritoGuardar(deliverySlug, items);
}

function carritoCantidadItem(deliverySlug, matcher) {
  const localId = String(matcher?.local_id || "");
  const productId = String(matcher?.product_id || "");
  const variantId = matcher?.variant_id ? String(matcher.variant_id) : null;

  return carritoObtener(deliverySlug)
    .filter(item =>
      item.local_id === localId &&
      item.product_id === productId &&
      (item.variant_id || null) === variantId
    )
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function carritoCambiarCantidad(deliverySlug, matcher, quantity) {
  const items = carritoObtener(deliverySlug);
  const next = items.map(item => {
    const match =
      item.local_id === String(matcher.local_id) &&
      item.product_id === String(matcher.product_id) &&
      (item.variant_id || null) === (matcher.variant_id ? String(matcher.variant_id) : null);

    return match ? { ...item, quantity: Number(quantity) } : item;
  });

  return carritoGuardar(deliverySlug, next);
}

function carritoEliminar(deliverySlug, matcher) {
  const items = carritoObtener(deliverySlug).filter(item => !(
    item.local_id === String(matcher.local_id) &&
    item.product_id === String(matcher.product_id) &&
    (item.variant_id || null) === (matcher.variant_id ? String(matcher.variant_id) : null)
  ));

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
