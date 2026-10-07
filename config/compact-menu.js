
(function(){
"use strict";
const $=(root,s)=>root.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const money=v=>"$"+Number(v||0).toFixed(2);
function availabilityCopy(a){
 if(!a)return{open:true,text:"Disponibilidad según el negocio"};
 if(a.is_open===true){
  if(a.reason==="NO_SCHEDULE_CONFIGURED")return{open:true,text:"Disponible para pedidos"};
  return{open:true,text:a.closing_time?"Abierto · cierra a las "+a.closing_time:"Abierto ahora"};
 }
 if(a.reason==="BEFORE_OPENING"&&a.opening_time)return{open:false,text:"Cerrado · abre a las "+a.opening_time};
 if(a.reason==="CLOSED_TODAY")return{open:false,text:"Cerrado hoy"};
 if(a.reason==="AFTER_CLOSING")return{open:false,text:"Cerrado por hoy"};
 return{open:false,text:"No disponible para pedidos en este momento"};
}
function categoryGroups(products,categories){
 const map=new Map((categories||[]).map(c=>[String(c.id),c]));
 const ids=[];
 (categories||[]).forEach(c=>ids.push(String(c.id)));
 products.forEach(p=>{const id=p.category_id?String(p.category_id):"__OTHER__";if(!ids.includes(id))ids.push(id);});
 return ids.map(id=>({id,name:id==="__OTHER__"?"Otros":(map.get(id)?.name||"Otros"),products:products.filter(p=>(p.category_id?String(p.category_id):"__OTHER__")===id)})).filter(g=>g.products.length);
}
function variantFor(state,p){
 const list=state.variants.filter(v=>String(v.product_id)===String(p.id));
 const chosen=state.selectedVariants.get(String(p.id));
 return list.find(v=>String(v.id)===String(chosen))||list[0]||null;
}
function stockFor(state,p,v){
 return state.inventory.find(x=>String(x.product_id)===String(p.id)&&String(x.variant_id||"")===String(v?.id||""))||null;
}
async function loadReferences(state){
 if(!window.supabaseClient||!state.local?.id)return;
 try{
  const [m,g]=await Promise.all([
   window.supabaseClient.rpc("public_local_menu_pages",{p_local_id:state.local.id}),
   window.supabaseClient.rpc("public_list_local_gallery",{p_local_id:state.local.id})
  ]);
  state.menuPages=Array.isArray(m.data)?m.data:[];
  state.gallery=Array.isArray(g.data)?g.data:[];
  renderReferences(state);
 }catch(e){console.warn("Menú compacto: referencias",e);}
}
function renderReferences(state){
 const ref=$ (state.root,"[data-cm-references]");if(!ref)return;
 const pages=state.menuPages||[],gallery=state.gallery||[];
 ref.innerHTML=
  '<details><summary>Menú original'+(pages.length?" · "+pages.length:"")+'</summary><div class="cm-reference-body">'+
  '<p class="cm-reference-note">Hojas originales del menú para consulta. Estas imágenes no se usan como fotografías de platos.</p>'+
  (pages.length?'<div class="cm-menu-pages">'+pages.map(x=>'<article class="cm-menu-page"><strong>'+esc(x.title||"Hoja de menú original")+'</strong>'+(x.image_url?'<img src="'+esc(x.image_url)+'" alt="'+esc(x.title||"Hoja de menú original")+'" loading="lazy">':"")+'</article>').join("")+'</div>':'<div class="cm-empty">No hay hojas de menú publicadas.</div>')+
  '</div></details>'+
  '<details><summary>Galería'+(gallery.length?" · "+gallery.length:"")+'</summary><div class="cm-reference-body">'+
  (gallery.length?'<div class="cm-gallery">'+gallery.filter(x=>x.image_url||x.url).map(x=>'<img src="'+esc(x.image_url||x.url)+'" alt="'+esc(x.title||x.caption||"Galería del restaurante")+'" loading="lazy">').join("")+'</div>':'<div class="cm-empty">No hay imágenes en la galería.</div>')+
  '</div></details>';
}
function summary(state){
 try{return state.cart?.getSummary?.()||{count:0,subtotal:0};}catch{return{count:0,subtotal:0}}
}
function refresh(state){
 state.products.forEach(p=>{
  const v=variantFor(state,p),node=state.root.querySelector('[data-cm-qty="'+CSS.escape(String(p.id))+'"]');
  if(node)node.textContent=String(state.cart?.getQuantity?.(p,v)||0);
  const price=state.root.querySelector('[data-cm-price="'+CSS.escape(String(p.id))+'"]');
  if(price)price.textContent=money(v?.price??p.price);
 });
 const s=summary(state);
 const meta=$(state.root,"[data-cm-summary]");if(meta)meta.textContent=Number(s.count||0)+" producto"+(Number(s.count||0)===1?"":"s")+" · "+money(s.subtotal||0);
}
function bind(state){
 state.root.querySelectorAll("[data-cm-category]").forEach(b=>b.onclick=()=>{state.category=b.dataset.cmCategory||"";render(state);});
 const search=$(state.root,"[data-cm-search]");if(search){
  search.value=state.query;search.oninput=e=>{state.query=e.target.value;render(state,{focusSearch:true});};
 }
 state.root.querySelectorAll("[data-cm-variant]").forEach(sel=>sel.onchange=()=>{
  state.selectedVariants.set(sel.dataset.cmVariant,sel.value);refresh(state);
 });
 state.root.querySelectorAll("[data-cm-change]").forEach(b=>b.onclick=async()=>{
  if(state.preview)return;
  const p=state.products.find(x=>String(x.id)===b.dataset.product);if(!p)return;
  const v=variantFor(state,p),delta=Number(b.dataset.cmChange||0);
  const availability=availabilityCopy(state.availability);
  if(delta>0&&!availability.open){state.onError?.(availability.text);return;}
  const st=stockFor(state,p,v),current=Number(state.cart?.getQuantity?.(p,v)||0);
  if(delta>0&&st?.track_stock&&current>=Number(st.available_qty||0)){state.onError?.(p.name+" alcanzó el stock disponible.");return;}
  try{await state.cart?.changeQuantity?.(p,v,delta);refresh(state);}catch(e){state.onError?.(e?.message||"No se pudo actualizar el pedido.");}
 });
 const view=$(state.root,"[data-cm-view-cart]");if(view)view.onclick=()=>{if(!state.preview)state.cart?.onViewCart?.();};
}
function render(state,opts={}){
 const a=availabilityCopy(state.availability);
 const q=state.query.trim().toLowerCase();
 const groups=categoryGroups(state.products,state.categories);
 const visibleGroups=groups.map(g=>({...g,products:g.products.filter(p=>(!state.category||state.category===g.id)&&(!q||[p.name,p.description,p.short_description].some(v=>String(v||"").toLowerCase().includes(q))))})).filter(g=>g.products.length);
 const featured=state.products.filter(p=>p.featured&&p.image_url&&(!state.category||String(p.category_id||"__OTHER__")===state.category)&&(!q||[p.name,p.description,p.short_description].some(v=>String(v||"").toLowerCase().includes(q))));
 const initial=String(state.local?.name||"Restaurante").trim().charAt(0).toUpperCase()||"R";
 const canOrder=!state.preview&&a.open&&state.cart?.canOrder!==false;
 const categoryButtons=['<button class="cm-chip '+(!state.category?"active":"")+'" data-cm-category="">Todo</button>'].concat(groups.map(g=>'<button class="cm-chip '+(state.category===g.id?"active":"")+'" data-cm-category="'+esc(g.id)+'">'+esc(g.name)+'</button>')).join("");
 const productMarkup=visibleGroups.map(g=>'<section class="cm-group" id="cm-cat-'+esc(g.id)+'"><h2>'+esc(g.name)+'</h2><div class="cm-products">'+g.products.map(p=>{
   const vs=state.variants.filter(v=>String(v.product_id)===String(p.id)),v=variantFor(state,p),st=stockFor(state,p,v),sold=st?.track_stock&&Number(st.available_qty||0)<=0;
   const desc=p.short_description||p.description||"";
   const image=String(p.image_url||p.product_image_url||"").trim();
   return '<article class="cm-product '+(image?"has-image":"no-image")+'" id="product-'+esc(p.id)+'">'+
    (image?'<div class="cm-product-media"><img src="'+esc(image)+'" alt="'+esc(p.name)+'" loading="lazy" decoding="async"></div>':"")+
    '<div class="cm-product-copy"><div class="cm-product-name">'+esc(p.name)+'</div>'+
    (desc?'<div class="cm-product-description">'+esc(desc)+'</div>':"")+
    '<div class="cm-product-price" data-cm-price="'+esc(p.id)+'">'+money(v?.price??p.price)+'</div>'+
    (vs.length?'<select class="cm-variant" data-cm-variant="'+esc(p.id)+'" aria-label="Variante de '+esc(p.name)+'">'+vs.map(x=>{
      const vst=stockFor(state,p,x),off=vst?.track_stock&&Number(vst.available_qty||0)<=0;
      return '<option value="'+esc(x.id)+'" '+(v&&String(v.id)===String(x.id)?"selected":"")+' '+(off?"disabled":"")+'>'+esc(x.name)+' · '+money(x.price)+(off?" · Agotado":"")+'</option>';
    }).join("")+'</select>':"")+
    (sold?'<div class="cm-stock-note">Agotado</div>':"")+
    '</div><div class="cm-qty" aria-label="Cantidad de '+esc(p.name)+'"><button type="button" data-cm-change="-1" data-product="'+esc(p.id)+'" '+(!canOrder?"disabled":"")+' aria-label="Quitar">−</button><span data-cm-qty="'+esc(p.id)+'">'+Number(state.cart?.getQuantity?.(p,v)||0)+'</span><button type="button" data-cm-change="1" data-product="'+esc(p.id)+'" '+(!canOrder||sold?"disabled":"")+' aria-label="Agregar">+</button></div></article>';
 }).join("")+'</div></section>').join("");
 state.root.innerHTML='<div class="htp-compact-menu">'+
  '<header class="cm-head">'+(state.local?.logo_url?'<img class="cm-logo" src="'+esc(state.local.logo_url)+'" alt="'+esc(state.local.name||"Restaurante")+'">':'<span class="cm-logo-fallback">'+esc(initial)+'</span>')+
   '<div class="cm-head-copy"><h1>'+esc(state.local?.name||"Restaurante")+'</h1><div class="cm-availability '+(a.open?"":"is-closed")+'"><span class="cm-availability-dot"></span><span>'+esc(a.text)+'</span></div></div></header>'+
  (state.preview?'<div class="cm-preview-note">Vista previa de MASTER. Los controles de compra están desactivados y no modifican el carrito.</div>':"")+
  '<div class="cm-toolbar"><div class="cm-search-wrap"><span class="cm-search-icon">⌕</span><input class="cm-search" data-cm-search type="search" placeholder="Buscar en el menú" aria-label="Buscar en el menú"></div><div class="cm-categories">'+categoryButtons+'</div></div>'+
  (featured.length?'<section class="cm-featured"><h2 class="cm-section-title">Destacados</h2><div class="cm-featured-scroll">'+featured.map(p=>'<article class="cm-featured-card"><img src="'+esc(p.image_url)+'" alt="'+esc(p.name)+'" loading="lazy"><div class="cm-featured-copy"><strong>'+esc(p.name)+'</strong><span>'+money(variantFor(state,p)?.price??p.price)+'</span></div></article>').join("")+'</div></section>':"")+
  (productMarkup||'<div class="cm-empty">No hay productos que coincidan con la búsqueda.</div>')+
  '<section class="cm-reference" data-cm-references></section>'+
  '<div class="cm-bottom"><span class="cm-cart-icon">🛒</span><div class="cm-bottom-copy"><strong>Ver pedido</strong><span data-cm-summary></span></div><button type="button" data-cm-view-cart '+(state.preview?"disabled":"")+'>Continuar ›</button></div>'+
 '</div>';
 bind(state);renderReferences(state);refresh(state);
 if(opts.focusSearch){const el=$(state.root,"[data-cm-search]");if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}}
}
function mount(opts){
 const root=typeof opts.root==="string"?document.querySelector(opts.root):opts.root;
 if(!root)throw new Error("No se encontró el contenedor del Menú compacto.");
 const state={root,local:opts.local||{},products:Array.isArray(opts.products)?opts.products:[],variants:Array.isArray(opts.variants)?opts.variants:[],categories:Array.isArray(opts.categories)?opts.categories:[],inventory:Array.isArray(opts.inventory)?opts.inventory:[],availability:opts.availability||null,cart:opts.cart||{},preview:!!opts.preview,onError:opts.onError||null,query:"",category:"",selectedVariants:new Map(),menuPages:[],gallery:[]};
 state.products.forEach(p=>{const v=state.variants.find(x=>String(x.product_id)===String(p.id));if(v)state.selectedVariants.set(String(p.id),String(v.id));});
 render(state);loadReferences(state);
 const handler=()=>refresh(state);window.addEventListener("htpweb:cart",handler);
 return{refresh:()=>refresh(state),destroy:()=>window.removeEventListener("htpweb:cart",handler),state};
}
window.HTPWEBCompactMenu={mount};
})();
