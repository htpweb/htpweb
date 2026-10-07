(() => {
  let summary=null;
  let selectedPlan=null;

  const $l=id=>document.getElementById(id);
  const money=(value,currency="USD")=>{
    const n=Number(value||0);
    try{return new Intl.NumberFormat("es-EC",{style:"currency",currency,minimumFractionDigits:2}).format(n);}
    catch{return "$"+n.toFixed(2);}
  };
  const dateText=value=>{
    if(!value)return "—";
    try{return new Intl.DateTimeFormat("es-EC",{dateStyle:"medium"}).format(new Date(value));}
    catch{return String(value);}
  };
  const featureLabel=code=>{
    const map={
      "local.info.manage":"Ficha del negocio",
      "local.media.manage":"Fotos y galería",
      "categories.manage":"Categorías",
      "products.manage":"Catálogo de productos / servicios",
      "schedules.manage":"Horarios",
      "storefront.manage":"Sitio web del NEGOCIO",
      "whatsapp.orders":"Pedidos directos por WhatsApp",
      "promotions.manage":"Promociones",
      "delivery.partnerships":"Vinculación con DELIVERY",
      "delivery.multiple":"Múltiples DELIVERY",
      "inventory.manage":"Inventario",
      "analytics.view":"Estadísticas",
      "marketing.manage":"Marketing",
      "domain.custom.included":"Dominio propio",
      "storefront.visual_editor":"Editor visual tipo PowerPoint",
      "storefront.all_templates":"Todas las plantillas",
      "seo.advanced":"SEO avanzado",
      "max_products":"Productos / servicios"
    };
    return map[code]||code;
  };

  function localOptions(){
    return (state.locals||[]).map(l=>'<option value="'+esc(l.id)+'">'+esc(l.name)+'</option>').join("");
  }

  function currentNegocioId(){
    return $l("localPlanNegocio")?.value||state.locals?.[0]?.id||null;
  }

  function daysLeft(endsAt){
    if(!endsAt)return null;
    return Math.max(0,Math.ceil((new Date(endsAt).getTime()-Date.now())/86400000));
  }

  function renderCurrent(){
    const box=$l("localPlanCurrent");if(!box)return;
    const cur=summary?.current;
    if(!cur){
      box.innerHTML='<div class="local-plan-current-empty"><strong>No tienes un plan activo</strong><span>Elige uno de los planes disponibles para mantener tu NEGOCIO operativo.</span></div>';
      return;
    }
    const left=daysLeft(cur.ends_at||cur.trial_ends_at);
    const isTrial=String(cur.status||"").toUpperCase()==="TRIAL";
    box.innerHTML='<div class="local-plan-current">'+
      '<div><span class="local-plan-kicker">'+(isTrial?'PERIODO DE PRUEBA':'PLAN ACTUAL')+'</span><h3>'+esc(cur.name||cur.code||"Plan")+'</h3><p>'+esc(cur.description||"")+'</p></div>'+
      '<div class="local-plan-current-meta">'+
        '<div><small>Estado</small><strong>'+esc(cur.status||"—")+'</strong></div>'+
        '<div><small>Vence</small><strong>'+esc(dateText(cur.ends_at||cur.trial_ends_at))+'</strong></div>'+
        '<div><small>Días restantes</small><strong>'+esc(left===null?"—":left)+'</strong></div>'+
        '<div><small>Valor</small><strong>'+esc(isTrial?"Prueba":money(cur.price,cur.currency))+'</strong></div>'+
      '</div>'+
    '</div>';
  }

  function planFeatureItems(plan){
    const features=Array.isArray(plan.features)?plan.features:[];
    return features.filter(f=>{
      if(f.type==="CAPABILITY")return f.value===true;
      if(f.type==="LIMIT")return Number(f.value)>0;
      return false;
    }).map(f=>{
      if(f.type==="LIMIT"&&f.code==="max_products")return '<li><span>✓</span><strong>Hasta '+esc(f.value)+' productos / servicios</strong></li>';
      return '<li><span>✓</span>'+esc(f.label||featureLabel(f.code))+'</li>';
    }).join("");
  }

  function renderPlans(){
    const grid=$l("localPlanCards");if(!grid)return;
    const plans=Array.isArray(summary?.plans)?summary.plans:[];
    const currentCode=summary?.current?.code||"";
    grid.innerHTML=plans.map(plan=>{
      const premium=String(plan.code).toUpperCase()==="LOC_PRO";
      const current=currentCode===plan.code;
      return '<article class="local-plan-card '+(premium?'premium ':'')+(current?'current':'')+'">'+
        (premium?'<span class="local-plan-recommended">RECOMENDADO</span>':'')+
        '<div class="local-plan-card-head"><div><span class="local-plan-kicker">'+(premium?'CRECER':'EMPEZAR')+'</span><h3>'+esc(plan.name)+'</h3><p>'+esc(plan.description||"")+'</p></div>'+
        '<div class="local-plan-price"><strong>'+esc(money(plan.price,plan.currency))+'</strong><span>/ mes</span></div></div>'+
        '<ul>'+planFeatureItems(plan)+'</ul>'+
        '<button type="button" class="'+(premium?'btn-primary':'btn-muted')+'" data-local-plan-buy="'+esc(plan.id)+'" '+(current?'disabled':'')+'>'+(current?'Plan actual':'Elegir '+esc(plan.name))+'</button>'+
      '</article>';
    }).join("");
    grid.querySelectorAll("[data-local-plan-buy]").forEach(btn=>{
      btn.onclick=()=>{
        selectedPlan=plans.find(p=>p.id===btn.dataset.localPlanBuy)||null;
        openCheckout();
      };
    });
  }

  function renderPaymentSettings(){
    const settings=summary?.payment_settings||{};
    const cardState=$l("localCardProviderState");
    const transfer=$l("localTransferAccount");
    const cardBtn=$l("localPayCardBtn");
    const transferBtn=$l("localPayTransferBtn");
    const cardReady=!!settings.card_enabled;
    const transferReady=!!settings.transfer_enabled&&!!settings.bank_name&&!!settings.account_number;
    if(cardState){
      cardState.innerHTML=cardReady
        ? '<strong>PayPhone conectado</strong><br>El pago se procesa fuera de HTPWEB y la activación se confirma automáticamente.'
        : '<strong>PayPhone aún no está conectado.</strong><br>MASTER debe registrar las credenciales comerciales antes de aceptar tarjetas.';
    }
    if(cardBtn)cardBtn.disabled=!cardReady;
    if(transfer){
      transfer.innerHTML=transferReady
        ? '<strong>'+esc(settings.bank_name)+'</strong> · '+esc(settings.account_type||"Cuenta")+'<br>'+
          '<b>'+esc(settings.account_number)+'</b> · '+esc(settings.account_holder||"")+
          (settings.account_holder_id?'<br>ID/RUC: '+esc(settings.account_holder_id):'')
        : '<strong>Cuenta bancaria pendiente de configurar.</strong><br>Cuando MASTER registre la cuenta, aquí aparecerán automáticamente los datos de transferencia.';
    }
    if(transferBtn)transferBtn.disabled=!transferReady;
  }

  function renderPayments(){
    const box=$l("localPlanPayments");if(!box)return;
    const rows=Array.isArray(summary?.payments)?summary.payments:[];
    if(!rows.length){box.innerHTML='<div class="muted">Todavía no tienes pagos registrados.</div>';return;}
    const statusLabel={
      APPROVED:"Aprobado",AWAITING_TRANSFER:"Esperando transferencia",PENDING:"Pendiente",
      PROCESSING:"Procesando",REJECTED:"Rechazado",CANCELLED:"Cancelado",FAILED:"Fallido"
    };
    box.innerHTML='<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Plan</th><th>Método</th><th>Referencia</th><th>Valor</th><th>Estado</th></tr></thead><tbody>'+
      rows.map(r=>'<tr>'+
        '<td>'+esc(dateText(r.created_at))+'</td>'+
        '<td><strong>'+esc(r.plan_name||r.plan_code||"Plan")+'</strong></td>'+
        '<td>'+esc(r.method==="CARD"?"Tarjeta":"Transferencia")+'</td>'+
        '<td><code>'+esc(r.transfer_reference||r.client_reference||"—")+'</code></td>'+
        '<td>'+esc(money(r.amount,r.currency))+'</td>'+
        '<td><span class="badge local-pay-status-'+esc(String(r.status||"").toLowerCase())+'">'+esc(statusLabel[r.status]||r.status||"—")+'</span></td>'+
      '</tr>').join("")+'</tbody></table></div>';
  }

  function openCheckout(){
    if(!selectedPlan)return;
    const panel=$l("localPlanCheckout");
    panel?.classList.remove("hidden");
    if($l("localCheckoutTitle"))$l("localCheckoutTitle").textContent="Suscribirme a "+selectedPlan.name;
    if($l("localCheckoutSummary"))$l("localCheckoutSummary").textContent=money(selectedPlan.price,selectedPlan.currency)+" por "+(selectedPlan.duration_months||1)+" mes.";
    if($l("localPaymentResult")){$l("localPaymentResult").classList.add("hidden");$l("localPaymentResult").innerHTML="";}
    renderPaymentSettings();
    panel?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function createPayment(method){
    if(!selectedPlan)throw new Error("Selecciona un plan.");
    const localId=currentNegocioId();if(!localId)throw new Error("Selecciona un NEGOCIO.");
    return rpc("business_create_subscription_payment",{p_business_id:localId,p_plan_id:selectedPlan.id,p_method:method});
  }

  async function payTransfer(){
    try{
      const result=await createPayment("TRANSFER");
      const box=$l("localPaymentResult");
      box.classList.remove("hidden");
      box.innerHTML='<div class="local-transfer-result">'+
        '<div><span class="local-plan-kicker">TRANSFERENCIA GENERADA</span><h4>'+esc(result.plan_name)+'</h4>'+
        '<p>Transfiere <strong>'+esc(money(result.amount,result.currency))+'</strong> usando exactamente esta referencia:</p>'+
        '<div class="local-transfer-reference">'+esc(result.transfer_reference)+'</div></div>'+
        '<div><strong>'+esc(result.bank_name||"Banco")+'</strong><br>'+esc(result.account_type||"Cuenta")+' · '+esc(result.account_number||"")+
        '<br>'+esc(result.account_holder||"")+(result.account_holder_id?'<br>ID/RUC: '+esc(result.account_holder_id):'')+
        (result.transfer_instructions?'<p>'+esc(result.transfer_instructions)+'</p>':'')+'</div>'+
        '<div class="workspace-note">Después de transferir, conserva la referencia. El pago quedará pendiente hasta que HTPWEB confirme la acreditación.</div>'+
      '</div>';
      await loadSummary();
    }catch(e){message(e.message||"No se pudo generar la transferencia.","error");}
  }

  async function payCard(){
    try{
      const payment=await createPayment("CARD");
      const btn=$l("localPayCardBtn");if(btn)btn.disabled=true;
      message("Preparando pago seguro…");
      const {data,error}=await supabaseClient.functions.invoke("local-subscription-checkout",{body:{payment_id:payment.payment_id}});
      if(error)throw error;
      if(!data?.checkout_url)throw new Error(data?.message||"PayPhone todavía no está configurado.");
      window.location.href=data.checkout_url;
    }catch(e){message(e.message||"No se pudo iniciar el pago con tarjeta.","error");}
    finally{if($l("localPayCardBtn"))$l("localPayCardBtn").disabled=!(summary?.payment_settings?.card_enabled);}
  }

  async function loadSummary(){
    const id=currentNegocioId();if(!id)return;
    summary=await rpc("business_my_plan_summary",{p_business_id:id});
    renderCurrent();renderPlans();renderPaymentSettings();renderPayments();
  }

  async function load(){
    if(state.role!=="BUSINESS_ADMIN")return;
    const select=$l("localPlanNegocio");if(!select)return;
    const previous=select.value;
    select.innerHTML=localOptions()||'<option value="">No hay NEGOCIO asignados</option>';
    if(previous&&(state.locals||[]).some(l=>l.id===previous))select.value=previous;
    else if(state.locals?.[0]?.id)select.value=state.locals[0].id;
    try{await loadSummary();}
    catch(e){message(e.message||"No se pudo cargar Mi Plan.","error");}
  }

  function bind(){
    const select=$l("localPlanNegocio");
    if(select&&!select.dataset.bound){select.dataset.bound="1";select.onchange=loadSummary;}
    const refresh=$l("localPlanRefresh");
    if(refresh&&!refresh.dataset.bound){refresh.dataset.bound="1";refresh.onclick=loadSummary;}
    const close=$l("localCheckoutClose");
    if(close&&!close.dataset.bound){close.dataset.bound="1";close.onclick=()=>{$l("localPlanCheckout")?.classList.add("hidden");selectedPlan=null;};}
    const card=$l("localPayCardBtn");
    if(card&&!card.dataset.bound){card.dataset.bound="1";card.onclick=payCard;}
    const transfer=$l("localPayTransferBtn");
    if(transfer&&!transfer.dataset.bound){transfer.dataset.bound="1";transfer.onclick=payTransfer;}
  }

  bind();
  window.loadNegocioSubscriptionPlan=async()=>{bind();await load();};
})();