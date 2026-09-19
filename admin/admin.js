const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[ch]));

const state = {
  user: null,
  role: null,
  deliveries: [],
  locals: [],
  cities: [],
  orders: [],
  requests: [],
  requestLocalOptions: [],
  deliveryProfileRecord: null,
  localProfileRecord: null,
  users: [],
  feeRates: [],
  zoneContext: null,
  zonesCatalog: [],
  categories: [],
  products: [],
  variants: [],
  schedules: [],
  shareLocals: [],
  shareProducts: [],
  advertisements: [],
  advertisementDeliveries: [],
  advertisementLocals: [],
  advertisementProducts: []
};

const roleSections = {
  MASTER: ["overview","share","orders","requests","deliveries","users","fees","coverage","catalog","schedules","storage","advertising","analytics"],
  DELIVERY_ADMIN: ["overview","mydelivery","share","orders","requests","fees","coverage","storage","advertising","analytics"],
  DELIVERY_OPERATOR: ["overview","orders"],
  LOCAL_ADMIN: ["overview","mylocal","orders","catalog","schedules","storage","advertising","analytics"]
};

const globalTransitions = {
  PENDING: ["CONFIRMED","CANCELLED"],
  CONFIRMED: ["PREPARING","CANCELLED"],
  PREPARING: ["READY","CANCELLED"],
  READY: ["EN_ROUTE","CANCELLED"],
  EN_ROUTE: ["DELIVERED"]
};

const localTransitions = {
  PENDING: ["CONFIRMED","CANCELLED"],
  CONFIRMED: ["PREPARING","CANCELLED"],
  PREPARING: ["READY","CANCELLED"]
};

function message(text, type = "success") {
  const el = $("message");
  el.textContent = text;
  el.className = "message " + (type === "error" ? "error" : "success");
}

function clearMessage() {
  $("message").className = "message hidden";
}

async function rpc(name, args = {}) {
  const { data, error } = await supabaseClient.rpc(name, args);
  if (error) throw error;
  return data;
}

async function init() {
  try {
    state.user = await obtenerUsuarioActual();

    if (!state.user) {
      const back = encodeURIComponent(location.pathname + location.search);
      location.href = "../app/acceso.html?return=" + back;
      return;
    }

    const { data: role, error: roleError } = await supabaseClient.rpc("current_role_code");
    if (roleError) throw roleError;

    state.role = role;

    if (!roleSections[state.role]) {
      document.body.innerHTML = `
        <main style="max-width:720px;margin:60px auto;font-family:Arial;padding:20px">
          <h1>Acceso administrativo no disponible</h1>
          <p>Tu cuenta tiene el rol <strong>${esc(state.role || "sin rol")}</strong>.</p>
          <p><a href="../index.html">Volver al sitio público</a></p>
        </main>
      `;
      return;
    }

    $("roleText").textContent = state.role;
    $("userMail").textContent = state.user.email || state.user.id;

    configureNavigation();
    bindEvents();

    await loadScopes();
    await loadCities();
    await refreshAll();
  } catch (error) {
    console.error(error);
    message(error.message || "No se pudo abrir el panel.", "error");
  }
}

function configureNavigation() {
  const allowed = new Set(roleSections[state.role]);

  document.querySelectorAll("#nav button").forEach(btn => {
    btn.classList.toggle("hidden", !allowed.has(btn.dataset.section));
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });

  document.querySelectorAll(".master-only").forEach(el => {
    el.classList.toggle("hidden", state.role !== "MASTER");
  });

  showSection(roleSections[state.role][0]);
}

function showSection(name) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll("#nav button").forEach(b => b.classList.remove("active"));

  $("section-" + name)?.classList.add("active");
  document.querySelector(`#nav button[data-section="${name}"]`)?.classList.add("active");
  $("pageTitle").textContent = document.querySelector(`#nav button[data-section="${name}"]`)?.textContent || "HTPWEB Admin";

  if (name === "mydelivery") loadDeliveryProfile();
  if (name === "share") loadShareModule();
  if (name === "mylocal") loadLocalProfile();
  if (name === "orders") loadOrders();
  if (name === "requests") loadRequests();
  if (name === "deliveries") loadDeliveriesModule();
  if (name === "users") loadUsersModule();
  if (name === "fees") loadFees();
  if (name === "coverage") loadCoverage();
  if (name === "catalog") loadCatalog();
  if (name === "schedules") loadSchedules();
  if (name === "storage") loadStorage();
  if (name === "advertising") loadAdvertising();
  if (name === "analytics") loadAnalytics();
}

async function loadScopes() {
  if (state.role === "MASTER") {
    const [dRes, lRes] = await Promise.all([
      supabaseClient.from("deliveries").select("id,name,slug,active").order("name"),
      supabaseClient.from("locals").select("id,name,active").order("name")
    ]);

    if (dRes.error) throw dRes.error;
    if (lRes.error) throw lRes.error;

    state.deliveries = dRes.data || [];
    state.locals = lRes.data || [];
  }

  if (["DELIVERY_ADMIN","DELIVERY_OPERATOR"].includes(state.role)) {
    const rel = await supabaseClient
      .from("user_deliveries")
      .select("delivery_id")
      .eq("user_id", state.user.id)
      .eq("active", true);

    if (rel.error) throw rel.error;

    const ids = (rel.data || []).map(x => x.delivery_id);

    if (ids.length) {
      const dRes = await supabaseClient
        .from("deliveries")
        .select("id,name,slug,active")
        .in("id", ids)
        .order("name");

      if (dRes.error) throw dRes.error;
      state.deliveries = dRes.data || [];
    }
  }

  if (state.role === "LOCAL_ADMIN") {
    const rel = await supabaseClient
      .from("user_locals")
      .select("local_id")
      .eq("user_id", state.user.id)
      .eq("active", true);

    if (rel.error) throw rel.error;

    const ids = (rel.data || []).map(x => x.local_id);

    if (ids.length) {
      const lRes = await supabaseClient
        .from("locals")
        .select("id,name,active")
        .in("id", ids)
        .order("name");

      if (lRes.error) throw lRes.error;
      state.locals = lRes.data || [];
    }
  }

  renderScopeSelectors();
}

function renderScopeSelectors() {
  const deliveryOptions = state.deliveries.map(d =>
    `<option value="${d.id}">${esc(d.name)}</option>`
  ).join("");

  const localOptions = state.locals.map(l =>
    `<option value="${l.id}">${esc(l.name)}</option>`
  ).join("");

  if ($("orderScope")) {
    if (state.role === "LOCAL_ADMIN") {
      $("orderScope").innerHTML = '<option value="">Todos mis locales</option>' + localOptions;
    } else {
      $("orderScope").innerHTML = '<option value="">Todos mis deliveries</option>' + deliveryOptions;
    }
  }

  if ($("requestDelivery")) {
    $("requestDelivery").innerHTML = deliveryOptions;
  }

  if ($("catalogLocal")) {
    $("catalogLocal").innerHTML = localOptions;
  }

  if ($("scheduleLocal")) {
    $("scheduleLocal").innerHTML = localOptions;
  }

  if ($("analyticsScope")) {
    if (state.role === "MASTER") {
      $("analyticsScope").innerHTML =
        '<option value="MASTER">Global HTPWEB</option>' +
        state.deliveries.map(d => `<option value="DELIVERY:${d.id}">Delivery: ${esc(d.name)}</option>`).join("") +
        state.locals.map(l => `<option value="LOCAL:${l.id}">Local: ${esc(l.name)}</option>`).join("");
    } else if (state.role === "DELIVERY_ADMIN") {
      $("analyticsScope").innerHTML =
        state.deliveries.map(d => `<option value="DELIVERY:${d.id}">${esc(d.name)}</option>`).join("");
    } else if (state.role === "LOCAL_ADMIN") {
      $("analyticsScope").innerHTML =
        state.locals.map(l => `<option value="LOCAL:${l.id}">${esc(l.name)}</option>`).join("");
    }
  }

  $("scopeInfo").innerHTML = [
    state.deliveries.length ? `<div><strong>Deliveries:</strong> ${state.deliveries.map(d => esc(d.name)).join(", ")}</div>` : "",
    state.locals.length ? `<div><strong>Locales:</strong> ${state.locals.map(l => esc(l.name)).join(", ")}</div>` : ""
  ].filter(Boolean).join("") || "Ámbito global MASTER.";
}

async function refreshAll() {
  clearMessage();
  await Promise.all([
    loadOverview(),
    loadOrders(),
    loadRequests()
  ]);
}

async function countVisible(table) {
  const { count, error } = await supabaseClient
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) return null;
  return count ?? 0;
}

async function loadOverview() {
  const tables = ["orders","locals","products","customers"];
  const values = await Promise.all(tables.map(countVisible));

  const labels = ["Pedidos visibles","Locales visibles","Productos visibles","Clientes visibles"];
  $("metrics").innerHTML = values.map((value, i) => `
    <div class="card metric">
      <span class="muted">${labels[i]}</span>
      <strong>${value === null ? "—" : value}</strong>
    </div>
  `).join("");
}

async function loadDeliveryProfile() {
  if (state.role !== "DELIVERY_ADMIN") return;

  const select = $("profileDelivery");
  if (!select) return;

  const previous = select.value;
  select.innerHTML = state.deliveries.length
    ? state.deliveries.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("")
    : '<option value="">No hay DELIVERY asignados</option>';

  if (previous && state.deliveries.some(d => d.id === previous)) {
    select.value = previous;
  }

  await loadDeliveryProfileRecord();
}

async function loadDeliveryProfileRecord() {
  if (state.role !== "DELIVERY_ADMIN") return;

  const deliveryId = $("profileDelivery")?.value || null;
  if (!deliveryId) {
    state.deliveryProfileRecord = null;
    ["profileDeliveryName","profileDeliverySlug","profileDeliveryPhone","profileDeliveryWhatsapp","profileDeliveryDescription"]
      .forEach(id => { if ($(id)) $(id).value = ""; });
    $("saveDeliveryProfileBtn").disabled = true;
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("deliveries")
      .select("id,name,slug,description,logo_url,phone,whatsapp,active")
      .eq("id", deliveryId)
      .single();

    if (error) throw error;

    state.deliveryProfileRecord = data;
    $("profileDeliveryName").value = data.name || "";
    $("profileDeliverySlug").value = data.slug || "";
    $("profileDeliveryPhone").value = data.phone || "";
    $("profileDeliveryWhatsapp").value = data.whatsapp || "";
    $("profileDeliveryDescription").value = data.description || "";
    $("saveDeliveryProfileBtn").disabled = false;
  } catch (e) {
    state.deliveryProfileRecord = null;
    $("saveDeliveryProfileBtn").disabled = true;
    message(e.message || "No se pudo cargar la información del DELIVERY.", "error");
  }
}

async function saveDeliveryProfile() {
  try {
    const delivery = state.deliveryProfileRecord;
    if (!delivery?.id) throw new Error("Selecciona un DELIVERY.");

    await rpc("update_my_delivery_content", {
      p_delivery_id: delivery.id,
      p_description: $("profileDeliveryDescription").value.trim() || null,
      p_logo_url: delivery.logo_url || null,
      p_phone: $("profileDeliveryPhone").value.trim() || null,
      p_whatsapp: $("profileDeliveryWhatsapp").value.trim() || null
    });

    message("Información del DELIVERY actualizada.");
    await loadDeliveryProfileRecord();
  } catch (e) {
    message(e.message || "No se pudo actualizar el DELIVERY.", "error");
  }
}

function openDeliveryStorage() {
  showSection("storage");

  const deliveryId = $("profileDelivery")?.value;
  if (deliveryId && $("storageDelivery")) {
    $("storageDelivery").value = deliveryId;
    refreshDeliveryMediaPreview();
  }
}

function publicAppRootUrl() {
  const marker = "/admin/";
  const pathname = location.pathname;
  const index = pathname.indexOf(marker);
  const projectRoot = index >= 0 ? pathname.slice(0, index + 1) : "/";
  return new URL(projectRoot + "app/", location.origin).toString();
}

function currentShareDelivery() {
  const id = $("shareDelivery")?.value || "";
  return state.deliveries.find(delivery => delivery.id === id) || null;
}

function currentShareLocal() {
  const id = $("shareLocal")?.value || "";
  return state.shareLocals.find(local => local.id === id) || null;
}

function currentShareProduct() {
  const id = $("shareProduct")?.value || "";
  return state.shareProducts.find(product => product.id === id) || null;
}

function buildSharedLocalUrl() {
  const delivery = currentShareDelivery();
  const local = currentShareLocal();
  if (!delivery?.slug || !local?.id) return "";

  const url = new URL("local.html", publicAppRootUrl());
  url.searchParams.set("delivery", delivery.slug);
  url.searchParams.set("local", local.id);
  return url.toString();
}

function buildSharedProductUrl() {
  const delivery = currentShareDelivery();
  const local = currentShareLocal();
  const product = currentShareProduct();
  if (!delivery?.slug || !local?.id || !product?.id) return "";

  const url = new URL("local.html", publicAppRootUrl());
  url.searchParams.set("delivery", delivery.slug);
  url.searchParams.set("local", local.id);
  url.searchParams.set("product", product.id);
  return url.toString();
}

function renderShareLinks() {
  const localUrl = buildSharedLocalUrl();
  const productUrl = buildSharedProductUrl();

  $("shareLocalUrl").textContent = localUrl || "Selecciona un LOCAL.";
  $("shareProductUrl").textContent = productUrl || "Selecciona un producto.";

  const localReady = Boolean(localUrl);
  const productReady = Boolean(productUrl);

  ["shareLocalNativeBtn","shareLocalWhatsappBtn","shareLocalFacebookBtn","copyLocalLinkBtn"]
    .forEach(id => { if ($(id)) $(id).disabled = !localReady; });

  ["shareProductNativeBtn","shareProductWhatsappBtn","shareProductFacebookBtn","copyProductLinkBtn"]
    .forEach(id => { if ($(id)) $(id).disabled = !productReady; });
}

async function loadShareModule() {
  if (!["MASTER","DELIVERY_ADMIN"].includes(state.role)) return;

  const select = $("shareDelivery");
  if (!select) return;

  const previous = select.value;
  const available = state.deliveries.filter(delivery => delivery.active !== false);

  select.innerHTML = available.length
    ? available.map(delivery => `<option value="${delivery.id}">${esc(delivery.name)}</option>`).join("")
    : '<option value="">No hay DELIVERY disponible</option>';

  if (previous && available.some(delivery => delivery.id === previous)) {
    select.value = previous;
  }

  await loadShareLocals();
}

