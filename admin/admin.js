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
  promotions: [],
  productPhotoBatch: [],
  schedules: [],
  shareLocals: [],
  shareProducts: [],
  advertisements: [],
  advertisementDeliveries: [],
  advertisementLocals: [],
  advertisementProducts: [],
  menuImportJobs: [],
  menuImportJob: null,
  menuImportPreview: null
};

const roleSections = {
  MASTER: ["overview","share","orders","requests","deliveries","localsmaster","categoriesmaster","zonesmaster","users","fees","coverage","catalog","schedules","advertising","menuimport","analytics"],
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
  const masterLocalWorkspaceSections = new Set(["catalog","schedules","menuimport"]);

  document.querySelectorAll("#nav button").forEach(btn => {
    const hiddenInsideLocales = state.role === "MASTER" && masterLocalWorkspaceSections.has(btn.dataset.section);
    btn.classList.toggle("hidden", !allowed.has(btn.dataset.section) || hiddenInsideLocales);
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });

  document.querySelectorAll(".master-only").forEach(el => {
    el.classList.toggle("hidden", state.role !== "MASTER");
  });

  showSection(roleSections[state.role][0]);
}

function showSection(name) {
  if (typeof restoreLocalPanels === "function") restoreLocalPanels();
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
  if (name === "localsmaster") { bindMasterLocals(); loadMasterLocals(); }
  if (name === "categoriesmaster") loadMasterLocalBusinessCategories();
  if (name === "zonesmaster") loadMasterZones();
  if (name === "fees") loadFees();
  if (name === "coverage") loadCoverage();
  if (name === "catalog") loadCatalog();
  if (name === "schedules") loadSchedules();
  if (name === "storage") loadStorage();
  if (name === "advertising") loadAdvertising();
  if (name === "menuimport") loadMenuImport();
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

  if ($("scopeInfo")) {
    const deliveryCount = state.deliveries.length;
    const localCount = state.locals.length;
    if (state.role === "MASTER") {
      $("scopeInfo").textContent =
        "Vista global MASTER · " + deliveryCount + " DELIVERY · " + localCount + " LOCAL";
    } else if (["DELIVERY_ADMIN","DELIVERY_OPERATOR"].includes(state.role)) {
      $("scopeInfo").textContent =
        "Ámbito DELIVERY · " + deliveryCount + " asignado" + (deliveryCount === 1 ? "" : "s");
    } else if (state.role === "LOCAL_ADMIN") {
      $("scopeInfo").textContent =
        "Ámbito LOCAL · " + localCount + " asignado" + (localCount === 1 ? "" : "s");
    } else {
      $("scopeInfo").textContent = "Ámbito de operación actual";
    }
  }
}

async function refreshAll() {
  clearMessage();
  await Promise.all([
    loadOverview(),
    loadOrders(),
    loadRequests()
  ]);
}

async function overviewCount(table, configure = null) {
  try {
    let query = supabaseClient
      .from(table)
      .select("*", { count: "exact", head: true });
    if (configure) query = configure(query);
    const { count, error } = await query;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function overviewRows(table, columns, configure = null) {
  try {
    let query = supabaseClient.from(table).select(columns);
    if (configure) query = configure(query);
    const { data, error } = await query;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

function overviewPct(value, total) {
  if (!Number.isFinite(Number(value)) || !Number(total)) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(value) / Number(total)) * 100)));
}

function overviewMoney(value) {
  return "$" + Number(value || 0).toFixed(2);
}

function overviewFormatBytes(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const bytes = Math.max(0, Number(value));
  const units = ["B","KB","MB","GB","TB"];
  let n = bytes;
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024;
    unit++;
  }
  const decimals = unit <= 1 ? 0 : (n >= 100 ? 0 : n >= 10 ? 1 : 2);
  return n.toFixed(decimals) + " " + units[unit];
}

function overviewFormatDuration(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const ms = Math.max(0, Number(value));
  if (ms < 1000) return Math.round(ms) + " ms";
  return (ms / 1000).toFixed(ms >= 10000 ? 1 : 2).replace(/0+$/,"").replace(/\.$/,"") + " s";
}

function overviewLatencyStatus(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms)) return { label: "SIN DATO", percent: null };
  if (ms < 700) return { label: "EXCELENTE", percent: Math.min(35, ms / 20) };
  if (ms < 1000) return { label: "BUENA", percent: 55 };
  if (ms < 1800) return { label: "VIGILAR", percent: 75 };
  if (ms < 2500) return { label: "LENTA", percent: 92 };
  return { label: "CRÍTICA", percent: 100 };
}

function overviewResourceTone(percent) {
  if (!Number.isFinite(Number(percent))) return "resource-unknown";
  if (Number(percent) >= 90) return "resource-danger";
  if (Number(percent) >= 70) return "resource-watch";
  return "resource-ok";
}

function overviewResourceCard({label,value,percent,detail}) {
  const pct = Number.isFinite(Number(percent))
    ? Math.max(0, Math.min(100, Number(percent)))
    : null;
  return `
    <div class="overview-resource-card ${overviewResourceTone(pct)}">
      <span class="muted">${esc(label)}</span>
      <strong>${esc(value)}</strong>
      <div class="resource-meter"><span style="width:${pct === null ? 0 : pct}%"></span></div>
      <small>${esc(detail)}</small>
    </div>
  `;
}

