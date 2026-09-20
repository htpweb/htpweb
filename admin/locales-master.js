const masterLocalsState={items:[],bound:false};

function masterLocalMessage(text,type="success"){ message(text,type); }

function masterLocalSelected(){
  return masterLocalsState.items.find(item=>item.id===$("masterLocalSelect")?.value)||null;
}

function masterLocalDeliveryOptions(selected=[]){
  const chosen=new Set((selected||[]).map(String));
  return state.deliveries.map(d=>`<option value="${d.id}" ${chosen.has(String(d.id))?"selected":""}>${esc(d.name)}${d.active?"":" (inactivo)"}</option>`).join("");
}

function clearMasterLocalForm(){
  $("masterLocalId").value="";
  ["masterLocalName","masterLocalSlug","masterLocalDescription","masterLocalAddress","masterLocalPhone","masterLocalWhatsapp","masterLocalLatitude","masterLocalLongitude"].forEach(id=>$(id).value="");
  $("masterLocalActive").checked=false;
  $("masterLocalDeliveries").innerHTML=masterLocalDeliveryOptions([]);
  $("masterLocalDeleteBtn").disabled=true;
  $("masterLocalToggleBtn").disabled=true;
  $("masterLocalToggleBtn").textContent="Inactivar";
}

function fillMasterLocalForm(local){
  if(!local){clearMasterLocalForm();return;}
  $("masterLocalId").value=local.id;
  $("masterLocalName").value=local.name||"";
  $("masterLocalSlug").value=local.slug||"";
  $("masterLocalDescription").value=local.description||"";
  $("masterLocalAddress").value=local.address||"";
  $("masterLocalPhone").value=local.phone||"";
  $("masterLocalWhatsapp").value=local.whatsapp||"";
  $("masterLocalLatitude").value=local.latitude??"";
  $("masterLocalLongitude").value=local.longitude??"";
  $("masterLocalActive").checked=Boolean(local.active);
  $("masterLocalDeliveries").innerHTML=masterLocalDeliveryOptions(local.delivery_ids||[]);
  $("masterLocalDeleteBtn").disabled=false;
  $("masterLocalToggleBtn").disabled=false;
  $("masterLocalToggleBtn").textContent=local.active?"Inactivar":"Activar";
}

function renderMasterLocalList(){
  const select=$("masterLocalSelect");
  select.innerHTML='<option value="">Nuevo LOCAL</option>'+masterLocalsState.items.map(l=>
    `<option value="${l.id}">${esc(l.name)} — ${l.active?"Activo":"Inactivo"}</option>`
  ).join("");
  $("masterLocalsSummary").innerHTML=masterLocalsState.items.length
    ? masterLocalsState.items.map(l=>`<div class="card"><div class="row between"><div><strong>${esc(l.name)}</strong><div class="muted">${esc(l.address||"Sin dirección")} · ${(l.delivery_ids||[]).length} DELIVERY vinculados</div></div><span class="badge status-${l.active?"APPROVED":"REJECTED"}">${l.active?"ACTIVO":"INACTIVO"}</span></div></div>`).join("")
    : '<div class="muted">No hay LOCAL registrados.</div>';
}

async function loadMasterLocals(){
  if(state.role!=="MASTER"||!$("masterLocalSelect"))return;
  try{
    masterLocalsState.items=await rpc("master_list_locals")||[];
    renderMasterLocalList();
    const current=masterLocalSelected();
    if(current)fillMasterLocalForm(current); else clearMasterLocalForm();
  }catch(e){masterLocalMessage(e.message||"No se pudieron cargar los LOCAL.","error");}
}

function nullableNumber(id){
  const raw=$(id).value.trim();
  if(raw==="")return null;
  const value=Number(raw);
  if(!Number.isFinite(value))throw new Error("Coordenada inválida.");
  return value;
}

async function saveMasterLocal(){
  try{
    const deliveryIds=Array.from($("masterLocalDeliveries").selectedOptions).map(o=>o.value);
    const active=$("masterLocalActive").checked;
    const latitude=nullableNumber("masterLocalLatitude");
    const longitude=nullableNumber("masterLocalLongitude");
    if(!$("masterLocalName").value.trim())throw new Error("Escribe el nombre del LOCAL.");
    if(active&&(latitude===null||longitude===null))throw new Error("Para activar el LOCAL completa latitud y longitud.");
    const id=await rpc("master_save_local",{
      p_local_id:$("masterLocalId").value||null,
      p_name:$("masterLocalName").value.trim(),
      p_slug:$("masterLocalSlug").value.trim(),
      p_description:$("masterLocalDescription").value.trim(),
      p_address:$("masterLocalAddress").value.trim(),
      p_latitude:latitude,p_longitude:longitude,
      p_phone:$("masterLocalPhone").value.trim(),
      p_whatsapp:$("masterLocalWhatsapp").value.trim(),
      p_active:active,p_delivery_ids:deliveryIds
    });
    masterLocalMessage("LOCAL guardado correctamente.");
    await loadScopes();
    await loadMasterLocals();
    $("masterLocalSelect").value=id;
    fillMasterLocalForm(masterLocalSelected());
  }catch(e){masterLocalMessage(e.message||"No se pudo guardar el LOCAL.","error");}
}

async function toggleMasterLocal(){
  const local=masterLocalSelected();
  if(!local)return;
  try{
    await rpc("master_set_local_active",{p_local_id:local.id,p_active:!local.active});
    masterLocalMessage(local.active?"LOCAL inactivado.":"LOCAL activado.");
    await loadScopes(); await loadMasterLocals();
  }catch(e){masterLocalMessage(e.message||"No se pudo cambiar el estado.","error");}
}

async function deleteMasterLocal(){
  const local=masterLocalSelected();
  if(!local)return;
  const typed=prompt(`Para eliminar "${local.name}", escribe exactamente su nombre. Si tiene historial, se inactivará para proteger los pedidos.`);
  if(typed===null)return;
  try{
    const result=await rpc("master_delete_local",{p_local_id:local.id,p_confirm_name:typed});
    masterLocalMessage(result==="DELETED"?"LOCAL eliminado definitivamente.":"El LOCAL conserva historial o relaciones y fue inactivado de forma segura.");
    await loadScopes(); await loadMasterLocals();
  }catch(e){masterLocalMessage(e.message||"No se pudo eliminar el LOCAL.","error");}
}

function bindMasterLocals(){
  if(masterLocalsState.bound||!$("masterLocalSelect"))return;
  masterLocalsState.bound=true;
  $("masterLocalSelect").onchange=()=>fillMasterLocalForm(masterLocalSelected());
  $("masterLocalNewBtn").onclick=()=>{$("masterLocalSelect").value="";clearMasterLocalForm();};
  $("masterLocalSaveBtn").onclick=saveMasterLocal;
  $("masterLocalToggleBtn").onclick=toggleMasterLocal;
  $("masterLocalDeleteBtn").onclick=deleteMasterLocal;
}

document.addEventListener("DOMContentLoaded",bindMasterLocals);
