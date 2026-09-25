const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const state={role:null,plans:[],features:[],deliveries:[],subscriptions:[]};

function msg(t,e=false){const b=$("message");b.textContent=t;b.className="message "+(e?"error":"success");}
async function rpc(n,a={}){const {data,error}=await supabaseClient.rpc(n,a);if(error)throw error;return data;}
function fmtDate(v){if(!v)return "—";const d=new Date(v);return Number.isNaN(d.valueOf())?String(v):d.toLocaleDateString("es-EC",{year:"numeric",month:"2-digit",day:"2-digit"});}
function money(v){return Number(v||0).toFixed(2);}
function tab(name){document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));document.querySelectorAll(".monetization-tab").forEach(s=>s.classList.add("hidden"));$("tab-"+name)?.classList.remove("hidden");}

function groupedFeatures(){const groups=new Map();for(const f of state.features){if(!groups.has(f.family))groups.set(f.family,[]);groups.get(f.family).push(f);}return groups;}
function featureCurrentValue(code){const el=document.querySelector('[data-feature-code="'+CSS.escape(code)+'"]');if(!el)return null;if(el.dataset.type==="CAPABILITY")return Boolean(el.checked);const raw=el.value.trim();return raw===""?0:Number(raw);}

function renderFeatureBuilder(plan=null){
  const current=new Map((plan?.entitlements||[]).map(e=>[e.code,e.value]));
  let html="";
  for(const [family,items] of groupedFeatures()){
    html+='<div class="feature-family"><h4>'+esc(family)+'</h4><div class="feature-grid">';
    for(const f of items){
      const value=current.has(f.code)?current.get(f.code):(f.type==="CAPABILITY"?false:0);
      const stage=f.stage>1?'<span class="badge">Etapa '+esc(f.stage)+'</span>':'';
      if(f.type==="CAPABILITY"){
        html+='<label class="feature-option"><span><strong>'+esc(f.label)+'</strong> '+stage+'<small>'+esc(f.description||f.code)+'</small></span><input type="checkbox" data-feature-code="'+esc(f.code)+'" data-type="CAPABILITY" '+(value===true?"checked":"")+'></label>';
      }else{
        html+='<label class="feature-option"><span><strong>'+esc(f.label)+'</strong> '+stage+'<small>'+esc(f.description||f.code)+'</small></span><span class="feature-limit"><input type="number" min="0" step="1" value="'+Number(value||0)+'" data-feature-code="'+esc(f.code)+'" data-type="LIMIT"><em>'+esc(f.unit||"")+'</em></span></label>';
      }
    }
    html+='</div></div>';
  }
  $("featureBuilder").innerHTML=html;
  updateFeatureCount();
  $("featureBuilder").querySelectorAll("input").forEach(i=>i.addEventListener("input",updateFeatureCount));
}
function updateFeatureCount(){let count=0;document.querySelectorAll("[data-feature-code]").forEach(el=>{if(el.dataset.type==="CAPABILITY"?el.checked:Number(el.value)>0)count++;});$("featureCount").textContent=count+" prestaciones";}
function collectEntitlements(){return state.features.map(f=>{const value=featureCurrentValue(f.code);return{type:f.type,code:f.code,value:f.type==="CAPABILITY"?Boolean(value):Math.max(0,Number(value||0))};}).filter(x=>x.type==="CAPABILITY"?x.value===true:x.value>0);}

