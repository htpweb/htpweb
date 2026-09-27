(() => {
  const $m = id => document.getElementById(id);
  const scopes = ["inline", "viewer"];

  let menuPages = [];
  let pageIndex = 0;
  let loaded = false;
  let currentView = "menu";
  const selectedVariants = new Map();
  const expandedCategories = {
    inline: new Set(),
    viewer: new Set()
  };
  const searchTerms = {
    inline: "",
    viewer: ""
  };
  const initializedCategoryPages = {
    inline: new Set(),
    viewer: new Set()
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[ch]));
  }

  function productsCard() {
    const productsEl = $m("products");
    return productsEl?.closest("section") || null;
  }

  function controlId(scope, type, productId, variantId = null) {
    const variantKey = variantId ? "-" + variantId : "";
    return `${scope}-visual-menu-${type}-${productId}${variantKey}`;
  }

  function viewerIsOpen() {
    const viewer = $m("visualMenuViewer");
    return Boolean(viewer && !viewer.classList.contains("hidden"));
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
            <button id="visualMenuImageButton" type="button" class="visual-menu-image-button" aria-label="Abrir menú ampliado">
              <img id="visualMenuImage" class="visual-menu-image" alt="Menú del local">
              <span class="visual-menu-zoom-hint">🔍 Ver menú y comprar</span>
            </button>
          </div>

          <div class="visual-menu-products-column">
            <div class="visual-menu-products-header">
              <div class="visual-menu-products-title">
                <strong>Productos de esta hoja</strong>
                <span class="muted">Abre una categoría o busca un producto.</span>
              </div>
              <div class="visual-menu-search-wrap">
                <span class="visual-menu-search-icon" aria-hidden="true">⌕</span>
                <input
                  id="visualMenuSearch"
                  class="visual-menu-search"
                  type="search"
                  placeholder="Buscar producto..."
                  autocomplete="off"
                  aria-label="Buscar producto en todo el menú"
                  oninput="HTPWEBVisualMenu.search(this.value,'inline')"
                >
                <button
                  id="visualMenuSearchClear"
                  class="visual-menu-search-clear hidden"
                  type="button"
                  aria-label="Limpiar búsqueda"
                  onclick="HTPWEBVisualMenu.clearSearch('inline')"
                >×</button>
              </div>
              <div id="visualMenuSearchResults" class="visual-menu-search-results hidden"></div>
            </div>
            <div id="visualMenuProducts" class="visual-menu-products"></div>
          </div>
        </div>
      `;
      productCard.insertAdjacentElement("beforebegin", section);

      $m("visualMenuPrev").onclick = () => stepPage(-1);
      $m("visualMenuNext").onclick = () => stepPage(1);
      $m("visualMenuImageButton").onclick = openViewer;
    }

    if (!$m("visualMenuViewer")) {
      const viewer = document.createElement("div");
      viewer.id = "visualMenuViewer";
      viewer.className = "visual-menu-viewer hidden";
      viewer.setAttribute("role", "dialog");
      viewer.setAttribute("aria-modal", "true");
      viewer.setAttribute("aria-labelledby", "visualMenuViewerTitle");
      viewer.innerHTML = `
        <div class="visual-menu-viewer-backdrop" data-menu-viewer-backdrop="1"></div>
        <div class="visual-menu-viewer-panel">
          <button id="visualMenuViewerClose" class="media-viewer-close" type="button" aria-label="Cerrar">×</button>

          <div class="visual-menu-viewer-image-wrap">
            <button id="visualMenuViewerPrev" class="media-viewer-nav media-viewer-prev hidden" type="button" aria-label="Hoja anterior">‹</button>
            <img id="visualMenuViewerImage" class="visual-menu-viewer-image" alt="">
            <button id="visualMenuViewerNext" class="media-viewer-nav media-viewer-next hidden" type="button" aria-label="Hoja siguiente">›</button>
          </div>

          <div class="visual-menu-viewer-content">
            <div class="visual-menu-viewer-heading">
              <div>
                <h2 id="visualMenuViewerTitle">Menú</h2>
                <div id="visualMenuViewerPageLabel" class="muted"></div>
              </div>
              <strong id="visualMenuViewerCounter" class="visual-menu-viewer-counter"></strong>
            </div>

            <div class="visual-menu-products-header visual-menu-viewer-products-header">
              <div class="visual-menu-products-title">
                <strong>Productos de esta hoja</strong>
                <span class="muted">Abre una categoría o busca en todo el menú.</span>
              </div>
              <div class="visual-menu-search-wrap">
                <span class="visual-menu-search-icon" aria-hidden="true">⌕</span>
                <input
                  id="visualMenuViewerSearch"
                  class="visual-menu-search"
                  type="search"
                  placeholder="Buscar producto..."
                  autocomplete="off"
                  aria-label="Buscar producto en todo el menú"
                  oninput="HTPWEBVisualMenu.search(this.value,'viewer')"
                >
                <button
                  id="visualMenuViewerSearchClear"
                  class="visual-menu-search-clear hidden"
                  type="button"
                  aria-label="Limpiar búsqueda"
                  onclick="HTPWEBVisualMenu.clearSearch('viewer')"
                >×</button>
              </div>
              <div id="visualMenuViewerSearchResults" class="visual-menu-search-results hidden"></div>
            </div>
            <div id="visualMenuViewerProducts" class="visual-menu-products visual-menu-viewer-products"></div>
          </div>
        </div>
      `;

      document.body.appendChild(viewer);
      $m("visualMenuViewerClose").onclick = closeViewer;
      $m("visualMenuViewerPrev").onclick = () => stepPage(-1);
      $m("visualMenuViewerNext").onclick = () => stepPage(1);
      viewer.onclick = event => {
        if (event.target?.dataset?.menuViewerBackdrop === "1") {
          event.preventDefault();
        }
      };
    }

    const gallery = $m("clientLocalGallery");
    if (gallery && gallery.previousElementSibling !== productCard) {
      productCard.insertAdjacentElement("afterend", gallery);
    }

    return true;
  }

  function openViewer() {
    if (!menuPages.length || !ensureUi()) return;
    renderViewerPage();
    $m("visualMenuViewer").classList.remove("hidden");
    document.body.classList.add("visual-menu-viewer-open");
  }

  function closeViewer() {
    $m("visualMenuViewer")?.classList.add("hidden");
    document.body.classList.remove("visual-menu-viewer-open");
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

  function defaultVariantId(productId) {
    return productVariants(productId)[0]?.id || null;
  }

  function selectedVariantId(productId) {
    if (!selectedVariants.has(productId)) {
      selectedVariants.set(productId, defaultVariantId(productId));
    }
    return selectedVariants.get(productId) || null;
  }

  function setSelectedVariant(productId, variantId) {
    const valid = productVariants(productId).some(item => item.id === variantId);
    selectedVariants.set(productId, valid ? variantId : defaultVariantId(productId));

    const cardVariant = document.getElementById("variant-" + productId);
    const nextVariantId = selectedVariants.get(productId);
    if (cardVariant && nextVariantId) {
      cardVariant.value = nextVariantId;
      if (typeof window.syncVariantPrice === "function") {
        window.syncVariantPrice(productId);
      }
    }
  }

  function menuQuantity(productId, variantId = selectedVariantId(productId)) {
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

  function menuPrice(product, variantId = selectedVariantId(product.id)) {
    const variant = variantId
      ? productVariants(product.id).find(item => item.id === variantId)
      : null;
    return Number(variant?.price ?? product.price ?? 0);
  }

  function categoryMetaFor(page, product) {
    const categories = Array.isArray(page?.categories) ? page.categories : [];
    const meta = categories.find(item =>
      String(item?.id || "") === String(product?.category_id || "")
    );

    return {
      id: product?.category_id || "__other__",
      name: meta?.name || "Otros",
      firstProductOrder: Number(meta?.first_product_order ?? Number.MAX_SAFE_INTEGER)
    };
  }

  function groupedPageProducts(page) {
    const groups = new Map();
    const items = pageProducts(page);

    items.forEach((product, index) => {
      const meta = categoryMetaFor(page, product);
      const key = String(meta.id || "__other__");

      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          name: meta.name,
          order: Number.isFinite(meta.firstProductOrder) ? meta.firstProductOrder : index,
          items: []
        });
      }

      groups.get(key).items.push(product);
    });

    return [...groups.values()].sort((a, b) =>
      a.order - b.order || a.name.localeCompare(b.name, "es")
    );
  }

  function categoryStateKey(page, categoryId) {
    return `${page?.id || pageIndex}:${categoryId || "__other__"}`;
  }

  function ensureDefaultCategory(page, scope) {
    const groups = groupedPageProducts(page);
    if (!groups.length) return;

    const pageKey = String(page?.id || pageIndex);
    if (initializedCategoryPages[scope].has(pageKey)) return;

    initializedCategoryPages[scope].add(pageKey);
    expandedCategories[scope].add(categoryStateKey(page, groups[0].id));
  }

  function categoryIsOpen(page, categoryId, scope) {
    ensureDefaultCategory(page, scope);
    return expandedCategories[scope].has(categoryStateKey(page, categoryId));
  }

  function toggleCategory(pageId, categoryId, scope = "inline") {
    const page = menuPages.find(item => item.id === pageId);
    if (!page || !expandedCategories[scope]) return;

    const key = categoryStateKey(page, categoryId);
    const isOpen = expandedCategories[scope].has(key);
    const singleOpen = window.matchMedia?.("(max-width: 760px)")?.matches === true;

    if (singleOpen) {
      const prefix = `${page.id}:`;
      [...expandedCategories[scope]].forEach(item => {
        if (item.startsWith(prefix)) expandedCategories[scope].delete(item);
      });
    }

    if (!isOpen) expandedCategories[scope].add(key);
    else expandedCategories[scope].delete(key);

    if (scope === "viewer") renderViewerPage();
    else renderInlinePage();
    syncAllMenuQuantities();
  }

  function normalizeSearch(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function searchUiIds(scope) {
    return scope === "viewer"
      ? {
          input: "visualMenuViewerSearch",
          clear: "visualMenuViewerSearchClear",
          results: "visualMenuViewerSearchResults"
        }
      : {
          input: "visualMenuSearch",
          clear: "visualMenuSearchClear",
          results: "visualMenuSearchResults"
        };
  }

  function allMenuSearchResults(query) {
    const term = normalizeSearch(query);
    if (!term) return [];

    const matches = [];

    menuPages.forEach((page, candidatePageIndex) => {
      pageProducts(page).forEach(product => {
        const category = categoryMetaFor(page, product);
        const variantNames = productVariants(product.id)
          .map(item => item.name)
          .join(" ");

        const haystack = normalizeSearch([
          product.name,
          product.description,
          category.name,
          variantNames
        ].filter(Boolean).join(" "));

        if (!haystack.includes(term)) return;

        matches.push({
          pageIndex: candidatePageIndex,
          page,
          product,
          category
        });
      });
    });

    return matches.slice(0, 30);
  }

  function renderSearchResults(scope) {
    const ids = searchUiIds(scope);
    const input = $m(ids.input);
    const clear = $m(ids.clear);
    const target = $m(ids.results);
    if (!target) return;

    const query = searchTerms[scope] || "";
    const matches = allMenuSearchResults(query);

    if (input && input.value !== query) input.value = query;
    clear?.classList.toggle("hidden", !query);

    if (!query) {
      target.innerHTML = "";
      target.classList.add("hidden");
      return;
    }

    target.classList.remove("hidden");

    if (!matches.length) {
      target.innerHTML = '<div class="visual-menu-search-empty">No encontramos productos con ese nombre.</div>';
      return;
    }

    target.innerHTML = matches.map(match => {
      const variantsText = productVariants(match.product.id)
        .map(item => item.name)
        .slice(0, 3)
        .join(" · ");

      return `
        <button
          type="button"
          class="visual-menu-search-result"
          onclick="HTPWEBVisualMenu.selectSearchResult(${match.pageIndex},'${match.product.id}','${scope}')"
        >
          <span class="visual-menu-search-result-main">
            <strong>${escapeHtml(match.product.name)}</strong>
            <small>${escapeHtml(match.category.name)}${variantsText ? " · " + escapeHtml(variantsText) : ""}</small>
          </span>
          <span class="visual-menu-search-result-page">Hoja ${match.pageIndex + 1} ›</span>
        </button>
      `;
    }).join("");
  }

  function searchMenu(value, scope = "inline") {
    if (!searchTerms[scope]) searchTerms[scope] = "";
    searchTerms[scope] = String(value || "");
    renderSearchResults(scope);
  }

  function clearSearch(scope = "inline") {
    searchTerms[scope] = "";
    renderSearchResults(scope);
    $m(searchUiIds(scope).input)?.focus();
  }

  function selectSearchResult(targetPageIndex, productId, scope = "inline") {
    const nextPage = menuPages[Number(targetPageIndex)];
    const product = typeof products !== "undefined"
      ? products.find(item => item.id === productId)
      : null;
    if (!nextPage || !product) return;

    pageIndex = Number(targetPageIndex);
    const category = categoryMetaFor(nextPage, product);
    const key = categoryStateKey(nextPage, category.id);

    if (window.matchMedia?.("(max-width: 760px)")?.matches === true) {
      const prefix = `${nextPage.id}:`;
      [...expandedCategories[scope]].forEach(item => {
        if (item.startsWith(prefix)) expandedCategories[scope].delete(item);
      });
    }
    expandedCategories[scope].add(key);

    searchTerms[scope] = "";
    renderPage();

    requestAnimationFrame(() => {
      const selector = `[data-menu-scope="${scope}"][data-menu-product="${CSS.escape(productId)}"]`;
      const row = document.querySelector(selector);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
      row?.classList.add("visual-menu-search-target");
      window.setTimeout(() => row?.classList.remove("visual-menu-search-target"), 1600);
    });
  }

  function renderPurchasableRow(product, variant, scope) {
    const variantId = variant?.id || null;
    const price = Number(variant?.price ?? product.price ?? 0);
    const quantity = menuQuantity(product.id, variantId);
    const closed = typeof availability !== "undefined" && availability && availability.is_open !== true;
    const variantLabel = variant?.name || null;

    return `
      <div
        class="visual-menu-product ${variantLabel ? "visual-menu-product-variant" : ""}"
        data-menu-product="${escapeHtml(product.id)}"
        data-menu-variant="${escapeHtml(variantId || "")}"
        data-menu-scope="${scope}"
      >
        <div class="visual-menu-product-main">
          <div class="visual-menu-product-name-line">
            <strong>${escapeHtml(product.name)}</strong>
            ${variantLabel ? `<span class="visual-menu-variant-chip">[${escapeHtml(variantLabel)}]</span>` : ""}
            <span class="visual-menu-inline-price" id="${controlId(scope, "price", product.id, variantId)}">— ${price.toFixed(2)}</span>
          </div>
          ${!variantLabel && product.description ? `<div class="muted visual-menu-product-description">${escapeHtml(product.description)}</div>` : ""}
        </div>

        <div class="visual-menu-product-bottom visual-menu-product-bottom-direct">
          <div class="visual-menu-buy">
            <div class="quantity-stepper">
              <button
                type="button"
                class="qty-step-btn"
                aria-label="Disminuir cantidad"
                ${closed ? "disabled" : ""}
                onclick="HTPWEBVisualMenu.change('${product.id}',-1,'${scope}','${variantId || ""}')"
              >−</button>
              <input
                id="${controlId(scope, "qty", product.id, variantId)}"
                type="number"
                min="0"
                step="1"
                value="${quantity}"
                aria-label="Cantidad en carrito"
                ${closed ? "disabled" : ""}
                oninput="HTPWEBVisualMenu.set('${product.id}',this.value,'${scope}','${variantId || ""}')"
              >
              <button
                type="button"
                class="qty-step-btn"
                aria-label="Aumentar cantidad"
                ${closed ? "disabled" : ""}
                onclick="HTPWEBVisualMenu.change('${product.id}',1,'${scope}','${variantId || ""}')"
              >+</button>
            </div>

            <button
              id="${controlId(scope, "add", product.id, variantId)}"
              type="button"
              class="btn btn-primary visual-menu-add"
              ${closed ? "disabled" : ""}
              onclick="HTPWEBVisualMenu.add('${product.id}','${scope}','${variantId || ""}')"
            >${closed ? "Local cerrado" : "Agregar"}</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderProductRow(product, scope) {
    const vs = productVariants(product.id);

    if (vs.length) {
      return `
        <div class="visual-menu-variant-list" data-menu-product-group="${escapeHtml(product.id)}">
          ${vs.map(variant => renderPurchasableRow(product, variant, scope)).join("")}
        </div>
      `;
    }

    return renderPurchasableRow(product, null, scope);
  }

  function renderCategoryGroups(page, scope) {
    const groups = groupedPageProducts(page);
    if (!groups.length) {
      return '<div class="empty">No hay productos asociados a esta hoja.</div>';
    }

    ensureDefaultCategory(page, scope);

    return groups.map(group => {
      const open = categoryIsOpen(page, group.id, scope);

      return `
        <section class="visual-menu-category ${open ? "is-open" : ""}" data-menu-category="${escapeHtml(group.id)}">
          <button
            type="button"
            class="visual-menu-category-toggle"
            aria-expanded="${open ? "true" : "false"}"
            onclick="HTPWEBVisualMenu.toggleCategory('${page.id}','${escapeHtml(group.id)}','${scope}')"
          >
            <span class="visual-menu-category-copy">
              <strong>${escapeHtml(group.name)}</strong>
              <small>${group.items.length} ${group.items.length === 1 ? "producto" : "productos"}</small>
            </span>
            <span class="visual-menu-category-chevron" aria-hidden="true">${open ? "⌄" : "›"}</span>
          </button>

          <div class="visual-menu-category-products ${open ? "" : "hidden"}">
            ${open ? group.items.map(product => renderProductRow(product, scope)).join("") : ""}
          </div>
        </section>
      `;
    }).join("");
  }

  function renderInlinePage() {
    if (!menuPages.length || !ensureUi()) return;
    const page = menuPages[pageIndex];

    $m("visualMenuImage").src = page.image_url || "";
    $m("visualMenuImage").alt = page.title || `Hoja ${pageIndex + 1} del menú`;
    $m("visualMenuPageLabel").textContent = page.title || `Hoja ${pageIndex + 1}`;
    $m("visualMenuPageCounter").textContent = `${pageIndex + 1} / ${menuPages.length}`;

    const multiple = menuPages.length > 1;
    $m("visualMenuPageNav").classList.toggle("hidden", !multiple);
    $m("visualMenuPrev").disabled = !multiple;
    $m("visualMenuNext").disabled = !multiple;

    $m("visualMenuProducts").innerHTML = renderCategoryGroups(page, "inline");
    renderSearchResults("inline");
  }

  function renderViewerPage() {
    if (!menuPages.length || !ensureUi()) return;
    const page = menuPages[pageIndex];
    const multiple = menuPages.length > 1;

    $m("visualMenuViewerImage").src = page.image_url || "";
    $m("visualMenuViewerImage").alt = page.title || `Hoja ${pageIndex + 1} del menú`;
    $m("visualMenuViewerTitle").textContent =
      typeof localActual !== "undefined" && localActual?.name
        ? localActual.name
        : "Menú";
    $m("visualMenuViewerPageLabel").textContent =
      page.title || `Hoja ${pageIndex + 1}`;
    $m("visualMenuViewerCounter").textContent =
      `Hoja ${pageIndex + 1} de ${menuPages.length}`;
    $m("visualMenuViewerPrev").classList.toggle("hidden", !multiple);
    $m("visualMenuViewerNext").classList.toggle("hidden", !multiple);
    $m("visualMenuViewerProducts").innerHTML = renderCategoryGroups(page, "viewer");
    renderSearchResults("viewer");
  }

  function renderPage() {
    renderInlinePage();
    if (viewerIsOpen()) renderViewerPage();
    syncAllMenuQuantities();
  }

  function stepPage(direction) {
    if (menuPages.length <= 1) return;
    pageIndex = (pageIndex + Number(direction) + menuPages.length) % menuPages.length;
    renderPage();
  }

  function syncVariantControls(productId, variantId = null) {
    const product = typeof products !== "undefined"
      ? products.find(item => item.id === productId)
      : null;
    if (!product) return;

    const variant = variantId
      ? productVariants(productId).find(item => item.id === variantId) || null
      : null;
    const price = Number(variant?.price ?? product.price ?? 0);
    const quantity = menuQuantity(productId, variantId);

    scopes.forEach(scope => {
      const priceEl = $m(controlId(scope, "price", productId, variantId));
      const qtyEl = $m(controlId(scope, "qty", productId, variantId));

      if (priceEl) priceEl.textContent = "$ " + price.toFixed(2);
      if (qtyEl) qtyEl.value = quantity;
    });
  }

  function syncProductControls(productId) {
    const vs = productVariants(productId);
    if (vs.length) {
      vs.forEach(variant => syncVariantControls(productId, variant.id));
      return;
    }
    syncVariantControls(productId, null);
  }

  function syncAllMenuQuantities() {
    if (!menuPages.length) return;
    pageProducts(menuPages[pageIndex]).forEach(product => syncProductControls(product.id));
  }

  function variantChanged(productId, scope) {
    syncProductControls(productId);
  }

  function feedback(productId, scope, total, variantId = null) {
    const button = $m(controlId(scope, "add", productId, variantId));
    if (!button || button.disabled) return;

    button.textContent = `En carrito: ${total} ✓`;
    button.classList.add("is-added");
    window.clearTimeout(button._menuFeedback);
    button._menuFeedback = window.setTimeout(() => {
      if (!button.disabled) button.textContent = "Agregar";
      button.classList.remove("is-added");
    }, 900);
  }

  function normalizeVariantArgument(variantId) {
    return variantId ? String(variantId) : null;
  }

  function add(productId, scope = "inline", variantId = null) {
    if (typeof window.htpwebAddProductUnit !== "function") return 0;
    const chosenVariantId = normalizeVariantArgument(variantId);

    const total = window.htpwebAddProductUnit(productId, chosenVariantId);
    syncProductControls(productId);
    feedback(productId, scope, total, chosenVariantId);
    return total;
  }

  function change(productId, delta, scope = "inline", variantId = null) {
    if (typeof window.htpwebChangeProductQuantity !== "function") return 0;
    const chosenVariantId = normalizeVariantArgument(variantId);

    const total = window.htpwebChangeProductQuantity(
      productId,
      Number(delta),
      chosenVariantId
    );
    syncProductControls(productId);
    return total;
  }

  function setQuantity(productId, quantity, scope = "inline", variantId = null) {
    if (typeof window.htpwebSetProductQuantity !== "function") return 0;
    const chosenVariantId = normalizeVariantArgument(variantId);

    const total = window.htpwebSetProductQuantity(
      productId,
      quantity,
      chosenVariantId
    );
    syncProductControls(productId);
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

      products.forEach(product => {
        if (!selectedVariants.has(product.id)) {
          selectedVariants.set(product.id, defaultVariantId(product.id));
        }
      });

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
    if (event.key === "Escape" && viewerIsOpen()) {
      closeViewer();
      return;
    }

    if (!viewerIsOpen() || menuPages.length <= 1) return;
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
    openViewer,
    closeViewer,
    toggleCategory,
    search: searchMenu,
    clearSearch,
    selectSearchResult,
    refresh: renderPage
  };
})();
