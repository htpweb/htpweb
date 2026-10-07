(() => {
  const pageMeta = {
    home:["Inicio","Edita el mensaje principal y la portada que verá el cliente al entrar."],
    about:["Quiénes somos","Cuenta la historia, experiencia y propuesta de valor de tu negocio."],
    services:["Productos / Servicios","El título se edita aquí y el contenido se alimenta desde tu catálogo."],
    projects:["Proyectos","Agrega fotografías, nombres y descripciones sin salir de Sitios web."],
    blog:["Blog","Define el título y administra las publicaciones con el editor del negocio."],
    contact:["Contacto","La página usa los datos, mapa y redes guardados en la ficha del LOCAL."]
  };

  function openTab(name){
    const key=pageMeta[name]?name:"home";
    document.querySelectorAll("[data-local-page-tab]").forEach(b=>b.classList.toggle("active",b.dataset.localPageTab===key));
    document.querySelectorAll("[data-local-page-pane]").forEach(p=>p.classList.toggle("active",p.dataset.localPagePane===key));
    const meta=pageMeta[key];
    if(document.getElementById("localPageEditorTitle"))document.getElementById("localPageEditorTitle").textContent=meta[0];
    if(document.getElementById("localPageEditorHelp"))document.getElementById("localPageEditorHelp").textContent=meta[1];
    if(key==="projects")loadProjects();
  }

  function bindTabs(){
    document.querySelectorAll("[data-local-page-tab]").forEach(btn=>{
      if(btn.dataset.pageEditorBound)return;
      btn.dataset.pageEditorBound="1";
      btn.addEventListener("click",()=>openTab(btn.dataset.localPageTab));
    });
    const goBanner=document.getElementById("localEditorGoBanner");
    if(goBanner&&!goBanner.dataset.bound){goBanner.dataset.bound="1";goBanner.onclick=()=>showSection("storage");}
    const goCatalog=document.getElementById("localEditorGoCatalog");
    if(goCatalog&&!goCatalog.dataset.bound){goCatalog.dataset.bound="1";goCatalog.onclick=()=>showSection("catalog");}
    const goBlog=document.getElementById("localEditorGoBlog");
    if(goBlog&&!goBlog.dataset.bound){
      goBlog.dataset.bound="1";
      goBlog.onclick=()=>{
        const editor=document.querySelector(".local-blog-editor");
        editor?.scrollIntoView({behavior:"smooth",block:"center"});
        document.getElementById("localBlogPostTitle")?.focus();
      };
    }
    const files=document.getElementById("localProjectEditorFiles");
    if(files&&!files.dataset.bound){files.dataset.bound="1";files.onchange=uploadProjects;}
  }

  async function loadProjects(){
    const grid=document.getElementById("localProjectEditorGrid");
    if(!grid)return;
    const localId=document.getElementById("profileLocal")?.value||state.localProfileRecord?.id;
    if(!localId){state.localProjects=[];grid.innerHTML='<div class="muted">Selecciona un LOCAL.</div>';return;}
    try{
      const data=await rpc("list_local_gallery",{p_local_id:localId});
      state.localProjects=Array.isArray(data)?data:[];
      renderProjects();
      if(typeof renderLocalStorePreview==="function")renderLocalStorePreview();
    }catch(e){
      state.localProjects=[];
      grid.innerHTML='<div class="message error">'+esc(e.message||"No se pudieron cargar los proyectos.")+'</div>';
    }
  }

  function renderProjects(){
    const grid=document.getElementById("localProjectEditorGrid");
    if(!grid)return;
    const rows=state.localProjects||[];
    if(!rows.length){
      grid.innerHTML='<div class="local-project-editor-empty"><strong>Aún no tienes proyectos</strong><span>Haz clic en “Agregar proyecto” y selecciona una o varias fotografías.</span></div>';
      return;
    }
    grid.innerHTML=rows.map((item,index)=>{
      const order=Number.isFinite(Number(item.display_order))?Number(item.display_order):index;
      return '<article class="local-project-edit-card" data-project-id="'+esc(item.id)+'">'+
        '<img src="'+esc(item.image_url)+'" alt="">'+
        '<div class="local-project-edit-body">'+
          '<label>Nombre del proyecto<input data-project-title maxlength="120" value="'+esc(item.title||"")+'" placeholder="Ej. Edificio Corporativo Delta"></label>'+
          '<label>Descripción<textarea data-project-description rows="3" maxlength="500" placeholder="Qué se hizo, dónde y cuál fue el resultado.">'+esc(item.description||"")+'</textarea></label>'+
          '<div class="local-project-edit-actions">'+
            '<label>Posición<input data-project-order type="number" min="0" max="99" value="'+order+'"></label>'+
            '<button type="button" class="btn-primary" data-project-save>Guardar</button>'+
            '<button type="button" class="btn-danger" data-project-delete>Eliminar</button>'+
          '</div>'+
        '</div>'+
      '</article>';
    }).join("");

    grid.querySelectorAll(".local-project-edit-card").forEach(card=>{
      card.querySelector("[data-project-save]").onclick=()=>saveProject(card);
      card.querySelector("[data-project-delete]").onclick=()=>deleteProject(card.dataset.projectId);
    });
  }

  async function uploadProjects(){
    const input=document.getElementById("localProjectEditorFiles");
    const files=[...(input?.files||[])];
    const localId=document.getElementById("profileLocal")?.value||state.localProfileRecord?.id;
    if(!localId)return message("Selecciona un LOCAL.","error");
    if(!files.length)return;
    if(files.length>12)return message("Puedes agregar hasta 12 fotografías por operación.","error");
    if((state.localProjects?.length||0)+files.length>24)return message("Puedes mostrar hasta 24 proyectos en tu portafolio.","error");
    try{
      if(input)input.disabled=true;
      message("Subiendo proyectos…");
      for(const file of files){
        const imageId=crypto.randomUUID();
        const path=mediaPathLocalGallery(localId,imageId);
        let uploaded=null;
        try{
          uploaded=await subirImagenHTPWEB(path,file);
          await rpc("save_local_gallery_image",{
            p_local_id:localId,
            p_image_id:imageId,
            p_image_url:uploaded.url,
            p_storage_path:uploaded.path,
            p_display_order:(state.localProjects?.length||0)
          });
          state.localProjects.push({id:imageId,image_url:uploaded.url,storage_path:uploaded.path,display_order:state.localProjects.length,title:"",description:""});
        }catch(e){
          if(uploaded?.path)await eliminarObjetoMediaHTPWEB(uploaded.path).catch(()=>{});
          throw e;
        }
      }
      if(input)input.value="";
      await loadProjects();
      message("Proyecto(s) agregado(s). Escribe el nombre y descripción y pulsa Guardar.");
    }catch(e){message(e.message||"No se pudieron subir las fotografías.","error");}
    finally{if(input)input.disabled=false;}
  }

  async function saveProject(card){
    const localId=document.getElementById("profileLocal")?.value||state.localProfileRecord?.id;
    const imageId=card?.dataset?.projectId;
    if(!localId||!imageId)return;
    const title=card.querySelector("[data-project-title]")?.value.trim()||"";
    const description=card.querySelector("[data-project-description]")?.value.trim()||"";
    const order=Math.max(0,Math.min(99,Number(card.querySelector("[data-project-order]")?.value)||0));
    try{
      await rpc("update_local_gallery_project",{p_local_id:localId,p_image_id:imageId,p_title:title||null,p_description:description||null,p_display_order:order});
      await loadProjects();
      message("Proyecto actualizado.");
    }catch(e){message(e.message||"No se pudo guardar el proyecto.","error");}
  }

  async function deleteProject(imageId){
    const localId=document.getElementById("profileLocal")?.value||state.localProfileRecord?.id;
    if(!localId||!imageId)return;
    if(!confirm("¿Eliminar este proyecto y su fotografía?"))return;
    try{
      const item=(state.localProjects||[]).find(x=>x.id===imageId);
      const path=await rpc("delete_local_gallery_image",{p_local_id:localId,p_image_id:imageId});
      if(path||item?.storage_path)await eliminarObjetoMediaHTPWEB(path||item.storage_path).catch(()=>{});
      await loadProjects();
      message("Proyecto eliminado.");
    }catch(e){message(e.message||"No se pudo eliminar el proyecto.","error");}
  }

  bindTabs();
  window.openLocalPageEditorTab=openTab;
  window.loadLocalProjectEditor=loadProjects;
})();