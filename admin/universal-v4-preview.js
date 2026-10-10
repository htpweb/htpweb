(() => {
  "use strict";
  function $(id){return document.getElementById(id);}
  function boot(){
    const file=$("universalV4File"),photos=$("universalV4Photos"),btn=$("universalV4Check"),business=$("universalV4Business"),output=$("universalV4Result"),save=$("universalV4ImportDraft"),confirm=$("universalV4ConfirmBusiness"),target=$("catalogLocal");
    if(!file||!btn||!business||!output)return;
    let result=null;
    const escape=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
    function show(){
      if(!result)return;
      if(save)save.disabled=!business.value;
      const chosen=result.businesses.find(b=>b.name===business.value);
      const issues=chosen?result.issues.filter(x=>x.business===chosen.name):result.issues;
      const index=new Map();
      for(const f of (photos?.files||[])){
        const name=f.name.toLocaleLowerCase("es");
        if(!index.has(name))index.set(name,[]);
        index.get(name).push(f.webkitRelativePath||f.name);
      }
      let matched=0,missing=0,ambiguous=0;
      if(chosen&&photos?.files.length){
        for(const product of chosen.products){
          if(!product.imageFile)continue;
          const found=index.get(product.imageFile.toLocaleLowerCase("es"))||[];
          if(found.length===1)matched++;
          else if(found.length>1){ambiguous++;issues.push({line:product.line,message:"Imagen ambigua: "+product.imageFile});}
          else {missing++;issues.push({line:product.line,message:"Foto no encontrada: "+product.imageFile});}
        }
      }
      const sample=issues.slice(0,12);
      output.innerHTML='<strong>'+result.businesses.length+' negocios · '+result.totalRows+' filas · '+result.issues.length+' observaciones</strong>'+
        (chosen?'<p>'+escape(chosen.name)+': '+chosen.uniqueProducts+' SKU distintos y '+chosen.rows+' filas.</p><p>Imágenes coincidentes: '+matched+' · faltantes: '+missing+' · ambiguas: '+ambiguous+'</p>':'')+
        '<p>Vista previa: no se han cargado fotografías ni guardado productos.</p>'+
        (sample.length?'<ul>'+sample.map(x=>'<li>Fila '+x.line+': '+escape(x.message)+'</li>').join("")+'</ul>':'<p>No se detectaron incidencias en esta vista.</p>');
    }

    const batchPanel=$("universalV4BatchPanel"),batchTable=$("universalV4Mappings"),batchButton=$("universalV4BatchImport"),batchConfirm=$("universalV4BatchConfirm"),batchReport=$("universalV4BatchReport");
    function catalogDestinations(){
      return [...(target?.options||[])].filter(o=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(o.value))
        .map(o=>({id:o.value,name:o.textContent.trim()}));
    }
    function toRows(chosen){
      return chosen.products.map(item=>({
        sku:item.sku,name:item.name,category:item.category,variant:item.variant||null,
        description:item.description||null,price:item.price,image_url:null,
        option_group:item.optionGroup||null,options:item.optionValues||null,
        import_status:item.importStatus||null
      }));
    }
    function renderBatch(){
      if(!batchPanel||!batchTable||!result)return;
      batchPanel.hidden=false;
      const destinations=catalogDestinations();
      batchTable.innerHTML='<table><thead><tr><th>Negocio del Excel</th><th>Productos</th><th>Negocio real en Supabase</th></tr></thead><tbody>'+
        result.businesses.map((source,i)=>{
          const exact=destinations.filter(d=>d.name.toLocaleLowerCase("es")===source.name.toLocaleLowerCase("es"));
          const auto=exact.length===1?exact[0].id:"";
          const options=destinations.map(d=>'<option value="'+escape(d.id)+'"'+(d.id===auto?' selected':'')+'>'+escape(d.name)+'</option>').join("");
          return '<tr><td>'+escape(source.name)+'</td><td>'+source.uniqueProducts+' SKU · '+source.rows+' filas</td><td><select class="v4-destination" data-index="'+i+'"><option value="">Sin asociar</option>'+options+'</select></td></tr>';
        }).join("")+'</tbody></table>';
      batchReport.textContent="Asocia los negocios y verifica las coincidencias antes de importar. Los registros no se publicarán.";
    }
    if(batchButton)batchButton.onclick=async()=>{
      if(!result||!batchTable||!batchConfirm||!batchReport)return;
      if(batchConfirm.value.trim()!=="IMPORTAR BORRADORES"){batchReport.textContent="Escribe IMPORTAR BORRADORES para confirmar.";return;}
      const pairs=[...batchTable.querySelectorAll("select.v4-destination")].filter(x=>x.value).map(x=>({
        source:result.businesses[Number(x.dataset.index)],id:x.value
      }));
      if(!pairs.length){batchReport.textContent="No hay negocios asociados.";return;}
      if(new Set(pairs.map(p=>p.id)).size!==pairs.length){batchReport.textContent="Hay negocios de destino repetidos. Corrige las asociaciones.";return;}
      if(pairs.some(p=>result.issues.some(x=>x.business===p.source.name&&x.type==="ERROR"))){batchReport.textContent="Los negocios seleccionados tienen errores de Excel. Corrígelos antes de importar.";return;}
      if(pairs.some(p=>p.source.products.some(x=>x.price===null))){batchReport.textContent="Existen precios pendientes de validar. No se importará ese conjunto.";return;}
      batchButton.disabled=true;
      let done=0,failed=0;
      const failures=[];
      try {
        for(const pair of pairs){
          batchReport.textContent="Procesando "+(done+failed+1)+"/"+pairs.length+": "+pair.source.name;
          const rows=toRows(pair.source);
          const preflight=await supabaseClient.rpc("preflight_business_catalog_v4",{
            p_business_id:pair.id,p_rows:rows
          });
          if(preflight.error){failed++;failures.push(pair.source.name+": prevalidación: "+preflight.error.message);continue;}
          if(!preflight.data?.can_import){
            failed++;
            const issues=(preflight.data?.issues||[]).slice(0,3).map(x=>x.reason+" fila "+x.row).join(", ");
            failures.push(pair.source.name+": revisar registros "+issues);
            continue;
          }
          const {data,error}=await supabaseClient.rpc("import_business_catalog_v4_rows",{
            p_business_id:pair.id,p_rows:rows,p_publish:false
          });
          if(error){failed++;failures.push(pair.source.name+": "+error.message);}
          else done++;
        }
        batchReport.textContent="Importación finalizada: "+done+" negocios guardados como borrador; "+failed+" con errores. "+failures.join(" | ")+". Ningún nuevo producto fue publicado automáticamente.";
      }catch(error){
        batchReport.textContent="Proceso interrumpido: "+(error.message||String(error))+". Completados: "+done+". Confirma el estado antes de reintentar.";
      }finally{batchButton.disabled=false;}
    };

    const legacyLoad=$("v4LoadLegacyProducts"),legacySelect=$("v4ExistingProduct"),
      legacySku=$("v4ExistingSku"),legacyAssign=$("v4AssignExistingSku"),legacyStatus=$("v4LegacyStatus");
    if(legacyLoad)legacyLoad.onclick=async()=>{
      if(!target?.value){legacyStatus.textContent="Selecciona primero el negocio del catálogo.";return;}
      legacyLoad.disabled=true;legacyStatus.textContent="Consultando productos antiguos...";
      try{
        const {data,error}=await supabaseClient.from("business_products")
          .select("id,name,sku,business_id").eq("business_id",target.value).order("name").limit(2000);
        if(error)throw error;
        const older=(data||[]).filter(x=>!String(x.sku||"").trim());
        legacySelect.innerHTML='<option value="">Selecciona producto antiguo</option>'+
          older.map(x=>'<option value="'+escape(x.id)+'">'+escape(x.name)+'</option>').join("");
        legacyStatus.textContent=older.length+" productos de este negocio sin SKU. Selecciona la ficha real que corresponda al código V4.";
      }catch(e){legacyStatus.textContent="No se pudo consultar: "+(e.message||String(e));}
      finally{legacyLoad.disabled=false;}
    };
    if(legacyAssign)legacyAssign.onclick=async()=>{
      if(!target?.value||!legacySelect?.value||!legacySku?.value.trim()){
        legacyStatus.textContent="Selecciona el negocio, el producto existente y el SKU.";return;
      }
      const productName=legacySelect.options[legacySelect.selectedIndex]?.textContent||"";
      if(!window.confirm("Confirmar SKU "+legacySku.value.trim()+" para producto existente «"+productName+"» del negocio elegido. ¿Continuar?"))return;
      legacyAssign.disabled=true;
      try{
        const {data,error}=await supabaseClient.rpc("assign_existing_business_product_sku",{
          p_business_id:target.value,p_product_id:legacySelect.value,p_sku:legacySku.value.trim()
        });
        if(error)throw error;
        legacyStatus.textContent="SKU vinculado: "+data.sku+" → "+data.name+". No se creó otro producto.";
        await legacyLoad.click();
      }catch(e){legacyStatus.textContent="No se vinculó el SKU: "+(e.message||String(e));}
      finally{legacyAssign.disabled=false;}
    };
    btn.onclick=async()=>{
      if(!file.files.length){output.textContent="Selecciona un Excel V4.";return;}
      btn.disabled=true;output.textContent="Leyendo la matriz...";
      try{
        result=await window.HTPWEBUniversalV4.read(file.files[0]);
        business.innerHTML='<option value="">Todos los negocios</option>'+result.businesses.map(x=>'<option value="'+escape(x.name)+'">'+escape(x.name)+'</option>').join("");
        show();
        renderBatch();
      }catch(e){output.textContent="Error de validación: "+(e?.message||String(e));}
      finally{btn.disabled=false;}
    };
    if(save)save.onclick=async()=>{
      if(!result||!business.value||!target?.value||!confirm) {output.textContent="Selecciona negocio de origen y destino.";return;}
      const selectedName=target.options[target.selectedIndex]?.textContent?.trim()||"";
      if(confirm.value.trim()!==selectedName){output.textContent="Escribe exactamente el nombre del negocio de destino para confirmar el ID.";return;}
      const chosen=result.businesses.find(x=>x.name===business.value);
      if(!chosen||!chosen.products.length)return;
      const errors=result.issues.filter(x=>x.business===chosen.name&&x.type==="ERROR");
      if(errors.length){output.textContent="No se importó: resuelve primero "+errors.length+" errores de la matriz.";return;}
      const mapped=chosen.products.map(item=>({
        sku:item.sku,name:item.name,category:item.category,variant:item.variant||null,
        description:item.description||null,price:item.price,image_url:null,
        option_group:item.optionGroup||null,options:item.optionValues||null,
        import_status:item.importStatus||null
      }));
      save.disabled=true;
      output.textContent="Guardando los productos como borradores, sin publicarlos...";
      try{
        if(!supabaseClient)throw new Error("No hay conexión a Supabase.");
        const check=await supabaseClient.rpc("preflight_business_catalog_v4",{
          p_business_id:target.value,p_rows:mapped
        });
        if(check.error)throw check.error;
        if(!check.data?.can_import)throw new Error(
          "Prevalidación detectó conflictos: "+JSON.stringify((check.data?.issues||[]).slice(0,8))
        );
        const res=await supabaseClient.rpc("import_business_catalog_v4_rows",{
          p_business_id:target.value,p_rows:mapped,p_publish:false
        });
        if(res.error)throw res.error;
        output.textContent="Borradores guardados para "+selectedName+": "+JSON.stringify(res.data)+". No se publicaron productos nuevos ni fotografías.";
      }catch(error){
        output.textContent="No se guardaron borradores: "+(error.message||String(error));
      }finally{save.disabled=false;}
    };
    business.onchange=show;
    if(photos)photos.onchange=show;
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