function renderOverviewResources(data) {
  const container = $("overviewResources");
  const advice = $("overviewResourceAdvice");
  if (!container || !advice) return;

  const valueOrNull = value =>
    value === null || value === undefined || !Number.isFinite(Number(value))
      ? null
      : Number(value);

  const storagePct = valueOrNull(data?.storage_percent);
  const dbPct = valueOrNull(data?.database_percent);
  const connPct = valueOrNull(data?.connections_percent);
  const cacheHit = valueOrNull(data?.database_cache_hit_percent);
  const apiP95 = valueOrNull(data?.api_p95_ms);
  const apiErrorRate = valueOrNull(data?.api_error_rate_24h);
  const storageP95 = valueOrNull(data?.storage_p95_ms);
  const clientRpcMs = valueOrNull(data?.client_rpc_ms);
  const egressPct = valueOrNull(data?.egress_percent);
  const cachedPct = valueOrNull(data?.cached_egress_percent);
  const storageProjectionPct = valueOrNull(data?.storage_egress_projected_percent);
  const storage24hBytes = valueOrNull(data?.storage_egress_24h_bytes);
  const storageProjectionBytes = valueOrNull(data?.storage_egress_30d_projected_bytes);
  const readShare = valueOrNull(data?.api_read_share_percent);
  const readRequests = Number(data?.api_read_requests_24h || 0);
  const writeRequests = Number(data?.api_write_requests_24h || 0);
  const writeShare = readShare === null ? null : Math.max(0, 100 - readShare);

  const imageCount = Number(data?.image_objects || 0);
  const largeImages = Number(data?.large_images || 0);
  const heavyPct = imageCount > 0 ? (largeImages / imageCount) * 100 : 0;

  const syncedAt = data?.observability_synced_at ? new Date(data.observability_synced_at) : null;
  const syncAgeMinutes = syncedAt && !Number.isNaN(syncedAt.valueOf())
    ? Math.max(0, (Date.now() - syncedAt.getTime()) / 60000)
    : null;
  const snapshotFresh = Number.isFinite(syncAgeMinutes) && syncAgeMinutes <= 120;
  const syncLabel = syncedAt && !Number.isNaN(syncedAt.valueOf())
    ? syncedAt.toLocaleString()
    : "sin lectura";

  const apiLatency = overviewLatencyStatus(apiP95);
  const clientStress = clientRpcMs === null ? null : Math.min(100, clientRpcMs / 10);

  let bandwidthValue = "Pendiente";
  let bandwidthPercent = null;
  let bandwidthDetail = "Aún no hay lectura de tráfico.";
  if (egressPct !== null || cachedPct !== null) {
    bandwidthPercent = Math.max(...[egressPct,cachedPct].filter(Number.isFinite));
    bandwidthValue = overviewFormatBytes(data?.egress_used_bytes);
    bandwidthDetail =
      "Egress total de facturación · libre " + overviewFormatBytes(data?.egress_free_bytes) +
      " · cache usado " + overviewFormatBytes(data?.cached_egress_used_bytes) +
      " / " + overviewFormatBytes(data?.cached_egress_quota_bytes);
  } else if (storage24hBytes !== null) {
    bandwidthPercent = storageProjectionPct;
    bandwidthValue = overviewFormatBytes(storage24hBytes) + " / 24 h";
    bandwidthDetail =
      (snapshotFresh ? "Conectado" : "Datos atrasados") +
      " · " + Number(data?.storage_requests_24h || 0) + " descargas" +
      " · proyección Storage 30 días " + overviewFormatBytes(storageProjectionBytes) +
      " / " + overviewFormatBytes(data?.egress_quota_bytes) +
      " · actualizado " + syncLabel;
  }

  let scaleDecision = "NO COMPRAR NADA";
  let scaleDetail = "Los recursos actuales tienen margen suficiente.";
  let scalePercent = 20;

  const readReplicaCandidate =
    readShare !== null && readShare >= 80 &&
    connPct !== null && connPct >= 70 &&
    apiP95 !== null && apiP95 >= 1000;

  if ((storagePct !== null && storagePct >= 95) || (dbPct !== null && dbPct >= 95)) {
    scaleDecision = "AMPLIAR CAPACIDAD";
    scaleDetail = "Storage o base de datos están en nivel crítico.";
    scalePercent = 100;
  } else if (storageProjectionPct !== null && storageProjectionPct >= 95) {
    scaleDecision = "AMPLIAR PLAN / EGRESS";
    scaleDetail = "La proyección de tráfico de Storage está cerca o por encima de la cuota.";
    scalePercent = 100;
  } else if (readReplicaCandidate) {
    scaleDecision = "EVALUAR READ REPLICA";
    scaleDetail = "La carga es mayormente de lectura y ya existe presión de conexiones/latencia.";
    scalePercent = 90;
  } else if ((connPct !== null && connPct >= 85) ||
             (apiP95 !== null && apiP95 >= 1800 && connPct !== null && connPct >= 70)) {
    scaleDecision = "AMPLIAR COMPUTE";
    scaleDetail = "La base está bajo presión suficiente como para justificar más capacidad de servidor.";
    scalePercent = 90;
  } else if ((storagePct !== null && storagePct >= 85) || (dbPct !== null && dbPct >= 85)) {
    scaleDecision = "PREPARAR AMPLIACIÓN";
    scaleDetail = "La capacidad disponible está entrando en zona alta.";
    scalePercent = 85;
  } else if (storageProjectionPct !== null && storageProjectionPct >= 85) {
    scaleDecision = "PREPARAR MÁS EGRESS";
    scaleDetail = "La tendencia de tráfico está acercándose a la cuota mensual.";
    scalePercent = 85;
  } else if ((apiP95 !== null && apiP95 >= 1000) || largeImages > 0) {
    scaleDecision = "OPTIMIZAR PRIMERO";
    scaleDetail = "Hay margen de infraestructura; conviene optimizar antes de comprar más capacidad.";
    scalePercent = 75;
  }

  const workloadLabel = readShare === null
    ? "SIN DATOS"
    : (readShare >= 80 ? "MUY ORIENTADA A LECTURAS" :
       readShare >= 65 ? "MAYORMENTE LECTURAS" :
       readShare <= 35 ? "MAYORMENTE ESCRITURAS" :
       "MIXTA");

  container.innerHTML = [
    overviewResourceCard({
      label: "Diagnóstico de capacidad",
      value: scaleDecision,
      percent: scalePercent,
      detail: scaleDetail
    }),
    overviewResourceCard({
      label: "Patrón de carga API",
      value: workloadLabel,
      percent: readShare,
      detail: (readShare === null
        ? "Lecturas/escrituras sin sincronizar"
        : readShare.toFixed(1) + "% lecturas · " + writeShare.toFixed(1) + "% escrituras") +
        " · " + readRequests + " lecturas · " + writeRequests + " escrituras / 24 h"
    }),
    overviewResourceCard({
      label: "Storage usado",
      value: overviewFormatBytes(data?.storage_bytes),
      percent: storagePct,
      detail: storagePct === null
        ? "Uso live de archivos"
        : storagePct.toFixed(1) + "% de " + overviewFormatBytes(data?.storage_quota_bytes) +
          " · " + Number(data?.storage_objects || 0) + " archivos"
    }),
    overviewResourceCard({
      label: "Base de datos",
      value: overviewFormatBytes(data?.database_bytes),
      percent: dbPct,
      detail: (dbPct === null ? "Uso live de Postgres" : dbPct.toFixed(1) + "% de " + overviewFormatBytes(data?.database_quota_bytes)) +
        " · cache hit " + (cacheHit === null ? "—" : cacheHit.toFixed(2) + "%")
    }),
    overviewResourceCard({
      label: "Conexiones de base de datos",
      value: String(Number(data?.connections_current || 0)) + " / " + String(Number(data?.connections_max || 0)),
      percent: connPct,
      detail: Number(data?.active_queries || 0) + " activas · " +
        Number(data?.long_queries || 0) + " consultas > 2 s"
    }),
    overviewResourceCard({
      label: "Velocidad API",
      value: overviewFormatDuration(apiP95) + (apiLatency.label ? " · " + apiLatency.label : ""),
      percent: apiLatency.percent,
      detail: "p95 · " + Number(data?.api_requests_24h || 0) + " solicitudes / 24 h · " +
        (apiErrorRate === null ? "errores —" : apiErrorRate.toFixed(2) + "% errores 5xx") +
        " · la barra indica velocidad, no una cuota · actualizado " + syncLabel
    }),
    overviewResourceCard({
      label: "Ancho de banda / egress",
      value: bandwidthValue,
      percent: bandwidthPercent,
      detail: bandwidthDetail
    }),
    overviewResourceCard({
      label: "Respuesta de Storage p95",
      value: overviewFormatDuration(storageP95),
      percent: storageP95 === null ? null : Math.min(100, storageP95 / 12),
      detail: Number(data?.storage_requests_24h || 0) + " solicitudes / 24 h"
    }),
    overviewResourceCard({
      label: "Conexión actual del panel",
      value: overviewFormatDuration(clientRpcMs),
      percent: clientStress,
      detail: "Tiempo real de esta consulta desde tu navegador hasta Supabase"
    }),
    overviewResourceCard({
      label: "Imágenes pesadas > 1 MB",
      value: String(largeImages),
      percent: heavyPct,
      detail: imageCount + " imágenes · mayor " + overviewFormatBytes(data?.largest_image_bytes)
    })
  ].join("");

  const recommendations = [];
  if (storagePct !== null && storagePct >= 85) {
    recommendations.push("Storage está alto; libera/comprime archivos o prepara ampliación de capacidad.");
  } else if (storagePct !== null && storagePct >= 70) {
    recommendations.push("Storage en vigilancia; revisa el crecimiento semanal.");
  }

  if (dbPct !== null && dbPct >= 85) {
    recommendations.push("La base de datos está cerca de su cuota; prepara ampliación o limpieza.");
  }

  if (connPct !== null && connPct >= 85) {
    recommendations.push("Conexiones de base de datos altas; revisa pooling y considera más compute si se mantiene.");
  } else if (connPct !== null && connPct >= 70) {
    recommendations.push("Conexiones de base de datos en vigilancia.");
  }

  if (apiP95 !== null && apiP95 >= 1800) {
    if ((connPct === null || connPct < 70) && (cacheHit === null || cacheHit >= 98)) {
      recommendations.push("La API está lenta, pero la base aún tiene margen: optimiza consultas, payloads e imágenes antes de comprar más servidor.");
    } else {
      recommendations.push("Latencia API alta junto con presión de base; si persiste, considera ampliar compute.");
    }
  } else if (apiP95 !== null && apiP95 >= 1000) {
    recommendations.push("Latencia API en vigilancia; revisa consultas y respuestas grandes antes de escalar servidor.");
  }

  if (apiErrorRate !== null && apiErrorRate >= 2) {
    recommendations.push("La tasa de errores 5xx requiere revisión antes de ampliar capacidad.");
  }

  if (storageProjectionPct !== null && storageProjectionPct >= 95) {
    recommendations.push("La proyección de tráfico de Storage está crítica frente a la cuota; amplía plan o reduce egress.");
  } else if (storageProjectionPct !== null && storageProjectionPct >= 85) {
    recommendations.push("La proyección de tráfico de Storage es alta; prepara ampliación de ancho de banda/plan.");
  } else if (storageProjectionPct !== null && storageProjectionPct >= 70) {
    recommendations.push("El tráfico de Storage está en vigilancia; observa la tendencia antes de ampliar.");
  }

  if (clientRpcMs !== null && clientRpcMs >= 1200) {
    recommendations.push("La conexión actual desde tu navegador está lenta; confirma si se repite antes de atribuirlo al servidor.");
  }

  if (largeImages > 0) {
    recommendations.push("Hay " + largeImages + " imágenes de más de 1 MB; comprimirlas mejora velocidad y reduce egress.");
  }

  if (!snapshotFresh && storage24hBytes !== null) {
    recommendations.push("La lectura de observabilidad tiene más de 2 horas; el monitor horario debe actualizarla.");
  }

  if (readReplicaCandidate) {
    recommendations.push("La carga ya cumple el patrón para evaluar una Read Replica: mayoría clara de lecturas junto con presión de conexiones y latencia.");
  } else if (readShare !== null && readShare >= 80) {
    recommendations.push("La carga es muy orientada a lecturas, pero todavía no hay presión suficiente para justificar una Read Replica.");
  }

  if (!recommendations.length) {
    recommendations.push("Capacidad y rendimiento con margen. No hace falta ampliar servidor, Storage ni ancho de banda por ahora.");
  }

  advice.innerHTML =
    "<strong>Recomendación:</strong> " + esc(recommendations.join(" ")) +
    '<div class="muted" style="margin-top:5px">' +
      "Plan " + esc(data?.plan_code || "—") +
      " · Capacidad: vigilar 70%, preparar 85%, crítico 95%" +
      " · Compute: vigilar conexiones ≥70%" +
      " · API: revisar p95 ≥1 s; escalar solo si además hay presión de recursos." +
    "</div>";

  if ($("overviewResourcePlan")) $("overviewResourcePlan").value = data?.plan_code || "FREE";
  if ($("overviewEgressUsed")) {
    $("overviewEgressUsed").value = data?.egress_used_bytes == null
      ? ""
      : (Number(data.egress_used_bytes) / 1073741824).toFixed(3).replace(/0+$/,"").replace(/\.$/,"");
  }
  if ($("overviewCachedEgressUsed")) {
    $("overviewCachedEgressUsed").value = data?.cached_egress_used_bytes == null
      ? ""
      : (Number(data.cached_egress_used_bytes) / 1073741824).toFixed(3).replace(/0+$/,"").replace(/\.$/,"");
  }
}

