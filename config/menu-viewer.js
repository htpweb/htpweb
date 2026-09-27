(() => {
  const $m = id => document.getElementById(id);
  let menuPages = [];
  let pageIndex = 0;
  let loaded = false;
  let currentView = "menu";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[ch]));
  }

  function productsCard() {
    const productsEl = $m("products");
    return productsEl?.closest("section") || null;
  }

  function ensureUi() {
    const productCard = productsCard();
    if (!productCard) return false;
    if (!productCard.id) productCard.id = "productsCard";

    if (!$m("visualMenuTabs")) {
      const tabs = document.createElement("div");
      tabs.id = "visualMenuTabs";
      tabs.className = "client-catalog-tabs hidden";
      tabs.innerHTML = `
        <button id="visualMenuTab" class="client-catalog-tab active" type="button">MENÚ</button>
        <button id="visualProductsTab" class="client-catalog-tab" type="button">PRODUCTOS</button>
      `;
      productCard.insertAdjacentElement("beforebegin", tabs);

      $m("visualMenuTab").onclick = () => showView("menu");
      $m("visualProductsTab").onclick = () => showView("products");
    }

    if (!$m("visualMenuCard")) {
      const section = document.createElement("section");
      section.id = "visualMenuCard";
      section.className = "card hidden";
      section.innerHTML = `
        <div class="visual-menu-heading">
          <div>
            <h2 style="margin:0">Menú</h2>
            <div id="visualMenuPageLabel" class="muted"></div>
          </div>
          <div id="visualMenuPageNav" class="visual-menu-page-nav">
            <button id="visualMenuPrev" class="btn btn-muted" type="button" aria-label="Hoja anterior">‹</button>
            <span id="visualMenuPageCounter"></span>
            <button id="visualMenuNext" class="btn btn-muted" type="button" aria-label="Hoja siguiente">›</button>
          </div>
        </div>
        <div class="visual-menu-layout">
          <div class="visual-menu-image-column">
            <button id="visualMenuImageButton" type="button" class="visual-menu-image-button" aria-label="Ampliar menú">
              <img id="visualMenuImage" class="visual-menu-image" alt="Menú del local">
              <span class="visual-menu-zoom-hint">🔍 Ampliar</span>
            </button>
          </div>
          <div class="visual-menu-products-column">
            <div class="visual-menu-products-header">
              <strong>Productos de esta hoja</strong>
              <span class="muted">Puedes agregar varios sin salir del menú.</span>
            </div>
            <div id="visualMenuProducts" class="visual-menu-products"></div>
          </div>
        </div>
      `;
      productCard.insertAdjacentElement("beforebegin", section);

      $m("visualMenuPrev").onclick = () => stepPage(-1);
      $m("visualMenuNext").onclick = () => stepPage(1);
      $m("visualMenuImageButton").onclick = openZoom;
    }

    if (!$m("visualMenuZoom")) {
      const zoom = document.createElement("div");
      zoom.id = "visualMenuZoom";
      zoom.className = "visual-menu-zoom hidden";
      zoom.innerHTML = `
        <div class="visual-menu-zoom-backdrop" data-close-menu-zoom="1"></div>
        <div class="visual-menu-zoom-panel">
          <button id="visualMenuZoomClose" class="media-viewer-close" type="button" aria-label="Cerrar">×</button>
          <img id="visualMenuZoomImage" alt="Menú ampliado">
        </div>
      `;
      document.body.appendChild(zoom);
      $m("visualMenuZoomClose").onclick = closeZoom;
      zoom.onclick = event => {
        if (event.target?.dataset?.closeMenuZoom === "1") closeZoom();
      };
    }

    const gallery = $m("clientLocalGallery");
    if (gallery && gallery.previousElementSibling !== productCard) {
      productCard.insertAdjacentElement("afterend", gallery);
    }

    return true;
  }

  function openZoom() {
    const page = menuPages[pageIndex];
    if (!page?.image_url) return;
    $m("visualMenuZoomImage").src = page.image_url;
    $m("visualMenuZoomImage").alt = page.title || "Menú ampliado";
    $m("visualMenuZoom").classList.remove("hidden");
    document.body.classList.add("visual-menu-zoom-open");
  }

  function closeZoom() {
    $m("visualMenuZoom")?.classList.add("hidden");
    document.body.classList.remove("visual-menu-zoom-open");
  }

  function showView(view) {
    if (!menuPages.length) return;
    currentView = view === "products" ? "products" : "menu";
    const menuCard = $m("visualMenuCard");
    const productCard = productsCard();

    menuCard?.classList.toggle("hidden", currentView !== "menu");
    productCard?.classList.toggle("hidden", currentView !== "products");
    $m("visualMenuTab")?.classList.toggle("active", currentView === "menu");
    $m("visualProductsTab")?.classList.toggle("active", currentView === "products");

    if (currentView === "menu") renderPage();
  }

  function pageProducts(page) {
    if (typeof products === "undefined") return [];
    const ids = Array.isArray(page?.product_ids) ? page.product_ids : [];
    const byId = new Map(products.map(product => [product.id, product]));
    return ids.map(id => byId.get(id)).filter(Boolean);
  }

  function productVariants(productId) {
    if (typeof variants === "undefined") return [];
    return variants.filter(variant => variant.product_id === productId);
  }

  function menuVariantId(productId) {
    const select = $m("visual-menu-variant-" + productId);
    const vs = productVariants(productId);
    return select?.value || vs[0]?.id || null;
  }

  function menuQuantity(productId, variantId = menuVariantId(productId)) {
    if (
      typeof carritoCantidadItem !== "function" ||
      typeof negocioActual === "undefined" ||
      !negocioActual?.slug ||
      typeof window.htpwebProductCartMatcher !== "function"
    ) return 0;

    return carritoCantidadItem(
      negocioActual.slug,
      window.htpwebProductCartMatcher(productId, variantId || null)
    );
  }

  function menuPrice(product, variantId = menuVariantId(product.id)) {
    const variant = variantId
      ? productVariants(product.id).find(item => item.id === variantId)
      : null;
    return Number(variant?.price ?? product.price ?? 0);
  }

  function renderProductRow(product) {
    const vs = productVariants(product.id);
    const firstVariantId = vs[0]?.id || null;
    const price = Number(vs[0]?.price ?? product.price ?? 0);
    const closed = typeof availability !== "undefined" && availability && availability.is_open !== true;

    return `
      <div class="visual-menu-product" data-menu-product="${escapeHtml(product.id)}">
        <div class="visual-menu-product-main">
          <strong>${escapeHtml(product.name)}</strong>
          ${product.description ? `<div class="muted visual-menu-product-description">${escapeHtml(product.description)}</div>` : ""}
        </div>
        ${vs.length ? `
          <label for="visual-menu-variant-${product.id}">Variante</label>
          <select
            id="visual-menu-variant-${product.id}"
            onchange="HTPWEBVisualMenu.variantChanged('${product.id}')"
          >
            ${vs.map(variant =>
              `<option value="${variant.id}" data-price="${Number(variant.price)}">${escapeHtml(variant.name)} — $${Number(variant.price).toFixed(2)}</option>`
            ).join("")}
          </select>
        ` : ""}
        <div class="visual-menu-product-bottom">
          <div class="visual-menu-price" id="visual-menu-price-${product.id}">$ ${price.toFixed(2)}</div>
          <div class="visual-menu-buy">
            <div class="quantity-stepper">
              <button
                type="button"
                class="qty-step-btn"
                aria-label="Disminuir cantidad"
                ${closed ? "disabled" : ""}
                onclick="HTPWEBVisualMenu.change('${product.id}',-1)"
              >−</button>
              <input
                id="visual-menu-qty-${product.id}"
                type="number"
                min="0"
                step="1"
                value="${menuQuantity(product.id, firstVariantId)}"
                aria-label="Cantidad en carrito"
                ${closed ? "disabled" : ""}
                oninput="HTPWEBVisualMenu.set('${product.id}',this.value)"
              >
              <button
                type="button"
                class="qty-step-btn"
                aria-label="Aumentar cantidad"
                ${closed ? "disabled" : ""}
                onclick="HTPWEBVisualMenu.change('${product.id}',1)"
              >+</button>
            </div>
            <button
              type="button"
              class="btn btn-primary visual-menu-add"
              ${closed ? "disabled" : ""}
              onclick="HTPWEBVisualMenu.add('${product.id}')"
            >${closed ? "Local cerrado" : "Agregar"}</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderPage() {
    if (!menuPages.length || !ensureUi()) return;
    const page = menuPages[pageIndex];
    const pageItems = pageProducts(page);

    $m("visualMenuImage").src = page.image_url || "";
    $m("visualMenuImage").alt = page.title || `Hoja ${pageIndex + 1} del menú`;
    $m("visualMenuPageLabel").textContent = page.title || `Hoja ${pageIndex + 1}`;
    $m("visualMenuPageCounter").textContent = `${pageIndex + 1} / ${menuPages.length}`;
    $m("visualMenuPageNav").classList.toggle("hidden", menuPages.length <= 1);
    $m("visualMenuPrev").disabled = menuPages.length <= 1;
    $m("visualMenuNext").disabled = menuPages.length <= 1;

    $m("visualMenuProducts").innerHTML = pageItems.length
      ? pageItems.map(renderProductRow).join("")
      : '<div class="empty">No hay productos asociados a esta hoja.</div>';

    syncAllMenuQuantities();
  }

  function stepPage(direction) {
    if (menuPages.length <= 1) return;
    pageIndex = (pageIndex + Number(direction) + menuPages.length) % menuPages.length;
    renderPage();
  }

  function selectedVariant(productId) {
    return menuVariantId(productId);
  }

  function syncRow(productId) {
    const product = typeof products !== "undefined"
      ? products.find(item => item.id === productId)
      : null;
    if (!product) return;

    const variantId = selectedVariant(productId);
    const price = menuPrice(product, variantId);
    const priceEl = $m("visual-menu-price-" + productId);
    const qtyEl = $m("visual-menu-qty-" + productId);

    if (priceEl) priceEl.textContent = "$ " + price.toFixed(2);
    if (qtyEl) qtyEl.value = menuQuantity(productId, variantId);
  }

  function syncAllMenuQuantities() {
    if (!menuPages.length || currentView !== "menu") return;
    pageProducts(menuPages[pageIndex]).forEach(product => syncRow(product.id));
  }

  function variantChanged(productId) {
    syncRow(productId);
  }

  function add(productId) {
    if (typeof window.htpwebAddProductUnit !== "function") return 0;
    const variantId = selectedVariant(productId);
    const total = window.htpwebAddProductUnit(productId, variantId);
    syncRow(productId);

    const row = document.querySelector(`[data-menu-product="${CSS.escape(productId)}"]`);
    const button = row?.querySelector(".visual-menu-add");
    if (button && !button.disabled) {
      button.textContent = `En carrito: ${total} ✓`;
      window.clearTimeout(button._menuFeedback);
      button._menuFeedback = window.setTimeout(() => {
        if (!button.disabled) button.textContent = "Agregar";
      }, 800);
    }
    return total;
  }

  function change(productId, delta) {
    if (typeof window.htpwebChangeProductQuantity !== "function") return 0;
    const variantId = selectedVariant(productId);
    const total = window.htpwebChangeProductQuantity(productId, Number(delta), variantId);
    syncRow(productId);
    return total;
  }

  function setQuantity(productId, quantity) {
    if (typeof window.htpwebSetProductQuantity !== "function") return 0;
    const variantId = selectedVariant(productId);
    const total = window.htpwebSetProductQuantity(productId, quantity, variantId);
    syncRow(productId);
    return total;
  }

  async function loadMenuPages() {
    if (loaded) return;
    if (
      typeof localId === "undefined" ||
      !localId ||
      typeof supabaseClient === "undefined" ||
      typeof localActual === "undefined" ||
      !localActual?.id ||
      localActual.id !== localId ||
      typeof products === "undefined" ||
      !Array.isArray(products) ||
      products.length === 0
    ) return;

    try {
      const { data, error } = await supabaseClient.rpc("public_local_menu_pages", {
        p_local_id: localId
      });
      if (error) throw error;

      menuPages = Array.isArray(data)
        ? data.filter(page => page?.image_url)
        : [];

      loaded = true;
      if (!menuPages.length) return;

      ensureUi();
      $m("visualMenuTabs").classList.remove("hidden");
      pageIndex = 0;
      currentView = "menu";
      showView("menu");
    } catch (error) {
      console.warn("No se pudo cargar el menú visual del LOCAL:", error?.message || error);
    }
  }

  window.addEventListener("htpweb:local-ready", loadMenuPages);
  window.addEventListener("htpweb:cart", syncAllMenuQuantities);

  document.addEventListener("keydown", event => {
    if (!$m("visualMenuZoom")?.classList.contains("hidden") && event.key === "Escape") {
      closeZoom();
      return;
    }
    if (currentView !== "menu" || menuPages.length <= 1) return;
    if (event.key === "ArrowLeft") stepPage(-1);
    if (event.key === "ArrowRight") stepPage(1);
  });

  setTimeout(loadMenuPages, 700);
  setTimeout(loadMenuPages, 1400);

  window.HTPWEBVisualMenu = {
    add,
    change,
    set: setQuantity,
    variantChanged,
    stepPage,
    showView,
    refresh: renderPage
  };
})();
