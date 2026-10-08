(function(){
"use strict";
const PROFILES={
 FOOD:{kicker:"SABOR · EXPERIENCIA · PEDIDOS",services:["Especialidades","Menú destacado","Combos y promociones","Pedidos y delivery"],projects:["Plato insignia","Experiencia del local","Promoción del día"],trust:["Ingredientes y sabor","Atención rápida","Pedido directo"]},
 RESTAURANT:{kicker:"MENÚ · SABOR · PEDIDOS",services:["Especialidades de la casa","Menú completo","Combos y promociones","Pedidos y delivery"],projects:["Plato recomendado","Favoritos del menú","Promoción del día"],trust:["Productos del menú","Pedido directo","Atención rápida"]},
 RETAIL:{kicker:"COMPRA · VARIEDAD · DISPONIBILIDAD",services:["Categorías destacadas","Promociones","Novedades","Compra rápida"],projects:["Más vendidos","Recomendados","Oferta especial"],trust:["Stock visible","Compra ágil","Atención directa"]},
 FASHION:{kicker:"COLECCIÓN · ESTILO · TENDENCIA",services:["Nueva colección","Looks destacados","Accesorios","Compra online"],projects:["Editorial","Colección cápsula","Tendencias"],trust:["Curaduría de estilo","Nuevos ingresos","Compra segura"]},
 BOOKS:{kicker:"LECTURA · IDEAS · DESCUBRIMIENTO",services:["Novedades editoriales","Escolar y oficina","Recomendados","Pedidos especiales"],projects:["Selección del mes","Autores destacados","Colecciones"],trust:["Catálogo curado","Reserva fácil","Atención personalizada"]},
 FLOWERS:{kicker:"DETALLES · EMOCIONES · MOMENTOS",services:["Arreglos florales","Regalos especiales","Eventos","Pedidos personalizados"],projects:["Colección romántica","Celebraciones","Diseños exclusivos"],trust:["Hecho con cuidado","Entrega coordinada","Personalización"]},
 HEALTH:{kicker:"SALUD · CONFIANZA · CUIDADO",services:["Especialidades","Atención profesional","Servicios clínicos","Agenda y contacto"],projects:["Equipo médico","Instalaciones","Programas de salud"],trust:["Profesionales","Atención segura","Contacto directo"]},
 HARDWARE:{kicker:"CATÁLOGO · SOLUCIONES · DISPONIBILIDAD",services:["Líneas de producto","Asesoría técnica","Marcas","Cotización"],projects:["Producto destacado","Solución recomendada","Aplicación técnica"],trust:["Stock y variedad","Asesoría técnica","Compra directa"]},
 SERVICES:{kicker:"EXPERIENCIA · SERVICIO · RESULTADOS",services:["Servicios principales","Soluciones a medida","Casos atendidos","Agenda y contacto"],projects:["Caso destacado","Proceso de trabajo","Resultado logrado"],trust:["Atención profesional","Experiencia","Respuesta directa"]},
 BEAUTY:{kicker:"BELLEZA · CUIDADO · EXPERIENCIA",services:["Servicios estrella","Tratamientos","Paquetes","Reservas"],projects:["Transformaciones","Experiencia studio","Tendencias"],trust:["Atención personalizada","Profesionales","Reserva fácil"]},
 PROFESSIONAL:{kicker:"INGENIERÍA · PROYECTOS · SOLUCIONES",services:["Ingeniería y diseño","Arquitectura y planificación","Gestión de proyectos","Consultoría técnica"],projects:["Corredor Metropolitano","Planta Horizonte","Centro Operativo Delta"],trust:["Soluciones a medida","Experiencia técnica","Contacto directo"]},
 GENERAL:{kicker:"NEGOCIO · EXPERIENCIA · CONFIANZA",services:["Servicios","Productos","Novedades","Contacto"],projects:["Destacado","Experiencia","Novedad"],trust:["Calidad","Atención","Contacto directo"]}
};
const MEDIA={
 FOOD:{hero:"https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=2000&q=86",projects:["https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=900&q=80"]},
 RESTAURANT:{hero:"https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=2000&q=86",projects:["https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&w=900&q=80"]},
 PROFESSIONAL:{hero:"https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=2000&q=86",projects:["https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80"]},
 BOOKS:{hero:"https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=2000&q=86",projects:["https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1496104679561-38d3af73f9b0?auto=format&fit=crop&w=900&q=80"]},
 BEAUTY:{hero:"https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=2000&q=86",projects:["https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=900&q=80"]},
 HEALTH:{hero:"https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=2000&q=86",projects:["https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1551076805-e1869033e561?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1584982751601-97dcc096659c?auto=format&fit=crop&w=900&q=80"]},
 HARDWARE:{hero:"https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=2000&q=86",projects:["https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1513467535987-fd81bc7d62f8?auto=format&fit=crop&w=900&q=80"]},
 FASHION:{hero:"https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=2000&q=86",projects:["https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80"]},
 FLOWERS:{hero:"https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=2000&q=86",projects:["https://images.unsplash.com/photo-1518882605630-8eb7c9cfadcd?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1507501336603-6e31db2be093?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=900&q=80"]},
 SERVICES:{hero:"https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=2000&q=86",projects:["https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80"]},
 RETAIL:{hero:"https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=2000&q=86",projects:["https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1580915411954-282cb1b0d780?auto=format&fit=crop&w=900&q=80"]},
 GENERAL:{hero:"https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=2000&q=86",projects:["https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=900&q=80","https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=900&q=80"]}
};
function e(v){return String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
function p(f){return PROFILES[f]||PROFILES.GENERAL}
function m(f){return MEDIA[f]||MEDIA.GENERAL}
function navHtml(items,links){
 return (items||[]).map((x,i)=>links?'<a href="'+e(x.href||"#")+'" data-site-section="'+e(x.section||"")+'">'+e(x.label||x)+'</a>':'<span>'+e(x.label||x)+'</span>').join("");
}

function renderApexHome(ctx,family,profile,media){
 const name=e(ctx.name||"LOCAL"),hero=e(ctx.hero||ctx.name||"LOCAL"),subtitle=e(ctx.subtitle||""),
  about=e(ctx.about||"Quiénes somos"),catalog=e(ctx.catalog||"Capacidades"),projects=e(ctx.projects||"Proyectos");
 const nav=navHtml(ctx.nav||[],!!ctx.links),links=!!ctx.links;
 const href=section=>{const item=(ctx.nav||[]).find(x=>String(x?.section||"").toLowerCase()===section);return item?.href||"#";};
 const action=(label,section,cls="apex-btn")=>links?'<a class="'+cls+'" href="'+e(href(section))+'" data-site-section="'+section+'">'+e(label)+'</a>':'<span class="'+cls+'">'+e(label)+'</span>';
 const heroImg=e(ctx.banner||media.hero);
 const projectsArr=(ctx.projectItems?.length?ctx.projectItems:profile.projects.map((title,i)=>({title,image:media.projects[i%media.projects.length]}))).slice(0,3);
 const projectCards=projectsArr.map((x,i)=>'<article class="apex-project '+(i===0?'featured':'')+'"><img src="'+e(x.image||media.projects[i%media.projects.length])+'" alt=""><div><small>'+e(["INFRAESTRUCTURA","ARQUITECTURA","PLANIFICACIÓN"][i]||"PROYECTO")+' / '+(2025-i)+'</small><h3>'+e(x.title||"Proyecto destacado")+'</h3></div></article>').join("");
 const disciplines=(ctx.serviceItems?.length?ctx.serviceItems:profile.services.map((title,i)=>({title,copy:"Soluciones técnicas integradas con visión de largo plazo."}))).slice(0,5).map((x,i)=>'<article><b>0'+(i+1)+'</b><h3>'+e(x.title||"Capacidad")+'</h3><p>'+e(x.copy||"")+'</p></article>').join("");
 const blog=(ctx.blogItems?.length?ctx.blogItems:[
   {title:"La infraestructura del futuro empieza con mejores decisiones",date:"Actualidad"},
   {title:"BIM: coordinar antes de construir",date:"Innovación"},
   {title:"Diseñar para un territorio que cambia",date:"Sostenibilidad"}
 ]).slice(0,3).map(x=>'<article><small>'+e(x.date||"PERSPECTIVAS")+'</small><h3>'+e(x.title||"Perspectiva")+'</h3><span>Leer perspectiva →</span></article>').join("");
 const contactItems=(ctx.contactItems||[]).map(x=>'<div><small>'+e(x.label||"")+'</small><strong>'+e(x.value||"")+'</strong></div>').join("");
 return '<div class="eng-architecture family-'+e(family)+' arch-APEX">'+
  '<header class="apex-nav"><strong>'+name+'</strong><nav>'+nav+'</nav>'+action("Hablemos","contact","apex-nav-cta")+'</header>'+
  '<section class="apex-hero" style="background-image:linear-gradient(90deg,rgba(3,7,18,.88),rgba(3,7,18,.22)),url('+heroImg+')"><div class="apex-hero-copy"><small>INGENIERÍA / ARQUITECTURA / INFRAESTRUCTURA</small><h1>'+hero+'</h1><p>'+subtitle+'</p><div>'+action("Explorar proyectos","projects")+action("Hablemos de tu proyecto","contact","apex-btn ghost")+'</div></div></section>'+
  '<section class="apex-stats"><div><strong>28</strong><span>Años de experiencia</span></div><div><strong>180+</strong><span>Proyectos realizados</span></div><div><strong>5</strong><span>Disciplinas integradas</span></div><div><strong>98%</strong><span>Satisfacción de clientes</span></div></section>'+
  '<section class="apex-section apex-capabilities"><div class="apex-section-head"><small>01 / EXPERIENCIA INTEGRADA</small><h2>Una visión integral. Cinco disciplinas.</h2></div><div class="apex-cap-grid">'+disciplines+'</div></section>'+
  '<section class="apex-section apex-projects"><div class="apex-section-head"><small>02 / OBRAS QUE NOS DEFINEN</small><h2>Ideas que toman forma.</h2>'+action("Ver todos los proyectos","projects","apex-text-link")+'</div><div class="apex-project-grid">'+projectCards+'</div></section>'+
  '<section class="apex-about"><div class="apex-about-image" style="background-image:url('+e(ctx.aboutImage||media.projects[2]||media.hero)+')"></div><div class="apex-about-copy"><small>03 / LA FIRMA</small><h2>El rigor nos une. El futuro nos mueve.</h2><p>'+e(ctx.aboutText||"")+'</p><p>Precisión técnica. Responsabilidad ambiental. Compromiso con las personas.</p>'+action("Conoce nuestra firma","about")+'</div></section>'+
  '<section class="apex-trust"><small>COMPROMISO CON ESTÁNDARES INTERNACIONALES</small><strong>Calidad / Gestión ambiental / Seguridad y salud / Metodología BIM</strong><p>Una estructura preparada para incorporar certificaciones, clientes y alianzas verificadas de tu empresa.</p></section>'+
  '<section class="apex-section apex-insights"><div class="apex-section-head"><small>04 / PERSPECTIVAS</small><h2>Pensar hoy. Construir mañana.</h2></div><div class="apex-insight-grid">'+blog+'</div></section>'+
  '<section class="apex-contact"><div><small>05 / CONSTRUYAMOS ALGO IMPORTANTE</small><h2>Tu próximo proyecto empieza aquí.</h2><div class="apex-contact-meta">'+contactItems+'</div></div><div class="apex-contact-actions">'+(ctx.whatsappHtml||"")+(ctx.mapHtml||"")+'</div></section>'+
  '<footer class="apex-footer"><strong>'+name+'</strong><p>Ingeniería con criterio. Infraestructura con propósito.</p><nav>'+nav+'</nav></footer>'+
 '</div>';
}
function renderApexInternal(ctx,family,profile,media){
 const section=String(ctx.section||"").toLowerCase(),name=e(ctx.name||"LOCAL"),nav=navHtml(ctx.nav||[],!!ctx.links);
 const title=section==="about"?e(ctx.about||"Quiénes somos"):section==="services"?e(ctx.catalog||"Capacidades"):section==="projects"?e(ctx.projects||"Proyectos"):section==="blog"?e(ctx.blog||"Perspectivas"):e(ctx.contact||"Contacto");
 const kicker={about:"01 / LA FIRMA",services:"02 / CAPACIDADES",projects:"03 / PROYECTOS",blog:"04 / PERSPECTIVAS",contact:"05 / CONTACTO"}[section]||"APEX";
 const projects=(ctx.projectItems?.length?ctx.projectItems:profile.projects.map((title,i)=>({title,image:media.projects[i%media.projects.length]}))).slice(0,8).map((x,i)=>'<article class="apex-internal-project"><img src="'+e(x.image||media.projects[i%media.projects.length])+'" alt=""><small>'+e(["INFRAESTRUCTURA","ARQUITECTURA","INGENIERÍA"][i%3])+'</small><h3>'+e(x.title||"Proyecto")+'</h3>'+(x.description?'<p class="local-project-description">'+e(x.description)+'</p>':'')+'</article>').join("");
 const services=(ctx.serviceItems?.length?ctx.serviceItems:profile.services.map((title,i)=>({title,copy:"Solución técnica integrada."}))).slice(0,8).map((x,i)=>'<article>'+(x.image?'<img class="local-service-card-image" src="'+e(x.image)+'" alt="">':'')+'<b>0'+(i+1)+'</b><h3>'+e(x.title||"Capacidad")+'</h3><p>'+e(x.copy||"")+'</p></article>').join("");
 const blogs=(ctx.blogItems||[]).slice(0,8).map(x=>'<article><small>'+e(x.date||"Actualidad")+'</small><h3>'+e(x.title||"Perspectiva")+'</h3><p>'+e(x.excerpt||"")+'</p></article>').join("");
 let body="";
 if(section==="about") body='<div class="apex-internal-about"><div><p>'+e(ctx.aboutText||"")+'</p><div class="apex-mini-stats"><strong>28<small>Años</small></strong><strong>180+<small>Proyectos</small></strong><strong>5<small>Disciplinas</small></strong></div></div><div class="apex-internal-image" style="background-image:url('+e(ctx.aboutImage||media.hero)+')"></div></div>';
 else if(section==="services") body='<div class="apex-internal-services">'+services+'</div>';
 else if(section==="projects") body='<div class="apex-internal-projects">'+projects+'</div>';
 else if(section==="blog") body='<div class="apex-internal-blog">'+(blogs||'<article><small>Actualidad</small><h3>Perspectivas de '+name+'</h3></article>')+'</div>';
 else body='<div class="apex-internal-contact"><div class="apex-contact-meta">'+(ctx.contactItems||[]).map(x=>'<div><small>'+e(x.label||"")+'</small><strong>'+e(x.value||"")+'</strong></div>').join("")+'</div><div>'+(ctx.whatsappHtml||"")+(ctx.mapHtml||"")+(ctx.socialHtml||"")+'</div></div>';
 return '<div class="eng-architecture arch-APEX apex-internal"><header class="apex-nav"><strong>'+name+'</strong><nav>'+nav+'</nav></header><main><div class="apex-internal-head"><small>'+kicker+'</small><h1>'+title+'</h1></div>'+body+'</main><footer class="apex-footer"><strong>'+name+'</strong><p>Ingeniería con criterio. Infraestructura con propósito.</p></footer></div>';
}

function renderInternalSection(ctx,design,family,profile,media){
 const section=String(ctx.section||"home").toLowerCase();
 if(section==="home")return "";
 if(design==="APEX")return renderApexInternal(ctx,family,profile,media);
 const name=e(ctx.name||"LOCAL"),about=e(ctx.about||"Quiénes somos"),catalog=e(ctx.catalog||"Nuestros servicios"),projectsTitle=e(ctx.projects||"Proyectos y portafolio"),blogTitle=e(ctx.blog||"Blog"),contact=e(ctx.contact||"Contacto");
 const aboutText=e(ctx.aboutText||"");
 const primary=e(ctx.primary||"#1466e8"),secondary=e(ctx.secondary||"#0b1730"),background=e(ctx.background||"#f6f9ff"),surface=e(ctx.surface||"#fff"),text=e(ctx.text||"#0b1730");
 const style='--a:'+primary+';--b:'+secondary+';--bg:'+background+';--surface:'+surface+';--text:'+text;
 const nav=navHtml(ctx.nav||[],!!ctx.links);
 const head='<header class="internal-template-head"><strong>'+name+'</strong><nav>'+nav+'</nav></header>';
 const services=(ctx.serviceItems?.length?ctx.serviceItems:profile.services.map((title,i)=>({title,copy:"Solución profesional adaptada a las necesidades del cliente.",index:i+1}))).slice(0,8);
 const projectItems=(ctx.projectItems?.length?ctx.projectItems:profile.projects.map((title,i)=>({title,image:media.projects[i%media.projects.length]}))).slice(0,8);
 const blogItems=(ctx.blogItems?.length?ctx.blogItems:[{title:"Novedades de "+name,excerpt:"Muy pronto compartiremos novedades y contenido de interés.",date:"Actualidad",image:media.projects[0]}]).slice(0,6);
 const contacts=ctx.contactItems||[];
 const serviceCards=services.map((x,i)=>'<article class="local-service-placeholder">'+(x.image?'<img class="local-service-card-image" src="'+e(x.image)+'" alt="">':'')+'<div class="icon">'+String(i+1).padStart(2,"0")+'</div><h3>'+e(x.title||"Servicio")+'</h3><p>'+e(x.copy||"")+'</p></article>').join("");
 const projectCards=projectItems.map((x,i)=>'<article class="local-project-card"><img src="'+e(x.image||media.projects[i%media.projects.length])+'" alt=""><span>'+e(x.title||("Proyecto "+String(i+1).padStart(2,"0")))+'</span>'+(x.description?'<p class="local-project-description">'+e(x.description)+'</p>':'')+'</article>').join("");
 const blogCards=blogItems.map((x,i)=>'<article class="local-blog-card"><img src="'+e(x.image||media.projects[i%media.projects.length])+'" alt=""><div class="local-blog-card-body"><small>'+e(x.date||"")+'</small><h3>'+e(x.title||"")+'</h3><p>'+e(x.excerpt||"")+'</p></div></article>').join("");
 const contactCards=contacts.map(x=>'<div class="local-contact-info-card"><div class="local-contact-info-icon">'+e(x.icon||"•")+'</div><div><small>'+e(x.label||"")+'</small><strong>'+e(x.value||"")+'</strong></div></div>').join("");
 const map=ctx.mapHtml||"",social=ctx.socialHtml||"",wa=ctx.whatsappHtml||"";
 const sectionTitle=section==="about"?about:section==="services"?catalog:section==="projects"?projectsTitle:section==="blog"?blogTitle:contact;
 const kicker=section==="about"?"Nuestra historia":section==="services"?"Capacidades":section==="projects"?"Portafolio":section==="blog"?"Actualidad":"Hablemos";
 const core={
  about:'<section class="local-page-card internal-about"><div class="local-about-copy"><span class="local-section-kicker">'+kicker+'</span><h2>'+sectionTitle+'</h2><p>'+aboutText+'</p></div><div class="local-about-image" style="background-image:url('+e(ctx.aboutImage||media.hero)+')"></div></section>',
  services:'<section class="local-page-card internal-services"><span class="local-section-kicker">'+kicker+'</span><h2>'+sectionTitle+'</h2><p class="local-project-intro">'+e(ctx.subtitle||"")+'</p><div class="local-service-placeholders">'+serviceCards+'</div></section>',
  projects:'<section class="local-page-card internal-projects"><span class="local-section-kicker">'+kicker+'</span><h2>'+sectionTitle+'</h2><p class="local-project-intro">'+e(ctx.projectsText||"")+'</p><div class="local-project-grid">'+projectCards+'</div></section>',
  blog:'<section class="local-page-card internal-blog"><span class="local-section-kicker">'+kicker+'</span><h2>'+sectionTitle+'</h2><div class="local-blog-grid">'+blogCards+'</div></section>',
  contact:'<section class="local-page-card local-contact-page internal-contact"><div class="local-contact-head"><span class="local-section-kicker">'+kicker+'</span><h2>'+sectionTitle+'</h2><p>'+e(ctx.contactIntro||"Encuentra nuestros canales de atención y ubicación.")+'</p></div><div class="local-contact-layout"><div class="local-contact-left"><div class="local-contact-info-grid">'+contactCards+'</div>'+wa+social+'</div>'+map+'</div></section>'
 }[section]||"";
 const idx=["about","services","projects","blog","contact"].indexOf(section)+1;
 if(design==="SIGNATURE") return '<div class="eng-architecture internal-architecture family-'+e(family)+' arch-SIGNATURE" style="'+style+'">'+head+'<div class="internal-signature-frame"><div class="internal-signature-number">0'+idx+'</div>'+core+'</div></div>';
 if(design==="MINIMAL") return '<div class="eng-architecture internal-architecture family-'+e(family)+' arch-MINIMAL" style="'+style+'"><div class="internal-minimal-top">'+head+'<span>'+e(kicker.toUpperCase())+'</span></div><div class="internal-minimal-body">'+core+'</div></div>';
 if(design==="SPLIT") return '<div class="eng-architecture internal-architecture family-'+e(family)+' arch-SPLIT" style="'+style+'"><div class="internal-split-shell"><aside class="internal-split-index"><strong>'+name+'</strong><span>'+e(kicker)+'</span><nav>'+nav+'</nav></aside><main>'+core+'</main></div></div>';
 if(design==="SIDEBAR") return '<div class="eng-architecture internal-architecture family-'+e(family)+' arch-SIDEBAR" style="'+style+'"><div class="internal-blueprint-shell"><aside><strong>'+name+'</strong><small>PROJECT INDEX</small>'+nav+'</aside><main>'+core+'</main></div></div>';
 if(design==="EDITORIAL") return '<div class="eng-architecture internal-architecture family-'+e(family)+' arch-EDITORIAL" style="'+style+'">'+head+'<div class="internal-editorial-shell"><div class="internal-editorial-folio">0'+idx+'</div>'+core+'</div></div>';
 if(design==="LUXE") return '<div class="eng-architecture internal-architecture family-'+e(family)+' arch-LUXE" style="'+style+'">'+head+'<div class="internal-luxe-glow"></div><div class="internal-luxe-shell">'+core+'</div></div>';
 if(design==="BOLD") return '<div class="eng-architecture internal-architecture family-'+e(family)+' arch-BOLD" style="'+style+'">'+head+'<div class="internal-bold-label">'+e(kicker)+'</div>'+core+'</div>';
 if(design==="MAGAZINE") return '<div class="eng-architecture internal-architecture family-'+e(family)+' arch-MAGAZINE" style="'+style+'"><div class="internal-mag-mast"><strong>'+name+'</strong><span>ISSUE 0'+idx+'</span></div><div class="internal-mag-nav">'+nav+'</div>'+core+'</div>';
 if(design==="IMMERSIVE") return '<div class="eng-architecture internal-architecture family-'+e(family)+' arch-IMMERSIVE" style="'+style+'"><div class="internal-immersive-bg" style="background-image:linear-gradient(90deg,#030712ee,#03071288),url('+e(ctx.banner||media.hero)+')">'+head+'<div class="internal-immersive-title"><small>'+e(kicker)+'</small><h1>'+sectionTitle+'</h1></div></div><div class="internal-immersive-content">'+core+'</div></div>';
 return '<div class="eng-architecture internal-architecture family-'+e(family)+' arch-COMPACT" style="'+style+'"><div class="internal-tech-bar"><strong>'+name+'</strong><span>SYS / '+e(section.toUpperCase())+'</span></div><div class="internal-tech-shell"><aside>'+nav+'</aside><main>'+core+'</main></div></div>';
}
function renderRestaurant(ctx,design,media){
 const name=e(ctx.name||"Restaurante"),title=e(ctx.hero||ctx.name||"Restaurante"),subtitle=e(ctx.subtitle||"Consulta nuestro menú y haz tu pedido.");
 const items=(ctx.nav||[]).filter(x=>!["projects","blog"].includes(String(x.section||"").toLowerCase()));
 const nav=navHtml(items,!!ctx.links),href=s=>e(items.find(x=>x.section===s)?.href||"#");
 const link=(s,label)=>ctx.links?'<a href="'+href(s)+'" data-site-section="'+s+'">'+label+'</a>':'<span>'+label+'</span>';
 const services=(ctx.serviceItems||[]).filter(x=>x.title).slice(0,4);
 const cards=(services.length?services:[{title:"Tienda virtual",copy:"Explora los productos y sus precios."},{title:"Especialidades",copy:"Descubre nuestros sabores."},{title:"Contacto",copy:"Conoce nuestros canales de atención."}]).map((x,i)=>'<article><b>'+String(i+1).padStart(2,"0")+'</b><h3>'+e(x.title)+'</h3><p>'+e(x.copy||"")+'</p></article>').join("");
 const dark=design==="LUXE",side=design==="SIDEBAR";
 return '<div class="restaurant-page restaurant-'+e(design)+'" style="--r:'+e(ctx.primary||"#c65d36")+'"><style>.restaurant-page{font-family:inherit;background:#fff;color:#18232b}.restaurant-page *{box-sizing:border-box}.restaurant-page a{text-decoration:none}.restaurant-page header{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:18px;padding:22px 5%}.restaurant-page header nav{display:flex;flex-wrap:wrap;gap:18px}.restaurant-page header a{color:inherit!important;font-weight:700}.restaurant-page .restaurant-hero{min-height:400px;background-size:cover;background-position:center;display:flex;align-items:center;padding:55px 7%;color:#fff}.restaurant-page .restaurant-hero>div{max-width:760px}.restaurant-page .restaurant-hero h2{font-size:clamp(2.4rem,5vw,4.8rem);line-height:1.08;margin:12px 0;color:#fff!important}.restaurant-page .restaurant-hero p{font-size:1.1rem;color:#fff!important;line-height:1.55}.restaurant-page .restaurant-hero small{font-weight:900;letter-spacing:.12em;color:#ffd7a0}.restaurant-page .restaurant-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:24px}.restaurant-page .restaurant-actions a,.restaurant-page .restaurant-actions span{background:var(--r);padding:13px 20px;color:#fff!important;border-radius:9px;font-weight:800}.restaurant-page main{padding:40px 6% 65px}.restaurant-page main h2{font-size:2rem}.restaurant-page .restaurant-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}.restaurant-page article{border:1px solid #e1e6ec;border-radius:13px;padding:22px;background:#fff;color:#19222a}.restaurant-page article b{color:var(--r)}.restaurant-page article p{color:#475569;line-height:1.5}.restaurant-SIDEBAR{display:grid;grid-template-columns:220px 1fr}.restaurant-SIDEBAR header{grid-row:1/3;background:#102632;color:#fff;align-content:start;align-items:start}.restaurant-SIDEBAR header nav{flex-direction:column}.restaurant-LUXE main{background:#19242a;color:#fff}.restaurant-LUXE article{background:#28363e;color:#fff;border-color:#45545a}.restaurant-LUXE article p{color:#e2e8f0}.restaurant-BOLD h2{text-transform:uppercase}.restaurant-IMMERSIVE .restaurant-hero{min-height:580px}.restaurant-COMPACT .restaurant-hero{min-height:280px}.restaurant-MINIMAL .restaurant-hero{min-height:320px}@media(max-width:700px){.restaurant-SIDEBAR{display:block}.restaurant-SIDEBAR header nav{flex-direction:row}.restaurant-page .restaurant-hero{min-height:320px}}</style>'+
 '<header><strong>'+name+'</strong><nav>'+nav+'</nav></header><section class="restaurant-hero" style="background-image:linear-gradient(90deg,#061018e9,#06101855),url(&quot;'+e(ctx.banner||media.hero)+'&quot;)"><div><small>MENÚ · SABOR · PEDIDOS</small><h2>'+title+'</h2><p>'+subtitle+'</p><div class="restaurant-actions">'+link("shop","Ver menú y pedir")+link("contact","Contacto")+'</div></div></section><main><small>ESPECIALIDADES Y SERVICIOS</small><h2>'+e(ctx.catalog||"Nuestro menú")+'</h2><div class="restaurant-cards">'+cards+'</div></main></div>';
}
function render(ctx){
 const design=String(ctx.design||"SIGNATURE").toUpperCase(),family=String(ctx.family||"GENERAL").toUpperCase();
 const profile=p(family),media=m(family),name=e(ctx.name||"LOCAL"),hero=e(ctx.hero||ctx.name||"LOCAL"),subtitle=e(ctx.subtitle||""),about=e(ctx.about||"Quiénes somos"),catalog=e(ctx.catalog||"Nuestros servicios"),projects=e(ctx.projects||"Proyectos y portafolio"),contact=e(ctx.contact||"Contacto"),aboutText=e(ctx.aboutText||"");
 if(family==="RESTAURANT" && (!ctx.section || ctx.section==="home"))return renderRestaurant(ctx,design,media);
 const internal=renderInternalSection(ctx,design,family,profile,media); if(internal)return internal;
 if(design==="APEX")return renderApexHome(ctx,family,profile,media);
 const image=ctx.banner||media.hero, img='url('+e(image)+')', nav=navHtml(ctx.nav||[],!!ctx.links);
 const sectionHref=section=>{const item=(ctx.nav||[]).find(x=>String(x?.section||"").toLowerCase()===String(section||"").toLowerCase());return item?.href||"#";};
 const action=(label,cls="arch-cta",section="contact")=>ctx.links?'<a class="'+e(cls)+'" href="'+e(sectionHref(section))+'" data-site-section="'+e(section)+'">'+e(label)+'</a>':'<span class="'+e(cls)+'">'+e(label)+'</span>';
 const projectItems=(ctx.projectItems?.length?ctx.projectItems:profile.projects.map((title,i)=>({title,image:media.projects[i%media.projects.length]}))).slice(0,3);
 const projectCards=projectItems.map((x,i)=>'<article class="arch-photo-card" style="background-image:linear-gradient(0deg,rgba(6,12,20,.82),rgba(6,12,20,.08)),url('+e(x.image||media.projects[i%media.projects.length])+')"><small>'+e(["Destacado","Experiencia","Novedad"][i]||"Selección")+'</small><strong>'+e(x.title||profile.projects[i]||"Proyecto")+'</strong></article>').join("");
 const stats=family==='RESTAURANT'?'': '<div><strong>18+</strong><span>Años</span></div><div><strong>240</strong><span>Proyectos</span></div><div><strong>12</strong><span>Disciplinas</span></div><div><strong>96%</strong><span>Clientes</span></div>';
 const head='<strong>'+name+'</strong><nav>'+nav+'</nav>',cta=action("Solicitar propuesta");
 const flags=Object.assign({about:true,catalog:true,projects:true,blog:true,contact:true},ctx.flags||{});
 const homeServices=(ctx.serviceItems?.length?ctx.serviceItems:profile.services.map((title,i)=>({title,copy:"",index:i+1}))).slice(0,8);
 const svc=homeServices.map((s,i)=>'<article>'+(s.image?'<img class="local-service-card-image" src="'+e(s.image)+'" alt="">':'')+'<b>'+String(i+1).padStart(2,"0")+'</b><strong>'+e(s.title||"Servicio")+'</strong>'+(s.copy?'<span>'+e(s.copy)+'</span>':'')+'<i></i></article>').join("");
 const wrap=body=>'<div class="eng-architecture family-'+e(family)+' arch-'+e(design)+'" style="--a:'+e(ctx.primary||"#1466e8")+';--b:'+e(ctx.secondary||"#0b1730")+';--bg:'+e(ctx.background||"#f6f9ff")+';--surface:'+e(ctx.surface||"#fff")+';--text:'+e(ctx.text||"#0b1730")+'">'+body+'</div>';
 if(design==="SIGNATURE")return wrap('<header class="arch-header">'+head+cta+'</header><section class="arch-photo-hero" style="background-image:linear-gradient(90deg,#050b12dd,#050b1244),'+img+'"><div><small>'+e(profile.kicker)+'</small><h2>'+hero+'</h2><p>'+subtitle+'</p><div>'+action("Solicitar una cotización")+action("Conocer nuestros servicios","arch-outline","catalog")+'</div></div></section><div class="arch-trust">'+profile.trust.map((t,i)=>'<div><strong>'+e(t)+'</strong><span>'+e(["Una experiencia pensada para tu cliente","Presentación profesional y clara","Contacto directo y fácil"][i])+'</span></div>').join("")+'</div><footer class="arch-footer"><b>'+name+'</b><div><strong>Explora</strong><span>Inicio</span><span>Servicios</span><span>Proyectos</span></div><div><strong>Contacto</strong><span>WhatsApp</span><span>Ubicación</span></div></footer>');
 if(design==="MINIMAL")return wrap('<header class="arch-min-head">'+head+'</header><main class="arch-min-main"><aside><span>01</span><span>02</span><span>03</span><span>04</span></aside><section><small>'+e(profile.kicker)+'</small><h2>'+hero+'</h2><p>'+subtitle+'</p>'+cta+'<div class="arch-min-rule"></div><div class="arch-min-stats">'+stats+'</div>'+(flags.catalog?'<h3>'+catalog+'</h3><div class="arch-min-services">'+svc+'</div>':'')+(flags.projects?'<h3>'+projects+'</h3><div class="arch-min-projects">'+projectCards+'</div>':'')+'</section></main>');
 if(design==="SPLIT")return wrap('<div class="arch-split"><section class="arch-split-left"><header>'+head+'</header><small>'+e(profile.kicker)+'</small><h2>'+hero+'</h2><p>'+subtitle+'</p>'+cta+'<div class="arch-split-stats">'+stats+'</div></section><section class="arch-split-right" style="background-image:linear-gradient(#0b122044,#0b122044),'+img+'"><div class="arch-project-stack">'+projectCards+'</div></section></div>');
 if(design==="SIDEBAR")return wrap('<div class="arch-side-shell"><aside class="arch-side-nav"><strong>'+name+'</strong>'+nav+cta+'</aside><main><section class="arch-side-hero" style="background-image:linear-gradient(90deg,#062033dd,#06203355),'+img+'"><small>'+e(profile.kicker)+'</small><h2>'+hero+'</h2><p>'+subtitle+'</p></section><div class="arch-side-stats">'+stats+'</div>'+(flags.catalog?'<section class="arch-blue-grid"><h3>'+catalog+'</h3><div>'+svc+'</div></section>':'')+(flags.projects?'<section class="arch-blue-projects"><h3>'+projects+'</h3><div>'+projectCards+'</div></section>':'')+'</main></div>');
 if(design==="EDITORIAL")return wrap('<header class="arch-ed-head">'+head+'</header><main class="arch-editorial"><div class="arch-ed-number">01</div><section class="arch-ed-intro"><small>'+e(profile.kicker)+'</small><h2>'+hero+'</h2><p>'+subtitle+'</p>'+action("Solicitar propuesta","arch-ed-cta")+'</section><section class="arch-ed-feature" style="background-image:'+img+'"><span>PROYECTO DESTACADO</span></section>'+(flags.projects?'<section class="arch-ed-project-list"><h3>'+projects+'</h3>'+projectCards+'</section>':'')+(flags.about?'<section class="arch-ed-about"><h3>'+about+'</h3><p>'+aboutText+'</p></section>':'')+'</main>');
 if(design==="LUXE")return wrap('<div class="arch-luxe-shell"><header>'+head+cta+'</header><section class="arch-luxe-hero"><div class="arch-orbit"></div><small>'+e(profile.kicker)+'</small><h2>'+hero+'</h2><p>'+subtitle+'</p><div class="arch-luxe-actions"><span>Explorar capacidades</span><span>Ver proyectos</span></div></section><div class="arch-luxe-stats">'+stats+'</div>'+(flags.catalog?'<section class="arch-luxe-services"><h3>'+catalog+'</h3><div>'+svc+'</div></section>':'')+(flags.projects?'<section class="arch-luxe-projects">'+projectCards+'</section>':'')+'</div>');
 if(design==="BOLD")return wrap('<header class="arch-bold-head"><strong>'+name+'</strong><div>'+nav+'</div></header><section class="arch-bold-hero"><div><small>'+e(profile.kicker)+'</small><h2>'+hero+'</h2><p>'+subtitle+'</p>'+action("Cotizar proyecto","arch-bold-cta")+'</div><div class="arch-bold-mark">01</div></section><div class="arch-bold-band">'+stats+'</div>'+(flags.catalog?'<section class="arch-bold-services"><h3>'+catalog+'</h3>'+svc+'</section>':'')+(flags.projects?'<section class="arch-bold-projects"><h3>'+projects+'</h3><div>'+projectCards+'</div></section>':''));
 if(design==="MAGAZINE")return wrap('<header class="arch-mag-head">'+head+'<span>ISSUE 01</span></header><main class="arch-mag-grid"><section class="arch-mag-cover" style="background-image:linear-gradient(#0f172a55,#0f172a99),'+img+'"><small>FEATURE</small><h2>'+hero+'</h2>'+action("Ver capacidades →","arch-mag-cta","catalog")+'</section><aside class="arch-mag-index"><b>CONTENIDO</b><span>01 '+about+'</span><span>02 '+catalog+'</span><span>03 '+projects+'</span><span>04 '+contact+'</span></aside><section class="arch-mag-story"><small>ENTREVISTA / ESTUDIO</small><h3>Diseño técnico con visión de negocio</h3><p>'+aboutText+'</p></section>'+(flags.projects?'<section class="arch-mag-projects">'+projectCards+'</section>':'')+'</main>');
 if(design==="IMMERSIVE")return wrap('<section class="arch-immersive-hero" style="background-image:linear-gradient(90deg,#030712aa,#03071222),'+img+'"><header>'+head+cta+'</header><div class="arch-immersive-copy"><small>'+e(profile.kicker)+'</small><h2>'+hero+'</h2><p>'+subtitle+'</p>'+action("Descubrir proyecto","arch-cta","projects")+'</div><div class="arch-immersive-scroll">SCROLL ↓</div></section><div class="arch-immersive-float">'+stats+'</div>'+(flags.projects?'<section class="arch-immersive-projects"><h3>'+projects+'</h3><div>'+projectCards+'</div></section>':''));
 return wrap('<header class="arch-tech-head">'+head+'<span>SYS 01</span></header><div class="arch-tech-grid"><section class="arch-tech-intro"><small>'+e(profile.kicker)+'</small><h2>'+hero+'</h2><p>'+subtitle+'</p>'+action("Solicitar cotización","arch-tech-cta")+'</section><section class="arch-tech-kpis">'+stats+'</section><section class="arch-tech-panel"><h3>Capacidades</h3><div>'+svc+'</div></section><section class="arch-tech-panel"><h3>Certificaciones</h3><div class="arch-tech-tags"><span>BIM</span><span>QA/QC</span><span>HSE</span><span>ESG</span></div></section><section class="arch-tech-panel wide"><h3>'+projects+'</h3><div class="arch-tech-projects">'+projectCards+'</div></section></div>');
}
function indexEditableTargets(root,section){
 const page=String(section||"home").toLowerCase();
 const textNodes=[];
 root.querySelectorAll("h1,h2,h3,h4,h5,h6,p,small,strong,b,span,a,button").forEach(el=>{
   if(el.closest(".local-canvas-card-tools"))return;
   const direct=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.nodeValue||"").join("").trim();
   if(!direct&&!el.children.length)return;
   if(el.children.length&&direct==="")return;
   const key=page+":text:"+textNodes.length;
   el.dataset.editorTextKey=key;textNodes.push(el);
 });
 const imageNodes=[];
 root.querySelectorAll("img").forEach(el=>{const key=page+":image:"+imageNodes.length;el.dataset.editorImageKey=key;imageNodes.push(el);});
 const bgNodes=[];
 root.querySelectorAll("*").forEach(el=>{
   if(el.closest(".local-canvas-card-tools"))return;
   const inline=(el.style?.backgroundImage||"").trim();
   if(!inline||inline==="none")return;
   const key=page+":background:"+bgNodes.length;el.dataset.editorBackgroundKey=key;el.dataset.editorBackgroundBase=inline;bgNodes.push(el);
 });
 return {textNodes,imageNodes,bgNodes};
}
function applyEditorOverrides(root,section,overrides){
 if(!root)return {textNodes:[],imageNodes:[],bgNodes:[]};
 const indexed=indexEditableTargets(root,section);
 const cfg=overrides&&typeof overrides==="object"?overrides:{};
 const text=cfg.text||{},style=cfg.style||{},image=cfg.image||{};
 indexed.textNodes.forEach(el=>{
   const key=el.dataset.editorTextKey;
   if(Object.prototype.hasOwnProperty.call(text,key))el.textContent=String(text[key]??"");
   const s=style[key];
   if(s&&typeof s==="object"){
     if(s.fontSize)el.style.fontSize=String(s.fontSize);
     if(s.color)el.style.color=String(s.color);
     if(s.fontFamily)el.style.fontFamily=String(s.fontFamily);
     if(s.fontWeight)el.style.fontWeight=String(s.fontWeight);
     if(s.textAlign)el.style.textAlign=String(s.textAlign);
     if(s.fontStyle)el.style.fontStyle=String(s.fontStyle);
     if(s.textDecoration)el.style.textDecoration=String(s.textDecoration);
     if(s.lineHeight)el.style.lineHeight=String(s.lineHeight);
   }
 });
 indexed.imageNodes.forEach(el=>{const key=el.dataset.editorImageKey;if(image[key])el.src=String(image[key]);});
 indexed.bgNodes.forEach(el=>{const key=el.dataset.editorBackgroundKey;if(image[key]){const next='url("'+String(image[key]).replace(/"/g,'%22')+'")';const base=el.dataset.editorBackgroundBase||el.style.backgroundImage||"";el.style.backgroundImage=/url\(/i.test(base)?base.replace(/url\([^)]*\)(?![\s\S]*url\()/i,next):next;}});
 return indexed;
}
window.HTPWEBStorefrontArchitectures={render,profiles:PROFILES,media:MEDIA,indexEditableTargets,applyOverrides:applyEditorOverrides,version:"20261007.6-powerpoint-editor"};
})();