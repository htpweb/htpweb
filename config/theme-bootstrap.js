(function(){
  const themes={
    HTPWEB:{primary:"#e53935",dark:"#111111",accent:"#e53935",onPrimary:"#ffffff",onDark:"#ffffff",soft:"#fff3f2"},
    OCEAN:{primary:"#1565c0",dark:"#0d2340",accent:"#42a5f5",onPrimary:"#ffffff",onDark:"#ffffff",soft:"#eef6ff"},
    SKY:{primary:"#0288d1",dark:"#0b3550",accent:"#4fc3f7",onPrimary:"#ffffff",onDark:"#ffffff",soft:"#eefaff"},
    FOREST:{primary:"#2e7d32",dark:"#153a20",accent:"#66bb6a",onPrimary:"#ffffff",onDark:"#ffffff",soft:"#f1f8f2"},
    SUNSET:{primary:"#ef6c00",dark:"#2f1b0d",accent:"#ff9800",onPrimary:"#ffffff",onDark:"#ffffff",soft:"#fff7ed"},
    PURPLE:{primary:"#7b1fa2",dark:"#2d1238",accent:"#ab47bc",onPrimary:"#ffffff",onDark:"#ffffff",soft:"#faf1fd"},
    TURQUOISE:{primary:"#00897b",dark:"#083c37",accent:"#26a69a",onPrimary:"#ffffff",onDark:"#ffffff",soft:"#eefaf8"},
    GRAPHITE:{primary:"#455a64",dark:"#172127",accent:"#78909c",onPrimary:"#ffffff",onDark:"#ffffff",soft:"#f3f6f7"}
  };

  function apply(themeKey){
    const key=themes[themeKey]?themeKey:"HTPWEB";
    const theme=themes[key];
    const root=document.documentElement;
    root.style.setProperty("--brand-primary",theme.primary);
    root.style.setProperty("--brand-dark",theme.dark);
    root.style.setProperty("--brand-accent",theme.accent);
    root.style.setProperty("--brand-on-primary",theme.onPrimary);
    root.style.setProperty("--brand-on-dark",theme.onDark);
    root.style.setProperty("--brand-soft",theme.soft);
    root.dataset.deliveryTheme=key;
    root.classList.remove("delivery-theme-pending");
  }

  try{
    const params=new URLSearchParams(location.search);
    const slug=params.get("delivery")||params.get("cliente")||"";
    const key=slug?"HTPWEB_THEME:"+slug:"";
    const cached=key?sessionStorage.getItem(key):null;
    if(cached&&themes[cached]){
      apply(cached);
    }else if(slug){
      document.documentElement.classList.add("delivery-theme-pending");
      setTimeout(()=>document.documentElement.classList.remove("delivery-theme-pending"),1200);
    }
  }catch{
    document.documentElement.classList.remove("delivery-theme-pending");
  }

  window.htpBootstrapApplyTheme=apply;
})();