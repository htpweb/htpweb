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
  if (!window.supabaseClient?.functions?.invoke) {
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
window.htpWhatsappProviderStatus = htpWhatsappProviderStatus;
window.htpWhatsappSendAutomatic = htpWhatsappSendAutomatic;