async function loadShareLocals() {
  const delivery = currentShareDelivery();

  state.shareLocals = [];
  state.shareProducts = [];

  if (!delivery) {
    $("shareLocal").innerHTML = '<option value="">No hay DELIVERY seleccionado</option>';
    $("shareProduct").innerHTML = '<option value="">Selecciona primero un LOCAL</option>';
    renderShareLinks();
    return;
  }

  try {
    const rel = await supabaseClient
      .from("local_deliveries")
      .select("local_id")
      .eq("delivery_id", delivery.id)
      .eq("active", true);

    if (rel.error) throw rel.error;

    const localIds = [...new Set((rel.data || []).map(row => row.local_id).filter(Boolean))];

    if (!localIds.length) {
      $("shareLocal").innerHTML = '<option value="">Este DELIVERY no tiene LOCAL vinculados</option>';
      $("shareProduct").innerHTML = '<option value="">Sin productos</option>';
      renderShareLinks();
      return;
    }

    const localRes = await supabaseClient
      .from("locals")
      .select("id,name,active")
      .in("id", localIds)
      .eq("active", true)
      .order("name");

    if (localRes.error) throw localRes.error;

    state.shareLocals = localRes.data || [];

    $("shareLocal").innerHTML = state.shareLocals.length
      ? state.shareLocals.map(local => `<option value="${local.id}">${esc(local.name)}</option>`).join("")
      : '<option value="">No hay LOCAL activos vinculados</option>';

    await loadShareProducts();
  } catch (e) {
    state.shareLocals = [];
    state.shareProducts = [];
    $("shareLocal").innerHTML = '<option value="">No se pudieron cargar los LOCAL</option>';
    $("shareProduct").innerHTML = '<option value="">Sin productos</option>';
    renderShareLinks();
    message(e.message || "No se pudieron cargar los LOCAL para compartir.", "error");
  }
}

async function loadShareProducts() {
  const local = currentShareLocal();
  state.shareProducts = [];

  if (!local) {
    $("shareProduct").innerHTML = '<option value="">Selecciona un LOCAL</option>';
    renderShareLinks();
    return;
  }

  try {
    const productRes = await supabaseClient
      .from("products")
      .select("id,local_id,name,price,active")
      .eq("local_id", local.id)
      .eq("active", true)
      .order("name");

    if (productRes.error) throw productRes.error;

    state.shareProducts = productRes.data || [];

    $("shareProduct").innerHTML = state.shareProducts.length
      ? state.shareProducts.map(product =>
          `<option value="${product.id}">${esc(product.name)} — ${Number(product.price || 0).toFixed(2)}</option>`
        ).join("")
      : '<option value="">Este LOCAL no tiene productos activos</option>';

    renderShareLinks();
  } catch (e) {
    state.shareProducts = [];
    $("shareProduct").innerHTML = '<option value="">No se pudieron cargar los productos</option>';
    renderShareLinks();
    message(e.message || "No se pudieron cargar los productos para compartir.", "error");
  }
}

function sharePayload(kind) {
  const delivery = currentShareDelivery();
  const local = currentShareLocal();
  const product = currentShareProduct();

  if (kind === "local") {
    const url = buildSharedLocalUrl();
    return url ? {
      title: `${local.name} | ${delivery.name}`,
      text: `Mira ${local.name} en ${delivery.name}`,
      url
    } : null;
  }

  const url = buildSharedProductUrl();
  return url ? {
    title: `${product.name} | ${delivery.name}`,
    text: `Mira ${product.name} de ${local.name} en ${delivery.name}`,
    url
  } : null;
}

async function copyShareLink(kind) {
  const payload = sharePayload(kind);
  if (!payload) return;

  try {
    await navigator.clipboard.writeText(payload.url);
    message("Enlace copiado.");
  } catch {
    const helper = document.createElement("textarea");
    helper.value = payload.url;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
    message("Enlace copiado.");
  }
}

async function nativeShare(kind) {
  const payload = sharePayload(kind);
  if (!payload) return;

  if (navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
  }

  await copyShareLink(kind);
}

function shareWhatsApp(kind) {
  const payload = sharePayload(kind);
  if (!payload) return;

  const text = encodeURIComponent(`${payload.text}\n${payload.url}`);
  window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
}

function shareFacebook(kind) {
  const payload = sharePayload(kind);
  if (!payload) return;

  const url = encodeURIComponent(payload.url);
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, "_blank", "noopener,noreferrer");
}

async function loadLocalProfile() {
  if (state.role !== "LOCAL_ADMIN") return;

  const select = $("profileLocal");
  if (!select) return;

  const previous = select.value;
  select.innerHTML = state.locals.length
    ? state.locals.map(local => `<option value="${local.id}">${esc(local.name)}</option>`).join("")
    : '<option value="">No hay LOCAL asignados</option>';

  if (previous && state.locals.some(local => local.id === previous)) {
    select.value = previous;
  }

  await loadLocalProfileRecord();
}

async function loadLocalProfileRecord() {
  if (state.role !== "LOCAL_ADMIN") return;

  const localId = $("profileLocal")?.value || null;
  if (!localId) {
    state.localProfileRecord = null;
    [
      "profileLocalName","profileLocalAddress","profileLocalPhone","profileLocalWhatsapp",
      "profileLocalWebsite","profileLocalInstagram","profileLocalFacebook",
      "profileLocalTiktok","profileLocalTelegram","profileLocalDescription"
    ].forEach(id => { if ($(id)) $(id).value = ""; });
    $("saveLocalProfileBtn").disabled = true;
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("locals")
      .select("id,name,address,description,banner_url,logo_url,phone,whatsapp,website_url,instagram_url,facebook_url,tiktok_url,telegram_url,active")
      .eq("id", localId)
      .single();

    if (error) throw error;

    state.localProfileRecord = data;
    $("profileLocalName").value = data.name || "";
    $("profileLocalAddress").value = data.address || "";
    $("profileLocalPhone").value = data.phone || "";
    $("profileLocalWhatsapp").value = data.whatsapp || "";
    $("profileLocalWebsite").value = data.website_url || "";
    $("profileLocalInstagram").value = data.instagram_url || "";
    $("profileLocalFacebook").value = data.facebook_url || "";
    $("profileLocalTiktok").value = data.tiktok_url || "";
    $("profileLocalTelegram").value = data.telegram_url || "";
    $("profileLocalDescription").value = data.description || "";
    $("saveLocalProfileBtn").disabled = false;
  } catch (e) {
    state.localProfileRecord = null;
    $("saveLocalProfileBtn").disabled = true;
    message(e.message || "No se pudo cargar la información del LOCAL.", "error");
  }
}

async function saveLocalProfile() {
  try {
    const local = state.localProfileRecord;
    if (!local?.id) throw new Error("Selecciona un LOCAL.");

    await rpc("update_my_local_content", {
      p_local_id: local.id,
      p_description: $("profileLocalDescription").value.trim() || null,
      p_banner_url: local.banner_url || null,
      p_logo_url: local.logo_url || null,
      p_phone: $("profileLocalPhone").value.trim() || null,
      p_whatsapp: $("profileLocalWhatsapp").value.trim() || null,
      p_website_url: $("profileLocalWebsite").value.trim() || null,
      p_instagram_url: $("profileLocalInstagram").value.trim() || null,
      p_facebook_url: $("profileLocalFacebook").value.trim() || null,
      p_tiktok_url: $("profileLocalTiktok").value.trim() || null,
      p_telegram_url: $("profileLocalTelegram").value.trim() || null
    });

    message("Información del LOCAL actualizada.");
    await loadLocalProfileRecord();
  } catch (e) {
    message(e.message || "No se pudo actualizar el LOCAL.", "error");
  }
}

function openLocalStorage() {
  showSection("storage");

  const localId = $("profileLocal")?.value;
  if (localId && $("storageLocal")) {
    $("storageLocal").value = localId;
    refreshLocalMediaPreview();
    loadStorageProducts();
  }
}

function openLocalCatalog() {
  showSection("catalog");

  const localId = $("profileLocal")?.value;
  if (localId && $("catalogLocal")) {
    $("catalogLocal").value = localId;
    loadCatalog();
  }
}

function openLocalSchedules() {
  showSection("schedules");

  const localId = $("profileLocal")?.value;
  if (localId && $("scheduleLocal")) {
    $("scheduleLocal").value = localId;
    loadSchedules();
  }
}

async function loadOrders() {
  if (!roleSections[state.role]?.includes("orders")) return;

  let query = supabaseClient
    .from("orders")
    .select("id,delivery_id,status,total,customer_name,customer_phone,delivery_address,created_at,order_locals(id,local_id,status,subtotal,delivery_fee,locals(id,name))")
    .order("created_at", { ascending: false })
    .limit(100);

  const scope = $("orderScope")?.value || "";

  if (scope && state.role !== "LOCAL_ADMIN") {
    query = query.eq("delivery_id", scope);
  }

  const { data, error } = await query;
  if (error) {
    $("ordersList").innerHTML = `<div class="message error">${esc(error.message)}</div>`;
    return;
  }

  state.orders = data || [];

  let rows = state.orders;
  if (scope && state.role === "LOCAL_ADMIN") {
    rows = rows.filter(order =>
      (order.order_locals || []).some(ol => ol.local_id === scope)
    );
  }

  $("ordersList").innerHTML = rows.length ? rows.map(renderOrder).join("") : '<div class="muted">No hay pedidos visibles.</div>';
}

function renderOrder(order) {
  const globalButtons = ["MASTER","DELIVERY_ADMIN","DELIVERY_OPERATOR"].includes(state.role)
    ? (globalTransitions[order.status] || []).map(next =>
        `<button class="${next === "CANCELLED" ? "btn-danger" : "btn"}" onclick="changeGlobalOrder('${order.id}','${next}')">${next}</button>`
      ).join("")
    : "";

  const locals = (order.order_locals || []).map(ol => {
    const canManageLocal = state.role !== "LOCAL_ADMIN" || state.locals.some(l => l.id === ol.local_id);
    const buttons = state.role === "LOCAL_ADMIN" && canManageLocal
      ? (localTransitions[ol.status] || []).map(next =>
          `<button class="${next === "CANCELLED" ? "btn-danger" : "btn"}" onclick="changeLocalOrder('${order.id}','${ol.local_id}','${next}')">${next}</button>`
        ).join("")
      : "";

    return `
      <div class="order-local">
        <div class="row between">
          <strong>${esc(ol.locals?.name || ol.local_id)}</strong>
          <span class="badge status-${esc(ol.status)}">${esc(ol.status)}</span>
        </div>
        <div class="muted">Subtotal: $${Number(ol.subtotal || 0).toFixed(2)} · Delivery: $${Number(ol.delivery_fee || 0).toFixed(2)}</div>
        ${buttons ? `<div class="row" style="margin-top:8px">${buttons}</div>` : ""}
      </div>
    `;
  }).join("");

  return `
    <div class="card">
      <div class="row between">
        <div>
          <strong>Pedido ${esc(order.id)}</strong>
          <div class="muted">${new Date(order.created_at).toLocaleString()}</div>
        </div>
        <span class="badge status-${esc(order.status)}">${esc(order.status)}</span>
      </div>
      <p><strong>Cliente:</strong> ${esc(order.customer_name || "")} · ${esc(order.customer_phone || "")}</p>
      <p><strong>Entrega:</strong> ${esc(order.delivery_address || "")}</p>
      <p><strong>Total:</strong> $${Number(order.total || 0).toFixed(2)}</p>
      ${globalButtons ? `<div class="row">${globalButtons}</div>` : ""}
      ${locals}
    </div>
  `;
}

async function changeGlobalOrder(orderId, status) {
  try {
    const note = prompt("Nota opcional para el cambio de estado:") || null;
    await rpc("set_order_status", {
      p_order_id: orderId,
      p_new_status: status,
      p_note: note
    });
    message("Estado global actualizado.");
    await loadOrders();
  } catch (e) {
    message(e.message || "No se pudo cambiar el estado.", "error");
  }
}

async function changeLocalOrder(orderId, localId, status) {
  try {
    const note = prompt("Nota opcional para el LOCAL:") || null;
    await rpc("set_local_order_status", {
      p_order_id: orderId,
      p_local_id: localId,
      p_new_status: status,
      p_note: note
    });
    message("Estado del LOCAL actualizado.");
    await loadOrders();
  } catch (e) {
    message(e.message || "No se pudo cambiar el estado del LOCAL.", "error");
  }
}

const requestTypeLabels = {
  CREATE_LOCAL: "Nuevo LOCAL",
  LINK_EXISTING: "Vincular LOCAL existente",
  CLAIM_LOCAL: "Reclamar administración de LOCAL",
  SUGGEST_CHANGE: "Sugerir cambios"
};

const requestStatusLabels = {
  PENDING: "Pendiente",
  NEEDS_INFO: "Requiere información",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada"
};

function compactPayload(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) =>
      value !== null &&
      value !== undefined &&
      (typeof value !== "string" || value.trim() !== "")
    ).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
  );
}

function deliveryLabel(id) {
  return state.deliveries.find(d => d.id === id)?.name || id || "—";
}

function localLabel(id, fallback = null) {
  if (!id) return fallback || "—";
  return state.locals.find(l => l.id === id)?.name
    || state.requestLocalOptions.find(l => l.id === id)?.name
    || fallback
    || id;
}

function renderRequestPayload(payload = {}) {
  const labels = {
    name: "Nombre",
    address: "Dirección",
    phone: "Teléfono",
    whatsapp: "WhatsApp",
    description: "Descripción",
    website_url: "Sitio web",
    instagram_url: "Instagram",
    facebook_url: "Facebook",
    tiktok_url: "TikTok",
    telegram_url: "Telegram",
    google_maps_url: "Google Maps"
  };

  const entries = Object.entries(payload || {});
  if (!entries.length) return '<div class="muted">Sin datos adicionales.</div>';

  return `
    <div class="request-details">
      ${entries.map(([key, value]) => `
        <div><strong>${esc(labels[key] || key)}:</strong> ${esc(
          typeof value === "object" ? JSON.stringify(value) : value
        )}</div>
      `).join("")}
    </div>
  `;
}

