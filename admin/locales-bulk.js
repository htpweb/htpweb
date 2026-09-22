function bulkLocalHeader(value){
  return normalizeLocalGeoText(value).replace(/\s+/g,"_").toUpperCase();
}

function bulkLocalValue(row,key){
  const target=bulkLocalHeader(key);
  const found=Object.keys(row||{}).find(function(k){return bulkLocalHeader(k)===target;});
  return found===undefined?"":String(row[found]??"").trim();
}

function bindMasterLocalBulk(){
  $("downloadBulkLocalTemplateBtn").onclick=downloadBulkLocalTemplate;
  $("downloadBulkLocalErrorsBtn").onclick=downloadBulkLocalErrors;
  $("validateBulkLocalBtn").onclick=validateBulkLocalFile;
  $("importBulkLocalBtn").onclick=importBulkLocals;
  $("downloadBulkProductTemplateBtn").onclick=downloadBulkProductTemplate;
  $("downloadBulkProductErrorsBtn").onclick=downloadBulkProductErrors;
  $("validateBulkProductBtn").onclick=validateBulkProductFile;
  $("importBulkProductBtn").onclick=importBulkProducts;
}

function downloadBulkLocalTemplate(){
  if(typeof XLSX==="undefined"){
    return message("No se cargó el componente de Excel. Actualiza la página e inténtalo de nuevo.","error");
  }

  const categories=masterLocalsState.businessCategories.filter(function(item){return item.active;});
  if(!categories.length){
    return message("Primero crea al menos una Categoría de LOCAL en MASTER → Categorías.","error");
  }

  const headers=[
    "NOMBRE","PROVINCIA","CANTON","CATEGORIA","DIRECCION_REFERENCIA",
    "LATITUD","LONGITUD","TELEFONO","WHATSAPP","DESCRIPCION","LINK_UBICACION"
  ];
  const wb=XLSX.utils.book_new();
  const localSheet=XLSX.utils.aoa_to_sheet([
    headers,
    ["","","","","","","","","","",""]
  ]);
  localSheet["!cols"]=[
    {wch:30},{wch:20},{wch:20},{wch:22},{wch:48},
    {wch:15},{wch:15},{wch:18},{wch:18},{wch:42},{wch:58}
  ];
  XLSX.utils.book_append_sheet(wb,localSheet,"LOCALES");

  const instructions=[
    ["HTPWEB — Carga masiva de locales sin dependencia de Google Maps"],
    ["1","Completa la hoja LOCALES sin cambiar los encabezados."],
    ["2","Obligatorios: NOMBRE, PROVINCIA, CANTON, CATEGORIA, DIRECCION_REFERENCIA, LATITUD y LONGITUD."],
    ["3","CATEGORIA debe coincidir con una categoría activa de MASTER → Categorías."],
    ["4","PROVINCIA y CANTON deben coincidir con un cantón activo de HTPWEB. Revisa la hoja CANTONES_DISPONIBLES."],
    ["5","LATITUD y LONGITUD determinan automáticamente la zona. No escribas la zona en el archivo."],
    ["6","LINK_UBICACION es opcional y sirve solo como referencia externa; HTPWEB no lo consulta para importar."],
    ["7","TELEFONO y WHATSAPP son opcionales, pero si se completan deben contener entre 7 y 15 dígitos."],
    ["8","Los LOCAL se importan como BORRADOR. Luego puedes revisar horarios, imágenes y productos antes de activarlos."],
    ["EJEMPLO","Restaurante Ejemplo | Esmeraldas | Esmeraldas | Restaurantes | Av. Principal, frente al parque | 0.9680000 | -79.6510000 | 062000000 | 0990000000 | Comida y bebidas | https://maps.google.com/..."]
  ];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(instructions),"INSTRUCCIONES");

  const categoryRows=[["CATEGORIA","DESCRIPCION"]].concat(
    categories.map(function(item){return [item.name,item.description||""];})
  );
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(categoryRows),"CATEGORIAS_DISPONIBLES");

  const cityRows=[["PROVINCIA","CANTON","PAIS"]].concat(
    (state.cities||[]).filter(function(city){return city.active;})
      .sort(function(a,b){return String(a.province||"").localeCompare(String(b.province||""))||String(a.name||"").localeCompare(String(b.name||""));})
      .map(function(city){return [city.province||"",city.name||"",city.country||"Ecuador"];})
  );
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(cityRows),"CANTONES_DISPONIBLES");

  const zoneRows=[["ZONA","NOMBRE","PROVINCIA_REFERENCIA","CANTON_REFERENCIA"]].concat(
    (masterLocalsState.zones||[]).filter(function(zone){return zone.active;})
      .map(function(zone){return [zone.code||"",zone.name||"",zone.province||"",zone.city_name||""];})
  );
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(zoneRows),"ZONAS_REFERENCIA");

  XLSX.writeFile(wb,"HTPWEB_Plantilla_Carga_Masiva_Locales.xlsx");
}

