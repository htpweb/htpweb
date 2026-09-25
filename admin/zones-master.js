const zonesMaster={items:[],points:[],map:null,bound:false,dirty:false,busy:false};

function zoneMessage(t,error=false){
  $("zoneNotice").textContent=t;
  $("zoneNotice").classList.toggle("workspace-warning",error);
}

function zoneLocationKey(value){
  return String(value||"").trim().toLocaleLowerCase("es");
}

function refreshZoneLocationLists(){
  const provinceInput=$("zoneProvince");
  const provinceList=$("zoneProvinceList");
  const cityList=$("zoneCityList");
  if(!provinceInput||!provinceList||!cityList)return;

  const provinces=[...new Set(
    (state.cities||[])
      .filter(c=>c.active&&c.province)
      .map(c=>String(c.province).trim())
      .filter(Boolean)
  )].sort((a,b)=>a.localeCompare(b,"es"));

  provinceList.innerHTML=provinces.map(p=>'<option value="'+esc(p)+'"></option>').join("");

  const provinceKey=zoneLocationKey(provinceInput.value);
  const cantons=(state.cities||[])
    .filter(c=>c.active&&(!provinceKey||zoneLocationKey(c.province)===provinceKey))
    .map(c=>c.name)
    .filter(Boolean)
    .sort((a,b)=>String(a).localeCompare(String(b),"es"));

  cityList.innerHTML=cantons.map(name=>'<option value="'+esc(name)+'"></option>').join("");
}

async function resolveZoneCityId(){
  const province=$("zoneProvince").value.trim();
  const canton=$("zoneCity").value.trim();

  if(!province)throw new Error("Escribe la provincia.");
  if(!canton)throw new Error("Escribe el cantón.");

  const provinceKey=zoneLocationKey(province);
  const cantonKey=zoneLocationKey(canton);
  let city=(state.cities||[]).find(c=>
    zoneLocationKey(c.province)===provinceKey&&zoneLocationKey(c.name)===cantonKey
  );

  if(city?.active)return city.id;

  const cityId=await rpc("master_save_city",{
    p_city_id:city?.id||null,
    p_name:canton,
    p_province:province,
    p_country:"Ecuador",
    p_active:true
  });

  await loadCities();
  refreshZoneLocationLists();

  city=(state.cities||[]).find(c=>c.id===cityId);
  if(!city)throw new Error("Se creó el cantón, pero no pudo cargarse para guardar la zona.");
  return city.id;
}

function drawZoneEditor(){
  if(!zonesMaster.map)return;
  zonesMaster.map.clear();
  zonesMaster.items
    .filter(z=>z.id!==$("zoneId").value&&z.boundary?.length)
    .forEach(z=>zonesMaster.map.polygon(z.boundary,z.color));
  if(zonesMaster.points.length>=3)zonesMaster.map.polygon(zonesMaster.points,$("zoneColor").value);
  zonesMaster.points.forEach((p,i)=>
    zonesMaster.map.marker(p,(lat,lng)=>{
      zonesMaster.points[i]=[lat,lng];
      zonesMaster.dirty=true;
      drawZoneEditor();
    })
  );
  $("zonePointCount").textContent=zonesMaster.points.length+" puntos. Pulsa en el mapa para añadir; arrastra los marcadores para ajustar.";
}

function clearZoneEditor(){
  $("zoneId").value="";
  $("zoneCode").value="";
  $("zoneName").value="";
  $("zoneDescription").value="";
  $("zoneColor").value="#2563eb";
  $("zoneActive").checked=true;
  zonesMaster.points=[];
  zonesMaster.dirty=false;
  zoneMessage("Zona nueva. Escribe provincia y cantón; si todavía no existen, se crearán al guardar la zona.");
  drawZoneEditor();
}