async function updateRequestForm() {
  if (state.role !== "DELIVERY_ADMIN" || !$("requestType")) return;

  const type = $("requestType").value;
  const deliveryId = $("requestDelivery").value || null;
  const needsExisting = ["LINK_EXISTING", "SUGGEST_CHANGE"].includes(type);

  $("requestCreateFields").classList.toggle("hidden", type !== "CREATE_LOCAL");
  $("requestExistingFields").classList.toggle("hidden", !needsExisting);
  $("requestSuggestFields").classList.toggle("hidden", type !== "SUGGEST_CHANGE");

  const submit = $("submitRequestBtn");
  if (type === "CREATE_LOCAL") {
    state.requestLocalOptions = [];
    $("requestLocalSelect").innerHTML = "";
    $("requestLocalHelp").textContent = "";
    $("requestLocalSelectLabel").textContent = "LOCAL";
    submit.disabled = !deliveryId;
    submit.textContent = "Enviar solicitud de nuevo LOCAL";
    return;
  }

  $("requestLocalSelectLabel").textContent =
    type === "LINK_EXISTING" ? "LOCAL existente" : "LOCAL vinculado";
  submit.textContent =
    type === "LINK_EXISTING" ? "Solicitar vinculación" : "Enviar sugerencia";

  if (!deliveryId) {
    state.requestLocalOptions = [];
    $("requestLocalSelect").innerHTML = '<option value="">Selecciona primero un DELIVERY</option>';
    $("requestLocalHelp").textContent = "";
    submit.disabled = true;
    return;
  }

  try {
    const mode = type === "LINK_EXISTING" ? "LINK_EXISTING" : "RELATED";
    const options = await rpc("delivery_local_request_options", {
      p_delivery_id: deliveryId,
      p_mode: mode
    });

    state.requestLocalOptions = options || [];
    $("requestLocalSelect").innerHTML = state.requestLocalOptions.length
      ? '<option value="">Selecciona un LOCAL</option>' + state.requestLocalOptions.map(local => {
          const detail = [local.address, local.phone].filter(Boolean).join(" · ");
          return `<option value="${local.id}">${esc(local.name)}${detail ? " — " + esc(detail) : ""}</option>`;
        }).join("")
      : '<option value="">No hay LOCAL disponible</option>';

    $("requestLocalHelp").textContent = state.requestLocalOptions.length
      ? (type === "LINK_EXISTING"
          ? "Solo aparecen LOCAL activos que todavía no están vinculados a este DELIVERY."
          : "Solo aparecen LOCAL actualmente vinculados a este DELIVERY.")
      : (type === "LINK_EXISTING"
          ? "No hay LOCAL existentes disponibles para vincular."
          : "Este DELIVERY todavía no tiene LOCAL vinculados.");

    submit.disabled = !state.requestLocalOptions.length;
  } catch (e) {
    state.requestLocalOptions = [];
    $("requestLocalSelect").innerHTML = '<option value="">No se pudieron cargar los LOCAL</option>';
    $("requestLocalHelp").textContent = e.message || "No se pudieron cargar las opciones.";
    submit.disabled = true;
  }
}

async function loadRequests() {
  if (!roleSections[state.role]?.includes("requests")) return;

  $("requestCreateCard").classList.toggle("hidden", state.role !== "DELIVERY_ADMIN");
  if (state.role === "DELIVERY_ADMIN") await updateRequestForm();

  const { data, error } = await supabaseClient
    .from("local_requests")
    .select("id,request_type,delivery_id,local_id,status,payload,requested_by,review_note,possible_duplicate_local_id,result_local_id,applied_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    $("requestsList").innerHTML = `<div class="message error">${esc(error.message)}</div>`;
    return;
  }

  state.requests = data || [];

  $("requestsList").innerHTML = state.requests.length
    ? state.requests.map(renderRequest).join("")
    : '<div class="muted">No hay solicitudes visibles.</div>';
}

function renderRequest(req) {
  const masterActions = state.role === "MASTER" && req.status === "PENDING"
    ? `
      <div class="row">
        <button class="btn-success" onclick="reviewRequest('${req.id}','APPROVED','${req.request_type}')">Aprobar</button>
        <button class="btn-warn" onclick="reviewRequest('${req.id}','NEEDS_INFO','${req.request_type}')">Pedir información</button>
        <button class="btn-danger" onclick="reviewRequest('${req.id}','REJECTED','${req.request_type}')">Rechazar</button>
      </div>
    `
    : "";

  const applyAction = state.role === "MASTER" && req.status === "APPROVED" && !req.applied_at
    ? `<button class="btn-primary" onclick="applyRequest('${req.id}','${req.request_type}')">Aplicar solicitud aprobada</button>`
    : "";

  const payloadName = req.payload?.name || null;
  const requestedLocal = localLabel(req.local_id, payloadName);
  const resultLocal = req.result_local_id ? localLabel(req.result_local_id, payloadName) : null;

  return `
    <div class="card">
      <div class="row between">
        <div>
          <strong>${esc(requestTypeLabels[req.request_type] || req.request_type)}</strong>
          <div class="muted">${new Date(req.created_at).toLocaleString()}</div>
        </div>
        <span class="badge status-${esc(req.status)}">${esc(requestStatusLabels[req.status] || req.status)}</span>
      </div>
      <p><strong>Delivery:</strong> ${esc(deliveryLabel(req.delivery_id))}</p>
      ${(req.local_id || payloadName) ? `<p><strong>Local:</strong> ${esc(requestedLocal)}</p>` : ""}
      ${renderRequestPayload(req.payload || {})}
      ${req.review_note ? `<p><strong>Revisión:</strong> ${esc(req.review_note)}</p>` : ""}
      ${req.possible_duplicate_local_id ? `<p><strong>Posible duplicado:</strong> ${esc(localLabel(req.possible_duplicate_local_id))}</p>` : ""}
      ${resultLocal ? `<p><strong>LOCAL resultante:</strong> ${esc(resultLocal)}</p>` : ""}
      ${masterActions}
      ${applyAction}
    </div>
  `;
}

function clearRequestFields(type) {
  if (type === "CREATE_LOCAL") {
    ["requestName","requestAddress","requestPhone","requestWhatsapp","requestDescription"]
      .forEach(id => { if ($(id)) $(id).value = ""; });
  }

  if (type === "SUGGEST_CHANGE") {
    ["requestSuggestName","requestSuggestAddress","requestSuggestPhone","requestSuggestWhatsapp","requestSuggestDescription"]
      .forEach(id => { if ($(id)) $(id).value = ""; });
  }
}

async function submitRequest() {
  try {
    const deliveryId = $("requestDelivery").value || null;
    const type = $("requestType").value;
    if (!deliveryId) throw new Error("Selecciona un DELIVERY.");

    let localId = null;
    let payload = {};

    if (type === "CREATE_LOCAL") {
      payload = compactPayload({
        name: $("requestName").value,
        address: $("requestAddress").value,
        phone: $("requestPhone").value,
        whatsapp: $("requestWhatsapp").value,
        description: $("requestDescription").value
      });

      if (!payload.name) throw new Error("Escribe el nombre del LOCAL.");
    }

    if (type === "LINK_EXISTING") {
      localId = $("requestLocalSelect").value || null;
      if (!localId) throw new Error("Selecciona el LOCAL que deseas vincular.");
    }

    if (type === "SUGGEST_CHANGE") {
      localId = $("requestLocalSelect").value || null;
      if (!localId) throw new Error("Selecciona el LOCAL que deseas actualizar.");

      payload = compactPayload({
        name: $("requestSuggestName").value,
        address: $("requestSuggestAddress").value,
        phone: $("requestSuggestPhone").value,
        whatsapp: $("requestSuggestWhatsapp").value,
        description: $("requestSuggestDescription").value
      });

      if (!Object.keys(payload).length) {
        throw new Error("Escribe al menos un cambio para enviar la sugerencia.");
      }
    }

    await rpc("submit_local_request", {
      p_request_type: type,
      p_delivery_id: deliveryId,
      p_local_id: localId,
      p_payload: payload
    });

    message(
      type === "CREATE_LOCAL"
        ? "Solicitud de nuevo LOCAL enviada a HTPWEB."
        : type === "LINK_EXISTING"
          ? "Solicitud de vinculación enviada a HTPWEB."
          : "Sugerencia enviada a HTPWEB."
    );

    clearRequestFields(type);
    await loadRequests();
  } catch (e) {
    message(e.message || "No se pudo enviar la solicitud.", "error");
  }
}

async function reviewRequest(id, status, type) {
  try {
    const note = prompt("Nota de revisión:") || null;
    let duplicateId = null;

    if (status === "APPROVED" && type === "CREATE_LOCAL") {
      duplicateId = prompt("Si es duplicado, escribe el UUID del LOCAL existente. Si no, deja vacío:") || null;
    }

    await rpc("master_review_local_request", {
      p_request_id: id,
      p_status: status,
      p_review_note: note,
      p_possible_duplicate_local_id: duplicateId
    });

    message("Solicitud revisada.");
    await loadRequests();
  } catch (e) {
    message(e.message || "No se pudo revisar la solicitud.", "error");
  }
}

async function applyRequest(id, type) {
  try {
    const convert = type === "CLAIM_LOCAL"
      ? confirm("Este CLAIM puede convertir CLIENT → LOCAL_ADMIN y desactivar su CUSTOMER activo. ¿Confirmar conversión?")
      : false;

    await rpc("master_apply_local_request", {
      p_request_id: id,
      p_convert_customer_to_local_admin: convert
    });

    message("Solicitud aplicada.");
    await Promise.all([loadRequests(), loadScopes()]);
  } catch (e) {
    message(e.message || "No se pudo aplicar la solicitud.", "error");
  }
}

function managedUser() {
  const id = $("userManagerUser")?.value || "";
  return state.users.find(user => user.user_id === id) || null;
}

function deliveryNameById(id) {
  return state.deliveries.find(delivery => delivery.id === id)?.name || id;
}

function localNameById(id) {
  return state.locals.find(local => local.id === id)?.name || id;
}

function renderUserOptions() {
  if (state.role !== "MASTER") return;

  const select = $("userManagerUser");
  const search = ($("userManagerSearch")?.value || "").trim().toLowerCase();
  const previous = select.value;

  const filtered = state.users.filter(user => {
    if (!search) return true;
    return [
      user.full_name,
      user.email,
      user.phone,
      user.role_code
    ].some(value => String(value || "").toLowerCase().includes(search));
  });

  select.innerHTML = filtered.length
    ? filtered.map(user => {
        const identity = user.full_name || user.email || user.user_id;
        const email = user.email && user.email !== identity ? ` — ${user.email}` : "";
        return `<option value="${user.user_id}">${esc(identity)}${esc(email)} — ${esc(user.role_code)}</option>`;
      }).join("")
    : '<option value="">No hay cuentas que coincidan</option>';

  if (previous && filtered.some(user => user.user_id === previous)) {
    select.value = previous;
  }

  renderManagedUser();
}

function renderManagedUser() {
  if (state.role !== "MASTER") return;

  const user = managedUser();
  const summary = $("userManagerSummary");
  const assignments = $("userManagerAssignments");

  if (!user) {
    summary.innerHTML = '<div class="muted">Selecciona una cuenta.</div>';
    assignments.innerHTML = '<div class="muted">Sin cuenta seleccionada.</div>';
    $("assignDeliveryUserBtn").disabled = true;
    $("assignLocalUserBtn").disabled = true;
    return;
  }

  const canDelivery = ["CLIENT","DELIVERY_ADMIN","DELIVERY_OPERATOR"].includes(user.role_code);
  const canLocal = ["CLIENT","LOCAL_ADMIN"].includes(user.role_code);

  summary.innerHTML = `
    <div><strong>Nombre:</strong> ${esc(user.full_name || "—")}</div>
    <div><strong>Correo:</strong> ${esc(user.email || "—")}</div>
    <div><strong>Teléfono:</strong> ${esc(user.phone || "—")}</div>
    <div><strong>Rol actual:</strong> ${esc(user.role_code)}</div>
    <div><strong>Perfil:</strong> ${user.profile_active ? "Activo" : "Inactivo"}</div>
    <div><strong>Correo confirmado:</strong> ${user.email_confirmed ? "Sí" : "No"}</div>
    <div><strong>CUSTOMER activo:</strong> ${user.active_customer ? "Sí" : "No"}</div>
  `;

  $("assignDeliveryUserBtn").disabled = !canDelivery || !user.profile_active;
  $("assignLocalUserBtn").disabled = !canLocal || !user.profile_active;

  const deliveryRows = (user.delivery_ids || []).map(deliveryId => `
    <div class="row between assignment-row">
      <span>DELIVERY: <strong>${esc(deliveryNameById(deliveryId))}</strong></span>
      <button class="btn-danger" onclick="unassignDeliveryUser('${user.user_id}','${deliveryId}')">Desvincular</button>
    </div>
  `).join("");

  const localRows = (user.local_ids || []).map(localId => `
    <div class="row between assignment-row">
      <span>LOCAL: <strong>${esc(localNameById(localId))}</strong></span>
      <button class="btn-danger" onclick="unassignLocalUser('${user.user_id}','${localId}')">Desvincular</button>
    </div>
  `).join("");

  assignments.innerHTML =
    (deliveryRows || localRows)
      ? `${deliveryRows}${localRows}`
      : '<div class="muted">Esta cuenta no tiene asignaciones activas.</div>';

  if (user.role_code === "MASTER") {
    assignments.insertAdjacentHTML(
      "afterbegin",
      '<div class="message error">Las cuentas MASTER no se convierten desde este módulo.</div>'
    );
  }
}

async function loadUsersModule() {
  if (state.role !== "MASTER") return;

  try {
    const users = await rpc("master_list_users");
    state.users = users || [];

    $("userManagerDelivery").innerHTML = state.deliveries.length
      ? state.deliveries.filter(d => d.active !== false).map(d =>
          `<option value="${d.id}">${esc(d.name)}</option>`
        ).join("")
      : '<option value="">No hay DELIVERY</option>';

    $("userManagerLocal").innerHTML = state.locals.length
      ? state.locals.filter(local => local.active !== false).map(local =>
          `<option value="${local.id}">${esc(local.name)}</option>`
        ).join("")
      : '<option value="">No hay LOCAL</option>';

    renderUserOptions();
  } catch (e) {
    message(e.message || "No se pudieron cargar los usuarios.", "error");
  }
}

async function assignDeliveryUser() {
  try {
    const user = managedUser();
    if (!user) throw new Error("Selecciona una cuenta.");

    const deliveryId = $("userManagerDelivery").value || null;
    const roleCode = $("userManagerDeliveryRole").value;
    const convertCustomer = $("userManagerDeliveryConvert").checked;

    if (!deliveryId) throw new Error("Selecciona un DELIVERY.");

    if (user.role_code === "CLIENT" && user.active_customer && !convertCustomer) {
      throw new Error("Esta cuenta tiene un CUSTOMER activo. Marca la conversión explícita para continuar.");
    }

    if (user.role_code === "CLIENT" && user.active_customer && convertCustomer) {
      const ok = confirm("La conversión desactivará el CUSTOMER activo de esta cuenta para convertirla en usuario del DELIVERY. ¿Continuar?");
      if (!ok) return;
    }

    await rpc("master_assign_delivery_user", {
      p_user_id: user.user_id,
      p_delivery_id: deliveryId,
      p_role_code: roleCode,
      p_convert_customer: convertCustomer
    });

    $("userManagerDeliveryConvert").checked = false;
    message("Usuario asignado al DELIVERY.");
    await loadUsersModule();
  } catch (e) {
    message(e.message || "No se pudo asignar el usuario al DELIVERY.", "error");
  }
}

