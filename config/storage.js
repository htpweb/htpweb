const HTPWEB_MEDIA_BUCKET = "htpweb-media";
const HTPWEB_IMAGE_TYPES = new Set(["image/jpeg","image/png","image/webp","image/gif"]);
const HTPWEB_MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function validarImagenHTPWEB(file) {
  if (!file) throw new Error("Selecciona una imagen.");
  if (!HTPWEB_IMAGE_TYPES.has(file.type)) {
    throw new Error("Formato no permitido. Usa JPG, PNG, WEBP o GIF.");
  }
  if (file.size > HTPWEB_MAX_IMAGE_BYTES) {
    throw new Error("La imagen supera el máximo de 20 MB antes de comprimir.");
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

function mediaPathLocalGallery(localId, imageId) {
  return `local/${localId}/gallery/${imageId}`;
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

async function comprimirImagenHTPWEB(file) {
  validarImagenHTPWEB(file);
  if (file.type === "image/gif") throw new Error("Usa una foto JPG, PNG o WEBP: no se comprimen GIF animados.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve,reject) => { img.onload=resolve;img.onerror=()=>reject(new Error("La imagen está dañada."));img.src=url; });
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth*img.naturalHeight>48000000) {
      throw new Error("La foto excede 48 megapíxeles o no es válida.");
    }
    const canvas = document.createElement("canvas");
    let scale = Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
    let quality=.84,blob;
    for(let attempt=0;attempt<8;attempt++){
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext("2d");
      if(!ctx)throw new Error("No se pudo preparar la compresión.");
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
      if(!blob)throw new Error("El navegador no pudo comprimir la imagen.");
      if(blob.size<=350*1024)break;
      quality=Math.max(.55,quality-.08);scale*=.85;
    }
    if(blob.size>350*1024)throw new Error("No se logró comprimir la foto por debajo de 350 KB.");
    return file.size<blob.size ? file : blob;
  } finally { URL.revokeObjectURL(url); }
}

async function subirImagenHTPWEB(path, file) {
  const optimized = await comprimirImagenHTPWEB(file);

  const { error } = await supabaseClient.storage
    .from(HTPWEB_MEDIA_BUCKET)
    .upload(path, optimized, {
      upsert: true,
      contentType: optimized.type,
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
    originalBytes: file.size,
    uploadedBytes: optimized.size,
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
