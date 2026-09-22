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
    loadPromotionSupport108()
      .then(loadPromotions108)
      .catch(error => {
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

  async function loadPromotionSupport108() {
    const ids=(state.products||[]).map(product=>product.id).filter(Boolean);
    state.promotionVariants=[];
    if(ids.length){
      const {data,error}=await supabaseClient
        .from("product_variants")
        .select("id,product_id,name,price,display_order,active")
        .in("product_id",ids)
        .order("display_order")
        .order("name");
      if(error)throw error;
      state.promotionVariants=data||[];
    }
    if(!Array.isArray(state.promotionDraftItems))state.promotionDraftItems=[];
    renderPromotionItemsEditor108();
  }

  function variantsForPromotionProduct108(productId){
    return (state.promotionVariants||[]).filter(variant=>variant.product_id===productId);
  }

  function addPromotionItem108(seed={}){
    const firstProduct=state.products?.[0]||null;
    state.promotionDraftItems=Array.isArray(state.promotionDraftItems)?state.promotionDraftItems:[];
    state.promotionDraftItems.push({
      product_id:seed.product_id||firstProduct?.id||"",
      variant_id:seed.variant_id||"",
      quantity:Number(seed.quantity||1),
      promo_price:seed.promo_price===null||seed.promo_price===undefined?"":String(seed.promo_price)
    });
    renderPromotionItemsEditor108();
  }

  function removePromotionItem108(index){
    state.promotionDraftItems.splice(index,1);
    renderPromotionItemsEditor108();
  }

  function renderPromotionItemsEditor108(){
    const container=$("promotionItemsEditor");
    if(!container)return;
    const items=Array.isArray(state.promotionDraftItems)?state.promotionDraftItems:[];

    if(!items.length){
      container.innerHTML='<div class="muted">Aún no has agregado productos a esta promoción.</div>';
      return;
    }

    const optionsMode=promotionType108()==="OPTIONS";
    container.innerHTML='<div class="table-wrap"><table><thead><tr>'+
      '<th>Producto</th><th>Variante</th><th>Cantidad</th><th>Precio normal base</th><th>'+(optionsMode?'Precio final de la opción':'Precio promocional línea (opcional)')+'</th><th></th>'+
      '</tr></thead><tbody>'+
      items.map((item,index)=>{
        const product=state.products.find(row=>row.id===item.product_id)||null;
        const variants=variantsForPromotionProduct108(item.product_id);
        const selectedVariant=variants.find(row=>row.id===item.variant_id)||null;
        const regular=selectedVariant?Number(selectedVariant.price||0):Number(product?.price||0);
        const productOptions=state.products.map(row=>
          '<option value="'+esc(row.id)+'" '+(row.id===item.product_id?'selected':'')+'>'+esc(row.name)+(row.sku?' · '+esc(row.sku):'')+'</option>'
        ).join("");
        const variantOptions='<option value="">Precio base / sin variante</option>'+
          variants.map(row=>
            '<option value="'+esc(row.id)+'" '+(row.id===item.variant_id?'selected':'')+'>'+esc(row.name)+' · $'+Number(row.price||0).toFixed(2)+'</option>'
          ).join("");
        return '<tr data-promo-item="'+index+'">'+
          '<td><select data-promo-product="'+index+'">'+productOptions+'</select></td>'+
          '<td><select data-promo-variant="'+index+'">'+variantOptions+'</select></td>'+
          '<td><input data-promo-qty="'+index+'" type="number" min="1" max="999" step="1" value="'+esc(item.quantity||1)+'"></td>'+
          '<td>$'+regular.toFixed(2)+'</td>'+
          '<td><input data-promo-price="'+index+'" type="number" min="0" step="0.01" value="'+esc(item.promo_price??"")+'" placeholder="'+(optionsMode?'Obligatorio':'Opcional')+'"></td>'+
          '<td><button class="btn-danger" type="button" data-promo-remove="'+index+'">Quitar</button></td>'+
        '</tr>';
      }).join("")+'</tbody></table></div>';

    container.querySelectorAll("[data-promo-product]").forEach(select=>{
      select.onchange=()=>{
        const index=Number(select.dataset.promoProduct);
        const item=state.promotionDraftItems[index];
        if(!item)return;
        item.product_id=select.value;
        item.variant_id="";
        renderPromotionItemsEditor108();
      };
    });
    container.querySelectorAll("[data-promo-variant]").forEach(select=>{
      select.onchange=()=>{
        const item=state.promotionDraftItems[Number(select.dataset.promoVariant)];
        if(item)item.variant_id=select.value;
        renderPromotionItemsEditor108();
      };
    });
    container.querySelectorAll("[data-promo-qty]").forEach(input=>{
      input.oninput=()=>{
        const item=state.promotionDraftItems[Number(input.dataset.promoQty)];
        if(item)item.quantity=input.value;
      };
    });
    container.querySelectorAll("[data-promo-price]").forEach(input=>{
      input.oninput=()=>{
        const item=state.promotionDraftItems[Number(input.dataset.promoPrice)];
        if(item)item.promo_price=input.value;
      };
    });
    container.querySelectorAll("[data-promo-remove]").forEach(button=>{
      button.onclick=()=>removePromotionItem108(Number(button.dataset.promoRemove));
    });
  }

  function promotionDays108() {
    return [...document.querySelectorAll(".promotion-day:checked")].map(input => Number(input.value));
  }

  function promotionType108(){
    return $("promotionType")?.value === "COMBO" ? "COMBO" : "OPTIONS";
  }

  function updatePromotionTypeUI108(){
    const type=promotionType108();
    const priceField=$("promotionPriceField");
    const price=$("promotionPrice");
    const help=$("promotionItemsHelp");
    if(priceField)priceField.classList.toggle("hidden",type!=="COMBO");
    if(type!=="COMBO"&&price)price.value="";
    if(help){
      help.textContent=type==="OPTIONS"
        ?"Cada fila es una opción independiente: cantidad + precio final de esa opción."
        :"Cada fila es un componente del combo. El precio total del paquete se define arriba.";
    }
    renderPromotionItemsEditor108();
  }

  function clearPromotion108() {
    if (!$("promotionId")) return;
    $("promotionId").value = "";
    $("promotionImageUrl").value = "";
    $("promotionTitle").value = "";
    $("promotionBody").value = "";
    $("promotionType").value = "OPTIONS";
    $("promotionPrice").value = "";
    $("promotionStartsAt").value = "";
    $("promotionEndsAt").value = "";
    $("promotionOrder").value = "0";
    $("promotionActive").value = "true";
    $("promotionImageFile").value = "";
    state.promotionDraftItems=[];
    document.querySelectorAll(".promotion-day").forEach(input => { input.checked = false; });
    setPreview("promotionImagePreview", "");
    updatePromotionTypeUI108();
  }

  function promotionItemsSummary108(items){
    if(!Array.isArray(items)||!items.length)return "Sin productos específicos";
    return items.map(item=>{
      const product=state.products.find(row=>row.id===item.product_id);
      const variant=(state.promotionVariants||[]).find(row=>row.id===item.variant_id);
      const label=(product?.name||"Producto")+(variant?" · "+variant.name:"");
      const price=item.promo_price!==null&&item.promo_price!==undefined
        ?" · promo $"+Number(item.promo_price).toFixed(2)
        :"";
      return item.quantity+"× "+label+price;
    }).join(" | ");
  }

  function renderPromotions108() {
    const container = $("promotionsList");
    if (!container) return;
    if (!state.promotions.length) {
      container.innerHTML = '<div class="muted">No hay promociones configuradas para este LOCAL.</div>';
      return;
    }

    container.innerHTML = state.promotions.map(promotion => {
      const days = promotion.days_of_week?.length
        ? promotion.days_of_week.map(day => dayNames[Number(day)]).join(", ")
        : "Todos los días";
      const start = promotion.starts_at ? new Date(promotion.starts_at).toLocaleString() : "Sin inicio";
      const end = promotion.ends_at ? new Date(promotion.ends_at).toLocaleString() : "Sin fin";
      const typeLabel = promotion.promotion_type === "OPTIONS" ? "Opciones alternativas" : "Combo / paquete";
      const total = promotion.promotion_price !== null && promotion.promotion_price !== undefined
        ? '<div><strong>Precio total promocional: $' + Number(promotion.promotion_price).toFixed(2) + '</strong></div>'
        : "";

      return '<div class="card" style="margin:0 0 10px">' +
        '<div class="row between"><div><strong>' + esc(promotion.title) + '</strong>' +
        '<div class="muted">' + esc(typeLabel) + ' · ' + esc(days) + ' · ' + esc(start) + ' → ' + esc(end) + '</div></div>' +
        '<span class="badge">' + (promotion.active ? "ACTIVA" : "INACTIVA") + '</span></div>' +
        total +
        '<div class="muted" style="margin-top:6px">' + esc(promotionItemsSummary108(promotion.items)) + '</div>' +
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
      .select("id,local_id,title,body,image_url,starts_at,ends_at,days_of_week,display_order,active,promotion_type,promotion_price,created_at,updated_at")
      .eq("local_id", localId)
      .order("display_order")
      .order("created_at", { ascending: false });

    if (error) throw error;
    const promotions=data||[];
    const ids=promotions.map(row=>row.id);
    let items=[];
    if(ids.length){
      const itemRes=await supabaseClient
        .from("local_promotion_items")
        .select("id,promotion_id,product_id,variant_id,quantity,promo_price,display_order")
        .in("promotion_id",ids)
        .order("display_order");
      if(itemRes.error)throw itemRes.error;
      items=itemRes.data||[];
    }

    state.promotions=promotions.map(promotion=>({
      ...promotion,
      items:items.filter(item=>item.promotion_id===promotion.id)
    }));
    renderPromotions108();
  }

  function editPromotion108(id) {
    const promotion = state.promotions.find(row => row.id === id);
    if (!promotion) return;
    $("promotionId").value = promotion.id;
    $("promotionImageUrl").value = promotion.image_url || "";
    $("promotionTitle").value = promotion.title || "";
    $("promotionBody").value = promotion.body || "";
    $("promotionType").value = promotion.promotion_type || "COMBO";
    $("promotionPrice").value = promotion.promotion_price ?? "";
    $("promotionStartsAt").value = toDatetimeLocal(promotion.starts_at);
    $("promotionEndsAt").value = toDatetimeLocal(promotion.ends_at);
    $("promotionOrder").value = String(promotion.display_order || 0);
    $("promotionActive").value = String(promotion.active === true);
    state.promotionDraftItems=(promotion.items||[]).map(item=>({
      product_id:item.product_id,
      variant_id:item.variant_id||"",
      quantity:item.quantity||1,
      promo_price:item.promo_price??""
    }));
    document.querySelectorAll(".promotion-day").forEach(input => {
      input.checked = (promotion.days_of_week || []).includes(Number(input.value));
    });
    $("promotionImageFile").value = "";
    setPreview("promotionImagePreview", promotion.image_url || "");
    updatePromotionTypeUI108();
    $("promotionTitle").focus();
  }

  function normalizedPromotionItems108(){
    return (state.promotionDraftItems||[]).map((item,index)=>{
      if(!item.product_id)throw new Error("Selecciona el producto de la línea "+(index+1)+".");
      const product=state.products.find(row=>row.id===item.product_id);
      if(!product)throw new Error("Producto inválido en la línea "+(index+1)+".");
      const quantity=Number(item.quantity);
      if(!Number.isInteger(quantity)||quantity<1||quantity>999){
        throw new Error("Cantidad inválida en la línea "+(index+1)+".");
      }
      if(item.variant_id){
        const variant=variantsForPromotionProduct108(item.product_id).find(row=>row.id===item.variant_id);
        if(!variant)throw new Error("Variante inválida en la línea "+(index+1)+".");
      }
      let promoPrice=null;
      if(String(item.promo_price??"").trim()!==""){
        promoPrice=Number(item.promo_price);
        if(!Number.isFinite(promoPrice)||promoPrice<0){
          throw new Error("Precio promocional inválido en la línea "+(index+1)+".");
        }
      }
      if(promotionType108()==="OPTIONS"&&promoPrice===null){
        throw new Error("Cada opción debe tener un precio promocional. Revisa la línea "+(index+1)+".");
      }
      return {
        product_id:item.product_id,
        variant_id:item.variant_id||null,
        quantity,
        promo_price:promoPrice
      };
    });
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

    const promotionType=promotionType108();
    let promotionPrice=null;
    if(promotionType==="COMBO"&&$("promotionPrice").value.trim()!==""){
      promotionPrice=Number($("promotionPrice").value);
      if(!Number.isFinite(promotionPrice)||promotionPrice<0){
        return message("El precio total promocional no es válido.","error");
      }
    }

    let items;
    try{items=normalizedPromotionItems108();}
    catch(e){return message(e.message,"error");}

    const currentId = $("promotionId").value || null;
    const oldImageUrl = $("promotionImageUrl").value || null;
    const args = {
      p_promotion_id: currentId,
      p_local_id: localId,
      p_title: title,
      p_body: $("promotionBody").value.trim() || null,
      p_image_url: oldImageUrl,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_days_of_week: promotionDays108(),
      p_display_order: Math.max(0, Number.parseInt($("promotionOrder").value, 10) || 0),
      p_active: $("promotionActive").value === "true",
      p_promotion_type: promotionType,
      p_promotion_price: promotionPrice,
      p_items: items
    };

    $("savePromotionBtn").disabled = true;
    let uploaded = null;
    let savedId = currentId;
    const file = $("promotionImageFile").files?.[0] || null;

    try {
      savedId = await rpc("save_local_promotion_v3", args);

      if (file) {
        try {
          uploaded = await subirImagenHTPWEB(mediaPathPromotion(savedId), file);
          args.p_promotion_id = savedId;
          args.p_image_url = uploaded.url;
          await rpc("save_local_promotion_v3", args);

          const oldPath = pathDesdePublicUrlHTPWEB(oldImageUrl);
          if (oldPath && oldPath !== uploaded.path) {
            await eliminarObjetoMediaHTPWEB(oldPath).catch(() => {});
          }
        } catch (imageError) {
          if (uploaded) {
            await eliminarObjetoMediaHTPWEB(uploaded.path).catch(() => {});
          }

          if (!currentId && savedId) {
            await rpc("delete_local_promotion", { p_promotion_id: savedId }).catch(() => {});
            savedId = null;
            throw new Error(
              "No se pudo subir la imagen. La promoción nueva fue cancelada para no dejarla incompleta. " +
              (imageError?.message || imageError)
            );
          }

          throw new Error(
            "La promoción existente conservó su imagen anterior, pero no se pudo subir la nueva. " +
            (imageError?.message || imageError)
          );
        }
      }

      message(currentId ? "Promoción actualizada." : "Promoción creada.");
      clearPromotion108();
      await loadPromotions108();
    } catch (e) {
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
      const path = pathDesdePublicUrlHTPWEB(promotion.image_url) || mediaPathPromotion(id);
      if (promotion.image_url) {
        await eliminarObjetoMediaHTPWEB(path).catch(() => {});
      }
      await rpc("delete_local_promotion", { p_promotion_id: id });
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
  $("addPromotionItemBtn")?.addEventListener("click", () => addPromotionItem108());
  $("promotionType")?.addEventListener("change", updatePromotionTypeUI108);
  $("savePromotionBtn")?.addEventListener("click", savePromotion108);
  $("clearPromotionBtn")?.addEventListener("click", clearPromotion108);
})();
