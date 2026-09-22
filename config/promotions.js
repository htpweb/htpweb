(() => {
  const escPromo = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[ch]));

  async function loadPublicPromotions() {
    const params = new URLSearchParams(location.search);
    const localId = params.get("local") || params.get("id");
    const card = document.getElementById("promotionsCard");
    const list = document.getElementById("promotionsListPublic");
    if (!localId || !card || !list || typeof supabaseClient === "undefined") return;

    try {
      const { data, error } = await supabaseClient.rpc("public_active_local_promotions", {
        p_local_id: localId
      });
      if (error) throw error;

      const promotions = Array.isArray(data) ? data : [];
      if (!promotions.length) {
        card.classList.add("hidden");
        return;
      }

      list.innerHTML = promotions.map(promotion => {
        const href = promotion.product_id
          ? (() => {
              const url = new URL(location.href);
              url.searchParams.set("product", promotion.product_id);
              return url.pathname + url.search;
            })()
          : null;

        const content =
          '<div class="promotion-card-copy">' +
            '<span class="promotion-badge">PROMOCIÓN</span>' +
            '<strong>' + escPromo(promotion.title) + '</strong>' +
            (promotion.body ? '<p>' + escPromo(promotion.body) + '</p>' : '') +
          '</div>';

        const image = promotion.image_url
          ? '<img src="' + escPromo(promotion.image_url) + '" alt="' + escPromo(promotion.title) + '">'
          : '';

        return href
          ? '<a class="promotion-card" href="' + escPromo(href) + '">' + image + content + '</a>'
          : '<div class="promotion-card">' + image + content + '</div>';
      }).join("");

      card.classList.remove("hidden");
    } catch (error) {
      console.warn("Promociones no disponibles:", error?.message || error);
      card.classList.add("hidden");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadPublicPromotions, { once: true });
  } else {
    loadPublicPromotions();
  }
})();