async function assignLocalUser() {
  try {
    const user = managedUser();
    if (!user) throw new Error("Selecciona una cuenta.");

    const localId = $("userManagerLocal").value || null;
    const convertCustomer = $("userManagerLocalConvert").checked;

    if (!localId) throw new Error("Selecciona un LOCAL.");

    if (user.role_code === "CLIENT" && user.active_customer && !convertCustomer) {
      throw new Error("Esta cuenta tiene un CUSTOMER activo. Marca la conversión explícita para continuar.");
    }

    if (user.role_code === "CLIENT" && user.active_customer && convertCustomer) {
      const ok = confirm("La conversión desactivará el CUSTOMER activo de esta cuenta para convertirla en LOCAL_ADMIN. ¿Continuar?");
      if (!ok) return;
    }

    await rpc("master_assign_local_admin", {
      p_user_id: user.user_id,
      p_local_id: localId,
      p_convert_customer: convertCustomer
    });

    $("userManagerLocalConvert").checked = false;
    message("Usuario asignado como administrador del LOCAL.");
    await loadUsersModule();
  } catch (e) {
    message(e.message || "No se pudo asignar el usuario al LOCAL.", "error");
  }
}

async function unassignDeliveryUser(userId, deliveryId) {
  if (!confirm("¿Desvincular esta cuenta del DELIVERY? El rol global de la cuenta no se elimina automáticamente.")) return;

  try {
    await rpc("master_unassign_delivery_user", {
      p_user_id: userId,
      p_delivery_id: deliveryId
    });
    message("Cuenta desvinculada del DELIVERY.");
    await loadUsersModule();
  } catch (e) {
    message(e.message || "No se pudo desvincular la cuenta.", "error");
  }
}

async function unassignLocalUser(userId, localId) {
  if (!confirm("¿Desvincular esta cuenta del LOCAL? El rol global de la cuenta no se elimina automáticamente.")) return;

  try {
    await rpc("master_unassign_local_admin", {
      p_user_id: userId,
      p_local_id: localId
    });
    message("Cuenta desvinculada del LOCAL.");
    await loadUsersModule();
  } catch (e) {
    message(e.message || "No se pudo desvincular la cuenta.", "error");
  }
}

async function loadCities() {
  if (state.role !== "MASTER") return;

  const { data, error } = await supabaseClient
    .from("cities")
    .select("id,name,province,country,active")
    .order("name");

  if (error) throw error;
  state.cities = data || [];

  $("deliveryCity").innerHTML =
    '<option value="">Sin ciudad</option>' +
    state.cities.filter(c => c.active).map(c =>
      `<option value="${c.id}">${esc(c.name)} — ${esc(c.province || "")}</option>`
    ).join("");
}

