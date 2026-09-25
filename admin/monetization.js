const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const state={role:null,features:[],plans:[],deliveries:[],subscriptions:[]};

function msg(text,error=false){
  const box=$("message");
  box.textContent=text;
  box.className="message "+(error?"error":"success");
}

async function rpc(name,args={}){
  const {data,error}=await supabaseClient.rpc(name,args);
  if(error)throw error;
  return data;
}

function groupFeatures(){
  const groups=new Map();
  for(const f of state.features){
    if(!groups.has(f.family))groups.set(f.family,[]);
    groups.get(f.family).push(f);
  }
  return [...groups.entries()];
}

function renderFeatureCatalog(selected={}){
  $("featureCatalog").innerHTML=groupFeatures().map(([family,items])=>`
    <div class="card" style="margin:12px 0;padding:14px">
      <h4 style="margin:0 0 10px">${esc(family)}</h4>
      <div class="form-grid">
        ${items.map(f=>{
          const current=selected[f.code];
          if(f.type==="LIMIT"){
            return `<div>
              <label>${esc(f.label)} ${f.stage>1?'<span class="muted">· Etapa 2</span>':""}</label>
              <input data-feature-code="${esc(f.code)}" data-feature-type="LIMIT" type="number" min="0" step="1"
                value="${current===undefined?"":esc(current)}" placeholder="No incluido">
              <small class="muted">${esc(f.description||"")}${f.unit?" · "+esc(f.unit):""}</small>
            </div>`;
          }
          const checked=current===true?"checked":"";
          return `<label class="row" style="align-items:flex-start">
            <input data-feature-code="${esc(f.code)}" data-feature-type="CAPABILITY" type="checkbox" style="width:auto;margin-top:3px" ${checked}>
            <span><strong>${esc(f.label)}</strong>${f.stage>1?' <span class="muted">· Etapa 2</span>':""}<br><small class="muted">${esc(f.description||"")}</small></span>
          </label>`;
        }).join("")}
      </div>
    </div>
  `).join("");
}

function collectEntitlements(){
  const out=[];
  document.querySelectorAll("[data-feature-code]").forEach(el=>{
    const code=el.dataset.featureCode;
    const type=el.dataset.featureType;
    if(type==="CAPABILITY"){
      if(el.checked)out.push({type,code,value:true});
    }else{
      const raw=el.value.trim();
      if(raw!==""){
        const value=Number(raw);
        if(!Number.isFinite(value)||value<0)throw new Error("Límite inválido: "+code);
        out.push({type,code,value});
      }
    }
  });
  return out;
}

function selectedMap(plan){
  const map={};
  for(const e of plan?.entitlements||[])map[e.code]=e.value;
  return map;
}

