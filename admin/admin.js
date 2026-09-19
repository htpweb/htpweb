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
  categories: [],
  products: []
};

const roleSections = {
  MASTER: ["overview","orders","requests","deliveries","storage","analytics"],
  DELIVERY_ADMIN: ["overview","orders","requests","storage","analytics"],
  DELIVERY_OPERATOR: ["overview","orders"],
  LOCAL_ADMIN: ["overview","orders","catalog","storage","analytics"]
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

  showSection(roleSections[state.role][0]);
}

function showSection(name) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll("#nav button").forEach(b => b.classList.remove("active"));

  $("section-" + name)?.classList.add("active");
  document.querySelector(`#nav button[data-section="${name}"]`)?.classList.add("active");
  $("pageTitle").textContent = document.querySelector(`#nav button[data-section="${name}"]`)?.textContent || "HTPWEB Admin";

  if (name === "orders") loadOrders();
  if (name === "requests") loadRequests();
  if (name === "deliveries") loadDeliveriesModule();
  if (name === "catalog") loadCatalog();
  if (name === "storage") loadStorage();
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

async function loadCatalog() {
  if (state.role !== "LOCAL_ADMIN") return;

  const localId = $("catalogLocal").value || state.locals[0]?.id;
  if (!localId) {
    $("catalogProducts").innerHTML = '<div class="muted">No tienes un LOCAL activo asignado.</div>';
    return;
  }

  const [cRes, pRes] = await Promise.all([
    supabaseClient
      .from("categories")
      .select("id,name,description,display_order,active")
      .eq("local_id", localId)
      .order("display_order")
      .order("name"),

    supabaseClient
      .from("products")
      .select("id,category_id,name,description,price,display_order,active")
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
    state.categories.filter(c => c.active).map(c =>
      `<option value="${c.id}">${esc(c.name)}</option>`
    ).join("");

  $("catalogProducts").innerHTML = state.products.length
    ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Producto</th><th>Precio</th><th>Estado</th><th>ID</th></tr></thead>
          <tbody>
          ${state.products.map(p => `
            <tr>
              <td>${esc(p.name)}</td>
              <td>$${Number(p.price || 0).toFixed(2)}</td>
              <td>${p.active ? "Activo" : "Inactivo"}</td>
              <td><code>${esc(p.id)}</code></td>
            </tr>
          `).join("")}
          </tbody>
        </table>
      </div>
    `
    : '<div class="muted">No hay productos.</div>';
}

async function saveCategory() {
  try {
    const localId = $("catalogLocal").value || state.locals[0]?.id;
    if (!localId) throw new Error("Selecciona un LOCAL.");

    await rpc("save_local_category", {
      p_local_id: localId,
      p_category_id: null,
      p_name: $("categoryName").value.trim(),
      p_description: $("categoryDescription").value.trim() || null,
      p_image_url: null,
      p_display_order: Number.parseInt($("categoryOrder").value, 10) || 0,
      p_active: true
    });

    message("Categoría creada.");
    $("categoryName").value = "";
    $("categoryDescription").value = "";
    await loadCatalog();
  } catch (e) {
    message(e.message || "No se pudo crear la categoría.", "error");
  }
}

async function saveProduct() {
  try {
    const localId = $("catalogLocal").value || state.locals[0]?.id;
    if (!localId) throw new Error("Selecciona un LOCAL.");

    await rpc("save_local_product", {
      p_local_id: localId,
      p_product_id: null,
      p_category_id: $("productCategory").value || null,
      p_name: $("productName").value.trim(),
      p_description: $("productDescription").value.trim() || null,
      p_price: Number($("productPrice").value),
      p_image_url: null,
      p_display_order: Number.parseInt($("productOrder").value, 10) || 0,
      p_active: true
    });

    message("Producto creado.");
    $("productName").value = "";
    $("productDescription").value = "";
    $("productPrice").value = "";
    await loadCatalog();
  } catch (e) {
    message(e.message || "No se pudo crear el producto.", "error");
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

    message("Gestión visual habilitada para el DELIVERY.");
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

    for (const capability of ["images.manage","local.info.manage","products.manage"]) {
      await rpc("master_set_local_capability", {
        p_local_id: localId,
        p_capability_code: capability,
        p_enabled: true
      });
    }

    message("Gestión visual habilitada para el LOCAL.");
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
  $("catalogLocal").onchange = loadCatalog;

  $("submitRequestBtn").onclick = submitRequest;
  $("requestType").onchange = updateRequestForm;
  $("requestDelivery").onchange = updateRequestForm;
  $("saveCityBtn").onclick = saveCity;
  $("saveDeliveryBtn").onclick = saveDelivery;
  $("saveCategoryBtn").onclick = saveCategory;
  $("saveProductBtn").onclick = saveProduct;

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