async function loadMasterZones(){
  if(state.role!=="MASTER")return;

  if(!zonesMaster.bound){
    zonesMaster.bound=true;
    $("section-zonesmaster").innerHTML=`
      <div class="card">
        <h2>Zonas — MASTER</h2>
        <p>Cada local pertenece a una zona. Los DELIVERY solicitan operar en una o varias zonas de su cantón.</p>
        <p class="workspace-note">Provincia y cantón se administran aquí: si escribes uno nuevo, HTPWEB lo crea automáticamente al guardar la primera zona. Los límites cantonales oficiales no están cargados; confirma visualmente el área.</p>
      </div>
      <div class="card">
        <h3>Crear o editar zona</h3>
        <input id="zoneId" type="hidden">
        <div class="form-grid">
          <div>
            <label for="zoneProvince">Provincia</label>
            <input id="zoneProvince" list="zoneProvinceList" maxlength="120" placeholder="Ej. Esmeraldas">
            <datalist id="zoneProvinceList"></datalist>
          </div>
          <div>
            <label for="zoneCity">Cantón</label>
            <input id="zoneCity" list="zoneCityList" maxlength="120" placeholder="Ej. Esmeraldas">
            <datalist id="zoneCityList"></datalist>
          </div>
          <div><label for="zoneCode">Código</label><input id="zoneCode" maxlength="20" placeholder="X1"></div>
          <div><label for="zoneName">Nombre</label><input id="zoneName" maxlength="160" placeholder="Centro"></div>
          <div><label for="zoneColor">Color</label><input id="zoneColor" type="color" value="#2563eb"></div>
        </div>
        <label for="zoneDescription">Descripción</label>
        <textarea id="zoneDescription"></textarea>
        <label class="row"><input id="zoneActive" type="checkbox" checked style="width:auto"> Zona activa</label>
        <div id="zoneMap" class="workspace-map" tabindex="0" aria-label="Dibujar límite de zona"></div>
        <p id="zonePointCount"></p>
        <div class="row">
          <button id="zoneUndo">Deshacer último punto</button>
          <button id="zoneClearPoints">Borrar dibujo</button>
          <button id="zoneCurrentPosition">Centrar en mi ubicación</button>
        </div>
        <p id="zoneNotice" class="workspace-note" role="status"></p>
        <div class="row"><button class="btn-primary" id="zoneSave">Guardar zona</button><button id="zoneNew">Nueva zona</button></div>
      </div>
      <div class="card">
        <h3>Zonas registradas</h3>
        <input id="zoneSearch" type="search" placeholder="Buscar provincia, cantón, código o nombre" aria-label="Buscar zonas">
        <div id="zoneRows"></div>
      </div>
      <div class="card"><h3>Solicitudes de cobertura</h3><div id="zoneRequests"></div></div>`;

    refreshZoneLocationLists();
    $("zoneProvince").oninput=refreshZoneLocationLists;
    $("zoneSave").onclick=saveMasterZone;
    $("zoneNew").onclick=()=>{if(!zonesMaster.dirty||confirm("¿Descartar los cambios de zona?"))clearZoneEditor();};
    $("zoneUndo").onclick=()=>{zonesMaster.points.pop();zonesMaster.dirty=true;drawZoneEditor();};
    $("zoneClearPoints").onclick=()=>{
      if(confirm("¿Borrar solo el dibujo sin guardar todavía?")){
        zonesMaster.points=[];
        zonesMaster.dirty=true;
        drawZoneEditor();
      }
    };
    $("zoneColor").oninput=drawZoneEditor;
    $("zoneSearch").oninput=renderMasterZones;
    $("section-zonesmaster").addEventListener("input",()=>{zonesMaster.dirty=true;});
    $("zoneCurrentPosition").onclick=()=>navigator.geolocation?.getCurrentPosition(
      p=>zonesMaster.map?.center([p.coords.latitude,p.coords.longitude],14),
      ()=>zoneMessage("Ubicación no disponible.",true),
      {timeout:10000}
    );
  }

  try{
    zonesMaster.items=await rpc("master_list_zones");
    refreshZoneLocationLists();
    renderMasterZones();
    if(!zonesMaster.map){
      zonesMaster.map=await ZoneMaps.create("zoneMap",(lat,lng)=>{
        if(zonesMaster.points.length>=200)return zoneMessage("Máximo 200 puntos.",true);
        zonesMaster.points.push([lat,lng]);
        zonesMaster.dirty=true;
        drawZoneEditor();
      });
    }
    zonesMaster.map.resize();
    drawZoneEditor();
    await loadZoneRequests();
  }catch(e){
    zoneMessage(e.message,true);
  }
}

function renderMasterZones(){
  const q=$("zoneSearch").value.toLowerCase();
  const items=zonesMaster.items.filter(z=>[z.province,z.city_name,z.code,z.name].join(" ").toLowerCase().includes(q));
  $("zoneRows").innerHTML='<div class="table-wrap"><table><thead><tr><th>Provincia</th><th>Cantón</th><th>Código</th><th>Nombre</th><th>Locales</th><th>DELIVERY</th><th>Límites</th><th>Estado</th><th></th></tr></thead><tbody>'+
    items.map(z=>'<tr><td>'+esc(z.province)+'</td><td>'+esc(z.city_name)+'</td><td>'+esc(z.code)+'</td><td>'+esc(z.name)+'</td><td>'+z.local_count+'</td><td>'+z.delivery_count+'</td><td>'+(z.boundary?"Dibujados":"Pendientes")+'</td><td>'+(z.active?"Activa":"Inactiva")+'</td><td><button data-zone-edit="'+esc(z.id)+'">Editar</button></td></tr>').join("")+
    '</tbody></table></div>';

  $("zoneRows").querySelectorAll("[data-zone-edit]").forEach(b=>b.onclick=()=>{
    if(zonesMaster.dirty&&!confirm("¿Descartar cambios de zona?"))return;
    const z=zonesMaster.items.find(item=>item.id===b.dataset.zoneEdit);
    $("zoneId").value=z.id;
    $("zoneProvince").value=z.province||"";
    refreshZoneLocationLists();
    $("zoneCity").value=z.city_name||"";
    $("zoneCode").value=z.code;
    $("zoneName").value=z.name;
    $("zoneDescription").value=z.description||"";
    $("zoneColor").value=z.color;
    $("zoneActive").checked=z.active;
    zonesMaster.points=JSON.parse(JSON.stringify(z.boundary||[]));
    zonesMaster.dirty=false;
    drawZoneEditor();
    if(zonesMaster.points.length)zonesMaster.map?.center(zonesMaster.points[0],14);
    zoneMessage(z.local_count+" locales y "+z.delivery_count+" DELIVERY asociados. Los cambios no modificarán pedidos históricos.");
  });
}

