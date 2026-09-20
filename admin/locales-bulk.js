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
  const headers=["NOMBRE","PROVINCIA","CANTON","BUSQUEDA_GOOGLE","ZONA_CODIGO","LATITUD","LONGITUD","TELEFONO","WHATSAPP","DESCRIPCION"];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([headers]),"LOCALES");

  const instructions=[
    ["HTPWEB — Carga masiva de locales"],
    ["1","No cambies los encabezados de la hoja LOCALES."],
    ["2","NOMBRE, PROVINCIA y CANTON son obligatorios."],
    ["3","Recomendado: completa BUSQUEDA_GOOGLE con el nombre del negocio o su dirección. HTPWEB intentará obtener ubicación y dirección con Google."],
    ["4","Alternativa: completa LATITUD y LONGITUD. ZONA_CODIGO puede usarse cuando el punto no cae en un polígono dibujado."],
    ["5","Los locales importados se crean como BORRADOR. Después completa horario, imágenes y productos desde la ficha del LOCAL."],
    ["EJEMPLO","AGUA VIVA | Esmeraldas | Esmeraldas | Agua Viva Esmeraldas | ESM01 | | | 0999999999 | 0999999999 | Distribuidor de agua"]
  ];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(instructions),"INSTRUCCIONES");

  const zoneRows=[["PROVINCIA","CANTON","ZONA_CODIGO","ZONA_NOMBRE"]];
  masterLocalsState.zones.filter(function(z){return z.active;}).forEach(function(z){
    zoneRows.push([z.province||"",z.city_name||z.canton||"",z.code||"",z.name||""]);
  });
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(zoneRows),"ZONAS_DISPONIBLES");
  XLSX.writeFile(wb,"HTPWEB_Plantilla_Carga_Masiva_Locales.xlsx");
}

async function resolveBulkGooglePlace(query,province,canton){
  if(!query)return null;
  const g=await ZoneMaps.googleAPI();
  if(!g)throw new Error("Google Maps no está disponible. Completa LATITUD/LONGITUD o revisa la API.");
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
  await place.fetchFields({fields:["id","displayName","formattedAddress","location"]});
  if(!place.location)throw new Error("Google encontró el lugar, pero no devolvió coordenadas.");
  return {
    placeId:place.id||null,
    name:place.displayName||query,
    address:place.formattedAddress||query,
    lat:place.location.lat(),
    lng:place.location.lng()
  };
}

function bulkLocalZoneFor(cityId,lat,lng,zoneCode){
  const zones=masterLocalsState.zones.filter(function(z){return z.active&&z.city_id===cityId;});
  const requested=zoneCode?zones.find(function(z){
    return normalizeLocalGeoText(z.code)===normalizeLocalGeoText(zoneCode);
  }):null;

  if(requested){
    if(requested.boundary&&requested.boundary.length&&!ZoneMaps.contains(requested.boundary,lat,lng)){
      throw new Error("El punto no pertenece a la zona "+requested.code+".");
    }
    return requested;
  }

  const matches=zones.filter(function(z){
    return z.boundary&&z.boundary.length&&ZoneMaps.contains(z.boundary,lat,lng);
  });
  if(matches.length===1)return matches[0];
  if(matches.length>1)throw new Error("La ubicación cae en más de una zona. Especifica ZONA_CODIGO.");

  const withoutBoundary=zones.filter(function(z){return !z.boundary||!z.boundary.length;});
  if(withoutBoundary.length===1)return withoutBoundary[0];
  throw new Error("No se pudo detectar una zona. Completa ZONA_CODIGO o dibuja los límites.");
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
      "<td>"+esc((r.province||"")+" / "+(r.canton||""))+"</td>"+
      "<td>"+esc(r.address||r.query||"")+"</td>"+
      "<td>"+esc((r.zone&&r.zone.code)||r.zoneCode||"—")+"</td>"+
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
      "<thead><tr><th>Fila</th><th>Local</th><th>Provincia / Cantón</th><th>Dirección</th><th>Zona</th><th>Estado</th></tr></thead>"+
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

    masterLocalsState.bulkFileName=file.name;
    masterLocalsState.bulkRows=[];

    for(let i=0;i<raw.length;i++){
      const row=raw[i];
      const result={rowNumber:i+2,valid:false,imported:false};
      try{
        result.name=bulkLocalValue(row,"NOMBRE");
        result.province=bulkLocalValue(row,"PROVINCIA");
        result.canton=bulkLocalValue(row,"CANTON");
        result.query=bulkLocalValue(row,"BUSQUEDA_GOOGLE");
        result.zoneCode=bulkLocalValue(row,"ZONA_CODIGO");
        result.phone=bulkLocalValue(row,"TELEFONO");
        result.whatsapp=bulkLocalValue(row,"WHATSAPP");
        result.description=bulkLocalValue(row,"DESCRIPCION");

        if(!result.name||!result.province||!result.canton){
          throw new Error("Faltan NOMBRE, PROVINCIA o CANTON.");
        }

        const city=state.cities.find(function(x){
          return x.active&&
            normalizeLocalGeoText(x.province)===normalizeLocalGeoText(result.province)&&
            normalizeLocalGeoText(x.name)===normalizeLocalGeoText(result.canton);
        });
        if(!city)throw new Error("Provincia/Cantón no existe o está inactivo en HTPWEB.");
        result.city=city;

        const latRaw=bulkLocalValue(row,"LATITUD");
        const lngRaw=bulkLocalValue(row,"LONGITUD");
        if((latRaw&&!lngRaw)||(!latRaw&&lngRaw))throw new Error("Completa LATITUD y LONGITUD juntas.");

        let place=null;
        if(latRaw&&lngRaw){
          result.lat=Number(String(latRaw).replace(",","."));
          result.lng=Number(String(lngRaw).replace(",","."));
          if(!Number.isFinite(result.lat)||Math.abs(result.lat)>90||!Number.isFinite(result.lng)||Math.abs(result.lng)>180){
            throw new Error("Coordenadas inválidas.");
          }
        }else{
          if(!result.query)throw new Error("Completa BUSQUEDA_GOOGLE o LATITUD/LONGITUD.");
          $("bulkLocalStatus").textContent="Validando con Google fila "+result.rowNumber+"…";
          place=await resolveBulkGooglePlace(result.query,result.province,result.canton);
          result.lat=place.lat;
          result.lng=place.lng;
          result.address=place.address;
          result.placeId=place.placeId;
        }

        result.zone=bulkLocalZoneFor(city.id,result.lat,result.lng,result.zoneCode);
        if(!result.address)result.address=result.query||"";

        const duplicate=masterLocalsState.items.find(function(l){
          return (result.placeId&&l.google_place_id===result.placeId)||
            (l.city_id===city.id&&normalizeLocalGeoText(l.name)===normalizeLocalGeoText(result.name));
        });
        if(duplicate)throw new Error("Posible duplicado: "+duplicate.name+" ya existe.");

        result.source=place?"GOOGLE":"MANUAL";
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
        await rpc("master_save_local_v2",{
          p_local_id:null,
          p_zone_id:row.zone.id,
          p_name:row.name,
          p_slug:"",
          p_description:row.description||"",
          p_address:row.address||"",
          p_latitude:row.lat,
          p_longitude:row.lng,
          p_phone:row.phone||"",
          p_whatsapp:row.whatsapp||"",
          p_google_place_id:row.placeId||null,
          p_google_maps_url:"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(row.lat+","+row.lng),
          p_location_source:row.source||"MANUAL",
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