function normalizeBulkImportPhone(value,label){
  const raw=String(value||"").trim();
  if(!raw)return "";
  const digits=raw.replace(/\D/g,"");
  if(digits.length<7||digits.length>15){
    throw new Error(label+" inválido: debe contener entre 7 y 15 dígitos.");
  }
  return raw;
}

function validateOptionalLocationUrl(value){
  const raw=String(value||"").trim();
  if(!raw)return "";
  let url;
  try{url=new URL(raw);}catch{throw new Error("LINK_UBICACION no es una URL válida.");}
  if(!["http:","https:"].includes(url.protocol)){
    throw new Error("LINK_UBICACION debe usar HTTP o HTTPS.");
  }
  return raw;
}

function normalizeBulkLocalLink(value){function normalizeBulkLocalLink(value){
  try{
    const url=new URL(String(value||"").trim());
    const pathname=url.pathname.replace(/\/+$/,"")||"/";
    return url.protocol+"//"+url.hostname.toLowerCase()+pathname+url.search;
  }catch{
    return String(value||"").trim();
  }
}

function downloadBulkLocalErrors(){
  if(typeof XLSX==="undefined"){
    return message("No se cargó el componente de Excel. Actualiza la página e inténtalo de nuevo.","error");
  }
  const rows=(masterLocalsState.bulkRows||[]).filter(function(r){return !r.valid&&!r.imported;});
  if(!rows.length)return message("No hay observaciones para descargar.","error");

  const data=rows.map(function(r){
    return {
      FILA:r.rowNumber,
      NOMBRE:r.name||"",
      PROVINCIA:r.province||"",
      CANTON:r.canton||"",
      CATEGORIA:r.categoryName||r.category?.name||"",
      DIRECCION_REFERENCIA:r.address||"",
      LATITUD:Number.isFinite(r.lat)?r.lat:"",
      LONGITUD:Number.isFinite(r.lng)?r.lng:"",
      TELEFONO:r.phone||"",
      WHATSAPP:r.whatsapp||"",
      DESCRIPCION:r.description||"",
      LINK_UBICACION:r.locationLink||"",
      ZONA_DETECTADA:r.zone?.code||"",
      ERROR:r.error||"Revisar"
    };
  });
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.json_to_sheet(data);
  ws["!cols"]=[
    {wch:8},{wch:28},{wch:20},{wch:20},{wch:22},{wch:48},{wch:15},{wch:15},
    {wch:18},{wch:18},{wch:42},{wch:58},{wch:16},{wch:60}
  ];
  XLSX.utils.book_append_sheet(wb,ws,"OBSERVACIONES");
  XLSX.writeFile(wb,"HTPWEB_Observaciones_Carga_Masiva_Locales.xlsx");
}

function isGoogleMapsLink(value){function isGoogleMapsLink(value){
  try{
    const url=new URL(String(value||"").trim());
    const host=url.hostname.toLowerCase();
    return url.protocol==="https:"&&(
      host==="maps.app.goo.gl"||
      host==="goo.gl"||
      host==="google.com"||
      host==="www.google.com"||
      host==="maps.google.com"
    );
  }catch{return false;}
}

async function resolveGoogleMapsLink(value){
  const {data,error}=await supabaseClient.functions.invoke("resolver-google-maps",{body:{url:value}});
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.error||"No se pudo resolver el enlace de Google Maps.");
  return data;
}

async function reverseBulkCoordinates(lat,lng){
  try{
    const g=await ZoneMaps.googleAPI();
    if(!g)return null;
    const {Geocoder}=await google.maps.importLibrary("geocoding");
    const geocoder=new Geocoder();
    const response=await geocoder.geocode({location:{lat,lng}});
    return response?.results?.[0]||null;
  }catch(e){
    return {__error:e};
  }
}


function googleTimeText(point){
  if(!point)return null;
  const h=String(Number(point.hour??point.hours??0)).padStart(2,"0");
  const m=String(Number(point.minute??point.minutes??0)).padStart(2,"0");
  return h+":"+m;
}

function normalizeGoogleSchedule(openingHours){
  const periods=Array.isArray(openingHours?.periods)?openingHours.periods:[];
  const byDay=Array.from({length:7},()=>[]);
  const warnings=[];
  for(const period of periods){
    const open=period?.open,close=period?.close;
    if(!open||!Number.isInteger(Number(open.day))||Number(open.day)<0||Number(open.day)>6){
      warnings.push("Google devolvió un período sin día de apertura válido.");
      continue;
    }
    const day=Number(open.day);
    if(!close){
      warnings.push("Horario 24 horas o sin cierre: requiere revisión manual.");
      byDay[day].push({unsupported:true});
      continue;
    }
    if(Number(close.day)!==day){
      warnings.push("Horario nocturno que cruza de día: requiere revisión manual.");
      byDay[day].push({unsupported:true});
      continue;
    }
    const opening=googleTimeText(open),closing=googleTimeText(close);
    if(!opening||!closing||opening>=closing){
      warnings.push("Horario no compatible con el modelo semanal de HTPWEB.");
      byDay[day].push({unsupported:true});
      continue;
    }
    byDay[day].push({opening_time:opening,closing_time:closing});
  }

  const schedule=[];
  for(let day=0;day<7;day++){
    const slots=byDay[day].filter(Boolean);
    if(slots.length===0){
      schedule.push({day_of_week:day,is_closed:true,opening_time:null,closing_time:null});
    }else if(slots.length===1&&!slots[0].unsupported){
      schedule.push({day_of_week:day,is_closed:false,opening_time:slots[0].opening_time,closing_time:slots[0].closing_time});
    }else{
      warnings.push("El día "+day+" tiene horario partido o ambiguo y requiere revisión manual.");
    }
  }
  const ready=schedule.length===7&&warnings.length===0&&periods.length>0;
  return {schedule:ready?schedule:null,warnings:Array.from(new Set(warnings)),ready};
}

async function resolveBulkGooglePlace(query,province="",canton=""){
  if(!query)return null;

  let linkFallback=null;
  if(isGoogleMapsLink(query)){
    const resolved=await resolveGoogleMapsLink(query);
    if(Number.isFinite(Number(resolved.latitude))&&Number.isFinite(Number(resolved.longitude))){
      linkFallback={
        placeId:resolved.place_id||null,
        name:resolved.search_text||query,
        address:resolved.search_text||query,
        lat:Number(resolved.latitude),
        lng:Number(resolved.longitude),
        resolvedUrl:resolved.resolved_url||query,
        addressComponents:[]
      };
    }
    query=resolved.search_text||query;
  }

  const g=await ZoneMaps.googleAPI();
  if(!g)throw new Error("Google Maps no está disponible. Revisa la configuración de Google Cloud.");

  const lib=await google.maps.importLibrary("places");
  const AutocompleteSuggestion=lib.AutocompleteSuggestion;
  const input=[query,canton,province,"Ecuador"].filter(Boolean).join(", ");
  const request={
    input:input,
    includedRegionCodes:["ec"],
    language:"es",
    region:"EC"
  };
  if(linkFallback){
    request.locationBias={lat:linkFallback.lat,lng:linkFallback.lng};
  }

  let response;
  try{
    response=await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
  }catch(error){
    if(!linkFallback)throw error;
    response=null;
  }
  const predictions=(response&&response.suggestions||[]).map(function(s){return s.placePrediction;}).filter(Boolean);
  let best=null;

  for(const prediction of predictions.slice(0,5)){
    const candidate=prediction.toPlace();
    await candidate.fetchFields({fields:["id","displayName","formattedAddress","addressComponents","location","nationalPhoneNumber","regularOpeningHours"]});
    if(!candidate.location)continue;
    const lat=candidate.location.lat(),lng=candidate.location.lng();
    const distance=linkFallback
      ?Math.hypot(lat-linkFallback.lat,lng-linkFallback.lng)
      :0;
    if(!best||distance<best.distance)best={place:candidate,distance};
  }

  if(best?.place){
    const place=best.place;
    return {
      placeId:place.id||linkFallback?.placeId||null,
      name:place.displayName||query,
      address:place.formattedAddress||linkFallback?.address||query,
      lat:place.location.lat(),
      lng:place.location.lng(),
      resolvedUrl:linkFallback?.resolvedUrl||null,
      addressComponents:place.addressComponents||[],
      phone:place.nationalPhoneNumber||"",
      openingHours:place.regularOpeningHours||null
    };
  }

  if(linkFallback){
    return {
      ...linkFallback,
      addressComponents:[
        {longText:"Esmeraldas",shortText:"Esmeraldas",types:["administrative_area_level_1"]},
        {longText:"Esmeraldas",shortText:"Esmeraldas",types:["administrative_area_level_2"]},
        {longText:"Esmeraldas",shortText:"Esmeraldas",types:["locality"]}
      ],
      geocodeFallback:true,
      phone:"",
      openingHours:null
    };
  }

  throw new Error("Google no encontró el establecimiento o dirección.");
}

function bulkFindCity(province,canton,locality){
  const provinceKey=normalizeLocalGeoText(province);
  const candidates=[canton,locality].map(normalizeLocalGeoText).filter(Boolean);
  const provinceCities=state.cities.filter(function(city){
    return city.active&&normalizeLocalGeoText(city.province)===provinceKey;
  });
  let match=provinceCities.find(function(city){
    return candidates.includes(normalizeLocalGeoText(city.name));
  });
  if(!match)match=provinceCities.find(function(city){
    const cityKey=normalizeLocalGeoText(city.name);
    return candidates.some(function(value){
      return value&&cityKey&&(value.includes(cityKey)||cityKey.includes(value));
    });
  });
  return match||null;
}

function bulkLocalZoneFor(lat,lng){
  const matches=masterLocalsState.zones.filter(function(z){
    return z.active&&Array.isArray(z.boundary)&&z.boundary.length>=3&&ZoneMaps.contains(z.boundary,lat,lng);
  });
  if(matches.length===1)return matches[0];
  if(matches.length>1)throw new Error("La ubicación cae en más de una zona HTPWEB. Revisa los polígonos superpuestos.");
  throw new Error("La ubicación no cae dentro de ninguna zona HTPWEB dibujada.");
}

function renderBulkLocalPreview(){
  const rows=masterLocalsState.bulkRows||[];
  const ok=rows.filter(function(r){return r.valid&&!r.imported;}).length;
  const imported=rows.filter(function(r){return r.imported;}).length;
  const bad=rows.filter(function(r){return !r.valid;}).length;

  $("bulkLocalStatus").textContent=masterLocalsState.bulkFileName
    ? masterLocalsState.bulkFileName+" · "+rows.length+" filas revisadas"
    : "Todavía no has cargado una plantilla.";
  $("importBulkLocalBtn").disabled=masterLocalsState.bulkBusy||ok===0;
  $("downloadBulkLocalErrorsBtn").disabled=masterLocalsState.bulkBusy||bad===0;

  if(!rows.length){
    $("bulkLocalPreview").innerHTML="";
    return;
  }

  const body=rows.map(function(r){
    const statusClass=r.imported?"bulk-status-ok":(r.valid?"bulk-status-ok":"bulk-status-error");
    const status=r.imported?"Importado":(r.valid?"Listo":(r.error||"Revisar"));
    return "<tr>"+
      "<td>"+esc(r.rowNumber)+"</td>"+
      "<td>"+esc(r.name||"")+"</td>"+
      "<td>"+esc(r.category?.name||r.categoryName||"")+"</td>"+
      "<td>"+esc((r.province||"")+" / "+(r.canton||""))+"</td>"+
      "<td>"+esc(r.address||"")+"</td>"+
      "<td>"+esc((r.zone&&r.zone.code)||"—")+"</td>"+
      "<td class=\""+statusClass+"\">"+esc(status)+"</td>"+
      "</tr>";
  }).join("");

  $("bulkLocalPreview").innerHTML=
    "<div class=\"bulk-local-summary\">"+
      "<span>Listos: <strong>"+ok+"</strong></span>"+
      "<span>Con observaciones: <strong>"+bad+"</strong></span>"+
      "<span>Importados: <strong>"+imported+"</strong></span>"+
    "</div>"+
    "<div class=\"table-wrap bulk-local-table\"><table>"+
      "<thead><tr><th>Fila</th><th>Local</th><th>Categoría</th><th>Provincia / Cantón</th><th>Dirección</th><th>Zona</th><th>Estado</th></tr></thead>"+
      "<tbody>"+body+"</tbody></table></div>";
}

async function validateBulkLocalFile(){
  if(masterLocalsState.bulkBusy)return;
  const file=$("bulkLocalFile")&&$("bulkLocalFile").files&&$("bulkLocalFile").files[0];
  if(!file)return message("Selecciona primero la plantilla Excel.","error");
  if(typeof XLSX==="undefined")return message("No se cargó el componente de Excel. Actualiza la página e inténtalo de nuevo.","error");

  masterLocalsState.bulkBusy=true;
  $("validateBulkLocalBtn").disabled=true;
  $("importBulkLocalBtn").disabled=true;

  try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});
    const sheet=wb.Sheets.LOCALES||wb.Sheets[wb.SheetNames[0]];
    if(!sheet)throw new Error("El archivo no contiene la hoja LOCALES.");
    const raw=XLSX.utils.sheet_to_json(sheet,{defval:""});
    if(!raw.length)throw new Error("La hoja LOCALES está vacía.");
    if(raw.length>500)throw new Error("La carga permite hasta 500 locales por archivo.");
    if(!masterLocalsState.businessCategories.some(function(item){return item.active;})){
      throw new Error("Primero crea al menos una Categoría de LOCAL en MASTER → Categorías.");
    }

    masterLocalsState.bulkFileName=file.name;
    masterLocalsState.bulkRows=[];
    const seenNameCity=new Map();

    for(let i=0;i<raw.length;i++){
      const row=raw[i];
      const result={rowNumber:i+2,valid:false,imported:false};
      try{
        result.name=bulkLocalValue(row,"NOMBRE");
        result.province=bulkLocalValue(row,"PROVINCIA");
        result.canton=bulkLocalValue(row,"CANTON");
        result.categoryName=bulkLocalValue(row,"CATEGORIA");
        result.address=
          bulkLocalValue(row,"DIRECCION_REFERENCIA")||
          bulkLocalValue(row,"DIRECCION_Y_REFERENCIA")||
          bulkLocalValue(row,"DIRECCION");
        result.latitudeText=bulkLocalValue(row,"LATITUD");
        result.longitudeText=bulkLocalValue(row,"LONGITUD");
        result.phone=normalizeBulkImportPhone(bulkLocalValue(row,"TELEFONO"),"TELEFONO");
        result.whatsapp=normalizeBulkImportPhone(bulkLocalValue(row,"WHATSAPP"),"WHATSAPP");
        result.description=bulkLocalValue(row,"DESCRIPCION");
        result.locationLink=validateOptionalLocationUrl(bulkLocalValue(row,"LINK_UBICACION"));

        if(!result.name||!result.province||!result.canton||!result.categoryName||!result.address||!result.latitudeText||!result.longitudeText){
          throw new Error("Faltan campos obligatorios: NOMBRE, PROVINCIA, CANTON, CATEGORIA, DIRECCION_REFERENCIA, LATITUD o LONGITUD.");
        }

        result.lat=Number(String(result.latitudeText).replace(",","."));
        result.lng=Number(String(result.longitudeText).replace(",","."));
        if(!Number.isFinite(result.lat)||result.lat<-90||result.lat>90)throw new Error("LATITUD inválida.");
        if(!Number.isFinite(result.lng)||result.lng<-180||result.lng>180)throw new Error("LONGITUD inválida.");

        result.category=masterLocalsState.businessCategories.find(function(item){
          return item.active&&normalizeLocalGeoText(item.name)===normalizeLocalGeoText(result.categoryName);
        });
        if(!result.category){
          throw new Error("La categoría '"+result.categoryName+"' no existe o está inactiva.");
        }

        result.city=bulkFindCity(result.province,result.canton,result.canton);
        if(!result.city){
          throw new Error("La provincia/cantón no existe o está inactiva en HTPWEB: "+result.province+" / "+result.canton+".");
        }
        result.province=result.city.province||result.province;
        result.canton=result.city.name||result.canton;

        // Vista previa rápida en navegador. Supabase vuelve a calcular y validar
        // la zona al importar, por lo que este dato no se puede manipular para
        // guardar un LOCAL fuera de su polígono.
        result.zone=bulkLocalZoneFor(result.lat,result.lng);

        const duplicate=masterLocalsState.items.find(function(local){
          return local.city_id===result.city.id&&normalizeLocalGeoText(local.name)===normalizeLocalGeoText(result.name);
        });
        if(duplicate)throw new Error("Posible duplicado: "+duplicate.name+" ya existe en "+result.canton+".");

        const nameCityKey=result.city.id+"|"+normalizeLocalGeoText(result.name);
        if(seenNameCity.has(nameCityKey)){
          throw new Error("Duplicado dentro del archivo: coincide con la fila "+seenNameCity.get(nameCityKey)+" por nombre y cantón.");
        }
        seenNameCity.set(nameCityKey,result.rowNumber);

        result.source="IMPORT";
        result.valid=true;
      }catch(e){
        result.error=e.message||String(e);
      }

      masterLocalsState.bulkRows.push(result);
      renderBulkLocalPreview();
    }

    renderBulkLocalPreview();
    message("Plantilla validada sin consultar Google Maps. La zona se recalculará en Supabase al importar.");
  }catch(e){
    masterLocalsState.bulkRows=[];
    renderBulkLocalPreview();
    message(e.message||"No se pudo validar la plantilla.","error");
  }finally{
    masterLocalsState.bulkBusy=false;
    $("validateBulkLocalBtn").disabled=false;
    renderBulkLocalPreview();
  }
}

