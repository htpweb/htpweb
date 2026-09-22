(() => {
  const state113 = {
    zip: null,
    manifest: null,
    productRows: [],
    productErrors: [],
    productImages: [],
    promotions: [],
    packageLocals: [],
    newLocals: [],
    localProfiles: [],
    errors: [],
    fileName: "",
    busy: false,
    resume: false,
    lastStage: "",
    profileEditors: new Set(),
    profileMaps: new Map(),
    completedPromotionKeys: new Set()
  };

  const byId = id => document.getElementById(id);
  const esc113 = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));

  function normalizePath113(value) {
    return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").trim();
  }

  function extMime113(name) {
    const ext = String(name || "").split(".").pop().toLowerCase();
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    return "image/jpeg";
  }

  function findZipEntry113(zip, requested) {
    const name = normalizePath113(requested);
    if (!name) return null;
    const exact = zip.file(name);
    if (exact) return exact;

    const base = name.split("/").pop().toLowerCase();
    const matches = Object.values(zip.files).filter(entry =>
      !entry.dir && entry.name.split("/").pop().toLowerCase() === base
    );
    return matches.length === 1 ? matches[0] : null;
  }

  function clearPackage113(showMessage = true) {
    state113.zip = null;
    state113.manifest = null;
    state113.productRows = [];
    state113.productErrors = [];
    state113.productImages = [];
    state113.promotions = [];
    state113.packageLocals = [];
    state113.newLocals = [];
    state113.localProfiles = [];
    state113.errors = [];
    state113.fileName = "";
    state113.busy = false;
    state113.resume = false;
    state113.lastStage = "";
    state113.profileEditors = new Set();
    state113.profileMaps = new Map();
    state113.completedPromotionKeys = new Set();

    if (byId("completePackageFile")) byId("completePackageFile").value = "";
    if (byId("completePackagePublish")) byId("completePackagePublish").checked = true;
    if (byId("completePackagePreview")) byId("completePackagePreview").innerHTML = "";
    if (byId("completePackageStatus")) byId("completePackageStatus").textContent = "Todavía no has cargado un paquete.";
    if (byId("importCompletePackageBtn")) byId("importCompletePackageBtn").disabled = true;
    if (byId("clearCompletePackageBtn")) byId("clearCompletePackageBtn").disabled = true;
    if (showMessage && typeof message === "function") message("Paquete descartado. No se modificó HTPWEB.");
  }

  function localByManifest113(ref) {
    const locals = state113.packageLocals?.length
      ? state113.packageLocals
      : (masterLocalsState?.items || []);
    const localId = String(ref?.local_id || "").trim();
    const localName = String(ref?.local || "").trim();

    if (localId) {
      const local = locals.find(row => row.id === localId);
      if (!local) throw new Error("LOCAL_ID no existe: " + localId);
      if (localName && bulkProductNormalizeKey(local.name) !== bulkProductNormalizeKey(localName)) {
        throw new Error("LOCAL y LOCAL_ID no corresponden: " + localName);
      }
      return local;
    }

    if (!localName) throw new Error("La promoción requiere LOCAL o LOCAL_ID.");
    const key = normalizeKey113(localName);
    const exact = locals.filter(row => normalizeKey113(row.name) === key);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) throw new Error("LOCAL ambiguo: " + localName + ". Usa LOCAL_ID.");

    const fuzzy = locals.filter(row => {
      const candidate = normalizeKey113(row.name);
      return candidate.includes(key) || key.includes(candidate);
    });
    if (fuzzy.length === 1) return fuzzy[0];
    if (fuzzy.length > 1) throw new Error("LOCAL ambiguo: " + localName + ". Usa LOCAL_ID.");
    throw new Error("LOCAL no encontrado: " + localName);
  }

  function validatePromotion113(promo, index) {
    const errors = [];
    let local = null;

    try {
      local = localByManifest113(promo);
    } catch (e) {
      errors.push(e.message || String(e));
    }

    const title = String(promo?.title || "").trim();
    if (!title) errors.push("Falta title.");

    const type = String(promo?.type || "COMBO").toUpperCase();
    if (!["COMBO", "OPTIONS"].includes(type)) errors.push("type debe ser COMBO u OPTIONS.");

    const items = Array.isArray(promo?.items) ? promo.items : [];
    if (!items.length) errors.push("Agrega al menos un item.");

    items.forEach((item, itemIndex) => {
      if (!String(item?.sku || "").trim()) errors.push("Item " + (itemIndex + 1) + ": falta SKU.");
      const qty = Number(item?.quantity ?? 1);
      if (!Number.isInteger(qty) || qty < 1 || qty > 999) errors.push("Item " + (itemIndex + 1) + ": quantity inválida.");
      if (type === "OPTIONS") {
        const p = Number(item?.promo_price);
        if (!Number.isFinite(p) || p < 0) errors.push("Item " + (itemIndex + 1) + ": promo_price obligatorio.");
      } else if (item?.promo_price !== null && item?.promo_price !== undefined && item?.promo_price !== "") {
        const p = Number(item.promo_price);
        if (!Number.isFinite(p) || p < 0) errors.push("Item " + (itemIndex + 1) + ": promo_price inválido.");
      }
    });

    if (type === "OPTIONS" && promo?.price !== null && promo?.price !== undefined && promo?.price !== "") {
      errors.push("OPTIONS no usa price total.");
    }
    if (type === "COMBO" && promo?.price !== null && promo?.price !== undefined && promo?.price !== "") {
      const total = Number(promo.price);
      if (!Number.isFinite(total) || total < 0) errors.push("price total inválido.");
    }

    const days = promo?.days_of_week ?? [];
    if (!Array.isArray(days) || days.some(day => !Number.isInteger(Number(day)) || Number(day) < 0 || Number(day) > 6)) {
      errors.push("days_of_week inválido.");
    }

    return {
      index,
      raw: promo,
      local,
      title,
      type,
      items,
      image_file: normalizePath113(promo?.image_file || ""),
      errors
    };
  }

  function normalizeKey113(value) {
    return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  }

  function uniqueLocalMatch113(list, value, label) {
    const key = normalizeKey113(value);
    if (!key) return null;

    const exact = list.filter(row => normalizeKey113(row.name) === key);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) throw new Error(label + " ambiguo: " + value);

    const fuzzy = list.filter(row => {
      const candidate = normalizeKey113(row.name);
      return candidate.includes(key) || key.includes(candidate);
    });
    if (fuzzy.length === 1) return fuzzy[0];
    if (fuzzy.length > 1) throw new Error(label + " ambiguo: " + value);
    return null;
  }

  function manifestLocalDefinition113(manifest, localName, localId) {
    const defs = Array.isArray(manifest?.locals) ? manifest.locals : [];
    const id = String(localId || "").trim();
    const name = String(localName || "").trim();

    if (id) {
      const byId = defs.filter(row => String(row?.local_id || row?.id || "").trim() === id);
      if (byId.length === 1) return byId[0];
      if (byId.length > 1) throw new Error("Hay más de una definición para LOCAL_ID " + id + ".");
    }

    if (!name) return null;
    const key = normalizeKey113(name);
    const matches = defs.filter(row =>
      normalizeKey113(row?.name || row?.local || "") === key
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error("Hay más de una definición para el LOCAL " + name + ".");
    return null;
  }

  async function validateLocalProfile113(definition, fallbackName, existing = null) {
    const name = String(definition?.name || definition?.local || fallbackName || existing?.name || "").trim();
    if (!name) throw new Error("La ficha del LOCAL necesita name.");

    const province = String(definition?.province || definition?.provincia || existing?.province || "").trim();
    const canton = String(definition?.canton || definition?.city || existing?.canton || "").trim();
    const categoryName = String(
      definition?.category || definition?.business_category || definition?.categoria ||
      existing?.business_category_name || ""
    ).trim();
    const address = String(definition?.address || definition?.direccion || existing?.address || "").trim();

    if (!province) throw new Error("LOCAL " + name + ": falta province/provincia.");
    if (!canton) throw new Error("LOCAL " + name + ": falta canton.");
    if (!categoryName) throw new Error("LOCAL " + name + ": falta category/categoria.");
    if (!address) throw new Error("LOCAL " + name + ": falta address/dirección.");

    const cityMatches = (state.cities || []).filter(city =>
      city.active &&
      normalizeKey113(city.province) === normalizeKey113(province) &&
      normalizeKey113(city.name) === normalizeKey113(canton)
    );
    if (cityMatches.length !== 1) {
      throw new Error("LOCAL " + name + ": provincia/cantón no coincide de forma única con HTPWEB.");
    }
    const city = cityMatches[0];

    const categories = (masterLocalsState.businessCategories || []).filter(row => row.active);
    let category = uniqueLocalMatch113(categories, categoryName, "Categoría");
    if (!category) {
      const singularKey = normalizeKey113(categoryName).replace(/s$/,"");
      const candidates = categories.filter(row =>
        normalizeKey113(row.name).replace(/s$/,"") === singularKey
      );
      if (candidates.length === 1) category = candidates[0];
    }
    if (!category) {
      throw new Error("LOCAL " + name + ": categoría no encontrada en MASTER → Categorías: " + categoryName + ".");
    }

    const latRaw = definition?.latitude ?? definition?.latitud ?? existing?.latitude ?? null;
    const lngRaw = definition?.longitude ?? definition?.longitud ?? existing?.longitude ?? null;
    const hasLat = latRaw !== null && latRaw !== undefined && String(latRaw).trim() !== "";
    const hasLng = lngRaw !== null && lngRaw !== undefined && String(lngRaw).trim() !== "";

    if (!hasLat || !hasLng) {
      throw new Error(
        "LOCAL " + name + ": el paquete completo requiere latitud y longitud. " +
        "La importación se bloquea para evitar completar ubicación manualmente después."
      );
    }

    const latitude = Number(latRaw);
    const longitude = Number(lngRaw);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error("LOCAL " + name + ": latitud inválida.");
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error("LOCAL " + name + ": longitud inválida.");
    }

    const zone = await rpc("master_detect_local_zone", {
      p_latitude: latitude,
      p_longitude: longitude
    });

    if (!zone?.id) {
      throw new Error("LOCAL " + name + ": no se pudo detectar una zona activa.");
    }

    const isNew = !existing;
    const pseudoId = isNew
      ? "NEW_LOCAL_" + normalizeKey113(name).replace(/[^a-z0-9]+/g,"_")
      : existing.id;

    return {
      id: pseudoId,
      provisional_id: isNew ? pseudoId : null,
      existing_id: existing?.id || null,
      is_new: isNew,
      name,
      province: city.province,
      canton: city.name,
      city_id: city.id,
      business_category_id: category.id,
      business_category_name: category.name,
      description: String(definition?.description || definition?.descripcion || existing?.description || "").trim(),
      address,
      latitude,
      longitude,
      phone: String(definition?.phone || definition?.telefono || existing?.phone || "").trim(),
      whatsapp: String(definition?.whatsapp || existing?.whatsapp || "").trim(),
      location_url: String(
        definition?.location_url || definition?.link_ubicacion ||
        existing?.google_maps_url || ""
      ).trim(),
      zone_id: zone.id,
      zone_code: zone.code || "",
      zone_name: zone.name || "",
      needs_location: false,
      active_after_approval: true,
      was_active: existing?.active === true
    };
  }

  async function buildPackageLocalContext113(rows, manifest) {
    const existing = masterLocalsState?.items || [];
    const result = [...existing];
    const newLocals = [];
    const localProfiles = [];
    const seen = new Map();

    for (const raw of (rows || [])) {
      const localName = String(raw.LOCAL ?? raw.Local ?? raw.local ?? "").trim();
      const localId = String(raw.LOCAL_ID ?? raw.local_id ?? raw.ID_LOCAL ?? "").trim();
      const lookupKey = localId ? "id:" + localId : "name:" + normalizeKey113(localName);
      if (seen.has(lookupKey)) continue;

      const existingLocal = resolvePackageLocal113(localName, localId, existing);
      const definition = manifestLocalDefinition113(manifest, localName, localId);

      if (!existingLocal && !definition) {
        throw new Error(
          "LOCAL no encontrado: " + (localName || localId || "sin nombre") +
          ". Como es nuevo, agrega su ficha completa en HTPWEB_PACKAGE.json → locals."
        );
      }

      let resolved = existingLocal;

      if (definition) {
        const profile = await validateLocalProfile113(definition, localName, existingLocal);
        localProfiles.push(profile);
        resolved = profile;

        if (profile.is_new) {
          newLocals.push(profile);
          result.push(profile);
        } else {
          const pos = result.findIndex(row => row.id === profile.id);
          if (pos >= 0) result[pos] = profile;
        }
      }

      if (!resolved) {
        throw new Error("No se pudo resolver el LOCAL " + (localName || localId) + ".");
      }

      seen.set(lookupKey, resolved);
    }

    return { packageLocals: result, newLocals, localProfiles };
  }

  function resolvePackageLocal113(name, id, pool = null) {
    const locals = pool || masterLocalsState?.items || [];
    const localId = String(id || "").trim();
    const localName = String(name || "").trim();

    if (localId) {
      const local = locals.find(row => row.id === localId);
      if (local) return local;
    }

    if (!localName) return null;
    const key = normalizeKey113(localName);

    const exact = locals.filter(row => normalizeKey113(row.name) === key);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return null;

    const fuzzy = locals.filter(row => {
      const candidate = normalizeKey113(row.name);
      return candidate.includes(key) || key.includes(candidate);
    });
    return fuzzy.length === 1 ? fuzzy[0] : null;
  }

  function preparePackageProductRows113(rows, packageLocals) {
    return (rows || []).map(raw => {
      const out = { ...raw };
      const localName = raw.LOCAL ?? raw.Local ?? raw.local ?? "";
      const localId = raw.LOCAL_ID ?? raw.local_id ?? raw.ID_LOCAL ?? "";
      const resolved = resolvePackageLocal113(localName, localId, packageLocals);

      if (resolved) {
        out.LOCAL = resolved.name;
        out.LOCAL_ID = resolved.id;
      }
      return out;
    });
  }

  async function readProductRowsFromPackage113(zip, manifest) {
    if (typeof XLSX === "undefined") throw new Error("No se cargó XLSX.");
    const requested = normalizePath113(manifest.products_file || "");
    let entry = requested ? findZipEntry113(zip, requested) : null;

    if (!entry) {
      const candidates = Object.values(zip.files).filter(row =>
        !row.dir && /\.xlsx?$/i.test(row.name)
      );
      if (candidates.length === 1) entry = candidates[0];
    }

    if (!entry) throw new Error("No se encontró el Excel de productos del paquete.");

    const buffer = await entry.async("arraybuffer");
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets.PRODUCTOS || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("El Excel no contiene una hoja de productos.");

    // Algunos generadores XLSX válidos omiten el metadato <dimension>,
    // por lo que SheetJS no crea !ref aunque las celdas sí existan.
    // Reconstruimos el rango a partir de las claves A1, B2, etc.
    if (!sheet["!ref"]) {
      const cells = Object.keys(sheet).filter(key => /^[A-Z]+[1-9][0-9]*$/i.test(key));
      if (!cells.length) {
        throw new Error("La hoja PRODUCTOS existe, pero no contiene celdas legibles.");
      }

      let minRow = Infinity;
      let minCol = Infinity;
      let maxRow = -1;
      let maxCol = -1;

      cells.forEach(key => {
        const cell = XLSX.utils.decode_cell(key);
        minRow = Math.min(minRow, cell.r);
        minCol = Math.min(minCol, cell.c);
        maxRow = Math.max(maxRow, cell.r);
        maxCol = Math.max(maxCol, cell.c);
      });

      sheet["!ref"] = XLSX.utils.encode_range({
        s: { r: minRow, c: minCol },
        e: { r: maxRow, c: maxCol }
      });
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!rows.length) {
      throw new Error(
        "La hoja PRODUCTOS se abrió correctamente, pero no se detectaron filas de datos."
      );
    }
    return { rows, file: entry.name };
  }

  function packageCategoryOptions113(selectedId) {
    return (masterLocalsState.businessCategories || [])
      .filter(row => row.active || row.id === selectedId)
      .map(row =>
        '<option value="' + esc113(row.id) + '"' +
        (row.id === selectedId ? ' selected' : '') + '>' +
        esc113(row.name) + '</option>'
      ).join("");
  }

  function packageProfileEditorHtml113(local, index) {
    if (!state113.profileEditors.has(index)) return "";
    return '<div class="workspace-note" style="margin-top:10px">' +
      '<strong>Corregir ficha antes de aprobar</strong>' +
      '<div class="form-grid" style="margin-top:10px">' +
        '<div><label>Dirección / referencia</label><input id="packageLocalAddress113_' + index + '" value="' + esc113(local.address) + '"></div>' +
        '<div><label>Categoría</label><select id="packageLocalCategory113_' + index + '">' + packageCategoryOptions113(local.business_category_id) + '</select></div>' +
        '<div><label>Teléfono</label><input id="packageLocalPhone113_' + index + '" value="' + esc113(local.phone || "") + '"></div>' +
        '<div><label>WhatsApp</label><input id="packageLocalWhatsapp113_' + index + '" value="' + esc113(local.whatsapp || "") + '"></div>' +
      '</div>' +
      '<div style="margin-top:12px"><strong>Ubicación</strong></div>' +
      '<div class="muted">No se editan latitud/longitud manualmente. Haz clic en el mapa o arrastra el marcador al punto correcto.</div>' +
      '<div id="packageLocalCoords113_' + index + '" class="muted" style="margin:6px 0">Lat ' + esc113(local.latitude) + ' · Long ' + esc113(local.longitude) +
        ' · Zona <span id="packageLocalZone113_' + index + '">' + esc113(local.zone_code || local.zone_name || "") + '</span></div>' +
      '<div id="packageLocalMap113_' + index + '" style="height:320px;border-radius:12px;overflow:hidden;border:1px solid #dbe3ee"></div>' +
      '<div class="row" style="margin-top:10px">' +
        '<button type="button" class="btn-primary" data-package-save-profile="' + index + '">Guardar corrección</button>' +
        '<button type="button" class="btn-muted" data-package-cancel-profile="' + index + '">Cerrar</button>' +
      '</div>' +
    '</div>';
  }

  function drawPackageProfileMap113(index) {
    const local = state113.localProfiles[index];
    const map = state113.profileMaps.get(index);
    if (!local || !map) return;

    map.clear();
    (masterLocalsState.zones || [])
      .filter(zone => zone.active && Array.isArray(zone.boundary) && zone.boundary.length >= 3)
      .forEach(zone => map.polygon(zone.boundary, zone.color));

    if (Number.isFinite(Number(local.latitude)) && Number.isFinite(Number(local.longitude))) {
      map.marker([Number(local.latitude), Number(local.longitude)], (lat, lng) => {
        void setPackageLocalPoint113(index, lat, lng);
      });
    }
  }

  async function mountPackageProfileMaps113() {
    if (typeof ZoneMaps === "undefined") return;
    for (const index of state113.profileEditors) {
      const local = state113.localProfiles[index];
      const host = byId("packageLocalMap113_" + index);
      if (!local || !host || host.dataset.ready === "1") continue;
      host.dataset.ready = "1";
      try {
        const map = await ZoneMaps.create("packageLocalMap113_" + index, (lat, lng) => {
          void setPackageLocalPoint113(index, lat, lng);
        });
        state113.profileMaps.set(index, map);
        drawPackageProfileMap113(index);
        if (Number.isFinite(Number(local.latitude)) && Number.isFinite(Number(local.longitude))) {
          map.center([Number(local.latitude), Number(local.longitude)], 17);
        }
      } catch (e) {
        host.innerHTML = '<div class="message error">No se pudo abrir el mapa: ' + esc113(e.message || e) + '</div>';
      }
    }
  }

  async function setPackageLocalPoint113(index, lat, lng) {
    const local = state113.localProfiles[index];
    if (!local || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return message("Ubicación inválida.", "error");

    try {
      const zone = await rpc("master_detect_local_zone", {
        p_latitude: lat,
        p_longitude: lng
      });
      if (!zone?.id) {
        return message("Ese punto no pertenece a una zona activa de HTPWEB. Selecciona otro punto.", "error");
      }

      local.latitude = Number(lat.toFixed(7));
      local.longitude = Number(lng.toFixed(7));
      local.zone_id = zone.id;
      local.zone_code = zone.code || "";
      local.zone_name = zone.name || "";
      local.location_url = "https://www.google.com/maps?q=" + local.latitude + "," + local.longitude;

      const coords = byId("packageLocalCoords113_" + index);
      const zoneNode = byId("packageLocalZone113_" + index);
      if (coords) {
        coords.firstChild.textContent = "Lat " + local.latitude + " · Long " + local.longitude + " · Zona ";
      }
      if (zoneNode) zoneNode.textContent = local.zone_code || local.zone_name || "";
      drawPackageProfileMap113(index);
      state113.profileMaps.get(index)?.center([local.latitude, local.longitude], 17);
      message("Ubicación corregida en el mapa. La zona se actualizó automáticamente.");
    } catch (e) {
      message(e.message || "No se pudo validar la nueva ubicación.", "error");
    }
  }

  function savePackageProfileEdits113(index) {
    const local = state113.localProfiles[index];
    if (!local) return;

    const address = byId("packageLocalAddress113_" + index)?.value.trim() || "";
    const categoryId = byId("packageLocalCategory113_" + index)?.value || "";
    const category = (masterLocalsState.businessCategories || []).find(row => row.id === categoryId && row.active);

    if (!address) return message("La dirección / referencia no puede quedar vacía.", "error");
    if (!category) return message("Selecciona una categoría activa existente en MASTER.", "error");

    local.address = address;
    local.phone = byId("packageLocalPhone113_" + index)?.value.trim() || "";
    local.whatsapp = byId("packageLocalWhatsapp113_" + index)?.value.trim() || "";
    local.business_category_id = category.id;
    local.business_category_name = category.name;

    state113.profileEditors.delete(index);
    state113.profileMaps.delete(index);
    renderPackage113();
    message("Corrección guardada en la ficha pendiente. Aún no se ha importado nada.");
  }

  function renderPackage113() {
    const valid = state113.productRows.length;
    const bad = state113.productErrors.length;
    const missingImages = state113.productImages.filter(row => !row.entry).length;
    const invalidPromos = state113.promotions.filter(row => row.errors.length).length;
    const fatal = state113.errors.length + bad + missingImages + invalidPromos;

    if (byId("completePackageStatus")) {
      byId("completePackageStatus").textContent = state113.fileName
        ? state113.fileName + " · " + valid + " filas de productos · " +
          state113.productImages.length + " fotos referenciadas · " +
          state113.promotions.length + " promociones · " + fatal + " observaciones"
        : "Todavía no has cargado un paquete.";
    }

    if (byId("clearCompletePackageBtn")) byId("clearCompletePackageBtn").disabled = !state113.fileName || state113.busy;
    if (byId("importCompletePackageBtn")) byId("importCompletePackageBtn").disabled = !state113.fileName || fatal > 0 || !valid || state113.busy;

    if (!state113.fileName) {
      if (byId("completePackagePreview")) byId("completePackagePreview").innerHTML = "";
      return;
    }

    const errorsHtml = [
      ...state113.errors.map(error => '<li>' + esc113(error) + '</li>'),
      ...state113.productErrors.slice(0, 20).map(row => '<li>Fila ' + esc113(row.rowNumber) + ': ' + esc113(row.error) + '</li>'),
      ...state113.productImages.filter(row => !row.entry).slice(0, 20).map(row => '<li>Foto faltante: ' + esc113(row.image_file) + ' (' + esc113(row.sku) + ')</li>'),
      ...state113.promotions.filter(row => row.errors.length).slice(0, 20).map(row => '<li>Promoción ' + esc113(row.index + 1) + ': ' + esc113(row.errors.join(" | ")) + '</li>')
    ].join("");

    const localCount = new Set(state113.productRows.map(row => row.local_id)).size;
    const newLocalCount = state113.newLocals.length;
    const productCount = new Set(state113.productRows.map(row => row.productKey)).size;
    const imageOk = state113.productImages.filter(row => row.entry).length;
    const promoOk = state113.promotions.filter(row => !row.errors.length).length;

    const profileHtml = state113.localProfiles.length
      ? '<div class="card" style="margin-top:12px"><strong>Ficha del LOCAL a aprobar</strong>' +
        state113.localProfiles.map((local, index) =>
          '<div style="margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb">' +
            '<div class="row between" style="gap:10px;flex-wrap:wrap">' +
              '<div><strong>' + esc113(local.name) + '</strong> · ' + (local.is_new ? 'NUEVO' : 'ACTUALIZAR') + '</div>' +
              '<button type="button" class="btn-muted" data-package-edit-profile="' + index + '">Editar ficha / ubicación</button>' +
            '</div>' +
            '<div class="muted">' + esc113(local.province) + ' · ' + esc113(local.canton) +
              ' · ' + esc113(local.business_category_name) + '</div>' +
            '<div>' + esc113(local.address) + '</div>' +
            '<div class="muted">Lat ' + esc113(local.latitude) + ' · Long ' + esc113(local.longitude) +
              ' · Zona ' + esc113(local.zone_code || local.zone_name || '') + '</div>' +
            (local.phone ? '<div class="muted">Tel. ' + esc113(local.phone) + '</div>' : '') +
            packageProfileEditorHtml113(local, index) +
          '</div>'
        ).join('') +
        '<div class="workspace-note" style="margin-top:12px">HTPWEB guardará primero el LOCAL como borrador, cargará catálogo, fotos y promociones y <strong>solo lo activará al terminar correctamente</strong>. Si algo falla, podrás reanudar sin crear otro LOCAL.</div>' +
      '</div>'
      : '';

    byId("completePackagePreview").innerHTML =
      '<div class="bulk-local-summary">' +
        '<span>LOCAL: <strong>' + localCount + '</strong>' + (newLocalCount ? ' · ' + newLocalCount + ' nuevo' + (newLocalCount === 1 ? '' : 's') : '') + '</span>' +
        '<span>Productos: <strong>' + productCount + '</strong></span>' +
        '<span>Fotos listas: <strong>' + imageOk + '</strong></span>' +
        '<span>Promociones: <strong>' + promoOk + '</strong></span>' +
      '</div>' +
      profileHtml +
      (errorsHtml ? '<div class="message error" style="margin-top:12px"><strong>Revisar antes de importar:</strong><ul>' + errorsHtml + '</ul></div>' :
        (state113.resume
          ? '<div class="message" style="margin-top:12px"><strong>Importación pendiente de completar.</strong> Puedes reanudar: HTPWEB reutilizará el LOCAL y los productos ya guardados.</div>'
          : '<div class="message success" style="margin-top:12px">Paquete completo validado. Revisa la ficha y aprueba una sola vez para cargar todo.</div>'));

    const importButton = byId("importCompletePackageBtn");
    if (importButton) importButton.textContent = state113.resume ? "Reanudar importación" : "Aprobar ficha e importar todo";
    setTimeout(() => { void mountPackageProfileMaps113(); }, 0);
  }

  async function validatePackage113() {
    if (state113.busy) return;
    const file = byId("completePackageFile")?.files?.[0];
    if (!file) return message("Selecciona un archivo ZIP.", "error");
    if (typeof HTPWEBZip === "undefined") return message("No se cargó el lector ZIP local de HTPWEB.", "error");

    state113.busy = true;
    byId("validateCompletePackageBtn").disabled = true;
    try {
      // Supabase es la fuente de verdad. Refrescamos LOCAL y categorías justo
      // antes de validar para evitar usar datos vacíos o desactualizados si el
      // usuario abre "Importar paquete completo" antes de que termine de cargar
      // el módulo MASTER → Locales.
      const [freshLocals, freshBusinessCategories] = await Promise.all([
        rpc("master_list_locals"),
        rpc("master_list_local_business_categories")
      ]);
      masterLocalsState.items = freshLocals || [];
      masterLocalsState.businessCategories = freshBusinessCategories || [];
      if (typeof localBusinessCategoriesState !== "undefined") {
        localBusinessCategoriesState.items = masterLocalsState.businessCategories;
      }

      const zip = await HTPWEBZip.loadAsync(file);
      const manifestEntry = findZipEntry113(zip, "HTPWEB_PACKAGE.json");
      if (!manifestEntry) throw new Error("El ZIP no contiene HTPWEB_PACKAGE.json.");

      const manifest = JSON.parse(await manifestEntry.async("string"));
      if (Number(manifest.version || 0) !== 1) throw new Error("Versión de paquete no compatible.");

      const productData = await readProductRowsFromPackage113(zip, manifest);
      const localContext = await buildPackageLocalContext113(productData.rows, manifest);
      state113.packageLocals = localContext.packageLocals;
      state113.newLocals = localContext.newLocals;
      state113.localProfiles = localContext.localProfiles;

      const preparedRows = preparePackageProductRows113(productData.rows, state113.packageLocals);

      // Reutilizamos el validador oficial de carga masiva. Los LOCAL nuevos
      // se añaden temporalmente al catálogo en memoria con un ID provisional.
      const originalItems = masterLocalsState.items;
      masterLocalsState.items = state113.packageLocals;
      let normalized;
      try {
        normalized = normalizeBulkProductRows(preparedRows);
      } finally {
        masterLocalsState.items = originalItems;
      }
      if (!normalized.valid.length) {
        const reasons = normalized.bad.slice(0, 8).map(row =>
          "Fila " + row.rowNumber + ": " + (row.error || "Error desconocido")
        ).join(" | ");
        throw new Error(
          "El paquete no contiene productos válidos." +
          (reasons ? " Motivos: " + reasons : "")
        );
      }

      const packageErrors = [];
      const uniqueImages = new Map();
      normalized.valid.forEach(row => {
        if (uniqueImages.has(row.productKey)) return;

        if (!String(row.sku || "").trim()) {
          packageErrors.push(
            "Producto sin SKU: " + row.producto +
            " (" + row.local + "). En paquete completo cada producto necesita SKU para enlazar su foto."
          );
          uniqueImages.set(row.productKey, {
            local_id: row.local_id,
            local: row.local,
            sku: "",
            product: row.producto,
            image_file: "",
            entry: null
          });
          return;
        }

        const imageFile = normalizePath113(row.imagen_archivo || "");
        if (!imageFile) {
          packageErrors.push(
            "Producto sin IMAGEN_ARCHIVO: " + row.producto +
            " · " + row.sku + ". Cada producto del paquete debe tener una foto."
          );
        }

        uniqueImages.set(row.productKey, {
          local_id: row.local_id,
          local: row.local,
          sku: row.sku,
          product: row.producto,
          image_file: imageFile,
          entry: imageFile ? findZipEntry113(zip, imageFile) : null
        });
      });

      const promotions = (Array.isArray(manifest.promotions) ? manifest.promotions : [])
        .map((promo, index) => validatePromotion113(promo, index));

      promotions.forEach(promo => {
        if (promo.image_file && !findZipEntry113(zip, promo.image_file)) {
          promo.errors.push("No se encontró image_file: " + promo.image_file);
        }
      });

      state113.zip = zip;
      state113.manifest = manifest;
      state113.productRows = normalized.valid;
      state113.productErrors = normalized.bad;
      state113.productImages = [...uniqueImages.values()];
      state113.promotions = promotions;
      state113.errors = packageErrors;
      state113.fileName = file.name;

      renderPackage113();
      if (
        !state113.errors.length &&
        !state113.productErrors.length &&
        !state113.productImages.some(row => !row.entry) &&
        !state113.promotions.some(row => row.errors.length)
      ) {
        message("Paquete completo validado. Revisa el resumen y confirma la importación.");
      } else {
        message("El paquete tiene observaciones. Corrígelas antes de importar.", "error");
      }
    } catch (e) {
      clearPackage113(false);
      state113.errors = [e.message || String(e)];
      state113.fileName = file.name;
      renderPackage113();
      message(e.message || "No se pudo validar el paquete.", "error");
    } finally {
      state113.busy = false;
      byId("validateCompletePackageBtn").disabled = false;
      renderPackage113();
    }
  }

  async function zipImageFile113(entry, requestedName) {
    const blob = await entry.async("blob");
    const base = normalizePath113(requestedName).split("/").pop();
    return new File([blob], base, { type: extMime113(base) });
  }

  function delay113(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function productFromSku113(products, localId, sku) {
    const key = bulkProductNormalizeKey(sku);
    const exact = products.find(row =>
      row.local_id === localId && bulkProductNormalizeKey(row.sku) === key
    );
    if (exact) return exact;

    // Rescate seguro: si el RPC acaba de crear/actualizar el producto pero el SKU
    // todavía no aparece en la lectura, usamos el nombre del mismo renglón validado.
    const source = state113.productRows.find(row =>
      row.local_id === localId && bulkProductNormalizeKey(row.sku) === key
    );
    if (!source) return null;

    const nameKey = bulkProductNormalizeKey(source.producto);
    const matches = products.filter(row =>
      row.local_id === localId && bulkProductNormalizeKey(row.name) === nameKey
    );
    return matches.length === 1 ? matches[0] : null;
  }

  async function fetchImportedProducts113(rows) {
    const localIds = [...new Set(rows.map(row => row.local_id).filter(Boolean))];
    if (!localIds.length) return [];

    let products = [];
    // Leemos todo el catálogo de esos LOCAL y reintentamos brevemente para cubrir
    // propagación/lectura inmediatamente posterior al RPC de importación.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabaseClient
        .from("products")
        .select("id,local_id,category_id,name,sku,description,price,image_url,display_order,active")
        .in("local_id", localIds);

      if (error) throw error;
      products = data || [];

      const refs = [...new Map(
        rows.filter(row => row.sku).map(row => [
          row.local_id + "|" + bulkProductNormalizeKey(row.sku),
          { local_id: row.local_id, sku: row.sku }
        ])
      ).values()];

      if (refs.every(ref => productFromSku113(products, ref.local_id, ref.sku))) {
        return products;
      }
      if (attempt < 3) await delay113(250 * (attempt + 1));
    }

    return products;
  }

  async function uploadPackageProductImages113(products) {
    let uploadedCount = 0;
    for (const ref of state113.productImages) {
      const product = productFromSku113(products, ref.local_id, ref.sku);
      if (!product) throw new Error("No se encontró producto importado para foto: " + ref.sku);
      if (!ref.entry) throw new Error("Falta foto: " + ref.image_file);

      const file = await zipImageFile113(ref.entry, ref.image_file);
      const previousPath = pathDesdePublicUrlHTPWEB(product.image_url);
      let uploaded = null;
      try {
        uploaded = await subirImagenHTPWEB(mediaPathProduct(product.id), file);
        await saveProductImageUrl(product, uploaded.url);
        if (previousPath && previousPath !== uploaded.path) {
          await eliminarObjetoMediaHTPWEB(previousPath).catch(() => {});
        }
        product.image_url = uploaded.url;
        uploadedCount++;
      } catch (e) {
        if (uploaded && previousPath !== uploaded.path) {
          await eliminarObjetoMediaHTPWEB(uploaded.path).catch(() => {});
        }
        throw new Error("Foto " + ref.sku + ": " + (e.message || e));
      }
    }
    return uploadedCount;
  }

  async function fetchPromotionVariants113(products) {
    const ids = products.map(row => row.id).filter(Boolean);
    if (!ids.length) return [];
    const { data, error } = await supabaseClient
      .from("product_variants")
      .select("id,product_id,name,price,display_order,active")
      .in("product_id", ids);
    if (error) throw error;
    return data || [];
  }

  function variantByName113(variants, productId, name) {
    const requested = bulkProductNormalizeKey(name || "");
    if (!requested) return null;
    return variants.find(row =>
      row.product_id === productId && bulkProductNormalizeKey(row.name) === requested
    ) || null;
  }

  async function importPromotions113(products, variants) {
    let created = 0;

    for (const promo of state113.promotions) {
      const raw = promo.raw;
      const promoKey = (promo.local?.id || "") + "|" + normalizeKey113(promo.title) + "|" + promo.type;
      if (state113.completedPromotionKeys.has(promoKey)) continue;
      const local = promo.local;
      const type = promo.type;

      const items = promo.items.map(item => {
        const product = productFromSku113(products, local.id, item.sku);
        if (!product) throw new Error("Promoción " + promo.title + ": SKU no encontrado " + item.sku);

        let variant = null;
        const variantName = String(item.variant || item.variant_name || "").trim();
        if (variantName) {
          variant = variantByName113(variants, product.id, variantName);
          if (!variant) {
            throw new Error("Promoción " + promo.title + ": variante no encontrada " + variantName + " para " + item.sku);
          }
        }

        return {
          product_id: product.id,
          variant_id: variant?.id || null,
          quantity: Number(item.quantity || 1),
          promo_price: item.promo_price === null || item.promo_price === undefined || item.promo_price === ""
            ? null
            : Number(item.promo_price)
        };
      });

      const args = {
        p_promotion_id: null,
        p_local_id: local.id,
        p_title: promo.title,
        p_body: String(raw.body || "").trim() || null,
        p_image_url: null,
        p_starts_at: raw.starts_at || null,
        p_ends_at: raw.ends_at || null,
        p_days_of_week: (raw.days_of_week || []).map(Number),
        p_display_order: Math.max(0, Number.parseInt(raw.order ?? raw.display_order ?? 0, 10) || 0),
        p_active: raw.active !== false,
        p_promotion_type: type,
        p_promotion_price: type === "COMBO" && raw.price !== null && raw.price !== undefined && raw.price !== ""
          ? Number(raw.price)
          : null,
        p_items: items
      };

      let id = null;
      let uploaded = null;
      try {
        id = await rpc("save_local_promotion_v3", args);
        if (promo.image_file) {
          const entry = findZipEntry113(state113.zip, promo.image_file);
          if (!entry) throw new Error("No se encontró imagen de promoción: " + promo.image_file);
          const file = await zipImageFile113(entry, promo.image_file);
          uploaded = await subirImagenHTPWEB(mediaPathPromotion(id), file);
          args.p_promotion_id = id;
          args.p_image_url = uploaded.url;
          await rpc("save_local_promotion_v3", args);
        }
        state113.completedPromotionKeys.add(promoKey);
        created++;
      } catch (e) {
        if (uploaded) await eliminarObjetoMediaHTPWEB(uploaded.path).catch(() => {});
        if (id) await rpc("delete_local_promotion", { p_promotion_id: id }).catch(() => {});
        throw new Error("Promoción " + promo.title + ": " + (e.message || e));
      }
    }

    return created;
  }

  async function applyPackageLocalProfiles113() {
    if (!state113.localProfiles.length) {
      return { created: 0, updated: 0, activated: 0 };
    }

    let created = 0;
    let updated = 0;
    let activated = 0;
    const idMap = new Map();

    for (const local of state113.localProfiles) {
      const oldId = local.id;
      const result = await rpc("master_apply_local_package_profile_v1", {
        p_local_id: local.is_new ? null : local.existing_id,
        p_city_id: local.city_id,
        p_business_category_id: local.business_category_id,
        p_name: local.name,
        p_description: local.description || "",
        p_address: local.address,
        p_latitude: local.latitude,
        p_longitude: local.longitude,
        p_phone: local.phone || "",
        p_whatsapp: local.whatsapp || "",
        p_location_url: local.location_url || null,
        p_activate: local.was_active === true
      });

      if (!result?.id) {
        throw new Error("No se pudo aplicar la ficha del LOCAL " + local.name + ".");
      }

      if (local.is_new) {
        idMap.set(oldId, result.id);
        created++;
      } else {
        updated++;
      }
      if (result.active === true) activated++;

      local.id = result.id;
      local.existing_id = result.id;
      local.is_new = false;
      local.zone_id = result.zone_id || local.zone_id;
      local.zone_code = result.zone?.code || local.zone_code;
      local.zone_name = result.zone?.name || local.zone_name;
    }

    const replaceId = value => idMap.get(value) || value;

    state113.productRows = state113.productRows.map(row => {
      const oldId = row.local_id;
      const newId = replaceId(oldId);
      const copy = { ...row, local_id: newId };
      if (newId !== oldId && row.productKey) {
        copy.productKey = newId + row.productKey.slice(String(oldId).length);
      }
      return copy;
    });

    state113.productImages = state113.productImages.map(row => ({
      ...row,
      local_id: replaceId(row.local_id)
    }));

    state113.packageLocals.forEach(local => {
      if (local.provisional_id && idMap.has(local.provisional_id)) {
        local.id = idMap.get(local.provisional_id);
        local.existing_id = local.id;
        local.is_new = false;
      }
    });

    return { created, updated, activated };
  }

  async function importPackage113() {
    if (state113.busy) return;
    const fatal =
      state113.errors.length +
      state113.productErrors.length +
      state113.productImages.filter(row => !row.entry).length +
      state113.promotions.filter(row => row.errors.length).length;

    if (!state113.zip || !state113.productRows.length || fatal) {
      return message("Valida primero un paquete sin observaciones.", "error");
    }

    const localCount = new Set(state113.productRows.map(row => row.local_id)).size;
    const newLocalCount = state113.newLocals.length;
    const productCount = new Set(state113.productRows.map(row => row.productKey)).size;
    const publish = byId("completePackagePublish")?.checked === true;

    if (!confirm(
      "Se aprobará/aplicará la ficha de " + localCount + " LOCAL y se importarán " +
      productCount + " productos, " + state113.productImages.length + " fotos y " +
      state113.promotions.length + " promociones" +
      (newLocalCount ? ". " + newLocalCount + " LOCAL se crearán como nuevos" : "") +
      ". ¿Aprobar e importar todo?"
    )) return;

    state113.busy = true;
    state113.resume = false;
    renderPackage113();

    try {
      state113.lastStage = "ficha del LOCAL";
      const localApplication = await applyPackageLocalProfiles113();

      const payload = state113.productRows.map(row => {
        const copy = { ...row };
        for (const key of ["rowNumber","valid","error","localObj","productKey"]) delete copy[key];
        return copy;
      });

      state113.lastStage = "catálogo de productos";
      const result = await rpc("bulk_import_catalog_multilocal_v3", {
        p_rows: payload,
        p_publish: publish
      });

      state113.lastStage = "verificación del catálogo";
      const products = await fetchImportedProducts113(state113.productRows);

      const unresolved = state113.productImages.filter(ref =>
        !productFromSku113(products, ref.local_id, ref.sku)
      );
      if (unresolved.length) {
        throw new Error(
          "El catálogo se guardó, pero faltan por resolver " + unresolved.length +
          " SKU para sus fotos: " + unresolved.slice(0, 5).map(row => row.sku).join(", ")
        );
      }

      state113.lastStage = "fotos de productos";
      const photoCount = await uploadPackageProductImages113(products);

      state113.lastStage = "promociones";
      const variants = await fetchPromotionVariants113(products);
      const promoCount = await importPromotions113(products, variants);

      state113.lastStage = "activación final";
      const localIds = [...new Set(state113.localProfiles.map(local => local.id).filter(Boolean))];
      let activatedNow = 0;
      if (localIds.length) {
        const activation = await rpc("master_set_locals_active", {
          p_local_ids: localIds,
          p_active: true
        });
        activatedNow = Number(activation?.updated || localIds.length);
      }

      message(
        "Paquete completo importado: " +
        (result?.products_created || 0) + " productos creados, " +
        (result?.products_updated || 0) + " actualizados, " +
        photoCount + " fotos y " + promoCount + " promociones." +
        (localApplication.created ? " LOCAL nuevos creados: " + localApplication.created + "." : "") +
        (localApplication.updated ? " Fichas de LOCAL actualizadas: " + localApplication.updated + "." : "") +
        (activatedNow ? " LOCAL aprobados/activos: " + activatedNow + "." : "")
      );

      await loadMasterLocals();
      clearPackage113(false);
    } catch (e) {
      state113.resume = true;
      message(
        "La importación se detuvo en " + (state113.lastStage || "el proceso") + ": " + (e.message || e) +
        ". El LOCAL no se duplicará. Corrige si hace falta y pulsa Reanudar importación.",
        "error"
      );
    } finally {
      state113.busy = false;
      renderPackage113();
    }
  }

  function downloadSpec113() {
    const example = {
      version: 1,
      image_policy: "REQUIRED_PER_SKU",
      products_file: "HTPWEB_Productos.xlsx",
      locals: [
        {
          name: "LOCAL NUEVO DE EJEMPLO",
          province: "Esmeraldas",
          canton: "Esmeraldas",
          category: "Restaurante",
          address: "Dirección y referencia",
          description: "Descripción opcional",
          phone: "",
          whatsapp: "",
          latitude: 0.0000000,
          longitude: -79.0000000,
          location_url: ""
        }
      ],
      promotions: [
        {
          local: "Miguelacho Pizza",
          local_id: "",
          title: "Más alitas al mismo precio",
          type: "OPTIONS",
          body: "Promoción válida martes y miércoles.",
          starts_at: "2026-09-01T00:00:00-05:00",
          ends_at: "2026-10-30T23:59:59-05:00",
          days_of_week: [2, 3],
          active: true,
          order: 1,
          price: null,
          image_file: "promociones/PROMO-ALITAS.jpg",
          items: [
            { sku: "MIG-ESP-002", variant: "", quantity: 8, promo_price: 5 },
            { sku: "MIG-ESP-002", variant: "", quantity: 15, promo_price: 10 },
            { sku: "MIG-ESP-002", variant: "", quantity: 26, promo_price: 16 }
          ]
        }
      ]
    };

    const blob = new Blob([JSON.stringify(example, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "HTPWEB_PACKAGE.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function bind113() {
    // El workspace de Locales se construye dinámicamente. Por eso usamos
    // delegación de eventos: los botones pueden no existir cuando este script carga.
    document.addEventListener("click", event => {
      const button = event.target?.closest?.("button");
      if (!button) return;

      if (button.id === "validateCompletePackageBtn") {
        event.preventDefault();
        validatePackage113();
        return;
      }

      if (button.id === "clearCompletePackageBtn") {
        event.preventDefault();
        clearPackage113(true);
        return;
      }

      if (button.id === "importCompletePackageBtn") {
        event.preventDefault();
        importPackage113();
        return;
      }

      if (button.dataset.packageEditProfile !== undefined) {
        event.preventDefault();
        const index = Number(button.dataset.packageEditProfile);
        state113.profileEditors.add(index);
        renderPackage113();
        return;
      }

      if (button.dataset.packageCancelProfile !== undefined) {
        event.preventDefault();
        const index = Number(button.dataset.packageCancelProfile);
        state113.profileEditors.delete(index);
        state113.profileMaps.delete(index);
        renderPackage113();
        return;
      }

      if (button.dataset.packageSaveProfile !== undefined) {
        event.preventDefault();
        savePackageProfileEdits113(Number(button.dataset.packageSaveProfile));
        return;
      }

      if (button.id === "downloadPackageSpecBtn") {
        event.preventDefault();
        downloadSpec113();
      }
    });

    document.addEventListener("change", event => {
      if (event.target?.id !== "completePackageFile") return;
      const file = event.target.files?.[0];
      if (!file) return;
      if (byId("completePackageStatus")) {
        byId("completePackageStatus").textContent =
          file.name + " seleccionado · pulsa Validar paquete.";
      }
      if (byId("clearCompletePackageBtn")) {
        byId("clearCompletePackageBtn").disabled = false;
      }
    });
  }

  bind113();
})();
