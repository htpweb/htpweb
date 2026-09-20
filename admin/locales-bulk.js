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

  const actions=$("importBulkLocalBtn")?.parentElement;
  if(actions&&!document.getElementById("refreshGoogleReviewsBtn")){
    actions.insertAdjacentHTML("beforeend",
      '<button id="refreshGoogleReviewsBtn" type="button" class="btn-muted">Revisar datos Google</button>'+
      '<button id="approveGoogleReviewsBtn" type="button" class="btn-primary" disabled>Aprobar horarios y publicar seleccionados</button>'
    );
    const panel=document.createElement("div");
    panel.id="bulkGoogleReviewPanel";
    panel.style.marginTop="16px";
    actions.parentElement.appendChild(panel);
    $("refreshGoogleReviewsBtn").onclick=loadBulkGoogleReviews;
    $("approveGoogleReviewsBtn").onclick=approveBulkGoogleReviews;
    loadBulkGoogleReviews().catch(()=>{});
  }
}

function downloadBulkLocalTemplate(){
  if(typeof XLSX==="undefined"){
    return message("No se cargó el componente de Excel. Actualiza la página e inténtalo de nuevo.","error");
  }

  const categories=masterLocalsState.businessCategories.filter(function(item){return item.active;});
  if(!categories.length){
    return message("Primero crea al menos una Categoría de LOCAL en MASTER → Categorías.","error");
  }

  const headers=["NOMBRE","CATEGORIA","LINK_UBICACION","TELEFONO","WHATSAPP","DESCRIPCION"];
  const wb=XLSX.utils.book_new();
  const localSheet=XLSX.utils.aoa_to_sheet([
    headers,
    ["","","","","",""]
  ]);
  localSheet["!cols"]=[
    {wch:28},{wch:22},{wch:58},{wch:18},{wch:18},{wch:42}
  ];
  XLSX.utils.book_append_sheet(wb,localSheet,"LOCALES");

  const instructions=[
    ["HTPWEB — Carga masiva de locales"],
    ["1","Completa únicamente las columnas de la hoja LOCALES. No cambies los encabezados."],
    ["2","NOMBRE, CATEGORIA y LINK_UBICACION son obligatorios."],
    ["3","CATEGORIA debe coincidir con una categoría activa creada en MASTER → Categorías."],
    ["4","En LINK_UBICACION pega el enlace compartido de Google Maps del establecimiento, por ejemplo https://maps.app.goo.gl/..."],
    ["5","HTPWEB obtiene automáticamente dirección, provincia, cantón, latitud, longitud y zona a partir del enlace."],
    ["6","Los locales se importan como BORRADOR para revisar horario, imágenes y productos antes de activarlos."],
    ["EJEMPLO","Miguelacho | Restaurante | https://maps.app.goo.gl/... | 0999999999 | 0999999999 | Comida y bebidas"]
  ];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(instructions),"INSTRUCCIONES");

  const categoryRows=[["CATEGORIA","DESCRIPCION"]].concat(
    categories.map(function(item){return [item.name,item.description||""];})
  );
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(categoryRows),"CATEGORIAS_DISPONIBLES");

  XLSX.writeFile(wb,"HTPWEB_Plantilla_Carga_Masiva_Locales.xlsx");
}

function normalizeBulkLocalLink(value){
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
      CATEGORIA:r.categoryName||r.category?.name||"",
      LINK_UBICACION:r.locationLink||"",
      TELEFONO:r.phone||"",
      WHATSAPP:r.whatsapp||"",
      DESCRIPCION:r.description||"",
      PROVINCIA_DETECTADA:r.province||"",
      CANTON_DETECTADO:r.canton||"",
      DIRECCION_DETECTADA:r.address||"",
      ZONA_DETECTADA:r.zone?.code||"",
      GOOGLE_PLACE_ID:r.placeId||"",
      ERROR:r.error||"Revisar"
    };
  });
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.json_to_sheet(data);
  ws["!cols"]=[
    {wch:8},{wch:28},{wch:22},{wch:58},{wch:18},{wch:18},{wch:42},
    {wch:22},{wch:22},{wch:48},{wch:16},{wch:30},{wch:60}
  ];
  XLSX.utils.book_append_sheet(wb,ws,"OBSERVACIONES");
  XLSX.writeFile(wb,"HTPWEB_Observaciones_Carga_Masiva_Locales.xlsx");
}