function clearPlan(){
  $("planId").value="";
  $("code").value="";
  $("name").value="";
  $("description").value="";
  $("price").value="0";
  $("durationMonths").value="1";
  $("order").value="0";
  $("active").value="true";
  renderFeatureCatalog({});
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderPlans(){
  const box=$("plans");
  if(!state.plans.length){
    box.innerHTML='<p class="muted">Todavía no hay planes comerciales.</p>';
    return;
  }
  box.innerHTML=`<div class="plan-grid">${state.plans.map(p=>{
    const limits=(p.entitlements||[]).filter(e=>e.type==="LIMIT");
    const caps=(p.entitlements||[]).filter(e=>e.type==="CAPABILITY"&&e.value===true);
    return `<article class="plan-card">
      <div class="row between"><h3>${esc(p.name)}</h3><span class="badge">${p.active?"Activo":"Inactivo"}</span></div>
      <strong>$${Number(p.price||0).toFixed(2)} USD · ${esc(p.duration_months)} mes(es)</strong>
      <p>${esc(p.description||"")}</p>
      <p class="muted">${limits.map(e=>esc(e.label||e.code)+": "+esc(e.value)).join(" · ")||"Sin límites definidos"}</p>
      <p class="muted">${caps.length} funciones incluidas · versión ${esc(p.plan_version||1)}</p>
      <button class="btn-muted" data-edit-plan="${p.id}" type="button">Editar</button>
    </article>`;
  }).join("")}</div>`;
  box.querySelectorAll("[data-edit-plan]").forEach(btn=>btn.onclick=()=>editPlan(btn.dataset.editPlan));
}

function editPlan(id){
  const p=state.plans.find(x=>x.id===id);
  if(!p)return;
  $("planId").value=p.id;
  $("code").value=p.code||"";
  $("name").value=p.name||"";
  $("description").value=p.description||"";
  $("price").value=p.price??0;
  $("durationMonths").value=p.duration_months??1;
  $("order").value=p.display_order??0;
  $("active").value=String(p.active!==false);
  renderFeatureCatalog(selectedMap(p));
  window.scrollTo({top:0,behavior:"smooth"});
}

function formatDate(value){
  if(!value)return "—";
  const d=new Date(value);
  return Number.isNaN(d.valueOf())?String(value):d.toLocaleDateString("es-EC");
}

function renderSubscriptions(){
  const rows=(state.subscriptions||[]).map(item=>{
    const snap=item.snapshot||{};
    const current=snap.current||null;
    const next=snap.next||null;
    const days=snap.days_remaining;
    return {
      ...item,
      state:snap.state||"NOT_CONFIGURED",
      plan:current?.plan_name||"Sin plan",
      ends:current?.ends_at||null,
      days,
      next:next?.plan_name||null,
      nextStart:next?.starts_at||null,
      active:Boolean(snap.active)
    };
  }).sort((a,b)=>{
    const av=a.ends?new Date(a.ends).valueOf():Number.MAX_SAFE_INTEGER;
    const bv=b.ends?new Date(b.ends).valueOf():Number.MAX_SAFE_INTEGER;
    return av-bv;
  });

  $("subscriptions").innerHTML=rows.length?`
    <div class="table-wrap"><table>
      <thead><tr><th>DELIVERY</th><th>Plan actual</th><th>Vence</th><th>Estado</th><th>Siguiente</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td><strong>${esc(r.delivery_name)}</strong></td>
        <td>${esc(r.plan)}</td>
        <td>${esc(formatDate(r.ends))}${Number.isFinite(Number(r.days))?' · '+esc(r.days)+' día(s)':""}</td>
        <td>${r.state==="EXPIRING"?"🟡 Por vencer":r.active?"🟢 Activo":r.state==="SCHEDULED"?"🔵 Programado":"🔴 Sin vigencia"}</td>
        <td>${r.next?esc(r.next)+" · "+esc(formatDate(r.nextStart)):"—"}</td>
      </tr>`).join("")}</tbody>
    </table></div>`
    :'<p class="muted">No hay DELIVERY registrados.</p>';
}

function fillSelectors(){
  const deliveryOptions=state.deliveries.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join("");
  $("assignmentDelivery").innerHTML=deliveryOptions;
  $("overrideDelivery").innerHTML=deliveryOptions;
  $("assignmentPlan").innerHTML=state.plans.filter(p=>p.active).map(p=>
    `<option value="${p.id}">${esc(p.name)} · ${esc(p.duration_months)} mes(es) · $${Number(p.price||0).toFixed(2)}</option>`
  ).join("");
  $("overrideFeature").innerHTML=state.features.map(f=>
    `<option value="${esc(f.code)}" data-type="${esc(f.type)}">${esc(f.family)} · ${esc(f.label)}</option>`
  ).join("");
  updateAssignmentPreview();
}

function updateAssignmentPreview(){
  const delivery=state.deliveries.find(d=>d.id===$("assignmentDelivery").value);
  const plan=state.plans.find(p=>p.id===$("assignmentPlan").value);
  if(!delivery||!plan){
    $("assignmentPreview").textContent="Selecciona DELIVERY y plan.";
    return;
  }
  const sub=state.subscriptions.find(s=>s.delivery_id===delivery.id)?.snapshot;
  const current=sub?.current;
  $("assignmentPreview").innerHTML=
    '<strong>'+esc(delivery.name)+'</strong> · '+esc(plan.name)+' · '+esc(plan.duration_months)+' mes(es) · $'+Number(plan.price||0).toFixed(2)+
    (current?'<br>Plan actual: '+esc(current.plan_name)+' · vence '+esc(formatDate(current.ends_at)):'<br>Sin plan vigente.');
}

async function reload(){
  const [features,plans,subs,dRes]=await Promise.all([
    rpc("master_list_plan_feature_catalog"),
    rpc("master_list_commercial_plans"),
    rpc("master_list_delivery_subscriptions"),
    supabaseClient.from("deliveries").select("id,name,active").order("name")
  ]);
  if(dRes.error)throw dRes.error;
  state.features=Array.isArray(features)?features:[];
  state.plans=Array.isArray(plans)?plans:[];
  state.subscriptions=Array.isArray(subs)?subs:[];
  state.deliveries=(dRes.data||[]).filter(d=>d.active!==false);
  renderPlans();
  renderSubscriptions();
  fillSelectors();
  if(!$("featureCatalog").children.length)renderFeatureCatalog({});
}

async function savePlan(){
  try{
    const planId=$("planId").value||null;
    await rpc("master_save_commercial_plan",{
      p_plan_id:planId,
      p_code:$("code").value.trim(),
      p_name:$("name").value.trim(),
      p_description:$("description").value.trim(),
      p_price:Number($("price").value),
      p_duration_months:Number($("durationMonths").value),
      p_active:$("active").value==="true",
      p_display_order:Number($("order").value||0),
      p_entitlements:collectEntitlements()
    });
    msg(planId?"Plan actualizado. Los contratos existentes conservaron su snapshot.":"Plan creado.");
    clearPlan();
    await reload();
  }catch(e){msg(e.message||"No se pudo guardar el plan.",true)}
}

async function assignPlan(){
  try{
    const deliveryId=$("assignmentDelivery").value;
    const planId=$("assignmentPlan").value;
    if(!deliveryId||!planId)throw new Error("Selecciona DELIVERY y plan.");
    const result=await rpc("master_assign_commercial_plan",{
      p_delivery_id:deliveryId,
      p_plan_id:planId,
      p_effective_mode:$("effectiveMode").value
    });
    const label=result?.change_type==="DOWNGRADE"?"Downgrade programado/aplicado":result?.change_type==="UPGRADE"?"Upgrade aplicado":result?.change_type==="RENEW"?"Renovación registrada":"Plan activado";
    msg(label+". Vigencia: "+formatDate(result?.starts_at)+" → "+formatDate(result?.ends_at)+".");
    await reload();
  }catch(e){msg(e.message||"No se pudo asignar el plan.",true)}
}

async function saveOverride(){
  try{
    const option=$("overrideFeature").selectedOptions[0];
    const type=option?.dataset.type;
    const raw=$("overrideValue").value.trim();
    let value;
    if(type==="CAPABILITY"){
      if(!["true","false"].includes(raw.toLowerCase()))throw new Error("Para una función escribe true o false.");
      value=raw.toLowerCase()==="true";
    }else{
      value=Number(raw);
      if(!Number.isFinite(value)||value<0)throw new Error("Escribe un límite numérico válido.");
    }
    await rpc("master_set_plan_override",{
      p_delivery_id:$("overrideDelivery").value,
      p_local_id:null,
      p_entitlement_type:type,
      p_code:$("overrideFeature").value,
      p_value:value,
      p_reason:$("overrideReason").value.trim()
    });
    msg("Excepción MASTER guardada.");
  }catch(e){msg(e.message||"No se pudo guardar la excepción.",true)}
}

async function init(){
  const user=await obtenerUsuarioActual();
  if(!user){location.href="../app/acceso.html";return}
  state.role=await rpc("current_role_code");
  if(state.role!=="MASTER"){
    document.body.innerHTML='<main style="max-width:700px;margin:60px auto;font-family:Arial"><h1>Acceso exclusivo MASTER</h1><p>Este módulo administra el catálogo comercial de HTPWEB.</p><a href="./index.html">Volver</a></main>';
    return;
  }
  renderFeatureCatalog({});
  await reload();
}

$("savePlan").onclick=savePlan;
$("newPlan").onclick=clearPlan;
$("cancelPlan").onclick=clearPlan;
$("assignPlan").onclick=assignPlan;
$("saveOverride").onclick=saveOverride;
$("refreshSubscriptions").onclick=reload;
$("assignmentDelivery").onchange=updateAssignmentPreview;
$("assignmentPlan").onchange=updateAssignmentPreview;

init().catch(e=>msg(e.message||"No se pudo abrir Planes y Suscripciones.",true));