(() => {
  const familyLabels = {
    FOOD: "Gastronomía", RESTAURANT: "Restaurantes", RETAIL: "Comercio & Retail", FASHION: "Moda & Boutique",
    BOOKS: "Librería & Papelería", FLOWERS: "Flores & Regalos", HEALTH: "Salud & Bienestar",
    HARDWARE: "Catálogo Técnico", SERVICES: "Servicios", PROFESSIONAL: "Ingeniería & Profesional",
    BEAUTY: "Belleza & Citas", GENERAL: "General"
  };
  const palette = {
    FOOD:["#b91c1c","#f59e0b"], RESTAURANT:["#c65d36","#f59e0b"], RETAIL:["#0f766e","#14b8a6"], FASHION:["#111827","#d946ef"],
    BOOKS:["#92400e","#fbbf24"], FLOWERS:["#be185d","#f9a8d4"], HEALTH:["#0f766e","#38bdf8"],
    HARDWARE:["#111827","#f97316"], SERVICES:["#1d4ed8","#60a5fa"], PROFESSIONAL:["#0f172a","#64748b"],
    BEAUTY:["#7c3aed","#ec4899"], GENERAL:["#1466e8","#0b1730"]
  };
  let all = [];
  let filtered = [];
  let loaded = false;

  const E = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const designOf = p => String(p?.config?.design_system || "SIGNATURE").toUpperCase();
  const familyOf = p => String(p?.layout_family || "GENERAL").toUpperCase();

  function thumbMarkup(p){
    const design = designOf(p);
    const family = familyOf(p);
    const colors = palette[family] || palette.GENERAL;
    const inner = typeof professionalTemplateThumb === "function"
      ? professionalTemplateThumb(design)
      : '<div class="eng-thumb hero"><i></i><b></b><span></span></div>';
    return '<div class="master-site-thumb design-'+E(design.toLowerCase())+'" style="--site-a:'+E(colors[0])+';--site-b:'+E(colors[1])+'">'+inner+'</div>';
  }

  function renderFilters(){
    const category = document.getElementById("masterSitesCategory");
    const design = document.getElementById("masterSitesDesign");
    if(category){
      const families = [...new Set(all.map(familyOf))].sort();
      category.innerHTML = '<option value="ALL">Todas las categorías</option>' +
        families.map(f => '<option value="'+E(f)+'">'+E(familyLabels[f] || f)+'</option>').join("");
    }
    if(design){
      const designs = [...new Set(all.map(designOf))].sort();
      design.innerHTML = '<option value="ALL">Todos los diseños</option>' +
        designs.map(d => '<option value="'+E(d)+'">'+E(d)+'</option>').join("");
    }
  }

  function render(){
    const grid = document.getElementById("masterSitesGrid");
    if(!grid) return;
    const q = (document.getElementById("masterSitesSearch")?.value || "").trim().toLowerCase();
    const family = document.getElementById("masterSitesCategory")?.value || "ALL";
    const design = document.getElementById("masterSitesDesign")?.value || "ALL";

    filtered = all.filter(p => {
      if(family !== "ALL" && familyOf(p) !== family) return false;
      if(design !== "ALL" && designOf(p) !== design) return false;
      if(!q) return true;
      return [p.name,p.code,p.description,p.business_fit,familyLabels[familyOf(p)],designOf(p)]
        .some(v => String(v || "").toLowerCase().includes(q));
    });

    const total = document.getElementById("masterSitesTotal");
    const shown = document.getElementById("masterSitesShown");
    if(total) total.textContent = String(all.length);
    if(shown) shown.textContent = String(filtered.length);

    if(!filtered.length){
      grid.innerHTML = '<div class="master-sites-empty"><strong>No hay plantillas con esos filtros.</strong><span>Prueba otra categoría, diseño o búsqueda.</span></div>';
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const family = familyOf(p), design = designOf(p);
      return '<article class="master-site-card">'+
        '<button type="button" class="master-site-preview-hit" data-master-site-preview="'+E(p.code)+'" aria-label="Previsualizar '+E(p.name)+'">'+thumbMarkup(p)+'</button>'+
        '<div class="master-site-card-body">'+
          '<div class="master-site-card-head"><div><span class="master-site-family">'+E(familyLabels[family] || family)+'</span><h3>'+E(p.name)+'</h3></div><span class="master-site-design">'+E(design)+'</span></div>'+
          '<p>'+E(p.description || p.business_fit || "Plantilla profesional HTPWEB")+'</p>'+
          '<div class="master-site-meta"><span>'+E(p.code)+'</span><span>'+E(p.business_fit || "")+'</span></div>'+
          '<button type="button" class="btn-primary master-site-preview-btn" data-master-site-preview="'+E(p.code)+'">Vista previa</button>'+
        '</div>'+
      '</article>';
    }).join("");

    grid.querySelectorAll("[data-master-site-preview]").forEach(btn => btn.onclick = () => openPreview(btn.dataset.masterSitePreview));
  }

  function previewMarkup(p){
    const family = familyOf(p), design = designOf(p), colors = palette[family] || palette.GENERAL;
    if(typeof professionalStorefrontPreviewMarkup === "function"){
      return professionalStorefrontPreviewMarkup({
        design, family, primary:colors[0], secondary:colors[1], background:"#f7f8fb", surface:"#ffffff", text:"#111827",
        hero:p.name || "Tu negocio", subtitle:p.description || p.business_fit || "Una propuesta profesional lista para publicar.",
        catalog:"Productos / Servicios", about:"Quiénes somos", projects:"Proyectos", contact:"Contacto",
        nav:["Inicio","Quiénes somos","Productos / Servicios","Proyectos","Contacto"], bannerCss:""
      });
    }
    return '<div style="padding:40px"><h1>'+E(p.name)+'</h1><p>'+E(p.description || "")+'</p></div>';
  }

  function previewDocument(p){
    const family=familyOf(p), design=designOf(p);
    const architectureCss=new URL("../assets/storefront-architectures.css?v=20261007-mobile2",location.href).href;
    const shellCss=new URL("../assets/storefront-shell.css?v=20261007-internalarch4",location.href).href;
    const systemsCss=new URL("../assets/storefront-design-systems.css?v=20261006-shared1",location.href).href;
    const bodyClass="local-store architecture-home design-"+design+" family-"+family;
    return '<!doctype html><html><head><meta charset="utf-8">'+
      '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
      '<link rel="stylesheet" href="'+E(systemsCss)+'">'+
      '<link rel="stylesheet" href="'+E(shellCss)+'">'+
      '<link rel="stylesheet" href="'+E(architectureCss)+'">'+
      '<style>html,body{margin:0;min-height:100%;background:#fff}body{overflow-x:hidden}.eng-architecture{min-height:100vh}</style>'+
      '</head><body class="'+E(bodyClass)+'">'+previewMarkup(p)+'</body></html>';
  }

  function fitMasterPreview(mode){
    const stage=document.querySelector(".master-site-preview-stage");
    const frame=document.getElementById("masterSitePreviewFrame");
    const iframe=document.getElementById("masterSitePreviewIframe");
    if(!stage||!frame||!iframe)return;
    const mobile=mode==="mobile";
    const viewportW=mobile?390:1280;
    const viewportH=mobile?844:800;
    const available=Math.max(260,stage.clientWidth-36);
    const scale=Math.min(1,available/viewportW);
    iframe.style.width=viewportW+"px";
    iframe.style.height=viewportH+"px";
    iframe.style.transform="scale("+scale+")";
    frame.style.width=(viewportW*scale)+"px";
    frame.style.height=(viewportH*scale)+"px";
    frame.dataset.viewport=mobile?"390 × 844":"1280 × 800";
  }

  function setMasterPreviewDevice(mode){
    const frame=document.getElementById("masterSitePreviewFrame");
    if(!frame)return;
    const safe=mode==="mobile"?"mobile":"desktop";
    frame.className="master-site-preview-frame "+safe;
    requestAnimationFrame(()=>fitMasterPreview(safe));
    document.querySelectorAll("[data-master-sites-device]").forEach(b=>b.classList.toggle("active",b.dataset.masterSitesDevice===safe));
  }

  function openPreview(code){
    const p = all.find(x => x.code === code);
    if(!p) return;
    const modal = document.getElementById("masterSitePreviewModal");
    const frame = document.getElementById("masterSitePreviewFrame");
    const title = document.getElementById("masterSitePreviewTitle");
    const meta = document.getElementById("masterSitePreviewMeta");
    if(!modal || !frame) return;
    if(title) title.textContent = p.name;
    if(meta) meta.textContent = (familyLabels[familyOf(p)] || familyOf(p)) + " · " + designOf(p) + " · " + p.code;
    const iframe=document.getElementById("masterSitePreviewIframe");
    if(iframe){
      if(p.preview_href){iframe.removeAttribute("srcdoc");iframe.src=new URL(p.preview_href,location.href).href;}
      else {iframe.removeAttribute("src");iframe.srcdoc=previewDocument(p);}
    }
    setMasterPreviewDevice("desktop");
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden","false");
    document.body.style.overflow = "hidden";
    document.querySelectorAll("[data-master-sites-device]").forEach(b => b.classList.toggle("active", b.dataset.masterSitesDevice === "desktop"));
  }

  function closePreview(){
    const modal = document.getElementById("masterSitePreviewModal");
    if(!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden","true");
    document.body.style.overflow = "";
  }

  function bind(){
    const search = document.getElementById("masterSitesSearch");
    const category = document.getElementById("masterSitesCategory");
    const design = document.getElementById("masterSitesDesign");
    const refresh = document.getElementById("masterSitesRefreshBtn");
    if(search && !search.dataset.bound){ search.dataset.bound="1"; search.addEventListener("input",render); }
    if(category && !category.dataset.bound){ category.dataset.bound="1"; category.addEventListener("change",render); }
    if(design && !design.dataset.bound){ design.dataset.bound="1"; design.addEventListener("change",render); }
    if(refresh && !refresh.dataset.bound){ refresh.dataset.bound="1"; refresh.onclick=()=>load(true); }

    const closeBtn = document.getElementById("masterSitePreviewClose");
    if(closeBtn && !closeBtn.dataset.bound){
      closeBtn.dataset.bound="1";
      closeBtn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        closePreview();
      };
    }

    const previewModal = document.getElementById("masterSitePreviewModal");
    if(previewModal && !previewModal.dataset.bound){
      previewModal.dataset.bound="1";
      previewModal.onclick = e => {
        if(e.target === previewModal) closePreview();
      };
    }

    if(!document.body.dataset.masterSitesEscapeBound){
      document.body.dataset.masterSitesEscapeBound="1";
      document.addEventListener("keydown",e=>{
        if(e.key==="Escape" && !document.getElementById("masterSitePreviewModal")?.classList.contains("hidden")){
          closePreview();
        }
      });
    }

    document.querySelectorAll("[data-master-sites-device]").forEach(btn => {
      if(btn.dataset.bound) return;
      btn.dataset.bound="1";
      btn.onclick=()=>{
        const frame=document.getElementById("masterSitePreviewFrame");
        if(!frame)return;
        const mode=btn.dataset.masterSitesDevice==="mobile"?"mobile":"desktop";
        setMasterPreviewDevice(mode);
      };
    });
  }

  async function load(force=false){
    if(typeof state !== "undefined" && state.role !== "MASTER") return;
    bind();
    const status = document.getElementById("masterSitesStatus");
    if(loaded && !force){ render(); return; }
    if(status) status.textContent = "Cargando biblioteca completa de plantillas…";
    try{
      const {data,error}=await supabaseClient
        .from("local_storefront_presets")
        .select("code,name,business_fit,description,layout_family,config,active,display_order")
        .eq("active",true)
        .order("layout_family",{ascending:true})
        .order("display_order",{ascending:true});
      if(error) throw error;
      // Premium V3 static collection: catalog only, NEVER assigns storefronts to existing businesses.
      const v3Response = await fetch(new URL("../premium-v3/showcase/catalog-manifest.json",location.href),{cache:"no-cache"});
      if(!v3Response.ok) throw new Error("No se pudo cargar el catálogo Premium V3");
      const v3 = await v3Response.json();
      if(!Array.isArray(v3) || v3.length !== 330) throw new Error("Catálogo Premium V3 incompleto");
      v3.forEach(p => {familyLabels[p.layout_family]=p.category_name;});
      all = [...(data || []),...v3];
      loaded = true;
      renderFilters();
      render();
      const families = new Set(all.map(familyOf));
      if(status) status.textContent = all.length+" plantillas activas · "+families.size+" categorías visuales";
    }catch(e){
      if(status) status.textContent = "No se pudo cargar la biblioteca.";
      const grid=document.getElementById("masterSitesGrid");
      if(grid) grid.innerHTML='<div class="master-sites-empty"><strong>Error al cargar plantillas</strong><span>'+E(e?.message||"Intenta actualizar nuevamente.")+'</span></div>';
      if(typeof message==="function") message(e?.message||"No se pudieron cargar las plantillas.","error");
    }
  }

  window.loadMasterWebsites = load;
})();