async function importBulkLocals(){
  if(masterLocalsState.bulkBusy)return;
  const pending=(masterLocalsState.bulkRows||[]).filter(function(r){return r.valid&&!r.imported;});
  if(!pending.length)return message("No hay locales válidos pendientes de importar.","error");

  masterLocalsState.bulkBusy=true;
  $("importBulkLocalBtn").disabled=true;
  let success=0;
  let failed=0;

  try{
    for(const row of pending){
      try{
        const localId=await rpc("master_save_local_import_v1",{
          p_city_id:row.city.id,
          p_business_category_id:row.category.id,
          p_name:row.name,
          p_description:row.description||"",
          p_address:row.address||"",
          p_latitude:row.lat,
          p_longitude:row.lng,
          p_phone:row.phone||"",
          p_whatsapp:row.whatsapp||"",
          p_location_url:row.locationLink||null
        });
        row.localId=localId;
        row.imported=true;
        success++;
      }catch(e){
        row.valid=false;
        row.error=e.message||String(e);
        failed++;
      }
      renderBulkLocalPreview();
    }

    await loadScopes();
    masterLocalsState.items=(await rpc("master_list_locals"))||[];
    renderMasterLocalList();
    renderBulkProductLocalOptions();
    message(success+" locales importados como borrador sin consultar Google Maps"+(failed?" · "+failed+" no pudieron importarse.":"."));
  }catch(e){
    message(e.message||"No se pudo completar la carga masiva.","error");
  }finally{
    masterLocalsState.bulkBusy=false;
    renderBulkLocalPreview();
  }
}