async function saveMasterZone(){
  if(zonesMaster.busy)return;
  zonesMaster.busy=true;
  $("zoneSave").disabled=true;

  try{
    if(!$("zoneProvince").value.trim()||!$("zoneCity").value.trim()||!$("zoneCode").value.trim()||!$("zoneName").value.trim()){
      throw new Error("Completa provincia, cantón, código y nombre.");
    }
    if(zonesMaster.points.length<3)throw new Error("Dibuja al menos tres puntos.");

    const current=zonesMaster.items.find(z=>z.id===$("zoneId").value);
    const locationChanged=current&&(
      zoneLocationKey(current.province)!==zoneLocationKey($("zoneProvince").value)||
      zoneLocationKey(current.city_name)!==zoneLocationKey($("zoneCity").value)
    );
    if(locationChanged&&(Number(current.local_count||0)>0||Number(current.delivery_count||0)>0)){
      throw new Error("No cambies el cantón de una zona que ya tiene locales o DELIVERY asociados. Crea una zona nueva y reclasifica primero.");
    }

    const affected=masterLocalsState.items.filter(l=>
      l.zone_id===$("zoneId").value&&
      l.latitude!=null&&
      !ZoneMaps.contains(zonesMaster.points,Number(l.latitude),Number(l.longitude))
    );
    if(affected.length){
      throw new Error("El nuevo límite deja fuera: "+affected.map(l=>l.name).join(", ")+". Reclasifica esos locales primero.");
    }

    if($("zoneId").value&&!confirm("¿Guardar cambios de zona? El servidor impedirá superposiciones y locales fuera del nuevo límite."))return;

    const cityId=await resolveZoneCityId();

    await rpc("master_save_zone_v2",{
      p_zone_id:$("zoneId").value||null,
      p_city_id:cityId,
      p_code:$("zoneCode").value.trim(),
      p_name:$("zoneName").value.trim(),
      p_description:$("zoneDescription").value.trim(),
      p_color:$("zoneColor").value,
      p_boundary:zonesMaster.points,
      p_active:$("zoneActive").checked
    });

    zonesMaster.dirty=false;
    zoneMessage("Zona guardada. Provincia y cantón quedaron vinculados automáticamente.");
    zonesMaster.items=await rpc("master_list_zones");
    masterLocalsState.zones=zonesMaster.items;
    refreshZoneLocationLists();
    renderMasterZones();
    drawZoneEditor();
  }catch(e){
    zoneMessage(e.message,true);
  }finally{
    zonesMaster.busy=false;
    $("zoneSave").disabled=false;
  }
}

async function loadZoneRequests(){
  const {data,error}=await supabaseClient
    .from("delivery_zone_requests")
    .select("delivery_id,zone_id,status")
    .eq("status","PENDING");
  if(error)throw error;

  $("zoneRequests").innerHTML=data?.length
    ? data.map((r,i)=>{
        const z=zonesMaster.items.find(item=>item.id===r.zone_id);
        const d=state.deliveries.find(item=>item.id===r.delivery_id);
        return '<p>'+esc(d?.name||r.delivery_id)+' — '+esc(z?z.code+" "+z.name:r.zone_id)+' <button data-approve-request="'+i+'">Aprobar</button> <button data-reject-request="'+i+'">Rechazar</button></p>';
      }).join("")
    : "Sin solicitudes pendientes.";

  for(const action of ["approve","reject"]){
    $("zoneRequests").querySelectorAll("[data-"+action+"-request]").forEach(b=>b.onclick=async()=>{
      const r=data[Number(b.dataset[action+"Request"])];
      b.disabled=true;
      try{
        await rpc(action==="approve"?"set_delivery_zone":"reject_delivery_zone_request",{
          p_delivery_id:r.delivery_id,
          p_zone_id:r.zone_id,
          ...(action==="approve"?{p_active:true}:{})
        });
        await loadZoneRequests();
      }catch(e){
        message(e.message,"error");
        b.disabled=false;
      }
    });
  }
}
