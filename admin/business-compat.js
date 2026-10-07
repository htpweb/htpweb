(() => {
  "use strict";

  const replacements = [
    ["Locales", "Businesses"],
    ["Local", "Business"],
    ["locales", "businesses"],
    ["local", "business"]
  ];

  function canonicalName(name) {
    let out = String(name || "");
    for (const [from, to] of replacements) out = out.replaceAll(from, to);
    return out;
  }

  function exposeFunctionAliases() {
    for (const name of Object.getOwnPropertyNames(window)) {
      const value = window[name];
      if (typeof value !== "function" || !/(Local|Locales|local|locales)/.test(name)) continue;
      const alias = canonicalName(name);
      if (!alias || alias === name || Object.prototype.hasOwnProperty.call(window, alias)) continue;
      window[alias] = function(...args) {
        return value.apply(this, args);
      };
    }
  }

  const sectionAliases = Object.freeze({
    mybusiness: "mylocal",
    businessplan: "localplan",
    businessesmaster: "localsmaster",
    businesscategories: "categoriesmaster"
  });

  function resolveSection(name) {
    return sectionAliases[name] || name;
  }

  exposeFunctionAliases();

  window.HTPBusinessAdmin = Object.freeze({
    sectionAliases,
    resolveSection,
    refreshAliases: exposeFunctionAliases,
    get businesses() {
      try { return state.businesses; } catch { return []; }
    },
    get businessProfile() {
      try { return state.businessProfileRecord; } catch { return null; }
    }
  });

  window.HTPNegocios = window.HTPBusinessAdmin;
})();