function renderBulkGoogleReviews(items){function renderBulkGoogleReviews(items){
  const panel=document.getElementById("bulkGoogleReviewPanel");
  const approve=document.getElementById("approveGoogleReviewsBtn");
  if(!panel)return;
  const pending=(items||[]).filter(x=>x.status==="PENDING");
  const review=(items||[]).filter(x=>x.status==="REVIEW_REQUIRED");
  const approved=(items||[]).filter(x=>x.status==="APPROVED");
  if(approve)approve.disabled=pending.length===0;
  if(!(items||[]).length){
    panel.innerHTML='<div class="muted">No hay revisiones Google pendientes.</div>';
    return;
  }
  panel.innerHTML=
    '<div class="bulk-local-summary"><span>Listos para aprobar: <strong>'+pending.length+'</strong></span><span>Revisión manual: <strong>'+review.length+'</strong></span><span>Aprobados: <strong>'+approved.length+'</strong></span></div>'+
    '<div class="table-wrap"><table><thead><tr><th></th><th>LOCAL</th><th>Teléfono Google</th><th>Horario</th><th>Estado</th></tr></thead><tbody>'+
    (items||[]).map(function(r){
      const selectable=r.status==="PENDING";
      const warning=(r.warnings||[]).join(" · ");
      return '<tr>'+
        '<td>'+(selectable?'<input class="google-review-check" type="checkbox" value="'+esc(r.local_id)+'" checked>':'')+'</td>'+
        '<td>'+esc(r.local_name||"")+'</td>'+
        '<td>'+esc(r.phone||"—")+'</td>'+
        '<td>'+esc(r.status==="PENDING"?"Semana compatible":(warning||"Revisar manualmente"))+'</td>'+
        '<td>'+esc(r.status)+'</td>'+
      '</tr>';
    }).join("")+
    '</tbody></table></div>';
}

async function loadBulkGoogleReviews(){
  const panel=document.getElementById("bulkGoogleReviewPanel");
  if(panel)panel.innerHTML='<div class="muted">Consultando revisiones Google…</div>';
  const items=(await rpc("master_list_local_google_reviews"))||[];
  masterLocalsState.googleBulkReviews=items;
  renderBulkGoogleReviews(items);
}

async function approveBulkGoogleReviews(){
  const checks=[...document.querySelectorAll(".google-review-check:checked")];
  const ids=checks.map(x=>x.value).filter(Boolean);
  if(!ids.length)return message("Selecciona al menos un LOCAL listo para aprobar.","error");
  const btn=document.getElementById("approveGoogleReviewsBtn");
  if(btn)btn.disabled=true;
  try{
    const result=await rpc("master_approve_local_google_reviews",{p_local_ids:ids,p_publish:true});
    await loadScopes();
    masterLocalsState.items=(await rpc("master_list_locals"))||[];
    renderMasterLocalList();
    await loadBulkGoogleReviews();
    message((result?.approved||0)+" locales: horario Google aprobado y LOCAL publicado"+((result?.skipped||0)?" · "+result.skipped+" omitidos.":"."));
  }catch(e){
    message(e.message||"No se pudo aprobar la revisión Google.","error");
  }finally{
    if(btn)btn.disabled=false;
  }
}


function bulkProductNormalizeKey(value){
  return String(value||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function bulkProductBoolText(value){
  return ["si","sí","true","1"].includes(String(value||"si").toLowerCase())?"si":"no";
}

function renderBulkProductLocalOptions(){
  const select=$("bulkProductLocal");
  if(!select)return;
  const current=select.value;
  select.innerHTML=(masterLocalsState.items||[]).map(function(local){
    return '<option value="'+esc(local.id)+'">'+esc(local.name)+(local.active?"":" · borrador")+'</option>';
  }).join("")||'<option value="">Sin LOCAL disponible</option>';
  if(current&&masterLocalsState.items.some(l=>l.id===current))select.value=current;
}

function normalizeBulkProductRows(input){
  const aliases={
    categoria:"categoria",category:"categoria",
    producto:"producto",product:"producto",nombre:"producto",
    descripcion:"descripcion",description:"descripcion",
    precio:"precio",price:"precio",
    imagen_url:"imagen_url",imagen:"imagen_url",image_url:"imagen_url",
    variante:"variante",variant:"variante",
    precio_variante:"precio_variante",variant_price:"precio_variante",
    orden:"orden",order:"orden",activo:"activo",active:"activo"
  };
  const valid=[],bad=[],seen=new Map();

  (input||[]).forEach(function(raw,index){
    const rowNumber=index+2;
    const out={categoria:"",producto:"",descripcion:"",precio:"",imagen_url:"",variante:"",precio_variante:"",orden:"0",activo:"si",rowNumber,valid:false,error:""};
    try{
      Object.entries(raw||{}).forEach(function(entry){
        const key=aliases[bulkProductNormalizeKey(entry[0])];
        if(key)out[key]=String(entry[1]??"").trim();
      });
      if(!out.producto)throw new Error("Producto vacío.");
      const price=Number(out.precio.replace(",","."));
      if(!Number.isFinite(price)||price<0)throw new Error("Precio inválido.");
      out.precio=price.toFixed(2);

      const order=Number(out.orden||0);
      if(!Number.isInteger(order)||order<0)throw new Error("Orden inválido.");
      out.orden=String(order);

      if(!["si","sí","true","1","no","false","0"].includes(out.activo.toLowerCase())){
        throw new Error("Activo debe ser Sí/No.");
      }
      out.activo=bulkProductBoolText(out.activo);

      if(out.imagen_url){
        let url;
        try{url=new URL(out.imagen_url);}catch{throw new Error("IMAGEN_URL no es una URL válida.");}
        if(!["http:","https:"].includes(url.protocol))throw new Error("IMAGEN_URL debe usar HTTP/HTTPS.");
      }

      if(out.variante){
        const variantPrice=Number(out.precio_variante.replace(",","."));
        if(!Number.isFinite(variantPrice)||variantPrice<0){
          throw new Error("La variante requiere PRECIO_VARIANTE válido.");
        }
        out.precio_variante=variantPrice.toFixed(2);
      }else{
        out.precio_variante="";
      }

      const duplicateKey=bulkProductNormalizeKey(out.producto)+"|"+bulkProductNormalizeKey(out.variante);
      if(seen.has(duplicateKey)){
        throw new Error("Duplicado dentro del archivo: coincide con la fila "+seen.get(duplicateKey)+".");
      }
      seen.set(duplicateKey,rowNumber);
      out.valid=true;
      valid.push(out);
    }catch(e){
      out.error=e.message||String(e);
      bad.push(out);
    }
  });

  return {valid,bad};
}

function parseBulkProductCSV(text){
  const lines=String(text||"").replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());
  if(!lines.length)return [];
  const parse=function(line){
    const values=[];let value="",quoted=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){
        if(quoted&&line[i+1]==='"'){value+='"';i++;}
        else quoted=!quoted;
      }else if(ch===","&&!quoted){
        values.push(value);value="";
      }else value+=ch;
    }
    values.push(value);
    return values;
  };
  const headers=parse(lines.shift());
  return lines.map(function(line){
    const values=parse(line);
    return Object.fromEntries(headers.map((key,index)=>[key,values[index]??""]));
  });
}

