(() => {
  "use strict";

  const exact = new Map([
    ["LOCAL", "NEGOCIO"],
    ["LOCALES", "NEGOCIOS"],
    ["Local", "Negocio"],
    ["Locales", "Negocios"]
  ]);

  const phrases = [
    [/\bExplorar locales\b/gi, "Explorar negocios"],
    [/\bMis locales\b/gi, "Mis negocios"],
    [/\bCrear local\b/gi, "Crear negocio"],
    [/\bReclamar local\b/gi, "Reclamar negocio"],
    [/\bReclamar LOCAL\b/g, "Reclamar NEGOCIO"],
    [/\bLOCAL existente\b/g, "NEGOCIO existente"],
    [/\bLOCAL que administro\b/g, "NEGOCIOS que administro"],
    [/\bLOCAL que administras\b/g, "NEGOCIOS que administras"],
    [/\bCategorías de LOCAL\b/g, "Categorías de negocios"],
    [/\bCategorías de locales\b/gi, "Categorías de negocios"],
    [/\bLocales asociados\b/gi, "Negocios asociados"],
    [/\bBuscar locales\b/gi, "Buscar negocios"],
    [/\bTodos los locales\b/gi, "Todos los negocios"],
    [/\bdel LOCAL\b/g, "del NEGOCIO"],
    [/\bal LOCAL\b/g, "al NEGOCIO"],
    [/\bun LOCAL\b/g, "un NEGOCIO"],
    [/\btu LOCAL\b/g, "tu NEGOCIO"],
    [/\beste LOCAL\b/g, "este NEGOCIO"],
    [/\blos LOCAL\b/g, "los NEGOCIOS"],
    [/\blos locales\b/gi, "los negocios"],
    [/\bdel local\b/gi, "del negocio"],
    [/\bal local\b/gi, "al negocio"],
    [/\bun local\b/gi, "un negocio"],
    [/\btu local\b/gi, "tu negocio"],
    [/\beste local\b/gi, "este negocio"]
  ];

  const skipTags = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"]);

  function translateString(input) {
    let out = String(input ?? "");
    for (const [from, to] of exact) {
      if (out === from) return to;
    }
    for (const [pattern, replacement] of phrases) {
      out = out.replace(pattern, replacement);
    }
    return out;
  }

  function translateTextNode(node) {
    if (!node?.parentElement || skipTags.has(node.parentElement.tagName)) return;
    const next = translateString(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  function translateElement(element) {
    if (!(element instanceof Element)) return;
    for (const attr of ["title", "aria-label", "placeholder"]) {
      if (!element.hasAttribute(attr)) continue;
      const current = element.getAttribute(attr);
      const next = translateString(current);
      if (next !== current) element.setAttribute(attr, next);
    }
    element.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
    });
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }
    if (root instanceof Element) translateElement(root);
    root.querySelectorAll?.("*").forEach(translateElement);
  }

  function boot() {
    document.title = translateString(document.title);
    document.querySelectorAll('meta[name="description"],meta[property="og:title"],meta[property="og:description"]').forEach(meta => {
      const current = meta.getAttribute("content") || "";
      const next = translateString(current);
      if (next !== current) meta.setAttribute("content", next);
    });
    translateTree(document.body);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "characterData") translateTextNode(record.target);
        record.addedNodes.forEach(translateTree);
      }
    });
    observer.observe(document.body, {subtree:true, childList:true, characterData:true});
    window.HTPBusinessTerminologyObserver = observer;
  }

  window.htpBusinessText = translateString;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, {once:true});
  } else {
    boot();
  }
})();
