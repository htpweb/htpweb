(function(root){
  "use strict";
  const escape=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money=v=>"$"+Number(v||0).toFixed(2);
  const normalize=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  function imageKey(value){try{const url=new URL(value);return /^https?:$/.test(url.protocol)?url.origin+url.pathname:""}catch{return ""}}
  function trustedProductPhotos(products,menuPages){
    const menus=new Set((menuPages||[]).map(p=>imageKey(p.image_url)).filter(Boolean));
    const uses=new Map();
    products.forEach(p=>{const key=imageKey(p.image_url);if(key)uses.set(key,(uses.get(key)||0)+1)});
    return products.filter(p=>{const key=imageKey(p.image_url);return key&&!menus.has(key)&&uses.get(key)===1});
  }
  function groupProducts(products,categories){
    const groups=[];
    (categories||[]).forEach(c=>{const items=products.filter(p=>p.category_id===c.id);if(items.length)groups.push({id:c.id,name:c.name,items})});
    const known=new Set((categories||[]).map(c=>c.id));
    const others=products.filter(p=>!known.has(p.category_id));
    if(others.length)groups.push({id:"__OTHER__",name:"Otros",items:others});
    return groups;
  }
  function menuCategories(categories,pages){
    const result=[...(categories||[])],known=new Set(result.map(c=>c.id));
    (pages||[]).flatMap(p=>p.categories||[]).forEach(c=>{if(c.id&&!known.has(c.id)){known.add(c.id);result.push(c)}});
    return result;
  }
  function subtotal(items,products,variants){
    return (items||[]).reduce((total,item)=>{
      const product=products.find(p=>p.id===item.product_id&&(!item.local_id||p.local_id===item.local_id));
      const variant=item.variant_id?variants.find(v=>v.id===item.variant_id&&v.product_id===product?.id):null;
      const price=item.promotion_id?Number(item.snapshot?.price||0):Number(variant?.price??product?.price??item.snapshot?.price??0);
      return total+(Number.isFinite(price)?price:0)*Number(item.quantity||0);
    },0);
  }
  function mount(container,options){
    if(!container)return null;
    let data=options,category="",query="";
    const selections=new Map(),expanded=new Set();
    container.classList.add("restaurant-digital-menu");
    const header=document.querySelector("body > header");
    const syncHeader=()=>container.style.setProperty("--menu-header-offset",(header?Math.ceil(header.getBoundingClientRect().height):0)+"px");
    syncHeader();
    if(header && typeof ResizeObserver!=="undefined")new ResizeObserver(syncHeader).observe(header);
    container.innerHTML='<div class="rdm-heading"><div><span class="rdm-kicker">ELIGE Y HAZ TU PEDIDO</span><h2>'+escape(data.title||"Menú digital")+'</h2></div><span class="rdm-count"></span></div><p class="rdm-notice" role="status"></p><div class="rdm-toolbar"><label><span class="rdm-sr-only">Buscar en el menú</span><input class="rdm-search" type="search" placeholder="Buscar en el menú" autocomplete="off"></label><div class="rdm-categories" aria-label="Categorías del menú"></div></div><div class="rdm-highlights"></div><div class="rdm-results" aria-live="polite"></div><div class="rdm-reference"></div><div class="rdm-cart-shell"><button class="rdm-cart" type="button"><span>Ver pedido</span><strong></strong></button></div>';
    const find=selector=>container.querySelector(selector);
    function available(p,v){return data.canAdd?data.canAdd(p,v)!==false:true}
    function variantFor(p){
      const list=(data.variants||[]).filter(v=>v.product_id===p.id);
      if(!list.length)return null;
      return list.find(v=>v.id===selections.get(p.id))||list.find(v=>available(p,v))||list[0];
    }
    function row(p,highlight=false){
      const list=(data.variants||[]).filter(v=>v.product_id===p.id),v=variantFor(p),qty=Number(data.quantity?.(p,v)||0);
      const rawPrice=v?.price??p.price,price=Number(rawPrice),valid=rawPrice!==null&&rawPrice!==undefined&&rawPrice!==""&&Number.isFinite(price)&&price>=0;
      const disabled=!!data.disabledReason||!available(p,v)||!valid;
      const compare=!v&&Number(p.compare_price)>price?'<del>'+money(p.compare_price)+'</del>':"";
      const control=qty>0?'<div class="rdm-stepper"><button type="button" data-menu-minus="'+escape(p.id)+'" aria-label="Quitar uno de '+escape(p.name)+'">−</button><span>'+qty+'</span><button type="button" data-menu-add="'+escape(p.id)+'" '+(disabled?"disabled":"")+' aria-label="Añadir uno de '+escape(p.name)+'">+</button></div>':'<button type="button" class="rdm-add" data-menu-add="'+escape(p.id)+'" '+(disabled?"disabled":"")+' aria-label="Añadir '+escape(p.name)+'">+</button>';
      const variants=list.length?'<button type="button" class="rdm-options" data-menu-options="'+escape(p.id)+'" aria-expanded="'+expanded.has(p.id)+'">'+escape(v?.name||"Elegir opción")+' · Cambiar ⌄</button><div class="rdm-variants" '+(expanded.has(p.id)?"":"hidden")+'>'+list.map(item=>'<button type="button" data-menu-product="'+escape(p.id)+'" data-menu-variant="'+escape(item.id)+'" aria-pressed="'+(v?.id===item.id)+'" '+(!available(p,item)&&!Number(data.quantity?.(p,item)||0)?"disabled":"")+'>'+escape(item.name)+' <strong>'+money(item.price)+'</strong>'+(!available(p,item)?' <small>Sin más unidades</small>':'')+'</button>').join("")+'</div>':"";
      return '<article class="rdm-product '+(highlight?"rdm-featured":"")+'" '+(!highlight?'id="product-'+escape(p.id)+'"':"")+'>'+(highlight?'<img src="'+escape(p.image_url)+'" alt="'+escape(p.name)+'" loading="lazy">':"")+'<div class="rdm-product-main"><div class="rdm-product-copy"><h3>'+escape(p.name)+'</h3>'+(p.short_description||p.description?'<p>'+escape(p.short_description||p.description)+'</p>':"")+'</div><div class="rdm-buy"><div class="rdm-price">'+(valid?money(price):"Consultar")+compare+'</div>'+control+'</div></div>'+variants+(disabled&&!data.disabledReason?'<small class="rdm-unavailable">No disponible</small>':"")+'</article>';
    }
    function render(){
      const all=data.products||[],categories=menuCategories(data.categories,data.menuPages),groups=groupProducts(all,categories);
      const matching=all.filter(p=>(!category||groups.find(g=>g.id===category)?.items.some(x=>x.id===p.id))&&(!query||normalize([p.name,p.description,p.short_description].join(" ")).includes(normalize(query))));
      find(".rdm-count").textContent=matching.length+" producto"+(matching.length===1?"":"s");
      const notice=find(".rdm-notice");notice.textContent=data.disabledReason||data.notice||"";notice.hidden=!notice.textContent;
      find(".rdm-categories").innerHTML='<button type="button" data-menu-category="" aria-pressed="'+!category+'">Todos</button>'+groups.map(g=>'<button type="button" data-menu-category="'+escape(g.id)+'" aria-pressed="'+(g.id===category)+'">'+escape(g.name)+'</button>').join("");
      const photos=trustedProductPhotos(all,data.menuPages||[]);
      const featured=photos.filter(p=>p.featured===true);
      const highlights=(featured.length?featured:photos).slice(0,4);
      const highlightBox=find(".rdm-highlights");
      highlightBox.innerHTML=!query&&!category&&highlights.length?'<h3>'+(featured.length?'Destacados':'Con foto')+'</h3><div class="rdm-featured-grid">'+highlights.map(p=>row(p,true)).join("")+'</div>':"";
      find(".rdm-results").innerHTML=matching.length?groupProducts(matching,categories).map(g=>'<section class="rdm-group"><h3>'+escape(g.name)+'</h3><div>'+g.items.map(p=>row(p)).join("")+'</div></section>').join(""):'<p class="rdm-empty">'+(all.length?"No hay productos que coincidan con tu búsqueda.":"Este local todavía no tiene productos publicados. Consulta el menú original o contacta al negocio.")+'</p>';
      find(".rdm-reference").innerHTML=referenceMarkup();
      refreshCart();
    }
    function referenceMarkup(){
      const pages=(data.menuPages||[]).filter(p=>imageKey(p.image_url));
      const seen=new Set(pages.map(p=>imageKey(p.image_url)));
      const gallery=(data.gallery||[]).filter(p=>{const key=imageKey(p.image_url);if(!key||seen.has(key))return false;seen.add(key);return true});
      function images(rows){return '<div class="rdm-originals">'+rows.map((p,i)=>'<a href="'+escape(p.image_url)+'" target="_blank" rel="noopener noreferrer"><img src="'+escape(p.image_url)+'" alt="'+escape(p.title||"Imagen "+(i+1))+'" loading="lazy"><span>'+escape(p.title||"Ver imagen "+(i+1))+'</span></a>').join("")+'</div>'}
      return (pages.length?'<details class="rdm-reference-group"><summary>Ver menú original · '+pages.length+' hojas</summary>'+images(pages)+'</details>':"")+(gallery.length?'<details class="rdm-reference-group"><summary>Galería del local · '+gallery.length+' imágenes</summary>'+images(gallery)+'</details>':"");
    }
    function refreshCart(){
      const info=data.cartSummary?.()||{quantity:0,total:0},button=find(".rdm-cart");
      button.disabled=!(Number(info.quantity)>0)||!data.onCart;
      button.querySelector("strong").textContent=Number(info.quantity)+" producto"+(Number(info.quantity)===1?"":"s")+" · "+money(info.total);
      find(".rdm-cart-shell").hidden=!(Number(info.quantity)>0)||!data.onCart;
    }
    find(".rdm-search").oninput=e=>{query=e.target.value;render()};
    container.onclick=e=>{
      const button=e.target.closest("button");if(!button||button.disabled)return;
      if(button.hasAttribute("data-menu-category")){category=button.dataset.menuCategory;render();return}
      if(button.dataset.menuOptions){const id=button.dataset.menuOptions;expanded.has(id)?expanded.delete(id):expanded.add(id);render();return}
      if(button.dataset.menuVariant){selections.set(button.dataset.menuProduct,button.dataset.menuVariant);render();return}
      const id=button.dataset.menuAdd||button.dataset.menuMinus,p=(data.products||[]).find(p=>p.id===id);
      if(p){const v=variantFor(p),delta=button.dataset.menuMinus?-1:1;data.onChange?.(p,v,delta);render();return}
      if(button.classList.contains("rdm-cart"))data.onCart?.();
    };
    render();
    return {update(next){data={...data,...next};render()},refresh:render};
  }
  const api={mount,groupProducts,menuCategories,trustedProductPhotos,subtotal};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.HTPWEBRestaurantMenu=api;
})(typeof window!=="undefined"?window:globalThis);
