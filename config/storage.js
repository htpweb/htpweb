const HTPWEB_MEDIA_BUCKET = "htpweb-media";
const HTPWEB_IMAGE_TYPES = new Set(["image/jpeg","image/png","image/webp","image/gif"]);
const HTPWEB_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function validarImagenHTPWEB(file) {
  if (!file) throw new Error("Selecciona una imagen.");
  if (!HTPWEB_IMAGE_TYPES.has(file.type)) {
    throw new Error("Formato no permitido. Usa JPG, PNG, WEBP o GIF.");
  }
  if (file.size > HTPWEB_MAX_IMAGE_BYTES) {
    throw new Error("La imagen supera el máximo de 5 MB.");
  }
}

function mediaPathDelivery(deliveryId, kind = "logo") {
  return `delivery/${deliveryId}/${kind}`;
}

function mediaPathLocal(localId, kind) {
  return `local/${localId}/${kind}`;
}

function mediaPathProduct(productId) {
  return `product/${productId}/image`;
}

function pathDesdePublicUrlHTPWEB(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url, location.origin);
    const marker = "/storage/v1/object/public/" + HTPWEB_MEDIA_BUCKET + "/";
    const idx = parsed.pathname.indexOf(marker);
    if (idx < 0) return null;
    return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
  } catch {
    return null;
  }
}

async function subirImagenHTPWEB(path, file) {
  validarImagenHTPWEB(file);

  const { error } = await supabaseClient.storage
    .from(HTPWEB_MEDIA_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "60"
    });

  if (error) throw error;

  const { data } = supabaseClient.storage
    .from(HTPWEB_MEDIA_BUCKET)
    .getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error("No se pudo generar la URL pública de la imagen.");
  }

  return {
    path,
    url: data.publicUrl + "?v=" + Date.now()
  };
}

async function eliminarObjetoMediaHTPWEB(path) {
  if (!path) return;

  const { error } = await supabaseClient.storage
    .from(HTPWEB_MEDIA_BUCKET)
    .remove([path]);

  if (error) throw error;
}
