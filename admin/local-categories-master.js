const localBusinessCategoriesState={items:[],sectors:[],bound:false,busy:false,sectorBusy:false};

function sectorOptions(selected=""){
  return localBusinessCategoriesState.sectors.filter(x=>x.active||x.id===selected)
    .map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selected?'selected':'')+'>'+esc(x.name)+'</option>').join("");
}

function renderBusinessSectors(){
  const host=$("businessSectorRows");if(!host)return;
  host.innerHTML=localBusinessCategoriesState.sectors.length
    ? '<div class="table-wrap"><table><thead><tr><th>Sector</th><th>Código</th><th>Categorías</th><th>Locales</th><th>Estado</th><th></th></tr></thead><tbody>'+
      localBusinessCategoriesState.sectors.map(item=>'<tr><td>'+esc(item.name)+'</td><td>'+esc(item.code)+'</td><td>'+esc(item.category_count||0)+'</td><td>'+esc(item.local_count||0)+'</td><td>'+(item.active?"Activo":"Inactivo")+'</td><td><button data-edit-sector="'+esc(item.id)+'">Editar</button></td></tr>').join("")+
      '</tbody></table></div>'
    : '<div class="muted">No hay sectores de negocio.</div>';
  host.querySelectorAll("[data-edit-sector]").forEach(button=>button.onclick=()=>{
    const item=localBusinessCategoriesState.sectors.find(x=>x.id===button.dataset.editSector);if(!item)return;
    $("businessSectorId").value=item.id;$("businessSectorName").value=item.name||"";$("businessSectorCode").value=item.code||"";
    $("businessSectorDescription").value=item.description||"";$("businessSectorOrder").value=item.display_order??100;$("businessSectorActive").checked=!!item.active;
    $("saveBusinessSectorBtn").textContent="Actualizar sector";$("businessSectorName").focus();
  });
}

function renderLocalBusinessCategories(){
  const q=($("localBusinessCategorySearch")?.value||"").trim().toLowerCase();
  const items=localBusinessCategoriesState.items.filter(item=>!q||[item.name,item.description,item.sector_name].join(" ").toLowerCase().includes(q));
  $("localBusinessCategoryRows").innerHTML=items.length
    ? '<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Sector</th><th>Descripción</th><th>Locales</th><th>Estado</th><th></th></tr></thead><tbody>'+
      items.map(item=>'<tr><td>'+esc(item.name)+'</td><td>'+esc(item.sector_name||"Sin sector")+'</td><td>'+esc(item.description||"")+'</td><td>'+esc(item.local_count||0)+'</td><td>'+(item.active?"Activa":"Inactiva")+'</td><td><button data-edit-local-business-category="'+esc(item.id)+'">Editar</button></td></tr>').join("")+
      '</tbody></table></div>'
    : '<div class="muted">No hay categorías de LOCAL registradas.</div>';
  $("localBusinessCategoryRows").querySelectorAll("[data-edit-local-business-category]").forEach(button=>button.onclick=()=>{
    const item=localBusinessCategoriesState.items.find(x=>x.id===button.dataset.editLocalBusinessCategory);if(!item)return;
    $("localBusinessCategoryId").value=item.id;$("localBusinessCategoryName").value=item.name||"";
    $("localBusinessCategoryDescription").value=item.description||"";$("localBusinessCategoryActive").checked=!!item.active;
    $("localBusinessCategorySector").innerHTML=sectorOptions(item.sector_id||"");$("saveLocalBusinessCategoryBtn").textContent="Actualizar categoría";
    $("localBusinessCategoryName").focus();
  });
}

function clearBusinessSectorForm(){
  $("businessSectorId").value="";$("businessSectorName").value="";$("businessSectorCode").value="";
  $("businessSectorDescription").value="";$("businessSectorOrder").value="100";$("businessSectorActive").checked=true;
  $("saveBusinessSectorBtn").textContent="Guardar sector";
}

function clearLocalBusinessCategoryForm(){
  $("localBusinessCategoryId").value="";$("localBusinessCategoryName").value="";$("localBusinessCategoryDescription").value="";
  $("localBusinessCategoryActive").checked=true;$("localBusinessCategorySector").innerHTML=sectorOptions();
  $("saveLocalBusinessCategoryBtn").textContent="Guardar categoría";
}

async function saveBusinessSector(){
  if(localBusinessCategoriesState.sectorBusy)return;localBusinessCategoriesState.sectorBusy=true;$("saveBusinessSectorBtn").disabled=true;
  try{
    await rpc("master_save_business_sector",{
      p_sector_id:$("businessSectorId").value||null,p_code:$("businessSectorCode").value.trim(),
      p_name:$("businessSectorName").value.trim(),p_description:$("businessSectorDescription").value.trim(),
      p_display_order:Number($("businessSectorOrder").value||100),p_active:$("businessSectorActive").checked
    });
    clearBusinessSectorForm();await loadMasterLocalBusinessCategories();message("Sector de negocio guardado.");
  }catch(e){message(e.message||"No se pudo guardar el sector.","error")}
  finally{localBusinessCategoriesState.sectorBusy=false;$("saveBusinessSectorBtn").disabled=false}
}

