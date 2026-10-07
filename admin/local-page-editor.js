(() => {
  let activePage="home";
  let activeDevice="desktop";
  let pendingServiceImageId=null;
  let pendingProjectReplaceId=null;
  let projectReplaceInput=null;

  const pageMeta={
    home:["Inicio","Edita el mensaje principal y la portada directamente sobre la página."],
    about:["Quiénes somos","Haz clic en los textos de la página o usa este panel para escribir con más espacio."],
    services:["Productos / Servicios","Agrega, edita, ordena y añade fotos a tus servicios. El diseño permanece protegido."],
    projects:["Proyectos","Agrega proyectos y fotografías como diapositivas: la plantilla los acomoda automáticamente."],
    blog:["Blog","Edita el título de la página y administra las publicaciones del negocio."],
    contact:["Contacto","La página usa los datos, mapa y redes guardados en la ficha del LOCAL."]
  };

  const $id=id=>document.getElementById(id);
  const localId=()=> $id("profileLocal")?.value||state.localProfileRecord?.id||null;
  const clean=v=>String(v??"").trim();
  const servicePayload=()=> (state.localServices||[]).map((s,i)=>({
    id:s.id||String(i+1),
    title:clean(s.title),
    description:clean(s.description),
    image_url:s.image_url||"",
    storage_path:s.storage_path||"",
    display_order:Number.isFinite(Number(s.display_order))?Number(s.display_order):i
  }));

  function currentFamily(){
    const preset=(state.localStorePresets||[]).find(p=>p.code===$id("localStorePreset")?.value)||{};
    return String(preset.layout_family||"GENERAL").toUpperCase();
  }

  function currentDesign(){
    const preset=(state.localStorePresets||[]).find(p=>p.code===$id("localStorePreset")?.value)||{};
    return String(preset?.config?.design_system||"SIGNATURE").toUpperCase();
  }

  function ensureServices(){
    if((state.localServices||[]).length)return;
    const profile=window.HTPWEBStorefrontArchitectures?.profiles?.[currentFamily()];
    const defaults=Array.isArray(profile?.services)&&profile.services.length?profile.services:["Servicio principal","Solución especializada","Asesoría profesional"];
    state.localServices=defaults.slice(0,4).map((title,i)=>({
      id:crypto.randomUUID(),title,description:"Describe brevemente este servicio y el valor que ofrece a tus clientes.",image_url:"",storage_path:"",display_order:i
    }));
  }

  function visualContext(){
    const preset=(state.localStorePresets||[]).find(p=>p.code===$id("localStorePreset")?.value)||{};
    const theme=$id("localStoreTheme")?.selectedOptions?.[0];
    const family=String(preset.layout_family||"GENERAL").toUpperCase();
    const design=String(preset?.config?.design_system||"SIGNATURE").toUpperCase();
    const primary=$id("localStoreAccent")?.value||theme?.dataset?.primary||"#1466e8";
    const secondary=theme?.dataset?.secondary||"#0b1730";
    const background=theme?.dataset?.background||"#f6f9ff";
    const surface=theme?.dataset?.surface||"#fff";
    const text=theme?.dataset?.text||"#0b1730";
    const name=state.localProfileRecord?.name||"LOCAL";
    const about=$id("localAboutTitle")?.value.trim()||"Quiénes somos";
    const catalog=$id("localCatalogTitle")?.value.trim()||"Productos / Servicios";
    const projects=$id("localProjectsTitle")?.value.trim()||"Proyectos";
    const blog=$id("localBlogTitle")?.value.trim()||"Blog";
    const contact=$id("localContactTitle")?.value.trim()||"Contacto";
    const nav=[
      {label:"Inicio",section:"home"},
      ...($id("localShowAbout")?.checked?[{label:about,section:"about"}]:[]),
      ...($id("localShowCatalog")?.checked?[{label:catalog,section:"services"}]:[]),
      ...($id("localShowProjects")?.checked?[{label:projects,section:"projects"}]:[]),
      ...($id("localShowBlog")?.checked?[{label:blog,section:"blog"}]:[]),
      ...($id("localShowContact")?.checked?[{label:contact,section:"contact"}]:[])
    ];
    const profile=window.HTPWEBStorefrontArchitectures?.profiles?.[family];
    const serviceItems=(state.localServices||[]).length
      ? [...state.localServices].sort((a,b)=>(Number(a.display_order)||0)-(Number(b.display_order)||0)).map((s,i)=>({id:s.id,title:s.title||("Servicio "+(i+1)),copy:s.description||"",image:s.image_url||"",index:i+1}))
      : (profile?.services||[]).map((title,i)=>({title,copy:"Solución profesional adaptada a las necesidades del cliente.",index:i+1}));
    const projectItems=(state.localProjects||[]).map((p,i)=>({id:p.id,title:p.title||("Proyecto "+String(i+1).padStart(2,"0")),description:p.description||"",image:p.image_url||""}));
    return {
      section:activePage,design,family,name,
      hero:$id("localHeroTitle")?.value.trim()||name,
      subtitle:$id("localHeroSubtitle")?.value.trim()||"Una propuesta clara, profesional y lista para crecer.",
      about,aboutText:$id("localAboutText")?.value.trim()||"",
      catalog,projects,projectsText:$id("localProjectsText")?.value.trim()||"",
      blog,contact,
      nav,links:false,
      banner:state.localProfileRecord?.banner_url||"",
      serviceItems,projectItems,
      blogItems:(state.localBlogPosts||[]).map(p=>({title:p.title,excerpt:p.excerpt||p.body||"",date:p.published_at?new Date(p.published_at).toLocaleDateString("es-EC"):"Actualidad",image:p.image_url||""})),
      contactItems:[
        {label:"Teléfono",value:state.localProfileRecord?.phone,icon:"☎"},
        {label:"WhatsApp",value:state.localProfileRecord?.whatsapp,icon:"◉"}
      ].filter(x=>x.value),
      primary,secondary,background,surface,text,
      flags:{
        about:$id("localShowAbout")?.checked,
        catalog:$id("localShowCatalog")?.checked,
        projects:$id("localShowProjects")?.checked,
        blog:$id("localShowBlog")?.checked,
        contact:$id("localShowContact")?.checked
      }
    };
  }

  function setEditable(el,fieldId,kind="text"){
    if(!el||!$id(fieldId))return;
    el.setAttribute("contenteditable","true");
    el.classList.add("local-canvas-inline-edit");
    el.title="Haz clic para editar";
    el.addEventListener("focus",()=>el.classList.add("editing"));
    el.addEventListener("blur",()=>{
      el.classList.remove("editing");
      const value=clean(el.innerText);
      $id(fieldId).value=value;
      $id(fieldId).dispatchEvent(new Event("input",{bubbles:true}));
    });
    el.addEventListener("keydown",e=>{
      if(kind==="text"&&e.key==="Enter"){e.preventDefault();el.blur();}
    });
  }

  function decorateServices(canvas){
    const cards=[...canvas.querySelectorAll(".local-service-placeholder,.apex-internal-services>article")];
    cards.forEach((card,index)=>{
      const service=(state.localServices||[])[index];
      if(!service)return;
      card.dataset.editorItemId=service.id;
      card.classList.add("local-canvas-edit-card");
      const h=card.querySelector("h3,strong:not(.local-editor-control *)");
      const p=card.querySelector("p");
      if(h){
        h.setAttribute("contenteditable","true");h.classList.add("local-canvas-inline-edit");
        h.onblur=async()=>{service.title=clean(h.innerText);renderServicesInspector();await persistServices(false);};
      }
      if(p){
        p.setAttribute("contenteditable","true");p.classList.add("local-canvas-inline-edit");
        p.onblur=async()=>{service.description=clean(p.innerText);renderServicesInspector();await persistServices(false);};
      }
      const tools=document.createElement("div");
      tools.className="local-canvas-card-tools";
      tools.innerHTML='<button type="button" data-photo>+ Foto</button><button type="button" data-remove>Eliminar</button>';
      tools.querySelector("[data-photo]").onclick=e=>{e.stopPropagation();chooseServiceImage(service.id);};
      tools.querySelector("[data-remove]").onclick=e=>{e.stopPropagation();removeService(service.id);};
      card.appendChild(tools);
    });
  }

  function decorateProjects(canvas){
    const cards=[...canvas.querySelectorAll(".local-project-card,.apex-internal-project")];
    cards.forEach((card,index)=>{
      const project=(state.localProjects||[])[index];
      if(!project)return;
      card.dataset.editorItemId=project.id;
      card.classList.add("local-canvas-edit-card");
      const title=card.querySelector("span,h3");
      if(title){
        title.setAttribute("contenteditable","true");
        title.classList.add("local-canvas-inline-edit");
        title.onblur=()=>saveProjectInline(project.id,clean(title.innerText),project.description||"");
      }
      let description=card.querySelector(".local-project-description");
      if(!description){
        description=document.createElement("p");
        description.className="local-project-description local-project-description-placeholder";
        description.textContent=project.description||"Haz clic para agregar una descripción";
        card.appendChild(description);
      }
      description.setAttribute("contenteditable","true");
      description.classList.add("local-canvas-inline-edit");
      description.onfocus=()=>{if(description.classList.contains("local-project-description-placeholder"))description.textContent="";};
      description.onblur=()=>saveProjectInline(project.id,project.title||"",clean(description.innerText));
      const tools=document.createElement("div");
      tools.className="local-canvas-card-tools";
      tools.innerHTML='<button type="button" data-photo>Cambiar foto</button><button type="button" data-remove>Eliminar</button>';
      tools.querySelector("[data-photo]").onclick=e=>{e.stopPropagation();chooseProjectReplacement(project.id);};
      tools.querySelector("[data-remove]").onclick=e=>{e.stopPropagation();deleteProject(project.id);};
      card.appendChild(tools);
    });
  }

  function decorateCanvas(){
    const canvas=$id("localVisualPageCanvas");
    if(!canvas)return;
    if(activePage==="home"){
      setEditable(canvas.querySelector("h1,h2"),"localHeroTitle");
      const hero=canvas.querySelector(".apex-hero-copy p,.arch-photo-hero p,.arch-min-main p,.arch-split-left p,.arch-ed-intro p,.arch-luxe-hero p,.arch-bold-hero p,.arch-mag-cover p,.arch-immersive-copy p,.arch-tech-intro p");
      setEditable(hero,"localHeroSubtitle","multiline");
    }else if(activePage==="about"){
      setEditable(canvas.querySelector("h1,h2"),"localAboutTitle");
      setEditable(canvas.querySelector(".local-about-copy p,.apex-internal-about>div>p"),"localAboutText","multiline");
    }else if(activePage==="services"){
      ensureServices();
      setEditable(canvas.querySelector("h1,h2"),"localCatalogTitle");
      decorateServices(canvas);
    }else if(activePage==="projects"){
      setEditable(canvas.querySelector("h1,h2"),"localProjectsTitle");
      setEditable(canvas.querySelector(".local-project-intro,.apex-internal-head+p"),"localProjectsText","multiline");
      decorateProjects(canvas);
    }else if(activePage==="blog"){
      setEditable(canvas.querySelector("h1,h2"),"localBlogTitle");
    }else if(activePage==="contact"){
      setEditable(canvas.querySelector("h1,h2"),"localContactTitle");
    }
  }

  function renderCanvas(){
    const canvas=$id("localVisualPageCanvas");
    if(!canvas||!window.HTPWEBStorefrontArchitectures?.render)return;
    const ctx=visualContext();
    canvas.innerHTML=window.HTPWEBStorefrontArchitectures.render(ctx);
    canvas.classList.toggle("mobile",activeDevice==="mobile");
    canvas.classList.toggle("desktop",activeDevice!=="mobile");
    decorateCanvas();
    const label=$id("localVisualPageLabel");
    if(label)label.textContent=pageMeta[activePage]?.[0]||"Página";
    const add=$id("localVisualAddBtn");
    if(add){
      const canAdd=activePage==="services"||activePage==="projects";
      add.classList.toggle("hidden",!canAdd);
      add.textContent=activePage==="services"?"+ Agregar servicio":activePage==="projects"?"+ Agregar proyecto":"+ Agregar";
      add.onclick=()=>activePage==="services"?addService():$id("localProjectEditorFiles")?.click();
    }
  }

  function openTab(name){
    activePage=pageMeta[name]?name:"home";
    if(activePage==="services")ensureServices();
    document.querySelectorAll("[data-local-page-tab]").forEach(b=>b.classList.toggle("active",b.dataset.localPageTab===activePage));
    document.querySelectorAll("[data-local-page-pane]").forEach(p=>p.classList.toggle("active",p.dataset.localPagePane===activePage));
    const meta=pageMeta[activePage];
    if($id("localPageEditorTitle"))$id("localPageEditorTitle").textContent=meta[0];
    if($id("localPageEditorHelp"))$id("localPageEditorHelp").textContent=meta[1];
    if(activePage==="projects")loadProjects();
    if(activePage==="services")renderServicesInspector();
    renderCanvas();
  }

  function bindTabs(){
    document.querySelectorAll("[data-local-page-tab]").forEach(btn=>{
      if(btn.dataset.pageEditorBound)return;
      btn.dataset.pageEditorBound="1";
      btn.addEventListener("click",()=>openTab(btn.dataset.localPageTab));
    });
    document.querySelectorAll("[data-local-editor-device]").forEach(btn=>{
      if(btn.dataset.bound)return;
      btn.dataset.bound="1";
      btn.onclick=()=>{
        activeDevice=btn.dataset.localEditorDevice==="mobile"?"mobile":"desktop";
        document.querySelectorAll("[data-local-editor-device]").forEach(x=>x.classList.toggle("active",x===btn));
        renderCanvas();
      };
    });
    const goBanner=$id("localEditorGoBanner");
    if(goBanner&&!goBanner.dataset.bound){goBanner.dataset.bound="1";goBanner.onclick=()=>showSection("storage");}
    const goCatalog=$id("localEditorGoCatalog");
    if(goCatalog&&!goCatalog.dataset.bound){goCatalog.dataset.bound="1";goCatalog.onclick=()=>showSection("catalog");}
    const goBlog=$id("localEditorGoBlog");
    if(goBlog&&!goBlog.dataset.bound){
      goBlog.dataset.bound="1";
      goBlog.onclick=()=>{$id("localBlogPostTitle")?.scrollIntoView({behavior:"smooth",block:"center"});$id("localBlogPostTitle")?.focus();};
    }
    const addServiceBtn=$id("localAddServiceBtn");
    if(addServiceBtn&&!addServiceBtn.dataset.bound){addServiceBtn.dataset.bound="1";addServiceBtn.onclick=addService;}
    const serviceFile=$id("localServiceImageFile");
    if(serviceFile&&!serviceFile.dataset.bound){serviceFile.dataset.bound="1";serviceFile.onchange=uploadServiceImage;}
    const files=$id("localProjectEditorFiles");
    if(files&&!files.dataset.bound){files.dataset.bound="1";files.onchange=uploadProjects;}

    for(const id of ["localHeroTitle","localHeroSubtitle","localAboutTitle","localAboutText","localCatalogTitle","localProjectsTitle","localProjectsText","localBlogTitle","localContactTitle","localStorePreset","localStoreTheme","localStoreAccent"]){
      const el=$id(id);
      if(el&&!el.dataset.visualBound){
        el.dataset.visualBound="1";
        el.addEventListener(el.tagName==="SELECT"?"change":"input",()=>renderCanvas());
      }
    }
    for(const id of ["localShowAbout","localShowCatalog","localShowProjects","localShowBlog","localShowContact"]){
      const el=$id(id);
      if(el&&!el.dataset.visualBound){el.dataset.visualBound="1";el.addEventListener("change",()=>renderCanvas());}
    }

    if(!projectReplaceInput){
      projectReplaceInput=document.createElement("input");
      projectReplaceInput.type="file";
      projectReplaceInput.accept="image/png,image/jpeg,image/webp";
      projectReplaceInput.hidden=true;
      projectReplaceInput.onchange=replaceProjectImage;
      document.body.appendChild(projectReplaceInput);
    }
  }

  async function persistServices(showMessage=true){
    const id=localId();
    if(!id)return;
    try{
      const saved=await rpc("save_my_local_services",{p_local_id:id,p_services:servicePayload()});
      state.localServices=Array.isArray(saved)?saved:servicePayload();
      renderServicesInspector();
      renderCanvas();
      if(typeof renderLocalStorePreview==="function")renderLocalStorePreview();
      if(showMessage)message("Servicios actualizados.");
    }catch(e){message(e.message||"No se pudieron guardar los servicios.","error");}
  }

  function renderServicesInspector(){
    const grid=$id("localServiceEditorGrid");
    if(!grid)return;
    ensureServices();
    const rows=state.localServices||[];
    grid.innerHTML=rows.map((s,index)=>{
      const image=s.image_url?'<img src="'+esc(s.image_url)+'" alt="">':'<div class="local-service-image-placeholder">+ Foto</div>';
      return '<article class="local-project-edit-card" data-service-id="'+esc(s.id)+'">'+
        image+
        '<div class="local-project-edit-body">'+
          '<label>Nombre del servicio<input data-service-title maxlength="120" value="'+esc(s.title||"")+'"></label>'+
          '<label>Descripción<textarea data-service-description rows="3" maxlength="700">'+esc(s.description||"")+'</textarea></label>'+
          '<div class="local-project-edit-actions">'+
            '<label>Posición<input data-service-order type="number" min="0" max="99" value="'+(Number(s.display_order)||index)+'"></label>'+
            '<button type="button" class="btn-muted" data-service-photo>'+(s.image_url?"Cambiar foto":"+ Foto")+'</button>'+
            '<button type="button" class="btn-danger" data-service-delete>Eliminar</button>'+
          '</div>'+
          '<button type="button" class="btn-primary" data-service-save>Guardar servicio</button>'+
        '</div>'+
      '</article>';
    }).join("");
    grid.querySelectorAll("[data-service-id]").forEach(card=>{
      const id=card.dataset.serviceId;
      card.querySelector("[data-service-save]").onclick=async()=>{
        const s=(state.localServices||[]).find(x=>x.id===id);if(!s)return;
        s.title=clean(card.querySelector("[data-service-title]")?.value);
        s.description=clean(card.querySelector("[data-service-description]")?.value);
        s.display_order=Math.max(0,Math.min(99,Number(card.querySelector("[data-service-order]")?.value)||0));
        await persistServices();
      };
      card.querySelector("[data-service-photo]").onclick=()=>chooseServiceImage(id);
      card.querySelector("[data-service-delete]").onclick=()=>removeService(id);
    });
  }

  async function addService(){
    ensureServices();
    if((state.localServices||[]).length>=24)return message("Puedes mostrar hasta 24 servicios.","error");
    const id=crypto.randomUUID();
    state.localServices.push({id,title:"Nuevo servicio",description:"Describe este servicio.",image_url:"",storage_path:"",display_order:state.localServices.length});
    renderServicesInspector();
    renderCanvas();
    await persistServices(false);
    requestAnimationFrame(()=>{
      const card=document.querySelector('[data-service-id="'+id+'"]');
      card?.scrollIntoView({behavior:"smooth",block:"center"});
      card?.querySelector("[data-service-title]")?.select();
    });
  }

  function chooseServiceImage(id){
    pendingServiceImageId=id;
    const input=$id("localServiceImageFile");
    if(input){input.value="";input.click();}
  }

  async function uploadServiceImage(){
    const input=$id("localServiceImageFile");
    const file=input?.files?.[0];
    const id=pendingServiceImageId;
    const lid=localId();
    if(!file||!id||!lid)return;
    const service=(state.localServices||[]).find(x=>x.id===id);
    if(!service)return;
    let uploaded=null;
    const oldPath=service.storage_path||null;
    try{
      const path=mediaPathLocalService(lid,id);
      uploaded=await subirImagenHTPWEB(path,file);
      service.image_url=uploaded.url;
      service.storage_path=uploaded.path;
      await persistServices(false);
      if(oldPath&&oldPath!==uploaded.path)await eliminarObjetoMediaHTPWEB(oldPath).catch(()=>{});
      message("Foto del servicio actualizada.");
    }catch(e){if(uploaded?.path)await eliminarObjetoMediaHTPWEB(uploaded.path).catch(()=>{});message(e.message||"No se pudo subir la foto.","error");}
    finally{pendingServiceImageId=null;if(input)input.value="";}
  }

  async function removeService(id){
    const service=(state.localServices||[]).find(x=>x.id===id);
    if(!service)return;
    if(!confirm("¿Eliminar este servicio?"))return;
    state.localServices=state.localServices.filter(x=>x.id!==id).map((s,i)=>({...s,display_order:i}));
    await persistServices(false);
    if(service.storage_path)await eliminarObjetoMediaHTPWEB(service.storage_path).catch(()=>{});
    message("Servicio eliminado.");
  }

  async function loadProjects(){
    const grid=$id("localProjectEditorGrid");
    const lid=localId();
    if(!lid){state.localProjects=[];if(grid)grid.innerHTML='<div class="muted">Selecciona un LOCAL.</div>';renderCanvas();return;}
    try{
      const data=await rpc("list_local_gallery",{p_local_id:lid});
      state.localProjects=Array.isArray(data)?data:[];
      renderProjects();
      renderCanvas();
      if(typeof renderLocalStorePreview==="function")renderLocalStorePreview();
    }catch(e){
      state.localProjects=[];
      if(grid)grid.innerHTML='<div class="message error">'+esc(e.message||"No se pudieron cargar los proyectos.")+'</div>';
    }
  }

  function renderProjects(){
    const grid=$id("localProjectEditorGrid");
    if(!grid)return;
    const rows=state.localProjects||[];
    if(!rows.length){grid.innerHTML='<div class="local-project-editor-empty"><strong>Aún no tienes proyectos</strong><span>Haz clic en “Agregar proyecto” y selecciona una o varias fotografías.</span></div>';return;}
    grid.innerHTML=rows.map((item,index)=>{
      const order=Number.isFinite(Number(item.display_order))?Number(item.display_order):index;
      return '<article class="local-project-edit-card" data-project-id="'+esc(item.id)+'">'+
        '<img src="'+esc(item.image_url)+'" alt="">'+
        '<div class="local-project-edit-body">'+
          '<label>Nombre del proyecto<input data-project-title maxlength="120" value="'+esc(item.title||"")+'" placeholder="Ej. Edificio Corporativo Delta"></label>'+
          '<label>Descripción<textarea data-project-description rows="3" maxlength="500" placeholder="Qué se hizo, dónde y cuál fue el resultado.">'+esc(item.description||"")+'</textarea></label>'+
          '<div class="local-project-edit-actions">'+
            '<label>Posición<input data-project-order type="number" min="0" max="99" value="'+order+'"></label>'+
            '<button type="button" class="btn-muted" data-project-photo>Cambiar foto</button>'+
            '<button type="button" class="btn-danger" data-project-delete>Eliminar</button>'+
          '</div>'+
          '<button type="button" class="btn-primary" data-project-save>Guardar proyecto</button>'+
        '</div>'+
      '</article>';
    }).join("");
    grid.querySelectorAll(".local-project-edit-card").forEach(card=>{
      card.querySelector("[data-project-save]").onclick=()=>saveProject(card);
      card.querySelector("[data-project-photo]").onclick=()=>chooseProjectReplacement(card.dataset.projectId);
      card.querySelector("[data-project-delete]").onclick=()=>deleteProject(card.dataset.projectId);
    });
  }

  async function uploadProjects(){
    const input=$id("localProjectEditorFiles");
    const files=[...(input?.files||[])];
    const lid=localId();
    if(!lid)return message("Selecciona un LOCAL.","error");
    if(!files.length)return;
    if(files.length>12)return message("Puedes agregar hasta 12 fotografías por operación.","error");
    if((state.localProjects?.length||0)+files.length>24)return message("Puedes mostrar hasta 24 proyectos en tu portafolio.","error");
    try{
      input.disabled=true;message("Subiendo proyectos…");
      for(const file of files){
        const imageId=crypto.randomUUID(),path=mediaPathLocalGallery(lid,imageId);
        let uploaded=null;
        try{
          uploaded=await subirImagenHTPWEB(path,file);
          await rpc("save_local_gallery_image",{p_local_id:lid,p_image_id:imageId,p_image_url:uploaded.url,p_storage_path:uploaded.path,p_display_order:(state.localProjects?.length||0)});
          state.localProjects.push({id:imageId,image_url:uploaded.url,storage_path:uploaded.path,display_order:state.localProjects.length,title:"",description:""});
        }catch(e){if(uploaded?.path)await eliminarObjetoMediaHTPWEB(uploaded.path).catch(()=>{});throw e;}
      }
      input.value="";await loadProjects();message("Proyecto(s) agregado(s). Haz clic sobre el título o la descripción para editarlos.");
    }catch(e){message(e.message||"No se pudieron subir las fotografías.","error");}
    finally{input.disabled=false;}
  }

  async function saveProject(card){
    const id=card?.dataset?.projectId;
    const project=(state.localProjects||[]).find(x=>x.id===id);
    if(!project)return;
    project.title=clean(card.querySelector("[data-project-title]")?.value);
    project.description=clean(card.querySelector("[data-project-description]")?.value);
    project.display_order=Math.max(0,Math.min(99,Number(card.querySelector("[data-project-order]")?.value)||0));
    await saveProjectRecord(project,true);
  }

  async function saveProjectInline(id,title,description){
    const project=(state.localProjects||[]).find(x=>x.id===id);if(!project)return;
    project.title=title;project.description=description;
    await saveProjectRecord(project,false);
  }

  async function saveProjectRecord(project,showMessage){
    const lid=localId();if(!lid||!project?.id)return;
    try{
      await rpc("update_local_gallery_project",{p_local_id:lid,p_image_id:project.id,p_title:project.title||null,p_description:project.description||null,p_display_order:Number(project.display_order)||0});
      if(showMessage)message("Proyecto actualizado.");
      await loadProjects();
    }catch(e){message(e.message||"No se pudo guardar el proyecto.","error");}
  }

  function chooseProjectReplacement(id){
    pendingProjectReplaceId=id;
    if(projectReplaceInput){projectReplaceInput.value="";projectReplaceInput.click();}
  }

  async function replaceProjectImage(){
    const file=projectReplaceInput?.files?.[0];
    const project=(state.localProjects||[]).find(x=>x.id===pendingProjectReplaceId);
    const lid=localId();
    if(!file||!project||!lid)return;
    let uploaded=null;
    try{
      const path=project.storage_path||mediaPathLocalGallery(lid,project.id);
      uploaded=await subirImagenHTPWEB(path,file);
      await rpc("save_local_gallery_image",{p_local_id:lid,p_image_id:project.id,p_image_url:uploaded.url,p_storage_path:uploaded.path,p_display_order:Number(project.display_order)||0});
      project.image_url=uploaded.url;project.storage_path=uploaded.path;
      await rpc("update_local_gallery_project",{p_local_id:lid,p_image_id:project.id,p_title:project.title||null,p_description:project.description||null,p_display_order:Number(project.display_order)||0});
      await loadProjects();message("Foto del proyecto actualizada.");
    }catch(e){message(e.message||"No se pudo cambiar la foto.","error");}
    finally{pendingProjectReplaceId=null;if(projectReplaceInput)projectReplaceInput.value="";}
  }

  async function deleteProject(imageId){
    const lid=localId();if(!lid||!imageId)return;
    if(!confirm("¿Eliminar este proyecto y su fotografía?"))return;
    try{
      const item=(state.localProjects||[]).find(x=>x.id===imageId);
      const path=await rpc("delete_local_gallery_image",{p_local_id:lid,p_image_id:imageId});
      if(path||item?.storage_path)await eliminarObjetoMediaHTPWEB(path||item.storage_path).catch(()=>{});
      await loadProjects();message("Proyecto eliminado.");
    }catch(e){message(e.message||"No se pudo eliminar el proyecto.","error");}
  }

  function init(){
    bindTabs();
    renderServicesInspector();
    renderCanvas();
  }

  init();
  setTimeout(init,600);
  window.openLocalPageEditorTab=openTab;
  window.loadLocalProjectEditor=async()=>{renderServicesInspector();await loadProjects();renderCanvas();};
  window.renderLocalVisualPageEditor=renderCanvas;
})();