async function readBulkProductFile(file){
  if(!file)throw new Error("Selecciona un archivo de productos.");
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  if(ext==="csv")return parseBulkProductCSV(await file.text());
  if(!["xlsx","xls"].includes(ext))throw new Error("Formato no permitido. Usa CSV o XLSX.");
  if(typeof XLSX==="undefined")throw new Error("No se cargó el componente de Excel.");
  const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});
  const ws=wb.Sheets.PRODUCTOS||wb.Sheets[wb.SheetNames[0]];
  if(!ws)return [];
  return XLSX.utils.sheet_to_json(ws,{defval:""});
}

function renderBulkProductPreview(){
  const valid=masterLocalsState.productBulkRows||[];
  const bad=masterLocalsState.productBulkErrors||[];
  const all=[...valid,...bad].sort((a,b)=>a.rowNumber-b.rowNumber);
  $("bulkProductStatus").textContent=masterLocalsState.productBulkFileName
    ? masterLocalsState.productBulkFileName+" · "+valid.length+" válidas · "+bad.length+" con observaciones"
    : "Todavía no has cargado una plantilla de productos.";
  $("importBulkProductBtn").disabled=masterLocalsState.productBulkBusy||valid.length===0;
  $("downloadBulkProductErrorsBtn").disabled=masterLocalsState.productBulkBusy||bad.length===0;

  if(!all.length){
    $("bulkProductPreview").innerHTML="";
    return;
  }

  $("bulkProductPreview").innerHTML=
    '<div class="table-wrap"><table><thead><tr><th>Fila</th><th>Categoría</th><th>Producto</th><th>Precio</th><th>Variante</th><th>Precio variante</th><th>Estado</th></tr></thead><tbody>'+
    all.slice(0,200).map(function(row){
      return '<tr><td>'+esc(row.rowNumber)+'</td><td>'+esc(row.categoria||"")+'</td><td>'+esc(row.producto||"")+'</td><td>'+esc(row.precio||"")+'</td><td>'+esc(row.variante||"—")+'</td><td>'+esc(row.precio_variante||"—")+'</td><td class="'+(row.valid?"bulk-status-ok":"bulk-status-error")+'">'+esc(row.valid?"Lista":row.error||"Revisar")+'</td></tr>';
    }).join("")+
    '</tbody></table></div>'+
    (all.length>200?'<p class="muted">Mostrando las primeras 200 filas.</p>':"");
}

