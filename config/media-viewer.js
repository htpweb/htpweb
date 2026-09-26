(() => {
  const $v = id => document.getElementById(id);
  let gallery = [];
  let galleryIndex = -1;
  let deepLinkOpened = false;

  function ensureUi() {
    if (!$v("clientLocalGallery")) {
      const localCard = $v("localCard");
      if (localCard) {
        const section = document.createElement("section");
        section.id = "clientLocalGallery";
        section.className = "card hidden";
        section.innerHTML = `
          <div class="row between">
            <h2 style="margin:0">Galería del local</h2>
            <span id="clientLocalGalleryCount" class="muted"></span>
          </div>
          <div id="clientLocalGalleryGrid" class="local-gallery-public"></div>
        `;
        localCard.insertAdjacentElement("afterend", section);
      }
    }

    if (!$v("mediaViewer")) {
      const viewer = document.createElement("div");
      viewer.id = "mediaViewer";
      viewer.className = "media-viewer hidden";
      viewer.setAttribute("role", "dialog");
      viewer.setAttribute("aria-modal", "true");
      viewer.setAttribute("aria-labelledby", "mediaViewerTitle");
      viewer.innerHTML = `
        <div class="media-viewer-backdrop" data-close-media-viewer="1"></div>
        <div class="media-viewer-panel">
          <button id="mediaViewerClose" class="media-viewer-close" type="button" aria-label="Cerrar">×</button>
          <div class="media-viewer-image-wrap">
            <button id="mediaViewerPrev" class="media-viewer-nav media-viewer-prev hidden" type="button" aria-label="Foto anterior">‹</button>
            <img id="mediaViewerImage" class="media-viewer-image" alt="">
            <button id="mediaViewerNext" class="media-viewer-nav media-viewer-next hidden" type="button" aria-label="Foto siguiente">›</button>
          </div>
          <div class="media-viewer-content">
            <h2 id="mediaViewerTitle"></h2>
            <p id="mediaViewerDescription" class="muted"></p>
            <div id="mediaViewerPrice" class="media-viewer-price"></div>
            <div id="mediaViewerPurchase" class="hidden">
              <label id="mediaViewerVariantLabel" for="mediaViewerVariant">Variante</label>
              <select id="mediaViewerVariant"></select>
              <div class="media-viewer-actions">
                <input id="mediaViewerQty" type="number" min="1" value="1" inputmode="numeric" aria-label="Cantidad">
                <button id="mediaViewerAdd" class="btn btn-primary" type="button">Agregar al carrito</button>
              </div>
            </div>
            <button id="mediaViewerLocalAction" class="btn btn-primary hidden" type="button">Ver productos</button>
          </div>
        </div>
      `;
      document.body.appendChild(viewer);

      $v("mediaViewerClose").onclick = close;
      $v("mediaViewer").onclick = event => {
        if (event.target?.dataset?.closeMediaViewer === "1") close();
      };
      $v("mediaViewerVariant").onchange = syncVariantPrice;
      $v("mediaViewerAdd").onclick = addFromViewer;
      $v("mediaViewerPrev").onclick = () => stepGallery(-1);
      $v("mediaViewerNext").onclick = () => stepGallery(1);
      $v("mediaViewerLocalAction").onclick = () => {
        close();
        $v("products")?.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    }
  }

  function baseOpen(imageUrl, title, description = "") {
    ensureUi();
    $v("mediaViewerImage").src = imageUrl || "";
    $v("mediaViewerImage").alt = title || "Imagen";
    $v("mediaViewerTitle").textContent = title || "";
    $v("mediaViewerDescription").textContent = description || "";
    $v("mediaViewer").classList.remove("hidden");
    document.body.classList.add("media-viewer-open");
  }

  function close() {
    $v("mediaViewer")?.classList.add("hidden");
    document.body.classList.remove("media-viewer-open");
    galleryIndex = -1;
  }

  function galleryNavigation(enabled) {
    $v("mediaViewerPrev")?.classList.toggle("hidden", !enabled);
    $v("mediaViewerNext")?.classList.toggle("hidden", !enabled);
  }

  function openBanner() {
    if (typeof localActual === "undefined" || !localActual?.banner_url) return;
    galleryIndex = -1;
    baseOpen(localActual.banner_url, localActual.name || "LOCAL", localActual.description || "");
    $v("mediaViewerPrice").textContent = "";
    $v("mediaViewerPurchase").classList.add("hidden");
    $v("mediaViewerLocalAction").classList.remove("hidden");
    galleryNavigation(false);
  }

  function openGallery(index) {
    if (!gallery.length) return;
    const next = ((Number(index) || 0) + gallery.length) % gallery.length;
    galleryIndex = next;
    const item = gallery[next];
    const localName = typeof localActual !== "undefined" ? localActual?.name : "LOCAL";
    baseOpen(item.image_url, localName || "Galería del local", `Foto ${next + 1} de ${gallery.length}`);
    $v("mediaViewerPrice").textContent = "";
    $v("mediaViewerPurchase").classList.add("hidden");
    $v("mediaViewerLocalAction").classList.remove("hidden");
    galleryNavigation(gallery.length > 1);
  }

  function stepGallery(direction) {
    if (galleryIndex < 0 || !gallery.length) return;
    openGallery(galleryIndex + direction);
  }

  function openProduct(productId) {
    if (typeof products === "undefined" || typeof variants === "undefined") return;
    const product = products.find(item => item.id === productId);
    if (!product) return;

    const local = typeof localActual !== "undefined" ? localActual : null;
    const productVariants = variants.filter(item => item.product_id === productId);
    galleryIndex = -1;

    baseOpen(product.image_url || local?.banner_url || "", product.name || "Producto", product.description || "");
    $v("mediaViewerLocalAction").classList.add("hidden");
    $v("mediaViewerPurchase").classList.remove("hidden");
    $v("mediaViewerQty").value = 1;
    $v("mediaViewerAdd").dataset.productId = product.id;
    galleryNavigation(false);

    const variantSelect = $v("mediaViewerVariant");
    if (productVariants.length) {
      $v("mediaViewerVariantLabel").classList.remove("hidden");
      variantSelect.classList.remove("hidden");
      variantSelect.innerHTML = productVariants.map(item =>
        `<option value="${item.id}" data-price="${Number(item.price)}">${escapeHtml(item.name)} — $${Number(item.price).toFixed(2)}</option>`
      ).join("");
      $v("mediaViewerPrice").textContent = "$ " + Number(productVariants[0].price || 0).toFixed(2);
    } else {
      $v("mediaViewerVariantLabel").classList.add("hidden");
      variantSelect.classList.add("hidden");
      variantSelect.innerHTML = "";
      $v("mediaViewerPrice").textContent = "$ " + Number(product.price || 0).toFixed(2);
    }

    const closed = typeof availability !== "undefined" && availability && availability.is_open !== true;
    $v("mediaViewerAdd").disabled = Boolean(closed);
    $v("mediaViewerAdd").textContent = closed ? "Local cerrado" : "Agregar al carrito";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[ch]));
  }

  function syncVariantPrice() {
    const option = $v("mediaViewerVariant")?.selectedOptions?.[0];
    if (!option) return;
    $v("mediaViewerPrice").textContent = "$ " + Number(option.dataset.price || 0).toFixed(2);
  }

  function addFromViewer() {
    const productId = $v("mediaViewerAdd")?.dataset?.productId || "";
    if (!productId || typeof addProduct !== "function") return;

    const qtyInput = document.getElementById("qty-" + productId);
    const variantInput = document.getElementById("variant-" + productId);
    if (qtyInput) qtyInput.value = Math.max(1, Number.parseInt($v("mediaViewerQty").value, 10) || 1);
    if (variantInput && !$v("mediaViewerVariant").classList.contains("hidden")) {
      variantInput.value = $v("mediaViewerVariant").value;
      if (typeof syncVariantPrice === "function") syncVariantPrice(productId);
    }

    addProduct(productId);
    close();
  }

  async function loadGallery() {
    ensureUi();
    try {
      if (typeof localId === "undefined" || !localId || !window.supabaseClient) return;
      const { data, error } = await supabaseClient.rpc("public_list_local_gallery", { p_local_id: localId });
      if (error) throw error;
      gallery = Array.isArray(data) ? data.filter(item => item?.image_url) : [];

      const section = $v("clientLocalGallery");
      const grid = $v("clientLocalGalleryGrid");
      if (!section || !grid) return;

      if (!gallery.length) {
        section.classList.add("hidden");
        return;
      }

      section.classList.remove("hidden");
      $v("clientLocalGalleryCount").textContent = gallery.length + (gallery.length === 1 ? " foto" : " fotos");
      grid.innerHTML = gallery.map((item, index) =>
        `<button type="button" class="local-gallery-public-item" data-gallery-index="${index}" aria-label="Abrir foto ${index + 1}">
          <img src="${escapeHtml(item.image_url)}" alt="Foto ${index + 1} de la galería" loading="lazy">
        </button>`
      ).join("");
    } catch (error) {
      console.warn("No se pudo cargar la galería pública del LOCAL:", error);
    }
  }

  function bindDelegatedClicks() {
    $v("products")?.addEventListener("click", event => {
      if (event.target.closest("button,input,select,label,a")) return;
      const row = event.target.closest(".product-row[id^='product-']");
      const productId = row?.id?.replace(/^product-/, "");
      if (productId) openProduct(productId);
    });

    $v("localCard")?.addEventListener("click", event => {
      const image = event.target.closest("img");
      if (image) openBanner();
    });

    $v("clientLocalGallery")?.addEventListener("click", event => {
      const button = event.target.closest("[data-gallery-index]");
      if (button) openGallery(Number(button.dataset.galleryIndex));
    });
  }

  function tryOpenDeepLink() {
    if (deepLinkOpened) return;
    const search = new URLSearchParams(location.search);
    const productId = search.get("product");
    const view = search.get("view");

    if (productId && typeof products !== "undefined" && products.some(item => item.id === productId)) {
      deepLinkOpened = true;
      openProduct(productId);
      return;
    }

    if (view === "banner" && typeof localActual !== "undefined" && localActual?.banner_url) {
      deepLinkOpened = true;
      openBanner();
    }
  }

  ensureUi();
  bindDelegatedClicks();
  loadGallery();

  const observer = new MutationObserver(() => {
    const banner = $v("localCard")?.querySelector("img");
    if (banner) {
      banner.classList.add("client-media-clickable");
      banner.setAttribute("title", "Toca para ampliar");
    }

    $v("products")?.querySelectorAll(".product-row img").forEach(image => {
      image.classList.add("client-media-clickable");
      image.setAttribute("title", "Toca para ver y comprar");
    });

    tryOpenDeepLink();
  });

  if ($v("localCard")) observer.observe($v("localCard"), { childList: true, subtree: true });
  if ($v("products")) observer.observe($v("products"), { childList: true, subtree: true });

  document.addEventListener("keydown", event => {
    if ($v("mediaViewer")?.classList.contains("hidden")) return;
    if (event.key === "Escape") close();
    if (galleryIndex >= 0 && event.key === "ArrowLeft") stepGallery(-1);
    if (galleryIndex >= 0 && event.key === "ArrowRight") stepGallery(1);
  });

  setTimeout(tryOpenDeepLink, 350);
  setTimeout(tryOpenDeepLink, 900);

  window.HTPWEBMediaViewer = {
    openProduct,
    openBanner,
    openGallery,
    close
  };
})();