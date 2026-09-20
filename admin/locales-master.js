const masterLocalsState={items:[],zones:[],businessCategories:[],bound:false,map:null,dirty:false,source:"MANUAL",panels:[],menuPanels:[],busy:false,googlePlace:null,googleSearch:null,geocoder:null,geocodeSeq:0,googleScheduleDraft:null,googleScheduleDraftLocalId:null,googleScheduleWarnings:[],bulkRows:[],bulkFileName:"",bulkBusy:false,productBulkRows:[],productBulkErrors:[],productBulkFileName:"",productBulkBusy:false};
function masterLocalSelected(){return masterLocalsState.items.find(l=>l.id===$("masterLocalId")?.value)||null;}
function localOptions(items,label,selected=""){return '<option value="">Seleccionar…</option>'+items.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selected?'selected':'')+'>'+esc(label(x))+'</option>').join("");}
function bindMasterLocals(){
 if(masterLocalsState.bound)return;masterLocalsState.bound=true;
 $("section-localsmaster").innerHTML=`
 <div class="card workspace-title"><div><h2>Locales</h2><p>Administra desde aquí la ficha completa del LOCAL: ubicación, horarios, imágenes, productos, variantes e importaciones.</p></div>
 <div class="row"><button id="masterLocalListBtn">Listado de locales</button><button id="masterLocalBulkBtn">Cargas masivas</button><button id="masterLocalMenuImportBtn">Importar menú</button><button id="masterLocalNewBtn" class="btn-primary">Crear local</button></div></div>
 <div id="masterLocalList" class="card"><h3>Listado de locales</h3><div class="form-grid">
 <div><label for="localFilterProvince">Provincia</label><select id="localFilterProvince"></select></div>
 <div><label for="localFilterCity">Cantón</label><select id="localFilterCity"></select></div>
 <div><label for="localFilterZone">Zona</label><select id="localFilterZone"></select></div>
 <div><label for="localFilterName">Nombre</label><input id="localFilterName" type="search"></div>
 <div><label for="localFilterStatus">Estado</label><select id="localFilterStatus"><option value="">Todos</option><option value="true">Activo</option><option value="false">Inactivo / borrador</option><option value="unzoned">Sin zona</option></select></div>
 </div><div id="masterLocalsSummary"></div></div>
 <div id="masterLocalBulk" class="hidden">
 <div class="card"><div class="row between"><div><h3>Carga masiva de locales</h3><p class="muted">Crea muchos LOCAL desde Excel. Se validan ubicación, categoría, zona, duplicados y datos Google antes de importar.</p></div><button id="downloadBulkLocalTemplateBtn" class="btn-muted" type="button">Descargar plantilla Excel de locales</button></div>
 <div class="form-grid" style="margin-top:14px"><div><label>Archivo Excel de locales</label><input id="bulkLocalFile" type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"></div><div><label>Proceso</label><button id="validateBulkLocalBtn" type="button" class="btn-primary">Validar locales</button></div></div>
 <p id="bulkLocalStatus" class="muted">Todavía no has cargado una plantilla de locales.</p><div id="bulkLocalPreview"></div>
 <div class="bulk-local-actions" style="margin-top:14px"><button id="downloadBulkLocalErrorsBtn" type="button" class="btn-muted" disabled>Descargar observaciones</button><button id="importBulkLocalBtn" type="button" class="btn-primary" disabled>Importar locales válidos</button></div></div>
 <div class="card"><div class="row between"><div><h3>Carga masiva de productos</h3><p class="muted">Selecciona un LOCAL y carga productos, categorías de menú y variantes desde Excel o CSV. Por defecto se importan como borrador.</p></div><button id="downloadBulkProductTemplateBtn" class="btn-muted" type="button">Descargar plantilla de productos</button></div>
 <div class="form-grid" style="margin-top:14px"><div><label>LOCAL destino</label><select id="bulkProductLocal"></select></div><div><label>Archivo de productos</label><input id="bulkProductFile" type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div></div>
 <div class="row" style="margin-top:14px"><button id="validateBulkProductBtn" type="button" class="btn-primary">Validar productos</button><label class="row" style="margin:0"><input id="bulkProductPublish" type="checkbox" style="width:auto"> Publicar inmediatamente según ACTIVO</label></div>
 <p id="bulkProductStatus" class="muted">Todavía no has cargado una plantilla de productos.</p><div id="bulkProductPreview"></div>
 <div class="bulk-local-actions" style="margin-top:14px"><button id="downloadBulkProductErrorsBtn" type="button" class="btn-muted" disabled>Descargar observaciones de productos</button><button id="importBulkProductBtn" type="button" class="btn-primary" disabled>Importar productos válidos</button></div></div>
 </div>
 <div id="masterLocalMenuImport" class="hidden"></div>
 <div id="masterLocalEditor" class="card hidden"><h3 id="masterLocalHeading">Crear local</h3>
 <p id="localSaveStatus" role="status"></p><input id="masterLocalId" type="hidden"><input id="masterLocalPlaceId" type="hidden">
 <div class="workspace-tabs" role="tablist" aria-label="Ficha del local"><button data-local-tab="info">Información y ubicación</button>
 <button data-local-tab="schedules">Horario</button><button data-local-tab="images">Imágenes</button><button data-local-tab="catalog">Productos y variantes</button></div>
 <div id="localInfoPane"><div class="form-grid">
 <div><label for="masterLocalBusinessCategory">Categoría *</label><select id="masterLocalBusinessCategory"></select></div>
 <div><label for="masterLocalProvince">Provincia *</label><select id="masterLocalProvince"></select></div>
 <div><label for="masterLocalCity">Cantón *</label><select id="masterLocalCity"></select></div>
 <div><label for="masterLocalZone">Zona *</label><select id="masterLocalZone"></select></div></div>
 <div class="workspace-note">Busca primero el establecimiento. Si no aparece, pulsa en el mapa y arrastra el marcador hasta su entrada. Confirma provincia, cantón y zona.</div>
 <div id="googlePlaceSearch"></div><div class="row"><button id="googlePlaceDetailsBtn" class="btn-primary" type="button" disabled>IMPORTAR DATOS DE GOOGLE</button><button id="googleMapsDiagnosticBtn" type="button">Probar conexión Google</button></div><p id="googlePlaceStatus" class="muted"></p>
 <button id="localUsePosition">Usar mi ubicación actual</button><div id="masterLocalMap" class="workspace-map" aria-label="Ubicación del local" tabindex="0"></div>
 <p id="localZoneDetection" role="status"></p><details><summary>Coordenadas — opción avanzada</summary><div class="form-grid">
 <div><label for="masterLocalLatitude">Latitud</label><input id="masterLocalLatitude" inputmode="decimal"></div>
 <div><label for="masterLocalLongitude">Longitud</label><input id="masterLocalLongitude" inputmode="decimal"></div></div><button id="localApplyCoordinates">Mostrar en mapa</button></details>
 <div class="form-grid"><div><label for="masterLocalName">Nombre *</label><input id="masterLocalName" maxlength="160"></div>
 <div><label for="masterLocalAddress">Dirección y referencia</label><input id="masterLocalAddress" maxlength="240"></div>
 <div><label for="masterLocalPhone">Teléfono</label><input id="masterLocalPhone" maxlength="40"></div>
 <div><label for="masterLocalWhatsapp">WhatsApp</label><input id="masterLocalWhatsapp" maxlength="40"></div></div>
 <label for="masterLocalDescription">Descripción</label><textarea id="masterLocalDescription" maxlength="1200"></textarea>
 <details><summary>Enlace público</summary><label for="masterLocalSlug">Slug</label><input id="masterLocalSlug" maxlength="180" placeholder="Se genera al guardar"></details>
 <label class="row"><input type="checkbox" id="masterLocalActive" style="width:auto"> Local activo y visible</label>
 <p class="muted">Guarda primero el local para configurar horarios, imágenes y productos.</p>
 <div class="row"><button id="masterLocalSaveBtn" class="btn-primary">Guardar local</button>
 <button id="masterLocalToggleBtn" class="btn-warn" disabled>Activar / inactivar</button><button id="masterLocalDeleteBtn" class="btn-danger" disabled>Eliminar</button></div>
 </div><div id="localRelatedPane" class="workspace-host hidden"></div></div>`;
 $("masterLocalNewBtn").onclick=()=>{if(discardLocalChanges()){clearMasterLocalForm();showLocalMode("editor");}};
 $("masterLocalListBtn").onclick=()=>{if(discardLocalChanges()){restoreLocalPanels();showLocalMode("list");}};
 $("masterLocalBulkBtn").onclick=()=>{if(discardLocalChanges()){restoreLocalPanels();showLocalMode("bulk");renderBulkProductLocalOptions();}};
 $("masterLocalMenuImportBtn").onclick=()=>{if(discardLocalChanges()){restoreLocalPanels();mountMasterLocalMenuImport();}};
 bindMasterLocalBulk();
 $("masterLocalSaveBtn").onclick=saveMasterLocal;$("masterLocalToggleBtn").onclick=toggleMasterLocal;$("masterLocalDeleteBtn").onclick=deleteMasterLocal;$("googlePlaceDetailsBtn").onclick=loadGooglePlaceDetails;$("googleMapsDiagnosticBtn").onclick=diagnoseGoogleMaps;
 $("masterLocalProvince").onchange=()=>{fillLocalCities();fillLocalZones();updateGoogleSearchBias();};
 $("masterLocalCity").onchange=()=>{fillLocalZones();drawLocalMap();detectLocalZone(true);updateGoogleSearchBias();};
 $("masterLocalZone").onchange=()=>{const z=masterLocalsState.zones.find(z=>z.id===$("masterLocalZone").value);
   if(z?.boundary?.length&&!$("masterLocalLatitude").value)masterLocalsState.map?.center(z.boundary[0],14);drawLocalMap();};
 $("localInfoPane").addEventListener("input",()=>{masterLocalsState.dirty=true;});
 $("localInfoPane").addEventListener("change",()=>{masterLocalsState.dirty=true;});
 document.querySelectorAll("[data-local-tab]").forEach(b=>b.onclick=()=>openLocalTab(b.dataset.localTab));
 for(const id of ["localFilterProvince","localFilterCity","localFilterZone","localFilterName","localFilterStatus"])$(id).oninput=renderMasterLocalList;
 $("localUsePosition").onclick=()=>{
   if(!navigator.geolocation)return message("Este navegador no ofrece ubicación.","error");
   navigator.geolocation.getCurrentPosition(p=>setLocalPoint(p.coords.latitude,p.coords.longitude,true),()=>message("No se obtuvo la ubicación. Selecciona el punto en el mapa.","error"),{timeout:12000});
 };
 $("localApplyCoordinates").onclick=()=>{try{const a=nullableNumber("masterLocalLatitude"),b=nullableNumber("masterLocalLongitude");
   if(a===null||b===null)throw new Error("Completa ambas coordenadas.");setLocalPoint(a,b,true);}catch(e){message(e.message,"error");}};
 window.addEventListener("beforeunload",e=>{if(masterLocalsState.dirty){e.preventDefault();e.returnValue="";}});
}
function discardLocalChanges(){return !masterLocalsState.dirty||confirm("Hay cambios sin guardar. ¿Deseas descartarlos?");}
function fillLocalCities(selected=""){$("masterLocalCity").innerHTML=localOptions(state.cities.filter(c=>c.active&&c.province===$("masterLocalProvince").value),c=>c.name,selected);}
function fillLocalZones(selected=""){$("masterLocalZone").innerHTML=localOptions(masterLocalsState.zones.filter(z=>z.active),z=>z.code+" — "+z.name+(z.city_name?" · ref. "+z.city_name:""),selected);}
function clearGoogleScheduleDraft(){
 masterLocalsState.googleScheduleDraft=null;
 masterLocalsState.googleScheduleDraftLocalId=null;
 masterLocalsState.googleScheduleWarnings=[];
}
function clearMasterLocalForm(){clearGoogleScheduleDraft();fillMasterLocalForm(null);}
function fillMasterLocalForm(local){
 const nextLocalId=local?.id||null;
 if(masterLocalsState.googleScheduleDraft&&masterLocalsState.googleScheduleDraftLocalId!==nextLocalId)clearGoogleScheduleDraft();
 restoreLocalPanels();$("masterLocalId").value=local?.id||"";$("masterLocalHeading").textContent=local?"Editar: "+local.name:"Crear local";
 for(const [id,key] of [["Name","name"],["Slug","slug"],["Description","description"],["Address","address"],["Phone","phone"],["Whatsapp","whatsapp"],["Latitude","latitude"],["Longitude","longitude"],["PlaceId","google_place_id"]])$("masterLocal"+id).value=local?.[key]??"";
 const provinces=[...new Set(state.cities.filter(c=>c.active).map(c=>c.province||""))].sort();
 $("masterLocalProvince").innerHTML=localOptions(provinces.map(p=>({id:p})),p=>p.id,local?.province||"");
 fillLocalCities(local?.city_id||"");fillLocalZones(local?.zone_id||"");
 $("masterLocalBusinessCategory").innerHTML=localOptions(masterLocalsState.businessCategories.filter(x=>x.active||x.id===local?.business_category_id),x=>x.name,local?.business_category_id||"");
 $("masterLocalActive").checked=!!local?.active;$("masterLocalToggleBtn").disabled=!local;$("masterLocalDeleteBtn").disabled=!local;
 $("masterLocalToggleBtn").textContent=local?.active?"Inactivar":"Activar";
 masterLocalsState.source=local?.location_source||"MANUAL";masterLocalsState.googlePlace=null;if($("googlePlaceDetailsBtn"))$("googlePlaceDetailsBtn").disabled=true;masterLocalsState.dirty=false;
 $("localSaveStatus").textContent=local?"Cambios guardados":"Nuevo local — todavía no guardado";
 openLocalTab("info");drawLocalMap();if(local?.latitude!=null)masterLocalsState.map?.center([Number(local.latitude),Number(local.longitude)]);
}
function restoreMasterLocalMenuImport(){
 for(const {node,parent,next} of [...masterLocalsState.menuPanels].reverse())parent.insertBefore(node,next?.parentNode===parent?next:null);
 masterLocalsState.menuPanels=[];
}
async function mountMasterLocalMenuImport(){
 restoreMasterLocalMenuImport();
 const source=$("section-menuimport"),host=$("masterLocalMenuImport");
 if(!source||!host)return message("No se encontró el importador de menú.","error");
 for(const node of Array.from(source.children)){
   masterLocalsState.menuPanels.push({node,parent:source,next:node.nextSibling});
   host.appendChild(node);
 }
 showLocalMode("menuimport");
 try{await loadMenuImport();}catch(e){message(e.message||"No se pudo abrir el importador de menú.","error");}
}
function showLocalMode(mode){
 if(mode!=="menuimport")restoreMasterLocalMenuImport();
 $("masterLocalList").classList.toggle("hidden",mode!=="list");
 $("masterLocalBulk").classList.toggle("hidden",mode!=="bulk");
 $("masterLocalMenuImport").classList.toggle("hidden",mode!=="menuimport");
 $("masterLocalEditor").classList.toggle("hidden",mode!=="editor");
 if(mode==="editor")initLocalMap();
}
function showLocalEditor(show){showLocalMode(show?"editor":"list");}
function renderMasterLocalList(){
 const items=masterLocalsState.items.filter(l=>
 (!$("localFilterProvince").value||l.province===$("localFilterProvince").value)&&(!$("localFilterCity").value||l.city_id===$("localFilterCity").value)&&
 (!$("localFilterZone").value||l.zone_id===$("localFilterZone").value)&&(!($("localFilterName").value)||l.name.toLowerCase().includes($("localFilterName").value.toLowerCase()))&&
 (!$("localFilterStatus").value||($("localFilterStatus").value==="unzoned"?!l.zone_id:String(l.active)===$("localFilterStatus").value)));
 $("masterLocalsSummary").innerHTML='<p>'+items.length+' locales</p><div class="table-wrap"><table><thead><tr><th>Provincia</th><th>Cantón</th><th>Zona</th><th>Categoría</th><th>Nombre</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+
 items.map(l=>'<tr><td>'+esc(l.province||"Pendiente")+'</td><td>'+esc(l.canton||"Pendiente")+'</td><td>'+esc(l.zone_code||"Sin zona")+'</td><td>'+esc(l.business_category_name||"Sin categoría")+'</td><td>'+esc(l.name)+'</td><td>'+esc(l.active?"Activo":"Inactivo / borrador")+'</td><td><button data-edit-local="'+esc(l.id)+'">Editar</button></td></tr>').join("")+'</tbody></table></div>';
 $("masterLocalsSummary").querySelectorAll("[data-edit-local]").forEach(b=>b.onclick=()=>{if(discardLocalChanges()){fillMasterLocalForm(masterLocalsState.items.find(l=>l.id===b.dataset.editLocal));showLocalEditor(true);}});
}
async function loadMasterLocals(){
 if(state.role!=="MASTER")return;bindMasterLocals();
 try{
   const [items,zones,businessCategories]=await Promise.all([rpc("master_list_locals"),rpc("master_list_zones"),rpc("master_list_local_business_categories")]);masterLocalsState.items=items||[];masterLocalsState.zones=zones||[];masterLocalsState.businessCategories=businessCategories||[];
   if(typeof localBusinessCategoriesState!=="undefined")localBusinessCategoriesState.items=masterLocalsState.businessCategories;
   const provinces=[...new Set(state.cities.map(c=>c.province).filter(Boolean))].sort();
   for(const [id,data,label] of [["localFilterProvince",provinces.map(p=>({id:p})),p=>p.id],["localFilterCity",state.cities,c=>c.name],["localFilterZone",zones,z=>z.code+" — "+z.name]]){
     const value=$(id).value;$(id).innerHTML='<option value="">Todos</option>'+localOptions(data,label,value).replace('<option value="">Seleccionar…</option>',"");
   }
   renderMasterLocalList();if(typeof renderBulkProductLocalOptions==="function")renderBulkProductLocalOptions();if(!masterLocalsState.dirty){const id=$("masterLocalId").value;fillMasterLocalForm(items.find(l=>l.id===id)||null);}
 }catch(e){message(e.message||"No se pudieron cargar los locales.","error");}
}
function nullableNumber(id){const raw=$(id).value.trim();if(raw==="")return null;const value=Number(raw);if(!Number.isFinite(value))throw new Error("Coordenada inválida.");return value;}
function normalizeLocalGeoText(value){
 return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
   .replace(/\b(provincia|canton|cantón|municipio|distrito)\b/g," ").replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
}
function localAddressPart(components,...types){
 const list=Array.isArray(components)?components:[];
 for(const type of types){
   const part=list.find(x=>Array.isArray(x.types)&&x.types.includes(type));
   if(part)return part.longText||part.long_name||part.shortText||part.short_name||"";
 }
 return "";
}
function selectLocalGeoOption(id,candidates){
 const select=$(id);if(!select)return false;
 const wanted=(candidates||[]).map(normalizeLocalGeoText).filter(Boolean);
 if(!wanted.length)return false;
 const options=[...select.options];
 let match=options.find(o=>wanted.includes(normalizeLocalGeoText(o.textContent||o.value)));
 if(!match)match=options.find(o=>{
   const text=normalizeLocalGeoText(o.textContent||o.value);
   return text&&wanted.some(w=>text.includes(w)||w.includes(text));
 });
 if(!match)return false;select.value=match.value;return true;
}
function applyLocalGoogleAddress(formattedAddress,components){
 if(formattedAddress)$("masterLocalAddress").value=formattedAddress;
 const province=localAddressPart(components,"administrative_area_level_1");
 const canton=localAddressPart(components,"administrative_area_level_2");
 const locality=localAddressPart(components,"locality","postal_town","sublocality_level_1");
 let provinceChanged=false;
 if(province&&selectLocalGeoOption("masterLocalProvince",[province])){fillLocalCities();provinceChanged=true;}
 if((provinceChanged||$("masterLocalCity").options.length>1)&&selectLocalGeoOption("masterLocalCity",[canton,locality])){
   fillLocalZones();
 }
 updateGoogleSearchBias();
}
function localCitySearchBounds(){
 const cityId=$("masterLocalCity")?.value;if(!cityId)return null;
 const points=masterLocalsState.zones.filter(z=>z.active&&z.city_id===cityId&&Array.isArray(z.boundary))
   .flatMap(z=>z.boundary).filter(p=>Array.isArray(p)&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1])));
 if(!points.length)return null;
 const lats=points.map(p=>Number(p[0])),lngs=points.map(p=>Number(p[1]));
 return {north:Math.max(...lats),south:Math.min(...lats),east:Math.max(...lngs),west:Math.min(...lngs)};
}
function updateGoogleSearchBias(){
 const search=masterLocalsState.googleSearch;if(!search)return;
 const bounds=localCitySearchBounds();
 search.locationBias=bounds||null;
}
async function diagnoseGoogleMaps(){
 const status=$("googlePlaceStatus");
 const button=$("googleMapsDiagnosticBtn");
 if(button)button.disabled=true;
 try{
   status.textContent="Probando Maps JavaScript…";
   const g=await ZoneMaps.googleAPI();
   if(!g?.maps)throw new Error("Maps JavaScript no cargó.");

   status.textContent="Maps JavaScript cargó. Probando Places…";
   await google.maps.importLibrary("places");

   status.textContent="Maps y Places cargaron. Probando Geocoding…";
   const {Geocoder}=await google.maps.importLibrary("geocoding");
   const geocoder=new Geocoder();
   const lat=Number($("masterLocalLatitude")?.value)||Number(window.HTPWEB_MAPS?.defaultCenter?.[0])||0.9592;
   const lng=Number($("masterLocalLongitude")?.value)||Number(window.HTPWEB_MAPS?.defaultCenter?.[1])||-79.6539;
   await geocoder.geocode({location:{lat,lng}});

   status.textContent="Google OK: Maps JavaScript, Places y Geocoding están autorizados para HTPWEB.";
   message("Conexión Google verificada.");
 }catch(e){
   const detail=e?.message||String(e);
   if(/REQUEST_DENIED|not allowed to use the geocoder|referer|referrer/i.test(detail)){
     status.textContent="Maps puede cargar, pero Google rechazó Geocoding. Revisa en Google Cloud: facturación activa, Geocoding API habilitada en el mismo proyecto y la restricción web de la clave para https://htpweb.github.io/*.";
   }else{
     status.textContent="Google no pasó el diagnóstico: "+detail;
   }
   message(status.textContent,"error");
 }finally{
   if(button)button.disabled=false;
 }
}
window.addEventListener("htp-google-auth-failure",()=>{
 const status=$("googlePlaceStatus");
 if(status)status.textContent="Google rechazó la autenticación del mapa. Revisa facturación, clave API y dominio autorizado en Google Cloud.";
});