async function loadOverviewResources() {
  if (state.role !== "MASTER") return;
  const container = $("overviewResources");
  if (!container) return;

  try {
    const started = performance.now();
    const data = await rpc("master_resource_usage_summary");
    const clientRpcMs = Math.round(performance.now() - started);
    state.resourceUsage = { ...(data || {}), client_rpc_ms: clientRpcMs };
    renderOverviewResources(state.resourceUsage);
  } catch (e) {
    container.innerHTML =
      '<div class="message error" style="grid-column:1/-1">No se pudieron calcular los recursos: ' +
      esc(e.message || e) + '</div>';
    if ($("overviewResourceAdvice")) {
      $("overviewResourceAdvice").textContent = "No se pudo consultar la salud de HTPWEB. Revisa la conexión con Supabase.";
    }
  }
}

async function saveOverviewResourceSettings() {
  if (state.role !== "MASTER") return;
  const plan = $("overviewResourcePlan")?.value || "FREE";
  const parseOptional = id => {
    const raw = $(id)?.value.trim() || "";
    if (!raw) return null;
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) throw new Error("Escribe un valor válido en GB.");
    return n;
  };

  const button = $("saveOverviewResourceSettingsBtn");
  if (button) button.disabled = true;
  try {
    const data = await rpc("master_save_resource_usage_settings", {
      p_plan_code: plan,
      p_egress_used_gb: parseOptional("overviewEgressUsed"),
      p_cached_egress_used_gb: parseOptional("overviewCachedEgressUsed")
    });
    state.resourceUsage = data || null;
    renderOverviewResources(data || {});
    $("overviewResourceSettings")?.classList.add("hidden");
    message("Referencia de capacidad actualizada.");
  } catch (e) {
    message(e.message || "No se pudo guardar la referencia de recursos.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function bindOverviewResourceActions() {
  const open = $("overviewResourceSettingsBtn");
  const panel = $("overviewResourceSettings");
  const close = $("cancelOverviewResourceSettingsBtn");
  const save = $("saveOverviewResourceSettingsBtn");

  const refresh = $("overviewResourceRefreshBtn");

  if (open && panel) open.onclick = () => panel.classList.toggle("hidden");
  if (close && panel) close.onclick = () => panel.classList.add("hidden");
  if (save) save.onclick = () => { void saveOverviewResourceSettings(); };
  if (refresh) refresh.onclick = () => { void loadOverviewResources(); };
}

function overviewStatusLabel(status) {
  const labels = {
    PENDING: "Pendiente",
    CONFIRMED: "Confirmado",
    PREPARING: "Preparando",
    READY: "Listo",
    EN_ROUTE: "En ruta",
    DELIVERED: "Entregado",
    CANCELLED: "Cancelado"
  };
  return labels[status] || status || "—";
}

async function overviewOpenProductIssue(issue) {
  try {
    let query = supabaseClient
      .from("products")
      .select("id,local_id,name,sku,active,image_url")
      .order("name")
      .limit(1);

    if (issue === "inactive") {
      query = query.eq("active", false);
    } else if (issue === "without-image") {
      query = query.or("image_url.is.null,image_url.eq.");
    } else {
      throw new Error("Tipo de revisión de producto no reconocido.");
    }

    const { data, error } = await query;
    if (error) throw error;

    const product = data?.[0] || null;
    if (!product) {
      message("Ese pendiente ya no existe. Actualiza el resumen.");
      await loadOverview();
      return;
    }

    // El catálogo necesita primero el LOCAL correcto. No enviamos al usuario
    // al listado de LOCAL: seleccionamos el establecimiento y abrimos el
    // producto exacto que originó la alerta.
    showSection("catalog");

    const select = $("catalogLocal");
    if (!select) throw new Error("No se encontró el selector de LOCAL del catálogo.");

    if (![...select.options].some(option => option.value === product.local_id)) {
      await loadScopes();
    }

    select.value = product.local_id;
    await loadCatalog();

    const loaded = state.products.find(row => row.id === product.id);
    if (!loaded) {
      throw new Error("El producto existe, pero no se pudo abrir dentro de su catálogo.");
    }

    editProduct(product.id);

    setTimeout(() => {
      $("productFormTitle")?.scrollIntoView({ behavior: "smooth", block: "start" });
      $("productName")?.focus();
    }, 60);

    message(
      (issue === "inactive" ? "Producto inactivo" : "Producto sin foto") +
      ': "' + (product.name || product.sku || product.id) + '".'
    );
  } catch (e) {
    message(e.message || "No se pudo abrir el producto pendiente.", "error");
  }
}

async function overviewGo(action) {
  if (action === "orders") {
    showSection("orders");
    return;
  }
  if (action === "requests") {
    showSection("requests");
    return;
  }
  if (action === "advertising") {
    showSection("advertising");
    return;
  }
  if (action === "zones") {
    showSection("zonesmaster");
    return;
  }
  if (action === "locals") {
    showSection("localsmaster");
    return;
  }
  if (action === "products-inactive") {
    await overviewOpenProductIssue("inactive");
    return;
  }
  if (action === "products-without-image") {
    await overviewOpenProductIssue("without-image");
    return;
  }
  if (action === "new-local") {
    showSection("localsmaster");
    setTimeout(() => $("masterLocalNewBtn")?.click(), 40);
    return;
  }
  if (action === "package") {
    showSection("localsmaster");
    setTimeout(() => {
      $("masterLocalBulkBtn")?.click();
      setTimeout(() => $("completePackageFile")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    }, 40);
  }
}

function bindOverviewActions() {
  document.querySelectorAll("[data-overview-action]").forEach(button => {
    button.onclick = () => { void overviewGo(button.dataset.overviewAction); };
  });
  if ($("overviewGoOrdersBtn")) $("overviewGoOrdersBtn").onclick = () => { void overviewGo("orders"); };
  bindOverviewResourceActions();
}

function renderOverviewAttention(items) {
  const container = $("overviewAttention");
  if (!container) return;

  const relevant = items.filter(item => item.value === null || Number(item.value) > 0);
  if (!relevant.length) {
    container.innerHTML = `
      <div class="overview-all-good">
        <strong>Sin pendientes críticos</strong>
        <span>Los controles principales no muestran elementos que requieran atención.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = relevant.map(item => `
    <div class="overview-attention-row">
      <div>
        <strong>${esc(item.label)}</strong>
        <span class="muted">${esc(item.detail)}</span>
      </div>
      <div class="row">
        <span class="overview-attention-value">${item.value === null ? "—" : esc(item.value)}</span>
        ${item.action ? `<button class="btn-muted" type="button" data-overview-action="${esc(item.action)}">Revisar</button>` : ""}
      </div>
    </div>
  `).join("");
}

function renderOverviewHealth(items) {
  const container = $("overviewHealth");
  if (!container) return;

  container.innerHTML = items.map(item => {
    const pct = overviewPct(item.value, item.total);
    return `
      <div class="overview-health-row">
        <div class="row between">
          <strong>${esc(item.label)}</strong>
          <span>${item.value === null || item.total === null ? "—" : esc(item.value + " / " + item.total)} · ${pct}%</span>
        </div>
        <div class="overview-progress"><span style="width:${pct}%"></span></div>
        <small class="muted">${esc(item.detail)}</small>
      </div>
    `;
  }).join("");
}

function renderOverviewRecentOrders(rows) {
  const container = $("overviewActivity");
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = `
      <div class="overview-empty">
        <strong>Aún no hay pedidos recientes</strong>
        <span>Cuando entren pedidos aparecerán aquí con estado, cliente y total.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = rows.map(order => `
    <div class="overview-order-row">
      <div>
        <strong>${esc(order.customer_name || "Cliente")}</strong>
        <span class="muted">${esc(new Date(order.created_at).toLocaleString())}</span>
      </div>
      <div class="overview-order-meta">
        <span class="badge status-${esc(order.status)}">${esc(overviewStatusLabel(order.status))}</span>
        <strong>${esc(overviewMoney(order.total))}</strong>
      </div>
    </div>
  `).join("");
}

function renderOverviewQuickActions() {
  const container = $("overviewQuickActions");
  if (!container) return;

  const masterActions = [
    ["package","Importar paquete completo","Productos + fotos + promociones en un ZIP"],
    ["new-local","Crear LOCAL","Alta manual de un establecimiento"],
    ["orders","Revisar pedidos","Operación y estados de pedidos"],
    ["advertising","Publicidad","Campañas y espacios publicitarios"],
    ["zones","Zonas","Cobertura geográfica de HTPWEB"]
  ];

  const generalActions = state.role === "MASTER"
    ? masterActions
    : [
        ["orders","Revisar pedidos","Operación visible para tu cuenta"],
        ["locals","Gestionar catálogo","Productos y contenido de tus LOCAL"]
      ];

  container.innerHTML = generalActions.map(([action,label,detail]) => `
    <button class="overview-action-card" type="button" data-overview-action="${esc(action)}">
      <strong>${esc(label)}</strong>
      <span>${esc(detail)}</span>
    </button>
  `).join("");
}

async function loadOverview() {
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayIso = today.toISOString();

  const openStatuses = ["PENDING","CONFIRMED","PREPARING","READY","EN_ROUTE"];

  let ordersToday = null;
  let recentOrders = [];
  let openOrders = null;
  let localsTotal = null;
  let localsActive = null;
  let productsTotal = null;
  let productsActive = null;
  let productsWithImage = null;
  let deliveriesTotal = null;
  let deliveriesActive = null;
  let pendingRequests = null;
  let customersTotal = null;
  let activePromotions = null;
  let deliveredTodayCount = 0;
  let deliveredValue = 0;
  let masterSnapshotLoaded = false;

  // MASTER usa un solo snapshot del servidor para evitar múltiples HEAD COUNT
  // sobre tablas con RLS. Esto elimina especialmente tres conteos completos
  // de products que eran el principal cuello de botella del dashboard.
  if (state.role === "MASTER") {
    try {
      const started = performance.now();
      const snapshot = await rpc("master_overview_snapshot", {
        p_today_start: todayIso
      });
      const clientRpcMs = Math.round(performance.now() - started);

      ordersToday = Number(snapshot?.orders_today ?? 0);
      deliveredTodayCount = Number(snapshot?.delivered_today_count ?? 0);
      deliveredValue = Number(snapshot?.delivered_today_value ?? 0);
      recentOrders = Array.isArray(snapshot?.recent_orders) ? snapshot.recent_orders : [];
      openOrders = Number(snapshot?.open_orders ?? 0);
      localsTotal = Number(snapshot?.locals_total ?? 0);
      localsActive = Number(snapshot?.locals_active ?? 0);
      productsTotal = Number(snapshot?.products_total ?? 0);
      productsActive = Number(snapshot?.products_active ?? 0);
      productsWithImage = Number(snapshot?.products_with_image ?? 0);
      deliveriesTotal = Number(snapshot?.deliveries_total ?? 0);
      deliveriesActive = Number(snapshot?.deliveries_active ?? 0);
      pendingRequests = Number(snapshot?.pending_requests ?? 0);
      customersTotal = Number(snapshot?.customers_total ?? 0);
      activePromotions = Number(snapshot?.active_promotions ?? 0);

      state.resourceUsage = {
        ...(snapshot?.resource || {}),
        client_rpc_ms: clientRpcMs
      };
      renderOverviewResources(state.resourceUsage);
      masterSnapshotLoaded = true;
    } catch (e) {
      console.warn("Snapshot MASTER optimizado no disponible; usando consultas compatibles.", e);
    }
  }

  // Fallback y roles no MASTER: conserva el comportamiento anterior.
  if (!masterSnapshotLoaded) {
    let deliveredToday = [];
    [
      ordersToday,
      deliveredToday,
      recentOrders,
      openOrders,
      localsTotal,
      localsActive,
      productsTotal,
      productsActive,
      productsWithImage,
      deliveriesTotal,
      deliveriesActive,
      pendingRequests,
      customersTotal,
      activePromotions
    ] = await Promise.all([
      overviewCount("orders", q => q.gte("created_at", todayIso)),
      overviewRows("orders", "id,total,status,created_at", q =>
        q.gte("created_at", todayIso).eq("status", "DELIVERED").limit(1000)
      ),
      overviewRows("orders", "id,status,total,customer_name,created_at", q =>
        q.order("created_at", { ascending: false }).limit(5)
      ),
      overviewCount("orders", q => q.in("status", openStatuses)),
      overviewCount("locals"),
      overviewCount("locals", q => q.eq("active", true)),
      overviewCount("products"),
      overviewCount("products", q => q.eq("active", true)),
      overviewCount("products", q => q.not("image_url", "is", null).neq("image_url", "")),
      overviewCount("deliveries"),
      overviewCount("deliveries", q => q.eq("active", true)),
      overviewCount("local_requests", q => q.in("status", ["PENDING","NEEDS_INFO"])),
      overviewCount("customers"),
      overviewCount("local_promotions", q => q.eq("active", true))
    ]);

    deliveredTodayCount = deliveredToday.length;
    deliveredValue = deliveredToday.reduce((sum, order) => sum + Number(order.total || 0), 0);
  }

  const inactiveLocals = localsTotal === null || localsActive === null ? null : Math.max(0, localsTotal - localsActive);
  const inactiveProducts = productsTotal === null || productsActive === null ? null : Math.max(0, productsTotal - productsActive);
  const productsWithoutImage = productsTotal === null || productsWithImage === null ? null : Math.max(0, productsTotal - productsWithImage);

  const kpis = [
    {
      label: "Pedidos hoy",
      value: ordersToday === null ? "—" : ordersToday,
      detail: openOrders === null ? "Pedidos recibidos hoy" : openOrders + " abiertos ahora",
      tone: openOrders > 0 ? "attention" : "neutral"
    },
    {
      label: "Ventas entregadas hoy",
      value: overviewMoney(deliveredValue),
      detail: deliveredTodayCount + " pedido" + (deliveredTodayCount === 1 ? "" : "s") + " entregado" + (deliveredTodayCount === 1 ? "" : "s"),
      tone: "success"
    },
    {
      label: "Locales publicados",
      value: localsActive === null ? "—" : localsActive,
      detail: localsTotal === null ? "Total no disponible" : "de " + localsTotal + " locales",
      tone: inactiveLocals > 0 ? "attention" : "success"
    },
    {
      label: "Productos publicados",
      value: productsActive === null ? "—" : productsActive,
      detail: productsTotal === null ? "Total no disponible" : "de " + productsTotal + " productos",
      tone: productsWithoutImage > 0 ? "attention" : "success"
    }
  ];

  if ($("metrics")) {
    $("metrics").innerHTML = kpis.map(kpi => `
      <div class="overview-kpi overview-kpi-${esc(kpi.tone)}">
        <span>${esc(kpi.label)}</span>
        <strong>${esc(kpi.value)}</strong>
        <small>${esc(kpi.detail)}</small>
      </div>
    `).join("");
  }

  renderOverviewAttention([
    {
      label: "Pedidos abiertos",
      detail: "Pedidos que todavía no están entregados ni cancelados.",
      value: openOrders,
      action: "orders"
    },
    {
      label: "Solicitudes pendientes",
      detail: "Solicitudes de LOCAL que esperan revisión o información.",
      value: pendingRequests,
      action: "requests"
    },
    {
      label: "Locales inactivos",
      detail: "Establecimientos cargados pero aún no publicados.",
      value: inactiveLocals,
      action: "locals"
    },
    {
      label: "Productos sin foto",
      detail: "Productos que reducen la calidad visual del catálogo.",
      value: productsWithoutImage,
      action: "products-without-image"
    },
    {
      label: "Productos inactivos",
      detail: "Productos existentes que no están publicados.",
      value: inactiveProducts,
      action: "products-inactive"
    }
  ]);

  renderOverviewHealth([
    {
      label: "Productos con foto",
      value: productsWithImage,
      total: productsTotal,
      detail: "Cobertura visual del catálogo."
    },
    {
      label: "Locales activos",
      value: localsActive,
      total: localsTotal,
      detail: "LOCAL actualmente visibles para clientes."
    },
    {
      label: "DELIVERY activos",
      value: deliveriesActive,
      total: deliveriesTotal,
      detail: "Operadores de entrega habilitados."
    }
  ]);

  renderOverviewRecentOrders(recentOrders);
  renderOverviewQuickActions();

  if ($("overviewUpdatedAt")) {
    const extras = [
      customersTotal === null ? null : customersTotal + " clientes",
      activePromotions === null ? null : activePromotions + " promociones activas"
    ].filter(Boolean).join(" · ");
    $("overviewUpdatedAt").textContent =
      "Actualizado " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
      (extras ? " · " + extras : "");
  }

  if (!masterSnapshotLoaded) {
    await loadOverviewResources();
  }
  bindOverviewActions();
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

  const text = encodeURIComponent(`${payload.text}
${payload.url}`);
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
      ? '<div class="muted">No existen zonas activas. Créala en el catálogo de zonas.</div>'
      : '<div class="muted">HTPWEB todavía no ha creado zonas activas.</div>';
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
              <td><strong>${esc(zone.code || "")} — ${esc(zone.name)}</strong>${zone.city_name ? `<div class="muted">Referencia: ${esc(zone.city_name)}${zone.province ? " · "+esc(zone.province) : ""}</div>` : ""}</td>
              <td>${zone.assigned ? "Asignada" : "Disponible"}</td>
              <td>
                <button
                  class="${zone.assigned ? "btn-danger" : "btn-primary"}"
                  onclick="toggleDeliveryZone('${zone.id}', ${zone.assigned ? "false" : "true"})"
                  ${canAssign ? "" : "disabled"}
                >
                  ${zone.assigned ? (state.role === "MASTER" ? "Quitar cobertura" : "Aprobada") : (state.role === "MASTER" ? "Aprobar cobertura" : "Solicitar cobertura")}
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
    if (state.role !== "MASTER") {
      if (!active) throw new Error("Solicita al MASTER la suspensión de esta zona.");
      await rpc("request_delivery_zone", {p_delivery_id: delivery.id, p_zone_id: zoneId});
      message("Solicitud enviada. El MASTER debe aprobar la zona antes de habilitar sus locales.");
      return;
    }
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

  const copyTools = `
    <div class="row between" style="margin-bottom:14px;gap:12px;flex-wrap:wrap">
      <div>
        <strong>Aplicar el horario del lunes</strong>
        <div class="muted">Copia apertura, cierre o estado Cerrado a toda la semana. Puedes ajustar un día antes de guardar.</div>
      </div>
      <button type="button" class="btn-muted" onclick="copyMondayScheduleToAll()">Copiar horario del lunes a todos los días</button>
    </div>
  `;

  container.innerHTML = copyTools + scheduleDayNames.map((dayName, day) => {
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

function copyMondayScheduleToAll() {
  const monday = 1;
  const closed = $("scheduleClosed" + monday).checked;
  const opening = $("scheduleOpen" + monday).value || "";
  const closing = $("scheduleClose" + monday).value || "";

  if (!closed) {
    if (!opening || !closing) {
      return message("Completa primero la hora de apertura y cierre del lunes.", "error");
    }
    if (opening >= closing) {
      return message("El lunes: la apertura debe ser anterior al cierre.", "error");
    }
  }

  scheduleDayNames.forEach((_, day) => {
    $("scheduleClosed" + day).checked = closed;
    $("scheduleOpen" + day).value = closed ? "" : opening;
    $("scheduleClose" + day).value = closed ? "" : closing;
    toggleScheduleDay(day);
  });

  message("Horario del lunes copiado a todos los días. Ajusta cualquier día que necesites y pulsa Guardar semana completa.");
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

    if (typeof clearGoogleScheduleDraftForLocal === "function") {
      clearGoogleScheduleDraftForLocal(localId);
    }
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
  if ($("catalogProductImageFile")) $("catalogProductImageFile").value = "";
  if ($("catalogProductImagePreview")) setPreview("catalogProductImagePreview", "");
  if ($("catalogDeleteProductImageBtn")) $("catalogDeleteProductImageBtn").disabled = true;
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

  const masterBulk = state.role === "MASTER";
  container.innerHTML = `
    ${masterBulk ? `
      <div class="row between" style="gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <label class="row" style="margin:0">
          <input id="catalogSelectAllProducts" type="checkbox" style="width:auto">
          Seleccionar todos
        </label>
        <div class="row">
          <button id="catalogActivateSelectedBtn" class="btn-primary" type="button" disabled>Activar seleccionados</button>
          <button id="catalogDeactivateSelectedBtn" class="btn-warn" type="button" disabled>Inactivar seleccionados</button>
          <button id="catalogDeleteSelectedBtn" class="btn-danger" type="button" disabled>Eliminar seleccionados</button>
          <button id="catalogCleanBtn" class="btn-danger" type="button">Limpiar catálogo</button>
        </div>
      </div>` : ""}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${masterBulk ? "<th></th>" : ""}
            <th>Imagen</th>
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
              ${masterBulk ? `<td><input class="catalog-product-bulk-check" type="checkbox" value="${esc(product.id)}" style="width:auto"></td>` : ""}
              <td>${product.image_url
                ? `<img class="product-thumb" src="${esc(product.image_url)}" alt="">`
                : '<span class="muted">Sin imagen</span>'}</td>
              <td>
                <strong>${esc(product.name)}</strong>
                ${product.sku ? `<div class="muted">SKU: ${esc(product.sku)}</div>` : ""}
                ${product.description ? `<div class="muted">${esc(product.description)}</div>` : ""}
              </td>
              <td>${esc(catalogCategoryName(product.category_id))}</td>
              <td>$${Number(product.price || 0).toFixed(2)}</td>
              <td>${esc(product.display_order ?? 0)}</td>
              <td>${product.active ? "Activo" : "Inactivo"}</td>
              <td>
                <div class="row">
                  <button class="btn-muted" onclick="editProduct('${product.id}')">Editar</button>
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

  if (masterBulk) {
    const checks = [...container.querySelectorAll(".catalog-product-bulk-check")];
    const selectAll = $("catalogSelectAllProducts");
    const activate = $("catalogActivateSelectedBtn");
    const deactivate = $("catalogDeactivateSelectedBtn");
    const refresh = () => {
      const selected = checks.filter(check => check.checked);
      activate.disabled = selected.length === 0;
      deactivate.disabled = selected.length === 0;
      selectAll.checked = checks.length > 0 && selected.length === checks.length;
      selectAll.indeterminate = selected.length > 0 && selected.length < checks.length;
    };
    selectAll.onchange = () => {
      checks.forEach(check => { check.checked = selectAll.checked; });
      refresh();
    };
    checks.forEach(check => { check.onchange = refresh; });
    activate.onclick = () => bulkSetCatalogProductsActive(true);
    deactivate.onclick = () => bulkSetCatalogProductsActive(false);
    refresh();
  }
}

async function bulkSetCatalogProductsActive(active) {
  if (state.role !== "MASTER") return;
  const selected = [...document.querySelectorAll(".catalog-product-bulk-check:checked")]
    .map(check => check.value)
    .filter(Boolean);
  if (!selected.length) return message("Selecciona al menos un producto.", "error");

  const ids = selected.filter(id => {
    const product = state.products.find(item => item.id === id);
    return product && Boolean(product.active) !== Boolean(active);
  });

  if (!ids.length) {
    return message(active
      ? "Los productos seleccionados ya están activos."
      : "Los productos seleccionados ya están inactivos.");
  }

  const action = active ? "activar" : "inactivar";
  if (!confirm(`¿Deseas ${action} ${ids.length} productos seleccionados?`)) return;

  try {
    const result = await rpc("master_set_products_active", {
      p_product_ids: ids,
      p_active: active
    });
    await loadCatalog();
    message(`${result?.updated || ids.length} productos ${active ? "activados" : "inactivados"} correctamente.`);
  } catch (e) {
    message(e.message || `No se pudieron ${action} los productos.`, "error");
  }
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
      .select("id,local_id,category_id,name,sku,description,price,image_url,display_order,active")
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
  if ($("catalogProductImageFile")) $("catalogProductImageFile").value = "";
  if ($("catalogProductImagePreview")) setPreview("catalogProductImagePreview", product.image_url || "");
  if ($("catalogDeleteProductImageBtn")) $("catalogDeleteProductImageBtn").disabled = !product.image_url;
  $("productName").focus();
}

async function saveProduct() {
  try {
    const localId = selectedCatalogLocalId();
    const productId = $("productId").value || null;
    const name = $("productName").value.trim();
    const priceRaw = $("productPrice").value.trim();
    const orderRaw = $("productOrder").value.trim();
    const imageFile = $("catalogProductImageFile")?.files?.[0] || null;

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

    const saved = await rpc("save_local_product", {
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

    let savedId = typeof saved === "string" ? saved : (saved?.id || productId);
    if (!savedId) {
      const lookup = await supabaseClient
        .from("products")
        .select("id,local_id,category_id,name,description,price,image_url,display_order,active")
        .eq("local_id", localId)
        .eq("name", name)
        .limit(1);
      if (lookup.error) throw lookup.error;
      savedId = lookup.data?.[0]?.id || null;
    }

    if (imageFile) {
      if (!savedId) throw new Error("El producto se guardó, pero no se pudo identificar para subir su imagen.");
      const productForImage = {
        id: savedId,
        local_id: localId,
        category_id: $("productCategory").value || null,
        name,
        description: $("productDescription").value.trim() || null,
        price,
        image_url: current?.image_url || null,
        display_order: displayOrder,
        active: $("productActive").value === "true"
      };
      const previousPath = pathDesdePublicUrlHTPWEB(productForImage.image_url);
      let uploaded = null;
      try {
        uploaded = await subirImagenHTPWEB(mediaPathProduct(savedId), imageFile);
        await saveProductImageUrl(productForImage, uploaded.url);
        if (previousPath && previousPath !== uploaded.path) {
          await eliminarObjetoMediaHTPWEB(previousPath).catch(() => {});
        }
      } catch (imageError) {
        if (uploaded && previousPath !== uploaded.path) {
          await eliminarObjetoMediaHTPWEB(uploaded.path).catch(() => {});
        }
        throw new Error("El producto fue guardado, pero su imagen no pudo subirse: " + (imageError.message || imageError));
      }
    }

    message(productId ? "Producto actualizado." : "Producto creado.");
    clearProductForm();
    await loadCatalog();
  } catch (e) {
    message(e.message || "No se pudo guardar el producto.", "error");
  }
}

async function deleteCatalogProductImage() {
  const productId = $("productId")?.value || null;
  const product = state.products.find(item => item.id === productId);
  if (!product) return message("Edita primero el producto cuya imagen deseas eliminar.", "error");
  if (!product.image_url) return message("Este producto no tiene imagen.", "error");
  if (!confirm("¿Eliminar la imagen actual de este producto?")) return;

  const oldPath = pathDesdePublicUrlHTPWEB(product.image_url) || mediaPathProduct(product.id);
  try {
    await saveProductImageUrl(product, null);
    await eliminarObjetoMediaHTPWEB(oldPath).catch(() => {});
    product.image_url = null;
    setPreview("catalogProductImagePreview", "");
    $("catalogDeleteProductImageBtn").disabled = true;
    message("Imagen del producto eliminada.");
    await loadCatalog();
  } catch (e) {
    message(e.message || "No se pudo eliminar la imagen del producto.", "error");
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
    await refreshLocalGallery();
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

async function refreshLocalGallery() {
  const grid = $("localGalleryGrid");
  const localId = $("storageLocal")?.value || null;
  if (!grid) return;
  if (!localId) {
    grid.innerHTML = '<div class="muted">Selecciona un LOCAL.</div>';
    return;
  }
  try {
    const items = await rpc("list_local_gallery", { p_local_id: localId });
    const gallery = Array.isArray(items) ? items : [];
    grid.innerHTML = gallery.length ? gallery.map(item => `
      <div class="local-gallery-item">
        <img src="${esc(item.image_url)}" alt="">
        <button class="btn-danger" type="button" onclick="deleteLocalGalleryImage('${item.id}')">Eliminar</button>
      </div>
    `).join("") : '<div class="muted">La galería todavía no tiene fotos.</div>';
  } catch (e) {
    grid.innerHTML = '<div class="message error">' + esc(e.message || "No se pudo cargar la galería.") + '</div>';
  }
}

async function uploadLocalGallery() {
  const localId = $("storageLocal")?.value || null;
  const input = $("localGalleryFiles");
  const files = [...(input?.files || [])];
  if (!localId) return message("Selecciona un LOCAL.", "error");
  if (!files.length) return message("Selecciona una o más fotografías.", "error");
  if (files.length > 12) return message("Puedes agregar hasta 12 fotografías por operación.", "error");

  try {
    for (const file of files) {
      const imageId = crypto.randomUUID();
      const path = mediaPathLocalGallery(localId, imageId);
      let uploaded = null;
      try {
        uploaded = await subirImagenHTPWEB(path, file);
        await rpc("save_local_gallery_image", {
          p_local_id: localId,
          p_image_id: imageId,
          p_image_url: uploaded.url,
          p_storage_path: uploaded.path,
          p_display_order: 0
        });
      } catch (e) {
        if (uploaded?.path) await eliminarObjetoMediaHTPWEB(uploaded.path).catch(() => {});
        throw e;
      }
    }
    input.value = "";
    await refreshLocalGallery();
    message("Galería del LOCAL actualizada.");
  } catch (e) {
    message(e.message || "No se pudieron subir las fotos de la galería.", "error");
  }
}

async function deleteLocalGalleryImage(imageId) {
  const localId = $("storageLocal")?.value || null;
  if (!localId || !imageId) return;
  if (!confirm("¿Eliminar esta foto de la galería?")) return;
  try {
    const path = await rpc("delete_local_gallery_image", {
      p_local_id: localId,
      p_image_id: imageId
    });
    if (path) await eliminarObjetoMediaHTPWEB(path).catch(() => {});
    await refreshLocalGallery();
    message("Foto eliminada de la galería.");
  } catch (e) {
    message(e.message || "No se pudo eliminar la foto.", "error");
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


function menuClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function menuParseNumber(value, label, required = false) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (!raw) {
    if (required) throw new Error(`${label} es obligatorio.`);
    return null;
  }
  const number = Number(raw);
  if (!Number.isFinite(number)) throw new Error(`${label} no es un número válido.`);
  return number;
}

function menuPrice(value, label, required = false) {
  const number = menuParseNumber(value, label, required);
  if (number !== null && number < 0) throw new Error(`${label} no puede ser negativo.`);
  return number;
}

function menuLocalOptions() {
  const detected = String(state.menuImportPreview?.local?.name || "").trim().toLowerCase();
  const locals = [...state.locals].sort((a, b) => {
    const aMatch = detected && String(a.name || "").trim().toLowerCase() === detected;
    const bMatch = detected && String(b.name || "").trim().toLowerCase() === detected;
    if (aMatch !== bMatch) return aMatch ? -1 : 1;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return '<option value="">Crear un LOCAL nuevo</option>' +
    locals.map(local => {
      const match = detected && String(local.name || "").trim().toLowerCase() === detected;
      return `<option value="${local.id}">${match ? "★ Posible coincidencia — " : ""}${esc(local.name)}${local.active ? "" : " — inactivo"}</option>`;
    }).join("");
}

function renderMenuWarnings() {
  const el = $("menuWarnings");
  const warnings = state.menuImportPreview?.warnings || [];

  if (!warnings.length) {
    el.className = "message hidden";
    el.textContent = "";
    return;
  }

  el.className = "message";
  el.innerHTML = "<strong>Revisar:</strong><br>" + warnings.map(item => "• " + esc(item)).join("<br>");
}

function renderMenuPreview() {
  const preview = state.menuImportPreview;
  const card = $("menuPreviewCard");

  if (!preview || !state.menuImportJob) {
    card.classList.add("hidden");
    return;
  }

  card.classList.remove("hidden");
  $("menuPreviewJobLabel").textContent =
    `Job ${state.menuImportJob.id} · ${state.menuImportJob.status || "PREVIEW"}`;

  const local = preview.local || {};
  $("menuExistingLocal").innerHTML = menuLocalOptions();
  $("menuExistingLocal").value = state.menuImportJob.existing_local_id || "";
  const zones = typeof masterLocalsState !== "undefined" ? masterLocalsState.zones.filter(z => z.active) : [];
  $("menuLocalZone").innerHTML = '<option value="">Selecciona una zona…</option>' +
    zones.map(z => '<option value="' + esc(z.id) + '">' +
      esc((z.province || "") + " / " + (z.city_name || z.canton || "") + " · " + z.code + " — " + z.name) +
      '</option>').join("");
  $("menuLocalZone").value = local.zone_id || "";
  $("menuLocalZone").disabled = Boolean($("menuExistingLocal").value);
  $("menuLocalName").value = local.name || "";
  $("menuLocalDescription").value = local.description || "";
  $("menuLocalPhone").value = local.phone || "";
  $("menuLocalWhatsapp").value = local.whatsapp || "";
  $("menuLocalAddress").value = local.address || "";
  $("menuLocalLatitude").value = local.latitude ?? "";
  $("menuLocalLongitude").value = local.longitude ?? "";
  $("menuLocalActive").checked = local.active === true;

  renderMenuWarnings();
  renderMenuCategories();
}

function renderMenuCategories() {
  const container = $("menuCategoriesEditor");
  const categories = state.menuImportPreview?.categories || [];

  if (!categories.length) {
    container.innerHTML = '<div class="muted">No hay categorías. Agrega una para poder confirmar.</div>';
    return;
  }

  container.innerHTML = categories.map((category, ci) => `
    <div class="card menu-category-card" style="margin:0">
      <div class="row between">
        <strong>Categoría ${ci + 1}</strong>
        <button class="btn-danger" type="button" onclick="removeMenuCategory(${ci})">Eliminar categoría</button>
      </div>
      <div class="form-grid">
        <div>
          <label>Nombre</label>
          <input id="menuCatName-${ci}" value="${esc(category.name || "")}">
        </div>
        <div>
          <label>Descripción</label>
          <input id="menuCatDescription-${ci}" value="${esc(category.description || "")}">
        </div>
      </div>
      <div class="row between" style="margin:12px 0">
        <strong>Productos</strong>
        <button class="btn-muted" type="button" onclick="addMenuProduct(${ci})">+ Producto</button>
      </div>
      <div class="stack">
        ${(category.products || []).map((product, pi) => `
          <div class="card menu-product-card" style="margin:0">
            <div class="row between">
              <strong>Producto ${pi + 1}</strong>
              <button class="btn-danger" type="button" onclick="removeMenuProduct(${ci},${pi})">Eliminar</button>
            </div>
            <div class="form-grid">
              <div>
                <label>Nombre</label>
                <input id="menuProductName-${ci}-${pi}" value="${esc(product.name || "")}">
              </div>
              <div>
                <label>Precio base</label>
                <input id="menuProductPrice-${ci}-${pi}" inputmode="decimal" value="${product.price ?? ""}" placeholder="Puede quedar vacío si las variantes tienen precio">
              </div>
            </div>
            <label>Descripción</label>
            <textarea id="menuProductDescription-${ci}-${pi}" rows="2">${esc(product.description || "")}</textarea>

            <div class="row between" style="margin:12px 0 8px">
              <strong>Variantes</strong>
              <button class="btn-muted" type="button" onclick="addMenuVariant(${ci},${pi})">+ Variante</button>
            </div>
            <div class="stack">
              ${(product.variants || []).map((variant, vi) => `
                <div class="row">
                  <input id="menuVariantName-${ci}-${pi}-${vi}" value="${esc(variant.name || "")}" placeholder="Nombre de variante">
                  <input id="menuVariantPrice-${ci}-${pi}-${vi}" inputmode="decimal" value="${variant.price ?? ""}" placeholder="Precio">
                  <button class="btn-danger" type="button" onclick="removeMenuVariant(${ci},${pi},${vi})">Quitar</button>
                </div>
              `).join("") || '<div class="muted">Sin variantes.</div>'}
            </div>
          </div>
        `).join("") || '<div class="muted">No hay productos en esta categoría.</div>'}
      </div>
    </div>
  `).join("");
}

function collectMenuPreview(strict = true) {
  if (!state.menuImportPreview) throw new Error("No hay preview cargado.");

  const existingLocalId = $("menuExistingLocal").value || null;
  const zoneId = $("menuLocalZone").value || null;
  const latitude = menuParseNumber($("menuLocalLatitude").value, "Latitud");
  const longitude = menuParseNumber($("menuLocalLongitude").value, "Longitud");

  if (strict && !existingLocalId && !zoneId) {
    throw new Error("Selecciona la zona del LOCAL nuevo.");
  }
  if ((latitude === null) !== (longitude === null)) {
    throw new Error("Latitud y longitud deben completarse juntas.");
  }
  if (latitude !== null && (latitude < -90 || latitude > 90)) {
    throw new Error("Latitud fuera de rango.");
  }
  if (longitude !== null && (longitude < -180 || longitude > 180)) {
    throw new Error("Longitud fuera de rango.");
  }
  if (!existingLocalId && $("menuLocalActive").checked && latitude === null) {
    throw new Error("Para publicar un LOCAL nuevo debes completar latitud y longitud.");
  }

  const preview = {
    local: {
      name: $("menuLocalName").value.trim(),
      description: $("menuLocalDescription").value.trim() || null,
      address: $("menuLocalAddress").value.trim() || null,
      phone: $("menuLocalPhone").value.trim() || null,
      whatsapp: $("menuLocalWhatsapp").value.trim() || null,
      zone_id: zoneId,
      latitude,
      longitude,
      active: $("menuLocalActive").checked
    },
    categories: [],
    warnings: state.menuImportPreview.warnings || []
  };

  if (!preview.local.name && strict) throw new Error("El nombre del LOCAL es obligatorio.");

  const sourceCategories = state.menuImportPreview.categories || [];

  sourceCategories.forEach((category, ci) => {
    const name = $("menuCatName-" + ci)?.value.trim() || "";
    if (!name && strict) throw new Error(`La categoría ${ci + 1} necesita nombre.`);

    const nextCategory = {
      name,
      description: $("menuCatDescription-" + ci)?.value.trim() || null,
      products: []
    };

    (category.products || []).forEach((product, pi) => {
      const productName = $("menuProductName-" + ci + "-" + pi)?.value.trim() || "";
      if (!productName && strict) throw new Error(`Hay un producto sin nombre en ${name || "la categoría"}.`);

      const variants = [];
      (product.variants || []).forEach((variant, vi) => {
        const variantName = $("menuVariantName-" + ci + "-" + pi + "-" + vi)?.value.trim() || "";
        const variantPrice = menuPrice(
          $("menuVariantPrice-" + ci + "-" + pi + "-" + vi)?.value,
          `Precio de variante ${variantName || vi + 1}`,
          strict
        );

        if (!variantName && strict) throw new Error(`Hay una variante sin nombre en ${productName || "un producto"}.`);
        variants.push({ name: variantName, price: variantPrice });
      });

      const price = menuPrice(
        $("menuProductPrice-" + ci + "-" + pi)?.value,
        `Precio de ${productName || "producto"}`,
        false
      );

      if (strict && price === null && variants.length === 0) {
        throw new Error(`Completa el precio de ${productName}.`);
      }

      nextCategory.products.push({
        name: productName,
        description: $("menuProductDescription-" + ci + "-" + pi)?.value.trim() || null,
        price,
        variants
      });
    });

    if (strict && nextCategory.products.length === 0) {
      throw new Error(`La categoría ${name} no tiene productos.`);
    }

    preview.categories.push(nextCategory);
  });

  if (strict && preview.categories.length === 0) {
    throw new Error("Agrega al menos una categoría.");
  }

  return preview;
}

function syncMenuPreviewFromEditor() {
  try {
    state.menuImportPreview = collectMenuPreview(false);
  } catch {
    // Las ediciones estructurales no deben bloquearse por un campo numérico incompleto.
  }
}

function addMenuCategory() {
  syncMenuPreviewFromEditor();
  state.menuImportPreview.categories.push({
    name: "Nueva categoría",
    description: null,
    products: []
  });
  renderMenuCategories();
}

function removeMenuCategory(ci) {
  syncMenuPreviewFromEditor();
  state.menuImportPreview.categories.splice(ci, 1);
  renderMenuCategories();
}

function addMenuProduct(ci) {
  syncMenuPreviewFromEditor();
  state.menuImportPreview.categories[ci].products.push({
    name: "Nuevo producto",
    description: null,
    price: null,
    variants: []
  });
  renderMenuCategories();
}

function removeMenuProduct(ci, pi) {
  syncMenuPreviewFromEditor();
  state.menuImportPreview.categories[ci].products.splice(pi, 1);
  renderMenuCategories();
}

function addMenuVariant(ci, pi) {
  syncMenuPreviewFromEditor();
  state.menuImportPreview.categories[ci].products[pi].variants.push({
    name: "Nueva variante",
    price: null
  });
  renderMenuCategories();
}

function removeMenuVariant(ci, pi, vi) {
  syncMenuPreviewFromEditor();
  state.menuImportPreview.categories[ci].products[pi].variants.splice(vi, 1);
  renderMenuCategories();
}

function renderMenuImportJobs() {
  const container = $("menuImportJobs");

  if (!state.menuImportJobs.length) {
    container.innerHTML = '<div class="muted">Todavía no hay importaciones de menú.</div>';
    return;
  }

  container.innerHTML = state.menuImportJobs.map(job => {
    const date = job.created_at ? new Date(job.created_at).toLocaleString() : "";
    const canAnalyze = ["UPLOADED","FAILED","PREVIEW_READY"].includes(job.status);
    return `
      <div class="card" style="margin:0">
        <div class="row between">
          <div>
            <strong>${esc(job.status)}</strong>
            <div class="muted">${esc(date)} · ${job.total_rows ?? "—"} productos detectados</div>
            ${job.analysis_model ? `<div class="muted">Modelo: ${esc(job.analysis_model)}</div>` : ""}
            ${job.error_message ? `<div class="message error" style="margin-top:8px">${esc(job.error_message)}</div>` : ""}
          </div>
          <div class="row">
            ${job.preview_data ? `<button class="btn-muted" onclick="openMenuImportJob('${job.id}')">Revisar</button>` : ""}
            ${canAnalyze ? `<button class="btn-muted" onclick="analyzeMenuImportJob('${job.id}')">Analizar</button>` : ""}
            ${job.result_local_id ? `<button class="btn-muted" onclick="openImportedLocal('${job.result_local_id}')">Abrir LOCAL</button>` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function loadMenuImport() {
  if (state.role !== "MASTER") return;

  if (typeof masterLocalsState !== "undefined" && !masterLocalsState.zones.length) {
    masterLocalsState.zones = await rpc("master_list_zones");
  }

  const deliverySelect = $("menuImportDelivery");
  const previous = deliverySelect.value;
  deliverySelect.innerHTML = state.deliveries
    .filter(delivery => delivery.active !== false)
    .map(delivery => `<option value="${delivery.id}">${esc(delivery.name)}</option>`)
    .join("") || '<option value="">No hay DELIVERY activo</option>';

  if (previous && state.deliveries.some(delivery => delivery.id === previous)) {
    deliverySelect.value = previous;
  }

  const { data, error } = await supabaseClient
    .from("bulk_import_jobs")
    .select("id,delivery_id,status,total_rows,analysis_model,preview_data,error_message,result_local_id,created_at,updated_at")
    .eq("import_type", "MENU_IMAGE")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    $("menuImportJobs").innerHTML = `<div class="message error">${esc(error.message)}</div>`;
    return;
  }

  state.menuImportJobs = data || [];
  renderMenuImportJobs();
}

async function startMenuImageImport() {
  const button = $("startMenuImportBtn");
  let uploaded = [];

  try {
    if (state.role !== "MASTER") throw new Error("Operación exclusiva de MASTER.");

    const deliveryId = $("menuImportDelivery").value;
    if (!deliveryId) throw new Error("Selecciona un DELIVERY.");

    button.disabled = true;
    $("menuImportStatus").textContent = "Subiendo imágenes a Storage privado...";

    uploaded = await subirImagenesMenuHTPWEB(deliveryId, $("menuImportFiles").files);

    $("menuImportStatus").textContent = "Registrando importación...";

    let jobId;
    try {
      jobId = await rpc("master_create_menu_image_job", {
        p_delivery_id: deliveryId,
        p_files: uploaded
      });
    } catch (error) {
      await eliminarImportacionesMenuHTPWEB(uploaded.map(item => item.storage_path)).catch(() => {});
      throw error;
    }

    $("menuImportFiles").value = "";
    $("menuImportStatus").textContent = "Imágenes guardadas. Analizando menú...";
    await loadMenuImport();
    await analyzeMenuImportJob(jobId);
  } catch (e) {
    $("menuImportStatus").textContent = e.message || "No se pudo iniciar la importación.";
    message(e.message || "No se pudo iniciar la importación.", "error");
  } finally {
    button.disabled = false;
  }
}

async function analyzeMenuImportJob(jobId) {
  try {
    if (state.role !== "MASTER") throw new Error("Operación exclusiva de MASTER.");

    $("menuImportStatus").textContent = "Analizando las imágenes y preparando la vista previa...";

    const { data, error } = await supabaseClient.functions.invoke("analizar-menu", {
      body: { job_id: jobId }
    });

    if (error) throw error;
    if (!data?.ok || !data?.preview) throw new Error(data?.error || "No se recibió una vista previa.");

    await loadMenuImport();

    const job = state.menuImportJobs.find(item => item.id === jobId) || {
      id: jobId,
      status: "PREVIEW_READY",
      preview_data: data.preview
    };

    state.menuImportJob = job;
    state.menuImportPreview = menuClone(data.preview);
    renderMenuPreview();
    $("menuImportStatus").textContent = "Análisis terminado. Revisa y corrige antes de confirmar.";
    document.getElementById("menuPreviewCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    await loadMenuImport();
    $("menuImportStatus").textContent =
      "El job quedó guardado. Si la API de análisis aún no está configurada, podrás pulsar Analizar después de configurar OPENAI_API_KEY.";
    message(e.message || "No se pudo analizar el menú.", "error");
  }
}

function openMenuImportJob(jobId) {
  const job = state.menuImportJobs.find(item => item.id === jobId);
  if (!job?.preview_data) return;

  state.menuImportJob = job;
  state.menuImportPreview = menuClone(job.preview_data);
  renderMenuPreview();
  document.getElementById("menuPreviewCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function applyMenuImport() {
  const button = $("applyMenuImportBtn");

  try {
    if (!state.menuImportJob?.id) throw new Error("No hay importación seleccionada.");

    const preview = collectMenuPreview(true);
    const existingLocalId = $("menuExistingLocal").value || null;

    if (!existingLocalId && preview.local.active !== true) {
      const proceed = confirm(
        "El LOCAL nuevo se creará inactivo para que puedas completar sus datos antes de publicarlo. ¿Continuar?"
      );
      if (!proceed) return;
    }

    button.disabled = true;

    const result = await rpc("master_apply_menu_import", {
      p_job_id: state.menuImportJob.id,
      p_preview: preview,
      p_existing_local_id: existingLocalId
    });

    message(
      `Importación aplicada: ${result.categories} categorías, ${result.products} productos y ${result.variants} variantes.`
    );

    $("menuPreviewCard").classList.add("hidden");
    state.menuImportJob = null;
    state.menuImportPreview = null;

    await loadScopes();
    await loadMenuImport();
  } catch (e) {
    message(e.message || "No se pudo aplicar la importación.", "error");
  } finally {
    button.disabled = false;
  }
}

function openImportedLocal(localId) {
  if (state.role !== "MASTER") return;
  showSection("catalog");
  if ($("catalogLocal")) {
    $("catalogLocal").value = localId;
    loadCatalog();
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
  const menuImportDelivery = $("menuImportDelivery");
  const menuExistingLocal = $("menuExistingLocal");
  const menuImportStatus = $("menuImportStatus");
  const menuLocalZone = $("menuLocalZone");
  const startMenuImportBtn = $("startMenuImportBtn");
  const reanalyzeMenuBtn = $("reanalyzeMenuBtn");
  const addMenuCategoryBtn = $("addMenuCategoryBtn");
  const applyMenuImportBtn = $("applyMenuImportBtn");

  if (menuImportDelivery) {
    menuImportDelivery.onchange = () => {
      if (menuImportStatus) menuImportStatus.textContent = "Selecciona de 1 a 5 imágenes para iniciar.";
    };
  }
  if (menuExistingLocal) {
    menuExistingLocal.onchange = () => {
      const existing = Boolean(menuExistingLocal.value);
      if (menuLocalZone) {
        menuLocalZone.disabled = existing;
        if (existing) menuLocalZone.value = "";
      }
    };
  }
  if (startMenuImportBtn) startMenuImportBtn.onclick = startMenuImageImport;
  if (reanalyzeMenuBtn) reanalyzeMenuBtn.onclick = () => state.menuImportJob?.id && analyzeMenuImportJob(state.menuImportJob.id);
  if (addMenuCategoryBtn) addMenuCategoryBtn.onclick = addMenuCategory;
  if (applyMenuImportBtn) applyMenuImportBtn.onclick = applyMenuImport;
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
  $("catalogDeleteProductImageBtn").onclick = deleteCatalogProductImage;
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
    await refreshLocalGallery();
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
  $("uploadLocalGalleryBtn").onclick = uploadLocalGallery;

  $("uploadProductImageBtn").onclick = uploadProductImage;
  $("deleteProductImageBtn").onclick = deleteProductImage;
}

init();
