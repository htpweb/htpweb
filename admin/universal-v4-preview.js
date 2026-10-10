(() => {
  "use strict";
  function $(id){return document.getElementById(id);}
  function boot(){
    const file=$("universalV4File"),btn=$("universalV4Check"),business=$("universalV4Business"),output=$("universalV4Result");
    if(!file||!btn||!business||!output)return;
    let result=null;
    const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;":"&quot;","'":"&#39;"}[c]));
    function show(){
      if(!result)return;
      const chosen=result.businesses.find(b=>b.name===business.value);
      const issues=chosen?result.issues.filter(x=>x.business===chosen.name):result.issues;
      const sample=issues.slice(0,10);
      output.innerHTML='<strong>'+result.businesses.length+' negocios · '+result.totalRows+' filas · '+result.issues.length+' observaciones</strong>'+
        (chosen?'<p>'+escape(chosen.name)+': '+chosen.uniqueProducts+' SKU distintos y '+chosen.rows+' filas.</p>':'')+
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
    business.onchange=show;
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
