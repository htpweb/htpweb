(() => {
  const SCROLL_PX_PER_SECOND = 65;
  const scriptBase = document.currentScript?.src
    ? new URL(".", document.currentScript.src)
    : new URL("../config/", location.href);

  let ads = [];
  let index = 0;
  let animationFrame = null;
  let lastFrameAt = 0;
  let loopWidth = 0;
  let loopStart = 0;
  let loopEnd = 0;
  let carouselPaused = false;
  let delivery = null;

  async function ensureAnalytics() {
    if (window.HTPWEBAnalytics) return;
    await new Promise(resolve => {
      const existing = document.querySelector('script[data-htpweb-analytics="1"]');
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", resolve, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = new URL("analytics.js", scriptBase).href;
      script.dataset.htpwebAnalytics = "1";
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });
  }

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
    return ["HTPWEB", "GLOBAL"].includes(scope(row));
  };

  async function resolveTarget(row) {
    const explicit = text(row, ["target_url", "destination_url", "url"]);
    if (explicit) {
      try {
        const url = new URL(explicit, location.href);
        if (url.origin === location.origin || ["http:", "https:"].includes(url.protocol)) return url.href;
      } catch (_) {}
    }

    let localId = text(row, ["local_id"]);
    let productId = text(row, ["product_id"]);

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

    return {
      id: String(text(row, ["id"], "")),
      title: String(text(row, ["title", "headline", "name"], "Publicidad")),
      description: String(text(row, ["description", "subtitle", "body", "message"], "")),
      image: String(text(row, ["image_url", "banner_url", "media_url"], "")),
      priority: Number(text(row, ["priority", "display_order", "weight"], 0)) || 0,
      localId: text(row, ["local_id"]) || null,
      productId: text(row, ["product_id"]) || null,
      href
    };
  }

  function advertisingVisitorKey() {
    try {
      const storageKey = "HTPWEB_AD_VISITOR_V1";
      let value = window.localStorage.getItem(storageKey);
      if (!value) {
        value = window.crypto?.randomUUID?.() || ("v-" + Date.now() + "-" + Math.random().toString(36).slice(2));
        window.localStorage.setItem(storageKey, value);
      }
      return value;
    } catch {
      return "session-" + Math.random().toString(36).slice(2);
    }
  }

  function trackAd(eventType, ad, extra = {}) {
    if (!ad?.id) return;
    const metadata = { placement: "client_home_carousel" };
    if (eventType === "AD_IMPRESSION") {
      metadata.impression_key = [
        advertisingVisitorKey(),
        delivery?.id || "delivery",
        ad.id
      ].join(":");
    }
    window.HTPWEBAnalytics?.track(eventType, {
      delivery_id: delivery?.id,
      local_id: ad.localId,
      product_id: ad.productId,
      advertisement_id: ad.id,
      metadata
    }, extra);
  }

  function isClientHome() {
    const page = location.pathname.split("/").pop() || "";
    return page === "index.html" || page === "";
  }

  function ensureCarousel() {
    let section = document.getElementById("htpwebAdvertising");
    if (section) return section;

    const categories = document.getElementById("categories")?.closest("section");
    const localsSection = document.getElementById("locals")?.closest("section");
    if (!categories || !localsSection) return null;

    section = document.createElement("section");
    section.id = "htpwebAdvertising";
    section.className = "client-ad-section";
    section.innerHTML = `
      <div class="client-ad-heading">
        <div>
          <h2>Destacados</h2>
          <p>Locales patrocinados</p>
        </div>
        <div class="client-ad-dots" id="htpwebAdDots" aria-label="Posición de publicidad"></div>
      </div>
      <div class="client-ad-rail" id="htpwebAdRail" aria-label="Publicidad"></div>
    `;

    categories.insertAdjacentElement("afterend", section);
    return section;
  }

  function renderDots() {
    const box = document.getElementById("htpwebAdDots");
    if (!box) return;
    box.innerHTML = ads.map((_, i) =>
      '<button type="button" class="client-ad-dot ' + (i === index ? "active" : "") +
      '" aria-label="Ver anuncio ' + (i + 1) + '" data-ad-dot="' + i + '"></button>'
    ).join("");

    box.querySelectorAll("[data-ad-dot]").forEach(button => {
      button.onclick = () => goTo(Number(button.dataset.adDot || 0), true);
    });
  }

  function renderCards() {
    const rail = document.getElementById("htpwebAdRail");
    if (!rail) return;

    const cardMarkup = (ad, i, copy) => `
      <a class="client-ad-card" href="${String(ad.href).replace(/"/g, "&quot;")}" data-ad-index="${i}" data-ad-copy="${copy}" data-ad-key="${ad.presentationKey || ad.id}">
        <img src="${String(ad.image || "").replace(/"/g, "&quot;")}" alt="${String(ad.title).replace(/"/g, "&quot;")}" loading="${copy === 1 && i === 0 ? "eager" : "lazy"}">
        <span class="client-ad-overlay" aria-hidden="true"></span>
        <span class="client-ad-sponsored">PUBLICIDAD</span>
        <span class="client-ad-copy">
          <strong>${ad.title}</strong>
          ${ad.description ? '<span>' + ad.description + '</span>' : ""}
          <em>Ver local</em>
        </span>
      </a>
    `;

    rail.innerHTML = [0, 1, 2]
      .flatMap(copy => ads.map((ad, i) => cardMarkup(ad, i, copy)))
      .join("");

    rail.querySelectorAll(".client-ad-card").forEach(card => {
      card.addEventListener("click", () => {
        const ad = ads[Number(card.dataset.adIndex || 0)];
        trackAd("AD_CLICK", ad);
      });
    });

    const syncIndexFromScroll = () => {
      const cards = [...rail.querySelectorAll(".client-ad-card")];
      if (!cards.length) return;
      const center = rail.scrollLeft + rail.clientWidth / 2;
      let best = index;
      let distance = Infinity;
      cards.forEach(card => {
        const cardCenter = card.offsetLeft + card.offsetWidth / 2;
        const nextDistance = Math.abs(cardCenter - center);
        if (nextDistance < distance) {
          distance = nextDistance;
          best = Number(card.dataset.adIndex || 0);
        }
      });
      if (best !== index) {
        index = best;
        renderDots();
        const ad = ads[index];
        trackAd("AD_IMPRESSION", ad, {
          dedupeKey: "ad-impression:" + ad.id + ":" + index + ":continuous"
        });
      }
    };

    rail.addEventListener("scroll", syncIndexFromScroll, { passive: true });
    rail.addEventListener("pointerdown", () => { carouselPaused = true; });
    window.addEventListener("pointerup", () => { carouselPaused = false; lastFrameAt = 0; });
    window.addEventListener("pointercancel", () => { carouselPaused = false; lastFrameAt = 0; });

    requestAnimationFrame(() => {
      const first = rail.querySelector('.client-ad-card[data-ad-copy="0"][data-ad-index="0"]');
      const middle = rail.querySelector('.client-ad-card[data-ad-copy="1"][data-ad-index="0"]');
      const third = rail.querySelector('.client-ad-card[data-ad-copy="2"][data-ad-index="0"]');
      if (!first || !middle || !third) return;
      loopWidth = middle.offsetLeft - first.offsetLeft;
      loopStart = middle.offsetLeft;
      loopEnd = third.offsetLeft;
      rail.scrollLeft = loopStart;
    });
  }

  function normalizeLoopPosition(rail) {
    if (!loopWidth) return;
    if (rail.scrollLeft >= loopEnd) rail.scrollLeft -= loopWidth;
    else if (rail.scrollLeft < loopStart - loopWidth) rail.scrollLeft += loopWidth;
  }

  function goTo(nextIndex, userInitiated = false) {
    if (!ads.length) return;
    index = ((nextIndex % ads.length) + ads.length) % ads.length;
    const rail = document.getElementById("htpwebAdRail");
    const card = rail?.querySelector('[data-ad-copy="1"][data-ad-index="' + index + '"]');
    if (rail && card) {
      rail.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
    }
    renderDots();
    const ad = ads[index];
    trackAd("AD_IMPRESSION", ad, {
      dedupeKey: "ad-impression:" + ad.id + ":" + index + ":" + (userInitiated ? "manual" : "auto")
    });
  }

  function startRotation() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (ads.length <= 1) return;

    const step = now => {
      const rail = document.getElementById("htpwebAdRail");
      if (!rail) return;
      if (!lastFrameAt) lastFrameAt = now;
      const delta = Math.min(64, now - lastFrameAt);
      lastFrameAt = now;

      if (!carouselPaused && loopWidth > 0) {
        rail.scrollLeft += (SCROLL_PX_PER_SECOND * delta) / 1000;
        normalizeLoopPosition(rail);
      }
      animationFrame = requestAnimationFrame(step);
    };

    lastFrameAt = 0;
    animationFrame = requestAnimationFrame(step);
  }

  async function load() {
    try {
      if (!isClientHome()) return;

      await ensureAnalytics();
      delivery = typeof cargarNegocio === "function" ? await cargarNegocio() : null;
      if (!delivery?.id) return;

      const { data, error } = await supabaseClient.rpc("public_delivery_advertisements", {
        p_delivery_id: delivery.id
      });

      if (error) {
        console.warn("Publicidad no disponible:", error.message || error);
        return;
      }

      const eligible = (data || [])
        .filter(row => bool(text(row, ["active", "enabled", "is_active"], true), true))
        .filter(dateOk);

      let normalized = (await Promise.all(eligible.map(normalize)))
        .filter(ad => ad && ad.image)
        .sort((a, b) => b.priority - a.priority);

      if (normalized.length && normalized.length < 3) {
        const internal = normalized.find(ad =>
          String((data || []).find(row => String(row.id) === ad.id)?.is_internal) === "true"
        ) || normalized[normalized.length - 1];
        while (normalized.length < 3 && internal) {
          normalized = normalized.concat([{ ...internal, presentationKey: internal.id + "-fill-" + normalized.length }]);
        }
      }

      if (!normalized.length) return;

      ads = normalized;
      index = 0;

      if (!ensureCarousel()) return;
      renderCards();
      renderDots();
      trackAd("AD_IMPRESSION", ads[0], { dedupeKey: "ad-impression:" + ads[0].id + ":0:initial" });
      startRotation();
    } catch (error) {
      console.warn("No se pudo iniciar la publicidad:", error);
    }
  }

  window.HTPWEBAds = { load, goTo };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load, { once: true });
  } else {
    load();
  }
})();
