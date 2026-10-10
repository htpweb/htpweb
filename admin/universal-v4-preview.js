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
    btn.onclick=async()=>{
      if(!file.files.length){output.textContent="Selecciona un Excel V4.";return;}
      btn.disabled=true;output.textContent="Leyendo la matriz...";
      try{
        result=await window.HTPWEBUniversalV4.read(file.files[0]);
        business.innerHTML='<option value="">Todos los negocios</option>'+result.businesses.map(x=>'<option value="'+escape(x.name)+'">'+escape(x.name)+'</option>').join("");
        show();
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
        if(!window.supabaseClient)throw new Error("No hay conexión a Supabase.");
        const res=await window.supabaseClient.rpc("import_business_catalog_v4_rows",{
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
