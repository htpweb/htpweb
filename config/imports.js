const HTPWEB_IMPORT_BUCKET = "htpweb-imports";
const HTPWEB_MENU_IMAGE_TYPES = new Set(["image/jpeg","image/png","image/webp"]);
const HTPWEB_MENU_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const HTPWEB_MENU_MAX_IMAGES = 5;

function extensionMenuHTPWEB(file) {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  throw new Error("Formato no permitido.");
}

function validarImagenMenuHTPWEB(file) {
  if (!file) throw new Error("Selecciona una imagen.");
  if (!HTPWEB_MENU_IMAGE_TYPES.has(file.type)) {
    throw new Error("Formato no permitido. Usa JPG, PNG o WEBP.");
  }
  if (file.size <= 0 || file.size > HTPWEB_MENU_MAX_IMAGE_BYTES) {
    throw new Error("Cada imagen debe pesar entre 1 byte y 10 MB.");
  }
}

function validarImagenesMenuHTPWEB(files) {
  const list = Array.from(files || []);
  if (!list.length) throw new Error("Selecciona al menos una imagen del menú.");
  if (list.length > HTPWEB_MENU_MAX_IMAGES) {
    throw new Error("Puedes analizar como máximo 5 imágenes por importación.");
  }
  list.forEach(validarImagenMenuHTPWEB);
  return list;
}

async function subirImagenesMenuHTPWEB(deliveryId, files) {
  const list = validarImagenesMenuHTPWEB(files);
  if (!deliveryId) throw new Error("Selecciona un DELIVERY.");

  const batchId = crypto.randomUUID();
  const uploaded = [];

  try {
    for (let i = 0; i < list.length; i += 1) {
      const file = list[i];
      const ext = extensionMenuHTPWEB(file);
      const path = `delivery/${deliveryId}/${batchId}/menu-${String(i + 1).padStart(2, "0")}.${ext}`;

      const { error } = await supabaseClient.storage
        .from(HTPWEB_IMPORT_BUCKET)
        .upload(path, file, {
          upsert: false,
          contentType: file.type,
          cacheControl: "60"
        });

      if (error) throw error;

      uploaded.push({
        storage_path: path,
        mime_type: file.type
      });
    }

    return uploaded;
  } catch (error) {
    if (uploaded.length) {
      await supabaseClient.storage
        .from(HTPWEB_IMPORT_BUCKET)
        .remove(uploaded.map(item => item.storage_path))
        .catch(() => {});
    }
    throw error;
  }
}

async function eliminarImportacionesMenuHTPWEB(paths) {
  const clean = (paths || []).filter(Boolean);
  if (!clean.length) return;

  const { error } = await supabaseClient.storage
    .from(HTPWEB_IMPORT_BUCKET)
    .remove(clean);

  if (error) throw error;
}