function clearPlan(){
  $("planId").value="";$("code").value="";$("name").value="";$("description").value="";$("price").value="0";$("currency").value="USD";$("durationMonths").value="1";$("order").value="0";$("active").value="true";renderFeatureBuilder();
}
function editPlan(id){
  const p=state.plans.find(x=>x.id===id);if(!p)return;
  $("planId").value=p.id;$("code").value=p.code;$("name").value=p.name;$("description").value=p.description||"";$("price").value=p.price;$("currency").value=p.currency||"USD";$("durationMonths").value=String(p.duration_months||1);
  if(![...$("durationMonths").options].some(o=>o.value===$("durationMonths").value)){$("durationMonths").insertAdjacentHTML("beforeend",'<option value="'+esc(p.duration_months)+'">'+esc(p.duration_months)+' meses</option>');$("durationMonths").value=String(p.duration_months);}
  $("order").value=p.display_order||0;$("active").value=String(p.active);renderFeatureBuilder(p);tab("catalog");scrollTo({top:0,behavior:"smooth"});
}
function planSummary(p){
  const limits=(p.entitlements||[]).filter(e=>e.type==="LIMIT"&&Number(e.value)>0);
  const caps=(p.entitlements||[]).filter(e=>e.type==="CAPABILITY"&&e.value===true);
  return '<article class="plan-card"><div class="row between"><h3>'+esc(p.name)+'</h3><span class="badge">'+(p.active?"Activo":"Inactivo")+'</span></div><strong>'+money(p.price)+' '+esc(p.currency||"USD")+' · '+esc(p.duration_months)+' mes(es)</strong><p>'+esc(p.description||"Sin descripción")+'</p><small>'+(limits.map(x=>esc(x.label||x.code)+": "+esc(x.value)+(x.unit?" "+esc(x.unit):"")).join(" · ")||"Sin límites configurados")+'</small><small>'+caps.length+' funciones habilitadas · versión '+esc(p.plan_version||1)+'</small><button data-edit-plan="'+esc(p.id)+'" class="btn-muted" type="button">Editar plan</button></article>';
}
function renderPlans(){
  $("plans").innerHTML=state.plans.length?'<div class="plan-grid">'+state.plans.map(planSummary).join("")+'</div>':'<p class="muted">Todavía no existen planes comerciales.</p>';
  document.querySelectorAll("[data-edit-plan]").forEach(b=>b.onclick=()=>editPlan(b.dataset.editPlan));
  $("assignmentPlan").innerHTML=state.plans.filter(p=>p.active).map(p=>'<option value="'+p.id+'">'+esc(p.name)+' · '+esc(p.duration_months)+' mes(es) · '+money(p.price)+' '+esc(p.currency||"USD")+'</option>').join("");
}
function renderDeliveryOptions(){const options=state.deliveries.map(d=>'<option value="'+d.id+'">'+esc(d.name)+'</option>').join("");$("assignmentDelivery").innerHTML=options;$("overrideDelivery").innerHTML=options;}
function selectedSubscription(){return state.subscriptions.find(x=>x.delivery_id===$("assignmentDelivery").value)||null;}