async function validateBulkProductFile(){
  if(masterLocalsState.productBulkBusy)return;
  const file=$("bulkProductFile")?.files?.[0];
  masterLocalsState.productBulkBusy=true;
  $("validateBulkProductBtn").disabled=true;
  try{
    const parsed=normalizeBulkProductRows(await readBulkProductFile(file));
    if(parsed.valid.length+parsed.bad.length===0)throw new Error("El archivo no contiene filas.");
    if(parsed.valid.length+parsed.bad.length>1000)throw new Error("Máximo 1000 filas por importación.");
    masterLocalsState.productBulkFileName=file.name;
    masterLocalsState.productBulkRows=parsed.valid;
    masterLocalsState.productBulkErrors=parsed.bad;
    renderBulkProductPreview();
    message(parsed.bad.length
      ?"Productos revisados. Puedes importar únicamente las filas válidas y descargar las observaciones."
      :"Productos validados. Revisa la vista previa antes de importar.");
  }catch(e){
    masterLocalsState.productBulkRows=[];
    masterLocalsState.productBulkErrors=[];
    masterLocalsState.productBulkFileName="";
    renderBulkProductPreview();
    message(e.message||"No se pudo validar la plantilla de productos.","error");
  }finally{
    masterLocalsState.productBulkBusy=false;
    $("validateBulkProductBtn").disabled=false;
    renderBulkProductPreview();
  }
}

