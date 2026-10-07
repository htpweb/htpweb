// LEGACY COMPATIBILITY SHIM.
// El contexto DELIVERY vivía históricamente en config/negocio.js.
// Desde la migración de dominio 2026-10-07, "negocio" queda reservado para BUSINESS.
// Código nuevo debe cargar config/delivery-context.js.

(() => {
  "use strict";

  const current = document.currentScript?.src || "";
  const target = current
    ? new URL("delivery-context.js", current).href
    : "./delivery-context.js";

  if (document.readyState === "loading") {
    document.write('<script src="' + target + '"><\/script>');
    return;
  }

  const script = document.createElement("script");
  script.src = target;
  script.async = false;
  document.head.appendChild(script);
})();
