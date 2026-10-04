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
  shareGallery: [],
  advertisements: [],
  advertisementDeliveries: [],
  advertisementLocals: [],
  advertisementProducts: [],
  menuImportJobs: [],
  menuImportJob: null,
  menuImportPreview: null,
  deliveryAuthorizations: [],
  deliveryServiceAccess: null,
  masterDeliveryService: null,
  myPlanSummary: null,
  driverOrders: [],
  driverRoutePlan: null
};

const roleSections = {
  MASTER: ["overview","share","orders","requests","deliveries","expressdemo","localsmaster","categoriesmaster","zonesmaster","users","coverage","catalog","schedules","advertising","menuimport","analytics"],
  DELIVERY_ADMIN: ["overview","mydelivery","myplan","share","promotions","orders","drivers","requests","fees","coverage","network","security","storage","advertising","analytics"],
  DELIVERY_OPERATOR: ["overview","promotions","orders","drivers"],
  DELIVERY_DRIVER: ["driverorders"],
  LOCAL_ADMIN: ["overview","mylocal","orders","catalog","schedules","storage","marketing","inventory","analytics"]
};

function completeAdminRoleBoot() {
  document.body.classList.remove("admin-role-loading","admin-role-error");
  document.body.classList.add("admin-role-ready");
}

function failAdminRoleBoot() {
  document.body.classList.remove("admin-role-loading","admin-role-ready");
  document.body.classList.add("admin-role-error");
}

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

function formatServiceDate(value){
  if(!value)return "—";
  const raw=String(value).slice(0,10);
  const parts=raw.split("-");
  return parts.length===3 ? parts[2]+"/"+parts[1]+"/"+parts[0] : raw;
}

function deliveryServiceStateLabel(stateValue){
  const labels={
    ACTIVE:"Activo",
    EXPIRING:"Por vencer",
    SCHEDULED:"Programado",
    EXPIRED:"Vencido",
    NOT_CONFIGURED:"Sin configurar"
  };
  return labels[stateValue]||stateValue||"—";
}

function renderDeliveryServiceBlocked(access){
  failAdminRoleBoot();
  const deliveries=Array.isArray(access?.deliveries)?access.deliveries:[];
  const latest=deliveries[0]||{};
  document.body.innerHTML=`
    <main style="max-width:760px;margin:60px auto;font-family:Arial;padding:20px">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px">
        <h1 style="margin-top:0">Servicio DELIVERY no disponible</h1>
        <p>Tu cuenta sigue activa en HTPWEB, pero el acceso administrativo del DELIVERY está bloqueado porque el servicio no está vigente.</p>
        <p><strong>DELIVERY:</strong> ${esc(latest.name||"—")}</p>
        <p><strong>Estado:</strong> ${esc(deliveryServiceStateLabel(latest.state))}</p>
        <p><strong>Último vencimiento:</strong> ${esc(formatServiceDate(latest.paid_through_on||latest.ends_on))}</p>
        <p>Contacta con HTPWEB para renovar. En cuanto MASTER registre la renovación, el acceso se restablece automáticamente.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">
          <a href="../index.html" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#111;color:#fff;text-decoration:none">Continuar como cliente</a>
          <a href="../app/acceso.html" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#eee;color:#111;text-decoration:none">Mi cuenta</a>
        </div>
      </div>
    </main>
  `;
}

function renderDeliveryServiceWarning(access){
  const deliveries=Array.isArray(access?.deliveries)?access.deliveries:[];
  const expiring=deliveries.filter(item=>item?.active&&item?.expiring_soon);
  if(!expiring.length)return;

  const host=document.querySelector("main")||document.body;
  const note=document.createElement("div");
  note.className="workspace-warning";
  note.style.margin="12px";
  note.innerHTML=expiring.map(item=>
    '<strong>'+esc(item.name||"DELIVERY")+'</strong>: el servicio vence el '+
    esc(formatServiceDate(item.paid_through_on||item.ends_on))+
    ' ('+esc(item.days_remaining)+" días)."
  ).join("<br>");
  host.insertBefore(note,host.firstChild);
}

async function renderInternalNotifications(){
  try{
    document.getElementById("internalNotifications")?.remove();
    const items=await rpc("my_notifications",{p_limit:10});
    const unread=(Array.isArray(items)?items:[]).filter(x=>!x.read_at);
    if(!unread.length)return;
    const host=document.querySelector("main")||document.body;
    const box=document.createElement("div");
    box.id="internalNotifications";
    box.className="workspace-warning";
    box.style.margin="12px";
    box.innerHTML='<div class="row between"><strong>Notificaciones HTPWEB</strong><span class="badge">'+unread.length+' nueva(s)</span></div>'+
      unread.map(n=>'<div style="margin-top:8px"><strong>'+esc(n.title)+'</strong><div>'+esc(n.message)+'</div>'+
        '<button class="btn-muted" type="button" data-notification-read="'+esc(n.id)+'" style="margin-top:6px">Marcar como leída</button></div>').join("");
    box.querySelectorAll("[data-notification-read]").forEach(b=>b.onclick=async()=>{
      try{
        await rpc("mark_notification_read",{p_notification_id:b.dataset.notificationRead});
        await renderInternalNotifications();
      }catch(e){message(e.message||"No se pudo marcar la notificación.","error");}
    });
    host.insertBefore(box,host.firstChild);
  }catch(e){console.warn("No se pudieron cargar notificaciones internas.",e);}
}
async function init() {
  try {
    state.user = await obtenerUsuarioActual();

    if (!state.user) {
      const back = encodeURIComponent(location.pathname + location.search);
      location.href = "../app/acceso.html?return=" + back;
      return;
    }

    const claimResult = await supabaseClient.rpc("claim_my_delivery_authorizations");
    if (claimResult.error) throw claimResult.error;

    const { data: role, error: roleError } = await supabaseClient.rpc("current_role_code");
    if (roleError) throw roleError;

    state.role = role;
    configureHtpwebWorkspaceHeader();

    try {
      const qaResult = await supabaseClient.rpc("qa_profile_selector_snapshot");
      if (!qaResult.error && qaResult.data?.enabled) {
        $("qaProfilesAdminLink")?.classList.remove("hidden");
      }
    } catch (qaError) {
      console.warn("Selector QA no disponible:", qaError);
    }

    if (["DELIVERY_ADMIN","DELIVERY_OPERATOR","DELIVERY_DRIVER"].includes(state.role)) {
      const serviceResult = await supabaseClient.rpc("my_delivery_service_access");
      if (serviceResult.error) throw serviceResult.error;
      state.deliveryServiceAccess = serviceResult.data || null;

      if (!state.deliveryServiceAccess?.has_active_service) {
        renderDeliveryServiceBlocked(state.deliveryServiceAccess);
        return;
      }
    }

    if (!roleSections[state.role]) {
      failAdminRoleBoot();
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
    if (state.deliveryServiceAccess) renderDeliveryServiceWarning(state.deliveryServiceAccess);
    if (["DELIVERY_ADMIN","DELIVERY_OPERATOR"].includes(state.role)) await renderInternalNotifications();

    await loadScopes();
    if (state.role === "DELIVERY_DRIVER") {
      await loadDriverOrders();
      return;
    }
    await loadCities();
    await refreshAll();
  } catch (error) {
    console.error(error);
    failAdminRoleBoot();
    message(error.message || "No se pudo abrir el panel.", "error");
  }
}

function configureHtpwebWorkspaceHeader(){
  const header=$("adminHtpwebHeader");
  if(!header)return;
  const visible=["DELIVERY_ADMIN","DELIVERY_OPERATOR"].includes(state.role);
  header.classList.toggle("hidden",!visible);
  document.body.classList.toggle("delivery-workspace-header",visible);
}

function syncDeliveryPublicAccess(delivery){
  const url=masterDeliveryPublicUrl(delivery);
  const input=$("profileDeliveryPublicUrl");
  const sidebar=$("deliveryPublicSiteLink");
  if(input)input.value=url||"";
  if(sidebar&&state.role==="DELIVERY_ADMIN"){
    sidebar.href=url||"../index.html";
    sidebar.target=url?"_blank":"";
    sidebar.rel=url?"noopener noreferrer":"";
  }
  return url;
}

function currentDeliveryProfilePublicUrl(){
  return syncDeliveryPublicAccess(state.deliveryProfileRecord);
}

function organizeDeliveryAdminNavigation() {
  if(state.role!=="DELIVERY_ADMIN")return;
  const nav=$("nav");
  if(!nav)return;

  nav.querySelectorAll(".delivery-nav-group").forEach(group=>group.remove());

  const layout=[
    {label:"Principal",sections:["overview"]},
    {label:"Operación",sections:["orders","drivers"]},
    {label:"Mi DELIVERY",sections:["mydelivery","fees","coverage","security"]},
    {label:"Clientes",sections:["network","share","requests"]},
    {label:"Imagen y promoción",sections:["promotions","storage","advertising"]},
    {label:"Gestión",sections:["myplan","analytics"]}
  ];

  layout.forEach(group=>{
    const buttons=group.sections
      .map(section=>nav.querySelector('button[data-section="'+section+'"]'))
      .filter(button=>button&&!button.classList.contains("hidden"));

    if(!buttons.length)return;

    const host=document.createElement("div");
    host.className="delivery-nav-group";
    host.dataset.navGroup=group.label;

    const title=document.createElement("div");
    title.className="delivery-nav-group-title";
    title.textContent=group.label;
    host.appendChild(title);

    buttons.forEach(button=>host.appendChild(button));
    nav.appendChild(host);
  });
}

function configureNavigation() {
  const allowed = new Set(roleSections[state.role]);
  const masterLocalWorkspaceSections = new Set(["catalog","schedules","menuimport"]);
  const masterDeliveryWorkspaceSections = new Set(["coverage"]);

  document.querySelectorAll("#nav button").forEach(btn => {
    const hiddenInsideLocales = state.role === "MASTER" && masterLocalWorkspaceSections.has(btn.dataset.section);
    const hiddenInsideDelivery = state.role === "MASTER" && masterDeliveryWorkspaceSections.has(btn.dataset.section);
    btn.classList.toggle("hidden", !allowed.has(btn.dataset.section) || hiddenInsideLocales || hiddenInsideDelivery);
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });

  document.querySelectorAll(".master-only").forEach(el => {
    el.classList.toggle("hidden", state.role !== "MASTER");
  });

  organizeDeliveryAdminNavigation();
  showSection(roleSections[state.role][0]);
  completeAdminRoleBoot();
}

function showSection(name) {
  if(name!=="orders"&&typeof stopOrderControlAutoRefresh==="function") stopOrderControlAutoRefresh();
  if(name!=="orders"&&typeof stopOrderControlRealtime==="function") stopOrderControlRealtime();
  if (typeof restoreLocalPanels === "function") restoreLocalPanels();
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll("#nav button").forEach(b => b.classList.remove("active"));

  $("section-" + name)?.classList.add("active");
  document.querySelector(`#nav button[data-section="${name}"]`)?.classList.add("active");
  $("pageTitle").textContent = document.querySelector(`#nav button[data-section="${name}"]`)?.textContent || "HTPWEB Admin";

  if (name === "mydelivery") loadDeliveryProfile();
  if (name === "myplan") loadMyPlan();
  if (name === "share") loadShareModule();
  if (name === "promotions" && window.loadDeliveryPromotionsPanel) window.loadDeliveryPromotionsPanel();
  if (name === "mylocal") loadLocalProfile();
  if (name === "marketing") loadLocalMarketing();
  if (name === "inventory") loadLocalInventory();
  if (name === "orders") loadOrders();
  if (name === "drivers") loadDriverWorkspace();
  if (name === "driverorders") loadDriverOrders();
  if (name === "requests") loadRequests();
  if (name === "deliveries") (state.role === "MASTER" && window.loadDeliveryMasterWorkspace ? window.loadDeliveryMasterWorkspace() : loadDeliveriesModule());
  if (name === "expressdemo") loadExpressDemoSlots();
  if (name === "users") loadUsersModule();
  if (name === "localsmaster") { bindMasterLocals(); loadMasterLocals(); }
  if (name === "categoriesmaster") loadMasterLocalBusinessCategories();
  if (name === "zonesmaster") loadMasterZones();
  if (name === "fees") loadFees();
  if (name === "coverage") loadCoverage();
  if (name === "network") loadCustomerNetwork();
  if (name === "security") loadRestrictedAreas();
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
      supabaseClient.from("deliveries").select("id,name,slug,public_share_path,description,logo_url,phone,whatsapp,active,city_id").order("name"),
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
        .select("id,name,slug,public_share_path,active")
        .in("id", ids)
        .order("name");

      if (dRes.error) throw dRes.error;
      state.deliveries = dRes.data || [];
    }
  }

  if (state.role === "DELIVERY_DRIVER") {
    const deliveries=Array.isArray(state.deliveryServiceAccess?.deliveries)
      ? state.deliveryServiceAccess.deliveries
      : [];
    state.deliveries=deliveries.map(d=>({
      id:d.delivery_id||d.id,
      name:d.name||"DELIVERY",
      slug:d.slug||null,
      active:d.active!==false
    })).filter(d=>d.id);
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
    } else if (state.role === "DELIVERY_DRIVER") {
      $("scopeInfo").textContent =
        "Repartidor · " + deliveryCount + " DELIVERY asignado" + (deliveryCount === 1 ? "" : "s");
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
  if (state.role === "DELIVERY_DRIVER") {
    await loadDriverOrders();
    return;
  }
  await Promise.all([
    loadOverview(),
    loadOrders(),
    loadRequests(),
    state.role === "DELIVERY_ADMIN" && $("section-myplan")?.classList.contains("active")
      ? loadMyPlan()
      : Promise.resolve()
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
  if (["drivers","coverage","fees","network","myplan","mydelivery","catalog"].includes(action)) {
    showSection(action);
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

  const relevant = items.filter(item => item.show === true || item.value === null || Number(item.value) > 0);
  if (!relevant.length) {
    const deliveryMode=state.role==="DELIVERY_ADMIN";
    container.innerHTML = `
      <div class="overview-all-good">
        <strong>${deliveryMode?"Sin incidencias operativas":"Sin pendientes críticos"}</strong>
        <span>${deliveryMode?"No hay pendientes que requieran acción del DELIVERY.":"Los controles principales no muestran elementos que requieran atención."}</span>
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
        <span class="overview-attention-value">${item.displayValue!==undefined?esc(item.displayValue):(item.value === null ? "—" : esc(item.value))}</span>
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
        <strong>${esc(state.role==="DELIVERY_ADMIN"?"Entrega "+overviewMoney(order.delivery_fee):overviewMoney(order.total))}</strong>
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

  let actions=masterActions;
  if(state.role==="DELIVERY_ADMIN"){
    actions=[
      ["orders","Revisar pedidos","Pedidos abiertos, listos y en ruta"],
      ["drivers","Repartidores","Equipo de reparto y asignaciones"],
      ["coverage","Zonas y cobertura","Zonas operativas de tu DELIVERY"],
      ["fees","Tarifas","Configurar el cobro por entrega"],
      ["network","Clientes y referidos","Red privada, referidos y horarios"],
      ["myplan","Mi plan","Capacidad, funciones y vencimiento"]
    ];
  }else if(state.role==="DELIVERY_OPERATOR"){
    actions=[
      ["orders","Revisar pedidos","Operación y estados de pedidos"],
      ["drivers","Repartidores","Asignación y seguimiento de entregas"]
    ];
  }else if(state.role==="LOCAL_ADMIN"){
    actions=[
      ["orders","Revisar pedidos","Pedidos de tus LOCAL"],
      ["catalog","Gestionar catálogo","Productos y contenido de tus LOCAL"]
    ];
  }

  container.innerHTML = actions.map(([action,label,detail]) => `
    <button class="overview-action-card" type="button" data-overview-action="${esc(action)}">
      <strong>${esc(label)}</strong>
      <span>${esc(detail)}</span>
    </button>
  `).join("");
}

function overviewSetModeLabels(){
  const deliveryMode=state.role==="DELIVERY_ADMIN";
  if($("overviewHeadingTitle"))$("overviewHeadingTitle").textContent=deliveryMode?"Estado de mi operación":"Estado de HTPWEB";
  if($("overviewAttentionSubtitle"))$("overviewAttentionSubtitle").textContent=deliveryMode
    ?"Pendientes que requieren acción del DELIVERY."
    :"Pendientes que pueden afectar la operación o la calidad del catálogo.";
  if($("overviewHealthTitle"))$("overviewHealthTitle").textContent=deliveryMode?"Capacidad operativa":"Salud de la plataforma";
  if($("overviewHealthSubtitle"))$("overviewHealthSubtitle").textContent=deliveryMode
    ?"Uso actual frente a los límites de tu plan."
    :"Qué tan completo y publicado está HTPWEB.";
  if($("overviewQuickActionsSubtitle"))$("overviewQuickActionsSubtitle").textContent=deliveryMode
    ?"Accesos frecuentes de la operación DELIVERY."
    :"Tareas frecuentes del MASTER.";
}

function overviewUsageAggregate(snapshots,key){
  let used=0,max=0,hasMax=false;
  for(const snapshot of snapshots){
    const item=snapshot?.plan_summary?.usage?.[key]||{};
    if(item.used!==null&&item.used!==undefined)used+=Number(item.used)||0;
    if(item.max!==null&&item.max!==undefined){
      max+=Number(item.max)||0;
      hasMax=true;
    }
  }
  return {used,max:hasMax?max:null};
}

async function loadDeliveryAdminOverview(todayIso){
  overviewSetModeLabels();
  const deliveries=Array.isArray(state.deliveries)?state.deliveries:[];
  if(!deliveries.length){
    if($("metrics"))$("metrics").innerHTML='<div class="message error">No tienes un DELIVERY activo asignado.</div>';
    renderOverviewAttention([]);
    renderOverviewHealth([]);
    renderOverviewRecentOrders([]);
    renderOverviewQuickActions();
    bindOverviewActions();
    return;
  }

  const snapshots=await Promise.all(deliveries.map(d=>
    rpc("delivery_admin_overview_snapshot",{p_delivery_id:d.id,p_today_start:todayIso})
  ));

  const sum=key=>snapshots.reduce((total,row)=>total+Number(row?.[key]||0),0);
  const ordersToday=sum("orders_today");
  const openOrders=sum("open_orders");
  const enRoute=sum("en_route");
  const readyUnassigned=sum("ready_unassigned");
  const deliveredToday=sum("delivered_today_count");
  const deliveryRevenue=sum("delivery_revenue_today");

  const recentOrders=snapshots
    .flatMap(row=>Array.isArray(row?.recent_orders)?row.recent_orders:[])
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))
    .slice(0,5);

  const drivers=overviewUsageAggregate(snapshots,"drivers");
  const emergencyDrivers=overviewUsageAggregate(snapshots,"emergency_drivers");
  const zones=overviewUsageAggregate(snapshots,"zones");
  const operators=overviewUsageAggregate(snapshots,"operators");
  const zoneExcess=zones.max===null?0:Math.max(0,zones.used-zones.max);

  const currentPlans=snapshots
    .map(row=>row?.plan_summary?.plan)
    .filter(Boolean);
  const expiring=currentPlans.filter(plan=>plan.expiring_soon);
  const singlePlan=deliveries.length===1?currentPlans[0]:null;
  const current=singlePlan?.current||null;

  const kpis=[
    {
      label:"Pedidos hoy",
      value:ordersToday,
      detail:deliveredToday+" entregado"+(deliveredToday===1?"":"s")+" hoy",
      tone:"neutral"
    },
    {
      label:"Pedidos en curso",
      value:openOrders,
      detail:enRoute+" en ruta ahora",
      tone:openOrders>0?"attention":"success"
    },
    {
      label:"Ingresos por entregas",
      value:overviewMoney(deliveryRevenue),
      detail:"Tarifas de entrega cobradas hoy",
      tone:"success"
    },
    {
      label:"Repartidores activos",
      value:drivers.used+emergencyDrivers.used,
      detail:
        "Regulares "+drivers.used+"/"+(drivers.max===null?"—":drivers.max)+
        " · Emergencia "+emergencyDrivers.used+"/"+(emergencyDrivers.max===null?"—":emergencyDrivers.max),
      tone:
        (drivers.max!==null&&drivers.used>=drivers.max)
        ||(emergencyDrivers.max!==null&&emergencyDrivers.used>=emergencyDrivers.max)
          ?"attention":"neutral"
    }
  ];

  if($("metrics")){
    $("metrics").innerHTML=kpis.map(kpi=>`
      <div class="overview-kpi overview-kpi-${esc(kpi.tone)}">
        <span>${esc(kpi.label)}</span>
        <strong>${esc(kpi.value)}</strong>
        <small>${esc(kpi.detail)}</small>
      </div>
    `).join("");
  }

  renderOverviewAttention([
    {
      label:"Pedidos listos sin repartidor",
      detail:"Pedidos READY que todavía no tienen una asignación activa.",
      value:readyUnassigned,
      action:"orders"
    },
    {
      label:"Pedidos en curso",
      detail:"Pedidos que aún requieren seguimiento operativo.",
      value:openOrders,
      action:"orders"
    },
    {
      label:"Zonas sobre el límite del plan",
      detail:zoneExcess>0?"Tienes "+zones.used+" zonas activas y el plan permite "+zones.max+".":"Las zonas están dentro del cupo contratado.",
      value:zoneExcess,
      action:"coverage"
    },
    ...expiring.map(plan=>({
      label:"Plan próximo a vencer",
      detail:"Revisa la renovación para evitar interrupciones.",
      value:plan.days_remaining,
      displayValue:plan.days_remaining+" día"+(Number(plan.days_remaining)===1?"":"s"),
      show:true,
      action:"myplan"
    }))
  ]);

  renderOverviewHealth([
    {
      label:"Repartidores regulares",
      value:drivers.used,
      total:drivers.max,
      detail:"Personal regular habilitado frente al máximo del plan."
    },
    {
      label:"Emergencias",
      value:emergencyDrivers.used,
      total:emergencyDrivers.max,
      detail:"Cupos temporales de 24 horas para continuidad operativa."
    },
    {
      label:"Zonas operativas",
      value:zones.used,
      total:zones.max,
      detail:zoneExcess>0?"Actualmente superas el máximo contratado.":"Zonas seleccionadas para operar."
    },
    {
      label:"Operadores",
      value:operators.used,
      total:operators.max,
      detail:"Usuarios operativos frente al máximo del plan."
    }
  ]);

  renderOverviewRecentOrders(recentOrders);
  renderOverviewQuickActions();

  if($("overviewUpdatedAt")){
    let extra="";
    if(current){
      extra=" · Plan "+(current.plan_name||current.plan_code||"—")+" · vence "+formatServiceDate(current.ends_at);
    }else if(deliveries.length>1){
      extra=" · "+deliveries.length+" DELIVERY";
    }
    $("overviewUpdatedAt").textContent=
      "Actualizado "+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})+extra;
  }

  bindOverviewActions();
}

async function loadOverview() {
  const today = new Date();
  today.setHours(0,0,0,0);
  const todayIso = today.toISOString();

  if(state.role==="DELIVERY_ADMIN"){
    await loadDeliveryAdminOverview(todayIso);
    return;
  }

  overviewSetModeLabels();
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
  let globalVisits = null;
  let masterSnapshotLoaded = false;

  // MASTER usa un solo snapshot del servidor para evitar múltiples HEAD COUNT
  // sobre tablas con RLS. Esto elimina especialmente tres conteos completos
  // de products que eran el principal cuello de botella del dashboard.
  if (state.role === "MASTER") {
    try {
      globalVisits = Number(await rpc("global_delivery_visit_count"));
    } catch (e) {
      console.warn("No se pudo cargar el contador global de visitas.", e);
      globalVisits = null;
    }

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
    ...(state.role === "MASTER" ? [{
      label: "Visitas",
      value: globalVisits === null ? "—" : Number(globalVisits || 0).toLocaleString("es-EC"),
      detail: "Acumuladas en todos los DELIVERY",
      tone: "neutral"
    }] : []),
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

function myPlanCapacityCard(label,item,detail){
  const used=item?.used;
  const max=item?.max;
  const hasUsage=used!==null&&used!==undefined;
  const hasMax=max!==null&&max!==undefined;
  const value=item?.usage_available===false
    ? (hasMax?"Límite contratado: "+max:"—")
    : (hasUsage?used:0)+" / "+(hasMax?max:"—");
  const percent=hasUsage&&Number(max)>0
    ? Math.max(0,Math.min(100,Math.round((Number(used)/Number(max))*100)))
    : null;
  return overviewResourceCard({label,value,percent,detail});
}

function myPlanFeaturePresentation(feature){
  const code=String(feature?.code||"");
  const family=String(feature?.family||"");

  if(feature?.type!=="CAPABILITY"||feature?.value!==true)return null;

  const base={
    "analytics.view":["Datos y analítica","Analytics de la operación"],
    "customers.manage":["Clientes y referidos","Gestión de clientes"],
    "delivery_fees.manage":["Tarifas","Administrar tarifas"],
    "delivery.info.manage":["Mi DELIVERY","Editar información del DELIVERY"],
    "images.manage":["Mi DELIVERY","Logo e imágenes del DELIVERY"],
    "locals.create":["Locales vinculados","Solicitar alta de nuevos LOCAL"],
    "locals.link_existing":["Locales vinculados","Solicitar vincular un LOCAL existente"],
    "locals.suggest":["Locales vinculados","Sugerir cambios de LOCAL"],
    "orders.manage":["Pedidos y despacho","Administrar pedidos"],
    "users.manage":["Equipo","Administrar usuarios del DELIVERY"],
    "zones.manage":["Zonas y cobertura","Administrar zonas operativas"]
  };

  if(base[code])return {group:base[code][0],label:base[code][1]};

  // Capacidades internas que no representan una acción directa del DELIVERY.
  if(["products.manage","bulk_import.manage"].includes(code))return null;

  const groupMap={
    "Clientes y referidos":"Clientes y referidos",
    "Tarifas":"Tarifas",
    "Seguridad":"Seguridad",
    "GPS":"GPS y rutas",
    "Rutas":"GPS y rutas",
    "Despacho":"Pedidos y despacho",
    "Entrega":"Confirmación de entrega",
    "Publicidad":"Publicidad",
    "Datos":"Datos y analítica",
    "Analítica":"Datos y analítica"
  };

  return {
    group:groupMap[family]||family||"Otras funciones",
    label:feature.label||code
  };
}

function renderMyPlanFeatureGroups(features){
  const grouped=new Map();
  features
    .map(myPlanFeaturePresentation)
    .filter(Boolean)
    .forEach(item=>{
      if(!grouped.has(item.group))grouped.set(item.group,[]);
      const list=grouped.get(item.group);
      if(!list.includes(item.label))list.push(item.label);
    });

  if(!grouped.size){
    return '<div class="muted">No hay funciones adicionales configuradas para este contrato.</div>';
  }

  const preferred=[
    "Mi DELIVERY",
    "Pedidos y despacho",
    "Equipo",
    "Zonas y cobertura",
    "Tarifas",
    "Clientes y referidos",
    "GPS y rutas",
    "Confirmación de entrega",
    "Seguridad",
    "Publicidad",
    "Datos y analítica",
    "Locales vinculados"
  ];

  const names=[...grouped.keys()].sort((a,b)=>{
    const ai=preferred.indexOf(a);
    const bi=preferred.indexOf(b);
    if(ai<0&&bi<0)return a.localeCompare(b,"es");
    if(ai<0)return 1;
    if(bi<0)return -1;
    return ai-bi;
  });

  return '<div class="overview-resource-grid">'+names.map(name=>
    '<div class="workspace-note" style="margin:0">'+
      '<strong>'+esc(name)+'</strong>'+
      '<div style="margin-top:8px;display:grid;gap:6px">'+
        grouped.get(name).map(label=>
          '<div><span aria-hidden="true">✓</span> '+esc(label)+'</div>'
        ).join("")+
      '</div>'+
    '</div>'
  ).join("")+'</div>';
}

function renderMyPlan(){
  const summary=state.myPlanSummary;
  const contract=$("myPlanContract");
  const capacity=$("myPlanCapacity");
  const features=$("myPlanFeatures");
  const selection=$("myPlanSelectionState");
  if(!contract||!capacity||!features||!selection)return;

  if(!summary){
    contract.innerHTML='<div class="muted">Selecciona un DELIVERY para consultar el plan.</div>';
    capacity.innerHTML="";
    features.innerHTML="";
    selection.textContent="—";
    return;
  }

  const plan=summary.plan||{};
  const current=plan.current;
  const next=plan.next;

  if(!current){
    contract.innerHTML='<strong>Sin plan comercial vigente.</strong>'+
      (next?' Próximo plan: '+esc(next.plan_name||next.plan_code||"—")+
        ' desde '+esc(formatServiceDate(next.starts_at)):'');
  }else{
    const price=current.price===null||current.price===undefined
      ?"—"
      :Number(current.price).toFixed(2)+" "+esc(current.currency||"USD");
    contract.innerHTML=
      '<strong>'+esc(current.plan_name||current.plan_code||"Plan")+'</strong>'+
      '<br><span>Versión contratada: '+esc(current.plan_version||current.version_number||"—")+
      ' · Estado: '+esc(deliveryServiceStateLabel(plan.state))+
      ' · Inicio: '+esc(formatServiceDate(current.starts_at))+
      ' · Vence: '+esc(formatServiceDate(current.ends_at))+
      ' · Precio contratado: '+price+'</span>'+
      (plan.expiring_soon
        ? '<div class="workspace-warning" style="margin-top:10px">Vence en '+esc(plan.days_remaining)+' día(s).</div>'
        : '')+
      (next
        ? '<div class="workspace-note" style="margin-top:10px"><strong>Próximo plan:</strong> '+
          esc(next.plan_name||next.plan_code||"—")+' · '+esc(next.change_type||"CAMBIO")+
          ' · inicia '+esc(formatServiceDate(next.starts_at))+'</div>'
        : '');
  }

  selection.textContent=summary.selection_ready?"Selección lista":"Reconfiguración pendiente";
  const usage=summary.usage||{};
  capacity.innerHTML=[
    myPlanCapacityCard("Zonas activas",usage.zones,"Uso actual frente al máximo contratado."),
    myPlanCapacityCard("Áreas restringidas",usage.restricted_areas,"Uso actual frente al máximo contratado."),
    myPlanCapacityCard("Operadores",usage.operators,"Cuentas DELIVERY_OPERATOR activas frente al cupo contratado."),
    myPlanCapacityCard("Repartidores regulares",usage.drivers,"Repartidores regulares activos frente al cupo contratado."),
    myPlanCapacityCard("Repartidores de emergencia",usage.emergency_drivers,"Cupos temporales de emergencia. Cada alta dura 24 horas; si vence con una entrega activa, termina esa entrega y luego se desactiva.")
  ].join("");

  const included=(summary.features||[]).filter(f=>f.type==="CAPABILITY"&&f.value===true);
  features.innerHTML=renderMyPlanFeatureGroups(included);
}

async function loadMyPlan(){
  if(state.role!=="DELIVERY_ADMIN")return;
  const select=$("myPlanDelivery");
  if(!select)return;

  const previous=select.value;
  select.innerHTML=state.deliveries.length
    ? state.deliveries.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+'</option>').join("")
    : '<option value="">No hay DELIVERY asignados</option>';

  if(previous&&state.deliveries.some(d=>d.id===previous))select.value=previous;
  await loadMyPlanSummary();
}

async function loadMyPlanSummary(){
  if(state.role!=="DELIVERY_ADMIN")return;
  const deliveryId=$("myPlanDelivery")?.value||null;
  if(!deliveryId){
    state.myPlanSummary=null;
    renderMyPlan();
    return;
  }
  try{
    state.myPlanSummary=await rpc("delivery_my_plan_summary",{p_delivery_id:deliveryId});
    renderMyPlan();
  }catch(e){
    state.myPlanSummary=null;
    renderMyPlan();
    if($("myPlanContract"))$("myPlanContract").innerHTML='<div class="message error">'+esc(e.message||"No se pudo consultar Mi Plan.")+'</div>';
  }
}


const DELIVERY_THEME_PRESETS = {
  HTPWEB:{label:"HTPWEB",primary:"#e53935",dark:"#111111",soft:"#fff3f2"},
  OCEAN:{label:"Océano",primary:"#1565c0",dark:"#0d2340",soft:"#eef6ff"},
  SKY:{label:"Cielo",primary:"#0288d1",dark:"#0b3550",soft:"#eefaff"},
  FOREST:{label:"Bosque",primary:"#2e7d32",dark:"#153a20",soft:"#f1f8f2"},
  SUNSET:{label:"Atardecer",primary:"#ef6c00",dark:"#2f1b0d",soft:"#fff7ed"},
  PURPLE:{label:"Morado",primary:"#7b1fa2",dark:"#2d1238",soft:"#faf1fd"},
  TURQUOISE:{label:"Turquesa",primary:"#00897b",dark:"#083c37",soft:"#eefaf8"},
  GRAPHITE:{label:"Grafito",primary:"#455a64",dark:"#172127",soft:"#f3f6f7"}
};

function renderDeliveryThemeSelection(themeKey) {
  const key = DELIVERY_THEME_PRESETS[themeKey] ? themeKey : "HTPWEB";
  const theme = DELIVERY_THEME_PRESETS[key];
  if ($("profileDeliveryTheme")) $("profileDeliveryTheme").value = key;
  if ($("profileDeliveryThemeLabel")) $("profileDeliveryThemeLabel").textContent = theme.label;
  document.querySelectorAll("#profileDeliveryThemePalette [data-theme-key]").forEach(button => {
    button.classList.toggle("is-selected", button.dataset.themeKey === key);
    button.setAttribute("aria-pressed", String(button.dataset.themeKey === key));
  });
  const preview = $("profileDeliveryThemePreview");
  if (preview) {
    preview.style.setProperty("--preview-primary", theme.primary);
    preview.style.setProperty("--preview-dark", theme.dark);
    preview.style.setProperty("--preview-soft", theme.soft);
    const name = state.deliveryProfileRecord?.name || "DELIVERY";
    const title = preview.querySelector(".delivery-theme-preview-header span");
    if (title) title.textContent = name;
  }
}

function selectDeliveryTheme(themeKey) {
  renderDeliveryThemeSelection(themeKey);
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
    renderDeliveryThemeSelection("HTPWEB");
    syncDeliveryPublicAccess(null);
    $("saveDeliveryProfileBtn").disabled = true;
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("deliveries")
      .select("id,name,slug,public_share_path,description,logo_url,phone,whatsapp,theme_key,active")
      .eq("id", deliveryId)
      .single();

    if (error) throw error;

    state.deliveryProfileRecord = data;
    $("profileDeliveryName").value = data.name || "";
    $("profileDeliverySlug").value = data.slug || "";
    $("profileDeliveryPhone").value = data.phone || "";
    $("profileDeliveryWhatsapp").value = data.whatsapp || "";
    $("profileDeliveryDescription").value = data.description || "";
    renderDeliveryThemeSelection(data.theme_key || "HTPWEB");
    syncDeliveryPublicAccess(data);
    $("saveDeliveryProfileBtn").disabled = false;
  } catch (e) {
    state.deliveryProfileRecord = null;
    syncDeliveryPublicAccess(null);
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

    await rpc("update_my_delivery_theme", {
      p_delivery_id: delivery.id,
      p_theme_key: $("profileDeliveryTheme")?.value || "HTPWEB"
    });

    message("Información y colores del DELIVERY actualizados.");
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
  return state.shareLocals.find(local => local.id === state.shareSelectedLocalId) || null;
}

function buildSharedLocalUrl(localId = null) {
  const delivery = currentShareDelivery();
  const local = localId
    ? state.shareLocals.find(item => item.id === localId)
    : currentShareLocal();
  if (!delivery?.slug || !local?.id) return "";
  const url = new URL("local.html", publicAppRootUrl());
  url.searchParams.set("delivery", delivery.slug);
  url.searchParams.set("local", local.id);
  return url.toString();
}

function buildShortSharedLocalUrl(localId = null) {
  const delivery = currentShareDelivery();
  const local = localId
    ? state.shareLocals.find(item => item.id === localId)
    : currentShareLocal();
  if (delivery?.public_share_path && local?.share_public_code) {
    return "https://htpweb.github.io/" +
      encodeURIComponent(delivery.public_share_path) + "/" +
      encodeURIComponent(local.share_public_code);
  }
  if (!local?.share_code) return buildSharedLocalUrl(localId);
  return new URL("../"+encodeURIComponent(local.share_code), publicAppRootUrl()).toString();
}

function shareLocalCategory(local) {
  return local?.business_category_name || "Otros";
}

function shareLocalCover(local) {
  return local?.first_gallery_image_url || local?.banner_url || local?.logo_url || "";
}

function renderShareCategoryFilters() {
  const box=$("shareCategoryFilters");
  if(!box)return;
  const categories=[...new Set((state.shareLocals||[]).map(shareLocalCategory).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
  const selected=state.shareCategoryFilter||"ALL";
  box.innerHTML=[
    '<button type="button" class="selection-button '+(selected==="ALL"?"is-selected":"")+'" data-share-category="ALL">Todos</button>',
    ...categories.map(name=>'<button type="button" class="selection-button '+(selected===name?"is-selected":"")+'" data-share-category="'+esc(name)+'">'+esc(name)+'</button>')
  ].join("");
  box.querySelectorAll("[data-share-category]").forEach(button=>{
    button.onclick=()=>{
      state.shareCategoryFilter=button.dataset.shareCategory;
      renderShareCategoryFilters();
      renderShareLocals();
    };
  });
}

function shareVisualFallback(label) {
  return '<div class="share-visual-fallback"><span>'+esc((label||"L").slice(0,1).toUpperCase())+'</span></div>';
}

function renderShareLocals() {
  const box=$("shareLocalsGrid");
  if(!box)return;
  const term=String($("shareSearch")?.value||"").trim().toLowerCase();
  const category=state.shareCategoryFilter||"ALL";
  const filtered=(state.shareLocals||[]).filter(local=>{
    const categoryName=shareLocalCategory(local);
    const matchCategory=category==="ALL"||categoryName===category;
    const text=[local.name,categoryName,local.description].filter(Boolean).join(" ").toLowerCase();
    return matchCategory&&(!term||text.includes(term));
  });
  if($("shareLocalCount"))$("shareLocalCount").textContent=filtered.length+" LOCAL"+(filtered.length===1?"":" disponibles");
  box.innerHTML=filtered.length?filtered.map(local=>{
    const cover=shareLocalCover(local);
    const count=Number(local.gallery_count||0);
    return '<article class="share-local-card" data-share-open-local="'+esc(local.id)+'">'+
      '<div class="share-local-banner">'+(cover?'<img src="'+esc(cover)+'" alt="" loading="lazy">':shareVisualFallback(local.name))+'</div>'+
      '<div class="share-local-card-body">'+
        '<div><strong>'+esc(local.name)+'</strong><div class="muted">'+esc(shareLocalCategory(local))+'</div>'+
        '<div class="muted">'+count+' foto'+(count===1?"":"s")+' en Galería</div></div>'+
        '<button type="button" class="btn-primary" data-share-open-gallery="'+esc(local.id)+'">Ver Galería</button>'+
      '</div>'+
    '</article>';
  }).join(""):'<div class="overview-empty">No hay LOCAL que coincidan con la búsqueda.</div>';
  box.querySelectorAll("[data-share-open-local]").forEach(card=>{
    card.onclick=e=>{
      if(e.target.closest("button"))return;
      openShareLocalGallery(card.dataset.shareOpenLocal);
    };
  });
  box.querySelectorAll("[data-share-open-gallery]").forEach(button=>{
    button.onclick=e=>{
      e.stopPropagation();
      openShareLocalGallery(button.dataset.shareOpenGallery);
    };
  });
}

async function loadShareModule() {
  if(!["MASTER","DELIVERY_ADMIN"].includes(state.role))return;
  const select=$("shareDelivery");
  if(!select)return;
  const previous=select.value;
  const available=state.deliveries.filter(delivery=>delivery.active!==false);
  select.innerHTML=available.length
    ?available.map(delivery=>'<option value="'+esc(delivery.id)+'">'+esc(delivery.name)+'</option>').join("")
    :'<option value="">No hay DELIVERY disponible</option>';
  if(previous&&available.some(delivery=>delivery.id===previous))select.value=previous;
  state.shareCategoryFilter="ALL";
  state.shareSelectedLocalId=null;
  $("shareBrowseView")?.classList.remove("hidden");
  $("shareGalleryView")?.classList.add("hidden");
  await loadShareLocals();
}

async function loadShareLocals() {
  const delivery=currentShareDelivery();
  state.shareLocals=[];
  state.shareGallery=[];
  if(!delivery){
    renderShareCategoryFilters();
    renderShareLocals();
    return;
  }
  try{
    const data=await rpc("delivery_share_locals",{p_delivery_id:delivery.id});
    state.shareLocals=Array.isArray(data)?data:[];
    renderShareCategoryFilters();
    renderShareLocals();
  }catch(e){
    message(e.message||"No se pudieron cargar los LOCAL para compartir.","error");
  }
}

function showShareBrowse() {
  state.shareSelectedLocalId=null;
  state.shareGallery=[];
  $("shareBrowseView")?.classList.remove("hidden");
  $("shareGalleryView")?.classList.add("hidden");
}

async function openShareLocalGallery(localId) {
  const delivery=currentShareDelivery();
  const local=state.shareLocals.find(item=>item.id===localId);
  if(!delivery||!local)return;
  state.shareSelectedLocalId=localId;
  $("shareBrowseView")?.classList.add("hidden");
  $("shareGalleryView")?.classList.remove("hidden");
  if($("shareGalleryLocalName"))$("shareGalleryLocalName").textContent=local.name||"LOCAL";
  if($("shareGalleryLocalMeta"))$("shareGalleryLocalMeta").textContent=shareLocalCategory(local)+" · "+Number(local.gallery_count||0)+" foto(s)";
  if($("shareGalleryGrid"))$("shareGalleryGrid").innerHTML='<div class="muted">Cargando Galería…</div>';
  try{
    const data=await rpc("delivery_share_local_gallery",{p_delivery_id:delivery.id,p_local_id:local.id});
    state.shareGallery=Array.isArray(data)?data:[];
    renderShareGallery();
  }catch(e){
    state.shareGallery=[];
    if($("shareGalleryGrid"))$("shareGalleryGrid").innerHTML='<div class="message error">'+esc(e.message||"No se pudo cargar la Galería.")+'</div>';
  }
}

function renderShareGallery() {
  const box=$("shareGalleryGrid");
  const local=currentShareLocal();
  if(!box||!local)return;
  box.innerHTML=state.shareGallery.length?state.shareGallery.map((image,index)=>
    '<article class="share-gallery-card">'+
      '<div class="share-gallery-image"><img src="'+esc(image.image_url)+'" alt="Foto '+(index+1)+' de '+esc(local.name)+'" loading="lazy"></div>'+
      '<div class="share-gallery-actions">'+
        '<button type="button" class="btn-primary" data-share-gallery-image="'+esc(image.id)+'">Compartir foto</button>'+
        '<button type="button" class="btn-muted" data-share-gallery-copy="'+esc(image.id)+'">Copiar Link</button>'+
      '</div>'+
    '</article>'
  ).join(""):'<div class="overview-empty">Este LOCAL todavía no tiene fotos en su Galería.</div>';

  box.querySelectorAll("[data-share-gallery-image]").forEach(button=>{
    button.onclick=()=>shareOriginalGalleryImage(button.dataset.shareGalleryImage);
  });
  box.querySelectorAll("[data-share-gallery-copy]").forEach(button=>{
    button.onclick=()=>copyShareLocalOrderLink();
  });
}

function shareLocalOrderPlainText(url = buildShortSharedLocalUrl()) {
  const delivery=currentShareDelivery();
  return url&&delivery?"PIDE AQUÍ | "+delivery.name+"\n"+url:"";
}

async function copyShareLocalOrderLink() {
  const url=buildShortSharedLocalUrl();
  if(!url)return;
  const plain=shareLocalOrderPlainText(url);
  try{
    if(navigator.clipboard?.write&&typeof ClipboardItem!=="undefined"){
      const html='<a href="'+esc(url)+'">PIDE AQUÍ</a>';
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain":new Blob([plain],{type:"text/plain"}),
        "text/html":new Blob([html],{type:"text/html"})
      })]);
    }else{
      await navigator.clipboard.writeText(plain);
    }
    message("PIDE AQUÍ copiado con enlace corto. En Estado de WhatsApp, pégalo sobre la foto con Texto / T.");
  }catch{
    try{
      await navigator.clipboard.writeText(plain);
      message("PIDE AQUÍ copiado con enlace corto. En Estado de WhatsApp, pégalo sobre la foto con Texto / T.");
    }catch{
      message("No se pudo copiar el enlace.","error");
    }
  }
}

function shareSafeFilename(value) {
  return String(value||"local")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-zA-Z0-9_-]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .toLowerCase()||"local";
}

async function imageBlobToJpeg(blob) {
  let source=null;
  try{
    if("createImageBitmap" in window){
      source=await createImageBitmap(blob);
    }else{
      source=await new Promise((resolve,reject)=>{
        const objectUrl=URL.createObjectURL(blob);
        const image=new Image();
        image.onload=()=>{URL.revokeObjectURL(objectUrl);resolve(image);};
        image.onerror=()=>{URL.revokeObjectURL(objectUrl);reject(new Error("No se pudo convertir la foto."));};
        image.src=objectUrl;
      });
    }

    const width=source.width||source.naturalWidth;
    const height=source.height||source.naturalHeight;
    if(!width||!height)throw new Error("La foto no tiene dimensiones válidas.");

    const canvas=document.createElement("canvas");
    canvas.width=width;
    canvas.height=height;
    const ctx=canvas.getContext("2d");
    ctx.fillStyle="#ffffff";
    ctx.fillRect(0,0,width,height);
    ctx.drawImage(source,0,0,width,height);

    return await new Promise((resolve,reject)=>{
      canvas.toBlob(
        jpeg=>jpeg?resolve(jpeg):reject(new Error("No se pudo convertir la foto a JPG.")),
        "image/jpeg",
        .95
      );
    });
  }finally{
    if(source&&typeof source.close==="function")source.close();
  }
}

async function galleryImageFile(image) {
  const response=await fetch(image.image_url,{mode:"cors",cache:"force-cache"});
  if(!response.ok)throw new Error("No se pudo preparar la foto.");
  const blob=await response.blob();
  const jpeg=await imageBlobToJpeg(blob);
  const local=currentShareLocal();
  const position=Math.max(0,state.shareGallery.findIndex(item=>item.id===image.id))+1;
  const name=shareSafeFilename(local?.name)+"-"+String(position).padStart(2,"0")+".jpg";
  return new File([jpeg],name,{type:"image/jpeg"});
}

function downloadOriginalFile(file) {
  const url=URL.createObjectURL(file);
  const a=document.createElement("a");
  a.href=url;
  a.download=file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function shareOriginalGalleryImage(imageId) {
  const image=state.shareGallery.find(item=>item.id===imageId);
  if(!image)return;
  try{
    const file=await galleryImageFile(image);
    const url=buildShortSharedLocalUrl();
    const plain=shareLocalOrderPlainText(url);

    if(plain&&navigator.clipboard?.writeText){
      void navigator.clipboard.writeText(plain).catch(()=>{});
    }

    const filePayload={files:[file]};
    const richPayload=plain?{files:[file],text:plain}:filePayload;
    const canShare=Boolean(navigator.share&&(!navigator.canShare||navigator.canShare(filePayload)));

    if(canShare){
      let sharedWithLink=false;
      if(plain&&(!navigator.canShare||navigator.canShare(richPayload))){
        try{
          await navigator.share(richPayload);
          sharedWithLink=true;
        }catch(error){
          if(error?.name==="AbortError")throw error;
        }
      }
      if(!sharedWithLink){
        await navigator.share(filePayload);
      }
      message(sharedWithLink
        ?"Foto + enlace corto enviados al menú Compartir."
        :"Foto compartida. El enlace corto quedó copiado por si WhatsApp no adjunta el texto.");
      return;
    }

    downloadOriginalFile(file);
    message("La foto se descargó y el enlace corto quedó copiado. Publícalos juntos en tu Estado.");
  }catch(e){
    if(e?.name==="AbortError")return;
    message(e.message||"No se pudo compartir la foto.","error");
  }
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
    await loadLocalCommerce().catch(error => {
      console.warn("No se pudo cargar la tienda del LOCAL.", error);
    });
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

function localStoreUrl(){
  const local=state.localProfileRecord;
  if(!local)return "";
  const key=local.slug||local.id;
  return "https://htpweb.github.io/htpweb/app/tienda.html?local="+encodeURIComponent(key);
}

function renderLocalStorePreview(){
  const box=$("localStorePreview");if(!box)return;
  const preset=$("localStorePreset")?.selectedOptions?.[0];
  const theme=$("localStoreTheme")?.selectedOptions?.[0];
  const primary=theme?.dataset?.primary||$("localStoreAccent")?.value||"#1466E8";
  const secondary=theme?.dataset?.secondary||"#0B1730";
  const background=theme?.dataset?.background||"#F6F9FF";
  const surface=theme?.dataset?.surface||"#FFFFFF";
  const text=theme?.dataset?.text||"#0B1730";
  const hero=$("localHeroTitle")?.value.trim()||state.localProfileRecord?.name||"Tu negocio";
  const subtitle=$("localHeroSubtitle")?.value.trim()||"Tu propuesta de valor, clara y profesional.";
  const catalog=$("localCatalogTitle")?.value.trim()||preset?.dataset?.catalog||"Productos / Servicios";
  const about=$("localAboutTitle")?.value.trim()||"Quiénes somos";
  const contact=$("localContactTitle")?.value.trim()||"Contacto";
  box.innerHTML='<div style="background:'+esc(background)+';color:'+esc(text)+';padding:14px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><strong>'+esc(state.localProfileRecord?.name||"LOCAL")+'</strong>'+
    '<small>Inicio · '+($("localShowAbout")?.checked?esc(about)+' · ':"")+($("localShowCatalog")?.checked?esc(catalog)+' · ':"")+($("localShowContact")?.checked?esc(contact):"")+'</small></div>'+
    '<div style="margin-top:12px;background:'+esc(surface)+';border-radius:12px;padding:16px;border-left:5px solid '+esc(primary)+'"><strong style="font-size:1.15rem">'+esc(hero)+'</strong><div style="color:'+esc(secondary)+';margin-top:4px">'+esc(subtitle)+'</div></div>'+
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px">'+
    ['Inicio',catalog,contact].map((x,i)=>'<div style="background:'+esc(surface)+';border-radius:10px;padding:10px;border:1px solid '+esc(primary)+'22"><small>'+esc(x)+'</small><div style="height:'+(i===0?22:34)+'px;background:'+esc(primary)+'18;border-radius:6px;margin-top:6px"></div></div>').join("")+
    '</div></div>';
}
function syncLocalPresetHelp(){
  const option=$("localStorePreset")?.selectedOptions?.[0];
  if($("localStorePresetHelp"))$("localStorePresetHelp").textContent=option?.dataset?.help||"";
  renderLocalStorePreview();
}

async function loadLocalCommerce(){
  if(state.role!=="LOCAL_ADMIN")return;
  const localId=$("profileLocal")?.value||state.localProfileRecord?.id;
  if(!localId)return;
  const [snapshot,presetRes,themeRes,deliveryOptions]=await Promise.all([
    rpc("local_commerce_snapshot",{p_local_id:localId}),
    supabaseClient.from("local_storefront_presets").select("code,name,business_fit,description,layout_family,default_catalog_mode,default_card_density,config").eq("active",true).order("display_order"),
    supabaseClient.from("local_storefront_themes").select("code,name,business_fit,primary_color,secondary_color,background_color,surface_color,text_color").eq("active",true).order("display_order"),
    rpc("my_local_delivery_options",{p_local_id:localId})
  ]);
  if(presetRes.error)throw presetRes.error;if(themeRes.error)throw themeRes.error;
  const settings=snapshot?.settings||{};
  const presets=presetRes.data||[],themes=themeRes.data||[];
  $("localStorePreset").innerHTML=presets.map(p=>`<option value="${esc(p.code)}" data-help="${esc(p.business_fit+" · "+(p.description||""))}" data-catalog="${esc(p.config?.catalog_label||"Productos / Servicios")}">${esc(p.name)}</option>`).join("");
  $("localStorePreset").value=settings.preset_code||"GENERAL_MODERN";
  $("localStoreTheme").innerHTML=themes.map(t=>`<option value="${esc(t.code)}" data-primary="${esc(t.primary_color)}" data-secondary="${esc(t.secondary_color)}" data-background="${esc(t.background_color)}" data-surface="${esc(t.surface_color)}" data-text="${esc(t.text_color)}" data-help="${esc(t.business_fit||"")}">${esc(t.name)}</option>`).join("");
  $("localStoreTheme").value=settings.theme_code||"HTPWEB_BLUE";
  $("localStoreCatalogMode").value=settings.catalog_mode||"CARDS";
  $("localStoreCardDensity").value=settings.card_density||"PHOTO";
  $("localStoreOrderMode").value=settings.order_mode||"WHATSAPP_ONLY";
  $("localStoreSurfaceStyle").value=settings.surface_style||"SOFT";
  $("localStoreAccent").value=settings.accent_color||"#111827";
  $("localStoreEnabled").checked=!!settings.storefront_enabled;
  $("localStorePickup").checked=settings.pickup_enabled!==false;
  $("localStoreOwnDelivery").checked=!!settings.own_delivery_enabled;
  $("localStoreHtpDelivery").checked=settings.htpweb_delivery_enabled!==false;
  const content=settings.content_config||{};
  $("localHeroTitle").value=content.hero_title||"";
  $("localHeroSubtitle").value=content.hero_subtitle||"";
  $("localAboutTitle").value=content.about_title||"Quiénes somos";
  $("localAboutText").value=content.about_text||"";
  $("localCatalogTitle").value=content.catalog_title||"";
  $("localContactTitle").value=content.contact_title||"Contacto";
  $("localShowAbout").checked=content.show_about!==false;
  $("localShowCatalog").checked=content.show_catalog!==false;
  $("localShowContact").checked=content.show_contact!==false;
  $("localShowPromotions").checked=content.show_promotions!==false;
  const themeOption=$("localStoreTheme").selectedOptions?.[0];
  $("localStoreThemeHelp").textContent=themeOption?.dataset?.help||"";
  if(!settings.accent_color&&themeOption?.dataset?.primary)$("localStoreAccent").value=themeOption.dataset.primary;

  const options=Array.isArray(deliveryOptions)?deliveryOptions:[];
  const linked=options.filter(x=>x.linked);
  $("localStorePrimaryDelivery").innerHTML='<option value="">Sin preferencia</option>'+linked.map(x=>`<option value="${x.delivery_id}">${esc(x.name)}</option>`).join("");
  $("localStorePrimaryDelivery").value=settings.primary_delivery_id||"";
  $("localStoreDeliveryOptions").innerHTML='<option value="">Seleccionar…</option>'+options.filter(x=>!x.linked).map(x=>`<option value="${x.delivery_id}">${esc(x.name)}${x.request_status==="PENDING"?" · solicitud pendiente":""}</option>`).join("");
  $("localCommerceState").textContent=snapshot?.owner_managed
    ? "LOCAL reclamado · "+(snapshot?.plan?.name||"plan vigente")+" · control del propietario"
    : snapshot?.claimed
      ? "LOCAL reclamado · requiere plan vigente para activar la tienda"
      : "LOCAL todavía no reclamado";
  syncLocalPresetHelp();
}

async function saveLocalCommerce(){
  try{
    const localId=$("profileLocal")?.value||state.localProfileRecord?.id;
    if(!localId)throw new Error("Selecciona un LOCAL.");
    const result=await rpc("save_my_local_commerce_settings",{
      p_local_id:localId,
      p_storefront_enabled:$("localStoreEnabled").checked,
      p_preset_code:$("localStorePreset").value,
      p_catalog_mode:$("localStoreCatalogMode").value,
      p_card_density:$("localStoreCardDensity").value,
      p_order_mode:$("localStoreOrderMode").value,
      p_pickup_enabled:$("localStorePickup").checked,
      p_own_delivery_enabled:$("localStoreOwnDelivery").checked,
      p_htpweb_delivery_enabled:$("localStoreHtpDelivery").checked,
      p_primary_delivery_id:$("localStorePrimaryDelivery").value||null,
      p_accent_color:$("localStoreAccent").value||null,
      p_surface_style:$("localStoreSurfaceStyle").value
    });
    await rpc("save_my_local_storefront_content",{
      p_local_id:localId,
      p_theme_code:$("localStoreTheme").value||"HTPWEB_BLUE",
      p_content_config:{
        hero_title:$("localHeroTitle").value.trim(),
        hero_subtitle:$("localHeroSubtitle").value.trim(),
        about_title:$("localAboutTitle").value.trim()||"Quiénes somos",
        about_text:$("localAboutText").value.trim(),
        catalog_title:$("localCatalogTitle").value.trim(),
        contact_title:$("localContactTitle").value.trim()||"Contacto",
        show_about:$("localShowAbout").checked,
        show_catalog:$("localShowCatalog").checked,
        show_contact:$("localShowContact").checked,
        show_promotions:$("localShowPromotions").checked
      }
    });
    message("Página web y configuración comercial guardadas.");
    await loadLocalCommerce();
    return result;
  }catch(e){message(e.message||"No se pudo guardar la tienda.","error");}
}

async function requestLocalDelivery(){
  try{
    const localId=$("profileLocal")?.value||state.localProfileRecord?.id;
    const deliveryId=$("localStoreDeliveryOptions").value;
    if(!localId||!deliveryId)throw new Error("Selecciona un DELIVERY.");
    await rpc("request_local_delivery_partnership",{p_local_id:localId,p_delivery_id:deliveryId,p_note:null});
    message("Solicitud de vinculación enviada al DELIVERY.");
    await loadLocalCommerce();
  }catch(e){message(e.message||"No se pudo solicitar el DELIVERY.","error");}
}

function showLocalStoreQr(){
  const url=localStoreUrl();
  if(!url)return message("Selecciona un LOCAL.","error");
  if(typeof QRCode==="undefined")return message("No se pudo cargar el generador QR.","error");
  const box=$("localStoreQr"),panel=$("localStoreQrPanel");
  box.innerHTML="";panel.classList.remove("hidden");
  new QRCode(box,{text:url,width:220,height:220,correctLevel:QRCode.CorrectLevel.H});
}

function localAdminSelectOptions(){
  return (state.locals||[]).map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join("");
}

async function loadLocalGrowthAnalytics(localId){
  if(!$("localGrowthAnalytics")||!localId)return;
  try{
    const data=await rpc("analytics_local_growth_summary",{p_local_id:localId,p_from:null,p_to:null})||{};
    const sources=Object.entries(data.sources||{}).sort((a,b)=>Number(b[1])-Number(a[1]));
    $("localGrowthAnalytics").innerHTML=
      '<div class="subscription-kpis">'+
      '<div><small>Visitas tienda</small><strong>'+esc(data.local_views||0)+'</strong></div>'+
      '<div><small>Productos vistos</small><strong>'+esc(data.product_views||0)+'</strong></div>'+
      '<div><small>Checkout</small><strong>'+esc(data.checkout_views||0)+'</strong></div>'+
      '<div><small>Pedidos WhatsApp</small><strong>'+esc(data.whatsapp_orders||0)+'</strong></div>'+
      '</div>'+
      '<h4 style="margin-top:16px">Origen</h4>'+
      (sources.length?'<div class="table-wrap"><table><thead><tr><th>Fuente</th><th>Eventos</th></tr></thead><tbody>'+
        sources.map(([s,n])=>'<tr><td>'+esc(s)+'</td><td>'+esc(n)+'</td></tr>').join("")+'</tbody></table></div>':'<div class="muted">Todavía no hay tráfico medido.</div>')+
      '<h4 style="margin-top:16px">Productos más vistos</h4>'+
      ((data.top_products||[]).length?'<div class="table-wrap"><table><thead><tr><th>Producto</th><th>Vistas</th></tr></thead><tbody>'+
        data.top_products.map(p=>'<tr><td>'+esc(p.name)+'</td><td>'+esc(p.views)+'</td></tr>').join("")+'</tbody></table></div>':'<div class="muted">Sin vistas de producto todavía.</div>');
  }catch(e){$("localGrowthAnalytics").innerHTML='<div class="error">'+esc(e.message||"No se pudo cargar Analytics.")+'</div>';}
}

async function loadLocalMarketing(){
  if(state.role!=="LOCAL_ADMIN")return;
  const select=$("marketingLocal");if(!select)return;
  const previous=select.value;
  select.innerHTML=localAdminSelectOptions();
  if(previous&&(state.locals||[]).some(l=>l.id===previous))select.value=previous;
  const localId=select.value||state.locals?.[0]?.id;
  if(!localId){$("marketingResult").innerHTML='<div class="muted">No tienes LOCAL asignados.</div>';return;}
  select.value=localId;
  const [productsRes,content]=await Promise.all([
    supabaseClient.from("products").select("id,name").eq("local_id",localId).eq("active",true).order("name"),
    rpc("my_local_social_content",{p_local_id:localId})
  ]);
  if(productsRes.error)throw productsRes.error;
  $("marketingProduct").innerHTML='<option value="">Sin producto específico</option>'+(productsRes.data||[]).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
  const rows=Array.isArray(content)?content:[];
  $("marketingResult").innerHTML=rows.length?'<div class="table-wrap"><table><thead><tr><th>Red</th><th>Contenido</th><th>Campaña</th></tr></thead><tbody>'+
    rows.map(x=>'<tr><td>'+esc(x.platform)+'</td><td>'+esc(x.title||x.external_url||"—")+'</td><td>'+esc(x.campaign_code||"—")+'</td></tr>').join("")+'</tbody></table></div>':'<div class="muted">Aún no has vinculado contenido social.</div>';
  await loadLocalGrowthAnalytics(localId);
}

async function saveLocalMarketing(){
  try{
    const localId=$("marketingLocal").value;if(!localId)throw new Error("Selecciona un LOCAL.");
    await rpc("save_my_local_social_content",{
      p_local_id:localId,p_content_id:null,p_platform:$("marketingPlatform").value,
      p_external_url:$("marketingExternalUrl").value.trim()||null,p_product_id:$("marketingProduct").value||null,
      p_promotion_id:null,p_campaign_code:$("marketingCampaign").value.trim()||null,
      p_title:$("marketingTitle").value.trim()||null,p_active:true
    });
    message("Contenido de marketing guardado.");
    await loadLocalMarketing();
  }catch(e){message(e.message||"No se pudo guardar Marketing.","error");}
}

async function localMarketingTrackedUrl(){
  const localId=$("marketingLocal").value;if(!localId)throw new Error("Selecciona un LOCAL.");
  const snapshot=await rpc("local_commerce_snapshot",{p_local_id:localId});
  const key=snapshot?.slug||localId;
  const url=new URL("https://htpweb.github.io/htpweb/app/tienda.html");
  url.searchParams.set("local",key);
  url.searchParams.set("src",String($("marketingPlatform").value||"OTHER").toLowerCase());
  const campaign=$("marketingCampaign").value.trim();if(campaign)url.searchParams.set("campaign",campaign);
  const productId=$("marketingProduct").value;if(productId)url.searchParams.set("product",productId);
  return url.toString();
}

async function copyLocalMarketingLink(){
  try{const url=await localMarketingTrackedUrl();await navigator.clipboard.writeText(url);message("Link medible copiado.");}
  catch(e){message(e.message||"No se pudo copiar el link.","error");}
}

async function loadLocalInventory(){
  if(state.role!=="LOCAL_ADMIN")return;
  const select=$("inventoryLocal");if(!select)return;
  const previous=select.value;select.innerHTML=localAdminSelectOptions();
  if(previous&&(state.locals||[]).some(l=>l.id===previous))select.value=previous;
  const localId=select.value||state.locals?.[0]?.id;
  if(!localId){$("localInventoryList").innerHTML='<div class="muted">No tienes LOCAL asignados.</div>';return;}
  select.value=localId;
  try{
    const [pRes,vRes,current]=await Promise.all([
      supabaseClient.from("products").select("id,name,sku").eq("local_id",localId).eq("active",true).order("name"),
      supabaseClient.from("product_variants").select("id,product_id,name").eq("active",true).order("name"),
      rpc("my_local_inventory_snapshot",{p_local_id:localId})
    ]);
    if(pRes.error)throw pRes.error;if(vRes.error)throw vRes.error;
    const products=pRes.data||[],ids=new Set(products.map(p=>p.id)),variants=(vRes.data||[]).filter(v=>ids.has(v.product_id)),map=new Map((current||[]).map(x=>[x.product_id+":"+(x.variant_id||""),x]));
    const rows=[];
    products.forEach(p=>{
      const pv=variants.filter(v=>v.product_id===p.id);
      const targets=pv.length?pv.map(v=>({p,v})): [{p,v:null}];
      targets.forEach(({p,v})=>{
        const k=p.id+":"+(v?.id||""),s=map.get(k)||{};
        rows.push('<tr data-inventory-row data-product="'+p.id+'" data-variant="'+(v?.id||"")+'"><td><strong>'+esc(p.name)+'</strong>'+(v?'<small style="display:block">'+esc(v.name)+'</small>':'')+'</td>'+
          '<td><input data-track type="checkbox" style="width:auto" '+(s.track_stock?'checked':'')+'></td>'+
          '<td><input data-qty type="number" min="0" value="'+esc(s.available_qty??0)+'" style="max-width:110px"></td>'+
          '<td><input data-low type="number" min="0" value="'+esc(s.low_stock_threshold??0)+'" style="max-width:110px"></td>'+
          '<td><button class="btn-muted" data-save-stock type="button">Guardar</button></td></tr>');
      });
    });
    $("localInventoryList").innerHTML=rows.length?'<div class="table-wrap"><table><thead><tr><th>Producto / variante</th><th>Control</th><th>Disponible</th><th>Alerta</th><th></th></tr></thead><tbody>'+rows.join("")+'</tbody></table></div>':'<div class="muted">No hay productos activos.</div>';
    $("localInventoryList").querySelectorAll("[data-save-stock]").forEach(b=>b.onclick=()=>saveInventoryRow(localId,b.closest("[data-inventory-row]")));
  }catch(e){$("localInventoryList").innerHTML='<div class="error">'+esc(e.message||"No se pudo cargar inventario.")+'</div>';}
}

async function saveInventoryRow(localId,row){
  try{
    await rpc("save_my_local_inventory",{
      p_local_id:localId,p_product_id:row.dataset.product,p_variant_id:row.dataset.variant||null,
      p_track_stock:row.querySelector("[data-track]").checked,p_available_qty:Number(row.querySelector("[data-qty]").value||0),
      p_low_stock_threshold:Number(row.querySelector("[data-low]").value||0)
    });
    message("Inventario actualizado.");
  }catch(e){message(e.message||"No se pudo guardar inventario.","error");}
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

const orderControlState={
  selectedId:null,
  drivers:new Map(),
  snapshots:new Map(),
  dispatches:new Map(),
  map:null,
  layers:null,
  routeCache:new Map(),
  routeGeneration:0,
  trackingChannel:null,
  trackingTopic:null,
  driverTrails:new Map(),
  driverMarkerPositions:new Map(),
  timer:null,
  loading:false,
  lastSync:null
};

const orderControlActiveStatuses=new Set(["PENDING","CONFIRMED","PREPARING","READY","EN_ROUTE"]);

function orderStatusLabel(status){
  const labels={
    PENDING:"Pendiente",
    CONFIRMED:"Confirmado",
    PREPARING:"Preparando",
    READY:"Listo",
    EN_ROUTE:"En camino",
    DELIVERED:"Entregado",
    CANCELLED:"Cancelado"
  };
  return labels[status]||status||"—";
}

function orderTransitionLabel(status){
  const labels={
    CONFIRMED:"Confirmar pedido",
    PREPARING:"Marcar preparando",
    READY:"Marcar listo",
    EN_ROUTE:"Marcar en camino",
    DELIVERED:"Marcar entregado",
    CANCELLED:"Cancelar pedido"
  };
  return labels[status]||orderStatusLabel(status);
}

function orderControlRef(orderId){
  return String(orderId||"").replace(/-/g,"").slice(0,8).toUpperCase();
}

function orderControlMoney(value){
  return "$"+Number(value||0).toFixed(2);
}

function orderControlTime(value){
  if(!value)return "—";
  const d=new Date(value);
  return Number.isNaN(d.valueOf())?"—":d.toLocaleString();
}

function orderControlAge(value){
  if(!value)return "—";
  const ms=Math.max(0,Date.now()-new Date(value).getTime());
  if(!Number.isFinite(ms))return "—";
  const min=Math.floor(ms/60000);
  if(min<1)return "ahora";
  if(min<60)return "hace "+min+" min";
  const h=Math.floor(min/60);
  if(h<24)return "hace "+h+" h "+(min%60)+" min";
  return "hace "+Math.floor(h/24)+" d";
}

function orderControlCurrentSince(order){
  const field={
    PENDING:"created_at",
    CONFIRMED:"confirmed_at",
    PREPARING:"preparing_at",
    READY:"ready_at",
    EN_ROUTE:"en_route_at",
    DELIVERED:"delivered_at",
    CANCELLED:"cancelled_at"
  }[order?.status]||"created_at";
  return order?.[field]||order?.created_at||null;
}

function orderControlNormalize(order){
  const locals=(Array.isArray(order?.locals)?order.locals:[]).map(item=>({
    ...item,
    locals:item.local||item.locals||{}
  }));
  const items=Array.isArray(order?.items)?order.items:[];
  return {
    ...order,
    order_locals:locals,
    order_items:items
  };
}

function orderControlToggleLegacy(legacy){
  const kpis=$("orderControlKpis");
  const detail=$("orderControlDetail");
  const mapCard=$("orderControlMap")?.closest(".order-control-map-card");
  const toolbar=$("orderControlFilter")?.closest(".order-control-toolbar");
  if(kpis)kpis.classList.toggle("hidden",legacy);
  if(detail)detail.classList.toggle("hidden",legacy);
  if(mapCard)mapCard.classList.toggle("hidden",legacy);
  if(toolbar)toolbar.classList.toggle("hidden",legacy);
  const layout=document.querySelector("#section-orders .order-control-layout");
  if(layout)layout.style.gridTemplateColumns=legacy?"1fr":"";
}

async function loadOrdersLegacy(){
  let query = supabaseClient
    .from("orders")
    .select("id,delivery_id,status,total,customer_name,customer_phone,delivery_address,notes,created_at,order_items(local_id,product_name,variant_name,quantity,subtotal,promotion_id,promotion_title),order_locals(id,local_id,status,subtotal,delivery_fee,locals(id,name,whatsapp))")
    .order("created_at", { ascending: false })
    .limit(100);

  const scope = $("orderScope")?.value || "";
  const { data, error } = await query;
  if (error) {
    $("ordersList").innerHTML = `<div class="message error">${esc(error.message)}</div>`;
    return;
  }

  state.orders = data || [];
  let rows = state.orders;
  if (scope) {
    rows = rows.filter(order =>
      (order.order_locals || []).some(ol => ol.local_id === scope)
    );
  }
  $("ordersList").innerHTML = rows.length ? rows.map(renderOrder).join("") : '<div class="muted">No hay pedidos visibles.</div>';
}

function orderControlDeliveryIds(){
  const scope=$("orderScope")?.value||"";
  if(scope&&state.role!=="LOCAL_ADMIN")return [scope];
  return (state.deliveries||[]).filter(d=>d.active!==false).map(d=>d.id);
}

function orderControlFilteredOrders(){
  const filter=$("orderControlFilter")?.value||"ACTIVE";
  const search=($("orderControlSearch")?.value||"").trim().toLowerCase();
  return (state.orders||[]).filter(order=>{
    if(filter==="ACTIVE"&&!orderControlActiveStatuses.has(order.status))return false;
    if(filter==="HISTORY"&&!["DELIVERED","CANCELLED"].includes(order.status))return false;
    if(filter!=="ALL"&&filter!=="ACTIVE"&&filter!=="HISTORY"&&order.status!==filter)return false;
    if(!search)return true;
    const localNames=(order.order_locals||[]).map(x=>x.locals?.name||"").join(" ");
    const itemNames=(order.order_items||[]).map(x=>x.product_name||"").join(" ");
    const haystack=[
      order.id,orderControlRef(order.id),order.customer_name,order.customer_phone,
      order.delivery_address,order.address_reference,localNames,itemNames
    ].join(" ").toLowerCase();
    return haystack.includes(search);
  });
}

function orderControlSetView(filter){
  const select=$("orderControlFilter");
  const search=$("orderControlSearch");
  if(select)select.value=filter;
  if(search)search.value="";
  orderControlState.selectedId=null;
  renderOrderControl();
}

function orderControlClearView(){
  orderControlSetView("ACTIVE");
  message("Vista operativa limpia. Los pedidos cerrados permanecen en Historial.");
}

function orderControlCurrentDeliveryId(){
  const scoped=$("orderScope")?.value||"";
  if(scoped&&state.role!=="LOCAL_ADMIN")return scoped;
  const selected=(state.orders||[]).find(o=>o.id===orderControlState.selectedId);
  if(selected?.delivery_id)return selected.delivery_id;
  const ids=orderControlDeliveryIds();
  return ids.length===1?ids[0]:null;
}

function renderOrderControlModeBar(){
  const box=$("orderControlModeBar");if(!box)return;
  const deliveryId=orderControlCurrentDeliveryId();
  if(!deliveryId){
    box.innerHTML='<div class="workspace-note">Selecciona un DELIVERY para definir el modo de operación.</div>';
    return;
  }
  const dispatch=orderControlState.dispatches.get(deliveryId)||{};
  const mode=dispatch.mode||"NONE";
  const allowed=Array.isArray(dispatch.allowed_modes)?dispatch.allowed_modes:[];
  const canChange=state.role==="DELIVERY_ADMIN";
  const definitions=[
    {code:"MANUAL",label:"Manual",desc:"Tú confirmas envíos, asignaciones y cambios."},
    {code:"HYBRID",label:"Híbrido",desc:"HTPWEB propone y prepara; tú apruebas antes de enviar o cambiar."},
    {code:"AUTO",label:"Automático",desc:"HTPWEB envía, preasigna y asigna sin esperar confirmación."}
  ];
  box.innerHTML='<div class="order-control-mode-title"><div><strong>Modo de operación</strong><span>Define cuánto automatiza HTPWEB.</span></div><span class="badge">'+esc(({MANUAL:"Manual",HYBRID:"Híbrido",AUTO:"Automático",NONE:"No disponible"})[mode]||mode)+'</span></div>'+
    '<div class="order-control-mode-options">'+definitions.map(item=>{
      const enabled=allowed.includes(item.code);
      return '<button type="button" class="order-control-mode-option '+(mode===item.code?'active ':'')+(!enabled?'disabled':'')+'" data-order-mode="'+esc(item.code)+'" '+(!canChange||!enabled?'disabled':'')+'>'+
        '<strong>'+esc(item.label)+'</strong><span>'+esc(item.desc)+'</span></button>';
    }).join("")+'</div>'+
    (canChange?'':'<small class="muted">Solo el administrador del DELIVERY puede cambiar este modo.</small>');

  box.querySelectorAll("[data-order-mode]").forEach(btn=>{
    btn.onclick=()=>orderControlSetOperationMode(btn.dataset.orderMode);
  });
}

async function orderControlSetOperationMode(mode){
  const deliveryId=orderControlCurrentDeliveryId();
  if(!deliveryId)return;
  try{
    await rpc("delivery_set_dispatch_mode",{p_delivery_id:deliveryId,p_mode:mode});
    const whatsappMode=mode==="MANUAL"?"ASSISTED":"AUTOMATIC";
    try{
      await rpc("delivery_set_whatsapp_settings",{
        p_delivery_id:deliveryId,
        p_mode:whatsappMode,
        p_local_orders:true,
        p_driver_dispatch:true,
        p_customer_orders:true
      });
    }catch(e){
      console.warn("No se pudo sincronizar el modo de WhatsApp.",e);
    }
    message("Modo de operación cambiado a "+({MANUAL:"Manual",HYBRID:"Híbrido",AUTO:"Automático"}[mode]||mode)+".");
    await loadOrders({silent:true});
  }catch(e){
    message(e.message||"No se pudo cambiar el modo de operación.","error");
  }
}

function renderOrderControlKpis(){
  const box=$("orderControlKpis");if(!box)return;
  const orders=state.orders||[];
  const active=orders.filter(o=>orderControlActiveStatuses.has(o.status));
  const count=status=>orders.filter(o=>o.status===status).length;
  const unassigned=orders.filter(o=>o.status==="READY"&&!o.assignment).length;
  const preassigned=orders.filter(o=>o.driver_plan?.status==="PLANNED"&&!o.assignment).length;
  const activeValue=active.reduce((sum,o)=>sum+Number(o.total||0),0);
  box.innerHTML=[
    {label:"Activos",value:active.length,detail:orderControlMoney(activeValue)+" en operación",cls:"order-control-kpi-active",icon:"▣"},
    {label:"Pendientes",value:count("PENDING"),detail:"Esperando aceptación",cls:"order-control-kpi-attention",icon:"◷"},
    {label:"Preparando",value:count("PREPARING"),detail:"Locales trabajando",cls:"order-control-kpi-preparing",icon:"◉"},
    {label:"Preasignados",value:preassigned,detail:"Reservados, aún sin aviso al repartidor",cls:"order-control-kpi-preparing",icon:"⌛"},
    {label:"Listos",value:count("READY"),detail:"Listos para despacho",cls:"order-control-kpi-ready",icon:"◇"},
    {label:"En camino",value:count("EN_ROUTE"),detail:"Con repartidor",cls:"order-control-kpi-route",icon:"➜"},
    {label:"Sin repartidor",value:unassigned,detail:"Pedidos listos por asignar",cls:unassigned?"order-control-kpi-unassigned order-control-kpi-attention":"order-control-kpi-unassigned",icon:"!"}
  ].map(k=>`<div class="order-control-kpi ${k.cls}">
    <div class="order-control-kpi-icon" aria-hidden="true">${esc(k.icon)}</div>
    <div class="order-control-kpi-copy"><span>${esc(k.label)}</span><strong>${esc(k.value)}</strong><small>${esc(k.detail)}</small></div>
  </div>`).join("");
}

function renderOrderControlQueue(){
  const box=$("ordersList");if(!box)return;
  const rows=orderControlFilteredOrders();
  const meta=$("orderControlQueueMeta");
  if(meta)meta.textContent=rows.length+" pedido"+(rows.length===1?"":"s")+" en la vista";
  box.innerHTML=rows.length?rows.map(order=>{
    const selected=order.id===orderControlState.selectedId;
    const locals=(order.order_locals||[]).map(x=>x.locals?.name||"LOCAL").join(", ");
    const assignment=order.assignment;
    const flags=[
      order.driver_plan?.status==="PLANNED"&&!assignment?'<span class="badge">Preasignado · '+esc(order.driver_plan.driver_name||"Repartidor")+'</span>':"",
      order.status==="READY"&&!assignment?'<span class="badge">Sin repartidor</span>':"",
      assignment?'<span class="badge">Asignado · '+esc(assignment.driver_name||"Repartidor")+'</span>':""
    ].join("");
    return `<button class="order-control-order-row ${selected?"selected":""}" type="button" data-order-control-id="${esc(order.id)}">
      <div class="order-control-order-head">
        <div>
          <div class="order-control-order-ref">#${esc(orderControlRef(order.id))}</div>
          <div class="muted">${esc(orderControlAge(order.created_at))}</div>
        </div>
        <span class="badge status-${esc(order.status)}">${esc(orderStatusLabel(order.status))}</span>
      </div>
      <div class="order-control-order-meta">
        <span><strong>${esc(order.customer_name||"Cliente")}</strong> · ${esc(orderControlMoney(order.total))}</span>
        <span>${esc(locals||"Sin locales")}</span>
        <span class="order-control-age-line">Estado ${esc(orderControlAge(orderControlCurrentSince(order)))}</span>
      </div>
      <div class="order-control-order-flags">${flags}</div>
    </button>`;
  }).join(""):'<div class="muted">No hay pedidos que coincidan con este filtro.</div>';

  box.querySelectorAll("[data-order-control-id]").forEach(btn=>btn.onclick=()=>{
    selectOrderControl(btn.dataset.orderControlId);
  });
}

function orderControlDriverList(order){
  const snapshot=orderControlState.drivers.get(order?.delivery_id)||{};
  return Array.isArray(snapshot?.drivers)?snapshot.drivers:[];
}

function orderControlGpsAge(location){
  if(!location?.captured_at)return null;
  const ms=Date.now()-new Date(location.captured_at).getTime();
  return Number.isFinite(ms)?Math.max(0,ms):null;
}

function orderControlNextAction(order){
  if(!order)return null;
  const activeLocals=(order.order_locals||[]).filter(ol=>ol.status!=="CANCELLED");
  const unsent=activeLocals.filter(ol=>!ol.prep_requested_at);
  const waiting=activeLocals.filter(ol=>ol.prep_requested_at&&!ol.prep_response_at);
  const responded=activeLocals.filter(ol=>ol.prep_response_at);
  const preassigned=order.driver_plan?.status==="PLANNED"&&!order.assignment;

  if(order.status==="PENDING")return {step:1,total:7,title:"Confirmar pedido",description:"Revisa cliente, dirección, productos y total. Al confirmar, HTPWEB enviará automáticamente cada parte del pedido al LOCAL correspondiente por WhatsApp.",kind:"transition",nextStatus:"CONFIRMED",button:"Confirmar pedido"};

  if(order.status==="CONFIRMED"&&unsent.length){
    return {step:2,total:7,title:"Enviando a los locales",description:"HTPWEB está enviando automáticamente el pedido por WhatsApp. Si algún envío falla, podrás reintentarlo desde ese LOCAL.",kind:"waiting",button:"Ver locales"};
  }

  if(order.status==="CONFIRMED"&&waiting.length){
    return {step:3,total:7,title:"Esperando tiempo del LOCAL",description:"El LOCAL ya recibió el pedido. Debe responder directamente por WhatsApp con los minutos de preparación.",kind:"waiting",button:"Ver locales"};
  }

  if(order.status==="CONFIRMED"&&responded.length){
    return {step:4,total:7,title:"Analizando preasignación",description:"HTPWEB ya recibió tiempos de preparación y está buscando el repartidor más conveniente según disponibilidad y ubicación.",kind:"dispatch_plan",button:"Ver reparto"};
  }

  if(order.status==="PREPARING"&&order.assignment){
    return {step:5,total:7,title:"Repartidor asignado",description:"El repartidor ya recibió el aviso por WhatsApp y debe abrir HTPWEB para gestionar la recogida. El LOCAL continúa preparando.",kind:"dispatch_plan",button:"Ver reparto"};
  }

  if(order.status==="PREPARING"&&preassigned){
    return {step:4,total:7,title:"Pedido preasignado",description:"HTPWEB reservó un repartidor. Aún no fue avisado; la asignación se activará cerca de la hora calculada de salida, siempre que esté libre.",kind:"dispatch_plan",button:"Ver preasignación"};
  }

  if(order.status==="PREPARING"){
    return {step:4,total:7,title:"Buscando repartidor",description:"El pedido está en preparación. HTPWEB está calculando la mejor preasignación según tiempos, ubicación y disponibilidad.",kind:"dispatch_plan",button:"Ver reparto"};
  }

  if(order.status==="READY"&&!order.assignment)return {step:5,total:7,title:"Asignar repartidor",description:"El pedido está listo y aún no tiene repartidor. Revisa la disponibilidad para despacharlo.",kind:"dispatch",button:"Ir a asignación"};
  if(order.status==="READY"&&order.assignment)return {step:5,total:7,title:"Recogida activa",description:"El pedido está listo y ya tiene repartidor asignado.",kind:"dispatch",button:"Ver recogida"};
  if(order.status==="EN_ROUTE")return {step:6,total:7,title:"Supervisar entrega",description:"El pedido está en camino. Sigue la ubicación del repartidor y el avance de la entrega.",kind:"map",button:"Ver seguimiento"};
  if(order.status==="DELIVERED")return {step:7,total:7,title:"Pedido completado",description:"La entrega fue finalizada. El historial queda disponible para consulta y trazabilidad.",kind:"done"};
  if(order.status==="CANCELLED")return {step:0,total:7,title:"Pedido cancelado",description:"Este pedido ya no forma parte de la operación activa.",kind:"cancelled"};
  return null;
}

function renderOrderControlNextAction(order,canOperate){
  const action=orderControlNextAction(order);
  if(!action)return "";
  let button="";
  if(canOperate&&action.kind==="transition"){
    button=`<button class="btn-primary order-control-next-button" type="button" onclick="changeGlobalOrder('${order.id}','${action.nextStatus}')">${esc(action.button)} <span aria-hidden="true">→</span></button>`;
  }else if(action.kind==="local_request"||action.kind==="waiting"){
    button=`<button class="btn-primary order-control-next-button" type="button" onclick="document.getElementById('orderControlLocalsPanel')?.scrollIntoView({behavior:'smooth',block:'center'})">${esc(action.button)} <span aria-hidden="true">→</span></button>`;
  }else if(action.kind==="dispatch"||action.kind==="dispatch_plan"){
    button=`<button class="btn-primary order-control-next-button" type="button" onclick="document.getElementById('orderControlDispatchPanel')?.scrollIntoView({behavior:'smooth',block:'center'})">${esc(action.button)} <span aria-hidden="true">→</span></button>`;
  }else if(action.kind==="driver"&&order.assignment){
    button=`<button class="btn-primary order-control-next-button" type="button" onclick="orderControlNotifyDriver('${order.id}')">${esc(action.button)} <span aria-hidden="true">→</span></button>`;
  }else if(action.kind==="map"){
    button=`<button class="btn-primary order-control-next-button" type="button" onclick="orderControlFocusMap('${order.id}')">${esc(action.button)} <span aria-hidden="true">→</span></button>`;
  }
  const tone=action.kind==="done"?"is-done":action.kind==="cancelled"?"is-cancelled":"";
  return `<aside class="order-control-next-action ${tone}">
    <div class="order-control-next-head"><strong>⚡ Siguiente acción</strong><span>${action.step?`Paso ${action.step} de ${action.total}`:"Flujo detenido"}</span></div>
    <h3>${esc(action.title)}</h3>
    <p>${esc(action.description)}</p>
    ${button}
  </aside>`;
}

function renderOrderControlStepper(order){
  if(order?.status==="CANCELLED"){
    return '<div class="order-control-cancelled-flow"><strong>Pedido cancelado</strong><span>El flujo operativo terminó.</span></div>';
  }

  const pickups=(order?.order_locals||[]).map(ol=>ol.pickup_status||"PENDING");
  const hasPickupProgress=pickups.some(status=>status==="ARRIVED"||status==="PICKED_UP");
  let current=0;
  if(order?.status!=="PENDING")current=1;
  if(["PREPARING","READY","EN_ROUTE","DELIVERED"].includes(order?.status))current=2;
  if(order?.driver_plan?.status==="PLANNED")current=Math.max(current,3);
  if(order?.assignment)current=Math.max(current,4);
  if(hasPickupProgress)current=Math.max(current,5);
  if(order?.status==="EN_ROUTE")current=6;
  if(order?.status==="DELIVERED")current=7;

  const steps=[
    "Recibido",
    "Aceptado",
    "Preparando",
    "Preasignado",
    "Asignado",
    "Recogiendo",
    "En camino",
    "Entregado"
  ];

  return '<div class="order-control-ribbon" aria-label="Avance del pedido">'+steps.map((label,index)=>{
    const stateClass=index<current?"done":index===current?"active":"future";
    return '<div class="order-control-ribbon-step '+stateClass+'">'+
      '<span class="order-control-ribbon-node">'+(index<current?"✓":index+1)+'</span>'+
      '<strong>'+esc(label)+'</strong>'+
    '</div>';
  }).join("")+'</div>';
}

function orderControlDriverLocationText(driver){
  const loc=driver?.location;
  if(!loc)return "Sin ubicación reciente";
  const reference=loc.zone_name||loc.zone_description||"";
  if(reference)return reference+" · "+orderControlAge(loc.captured_at);
  if(orderControlValidPoint(loc.latitude,loc.longitude)){
    return Number(loc.latitude).toFixed(5)+", "+Number(loc.longitude).toFixed(5)+" · "+orderControlAge(loc.captured_at);
  }
  return "Ubicación "+orderControlAge(loc.captured_at);
}

function renderOrderControlDriverSummary(order){
  const drivers=orderControlDriverList(order);
  if(!drivers.length)return '<div class="muted">No hay repartidores operativos.</div>';
  return '<div class="order-control-driver-summary">'+drivers.map(driver=>{
    const active=Number(driver.active_orders||0);
    const stateLabel=active>0?"Ocupado":"Libre";
    const stateClass=active>0?"busy":"free";
    return '<div class="order-control-driver-card">'+
      '<div class="row between" style="gap:8px"><strong>'+esc(driver.full_name||"Repartidor")+'</strong>'+
      '<span class="order-control-driver-state '+stateClass+'">'+esc(stateLabel)+'</span></div>'+
      '<div class="muted">'+esc(orderControlDriverLocationText(driver))+'</div>'+
      '<small>'+esc(active)+' pedido'+(active===1?"":"s")+' activo'+(active===1?"":"s")+'</small>'+
    '</div>';
  }).join("")+'</div>';
}

async function orderControlSendPendingLocals(orderId){
  const order=(state.orders||[]).find(o=>o.id===orderId);
  if(!order)return;
  const pending=(order.order_locals||[]).filter(ol=>ol.status!=="CANCELLED"&&!ol.prep_requested_at&&ol.locals?.whatsapp);
  if(!pending.length){
    message("No hay envíos pendientes a LOCAL.");
    return;
  }
  for(const local of pending){
    await sendLocalOrderWhatsapp(order.id,local.local_id);
  }
  await loadOrders({silent:true});
}

function orderControlCompactDispatchPanel(order,canOperate){
  const drivers=orderControlDriverList(order);
  const assignment=order.assignment||null;
  const plan=order.driver_plan||null;
  const suggestion=order.driver_suggestion||null;
  const mode=order.dispatch_mode||orderControlState.dispatches.get(order.delivery_id)?.mode||"MANUAL";
  const modeLabel={MANUAL:"Manual",HYBRID:"Híbrido",AUTO:"Automático"}[mode]||mode;

  if(assignment){
    const driver=drivers.find(d=>d.user_id===assignment.driver_user_id)||{
      full_name:assignment.driver_name,
      phone:assignment.driver_phone,
      location:assignment.location
    };
    return '<div class="order-control-dispatch-focus">'+
      '<div class="row between" style="gap:8px"><div><span class="order-control-mini-label">Asignado</span><strong>'+esc(driver.full_name||"Repartidor")+'</strong></div><span class="badge">'+esc(modeLabel)+'</span></div>'+
      '<div class="muted">'+esc(orderControlDriverLocationText(driver))+'</div>'+
      '<div class="order-control-actions">'+
        (mode==="MANUAL"&&canOperate&&driver.phone?'<button class="btn-primary" type="button" onclick="orderControlNotifyDriver(\''+order.id+'\')">Enviar WhatsApp</button>':'')+
        (canOperate&&order.status!=="EN_ROUTE"?'<button class="btn-muted" type="button" onclick="orderControlUnassignDriver(\''+order.id+'\')">Cambiar repartidor</button>':'')+
      '</div>'+
    '</div>';
  }

  if(plan?.status==="PLANNED"){
    return '<div class="order-control-dispatch-focus">'+
      '<div class="row between" style="gap:8px"><div><span class="order-control-mini-label">Preasignado</span><strong>'+esc(plan.driver_name||"Repartidor")+'</strong></div><span class="badge">'+esc(modeLabel)+'</span></div>'+
      '<div class="order-control-plan-inline"><span>Salida calculada</span><strong>'+esc(orderControlTime(plan.ideal_departure_at))+'</strong></div>'+
      (canOperate?'<button class="btn-muted" type="button" onclick="orderControlCancelDriverPlan(\''+order.id+'\')">Modificar preasignación</button>':'')+
    '</div>';
  }

  if(["CONFIRMED","PREPARING"].includes(order.status)){
    const options=drivers.length?drivers.map(d=>{
      const selected=suggestion?.driver_user_id===d.user_id?" selected":"";
      return '<option value="'+esc(d.user_id)+'"'+selected+'>'+esc(d.full_name||"Repartidor")+' · '+(Number(d.active_orders||0)>0?"Ocupado":"Libre")+'</option>';
    }).join(""):'<option value="">Sin repartidores operativos</option>';

    if(mode==="AUTO"){
      return '<div class="workspace-note"><strong>Automático:</strong> HTPWEB calculará y activará la mejor preasignación cuando tenga el tiempo del LOCAL.</div>';
    }

    return '<div class="order-control-dispatch-focus">'+
      (suggestion?'<div class="order-control-suggestion-line"><span>HTPWEB recomienda</span><strong>'+esc(suggestion.driver_name||"Repartidor")+'</strong></div>':'')+
      '<select id="orderControlPlanDriverSelect">'+options+'</select>'+
      '<button class="btn-primary" type="button" onclick="orderControlPlanDriver(\''+order.id+'\')" '+(!drivers.length?'disabled':'')+'>'+
        (mode==="HYBRID"?"Aprobar preasignación":"Preasignar repartidor")+
      '</button>'+
    '</div>';
  }

  if(order.status==="READY"){
    const options=drivers.length?drivers.map(d=>
      '<option value="'+esc(d.user_id)+'">'+esc(d.full_name||"Repartidor")+' · '+(Number(d.active_orders||0)>0?"Ocupado":"Libre")+'</option>'
    ).join(""):'<option value="">Sin repartidores operativos</option>';
    if(mode==="AUTO"){
      return '<div class="workspace-warning"><strong>Esperando repartidor libre.</strong> HTPWEB asignará automáticamente en cuanto exista capacidad.</div>';
    }
    return '<div class="order-control-dispatch-focus"><select id="orderControlDriverSelect">'+options+'</select>'+
      '<button class="btn-primary" type="button" onclick="orderControlAssignDriver(\''+order.id+'\')" '+(!drivers.length?'disabled':'')+'>'+
      (mode==="HYBRID"?"Aprobar asignación":"Asignar repartidor")+'</button></div>';
  }

  return '<div class="muted">Sin acción de reparto pendiente.</div>';
}

function renderOrderControlDetail(){
  const box=$("orderControlDetail");if(!box)return;
  const order=(state.orders||[]).find(o=>o.id===orderControlState.selectedId);
  if(!order){
    box.innerHTML='<div class="order-control-empty-state"><strong>Selecciona un pedido</strong><span>Aquí verás el avance, los productos, ubicaciones y reparto.</span></div>';
    return;
  }

  const canOperate=["MASTER","DELIVERY_ADMIN","DELIVERY_OPERATOR"].includes(state.role);
  const mode=order.dispatch_mode||orderControlState.dispatches.get(order.delivery_id)?.mode||"MANUAL";
  const activeLocals=(order.order_locals||[]).filter(ol=>ol.status!=="CANCELLED");
  const pendingLocals=activeLocals.filter(ol=>!ol.prep_requested_at&&ol.locals?.whatsapp);
  const stepperHtml=renderOrderControlStepper(order);

  const headerActions=[];
  if(canOperate&&order.status==="PENDING"){
    headerActions.push('<button class="btn-primary" type="button" onclick="changeGlobalOrder(\''+order.id+'\',\'CONFIRMED\')">Aceptar pedido</button>');
  }
  if(canOperate&&!["DELIVERED","CANCELLED"].includes(order.status)){
    headerActions.push('<button class="btn-danger" type="button" onclick="changeGlobalOrder(\''+order.id+'\',\'CANCELLED\')">Cancelar</button>');
  }

  const customerActions=[
    order.customer_phone?'<button class="btn-primary" type="button" onclick="orderControlWhatsappCustomer(\''+order.id+'\')">WhatsApp cliente</button>':"",
    orderControlValidPoint(order.latitude,order.longitude)?'<button class="btn-muted" type="button" onclick="orderControlFocusMap(\''+order.id+'\')">Ver ubicación</button>':""
  ].filter(Boolean).join("");

  const bulkLocalAction=canOperate&&pendingLocals.length
    ? '<button class="'+(mode==="HYBRID"?"btn-primary":"btn-muted")+'" type="button" onclick="orderControlSendPendingLocals(\''+order.id+'\')">'+
      (mode==="HYBRID"?"Aprobar envío a locales":mode==="MANUAL"?"Enviar pendientes":"Reintentar pendientes")+
      '</button>'
    :"";

  const localBlocks=activeLocals.map(ol=>{
    const local=ol.locals||{};
    const items=(order.order_items||[]).filter(item=>item.local_id===ol.local_id);
    const eta=ol.prep_response_at
      ? '<span class="order-control-local-signal ok">Preparando · '+esc(ol.prep_estimate_minutes||"—")+' min</span>'
      : ol.prep_requested_at
        ? '<span class="order-control-local-signal wait">Esperando tiempo</span>'
        : '<span class="order-control-local-signal pending">Pendiente de envío</span>';
    const whatsappLabel=ol.prep_requested_at?"Reenviar WhatsApp":mode==="HYBRID"?"Aprobar WhatsApp":mode==="AUTO"?"Reintentar WhatsApp":"Enviar WhatsApp";
    const whatsappButton=canOperate&&local.whatsapp&&!["READY","CANCELLED"].includes(ol.status)&&["CONFIRMED","PREPARING"].includes(order.status)
      ? '<button class="btn-muted" type="button" onclick="sendLocalOrderWhatsapp(\''+order.id+'\',\''+ol.local_id+'\')">'+esc(whatsappLabel)+'</button>'
      :"";
    const products=items.length?items.map(item=>
      '<li><strong>'+esc(item.quantity)+' × '+esc(item.product_name||"Producto")+'</strong>'+
      (item.variant_name?'<span>'+esc(item.variant_name)+'</span>':'')+
      (item.promotion_title?'<span>Promoción: '+esc(item.promotion_title)+'</span>':'')+
      '</li>'
    ).join(""):'<li class="muted">Sin productos visibles</li>';

    return '<article class="order-control-local-compact">'+
      '<div class="row between" style="gap:8px"><div><strong>'+esc(local.name||"LOCAL")+'</strong><div class="muted">'+esc(local.address||"")+'</div></div>'+
      '<span class="badge status-'+esc(ol.status)+'">'+esc(orderStatusLabel(ol.status))+'</span></div>'+
      '<div class="order-control-local-signals">'+eta+
        (ol.pickup_status&&ol.pickup_status!=="PENDING"?'<span class="order-control-local-signal pickup">'+esc({ARRIVED:"Repartidor llegó",PICKED_UP:"Recogido"}[ol.pickup_status]||ol.pickup_status)+'</span>':'')+
      '</div>'+
      '<ul class="order-control-products-compact">'+products+'</ul>'+
      (whatsappButton?'<div class="order-control-actions">'+whatsappButton+'</div>':'')+
    '</article>';
  }).join("");

  box.innerHTML=
    '<div class="order-control-selected order-control-selected-compact">'+
      '<div class="order-control-selected-head">'+
        '<div><div class="order-control-eyebrow">Pedido seleccionado</div><div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">'+
          '<h2 style="margin:0">#'+esc(orderControlRef(order.id))+'</h2>'+
          '<span class="badge status-'+esc(order.status)+'">'+esc(orderStatusLabel(order.status))+'</span>'+
        '</div><div class="muted">'+esc(order.customer_name||"Cliente")+' · '+esc(orderControlAge(order.created_at))+'</div></div>'+
        (headerActions.length?'<div class="order-control-actions" style="margin-top:0">'+headerActions.join("")+'</div>':'')+
      '</div>'+
      '<div class="order-control-progress-panel-compact">'+stepperHtml+'</div>'+
      '<div class="order-control-main-detail-grid">'+
        '<section class="order-control-panel order-control-client-panel">'+
          '<div class="order-control-section-heading"><h3>Cliente y ubicación</h3></div>'+
          '<div class="order-control-client-name"><strong>'+esc(order.customer_name||"Cliente")+'</strong><span>'+esc(order.customer_phone||"Sin teléfono")+'</span></div>'+
          '<div class="order-control-client-address">'+
            '<strong>'+esc(order.delivery_address||"Sin dirección")+'</strong>'+
            (order.address_reference?'<span>Referencia: '+esc(order.address_reference)+'</span>':'')+
          '</div>'+
          '<div class="order-control-actions">'+customerActions+'</div>'+
        '</section>'+

        '<section class="order-control-panel order-control-locals-panel" id="orderControlLocalsPanel">'+
          '<div class="order-control-section-heading row between" style="gap:8px"><h3>Locales y productos</h3>'+bulkLocalAction+'</div>'+
          (localBlocks||'<div class="muted">Sin locales asociados.</div>')+
        '</section>'+

        '<section class="order-control-panel order-control-dispatch-panel" id="orderControlDispatchPanel">'+
          '<div class="order-control-section-heading"><h3>Reparto</h3></div>'+
          orderControlCompactDispatchPanel(order,canOperate)+
        '</section>'+

        '<section class="order-control-panel order-control-drivers-panel">'+
          '<div class="order-control-section-heading"><h3>Repartidores operativos</h3></div>'+
          renderOrderControlDriverSummary(order)+
        '</section>'+
      '</div>'+
    '</div>';
}

function ensureOrderControlMap(){
  const host=$("orderControlMap");
  if(!host||typeof L==="undefined")return null;
  if(orderControlState.map)return orderControlState.map;
  orderControlState.map=L.map(host,{zoomControl:true}).setView([0.95,-79.65],13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    attribution:"© OpenStreetMap"
  }).addTo(orderControlState.map);
  orderControlState.layers=L.layerGroup().addTo(orderControlState.map);
  return orderControlState.map;
}

function orderControlValidPoint(lat,lng){
  const a=Number(lat),b=Number(lng);
  return Number.isFinite(a)&&Number.isFinite(b)&&a>=-90&&a<=90&&b>=-180&&b<=180;
}

function orderControlAnimateMarker(marker,from,to,duration=1200){
  if(!marker||!Array.isArray(from)||!Array.isArray(to))return;
  if(!orderControlValidPoint(from[0],from[1])||!orderControlValidPoint(to[0],to[1]))return;
  const started=performance.now();
  const step=now=>{
    const t=Math.min(1,(now-started)/duration);
    const eased=1-Math.pow(1-t,3);
    marker.setLatLng([
      from[0]+(to[0]-from[0])*eased,
      from[1]+(to[1]-from[1])*eased
    ]);
    if(t<1)requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function orderControlLoadDriverTrail(order){
  const assignment=order?.assignment;
  if(!assignment?.driver_user_id)return;
  const driverId=assignment.driver_user_id;
  if(orderControlState.driverTrails.has(driverId))return;

  try{
    const snap=await rpc("delivery_driver_gps_snapshot",{
      p_delivery_id:order.delivery_id,
      p_driver_user_id:driverId,
      p_limit:80
    });
    const history=Array.isArray(snap?.history)?snap.history:[];
    const assignedAt=assignment.assigned_at?new Date(assignment.assigned_at).getTime():null;
    const trail=history
      .filter(p=>{
        if(!orderControlValidPoint(p?.latitude,p?.longitude))return false;
        if(!Number.isFinite(assignedAt))return true;
        const captured=new Date(p?.captured_at||0).getTime();
        return Number.isFinite(captured)&&captured>=assignedAt;
      })
      .map(p=>[Number(p.latitude),Number(p.longitude)]);
    if(snap?.current&&orderControlValidPoint(snap.current.latitude,snap.current.longitude)){
      const current=[Number(snap.current.latitude),Number(snap.current.longitude)];
      if(!trail.length||trail.at(-1)?.[0]!==current[0]||trail.at(-1)?.[1]!==current[1]){
        trail.push(current);
      }
    }
    orderControlState.driverTrails.set(driverId,trail.slice(-80));
    if(order.id===orderControlState.selectedId)renderOrderControlMap();
  }catch(e){
    console.warn("No se pudo cargar historial GPS del centro de control.",e);
    orderControlState.driverTrails.set(driverId,[]);
  }
}

function stopOrderControlRealtime(){
  const channel=orderControlState.trackingChannel;
  orderControlState.trackingChannel=null;
  orderControlState.trackingTopic=null;
  if(channel){
    try{void supabaseClient.removeChannel(channel);}catch{}
  }
}

function startOrderControlRealtime(order){
  const assignment=order?.assignment;
  if(!order?.id||!assignment?.driver_user_id||!["READY","EN_ROUTE"].includes(order.status)){
    stopOrderControlRealtime();
    return;
  }

  const topic="order-tracking:"+order.id;
  if(orderControlState.trackingChannel&&orderControlState.trackingTopic===topic)return;

  stopOrderControlRealtime();
  orderControlState.trackingTopic=topic;
  orderControlState.trackingChannel=supabaseClient
    .channel(topic,{config:{private:true}})
    .on("broadcast",{event:"location"},({payload})=>{
      const current=(state.orders||[]).find(o=>o.id===orderControlState.selectedId);
      if(!current?.assignment||current.id!==order.id)return;
      if(!orderControlValidPoint(payload?.latitude,payload?.longitude))return;

      current.assignment.location={
        latitude:Number(payload.latitude),
        longitude:Number(payload.longitude),
        accuracy_m:payload.accuracy_m??null,
        heading_deg:payload.heading_deg??null,
        speed_mps:payload.speed_mps??null,
        captured_at:payload.captured_at||new Date().toISOString()
      };

      const driverId=current.assignment.driver_user_id;
      const trail=orderControlState.driverTrails.get(driverId)||[];
      const next=[Number(payload.latitude),Number(payload.longitude)];
      const last=trail.at(-1);
      if(!last||last[0]!==next[0]||last[1]!==next[1])trail.push(next);
      orderControlState.driverTrails.set(driverId,trail.slice(-80));

      renderOrderControlDetail();
      renderOrderControlMap();
    })
    .on("broadcast",{event:"route_updated"},({payload})=>{
      const current=(state.orders||[]).find(o=>o.id===orderControlState.selectedId);
      if(!current||current.id!==order.id||payload?.order_id!==current.id)return;
      current.active_route=payload;
      renderOrderControlDetail();
      renderOrderControlMap();
    })
    .on("broadcast",{event:"tracking_ended"},()=>{
      void loadOrders({silent:true});
    })
    .subscribe();
}


function orderControlRouteKey(localGroup,order){
  const l=localGroup?.locals||{};
  return [
    Number(l.latitude).toFixed(6),
    Number(l.longitude).toFixed(6),
    Number(order.latitude).toFixed(6),
    Number(order.longitude).toFixed(6)
  ].join(":");
}

async function orderControlFetchRoadRoute(localGroup,order){
  const local=localGroup?.locals||{};
  if(!orderControlValidPoint(local.latitude,local.longitude)
     ||!orderControlValidPoint(order.latitude,order.longitude))return null;

  const key=orderControlRouteKey(localGroup,order);
  if(orderControlState.routeCache.has(key)){
    return await orderControlState.routeCache.get(key);
  }

  const request=(async()=>{
    const {data,error}=await supabaseClient.functions.invoke("calcular-distancia",{
      body:{
        origin_lat:Number(local.latitude),
        origin_lng:Number(local.longitude),
        destination_lat:Number(order.latitude),
        destination_lng:Number(order.longitude),
        include_geometry:true
      }
    });
    if(error)throw error;
    if(!data?.ok||data?.geometry?.type!=="LineString"||!Array.isArray(data?.geometry?.coordinates)){
      throw new Error(data?.error||"ORS no devolvió geometría vial.");
    }
    return data;
  })();

  orderControlState.routeCache.set(key,request);
  try{
    const result=await request;
    orderControlState.routeCache.set(key,Promise.resolve(result));
    return result;
  }catch(e){
    orderControlState.routeCache.delete(key);
    throw e;
  }
}

function orderControlRenderSharedRoute(order){
  const active=order?.active_route;
  const route=active?.route;
  if(route?.geometry?.type!=="LineString"||!Array.isArray(route?.geometry?.coordinates))return [];
  const latLngs=route.geometry.coordinates
    .map(point=>[Number(point?.[1]),Number(point?.[0])])
    .filter(point=>orderControlValidPoint(point[0],point[1]));
  if(latLngs.length<2)return [];
  const source=active.source==="AUTO"?"recalculada automáticamente":"calculada por repartidor";
  const version=Number(active.version);
  const km=Number(route.distance_km);
  const minutes=Number(route.duration_minutes);
  const label="Ruta vigente"+(Number.isFinite(version)?" · V"+version:"")+" · "+source+
    (Number.isFinite(km)?" · "+km.toFixed(2)+" km":"")+
    (Number.isFinite(minutes)?" · aprox. "+Math.round(minutes)+" min":"");
  L.polyline(latLngs,{color:"#2563eb",weight:5,opacity:.86})
    .bindTooltip(label)
    .addTo(orderControlState.layers);
  return latLngs;
}

async function orderControlRenderRoadRoutes(order,generation){
  if(!order||!orderControlValidPoint(order.latitude,order.longitude))return;
  const locals=(order.order_locals||[]).filter(ol=>{
    const l=ol.locals||{};
    return orderControlValidPoint(l.latitude,l.longitude);
  });
  if(!locals.length)return;

  const results=await Promise.all(locals.map(async ol=>{
    try{
      return {ol,route:await orderControlFetchRoadRoute(ol,order)};
    }catch(e){
      console.warn("No se pudo trazar ruta vial ORS para",ol.locals?.name||ol.local_id,e);
      return {ol,route:null};
    }
  }));

  if(generation!==orderControlState.routeGeneration
     ||order.id!==orderControlState.selectedId
     ||!orderControlState.layers)return;

  results.forEach(({ol,route})=>{
    if(!route?.geometry?.coordinates)return;
    const latLngs=route.geometry.coordinates
      .map(point=>[Number(point?.[1]),Number(point?.[0])])
      .filter(point=>orderControlValidPoint(point[0],point[1]));
    if(latLngs.length<2)return;
    const localName=ol.locals?.name||"LOCAL";
    const stored=Number(ol.delivery_distance_km);
    const calculated=Number(route.distance_km);
    const km=Number.isFinite(stored)?stored:calculated;
    const minutes=Number(route.duration_minutes);
    const routeLabel=localName+" → cliente · "+(Number.isFinite(km)?km.toFixed(2)+" km":"ruta vial")+(Number.isFinite(minutes)?" · aprox. "+minutes+" min":"");
    L.polyline(latLngs,{color:"#2563eb",weight:5,opacity:.8})
      .bindTooltip(routeLabel)
      .addTo(orderControlState.layers);
  });
}
function renderOrderControlMap(){
  const map=ensureOrderControlMap();if(!map)return;
  orderControlState.layers.clearLayers();
  const bounds=[];
  const active=(state.orders||[]).filter(o=>orderControlActiveStatuses.has(o.status));

  active.forEach(order=>{
    if(order.id===orderControlState.selectedId)return;
    if(!orderControlValidPoint(order.latitude,order.longitude))return;
    const lat=Number(order.latitude),lng=Number(order.longitude);
    const marker=L.circleMarker([lat,lng],{
      radius:6,color:"#64748b",weight:2,fillColor:"#cbd5e1",fillOpacity:.8
    }).addTo(orderControlState.layers);
    marker.bindPopup(`<div class="order-control-map-popup"><strong>Pedido #${esc(orderControlRef(order.id))}</strong>${esc(order.customer_name||"Cliente")}<br>${esc(orderStatusLabel(order.status))}</div>`);
    marker.on("click",()=>selectOrderControl(order.id));
    bounds.push([lat,lng]);
  });

  const order=(state.orders||[]).find(o=>o.id===orderControlState.selectedId);
  if(order){
    const generation=++orderControlState.routeGeneration;

    if(order.assignment?.location&&orderControlValidPoint(order.assignment.location.latitude,order.assignment.location.longitude)){
      const driverId=order.assignment.driver_user_id;
      const lat=Number(order.assignment.location.latitude),lng=Number(order.assignment.location.longitude);
      const previous=orderControlState.driverMarkerPositions.get(driverId)||[lat,lng];
      const trail=orderControlState.driverTrails.get(driverId)||[];
      if(trail.length>=2){
        L.polyline(trail,{color:"#16a34a",weight:4,opacity:.55})
          .bindTooltip("Recorrido reciente del repartidor")
          .addTo(orderControlState.layers);
      }
      const marker=L.circleMarker(previous,{radius:10,color:"#166534",weight:3,fillColor:"#22c55e",fillOpacity:.95})
        .bindPopup('<div class="order-control-map-popup"><strong>Repartidor en vivo</strong>'+esc(order.assignment.driver_name||"Repartidor")+'<br>GPS '+esc(orderControlAge(order.assignment.location.captured_at))+'</div>')
        .addTo(orderControlState.layers);
      if(previous[0]!==lat||previous[1]!==lng){
        orderControlAnimateMarker(marker,previous,[lat,lng],1200);
      }
      orderControlState.driverMarkerPositions.set(driverId,[lat,lng]);
      bounds.push([lat,lng]);
    }

    (order.order_locals||[]).forEach(ol=>{
      const l=ol.locals||{};
      if(!orderControlValidPoint(l.latitude,l.longitude))return;
      const lat=Number(l.latitude),lng=Number(l.longitude);
      const routeKm=Number(ol.delivery_distance_km);
      const routeInfo=Number.isFinite(routeKm)?'<br>Ruta vial ORS: '+esc(routeKm.toFixed(2))+' km':'';
      L.circleMarker([lat,lng],{radius:9,color:"#9a3412",weight:3,fillColor:"#f97316",fillOpacity:.9})
        .bindPopup('<div class="order-control-map-popup"><strong>'+esc(l.name||"LOCAL")+'</strong>'+esc(orderStatusLabel(ol.status))+'<br>'+esc(l.address||"")+routeInfo+'</div>')
        .addTo(orderControlState.layers);
      bounds.push([lat,lng]);
    });

    if(orderControlValidPoint(order.latitude,order.longitude)){
      const lat=Number(order.latitude),lng=Number(order.longitude);
      L.circleMarker([lat,lng],{radius:11,color:"#1d4ed8",weight:3,fillColor:"#3b82f6",fillOpacity:.95})
        .bindPopup('<div class="order-control-map-popup"><strong>Cliente · #'+esc(orderControlRef(order.id))+'</strong>'+esc(order.customer_name||"Cliente")+'<br>'+esc(order.delivery_address||"")+'</div>')
        .addTo(orderControlState.layers);
      bounds.push([lat,lng]);
    }

    const sharedRoutePoints=orderControlRenderSharedRoute(order);
    if(sharedRoutePoints.length){
      sharedRoutePoints.forEach(point=>bounds.push(point));
    }else{
      void orderControlRenderRoadRoutes(order,generation);
    }
  }else{
    orderControlState.routeGeneration++;
  }
  setTimeout(()=>{
    map.invalidateSize();
    if(bounds.length){
      try{map.fitBounds(bounds,{padding:[35,35],maxZoom:16});}catch{}
    }
  },60);
}

function selectOrderControl(orderId){
  orderControlState.selectedId=orderId;
  const order=(state.orders||[]).find(o=>o.id===orderId);
  renderOrderControlQueue();
  renderOrderControlDetail();
  renderOrderControlMap();
  startOrderControlRealtime(order);
  void orderControlLoadDriverTrail(order);
}

function orderControlFocusMap(orderId){
  if(orderId)selectOrderControl(orderId);
  $("orderControlMap")?.scrollIntoView({behavior:"smooth",block:"center"});
}

async function orderControlPlanDriver(orderId){
  try{
    const order=(state.orders||[]).find(o=>o.id===orderId);
    const driverId=$("orderControlPlanDriverSelect")?.value||order?.driver_suggestion?.driver_user_id;
    if(!order||!driverId)throw new Error("Selecciona un repartidor para programar.");
    await rpc("delivery_plan_order_driver",{
      p_delivery_id:order.delivery_id,
      p_order_id:order.id,
      p_driver_user_id:driverId,
      p_note:null
    });
    message("Repartidor programado para la hora estimada del LOCAL.");
    await loadOrders();
  }catch(e){message(e.message||"No se pudo programar el repartidor.","error");}
}

async function orderControlCancelDriverPlan(orderId){
  try{
    const order=(state.orders||[]).find(o=>o.id===orderId);
    if(!order)throw new Error("Pedido no disponible.");
    await rpc("delivery_cancel_order_driver_plan",{
      p_delivery_id:order.delivery_id,
      p_order_id:order.id
    });
    message("Programación liberada. Puedes elegir otro repartidor.");
    await loadOrders();
  }catch(e){message(e.message||"No se pudo cambiar la programación.","error");}
}

function orderControlNotifyPlannedDriver(orderId){
  try{
    const order=(state.orders||[]).find(o=>o.id===orderId);
    const plan=order?.driver_plan;
    if(!order||!plan)throw new Error("No hay repartidor programado.");
    if(!plan.driver_phone)throw new Error("El repartidor no tiene teléfono registrado.");
    if(typeof htpWhatsappOpenAssisted!=="function")throw new Error("WhatsApp asistido no está disponible.");
    const localNames=(order.order_locals||[]).filter(ol=>ol.status!=="CANCELLED").map(ol=>ol.locals?.name||"LOCAL").join(", ");
    const text=[
      "*HTPWEB · Próxima entrega #"+orderControlRef(order.id)+"*",
      "Tienes una recogida programada.",
      "LOCAL: "+(localNames||"Ver HTPWEB"),
      "Pedido listo aprox.: "+orderControlTime(plan.planned_for),
      "Salida sugerida: "+orderControlTime(plan.ideal_departure_at),
      "",
      "HTPWEB te avisará cuando el pedido quede listo para iniciar la recogida."
    ].join("\n");
    htpWhatsappOpenAssisted(plan.driver_phone,text);
    message("WhatsApp abierto con la programación del repartidor.");
  }catch(e){message(e.message||"No se pudo avisar al repartidor.","error");}
}

async function orderControlAssignDriver(orderId){
  try{
    const order=(state.orders||[]).find(o=>o.id===orderId);
    const driverId=$("orderControlDriverSelect")?.value;
    if(!order||!driverId)throw new Error("Selecciona un repartidor.");
    await rpc("delivery_assign_order_driver",{
      p_delivery_id:order.delivery_id,
      p_order_id:order.id,
      p_driver_user_id:driverId,
      p_note:null
    });
    message("Repartidor asignado al pedido.");
    await loadOrders();
  }catch(e){message(e.message||"No se pudo asignar el repartidor.","error");}
}

async function orderControlUnassignDriver(orderId){
  try{
    const order=(state.orders||[]).find(o=>o.id===orderId);
    if(!order)throw new Error("Pedido no disponible.");
    await rpc("delivery_unassign_order_driver",{
      p_delivery_id:order.delivery_id,
      p_order_id:order.id,
      p_note:null
    });
    message("Repartidor retirado del pedido.");
    await loadOrders();
  }catch(e){message(e.message||"No se pudo quitar el repartidor.","error");}
}

async function orderControlNotifyDriver(orderId){
  const popup=window.open("","_blank");
  if(popup){
    try{
      popup.document.title="HTPWEB · Preparando repartidor";
      popup.document.body.innerHTML='<p style="font-family:Arial,sans-serif;padding:24px">Preparando WhatsApp y consola móvil…</p>';
    }catch{}
  }
  try{
    const order=(state.orders||[]).find(o=>o.id===orderId);
    const assigned=order?.assignment;
    if(!order||!assigned)throw new Error("El pedido no tiene repartidor asignado.");
    const driver=orderControlDriverList(order).find(d=>d.user_id===assigned.driver_user_id)||{
      user_id:assigned.driver_user_id,
      full_name:assigned.driver_name,
      phone:assigned.driver_phone
    };
    if(!driver.phone)throw new Error("El repartidor no tiene teléfono registrado.");

    const access=await quickDriverInvoke("link",{driver_user_id:assigned.driver_user_id});
    const trackingUrl=quickDriverTrackingUrl(access.tracking_token);
    const text=buildDriverWhatsappText({
      order_id:order.id,
      delivery_address:order.delivery_address
    },driver,trackingUrl);

    if(popup){
      popup.location.href=htpWhatsappAssistedUrl(driver.phone,text);
    }else{
      message("El navegador bloqueó la ventana. Habilita ventanas emergentes e inténtalo nuevamente.","error");
      return;
    }
    message("WhatsApp abierto con la entrega y el acceso GPS listos para enviar.");
  }catch(e){
    if(popup&&!popup.closed)popup.close();
    message(e.message||"No se pudo preparar el aviso al repartidor.","error");
  }
}

function orderControlWhatsappCustomer(orderId){
  try{
    const order=(state.orders||[]).find(o=>o.id===orderId);
    if(!order?.customer_phone)throw new Error("El cliente no tiene teléfono registrado.");
    if(typeof htpWhatsappOpenAssisted!=="function")throw new Error("WhatsApp asistido no está disponible.");
    const delivery=state.deliveries.find(d=>d.id===order.delivery_id)?.name||"HTPWEB";
    const text=[
      "*HTPWEB · Pedido #"+orderControlRef(order.id)+"*",
      "Hola "+(order.customer_name||"")+",",
      "tu pedido con "+delivery+" está "+orderStatusLabel(order.status).toLowerCase()+".",
      "Total: "+orderControlMoney(order.total)
    ].join("\n");
    htpWhatsappOpenAssisted(order.customer_phone,text);
  }catch(e){message(e.message||"No se pudo abrir WhatsApp del cliente.","error");}
}

function renderOrderControl(){
  renderOrderControlKpis();
  renderOrderControlModeBar();
  renderOrderControlQueue();
  renderOrderControlDetail();
  renderOrderControlMap();
  const updated=$("orderControlUpdated");
  if(updated)updated.textContent=orderControlState.lastSync
    ?"Actualizado "+orderControlAge(orderControlState.lastSync)
    :"Sincronizando…";
}

function stopOrderControlAutoRefresh(){
  if(orderControlState.timer){
    clearInterval(orderControlState.timer);
    orderControlState.timer=null;
  }
}

function startOrderControlAutoRefresh(){
  stopOrderControlAutoRefresh();
  if(!$("orderControlAutoRefresh")?.checked)return;
  if(!$("section-orders")?.classList.contains("active"))return;
  orderControlState.timer=setInterval(()=>{
    if(!$("orderControlAutoRefresh")?.checked)return;
    if(!$("section-orders")?.classList.contains("active"))return;
    loadOrders({silent:true});
  },15000);
}

async function loadOrderControlCenter({silent=false}={}){
  if(orderControlState.loading)return;
  orderControlState.loading=true;
  if(!silent&&$("ordersList"))$("ordersList").innerHTML='<div class="muted">Sincronizando centro de control…</div>';
  try{
    const ids=orderControlDeliveryIds();
    if(!ids.length){
      state.orders=[];
      orderControlState.drivers.clear();
      orderControlState.dispatches.clear();
      orderControlState.lastSync=new Date().toISOString();
      renderOrderControl();
      return;
    }

    const bundles=await Promise.all(ids.map(async deliveryId=>{
      const [snapshot,drivers,routes,preparation,planning,dispatch]=await Promise.all([
        rpc("delivery_order_control_snapshot",{p_delivery_id:deliveryId,p_limit:100}),
        rpc("delivery_drivers_snapshot",{p_delivery_id:deliveryId}).catch(()=>({drivers:[]})),
        rpc("delivery_order_routes_snapshot",{p_delivery_id:deliveryId}).catch(()=>({routes:[]})),
        rpc("delivery_local_preparation_snapshot",{p_delivery_id:deliveryId}).catch(()=>({locals:[]})),
        rpc("delivery_driver_planning_snapshot",{p_delivery_id:deliveryId}).catch(()=>({orders:[]})),
        rpc("delivery_dispatch_snapshot",{p_delivery_id:deliveryId}).catch(()=>({mode:"NONE",allowed_modes:[]}))
      ]);
      return {deliveryId,snapshot,drivers,routes,preparation,planning,dispatch};
    }));

    const all=[];
    orderControlState.snapshots.clear();
    orderControlState.drivers.clear();
    orderControlState.dispatches.clear();
    bundles.forEach(bundle=>{
      orderControlState.snapshots.set(bundle.deliveryId,bundle.snapshot||{});
      orderControlState.drivers.set(bundle.deliveryId,bundle.drivers||{drivers:[]});
      orderControlState.dispatches.set(bundle.deliveryId,bundle.dispatch||{mode:"NONE",allowed_modes:[]});
      const routeByOrder=new Map((bundle.routes?.routes||[]).map(route=>[route.order_id,route]));
      const preparationByKey=new Map((bundle.preparation?.locals||[]).map(row=>[`${row.order_id}:${row.local_id}`,row]));
      const planningByOrder=new Map((bundle.planning?.orders||[]).map(row=>[row.order_id,row]));
      (bundle.snapshot?.orders||[]).forEach(order=>{
        const planning=planningByOrder.get(order.id)||{};
        const normalized=orderControlNormalize({
          ...order,
          active_route:routeByOrder.get(order.id)||null,
          driver_plan:planning.plan||null,
          driver_suggestion:planning.suggestion||null,
          dispatch_mode:bundle.planning?.mode||null
        });
        normalized.order_locals=(normalized.order_locals||[]).map(ol=>({
          ...ol,
          ...(preparationByKey.get(`${order.id}:${ol.local_id}`)||{})
        }));
        all.push(normalized);
      });
    });
    all.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    state.orders=all;
    orderControlState.lastSync=new Date().toISOString();

    const selectedStillExists=all.some(o=>o.id===orderControlState.selectedId);
    if(!selectedStillExists){
      orderControlState.selectedId=all.find(o=>orderControlActiveStatuses.has(o.status))?.id||all[0]?.id||null;
    }

    renderOrderControl();
    const selectedOrder=all.find(o=>o.id===orderControlState.selectedId);
    startOrderControlRealtime(selectedOrder);
    void orderControlLoadDriverTrail(selectedOrder);
    startOrderControlAutoRefresh();
  }catch(e){
    if(!silent)message(e.message||"No se pudo cargar el centro de control.","error");
    if($("ordersList"))$("ordersList").innerHTML=`<div class="message error">${esc(e.message||"No se pudo cargar el centro de control.")}</div>`;
  }finally{
    orderControlState.loading=false;
  }
}

async function loadOrders(options={}) {
  if (!roleSections[state.role]?.includes("orders")) return;
  if(state.role==="LOCAL_ADMIN"){
    orderControlToggleLegacy(true);
    return loadOrdersLegacy();
  }
  orderControlToggleLegacy(false);
  return loadOrderControlCenter(options);
}

function renderOrder(order) {
  const globalButtons = ["MASTER","DELIVERY_ADMIN","DELIVERY_OPERATOR"].includes(state.role)
    ? (globalTransitions[order.status] || []).map(next =>
        `<button class="${next === "CANCELLED" ? "btn-danger" : "btn"}" onclick="changeGlobalOrder('${order.id}','${next}')">${next}</button>`
      ).join("")
    : "";

  const locals = (order.order_locals || []).map(ol => {
    const canManageLocal = ["MASTER","DELIVERY_ADMIN","DELIVERY_OPERATOR"].includes(state.role)
      || (state.role === "LOCAL_ADMIN" && state.locals.some(l => l.id === ol.local_id));
    const buttons = canManageLocal
      ? (localTransitions[ol.status] || []).map(next =>
          `<button class="${next === "CANCELLED" ? "btn-danger" : "btn"}" onclick="changeLocalOrder('${order.id}','${ol.local_id}','${next}')">${next}</button>`
        ).join("")
      : "";
    const whatsappButton = ["MASTER","DELIVERY_ADMIN","DELIVERY_OPERATOR"].includes(state.role) && ol.locals?.whatsapp
      ? `<button class="btn-muted" type="button" onclick="sendLocalOrderWhatsapp('${order.id}','${ol.local_id}')">Enviar por WhatsApp</button>`
      : "";

    return `
      <div class="order-local">
        <div class="row between">
          <strong>${esc(ol.locals?.name || ol.local_id)}</strong>
          <span class="badge status-${esc(ol.status)}">${esc(ol.status)}</span>
        </div>
        <div class="muted">Subtotal: ${Number(ol.subtotal || 0).toFixed(2)} · Delivery: ${Number(ol.delivery_fee || 0).toFixed(2)}</div>
        ${buttons || whatsappButton ? `<div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">${buttons}${whatsappButton}</div>` : ""}
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

function whatsappOrderRef(orderId){
  return String(orderId||"").replace(/-/g,"").slice(0,8).toUpperCase();
}

function buildLocalOrderWhatsappText(order,localGroup,responseUrl){
  const local=localGroup?.locals||{};
  const items=(order?.order_items||[]).filter(item=>item.local_id===localGroup.local_id);
  const itemLines=items.map(item=>{
    const variant=item.variant_name?" ("+item.variant_name+")":"";
    const promo=item.promotion_title?" [PROMO: "+item.promotion_title+"]":"";
    return "• "+item.quantity+" x "+item.product_name+variant+promo;
  });
  const deliveryName=state.deliveries.find(d=>d.id===order.delivery_id)?.name||"HTPWEB";
  return [
    "*HTPWEB · Pedido #"+whatsappOrderRef(order.id)+"*",
    "Local: "+(local.name||"LOCAL"),
    "",
    "*Productos:*",
    ...(itemLines.length?itemLines:["• Sin productos visibles"]),
    "",
    "Subtotal del local: $"+Number(localGroup.subtotal||0).toFixed(2),
    order.notes?"Observaciones: "+order.notes:"Observaciones: Sin observaciones",
    "DELIVERY: "+deliveryName,
    "",
    "Por favor confirma en cuántos minutos estará listo:",
    responseUrl||""
  ].join("\n");
}

async function sendLocalOrderWhatsapp(orderId,localId){
  try{
    const order=state.orders.find(item=>item.id===orderId);
    if(!order)throw new Error("Pedido no disponible. Actualiza la lista.");
    const localGroup=(order.order_locals||[]).find(item=>item.local_id===localId);
    if(!localGroup)throw new Error("LOCAL no disponible en este pedido.");
    const local=localGroup.locals||{};
    if(!local.whatsapp)throw new Error("El LOCAL no tiene WhatsApp registrado.");

    const settings=await rpc("delivery_whatsapp_settings_snapshot",{
      p_delivery_id:order.delivery_id
    });
    if(settings?.local_orders===false){
      throw new Error("El envío de pedidos a locales por WhatsApp está desactivado.");
    }

    const request=await rpc("delivery_prepare_local_order_request",{
      p_delivery_id:order.delivery_id,
      p_order_id:order.id,
      p_local_id:localId,
      p_ttl_minutes:180
    });
    const responseUrl=new URL("../app/local-pedido.html",window.location.href);
    responseUrl.searchParams.set("t",request.token);

    if(settings?.mode==="AUTOMATIC"){
      if(typeof htpWhatsappSendAutomatic!=="function"){
        throw new Error("El puente automático de WhatsApp no está disponible.");
      }
      const result=await htpWhatsappSendAutomatic({
        kind:"LOCAL_ORDER",
        delivery_id:order.delivery_id,
        order_id:order.id,
        local_id:localId,
        response_url:responseUrl.toString()
      });
      message("Pedido enviado automáticamente al WhatsApp del LOCAL"+(result?.message_id?" · "+result.message_id:"")+".");
      return;
    }

    if(typeof htpWhatsappOpenAssisted!=="function"){
      throw new Error("El modo asistido de WhatsApp no está disponible.");
    }
    htpWhatsappOpenAssisted(local.whatsapp,buildLocalOrderWhatsappText(order,localGroup,responseUrl.toString()));
    message("WhatsApp abierto con el pedido y el enlace de confirmación del LOCAL.");
  }catch(e){
    message(e.message||"No se pudo preparar el pedido para WhatsApp.","error");
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
    google_maps_url: "Google Maps",
    responsible_name: "Responsable",
    responsible_role: "Relación con el negocio",
    declared_whatsapp: "WhatsApp declarado",
    verification_method: "Método de verificación",
    evidence_url: "Enlace de evidencia",
    evidence_note: "Detalle de evidencia",
    challenge_code: "Código de verificación",
    declared_whatsapp_matches_registered: "Coincide con WhatsApp registrado",
    verification_status: "Estado de verificación",
    source_delivery_slug: "DELIVERY de origen"
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

async function signedClaimEvidence(payload = {}) {
  const files = [
    ["RUC / RIMPE", payload.ruc_pdf_path],
    ["Identificación", payload.identity_pdf_path],
    ["Foto exterior", payload.exterior_photo_path],
    ["Foto interior", payload.interior_photo_path],
    ["Foto con código HTPWEB", payload.code_photo_path]
  ].filter(row => row[1]);
  const result = [];
  for (const [label, path] of files) {
    const signed = await supabaseClient.storage.from("local-claim-evidence").createSignedUrl(path, 900);
    result.push({ label, path, url: signed.error ? null : signed.data?.signedUrl || null });
  }
  return result;
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
  if (state.role === "MASTER") {
    await Promise.all(state.requests.filter(req => ["CLAIM_LOCAL","CREATE_LOCAL"].includes(req.request_type)).map(async req => {
      try {
        if (req.request_type === "CLAIM_LOCAL") {
          req.claim_verification = await rpc("master_claim_verification_snapshot", { p_request_id: req.id });
          req.claim_files = await signedClaimEvidence(req.claim_verification?.payload || req.payload || {});
        } else {
          req.creation_files = await signedClaimEvidence(req.payload || {});
        }
      } catch (error) {
        console.warn("No se pudieron cargar evidencias privadas:", error);
        req.claim_verification = null;
      }
    }));
  }

  $("requestsList").innerHTML = state.requests.length
    ? state.requests.map(renderRequest).join("")
    : '<div class="muted">No hay solicitudes visibles.</div>';
  await loadPartnershipRequests();
}

async function loadPartnershipRequests(){
  const box=$("localPartnershipRequests");if(!box)return;
  try{
    const deliveryId=state.role==="DELIVERY_ADMIN" ? ($("requestDelivery")?.value||state.deliveries?.[0]?.id||null) : null;
    const rows=await rpc("local_partnership_requests_snapshot",{p_local_id:null,p_delivery_id:deliveryId});
    const list=(Array.isArray(rows)?rows:[]).filter(x=>x.status==="PENDING");
    box.innerHTML=list.length?list.map(x=>`
      <div class="card">
        <div class="row between"><div><strong>${esc(x.local_name)}</strong><div class="muted">Solicita trabajar con ${esc(x.delivery_name)}</div></div><span class="badge">PENDIENTE</span></div>
        <div class="row" style="margin-top:10px">
          <button class="btn-success" data-partnership-accept="${x.id}">Aceptar</button>
          <button class="btn-danger" data-partnership-reject="${x.id}">Rechazar</button>
        </div>
      </div>`).join(""):'<div class="muted">No hay solicitudes de vinculación pendientes.</div>';
    box.querySelectorAll("[data-partnership-accept]").forEach(b=>b.onclick=()=>reviewLocalPartnership(b.dataset.partnershipAccept,true));
    box.querySelectorAll("[data-partnership-reject]").forEach(b=>b.onclick=()=>reviewLocalPartnership(b.dataset.partnershipReject,false));
  }catch(e){box.innerHTML='<div class="error">'+esc(e.message||"No se pudieron cargar solicitudes de vinculación.")+'</div>';}
}

async function reviewLocalPartnership(requestId,accept){
  try{
    await rpc("delivery_review_local_partnership",{p_request_id:requestId,p_accept:accept,p_note:null});
    message(accept?"LOCAL vinculado al DELIVERY.":"Solicitud rechazada.");
    await loadPartnershipRequests();
  }catch(e){message(e.message||"No se pudo revisar la solicitud.","error");}
}

function renderClaimVerification(req) {
  if (req.request_type !== "CLAIM_LOCAL" || state.role !== "MASTER") return "";
  const v = req.claim_verification || {};
  const p = v.payload || req.payload || {};
  const files = Array.isArray(req.claim_files) ? req.claim_files : [];
  const method = p.verification_method === "REGISTERED_WHATSAPP"
    ? "WhatsApp registrado"
    : p.verification_method === "DOCUMENT_LOCATION"
      ? "Documentos + ubicación"
      : (p.verification_method || "—");
  const verificationStatus = ({
    AWAITING_WHATSAPP_OTP:"Pendiente de OTP por WhatsApp",
    PENDING_MASTER_REVIEW:"Pendiente de revisión MASTER"
  })[p.verification_status] || p.verification_status || "—";
  const distance = p.location_distance_m == null ? "—" : Number(p.location_distance_m).toLocaleString("es-EC") + " m";
  const accuracy = p.location_accuracy_m == null ? "—" : Math.round(Number(p.location_accuracy_m)) + " m";

  return `
    <div class="claim-verification-box" style="margin:12px 0;padding:12px;border:1px solid #dbe4ee;border-radius:12px;background:#f8fafc">
      <strong>Verificación de propiedad</strong>
      <div style="margin-top:8px"><strong>Responsable:</strong> ${esc(p.responsible_name || "—")} · ${esc(p.responsible_role || "—")}</div>
      <div><strong>Método:</strong> ${esc(method)}</div>
      <div><strong>Estado de verificación:</strong> ${esc(verificationStatus)}</div>
      <div><strong>WhatsApp actual declarado:</strong> ${esc(p.declared_whatsapp || "—")}</div>
      <div><strong>WhatsApp registrado:</strong> ${esc(v.registered_whatsapp || "No registrado")}</div>
      <div><strong>Coincidencia:</strong> ${p.declared_whatsapp_matches_registered === true ? "Sí ✓" : p.declared_whatsapp_matches_registered === false ? "No" : "Sin comprobar"}</div>
      <div><strong>Código HTPWEB:</strong> <span style="font-weight:800;letter-spacing:.08em">${esc(p.challenge_code || "—")}</span></div>
      ${p.verification_method === "DOCUMENT_LOCATION" ? `
        <div style="margin-top:8px"><strong>Ubicación capturada:</strong> ${esc(p.location_latitude || "—")}, ${esc(p.location_longitude || "—")}</div>
        <div><strong>Precisión reportada:</strong> ${esc(accuracy)}</div>
        <div><strong>Distancia al punto registrado:</strong> ${esc(distance)}</div>
      ` : ""}
      ${p.review_deadline ? `<div><strong>Plazo comunicado al cliente:</strong> ${new Date(p.review_deadline).toLocaleString()}</div>` : ""}
      ${files.length ? `<div style="margin-top:10px"><strong>Evidencias privadas:</strong><div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">${files.map(file => file.url ? `<a class="btn btn-muted" href="${esc(file.url)}" target="_blank" rel="noopener">${esc(file.label)}</a>` : `<span class="muted">${esc(file.label)} no disponible</span>`).join("")}</div></div>` : ""}
    </div>
  `;
}

function renderCreationVerification(req) {
  if (req.request_type !== "CREATE_LOCAL" || state.role !== "MASTER") return "";
  const p = req.payload || {}, files = Array.isArray(req.creation_files) ? req.creation_files : [];
  return `
    <div class="claim-verification-box" style="margin:12px 0;padding:12px;border:1px solid #dbe4ee;border-radius:12px;background:#f8fafc">
      <strong>Verificación para crear LOCAL</strong>
      <div style="margin-top:8px"><strong>Código HTPWEB:</strong> <span style="font-weight:800;letter-spacing:.08em">${esc(p.challenge_code || "—")}</span></div>
      <div><strong>Ubicación capturada:</strong> ${esc(p.latitude || "—")}, ${esc(p.longitude || "—")}</div>
      <div><strong>Declaración de veracidad:</strong> ${p.truth_confirmed === true ? "Sí ✓" : "No"}</div>
      <div><strong>Estado:</strong> ${esc(p.verification_status || "—")}</div>
      ${files.length ? `<div style="margin-top:10px"><strong>Evidencias privadas:</strong><div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">${files.map(file => file.url ? `<a class="btn btn-muted" href="${esc(file.url)}" target="_blank" rel="noopener">${esc(file.label)}</a>` : `<span class="muted">${esc(file.label)} no disponible</span>`).join("")}</div></div>` : ""}
    </div>
  `;
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
      ${renderClaimVerification(req)}
      ${renderCreationVerification(req)}
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
    const promptText = ["CLAIM_LOCAL","CREATE_LOCAL"].includes(type) && status === "APPROVED"
      ? "Describe cómo verificaste la propiedad/administración del negocio antes de aprobar:"
      : "Nota de revisión:";
    const noteRaw = prompt(promptText);
    if (noteRaw === null) return;
    const note = noteRaw.trim() || null;
    if (["CLAIM_LOCAL","CREATE_LOCAL"].includes(type) && status === "APPROVED" && !note) {
      throw new Error("Debes documentar cómo verificaste la propiedad antes de aprobar.");
    }
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
    let convert = false;
    if (type === "CLAIM_LOCAL") {
      if (!confirm("Este CLAIM agregará acceso de administrador a este LOCAL. El perfil de compra CUSTOMER se conservará, así que la misma cuenta seguirá pudiendo comprar como cliente y mantener otros accesos autorizados. ¿Confirmar?")) return;
      convert = true;
    }

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

  const canDelivery = user.role_code !== "MASTER";
  const canLocal = user.role_code !== "MASTER";

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
    await loadDeliveryCreationRequests();
  } catch (e) {
    message(e.message || "No se pudieron cargar los usuarios.", "error");
  }
}

async function loadDeliveryCreationRequests() {
  if (state.role !== "MASTER" || !$("deliveryCreationRequestRows")) return;
  const rows = await rpc("master_list_delivery_creation_requests");
  const items = Array.isArray(rows) ? rows : [];
  $("deliveryCreationRequestRows").innerHTML = items.length ? items.map(item => {
    const actions = ["PENDING","NEEDS_INFO"].includes(item.status)
      ? '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">'+
        '<button class="btn-primary" data-delivery-request-approve="'+esc(item.id)+'">Aprobar</button>'+
        '<button class="btn-muted" data-delivery-request-info="'+esc(item.id)+'">Pedir información</button>'+
        '<button class="btn-danger" data-delivery-request-reject="'+esc(item.id)+'">Rechazar</button></div>'
      : "";
    return '<div class="request-card"><div class="row between"><div><strong>'+esc(item.name)+'</strong><div class="muted">'+esc(item.requester_name||item.requested_by)+'</div></div><span class="badge">'+esc(item.status)+'</span></div>'+
      '<div class="request-details"><div><strong>Ciudad:</strong> '+esc(item.city_name||"—")+'</div><div><strong>Teléfono:</strong> '+esc(item.phone||"—")+'</div><div><strong>WhatsApp:</strong> '+esc(item.whatsapp||"—")+'</div><div><strong>Descripción:</strong> '+esc(item.description||"—")+'</div></div>'+
      (item.review_note?'<div class="muted">Nota: '+esc(item.review_note)+'</div>':'')+actions+'</div>';
  }).join("") : '<div class="muted">No hay solicitudes DELIVERY.</div>';
  $("deliveryCreationRequestRows").querySelectorAll("[data-delivery-request-approve]").forEach(b=>b.onclick=()=>reviewDeliveryCreationRequest(b.dataset.deliveryRequestApprove,"APPROVED"));
  $("deliveryCreationRequestRows").querySelectorAll("[data-delivery-request-info]").forEach(b=>b.onclick=()=>reviewDeliveryCreationRequest(b.dataset.deliveryRequestInfo,"NEEDS_INFO"));
  $("deliveryCreationRequestRows").querySelectorAll("[data-delivery-request-reject]").forEach(b=>b.onclick=()=>reviewDeliveryCreationRequest(b.dataset.deliveryRequestReject,"REJECTED"));
}

async function reviewDeliveryCreationRequest(id,status) {
  try {
    const noteRaw = prompt(status==="APPROVED" ? "Documenta la revisión y aprobación:" : "Nota para el solicitante:");
    if (noteRaw === null) return;
    const note = noteRaw.trim();
    if (status==="APPROVED" && !note) throw new Error("La aprobación requiere una nota de revisión.");
    await rpc("master_review_delivery_creation_request",{p_request_id:id,p_status:status,p_review_note:note||null});
    message(status==="APPROVED" ? "DELIVERY creado en estado de configuración." : "Solicitud DELIVERY actualizada.");
    await Promise.all([loadDeliveryCreationRequests(),loadScopes()]);
  } catch (e) {
    message(e.message || "No se pudo revisar la solicitud DELIVERY.","error");
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
    '<option value="">Sin cantón</option>' +
    state.cities.filter(c => c.active).map(c =>
      `<option value="${c.id}">${esc(c.name)} — ${esc(c.province || "")}</option>`
    ).join("");
}

function masterDeliveryPublicUrl(deliveryOrId) {
  const delivery = typeof deliveryOrId === "string"
    ? state.deliveries.find(item => item.id === deliveryOrId)
    : deliveryOrId;
  if (delivery?.public_share_path) {
    return "https://htpweb.github.io/" + encodeURIComponent(delivery.public_share_path) + "/";
  }
  if (!delivery?.slug) return "";
  const url = new URL("index.html", publicAppRootUrl());
  url.searchParams.set("delivery", delivery.slug);
  return url.toString();
}

async function copyMasterDeliveryPublicUrl(deliveryId) {
  const url = masterDeliveryPublicUrl(deliveryId);
  if (!url) return message("Este DELIVERY no tiene slug público.", "error");
  try {
    await navigator.clipboard.writeText(url);
    message("Link corto del DELIVERY copiado.");
  } catch {
    const input = document.createElement("textarea");
    input.value = url;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    message(copied ? "Link corto del DELIVERY copiado." : "No se pudo copiar el link.", copied ? "success" : "error");
  }
}

async function shareMasterDeliveryPublicUrl(deliveryId) {
  const delivery = state.deliveries.find(item => item.id === deliveryId);
  const url = masterDeliveryPublicUrl(delivery);
  if (!delivery || !url) return message("Este DELIVERY no tiene página pública disponible.", "error");

  const payload = {
    title: delivery.name || "HTPWEB",
    text: "PIDE AQUÍ | " + (delivery.name || "HTPWEB"),
    url
  };

  if (navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  await copyMasterDeliveryPublicUrl(deliveryId);
  message("Tu navegador no abrió el menú Compartir; el link quedó copiado.");
}

function openMasterDeliveryPublicUrl(deliveryId) {
  const url = masterDeliveryPublicUrl(deliveryId);
  if (!url) return message("Este DELIVERY no tiene página pública disponible.", "error");
  window.open(url, "_blank", "noopener,noreferrer");
}

let currentMasterDeliveryQrId = null;

function closeMasterDeliveryQr() {
  $("deliveryQrModal")?.classList.add("hidden");
  document.body.classList.remove("delivery-qr-open");
  currentMasterDeliveryQrId = null;
}

function deliveryQrSafeFilename(name, suffix) {
  const base = String(name || "delivery")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "delivery";
  return base + "-" + suffix + ".png";
}

function downloadCanvasPng(canvas, filename) {
  if (!canvas) return;
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function loadQrBrandImage(url) {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function qrCanvasFromNode(node) {
  const canvas = node?.querySelector("canvas");
  if (canvas) return canvas;
  const image = node?.querySelector("img");
  if (!image) return null;
  const copy = document.createElement("canvas");
  copy.width = image.naturalWidth || 480;
  copy.height = image.naturalHeight || 480;
  copy.getContext("2d").drawImage(image, 0, 0, copy.width, copy.height);
  return copy;
}

async function renderMasterDeliveryQrCard(delivery, url) {
  const raw = $("deliveryQrRaw");
  const card = $("deliveryQrCardCanvas");
  if (!raw || !card) return;

  raw.innerHTML = "";
  if (typeof QRCode === "undefined") throw new Error("No se pudo cargar el generador QR.");

  new QRCode(raw, {
    text: url,
    width: 560,
    height: 560,
    colorDark: "#111827",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });

  const qrCanvas = qrCanvasFromNode(raw);
  if (!qrCanvas) throw new Error("No se pudo generar el QR.");

  const ctx = card.getContext("2d");
  ctx.clearRect(0, 0, card.width, card.height);
  ctx.fillStyle = "#fffdf2";
  ctx.fillRect(0, 0, card.width, card.height);

  ctx.fillStyle = "#f5e8a8";
  ctx.fillRect(0, 0, card.width, 18);

  const logo = await loadQrBrandImage(delivery.logo_url);
  if (logo) {
    const box = 118;
    const x = (card.width - box) / 2;
    const y = 56;
    ctx.save();
    ctx.beginPath();
    ctx.arc(card.width / 2, y + box / 2, box / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, box, box);
    const ratio = Math.min(box / logo.naturalWidth, box / logo.naturalHeight);
    const w = logo.naturalWidth * ratio;
    const h = logo.naturalHeight * ratio;
    ctx.drawImage(logo, x + (box - w) / 2, y + (box - h) / 2, w, h);
    ctx.restore();
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#111827";
  ctx.font = "700 42px Arial, sans-serif";
  const name = String(delivery.name || "DELIVERY");
  const displayName = name.length > 30 ? name.slice(0, 29) + "…" : name;
  ctx.fillText(displayName, card.width / 2, 230);

  ctx.fillStyle = "#475569";
  ctx.font = "600 25px Arial, sans-serif";
  ctx.fillText("Escanea y pide aquí", card.width / 2, 276);

  const qrSize = 560;
  const qrX = (card.width - qrSize) / 2;
  const qrY = 325;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrX - 24, qrY - 24, qrSize + 48, qrSize + 48);
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  ctx.fillStyle = "#334155";
  ctx.font = "600 20px Arial, sans-serif";
  const shortUrl = url.length > 62 ? url.slice(0, 59) + "…" : url;
  ctx.fillText(shortUrl, card.width / 2, 950);

  ctx.fillStyle = "#64748b";
  ctx.font = "600 18px Arial, sans-serif";
  ctx.fillText("Plataforma de HTPWEB", card.width / 2, 1000);

  ctx.fillStyle = "#f5e8a8";
  ctx.fillRect(0, card.height - 18, card.width, 18);
}

async function openMasterDeliveryQr(deliveryId) {
  if (!["MASTER","DELIVERY_ADMIN"].includes(state.role)) return;
  const delivery = (state.deliveryProfileRecord?.id===deliveryId ? state.deliveryProfileRecord : null) ||
    state.deliveries.find(item => item.id === deliveryId);
  const url = masterDeliveryPublicUrl(delivery);
  if (!delivery || !url) return message("Este DELIVERY no tiene página pública disponible.", "error");

  currentMasterDeliveryQrId = deliveryId;
  $("deliveryQrName").textContent = delivery.name || "DELIVERY";
  $("deliveryQrUrl").textContent = url;
  $("deliveryQrUrl").href = url;

  const logoWrap = $("deliveryQrLogoWrap");
  const logo = $("deliveryQrLogo");
  if (delivery.logo_url) {
    logo.src = delivery.logo_url;
    logo.alt = "Logo de " + (delivery.name || "DELIVERY");
    logoWrap?.classList.remove("hidden");
  } else {
    logo.removeAttribute("src");
    logoWrap?.classList.add("hidden");
  }

  $("deliveryQrModal")?.classList.remove("hidden");
  document.body.classList.add("delivery-qr-open");

  try {
    await renderMasterDeliveryQrCard(delivery, url);
  } catch (error) {
    closeMasterDeliveryQr();
    return message(error.message || "No se pudo generar el código QR.", "error");
  }

  $("deliveryQrDownloadBranded").onclick = () =>
    downloadCanvasPng($("deliveryQrCardCanvas"), deliveryQrSafeFilename(delivery.name, "tarjeta-qr"));

  $("deliveryQrDownloadPure").onclick = () => {
    const qr = qrCanvasFromNode($("deliveryQrRaw"));
    if (qr) downloadCanvasPng(qr, deliveryQrSafeFilename(delivery.name, "qr"));
  };

  $("deliveryQrCopy").onclick = () => copyMasterDeliveryPublicUrl(deliveryId);
  $("deliveryQrOpen").onclick = () => openMasterDeliveryPublicUrl(deliveryId);
}


const EXPRESS_DEMO_ROOT="https://htpweb.github.io/htpweb/express/";

function expressSlotUrl(slotKey){
  return EXPRESS_DEMO_ROOT+"?slot="+encodeURIComponent(slotKey);
}

async function copyExpressSlotLink(slotKey){
  const url=expressSlotUrl(slotKey);
  await navigator.clipboard.writeText(url);
  message("Link "+slotKey+" copiado.");
}

function openExpressSlotLink(slotKey){
  window.open(expressSlotUrl(slotKey),"_blank","noopener,noreferrer");
}

async function createExpressDemoSlot(){
  if(state.role!=="MASTER")return;
  try{
    const slotKey=await rpc("master_create_express_slot");
    message("Nuevo acceso "+slotKey+" generado.");
    await loadExpressDemoSlots();
    if(slotKey){
      await copyExpressSlotLink(slotKey).catch(()=>{});
    }
  }catch(e){message(e.message||"No se pudo generar un nuevo Express.","error");}
}

async function resetExpressDemoSlot(slotKey){
  if(state.role!=="MASTER")return;
  if(!confirm("¿Liberar "+slotKey+" para asignarlo a otro prospecto? La demo ya creada seguirá activa hasta su vencimiento."))return;
  try{
    await rpc("master_reset_express_slot",{p_slot_key:slotKey});
    message(slotKey+" quedó disponible nuevamente.");
    await loadExpressDemoSlots();
  }catch(e){message(e.message||"No se pudo liberar el link Express.","error");}
}

async function loadExpressDemoSlots(){
  if(state.role!=="MASTER")return;
  const box=$("expressDemoSlots");
  if(!box)return;
  box.innerHTML='<div class="muted">Cargando Express...</div>';
  try{
    const rows=await rpc("master_express_slots_snapshot");
    const list=Array.isArray(rows)?rows:[];
    const available=list.filter(row=>!row.demo_id).length;
    const inUse=list.filter(row=>row.demo_id&&row.demo_active).length;
    const used=list.filter(row=>row.demo_id&&!row.demo_active).length;
    if($("expressDemoSummary")) $("expressDemoSummary").textContent=
      list.length+" accesos · "+available+" disponibles · "+inUse+" en uso · "+used+" usados/vencidos";
    box.innerHTML=list.map(row=>{
      const url=expressSlotUrl(row.slot_key);
      const occupied=Boolean(row.demo_id);
      const status=occupied?(row.demo_active?"EN USO":"USADO"):"DISPONIBLE";
      const expiry=row.demo_expires_at?new Date(row.demo_expires_at).toLocaleDateString("es-EC"):"—";
      return '<div class="card express-demo-card">'+
        '<div class="row between" style="gap:10px;align-items:flex-start">'+
          '<div><div class="express-slot-name">'+esc(row.slot_key)+'</div><div class="badge">'+esc(status)+'</div></div>'+
          '<button class="btn-muted" type="button" onclick="openExpressSlotLink(\''+esc(row.slot_key)+'\')">Abrir</button>'+
        '</div>'+
        '<a class="express-slot-url" href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(url)+'</a>'+
        (occupied?'<div class="express-slot-meta"><strong>'+esc(row.demo_name||"Demo Express")+'</strong><span>WhatsApp: '+esc(row.demo_whatsapp||"—")+'</span><span>Vence: '+esc(expiry)+'</span></div>':'<div class="muted">Listo para enviar a un nuevo prospecto.</div>')+
        '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">'+
          '<button class="btn-primary" type="button" onclick="copyExpressSlotLink(\''+esc(row.slot_key)+'\')">Copiar link</button>'+
          '<button class="btn-muted" type="button" onclick="openExpressSlotLink(\''+esc(row.slot_key)+'\')">Probar</button>'+
          (occupied?'<button class="btn-muted" type="button" onclick="resetExpressDemoSlot(\''+esc(row.slot_key)+'\')">Liberar</button>':'')+
        '</div>'+
      '</div>';
    }).join("")||'<div class="muted">No hay links Express configurados.</div>';
  }catch(e){
    box.innerHTML='<div class="message error">'+esc(e.message||"No se pudieron cargar los links Express.")+'</div>';
  }
}

async function loadDeliveriesModule() {
  if (state.role !== "MASTER") return;

  const { data, error } = await supabaseClient
    .from("deliveries")
    .select("id,name,slug,public_share_path,description,logo_url,phone,whatsapp,active,city_id")
    .order("name");

  if (error) throw error;

  state.deliveries = data || [];
  renderScopeSelectors();

  $("deliveriesList").innerHTML = state.deliveries.length
    ? `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Estado</th><th>Link público del DELIVERY</th><th>Teléfono</th><th>Acciones</th></tr></thead>
          <tbody>
            ${state.deliveries.map(d => {
              const publicUrl = masterDeliveryPublicUrl(d);
              return `
              <tr>
                <td>
                  <strong>${esc(d.name)}</strong>
                  <div class="muted"><code>${esc(d.slug || "sin-slug")}</code></div>
                </td>
                <td>${d.active ? "Activo" : "Inactivo"}</td>
                <td style="min-width:320px">
                  ${publicUrl
                    ? '<a href="'+esc(publicUrl)+'" target="_blank" rel="noopener noreferrer" style="word-break:break-all">'+esc(publicUrl)+'</a>'
                    : '<span class="muted">Sin slug público</span>'}
                  ${publicUrl ? '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">'+
                    '<button class="btn-muted" type="button" onclick="copyMasterDeliveryPublicUrl(\''+esc(d.id)+'\')">Copiar link</button>'+
                    '<button class="btn-primary" type="button" onclick="shareMasterDeliveryPublicUrl(\''+esc(d.id)+'\')">Compartir</button>'+
                    '<button class="btn-muted" type="button" onclick="openMasterDeliveryQr(\''+esc(d.id)+'\')">QR</button>'+
                    '<button class="btn-muted" type="button" onclick="openMasterDeliveryPublicUrl(\''+esc(d.id)+'\')">Ver locales</button>'+
                    '</div>' : ''}
                </td>
                <td>${esc(d.phone || "—")}</td>
                <td>
                  <button class="btn-muted" type="button" onclick="editMasterDeliveryRecord('${esc(d.id)}')">Configurar</button>
                </td>
              </tr>
            `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `
    : '<div class="muted">No hay deliveries.</div>';
}

function editMasterDeliveryRecord(deliveryId) {
  if (state.role !== "MASTER") return;
  const d = state.deliveries.find(x => x.id === deliveryId);
  if (!d) return;
  if ($("deliveryEditId")) $("deliveryEditId").value = d.id;
  $("deliveryName").value = d.name || "";
  $("deliverySlug").value = d.slug || "";
  $("deliveryDescription").value = d.description || "";
  $("deliveryPhone").value = d.phone || "";
  $("deliveryWhatsapp").value = d.whatsapp || "";
  $("deliveryCity").value = d.city_id || "";
  if ($("deliveryActive")) $("deliveryActive").value = String(d.active !== false);
  $("saveDeliveryBtn").textContent = "Guardar cambios";
  if ($("deliveryWorkspaceSelect")) {
    $("deliveryWorkspaceSelect").value = d.id;
    syncMasterDeliveryWorkspace();
  }
  openMasterDeliveryWorkspaceTab("base");
  $("deliveryName").focus();
}

async function saveDelivery() {
  try {
    const editingId = $("deliveryEditId")?.value || null;
    const cityId = $("deliveryCity").value || null;
    if (!$("deliveryName").value.trim()) throw new Error("Escribe el nombre del DELIVERY.");
    if (!cityId) throw new Error("Selecciona el cantón del DELIVERY.");
    const deliveryId = await rpc("master_save_delivery", {
      p_delivery_id: editingId,
      p_name: $("deliveryName").value.trim(),
      p_slug: $("deliverySlug").value.trim() || null,
      p_description: $("deliveryDescription").value.trim() || null,
      p_logo_url: null,
      p_phone: $("deliveryPhone").value.trim() || null,
      p_whatsapp: $("deliveryWhatsapp").value.trim() || null,
      p_city_id: cityId,
      p_active: $("deliveryActive") ? $("deliveryActive").value === "true" : true
    });

    if (!editingId) {
      await Promise.all([
        rpc("master_set_delivery_capability",{p_delivery_id:deliveryId,p_capability_code:"delivery.info.manage",p_enabled:true}),
        rpc("master_set_delivery_capability",{p_delivery_id:deliveryId,p_capability_code:"zones.manage",p_enabled:true})
      ]);
    }

    message(editingId ? "Delivery actualizado." : "Delivery creado. Continúa con Cuenta y Zonas. En Cuenta habilita Tarifa fija y/o Por distancia; el DELIVERY definirá los precios.");
    ["deliveryName","deliverySlug","deliveryDescription","deliveryPhone","deliveryWhatsapp"].forEach(id => { if ($(id)) $(id).value = ""; });
    if ($("deliveryEditId")) $("deliveryEditId").value = "";
    if ($("deliveryActive")) $("deliveryActive").value = "true";
    $("saveDeliveryBtn").textContent = "Crear delivery";
    await Promise.all([loadScopes(), loadDeliveriesModule()]);
    if (window.refreshMasterDeliveryWorkspaceSelector) {
      window.refreshMasterDeliveryWorkspaceSelector(deliveryId);
      const selector = $("deliveryWorkspaceSelect");
      if (selector) selector.value = deliveryId;
      await syncMasterDeliveryWorkspace();
      if (!editingId) openMasterDeliveryWorkspaceTab("access");
    }
  } catch (e) {
    message(e.message || "No se pudo guardar el delivery.", "error");
  }
}

function feeDeliveryRecord() {
  const id = $("feeDelivery")?.value || "";
  return state.deliveries.find(delivery => delivery.id === id) || null;
}

function feeModeLabel(mode) {
  return mode === "DISTANCE" ? "Por distancia" : mode === "ZONE" ? "Por zonas" : "Tarifa fija";
}

function feeCapabilityForMode(mode) {
  const caps=state.feeCapabilities||{};
  if(mode==="FIXED")return Boolean(caps.fixed);
  if(mode==="DISTANCE")return Boolean(caps.distance);
  if(mode==="ZONE")return Boolean(caps.zone);
  return false;
}

function feeMoney(value) {
  const n=Number(value);
  return Number.isFinite(n) ? "$"+n.toFixed(2) : "—";
}

function feeModeConfigured(mode) {
  if(mode==="FIXED"){
    return state.feeConfig
      && Number.isFinite(Number(state.feeConfig.fixed_day_fee))
      && Number.isFinite(Number(state.feeConfig.fixed_night_fee));
  }
  if(mode==="DISTANCE"){
    return Array.isArray(state.feeDistanceBands)&&state.feeDistanceBands.length>0;
  }
  if(mode==="ZONE"){
    const zoneMode=state.feeConfig?.zone_pricing_mode||"SIMPLE";
    if(zoneMode==="DETAILED"){
      const required=(state.feeZones||[]).length*(state.feeZones||[]).length;
      return required>0&&(state.feeZoneRates||[]).length===required;
    }
    const s=state.feeZoneSimple||{};
    return ["same_zone_day_fee","same_zone_night_fee","other_zone_day_fee","other_zone_night_fee"]
      .every(key=>Number.isFinite(Number(s[key])));
  }
  return false;
}

function feeModeStatus(mode) {
  if(!feeCapabilityForMode(mode))return "No incluida en tu plan";
  if(state.feeConfig?.active===true&&state.feeConfig?.mode===mode)return "ACTIVA";
  return feeModeConfigured(mode)?"Configurada":"Pendiente";
}

function renderFeeActiveNotice() {
  const box=$("feeActiveModeNotice");
  if(!box)return;
  const config=state.feeConfig;
  if(!config?.active){
    box.innerHTML="<strong>Sin modalidad activa.</strong> Configura una opción y pulsa “Usar esta modalidad”.";
    return;
  }
  const day=String(config.day_start_time||"06:00").slice(0,5);
  const night=String(config.night_start_time||"18:00").slice(0,5);
  box.innerHTML="<strong>Modalidad actualmente activa: "+esc(feeModeLabel(config.mode))+"</strong>"+
    (state.feeCapabilities?.day_night
      ?" · Día "+esc(day)+"–"+esc(night)+" · Noche "+esc(night)+"–"+esc(day)
      :" · Una sola tarifa durante todo el día");
}

function renderFeeModeCards() {
  const box=$("feeModeCards");
  if(!box)return;
  const modes=[
    {mode:"FIXED",title:"Tarifa fija",detail:"Precio fijo por entrega."},
    {mode:"DISTANCE",title:"Por distancia",detail:"Precios por rangos de kilómetros."},
    {mode:"ZONE",title:"Por zonas",detail:"Simple o por combinación de zonas."}
  ];

  box.innerHTML=modes.map(item=>{
    const included=feeCapabilityForMode(item.mode);
    const selected=state.feePanel===item.mode;
    return '<button type="button" class="selection-button '+(selected?'is-selected':'')+'" data-fee-mode-card="'+item.mode+'" '+
      'aria-pressed="'+String(selected)+'" '+
      (included?"":"disabled")+
      ' style="min-height:112px;text-align:left;padding:16px;white-space:normal;'+
      (!included?'opacity:.55;':'')+'">'+
      '<strong style="display:block;font-size:1.05rem;margin-bottom:6px">'+esc(item.title)+'</strong>'+
      '<span style="display:block;margin-bottom:6px">'+esc(feeModeStatus(item.mode))+'</span>'+
      '<small>'+esc(included?item.detail:"Esta modalidad no está habilitada en tu plan.")+'</small>'+
      '</button>';
  }).join("");

  box.querySelectorAll("[data-fee-mode-card]").forEach(button=>{
    button.onclick=()=>selectFeeModePanel(button.dataset.feeModeCard);
  });
}

function selectFeeModePanel(mode) {
  if(!feeCapabilityForMode(mode))return;
  state.feePanel=mode;
  renderFeeWorkspace();
}

function renderFeePanelStatus(id,mode) {
  const node=$(id);
  if(!node)return;
  node.textContent=feeModeStatus(mode);
}

function renderFeeFixedPanel() {
  if($("feeFixedDay"))$("feeFixedDay").value=state.feeConfig?.fixed_day_fee ?? "";
  if($("feeFixedNight")){
    $("feeFixedNight").value=state.feeConfig?.fixed_night_fee ?? "";
    $("feeFixedNight").disabled=!state.feeCapabilities?.day_night;
  }
  renderFeePanelStatus("feeFixedPanelStatus","FIXED");
}

function syncFeeDistanceBandsFromDom() {
  const rows=[...document.querySelectorAll("[data-fee-band-row]")];
  if(!rows.length)return state.feeDistanceBands||[];
  state.feeDistanceBands=rows.map((row,index)=>{
    const maxInput=row.querySelector("[data-fee-band-max]");
    const dayInput=row.querySelector("[data-fee-band-day]");
    const nightInput=row.querySelector("[data-fee-band-night]");
    const current=state.feeDistanceBands?.[index]||{};
    return {
      ...current,
      max_distance_km:maxInput?maxInput.value:null,
      day_fee:dayInput?.value??current.day_fee??"",
      night_fee:nightInput?.value??current.night_fee??""
    };
  });
  return state.feeDistanceBands;
}

function formatFeeDistanceKm(value) {
  const n=Number(value);
  if(!Number.isFinite(n))return "";
  return new Intl.NumberFormat("es-EC",{maximumFractionDigits:2}).format(n);
}

function feeUnlimitedDistanceLabel(bands,index) {
  if(index<=0)return "Todas las distancias";
  const previous=Number(bands?.[index-1]?.max_distance_km);
  return Number.isFinite(previous)&&previous>0
    ? "Más de "+formatFeeDistanceKm(previous)+" km"
    : "Más del rango anterior";
}

function updateFeeDistanceUnlimitedLabels() {
  const bands=syncFeeDistanceBandsFromDom();
  document.querySelectorAll("[data-fee-band-unlimited-label]").forEach(node=>{
    const index=Number(node.dataset.feeBandUnlimitedLabel);
    node.textContent=feeUnlimitedDistanceLabel(bands,index);
  });
}

function renderFeeDistanceBands() {
  const box=$("feeDistanceBandsList");
  if(!box)return;
  const bands=state.feeDistanceBands||[];
  if(!bands.length){
    box.innerHTML='<div class="workspace-note"><strong>Sin rangos configurados.</strong><div style="margin-top:6px">Pulsa <strong>+ Nuevo</strong> para crear el primer precio por distancia.</div></div>';
    renderFeePanelStatus("feeDistancePanelStatus","DISTANCE");
    return;
  }

  box.innerHTML='<div class="table-wrap"><table><thead><tr><th>Hasta</th><th>Día</th><th>Noche</th><th></th></tr></thead><tbody>'+
    bands.map((band,index)=>{
      const last=index===bands.length-1;
      const unlimited=band.max_distance_km===null;
      const maxCell=unlimited
        ? '<span class="badge" data-fee-band-unlimited-label="'+index+'">'+esc(feeUnlimitedDistanceLabel(bands,index))+'</span>'
        : '<div class="row" style="gap:6px;flex-wrap:nowrap"><input data-fee-band-max type="number" min="0.01" step="0.01" value="'+esc(band.max_distance_km??"")+'" placeholder="Ej. 2.00" style="min-width:110px"><span>km</span>'+
          (last?'<button type="button" class="btn-muted" data-fee-band-unlimit="'+index+'">Usar como último rango</button>':'')+'</div>';
      return '<tr data-fee-band-row="'+index+'">'+
        '<td>'+maxCell+'</td>'+
        '<td><input data-fee-band-day type="number" min="0" step="0.01" value="'+esc(band.day_fee??"")+'" placeholder="0.00"></td>'+
        '<td><input data-fee-band-night type="number" min="0" step="0.01" value="'+esc(band.night_fee??"")+'" placeholder="0.00" '+(state.feeCapabilities?.day_night?"":"disabled")+'></td>'+
        '<td><button type="button" class="btn-danger" data-fee-band-remove="'+index+'">Quitar</button></td>'+
        '</tr>';
    }).join("")+'</tbody></table></div>';

  box.querySelectorAll("[data-fee-band-unlimit]").forEach(button=>{
    button.onclick=()=>toggleFeeDistanceUnlimited(Number(button.dataset.feeBandUnlimit));
  });
  box.querySelectorAll("[data-fee-band-remove]").forEach(button=>{
    button.onclick=()=>removeFeeDistanceBand(Number(button.dataset.feeBandRemove));
  });
  box.querySelectorAll("[data-fee-band-max]").forEach(input=>{
    input.addEventListener("input",updateFeeDistanceUnlimitedLabels);
    input.addEventListener("change",updateFeeDistanceUnlimitedLabels);
  });
  renderFeePanelStatus("feeDistancePanelStatus","DISTANCE");
}

function addFeeDistanceBand() {
  syncFeeDistanceBandsFromDom();
  const bands=state.feeDistanceBands||[];
  const source=bands.length?bands[Math.max(0,bands.length-1)]:{};
  const row={
    max_distance_km:"",
    day_fee:source.day_fee??"",
    night_fee:source.night_fee??source.day_fee??""
  };
  if(bands.length&&bands[bands.length-1].max_distance_km===null){
    bands.splice(bands.length-1,0,row);
  }else{
    bands.push(row);
  }
  state.feeDistanceBands=bands;
  renderFeeDistanceBands();
}

function removeFeeDistanceBand(index) {
  syncFeeDistanceBandsFromDom();
  state.feeDistanceBands.splice(index,1);
  renderFeeDistanceBands();
}

function toggleFeeDistanceUnlimited(index) {
  syncFeeDistanceBandsFromDom();
  const bands=state.feeDistanceBands||[];
  if(index!==bands.length-1){
    message("Solo el último rango puede quedar Sin límite.","error");
    return;
  }
  bands[index].max_distance_km=bands[index].max_distance_km===null?"":null;
  state.feeDistanceBands=bands;
  renderFeeDistanceBands();
}

function collectFeeDistanceBands() {
  const bands=syncFeeDistanceBandsFromDom();
  if(!bands.length)throw new Error("Agrega al menos un rango de distancia.");
  let previous=0;
  return bands.map((band,index)=>{
    const last=index===bands.length-1;
    const unlimited=band.max_distance_km===null;
    let max=null;
    if(!unlimited){
      max=Number(band.max_distance_km);
      if(!Number.isFinite(max)||max<=previous)throw new Error("Cada valor de Hasta debe ser mayor que el rango anterior.");
      if(last)throw new Error("El último rango debe quedar como Sin límite.");
      previous=max;
    }else if(!last){
      throw new Error("Solo el último rango puede quedar como Sin límite.");
    }

    const day=Number(band.day_fee);
    const night=state.feeCapabilities?.day_night?Number(band.night_fee):day;
    if(!Number.isFinite(day)||day<0||!Number.isFinite(night)||night<0){
      throw new Error("Completa los precios Día y Noche de todos los rangos.");
    }
    return {max_distance_km:max,day_fee:day,night_fee:night};
  });
}

function feeZoneRateKey(origin,destination) {
  return String(origin)+"|"+String(destination);
}

function renderFeeZoneDetailed() {
  const box=$("feeZoneDetailedList");
  if(!box)return;
  const zones=state.feeZones||[];
  if(!zones.length){
    box.innerHTML='<div class="message error">No hay zonas activas para configurar una matriz de tarifas.</div>';
    return;
  }
  const existing=new Map((state.feeZoneRates||[]).map(rate=>[
    feeZoneRateKey(rate.origin_zone_id,rate.destination_zone_id),rate
  ]));
  const rows=[];
  zones.forEach(origin=>zones.forEach(destination=>{
    const rate=existing.get(feeZoneRateKey(origin.id,destination.id))||{};
    rows.push('<tr data-fee-zone-rate data-origin-zone="'+esc(origin.id)+'" data-destination-zone="'+esc(destination.id)+'">'+
      '<td><strong>'+esc(origin.code||origin.name)+'</strong><div class="muted">'+esc(origin.name||"")+'</div></td>'+
      '<td><strong>'+esc(destination.code||destination.name)+'</strong><div class="muted">'+esc(destination.name||"")+'</div></td>'+
      '<td><input data-zone-day type="number" min="0" step="0.01" value="'+esc(rate.day_fee??"")+'" placeholder="0.00"></td>'+
      '<td><input data-zone-night type="number" min="0" step="0.01" value="'+esc(rate.night_fee??"")+'" placeholder="0.00" '+(state.feeCapabilities?.day_night?"":"disabled")+'></td>'+
      '</tr>');
  }));
  box.innerHTML='<div class="table-wrap"><table><thead><tr><th>Zona origen</th><th>Zona destino</th><th>Día</th><th>Noche</th></tr></thead><tbody>'+
    rows.join("")+'</tbody></table></div>';
}

function snapshotFeeZoneSimpleInputs() {
  const read=id=>{
    const raw=$(id)?.value?.trim?.()??"";
    return raw===""?null:raw;
  };
  state.feeZoneSimple={
    ...(state.feeZoneSimple||{}),
    same_zone_day_fee:read("feeZoneSameDay"),
    same_zone_night_fee:read("feeZoneSameNight"),
    other_zone_day_fee:read("feeZoneOtherDay"),
    other_zone_night_fee:read("feeZoneOtherNight")
  };
}

function snapshotFeeZoneDetailedInputs() {
  const rows=[...document.querySelectorAll("[data-fee-zone-rate]")];
  if(!rows.length)return;
  state.feeZoneRates=rows.map(row=>({
    origin_zone_id:row.dataset.originZone,
    destination_zone_id:row.dataset.destinationZone,
    day_fee:row.querySelector("[data-zone-day]")?.value??"",
    night_fee:row.querySelector("[data-zone-night]")?.value??""
  }));
}

function setFeeZoneView(view) {
  const next=view==="DETAILED"?"DETAILED":"SIMPLE";
  const current=state.feeZoneView||"SIMPLE";
  if(current==="DETAILED"&&next!=="DETAILED")snapshotFeeZoneDetailedInputs();
  if(current==="SIMPLE"&&next!=="SIMPLE")snapshotFeeZoneSimpleInputs();

  state.feeZoneView=next;
  $("feeZoneSimplePanel")?.classList.toggle("hidden",state.feeZoneView!=="SIMPLE");
  $("feeZoneDetailedPanel")?.classList.toggle("hidden",state.feeZoneView!=="DETAILED");
  if($("feeZoneSimpleTab")){
    $("feeZoneSimpleTab").className="selection-button "+(state.feeZoneView==="SIMPLE"?"is-selected":"");
    $("feeZoneSimpleTab").setAttribute("aria-pressed",String(state.feeZoneView==="SIMPLE"));
  }
  if($("feeZoneDetailedTab")){
    $("feeZoneDetailedTab").className="selection-button "+(state.feeZoneView==="DETAILED"?"is-selected":"");
    $("feeZoneDetailedTab").setAttribute("aria-pressed",String(state.feeZoneView==="DETAILED"));
  }
  if(state.feeZoneView==="DETAILED")renderFeeZoneDetailed();
}

function renderFeeZonePanel() {
  const s=state.feeZoneSimple||{};
  if($("feeZoneSameDay"))$("feeZoneSameDay").value=s.same_zone_day_fee??"";
  if($("feeZoneSameNight")){
    $("feeZoneSameNight").value=s.same_zone_night_fee??"";
    $("feeZoneSameNight").disabled=!state.feeCapabilities?.day_night;
  }
  if($("feeZoneOtherDay"))$("feeZoneOtherDay").value=s.other_zone_day_fee??"";
  if($("feeZoneOtherNight")){
    $("feeZoneOtherNight").value=s.other_zone_night_fee??"";
    $("feeZoneOtherNight").disabled=!state.feeCapabilities?.day_night;
  }
  renderFeePanelStatus("feeZonePanelStatus","ZONE");
  setFeeZoneView(state.feeZoneView||state.feeConfig?.zone_pricing_mode||"SIMPLE");
}

function renderFeeWorkspace() {
  renderFeeActiveNotice();
  renderFeeModeCards();

  const panel=state.feePanel||"FIXED";
  $("feeFixedPanel")?.classList.toggle("hidden",panel!=="FIXED");
  $("feeDistancePanel")?.classList.toggle("hidden",panel!=="DISTANCE");
  $("feeZonePanel")?.classList.toggle("hidden",panel!=="ZONE");

  if(panel==="FIXED")renderFeeFixedPanel();
  if(panel==="DISTANCE")renderFeeDistanceBands();
  if(panel==="ZONE")renderFeeZonePanel();

  const caps=state.feeCapabilities||{};
  $("feeScheduleCard")?.classList.toggle("hidden",!caps.day_night);
  if($("feeDayNightPlanStatus"))$("feeDayNightPlanStatus").textContent=caps.day_night?"Incluida en el plan":"No incluida";
}

async function loadFees() {
  if(state.role!=="DELIVERY_ADMIN")return;
  const select=$("feeDelivery");
  if(!select)return;
  const previous=select.value;
  const available=state.deliveries.filter(delivery=>delivery.active!==false);
  select.innerHTML=available.length
    ? available.map(delivery=>'<option value="'+esc(delivery.id)+'">'+esc(delivery.name)+'</option>').join("")
    : '<option value="">No hay DELIVERY disponible</option>';
  if(previous&&available.some(delivery=>delivery.id===previous))select.value=previous;
  await loadFeeDelivery();
}

async function loadFeeDelivery() {
  const delivery=feeDeliveryRecord();
  if(!delivery){
    state.feeCapabilities={fixed:false,distance:false,zone:false,day_night:false};
    state.feeConfig=null;
    state.feeDistanceBands=[];
    state.feeZoneSimple=null;
    state.feeZoneRates=[];
    state.feeZones=[];
    renderFeeWorkspace();
    return;
  }

  try{
    const workspace=await rpc("delivery_fee_workspace",{p_delivery_id:delivery.id});
    state.feeCapabilities=workspace?.capabilities||{fixed:false,distance:false,zone:false,day_night:false};
    state.feeConfig=workspace?.config||null;
    state.feeDistanceBands=(workspace?.distance_bands||[]).map(b=>({...b}));
    state.feeZoneSimple=workspace?.zone_simple||null;
    state.feeZoneRates=(workspace?.zone_rates||[]).map(r=>({...r}));
    state.feeZones=(workspace?.zones||[]).map(z=>({...z}));

    const preferred=state.feePanel;
    if(!preferred||!feeCapabilityForMode(preferred)){
      const active=state.feeConfig?.mode;
      state.feePanel=feeCapabilityForMode(active)
        ? active
        : ["FIXED","DISTANCE","ZONE"].find(feeCapabilityForMode)||"FIXED";
    }
    state.feeZoneView=state.feeConfig?.zone_pricing_mode||state.feeZoneView||"SIMPLE";

    if($("feeDayStart"))$("feeDayStart").value=String(state.feeConfig?.day_start_time||"06:00").slice(0,5);
    if($("feeNightStart"))$("feeNightStart").value=String(state.feeConfig?.night_start_time||"18:00").slice(0,5);

    renderFeeWorkspace();
  }catch(e){
    message(e.message||"No se pudieron cargar las tarifas del DELIVERY.","error");
  }
}

function feeReadNonNegative(id,label) {
  const raw=$(id)?.value?.trim?.()??"";
  if(raw==="")throw new Error("Completa "+label+".");
  const n=Number(raw);
  if(!Number.isFinite(n)||n<0)throw new Error(label+" debe ser un número igual o mayor que 0.");
  return n;
}

async function saveFeeSchedule() {
  try{
    const delivery=feeDeliveryRecord();
    if(!delivery)throw new Error("Selecciona un DELIVERY.");
    const dayStart=$("feeDayStart").value;
    const nightStart=$("feeNightStart").value;
    if(!dayStart||!nightStart)throw new Error("Selecciona la hora de inicio del Día y de la Noche.");
    if(dayStart>=nightStart)throw new Error("El inicio del Día debe ser anterior al inicio de la Noche.");
    await rpc("save_delivery_fee_schedule",{
      p_delivery_id:delivery.id,
      p_day_start_time:dayStart,
      p_night_start_time:nightStart
    });
    message("Horario Día / Noche actualizado.");
    await loadFeeDelivery();
  }catch(e){
    message(e.message||"No se pudo guardar el horario de tarifas.","error");
  }
}

async function saveFixedFees(options={}) {
  const delivery=feeDeliveryRecord();
  if(!delivery)throw new Error("Selecciona un DELIVERY.");
  const day=feeReadNonNegative("feeFixedDay","el precio Día");
  const night=state.feeCapabilities?.day_night
    ? feeReadNonNegative("feeFixedNight","el precio Noche")
    : day;
  await rpc("save_delivery_fixed_fees",{
    p_delivery_id:delivery.id,
    p_day_fee:day,
    p_night_fee:night
  });
  if(!options.quiet)message("Tarifa fija Día / Noche guardada.");
  if(options.reload!==false)await loadFeeDelivery();
}

async function saveDistanceBands(options={}) {
  const delivery=feeDeliveryRecord();
  if(!delivery)throw new Error("Selecciona un DELIVERY.");
  const bands=collectFeeDistanceBands();
  await rpc("delivery_replace_distance_bands",{
    p_delivery_id:delivery.id,
    p_bands:bands
  });
  state.feeDistanceBands=bands.map((band,index)=>({...band,position:index+1}));
  if(!options.quiet)message("Rangos por distancia guardados.");
  if(options.reload!==false)await loadFeeDelivery();
}

async function saveZoneSimple(options={}) {
  const delivery=feeDeliveryRecord();
  if(!delivery)throw new Error("Selecciona un DELIVERY.");
  const sameDay=feeReadNonNegative("feeZoneSameDay","el precio Día de Misma zona");
  const sameNight=state.feeCapabilities?.day_night
    ? feeReadNonNegative("feeZoneSameNight","el precio Noche de Misma zona")
    : sameDay;
  const otherDay=feeReadNonNegative("feeZoneOtherDay","el precio Día de Otra zona");
  const otherNight=state.feeCapabilities?.day_night
    ? feeReadNonNegative("feeZoneOtherNight","el precio Noche de Otra zona")
    : otherDay;

  await rpc("save_delivery_zone_simple",{
    p_delivery_id:delivery.id,
    p_same_day:sameDay,
    p_same_night:sameNight,
    p_other_day:otherDay,
    p_other_night:otherNight
  });
  state.feeConfig={...(state.feeConfig||{}),zone_pricing_mode:"SIMPLE"};
  state.feeZoneSimple={
    same_zone_day_fee:sameDay,
    same_zone_night_fee:sameNight,
    other_zone_day_fee:otherDay,
    other_zone_night_fee:otherNight
  };
  state.feeZoneView="SIMPLE";
  if(!options.quiet)message("Tarifa simple por zonas guardada.");
  if(options.reload!==false)await loadFeeDelivery();
}

function collectZoneDetailedRates() {
  const rows=[...document.querySelectorAll("[data-fee-zone-rate]")];
  const zones=state.feeZones||[];
  const required=zones.length*zones.length;
  if(!required)throw new Error("No hay zonas activas para configurar.");
  if(rows.length!==required)throw new Error("No se pudo construir toda la matriz de zonas.");
  return rows.map(row=>{
    const day=Number(row.querySelector("[data-zone-day]")?.value);
    const night=state.feeCapabilities?.day_night
      ? Number(row.querySelector("[data-zone-night]")?.value)
      : day;
    if(!Number.isFinite(day)||day<0||!Number.isFinite(night)||night<0){
      throw new Error("Completa los precios Día y Noche de todas las combinaciones de zonas.");
    }
    return {
      origin_zone_id:row.dataset.originZone,
      destination_zone_id:row.dataset.destinationZone,
      day_fee:day,
      night_fee:night
    };
  });
}

async function saveZoneDetailed(options={}) {
  const delivery=feeDeliveryRecord();
  if(!delivery)throw new Error("Selecciona un DELIVERY.");
  const rates=collectZoneDetailedRates();
  await rpc("delivery_replace_zone_rates",{
    p_delivery_id:delivery.id,
    p_rates:rates
  });
  state.feeConfig={...(state.feeConfig||{}),zone_pricing_mode:"DETAILED"};
  state.feeZoneRates=rates.map(rate=>({...rate}));
  state.feeZoneView="DETAILED";
  if(!options.quiet)message("Matriz detallada de zonas guardada.");
  if(options.reload!==false)await loadFeeDelivery();
}

async function activateFeeMode(mode) {
  try{
    if(mode==="FIXED")await saveFixedFees({quiet:true,reload:false});
    if(mode==="DISTANCE")await saveDistanceBands({quiet:true,reload:false});
    if(mode==="ZONE"){
      if((state.feeZoneView||"SIMPLE")==="DETAILED"){
        await saveZoneDetailed({quiet:true,reload:false});
      }else{
        await saveZoneSimple({quiet:true,reload:false});
      }
    }
    const delivery=feeDeliveryRecord();
    await rpc("delivery_activate_fee_mode",{p_delivery_id:delivery.id,p_mode:mode});
    message(feeModeLabel(mode)+" es ahora la modalidad activa.");
    await loadFeeDelivery();
  }catch(e){
    message(e.message||"No se pudo activar la modalidad de tarifa.","error");
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

function coverageLimitReached() {
  const context=state.zoneContext;
  if(!context)return false;
  const max=context.max_zones;
  return max!==null&&max!==undefined&&Number(context.current_zones||0)>=Number(max);
}

function coverageVisibleZones() {
  const context=state.zoneContext;
  const term=String($("coverageZoneSearch")?.value||"").trim().toLowerCase();
  const onlyActive=state.coverageOnlyActive===true;
  return (Array.isArray(context?.zones)?context.zones:[]).filter(zone=>{
    if(onlyActive&&!zone.assigned)return false;
    const haystack=[zone.code,zone.name,zone.city_name,zone.province].filter(Boolean).join(" ").toLowerCase();
    return !term||haystack.includes(term);
  });
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
    ? "Sin límite"
    : context.max_zones;
  const activeZones=(context.zones||[]).filter(zone=>zone.assigned);
  const visibleLocals=activeZones.reduce((sum,zone)=>sum+Number(zone.local_count||0),0);
  const atLimit=coverageLimitReached();

  container.innerHTML =
    '<div class="coverage-summary-grid">'+
      '<div><span class="muted">DELIVERY</span><strong>'+esc(context.delivery.name||"—")+'</strong></div>'+
      '<div><span class="muted">Cantón</span><strong>'+esc(context.city?[context.city.name,context.city.province].filter(Boolean).join(" — "):"Sin cantón")+'</strong></div>'+
      '<div><span class="muted">Zonas activas</span><strong>'+esc(context.current_zones??0)+' / '+esc(max)+'</strong></div>'+
      '<div><span class="muted">Locales visibles</span><strong>'+esc(visibleLocals)+'</strong></div>'+
    '</div>'+
    (atLimit&&state.role==="DELIVERY_ADMIN"
      ? '<div class="workspace-warning" style="margin-top:10px"><strong>Límite del plan alcanzado.</strong> Para activar otra zona, primero desactiva una de las zonas actuales. Puedes seguir visualizando todas en el mapa.</div>'
      : '')+
    (context.selection_reset_pending
      ? '<div class="workspace-warning" style="margin-top:10px">Tu plan cambió: vuelve a seleccionar las zonas que deseas operar dentro del nuevo límite.</div>'
      : '');
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
      ? '<div class="message error">Este DELIVERY todavía no tiene cantón. Asígnalo desde la configuración MASTER.</div>'
      : '<div class="message error">Este DELIVERY todavía no tiene cantón configurado. Solicita a HTPWEB que lo asigne.</div>';
    return;
  }

  const zones=coverageVisibleZones();
  if(!zones.length){
    container.innerHTML='<div class="muted">No hay zonas que coincidan con el filtro.</div>';
    return;
  }

  const canAssign=state.role==="DELIVERY_ADMIN";
  const limitReached=coverageLimitReached();

  container.innerHTML=zones.map(zone=>{
    const selected=zone.id===state.coverageSelectedZoneId;
    const activateBlocked=canAssign&&!zone.assigned&&limitReached;
    return '<article class="coverage-zone-card '+(selected?'is-selected':'')+'" data-coverage-zone="'+esc(zone.id)+'">'+
      '<div class="row between" style="gap:8px">'+
        '<div><strong>'+esc((zone.code||"")+" — "+zone.name)+'</strong>'+
        '<div class="muted">'+esc(zone.local_count||0)+' LOCAL · '+esc(zone.city_name||"")+'</div></div>'+
        '<span class="badge">'+(zone.assigned?'Activa':'Disponible')+'</span>'+
      '</div>'+
      '<div class="row" style="margin-top:10px;gap:8px">'+
        '<button type="button" class="'+(zone.assigned?'btn-danger':'btn-primary')+'" data-coverage-toggle="'+esc(zone.id)+'" '+
        ((canAssign&&!activateBlocked)?'':'disabled')+'>'+
          (zone.assigned?'Desactivar':'Activar')+
        '</button>'+
        '<button type="button" class="btn-muted" data-coverage-focus="'+esc(zone.id)+'">Ver en mapa</button>'+
      '</div>'+
      (activateBlocked?'<div class="muted" style="margin-top:7px">Límite del plan alcanzado.</div>':'')+
    '</article>';
  }).join("");

  container.querySelectorAll("[data-coverage-zone]").forEach(card=>{
    card.onclick=event=>{
      if(event.target.closest("button"))return;
      selectCoverageZone(card.dataset.coverageZone,true);
    };
  });
  container.querySelectorAll("[data-coverage-focus]").forEach(button=>{
    button.onclick=()=>selectCoverageZone(button.dataset.coverageFocus,true);
  });
  container.querySelectorAll("[data-coverage-toggle]").forEach(button=>{
    button.onclick=()=> {
      const zone=(state.zoneContext?.zones||[]).find(z=>z.id===button.dataset.coverageToggle);
      if(zone)toggleDeliveryZone(zone.id,!zone.assigned);
    };
  });
}

async function ensureCoverageMap() {
  if(state.coverageMap||!$("coverageMap"))return;
  state.coverageMap=await ZoneMaps.create("coverageMap");
}

function coverageZoneColor(zone) {
  if(zone.id===state.coverageSelectedZoneId)return "#2563eb";
  return zone.assigned?"#e53935":"#94a3b8";
}

function renderCoverageMapDetail() {
  const box=$("coverageMapDetail");
  if(!box)return;
  const zone=(state.zoneContext?.zones||[]).find(z=>z.id===state.coverageSelectedZoneId);
  if(!zone){
    box.textContent="Selecciona una zona en la lista o en el mapa.";
    return;
  }
  box.innerHTML='<strong>'+esc((zone.code||"")+" — "+zone.name)+'</strong>'+
    '<div style="margin-top:5px">'+(zone.assigned?'Zona activa':'Zona disponible')+
    ' · '+esc(zone.local_count||0)+' LOCAL</div>';
}

function renderCoverageMap(fitAll=false) {
  const map=state.coverageMap;
  if(!map)return;
  map.clear();
  const zones=coverageVisibleZones().filter(zone=>Array.isArray(zone.boundary)&&zone.boundary.length>=3);

  zones.forEach(zone=>{
    const selected=zone.id===state.coverageSelectedZoneId;
    map.polygon(zone.boundary,{
      color:coverageZoneColor(zone),
      fillColor:coverageZoneColor(zone),
      weight:selected?4:2,
      fillOpacity:zone.assigned?.22:.08,
      opacity:1,
      interactive:true
    },()=>selectCoverageZone(zone.id,false));
  });

  renderCoverageMapDetail();
  if(fitAll&&zones.length)map.fit(zones.map(zone=>zone.boundary),30);
  map.resize();
}

function selectCoverageZone(zoneId,focus=false) {
  const zone=(state.zoneContext?.zones||[]).find(item=>item.id===zoneId);
  if(!zone)return;
  state.coverageSelectedZoneId=zoneId;
  renderCoverageZones();
  renderCoverageMap(false);
  if(focus&&Array.isArray(zone.boundary)&&zone.boundary.length>=3){
    state.coverageMap?.fit([zone.boundary],42);
  }
}

function toggleCoverageOnlyActive() {
  state.coverageOnlyActive=!state.coverageOnlyActive;
  const button=$("coverageOnlyActiveBtn");
  if(button){
    button.className="selection-button "+(state.coverageOnlyActive?"is-selected":"");
    button.setAttribute("aria-pressed",String(state.coverageOnlyActive));
  }
  renderCoverageZones();
  renderCoverageMap(true);
}

async function loadCoverage() {
  if (!["MASTER","DELIVERY_ADMIN"].includes(state.role)) return;

  const select = $("coverageDelivery");
  const previous = select.value;
  const available = state.role === "MASTER"
    ? state.deliveries
    : state.deliveries.filter(delivery => delivery.active !== false);

  select.innerHTML = available.length
    ? available.map(delivery => '<option value="'+esc(delivery.id)+'">'+esc(delivery.name)+'</option>').join("")
    : '<option value="">No hay DELIVERY disponible</option>';

  if (previous && available.some(delivery => delivery.id === previous)) select.value = previous;

  if (state.role === "MASTER") {
    const activeCities = state.cities.filter(city => city.active);
    $("coverageCity").innerHTML = activeCities.length
      ? activeCities.map(city => '<option value="'+city.id+'">'+esc(cityLabel(city.id))+'</option>').join("")
      : '<option value="">Primero crea una ciudad</option>';
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
    if(state.coverageMap)renderCoverageMap(false);
    return;
  }

  try {
    state.zoneContext = await rpc("delivery_zone_context", {
      p_delivery_id: delivery.id
    });

    if (state.role === "MASTER" && state.zoneContext?.delivery?.city_id && $("coverageCity")) {
      $("coverageCity").value = state.zoneContext.delivery.city_id;
    }

    const zones=state.zoneContext?.zones||[];
    if(!zones.some(zone=>zone.id===state.coverageSelectedZoneId)){
      state.coverageSelectedZoneId=zones.find(zone=>zone.assigned)?.id||zones[0]?.id||null;
    }

    renderCoverageSummary();
    renderCoverageZones();
    await ensureCoverageMap();
    renderCoverageMap(true);
  } catch (e) {
    state.zoneContext = null;
    renderCoverageSummary();
    $("coverageZonesList").innerHTML = '<div class="message error">'+esc(e.message || "No se pudo cargar la cobertura.")+'</div>';
  }
}

async function toggleDeliveryZone(zoneId, active) {
  const delivery = coverageDeliveryRecord();
  if (!delivery) return;

  try {
    if (state.role !== "DELIVERY_ADMIN") {
      throw new Error("MASTER define el territorio y el plan; el DELIVERY selecciona sus zonas operativas.");
    }
    state.coverageSelectedZoneId=zoneId;
    await rpc("delivery_set_zone_choice", {
      p_delivery_id: delivery.id,
      p_zone_id: zoneId,
      p_active: Boolean(active)
    });
    message(active ? "Zona activada para operar." : "Zona desactivada.");
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
    if (!cityId) throw new Error("Selecciona un cantón.");

    await rpc("master_set_delivery_city", {
      p_delivery_id: delivery.id,
      p_city_id: cityId
    });

    message("Cantón del DELIVERY actualizado.");
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
    const raw = $("coverageMaxZones")?.value?.trim?.()||"";

    if (!delivery) throw new Error("Selecciona un DELIVERY.");
    if (raw === "") throw new Error("Escribe el límite máximo de zonas.");

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) throw new Error("El límite debe ser un número entero igual o mayor que 0.");

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



const BRANDING_GENERIC_WORDS = new Set(["cafeteria","restaurant","restaurante","y","de","del","la","el"]);

function brandingNormalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\s*\d+\s*[.\-_)]*\s*/, "")
    .replace(/&/g, " y ")
    .replace(/\bburguer\b/g, "burger")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function brandingCompactName(value) {
  return brandingNormalizeName(value)
    .split(" ")
    .filter(token => token && !BRANDING_GENERIC_WORDS.has(token))
    .join(" ");
}

function brandingEditDistance(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const row = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
      previous = current;
    }
  }
  return row[right.length];
}

function brandingSimilarity(a, b) {
  const left = brandingCompactName(a) || brandingNormalizeName(a);
  const right = brandingCompactName(b) || brandingNormalizeName(b);
  const length = Math.max(left.length, right.length, 1);
  return 1 - brandingEditDistance(left, right) / length;
}

function matchBrandingLocal(folderName) {
  const normalized = brandingNormalizeName(folderName);
  const compact = brandingCompactName(folderName);
  const locals = Array.isArray(state.locals) ? state.locals : [];

  const exact = locals.filter(local => brandingNormalizeName(local.name) === normalized);
  if (exact.length === 1) return exact[0];

  if (compact) {
    const compactExact = locals.filter(local => brandingCompactName(local.name) === compact);
    if (compactExact.length === 1) return compactExact[0];
  }

  const ranked = locals
    .map(local => ({ local, score: brandingSimilarity(folderName, local.name) }))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length || ranked[0].score < 0.82) return null;
  if (ranked[1] && ranked[0].score - ranked[1].score < 0.08) return null;
  return ranked[0].local;
}

function brandingKindFromFileName(name) {
  const value = String(name || "").toLowerCase();
  if (!/\.(jpe?g|png|webp)$/.test(value)) return null;
  if (/^logo(?:[._\- ].*)?\.(jpe?g|png|webp)$/.test(value)) return "logo";
  if (/^banner(?:[._\- ].*)?\.(jpe?g|png|webp)$/.test(value)) return "banner";
  return null;
}

function brandingTypedFile(file) {
  if (file?.type) return file;
  const ext = String(file?.name || "").split(".").pop().toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return new File([file], file.name, { type, lastModified: file.lastModified || Date.now() });
}

function brandingFolderName(file) {
  const path = String(file.webkitRelativePath || file.name || "").replace(/\\/g, "/");
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  if (!parts.length) return "";
  return parts.length >= 2 ? parts[1] : parts[0];
}

function buildBrandingImportPlan(fileList) {
  const groups = new Map();

  for (const raw of [...(fileList || [])]) {
    const kind = brandingKindFromFileName(raw.name);
    if (!kind) continue;
    const folder = brandingFolderName(raw);
    if (!folder) continue;

    if (!groups.has(folder)) groups.set(folder, {});
    const group = groups.get(folder);
    const current = group[kind];
    if (!current || raw.size > current.size) group[kind] = raw;
  }

  const unmatched = [];
  const byLocal = new Map();

  for (const [folder, media] of groups) {
    const local = matchBrandingLocal(folder);
    if (!local) {
      unmatched.push(folder);
      continue;
    }

    if (!byLocal.has(local.id)) byLocal.set(local.id, { local, folder, logo: null, banner: null });
    const item = byLocal.get(local.id);
    if (media.logo && (!item.logo || media.logo.size > item.logo.size)) item.logo = media.logo;
    if (media.banner && (!item.banner || media.banner.size > item.banner.size)) item.banner = media.banner;
  }

  return { items: [...byLocal.values()], unmatched };
}

function setBrandingFolderStatus(text) {
  const box = $("brandingFolderStatus");
  if (box) box.textContent = text;
}

async function importBrandingFolder(fileList) {
  const input = $("brandingFolderInput");
  const button = $("selectBrandingFolderBtn");

  try {
    if (state.role !== "MASTER") throw new Error("Operación exclusiva de MASTER.");

    const plan = buildBrandingImportPlan(fileList);
    const mediaCount = plan.items.reduce((sum, item) => sum + (item.logo ? 1 : 0) + (item.banner ? 1 : 0), 0);
    if (!plan.items.length || !mediaCount) {
      throw new Error("No se encontraron carpetas de LOCAL con archivos llamados logo o banner.");
    }

    const missingPair = plan.items.filter(item => !item.logo || !item.banner).length;
    const unmatchedText = plan.unmatched.length
      ? ` No se emparejaron: ${plan.unmatched.slice(0, 6).join(", ")}${plan.unmatched.length > 6 ? "…" : ""}.`
      : "";
    const confirmText =
      `Se detectaron ${plan.items.length} LOCAL y ${mediaCount} imágenes. ` +
      `${missingPair ? missingPair + " LOCAL tienen solo logo o solo banner. " : ""}` +
      `${plan.unmatched.length ? plan.unmatched.length + " carpetas no coinciden con ningún LOCAL. " : ""}` +
      "¿Cargar y reemplazar el branding encontrado?";
    if (!confirm(confirmText)) return;

    button.disabled = true;
    const ids = plan.items.map(item => item.local.id);
    const { data: records, error } = await supabaseClient
      .from("locals")
      .select("id,name,description,banner_url,logo_url,phone,whatsapp,website_url,instagram_url,facebook_url,tiktok_url,telegram_url")
      .in("id", ids);
    if (error) throw error;

    const recordById = new Map((records || []).map(local => [local.id, local]));
    let done = 0;
    let failed = 0;
    const errors = [];

    for (const item of plan.items) {
      const local = recordById.get(item.local.id);
      if (!local) {
        failed++;
        errors.push(item.local.name + ": LOCAL no disponible");
        continue;
      }

      setBrandingFolderStatus(`Cargando ${done + failed + 1}/${plan.items.length}: ${local.name}…`);

      try {
        let nextLogo = local.logo_url || null;
        let nextBanner = local.banner_url || null;
        const oldLogoPath = pathDesdePublicUrlHTPWEB(local.logo_url);
        const oldBannerPath = pathDesdePublicUrlHTPWEB(local.banner_url);
        let newLogoPath = null;
        let newBannerPath = null;

        if (item.logo) {
          const uploaded = await subirImagenHTPWEB(mediaPathLocal(local.id, "logo"), brandingTypedFile(item.logo));
          nextLogo = uploaded.url;
          newLogoPath = uploaded.path;
        }
        if (item.banner) {
          const uploaded = await subirImagenHTPWEB(mediaPathLocal(local.id, "banner"), brandingTypedFile(item.banner));
          nextBanner = uploaded.url;
          newBannerPath = uploaded.path;
        }

        await rpc("update_my_local_content", {
          p_local_id: local.id,
          p_description: local.description || null,
          p_banner_url: nextBanner,
          p_logo_url: nextLogo,
          p_phone: local.phone || null,
          p_whatsapp: local.whatsapp || null,
          p_website_url: local.website_url || null,
          p_instagram_url: local.instagram_url || null,
          p_facebook_url: local.facebook_url || null,
          p_tiktok_url: local.tiktok_url || null,
          p_telegram_url: local.telegram_url || null
        });

        if (oldLogoPath && newLogoPath && oldLogoPath !== newLogoPath) {
          await eliminarObjetoMediaHTPWEB(oldLogoPath).catch(() => {});
        }
        if (oldBannerPath && newBannerPath && oldBannerPath !== newBannerPath) {
          await eliminarObjetoMediaHTPWEB(oldBannerPath).catch(() => {});
        }

        done++;
      } catch (e) {
        failed++;
        errors.push(local.name + ": " + (e.message || e));
      }
    }

    await loadScopes();
    await loadStorage();

    const errorText = errors.length
      ? ` Errores: ${errors.slice(0, 4).join(" | ")}${errors.length > 4 ? "…" : ""}`
      : "";
    setBrandingFolderStatus(
      `Branding terminado: ${done} LOCAL actualizados, ${failed} con error.${unmatchedText}${errorText}`
    );
    message(`Branding actualizado en ${done} LOCAL.${failed ? " Revisa los errores mostrados en Storage." : ""}`, failed ? "error" : "success");
  } catch (e) {
    setBrandingFolderStatus(e.message || "No se pudo cargar la carpeta Branding.");
    message(e.message || "No se pudo cargar la carpeta Branding.", "error");
  } finally {
    if (input) input.value = "";
    if (button) button.disabled = false;
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
  return state.role === "MASTER" ? ["HTPWEB","DELIVERY","LOCAL","PRODUCT"] : [];
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

function advertisingMoney(value) {
  return "$" + Number(value || 0).toFixed(2);
}

function advertisingDeliveryName(id) {
  return state.deliveries.find(item => item.id === id)?.name || "—";
}

function advertisingLocalName(id) {
  return state.locals.find(item => item.id === id)?.name || "—";
}

async function loadAdvertisingDeliveries() {
  state.advertisementDeliveries = state.deliveries.filter(delivery => delivery.active !== false);
  const options = state.advertisementDeliveries.length
    ? state.advertisementDeliveries.map(delivery => `<option value="${delivery.id}">${esc(delivery.name)}</option>`).join("")
    : '<option value="">No hay DELIVERY disponible</option>';

  if ($("advertisementDelivery")) {
    const previous = $("advertisementDelivery").value;
    $("advertisementDelivery").innerHTML = options;
    if (previous && state.advertisementDeliveries.some(d => d.id === previous)) $("advertisementDelivery").value = previous;
  }

  if ($("advertisementOriginDelivery")) {
    const previous = $("advertisementOriginDelivery").value;
    $("advertisementOriginDelivery").innerHTML =
      '<option value="">HTPWEB consiguió al anunciante</option>' + options;
    if (previous && state.advertisementDeliveries.some(d => d.id === previous)) $("advertisementOriginDelivery").value = previous;
  }

  if ($("advertisingDeliverySelect")) {
    const previous = $("advertisingDeliverySelect").value;
    $("advertisingDeliverySelect").innerHTML = options;
    if (previous && state.advertisementDeliveries.some(d => d.id === previous)) $("advertisingDeliverySelect").value = previous;
  }
}

async function loadAdvertisingZones() {
  const { data, error } = await supabaseClient
    .from("zones")
    .select("id,code,name,city,province,active")
    .eq("active", true)
    .order("province")
    .order("city")
    .order("name");
  if (error) throw error;
  state.advertisingZones = data || [];
  renderAdvertisingZones([]);
}

function renderAdvertisingZones(selectedIds = []) {
  const box = $("advertisementZones");
  if (!box) return;
  const selected = new Set(selectedIds || []);
  box.innerHTML = (state.advertisingZones || []).length
    ? state.advertisingZones.map(zone => `
        <label class="advertising-zone-option">
          <input type="checkbox" value="${zone.id}" ${selected.has(zone.id) ? "checked" : ""}>
          <span><strong>${esc(zone.code || zone.name)}</strong><small>${esc([zone.name,zone.city,zone.province].filter(Boolean).join(" · "))}</small></span>
        </label>
      `).join("")
    : '<div class="muted">No hay zonas activas.</div>';
}

function selectedAdvertisingZoneIds() {
  return [...document.querySelectorAll('#advertisementZones input[type="checkbox"]:checked')]
    .map(input => input.value)
    .filter(Boolean);
}

async function loadAdvertisingTargets() {
  const internal = $("advertisementInternal")?.checked === true;
  if (internal && $("advertisementScope")) $("advertisementScope").value = "HTPWEB";
  const scope = $("advertisementScope")?.value || "LOCAL";

  $("advertisementDeliveryField")?.classList.toggle("hidden", scope !== "DELIVERY");
  $("advertisementLocalField")?.classList.toggle("hidden", !["LOCAL","PRODUCT"].includes(scope));
  $("advertisementProductField")?.classList.toggle("hidden", scope !== "PRODUCT");
  $("advertisementZonesField")?.classList.toggle("hidden", internal);

  state.advertisementLocals = state.locals.filter(local => local.active !== false);
  if ($("advertisementLocal")) {
    const previous = $("advertisementLocal").value;
    $("advertisementLocal").innerHTML = state.advertisementLocals.length
      ? state.advertisementLocals.map(local => `<option value="${local.id}">${esc(local.name)}</option>`).join("")
      : '<option value="">No hay LOCAL disponible</option>';
    if (previous && state.advertisementLocals.some(local => local.id === previous)) $("advertisementLocal").value = previous;
  }

  if (scope === "PRODUCT") await loadAdvertisingProducts();
  else if ($("advertisementProduct")) $("advertisementProduct").innerHTML = '<option value="">No aplica</option>';
}

async function loadAdvertisingProducts() {
  const localId = $("advertisementLocal")?.value || null;
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
  if ($("advertisementProduct")) {
    const previous = $("advertisementProduct").value;
    $("advertisementProduct").innerHTML = state.advertisementProducts.length
      ? state.advertisementProducts.map(product => `<option value="${product.id}">${esc(product.name)}</option>`).join("")
      : '<option value="">No hay PRODUCTO disponible</option>';
    if (previous && state.advertisementProducts.some(product => product.id === previous)) $("advertisementProduct").value = previous;
  }
}

async function loadAdvertisingPolicy() {
  const { data, error } = await supabaseClient
    .from("advertising_settings")
    .select("htpweb_pct,origin_delivery_pct,traffic_pct,carousel_speed_px_s")
    .eq("singleton_id", 1)
    .single();
  if (error) throw error;
  $("advertisingHtpwebPct").value = Number(data.htpweb_pct || 0);
  $("advertisingOriginPct").value = Number(data.origin_delivery_pct || 0);
  $("advertisingTrafficPct").value = Number(data.traffic_pct || 0);
  if ($("advertisingCarouselSpeed")) $("advertisingCarouselSpeed").value = Number(data.carousel_speed_px_s || 91);
  if ($("advertisingCarouselSpeedValue")) $("advertisingCarouselSpeedValue").textContent = String(Number(data.carousel_speed_px_s || 91));
  syncAdvertisingSplitTotal();
}

function syncAdvertisingSplitTotal() {
  const total = ["advertisingHtpwebPct","advertisingOriginPct","advertisingTrafficPct"]
    .reduce((sum,id) => sum + Number($(id)?.value || 0), 0);
  if ($("advertisingSplitTotal")) {
    $("advertisingSplitTotal").textContent = total.toFixed(2).replace(/\.00$/,"") + "%";
    $("advertisingSplitTotal").classList.toggle("error", Math.abs(total - 100) > 0.001);
  }
  return total;
}

async function saveAdvertisingSplit() {
  try {
    const total = syncAdvertisingSplitTotal();
    if (Math.abs(total - 100) > 0.001) throw new Error("Los porcentajes deben sumar 100%.");
    await rpc("save_advertising_split", {
      p_htpweb_pct: Number($("advertisingHtpwebPct").value || 0),
      p_origin_delivery_pct: Number($("advertisingOriginPct").value || 0),
      p_traffic_pct: Number($("advertisingTrafficPct").value || 0)
    });
    await rpc("save_advertising_carousel_speed", {
      p_speed: Number($("advertisingCarouselSpeed")?.value || 91)
    });
    message("Política de publicidad y velocidad actualizadas.");
    await loadAdvertisingPolicy();
  } catch (e) {
    message(e.message || "No se pudo guardar la política.", "error");
  }
}

function renderAdvertisements() {
  const list = $("advertisementsList");
  if (!list) return;
  if (!state.advertisements?.length) {
    list.innerHTML = '<div class="muted">No hay campañas.</div>';
    return;
  }

  const zonesByAd = new Map();
  (state.advertisementZoneRows || []).forEach(row => {
    if (!zonesByAd.has(row.advertisement_id)) zonesByAd.set(row.advertisement_id, []);
    const zone = (state.advertisingZones || []).find(item => item.id === row.zone_id);
    zonesByAd.get(row.advertisement_id).push(zone?.code || zone?.name || row.zone_id);
  });

  list.innerHTML = state.advertisements.map(ad => {
    const zones = zonesByAd.get(ad.id) || [];
    const origin = ad.origin_delivery_id ? advertisingDeliveryName(ad.origin_delivery_id) : "HTPWEB";
    return `
      <div class="card" style="margin:0">
        <div class="row between" style="gap:12px;align-items:flex-start">
          <div>
            <strong>${esc(ad.title)}</strong>
            <div class="muted">${esc(ad.scope_type)} · ${ad.is_internal ? "Institucional HTPWEB" : (zones.length ? esc(zones.join(", ")) : "Sin zonas")}</div>
            ${!ad.is_internal ? `<div class="muted">Precio ${advertisingMoney(ad.campaign_price)} · captador ${esc(origin)} · reparto ${Number(ad.split_htpweb_pct)} / ${Number(ad.split_origin_pct)} / ${Number(ad.split_traffic_pct)}</div>` : ""}
          </div>
          <span class="badge">${ad.active ? "ACTIVA" : "INACTIVA"}</span>
        </div>
        ${ad.body ? `<p>${esc(ad.body)}</p>` : ""}
        ${ad.image_url ? `<img src="${esc(ad.image_url)}" alt="" style="max-width:260px;max-height:130px;object-fit:cover;border-radius:10px">` : ""}
        <div class="row" style="margin-top:10px">
          <button class="btn-muted" onclick="editAdvertisement('${ad.id}')">Editar</button>
        </div>
      </div>
    `;
  }).join("");
}

async function loadAdvertisements() {
  const { data, error } = await supabaseClient
    .from("advertisements")
    .select("id,scope_type,delivery_id,local_id,product_id,title,body,image_url,target_url,priority,active,starts_at,ends_at,campaign_price,origin_delivery_id,is_internal,split_htpweb_pct,split_origin_pct,split_traffic_pct,updated_at")
    .order("is_internal", { ascending:false })
    .order("priority", { ascending:false })
    .order("updated_at", { ascending:false })
    .limit(300);
  if (error) throw error;
  state.advertisements = data || [];

  const ids = state.advertisements.map(row => row.id);
  state.advertisementZoneRows = [];
  if (ids.length) {
    const zones = await supabaseClient
      .from("advertisement_zones")
      .select("advertisement_id,zone_id")
      .in("advertisement_id", ids);
    if (zones.error) throw zones.error;
    state.advertisementZoneRows = zones.data || [];
  }
  renderAdvertisements();
}

async function loadAdvertisingMasterRequests() {
  const { data, error } = await supabaseClient
    .from("advertising_requests")
    .select("id,delivery_id,local_id,title,advertiser_contact,body,requested_days,proposed_budget,status,master_note,created_at")
    .order("created_at", { ascending:false })
    .limit(100);
  if (error) throw error;
  state.advertisingRequests = data || [];
  const box = $("advertisingMasterRequests");
  if (!box) return;
  box.innerHTML = state.advertisingRequests.length ? state.advertisingRequests.map(row => `
    <div class="workspace-note">
      <div class="row between" style="gap:10px;align-items:flex-start">
        <div>
          <strong>${esc(row.title)}</strong>
          <div class="muted">${esc(advertisingDeliveryName(row.delivery_id))}${row.local_id ? " · " + esc(advertisingLocalName(row.local_id)) : ""} · ${row.requested_days} días${row.proposed_budget !== null ? " · " + advertisingMoney(row.proposed_budget) : ""}</div>
          ${row.advertiser_contact ? `<div>Contacto: ${esc(row.advertiser_contact)}</div>` : ""}
          ${row.body ? `<div style="margin-top:5px">${esc(row.body)}</div>` : ""}
        </div>
        <span class="badge">${esc(row.status)}</span>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn-muted" type="button" onclick="useAdvertisingRequest('${row.id}')">Usar en campaña</button>
        ${row.status === "PENDING" ? `
          <button class="btn-primary" type="button" onclick="reviewAdvertisingRequest('${row.id}','APPROVED')">Aprobar</button>
          <button class="btn-danger" type="button" onclick="reviewAdvertisingRequest('${row.id}','REJECTED')">Rechazar</button>
        ` : ""}
      </div>
    </div>
  `).join("") : '<div class="muted">No hay solicitudes.</div>';
}

async function reviewAdvertisingRequest(id,status) {
  try {
    await rpc("review_advertising_request", {
      p_request_id:id,
      p_status:status,
      p_master_note:null
    });
    message("Solicitud actualizada.");
    await loadAdvertisingMasterRequests();
  } catch (e) {
    message(e.message || "No se pudo actualizar la solicitud.", "error");
  }
}

function useAdvertisingRequest(id) {
  const row = (state.advertisingRequests || []).find(item => item.id === id);
  if (!row) return;
  clearAdvertisementForm();
  $("advertisementScope").value = row.local_id ? "LOCAL" : "DELIVERY";
  $("advertisementOriginDelivery").value = row.delivery_id || "";
  $("advertisementTitle").value = row.title || "";
  $("advertisementBody").value = row.body || "";
  $("advertisementPrice").value = row.proposed_budget ?? 0;
  if (!row.local_id && $("advertisementDelivery")) $("advertisementDelivery").value = row.delivery_id || "";
  loadAdvertisingTargets().then(() => {
    if (row.local_id && $("advertisementLocal")) $("advertisementLocal").value = row.local_id;
  });
  const start = new Date();
  const end = new Date(start.getTime() + Number(row.requested_days || 15) * 86400000);
  $("advertisementStartsAt").value = toDatetimeLocal(start);
  $("advertisementEndsAt").value = toDatetimeLocal(end);
  document.getElementById("advertisementTitle")?.scrollIntoView({behavior:"smooth",block:"center"});
}

function clearAdvertisementForm() {
  if (!$("advertisementId")) return;
  $("advertisementId").value = "";
  $("advertisementTitle").value = "";
  $("advertisementBody").value = "";
  $("advertisementImageUrl").value = "";
  $("advertisementTargetUrl").value = "";
  $("advertisementPriority").value = "0";
  $("advertisementPrice").value = "0";
  $("advertisementStartsAt").value = "";
  $("advertisementEndsAt").value = "";
  $("advertisementActive").checked = false;
  $("advertisementInternal").checked = false;
  $("advertisementImageFile").value = "";
  if ($("advertisementOriginDelivery")) $("advertisementOriginDelivery").value = "";
  renderAdvertisingZones([]);
  loadAdvertisingTargets();
}

async function editAdvertisement(id) {
  const ad = (state.advertisements || []).find(row => row.id === id);
  if (!ad) return;

  $("advertisementId").value = ad.id;
  $("advertisementScope").value = ad.scope_type;
  $("advertisementDelivery").value = ad.delivery_id || "";
  $("advertisementOriginDelivery").value = ad.origin_delivery_id || "";
  $("advertisementPrice").value = Number(ad.campaign_price || 0);
  $("advertisementInternal").checked = ad.is_internal === true;
  await loadAdvertisingTargets();

  if (ad.local_id) $("advertisementLocal").value = ad.local_id;
  if (ad.scope_type === "PRODUCT") {
    await loadAdvertisingProducts();
    $("advertisementProduct").value = ad.product_id || "";
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

  const selectedZones = (state.advertisementZoneRows || [])
    .filter(row => row.advertisement_id === ad.id)
    .map(row => row.zone_id);
  renderAdvertisingZones(selectedZones);
  $("advertisementZonesField").classList.toggle("hidden", ad.is_internal === true);
  document.getElementById("section-advertising")?.scrollIntoView({behavior:"smooth",block:"start"});
}

function advertisementMediaPath(scope, adId, deliveryId, localId, productId) {
  if (scope === "HTPWEB") return `advertising/htpweb/${adId}/banner`;
  if (scope === "DELIVERY") return `advertising/delivery/${deliveryId || "zones"}/${adId}`;
  if (scope === "LOCAL") return `advertising/local/${localId}/${adId}`;
  return `advertising/product/${productId}/${adId}`;
}

async function saveAdvertisement() {
  const button = $("saveAdvertisementBtn");
  let uploaded = null;
  try {
    if (state.role !== "MASTER") throw new Error("Solo MASTER puede publicar campañas.");

    const internal = $("advertisementInternal").checked === true;
    const scope = internal ? "HTPWEB" : $("advertisementScope").value;
    const title = $("advertisementTitle").value.trim();
    if (!title) throw new Error("Escribe el título del anuncio.");

    const deliveryId = scope === "DELIVERY" ? ($("advertisementDelivery").value || null) : null;
    const localId = ["LOCAL","PRODUCT"].includes(scope) ? ($("advertisementLocal").value || null) : null;
    const productId = scope === "PRODUCT" ? ($("advertisementProduct").value || null) : null;
    const zoneIds = selectedAdvertisingZoneIds();

    if (scope === "DELIVERY" && !deliveryId) throw new Error("Selecciona el DELIVERY anunciado.");
    if (["LOCAL","PRODUCT"].includes(scope) && !localId) throw new Error("Selecciona un LOCAL.");
    if (scope === "PRODUCT" && !productId) throw new Error("Selecciona un PRODUCTO.");
    if (!internal && !zoneIds.length) throw new Error("Selecciona al menos una zona.");

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
      p_delivery_id: internal ? null : deliveryId,
      p_local_id: internal ? null : localId,
      p_product_id: internal ? null : productId,
      p_title:title,
      p_body:$("advertisementBody").value.trim() || null,
      p_image_url:oldImageUrl,
      p_target_url:$("advertisementTargetUrl").value.trim() || null,
      p_priority:Math.max(0,Number.parseInt($("advertisementPriority").value,10) || 0),
      p_active:$("advertisementActive").checked,
      p_starts_at:startsAt,
      p_ends_at:endsAt
    };

    const adId = await rpc("save_advertisement", args);
    const file = $("advertisementImageFile").files?.[0];

    if (file) {
      const path = advertisementMediaPath(scope,adId,deliveryId,localId,productId);
      uploaded = await subirImagenHTPWEB(path,file);
      args.p_ad_id = adId;
      args.p_image_url = uploaded.url;
      await rpc("save_advertisement",args);
      const oldPath = pathDesdePublicUrlHTPWEB(oldImageUrl);
      if (oldPath && oldPath !== uploaded.path) await eliminarObjetoMediaHTPWEB(oldPath).catch(() => {});
    }

    await rpc("save_advertisement_commercial", {
      p_advertisement_id:adId,
      p_zone_ids:internal ? [] : zoneIds,
      p_campaign_price:Number($("advertisementPrice").value || 0),
      p_origin_delivery_id:$("advertisementOriginDelivery").value || null,
      p_is_internal:internal
    });

    message("Campaña guardada.");
    clearAdvertisementForm();
    await Promise.all([loadAdvertisements(),loadAdvertisingMasterRequests()]);
  } catch (e) {
    message(e.message || "No se pudo guardar la publicidad.","error");
  } finally {
    if (button) button.disabled=false;
  }
}

async function previewAdvertisementDestination() {
  try {
    const scope=$("advertisementScope").value;
    const explicit=$("advertisementTargetUrl").value.trim();
    if (explicit) {
      const url=new URL(explicit,location.href);
      window.open(url.href,"_blank","noopener");
      return;
    }

    if (scope === "HTPWEB") {
      window.open("../index.html","_blank","noopener");
      return;
    }

    let delivery = null;
    if (scope === "DELIVERY") {
      delivery=state.advertisementDeliveries.find(row => row.id === $("advertisementDelivery").value);
      if (!delivery?.slug) throw new Error("Selecciona un DELIVERY.");
      const home = new URL("../app/index.html", location.href);
      home.searchParams.set("delivery", delivery.slug);
      window.open(home.href,"_blank","noopener");
      return;
    }

    const localId=$("advertisementLocal").value || "";
    if (!localId) throw new Error("Selecciona un LOCAL.");

    const rel=await supabaseClient.from("local_deliveries").select("delivery_id").eq("local_id",localId).eq("active",true).limit(1).maybeSingle();
    if (rel.error || !rel.data) throw new Error("Ese LOCAL no tiene DELIVERY activo.");
    delivery=state.deliveries.find(row => row.id === rel.data.delivery_id);
    if (!delivery?.slug) throw new Error("No se encontró el DELIVERY para abrir el destino.");

    const url=new URL("../app/local.html",location.href);
    url.searchParams.set("delivery",delivery.slug);
    url.searchParams.set("local",localId);
    if (scope === "PRODUCT") url.searchParams.set("product",$("advertisementProduct").value || "");
    window.open(url.href,"_blank","noopener");
  } catch(e) {
    message(e.message || "No se pudo abrir el destino.","error");
  }
}

async function loadAdvertisingDeliveryLocals(deliveryId) {
  const select=$("advertisingRequestLocal");
  if (!select) return;
  if (!deliveryId) {
    select.innerHTML='<option value="">Sin LOCAL específico</option>';
    return;
  }
  const rel=await supabaseClient.from("local_deliveries").select("local_id").eq("delivery_id",deliveryId).eq("active",true);
  if (rel.error) throw rel.error;
  const ids=[...new Set((rel.data||[]).map(row=>row.local_id))];
  let locals=[];
  if (ids.length) {
    const res=await supabaseClient.from("locals").select("id,name,active").in("id",ids).eq("active",true).order("name");
    if (res.error) throw res.error;
    locals=res.data||[];
  }
  select.innerHTML='<option value="">Sin LOCAL específico</option>'+
    locals.map(local=>`<option value="${local.id}">${esc(local.name)}</option>`).join("");
}

async function loadAdvertisingDeliveryStats(deliveryId) {
  const box=$("advertisingDeliveryStats");
  if (!box) return;
  const rows=await rpc("advertising_delivery_stats",{p_delivery_id:deliveryId}) || [];
  box.innerHTML=rows.length ? rows.map(row=>`
    <div class="workspace-note">
      <div class="row between" style="gap:10px;align-items:flex-start">
        <div>
          <strong>${esc(row.title)}</strong>
          <div class="muted">${Number(row.delivery_impressions||0)} / ${Number(row.total_impressions||0)} impresiones · ${Number(row.traffic_share_pct||0).toFixed(2)}% del tráfico</div>
          <div class="muted">${Number(row.delivery_clicks||0)} / ${Number(row.total_clicks||0)} clics</div>
        </div>
        <strong>${advertisingMoney(row.estimated_total)}</strong>
      </div>
      <div class="advertising-income-grid">
        <span>Captación <strong>${advertisingMoney(row.origin_commission)}</strong></span>
        <span>Tráfico <strong>${advertisingMoney(row.traffic_commission)}</strong></span>
        <span>Campaña <strong>${advertisingMoney(row.campaign_price)}</strong></span>
      </div>
    </div>
  `).join("") : '<div class="muted">Todavía no hay campañas con estadísticas para este DELIVERY.</div>';
}

async function loadAdvertisingDeliveryRequests(deliveryId) {
  const box=$("advertisingDeliveryRequests");
  if (!box) return;
  const rows=await rpc("advertising_delivery_requests",{p_delivery_id:deliveryId}) || [];
  box.innerHTML=rows.length ? rows.map(row=>`
    <div class="workspace-note">
      <div class="row between" style="gap:10px">
        <div><strong>${esc(row.title)}</strong><div class="muted">${row.requested_days} días${row.proposed_budget!==null ? " · "+advertisingMoney(row.proposed_budget) : ""}</div></div>
        <span class="badge">${esc(row.status)}</span>
      </div>
      ${row.master_note ? `<div style="margin-top:7px">MASTER: ${esc(row.master_note)}</div>` : ""}
    </div>
  `).join("") : '<div class="muted">No has enviado solicitudes.</div>';
}

async function loadAdvertisingDeliveryWorkspace() {
  const deliveryId=$("advertisingDeliverySelect")?.value || state.deliveries[0]?.id || "";
  if (!deliveryId) return;
  await Promise.all([
    loadAdvertisingDeliveryLocals(deliveryId),
    loadAdvertisingDeliveryStats(deliveryId),
    loadAdvertisingDeliveryRequests(deliveryId)
  ]);
}

async function submitAdvertisingRequest() {
  try {
    const deliveryId=$("advertisingDeliverySelect")?.value || "";
    if (!deliveryId) throw new Error("Selecciona un DELIVERY.");
    const title=$("advertisingRequestTitle").value.trim();
    if (!title) throw new Error("Escribe el nombre del anunciante o campaña.");
    await rpc("submit_advertising_request",{
      p_delivery_id:deliveryId,
      p_local_id:$("advertisingRequestLocal").value || null,
      p_title:title,
      p_advertiser_contact:$("advertisingRequestContact").value.trim() || null,
      p_body:$("advertisingRequestBody").value.trim() || null,
      p_requested_days:Number.parseInt($("advertisingRequestDays").value||"15",10) || 15,
      p_proposed_budget:$("advertisingRequestBudget").value === "" ? null : Number($("advertisingRequestBudget").value)
    });
    $("advertisingRequestTitle").value="";
    $("advertisingRequestContact").value="";
    $("advertisingRequestBody").value="";
    $("advertisingRequestBudget").value="";
    message("Solicitud enviada a MASTER.");
    await loadAdvertisingDeliveryRequests(deliveryId);
  } catch(e) {
    message(e.message || "No se pudo enviar la solicitud.","error");
  }
}

async function loadAdvertising() {
  if (!["MASTER","DELIVERY_ADMIN"].includes(state.role)) return;
  try {
    const master=state.role==="MASTER";
    $("advertisingMasterWorkspace")?.classList.toggle("hidden",!master);
    $("advertisingDeliveryWorkspace")?.classList.toggle("hidden",master);

    await loadAdvertisingDeliveries();

    if (master) {
      $("advertisementScope").innerHTML=advertisementScopeOptions().map(scope=>`<option value="${scope}">${scope}</option>`).join("");
      await Promise.all([loadAdvertisingZones(),loadAdvertisingPolicy()]);
      await loadAdvertisingTargets();
      await Promise.all([loadAdvertisements(),loadAdvertisingMasterRequests()]);
    } else {
      await loadAdvertisingDeliveryWorkspace();
    }
  } catch(e) {
    const target=state.role==="MASTER" ? $("advertisementsList") : $("advertisingDeliveryStats");
    if (target) target.innerHTML=`<div class="message error">${esc(e.message || "No se pudo cargar publicidad.")}</div>`;
  }
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

const driverWorkspaceState={drivers:null,dispatch:null,proofSettings:null,sos:null,deviation:null,whatsappSettings:null,whatsappProvider:null,whatsappConnection:null,candidate:null,quickDriver:null};
const safetySosState={
  deliveryChannel:null,
  deliveryId:null,
  driverChannel:null,
  refreshTimer:null
};
const routeDeviationState={
  deliveryChannel:null,
  deliveryId:null,
  driverChannel:null,
  refreshTimer:null,
  driverSnapshot:{plans:[],incidents:[]},
  contexts:{}
};
const driverGpsState={
  selectedDriverId:null,
  selectedDriverName:"",
  selectedDeliveryId:null,
  map:null,
  marker:null,
  historyLine:null,
  watchId:null,
  lastSentAt:0,
  sending:false,
  allowedDeliveryIds:[]
};

function driverWorkspaceDeliveryId(){
  return $("driversDelivery")?.value||state.deliveries[0]?.id||null;
}

function resetAdminDriverGps(){
  driverGpsState.selectedDriverId=null;
  driverGpsState.selectedDriverName="";
  driverGpsState.selectedDeliveryId=null;
  if(driverGpsState.marker&&driverGpsState.map)driverGpsState.map.removeLayer(driverGpsState.marker);
  if(driverGpsState.historyLine&&driverGpsState.map)driverGpsState.map.removeLayer(driverGpsState.historyLine);
  driverGpsState.marker=null;
  driverGpsState.historyLine=null;
  if($("driverGpsMap"))$("driverGpsMap").style.display="none";
  if($("driverGpsStatus"))$("driverGpsStatus").textContent='Selecciona “Ver GPS” en un repartidor.';
  if($("driverGpsHistoryInfo"))$("driverGpsHistoryInfo").textContent="";
  if($("driverGpsRefresh"))$("driverGpsRefresh").disabled=true;
}

function ensureAdminDriverGpsMap(lat,lng){
  const host=$("driverGpsMap");
  if(!host||!window.L)return null;
  host.style.display="block";
  if(!driverGpsState.map){
    driverGpsState.map=L.map(host).setView([lat,lng],16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19,
      attribution:"&copy; OpenStreetMap"
    }).addTo(driverGpsState.map);
  }
  setTimeout(()=>driverGpsState.map?.invalidateSize(),0);
  return driverGpsState.map;
}

function renderAdminDriverGps(snapshot){
  const status=$("driverGpsStatus");
  const info=$("driverGpsHistoryInfo");
  if(!status||!info)return;

  if(!snapshot?.enabled){
    status.textContent="El plan vigente no incluye GPS en vivo.";
    info.textContent="";
    if($("driverGpsMap"))$("driverGpsMap").style.display="none";
    return;
  }

  const history=Array.isArray(snapshot.history)?snapshot.history:[];
  const current=snapshot.current||history.at(-1)||null;
  const points=history
    .map(x=>[Number(x.latitude),Number(x.longitude)])
    .filter(([lat,lng])=>Number.isFinite(lat)&&Number.isFinite(lng));

  if(!current){
    status.textContent="GPS habilitado, pero todavía no se ha recibido una ubicación.";
    info.textContent=Number(snapshot.history_days)>0
      ?"Historial contratado: "+esc(snapshot.history_days)+" día(s)."
      :"El plan no conserva historial GPS.";
    if($("driverGpsMap"))$("driverGpsMap").style.display="none";
    return;
  }

  const lat=Number(current.latitude);
  const lng=Number(current.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)){
    status.textContent="La última ubicación recibida no es válida.";
    return;
  }

  const map=ensureAdminDriverGpsMap(lat,lng);
  if(!map)return;

  if(driverGpsState.marker)map.removeLayer(driverGpsState.marker);
  driverGpsState.marker=L.marker([lat,lng]).addTo(map);

  if(driverGpsState.historyLine)map.removeLayer(driverGpsState.historyLine);
  driverGpsState.historyLine=null;
  if(points.length>=2){
    driverGpsState.historyLine=L.polyline(points).addTo(map);
    map.fitBounds(driverGpsState.historyLine.getBounds(),{padding:[24,24],maxZoom:17});
  }else{
    map.setView([lat,lng],16);
  }

  const captured=current.captured_at
    ?new Date(current.captured_at).toLocaleString("es-EC",{timeZone:"America/Guayaquil"})
    :"—";
  const accuracy=Number.isFinite(Number(current.accuracy_m))
    ?" · precisión ±"+Math.round(Number(current.accuracy_m))+" m"
    :"";
  status.innerHTML="<strong>"+esc(driverGpsState.selectedDriverName||"Repartidor")+"</strong> · última ubicación "+esc(captured)+esc(accuracy);
  info.textContent=Number(snapshot.history_days)>0
    ?"Historial contratado: "+snapshot.history_days+" día(s) · "+history.length+" punto(s) mostrados."
    :"GPS en vivo activo · sin historial contratado.";
}

async function loadSelectedDriverGps(){
  if(!driverGpsState.selectedDriverId)return;
  const deliveryId=driverWorkspaceDeliveryId();
  if(!deliveryId||driverGpsState.selectedDeliveryId!==deliveryId){
    resetAdminDriverGps();
    return;
  }
  try{
    if($("driverGpsStatus"))$("driverGpsStatus").textContent="Consultando GPS…";
    const snapshot=await rpc("delivery_driver_gps_snapshot",{
      p_delivery_id:deliveryId,
      p_driver_user_id:driverGpsState.selectedDriverId,
      p_limit:100
    });
    renderAdminDriverGps(snapshot||{});
  }catch(e){
    if($("driverGpsStatus"))$("driverGpsStatus").textContent=e.message||"No se pudo consultar el GPS.";
    if($("driverGpsMap"))$("driverGpsMap").style.display="none";
  }
}

async function selectDriverGps(userId,name){
  driverGpsState.selectedDriverId=userId;
  driverGpsState.selectedDriverName=name||"Repartidor";
  driverGpsState.selectedDeliveryId=driverWorkspaceDeliveryId();
  if($("driverGpsRefresh"))$("driverGpsRefresh").disabled=false;
  await loadSelectedDriverGps();
}

function driverEnRouteDeliveryIds(){
  return [...new Set(
    (state.driverOrders||[])
      .filter(o=>o.assignment_status==="ACTIVE"&&o.status==="EN_ROUTE"&&o.delivery_id)
      .map(o=>o.delivery_id)
  )];
}

function updateDriverGpsShareUi(){
  const start=$("driverGpsStart");
  const stop=$("driverGpsStop");
  const status=$("driverGpsShareStatus");
  if(!start||!stop||!status)return;

  const hasEnRoute=driverEnRouteDeliveryIds().length>0;
  const active=driverGpsState.watchId!==null;
  start.disabled=!hasEnRoute||active;
  stop.disabled=!active;

  if(!hasEnRoute&&active){
    stopDriverGpsSharing(true);
    return;
  }

  if(!active){
    status.textContent=hasEnRoute
      ?"Entrega EN_ROUTE detectada. Activa GPS para compartir tu ubicación."
      :"Disponible cuando tengas una entrega EN_ROUTE.";
  }
}

function stopDriverGpsSharing(silent=false){
  if(driverGpsState.watchId!==null&&navigator.geolocation){
    navigator.geolocation.clearWatch(driverGpsState.watchId);
  }
  driverGpsState.watchId=null;
  driverGpsState.allowedDeliveryIds=[];
  driverGpsState.sending=false;
  driverGpsState.lastSentAt=0;
  if(!silent&&$("driverGpsShareStatus"))$("driverGpsShareStatus").textContent="GPS detenido.";
  const start=$("driverGpsStart");
  const stop=$("driverGpsStop");
  if(start)start.disabled=driverEnRouteDeliveryIds().length===0;
  if(stop)stop.disabled=true;
}

async function publishDriverPosition(position){
  if(driverGpsState.sending)return;
  const now=Date.now();
  if(now-driverGpsState.lastSentAt<10000)return;

  const activeIds=driverEnRouteDeliveryIds();
  const deliveryIds=driverGpsState.allowedDeliveryIds.filter(id=>activeIds.includes(id));
  if(!deliveryIds.length){
    stopDriverGpsSharing(true);
    updateDriverGpsShareUi();
    return;
  }

  driverGpsState.sending=true;
  driverGpsState.lastSentAt=now;
  try{
    const coords=position.coords;
    const finiteOrNull=value=>Number.isFinite(Number(value))?Number(value):null;
    const payload={
      p_latitude:Number(coords.latitude),
      p_longitude:Number(coords.longitude),
      p_accuracy_m:finiteOrNull(coords.accuracy),
      p_heading_deg:finiteOrNull(coords.heading),
      p_speed_mps:finiteOrNull(coords.speed),
      p_captured_at:new Date(position.timestamp||Date.now()).toISOString()
    };

    const results=[];
    for(const deliveryId of deliveryIds){
      results.push(await rpc("driver_update_location",{p_delivery_id:deliveryId,...payload}));
    }

    const updated=results.some(x=>x?.status==="UPDATED");
    const accuracy=finiteOrNull(coords.accuracy);
    if($("driverGpsShareStatus")){
      $("driverGpsShareStatus").textContent=updated
        ?"Ubicación compartida "+new Date().toLocaleTimeString("es-EC")+(accuracy!==null?" · ±"+Math.round(accuracy)+" m":"")
        :"GPS activo; esperando la siguiente actualización válida.";
    }
  }catch(e){
    if($("driverGpsShareStatus"))$("driverGpsShareStatus").textContent=e.message||"No se pudo compartir la ubicación.";
  }finally{
    driverGpsState.sending=false;
  }
}

async function startDriverGpsSharing(){
  try{
    if(!navigator.geolocation)throw new Error("Este navegador no ofrece geolocalización.");
    const deliveryIds=driverEnRouteDeliveryIds();
    if(!deliveryIds.length)throw new Error("Necesitas una entrega EN_ROUTE para activar GPS.");

    const allowed=[];
    for(const deliveryId of deliveryIds){
      const context=await rpc("driver_gps_context",{p_delivery_id:deliveryId});
      if(context?.gps_live&&context?.has_en_route)allowed.push(deliveryId);
    }
    if(!allowed.length)throw new Error("El plan vigente no incluye GPS en vivo para estas entregas.");

    driverGpsState.allowedDeliveryIds=allowed;
    if($("driverGpsShareStatus"))$("driverGpsShareStatus").textContent="Solicitando permiso de ubicación…";

    driverGpsState.watchId=navigator.geolocation.watchPosition(
      position=>void publishDriverPosition(position),
      error=>{
        const messages={
          1:"Permiso de ubicación denegado.",
          2:"No se pudo obtener la ubicación del dispositivo.",
          3:"La ubicación tardó demasiado en responder."
        };
        if($("driverGpsShareStatus"))$("driverGpsShareStatus").textContent=messages[error.code]||"Error de geolocalización.";
      },
      {enableHighAccuracy:true,maximumAge:5000,timeout:15000}
    );

    if($("driverGpsStart"))$("driverGpsStart").disabled=true;
    if($("driverGpsStop"))$("driverGpsStop").disabled=false;
  }catch(e){
    if($("driverGpsShareStatus"))$("driverGpsShareStatus").textContent=e.message||"No se pudo activar GPS.";
    stopDriverGpsSharing(true);
  }
}

function quickDriverTrackingUrl(token){
  const url=new URL("../app/repartidor-rapido.html",location.href);
  url.searchParams.set("v","20260928-1510");
  url.hash="token="+encodeURIComponent(String(token||""));
  return url.toString();
}

function quickDriverWhatsappText(driver,trackingUrl){
  const emergency=driver?.driver_mode==="EMERGENCY";
  return [
    "*HTPWEB · Consola de repartidor*",
    "Repartidor: "+(driver?.full_name||"Repartidor"),
    "Tipo: "+(emergency?"EMERGENCIA":"REGULAR"),
    "",
    "Abre este enlace desde tu celular. Ahí verás tus pedidos, cliente, productos, locales de recogida, teléfonos, ruta, facturación cuando corresponda y GPS:",
    trackingUrl,
    "",
    "No compartas este enlace con otras personas."
  ].join("\n");
}

async function quickDriverInvoke(action,payload={}){
  const {data,error}=await supabaseClient.functions.invoke("quick-driver",{
    body:{
      action,
      delivery_id:driverWorkspaceDeliveryId(),
      ...payload
    }
  });
  if(error)throw new Error(data?.error||data?.message||error.message||"No se pudo procesar el repartidor rápido.");
  if(!data?.ok)throw new Error(data?.error||"No se pudo procesar el repartidor rápido.");
  return data;
}

function renderQuickDriverResult(){
  const box=$("quickDriverResult");
  if(!box)return;
  const item=driverWorkspaceState.quickDriver;
  if(!item){
    box.innerHTML='<div class="muted">Escribe el WhatsApp y crea un repartidor de emergencia. No necesita correo para comenzar.</div>';
    return;
  }
  const emergencyUntil=item.driver?.emergency_expires_at
    ? new Date(item.driver.emergency_expires_at).toLocaleString()
    : "—";
  box.innerHTML='<div class="workspace-note"><strong>'+esc(item.driver?.full_name||"Repartidor de emergencia creado")+'</strong>'+
    '<div>'+esc(item.driver?.phone||"")+' · EMERGENCIA activa</div>'+
    '<div class="muted" style="margin-top:4px">Cupo operativo hasta '+esc(emergencyUntil)+'. El enlace GPS puede regenerarse cuando sea necesario.</div>'+
    '<button id="quickDriverSendCurrent" class="btn-muted" type="button" style="margin-top:8px">Enviar acceso por WhatsApp</button></div>';
  if($("quickDriverSendCurrent"))$("quickDriverSendCurrent").onclick=()=>{
    try{
      const popup=window.open("","_blank");
      if(popup){
        popup.document.title="HTPWEB · Abriendo WhatsApp";
        popup.document.body.innerHTML='<p style="font-family:Arial,sans-serif;padding:24px">Abriendo WhatsApp…</p>';
        popup.location.href=htpWhatsappAssistedUrl(
          item.driver?.phone,
          quickDriverWhatsappText(item.driver,item.tracking_url)
        );
      }else{
        message("El navegador bloqueó la ventana. Habilita ventanas emergentes para abrir WhatsApp.","error");
      }
    }catch(e){message(e.message||"No se pudo abrir WhatsApp.","error");}
  };
}

async function createQuickDriver(){
  const phone=$("quickDriverPhone")?.value.trim();
  if(!phone){message("Escribe el número de WhatsApp del repartidor.","error");return;}

  const button=$("quickDriverCreateBtn");
  const popup=window.open("","_blank");
  if(popup){
    try{
      popup.document.title="HTPWEB · Creando emergencia";
      popup.document.body.innerHTML='<p style="font-family:Arial,sans-serif;padding:24px">HTPWEB está activando el cupo de emergencia y preparando WhatsApp…</p>';
    }catch{}
  }

  if(button)button.disabled=true;
  try{
    const data=await quickDriverInvoke("create",{phone});
    const trackingUrl=quickDriverTrackingUrl(data.tracking_token);
    driverWorkspaceState.quickDriver={
      driver:data.driver,
      tracking_url:trackingUrl
    };
    renderQuickDriverResult();
    if($("quickDriverPhone"))$("quickDriverPhone").value="";
    await loadDriverWorkspace();
    if($("section-myplan")?.classList.contains("active"))await loadMyPlanSummary();
    message("Repartidor de emergencia creado y activado por 24 horas.");

    if(popup&&data.driver?.phone){
      popup.location.href=htpWhatsappAssistedUrl(
        data.driver.phone,
        quickDriverWhatsappText(data.driver,trackingUrl)
      );
    }else if(popup){
      popup.close();
    }
  }catch(e){
    if(popup&&!popup.closed)popup.close();
    driverWorkspaceState.quickDriver=null;
    renderQuickDriverResult();
    message(e.message||"No se pudo crear el repartidor de emergencia.","error");
  }finally{
    if(button)button.disabled=false;
  }
}

async function regenerateQuickDriverAccess(userId){
  const popup=window.open("","_blank");
  if(popup){
    try{
      popup.document.title="HTPWEB · Preparando acceso";
      popup.document.body.innerHTML='<p style="font-family:Arial,sans-serif;padding:24px">Generando acceso GPS seguro…</p>';
    }catch{}
  }

  try{
    const data=await quickDriverInvoke("link",{driver_user_id:userId});
    const trackingUrl=quickDriverTrackingUrl(data.tracking_token);
    if(!data.driver?.phone)throw new Error("El repartidor no tiene WhatsApp registrado.");
    if(popup){
      popup.location.href=htpWhatsappAssistedUrl(
        data.driver.phone,
        quickDriverWhatsappText(data.driver,trackingUrl)
      );
    }else{
      message("El navegador bloqueó la ventana. Habilita ventanas emergentes e inténtalo otra vez.","error");
    }
  }catch(e){
    if(popup&&!popup.closed)popup.close();
    message(e.message||"No se pudo generar el acceso GPS.","error");
  }
}

function renderDriverCandidate(){
  const box=$("driverLookupResult");
  if(!box)return;
  const item=driverWorkspaceState.candidate;
  if(!item){
    box.innerHTML='<div class="muted">Busca una cuenta HTPWEB por correo o teléfono exacto.</div>';
    return;
  }
  const allowed=["CLIENT","DELIVERY_DRIVER"].includes(item.role_code);
  box.innerHTML='<div class="workspace-note"><strong>'+esc(item.full_name||item.email||"Cuenta HTPWEB")+'</strong>'+
    '<div>'+esc(item.email||"")+(item.phone?' · '+esc(item.phone):'')+'</div>'+
    '<div>Rol actual: '+esc(item.role_code||"—")+(item.already_active?' · Ya activo en este DELIVERY':'')+'</div>'+
    (allowed&&!item.already_active
      ? '<button class="btn-primary" type="button" id="driverActivateCandidate" style="margin-top:8px">Activar como repartidor</button>'
      : (!allowed?'<div class="workspace-warning" style="margin-top:8px">Esta cuenta tiene un rol administrativo y no puede convertirse automáticamente en repartidor.</div>':'')
    )+'</div>';
  if($("driverActivateCandidate"))$("driverActivateCandidate").onclick=activateDriverCandidate;
}

function renderDriversList(){
  const box=$("driversList");if(!box)return;
  const snap=driverWorkspaceState.drivers||{};
  const items=Array.isArray(snap.drivers)?snap.drivers:[];
  const summary=
    '<div class="workspace-note" style="margin-bottom:10px"><strong>Capacidad del plan:</strong> '+
    'Regulares '+esc(snap.regular_used??snap.used??0)+' / '+esc(snap.regular_limit??snap.limit??"—")+
    ' · Emergencia '+esc(snap.emergency_used??0)+' / '+esc(snap.emergency_limit??"—")+
    ' · Emergencia dura '+esc(snap.emergency_duration_hours??24)+' h</div>';
  if(!items.length){
    box.innerHTML=summary+'<div class="muted">No hay repartidores activos.</div>';
    return;
  }
  const canManage=state.role==="DELIVERY_ADMIN";
  box.innerHTML=summary+'<div class="table-wrap"><table><thead><tr><th>Repartidor</th><th>Tipo</th><th>Pedidos activos</th><th>Acciones</th></tr></thead><tbody>'+
    items.map(d=>{
      const emergency=d.driver_mode==="EMERGENCY";
      const expires=emergency&&d.emergency_expires_at?new Date(d.emergency_expires_at).toLocaleString():"";
      const mode=emergency
        ? '<span class="badge">EMERGENCIA</span>'+(d.emergency_grace?'<div class="workspace-warning" style="margin-top:5px">Vencido · termina entrega actual</div>':'<div class="muted">Hasta '+esc(expires)+'</div>')
        : '<span class="badge">REGULAR</span>';
      return '<tr><td><strong>'+esc(d.full_name||"Repartidor")+'</strong><div class="muted">'+esc(d.phone||"")+
        '</div></td><td>'+mode+'</td><td>'+esc(d.active_orders||0)+' / '+esc(snap.concurrent_per_driver??"—")+
        '</td><td><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn-muted" type="button" data-driver-gps="'+esc(d.user_id)+'" data-driver-name="'+esc(d.full_name||"Repartidor")+'">Ver GPS</button>'+
        (canManage?'<button class="btn-muted" type="button" data-driver-quick-link="'+esc(d.user_id)+'">Enviar consola móvil</button><button class="btn-danger" type="button" data-driver-disable="'+esc(d.user_id)+'">Desactivar</button>':'')+'</div></td></tr>';
    }).join("")+
    '</tbody></table></div>';
  box.querySelectorAll("[data-driver-gps]").forEach(b=>b.onclick=()=>selectDriverGps(b.dataset.driverGps,b.dataset.driverName));
  box.querySelectorAll("[data-driver-quick-link]").forEach(b=>b.onclick=()=>regenerateQuickDriverAccess(b.dataset.driverQuickLink));
  box.querySelectorAll("[data-driver-disable]").forEach(b=>b.onclick=()=>deactivateDriver(b.dataset.driverDisable));
}

function renderDispatchModeControls(){
  const dispatch=driverWorkspaceState.dispatch||{};
  const select=$("dispatchModeSelect");
  const save=$("dispatchModeSave");
  const help=$("dispatchModeHelp");
  if(!select||!save||!help)return;

  const allowed=Array.isArray(dispatch.allowed_modes)?dispatch.allowed_modes:[];
  const mode=dispatch.mode||"NONE";
  const labels={MANUAL:"Manual",HYBRID:"Híbrido",AUTO:"Automático",NONE:"No incluido"};

  select.innerHTML=allowed.length
    ? allowed.map(item=>'<option value="'+esc(item)+'">'+esc(labels[item]||item)+'</option>').join("")
    : '<option value="NONE">No incluido en el plan</option>';

  if(allowed.includes(mode))select.value=mode;
  const canManage=state.role==="DELIVERY_ADMIN"&&allowed.length>0;
  select.disabled=!canManage;
  save.disabled=!canManage;

  const configured=dispatch.configured_mode||null;
  const fallback=configured&&configured!==mode
    ?" · El modo configurado ya no está incluido; HTPWEB aplicó "+esc(labels[mode]||mode)+"."
    :"";
  help.innerHTML=mode==="NONE"
    ?"El plan vigente no incluye un modo de despacho operativo."
    :"Modo efectivo: <strong>"+esc(labels[mode]||mode)+"</strong> · multipedido "+
      (dispatch.multi_order?"Sí":"No")+" · capacidad efectiva por repartidor "+
      esc(dispatch.concurrent_per_driver??0)+fallback;
}


function renderWhatsappConnectionControls(){
  const connection=driverWorkspaceState.whatsappConnection||{
    configured:false,
    status:"DISCONNECTED",
    connection_mode:null
  };
  const badge=$("whatsappConnectionBadge");
  const current=$("whatsappConnectionCurrent");
  const adminBox=$("whatsappConnectionAdmin");
  const mode=$("whatsappConnectionMode");
  const phoneWrap=$("whatsappRequestedPhoneWrap");
  const phone=$("whatsappRequestedPhone");
  const button=$("whatsappConnectionRequestBtn");
  const help=$("whatsappConnectionHelp");
  const labels={CONNECTED:"Conectado",PENDING:"Pendiente",DISCONNECTED:"Sin conectar",ERROR:"Error"};

  if(badge){
    badge.textContent=labels[connection.status]||connection.status||"Sin conectar";
    badge.className="badge";
  }

  if(current){
    if(connection.configured){
      current.innerHTML="<strong>WhatsApp conectado:</strong> "+
        esc(connection.display_phone||connection.requested_phone||"—")+
        (connection.verified_name?" · "+esc(connection.verified_name):"")+
        " · "+esc(connection.connection_mode==="OWN"?"WhatsApp propio":"Administrado por HTPWEB")+
        (connection.environment==="TEST"?" · Entorno de prueba":"");
    }else if(connection.status==="PENDING"){
      current.innerHTML="<strong>Conexión pendiente.</strong> "+
        esc(connection.requested_phone||"Número por definir")+
        " · "+esc(connection.connection_mode==="OWN"?"WhatsApp propio":"Administrado por HTPWEB")+".";
    }else if(connection.status==="ERROR"){
      current.innerHTML="<strong>Error de conexión.</strong> "+esc(connection.last_error||"Revisa la configuración.");
    }else{
      current.textContent="Este DELIVERY todavía no tiene un remitente WhatsApp Business conectado.";
    }
  }

  const canManage=state.role==="DELIVERY_ADMIN";
  if(adminBox)adminBox.classList.toggle("hidden",!canManage);
  if(!canManage)return;

  const selected=connection.connection_mode||mode?.value||"HTPWEB_MANAGED";
  if(mode)mode.value=selected;
  if(phone&&connection.requested_phone&&!phone.value)phone.value=connection.requested_phone;
  if(phoneWrap)phoneWrap.classList.toggle("hidden",(mode?.value||selected)==="OWN");
  if(button)button.textContent=connection.status==="PENDING"?"Actualizar solicitud":"Preparar conexión";

  if(help){
    help.textContent=(mode?.value||selected)==="OWN"
      ?"WhatsApp propio: HTPWEB prepara la vinculación y el administrador del número autoriza Meta una sola vez."
      :"Administrado por HTPWEB: ingresa el número del DELIVERY. HTPWEB prepara y administra la conexión; Meta puede exigir una verificación del número.";
  }
}

async function requestWhatsappConnection(){
  try{
    const deliveryId=driverWorkspaceDeliveryId();
    if(!deliveryId)throw new Error("Selecciona un DELIVERY.");
    const mode=$("whatsappConnectionMode")?.value||"HTPWEB_MANAGED";
    const phone=mode==="HTPWEB_MANAGED"?($("whatsappRequestedPhone")?.value||"").trim():null;
    if(mode==="HTPWEB_MANAGED"&&!phone){
      throw new Error("Ingresa el número de WhatsApp que usará el DELIVERY.");
    }
    driverWorkspaceState.whatsappConnection=await rpc("delivery_request_whatsapp_connection",{
      p_delivery_id:deliveryId,
      p_connection_mode:mode,
      p_phone:phone
    });
    message(mode==="OWN"
      ?"Solicitud de WhatsApp propio preparada. HTPWEB continuará con la autorización de Meta."
      :"Solicitud enviada al MASTER. HTPWEB continuará con la activación del número.");
    renderWhatsappConnectionControls();
    renderWhatsappSettingsControls();
  }catch(e){
    message(e.message||"No se pudo preparar la conexión WhatsApp.","error");
  }
}

function renderWhatsappSettingsControls(){
  const settings=driverWorkspaceState.whatsappSettings||{
    mode:"ASSISTED",
    local_orders:true,
    driver_dispatch:true,
    customer_orders:true,
    customer_order_available:true
  };
  const provider=driverWorkspaceState.whatsappProvider||{configured:false};
  const connection=driverWorkspaceState.whatsappConnection||{configured:false,status:"DISCONNECTED"};
  const select=$("whatsappModeSelect");
  const save=$("whatsappSettingsSave");
  const localOrders=$("whatsappLocalOrders");
  const driverDispatch=$("whatsappDriverDispatch");
  const customerOrders=$("whatsappCustomerOrders");
  const help=$("whatsappSettingsHelp");
  if(!select||!save||!localOrders||!driverDispatch||!customerOrders||!help)return;

  const canManage=state.role==="DELIVERY_ADMIN";
  const automaticOption=[...select.options].find(option=>option.value==="AUTOMATIC");
  if(automaticOption)automaticOption.disabled=provider.configured!==true||connection.configured!==true;

  select.value=settings.mode||"ASSISTED";
  localOrders.checked=settings.local_orders!==false;
  driverDispatch.checked=settings.driver_dispatch!==false;
  customerOrders.checked=settings.customer_orders!==false;
  select.disabled=!canManage;
  save.disabled=!canManage;
  localOrders.disabled=!canManage;
  driverDispatch.disabled=!canManage;
  customerOrders.disabled=!canManage||settings.customer_order_available===false;

  const customerHelp=settings.customer_order_available===false
    ?" · Pedido del cliente por WhatsApp no está disponible en el plan actual."
    :(settings.customer_orders!==false
      ?" · Pedido del cliente por WhatsApp activo: después de registrar el pedido, se abre WhatsApp del cliente para enviarlo al DELIVERY."
      :" · Pedido del cliente por WhatsApp desactivado.");

  if(provider.configured===true&&connection.configured===true){
    help.textContent=(settings.mode==="AUTOMATIC"
      ?"Automático activo: HTPWEB usa la API oficial de Meta. Las asignaciones a repartidores se notifican desde backend."
      :"Proveedor Meta listo. Puedes mantener Asistido o activar Automático.")+customerHelp;
  }else{
    help.textContent=(settings.mode==="AUTOMATIC"
      ?"Automático está seleccionado, pero este DELIVERY aún no tiene su WhatsApp Business completamente conectado. Cambia a Asistido hasta completar la conexión."
      :"Asistido activo. Automático quedará disponible cuando el WhatsApp Business de este DELIVERY esté conectado y Meta tenga las plantillas listas.")+customerHelp;
  }
}

async function saveWhatsappSettings(){
  try{
    const mode=$("whatsappModeSelect")?.value||"ASSISTED";
    if(mode==="AUTOMATIC"&&(
      driverWorkspaceState.whatsappProvider?.configured!==true||
      driverWorkspaceState.whatsappConnection?.configured!==true
    )){
      throw new Error("Primero conecta el WhatsApp Business de este DELIVERY y completa la configuración de Meta.");
    }
    driverWorkspaceState.whatsappSettings=await rpc("delivery_set_whatsapp_settings",{
      p_delivery_id:driverWorkspaceDeliveryId(),
      p_mode:mode,
      p_local_orders:$("whatsappLocalOrders")?.checked!==false,
      p_driver_dispatch:$("whatsappDriverDispatch")?.checked!==false,
      p_customer_orders:$("whatsappCustomerOrders")?.checked!==false
    });
    message("Configuración de WhatsApp actualizada.");
    renderWhatsappSettingsControls();
    renderDispatchOrders();
  }catch(e){
    message(e.message||"No se pudo guardar la configuración de WhatsApp.","error");
  }
}

function renderDispatchOrders(){
  const box=$("dispatchOrders");if(!box)return;
  const dispatch=driverWorkspaceState.dispatch||{};
  const drivers=Array.isArray(driverWorkspaceState.drivers?.drivers)?driverWorkspaceState.drivers.drivers:[];
  const orders=Array.isArray(dispatch.orders)?dispatch.orders:[];
  const mode=dispatch.mode||"NONE";
  const effectiveLimit=Number(dispatch.concurrent_per_driver||0);

  if(mode==="NONE"){
    box.innerHTML='<div class="workspace-warning">El plan vigente no incluye un modo de despacho operativo.</div>';
    return;
  }
  if(!orders.length){
    box.innerHTML='<div class="muted">No hay pedidos READY o EN_ROUTE para despachar.</div>';
    return;
  }

  box.innerHTML=orders.map(o=>{
    const assigned=o.assignment||null;
    let controls="";

    if(o.status==="EN_ROUTE"){
      controls='<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><span class="muted">En ruta con '+esc(assigned?.driver_name||"repartidor asignado")+'.</span><button class="btn-muted" type="button" data-dispatch-proof="'+esc(o.order_id)+'">Ver prueba</button></div><div id="dispatchProof-'+esc(o.order_id)+'"></div>';
    }else if(mode==="MANUAL"){
      const options='<option value="">Seleccionar repartidor</option>'+drivers.map(d=>{
        const active=Number(d.active_orders||0);
        const same=assigned?.driver_user_id===d.user_id;
        const full=!same&&effectiveLimit>0&&active>=effectiveLimit;
        return '<option value="'+esc(d.user_id)+'" '+(same?'selected ':'')+(full?'disabled ':'')+'>'+
          esc(d.full_name||"Repartidor")+' · '+esc(active)+' / '+esc(effectiveLimit)+' activo(s)'+(full?' · sin cupo':'')+
          '</option>';
      }).join("");
      controls='<div class="row" style="gap:8px;flex-wrap:wrap"><select id="dispatchDriver-'+esc(o.order_id)+'" style="max-width:360px">'+options+
        '</select><button class="btn-primary" type="button" data-dispatch-assign="'+esc(o.order_id)+'">'+
        (assigned?'Reasignar':'Asignar')+'</button>'+
        (assigned?'<button class="btn-muted" type="button" data-dispatch-unassign="'+esc(o.order_id)+'">Quitar</button>':'')+'</div>';
    }else if(mode==="HYBRID"){
      if(assigned){
        controls='<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><span class="muted">Asignado a <strong>'+
          esc(assigned.driver_name||"Repartidor")+'</strong>.</span>'+
          '<button class="btn-muted" type="button" data-dispatch-unassign="'+esc(o.order_id)+'">Quitar</button></div>';
      }else if(o.suggestion){
        controls='<div class="workspace-note"><strong>Sugerencia:</strong> '+esc(o.suggestion.driver_name||"Repartidor")+
          ' <button class="btn-primary" type="button" data-dispatch-accept="'+esc(o.order_id)+'" style="margin-left:8px">Aceptar sugerencia</button></div>';
      }else{
        controls='<div class="workspace-warning">Sin repartidor con capacidad disponible. HTPWEB volverá a sugerir cuando se libere cupo.</div>';
      }
    }else if(mode==="AUTO"){
      controls=assigned
        ? '<div class="workspace-note"><strong>Asignación automática:</strong> '+esc(assigned.driver_name||"Repartidor")+'.</div>'
        : '<div class="workspace-warning">Esperando capacidad disponible. HTPWEB asignará automáticamente cuando se libere cupo.</div>';
    }

    const whatsapp=driverWorkspaceState.whatsappSettings||{};
    if(assigned&&whatsapp.driver_dispatch!==false){
      const driver=drivers.find(item=>item.user_id===assigned.driver_user_id);
      if(whatsapp.mode==="ASSISTED"&&driver?.phone){
        controls+='<div style="margin-top:8px"><button class="btn-muted" type="button" data-dispatch-whatsapp="'+esc(o.order_id)+'">WhatsApp al repartidor</button></div>';
      }else if(whatsapp.mode==="AUTOMATIC"){
        controls+='<div class="muted" style="margin-top:8px">Aviso WhatsApp automático gestionado por HTPWEB.</div>';
      }
    }

    return '<div class="order-local" style="margin-top:10px"><div class="row between"><div><strong>Pedido '+esc(o.order_id)+'</strong>'+
      '<div class="muted">'+esc(o.customer_name||"Cliente")+' · '+esc(o.delivery_address||"")+'</div></div>'+
      '<span class="badge status-'+esc(o.status)+'">'+esc(o.status)+'</span></div>'+controls+'</div>';
  }).join("");

  box.querySelectorAll("[data-dispatch-assign]").forEach(b=>b.onclick=()=>assignDriverToOrder(b.dataset.dispatchAssign));
  box.querySelectorAll("[data-dispatch-unassign]").forEach(b=>b.onclick=()=>unassignDriverFromOrder(b.dataset.dispatchUnassign));
  box.querySelectorAll("[data-dispatch-accept]").forEach(b=>b.onclick=()=>acceptHybridDispatchSuggestion(b.dataset.dispatchAccept));
  box.querySelectorAll("[data-dispatch-proof]").forEach(b=>b.onclick=()=>showDispatchDeliveryProof(b.dataset.dispatchProof));
  box.querySelectorAll("[data-dispatch-whatsapp]").forEach(b=>b.onclick=()=>notifyAssignedDriverWhatsapp(b.dataset.dispatchWhatsapp));
}

async function showDispatchDeliveryProof(orderId){
  const host=$("dispatchProof-"+orderId);
  if(!host)return;
  host.innerHTML='<div class="muted" style="margin-top:8px">Consultando prueba…</div>';
  try{
    const proof=await rpc("delivery_order_proof_snapshot",{
      p_delivery_id:driverWorkspaceDeliveryId(),
      p_order_id:orderId
    });
    if(!proof?.enabled){
      host.innerHTML='<div class="muted" style="margin-top:8px">Este pedido no requiere prueba de entrega.</div>';
      return;
    }
    const rows=[];
    if(proof.require_pin)rows.push(proof.pin_verified?'✅ PIN verificado':'⏳ PIN pendiente');
    if(proof.require_photo)rows.push(proof.photo_uploaded?'✅ Foto cargada':'⏳ Foto pendiente');
    if(proof.require_signature)rows.push(proof.signature_uploaded?'✅ Firma registrada':'⏳ Firma pendiente');
    host.innerHTML='<div class="workspace-note" style="margin-top:8px">'+
      '<div>'+rows.map(esc).join(' · ')+'</div>'+
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">'+
      (proof.photo_uploaded?'<button class="btn-muted" type="button" data-admin-proof-view="'+esc(orderId)+'" data-proof-kind="PHOTO">Ver foto</button>':'')+
      (proof.signature_uploaded?'<button class="btn-muted" type="button" data-admin-proof-view="'+esc(orderId)+'" data-proof-kind="SIGNATURE">Ver firma</button>':'')+
      '</div><small class="muted">'+(proof.ready?'Prueba completa.':'Entrega todavía bloqueada por evidencia pendiente.')+'</small></div>';
    host.querySelectorAll("[data-admin-proof-view]").forEach(b=>{
      b.onclick=()=>viewDeliveryProofMedia(b.dataset.adminProofView,b.dataset.proofKind);
    });
  }catch(e){
    host.innerHTML='<div class="workspace-warning" style="margin-top:8px">'+esc(e.message||"No se pudo consultar la prueba.")+'</div>';
  }
}

async function saveDispatchMode(){
  try{
    const mode=$("dispatchModeSelect")?.value;
    if(!mode||mode==="NONE")throw new Error("Selecciona un modo de despacho incluido en el plan.");
    await rpc("delivery_set_dispatch_mode",{
      p_delivery_id:driverWorkspaceDeliveryId(),
      p_mode:mode
    });
    message("Modo de despacho actualizado.");
    await loadDriverWorkspace();
  }catch(e){message(e.message||"No se pudo cambiar el modo de despacho.","error");}
}

async function acceptHybridDispatchSuggestion(orderId){
  try{
    await rpc("delivery_accept_dispatch_suggestion",{
      p_delivery_id:driverWorkspaceDeliveryId(),
      p_order_id:orderId
    });
    message("Sugerencia de despacho confirmada.");
    await loadDriverWorkspace();
  }catch(e){message(e.message||"No se pudo confirmar la sugerencia.","error");}
}

function renderDeliveryProofSettingsControls(){
  const proof=driverWorkspaceState.proofSettings||{};
  const canManage=state.role==="DELIVERY_ADMIN";
  const rows=[
    ["proofRequirePin","available_pin","require_pin","configured_pin","PIN"],
    ["proofRequirePhoto","available_photo","require_photo","configured_photo","Foto"],
    ["proofRequireSignature","available_signature","require_signature","configured_signature","Firma"]
  ];
  const unavailable=[];
  for(const row of rows){
    const input=$(row[0]);
    if(!input)continue;
    const available=proof[row[1]]===true;
    input.checked=proof[row[2]]===true;
    input.disabled=!canManage||!available;
    if(proof[row[3]]===true&&!available)unavailable.push(row[4]);
  }
  if($("deliveryProofSettingsSave"))$("deliveryProofSettingsSave").disabled=!canManage;
  const availableLabels=[];
  if(proof.available_pin)availableLabels.push("PIN");
  if(proof.available_photo)availableLabels.push("foto");
  if(proof.available_signature)availableLabels.push("firma");
  const help=$("deliveryProofSettingsHelp");
  if(help){
    help.textContent=availableLabels.length
      ?"Incluido en el plan: "+availableLabels.join(", ")+(unavailable.length?". Fuera del plan e ignorado: "+unavailable.join(", ")+".":".")
      :"El plan vigente no incluye métodos de prueba de entrega.";
  }
}

async function saveDeliveryProofSettings(){
  try{
    if(state.role!=="DELIVERY_ADMIN")throw new Error("Solo DELIVERY_ADMIN puede cambiar la prueba de entrega.");
    const deliveryId=driverWorkspaceDeliveryId();
    if(!deliveryId)throw new Error("Selecciona un DELIVERY.");
    driverWorkspaceState.proofSettings=await rpc("delivery_save_proof_settings",{
      p_delivery_id:deliveryId,
      p_require_pin:$("proofRequirePin")?.checked===true,
      p_require_photo:$("proofRequirePhoto")?.checked===true,
      p_require_signature:$("proofRequireSignature")?.checked===true
    });
    renderDeliveryProofSettingsControls();
    message("Prueba de entrega actualizada.");
  }catch(e){
    message(e.message||"No se pudo guardar la prueba de entrega.","error");
  }
}

function sosStatusLabel(value){
  return {OPEN:"Abierto",ACKNOWLEDGED:"Reconocido",RESOLVED:"Resuelto"}[value]||value||"—";
}

function sosLocationLink(item){
  const lat=Number(item?.latitude);
  const lng=Number(item?.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return "";
  const href="https://www.openstreetmap.org/?mlat="+encodeURIComponent(lat)+"&mlon="+encodeURIComponent(lng)+"#map=18/"+encodeURIComponent(lat)+"/"+encodeURIComponent(lng);
  return '<a class="btn-muted" href="'+href+'" target="_blank" rel="noopener noreferrer">Abrir ubicación</a>';
}

function renderDeliverySos(){
  const box=$("deliverySosList");
  const notice=$("deliverySosNotice");
  if(!box||!notice)return;

  const snap=driverWorkspaceState.sos||{};
  const items=Array.isArray(snap.incidents)?snap.incidents:[];
  const active=items.filter(x=>["OPEN","ACKNOWLEDGED"].includes(x.status));

  if(!snap.enabled){
    notice.textContent=active.length
      ?"El plan actual no permite crear nuevos SOS, pero estos incidentes existentes siguen disponibles para atención."
      :"El plan vigente no incluye SOS de repartidor.";
  }else{
    notice.textContent=active.length
      ?active.length+" alerta(s) activa(s)."
      :"SOS habilitado · no hay alertas activas.";
  }

  if(!items.length){
    box.innerHTML='<div class="muted">No hay incidentes SOS registrados.</div>';
    return;
  }

  box.innerHTML=items.map(item=>{
    const created=item.created_at
      ?new Date(item.created_at).toLocaleString("es-EC",{timeZone:"America/Guayaquil"})
      :"—";
    const location=item.latitude!=null&&item.longitude!=null
      ?'<div class="muted">Ubicación '+esc(item.location_source||"")+
        (item.location_captured_at?' · '+esc(new Date(item.location_captured_at).toLocaleString("es-EC",{timeZone:"America/Guayaquil"})):'')+
        (Number.isFinite(Number(item.accuracy_m))?' · ±'+Math.round(Number(item.accuracy_m))+' m':'')+'</div>'
      :'<div class="workspace-warning">Ubicación no disponible. Atiende la alerta igualmente.</div>';

    const actions=item.status==="OPEN"
      ? '<button class="btn-primary" type="button" data-sos-ack="'+esc(item.incident_id)+'">Reconocer</button>'+
        '<button class="btn-danger" type="button" data-sos-resolve="'+esc(item.incident_id)+'">Resolver</button>'
      : item.status==="ACKNOWLEDGED"
        ? '<button class="btn-danger" type="button" data-sos-resolve="'+esc(item.incident_id)+'">Resolver</button>'
        : '';

    return '<div class="card" style="border-left:5px solid currentColor">'+
      '<div class="row between" style="gap:10px;flex-wrap:wrap"><div><strong>SOS · '+esc(item.driver_name||"Repartidor")+'</strong>'+
      '<div class="muted">'+esc(item.driver_phone||"")+' · pedido '+esc(item.order_id)+'</div></div>'+
      '<span class="badge">'+esc(sosStatusLabel(item.status))+'</span></div>'+
      '<p><strong>Activado:</strong> '+esc(created)+'</p>'+location+
      (item.resolution_note?'<p><strong>Nota:</strong> '+esc(item.resolution_note)+'</p>':'')+
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">'+sosLocationLink(item)+actions+'</div></div>';
  }).join("");

  box.querySelectorAll("[data-sos-ack]").forEach(b=>b.onclick=()=>acknowledgeDeliverySos(b.dataset.sosAck));
  box.querySelectorAll("[data-sos-resolve]").forEach(b=>b.onclick=()=>resolveDeliverySos(b.dataset.sosResolve));
}

async function loadDeliverySosSnapshotOnly(){
  const deliveryId=driverWorkspaceDeliveryId();
  if(!deliveryId||![ "DELIVERY_ADMIN","DELIVERY_OPERATOR" ].includes(state.role))return;
  try{
    driverWorkspaceState.sos=await rpc("delivery_sos_snapshot",{
      p_delivery_id:deliveryId,
      p_limit:50
    })||{};
    renderDeliverySos();
  }catch(e){
    if($("deliverySosNotice"))$("deliverySosNotice").textContent=e.message||"No se pudieron cargar las alertas SOS.";
  }
}

function scheduleDeliverySosRefresh(){
  if(safetySosState.refreshTimer)clearTimeout(safetySosState.refreshTimer);
  safetySosState.refreshTimer=setTimeout(()=>{
    safetySosState.refreshTimer=null;
    void loadDeliverySosSnapshotOnly();
  },200);
}

async function stopDeliverySosSubscription(){
  const channel=safetySosState.deliveryChannel;
  safetySosState.deliveryChannel=null;
  safetySosState.deliveryId=null;
  if(channel){
    try{await supabaseClient.removeChannel(channel);}catch{}
  }
}

async function startDeliverySosSubscription(deliveryId){
  if(!deliveryId||![ "DELIVERY_ADMIN","DELIVERY_OPERATOR" ].includes(state.role))return;
  if(safetySosState.deliveryChannel&&safetySosState.deliveryId===deliveryId)return;
  await stopDeliverySosSubscription();
  safetySosState.deliveryId=deliveryId;
  safetySosState.deliveryChannel=supabaseClient
    .channel("safety-sos:delivery:"+deliveryId,{config:{private:true}})
    .on("broadcast",{event:"sos"},()=>scheduleDeliverySosRefresh())
    .subscribe(status=>{
      if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
        if($("deliverySosNotice"))$("deliverySosNotice").textContent="Alertas SOS cargadas; la actualización en vivo no pudo conectarse. Usa Actualizar SOS.";
      }
    });
}

async function acknowledgeDeliverySos(incidentId){
  try{
    await rpc("delivery_acknowledge_sos",{
      p_delivery_id:driverWorkspaceDeliveryId(),
      p_incident_id:incidentId
    });
    message("Alerta SOS reconocida.");
    await loadDeliverySosSnapshotOnly();
  }catch(e){message(e.message||"No se pudo reconocer el SOS.","error");}
}

async function resolveDeliverySos(incidentId){
  const note=prompt("Nota de resolución (opcional):","")??null;
  if(note===null)return;
  try{
    await rpc("delivery_resolve_sos",{
      p_delivery_id:driverWorkspaceDeliveryId(),
      p_incident_id:incidentId,
      p_note:note
    });
    message("Alerta SOS resuelta.");
    await loadDeliverySosSnapshotOnly();
  }catch(e){message(e.message||"No se pudo resolver el SOS.","error");}
}

function routeDeviationReasonLabel(value){
  return {
    RETURNED_TO_ROUTE:"Regresó a la ruta",
    ORDER_FINISHED:"Pedido finalizado",
    MANUAL:"Resuelto manualmente"
  }[value]||value||"—";
}

function renderDeliveryRouteDeviation(){
  const box=$("deliveryDeviationList");
  const notice=$("deliveryDeviationNotice");
  if(!box||!notice)return;

  const snap=driverWorkspaceState.deviation||{};
  const items=Array.isArray(snap.incidents)?snap.incidents:[];
  const active=items.filter(x=>["OPEN","ACKNOWLEDGED"].includes(x.status));

  if(!snap.enabled){
    notice.textContent=active.length
      ?"El plan actual no crea nuevos desvíos, pero las alertas existentes siguen disponibles para atención."
      :"El plan vigente no incluye alerta de desvío con GPS en vivo.";
  }else{
    notice.textContent=active.length
      ?active.length+" alerta(s) de desvío activa(s)."
      :"Monitoreo de desvío habilitado · no hay alertas activas.";
  }

  if(!items.length){
    box.innerHTML='<div class="muted">No hay desvíos de ruta registrados.</div>';
    return;
  }

  box.innerHTML=items.map(item=>{
    const created=item.first_detected_at
      ?new Date(item.first_detected_at).toLocaleString("es-EC",{timeZone:"America/Guayaquil"})
      :"—";
    const deviation=Number(item.deviation_m);
    const max=Number(item.max_deviation_m);
    const actions=item.status==="OPEN"
      ? '<button class="btn-primary" type="button" data-deviation-ack="'+esc(item.incident_id)+'">Reconocer</button>'+
        '<button class="btn-danger" type="button" data-deviation-resolve="'+esc(item.incident_id)+'">Resolver</button>'
      : item.status==="ACKNOWLEDGED"
        ? '<button class="btn-danger" type="button" data-deviation-resolve="'+esc(item.incident_id)+'">Resolver</button>'
        : '';

    return '<div class="card" style="border-left:5px solid currentColor">'+
      '<div class="row between" style="gap:10px;flex-wrap:wrap"><div><strong>Desvío · '+esc(item.driver_name||"Repartidor")+'</strong>'+
      '<div class="muted">'+esc(item.driver_phone||"")+' · pedido '+esc(item.order_id)+'</div></div>'+
      '<span class="badge">'+esc(sosStatusLabel(item.status))+'</span></div>'+
      '<p><strong>Detectado:</strong> '+esc(created)+'</p>'+
      '<div class="muted">Desvío actual: '+(Number.isFinite(deviation)?Math.round(deviation)+" m":"—")+
      ' · máximo: '+(Number.isFinite(max)?Math.round(max)+" m":"—")+
      ' · muestras: '+esc(item.samples_outside??0)+'</div>'+
      (item.status==="RESOLVED"&&item.resolution_reason
        ?'<div class="muted">Cierre: '+esc(routeDeviationReasonLabel(item.resolution_reason))+'</div>'
        :'')+
      (item.resolution_note?'<p><strong>Nota:</strong> '+esc(item.resolution_note)+'</p>':'')+
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">'+sosLocationLink(item)+actions+'</div></div>';
  }).join("");

  box.querySelectorAll("[data-deviation-ack]").forEach(b=>b.onclick=()=>acknowledgeDeliveryRouteDeviation(b.dataset.deviationAck));
  box.querySelectorAll("[data-deviation-resolve]").forEach(b=>b.onclick=()=>resolveDeliveryRouteDeviation(b.dataset.deviationResolve));
}

async function loadDeliveryRouteDeviationSnapshotOnly(){
  const deliveryId=driverWorkspaceDeliveryId();
  if(!deliveryId||!["DELIVERY_ADMIN","DELIVERY_OPERATOR"].includes(state.role))return;
  try{
    driverWorkspaceState.deviation=await rpc("delivery_route_deviation_snapshot",{
      p_delivery_id:deliveryId,
      p_limit:50
    })||{};
    renderDeliveryRouteDeviation();
  }catch(e){
    if($("deliveryDeviationNotice"))$("deliveryDeviationNotice").textContent=e.message||"No se pudieron cargar los desvíos de ruta.";
  }
}

function scheduleDeliveryRouteDeviationRefresh(){
  if(routeDeviationState.refreshTimer)clearTimeout(routeDeviationState.refreshTimer);
  routeDeviationState.refreshTimer=setTimeout(()=>{
    routeDeviationState.refreshTimer=null;
    void loadDeliveryRouteDeviationSnapshotOnly();
  },200);
}

async function stopDeliveryRouteDeviationSubscription(){
  const channel=routeDeviationState.deliveryChannel;
  routeDeviationState.deliveryChannel=null;
  routeDeviationState.deliveryId=null;
  if(channel){
    try{await supabaseClient.removeChannel(channel);}catch{}
  }
}

async function startDeliveryRouteDeviationSubscription(deliveryId){
  if(!deliveryId||!["DELIVERY_ADMIN","DELIVERY_OPERATOR"].includes(state.role))return;
  if(routeDeviationState.deliveryChannel&&routeDeviationState.deliveryId===deliveryId)return;
  await stopDeliveryRouteDeviationSubscription();
  routeDeviationState.deliveryId=deliveryId;
  routeDeviationState.deliveryChannel=supabaseClient
    .channel("route-deviation:delivery:"+deliveryId,{config:{private:true}})
    .on("broadcast",{event:"route_deviation"},()=>scheduleDeliveryRouteDeviationRefresh())
    .subscribe(status=>{
      if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
        if($("deliveryDeviationNotice"))$("deliveryDeviationNotice").textContent="Desvíos cargados; la actualización en vivo no pudo conectarse. Usa Actualizar desvíos.";
      }
    });
}

async function acknowledgeDeliveryRouteDeviation(incidentId){
  try{
    await rpc("delivery_acknowledge_route_deviation",{
      p_delivery_id:driverWorkspaceDeliveryId(),
      p_incident_id:incidentId
    });
    message("Alerta de desvío reconocida.");
    await loadDeliveryRouteDeviationSnapshotOnly();
  }catch(e){message(e.message||"No se pudo reconocer el desvío.","error");}
}

async function resolveDeliveryRouteDeviation(incidentId){
  const note=prompt("Nota de resolución (opcional):","")??null;
  if(note===null)return;
  try{
    await rpc("delivery_resolve_route_deviation",{
      p_delivery_id:driverWorkspaceDeliveryId(),
      p_incident_id:incidentId,
      p_note:note
    });
    message("Alerta de desvío resuelta.");
    await loadDeliveryRouteDeviationSnapshotOnly();
  }catch(e){message(e.message||"No se pudo resolver el desvío.","error");}
}

function activeDriverSos(){
  return (state.driverOrders||[])
    .map(o=>o?.sos?{...o.sos,delivery_id:o.delivery_id,order_id:o.order_id}:null)
    .find(x=>x&&["OPEN","ACKNOWLEDGED"].includes(x.status))||null;
}

function renderDriverSosNotice(){
  const box=$("driverSosNotice");
  if(!box)return;
  const incident=activeDriverSos();
  if(!incident){
    box.style.display="none";
    box.textContent="";
    return;
  }
  box.style.display="block";
  box.innerHTML='<strong>SOS '+esc(sosStatusLabel(incident.status))+'</strong> · pedido '+esc(incident.order_id)+
    (incident.status==="OPEN"
      ?' · La alerta fue enviada al DELIVERY.'
      :' · El DELIVERY confirmó que recibió la alerta.');
}

async function stopDriverSosSubscription(){
  const channel=safetySosState.driverChannel;
  safetySosState.driverChannel=null;
  if(channel){
    try{await supabaseClient.removeChannel(channel);}catch{}
  }
}

async function startDriverSosSubscription(){
  if(state.role!=="DELIVERY_DRIVER"||!state.user?.id)return;
  if(safetySosState.driverChannel)return;
  safetySosState.driverChannel=supabaseClient
    .channel("safety-sos:driver:"+state.user.id,{config:{private:true}})
    .on("broadcast",{event:"sos"},({payload})=>{
      if(payload?.status==="ACKNOWLEDGED")message("Tu alerta SOS fue reconocida por el DELIVERY.");
      if(payload?.status==="RESOLVED")message("Tu alerta SOS fue marcada como resuelta.");
      void loadDriverOrders();
    })
    .subscribe();
}

async function triggerDriverSos(orderId){
  try{
    let position=null;
    try{position=await currentPositionOnce();}catch{}
    const result=await rpc("driver_trigger_sos",{
      p_order_id:orderId,
      p_latitude:position?.latitude??null,
      p_longitude:position?.longitude??null,
      p_accuracy_m:position?.accuracy??null,
      p_captured_at:position?.captured_at??null
    });
    message(result?.already_open?"SOS ya estaba activo; alerta actualizada.":"SOS enviado al DELIVERY.");
    await loadDriverOrders();
  }catch(e){message(e.message||"No se pudo activar el SOS.","error");}
}

function driverDeviationPlanFor(orderId){
  const plans=Array.isArray(routeDeviationState.driverSnapshot?.plans)
    ? routeDeviationState.driverSnapshot.plans
    : [];
  return plans.find(p=>p.order_id===orderId&&p.active!==false)||null;
}

function driverDeviationContextFor(orderId){
  return routeDeviationState.contexts?.[orderId]||null;
}

function activeDriverRouteDeviation(){
  const incidents=Array.isArray(routeDeviationState.driverSnapshot?.incidents)
    ? routeDeviationState.driverSnapshot.incidents
    : [];
  return incidents.find(i=>["OPEN","ACKNOWLEDGED"].includes(i.status))||null;
}

function renderDriverRouteDeviationNotice(){
  const box=$("driverRouteDeviationNotice");
  if(!box)return;
  const incident=activeDriverRouteDeviation();
  if(!incident){
    box.style.display="none";
    box.textContent="";
    return;
  }
  const max=Number(incident.max_deviation_m);
  box.style.display="block";
  box.innerHTML='<strong>Desvío '+esc(sosStatusLabel(incident.status))+'</strong> · pedido '+esc(incident.order_id)+
    (Number.isFinite(max)?' · hasta '+Math.round(max)+' m fuera de la ruta':'')+
    (incident.status==="OPEN"
      ?' · El DELIVERY recibió la alerta automática.'
      :' · El DELIVERY confirmó que recibió la alerta.');
}

async function loadDriverRouteDeviationState(){
  if(state.role!=="DELIVERY_DRIVER")return;
  try{
    routeDeviationState.driverSnapshot=await rpc("driver_route_deviation_snapshot")||{plans:[],incidents:[]};
  }catch{
    routeDeviationState.driverSnapshot={plans:[],incidents:[]};
  }

  const contexts={};
  const enRoute=(state.driverOrders||[]).filter(o=>
    o.assignment_status==="ACTIVE"&&o.status==="EN_ROUTE"
  );
  await Promise.all(enRoute.map(async order=>{
    try{
      contexts[order.order_id]=await rpc("driver_route_deviation_plan_context",{
        p_order_id:order.order_id
      });
    }catch{
      contexts[order.order_id]=null;
    }
  }));
  routeDeviationState.contexts=contexts;
  renderDriverRouteDeviationNotice();
}

async function stopDriverRouteDeviationSubscription(){
  const channel=routeDeviationState.driverChannel;
  routeDeviationState.driverChannel=null;
  if(channel){
    try{await supabaseClient.removeChannel(channel);}catch{}
  }
}

async function startDriverRouteDeviationSubscription(){
  if(state.role!=="DELIVERY_DRIVER"||!state.user?.id)return;
  if(routeDeviationState.driverChannel)return;
  routeDeviationState.driverChannel=supabaseClient
    .channel("route-deviation:driver:"+state.user.id,{config:{private:true}})
    .on("broadcast",{event:"route_deviation"},({payload})=>{
      if(payload?.status==="OPEN")message("HTPWEB detectó un desvío sostenido y avisó al DELIVERY.","error");
      if(payload?.status==="ACKNOWLEDGED")message("El DELIVERY reconoció la alerta de desvío.");
      if(payload?.status==="RESOLVED"&&payload?.resolution_reason==="RETURNED_TO_ROUTE")message("Volviste al corredor esperado; la alerta de desvío se cerró.");
      if(payload?.status==="RESOLVED"&&payload?.resolution_reason!=="RETURNED_TO_ROUTE")message("La alerta de desvío fue resuelta.");
      void (async()=>{
        await loadDriverRouteDeviationState();
        renderDriverOrders();
      })();
    })
    .subscribe();
}

function routeDeviationContextMessage(context){
  return {
    GPS_NOT_INCLUDED:"El plan no incluye GPS en vivo.",
    ROUTE_DEVIATION_NOT_INCLUDED:"El plan no incluye alerta de desvío.",
    DESTINATION_COORDINATES_MISSING:"El pedido no tiene coordenadas de destino."
  }[context?.reason]||"El monitoreo de desvío no está disponible.";
}

async function prepareDriverRouteDeviationPlan(orderId,{quiet=false}={}){
  try{
    let context=driverDeviationContextFor(orderId);
    if(!context){
      context=await rpc("driver_route_deviation_plan_context",{p_order_id:orderId});
      routeDeviationState.contexts[orderId]=context;
    }
    if(!context?.can_prepare){
      if(!quiet&&context?.reason)message(routeDeviationContextMessage(context),"error");
      return false;
    }
    if(context.existing_plan||driverDeviationPlanFor(orderId))return true;

    const position=await currentPositionOnce();
    const {data,error}=await supabaseClient.functions.invoke("preparar-desvio-ruta",{
      body:{
        order_id:orderId,
        origin_lat:position.latitude,
        origin_lng:position.longitude
      }
    });
    if(error){
      let detail=error.message||"No se pudo preparar el monitoreo de desvío.";
      try{
        const payload=await error.context?.json?.();
        if(payload?.error)detail=payload.error;
      }catch{}
      throw new Error(detail);
    }
    if(!data?.ok)throw new Error(data?.error||"No se pudo preparar el monitoreo de desvío.");

    await loadDriverRouteDeviationState();
    if(!quiet)message("Monitoreo de desvío activo para esta entrega.");
    return true;
  }catch(e){
    if(!quiet)message(e.message||"No se pudo preparar el monitoreo de desvío.","error");
    return false;
  }
}

async function loadDriverWorkspace(){
  if(!["DELIVERY_ADMIN","DELIVERY_OPERATOR"].includes(state.role))return;
  const select=$("driversDelivery");if(!select)return;
  const previous=select.value;
  select.innerHTML=state.deliveries.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+'</option>').join("");
  if(previous&&state.deliveries.some(d=>d.id===previous))select.value=previous;
  const deliveryId=driverWorkspaceDeliveryId();
  if(!deliveryId)return;

  try{
    const [drivers,dispatch,proofSettings,sos,deviation,whatsappSettings,whatsappConnection,whatsappProvider]=await Promise.all([
      rpc("delivery_drivers_snapshot",{p_delivery_id:deliveryId}),
      rpc("delivery_dispatch_snapshot",{p_delivery_id:deliveryId}),
      rpc("delivery_proof_settings_snapshot",{p_delivery_id:deliveryId}),
      rpc("delivery_sos_snapshot",{p_delivery_id:deliveryId,p_limit:50}),
      rpc("delivery_route_deviation_snapshot",{p_delivery_id:deliveryId,p_limit:50}),
      rpc("delivery_whatsapp_settings_snapshot",{p_delivery_id:deliveryId}),
      rpc("delivery_whatsapp_connection_snapshot",{p_delivery_id:deliveryId}),
      typeof htpWhatsappProviderStatus==="function"
        ? htpWhatsappProviderStatus(deliveryId)
        : Promise.resolve({configured:false})
    ]);
    driverWorkspaceState.drivers=drivers||{};
    driverWorkspaceState.dispatch=dispatch||{};
    driverWorkspaceState.proofSettings=proofSettings||{};
    driverWorkspaceState.sos=sos||{};
    driverWorkspaceState.deviation=deviation||{};
    driverWorkspaceState.whatsappSettings=whatsappSettings||{mode:"ASSISTED",local_orders:true,driver_dispatch:true,customer_orders:true,customer_order_available:true};
    driverWorkspaceState.whatsappConnection=whatsappConnection||{configured:false,status:"DISCONNECTED"};
    driverWorkspaceState.whatsappProvider=whatsappProvider||{configured:false};
    const notice=$("driversPlanNotice");
    if(notice)notice.innerHTML='<strong>Capacidad del plan:</strong> repartidores '+esc(drivers?.used||0)+' / '+esc(drivers?.limit??0)+
      ' · modo '+esc(dispatch?.mode||"NONE")+
      ' · multipedido '+(dispatch?.multi_order?'Sí':'No')+
      ' · simultáneos efectivos '+esc(dispatch?.concurrent_per_driver??0)+
      (dispatch?.base_concurrent_per_driver!==dispatch?.concurrent_per_driver
        ? ' (límite contratado '+esc(dispatch?.base_concurrent_per_driver??0)+')'
        : '');
    if($("driverAdminTools"))$("driverAdminTools").classList.toggle("hidden",state.role!=="DELIVERY_ADMIN");
    renderDispatchModeControls();
    renderWhatsappConnectionControls();
    renderWhatsappSettingsControls();
    renderDeliveryProofSettingsControls();
    renderDriversList();
    renderDeliverySos();
    renderDeliveryRouteDeviation();
    renderDispatchOrders();
    renderDriverCandidate();
    await startDeliverySosSubscription(deliveryId);
    await startDeliveryRouteDeviationSubscription(deliveryId);
    if(driverGpsState.selectedDriverId){
      if(driverGpsState.selectedDeliveryId===deliveryId){
        await loadSelectedDriverGps();
      }else{
        resetAdminDriverGps();
      }
    }
  }catch(e){
    message(e.message||"No se pudo cargar Repartidores y despacho.","error");
  }
}

async function lookupDriverCandidate(){
  try{
    const identifier=$("driverLookupIdentifier")?.value.trim();
    if(!identifier)throw new Error("Escribe el correo o teléfono exacto del repartidor.");
    driverWorkspaceState.candidate=await rpc("delivery_driver_lookup",{
      p_delivery_id:driverWorkspaceDeliveryId(),
      p_identifier:identifier
    });
    if(!driverWorkspaceState.candidate)throw new Error("No existe una cuenta HTPWEB activa con ese dato exacto.");
    renderDriverCandidate();
  }catch(e){
    driverWorkspaceState.candidate=null;
    renderDriverCandidate();
    message(e.message||"No se pudo buscar la cuenta.","error");
  }
}

async function activateDriverCandidate(){
  const item=driverWorkspaceState.candidate;
  if(!item)return;
  try{
    await rpc("delivery_set_driver",{
      p_delivery_id:driverWorkspaceDeliveryId(),
      p_user_id:item.user_id,
      p_active:true
    });
    message("Repartidor activado.");
    driverWorkspaceState.candidate=null;
    if($("driverLookupIdentifier"))$("driverLookupIdentifier").value="";
    await loadDriverWorkspace();
    if($("section-myplan")?.classList.contains("active"))await loadMyPlanSummary();
  }catch(e){message(e.message||"No se pudo activar el repartidor.","error");}
}

async function deactivateDriver(userId){
  try{
    await rpc("delivery_set_driver",{
      p_delivery_id:driverWorkspaceDeliveryId(),
      p_user_id:userId,
      p_active:false
    });
    message("Repartidor desactivado.");
    await loadDriverWorkspace();
  }catch(e){message(e.message||"No se pudo desactivar el repartidor.","error");}
}

function buildDriverWhatsappText(order,driver,trackingUrl){
  return [
    "*HTPWEB · Nueva entrega #"+whatsappOrderRef(order?.order_id||order?.id)+"*",
    "Repartidor: "+(driver?.full_name||"Repartidor"),
    "Destino: "+(order?.delivery_address||"Ver detalle en HTPWEB"),
    "",
    "Abre este enlace desde tu celular para ver qué recoger, en qué LOCAL, datos del cliente, teléfonos, ruta y compartir ubicación:",
    trackingUrl||"Consola móvil no disponible",
    "",
    "Mantén la pantalla abierta mientras realizas la entrega."
  ].join("\n");
}

async function notifyAssignedDriverWhatsapp(orderId){
  const popup=window.open("","_blank");
  if(popup){
    try{
      popup.document.title="HTPWEB · Preparando repartidor";
      popup.document.body.innerHTML='<p style="font-family:Arial,sans-serif;padding:24px">Preparando WhatsApp y acceso GPS…</p>';
    }catch{}
  }
  try{
    const orders=Array.isArray(driverWorkspaceState.dispatch?.orders)?driverWorkspaceState.dispatch.orders:[];
    const order=orders.find(item=>item.order_id===orderId);
    const assigned=order?.assignment;
    if(!assigned)throw new Error("El pedido todavía no tiene repartidor asignado.");
    const drivers=Array.isArray(driverWorkspaceState.drivers?.drivers)?driverWorkspaceState.drivers.drivers:[];
    const driver=drivers.find(item=>item.user_id===assigned.driver_user_id);
    if(!driver?.phone)throw new Error("El repartidor no tiene teléfono registrado.");

    const access=await quickDriverInvoke("link",{driver_user_id:assigned.driver_user_id});
    const trackingUrl=quickDriverTrackingUrl(access.tracking_token);
    const text=buildDriverWhatsappText(order,driver,trackingUrl);

    if(popup){
      popup.location.href=htpWhatsappAssistedUrl(driver.phone,text);
    }else{
      message("El navegador bloqueó la ventana. Habilita ventanas emergentes e inténtalo nuevamente.","error");
      return;
    }
    message("WhatsApp abierto con la asignación y el acceso GPS listos para enviar.");
  }catch(e){
    if(popup&&!popup.closed)popup.close();
    message(e.message||"No se pudo preparar el aviso al repartidor.","error");
  }
}

async function assignDriverToOrder(orderId){
  try{
    const driverId=$("dispatchDriver-"+orderId)?.value;
    if(!driverId)throw new Error("Selecciona un repartidor.");
    await rpc("delivery_assign_order_driver",{
      p_delivery_id:driverWorkspaceDeliveryId(),
      p_order_id:orderId,
      p_driver_user_id:driverId,
      p_note:null
    });
    message("Pedido asignado al repartidor.");
    await loadDriverWorkspace();
  }catch(e){message(e.message||"No se pudo asignar el pedido.","error");}
}

async function unassignDriverFromOrder(orderId){
  try{
    await rpc("delivery_unassign_order_driver",{
      p_delivery_id:driverWorkspaceDeliveryId(),
      p_order_id:orderId,
      p_note:null
    });
    message("Repartidor retirado del pedido.");
    await loadDriverWorkspace();
  }catch(e){message(e.message||"No se pudo quitar el repartidor.","error");}
}

function driverActiveOrders(){
  return (Array.isArray(state.driverOrders)?state.driverOrders:[])
    .filter(o=>o.assignment_status==="ACTIVE"&&["READY","EN_ROUTE"].includes(o.status));
}

function driverRouteDeliveries(){
  const map=new Map();
  for(const order of driverActiveOrders()){
    if(!map.has(order.delivery_id)){
      map.set(order.delivery_id,{
        id:order.delivery_id,
        name:order.delivery_name||"DELIVERY",
        count:0
      });
    }
    map.get(order.delivery_id).count+=1;
  }
  return [...map.values()];
}

function reconcileDriverRoutePlan(){
  const plan=state.driverRoutePlan;
  if(!plan||!Array.isArray(plan.stops))return;
  const activeIds=new Set(driverActiveOrders().map(o=>o.order_id));
  const remaining=plan.stops.filter(stop=>activeIds.has(stop.order_id));
  if(!remaining.length){
    state.driverRoutePlan=null;
    return;
  }
  state.driverRoutePlan={...plan,stops:remaining};
}

function renderDriverRouteControls(){
  const select=$("driverRouteDelivery");
  const button=$("driverRouteOptimize");
  const status=$("driverRouteStatus");
  const result=$("driverRouteResult");
  if(!select||!button||!status||!result)return;

  const deliveries=driverRouteDeliveries();
  const previous=select.value;
  select.innerHTML=deliveries.length
    ? deliveries.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+' · '+esc(d.count)+' pedido(s)</option>').join("")
    : '<option value="">Sin pedidos activos</option>';

  if(state.driverRoutePlan?.delivery_id&&deliveries.some(d=>d.id===state.driverRoutePlan.delivery_id)){
    select.value=state.driverRoutePlan.delivery_id;
  }else if(previous&&deliveries.some(d=>d.id===previous)){
    select.value=previous;
  }

  button.disabled=!deliveries.length;

  if(!state.driverRoutePlan){
    status.textContent=deliveries.length
      ?"Selecciona un DELIVERY y optimiza antes de iniciar la siguiente tanda."
      :"No tienes pedidos READY o EN_ROUTE para optimizar.";
    result.innerHTML="";
    return;
  }

  const plan=state.driverRoutePlan;
  const km=plan.summary?.distance_km;
  const minutes=plan.summary?.duration_minutes;
  status.innerHTML='<strong>Ruta calculada:</strong> '+esc(plan.stops.length)+' parada(s)'+
    (km!=null?' · '+esc(km)+' km':'')+
    (minutes!=null?' · aprox. '+esc(minutes)+' min':'');

  result.innerHTML='<div class="stack">'+plan.stops.map((stop,index)=>{
    const order=(state.driverOrders||[]).find(o=>o.order_id===stop.order_id);
    const badge=order?.status?'<span class="badge status-'+esc(order.status)+'">'+esc(order.status)+'</span>':'';
    return '<div class="order-local"><div class="row between"><div><strong>'+(index+1)+'. '+esc(stop.customer_name||"Cliente")+
      '</strong><div class="muted">'+esc(stop.delivery_address||"")+
      (stop.address_reference?' · '+esc(stop.address_reference):'')+'</div></div>'+badge+'</div></div>';
  }).join("")+'</div>';
}

function driverRouteRank(order){
  const stops=state.driverRoutePlan?.stops;
  if(!Array.isArray(stops)||state.driverRoutePlan?.delivery_id!==order.delivery_id)return Number.MAX_SAFE_INTEGER;
  const i=stops.findIndex(stop=>stop.order_id===order.order_id);
  return i<0?Number.MAX_SAFE_INTEGER:i;
}

function renderDriverProofPanel(order){
  const proof=order?.proof;
  if(!proof?.enabled)return "";
  const editable=order.status==="EN_ROUTE"&&order.assignment_status==="ACTIVE";
  const parts=['<div class="workspace-note" style="margin:10px 0"><strong>Prueba de entrega</strong>'];

  if(proof.require_pin){
    if(proof.pin_verified){
      parts.push('<div style="margin-top:8px">✅ PIN verificado</div>');
    }else if(editable){
      parts.push('<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><input id="proofPin-'+esc(order.order_id)+'" inputmode="numeric" maxlength="6" placeholder="PIN de 6 dígitos" style="max-width:190px"><button class="btn-muted" type="button" data-proof-pin="'+esc(order.order_id)+'">Verificar PIN</button></div>');
    }else{
      parts.push('<div style="margin-top:8px">⏳ PIN pendiente</div>');
    }
  }

  if(proof.require_photo){
    if(proof.photo_uploaded){
      parts.push('<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><span>✅ Foto cargada</span><button class="btn-muted" type="button" data-proof-view="'+esc(order.order_id)+'" data-proof-kind="PHOTO">Ver foto</button></div>');
    }else if(editable){
      parts.push('<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><input id="proofPhoto-'+esc(order.order_id)+'" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"><button class="btn-muted" type="button" data-proof-photo="'+esc(order.order_id)+'">Subir foto</button></div>');
    }else{
      parts.push('<div style="margin-top:8px">⏳ Foto pendiente</div>');
    }
  }

  if(proof.require_signature){
    if(proof.signature_uploaded){
      parts.push('<div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><span>✅ Firma registrada</span><button class="btn-muted" type="button" data-proof-view="'+esc(order.order_id)+'" data-proof-kind="SIGNATURE">Ver firma</button></div>');
    }else if(editable){
      parts.push('<div style="margin-top:10px"><div class="muted">Firma del cliente</div><canvas data-proof-signature-canvas="'+esc(order.order_id)+'" width="600" height="220" style="width:100%;max-width:600px;height:180px;border:1px solid #bbb;border-radius:10px;background:#fff;touch-action:none"></canvas><div class="row" style="gap:8px;margin-top:6px"><button class="btn-muted" type="button" data-proof-sign-clear="'+esc(order.order_id)+'">Limpiar</button><button class="btn-muted" type="button" data-proof-sign-upload="'+esc(order.order_id)+'">Guardar firma</button></div></div>');
    }else{
      parts.push('<div style="margin-top:8px">⏳ Firma pendiente</div>');
    }
  }

  parts.push('<div class="muted" style="margin-top:8px">'+(proof.ready?'Prueba completa. Ya puedes finalizar la entrega.':'Completa todos los métodos exigidos antes de finalizar.')+'</div></div>');
  return parts.join("");
}

function initDriverProofSignatureCanvases(){
  document.querySelectorAll("canvas[data-proof-signature-canvas]").forEach(canvas=>{
    if(canvas.dataset.bound==="1")return;
    canvas.dataset.bound="1";
    const ctx=canvas.getContext("2d");
    if(!ctx)return;
    ctx.lineWidth=3;
    ctx.lineCap="round";
    ctx.lineJoin="round";
    let drawing=false;
    const point=event=>{
      const rect=canvas.getBoundingClientRect();
      return {
        x:(event.clientX-rect.left)*(canvas.width/rect.width),
        y:(event.clientY-rect.top)*(canvas.height/rect.height)
      };
    };
    canvas.addEventListener("pointerdown",event=>{
      drawing=true;
      canvas.dataset.dirty="1";
      try{canvas.setPointerCapture(event.pointerId);}catch{}
      const p=point(event);
      ctx.beginPath();
      ctx.moveTo(p.x,p.y);
      event.preventDefault();
    });
    canvas.addEventListener("pointermove",event=>{
      if(!drawing)return;
      const p=point(event);
      ctx.lineTo(p.x,p.y);
      ctx.stroke();
      event.preventDefault();
    });
    const stop=event=>{
      drawing=false;
      try{canvas.releasePointerCapture(event.pointerId);}catch{}
      event.preventDefault();
    };
    canvas.addEventListener("pointerup",stop);
    canvas.addEventListener("pointercancel",stop);
  });
}

async function verifyDriverProofPin(orderId){
  try{
    const pin=$("proofPin-"+orderId)?.value.trim()||"";
    const result=await rpc("driver_verify_delivery_pin",{p_order_id:orderId,p_pin:pin});
    message(result?.verified?"PIN verificado.":"PIN incorrecto.",result?.verified?"success":"error");
    await loadDriverOrders();
  }catch(e){
    message(e.message||"No se pudo verificar el PIN.","error");
  }
}

async function uploadDeliveryProofFile(orderId,kind,file){
  if(!(file instanceof File))throw new Error("Selecciona un archivo.");
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session?.access_token)throw new Error("Sesión no disponible.");
  const form=new FormData();
  form.append("order_id",orderId);
  form.append("kind",kind);
  form.append("file",file,file.name||"evidencia");
  const response=await fetch(SUPABASE_URL+"/functions/v1/delivery-proof-upload",{
    method:"POST",
    headers:{Authorization:"Bearer "+session.access_token,apikey:SUPABASE_KEY},
    body:form
  });
  let payload=null;
  try{payload=await response.json();}catch{}
  if(!response.ok||!payload?.ok)throw new Error(payload?.error||"No se pudo cargar la evidencia.");
  return payload;
}

async function uploadDriverProofPhoto(orderId){
  try{
    const file=$("proofPhoto-"+orderId)?.files?.[0];
    if(!file)throw new Error("Selecciona una foto.");
    await uploadDeliveryProofFile(orderId,"PHOTO",file);
    message("Foto de entrega cargada.");
    await loadDriverOrders();
  }catch(e){message(e.message||"No se pudo cargar la foto.","error");}
}

function clearDriverProofSignature(orderId){
  const canvas=document.querySelector('canvas[data-proof-signature-canvas="'+orderId+'"]');
  if(!canvas)return;
  canvas.getContext("2d")?.clearRect(0,0,canvas.width,canvas.height);
  canvas.dataset.dirty="";
}

async function uploadDriverProofSignature(orderId){
  try{
    const canvas=document.querySelector('canvas[data-proof-signature-canvas="'+orderId+'"]');
    if(!canvas||canvas.dataset.dirty!=="1")throw new Error("Solicita la firma del cliente antes de guardar.");
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
    if(!blob)throw new Error("No se pudo preparar la firma.");
    const file=new File([blob],"firma-"+orderId+".png",{type:"image/png"});
    await uploadDeliveryProofFile(orderId,"SIGNATURE",file);
    message("Firma de entrega registrada.");
    await loadDriverOrders();
  }catch(e){message(e.message||"No se pudo registrar la firma.","error");}
}

async function viewDeliveryProofMedia(orderId,kind){
  const popup=window.open("about:blank","_blank");
  try{
    const {data,error}=await supabaseClient.functions.invoke("delivery-proof-view",{body:{order_id:orderId,kind}});
    if(error)throw error;
    if(!data?.ok||!data?.signed_url)throw new Error(data?.error||"Evidencia no disponible.");
    if(popup){
      popup.opener=null;
      popup.location.href=data.signed_url;
    }else{
      window.open(data.signed_url,"_blank","noopener,noreferrer");
    }
  }catch(e){
    try{popup?.close();}catch{}
    message(e.message||"No se pudo abrir la evidencia.","error");
  }
}

function driverPickupStatusLabel(value){
  return {
    PENDING:"Pendiente",
    ARRIVED:"Llegué al LOCAL",
    PICKED_UP:"Recogido"
  }[value]||"Pendiente";
}

function renderDriverPickupList(order){
  const locals=Array.isArray(order?.locals)?order.locals:[];
  if(!locals.length)return '<div class="workspace-warning"><strong>Recogidas:</strong> HTPWEB todavía no cargó los LOCAL de este pedido.</div>';

  return '<div class="card" style="box-shadow:none;margin:12px 0">'+
    '<h3 style="margin-top:0">Recogidas</h3>'+
    locals.map(local=>{
      const pickup=local.pickup_status||"PENDING";
      const eta=local.estimated_ready_at
        ? orderControlTime(local.estimated_ready_at)
        : "Sin hora confirmada";
      const items=(local.items||[]).map(item=>{
        const detail=[item.variant_name,item.promotion_title?"Promoción: "+item.promotion_title:""].filter(Boolean).join(" · ");
        return '<li><strong>'+esc(item.quantity)+' × '+esc(item.product_name||"Producto")+'</strong>'+
          (detail?'<div class="muted">'+esc(detail)+'</div>':"")+'</li>';
      }).join("");
      let pickupAction="";
      if(order.assignment_status==="ACTIVE"&&["PREPARING","READY"].includes(order.status)){
        if(pickup==="PENDING"){
          pickupAction='<button class="btn-primary" type="button" data-driver-pickup-order="'+esc(order.order_id)+'" data-driver-pickup-local="'+esc(local.local_id)+'" data-driver-pickup-action="ARRIVED">Llegué al LOCAL</button>';
        }else if(pickup==="ARRIVED"){
          pickupAction='<button class="btn-primary" type="button" data-driver-pickup-order="'+esc(order.order_id)+'" data-driver-pickup-local="'+esc(local.local_id)+'" data-driver-pickup-action="PICKED_UP">Pedido recogido</button>';
        }
      }
      return '<div class="order-local" style="margin-top:10px">'+
        '<div class="row between"><div><strong>'+esc(local.name||"LOCAL")+'</strong><div class="muted">'+esc(local.address||"")+'</div></div>'+
        '<span class="badge">'+esc(driverPickupStatusLabel(pickup))+'</span></div>'+
        '<div class="muted" style="margin-top:6px">Listo aprox.: '+esc(eta)+' · Estado: '+esc(orderStatusLabel(local.status))+'</div>'+
        (items?'<ul class="order-control-items">'+items+'</ul>':'')+
        (pickupAction?'<div class="order-control-actions">'+pickupAction+'</div>':'')+
        '</div>';
    }).join("")+
    '</div>';
}

async function driverPickupAction(orderId,localId,action){
  try{
    await rpc("driver_set_local_pickup_status",{
      p_order_id:orderId,
      p_local_id:localId,
      p_action:action
    });
    message(action==="ARRIVED"?"Llegada al LOCAL registrada.":"Recogida confirmada.");
    await loadDriverOrders();
  }catch(e){
    message(e.message||"No se pudo actualizar la recogida.","error");
  }
}

function renderDriverOrders(){
  const box=$("driverOrdersList");if(!box)return;
  let items=Array.isArray(state.driverOrders)?[...state.driverOrders]:[];
  if(!items.length){
    box.innerHTML='<div class="muted">No tienes entregas asignadas.</div>';
    renderDriverRouteControls();
    return;
  }

  if(state.driverRoutePlan){
    items.sort((a,b)=>{
      const ar=driverRouteRank(a),br=driverRouteRank(b);
      if(ar!==br)return ar-br;
      return new Date(b.assigned_at||0)-new Date(a.assigned_at||0);
    });
  }

  const nextRouteOrderId=state.driverRoutePlan?.stops?.[0]?.order_id||null;
  box.innerHTML=items.map(o=>{
    let action="";
    let safetyAction="";
    let deviationAction="";
    const inCurrentPlan=state.driverRoutePlan?.delivery_id===o.delivery_id&&
      state.driverRoutePlan?.stops?.some(stop=>stop.order_id===o.order_id);

    if(o.assignment_status==="ACTIVE"&&o.status==="PREPARING"){
      action='<div class="workspace-note"><strong>Pedido asignado.</strong> El LOCAL todavía está preparando. Revisa la hora estimada y mantén HTPWEB abierto para iniciar la recogida en el momento indicado.</div>';
    }else if(o.assignment_status==="ACTIVE"&&o.status==="READY"){
      if(o.all_pickups_complete!==true){
        action='<div class="workspace-warning"><strong>Completa las recogidas</strong> antes de iniciar la entrega.</div>';
      }else if(inCurrentPlan&&nextRouteOrderId!==o.order_id){
        action='<button class="btn-muted" type="button" disabled>Según ruta: espera</button>';
      }else{
        action='<button class="btn-primary" type="button" data-driver-status="'+esc(o.order_id)+'" data-next="EN_ROUTE">'+
          (nextRouteOrderId===o.order_id?'Iniciar siguiente parada':'Iniciar entrega')+'</button>';
      }
    }else if(o.assignment_status==="ACTIVE"&&o.status==="EN_ROUTE"){
      const proofReady=!o.proof?.enabled||o.proof?.ready===true;
      action='<button class="btn-primary" type="button" data-driver-status="'+esc(o.order_id)+'" data-next="DELIVERED" '+(proofReady?'':'disabled')+'>Marcar entregado</button>';
      if(o.sos_enabled){
        const sosActive=o.sos&&["OPEN","ACKNOWLEDGED"].includes(o.sos.status);
        safetyAction=sosActive
          ? '<div class="workspace-warning" style="margin:10px 0"><strong>SOS '+esc(sosStatusLabel(o.sos.status))+'</strong> · la alerta de seguridad sigue activa.</div>'
          : '<div style="margin:10px 0"><button class="btn-danger" type="button" data-driver-sos="'+esc(o.order_id)+'" style="font-size:1.05rem;font-weight:700">SOS</button><div class="muted">Úsalo si necesitas alertar al DELIVERY durante esta entrega.</div></div>';
      }

      const deviationContext=driverDeviationContextFor(o.order_id);
      const deviationPlan=driverDeviationPlanFor(o.order_id);
      const deviationIncident=(routeDeviationState.driverSnapshot?.incidents||[])
        .find(i=>i.order_id===o.order_id&&["OPEN","ACKNOWLEDGED"].includes(i.status));
      if(deviationContext?.can_prepare){
        if(deviationIncident){
          deviationAction='<div class="workspace-warning" style="margin:10px 0"><strong>Desvío '+esc(sosStatusLabel(deviationIncident.status))+'</strong> · HTPWEB detectó una salida sostenida del corredor esperado.</div>';
        }else if(deviationPlan){
          const last=Number(deviationPlan.last_distance_m);
          deviationAction='<div class="workspace-note" style="margin:10px 0"><strong>Monitoreo de desvío activo</strong> · corredor ±'+esc(deviationPlan.threshold_m||300)+' m'+
            (Number.isFinite(last)?' · última distancia '+Math.round(last)+' m':'')+'</div>';
        }else{
          deviationAction='<div class="workspace-note" style="margin:10px 0"><strong>Monitoreo de desvío pendiente</strong> <button class="btn-muted" type="button" data-driver-deviation-plan="'+esc(o.order_id)+'" style="margin-left:8px">Preparar monitoreo</button></div>';
        }
      }
    }

    const routeMarker=nextRouteOrderId===o.order_id
      ? '<div class="workspace-note" style="margin:8px 0"><strong>Siguiente parada de la ruta optimizada</strong></div>'
      : '';
    const proofPanel=renderDriverProofPanel(o);
    const pickupPanel=renderDriverPickupList(o);

    return '<div class="card"><div class="row between"><div><strong>Pedido '+esc(o.order_id)+'</strong>'+
      '<div class="muted">'+esc(o.delivery_name||"DELIVERY")+' · asignado '+esc(new Date(o.assigned_at).toLocaleString("es-EC"))+'</div></div>'+
      '<span class="badge status-'+esc(o.status)+'">'+esc(orderStatusLabel(o.status))+'</span></div>'+routeMarker+
      '<p><strong>Cliente:</strong> '+esc(o.customer_name||"")+' · '+esc(o.customer_phone||"")+'</p>'+
      '<p><strong>Entrega:</strong> '+esc(o.delivery_address||"")+(o.address_reference?' · '+esc(o.address_reference):'')+'</p>'+
      '<p><strong>Total:</strong> &#36;'+Number(o.total||0).toFixed(2)+'</p>'+pickupPanel+safetyAction+deviationAction+proofPanel+action+'</div>';
  }).join("");

  box.querySelectorAll("[data-driver-pickup-action]").forEach(b=>b.onclick=()=>driverPickupAction(
    b.dataset.driverPickupOrder,
    b.dataset.driverPickupLocal,
    b.dataset.driverPickupAction
  ));
  box.querySelectorAll("[data-driver-status]").forEach(b=>b.onclick=()=>driverChangeStatus(b.dataset.driverStatus,b.dataset.next));
  box.querySelectorAll("[data-driver-sos]").forEach(b=>b.onclick=()=>triggerDriverSos(b.dataset.driverSos));
  box.querySelectorAll("[data-driver-deviation-plan]").forEach(b=>b.onclick=async()=>{
    const ok=await prepareDriverRouteDeviationPlan(b.dataset.driverDeviationPlan,{quiet:false});
    if(ok)renderDriverOrders();
  });
  box.querySelectorAll("[data-proof-pin]").forEach(b=>b.onclick=()=>verifyDriverProofPin(b.dataset.proofPin));
  box.querySelectorAll("[data-proof-photo]").forEach(b=>b.onclick=()=>uploadDriverProofPhoto(b.dataset.proofPhoto));
  box.querySelectorAll("[data-proof-view]").forEach(b=>b.onclick=()=>viewDeliveryProofMedia(b.dataset.proofView,b.dataset.proofKind));
  box.querySelectorAll("[data-proof-sign-clear]").forEach(b=>b.onclick=()=>clearDriverProofSignature(b.dataset.proofSignClear));
  box.querySelectorAll("[data-proof-sign-upload]").forEach(b=>b.onclick=()=>uploadDriverProofSignature(b.dataset.proofSignUpload));
  initDriverProofSignatureCanvases();
  updateDriverGpsShareUi();
  renderDriverSosNotice();
  renderDriverRouteDeviationNotice();
  renderDriverRouteControls();
}

function currentPositionOnce(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){
      reject(new Error("Este dispositivo no ofrece geolocalización."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos=>resolve({
        latitude:Number(pos.coords.latitude),
        longitude:Number(pos.coords.longitude),
        accuracy:Number.isFinite(Number(pos.coords.accuracy))?Number(pos.coords.accuracy):null,
        captured_at:new Date(pos.timestamp||Date.now()).toISOString()
      }),
      err=>reject(new Error(err?.message||"No se pudo obtener tu ubicación actual.")),
      {enableHighAccuracy:true,timeout:15000,maximumAge:5000}
    );
  });
}

async function optimizeDriverRoute(){
  const button=$("driverRouteOptimize");
  const deliveryId=$("driverRouteDelivery")?.value;
  if(!deliveryId){
    message("No hay un DELIVERY con pedidos activos para optimizar.","error");
    return;
  }

  const original=button?.textContent||"Optimizar ruta";
  if(button){button.disabled=true;button.textContent="Optimizando…";}

  try{
    const position=await currentPositionOnce();
    const {data,error}=await supabaseClient.functions.invoke("optimizar-ruta",{
      body:{
        delivery_id:deliveryId,
        origin_lat:position.latitude,
        origin_lng:position.longitude
      }
    });

    if(error){
      let detail=error.message||"No se pudo optimizar la ruta.";
      try{
        const payload=await error.context?.json?.();
        if(payload?.error)detail=payload.error;
      }catch{}
      throw new Error(detail);
    }
    if(!data?.ok||!Array.isArray(data.stops)){
      throw new Error(data?.error||"El optimizador no devolvió una ruta válida.");
    }

    state.driverRoutePlan=data;
    reconcileDriverRoutePlan();
    renderDriverOrders();
    message("Ruta optimizada. Sigue las paradas en el orden mostrado.");
  }catch(e){
    message(e.message||"No se pudo optimizar la ruta.","error");
  }finally{
    if(button){button.disabled=false;button.textContent=original;}
    renderDriverRouteControls();
  }
}

async function loadDriverOrders(){
  if(state.role!=="DELIVERY_DRIVER")return;
  try{
    const items=await rpc("driver_my_orders");
    state.driverOrders=Array.isArray(items)?items:[];
    reconcileDriverRoutePlan();
    await loadDriverRouteDeviationState();
    renderDriverOrders();
    updateDriverGpsShareUi();
    renderDriverSosNotice();
    renderDriverRouteDeviationNotice();
    await startDriverSosSubscription();
    await startDriverRouteDeviationSubscription();
  }catch(e){
    message(e.message||"No se pudieron cargar tus entregas.","error");
  }
}

async function driverChangeStatus(orderId,next){
  try{
    await rpc("driver_set_order_status",{
      p_order_id:orderId,
      p_new_status:next,
      p_note:null
    });
    message(next==="EN_ROUTE"?"Ruta iniciada.":"Entrega completada.");
    await loadDriverOrders();

    if(next==="EN_ROUTE"){
      const context=driverDeviationContextFor(orderId);
      if(context?.can_prepare&&!context.existing_plan&&!driverDeviationPlanFor(orderId)){
        const ok=await prepareDriverRouteDeviationPlan(orderId,{quiet:true});
        if(!ok){
          message("La entrega inició, pero no se pudo preparar el monitoreo de desvío. Puedes reintentarlo desde el pedido.","error");
        }else{
          renderDriverOrders();
        }
      }
    }
  }catch(e){
    message(e.message||"No se pudo actualizar la entrega.","error");
  }
}

window.addEventListener("beforeunload",()=>{
  stopDriverGpsSharing(true);
  void stopDeliverySosSubscription();
  void stopDriverSosSubscription();
  void stopDeliveryRouteDeviationSubscription();
  void stopDriverRouteDeviationSubscription();
});

const networkState={snapshot:null,referrals:[],customers:[],contacts:[],rules:[],groups:[],selectedGroupId:null,referralAnalytics:null,capabilities:{}};

function networkDeliveryId(){return $("networkDelivery")?.value||state.deliveries[0]?.id||null;}
function networkDayName(day){return ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"][Number(day)]||String(day);}

function networkModeOptions(selected){
  const caps=networkState.capabilities||{};
  const options=[
    ["OPEN","Abierta"]
  ];
  if(caps.private)options.push(["PRIVATE","Solo contactos/referidos"]);
  if(caps.approval)options.push(["APPROVAL_REQUIRED","Solo aprobados"]);
  return options.map(([value,label])=>
    '<option value="'+value+'" '+(selected===value?'selected':'')+'>'+label+'</option>'
  ).join("");
}

function renderNetworkRules(){
  const box=$("networkRules");if(!box)return;
  const rules=networkState.rules||[];
  if(!rules.length){
    box.innerHTML='<div class="muted" style="margin-top:10px">Sin reglas: aplica el modo predeterminado todo el tiempo.</div>';
    return;
  }
  box.innerHTML='<div class="table-wrap"><table><thead><tr><th>Día</th><th>Desde</th><th>Hasta</th><th>Modo</th><th></th></tr></thead><tbody>'+
    rules.map((r,i)=>'<tr><td><select data-net-day="'+i+'">'+
      [0,1,2,3,4,5,6].map(d=>'<option value="'+d+'" '+(Number(r.day_of_week)===d?'selected':'')+'>'+networkDayName(d)+'</option>').join("")+
      '</select></td><td><input type="time" data-net-start="'+i+'" value="'+esc(String(r.start_time||"18:00").slice(0,5))+
      '"></td><td><input type="time" data-net-end="'+i+'" value="'+esc(String(r.end_time||"06:00").slice(0,5))+
      '"></td><td><select data-net-mode="'+i+'">'+networkModeOptions(r.access_mode||"PRIVATE")+
      '</select></td><td><button class="btn-danger" type="button" data-net-remove="'+i+'">Quitar</button></td></tr>').join("")+
    '</tbody></table></div>';
  box.querySelectorAll("[data-net-remove]").forEach(b=>b.onclick=()=>{
    networkState.rules.splice(Number(b.dataset.netRemove),1);
    renderNetworkRules();
  });
}

function collectNetworkRules(){
  return (networkState.rules||[]).map((r,i)=>({
    day_of_week:Number(document.querySelector('[data-net-day="'+i+'"]')?.value??r.day_of_week),
    start_time:document.querySelector('[data-net-start="'+i+'"]')?.value||"18:00",
    end_time:document.querySelector('[data-net-end="'+i+'"]')?.value||"06:00",
    access_mode:document.querySelector('[data-net-mode="'+i+'"]')?.value||"PRIVATE",
    priority:100
  }));
}

function networkDeliveryRecord(){
  const id=networkDeliveryId();
  return state.deliveries.find(d=>d.id===id)||null;
}

function referralLinkFor(code){
  const url=new URL("../app/acceso.html",location.href);
  const delivery=networkDeliveryRecord();
  if(delivery?.slug)url.searchParams.set("delivery",delivery.slug);
  url.searchParams.set("ref",code);
  return url.toString();
}

async function copyReferralLink(code){
  try{
    await navigator.clipboard.writeText(referralLinkFor(code));
    message("Enlace de referido copiado.");
  }catch(e){
    message(e.message||"No se pudo copiar el enlace de referido.","error");
  }
}

function renderNetworkReferrals(){
  const box=$("networkReferrals");if(!box)return;
  const items=networkState.referrals||[];
  const caps=networkState.capabilities||{};
  box.innerHTML=items.length
    ? '<div class="table-wrap"><table><thead><tr><th>Código</th><th>Etiqueta</th><th>Estado</th><th>Vence</th><th>Acciones</th></tr></thead><tbody>'+
      items.map(r=>'<tr><td><strong>'+(caps.referralCodes?esc(r.code):"—")+'</strong></td><td>'+esc(r.label||"—")+
        '</td><td>'+(r.active?"Activo":"Inactivo")+'</td><td>'+esc(r.expires_at?new Date(r.expires_at).toLocaleDateString("es-EC"):"Sin vencimiento")+
        '</td><td><div class="row">'+
        (caps.referralLinks&&r.active?'<button class="btn-muted" type="button" data-ref-link="'+esc(r.code)+'">Copiar enlace</button>':"")+
        '<button class="'+(r.active?"btn-danger":"btn-muted")+'" type="button" data-ref-toggle="'+esc(r.id)+'" data-active="'+String(r.active)+'">'+
        (r.active?"Desactivar":"Activar")+'</button></div></td></tr>').join("")+
      '</tbody></table></div>'
    : '<div class="muted">Todavía no hay referidos configurados.</div>';

  box.querySelectorAll("[data-ref-link]").forEach(b=>b.onclick=()=>copyReferralLink(b.dataset.refLink));
  box.querySelectorAll("[data-ref-toggle]").forEach(b=>b.onclick=async()=>{
    try{
      await rpc("delivery_set_referral_code_active",{
        p_delivery_id:networkDeliveryId(),
        p_referral_id:b.dataset.refToggle,
        p_active:b.dataset.active!=="true"
      });
      await loadCustomerNetwork();
    }catch(e){message(e.message,"error");}
  });
}

function parseNetworkContacts(){
  const raw=$("networkContactsInput")?.value||"";
  const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!lines.length)throw new Error("Escribe al menos un contacto.");
  if(lines.length>500)throw new Error("Puedes importar máximo 500 contactos por lote.");

  return lines.map((line,index)=>{
    const parts=line.split(/[;,]/).map(x=>x.trim());
    let name=parts[0]||"";
    let phone=parts[1]||"";
    let email=parts[2]||"";

    if(parts.length===1){
      if(parts[0].includes("@")){email=parts[0];name="";}
      else {phone=parts[0];name="";}
    }else if(parts.length===2){
      if(parts[1].includes("@")){email=parts[1];phone="";}
    }

    if(!phone&&!email)throw new Error("Contacto "+(index+1)+": agrega teléfono o correo.");
    return {name:name||null,phone:phone||null,email:email||null};
  });
}

function renderNetworkContacts(){
  const box=$("networkContacts");if(!box)return;
  const items=networkState.contacts||[];
  const enabled=Boolean(networkState.capabilities?.contacts);
  box.innerHTML=items.length
    ? '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Contacto</th><th>Teléfono</th><th>Correo</th><th>Estado</th><th></th></tr></thead><tbody>'+
      items.map(x=>'<tr><td><strong>'+esc(x.name||"Contacto")+'</strong></td><td>'+esc(x.phone||"—")+'</td><td>'+esc(x.email||"—")+
        '</td><td>'+(x.active?"Activo":"Inactivo")+'</td><td><button class="'+(x.active?"btn-danger":"btn-muted")+
        '" type="button" data-contact-toggle="'+esc(x.id)+'" data-active="'+String(x.active)+'" '+(!enabled&&!x.active?'disabled':'')+'>'+
        (x.active?"Desactivar":"Activar")+'</button></td></tr>').join("")+
      '</tbody></table></div>'
    : '<div class="muted" style="margin-top:12px">Todavía no hay contactos importados.</div>';

  box.querySelectorAll("[data-contact-toggle]").forEach(b=>b.onclick=async()=>{
    try{
      await rpc("delivery_set_contact_active",{
        p_delivery_id:networkDeliveryId(),
        p_contact_id:b.dataset.contactToggle,
        p_active:b.dataset.active!=="true"
      });
      await loadCustomerNetwork();
    }catch(e){message(e.message,"error");}
  });
}

async function importNetworkContacts(){
  try{
    const contacts=parseNetworkContacts();
    const result=await rpc("delivery_import_contacts",{
      p_delivery_id:networkDeliveryId(),
      p_contacts:contacts
    });
    message("Contactos procesados: "+esc(result?.processed??contacts.length)+".");
    $("networkContactsInput").value="";
    await loadCustomerNetwork();
  }catch(e){message(e.message||"No se pudieron importar los contactos.","error");}
}

function renderNetworkCustomers(){
  const box=$("networkCustomers");if(!box)return;
  const items=networkState.customers||[];
  box.innerHTML=items.length
    ? '<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Origen</th><th>Pedidos</th><th>Aprobación</th><th></th></tr></thead><tbody>'+
      items.map(x=>'<tr><td><strong>'+esc(x.name||"Cliente")+'</strong><div class="muted">'+esc(x.phone||x.email||"")+
        '</div></td><td>'+esc(x.relationship_source||"—")+'</td><td>'+(x.allow_orders?"Permitidos":"Bloqueados")+
        '</td><td>'+(x.approved_at?"Aprobado":"Pendiente")+'</td><td><button class="'+(x.allow_orders?"btn-danger":"btn-primary")+
        '" type="button" data-customer-access="'+esc(x.customer_id)+'" data-allow="'+String(x.allow_orders)+'">'+
        (x.allow_orders?"Bloquear":"Aprobar")+'</button></td></tr>').join("")+
      '</tbody></table></div>'
    : '<div class="muted">Todavía no hay clientes vinculados.</div>';

  box.querySelectorAll("[data-customer-access]").forEach(b=>b.onclick=async()=>{
    try{
      await rpc("delivery_set_customer_order_access",{
        p_delivery_id:networkDeliveryId(),
        p_customer_id:b.dataset.customerAccess,
        p_allow_orders:b.dataset.allow!=="true"
      });
      await loadCustomerNetwork();
    }catch(e){message(e.message,"error");}
  });
}


function referralAnalyticsDateValue(date){
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
}

function ensureReferralAnalyticsDates(){
  const from=$("networkReferralAnalyticsFrom");
  const to=$("networkReferralAnalyticsTo");
  if(!from||!to)return;
  if(!to.value)to.value=referralAnalyticsDateValue(new Date());
  if(!from.value){
    const start=new Date();
    start.setDate(start.getDate()-29);
    from.value=referralAnalyticsDateValue(start);
  }
}

function referralAnalyticsRange(){
  ensureReferralAnalyticsDates();
  const fromValue=$("networkReferralAnalyticsFrom")?.value||"";
  const toValue=$("networkReferralAnalyticsTo")?.value||"";
  if(!fromValue||!toValue)throw new Error("Selecciona el rango de analítica.");
  const from=new Date(fromValue+"T00:00:00");
  const toInclusive=new Date(toValue+"T00:00:00");
  if(!Number.isFinite(from.getTime())||!Number.isFinite(toInclusive.getTime())){
    throw new Error("Rango de analítica inválido.");
  }
  if(from>toInclusive)throw new Error("La fecha Desde no puede ser posterior a Hasta.");
  const to=new Date(toInclusive);
  to.setDate(to.getDate()+1);
  return {from:from.toISOString(),to:to.toISOString()};
}

function referralAnalyticsMoney(value){
  return "$"+Number(value||0).toFixed(2);
}

function renderReferralAnalytics(){
  const notice=$("networkReferralAnalyticsNotice");
  const kpis=$("networkReferralAnalyticsKpis");
  const table=$("networkReferralAnalyticsTable");
  const refresh=$("networkReferralAnalyticsRefresh");
  const from=$("networkReferralAnalyticsFrom");
  const to=$("networkReferralAnalyticsTo");
  if(!notice||!kpis||!table)return;

  const enabled=networkState.capabilities?.referralAnalytics===true;
  if(refresh)refresh.disabled=!enabled;
  if(from)from.disabled=!enabled;
  if(to)to.disabled=!enabled;

  if(!enabled){
    notice.innerHTML='<strong>Analítica no incluida.</strong> El plan vigente no incluye Analítica de referidos.';
    kpis.innerHTML="";
    table.innerHTML="";
    return;
  }

  const data=networkState.referralAnalytics;
  if(!data){
    notice.textContent="Selecciona el rango y pulsa Actualizar.";
    kpis.innerHTML="";
    table.innerHTML="";
    return;
  }

  const s=data.summary||{};
  notice.innerHTML='<strong>Periodo:</strong> '+esc(new Date(data.from).toLocaleDateString("es-EC"))+
    ' → '+esc(new Date(new Date(data.to).getTime()-1).toLocaleDateString("es-EC"))+
    ' · La compra solo se atribuye después del primer referido válido.';

  const cards=[
    ["Códigos activos",s.codes_active||0],
    ["Referidos históricos",s.attributed_customers_total||0],
    ["Nuevos en periodo",s.new_referred_customers||0],
    ["Compradores en periodo",s.buyers_in_period||0],
    ["Pedidos entregados",s.delivered_orders_in_period||0],
    ["Facturación entregada",referralAnalyticsMoney(s.delivered_revenue)]
  ];
  kpis.innerHTML=cards.map(([label,value])=>
    '<div class="workspace-note"><div class="muted">'+esc(label)+'</div><strong style="font-size:1.35rem">'+esc(value)+'</strong></div>'
  ).join("");

  const codes=Array.isArray(data.codes)?data.codes:[];
  table.innerHTML=codes.length
    ? '<div class="table-wrap"><table><thead><tr><th>Referido</th><th>Atribuidos</th><th>Origen</th><th>Nuevos</th><th>Compradores</th><th>Pedidos</th><th>Entregados</th><th>Cancelados</th><th>Facturación</th><th>Ticket</th></tr></thead><tbody>'+
      codes.map(row=>'<tr><td><strong>'+esc(row.code||"—")+'</strong><div class="muted">'+esc(row.label||"Sin etiqueta")+
        '</div></td><td>'+esc(row.attributed_customers_total||0)+'</td><td>Código '+esc(row.code_customers_total||0)+' · Enlace '+esc(row.link_customers_total||0)+
        '</td><td>'+esc(row.new_referred_customers||0)+'</td><td>'+esc(row.buyers_in_period||0)+'</td><td>'+esc(row.orders_in_period||0)+
        '</td><td>'+esc(row.delivered_orders_in_period||0)+'</td><td>'+esc(row.cancelled_orders_in_period||0)+'</td><td>'+
        esc(referralAnalyticsMoney(row.delivered_revenue))+'</td><td>'+esc(referralAnalyticsMoney(row.average_delivered_ticket))+'</td></tr>'
      ).join("")+
      '</tbody></table></div>'
    : '<div class="muted">Todavía no hay códigos de referido para analizar.</div>';
}

async function loadReferralAnalytics({quiet=false}={}){
  ensureReferralAnalyticsDates();
  if(networkState.capabilities?.referralAnalytics!==true){
    networkState.referralAnalytics=null;
    renderReferralAnalytics();
    return;
  }

  const button=$("networkReferralAnalyticsRefresh");
  const original=button?.textContent||"Actualizar";
  if(button){button.disabled=true;button.textContent="Actualizando…";}
  try{
    const range=referralAnalyticsRange();
    const data=await rpc("delivery_referral_analytics_snapshot",{
      p_delivery_id:networkDeliveryId(),
      p_from:range.from,
      p_to:range.to
    });
    networkState.referralAnalytics=data||null;
    renderReferralAnalytics();
  }catch(e){
    networkState.referralAnalytics=null;
    renderReferralAnalytics();
    if(!quiet)message(e.message||"No se pudo cargar la analítica de referidos.","error");
    else if($("networkReferralAnalyticsNotice")){
      $("networkReferralAnalyticsNotice").innerHTML='<span class="workspace-warning">'+esc(e.message||"No se pudo cargar la analítica de referidos.")+'</span>';
    }
  }finally{
    if(button){button.textContent=original;button.disabled=networkState.capabilities?.referralAnalytics!==true;}
  }
}


function resetNetworkGroupForm(){
  networkState.selectedGroupId=null;
  if($("networkGroupId"))$("networkGroupId").value="";
  if($("networkGroupName"))$("networkGroupName").value="";
  if($("networkGroupDescription"))$("networkGroupDescription").value="";
  if($("networkGroupActive"))$("networkGroupActive").value="true";
  $("networkGroupMembersPanel")?.classList.add("hidden");
  renderNetworkGroups();
}

function selectedNetworkGroup(){
  return (networkState.groups||[]).find(g=>g.id===networkState.selectedGroupId)||null;
}

function renderNetworkGroups(){
  const box=$("networkGroups");if(!box)return;
  const enabled=Boolean(networkState.capabilities?.groups);
  const groups=Array.isArray(networkState.groups)?networkState.groups:[];

  if($("networkGroupNew"))$("networkGroupNew").disabled=!enabled;
  if($("networkGroupSave"))$("networkGroupSave").disabled=!enabled;
  if($("networkGroupName"))$("networkGroupName").disabled=!enabled;
  if($("networkGroupDescription"))$("networkGroupDescription").disabled=!enabled;
  if($("networkGroupActive"))$("networkGroupActive").disabled=!enabled;

  if(!enabled){
    box.innerHTML='<div class="workspace-warning">El plan vigente no incluye grupos de clientes.</div>';
    $("networkGroupMembersPanel")?.classList.add("hidden");
    return;
  }

  box.innerHTML=groups.length
    ? '<div class="table-wrap"><table><thead><tr><th>Grupo</th><th>Miembros</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+
      groups.map(g=>'<tr><td><strong>'+esc(g.name||"Grupo")+'</strong><div class="muted">'+esc(g.description||"")+
        '</div></td><td>'+esc(g.member_count||0)+'</td><td>'+(g.active?"Activo":"Inactivo")+
        '</td><td><div class="row" style="gap:6px;flex-wrap:wrap">'+
        '<button class="btn-muted" type="button" data-group-edit="'+esc(g.id)+'">Editar</button>'+
        '<button class="btn-muted" type="button" data-group-members="'+esc(g.id)+'">Miembros</button>'+
        '<button class="btn-danger" type="button" data-group-delete="'+esc(g.id)+'">Eliminar</button>'+
        '</div></td></tr>').join("")+
      '</tbody></table></div>'
    : '<div class="muted">Todavía no hay grupos de clientes.</div>';

  box.querySelectorAll("[data-group-edit]").forEach(b=>b.onclick=()=>{
    const g=groups.find(x=>x.id===b.dataset.groupEdit);if(!g)return;
    networkState.selectedGroupId=g.id;
    $("networkGroupId").value=g.id;
    $("networkGroupName").value=g.name||"";
    $("networkGroupDescription").value=g.description||"";
    $("networkGroupActive").value=String(g.active!==false);
    $("networkGroupMembersPanel")?.classList.add("hidden");
  });

  box.querySelectorAll("[data-group-members]").forEach(b=>b.onclick=()=>{
    const g=groups.find(x=>x.id===b.dataset.groupMembers);if(!g)return;
    networkState.selectedGroupId=g.id;
    renderNetworkGroupMembers();
  });

  box.querySelectorAll("[data-group-delete]").forEach(b=>b.onclick=async()=>{
    const g=groups.find(x=>x.id===b.dataset.groupDelete);if(!g)return;
    if(!confirm('Eliminar el grupo "'+(g.name||"")+'"? Los clientes no se eliminan.'))return;
    try{
      await rpc("delivery_delete_customer_group",{
        p_delivery_id:networkDeliveryId(),
        p_group_id:g.id
      });
      message("Grupo eliminado.");
      await loadCustomerNetwork();
    }catch(e){message(e.message||"No se pudo eliminar el grupo.","error");}
  });
}

function renderNetworkGroupMembers(){
  const panel=$("networkGroupMembersPanel");
  const box=$("networkGroupMembers");
  const title=$("networkGroupMembersTitle");
  if(!panel||!box||!title)return;

  const group=selectedNetworkGroup();
  if(!group||!networkState.capabilities?.groups){
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  title.textContent='Miembros de "'+(group.name||"Grupo")+'"';
  const selected=new Set(Array.isArray(group.customer_ids)?group.customer_ids:[]);
  const customers=Array.isArray(networkState.customers)?networkState.customers:[];

  box.innerHTML=customers.length
    ? '<div class="table-wrap"><table><thead><tr><th></th><th>Cliente</th><th>Origen</th><th>Pedidos</th></tr></thead><tbody>'+
      customers.map(customer=>'<tr><td><input type="checkbox" data-group-customer="'+esc(customer.customer_id)+'" '+(selected.has(customer.customer_id)?'checked':'')+'></td>'+
        '<td><strong>'+esc(customer.name||"Cliente")+'</strong><div class="muted">'+esc(customer.phone||customer.email||"")+'</div></td>'+
        '<td>'+esc(customer.relationship_source||"—")+'</td><td>'+(customer.allow_orders?"Permitidos":"Bloqueados")+'</td></tr>').join("")+
      '</tbody></table></div>'
    : '<div class="muted">Este DELIVERY todavía no tiene clientes vinculados.</div>';

  if($("networkGroupMembersSave"))$("networkGroupMembersSave").disabled=!customers.length;
}

async function saveNetworkGroup(){
  try{
    if(!networkState.capabilities?.groups)throw new Error("El plan vigente no incluye grupos de clientes.");
    const name=$("networkGroupName")?.value.trim()||"";
    if(!name)throw new Error("Escribe el nombre del grupo.");
    const result=await rpc("delivery_save_customer_group",{
      p_delivery_id:networkDeliveryId(),
      p_group_id:$("networkGroupId")?.value||null,
      p_name:name,
      p_description:$("networkGroupDescription")?.value.trim()||null,
      p_active:$("networkGroupActive")?.value==="true"
    });
    message("Grupo guardado.");
    await loadCustomerNetwork();
    if(result?.id){
      networkState.selectedGroupId=result.id;
      const g=(networkState.groups||[]).find(x=>x.id===result.id);
      if(g){
        $("networkGroupId").value=g.id;
        $("networkGroupName").value=g.name||"";
        $("networkGroupDescription").value=g.description||"";
        $("networkGroupActive").value=String(g.active!==false);
      }
    }
  }catch(e){message(e.message||"No se pudo guardar el grupo.","error");}
}

async function saveNetworkGroupMembers(){
  try{
    const group=selectedNetworkGroup();
    if(!group)throw new Error("Selecciona un grupo.");
    const ids=[...document.querySelectorAll("[data-group-customer]:checked")]
      .map(input=>input.dataset.groupCustomer)
      .filter(Boolean);
    const snapshot=await rpc("delivery_set_customer_group_members",{
      p_delivery_id:networkDeliveryId(),
      p_group_id:group.id,
      p_customer_ids:ids
    });
    networkState.groups=Array.isArray(snapshot?.groups)?snapshot.groups:[];
    networkState.selectedGroupId=group.id;
    renderNetworkGroups();
    renderNetworkGroupMembers();
    message("Miembros del grupo actualizados.");
  }catch(e){message(e.message||"No se pudieron guardar los miembros.","error");}
}

async function loadCustomerNetwork(){
  if(state.role!=="DELIVERY_ADMIN")return;
  const select=$("networkDelivery");if(!select)return;
  const previous=select.value;
  select.innerHTML=state.deliveries.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+'</option>').join("");
  if(previous&&state.deliveries.some(d=>d.id===previous))select.value=previous;
  const deliveryId=networkDeliveryId();if(!deliveryId)return;
  networkState.referralAnalytics=null;
  renderReferralAnalytics();

  try{
    const [snapshot,refs,customers,contacts,plan,groupsSnapshot]=await Promise.all([
      rpc("delivery_customer_access_snapshot",{p_delivery_id:deliveryId}),
      rpc("delivery_referral_codes_snapshot",{p_delivery_id:deliveryId}),
      rpc("delivery_customer_network_snapshot",{p_delivery_id:deliveryId}),
      rpc("delivery_contacts_snapshot",{p_delivery_id:deliveryId}),
      rpc("delivery_plan_snapshot",{p_delivery_id:deliveryId}),
      rpc("delivery_customer_groups_snapshot",{p_delivery_id:deliveryId})
    ]);

    const ent=plan?.current?.entitlements||{};
    const privateEnabled=ent["customers.private_network"]===true;
    const scheduleEnabled=ent["customers.access_schedule"]===true;
    const referralCodesEnabled=ent["referrals.codes"]===true;
    const referralLinksEnabled=ent["referrals.links"]===true;
    const contactsEnabled=ent["contacts.import"]===true;
    const approvalEnabled=ent["customers.approval"]===true;
    const groupsEnabled=ent["customers.groups"]===true&&groupsSnapshot?.available===true;
    const referralAnalyticsEnabled=ent["referrals.analytics"]===true;

    networkState.snapshot=snapshot||{};
    networkState.referrals=Array.isArray(refs)?refs:[];
    networkState.customers=Array.isArray(customers)?customers:[];
    networkState.contacts=Array.isArray(contacts)?contacts:[];
    networkState.groups=Array.isArray(groupsSnapshot?.groups)?groupsSnapshot.groups:[];
    if(networkState.selectedGroupId&&!networkState.groups.some(g=>g.id===networkState.selectedGroupId)){
      networkState.selectedGroupId=null;
    }
    networkState.rules=Array.isArray(snapshot?.rules)?snapshot.rules.map(r=>({...r})):[];
    networkState.capabilities={
      private:privateEnabled,
      schedule:scheduleEnabled,
      referralCodes:referralCodesEnabled,
      referralLinks:referralLinksEnabled,
      contacts:contactsEnabled,
      approval:approvalEnabled,
      groups:groupsEnabled,
      referralAnalytics:referralAnalyticsEnabled
    };

    $("networkDefaultMode").value=snapshot?.default_mode||"OPEN";
    const approvalOption=[...$("networkDefaultMode").options].find(o=>o.value==="APPROVAL_REQUIRED");
    if(approvalOption)approvalOption.disabled=!approvalEnabled;

    $("networkPlanNotice").innerHTML='<strong>Plan: '+esc(plan?.current?.plan_name||"Sin plan")+'</strong>'+
      ' · Red privada: '+(privateEnabled?"Sí":"No")+
      ' · Horarios: '+(scheduleEnabled?"Sí":"No")+
      ' · Contactos: '+(contactsEnabled?"Sí":"No")+
      ' · Códigos: '+(referralCodesEnabled?"Sí":"No")+
      ' · Enlaces: '+(referralLinksEnabled?"Sí":"No")+
      ' · Aprobación: '+(approvalEnabled?"Sí":"No")+
      ' · Grupos: '+(groupsEnabled?"Sí":"No")+
      ' · Analítica referidos: '+(referralAnalyticsEnabled?"Sí":"No");

    $("networkDefaultMode").disabled=!privateEnabled;
    $("networkSaveDefault").disabled=!privateEnabled;
    $("networkAddRule").disabled=!scheduleEnabled;
    $("networkSaveRules").disabled=!scheduleEnabled;
    $("networkCreateReferral").disabled=!(referralCodesEnabled||referralLinksEnabled);
    if($("networkImportContacts"))$("networkImportContacts").disabled=!contactsEnabled;
    if($("networkContactsInput"))$("networkContactsInput").disabled=!contactsEnabled;

    renderNetworkRules();
    renderNetworkReferrals();
    renderNetworkContacts();
    renderNetworkCustomers();
    renderNetworkGroups();
    if(networkState.selectedGroupId)renderNetworkGroupMembers();
    renderReferralAnalytics();
    await loadReferralAnalytics({quiet:true});
  }catch(e){message(e.message||"No se pudo cargar Clientes y referidos.","error");}
}

async function saveNetworkDefault(){
  try{
    await rpc("delivery_save_customer_access_settings",{
      p_delivery_id:networkDeliveryId(),
      p_default_mode:$("networkDefaultMode").value
    });
    message("Modo de clientes actualizado.");
    await loadCustomerNetwork();
  }catch(e){message(e.message,"error");}
}

async function saveNetworkRules(){
  try{
    await rpc("delivery_replace_customer_access_rules",{
      p_delivery_id:networkDeliveryId(),
      p_rules:collectNetworkRules()
    });
    message("Horarios de clientes actualizados.");
    await loadCustomerNetwork();
  }catch(e){message(e.message,"error");}
}

async function createNetworkReferral(){
  try{
    const label=prompt("Etiqueta opcional para este referido (ej. Clientes nocturnos):","")??"";
    const result=await rpc("delivery_create_referral_code",{
      p_delivery_id:networkDeliveryId(),
      p_label:label,
      p_expires_at:null
    });
    message("Referido creado: "+result.code);
    await loadCustomerNetwork();
  }catch(e){message(e.message,"error");}
}
const securityState={context:null,points:[],rules:[],map:null,plan:null};
function securityDeliveryId(){return $("securityDelivery")?.value||state.deliveries[0]?.id||null;}

function restrictedAreaLimitReached(){
  const used=Number(securityState.context?.used||0);
  const limit=securityState.context?.limit;
  return limit!==null&&limit!==undefined&&Number.isFinite(Number(limit))&&used>=Number(limit);
}

function restrictedAreaIsEditing(){
  return Boolean($("restrictedAreaId")?.value);
}

function updateRestrictedAreaLimitUi(){
  const context=securityState.context||{};
  const plan=securityState.plan?.current||{};
  const planName=plan.plan_name||"Sin plan";
  const used=Number(context.used||0);
  const limit=context.limit;
  const schedule=context.schedule_enabled===true;
  const reached=restrictedAreaLimitReached();
  const editing=restrictedAreaIsEditing();

  if($("securityPlanNotice")){
    $("securityPlanNotice").className=reached?"workspace-warning":"workspace-note";
    $("securityPlanNotice").innerHTML=reached
      ? '<strong>Plan: '+esc(planName)+'</strong> · Áreas activas: <strong>'+esc(used)+' / '+esc(limit)+'</strong> · <strong>Límite alcanzado</strong> · Por horario: '+(schedule?"Sí":"No")+
        '<div style="margin-top:6px">Ya utilizaste todas las áreas restringidas permitidas por tu plan. Puedes editar o desactivar una existente para liberar un cupo.</div>'
      : '<strong>Plan: '+esc(planName)+'</strong> · Áreas activas: '+esc(used)+' / '+esc(limit??0)+' · Disponibles: '+esc(Math.max(0,Number(limit||0)-used))+' · Por horario: '+(schedule?"Sí":"No");
  }

  const locked=reached&&!editing;
  $("restrictedAreaEditorBody")?.classList.toggle("hidden",locked);
  $("restrictedAreaLimitNotice")?.classList.toggle("hidden",!locked);

  if($("restrictedAreaEditorTitle")){
    $("restrictedAreaEditorTitle").textContent=editing?"Editar área restringida":"Nueva área restringida";
  }

  if(locked&&$("restrictedAreaLimitNotice")){
    $("restrictedAreaLimitNotice").innerHTML=
      '<strong>No puedes crear otra área restringida.</strong>'+
      '<div style="margin-top:6px">Tu plan '+esc(planName)+' permite '+esc(limit)+' áreas activas y ya tienes '+esc(used)+'. Edita o desactiva una de las áreas configuradas abajo para liberar un cupo.</div>';
  }

  if(!locked&&securityState.map){
    setTimeout(()=>securityState.map?.resize(),0);
  }
}
function renderRestrictedAreaMap(){
  if(!securityState.map)return;
  securityState.map.clear();
  const zoneId=$("restrictedAreaZone")?.value;
  const zone=securityState.context?.zones?.find(z=>z.id===zoneId);
  if(zone?.boundary)securityState.map.polygon(zone.boundary,"#2563eb");
  if(securityState.points.length>=3)securityState.map.polygon(securityState.points,"#dc2626");
  securityState.points.forEach((p,i)=>securityState.map.marker(p,(lat,lng)=>{securityState.points[i]=[lat,lng];renderRestrictedAreaMap();}));
  if($("restrictedAreaPointCount"))$("restrictedAreaPointCount").textContent=securityState.points.length+" puntos.";
}
function syncRestrictedAreaRulesFromDom(){
  securityState.rules=(securityState.rules||[]).map((r,i)=>({
    ...r,
    day_of_week:Number(document.querySelector('[data-sec-day="'+i+'"]')?.value??r.day_of_week??1),
    start_time:document.querySelector('[data-sec-start="'+i+'"]')?.value||String(r.start_time||"19:00").slice(0,5),
    end_time:document.querySelector('[data-sec-end="'+i+'"]')?.value||String(r.end_time||"06:00").slice(0,5)
  }));
  return securityState.rules;
}

function nextRestrictedAreaDay(){
  const used=new Set(syncRestrictedAreaRulesFromDom().map(r=>Number(r.day_of_week)));
  return [1,2,3,4,5,6,0].find(day=>!used.has(day))??null;
}

function addRestrictedAreaRule(){
  const rules=syncRestrictedAreaRulesFromDom();
  const day=nextRestrictedAreaDay();
  if(day===null){
    message("Ya tienes una regla para cada día de la semana.");
    return;
  }
  const source=rules[rules.length-1]||{start_time:"19:00",end_time:"06:00"};
  securityState.rules.push({
    day_of_week:day,
    start_time:String(source.start_time||"19:00").slice(0,5),
    end_time:String(source.end_time||"06:00").slice(0,5)
  });
  renderRestrictedAreaRules();
}

function copyRestrictedAreaRuleToAllDays(){
  const rules=syncRestrictedAreaRulesFromDom();
  if(!rules.length){
    message("Agrega una regla y define el horario que deseas copiar.","error");
    return;
  }
  const source=rules[0];
  const start=String(source.start_time||"19:00").slice(0,5);
  const end=String(source.end_time||"06:00").slice(0,5);
  securityState.rules=[1,2,3,4,5,6,0].map(day=>({
    day_of_week:day,
    start_time:start,
    end_time:end
  }));
  renderRestrictedAreaRules();
  message("Horario copiado de lunes a domingo.");
}

function renderRestrictedAreaRules(){
  const box=$("restrictedAreaRules");if(!box)return;
  const show=$("restrictedAreaMode")?.value==="SCHEDULE";$("restrictedAreaSchedule")?.classList.toggle("hidden",!show);
  if(!show)return;
  const rules=securityState.rules||[];
  box.innerHTML=rules.length?'<div class="table-wrap"><table><thead><tr><th>Día</th><th>Desde</th><th>Hasta</th><th></th></tr></thead><tbody>'+rules.map((r,i)=>'<tr><td><select data-sec-day="'+i+'">'+[0,1,2,3,4,5,6].map(d=>'<option value="'+d+'" '+(Number(r.day_of_week)===d?'selected':'')+'>'+networkDayName(d)+'</option>').join("")+'</select></td><td><input type="time" data-sec-start="'+i+'" value="'+esc(String(r.start_time||"19:00").slice(0,5))+'"></td><td><input type="time" data-sec-end="'+i+'" value="'+esc(String(r.end_time||"06:00").slice(0,5))+'"></td><td><button class="btn-danger" data-sec-remove="'+i+'" type="button">Quitar</button></td></tr>').join("")+'</tbody></table></div>':'<div class="muted">Agrega al menos una regla horaria.</div>';

  box.querySelectorAll("[data-sec-day],[data-sec-start],[data-sec-end]").forEach(control=>{
    const sync=()=>syncRestrictedAreaRulesFromDom();
    control.onchange=sync;
    if(control.matches("input"))control.oninput=sync;
  });

  box.querySelectorAll("[data-sec-remove]").forEach(b=>b.onclick=()=>{
    syncRestrictedAreaRulesFromDom();
    securityState.rules.splice(Number(b.dataset.secRemove),1);
    renderRestrictedAreaRules();
  });
}
function collectRestrictedRules(){return syncRestrictedAreaRulesFromDom().map(r=>({day_of_week:Number(r.day_of_week),start_time:String(r.start_time||"19:00").slice(0,5),end_time:String(r.end_time||"06:00").slice(0,5)}));}
function clearRestrictedArea(){
  if($("restrictedAreaId"))$("restrictedAreaId").value="";
  if($("restrictedAreaName"))$("restrictedAreaName").value="";
  if($("restrictedAreaReason"))$("restrictedAreaReason").value="";
  if($("restrictedAreaMode"))$("restrictedAreaMode").value="PERMANENT";
  if($("restrictedAreaActive"))$("restrictedAreaActive").value="true";
  securityState.points=[];
  securityState.rules=[];
  renderRestrictedAreaRules();
  renderRestrictedAreaMap();
  updateRestrictedAreaLimitUi();
}
function renderRestrictedAreasList(){
  const box=$("restrictedAreasList");if(!box)return;
  const items=securityState.context?.areas||[];
  box.innerHTML=items.length
    ? '<div class="table-wrap"><table><thead><tr><th>Área</th><th>Zona</th><th>Tipo</th><th>Estado</th><th></th></tr></thead><tbody>'+
      items.map(a=>'<tr><td><strong>'+esc(a.name)+'</strong><div class="muted">'+esc(a.reason||"")+'</div></td><td>'+esc((a.zone_code||"")+" "+(a.zone_name||""))+'</td><td>'+esc(a.restriction_mode==="SCHEDULE"?"Por horario":"Permanente")+'</td><td>'+(a.active?"Activa":"Inactiva")+'</td><td><button class="btn-muted" type="button" data-sec-edit="'+esc(a.id)+'">Editar</button></td></tr>').join("")+
      '</tbody></table></div>'
    : '<div class="muted">No hay áreas restringidas configuradas.</div>';

  box.querySelectorAll("[data-sec-edit]").forEach(b=>b.onclick=()=>{
    const a=items.find(x=>x.id===b.dataset.secEdit);
    if(!a)return;
    $("restrictedAreaId").value=a.id;
    $("restrictedAreaZone").value=a.zone_id;
    $("restrictedAreaName").value=a.name||"";
    $("restrictedAreaReason").value=a.reason||"";
    $("restrictedAreaMode").value=a.restriction_mode||"PERMANENT";
    $("restrictedAreaActive").value=String(a.active);
    securityState.points=JSON.parse(JSON.stringify(a.boundary||[]));
    securityState.rules=(a.rules||[]).map(r=>({...r}));
    updateRestrictedAreaLimitUi();
    renderRestrictedAreaRules();
    renderRestrictedAreaMap();
    if(securityState.points.length)securityState.map?.center(securityState.points[0],15);
    securityState.map?.resize();
    $("restrictedAreaEditorTitle")?.scrollIntoView({behavior:"smooth",block:"start"});
  });
}
async function loadRestrictedAreas(){
  if(state.role!=="DELIVERY_ADMIN")return;
  const sel=$("securityDelivery");
  if(!sel)return;
  const previous=sel.value;
  sel.innerHTML=state.deliveries.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+'</option>').join("");
  if(previous&&state.deliveries.some(d=>d.id===previous))sel.value=previous;
  const id=securityDeliveryId();
  if(!id)return;

  try{
    const [context,plan]=await Promise.all([
      rpc("delivery_restricted_area_context",{p_delivery_id:id}),
      rpc("delivery_plan_snapshot",{p_delivery_id:id})
    ]);
    securityState.context=context||{};
    securityState.plan=plan||null;

    $("restrictedAreaZone").innerHTML=(context?.zones||[])
      .map(z=>'<option value="'+esc(z.id)+'">'+esc(z.code+" "+z.name)+'</option>')
      .join("");

    const ent=plan?.current?.entitlements||{};
    const manage=ent["restricted_areas.manage"]===true;
    const schedule=ent["restricted_areas.schedule"]===true;

    $("restrictedAreaSave").disabled=!manage;
    $("restrictedAreaMode").disabled=!manage;
    if(!schedule&&$("restrictedAreaMode").value==="SCHEDULE")$("restrictedAreaMode").value="PERMANENT";

    renderRestrictedAreaRules();
    renderRestrictedAreasList();

    if(!securityState.map){
      securityState.map=await ZoneMaps.create("restrictedAreaMap",(lat,lng)=>{
        if(restrictedAreaLimitReached()&&!restrictedAreaIsEditing())return;
        securityState.points.push([lat,lng]);
        renderRestrictedAreaMap();
      });
    }

    updateRestrictedAreaLimitUi();
    securityState.map.resize();
    renderRestrictedAreaMap();
  }catch(e){
    message(e.message||"No se pudo cargar Seguridad.","error");
  }
}
async function saveRestrictedArea(){
  try{
    const deliveryId=securityDeliveryId();
    if(restrictedAreaLimitReached()&&!restrictedAreaIsEditing())throw new Error("Has alcanzado el límite de áreas restringidas de tu plan.");
    if(securityState.points.length<3)throw new Error("Dibuja al menos tres puntos.");const mode=$("restrictedAreaMode").value;const areaId=await rpc("delivery_save_restricted_area",{p_area_id:$("restrictedAreaId").value||null,p_delivery_id:deliveryId,p_zone_id:$("restrictedAreaZone").value,p_name:$("restrictedAreaName").value.trim(),p_reason:$("restrictedAreaReason").value.trim(),p_boundary:securityState.points,p_restriction_mode:mode,p_active:$("restrictedAreaActive").value==="true"});if(mode==="SCHEDULE")await rpc("delivery_replace_restricted_area_rules",{p_area_id:areaId,p_rules:collectRestrictedRules()});message("Área restringida guardada.");clearRestrictedArea();await loadRestrictedAreas();}catch(e){message(e.message||"No se pudo guardar el área restringida.","error");}
}
function bindEvents() {
  if ($("driversDelivery")) $("driversDelivery").onchange = () => { resetAdminDriverGps(); loadDriverWorkspace(); };
  if ($("quickDriverCreateBtn")) $("quickDriverCreateBtn").onclick = createQuickDriver;
  if ($("driverLookupBtn")) $("driverLookupBtn").onclick = lookupDriverCandidate;
  if ($("dispatchModeSave")) $("dispatchModeSave").onclick = saveDispatchMode;
  if ($("whatsappSettingsSave")) $("whatsappSettingsSave").onclick = saveWhatsappSettings;
  if ($("whatsappConnectionRequestBtn")) $("whatsappConnectionRequestBtn").onclick = requestWhatsappConnection;
  if ($("whatsappConnectionMode")) $("whatsappConnectionMode").onchange = () => {
    const mode=$("whatsappConnectionMode")?.value||"HTPWEB_MANAGED";
    const wrap=$("whatsappRequestedPhoneWrap");
    const help=$("whatsappConnectionHelp");
    if(wrap)wrap.classList.toggle("hidden",mode==="OWN");
    if(help){
      help.textContent=mode==="OWN"
        ?"WhatsApp propio: HTPWEB prepara la vinculación y el administrador del número autoriza Meta una sola vez."
        :"Administrado por HTPWEB: ingresa el número del DELIVERY. HTPWEB prepara y administra la conexión; Meta puede exigir una verificación del número.";
    }
  };
  if ($("deliveryProofSettingsSave")) $("deliveryProofSettingsSave").onclick = saveDeliveryProofSettings;
  if ($("deliverySosRefresh")) $("deliverySosRefresh").onclick = loadDeliverySosSnapshotOnly;
  if ($("deliveryDeviationRefresh")) $("deliveryDeviationRefresh").onclick = loadDeliveryRouteDeviationSnapshotOnly;
  if ($("driverOrdersRefresh")) $("driverOrdersRefresh").onclick = loadDriverOrders;
  if ($("driverRouteOptimize")) $("driverRouteOptimize").onclick = optimizeDriverRoute;
  if ($("driverRouteDelivery")) $("driverRouteDelivery").onchange = () => {
    if(state.driverRoutePlan&&state.driverRoutePlan.delivery_id!==$("driverRouteDelivery").value){
      state.driverRoutePlan=null;
      renderDriverOrders();
    }
  };
  if ($("driverGpsRefresh")) $("driverGpsRefresh").onclick = loadSelectedDriverGps;
  if ($("driverGpsStart")) $("driverGpsStart").onclick = startDriverGpsSharing;
  if ($("driverGpsStop")) $("driverGpsStop").onclick = () => stopDriverGpsSharing(false);
  if ($("myPlanDelivery")) $("myPlanDelivery").onchange = loadMyPlanSummary;
  if ($("securityDelivery")) $("securityDelivery").onchange = loadRestrictedAreas;
  if ($("restrictedAreaZone")) $("restrictedAreaZone").onchange = renderRestrictedAreaMap;
  if ($("restrictedAreaMode")) $("restrictedAreaMode").onchange = renderRestrictedAreaRules;
  if ($("restrictedAreaUndo")) $("restrictedAreaUndo").onclick = () => { securityState.points.pop(); renderRestrictedAreaMap(); };
  if ($("restrictedAreaClear")) $("restrictedAreaClear").onclick = () => { securityState.points=[]; renderRestrictedAreaMap(); };
  if ($("restrictedAreaAddRule")) $("restrictedAreaAddRule").onclick = addRestrictedAreaRule;
  if ($("restrictedAreaCopyAllDays")) $("restrictedAreaCopyAllDays").onclick = copyRestrictedAreaRuleToAllDays;
  if ($("restrictedAreaSave")) $("restrictedAreaSave").onclick = saveRestrictedArea;
  if ($("restrictedAreaNew")) $("restrictedAreaNew").onclick = clearRestrictedArea;
  if ($("networkDelivery")) $("networkDelivery").onchange = loadCustomerNetwork;
  if ($("networkSaveDefault")) $("networkSaveDefault").onclick = saveNetworkDefault;
  if ($("networkAddRule")) $("networkAddRule").onclick = () => { networkState.rules.push({day_of_week:1,start_time:"18:00",end_time:"06:00",access_mode:"PRIVATE",priority:100}); renderNetworkRules(); };
  if ($("networkSaveRules")) $("networkSaveRules").onclick = saveNetworkRules;
  if ($("networkCreateReferral")) $("networkCreateReferral").onclick = createNetworkReferral;
  if ($("networkReferralAnalyticsRefresh")) $("networkReferralAnalyticsRefresh").onclick = () => loadReferralAnalytics({quiet:false});
  if ($("networkImportContacts")) $("networkImportContacts").onclick = importNetworkContacts;
  if ($("networkGroupNew")) $("networkGroupNew").onclick = resetNetworkGroupForm;
  if ($("networkGroupSave")) $("networkGroupSave").onclick = saveNetworkGroup;
  if ($("networkGroupCancel")) $("networkGroupCancel").onclick = resetNetworkGroupForm;
  if ($("networkGroupMembersClose")) $("networkGroupMembersClose").onclick = () => $("networkGroupMembersPanel")?.classList.add("hidden");
  if ($("networkGroupMembersSave")) $("networkGroupMembersSave").onclick = saveNetworkGroupMembers;
  if ($("deliveryQrClose")) $("deliveryQrClose").onclick = closeMasterDeliveryQr;
  if ($("deliveryQrModal")) $("deliveryQrModal").onclick = event => {
    if (event.target === $("deliveryQrModal")) closeMasterDeliveryQr();
  };
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !$("deliveryQrModal")?.classList.contains("hidden")) {
      closeMasterDeliveryQr();
    }
  });
  $("logoutBtn").onclick = async () => {
    try {
      await cerrarSesion();
      location.href = "../app/acceso.html";
    } catch (e) {
      message(e.message || "No se pudo cerrar sesión.", "error");
    }
  };

  $("refreshBtn").onclick = refreshAll;
  if ($("orderScope")) $("orderScope").onchange = loadOrders;
  if ($("orderControlRefresh")) $("orderControlRefresh").onclick = () => loadOrders();
  if ($("orderControlLiveView")) $("orderControlLiveView").onclick = () => orderControlSetView("ACTIVE");
  if ($("orderControlHistoryView")) $("orderControlHistoryView").onclick = () => orderControlSetView("HISTORY");
  if ($("orderControlClearView")) $("orderControlClearView").onclick = orderControlClearView;
  if ($("orderControlFilter")) $("orderControlFilter").onchange = renderOrderControl;
  if ($("orderControlSearch")) $("orderControlSearch").oninput = renderOrderControlQueue;
  if ($("orderControlAutoRefresh")) $("orderControlAutoRefresh").onchange = () => {
    if($("orderControlAutoRefresh").checked) startOrderControlAutoRefresh();
    else stopOrderControlAutoRefresh();
  };
  if ($("analyticsScope")) $("analyticsScope").onchange = loadAnalytics;
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
  if ($("advertisementScope")) $("advertisementScope").onchange = loadAdvertisingTargets;
  if ($("advertisementDelivery")) $("advertisementDelivery").onchange = loadAdvertisingTargets;
  if ($("advertisementLocal")) $("advertisementLocal").onchange = loadAdvertisingProducts;
  if ($("advertisementInternal")) $("advertisementInternal").onchange = loadAdvertisingTargets;
  if ($("advertisingHtpwebPct")) $("advertisingHtpwebPct").oninput = syncAdvertisingSplitTotal;
  if ($("advertisingOriginPct")) $("advertisingOriginPct").oninput = syncAdvertisingSplitTotal;
  if ($("advertisingTrafficPct")) $("advertisingTrafficPct").oninput = syncAdvertisingSplitTotal;
  if ($("advertisingCarouselSpeed")) $("advertisingCarouselSpeed").oninput = () => {
    if ($("advertisingCarouselSpeedValue")) $("advertisingCarouselSpeedValue").textContent = $("advertisingCarouselSpeed").value;
  };
  if ($("saveAdvertisingSplitBtn")) $("saveAdvertisingSplitBtn").onclick = saveAdvertisingSplit;
  if ($("advertisingDeliverySelect")) $("advertisingDeliverySelect").onchange = loadAdvertisingDeliveryWorkspace;
  if ($("submitAdvertisingRequestBtn")) $("submitAdvertisingRequestBtn").onclick = submitAdvertisingRequest;
  if ($("saveAdvertisementBtn")) $("saveAdvertisementBtn").onclick = saveAdvertisement;
  if ($("clearAdvertisementBtn")) $("clearAdvertisementBtn").onclick = clearAdvertisementForm;
  if ($("previewAdvertisementBtn")) $("previewAdvertisementBtn").onclick = previewAdvertisementDestination;
  if ($("catalogLocal")) $("catalogLocal").onchange = loadCatalog;

  $("submitRequestBtn").onclick = submitRequest;
  if ($("requestType")) $("requestType").onchange = updateRequestForm;
  if ($("requestDelivery")) $("requestDelivery").onchange = updateRequestForm;
  if ($("profileDelivery")) $("profileDelivery").onchange = loadDeliveryProfileRecord;
  if ($("profileCopyPublicUrlBtn")) $("profileCopyPublicUrlBtn").onclick = async () => {
    const id=state.deliveryProfileRecord?.id;
    if(id) await copyMasterDeliveryPublicUrl(id);
  };
  if ($("profileOpenPublicUrlBtn")) $("profileOpenPublicUrlBtn").onclick = () => {
    const id=state.deliveryProfileRecord?.id;
    if(id) openMasterDeliveryPublicUrl(id);
  };
  if ($("profileQrBtn")) $("profileQrBtn").onclick = () => {
    const id=state.deliveryProfileRecord?.id;
    if(id) openMasterDeliveryQr(id);
  };
  document.querySelectorAll("#profileDeliveryThemePalette [data-theme-key]").forEach(button => {
    button.onclick = () => selectDeliveryTheme(button.dataset.themeKey);
  });
  $("saveDeliveryProfileBtn").onclick = saveDeliveryProfile;
  $("profileGoStorageBtn").onclick = openDeliveryStorage;
  if ($("shareDelivery")) $("shareDelivery").onchange = () => { state.shareCategoryFilter="ALL"; showShareBrowse(); loadShareLocals(); };
  if ($("shareSearch")) $("shareSearch").oninput = renderShareLocals;
  if ($("shareBackToLocalsBtn")) $("shareBackToLocalsBtn").onclick = showShareBrowse;
  if ($("profileLocal")) $("profileLocal").onchange = loadLocalProfileRecord;
  $("saveLocalProfileBtn").onclick = saveLocalProfile;
  $("profileLocalGoStorageBtn").onclick = openLocalStorage;
  $("profileLocalGoCatalogBtn").onclick = openLocalCatalog;
  $("profileLocalGoScheduleBtn").onclick = openLocalSchedules;
  if ($("saveLocalCommerceBtn")) $("saveLocalCommerceBtn").onclick = saveLocalCommerce;
  if ($("requestLocalDeliveryBtn")) $("requestLocalDeliveryBtn").onclick = requestLocalDelivery;
  if ($("localStorePreset")) $("localStorePreset").onchange = syncLocalPresetHelp;
  if ($("localStoreTheme")) $("localStoreTheme").onchange = () => {
    const o=$("localStoreTheme").selectedOptions?.[0];
    $("localStoreThemeHelp").textContent=o?.dataset?.help||"";
    if(o?.dataset?.primary)$("localStoreAccent").value=o.dataset.primary;
    renderLocalStorePreview();
  };
  ["localStoreAccent","localHeroTitle","localHeroSubtitle","localAboutTitle","localAboutText","localCatalogTitle","localContactTitle","localShowAbout","localShowCatalog","localShowContact","localShowPromotions"].forEach(id=>{
    if($(id))$(id).addEventListener(id.startsWith("localShow")?"change":"input",renderLocalStorePreview);
  });
  if ($("openLocalStoreBtn")) $("openLocalStoreBtn").onclick = () => {
    const url=localStoreUrl();
    if(url)window.open(url,"_blank","noopener");
  };
  if ($("copyLocalStoreBtn")) $("copyLocalStoreBtn").onclick = async () => {
    const url=localStoreUrl();
    if(!url)return message("Selecciona un LOCAL.","error");
    try{await navigator.clipboard.writeText(url);message("Link de la tienda copiado.");}
    catch{message("No se pudo copiar el link.","error");}
  };
  if ($("localStoreQrBtn")) $("localStoreQrBtn").onclick = showLocalStoreQr;
  if ($("marketingLocal")) $("marketingLocal").onchange = loadLocalMarketing;
  if ($("marketingSaveBtn")) $("marketingSaveBtn").onclick = saveLocalMarketing;
  if ($("marketingCopyLinkBtn")) $("marketingCopyLinkBtn").onclick = copyLocalMarketingLink;
  if ($("inventoryLocal")) $("inventoryLocal").onchange = loadLocalInventory;
  $("userManagerSearch").oninput = renderUserOptions;
  if ($("userManagerUser")) $("userManagerUser").onchange = renderManagedUser;
  $("assignDeliveryUserBtn").onclick = assignDeliveryUser;
  $("assignLocalUserBtn").onclick = assignLocalUser;
  if ($("feeDelivery")) $("feeDelivery").onchange = loadFeeDelivery;
  if ($("saveFeeScheduleBtn")) $("saveFeeScheduleBtn").onclick = saveFeeSchedule;
  if ($("saveFixedFeesBtn")) $("saveFixedFeesBtn").onclick = () => saveFixedFees().catch(e=>message(e.message||"No se pudo guardar la tarifa fija.","error"));
  if ($("activateFixedFeeBtn")) $("activateFixedFeeBtn").onclick = () => activateFeeMode("FIXED");
  if ($("addDistanceBandBtn")) $("addDistanceBandBtn").onclick = addFeeDistanceBand;
  if ($("saveDistanceBandsBtn")) $("saveDistanceBandsBtn").onclick = () => saveDistanceBands().catch(e=>message(e.message||"No se pudieron guardar los rangos.","error"));
  if ($("activateDistanceFeeBtn")) $("activateDistanceFeeBtn").onclick = () => activateFeeMode("DISTANCE");
  if ($("feeZoneSimpleTab")) $("feeZoneSimpleTab").onclick = () => setFeeZoneView("SIMPLE");
  if ($("feeZoneDetailedTab")) $("feeZoneDetailedTab").onclick = () => setFeeZoneView("DETAILED");
  if ($("saveZoneSimpleBtn")) $("saveZoneSimpleBtn").onclick = () => saveZoneSimple().catch(e=>message(e.message||"No se pudo guardar la tarifa por zonas.","error"));
  if ($("activateZoneSimpleBtn")) $("activateZoneSimpleBtn").onclick = () => activateFeeMode("ZONE");
  if ($("saveZoneDetailedBtn")) $("saveZoneDetailedBtn").onclick = () => saveZoneDetailed().catch(e=>message(e.message||"No se pudo guardar la matriz de zonas.","error"));
  if ($("activateZoneDetailedBtn")) $("activateZoneDetailedBtn").onclick = () => activateFeeMode("ZONE");
  if ($("coverageDelivery")) $("coverageDelivery").onchange = loadCoverageContext;
  if ($("coverageZoneSearch")) $("coverageZoneSearch").oninput = () => { renderCoverageZones(); renderCoverageMap(false); };
  if ($("coverageShowAllBtn")) $("coverageShowAllBtn").onclick = () => renderCoverageMap(true);
  if ($("coverageOnlyActiveBtn")) $("coverageOnlyActiveBtn").onclick = toggleCoverageOnlyActive;
  $("setDeliveryCityBtn").onclick = setCoverageDeliveryCity;
  $("saveZoneBtn").onclick = saveZone;
  $("clearZoneBtn").onclick = clearZoneForm;
  $("saveDeliveryBtn").onclick = saveDelivery;
  $("saveCategoryBtn").onclick = saveCategory;
  $("clearCategoryBtn").onclick = clearCategoryForm;
  $("saveProductBtn").onclick = saveProduct;
  $("clearProductBtn").onclick = clearProductForm;
  $("catalogDeleteProductImageBtn").onclick = deleteCatalogProductImage;
  if ($("variantProduct")) $("variantProduct").onchange = loadVariants;
  $("saveVariantBtn").onclick = saveVariant;
  $("clearVariantBtn").onclick = clearVariantForm;
  $("enableCatalogManagementBtn").onclick = enableCatalogManagement;
  if ($("scheduleLocal")) $("scheduleLocal").onchange = loadSchedules;
  $("saveSchedulesBtn").onclick = saveSchedules;
  $("enableScheduleManagementBtn").onclick = enableScheduleManagement;

  if ($("selectBrandingFolderBtn")) $("selectBrandingFolderBtn").onclick = () => {
    if (state.role !== "MASTER") return message("Operación exclusiva de MASTER.", "error");
    $("brandingFolderInput")?.click();
  };
  if ($("brandingFolderInput")) $("brandingFolderInput").onchange = event => importBrandingFolder(event.target.files);

  if ($("storageDelivery")) $("storageDelivery").onchange = refreshDeliveryMediaPreview;
  if ($("storageLocal")) $("storageLocal").onchange = async () => {
    await refreshLocalMediaPreview();
    await refreshLocalGallery();
    await loadStorageProducts();
  };
  if ($("storageProduct")) $("storageProduct").onchange = refreshProductMediaPreview;

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


let masterDeliveryWorkspaceBound=false;

function masterDeliveryWorkspaceSelectedId(){
  return document.getElementById("deliveryWorkspaceSelect")?.value || "";
}

function deliveryAuthorizationStatusLabel(item){
  if(item?.status==="CLAIMED"&&item?.active_access)return "Activo";
  if(item?.status==="PENDING")return "Pendiente";
  if(item?.status==="EXPIRED")return "Vencido";
  if(item?.status==="REVOKED")return "Revocado";
  return item?.status||"—";
}

function deliveryAuthorizationRoleLabel(role){
  return role==="DELIVERY_OPERATOR" ? "Operador" : "Administrador";
}

function deliveryAccountStatusLabel(item){
  if(item?.account_exists!==true)return "Sin cuenta HTPWEB";
  if(item?.account_disabled===true)return "Cuenta desactivada";
  if(item?.account_confirmed===true)return "Cuenta confirmada";
  return "Cuenta sin confirmar";
}

function renderMasterDeliveryAuthorizations(){
  const box=document.getElementById("deliveryWorkspaceAssignments");
  if(!box)return;
  const items=Array.isArray(state.deliveryAuthorizations)?state.deliveryAuthorizations:[];

  if(!items.length){
    box.innerHTML='<div class="muted">Este DELIVERY todavía no tiene representantes autorizados.</div>';
    return;
  }

  const seenAccounts=new Set();

  box.innerHTML=items.map(item=>{
    const status=deliveryAuthorizationStatusLabel(item);
    const expires=item.expires_at?new Date(item.expires_at).toLocaleString():"—";
    const claimed=item.claimed_at?new Date(item.claimed_at).toLocaleString():"";
    const canRevoke=item.status==="PENDING"||(item.status==="CLAIMED"&&item.active_access);
    const accountUserId=item.account_user_id||"";
    const accountExists=item.account_exists===true&&!!accountUserId;
    const accountDisabled=item.account_disabled===true;
    const accountKey=accountExists?accountUserId:"";
    const showAccountControls=accountExists&&!seenAccounts.has(accountKey);
    if(showAccountControls)seenAccounts.add(accountKey);

    const accountControls=showAccountControls
      ? '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">'+
        '<button class="btn-muted" type="button" data-dw-account-action="'+(accountDisabled?'enable':'disable')+'" data-dw-account-user="'+esc(accountUserId)+'" data-dw-account-authorization="'+esc(item.id)+'" data-dw-account-email="'+esc(item.email||"")+'">'+(accountDisabled?'Reactivar cuenta':'Desactivar cuenta')+'</button>'+
        '<button class="btn-danger" type="button" data-dw-account-action="delete" data-dw-account-user="'+esc(accountUserId)+'" data-dw-account-authorization="'+esc(item.id)+'" data-dw-account-email="'+esc(item.email||"")+'">Eliminar cuenta</button>'+
        '</div>'
      : '';

    return '<div class="card" style="margin:10px 0;padding:14px">'+
      '<div class="row between"><div>'+
      '<strong>'+esc(item.representative_name||"Representante")+'</strong>'+
      '<div>'+esc(item.email||"")+'</div>'+
      '<div class="muted">CI ••••••'+esc(item.national_id_last4||"")+
      ' · '+esc(deliveryAuthorizationRoleLabel(item.role_code))+
      (item.phone?' · '+esc(item.phone):'')+'</div>'+
      '</div><span class="badge">'+esc(status)+'</span></div>'+
      '<div class="muted" style="margin-top:8px">'+
      (item.status==="PENDING"?'Debe registrarse o iniciar sesión con este mismo correo y confirmar su email. Vence: '+esc(expires):
       item.status==="CLAIMED"&&item.active_access?'Acceso habilitado'+(claimed?' desde '+esc(claimed):''):
       item.status==="EXPIRED"?'La autorización venció sin ser utilizada.':
       item.status==="REVOKED"?'El acceso fue revocado.':'')+
      '</div>'+
      '<div class="workspace-note" style="margin-top:10px"><strong>Cuenta HTPWEB:</strong> '+esc(deliveryAccountStatusLabel(item))+
      (accountExists&&item.account_confirmed!==true?' · falta confirmar correo':'')+
      '</div>'+
      (canRevoke?'<button class="btn-danger" type="button" data-dw-revoke="'+esc(item.id)+'" style="margin-top:10px">Revocar acceso</button>':'')+
      accountControls+
      '</div>';
  }).join("");

  box.querySelectorAll("[data-dw-revoke]").forEach(btn=>{
    btn.onclick=()=>revokeMasterDeliveryAuthorization(btn.dataset.dwRevoke);
  });

  box.querySelectorAll("[data-dw-account-action]").forEach(btn=>{
    btn.onclick=()=>manageMasterDeliveryAccount(
      btn.dataset.dwAccountAction,
      btn.dataset.dwAccountUser,
      btn.dataset.dwAccountAuthorization,
      btn.dataset.dwAccountEmail
    );
  });
}

async function loadMasterDeliveryAuthorizations(){
  const deliveryId=masterDeliveryWorkspaceSelectedId();
  if(!deliveryId){
    state.deliveryAuthorizations=[];
    renderMasterDeliveryAuthorizations();
    return;
  }

  try{
    const data=await rpc("master_list_delivery_authorizations",{p_delivery_id:deliveryId});
    state.deliveryAuthorizations=Array.isArray(data)?data:[];
    renderMasterDeliveryAuthorizations();
  }catch(e){
    state.deliveryAuthorizations=[];
    const box=document.getElementById("deliveryWorkspaceAssignments");
    if(box)box.innerHTML='<div class="message error">'+esc(e.message||"No se pudieron cargar los accesos.")+'</div>';
  }
}

async function authorizeMasterDeliveryRepresentative(){
  try{
    const deliveryId=masterDeliveryWorkspaceSelectedId();
    if(!deliveryId)throw new Error("Selecciona un DELIVERY.");

    const name=document.getElementById("deliveryWorkspaceRepresentativeName")?.value.trim()||"";
    const nationalId=document.getElementById("deliveryWorkspaceRepresentativeId")?.value.trim()||"";
    const email=document.getElementById("deliveryWorkspaceRepresentativeEmail")?.value.trim()||"";
    const phone=document.getElementById("deliveryWorkspaceRepresentativePhone")?.value.trim()||"";
    const role=document.getElementById("deliveryWorkspaceRepresentativeRole")?.value||"DELIVERY_ADMIN";

    if(!name)throw new Error("Escribe el nombre del representante.");
    if(!/^[0-9]{10}$/.test(nationalId.replace(/\D/g,"")))throw new Error("La cédula debe contener 10 dígitos.");
    if(!email)throw new Error("Escribe el correo autorizado.");

    const result=await rpc("master_authorize_delivery_representative",{
      p_delivery_id:deliveryId,
      p_representative_name:name,
      p_national_id:nationalId,
      p_email:email,
      p_phone:phone||null,
      p_role_code:role
    });

    if(result?.status==="CLAIMED"){
      message("Acceso habilitado: ese correo ya tenía una cuenta HTPWEB confirmada. No se enviará otro correo; la persona puede iniciar sesión directamente.");
    }else{
      message("Correo autorizado. La persona debe registrarse o iniciar sesión con ese mismo correo.");
    }

    document.getElementById("deliveryWorkspaceRepresentativeId").value="";
    await Promise.all([
      loadMasterDeliveryAuthorizations(),
      typeof loadUsersModule==="function"?loadUsersModule():Promise.resolve()
    ]);
  }catch(e){
    message(e.message||"No se pudo autorizar al representante.","error");
  }
}

async function revokeMasterDeliveryAuthorization(authorizationId){
  if(!authorizationId)return;
  if(!confirm("¿Revocar este acceso al DELIVERY? Si ya estaba activo, perderá el acceso administrativo inmediatamente."))return;

  try{
    await rpc("master_revoke_delivery_authorization",{p_authorization_id:authorizationId});
    message("Acceso revocado.");
    await Promise.all([
      loadMasterDeliveryAuthorizations(),
      typeof loadUsersModule==="function"?loadUsersModule():Promise.resolve()
    ]);
  }catch(e){
    message(e.message||"No se pudo revocar el acceso.","error");
  }
}

async function invokeMasterDeliveryAccountAction(action,userId,authorizationId){
  const deliveryId=masterDeliveryWorkspaceSelectedId();
  if(!deliveryId)throw new Error("Selecciona un DELIVERY.");

  const {data,error}=await supabaseClient.functions.invoke("master-user-account",{
    body:{
      action,
      user_id:userId,
      delivery_id:deliveryId,
      authorization_id:authorizationId
    }
  });

  if(error){
    let detail=error.message||"No se pudo administrar la cuenta.";
    try{
      const payload=await error.context?.json?.();
      if(payload?.error)detail=payload.error;
    }catch{}
    throw new Error(detail);
  }

  if(!data?.ok)throw new Error(data?.error||"No se pudo administrar la cuenta.");
  return data;
}

async function manageMasterDeliveryAccount(action,userId,authorizationId,email){
  if(!action||!userId||!authorizationId)return;

  const label=email||"esta cuenta";
  let question="";
  if(action==="disable"){
    question="¿Desactivar la cuenta "+label+"? No podrá iniciar sesión hasta que MASTER la reactive.";
  }else if(action==="enable"){
    question="¿Reactivar la cuenta "+label+"?";
  }else if(action==="delete"){
    question="¿ELIMINAR definitivamente la cuenta "+label+"? El correo quedará libre para registrarse de nuevo. Los historiales protegidos no se borrarán: si existen, HTPWEB bloqueará esta acción.";
  }else{
    return;
  }

  if(!confirm(question))return;

  const buttons=[...document.querySelectorAll("[data-dw-account-user]")].filter(
    btn=>btn.dataset.dwAccountUser===userId
  );
  buttons.forEach(btn=>btn.disabled=true);

  try{
    await invokeMasterDeliveryAccountAction(action,userId,authorizationId);
    if(action==="delete")message("Cuenta eliminada. El correo ya puede registrarse nuevamente.");
    else if(action==="disable")message("Cuenta desactivada.");
    else message("Cuenta reactivada.");

    await Promise.all([
      loadMasterDeliveryAuthorizations(),
      typeof loadUsersModule==="function"?loadUsersModule():Promise.resolve()
    ]);
  }catch(e){
    message(e.message||"No se pudo administrar la cuenta.","error");
  }finally{
    buttons.forEach(btn=>btn.disabled=false);
  }
}

async function loadMasterDeliveryPlanSummary(){
  const deliveryId=masterDeliveryWorkspaceSelectedId();
  const box=document.getElementById("deliveryWorkspacePlanSummary");
  if(!box)return;
  if(!deliveryId){box.textContent="Selecciona un DELIVERY.";return;}
  try{
    const snapshot=await rpc("delivery_plan_snapshot",{p_delivery_id:deliveryId});
    const current=snapshot?.current;
    if(!current){box.innerHTML='<strong>Sin plan vigente</strong>'+(snapshot?.next?' · Próximo: '+esc(snapshot.next.plan_name):'');return;}
    box.innerHTML='<strong>'+esc(current.plan_name||current.plan_code||"Plan")+'</strong> · vence '+esc(formatServiceDate(current.ends_at))+(snapshot?.expiring_soon?' · <strong>vence en '+esc(snapshot.days_remaining)+' día(s)</strong>':'')+(snapshot?.next?' · Próximo: '+esc(snapshot.next.plan_name):'');
  }catch(e){box.textContent=e.message||"No se pudo consultar el plan.";}
}
function openMasterDeliveryWorkspaceTab(tab){
  ["base","access"].forEach(name=>{
    document.getElementById("deliveryWorkspacePane-"+name)?.classList.toggle("hidden",name!==tab);
  });
  document.querySelectorAll("[data-delivery-workspace-tab]").forEach(b=>{
    const selected=b.dataset.deliveryWorkspaceTab===tab;
    b.classList.toggle("active",selected);
    b.setAttribute("aria-selected",String(selected));
  });
}

async function syncMasterDeliveryWorkspace(){
  const id=masterDeliveryWorkspaceSelectedId();
  if(!id)return;
  for(const selectId of ["coverageDelivery","userManagerDelivery"]){
    const s=document.getElementById(selectId);
    if(s){
      s.value=[...s.options].some(o=>o.value===id)?id:"";
    }
  }

  await Promise.all([
    loadMasterDeliveryAuthorizations(),
    loadMasterDeliveryPlanSummary(),
    typeof loadCoverageContext==="function"?loadCoverageContext():Promise.resolve()
  ]);
}

function refreshMasterDeliveryWorkspaceSelector(preferred=""){
  const select=document.getElementById("deliveryWorkspaceSelect");
  if(!select)return;
  const previous=preferred||select.value;
  const list=(state.deliveries||[]);
  select.innerHTML=list.length
    ? list.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.name)+(d.active===false?' — Inactivo':'')+'</option>').join("")
    : '<option value="">No hay DELIVERY registrados</option>';
  if(previous&&list.some(d=>d.id===previous))select.value=previous;
}

function bindMasterDeliveryWorkspace(){
  if(masterDeliveryWorkspaceBound||state.role!=="MASTER")return;
  const section=document.getElementById("section-deliveries");
  if(!section)return;

  const original=[...section.children];
  const toolbar=document.createElement("div");
  toolbar.className="card workspace-title";
  toolbar.innerHTML='<div><h2>DELIVERY</h2><p>Ficha y representante autorizado. La capacidad de zonas proviene del plan y el DELIVERY_ADMIN selecciona cuáles operar.</p></div>'+
    '<div class="row"><select id="deliveryWorkspaceSelect" style="min-width:280px"></select>'+
    '<button class="btn-primary" id="deliveryWorkspaceNew" type="button">Crear delivery</button></div>'+
    '<div class="workspace-tabs" style="width:100%;margin-top:12px">'+
    '<button type="button" data-delivery-workspace-tab="base">Listado y ficha</button>'+
    '<button type="button" data-delivery-workspace-tab="access">Cuenta</button></div>';
  section.insertBefore(toolbar,section.firstChild);

  const base=document.createElement("div");
  base.id="deliveryWorkspacePane-base";
  section.insertBefore(base,toolbar.nextSibling);
  original.forEach(x=>base.appendChild(x));

  const access=document.createElement("div");
  access.id="deliveryWorkspacePane-access";
  access.className="hidden";
  access.innerHTML='<div class="card"><h3>Plan y suscripción</h3>'+
    '<p class="muted">La vigencia, capacidad y funciones provienen del plan comercial. No se configuran fechas ni prestaciones manualmente desde DELIVERY.</p>'+
    '<div id="deliveryWorkspacePlanSummary" class="workspace-note">Consultando plan…</div>'+
    '<a class="btn-primary" href="./monetizacion.html" style="display:inline-block;margin-top:12px;text-decoration:none">Abrir Planes y suscripciones</a></div>'+
    '<div class="card"><h3>Representante autorizado</h3>'+
    '<p class="muted">MASTER registra previamente a la persona. El acceso DELIVERY solo se activa cuando esa misma dirección de correo pertenece a una cuenta HTPWEB con el correo confirmado.</p>'+
    '<div class="form-grid">'+
    '<div><label>Nombre completo</label><input id="deliveryWorkspaceRepresentativeName" maxlength="180" placeholder="Nombre del representante"></div>'+
    '<div><label>Cédula</label><input id="deliveryWorkspaceRepresentativeId" inputmode="numeric" maxlength="10" placeholder="10 dígitos"></div>'+
    '<div><label>Correo autorizado</label><input id="deliveryWorkspaceRepresentativeEmail" type="email" maxlength="240" placeholder="correo@ejemplo.com"></div>'+
    '<div><label>Teléfono</label><input id="deliveryWorkspaceRepresentativePhone" type="tel" maxlength="40"></div>'+
    '<div><label>Tipo de acceso</label><select id="deliveryWorkspaceRepresentativeRole"><option value="DELIVERY_ADMIN">Administrador</option><option value="DELIVERY_OPERATOR">Operador</option></select></div>'+
    '</div>'+
    '<p class="muted" style="margin-top:10px">La cédula se usa como referencia administrativa y se almacena protegida; no funciona como contraseña.</p>'+
    '<button id="deliveryWorkspaceAuthorize" class="btn-primary" type="button" style="margin-top:12px">Autorizar acceso</button></div>'+
    '<div class="card"><h3>Accesos del DELIVERY</h3><div id="deliveryWorkspaceAssignments"></div></div>';
  section.appendChild(access);

  const usersSection=document.getElementById("section-users");
  if(usersSection){
    const legacyDeliveryCard=[...usersSection.children].find(node=>node.querySelector("h3")?.textContent.trim()==="Asignar a un DELIVERY");
    if(legacyDeliveryCard)legacyDeliveryCard.classList.add("hidden");
  }

  toolbar.querySelectorAll("[data-delivery-workspace-tab]").forEach(b=>b.onclick=()=>openMasterDeliveryWorkspaceTab(b.dataset.deliveryWorkspaceTab));
  document.getElementById("deliveryWorkspaceSelect").onchange=syncMasterDeliveryWorkspace;
  document.getElementById("deliveryWorkspaceAuthorize").onclick=authorizeMasterDeliveryRepresentative;
  document.getElementById("deliveryWorkspaceNew").onclick=()=>{
    if(document.getElementById("deliveryEditId"))document.getElementById("deliveryEditId").value="";
    for(const id of ["deliveryName","deliverySlug","deliveryDescription","deliveryPhone","deliveryWhatsapp"]){
      const input=document.getElementById(id);
      if(input)input.value="";
    }
    if(document.getElementById("deliveryActive"))document.getElementById("deliveryActive").value="true";
    if(document.getElementById("saveDeliveryBtn"))document.getElementById("saveDeliveryBtn").textContent="Crear delivery";
    openMasterDeliveryWorkspaceTab("base");
    document.getElementById("deliveryName")?.focus();
  };

  masterDeliveryWorkspaceBound=true;
  openMasterDeliveryWorkspaceTab("base");
}

async function loadDeliveryMasterWorkspace(){
  if(state.role!=="MASTER")return;
  bindMasterDeliveryWorkspace();
  await loadDeliveriesModule();
  await loadCoverage();
  refreshMasterDeliveryWorkspaceSelector();
  await syncMasterDeliveryWorkspace();
}

window.loadDeliveryMasterWorkspace=loadDeliveryMasterWorkspace;
window.refreshMasterDeliveryWorkspaceSelector=refreshMasterDeliveryWorkspaceSelector;