async function listarMisDireccionesCliente({ soloActivas = true } = {}) {
  let query = supabaseClient
    .from("customer_addresses")
    .select("id,label,address,reference,latitude,longitude,is_default,active,updated_at")
    .order("is_default", { ascending: false })
    .order("label");

  if (soloActivas) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function guardarMiDireccionCliente({
  id = null,
  label,
  address,
  reference = null,
  latitude = null,
  longitude = null,
  isDefault = false,
  active = true
}) {
  const { data, error } = await supabaseClient.rpc("save_my_customer_address", {
    p_address_id: id,
    p_label: String(label || "").trim(),
    p_address: String(address || "").trim(),
    p_reference: String(reference || "").trim() || null,
    p_latitude: latitude === null || latitude === undefined ? null : Number(latitude),
    p_longitude: longitude === null || longitude === undefined ? null : Number(longitude),
    p_is_default: Boolean(isDefault),
    p_active: Boolean(active)
  });

  if (error) throw error;

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}

async function desactivarMiDireccionCliente(addressRecord) {
  if (!addressRecord?.id) {
    throw new Error("Dirección inválida.");
  }

  return guardarMiDireccionCliente({
    id: addressRecord.id,
    label: addressRecord.label,
    address: addressRecord.address,
    reference: addressRecord.reference,
    latitude: addressRecord.latitude,
    longitude: addressRecord.longitude,
    isDefault: false,
    active: false
  });
}
