(function(){
  const DESIGNS=["SIGNATURE","MINIMAL","SPLIT","SIDEBAR","EDITORIAL","LUXE","BOLD","MAGAZINE","IMMERSIVE","COMPACT"];
  function cleanToken(v){return String(v||"").toUpperCase().replace(/[^A-Z0-9_-]/g,"");}
  function resolve(store){
    const ref=store?.settings?.content_config?.imported_design?.reference_layout;
    if(ref?.enabled)return {design:"REFERENCE",family:cleanToken(store?.preset?.layout_family||"GENERAL"),ref};
    const raw=cleanToken(store?.preset?.config?.design_system||"SIGNATURE");
    return {design:DESIGNS.includes(raw)?raw:"SIGNATURE",family:cleanToken(store?.preset?.layout_family||"GENERAL"),ref:null};
  }
  function purge(body){
    [...body.classList].forEach(c=>{
      if(c.startsWith("design-")||c.startsWith("family-")||c.startsWith("chrome-")||c.startsWith("surface-"))body.classList.remove(c);
    });
    delete body.dataset.designSystem;
    delete body.dataset.layoutFamily;
    delete body.dataset.chromeVersion;
  }
  function removeGenerated(){
    document.querySelectorAll("[data-htp-chrome-generated]").forEach(el=>el.remove());
  }
  function labelFor(design){
    return {SIGNATURE:"Signature",MINIMAL:"Minimal",SPLIT:"Split",SIDEBAR:"Sidebar",EDITORIAL:"Editorial",LUXE:"Luxe",BOLD:"Bold",MAGAZINE:"Magazine",IMMERSIVE:"Immersive",COMPACT:"Compact",REFERENCE:"Reference"}[design]||design;
  }
  function familyKicker(store){
    const family=cleanToken(store?.preset?.layout_family||"GENERAL");
    return {
      PROFESSIONAL:"Ingeniería & proyectos",
      FOOD:"Gastronomía",
      RETAIL:"Productos & soluciones",
      FASHION:"Colección & estilo",
      BOOKS:"Lectura & conocimiento",
      FLOWERS:"Diseño floral",
      HEALTH:"Bienestar & cuidado",
      HARDWARE:"Herramientas & soluciones",
      SERVICES:"Servicios profesionales",
      BEAUTY:"Belleza & cuidado",
      GENERAL:"Sitio oficial"
    }[family]||"Sitio oficial";
  }
  function decorateHeader(design,store){
    const header=document.querySelector(".local-store-header");
    const inner=document.querySelector(".local-store-header-inner");
    const brand=document.querySelector(".local-brand");
    const nav=document.querySelector(".local-site-nav");
    if(!header||!inner||!brand||!nav)return;
    header.dataset.chrome=design;
    inner.dataset.chrome=design;

    if(design==="MAGAZINE"){
      const kicker=document.createElement("div");
      kicker.className="chrome-magazine-kicker";
      kicker.dataset.htpChromeGenerated="1";
      kicker.textContent=familyKicker(store);
      brand.insertAdjacentElement("beforebegin",kicker);
    }
    if(design==="EDITORIAL"){
      const rule=document.createElement("div");
      rule.className="chrome-editorial-rule";
      rule.dataset.htpChromeGenerated="1";
      inner.appendChild(rule);
    }
    if(design==="BOLD"){
      const tag=document.createElement("span");
      tag.className="chrome-bold-tag";
      tag.dataset.htpChromeGenerated="1";
      tag.textContent="●";
      brand.prepend(tag);
    }
    if(design==="LUXE"){
      const mark=document.createElement("span");
      mark.className="chrome-luxe-mark";
      mark.dataset.htpChromeGenerated="1";
      mark.textContent="◆";
      brand.prepend(mark);
    }
  }
  function decorateFooter(design,store){
    const footer=document.querySelector(".local-site-footer");
    if(!footer)return;
    footer.dataset.chrome=design;
    if(design==="MAGAZINE"){
      const mast=document.createElement("div");
      mast.className="chrome-magazine-footer-mast";
      mast.dataset.htpChromeGenerated="1";
      mast.textContent=store?.local?.name||"";
      footer.prepend(mast);
    }
  }
  function apply(store){
    const body=document.body;if(!body)return null;
    const {design,family,ref}=resolve(store);
    purge(body);removeGenerated();
    body.dataset.designSystem=design;
    body.dataset.layoutFamily=family;
    body.dataset.chromeVersion="20261007.3";
    body.classList.add("family-"+family,"chrome-"+design,"surface-"+cleanToken(store?.settings?.surface_style||"SOFT"));
    if(design!=="REFERENCE")body.classList.add("design-"+design);
    else body.classList.add("imported-reference");
    decorateHeader(design,store);
    decorateFooter(design,store);
    return {design,family,reference:ref,label:labelFor(design)};
  }
  window.HTPWEBStorefrontChrome={apply,resolve,version:"20261007.3"};
})();