function entitlementsTable(entitlements){
  const entries=Object.entries(entitlements||{});if(!entries.length)return '<div class="muted">Sin prestaciones activas.</div>';
  return '<div class="table-wrap"><table><thead><tr><th>Prestación</th><th>Valor</th></tr></thead><tbody>'+entries.map(([code,value])=>{const f=state.features.find(x=>x.code===code);const shown=typeof value==="boolean"?(value?"Sí":"No"):String(value);return '<tr><td>'+esc(f?.label||code)+'</td><td>'+esc(shown)+(f?.unit&&typeof value!=="boolean"?" "+esc(f.unit):"")+'</td></tr>';}).join("")+'</tbody></table></div>';
}
function renderSubscriptionDetail(){
  const item=selectedSubscription(),box=$("subscriptionDetail");if(!item){box.innerHTML='<div class="muted">Selecciona un DELIVERY.</div>';return;}
  const s=item.snapshot||{},c=s.current,n=s.next;
  if(!c){box.innerHTML='<div class="message error">Este DELIVERY no tiene un plan vigente.</div>'+(n?'<p><strong>Plan programado:</strong> '+esc(n.plan_name)+' · inicia '+esc(fmtDate(n.starts_at))+'</p>':'');return;}
  box.innerHTML='<div class="subscription-kpis"><div><small>Plan</small><strong>'+esc(c.plan_name||c.plan_code||"—")+'</strong><small>Versión contratada '+esc(c.plan_version||"—")+'</small></div><div><small>Estado</small><strong>'+esc(s.state||"—")+'</strong></div><div><small>Inicio</small><strong>'+esc(fmtDate(c.starts_at))+'</strong></div><div><small>Vence</small><strong>'+esc(fmtDate(c.ends_at))+'</strong></div><div><small>Precio contratado</small><strong>'+money(c.price)+' '+esc(c.currency||"USD")+'</strong></div></div>'+(s.expiring_soon?'<div class="workspace-warning" style="margin-top:12px">Vence en '+esc(s.days_remaining)+' día(s). La plataforma mostrará un aviso interno al DELIVERY.</div>':'')+(c.selection_reset_required?'<div class="workspace-warning" style="margin-top:12px">Este cambio reduce capacidad. Al entrar en vigencia, el DELIVERY deberá volver a seleccionar sus recursos operativos.</div>':'')+(n?'<div class="workspace-note" style="margin-top:12px"><strong>Próximo plan:</strong> '+esc(n.plan_name)+' · '+esc(n.change_type||"CAMBIO")+' · inicia '+esc(fmtDate(n.starts_at))+'</div>':'')+'<h3 style="margin-top:18px">Prestaciones contratadas</h3>'+entitlementsTable(c.entitlements);
}
function renderAssignmentPreview(){
  const plan=state.plans.find(p=>p.id===$("assignmentPlan").value),current=selectedSubscription()?.snapshot?.current;if(!plan){$("assignmentPreview").textContent="Selecciona un plan.";return;}
  let text="Se contratarán "+plan.duration_months+" mes(es) por "+money(plan.price)+" "+(plan.currency||"USD")+".";if(current)text+=" Plan vigente: "+(current.plan_name||current.plan_code)+", vence "+fmtDate(current.ends_at)+".";text+=" HTPWEB aplicará alta/upgrade ahora y renovación/downgrade en el próximo ciclo.";$("assignmentPreview").textContent=text;
}
function renderExpirations(){
  const rows=state.subscriptions.map(item=>{const s=item.snapshot||{},c=s.current;return{name:item.delivery_name,state:s.state||"NOT_CONFIGURED",plan:c?.plan_name||"—",ends:c?.ends_at||null,days:s.days_remaining};}).sort((a,b)=>(a.ends?new Date(a.ends).valueOf():Number.MAX_SAFE_INTEGER)-(b.ends?new Date(b.ends).valueOf():Number.MAX_SAFE_INTEGER));
  $("expirations").innerHTML='<div class="table-wrap"><table><thead><tr><th>DELIVERY</th><th>Plan</th><th>Vencimiento</th><th>Estado</th><th>Días</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><strong>'+esc(r.name)+'</strong></td><td>'+esc(r.plan)+'</td><td>'+esc(fmtDate(r.ends))+'</td><td>'+esc(r.state)+'</td><td>'+esc(r.days??"—")+'</td></tr>').join("")+'</tbody></table></div>';
}
function renderOverrideFeatures(){$("overrideFeature").innerHTML=state.features.map(f=>'<option value="'+esc(f.code)+'" data-type="'+esc(f.type)+'">'+esc(f.family)+' · '+esc(f.label)+' ('+esc(f.type)+')</option>').join("");syncOverrideValue();}
function syncOverrideValue(){const o=$("overrideFeature").selectedOptions[0];if(!o)return;$("overrideValue").value=o.dataset.type==="CAPABILITY"?"true":"0";$("overrideValue").placeholder=o.dataset.type==="CAPABILITY"?"true / false":"Número";}