function isGoogleMapsLink(value){
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

  if(isGoogleMapsLink(query)){
    const resolved=await resolveGoogleMapsLink(query);
    if(Number.isFinite(Number(resolved.latitude))&&Number.isFinite(Number(resolved.longitude))){
      const lat=Number(resolved.latitude),lng=Number(resolved.longitude);
      const reverse=await reverseBulkCoordinates(lat,lng);
      if(reverse?.__error){
        return {
          placeId:resolved.place_id||null,
          name:resolved.search_text||query,
          address:resolved.search_text||query,
          lat,lng,
          resolvedUrl:resolved.resolved_url||query,
          addressComponents:[],
          geocodeError:reverse.__error.message||String(reverse.__error)
        };
      }
      return {
        placeId:resolved.place_id||reverse?.place_id||null,
        name:resolved.search_text||query,
        address:reverse?.formatted_address||resolved.search_text||query,
        lat,lng,
        resolvedUrl:resolved.resolved_url||query,
        addressComponents:reverse?.address_components||[]
      };
    }
    query=resolved.search_text||query;
  }

  const g=await ZoneMaps.googleAPI();
  if(!g)throw new Error("Google Maps no está disponible. Revisa la configuración de Google Cloud.");

  const lib=await google.maps.importLibrary("places");
  const AutocompleteSuggestion=lib.AutocompleteSuggestion;
  const input=[query,canton,province,"Ecuador"].filter(Boolean).join(", ");
  const response=await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input:input,
    includedRegionCodes:["ec"],
    language:"es",
    region:"EC"
  });
  const prediction=(response&&response.suggestions||[]).map(function(s){return s.placePrediction;}).find(Boolean);
  if(!prediction)throw new Error("Google no encontró el establecimiento o dirección.");
  const place=prediction.toPlace();
  await place.fetchFields({fields:["id","displayName","formattedAddress","addressComponents","location","nationalPhoneNumber","regularOpeningHours"]});
  if(!place.location)throw new Error("Google encontró el lugar, pero no devolvió coordenadas.");

  return {
    placeId:place.id||null,
    name:place.displayName||query,
    address:place.formattedAddress||query,
    lat:place.location.lat(),
    lng:place.location.lng(),
    addressComponents:place.addressComponents||[],
    phone:place.nationalPhoneNumber||"",
    openingHours:place.regularOpeningHours||null
  };
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
    const placeCache=new Map();
    const seenPlaceIds=new Map();
    const seenNameCity=new Map();

    for(let i=0;i<raw.length;i++){
      const row=raw[i];
      const result={rowNumber:i+2,valid:false,imported:false};
      try{
        result.name=bulkLocalValue(row,"NOMBRE");
        result.categoryName=bulkLocalValue(row,"CATEGORIA");
        result.locationLink=bulkLocalValue(row,"LINK_UBICACION");
        result.phone=bulkLocalValue(row,"TELEFONO");
        result.whatsapp=bulkLocalValue(row,"WHATSAPP");
        result.description=bulkLocalValue(row,"DESCRIPCION");

        if(!result.name||!result.categoryName||!result.locationLink){
          throw new Error("Faltan NOMBRE, CATEGORIA o LINK_UBICACION.");
        }
        if(!isGoogleMapsLink(result.locationLink)){
          throw new Error("LINK_UBICACION debe ser un enlace HTTPS de Google Maps.");
        }

        result.category=masterLocalsState.businessCategories.find(function(item){
          return item.active&&normalizeLocalGeoText(item.name)===normalizeLocalGeoText(result.categoryName);
        });
        if(!result.category){
          throw new Error("La categoría '"+result.categoryName+"' no existe o está inactiva.");
        }

        $("bulkLocalStatus").textContent="Validando con Google fila "+result.rowNumber+"…";
        const linkKey=normalizeBulkLocalLink(result.locationLink);
        let place=placeCache.get(linkKey);
        if(!place){
          place=await resolveBulkGooglePlace(result.locationLink);
          placeCache.set(linkKey,place);
        }
        if(!place||!Number.isFinite(Number(place.lat))||!Number.isFinite(Number(place.lng))){
          throw new Error("Google no devolvió coordenadas válidas.");
        }
        if(place.geocodeError){
          throw new Error("Se obtuvieron coordenadas, pero Google no permitió obtener provincia/cantón: "+place.geocodeError);
        }

        result.lat=Number(place.lat);
        result.lng=Number(place.lng);
        result.address=place.address||"";
        result.placeId=place.placeId||null;
        result.resolvedUrl=place.resolvedUrl||result.locationLink;
        result.googlePhone=place.phone||"";
        const scheduleInfo=normalizeGoogleSchedule(place.openingHours);
        result.googleSchedule=scheduleInfo.schedule;
        result.googleScheduleWarnings=scheduleInfo.warnings;
        result.googleScheduleReady=scheduleInfo.ready;
        if(!result.phone&&result.googlePhone)result.phone=result.googlePhone;

        const province=localAddressPart(place.addressComponents,"administrative_area_level_1");
        const canton=localAddressPart(place.addressComponents,"administrative_area_level_2");
        const locality=localAddressPart(place.addressComponents,"locality","postal_town","sublocality_level_1");
        if(!province||(!canton&&!locality)){
          throw new Error("Google no devolvió provincia/cantón suficientes para esta ubicación.");
        }

        result.city=bulkFindCity(province,canton,locality);
        if(!result.city){
          throw new Error("La provincia/cantón detectada por Google no existe todavía en HTPWEB: "+[province,canton||locality].filter(Boolean).join(" / ")+".");
        }
        result.province=result.city.province||province;
        result.canton=result.city.name||canton||locality;

        result.zone=bulkLocalZoneFor(result.lat,result.lng);

        const duplicate=masterLocalsState.items.find(function(l){
          return (result.placeId&&l.google_place_id===result.placeId)||
            (l.city_id===result.city.id&&normalizeLocalGeoText(l.name)===normalizeLocalGeoText(result.name));
        });
        if(duplicate)throw new Error("Posible duplicado: "+duplicate.name+" ya existe.");

        const placeKey=String(result.placeId||"").trim();
        if(placeKey&&seenPlaceIds.has(placeKey)){
          throw new Error("Duplicado dentro del archivo: coincide con la fila "+seenPlaceIds.get(placeKey)+" por Google Place ID.");
        }
        const nameCityKey=result.city.id+"|"+normalizeLocalGeoText(result.name);
        if(seenNameCity.has(nameCityKey)){
          throw new Error("Duplicado dentro del archivo: coincide con la fila "+seenNameCity.get(nameCityKey)+" por nombre y cantón.");
        }

        if(placeKey)seenPlaceIds.set(placeKey,result.rowNumber);
        seenNameCity.set(nameCityKey,result.rowNumber);
        result.source="GOOGLE";
        result.valid=true;
      }catch(e){
        result.error=e.message||String(e);
      }
      masterLocalsState.bulkRows.push(result);
      renderBulkLocalPreview();
    }

    renderBulkLocalPreview();
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
        const localId=await rpc("master_save_local_v3",{
          p_local_id:null,
          p_city_id:row.city.id,
          p_zone_id:row.zone.id,
          p_business_category_id:row.category.id,
          p_name:row.name,
          p_slug:"",
          p_description:row.description||"",
          p_address:row.address||"",
          p_latitude:row.lat,
          p_longitude:row.lng,
          p_phone:row.phone||"",
          p_whatsapp:row.whatsapp||"",
          p_google_place_id:row.placeId||null,
          p_google_maps_url:row.resolvedUrl||row.locationLink,
          p_location_source:"GOOGLE",
          p_active:false
        });
        row.localId=localId;
        try{
          const reviewStatus=row.googleScheduleReady?"PENDING":"REVIEW_REQUIRED";
          const warnings=(row.googleScheduleWarnings||[]).slice();
          if(!row.googleScheduleReady&&!warnings.length)warnings.push("Google no devolvió un horario semanal estructurado.");
          await rpc("master_upsert_local_google_review",{
            p_local_id:localId,
            p_phone:row.googlePhone||row.phone||"",
            p_schedule:row.googleSchedule||null,
            p_status:reviewStatus,
            p_warnings:warnings
          });
        }catch(reviewError){
          row.googleReviewError=reviewError.message||String(reviewError);
        }
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
    message(success+" locales importados como borrador"+(failed?" · "+failed+" no pudieron importarse.":"."));
  }catch(e){
    message(e.message||"No se pudo completar la carga masiva.","error");
  }finally{
    masterLocalsState.bulkBusy=false;
    renderBulkLocalPreview();
  }
}


function renderBulkGoogleReviews(items){
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