async function loadDeliveriesModule() {
  if (state.role !== "MASTER") return;

  const { data, error } = await supabaseClient
    .from("deliveries")
    .select("id,name,slug,phone,whatsapp,active,city_id")
    .order("name");

  if (error) throw error;

  state.deliveries = data || [];
  renderScopeSelectors();

  $("deliveriesList").innerHTML = state.deliveries.length
    ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Slug</th><th>Estado</th><th>Teléfono</th><th>ID</th></tr></thead>
          <tbody>
            ${state.deliveries.map(d => `
              <tr>
                <td>${esc(d.name)}</td>
                <td>${esc(d.slug)}</td>
                <td>${d.active ? "Activo" : "Inactivo"}</td>
                <td>${esc(d.phone || "")}</td>
                <td><code>${esc(d.id)}</code></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `
    : '<div class="muted">No hay deliveries.</div>';
}

async function saveCity() {
  try {
    const name = $("cityName").value.trim();
    const province = $("cityProvince").value.trim();
    const country = $("cityCountry").value.trim() || "Ecuador";

    await rpc("master_save_city", {
      p_city_id: null,
      p_name: name,
      p_province: province || null,
      p_country: country,
      p_active: true
    });

    message("Ciudad creada.");
    $("cityName").value = "";
    $("cityProvince").value = "";
    await loadCities();
  } catch (e) {
    message(e.message || "No se pudo crear la ciudad.", "error");
  }
}

async function saveDelivery() {
  try {
    await rpc("master_save_delivery", {
      p_delivery_id: null,
      p_name: $("deliveryName").value.trim(),
      p_slug: $("deliverySlug").value.trim() || null,
      p_description: $("deliveryDescription").value.trim() || null,
      p_logo_url: null,
      p_phone: $("deliveryPhone").value.trim() || null,
      p_whatsapp: $("deliveryWhatsapp").value.trim() || null,
      p_city_id: $("deliveryCity").value || null,
      p_active: true
    });

    message("Delivery creado.");
    ["deliveryName","deliverySlug","deliveryDescription","deliveryPhone","deliveryWhatsapp"].forEach(id => $(id).value = "");
    await Promise.all([loadScopes(), loadDeliveriesModule()]);
  } catch (e) {
    message(e.message || "No se pudo crear el delivery.", "error");
  }
}

function feeDeliveryRecord() {
  const id = $("feeDelivery")?.value || "";
  return state.deliveries.find(delivery => delivery.id === id) || null;
}

function updateFeeModeUI() {
  const distanceMode = $("feeMode")?.value === "DISTANCE";
  $("fixedFeeField")?.classList.toggle("hidden", distanceMode);
  $("distanceRatesCard")?.classList.toggle("hidden", !distanceMode);
}

function feePeriodLabel(period) {
  return period === "NIGHT" ? "Noche" : "Día";
}

function renderFeeRates() {
  const container = $("feeRatesList");
  if (!container) return;

  const rates = ["DAY","NIGHT"].map(period =>
    state.feeRates.find(rate => rate.period === period) || {
      period,
      rate_per_km: null,
      active: false
    }
  );

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Periodo</th>
            <th>Costo por km</th>
            <th>Estado</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${rates.map(rate => `
            <tr>
              <td>${feePeriodLabel(rate.period)}</td>
              <td>${rate.rate_per_km === null ? "Sin configurar" : "$" + Number(rate.rate_per_km).toFixed(4) + " / km"}</td>
              <td><span class="badge">${rate.rate_per_km === null ? "Pendiente" : (rate.active ? "Activa" : "Inactiva")}</span></td>
              <td>
                <button class="btn-muted" onclick="selectFeeRatePeriod('${rate.period}')">
                  Configurar
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function selectFeeRatePeriod(period) {
  const normalized = period === "NIGHT" ? "NIGHT" : "DAY";
  $("feeRatePeriod").value = normalized;

  const current = state.feeRates.find(rate => rate.period === normalized);
  $("feeRatePerKm").value = current?.rate_per_km ?? "";
  $("feeRateActive").value = String(current?.active ?? true);
  $("feeRatePerKm").focus();
}

async function loadFees() {
  if (!["MASTER","DELIVERY_ADMIN"].includes(state.role)) return;

  const select = $("feeDelivery");
  if (!select) return;

  const previous = select.value;
  const available = state.deliveries.filter(delivery => delivery.active !== false);

  select.innerHTML = available.length
    ? available.map(delivery => `<option value="${delivery.id}">${esc(delivery.name)}</option>`).join("")
    : '<option value="">No hay DELIVERY disponible</option>';

  if (previous && available.some(delivery => delivery.id === previous)) {
    select.value = previous;
  }

  $("enableDeliveryFeesBtn").classList.toggle("hidden", state.role !== "MASTER");
  await loadFeeDelivery();
}

async function loadFeeDelivery() {
  const delivery = feeDeliveryRecord();

  if (!delivery) {
    state.feeRates = [];
    $("saveFeeConfigBtn").disabled = true;
    $("saveFeeScheduleBtn").disabled = true;
    $("saveFeeRateBtn").disabled = true;
    renderFeeRates();
    return;
  }

  try {
    const [configRes, ratesRes] = await Promise.all([
      supabaseClient
        .from("delivery_fee_configs")
        .select("id,delivery_id,mode,fixed_fee,day_start_time,night_start_time,active")
        .eq("delivery_id", delivery.id)
        .maybeSingle(),
      supabaseClient
        .from("delivery_fee_rates")
        .select("id,delivery_id,period,rate_per_km,active")
        .eq("delivery_id", delivery.id)
        .order("period")
    ]);

    if (configRes.error) throw configRes.error;
    if (ratesRes.error) throw ratesRes.error;

    const config = configRes.data;
    state.feeRates = ratesRes.data || [];

    $("feeMode").value = config?.mode || "FIXED";
    $("fixedFee").value = config?.fixed_fee ?? "0";
    $("feeDayStart").value = String(config?.day_start_time || "06:00").slice(0,5);
    $("feeNightStart").value = String(config?.night_start_time || "18:00").slice(0,5);
    $("feeConfigActive").value = String(config?.active ?? true);

    $("saveFeeConfigBtn").disabled = false;
    $("saveFeeScheduleBtn").disabled = !config;
    $("saveFeeRateBtn").disabled = !config;

    updateFeeModeUI();
    renderFeeRates();
    selectFeeRatePeriod($("feeRatePeriod").value || "DAY");
  } catch (e) {
    state.feeRates = [];
    $("saveFeeConfigBtn").disabled = true;
    $("saveFeeScheduleBtn").disabled = true;
    $("saveFeeRateBtn").disabled = true;
    renderFeeRates();
    message(e.message || "No se pudieron cargar las tarifas del DELIVERY.", "error");
  }
}

async function saveFeeConfig() {
  try {
    const delivery = feeDeliveryRecord();
    if (!delivery) throw new Error("Selecciona un DELIVERY.");

    const mode = $("feeMode").value;
    const fixedRaw = $("fixedFee").value;
    const fixedFee = mode === "FIXED" ? Number(fixedRaw) : 0;

    if (!Number.isFinite(fixedFee) || fixedFee < 0) {
      throw new Error("La tarifa fija debe ser un número igual o mayor que 0.");
    }

    await rpc("save_delivery_fee_config", {
      p_delivery_id: delivery.id,
      p_mode: mode,
      p_fixed_fee: fixedFee,
      p_active: $("feeConfigActive").value === "true"
    });

    message(
      mode === "FIXED"
        ? "Tarifa fija del DELIVERY actualizada."
        : "Tarifa por distancia activada. Configura el costo por km de Día y Noche."
    );

    await loadFeeDelivery();
  } catch (e) {
    message(e.message || "No se pudo guardar la tarifa.", "error");
  }
}

async function saveFeeSchedule() {
  try {
    const delivery = feeDeliveryRecord();
    if (!delivery) throw new Error("Selecciona un DELIVERY.");

    const dayStart = $("feeDayStart").value;
    const nightStart = $("feeNightStart").value;

    if (!dayStart || !nightStart) {
      throw new Error("Selecciona la hora de inicio del día y de la noche.");
    }

    if (dayStart >= nightStart) {
      throw new Error("El inicio de la tarifa diurna debe ser anterior al inicio nocturno.");
    }

    await rpc("save_delivery_fee_schedule", {
      p_delivery_id: delivery.id,
      p_day_start_time: dayStart,
      p_night_start_time: nightStart
    });

    message("Horario de tarifa Día / Noche actualizado.");
    await loadFeeDelivery();
  } catch (e) {
    message(e.message || "No se pudo guardar el horario de tarifas.", "error");
  }
}

async function saveFeeRate() {
  try {
    const delivery = feeDeliveryRecord();
    if (!delivery) throw new Error("Selecciona un DELIVERY.");

    const period = $("feeRatePeriod").value;
    const raw = $("feeRatePerKm").value.trim();

    if (raw === "") {
      throw new Error(`Escribe el costo por km para ${feePeriodLabel(period).toLowerCase()}.`);
    }

    const rate = Number(raw);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error("El costo por km debe ser un número igual o mayor que 0.");
    }

    await rpc("save_delivery_distance_rate", {
      p_delivery_id: delivery.id,
      p_period: period,
      p_rate_per_km: rate,
      p_active: $("feeRateActive").value === "true"
    });

    message(`Tarifa por km de ${feePeriodLabel(period)} actualizada.`);
    await loadFeeDelivery();
  } catch (e) {
    message(e.message || "No se pudo guardar la tarifa por km.", "error");
  }
}

async function enableDeliveryFees() {
  if (state.role !== "MASTER") return;

  try {
    const delivery = feeDeliveryRecord();
    if (!delivery) throw new Error("Selecciona un DELIVERY.");

    await rpc("master_set_delivery_capability", {
      p_delivery_id: delivery.id,
      p_capability_code: "delivery_fees.manage",
      p_enabled: true
    });

    message("Gestión de tarifas habilitada para este DELIVERY.");
  } catch (e) {
    message(e.message || "No se pudo habilitar la gestión de tarifas.", "error");
  }
}


function coverageDeliveryRecord() {
  const id = $("coverageDelivery")?.value || "";
  return state.deliveries.find(delivery => delivery.id === id) || null;
}

function cityLabel(cityId) {
  const city = state.cities.find(item => item.id === cityId);
  if (!city) return cityId || "—";
  return [city.name, city.province, city.country].filter(Boolean).join(" — ");
}

function renderCoverageSummary() {
  const context = state.zoneContext;
  const container = $("coverageSummary");
  if (!container) return;

  if (!context?.delivery) {
    container.innerHTML = '<div class="muted">Selecciona un DELIVERY.</div>';
    return;
  }

  const max = context.max_zones === null || context.max_zones === undefined
    ? "Sin límite configurado"
    : context.max_zones;

  container.innerHTML = `
    <div><strong>Delivery:</strong> ${esc(context.delivery.name || "—")}</div>
    <div><strong>Ciudad:</strong> ${esc(context.city
      ? [context.city.name, context.city.province].filter(Boolean).join(" — ")
      : "Sin ciudad asignada")}</div>
    <div><strong>Zonas activas:</strong> ${esc(context.current_zones ?? 0)} / ${esc(max)}</div>
    <div><strong>Gestión de zonas:</strong> ${context.zones_manage_enabled ? "Habilitada" : "No habilitada"}</div>
  `;
}

function renderCoverageZones() {
  const context = state.zoneContext;
  const container = $("coverageZonesList");
  if (!container) return;

  if (!context?.delivery) {
    container.innerHTML = '<div class="muted">Selecciona un DELIVERY.</div>';
    return;
  }

  if (!context.city) {
    container.innerHTML = state.role === "MASTER"
      ? '<div class="message error">Este DELIVERY todavía no tiene ciudad. Asígnala desde la configuración MASTER.</div>'
      : '<div class="message error">Este DELIVERY todavía no tiene ciudad configurada. Solicita a HTPWEB que la asigne.</div>';
    return;
  }

  const zones = Array.isArray(context.zones) ? context.zones : [];
  if (!zones.length) {
    container.innerHTML = state.role === "MASTER"
      ? '<div class="muted">No existen zonas activas en esta ciudad. Créala en el catálogo de zonas.</div>'
      : '<div class="muted">HTPWEB todavía no ha creado zonas activas para esta ciudad.</div>';
    return;
  }

  const canAssign = state.role === "MASTER" || context.zones_manage_enabled === true;

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Zona</th>
            <th>Estado</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${zones.map(zone => `
            <tr>
              <td>${esc(zone.name)}</td>
              <td>${zone.assigned ? "Asignada" : "Disponible"}</td>
              <td>
                <button
                  class="${zone.assigned ? "btn-danger" : "btn-primary"}"
                  onclick="toggleDeliveryZone('${zone.id}', ${zone.assigned ? "false" : "true"})"
                  ${canAssign ? "" : "disabled"}
                >
                  ${zone.assigned ? "Quitar cobertura" : "Agregar cobertura"}
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    ${!canAssign && state.role === "DELIVERY_ADMIN"
      ? '<p class="muted" style="margin-top:10px">La capability <code>zones.manage</code> debe ser habilitada por HTPWEB.</p>'
      : ""}
  `;
}

function clearZoneForm() {
  $("zoneEditId").value = "";
  $("zoneEditName").value = "";
  $("zoneEditActive").value = "true";
  $("saveZoneBtn").textContent = "Guardar zona";
}

function renderZonesCatalog() {
  if (state.role !== "MASTER") return;

  const container = $("zonesCatalogList");
  if (!container) return;

  if (!state.zonesCatalog.length) {
    container.innerHTML = '<div class="muted">Todavía no hay zonas registradas.</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Zona</th>
            <th>Ciudad</th>
            <th>Estado</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${state.zonesCatalog.map(zone => `
            <tr>
              <td>${esc(zone.name)}</td>
              <td>${esc(cityLabel(zone.city_id))}</td>
              <td>${zone.active ? "Activa" : "Inactiva"}</td>
              <td><button class="btn-muted" onclick="editZone('${zone.id}')">Editar</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function loadZoneCatalog() {
  if (state.role !== "MASTER") return;

  const { data, error } = await supabaseClient
    .from("zones")
    .select("id,name,city_id,active")
    .order("name");

  if (error) throw error;

  state.zonesCatalog = data || [];

  const activeCities = state.cities.filter(city => city.active);
  $("zoneEditCity").innerHTML = activeCities.length
    ? activeCities.map(city => `<option value="${city.id}">${esc(cityLabel(city.id))}</option>`).join("")
    : '<option value="">Primero crea una ciudad</option>';

  renderZonesCatalog();
}

async function loadCoverage() {
  if (!["MASTER","DELIVERY_ADMIN"].includes(state.role)) return;

  const select = $("coverageDelivery");
  const previous = select.value;
  const available = state.deliveries.filter(delivery => delivery.active !== false);

  select.innerHTML = available.length
    ? available.map(delivery => `<option value="${delivery.id}">${esc(delivery.name)}</option>`).join("")
    : '<option value="">No hay DELIVERY disponible</option>';

  if (previous && available.some(delivery => delivery.id === previous)) {
    select.value = previous;
  }

  if (state.role === "MASTER") {
    const activeCities = state.cities.filter(city => city.active);
    const cityOptions = activeCities.length
      ? activeCities.map(city => `<option value="${city.id}">${esc(cityLabel(city.id))}</option>`).join("")
      : '<option value="">Primero crea una ciudad</option>';

    $("coverageCity").innerHTML = cityOptions;
    await loadZoneCatalog();
  }

  await loadCoverageContext();
}

async function loadCoverageContext() {
  const delivery = coverageDeliveryRecord();

  if (!delivery) {
    state.zoneContext = null;
    renderCoverageSummary();
    renderCoverageZones();
    return;
  }

  try {
    state.zoneContext = await rpc("delivery_zone_context", {
      p_delivery_id: delivery.id
    });

    if (state.role === "MASTER") {
      if (state.zoneContext?.delivery?.city_id) {
        $("coverageCity").value = state.zoneContext.delivery.city_id;
      }

      $("coverageMaxZones").value =
        state.zoneContext?.max_zones === null || state.zoneContext?.max_zones === undefined
          ? ""
          : state.zoneContext.max_zones;
    }

    renderCoverageSummary();
    renderCoverageZones();
  } catch (e) {
    state.zoneContext = null;
    renderCoverageSummary();
    $("coverageZonesList").innerHTML = `<div class="message error">${esc(e.message || "No se pudo cargar la cobertura.")}</div>`;
  }
}

async function toggleDeliveryZone(zoneId, active) {
  const delivery = coverageDeliveryRecord();
  if (!delivery) return;

  try {
    await rpc("set_delivery_zone", {
      p_delivery_id: delivery.id,
      p_zone_id: zoneId,
      p_active: Boolean(active)
    });

    message(active ? "Zona agregada a la cobertura." : "Zona retirada de la cobertura.");
    await loadCoverageContext();
  } catch (e) {
    message(e.message || "No se pudo modificar la cobertura.", "error");
  }
}

async function setCoverageDeliveryCity() {
  if (state.role !== "MASTER") return;

  try {
    const delivery = coverageDeliveryRecord();
    const cityId = $("coverageCity").value || null;

    if (!delivery) throw new Error("Selecciona un DELIVERY.");
    if (!cityId) throw new Error("Selecciona una ciudad.");

    await rpc("master_set_delivery_city", {
      p_delivery_id: delivery.id,
      p_city_id: cityId
    });

    message("Ciudad del DELIVERY actualizada.");
    await Promise.all([loadScopes(), loadDeliveriesModule()]);
    await loadCoverage();
  } catch (e) {
    message(e.message || "No se pudo asignar la ciudad.", "error");
  }
}

async function setCoverageLimit() {
  if (state.role !== "MASTER") return;

  try {
    const delivery = coverageDeliveryRecord();
    const raw = $("coverageMaxZones").value.trim();

    if (!delivery) throw new Error("Selecciona un DELIVERY.");
    if (raw === "") throw new Error("Escribe el límite máximo de zonas.");

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error("El límite debe ser un número entero igual o mayor que 0.");
    }

    await rpc("master_set_delivery_limit", {
      p_delivery_id: delivery.id,
      p_limit_code: "max_zones",
      p_max_value: value
    });

    message("Límite de zonas actualizado.");
    await loadCoverageContext();
  } catch (e) {
    message(e.message || "No se pudo guardar el límite.", "error");
  }
}

async function enableZonesManagement() {
  if (state.role !== "MASTER") return;

  try {
    const delivery = coverageDeliveryRecord();
    if (!delivery) throw new Error("Selecciona un DELIVERY.");

    await rpc("master_set_delivery_capability", {
      p_delivery_id: delivery.id,
      p_capability_code: "zones.manage",
      p_enabled: true
    });

    message("Gestión de zonas habilitada para este DELIVERY.");
    await loadCoverageContext();
  } catch (e) {
    message(e.message || "No se pudo habilitar la gestión de zonas.", "error");
  }
}

function editZone(zoneId) {
  if (state.role !== "MASTER") return;

  const zone = state.zonesCatalog.find(item => item.id === zoneId);
  if (!zone) return;

  $("zoneEditId").value = zone.id;
  $("zoneEditCity").value = zone.city_id;
  $("zoneEditName").value = zone.name || "";
  $("zoneEditActive").value = String(zone.active);
  $("saveZoneBtn").textContent = "Actualizar zona";
  $("zoneEditName").focus();
}

async function saveZone() {
  if (state.role !== "MASTER") return;

  try {
    const zoneId = $("zoneEditId").value || null;
    const cityId = $("zoneEditCity").value || null;
    const name = $("zoneEditName").value.trim();

    if (!cityId) throw new Error("Selecciona una ciudad.");
    if (!name) throw new Error("Escribe el nombre de la zona.");

    await rpc("master_save_zone", {
      p_zone_id: zoneId,
      p_city_id: cityId,
      p_name: name,
      p_active: $("zoneEditActive").value === "true"
    });

    message(zoneId ? "Zona actualizada." : "Zona creada.");
    clearZoneForm();
    await loadZoneCatalog();
    await loadCoverageContext();
  } catch (e) {
    message(e.message || "No se pudo guardar la zona.", "error");
  }
}

const scheduleDayNames = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado"
];

function selectedCatalogLocalId() {
  return $("catalogLocal")?.value || state.locals[0]?.id || null;
}

function selectedScheduleLocalId() {
  return $("scheduleLocal")?.value || state.locals[0]?.id || null;
}

function clearVariantForm() {
  $("variantId").value = "";
  $("variantName").value = "";
  $("variantPrice").value = "";
  $("variantOrder").value = "0";
  $("variantActive").value = "true";
  $("saveVariantBtn").textContent = "Guardar variante";
}

function renderVariants() {
  const container = $("variantsList");
  if (!container) return;

  if (!state.variants.length) {
    container.innerHTML = '<div class="muted">Este producto todavía no tiene variantes.</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Variante</th>
            <th>Precio</th>
            <th>Orden</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.variants.map(variant => `
            <tr>
              <td>${esc(variant.name)}</td>
              <td>${Number(variant.price || 0).toFixed(2)}</td>
              <td>${esc(variant.display_order ?? 0)}</td>
              <td>${variant.active ? "Activa" : "Inactiva"}</td>
              <td>
                <div class="row">
                  <button class="btn-muted" onclick="editVariant('${variant.id}')">Editar</button>
                  ${variant.active
                    ? `<button class="btn-danger" onclick="deactivateVariant('${variant.id}')">Desactivar</button>`
                    : ""}
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function loadVariants() {
  const productId = $("variantProduct")?.value || null;

  if (!productId) {
    state.variants = [];
    renderVariants();
    $("saveVariantBtn").disabled = true;
    return;
  }

  const { data, error } = await supabaseClient
    .from("product_variants")
    .select("id,product_id,name,price,display_order,active")
    .eq("product_id", productId)
    .order("display_order")
    .order("name");

  if (error) {
    state.variants = [];
    renderVariants();
    $("saveVariantBtn").disabled = true;
    message(error.message || "No se pudieron cargar las variantes.", "error");
    return;
  }

  state.variants = data || [];
  $("saveVariantBtn").disabled = false;
  clearVariantForm();
  renderVariants();
}

function editVariant(variantId) {
  const variant = state.variants.find(item => item.id === variantId);
  if (!variant) return;

  $("variantId").value = variant.id;
  $("variantName").value = variant.name || "";
  $("variantPrice").value = variant.price ?? "";
  $("variantOrder").value = variant.display_order ?? 0;
  $("variantActive").value = String(variant.active);
  $("saveVariantBtn").textContent = "Actualizar variante";
  $("variantName").focus();
}

async function saveVariant() {
  try {
    const productId = $("variantProduct").value || null;
    const variantId = $("variantId").value || null;
    const name = $("variantName").value.trim();
    const priceRaw = $("variantPrice").value.trim();
    const orderRaw = $("variantOrder").value.trim();

    if (!productId) throw new Error("Selecciona un producto.");
    if (!name) throw new Error("Escribe el nombre de la variante.");
    if (priceRaw === "") throw new Error("Escribe el precio de la variante.");

    const price = Number(priceRaw);
    const displayOrder = orderRaw === "" ? 0 : Number(orderRaw);

    if (!Number.isFinite(price) || price < 0) {
      throw new Error("El precio debe ser igual o mayor que 0.");
    }

    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      throw new Error("El orden debe ser un entero igual o mayor que 0.");
    }

    await rpc("save_product_variant", {
      p_product_id: productId,
      p_variant_id: variantId,
      p_name: name,
      p_price: price,
      p_display_order: displayOrder,
      p_active: $("variantActive").value === "true"
    });

    message(variantId ? "Variante actualizada." : "Variante creada.");
    await loadVariants();
  } catch (e) {
    message(e.message || "No se pudo guardar la variante.", "error");
  }
}

async function deactivateVariant(variantId) {
  const variant = state.variants.find(item => item.id === variantId);
  const productId = $("variantProduct").value || null;
  if (!variant || !productId) return;

  if (!confirm(`¿Desactivar la variante "${variant.name}"?`)) return;

  try {
    await rpc("save_product_variant", {
      p_product_id: productId,
      p_variant_id: variant.id,
      p_name: variant.name,
      p_price: Number(variant.price),
      p_display_order: Number(variant.display_order || 0),
      p_active: false
    });

    message("Variante desactivada.");
    await loadVariants();
  } catch (e) {
    message(e.message || "No se pudo desactivar la variante.", "error");
  }
}

async function enableCatalogManagement() {
  if (state.role !== "MASTER") return;

  try {
    const localId = selectedCatalogLocalId();
    if (!localId) throw new Error("Selecciona un LOCAL.");

    for (const capability of ["categories.manage","products.manage","variants.manage"]) {
      await rpc("master_set_local_capability", {
        p_local_id: localId,
        p_capability_code: capability,
        p_enabled: true
      });
    }

    message("Catálogo y variantes habilitados para el LOCAL.");
  } catch (e) {
    message(e.message || "No se pudo habilitar el catálogo.", "error");
  }
}

function renderScheduleEditor() {
  const container = $("scheduleEditor");
  if (!container) return;

  const byDay = new Map(
    state.schedules.map(schedule => [Number(schedule.day_of_week), schedule])
  );

  container.innerHTML = scheduleDayNames.map((dayName, day) => {
    const schedule = byDay.get(day);
    const isClosed = schedule ? Boolean(schedule.is_closed) : true;
    const opening = schedule?.opening_time ? String(schedule.opening_time).slice(0,5) : "";
    const closing = schedule?.closing_time ? String(schedule.closing_time).slice(0,5) : "";

    return `
      <div class="schedule-row">
        <strong>${dayName}</strong>
        <label class="row">
          <input
            id="scheduleClosed${day}"
            type="checkbox"
            style="width:auto"
            ${isClosed ? "checked" : ""}
            onchange="toggleScheduleDay(${day})"
          >
          <span>Cerrado</span>
        </label>
        <div>
          <label>Apertura</label>
          <input id="scheduleOpen${day}" type="time" value="${esc(opening)}" ${isClosed ? "disabled" : ""}>
        </div>
        <div>
          <label>Cierre</label>
          <input id="scheduleClose${day}" type="time" value="${esc(closing)}" ${isClosed ? "disabled" : ""}>
        </div>
      </div>
    `;
  }).join("");
}

function toggleScheduleDay(day) {
  const closed = $("scheduleClosed" + day).checked;
  $("scheduleOpen" + day).disabled = closed;
  $("scheduleClose" + day).disabled = closed;
}

async function loadSchedules() {
  if (!["MASTER","LOCAL_ADMIN"].includes(state.role)) return;

  const localId = selectedScheduleLocalId();

  if (!localId) {
    state.schedules = [];
    renderScheduleEditor();
    $("saveSchedulesBtn").disabled = true;
    return;
  }

  const { data, error } = await supabaseClient
    .from("local_schedules")
    .select("id,local_id,day_of_week,is_closed,opening_time,closing_time")
    .eq("local_id", localId)
    .order("day_of_week");

  if (error) {
    state.schedules = [];
    renderScheduleEditor();
    $("saveSchedulesBtn").disabled = true;
    message(error.message || "No se pudieron cargar los horarios.", "error");
    return;
  }

  state.schedules = data || [];
  $("saveSchedulesBtn").disabled = false;
  renderScheduleEditor();
}

async function saveSchedules() {
  try {
    const localId = selectedScheduleLocalId();
    if (!localId) throw new Error("Selecciona un LOCAL.");

    const rows = scheduleDayNames.map((_, day) => {
      const isClosed = $("scheduleClosed" + day).checked;
      const opening = $("scheduleOpen" + day).value || null;
      const closing = $("scheduleClose" + day).value || null;

      if (!isClosed) {
        if (!opening || !closing) {
          throw new Error(`${scheduleDayNames[day]}: completa hora de apertura y cierre.`);
        }

        if (opening >= closing) {
          throw new Error(`${scheduleDayNames[day]}: la apertura debe ser anterior al cierre.`);
        }
      }

      return { day, isClosed, opening, closing };
    });

    await rpc("save_local_schedule_week", {
      p_local_id: localId,
      p_days: rows.map(row => ({
        day_of_week: row.day,
        is_closed: row.isClosed,
        opening_time: row.isClosed ? null : row.opening,
        closing_time: row.isClosed ? null : row.closing
      }))
    });

    message("Horario semanal actualizado.");
    await loadSchedules();
  } catch (e) {
    message(e.message || "No se pudieron guardar los horarios.", "error");
  }
}

async function enableScheduleManagement() {
  if (state.role !== "MASTER") return;

  try {
    const localId = selectedScheduleLocalId();
    if (!localId) throw new Error("Selecciona un LOCAL.");

    await rpc("master_set_local_capability", {
      p_local_id: localId,
      p_capability_code: "schedules.manage",
      p_enabled: true
    });

    message("Gestión de horarios habilitada para el LOCAL.");
  } catch (e) {
    message(e.message || "No se pudo habilitar la gestión de horarios.", "error");
  }
}

function catalogCategoryName(categoryId) {
  if (!categoryId) return "Sin categoría";
  return state.categories.find(category => category.id === categoryId)?.name || categoryId;
}

function clearCategoryForm() {
  $("categoryId").value = "";
  $("categoryName").value = "";
  $("categoryDescription").value = "";
  $("categoryOrder").value = "0";
  $("categoryActive").value = "true";
  $("categoryFormTitle").textContent = "Nueva categoría";
  $("saveCategoryBtn").textContent = "Crear categoría";
}

function clearProductForm() {
  $("productId").value = "";
  $("productName").value = "";
  $("productDescription").value = "";
  $("productPrice").value = "";
  $("productCategory").value = "";
  $("productOrder").value = "0";
  $("productActive").value = "true";
  $("productFormTitle").textContent = "Nuevo producto";
  $("saveProductBtn").textContent = "Crear producto";
}

function renderCatalogCategories() {
  const container = $("catalogCategories");
  if (!container) return;

  if (!state.categories.length) {
    container.innerHTML = '<div class="muted">No hay categorías.</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Categoría</th>
            <th>Orden</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.categories.map(category => `
            <tr>
              <td>
                <strong>${esc(category.name)}</strong>
                ${category.description ? `<div class="muted">${esc(category.description)}</div>` : ""}
              </td>
              <td>${esc(category.display_order ?? 0)}</td>
              <td>${category.active ? "Activa" : "Inactiva"}</td>
              <td>
                <div class="row">
                  <button class="btn-muted" onclick="editCategory('${category.id}')">Editar</button>
                  ${category.active
                    ? `<button class="btn-danger" onclick="deactivateCategory('${category.id}')">Desactivar</button>`
                    : ""}
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCatalogProducts() {
  const container = $("catalogProducts");
  if (!container) return;

  if (!state.products.length) {
    container.innerHTML = '<div class="muted">No hay productos.</div>';
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Orden</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.products.map(product => `
            <tr>
              <td>
                <strong>${esc(product.name)}</strong>
                ${product.description ? `<div class="muted">${esc(product.description)}</div>` : ""}
              </td>
              <td>${esc(catalogCategoryName(product.category_id))}</td>
              <td>$${Number(product.price || 0).toFixed(2)}</td>
              <td>${esc(product.display_order ?? 0)}</td>
              <td>${product.active ? "Activo" : "Inactivo"}</td>
              <td>
                <div class="row">
                  <button class="btn-muted" onclick="editProduct('${product.id}')">Editar</button>
                  <button class="btn-muted" onclick="openProductStorage('${product.id}')">Imagen</button>
                  ${product.active
                    ? `<button class="btn-danger" onclick="deactivateProduct('${product.id}')">Desactivar</button>`
                    : ""}
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function loadCatalog() {
  if (!["MASTER","LOCAL_ADMIN"].includes(state.role)) return;

  const localId = selectedCatalogLocalId();
  if (!localId) {
    state.categories = [];
    state.products = [];
    state.variants = [];
    renderCatalogCategories();
    renderCatalogProducts();
    $("variantsList").innerHTML = '<div class="muted">No tienes un LOCAL activo asignado.</div>';
    return;
  }

  const [cRes, pRes] = await Promise.all([
    supabaseClient
      .from("categories")
      .select("id,name,description,image_url,display_order,active")
      .eq("local_id", localId)
      .order("display_order")
      .order("name"),

    supabaseClient
      .from("products")
      .select("id,category_id,name,description,price,image_url,display_order,active")
      .eq("local_id", localId)
      .order("display_order")
      .order("name")
  ]);

  if (cRes.error) throw cRes.error;
  if (pRes.error) throw pRes.error;

  state.categories = cRes.data || [];
  state.products = pRes.data || [];

  $("productCategory").innerHTML =
    '<option value="">Sin categoría</option>' +
    state.categories.map(category =>
      `<option value="${category.id}">${esc(category.name)}${category.active ? "" : " — inactiva"}</option>`
    ).join("");

  $("variantProduct").innerHTML = state.products.length
    ? state.products.map(product =>
        `<option value="${product.id}">${esc(product.name)}${product.active ? "" : " — inactivo"}</option>`
      ).join("")
    : '<option value="">Primero crea un producto</option>';

  clearCategoryForm();
  clearProductForm();
  renderCatalogCategories();
  renderCatalogProducts();
  await loadVariants();
}

function editCategory(categoryId) {
  const category = state.categories.find(item => item.id === categoryId);
  if (!category) return;

  $("categoryId").value = category.id;
  $("categoryName").value = category.name || "";
  $("categoryDescription").value = category.description || "";
  $("categoryOrder").value = category.display_order ?? 0;
  $("categoryActive").value = String(category.active);
  $("categoryFormTitle").textContent = "Editar categoría";
  $("saveCategoryBtn").textContent = "Actualizar categoría";
  $("categoryName").focus();
}

async function saveCategory() {
  try {
    const localId = selectedCatalogLocalId();
    const categoryId = $("categoryId").value || null;
    const name = $("categoryName").value.trim();
    const orderRaw = $("categoryOrder").value.trim();

    if (!localId) throw new Error("Selecciona un LOCAL.");
    if (!name) throw new Error("Escribe el nombre de la categoría.");

    const displayOrder = orderRaw === "" ? 0 : Number(orderRaw);
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      throw new Error("El orden debe ser un entero igual o mayor que 0.");
    }

    const current = categoryId
      ? state.categories.find(category => category.id === categoryId)
      : null;

    await rpc("save_local_category", {
      p_local_id: localId,
      p_category_id: categoryId,
      p_name: name,
      p_description: $("categoryDescription").value.trim() || null,
      p_image_url: current?.image_url || null,
      p_display_order: displayOrder,
      p_active: $("categoryActive").value === "true"
    });

    message(categoryId ? "Categoría actualizada." : "Categoría creada.");
    clearCategoryForm();
    await loadCatalog();
  } catch (e) {
    message(e.message || "No se pudo guardar la categoría.", "error");
  }
}

async function deactivateCategory(categoryId) {
  const localId = selectedCatalogLocalId();
  const category = state.categories.find(item => item.id === categoryId);
  if (!localId || !category) return;

  if (!confirm(`¿Desactivar la categoría "${category.name}"? Los productos conservarán su relación con ella, pero la categoría dejará de estar activa.`)) return;

  try {
    await rpc("save_local_category", {
      p_local_id: localId,
      p_category_id: category.id,
      p_name: category.name,
      p_description: category.description || null,
      p_image_url: category.image_url || null,
      p_display_order: Number(category.display_order || 0),
      p_active: false
    });

    message("Categoría desactivada.");
    await loadCatalog();
  } catch (e) {
    message(e.message || "No se pudo desactivar la categoría.", "error");
  }
}

function editProduct(productId) {
  const product = state.products.find(item => item.id === productId);
  if (!product) return;

  $("productId").value = product.id;
  $("productName").value = product.name || "";
  $("productDescription").value = product.description || "";
  $("productPrice").value = product.price ?? "";
  $("productCategory").value = product.category_id || "";
  $("productOrder").value = product.display_order ?? 0;
  $("productActive").value = String(product.active);
  $("productFormTitle").textContent = "Editar producto";
  $("saveProductBtn").textContent = "Actualizar producto";
  $("productName").focus();
}

async function saveProduct() {
  try {
    const localId = selectedCatalogLocalId();
    const productId = $("productId").value || null;
    const name = $("productName").value.trim();
    const priceRaw = $("productPrice").value.trim();
    const orderRaw = $("productOrder").value.trim();

    if (!localId) throw new Error("Selecciona un LOCAL.");
    if (!name) throw new Error("Escribe el nombre del producto.");
    if (priceRaw === "") throw new Error("Escribe el precio del producto.");

    const price = Number(priceRaw);
    const displayOrder = orderRaw === "" ? 0 : Number(orderRaw);

    if (!Number.isFinite(price) || price < 0) {
      throw new Error("El precio debe ser igual o mayor que 0.");
    }

    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      throw new Error("El orden debe ser un entero igual o mayor que 0.");
    }

    const current = productId
      ? state.products.find(product => product.id === productId)
      : null;

    await rpc("save_local_product", {
      p_local_id: localId,
      p_product_id: productId,
      p_category_id: $("productCategory").value || null,
      p_name: name,
      p_description: $("productDescription").value.trim() || null,
      p_price: price,
      p_image_url: current?.image_url || null,
      p_display_order: displayOrder,
      p_active: $("productActive").value === "true"
    });

    message(productId ? "Producto actualizado." : "Producto creado.");
    clearProductForm();
    await loadCatalog();
  } catch (e) {
    message(e.message || "No se pudo guardar el producto.", "error");
  }
}

async function deactivateProduct(productId) {
  const localId = selectedCatalogLocalId();
  const product = state.products.find(item => item.id === productId);
  if (!localId || !product) return;

  if (!confirm(`¿Desactivar el producto "${product.name}"? Dejará de mostrarse en el sitio público.`)) return;

  try {
    await rpc("save_local_product", {
      p_local_id: localId,
      p_product_id: product.id,
      p_category_id: product.category_id || null,
      p_name: product.name,
      p_description: product.description || null,
      p_price: Number(product.price),
      p_image_url: product.image_url || null,
      p_display_order: Number(product.display_order || 0),
      p_active: false
    });

    message("Producto desactivado.");
    await loadCatalog();
  } catch (e) {
    message(e.message || "No se pudo desactivar el producto.", "error");
  }
}

async function openProductStorage(productId = null) {
  const localId = selectedCatalogLocalId();
  if (!localId) return;

  showSection("storage");

  if ($("storageLocal")) {
    $("storageLocal").value = localId;
    await refreshLocalMediaPreview();
    await loadStorageProducts();
  }

  const targetId = productId || $("productId").value || null;
  if (targetId && $("storageProduct")) {
    $("storageProduct").value = targetId;
    await refreshProductMediaPreview();
  }
}


async function loadStorage() {
  if (!["MASTER","DELIVERY_ADMIN","LOCAL_ADMIN"].includes(state.role)) return;

  document.querySelectorAll(".master-only").forEach(el => {
    el.classList.toggle("hidden", state.role !== "MASTER");
  });

  $("storageDeliveryCard").classList.toggle(
    "hidden",
    !["MASTER","DELIVERY_ADMIN"].includes(state.role)
  );

  $("storageLocalCard").classList.toggle(
    "hidden",
    !["MASTER","LOCAL_ADMIN"].includes(state.role)
  );

  $("storageProductCard").classList.toggle(
    "hidden",
    !["MASTER","LOCAL_ADMIN"].includes(state.role)
  );

  if (["MASTER","DELIVERY_ADMIN"].includes(state.role)) {
    $("storageDelivery").innerHTML = state.deliveries.map(d =>
      `<option value="${d.id}">${esc(d.name)}</option>`
    ).join("");

    await refreshDeliveryMediaPreview();
  }

  if (["MASTER","LOCAL_ADMIN"].includes(state.role)) {
    $("storageLocal").innerHTML = state.locals.map(l =>
      `<option value="${l.id}">${esc(l.name)}</option>`
    ).join("");

    await refreshLocalMediaPreview();
    await loadStorageProducts();
  }
}

function setPreview(id, url) {
  const img = $(id);
  img.src = url || "";
  img.alt = url ? "Vista previa" : "";
}

async function getDeliveryMediaRecord() {
  const id = $("storageDelivery").value;
  if (!id) return null;

  const { data, error } = await supabaseClient
    .from("deliveries")
    .select("id,name,description,logo_url,phone,whatsapp")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

async function refreshDeliveryMediaPreview() {
  if (!$("storageDelivery")?.value) {
    setPreview("deliveryLogoPreview", "");
    return;
  }

  try {
    const delivery = await getDeliveryMediaRecord();
    setPreview("deliveryLogoPreview", delivery?.logo_url || "");
  } catch (e) {
    message(e.message || "No se pudo cargar el logo del DELIVERY.", "error");
  }
}

async function saveDeliveryLogoUrl(delivery, logoUrl) {
  await rpc("update_my_delivery_content", {
    p_delivery_id: delivery.id,
    p_description: delivery.description || null,
    p_logo_url: logoUrl || null,
    p_phone: delivery.phone || null,
    p_whatsapp: delivery.whatsapp || null
  });
}

async function uploadDeliveryLogo() {
  const input = $("deliveryLogoFile");
  const file = input.files?.[0];
  if (!file) return message("Selecciona una imagen nueva.", "error");

  let uploaded = null;
  let previousPath = null;

  try {
    const delivery = await getDeliveryMediaRecord();
    const path = mediaPathDelivery(delivery.id, "logo");
    previousPath = pathDesdePublicUrlHTPWEB(delivery.logo_url);
    uploaded = await subirImagenHTPWEB(path, file);

    await saveDeliveryLogoUrl(delivery, uploaded.url);

    if (previousPath && previousPath !== uploaded.path) {
      await eliminarObjetoMediaHTPWEB(previousPath).catch(() => {});
    }

    input.value = "";
    setPreview("deliveryLogoPreview", uploaded.url);
    message("Logo del DELIVERY actualizado.");
  } catch (e) {
    if (uploaded && previousPath !== uploaded.path) {
      await eliminarObjetoMediaHTPWEB(uploaded.path).catch(() => {});
    }
    message(e.message || "No se pudo subir el logo.", "error");
  }
}

async function deleteDeliveryLogo() {
  try {
    const delivery = await getDeliveryMediaRecord();
    const oldPath = pathDesdePublicUrlHTPWEB(delivery.logo_url) || mediaPathDelivery(delivery.id, "logo");

    await saveDeliveryLogoUrl(delivery, null);

    try {
      await eliminarObjetoMediaHTPWEB(oldPath);
    } catch (storageError) {
      setPreview("deliveryLogoPreview", "");
      return message(
        "El logo se desvinculó, pero no se pudo borrar el archivo de Storage: " + (storageError.message || storageError),
        "error"
      );
    }

    setPreview("deliveryLogoPreview", "");
    message("Logo eliminado.");
  } catch (e) {
    message(e.message || "No se pudo eliminar el logo.", "error");
  }
}

async function enableDeliveryMedia() {
  try {
    const deliveryId = $("storageDelivery").value;
    if (!deliveryId) throw new Error("Selecciona un DELIVERY.");

    await rpc("master_set_delivery_capability", {
      p_delivery_id: deliveryId,
      p_capability_code: "images.manage",
      p_enabled: true
    });

    await rpc("master_set_delivery_capability", {
      p_delivery_id: deliveryId,
      p_capability_code: "delivery.info.manage",
      p_enabled: true
    });

    message("Gestión del DELIVERY habilitada.");
  } catch (e) {
    message(e.message || "No se pudieron habilitar las capabilities.", "error");
  }
}

async function getLocalMediaRecord() {
  const id = $("storageLocal").value;
  if (!id) return null;

  const { data, error } = await supabaseClient
    .from("locals")
    .select("id,name,description,banner_url,logo_url,phone,whatsapp,website_url,instagram_url,facebook_url,tiktok_url,telegram_url")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

async function saveLocalMediaUrl(local, field, value) {
  const next = {
    banner_url: local.banner_url || null,
    logo_url: local.logo_url || null
  };

  next[field] = value || null;

  await rpc("update_my_local_content", {
    p_local_id: local.id,
    p_description: local.description || null,
    p_banner_url: next.banner_url,
    p_logo_url: next.logo_url,
    p_phone: local.phone || null,
    p_whatsapp: local.whatsapp || null,
    p_website_url: local.website_url || null,
    p_instagram_url: local.instagram_url || null,
    p_facebook_url: local.facebook_url || null,
    p_tiktok_url: local.tiktok_url || null,
    p_telegram_url: local.telegram_url || null
  });
}

async function refreshLocalMediaPreview() {
  if (!$("storageLocal")?.value) {
    setPreview("localLogoPreview", "");
    setPreview("localBannerPreview", "");
    return;
  }

  try {
    const local = await getLocalMediaRecord();
    setPreview("localLogoPreview", local?.logo_url || "");
    setPreview("localBannerPreview", local?.banner_url || "");
  } catch (e) {
    message(e.message || "No se pudieron cargar las imágenes del LOCAL.", "error");
  }
}

async function uploadLocalMedia(kind) {
  const input = $(kind === "logo" ? "localLogoFile" : "localBannerFile");
  const file = input.files?.[0];

  if (!file) return message("Selecciona una imagen nueva.", "error");

  let uploaded = null;
  let previousPath = null;

  try {
    const local = await getLocalMediaRecord();
    const field = kind === "logo" ? "logo_url" : "banner_url";
    const path = mediaPathLocal(local.id, kind);
    previousPath = pathDesdePublicUrlHTPWEB(local[field]);

    uploaded = await subirImagenHTPWEB(path, file);
    await saveLocalMediaUrl(local, field, uploaded.url);

    if (previousPath && previousPath !== uploaded.path) {
      await eliminarObjetoMediaHTPWEB(previousPath).catch(() => {});
    }

    input.value = "";
    setPreview(kind === "logo" ? "localLogoPreview" : "localBannerPreview", uploaded.url);
    message(kind === "logo" ? "Logo del LOCAL actualizado." : "Banner del LOCAL actualizado.");
  } catch (e) {
    if (uploaded && previousPath !== uploaded.path) {
      await eliminarObjetoMediaHTPWEB(uploaded.path).catch(() => {});
    }
    message(e.message || "No se pudo subir la imagen del LOCAL.", "error");
  }
}

async function deleteLocalMedia(kind) {
  try {
    const local = await getLocalMediaRecord();
    const field = kind === "logo" ? "logo_url" : "banner_url";
    const oldUrl = local[field];
    const oldPath = pathDesdePublicUrlHTPWEB(oldUrl) || mediaPathLocal(local.id, kind);

    await saveLocalMediaUrl(local, field, null);

    try {
      await eliminarObjetoMediaHTPWEB(oldPath);
    } catch (storageError) {
      setPreview(kind === "logo" ? "localLogoPreview" : "localBannerPreview", "");
      return message(
        "La imagen se desvinculó, pero no se pudo borrar el archivo de Storage: " + (storageError.message || storageError),
        "error"
      );
    }

    setPreview(kind === "logo" ? "localLogoPreview" : "localBannerPreview", "");
    message("Imagen del LOCAL eliminada.");
  } catch (e) {
    message(e.message || "No se pudo eliminar la imagen.", "error");
  }
}

async function enableLocalMedia() {
  try {
    const localId = $("storageLocal").value;
    if (!localId) throw new Error("Selecciona un LOCAL.");

    for (const capability of ["images.manage","local.info.manage","categories.manage","products.manage","variants.manage","schedules.manage"]) {
      await rpc("master_set_local_capability", {
        p_local_id: localId,
        p_capability_code: capability,
        p_enabled: true
      });
    }

    message("Gestión del LOCAL habilitada.");
  } catch (e) {
    message(e.message || "No se pudieron habilitar las capabilities.", "error");
  }
}

async function loadStorageProducts() {
  const localId = $("storageLocal").value;

  if (!localId) {
    $("storageProduct").innerHTML = "";
    setPreview("productImagePreview", "");
    return;
  }

  const { data, error } = await supabaseClient
    .from("products")
    .select("id,name,image_url,local_id")
    .eq("local_id", localId)
    .order("name");

  if (error) {
    message(error.message, "error");
    return;
  }

  $("storageProduct").innerHTML = (data || []).map(p =>
    `<option value="${p.id}">${esc(p.name)}</option>`
  ).join("");

  await refreshProductMediaPreview();
}

async function getProductMediaRecord() {
  const id = $("storageProduct").value;
  if (!id) return null;

  const { data, error } = await supabaseClient
    .from("products")
    .select("id,local_id,category_id,name,description,price,image_url,display_order,active")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

async function refreshProductMediaPreview() {
  if (!$("storageProduct")?.value) {
    setPreview("productImagePreview", "");
    return;
  }

  try {
    const product = await getProductMediaRecord();
    setPreview("productImagePreview", product?.image_url || "");
  } catch (e) {
    message(e.message || "No se pudo cargar la imagen del producto.", "error");
  }
}

async function saveProductImageUrl(product, imageUrl) {
  await rpc("save_local_product", {
    p_local_id: product.local_id,
    p_product_id: product.id,
    p_category_id: product.category_id || null,
    p_name: product.name,
    p_description: product.description || null,
    p_price: Number(product.price),
    p_image_url: imageUrl || null,
    p_display_order: Number(product.display_order || 0),
    p_active: Boolean(product.active)
  });
}

async function uploadProductImage() {
  const file = $("productImageFile").files?.[0];
  if (!file) return message("Selecciona una imagen nueva.", "error");

  let uploaded = null;
  let previousPath = null;

  try {
    const product = await getProductMediaRecord();
    const path = mediaPathProduct(product.id);
    previousPath = pathDesdePublicUrlHTPWEB(product.image_url);

    uploaded = await subirImagenHTPWEB(path, file);
    await saveProductImageUrl(product, uploaded.url);

    if (previousPath && previousPath !== uploaded.path) {
      await eliminarObjetoMediaHTPWEB(previousPath).catch(() => {});
    }

    $("productImageFile").value = "";
    setPreview("productImagePreview", uploaded.url);
    message("Imagen del producto actualizada.");
  } catch (e) {
    if (uploaded && previousPath !== uploaded.path) {
      await eliminarObjetoMediaHTPWEB(uploaded.path).catch(() => {});
    }
    message(e.message || "No se pudo subir la imagen del producto.", "error");
  }
}

async function deleteProductImage() {
  try {
    const product = await getProductMediaRecord();
    const oldPath = pathDesdePublicUrlHTPWEB(product.image_url) || mediaPathProduct(product.id);

    await saveProductImageUrl(product, null);

    try {
      await eliminarObjetoMediaHTPWEB(oldPath);
    } catch (storageError) {
      setPreview("productImagePreview", "");
      return message(
        "La imagen se desvinculó, pero no se pudo borrar el archivo de Storage: " + (storageError.message || storageError),
        "error"
      );
    }

    setPreview("productImagePreview", "");
    message("Imagen del producto eliminada.");
  } catch (e) {
    message(e.message || "No se pudo eliminar la imagen del producto.", "error");
  }
}



function advertisementScopeOptions() {
  if (state.role === "MASTER") {
    return ["HTPWEB","DELIVERY","LOCAL","PRODUCT"];
  }
  if (state.role === "DELIVERY_ADMIN") {
    return ["DELIVERY","LOCAL","PRODUCT"];
  }
  if (state.role === "LOCAL_ADMIN") {
    return ["LOCAL","PRODUCT"];
  }
  return [];
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Fecha u hora inválida.");
  return date.toISOString();
}

async function loadAdvertisingDeliveries() {
  if (state.role === "LOCAL_ADMIN") {
    const localIds = state.locals.map(local => local.id);
    state.advertisementDeliveries = [];

    if (localIds.length) {
      const rel = await supabaseClient
        .from("local_deliveries")
        .select("delivery_id")
        .in("local_id", localIds)
        .eq("active", true);

      if (rel.error) throw rel.error;

      const ids = [...new Set((rel.data || []).map(row => row.delivery_id).filter(Boolean))];
      if (ids.length) {
        const deliveries = await supabaseClient
          .from("deliveries")
          .select("id,name,slug,active")
          .in("id", ids)
          .eq("active", true)
          .order("name");

        if (deliveries.error) throw deliveries.error;
        state.advertisementDeliveries = deliveries.data || [];
      }
    }
  } else {
    state.advertisementDeliveries = state.deliveries.filter(delivery => delivery.active !== false);
  }

  const select = $("advertisementDelivery");
  const previous = select.value;
  select.innerHTML = state.advertisementDeliveries.length
    ? state.advertisementDeliveries.map(delivery => `<option value="${delivery.id}">${esc(delivery.name)}</option>`).join("")
    : '<option value="">No hay DELIVERY disponible</option>';

  if (previous && state.advertisementDeliveries.some(delivery => delivery.id === previous)) {
    select.value = previous;
  }
}

async function loadAdvertisingTargets() {
  const scope = $("advertisementScope").value;
  const deliveryId = $("advertisementDelivery").value || null;

  $("advertisementDeliveryField").classList.toggle("hidden", scope === "HTPWEB");
  $("advertisementLocalField").classList.toggle("hidden", !["LOCAL","PRODUCT"].includes(scope));
  $("advertisementProductField").classList.toggle("hidden", scope !== "PRODUCT");

  state.advertisementLocals = [];
  state.advertisementProducts = [];

  if (scope === "HTPWEB" || scope === "DELIVERY" || !deliveryId) {
    $("advertisementLocal").innerHTML = '<option value="">No aplica</option>';
    $("advertisementProduct").innerHTML = '<option value="">No aplica</option>';
    return;
  }

  const rel = await supabaseClient
    .from("local_deliveries")
    .select("local_id")
    .eq("delivery_id", deliveryId)
    .eq("active", true);

  if (rel.error) throw rel.error;

  let ids = [...new Set((rel.data || []).map(row => row.local_id).filter(Boolean))];
  if (state.role === "LOCAL_ADMIN") {
    const allowed = new Set(state.locals.map(local => local.id));
    ids = ids.filter(id => allowed.has(id));
  }

  if (ids.length) {
    const localsRes = await supabaseClient
      .from("locals")
      .select("id,name,active")
      .in("id", ids)
      .eq("active", true)
      .order("name");

    if (localsRes.error) throw localsRes.error;
    state.advertisementLocals = localsRes.data || [];
  }

  const localSelect = $("advertisementLocal");
  const previousLocal = localSelect.value;
  localSelect.innerHTML = state.advertisementLocals.length
    ? state.advertisementLocals.map(local => `<option value="${local.id}">${esc(local.name)}</option>`).join("")
    : '<option value="">No hay LOCAL disponible</option>';

  if (previousLocal && state.advertisementLocals.some(local => local.id === previousLocal)) {
    localSelect.value = previousLocal;
  }

  if (scope === "PRODUCT") {
    await loadAdvertisingProducts();
  } else {
    $("advertisementProduct").innerHTML = '<option value="">No aplica</option>';
  }
}

async function loadAdvertisingProducts() {
  const localId = $("advertisementLocal").value || null;
  state.advertisementProducts = [];

  if (localId) {
    const res = await supabaseClient
      .from("products")
      .select("id,name,active")
      .eq("local_id", localId)
      .eq("active", true)
      .order("name");

    if (res.error) throw res.error;
    state.advertisementProducts = res.data || [];
  }

  const select = $("advertisementProduct");
  const previous = select.value;
  select.innerHTML = state.advertisementProducts.length
    ? state.advertisementProducts.map(product => `<option value="${product.id}">${esc(product.name)}</option>`).join("")
    : '<option value="">No hay PRODUCTO disponible</option>';

  if (previous && state.advertisementProducts.some(product => product.id === previous)) {
    select.value = previous;
  }
}

function renderAdvertisements() {
  const list = $("advertisementsList");
  if (!state.advertisements.length) {
    list.innerHTML = '<div class="muted">No hay publicidad visible o administrable en este ámbito.</div>';
    return;
  }

  list.innerHTML = state.advertisements.map(ad => `
    <div class="card" style="margin:0">
      <div class="row between">
        <div>
          <strong>${esc(ad.title)}</strong>
          <div class="muted">${esc(ad.scope_type)} · prioridad ${Number(ad.priority || 0)}</div>
        </div>
        <span class="badge">${ad.active ? "ACTIVA" : "INACTIVA"}</span>
      </div>
      ${ad.body ? `<p>${esc(ad.body)}</p>` : ""}
      ${ad.image_url ? `<img src="${esc(ad.image_url)}" alt="" style="max-width:220px;max-height:100px;object-fit:cover;border-radius:10px">` : ""}
      <div class="row" style="margin-top:10px">
        <button class="btn-muted" onclick="editAdvertisement('${ad.id}')">Editar</button>
      </div>
    </div>
  `).join("");
}

async function loadAdvertisements() {
  let query = supabaseClient
    .from("advertisements")
    .select("id,scope_type,delivery_id,local_id,product_id,title,body,image_url,target_url,priority,active,starts_at,ends_at,updated_at")
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(200);

  if (state.role === "DELIVERY_ADMIN") {
    const ids = state.advertisementDeliveries.map(delivery => delivery.id);
    if (!ids.length) {
      state.advertisements = [];
      renderAdvertisements();
      return;
    }
    query = query.in("delivery_id", ids);
  } else if (state.role === "LOCAL_ADMIN") {
    const ids = state.locals.map(local => local.id);
    if (!ids.length) {
      state.advertisements = [];
      renderAdvertisements();
      return;
    }
    query = query.in("local_id", ids);
  }

  const { data, error } = await query;
  if (error) throw error;
  state.advertisements = data || [];
  renderAdvertisements();
}

async function loadAdvertising() {
  if (!["MASTER","DELIVERY_ADMIN","LOCAL_ADMIN"].includes(state.role)) return;

  try {
    const scopeSelect = $("advertisementScope");
    const previousScope = scopeSelect.value;
    const options = advertisementScopeOptions();
    scopeSelect.innerHTML = options.map(scope => `<option value="${scope}">${scope}</option>`).join("");
    if (previousScope && options.includes(previousScope)) scopeSelect.value = previousScope;

    await loadAdvertisingDeliveries();
    await loadAdvertisingTargets();
    await loadAdvertisements();
  } catch (e) {
    $("advertisementsList").innerHTML = `<div class="message error">${esc(e.message || "No se pudo cargar publicidad.")}</div>`;
  }
}

function clearAdvertisementForm() {
  $("advertisementId").value = "";
  $("advertisementTitle").value = "";
  $("advertisementBody").value = "";
  $("advertisementImageUrl").value = "";
  $("advertisementTargetUrl").value = "";
  $("advertisementPriority").value = "0";
  $("advertisementStartsAt").value = "";
  $("advertisementEndsAt").value = "";
  $("advertisementActive").checked = false;
  $("advertisementImageFile").value = "";
  loadAdvertisingTargets();
}

async function editAdvertisement(id) {
  const ad = state.advertisements.find(row => row.id === id);
  if (!ad) return;

  $("advertisementId").value = ad.id;
  $("advertisementScope").value = ad.scope_type;
  await loadAdvertisingDeliveries();

  if (ad.delivery_id && state.advertisementDeliveries.some(delivery => delivery.id === ad.delivery_id)) {
    $("advertisementDelivery").value = ad.delivery_id;
  }

  await loadAdvertisingTargets();

  if (ad.local_id && state.advertisementLocals.some(local => local.id === ad.local_id)) {
    $("advertisementLocal").value = ad.local_id;
    if (ad.scope_type === "PRODUCT") await loadAdvertisingProducts();
  }

  if (ad.product_id && state.advertisementProducts.some(product => product.id === ad.product_id)) {
    $("advertisementProduct").value = ad.product_id;
  }

  $("advertisementTitle").value = ad.title || "";
  $("advertisementBody").value = ad.body || "";
  $("advertisementImageUrl").value = ad.image_url || "";
  $("advertisementTargetUrl").value = ad.target_url || "";
  $("advertisementPriority").value = String(ad.priority || 0);
  $("advertisementStartsAt").value = toDatetimeLocal(ad.starts_at);
  $("advertisementEndsAt").value = toDatetimeLocal(ad.ends_at);
  $("advertisementActive").checked = ad.active === true;
  $("advertisementImageFile").value = "";
  document.getElementById("section-advertising")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function advertisementMediaPath(scope, adId, deliveryId, localId, productId) {
  if (scope === "HTPWEB") return `advertising/htpweb/${adId}/banner`;
  if (scope === "DELIVERY") return `advertising/delivery/${deliveryId}/${adId}`;
  if (scope === "LOCAL") return `advertising/local/${localId}/${adId}`;
  return `advertising/product/${productId}/${adId}`;
}

async function saveAdvertisement() {
  const button = $("saveAdvertisementBtn");
  let uploaded = null;

  try {
    const scope = $("advertisementScope").value;
    const title = $("advertisementTitle").value.trim();
    if (!title) throw new Error("Escribe el título del anuncio.");

    const deliveryId = scope === "HTPWEB" ? null : ($("advertisementDelivery").value || null);
    const localId = ["LOCAL","PRODUCT"].includes(scope) ? ($("advertisementLocal").value || null) : null;
    const productId = scope === "PRODUCT" ? ($("advertisementProduct").value || null) : null;

    if (scope !== "HTPWEB" && !deliveryId) throw new Error("Selecciona un DELIVERY.");
    if (["LOCAL","PRODUCT"].includes(scope) && !localId) throw new Error("Selecciona un LOCAL.");
    if (scope === "PRODUCT" && !productId) throw new Error("Selecciona un PRODUCTO.");

    const startsAt = fromDatetimeLocal($("advertisementStartsAt").value);
    const endsAt = fromDatetimeLocal($("advertisementEndsAt").value);
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
      throw new Error("La fecha de fin debe ser posterior al inicio.");
    }

    button.disabled = true;
    const currentId = $("advertisementId").value || null;
    const oldImageUrl = $("advertisementImageUrl").value.trim() || null;

    const args = {
      p_ad_id: currentId,
      p_scope_type: scope,
      p_delivery_id: deliveryId,
      p_local_id: localId,
      p_product_id: productId,
      p_title: title,
      p_body: $("advertisementBody").value.trim() || null,
      p_image_url: oldImageUrl,
      p_target_url: $("advertisementTargetUrl").value.trim() || null,
      p_priority: Math.max(0, Number.parseInt($("advertisementPriority").value, 10) || 0),
      p_active: $("advertisementActive").checked,
      p_starts_at: startsAt,
      p_ends_at: endsAt
    };

    const adId = await rpc("save_advertisement", args);
    const file = $("advertisementImageFile").files?.[0];

    if (file) {
      const path = advertisementMediaPath(scope, adId, deliveryId, localId, productId);
      uploaded = await subirImagenHTPWEB(path, file);
      args.p_ad_id = adId;
      args.p_image_url = uploaded.url;
      await rpc("save_advertisement", args);

      const oldPath = pathDesdePublicUrlHTPWEB(oldImageUrl);
      if (oldPath && oldPath !== uploaded.path) {
        await eliminarObjetoMediaHTPWEB(oldPath).catch(() => {});
      }
    }

    message("Publicidad guardada.");
    clearAdvertisementForm();
    await loadAdvertisements();
  } catch (e) {
    message(e.message || "No se pudo guardar la publicidad.", "error");
  } finally {
    button.disabled = false;
  }
}

function previewAdvertisementDestination() {
  const scope = $("advertisementScope").value;
  const deliveryId = $("advertisementDelivery").value || null;
  const delivery = state.advertisementDeliveries.find(row => row.id === deliveryId);
  const explicit = $("advertisementTargetUrl").value.trim();

  if (explicit) {
    try {
      const url = new URL(explicit, location.href);
      window.open(url.href, "_blank", "noopener");
      return;
    } catch {
      return message("La URL de destino no es válida.", "error");
    }
  }

  if (!delivery?.slug) return message("Selecciona un DELIVERY para abrir el destino.", "error");

  const base = new URL("../app/local.html", location.href);
  base.searchParams.set("delivery", delivery.slug);

  if (scope === "DELIVERY") {
    const home = new URL("../app/index.html", location.href);
    home.searchParams.set("delivery", delivery.slug);
    window.open(home.href, "_blank", "noopener");
    return;
  }

  const localId = $("advertisementLocal").value || "";
  if (!localId) return message("Selecciona un LOCAL.", "error");
  base.searchParams.set("local", localId);

  if (scope === "PRODUCT") {
    const productId = $("advertisementProduct").value || "";
    if (!productId) return message("Selecciona un PRODUCTO.", "error");
    base.searchParams.set("product", productId);
  }

  window.open(base.href, "_blank", "noopener");
}

async function loadAnalytics() {
  if (!["MASTER","DELIVERY_ADMIN","LOCAL_ADMIN"].includes(state.role)) return;

  try {
    const scope = $("analyticsScope").value;

    let result;

    if (scope === "MASTER" || (state.role === "MASTER" && !scope)) {
      result = await rpc("analytics_master_summary", {
        p_from: null,
        p_to: null
      });
    } else if (scope?.startsWith("DELIVERY:")) {
      result = await rpc("analytics_delivery_summary", {
        p_delivery_id: scope.split(":")[1],
        p_from: null,
        p_to: null
      });
    } else if (scope?.startsWith("LOCAL:")) {
      result = await rpc("analytics_local_summary", {
        p_local_id: scope.split(":")[1],
        p_from: null,
        p_to: null
      });
    } else {
      result = { message: "No hay scope disponible." };
    }

    $("analyticsResult").textContent = JSON.stringify(result, null, 2);
  } catch (e) {
    $("analyticsResult").textContent = JSON.stringify({ error: e.message }, null, 2);
  }
}

function bindEvents() {
  $("logoutBtn").onclick = async () => {
    try {
      await cerrarSesion();
      location.href = "../app/acceso.html";
    } catch (e) {
      message(e.message || "No se pudo cerrar sesión.", "error");
    }
  };

  $("refreshBtn").onclick = refreshAll;
  $("orderScope").onchange = loadOrders;
  $("analyticsScope").onchange = loadAnalytics;
  $("advertisementScope").onchange = loadAdvertisingTargets;
  $("advertisementDelivery").onchange = loadAdvertisingTargets;
  $("advertisementLocal").onchange = loadAdvertisingProducts;
  $("saveAdvertisementBtn").onclick = saveAdvertisement;
  $("clearAdvertisementBtn").onclick = clearAdvertisementForm;
  $("previewAdvertisementBtn").onclick = previewAdvertisementDestination;
  $("catalogLocal").onchange = loadCatalog;

  $("submitRequestBtn").onclick = submitRequest;
  $("requestType").onchange = updateRequestForm;
  $("requestDelivery").onchange = updateRequestForm;
  $("profileDelivery").onchange = loadDeliveryProfileRecord;
  $("saveDeliveryProfileBtn").onclick = saveDeliveryProfile;
  $("profileGoStorageBtn").onclick = openDeliveryStorage;
  $("shareDelivery").onchange = loadShareLocals;
  $("shareLocal").onchange = loadShareProducts;
  $("shareProduct").onchange = renderShareLinks;
  $("shareLocalNativeBtn").onclick = () => nativeShare("local");
  $("shareLocalWhatsappBtn").onclick = () => shareWhatsApp("local");
  $("shareLocalFacebookBtn").onclick = () => shareFacebook("local");
  $("copyLocalLinkBtn").onclick = () => copyShareLink("local");
  $("shareProductNativeBtn").onclick = () => nativeShare("product");
  $("shareProductWhatsappBtn").onclick = () => shareWhatsApp("product");
  $("shareProductFacebookBtn").onclick = () => shareFacebook("product");
  $("copyProductLinkBtn").onclick = () => copyShareLink("product");
  $("profileLocal").onchange = loadLocalProfileRecord;
  $("saveLocalProfileBtn").onclick = saveLocalProfile;
  $("profileLocalGoStorageBtn").onclick = openLocalStorage;
  $("profileLocalGoCatalogBtn").onclick = openLocalCatalog;
  $("profileLocalGoScheduleBtn").onclick = openLocalSchedules;
  $("userManagerSearch").oninput = renderUserOptions;
  $("userManagerUser").onchange = renderManagedUser;
  $("assignDeliveryUserBtn").onclick = assignDeliveryUser;
  $("assignLocalUserBtn").onclick = assignLocalUser;
  $("feeDelivery").onchange = loadFeeDelivery;
  $("feeMode").onchange = updateFeeModeUI;
  $("saveFeeConfigBtn").onclick = saveFeeConfig;
  $("saveFeeScheduleBtn").onclick = saveFeeSchedule;
  $("feeRatePeriod").onchange = () => selectFeeRatePeriod($("feeRatePeriod").value);
  $("saveFeeRateBtn").onclick = saveFeeRate;
  $("enableDeliveryFeesBtn").onclick = enableDeliveryFees;
  $("coverageDelivery").onchange = loadCoverageContext;
  $("setDeliveryCityBtn").onclick = setCoverageDeliveryCity;
  $("setCoverageLimitBtn").onclick = setCoverageLimit;
  $("enableZonesBtn").onclick = enableZonesManagement;
  $("saveZoneBtn").onclick = saveZone;
  $("clearZoneBtn").onclick = clearZoneForm;
  $("saveCityBtn").onclick = saveCity;
  $("saveDeliveryBtn").onclick = saveDelivery;
  $("saveCategoryBtn").onclick = saveCategory;
  $("clearCategoryBtn").onclick = clearCategoryForm;
  $("saveProductBtn").onclick = saveProduct;
  $("clearProductBtn").onclick = clearProductForm;
  $("productGoStorageBtn").onclick = () => openProductStorage();
  $("variantProduct").onchange = loadVariants;
  $("saveVariantBtn").onclick = saveVariant;
  $("clearVariantBtn").onclick = clearVariantForm;
  $("enableCatalogManagementBtn").onclick = enableCatalogManagement;
  $("scheduleLocal").onchange = loadSchedules;
  $("saveSchedulesBtn").onclick = saveSchedules;
  $("enableScheduleManagementBtn").onclick = enableScheduleManagement;

  $("storageDelivery").onchange = refreshDeliveryMediaPreview;
  $("storageLocal").onchange = async () => {
    await refreshLocalMediaPreview();
    await loadStorageProducts();
  };
  $("storageProduct").onchange = refreshProductMediaPreview;

  $("uploadDeliveryLogoBtn").onclick = uploadDeliveryLogo;
  $("deleteDeliveryLogoBtn").onclick = deleteDeliveryLogo;
  $("enableDeliveryMediaBtn").onclick = enableDeliveryMedia;

  $("uploadLocalLogoBtn").onclick = () => uploadLocalMedia("logo");
  $("deleteLocalLogoBtn").onclick = () => deleteLocalMedia("logo");
  $("uploadLocalBannerBtn").onclick = () => uploadLocalMedia("banner");
  $("deleteLocalBannerBtn").onclick = () => deleteLocalMedia("banner");
  $("enableLocalMediaBtn").onclick = enableLocalMedia;

  $("uploadProductImageBtn").onclick = uploadProductImage;
  $("deleteProductImageBtn").onclick = deleteProductImage;
}

init();