function downloadBulkProductTemplate(){
  if(typeof XLSX==="undefined")return message("No se cargó el componente de Excel.","error");
  const data=[
    {categoria:"Hamburguesas",producto:"Clásica",descripcion:"Carne, queso y vegetales",precio:"4.50",imagen_url:"",variante:"Normal",precio_variante:"4.50",orden:"0",activo:"Sí"},
    {categoria:"Hamburguesas",producto:"Clásica",descripcion:"Carne, queso y vegetales",precio:"4.50",imagen_url:"",variante:"Grande",precio_variante:"6.00",orden:"1",activo:"Sí"},
    {categoria:"Bebidas",producto:"Cola 500 ml",descripcion:"",precio:"1.25",imagen_url:"",variante:"",precio_variante:"",orden:"0",activo:"Sí"}
  ];
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.json_to_sheet(data);
  ws["!cols"]=[{wch:22},{wch:28},{wch:42},{wch:12},{wch:45},{wch:22},{wch:18},{wch:10},{wch:10}];
  XLSX.utils.book_append_sheet(wb,ws,"PRODUCTOS");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
    ["HTPWEB — Carga masiva de productos"],
    ["1","Selecciona el LOCAL destino antes de importar."],
    ["2","Cada fila representa un producto o una variante."],
    ["3","Para varias variantes, repite PRODUCTO y usa una VARIANTE distinta."],
    ["4","Si el producto ya existe en el LOCAL, se actualiza en lugar de duplicarse."],
    ["5","Sin marcar Publicar, productos y variantes quedan inactivos para revisión."],
    ["6","IMAGEN_URL es opcional y debe usar HTTP o HTTPS."]
  ]),"INSTRUCCIONES");
  XLSX.writeFile(wb,"HTPWEB_Plantilla_Carga_Masiva_Productos.xlsx");
}

