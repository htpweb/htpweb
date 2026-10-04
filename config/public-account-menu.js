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
   if(!drop.querySelector('a[href*="configuracion.html"]')){
    const accountLink=[...drop.querySelectorAll("a")].find(a=>a.getAttribute("href")?.includes("mi-cuenta.html"));
    if(accountLink){
      const configLink=document.createElement("a");
      configLink.href="./app/configuracion.html";
      configLink.textContent="Configuración";
      accountLink.insertAdjacentElement("afterend",configLink);
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