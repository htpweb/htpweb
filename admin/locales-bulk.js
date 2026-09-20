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
  $("validateBulkLocalBtn").onclick=validateBulkLocalFile;
  $("importBulkLocalBtn").onclick=importBulkLocals;
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
  await place.fetchFields({fields:["id","displayName","formattedAddress","addressComponents","location"]});
  if(!place.location)throw new Error("Google encontró el lugar, pero no devolvió coordenadas.");

  return {
    placeId:place.id||null,
    name:place.displayName||query,
    address:place.formattedAddress||query,
    lat:place.location.lat(),
    lng:place.location.lng(),
    addressComponents:place.addressComponents||[]
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
        const place=await resolveBulkGooglePlace(result.locationLink);
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
        await rpc("master_save_local_v3",{
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
