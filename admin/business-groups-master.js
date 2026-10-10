(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
  async function boot() {
    const select=byId("v4BranchIds"),load=byId("v4LoadBranches"),
      save=byId("v4SaveCorporate"),message=byId("v4CorporateMessage"),
      name=byId("v4CompanyName"),slug=byId("v4CompanySlug");
    if(!select||!load||!save||!message)return;
    let businesses=[];
    load.addEventListener("click",async()=>{
      load.disabled=true;message.textContent="Leyendo sucursales desde Supabase...";
      try{
        const {data,error}=await supabaseClient.from("businesses").select("id,name").order("name").limit(1000);
        if(error)throw error;
        businesses=data||[];
        select.innerHTML=businesses.map(item=>'<option value="'+escape(item.id)+'">'+escape(item.name)+'</option>').join("");
        message.textContent=businesses.length+" negocios disponibles. Selecciona las sucursales a vincular.";
      }catch(e){message.textContent="No se pudo cargar: "+(e.message||e);}
      finally{load.disabled=false;}
    });
    save.addEventListener("click",async()=>{
      const selected=Array.from(select.selectedOptions).map(o=>o.value);
      const company=name.value.trim(),identifier=slug.value.trim();
      if(!company||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(identifier)||!selected.length){
        message.textContent="Indica empresa, identificador válido y al menos una sucursal.";return;
      }
      if(!window.confirm("Vincular "+selected.length+" sucursales existentes a "+company+" sin cambiar sus catálogos ni pedidos?"))return;
      save.disabled=true;
      try{
        const lookup=await supabaseClient.from("business_groups").select("id").eq("slug",identifier).maybeSingle();
        if(lookup.error)throw lookup.error;
        const branches=selected.map((business_id,i)=>({
          business_id,label:businesses.find(b=>b.id===business_id)?.name||"Sucursal",order:i+1
        }));
        const {data,error}=await supabaseClient.rpc("master_upsert_business_group",{
          p_group_id:lookup.data?.id||null,p_name:company,p_slug:identifier,p_branches:branches
        });
        if(error)throw error;
        message.textContent="Empresa guardada ("+data+"). "+selected.length+" sucursales vinculadas. No se modificaron productos ni pedidos.";
      }catch(e){message.textContent="No se guardó la empresa: "+(e.message||e);}
      finally{save.disabled=false;}
    });
    load.click();
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();