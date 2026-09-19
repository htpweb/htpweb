const $a = id => document.getElementById(id);
const escA = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
const analyticsState = { user:null, role:null, deliveries:[], locals:[] };

function analyticsDate(value, end=false) {
  if (!value) return null;
  return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}`).toISOString();
}

function analyticsLabel(key) {
  return String(key || "").replace(/_/g," ").replace(/\b\w/g, c => c.toUpperCase());
}

function analyticsNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat("es-EC", {maximumFractionDigits:2}).format(n) : escA(value);
}

function flattenAnalytics(value, prefix="") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const rows=[];
  for (const [key,val] of Object.entries(value)) {
    const name=prefix ? `${prefix} · ${analyticsLabel(key)}` : analyticsLabel(key);
    if (val !== null && typeof val === "object" && !Array.isArray(val)) rows.push(...flattenAnalytics(val,name));
    else rows.push({key:name,value:val});
  }
  return rows;
}

function renderAnalytics(result) {
  const flat=flattenAnalytics(result);
  const metrics=flat.filter(x => typeof x.value === "number").slice(0,8);
  $a("analyticsMetrics").innerHTML = metrics.length ? metrics.map(item => `<div class="card analytics-metric"><span class="muted">${escA(item.key)}</span><strong>${analyticsNumber(item.value)}</strong></div>`).join("") : '<div class="card muted">Todavía no hay métricas numéricas para este ámbito.</div>';

  const arrays=Object.entries(result || {}).filter(([,v]) => Array.isArray(v));
  $a("analyticsActivity").innerHTML = arrays.length ? arrays.map(([key,items]) => `<div class="analytics-block"><h3>${escA(analyticsLabel(key))}</h3>${items.length ? `<div class="analytics-table">${items.slice(0,20).map(item => `<div class="analytics-row">${typeof item === "object" ? Object.entries(item).map(([k,v]) => `<span><small>${escA(analyticsLabel(k))}</small><strong>${escA(v)}</strong></span>`).join("") : `<span>${escA(item)}</span>`}</div>`).join("")}</div>` : '<p class="muted">Sin datos.</p>'}</div>`).join("") : '<p class="muted">Sin series para mostrar.</p>';

  const details=flat.filter(x => typeof x.value !== "object" && !metrics.includes(x));
  $a("analyticsDetail").innerHTML = details.length ? `<div class="analytics-table">${details.map(item => `<div class="analytics-row"><span>${escA(item.key)}</span><strong>${item.value == null ? "—" : escA(item.value)}</strong></div>`).join("")}</div>` : '<p class="muted">Sin detalle adicional.</p>';
}

async function loadAnalyticsScopes() {
  const role=analyticsState.role;
  if (role === "MASTER") {
    const [d,l]=await Promise.all([
      supabaseClient.from("deliveries").select("id,name").order("name"),
      supabaseClient.from("locals").select("id,name").order("name")
    ]);
    if (d.error) throw d.error; if (l.error) throw l.error;
    analyticsState.deliveries=d.data||[]; analyticsState.locals=l.data||[];
    $a("analyticsScope").innerHTML='<option value="MASTER">Global HTPWEB</option>'+analyticsState.deliveries.map(x=>`<option value="DELIVERY:${x.id}">Delivery: ${escA(x.name)}</option>`).join("")+analyticsState.locals.map(x=>`<option value="LOCAL:${x.id}">Local: ${escA(x.name)}</option>`).join("");
  } else if (role === "DELIVERY_ADMIN") {
    const rel=await supabaseClient.from("user_deliveries").select("delivery_id,deliveries(id,name)").eq("user_id",analyticsState.user.id).eq("active",true);
    if (rel.error) throw rel.error;
    analyticsState.deliveries=(rel.data||[]).map(x=>x.deliveries).filter(Boolean);
    $a("analyticsScope").innerHTML=analyticsState.deliveries.map(x=>`<option value="DELIVERY:${x.id}">${escA(x.name)}</option>`).join("");
  } else if (role === "LOCAL_ADMIN") {
    const rel=await supabaseClient.from("user_locals").select("local_id,locals(id,name)").eq("user_id",analyticsState.user.id).eq("active",true);
    if (rel.error) throw rel.error;
    analyticsState.locals=(rel.data||[]).map(x=>x.locals).filter(Boolean);
    $a("analyticsScope").innerHTML=analyticsState.locals.map(x=>`<option value="LOCAL:${x.id}">${escA(x.name)}</option>`).join("");
  }
}

async function loadAnalyticsDashboard() {
  const scope=$a("analyticsScope").value;
  const p_from=analyticsDate($a("analyticsFrom").value,false);
  const p_to=analyticsDate($a("analyticsTo").value,true);
  let name,args;
  if (scope === "MASTER") { name="analytics_master_summary"; args={p_from,p_to}; }
  else if (scope.startsWith("DELIVERY:")) { name="analytics_delivery_summary"; args={p_delivery_id:scope.split(":")[1],p_from,p_to}; }
  else if (scope.startsWith("LOCAL:")) { name="analytics_local_summary"; args={p_local_id:scope.split(":")[1],p_from,p_to}; }
  else return renderAnalytics({});
  const {data,error}=await supabaseClient.rpc(name,args); if(error) throw error; renderAnalytics(data||{});
}

async function initAnalyticsDashboard() {
  try {
    analyticsState.user=await obtenerUsuarioActual();
    if(!analyticsState.user){ location.href="../app/acceso.html?return="+encodeURIComponent(location.pathname+location.search); return; }
    const {data:role,error}=await supabaseClient.rpc("current_role_code"); if(error) throw error;
    analyticsState.role=role;
    if(!["MASTER","DELIVERY_ADMIN","LOCAL_ADMIN"].includes(role)) throw new Error("Tu rol no tiene acceso a Analytics.");
    $a("analyticsRole").textContent=`Rol: ${role}`;
    await loadAnalyticsScopes();
    await loadAnalyticsDashboard();
  } catch(e) {
    $a("analyticsMessage").textContent=e.message||"No se pudo cargar Analytics."; $a("analyticsMessage").className="message error";
  }
}

$a("analyticsApply").onclick=()=>loadAnalyticsDashboard().catch(e=>{$a("analyticsMessage").textContent=e.message;$a("analyticsMessage").className="message error";});
$a("analyticsRefresh").onclick=()=>loadAnalyticsDashboard().catch(e=>{$a("analyticsMessage").textContent=e.message;$a("analyticsMessage").className="message error";});
$a("analyticsScope").onchange=()=>loadAnalyticsDashboard().catch(()=>{});
initAnalyticsDashboard();
