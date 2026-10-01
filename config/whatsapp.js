function htpWhatsappNormalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  // HTPWEB opera inicialmente en Ecuador. Los números internacionales
  // ya guardados se conservan; solo normalizamos formatos locales comunes.
  if (/^0\d{9}$/.test(digits)) digits = "593" + digits.slice(1);
  else if (/^9\d{8}$/.test(digits)) digits = "593" + digits;

  if (!/^\d{8,15}$/.test(digits)) {
    throw new Error("El número de WhatsApp no tiene un formato válido.");
  }
  return digits;
}

function htpWhatsappAssistedUrl(phone, text) {
  const target = htpWhatsappNormalizePhone(phone);
  return "https://wa.me/" + target + "?text=" + encodeURIComponent(String(text || ""));
}

function htpWhatsappOpenAssisted(phone, text) {
  const url = htpWhatsappAssistedUrl(phone, text);
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) window.location.href = url;
  return url;
}

async function htpWhatsappInvoke(body) {
  if (typeof supabaseClient === "undefined" || !supabaseClient?.functions?.invoke) {
    throw new Error("Supabase Functions no está disponible.");
  }

  const { data, error } = await supabaseClient.functions.invoke("whatsapp-notify", {
    body
  });

  if (error) {
    const detail = data?.error || data?.message || error.message;
    throw new Error(detail || "No se pudo enviar el mensaje por WhatsApp.");
  }

  if (!data?.ok) {
    throw new Error(data?.error || "No se pudo enviar el mensaje por WhatsApp.");
  }

  return data;
}

function htpWhatsappOrderRef(orderId) {
  return String(orderId || "").replace(/-/g, "").slice(0, 8).toUpperCase();
}

async function htpWhatsappCustomerOrderSetting(deliveryId) {
  if (!deliveryId) return { enabled: false, reason: "DELIVERY_REQUIRED" };
  if (typeof supabaseClient === "undefined" || !supabaseClient?.rpc) {
    throw new Error("Supabase no está disponible.");
  }

  const { data, error } = await supabaseClient.rpc(
    "public_delivery_customer_order_whatsapp",
    { p_delivery_id: deliveryId }
  );

  if (error) throw error;
  return data || { enabled: false };
}

function htpWhatsappBuildCustomerOrderText(order, deliveryName) {
  if (!order?.id) throw new Error("Pedido inválido para WhatsApp.");

  const groups = Array.isArray(order.order_locals) ? order.order_locals : [];
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const brand = String(deliveryName || "DELIVERY").trim() || "DELIVERY";
  const lines = [
    "*" + brand + " · Pedido #" + htpWhatsappOrderRef(order.id) + "*",
    "",
    "*Cliente:* " + (order.customer_name || "Cliente"),
    "*Teléfono:* " + (order.customer_phone || "—"),
    "*Entrega:* " + (order.delivery_address || "—")
  ];

  if (order.address_reference) {
    lines.push("*Referencia:* " + order.address_reference);
  }

  const lat = Number(order.latitude);
  const lng = Number(order.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    lines.push("*Ubicación:* https://www.google.com/maps?q=" + lat + "," + lng);
  }

  lines.push("", "*Pedido:*");

  groups.forEach(group => {
    const localId = group.local_id;
    const localName = group.locals?.name || "LOCAL";
    const groupItems = items.filter(item => item.local_id === localId);

    lines.push("", "*" + localName + "*");
    if (groupItems.length) {
      groupItems.forEach(item => {
        const variant = item.variant_name ? " (" + item.variant_name + ")" : "";
        const promo = item.promotion_title ? " [PROMO: " + item.promotion_title + "]" : "";
        lines.push(
          "• " + Number(item.quantity || 0) + " x " +
          (item.product_name || "Producto") + variant + promo +
          " — $" + Number(item.subtotal || 0).toFixed(2)
        );
      });
    } else {
      lines.push("• Sin productos visibles");
    }

    lines.push(
      "Subtotal: $" + Number(group.subtotal || 0).toFixed(2) +
      " · Delivery: $" + Number(group.delivery_fee || 0).toFixed(2)
    );
  });

  lines.push(
    "",
    "*Subtotal productos:* $" + Number(order.subtotal || 0).toFixed(2),
    "*Delivery:* $" + Number(order.delivery_fee || 0).toFixed(2),
    "*TOTAL:* $" + Number(order.total || 0).toFixed(2)
  );

  if (order.notes) {
    lines.push("", "*Observaciones:* " + order.notes);
  }

  lines.push("", "Pedido registrado correctamente en " + brand + ".", "_Plataforma HTPWEB_");
  return lines.join("\n");
}

async function htpWhatsappProviderStatus(deliveryId) {
  if (!deliveryId) return { configured: false };

  try {
    return await htpWhatsappInvoke({
      kind: "STATUS",
      delivery_id: deliveryId
    });
  } catch (error) {
    return {
      ok: false,
      configured: false,
      local_order_configured: false,
      driver_dispatch_configured: false,
      error: error?.message || "Proveedor WhatsApp no disponible"
    };
  }
}

async function htpWhatsappSendAutomatic(payload) {
  return htpWhatsappInvoke(payload);
}

window.htpWhatsappNormalizePhone = htpWhatsappNormalizePhone;
window.htpWhatsappAssistedUrl = htpWhatsappAssistedUrl;
window.htpWhatsappOpenAssisted = htpWhatsappOpenAssisted;
window.htpWhatsappOrderRef = htpWhatsappOrderRef;
window.htpWhatsappCustomerOrderSetting = htpWhatsappCustomerOrderSetting;
window.htpWhatsappBuildCustomerOrderText = htpWhatsappBuildCustomerOrderText;
window.htpWhatsappProviderStatus = htpWhatsappProviderStatus;
window.htpWhatsappSendAutomatic = htpWhatsappSendAutomatic;