function downloadBulkProductErrors(){
  const rows=masterLocalsState.productBulkErrors||[];
  if(!rows.length)return message("No hay observaciones de productos para descargar.","error");
  if(typeof XLSX==="undefined")return message("No se cargó el componente de Excel.","error");
  const data=rows.map(function(row){
    return {
      FILA:row.rowNumber,CATEGORIA:row.categoria,PRODUCTO:row.producto,DESCRIPCION:row.descripcion,
      PRECIO:row.precio,IMAGEN_URL:row.imagen_url,VARIANTE:row.variante,
      PRECIO_VARIANTE:row.precio_variante,ORDEN:row.orden,ACTIVO:row.activo,ERROR:row.error
    };
  });
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),"OBSERVACIONES");
  XLSX.writeFile(wb,"HTPWEB_Observaciones_Carga_Masiva_Productos.xlsx");
}

async function importBulkProducts(){
  if(masterLocalsState.productBulkBusy)return;
  const localId=$("bulkProductLocal")?.value;
  const rows=masterLocalsState.productBulkRows||[];
  if(!localId)return message("Selecciona el LOCAL destino.","error");
  if(!rows.length)return message("Primero valida un archivo de productos.","error");

  masterLocalsState.productBulkBusy=true;
  $("importBulkProductBtn").disabled=true;
  try{
    const payload=rows.map(function(row){
      const copy={...row};delete copy.rowNumber;delete copy.valid;delete copy.error;return copy;
    });
    const publish=$("bulkProductPublish")?.checked===true;
    const result=await rpc("bulk_import_local_catalog_v2",{
      p_local_id:localId,p_rows:payload,p_publish:publish
    });
    message(
      "Importación completada: "+(result?.products_created||0)+" productos creados, "+
      (result?.products_updated||0)+" actualizados, "+(result?.variants_created||0)+" variantes creadas, "+
      (result?.variants_updated||0)+" variantes actualizadas"+
      (publish?". Publicados según la columna ACTIVO.":". Quedaron en borrador/inactivos para revisión.")
    );
    masterLocalsState.productBulkRows=[];
    masterLocalsState.productBulkErrors=[];
    masterLocalsState.productBulkFileName="";
    if($("bulkProductFile"))$("bulkProductFile").value="";
    renderBulkProductPreview();
  }catch(e){
    message(e.message||"No se pudo importar el catálogo.","error");
  }finally{
    masterLocalsState.productBulkBusy=false;
    renderBulkProductPreview();
  }
}
