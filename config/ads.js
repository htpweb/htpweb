(() => {
  const ROTATE_MS = 5000;
  let ads = [];
  let index = 0;
  let timer = null;
  let delivery = null;

  const text = (row, keys, fallback = "") => {
    for (const key of keys) {
      const value = row?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return fallback;
  };

  const bool = (value, fallback = true) => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === "boolean") return value;
    return !["false", "0", "off", "inactive"].includes(String(value).toLowerCase());
  };

  const dateOk = row => {
    const now = Date.now();
    const startRaw = text(row, ["starts_at", "start_at", "start_date", "valid_from", "published_at"]);
    const endRaw = text(row, ["ends_at", "end_at", "end_date", "valid_until", "expires_at"]);

    const start = startRaw ? Date.parse(startRaw) : NaN;
    const end = endRaw ? Date.parse(endRaw) : NaN;

    if (Number.isFinite(start) && start > now) return false;
    if (Number.isFinite(end) && end < now) return false;
    return true;
  };

  const scope = row => String(text(row, ["scope_type", "scope", "target_type"], "HTPWEB")).toUpperCase();

  const belongsToDelivery = row => {
    const rowDelivery = text(row, ["delivery_id"]);
    if (rowDelivery) return rowDelivery === delivery?.id;
    const rowScope = scope(row);
    return ["HTPWEB", "GLOBAL", "DELIVERY", "LOCAL", "PRODUCT"].includes(rowScope);
  };

  async function resolveTarget(row) {
    const explicit = text(row, ["target_url", "destination_url", "url"]);
    if (explicit) {
      try {
        const url = new URL(explicit, location.href);
        if (url.origin === location.origin) return url.href;
        if (["http:", "https:"].includes(url.protocol)) return url.href;
      } catch (_) {}
    }

    let localId = text(row, ["local_id"]);
    let productId = text(row, ["product_id"]);

    const rowScope = scope(row);
    const destinationId = text(row, ["destination_id", "target_id"]);

    if (!localId && rowScope === "LOCAL") localId = destinationId;
    if (!productId && rowScope === "PRODUCT") productId = destinationId;

    if (productId && !localId) {
      const { data, error } = await supabaseClient
        .from("products")
        .select("id,local_id,active")
        .eq("id", productId)
        .eq("active", true)
        .maybeSingle();

      if (error || !data) return null;
      localId = data.local_id;
    }

    if (localId) {
      const { data: relation, error } = await supabaseClient
        .from("local_deliveries")
        .select("local_id")
        .eq("delivery_id", delivery.id)
        .eq("local_id", localId)
        .eq("active", true)
        .maybeSingle();

      if (error || !relation) return null;

      const params = { local: localId };
      if (productId) params.product = productId;
      return urlDelivery("local.html", params);
    }

    return urlDelivery("index.html");
  }

  async function normalize(row) {
    const href = await resolveTarget(row);
    if (!href) return null;

    const title = String(text(row, ["title", "headline", "name"], scope(row) === "LOCAL" ? "Local recomendado" : "Producto recomendado"));
    const description = String(text(row, ["description", "subtitle", "body", "message"], ""));
    const image = String(text(row, ["image_url", "banner_url", "media_url"], ""));
    const priority = Number(text(row, ["priority", "display_order", "weight"], 0)) || 0;
    const id = String(text(row, ["id"], ""));

    return { id, title, description, image, href, priority };
  }

  function ensureShell() {
    let shell = document.getElementById("htpwebAdBanner");
    if (shell) return shell;

    shell = document.createElement("aside");
    shell.id = "htpwebAdBanner";
    shell.className = "htpweb-ad-banner";
    shell.setAttribute("aria-live", "polite");
    shell.innerHTML = `
      <a class="htpweb-ad-link" id="htpwebAdLink" href="#">
        <div class="htpweb-ad-media" id="htpwebAdMedia" aria-hidden="true"></div>
        <div class="htpweb-ad-copy">
          <span class="htpweb-ad-label">PUBLICIDAD</span>
          <strong id="htpwebAdTitle"></strong>
          <span id="htpwebAdDescription"></span>
        </div>
        <span class="htpweb-ad-cta">Ver</span>
        <span class="htpweb-ad-progress" id="htpwebAdProgress"></span>
      </a>
    `;

    document.body.appendChild(shell);
    document.body.classList.add("has-htpweb-ad");
    return shell;
  }

  function show(ad) {
    ensureShell();
    const link = document.getElementById("htpwebAdLink");
    const media = document.getElementById("htpwebAdMedia");
    const title = document.getElementById("htpwebAdTitle");
    const description = document.getElementById("htpwebAdDescription");
    const progress = document.getElementById("htpwebAdProgress");

    link.href = ad.href;
    title.textContent = ad.title;
    description.textContent = ad.description || "Toca para ver la promoción.";
    media.style.backgroundImage = ad.image ? `url("${String(ad.image).replace(/"/g, "%22")}")` : "";
    media.classList.toggle("no-image", !ad.image);

    progress.classList.remove("run");
    void progress.offsetWidth;
    progress.classList.add("run");
  }

  function rotate() {
    if (!ads.length) return;
    index = (index + 1) % ads.length;
    show(ads[index]);
  }

  async function load() {
    try {
      delivery = typeof cargarNegocio === "function" ? await cargarNegocio() : null;
      if (!delivery?.id) return;

      const { data, error } = await supabaseClient
        .from("advertisements")
        .select("*");

      if (error) {
        console.warn("Publicidad no disponible:", error.message || error);
        return;
      }

      const eligible = (data || [])
        .filter(row => bool(text(row, ["active", "enabled", "is_active"], true), true))
        .filter(dateOk)
        .filter(belongsToDelivery);

      const normalized = (await Promise.all(eligible.map(normalize)))
        .filter(Boolean)
        .sort((a, b) => b.priority - a.priority);

      if (!normalized.length) return;

      ads = normalized;
      index = 0;
      show(ads[0]);

      if (timer) clearInterval(timer);
      if (ads.length > 1) timer = setInterval(rotate, ROTATE_MS);
    } catch (error) {
      console.warn("No se pudo iniciar la publicidad:", error);
    }
  }

  window.HTPWEBAds = { load };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load, { once: true });
  } else {
    load();
  }
})();