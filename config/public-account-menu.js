(function(){
 const $=id=>document.getElementById(id);
 async function init(){
  if(typeof supabaseClient==="undefined")return;
  const link=$("accountLink"),menu=$("publicAccountMenu"),trigger=$("publicAccountTrigger"),drop=$("publicAccountDropdown");
  if(!link||!menu||!trigger||!drop)return;
  try{
   const {data,error}=await supabaseClient.auth.getSession();
   if(error)throw error;
   const user=data?.session?.user;
   if(!user){link.classList.remove("hidden");menu.classList.add("hidden");return}
   link.classList.add("hidden");menu.classList.remove("hidden");
   let name=user.user_metadata?.full_name||user.user_metadata?.name||"Mi cuenta";
   try{
    const p=await supabaseClient.from("profiles").select("full_name").eq("id",user.id).maybeSingle();
    if(!p.error&&p.data?.full_name)name=p.data.full_name;
   }catch{}
   if($("publicAccountName"))$("publicAccountName").textContent=name;
   if($("publicAccountEmail"))$("publicAccountEmail").textContent=user.email||"";

   let roleCode="";
   let accountModes=null;
   try{
    const [role,modes]=await Promise.all([
      supabaseClient.rpc("current_role_code"),
      supabaseClient.rpc("my_business_account_modes")
    ]);
    if(!role.error)roleCode=role.data||"";
    if(!modes.error)accountModes=modes.data||null;
   }catch{}

   if(accountModes&&accountModes?.active_context?.mode!=="MASTER"){
    if(!document.getElementById("publicProfileSwitcherStyles")){
      const style=document.createElement("style");
      style.id="publicProfileSwitcherStyles";
      style.textContent=".public-profile-switcher{padding:4px 0 2px}.public-profile-title{padding:7px 10px 6px;color:#667085;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.07em}.public-account-dropdown .public-profile-option{width:100%;border:0;background:transparent;display:grid;grid-template-columns:38px minmax(0,1fr) 18px;gap:9px;align-items:center;padding:8px 9px;border-radius:10px;text-align:left;cursor:pointer}.public-account-dropdown .public-profile-option:hover{background:#f3f6fa}.public-account-dropdown .public-profile-option.active{background:#eef4ff;color:#0b57d0}.public-profile-avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:#eef2f7;font-weight:900}.public-profile-option strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.public-profile-option small{display:block;color:#667085;font-size:11px;margin-top:2px}.public-profile-check{justify-self:end;color:#0b57d0}";
      document.head.appendChild(style);
    }
    const active=accountModes.active_context||{mode:"CLIENT",resource_id:null};
    const esc=v=>String(v||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
    const items=[];
    items.push('<button type="button" class="public-profile-option '+(active.mode==="CLIENT"?"active":"")+'" data-public-profile-mode="CLIENT"><span class="public-profile-avatar">👤</span><span><strong>Perfil cliente</strong><small>Comprar y usar HTPWEB</small></span>'+(active.mode==="CLIENT"?'<b class="public-profile-check">✓</b>':'')+'</button>');
    (accountModes.deliveries||[]).forEach(d=>{
      const on=active.mode==="DELIVERY"&&active.resource_id===d.id;
      items.push('<button type="button" class="public-profile-option '+(on?"active":"")+'" data-public-profile-mode="DELIVERY" data-public-profile-resource="'+esc(d.id)+'">'+(d.logo_url?'<img class="public-profile-avatar" src="'+esc(d.logo_url)+'" alt="">':'<span class="public-profile-avatar">D</span>')+'<span><strong>'+esc(d.name)+'</strong><small>Perfil DELIVERY</small></span>'+(on?'<b class="public-profile-check">✓</b>':'')+'</button>');
    });
    (accountModes.businesses||[]).forEach(business=>{
      const on=active.mode==="BUSINESS"&&active.resource_id===business.id;
      items.push('<button type="button" class="public-profile-option '+(on?"active":"")+'" data-public-profile-mode="BUSINESS" data-public-profile-resource="'+esc(business.id)+'">'+(business.logo_url?'<img class="public-profile-avatar" src="'+esc(business.logo_url)+'" alt="">':'<span class="public-profile-avatar">N</span>')+'<span><strong>'+esc(business.name)+'</strong><small>Perfil negocio</small></span>'+(on?'<b class="public-profile-check">✓</b>':'')+'</button>');
    });
    const wrap=document.createElement("div");
    wrap.className="public-profile-switcher";
    wrap.innerHTML='<div class="public-profile-title">Cambiar perfil</div>'+items.join("");
    const summary=drop.querySelector(".public-account-summary");
    summary?.insertAdjacentElement("afterend",wrap);
    const sep=document.createElement("div");sep.className="public-account-separator";wrap.insertAdjacentElement("afterend",sep);
    wrap.querySelectorAll("[data-public-profile-mode]").forEach(button=>{
      button.onclick=async()=>{
        const mode=button.dataset.publicProfileMode;
        const resource=button.dataset.publicProfileResource||null;
        button.disabled=true;
        const result=await supabaseClient.rpc("switch_my_business_account_mode",{p_mode:mode,p_resource_id:resource});
        if(result.error){button.disabled=false;alert(result.error.message||"No se pudo cambiar de perfil.");return}
        location.href=mode==="CLIENT"?"./index.html":"./admin/index.html";
      };
    });
   }

   if(roleCode==="MASTER"&&!drop.querySelector('a[data-master-admin-link]')){
    const configLink=[...drop.querySelectorAll("a")].find(a=>a.getAttribute("href")?.includes("configuracion.html"));
    const masterLink=document.createElement("a");
    masterLink.href="./admin/index.html";
    masterLink.textContent="Administración";
    masterLink.dataset.masterAdminLink="1";
    if(configLink)configLink.insertAdjacentElement("afterend",masterLink);
    else drop.prepend(masterLink);
   }

   if(!drop.querySelector('a[href*="configuracion.html"]')){
    const accountLink=[...drop.querySelectorAll("a")].find(a=>a.getAttribute("href")?.includes("mi-cuenta.html"));
    if(accountLink){
      const configLink=document.createElement("a");
      configLink.href="./app/configuracion.html";
      configLink.textContent="Configuración";
      accountLink.insertAdjacentElement("afterend",configLink);
      if(roleCode==="MASTER"&&!drop.querySelector('a[data-master-admin-link]')){
        const masterLink=document.createElement("a");
        masterLink.href="./admin/index.html";
        masterLink.textContent="Administración";
        masterLink.dataset.masterAdminLink="1";
        configLink.insertAdjacentElement("afterend",masterLink);
      }
    }
   }
   trigger.onclick=e=>{e.preventDefault();e.stopPropagation();drop.classList.toggle("hidden")};
   document.addEventListener("click",e=>{if(!menu.contains(e.target))drop.classList.add("hidden")});
   const logout=$("publicAccountLogout");
   if(logout)logout.onclick=async()=>{await supabaseClient.auth.signOut();location.href="./index.html"};
  }catch(e){console.warn("HTPWEB account menu:",e?.message||e)}
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();