async function saveLocalBusinessCategory(){
  if(localBusinessCategoriesState.busy)return;localBusinessCategoriesState.busy=true;$("saveLocalBusinessCategoryBtn").disabled=true;
  try{
    await rpc("master_save_local_business_category",{
      p_category_id:$("localBusinessCategoryId").value||null,p_name:$("localBusinessCategoryName").value.trim(),
      p_description:$("localBusinessCategoryDescription").value.trim(),p_active:$("localBusinessCategoryActive").checked,
      p_sector_id:$("localBusinessCategorySector").value||null
    });
    clearLocalBusinessCategoryForm();await loadMasterLocalBusinessCategories();message("Categoría de LOCAL guardada.");
  }catch(e){message(e.message||"No se pudo guardar la categoría.","error")}
  finally{localBusinessCategoriesState.busy=false;$("saveLocalBusinessCategoryBtn").disabled=false}
}

function bindBusinessTaxonomy(){
  if(localBusinessCategoriesState.bound)return;localBusinessCategoriesState.bound=true;
  $("section-categoriesmaster").innerHTML=
    '<div class="card"><h2>Categorías de LOCAL — MASTER</h2><h3>Tipos de negocio y categorías</h3>'+
    '<p class="muted">El sector es el nivel superior de HTPWEB. Ej.: Restaurantes y alimentos, Ferreterías, Librerías y papelerías. Cada categoría pertenece a un sector y cada LOCAL conserva máximo 2 categorías.</p></div>'+
    '<div class="card"><h3>Sector / tipo de negocio</h3><input id="businessSectorId" type="hidden">'+
    '<div class="form-grid"><div><label>Nombre *</label><input id="businessSectorName" maxlength="120" placeholder="Ej. Ferreterías"></div>'+
    '<div><label>Código *</label><input id="businessSectorCode" maxlength="60" placeholder="FERRETERIAS"></div>'+
    '<div><label>Orden</label><input id="businessSectorOrder" type="number" value="100"></div>'+
    '<div><label class="row"><input id="businessSectorActive" type="checkbox" checked style="width:auto"> Activo</label></div></div>'+
    '<label>Descripción</label><textarea id="businessSectorDescription" rows="2" maxlength="600"></textarea>'+
    '<div class="row" style="margin-top:14px"><button class="btn-primary" id="saveBusinessSectorBtn">Guardar sector</button><button class="btn-muted" id="clearBusinessSectorBtn">Nuevo sector</button></div>'+
    '<div id="businessSectorRows" style="margin-top:16px"></div></div>'+
    '<div class="card"><h3>Crear o editar categoría</h3><input id="localBusinessCategoryId" type="hidden">'+
    '<div class="form-grid"><div><label>Sector *</label><select id="localBusinessCategorySector"></select></div>'+
    '<div><label>Nombre *</label><input id="localBusinessCategoryName" maxlength="120" placeholder="Ej. Herramientas"></div>'+
    '<div><label class="row"><input id="localBusinessCategoryActive" type="checkbox" checked style="width:auto"> Activa</label></div></div>'+
    '<label>Descripción</label><textarea id="localBusinessCategoryDescription" rows="3" maxlength="600"></textarea>'+
    '<div class="row" style="margin-top:14px"><button class="btn-primary" id="saveLocalBusinessCategoryBtn">Guardar categoría</button><button class="btn-muted" id="clearLocalBusinessCategoryBtn">Nueva categoría</button></div></div>'+
    '<div class="card"><div class="row between"><h3>Categorías registradas</h3><input id="localBusinessCategorySearch" type="search" placeholder="Buscar categoría o sector" style="max-width:320px"></div><div id="localBusinessCategoryRows"></div></div>';
  $("saveBusinessSectorBtn").onclick=saveBusinessSector;$("clearBusinessSectorBtn").onclick=clearBusinessSectorForm;
  $("saveLocalBusinessCategoryBtn").onclick=saveLocalBusinessCategory;$("clearLocalBusinessCategoryBtn").onclick=clearLocalBusinessCategoryForm;
  $("localBusinessCategorySearch").oninput=renderLocalBusinessCategories;
}

async function loadMasterLocalBusinessCategories(){
  if(state.role!=="MASTER")return;bindBusinessTaxonomy();
  try{
    const [sectors,categories]=await Promise.all([rpc("master_list_business_sectors"),rpc("master_list_local_business_categories")]);
    localBusinessCategoriesState.sectors=sectors||[];localBusinessCategoriesState.items=categories||[];
    $("localBusinessCategorySector").innerHTML=sectorOptions($("localBusinessCategorySector").value||"");
    if(typeof masterLocalsState!=="undefined")masterLocalsState.businessCategories=localBusinessCategoriesState.items;
    renderBusinessSectors();renderLocalBusinessCategories();
  }catch(e){message(e.message||"No se pudo cargar la clasificación de negocios.","error")}
}