async function loadAll(){
  const user=await obtenerUsuarioActual();if(!user){location.href="../app/acceso.html";return;}
  state.role=await rpc("current_role_code");
  if(state.role!=="MASTER"){document.body.innerHTML='<main class="monetization-shell"><div class="card"><h1>Acceso exclusivo de MASTER</h1><a href="./index.html">Volver</a></div></main>';return;}
  const [features,plans,subscriptions,dRes]=await Promise.all([rpc("master_list_plan_feature_catalog"),rpc("master_list_commercial_plans"),rpc("master_list_delivery_subscriptions"),supabaseClient.from("deliveries").select("id,name,active").order("name")]);
  if(dRes.error)throw dRes.error;
  state.features=Array.isArray(features)?features:[];state.plans=Array.isArray(plans)?plans:[];state.subscriptions=Array.isArray(subscriptions)?subscriptions:[];state.deliveries=(dRes.data||[]).filter(d=>d.active!==false);
  renderPlans();renderDeliveryOptions();renderFeatureBuilder();renderOverrideFeatures();renderSubscriptionDetail();renderAssignmentPreview();renderExpirations();
}

document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
$("newPlan").onclick=clearPlan;
$("savePlan").onclick=async()=>{try{const currency=$("currency").value.trim().toUpperCase();if(!/^[A-Z]{3}$/.test(currency))throw new Error("La moneda debe tener 3 letras, por ejemplo USD.");const id=await rpc("master_save_commercial_plan",{p_plan_id:$("planId").value||null,p_code:$("code").value.trim(),p_name:$("name").value.trim(),p_description:$("description").value.trim(),p_price:Number($("price").value),p_currency:currency,p_duration_months:Number($("durationMonths").value),p_active:$("active").value==="true",p_display_order:Number($("order").value||0),p_entitlements:collectEntitlements()});msg("Plan comercial guardado.");await loadAll();editPlan(id);}catch(e){msg(e.message||"No se pudo guardar el plan.",true);}};
$("assignmentDelivery").onchange=()=>{renderSubscriptionDetail();renderAssignmentPreview();};
$("assignmentPlan").onchange=renderAssignmentPreview;
$("assignPlan").onclick=async()=>{try{const deliveryId=$("assignmentDelivery").value,planId=$("assignmentPlan").value;if(!deliveryId||!planId)throw new Error("Selecciona DELIVERY y plan.");const result=await rpc("master_assign_commercial_plan",{p_delivery_id:deliveryId,p_plan_id:planId,p_effective_mode:"AUTO"});msg("Plan aplicado: "+(result?.change_type||"OK")+" · vigencia "+(result?.effective_mode||"AUTO")+".");await loadAll();$("assignmentDelivery").value=deliveryId;renderSubscriptionDetail();renderAssignmentPreview();}catch(e){msg(e.message||"No se pudo asignar el plan.",true);}};
$("refreshExpirations").onclick=loadAll;
$("overrideFeature").onchange=syncOverrideValue;
$("overrideDelivery").onchange=async()=>{try{const id=$("overrideDelivery").value;$("overrideUsage").innerHTML=id?'<pre>'+esc(JSON.stringify(await rpc("plan_usage_snapshot",{p_delivery_id:id,p_local_id:null}),null,2))+'</pre>':"";}catch(e){msg(e.message,true);}};
$("saveOverride").onclick=async()=>{try{const o=$("overrideFeature").selectedOptions[0],type=o?.dataset.type;if(!type)throw new Error("Selecciona una prestación.");const raw=$("overrideValue").value.trim(),value=type==="CAPABILITY"?raw.toLowerCase()==="true":Number(raw);if(type==="LIMIT"&&(!Number.isFinite(value)||value<0))throw new Error("El límite debe ser un número no negativo.");await rpc("master_set_plan_override",{p_delivery_id:$("overrideDelivery").value,p_local_id:null,p_entitlement_type:type,p_code:$("overrideFeature").value,p_value:value,p_reason:$("overrideReason").value.trim()});msg("Excepción guardada.");$("overrideDelivery").dispatchEvent(new Event("change"));}catch(e){msg(e.message||"No se pudo guardar la excepción.",true);}};

loadAll().catch(e=>msg(e.message||"No se pudo abrir Planes y Suscripciones.",true));