async function reverseGeocodeLocalPoint(lat,lng){
 if(!masterLocalsState.map?.google||!window.google?.maps)return;
 const seq=++masterLocalsState.geocodeSeq;
 try{
   $("googlePlaceStatus").textContent="Buscando la dirección del punto seleccionado…";
   const {Geocoder}=await google.maps.importLibrary("geocoding");
   if(!masterLocalsState.geocoder)masterLocalsState.geocoder=new Geocoder();
   const response=await masterLocalsState.geocoder.geocode({location:{lat,lng}});
   if(seq!==masterLocalsState.geocodeSeq)return;
   const result=response.results?.[0];
   if(!result){$("googlePlaceStatus").textContent="Google no encontró una dirección para este punto.";return;}
   applyLocalGoogleAddress(result.formatted_address,result.address_components);
   detectLocalZone(true);drawLocalMap();
   $("googlePlaceStatus").textContent="Dirección completada desde el punto del mapa. Revísala y corrígela solo si hace falta.";
   masterLocalsState.dirty=true;
 }catch(e){
   if(seq===masterLocalsState.geocodeSeq)$("googlePlaceStatus").textContent="No se pudo completar la dirección automáticamente: "+(e.message||e);
 }
}
function setLocalPoint(lat,lng,center=false,lookupAddress=true){
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw new Error("Ubicación inválida.");
 $("masterLocalLatitude").value=lat.toFixed(7);$("masterLocalLongitude").value=lng.toFixed(7);masterLocalsState.dirty=true;
 if(lookupAddress)masterLocalsState.source="MAP";
 else if(masterLocalsState.source!=="GOOGLE")masterLocalsState.source="MAP";
 detectLocalZone(true);drawLocalMap();if(center)masterLocalsState.map?.center([lat,lng]);
 if(lookupAddress)void reverseGeocodeLocalPoint(lat,lng);
}
function detectLocalZone(select){
 const lat=nullableNumber("masterLocalLatitude"),lng=nullableNumber("masterLocalLongitude");
 if(lat===null||lng===null){$("localZoneDetection").textContent="Selecciona una ubicación.";return;}
 const matches=masterLocalsState.zones.filter(z=>z.active&&Array.isArray(z.boundary)&&z.boundary.length>=3&&ZoneMaps.contains(z.boundary,lat,lng));
 if(select&&matches.length===1)$("masterLocalZone").value=matches[0].id;
 else if(select&&matches.length===0)$("masterLocalZone").value="";
 $("localZoneDetection").textContent=matches.length===1?"Zona detectada: "+matches[0].code+" — "+matches[0].name:
 matches.length>1?"Punto en límite compartido: selecciona una de las zonas coincidentes.":
 "Sin zona dibujada coincidente. Puedes elegir una zona sin límites; si tiene límites, el servidor verificará el punto.";
}
function drawLocalMap(){
 const map=masterLocalsState.map;if(!map)return;map.clear();
 const province=$("masterLocalProvince")?.value||"";
 masterLocalsState.zones.filter(z=>z.boundary?.length&&(!province||z.province===province||z.id===$("masterLocalZone")?.value)).forEach(z=>map.polygon(z.boundary,z.color));
 const a=nullableNumber("masterLocalLatitude"),b=nullableNumber("masterLocalLongitude");if(a!==null&&b!==null)map.marker([a,b],(lat,lng)=>setLocalPoint(lat,lng));
}
async function initLocalMap(){
 if(masterLocalsState.map){masterLocalsState.map.resize();drawLocalMap();updateGoogleSearchBias();return;}
 if(masterLocalsState.loadingMap)return;
 masterLocalsState.loadingMap=true;
 try{
   masterLocalsState.map=await ZoneMaps.create("masterLocalMap",(lat,lng)=>setLocalPoint(lat,lng,true,true));drawLocalMap();
   const l=masterLocalSelected();if(l?.latitude!=null)masterLocalsState.map.center([Number(l.latitude),Number(l.longitude)]);
   if(!masterLocalsState.map.google){$("googlePlaceStatus").textContent="Buscador Google pendiente de clave autorizada. Ya puedes seleccionar el punto en este mapa sin escribir coordenadas.";return;}
   const {PlaceAutocompleteElement}=await google.maps.importLibrary("places");
   const search=new PlaceAutocompleteElement({includedRegionCodes:["ec"],requestedLanguage:"es",requestedRegion:"EC"});
   search.placeholder="Buscar establecimiento, dirección o sector en Google";
   masterLocalsState.googleSearch=search;updateGoogleSearchBias();$("googlePlaceSearch").replaceChildren(search);
   search.addEventListener("gmp-select",async e=>{try{
     $("googlePlaceStatus").textContent="Comprobando establecimiento…";
     const place=e.placePrediction.toPlace();
     await place.fetchFields({fields:["id","displayName","formattedAddress","location","viewport"]});
     if(!place.location)throw new Error("El establecimiento no tiene ubicación.");
     const duplicate=masterLocalsState.items.find(l=>l.google_place_id===place.id&&l.id!==$("masterLocalId").value);
     if(duplicate)throw new Error("Este local ya existe: "+duplicate.name+". Ábrelo desde el listado.");
     masterLocalsState.googlePlace=place;
     $("googlePlaceDetailsBtn").disabled=false;
     $("googlePlaceStatus").textContent=(place.displayName||"Establecimiento")+" — "+(place.formattedAddress||"ubicación encontrada")+". Pulsa IMPORTAR DATOS DE GOOGLE para completar la ficha.";
   }catch(err){masterLocalsState.googlePlace=null;$("googlePlaceDetailsBtn").disabled=true;message(err.message,"error");$("googlePlaceStatus").textContent=err.message;}}); 
 }catch(e){$("googlePlaceStatus").textContent=e.message;}finally{masterLocalsState.loadingMap=false;}
}
function googlePointTime(point){
 const hour=Number(point?.hour),minute=Number(point?.minute);
 if(!Number.isInteger(hour)||!Number.isInteger(minute))return null;
 return String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0");
}
function buildGoogleScheduleDraft(openingHours){
 const days=Array.from({length:7},(_,day)=>({day,isClosed:true,opening:null,closing:null}));
 const warnings=[];
 const periods=Array.isArray(openingHours?.periods)?openingHours.periods:[];
 if(periods.length===1&&periods[0]?.open?.day===0&&Number(periods[0]?.open?.hour)===0&&Number(periods[0]?.open?.minute)===0&&!periods[0]?.close){
   days.forEach(day=>{day.isClosed=false;day.opening="00:00";day.closing="23:59";});
   warnings.push("Google indica atención 24 horas. HTPWEB la representa temporalmente como 00:00–23:59; revisa antes de guardar.");
   return {days,warnings};
 }
 const grouped=new Map();
 periods.forEach(period=>{
   const day=Number(period?.open?.day);
   if(Number.isInteger(day)&&day>=0&&day<=6){
     if(!grouped.has(day))grouped.set(day,[]);
     grouped.get(day).push(period);
   }
 });
 for(let day=0;day<7;day++){
   const entries=grouped.get(day)||[];
   if(!entries.length)continue;
   if(entries.length>1){
     warnings.push(scheduleDayNames[day]+": Google tiene "+entries.length+" franjas. No se importó automáticamente porque HTPWEB admite una sola franja por día.");
     continue;
   }
   const period=entries[0];
   const opening=googlePointTime(period.open);
   const closing=googlePointTime(period.close);
   if(!period.close){
     warnings.push(scheduleDayNames[day]+": Google no devolvió una hora de cierre. Revísalo manualmente.");
     continue;
   }
   if(Number(period.close.day)!==day){
     warnings.push(scheduleDayNames[day]+": el horario de Google cruza medianoche. No se importó automáticamente.");
     continue;
   }
   if(!opening||!closing||opening>=closing){
     warnings.push(scheduleDayNames[day]+": Google devolvió un horario que HTPWEB no puede representar automáticamente.");
     continue;
   }
   days[day]={day,isClosed:false,opening,closing};
 }
 return {days,warnings};
}
function applyGoogleScheduleDraftToEditor(localId){
 if(!masterLocalsState.googleScheduleDraft||masterLocalsState.googleScheduleDraftLocalId!==localId)return false;
 masterLocalsState.googleScheduleDraft.forEach(row=>{
   const closed=$("scheduleClosed"+row.day),open=$("scheduleOpen"+row.day),close=$("scheduleClose"+row.day);
   if(!closed||!open||!close)return;
   closed.checked=!!row.isClosed;
   open.value=row.isClosed?"":(row.opening||"");
   close.value=row.isClosed?"":(row.closing||"");
   toggleScheduleDay(row.day);
 });
 const editor=$("scheduleEditor");
 if(editor){
   const old=$("googleScheduleDraftNotice");if(old)old.remove();
   const notice=document.createElement("div");
   notice.id="googleScheduleDraftNotice";
   notice.className="workspace-note";
   notice.style.marginBottom="14px";
   const warnings=masterLocalsState.googleScheduleWarnings||[];
   notice.innerHTML="<strong>Horario importado desde Google — pendiente de guardar.</strong>"+
     "<div>Revisa los 7 días y pulsa <b>Guardar semana completa</b>.</div>"+
     (warnings.length?"<div style=\"margin-top:6px\"><b>Revisar:</b> "+warnings.map(esc).join(" · ")+"</div>":"");
   editor.prepend(notice);
 }
 return true;
}
function clearGoogleScheduleDraftForLocal(localId){
 if(masterLocalsState.googleScheduleDraftLocalId===localId)clearGoogleScheduleDraft();
}
async function loadGooglePlaceDetails(){
 const place=masterLocalsState.googlePlace;if(!place)return message("Selecciona primero un establecimiento de Google.","error");
 const button=$("googlePlaceDetailsBtn");button.disabled=true;
 try{
   $("googlePlaceStatus").textContent="Importando datos desde Google…";
   await place.fetchFields({fields:["id","displayName","formattedAddress","addressComponents","location","nationalPhoneNumber","regularOpeningHours"]});
   if(!place.location)throw new Error("Google no devolvió la ubicación del establecimiento.");

   if(place.displayName)$("masterLocalName").value=place.displayName;
   applyLocalGoogleAddress(place.formattedAddress,place.addressComponents);
   if(place.nationalPhoneNumber)$("masterLocalPhone").value=place.nationalPhoneNumber;
   $("masterLocalPlaceId").value=place.id||"";
   masterLocalsState.source="GOOGLE";
   setLocalPoint(place.location.lat(),place.location.lng(),true,false);

   const schedule=buildGoogleScheduleDraft(place.regularOpeningHours);
   masterLocalsState.googleScheduleDraft=schedule.days;
   masterLocalsState.googleScheduleDraftLocalId=$("masterLocalId").value||null;
   masterLocalsState.googleScheduleWarnings=schedule.warnings;
   masterLocalsState.dirty=true;

   const hoursFound=Array.isArray(place.regularOpeningHours?.periods);
   $("googlePlaceStatus").textContent="Datos de Google importados. "+
     (place.nationalPhoneNumber?"Teléfono cargado. ":"Google no devolvió teléfono. ")+
     (hoursFound?"Horario preparado para revisión. ":"Google no devolvió horario regular. ")+
     "Guarda el LOCAL y luego abre Horario para revisar los 7 días.";
   message("Datos de Google importados. Guarda el LOCAL antes de confirmar el horario.");
 }catch(e){
   message(e.message||"No se pudieron importar los datos de Google.","error");
   $("googlePlaceStatus").textContent=e.message||"No se pudieron importar los datos de Google.";
 }finally{button.disabled=false;}
}

