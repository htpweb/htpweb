(() => {
  const dayNames = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const baseRenderCatalogProducts = renderCatalogProducts;

  function selectedLocalId108() {
    return typeof selectedCatalogLocalId === "function" ? selectedCatalogLocalId() : ($("catalogLocal")?.value || null);
  }

  function productSkuKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function photoStem(name) {
    return String(name || "").replace(/\.[^.]+$/, "").trim();
  }

  function enhanceProductCleanup108() {
    if (state.role !== "MASTER") return;
    const container = $("catalogProducts");
    if (!container) return;

    const checks = [...container.querySelectorAll(".catalog-product-bulk-check")];
    const remove = $("catalogDeleteSelectedBtn");
    const clean = $("catalogCleanBtn");
    if (!remove || !clean) return;

    const refresh = () => {
      remove.disabled = !checks.some(check => check.checked);
    };
    checks.forEach(check => check.addEventListener("change", refresh));
    $("catalogSelectAllProducts")?.addEventListener("change", () => setTimeout(refresh, 0));
    remove.onclick = () => deleteCatalogProducts108(checks.filter(check => check.checked).map(check => check.value));
    clean.onclick = cleanCatalogLocal108;
    refresh();
  }

  renderCatalogProducts = function() {
    baseRenderCatalogProducts();
    enhanceProductCleanup108();
    refreshPromotionProductOptions108();
    loadPromotions108().catch(error => {
      if ($("promotionsList")) $("promotionsList").innerHTML = '<div class="message error">' + esc(error.message || "No se pudieron cargar promociones.") + '</div>';
    });
  };

  async function deleteCatalogProducts108(ids) {
    if (state.role !== "MASTER") return;
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (!unique.length) return message("Selecciona al menos un producto.", "error");

    const names = unique.map(id => state.products.find(p => p.id === id)?.name).filter(Boolean);
    const label = unique.length === 1 ? '"' + (names[0] || "producto") + '"' : unique.length + " productos";
    if (!confirm("¿Eliminar definitivamente " + label + "? Si algún producto tiene pedidos históricos, HTPWEB lo protegerá y solo lo dejará inactivo.")) return;

    try {
      const result = await rpc("master_delete_products", { p_product_ids: unique });
      const deleted = Array.isArray(result?.deleted) ? result.deleted : [];
      const blocked = Array.isArray(result?.blocked) ? result.blocked : [];

      for (const row of deleted) {
        await eliminarObjetoMediaHTPWEB(mediaPathProduct(row.id)).catch(() => {});
      }

      await loadCatalog();

      if (blocked.length) {
        message(
          deleted.length + " eliminados. " + blocked.length +
          " protegidos por historial de pedidos y dejados inactivos.",
          "error"
        );
      } else {
        message(deleted.length + " productos eliminados definitivamente.");
      }
    } catch (e) {
      message(e.message || "No se pudieron eliminar los productos.", "error");
    }
  }

  async function cleanCatalogLocal108() {
    if (state.role !== "MASTER") return;
    if (!state.products.length) return message("El LOCAL no tiene productos para limpiar.");
    const local = state.locals.find(row => row.id === selectedLocalId108());
    const name = local?.name || "este LOCAL";
    if (!confirm("LIMPIAR CATÁLOGO de " + name + ": se intentarán eliminar los " + state.products.length + " productos actuales. ¿Continuar?")) return;
    if (!confirm("Esta acción es destructiva para productos sin historial de pedidos. ¿Confirmas la limpieza?")) return;
    await deleteCatalogProducts108(state.products.map(product => product.id));
  }

  window.deleteCatalogProducts = deleteCatalogProducts108;
  window.cleanCatalogLocal = cleanCatalogLocal108;

  function clearProductPhotoBatch108() {
    state.productPhotoBatch = [];
    if ($("productPhotoBatchFiles")) $("productPhotoBatchFiles").value = "";
    if ($("productPhotoBatchPreview")) $("productPhotoBatchPreview").innerHTML = "";
    if ($("productPhotoBatchSummary")) $("productPhotoBatchSummary").textContent = "No hay fotos seleccionadas.";
    if ($("uploadProductPhotoBatchBtn")) $("uploadProductPhotoBatchBtn").disabled = true;
    if ($("clearProductPhotoBatchBtn")) $("clearProductPhotoBatchBtn").disabled = true;
  }

  function renderProductPhotoBatch108() {
    const rows = state.productPhotoBatch || [];
    const valid = rows.filter(row => row.valid);
    const bad = rows.filter(row => !row.valid);
    $("productPhotoBatchSummary").textContent = rows.length
      ? valid.length + " fotos listas · " + bad.length + " con observaciones"
      : "No hay fotos seleccionadas.";
    $("uploadProductPhotoBatchBtn").disabled = valid.length === 0;
    $("clearProductPhotoBatchBtn").disabled = rows.length === 0;

    $("productPhotoBatchPreview").innerHTML = rows.length ? (
      '<div class="table-wrap"><table><thead><tr><th>Archivo</th><th>SKU</th><th>Producto</th><th>Estado</th></tr></thead><tbody>' +
      rows.map(row =>
        '<tr><td>' + esc(row.file.name) + '</td><td>' + esc(row.sku || "—") + '</td><td>' +
        esc(row.product?.name || "—") + '</td><td class="' + (row.valid ? "bulk-status-ok" : "bulk-status-error") + '">' +
        esc(row.valid ? "Lista" : row.error) + '</td></tr>'
      ).join("") + '</tbody></table></div>'
    ) : "";
  }

  function validateProductPhotoBatch108() {
    const files = [...($("productPhotoBatchFiles")?.files || [])];
    if (!files.length) return message("Selecciona una o más fotos.", "error");

    const bySku = new Map(
      state.products.filter(product => product.sku)
        .map(product => [productSkuKey(product.sku), product])
    );
    const seen = new Set();

    state.productPhotoBatch = files.map(file => {
      const sku = photoStem(file.name);
      const key = productSkuKey(sku);
      const product = bySku.get(key) || null;
      let error = "";

      if (!["image/jpeg","image/png","image/webp"].includes(file.type)) error = "Formato no permitido.";
      else if (!key) error = "El archivo no contiene un SKU reconocible.";
      else if (seen.has(key)) error = "Hay más de una foto para el mismo SKU.";
      else if (!product) error = "No existe un producto de este LOCAL con ese SKU.";

      seen.add(key);
      return { file, sku, product, valid: !error, error };
    });

    renderProductPhotoBatch108();
    const valid = state.productPhotoBatch.filter(row => row.valid).length;
    message(valid + " fotos vinculadas correctamente por SKU.");
  }

  async function uploadProductPhotoBatch108() {
    const rows = (state.productPhotoBatch || []).filter(row => row.valid);
    if (!rows.length) return message("Primero valida las fotos.", "error");
    if (!confirm("Se subirán " + rows.length + " fotos y se asignarán por SKU. ¿Continuar?")) return;

    $("uploadProductPhotoBatchBtn").disabled = true;
    let ok = 0;
    const errors = [];

    for (const row of rows) {
      try {
        const product = {
          ...row.product,
          local_id: row.product?.local_id || selectedLocalId108()
        };
        if (!product.local_id) throw new Error("No se pudo identificar el LOCAL del producto.");

        const previousPath = pathDesdePublicUrlHTPWEB(product.image_url);
        let uploaded = null;
        try {
          uploaded = await subirImagenHTPWEB(mediaPathProduct(product.id), row.file);
          await saveProductImageUrl(product, uploaded.url);
          if (previousPath && previousPath !== uploaded.path) {
            await eliminarObjetoMediaHTPWEB(previousPath).catch(() => {});
          }
          ok++;
        } catch (innerError) {
          if (uploaded && previousPath !== uploaded.path) {
            await eliminarObjetoMediaHTPWEB(uploaded.path).catch(() => {});
          }
          throw innerError;
        }
      } catch (e) {
        errors.push(row.sku + ": " + (e.message || e));
      }
    }

    await loadCatalog();
    clearProductPhotoBatch108();

    if (errors.length) {
      message(ok + " fotos cargadas; " + errors.length + " fallaron. " + errors.slice(0,3).join(" | "), "error");
    } else {
      message(ok + " fotos de productos cargadas correctamente.");
    }
  }

  function refreshPromotionProductOptions108() {
    const select = $("promotionProduct");
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '<option value="">Promoción general del LOCAL</option>' +
      state.products.map(product =>
        '<option value="' + esc(product.id) + '">' + esc(product.name) +
        (product.sku ? " · " + esc(product.sku) : "") + '</option>'
      ).join("");
    if (previous && state.products.some(product => product.id === previous)) select.value = previous;
  }

  function promotionDays108() {
    return [...document.querySelectorAll(".promotion-day:checked")].map(input => Number(input.value));
  }

  function clearPromotion108() {
    if (!$("promotionId")) return;
    $("promotionId").value = "";
    $("promotionImageUrl").value = "";
    $("promotionTitle").value = "";
    $("promotionBody").value = "";
    $("promotionStartsAt").value = "";
    $("promotionEndsAt").value = "";
    $("promotionOrder").value = "0";
    $("promotionActive").value = "true";
    $("promotionImageFile").value = "";
    document.querySelectorAll(".promotion-day").forEach(input => { input.checked = false; });
    setPreview("promotionImagePreview", "");
    refreshPromotionProductOptions108();
  }

  function renderPromotions108() {
    const container = $("promotionsList");
    if (!container) return;
    if (!state.promotions.length) {
      container.innerHTML = '<div class="muted">No hay promociones configuradas para este LOCAL.</div>';
      return;
    }

    container.innerHTML = state.promotions.map(promotion => {
      const product = state.products.find(product => product.id === promotion.product_id);
      const days = promotion.days_of_week?.length
        ? promotion.days_of_week.map(day => dayNames[Number(day)]).join(", ")
        : "Todos los días";
      const start = promotion.starts_at ? new Date(promotion.starts_at).toLocaleString() : "Sin inicio";
      const end = promotion.ends_at ? new Date(promotion.ends_at).toLocaleString() : "Sin fin";
      return '<div class="card" style="margin:0 0 10px">' +
        '<div class="row between"><div><strong>' + esc(promotion.title) + '</strong>' +
        '<div class="muted">' + esc(product ? "Producto: " + product.name : "Promoción general") + '</div>' +
        '<div class="muted">' + esc(days) + ' · ' + esc(start) + ' → ' + esc(end) + '</div></div>' +
        '<span class="badge">' + (promotion.active ? "ACTIVA" : "INACTIVA") + '</span></div>' +
        (promotion.body ? '<p>' + esc(promotion.body) + '</p>' : '') +
        (promotion.image_url ? '<img src="' + esc(promotion.image_url) + '" alt="" style="max-width:260px;max-height:150px;object-fit:cover;border-radius:10px">' : '') +
        '<div class="row" style="margin-top:10px"><button class="btn-muted" data-edit-promotion="' + esc(promotion.id) + '">Editar</button>' +
        '<button class="btn-danger" data-delete-promotion="' + esc(promotion.id) + '">Eliminar</button></div></div>';
    }).join("");

    container.querySelectorAll("[data-edit-promotion]").forEach(button => {
      button.onclick = () => editPromotion108(button.dataset.editPromotion);
    });
    container.querySelectorAll("[data-delete-promotion]").forEach(button => {
      button.onclick = () => deletePromotion108(button.dataset.deletePromotion);
    });
  }

  async function loadPromotions108() {
    const localId = selectedLocalId108();
    if (!localId || !$("promotionsList")) {
      state.promotions = [];
      renderPromotions108();
      return;
    }

    const { data, error } = await supabaseClient
      .from("local_promotions")
      .select("id,local_id,product_id,title,body,image_url,starts_at,ends_at,days_of_week,display_order,active,created_at,updated_at")
      .eq("local_id", localId)
      .order("display_order")
      .order("created_at", { ascending: false });

    if (error) throw error;
    state.promotions = data || [];
    refreshPromotionProductOptions108();
    renderPromotions108();
  }

  function editPromotion108(id) {
    const promotion = state.promotions.find(row => row.id === id);
    if (!promotion) return;
    $("promotionId").value = promotion.id;
    $("promotionImageUrl").value = promotion.image_url || "";
    $("promotionTitle").value = promotion.title || "";
    $("promotionBody").value = promotion.body || "";
    $("promotionProduct").value = promotion.product_id || "";
    $("promotionStartsAt").value = toDatetimeLocal(promotion.starts_at);
    $("promotionEndsAt").value = toDatetimeLocal(promotion.ends_at);
    $("promotionOrder").value = String(promotion.display_order || 0);
    $("promotionActive").value = String(promotion.active === true);
    document.querySelectorAll(".promotion-day").forEach(input => {
      input.checked = (promotion.days_of_week || []).includes(Number(input.value));
    });
    $("promotionImageFile").value = "";
    setPreview("promotionImagePreview", promotion.image_url || "");
    $("promotionTitle").focus();
  }

  async function savePromotion108() {
    const localId = selectedLocalId108();
    if (!localId) return message("Selecciona un LOCAL.", "error");
    const title = $("promotionTitle").value.trim();
    if (!title) return message("Escribe el título de la promoción.", "error");

    const startsAt = fromDatetimeLocal($("promotionStartsAt").value);
    const endsAt = fromDatetimeLocal($("promotionEndsAt").value);
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
      return message("La fecha final debe ser posterior al inicio.", "error");
    }

    const currentId = $("promotionId").value || null;
    const oldImageUrl = $("promotionImageUrl").value || null;
    const args = {
      p_promotion_id: currentId,
      p_local_id: localId,
      p_product_id: $("promotionProduct").value || null,
      p_title: title,
      p_body: $("promotionBody").value.trim() || null,
      p_image_url: oldImageUrl,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_days_of_week: promotionDays108(),
      p_display_order: Math.max(0, Number.parseInt($("promotionOrder").value, 10) || 0),
      p_active: $("promotionActive").value === "true"
    };

    $("savePromotionBtn").disabled = true;
    let uploaded = null;
    try {
      const id = await rpc("save_local_promotion", args);
      const file = $("promotionImageFile").files?.[0];
      if (file) {
        uploaded = await subirImagenHTPWEB(mediaPathPromotion(id), file);
        args.p_promotion_id = id;
        args.p_image_url = uploaded.url;
        await rpc("save_local_promotion", args);
        const oldPath = pathDesdePublicUrlHTPWEB(oldImageUrl);
        if (oldPath && oldPath !== uploaded.path) {
          await eliminarObjetoMediaHTPWEB(oldPath).catch(() => {});
        }
      }
      message(currentId ? "Promoción actualizada." : "Promoción creada.");
      clearPromotion108();
      await loadPromotions108();
    } catch (e) {
      if (uploaded) await eliminarObjetoMediaHTPWEB(uploaded.path).catch(() => {});
      message(e.message || "No se pudo guardar la promoción.", "error");
    } finally {
      $("savePromotionBtn").disabled = false;
    }
  }

  async function deletePromotion108(id) {
    const promotion = state.promotions.find(row => row.id === id);
    if (!promotion) return;
    if (!confirm('¿Eliminar la promoción "' + promotion.title + '"?')) return;
    try {
      await rpc("delete_local_promotion", { p_promotion_id: id });
      const path = pathDesdePublicUrlHTPWEB(promotion.image_url) || mediaPathPromotion(id);
      await eliminarObjetoMediaHTPWEB(path).catch(() => {});
      message("Promoción eliminada.");
      clearPromotion108();
      await loadPromotions108();
    } catch (e) {
      message(e.message || "No se pudo eliminar la promoción.", "error");
    }
  }

  window.editPromotion = editPromotion108;
  window.deletePromotion = deletePromotion108;

  $("validateProductPhotoBatchBtn")?.addEventListener("click", validateProductPhotoBatch108);
  $("uploadProductPhotoBatchBtn")?.addEventListener("click", uploadProductPhotoBatch108);
  $("clearProductPhotoBatchBtn")?.addEventListener("click", clearProductPhotoBatch108);
  $("savePromotionBtn")?.addEventListener("click", savePromotion108);
  $("clearPromotionBtn")?.addEventListener("click", clearPromotion108);
})();
