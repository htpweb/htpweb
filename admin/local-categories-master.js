const localBusinessCategoriesState={items:[],bound:false,busy:false};

function renderLocalBusinessCategories(){
  const q=($("localBusinessCategorySearch")?.value||"").trim().toLowerCase();
  const items=localBusinessCategoriesState.items.filter(item=>
    !q||[item.name,item.description].join(" ").toLowerCase().includes(q)
  );
  $("localBusinessCategoryRows").innerHTML=items.length
    ? '<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Descripción</th><th>Locales</th><th>Estado</th><th></th></tr></thead><tbody>'+
      items.map(item=>'<tr>'+
        '<td>'+esc(item.name)+'</td>'+
        '<td>'+esc(item.description||"")+'</td>'+
        '<td>'+esc(item.local_count||0)+'</td>'+
        '<td>'+(item.active?"Activa":"Inactiva")+'</td>'+
        '<td><button data-edit-local-business-category="'+esc(item.id)+'">Editar</button></td>'+
      '</tr>').join("")+
      '</tbody></table></div>'
    : '<div class="muted">No hay categorías de LOCAL registradas.</div>';

  $("localBusinessCategoryRows").querySelectorAll("[data-edit-local-business-category]").forEach(button=>{
    button.onclick=()=>{
      const item=localBusinessCategoriesState.items.find(x=>x.id===button.dataset.editLocalBusinessCategory);
      if(!item)return;
      $("localBusinessCategoryId").value=item.id;
      $("localBusinessCategoryName").value=item.name||"";
      $("localBusinessCategoryDescription").value=item.description||"";
      $("localBusinessCategoryActive").checked=!!item.active;
      $("saveLocalBusinessCategoryBtn").textContent="Actualizar categoría";
      $("localBusinessCategoryName").focus();
    };
  });
}

function clearLocalBusinessCategoryForm(){
  $("localBusinessCategoryId").value="";
  $("localBusinessCategoryName").value="";
  $("localBusinessCategoryDescription").value="";
  $("localBusinessCategoryActive").checked=true;
  $("saveLocalBusinessCategoryBtn").textContent="Guardar categoría";
}

async function saveLocalBusinessCategory(){
  if(localBusinessCategoriesState.busy)return;
  localBusinessCategoriesState.busy=true;
  $("saveLocalBusinessCategoryBtn").disabled=true;
  try{
    await rpc("master_save_local_business_category",{
      p_category_id:$("localBusinessCategoryId").value||null,
      p_name:$("localBusinessCategoryName").value.trim(),
      p_description:$("localBusinessCategoryDescription").value.trim(),
      p_active:$("localBusinessCategoryActive").checked
    });
    clearLocalBusinessCategoryForm();
    await loadMasterLocalBusinessCategories();
    message("Categoría de LOCAL guardada.");
  }catch(e){
    message(e.message||"No se pudo guardar la categoría.","error");
  }finally{
    localBusinessCategoriesState.busy=false;
    $("saveLocalBusinessCategoryBtn").disabled=false;
  }
}

async function loadMasterLocalBusinessCategories(){
  if(state.role!=="MASTER")return;
  if(!localBusinessCategoriesState.bound){
    localBusinessCategoriesState.bound=true;
    $("section-categoriesmaster").innerHTML=`
      <div class="card">
        <h2>Categorías de LOCAL — MASTER</h2>
        <p class="muted">Clasifica el tipo de establecimiento: Restaurante, Farmacia, Supermercado, Ferretería, etc. Estas categorías son independientes de las categorías de productos.</p>
      </div>
      <div class="card">
        <h3>Crear o editar categoría</h3>
        <input id="localBusinessCategoryId" type="hidden">
        <div class="form-grid">
          <div><label>Nombre *</label><input id="localBusinessCategoryName" maxlength="120" placeholder="Ej. Restaurante"></div>
          <div><label class="row"><input id="localBusinessCategoryActive" type="checkbox" checked style="width:auto"> Activa</label></div>
        </div>
        <label>Descripción</label>
        <textarea id="localBusinessCategoryDescription" rows="3" maxlength="600"></textarea>
        <div class="row" style="margin-top:14px">
          <button class="btn-primary" id="saveLocalBusinessCategoryBtn">Guardar categoría</button>
          <button class="btn-muted" id="clearLocalBusinessCategoryBtn">Nueva categoría</button>
        </div>
      </div>
      <div class="card">
        <div class="row between">
          <h3>Categorías registradas</h3>
          <input id="localBusinessCategorySearch" type="search" placeholder="Buscar categoría" style="max-width:320px">
        </div>
        <div id="localBusinessCategoryRows"></div>
      </div>
    `;
    $("saveLocalBusinessCategoryBtn").onclick=saveLocalBusinessCategory;
    $("clearLocalBusinessCategoryBtn").onclick=clearLocalBusinessCategoryForm;
    $("localBusinessCategorySearch").oninput=renderLocalBusinessCategories;
  }

  try{
    localBusinessCategoriesState.items=(await rpc("master_list_local_business_categories"))||[];
    if(typeof masterLocalsState!=="undefined")masterLocalsState.businessCategories=localBusinessCategoriesState.items;
    renderLocalBusinessCategories();
  }catch(e){
    message(e.message||"No se pudieron cargar las categorías de LOCAL.","error");
  }
}