async function saveMasterLocal(){
 if(masterLocalsState.busy)return;masterLocalsState.busy=true;$("masterLocalSaveBtn").disabled=true;
 try{
   const lat=nullableNumber("masterLocalLatitude"),lng=nullableNumber("masterLocalLongitude");
   if(!$("masterLocalName").value.trim())throw new Error("Escribe el nombre del local.");
   if(!$("masterLocalCity").value)throw new Error("Selecciona provincia y cantón.");
   if(!$("masterLocalBusinessCategory").value)throw new Error("Selecciona la categoría del LOCAL.");
   if(!$("masterLocalZone").value)throw new Error("Selecciona una zona.");
   if($("masterLocalActive").checked&&(lat===null||lng===null))throw new Error("Para activar el LOCAL confirma su ubicación.");
   const id=await rpc("master_save_local_v3",{
     p_local_id:$("masterLocalId").value||null,p_city_id:$("masterLocalCity").value,p_zone_id:$("masterLocalZone").value,p_business_category_id:$("masterLocalBusinessCategory").value,
     p_name:$("masterLocalName").value.trim(),p_slug:$("masterLocalSlug").value.trim(),
     p_description:$("masterLocalDescription").value.trim(),p_address:$("masterLocalAddress").value.trim(),p_phone:$("masterLocalPhone").value.trim(),p_whatsapp:$("masterLocalWhatsapp").value.trim(),
     p_latitude:lat,p_longitude:lng,p_google_place_id:$("masterLocalPlaceId").value||null,
     p_google_maps_url:lat===null?null:"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(lat+","+lng),p_location_source:masterLocalsState.source,p_active:$("masterLocalActive").checked
   });
   if(masterLocalsState.googleScheduleDraft&&masterLocalsState.googleScheduleDraftLocalId===null)masterLocalsState.googleScheduleDraftLocalId=id;
   masterLocalsState.dirty=false;$("masterLocalId").value=id;await loadScopes();await loadMasterLocals();
   fillMasterLocalForm(masterLocalsState.items.find(l=>l.id===id));showLocalEditor(true);message("Local guardado. Ya puedes configurar horario, imágenes y productos.");
 }catch(e){message(e.message,"error");}finally{masterLocalsState.busy=false;$("masterLocalSaveBtn").disabled=false;}
}
async function toggleMasterLocal(){
 const local=masterLocalSelected();if(!local||masterLocalsState.busy)return;
 if(masterLocalsState.dirty)return message("Guarda los cambios antes de cambiar el estado.","error");
 try{await rpc("master_set_local_active",{p_local_id:local.id,p_active:!local.active});await loadScopes();await loadMasterLocals();message("Estado actualizado.");}catch(e){message(e.message,"error");}
}
async function deleteMasterLocal(){
 const local=masterLocalSelected();if(!local)return;
 const typed=prompt('Para eliminar "'+local.name+'", escribe exactamente su nombre. Si tiene historial, se inactivará para proteger los pedidos.');if(typed===null)return;
 try{const r=await rpc("master_delete_local",{p_local_id:local.id,p_confirm_name:typed});masterLocalsState.dirty=false;
   await loadScopes();await loadMasterLocals();showLocalEditor(false);message(r==="DELETED"?"Local eliminado.":"Local inactivado: se conserva su historial.");
 }catch(e){message(e.message,"error");}
}
function restoreLocalPanels(){
 restoreMasterLocalMenuImport();
 for(const {node,parent,next} of [...masterLocalsState.panels].reverse())parent.insertBefore(node,next?.parentNode===parent?next:null);
 masterLocalsState.panels=[];
 for(const id of ["scheduleLocal","catalogLocal","storageLocal"]){if($(id)){$(id).disabled=false;delete $(id).dataset.localLocked;}}
}
async function openLocalTab(tab){
 const id=$("masterLocalId").value;
 if(tab!=="info"&&!id)return message("Guarda primero el local para habilitar esta pestaña.","error");
 if(tab!=="info"&&masterLocalsState.dirty)return message("Guarda la información antes de cambiar de pestaña.","error");
 restoreLocalPanels();$("localInfoPane").classList.toggle("hidden",tab!=="info");$("localRelatedPane").classList.toggle("hidden",tab==="info");
 document.querySelectorAll("[data-local-tab]").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.localTab===tab)));
 if(tab==="info"){masterLocalsState.map?.resize();return;}
 const source=tab==="schedules"?"section-schedules":tab==="catalog"?"section-catalog":"section-storage";
 const nodes=tab==="images"?[$("storageLocalCard")]:Array.from($(source).children);
 for(const node of nodes){masterLocalsState.panels.push({node,parent:node.parentNode,next:node.nextSibling});$("localRelatedPane").appendChild(node);}
 try{
   if(tab==="schedules"){$("scheduleLocal").value=id;await loadSchedules();if(applyGoogleScheduleDraftToEditor(id))message("Horario de Google cargado como borrador. Revísalo y pulsa Guardar semana completa.");}
   if(tab==="catalog"){$("catalogLocal").value=id;await loadCatalog();}
   if(tab==="images"){await loadStorage();$("storageLocal").value=id;await refreshLocalMediaPreview();await refreshLocalGallery();}
   for(const sid of ["scheduleLocal","catalogLocal","storageLocal"]){$(sid).disabled=true;$(sid).dataset.localLocked="true";}
 }catch(e){message(e.message,"error");}
}
document.addEventListener("DOMContentLoaded",bindMasterLocals);
