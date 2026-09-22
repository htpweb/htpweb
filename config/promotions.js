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
        const items = Array.isArray(promotion.items) ? promotion.items : [];

        const itemHtml = items.length
          ? '<div class="promotion-items">' + items.map(item => {
              const label = String(item.product_name || "Producto") +
                (item.variant_name ? " · " + item.variant_name : "");
              const price = item.promo_price !== null && item.promo_price !== undefined
                ? " — promo $" + Number(item.promo_price).toFixed(2)
                : "";
              return '<div><strong>' + escPromo(item.quantity) + '×</strong> ' +
                escPromo(label + price) + '</div>';
            }).join("") + '</div>'
          : "";

        const total = promotion.promotion_price !== null && promotion.promotion_price !== undefined
          ? '<div class="promotion-total">Precio promocional: $' +
            Number(promotion.promotion_price).toFixed(2) + '</div>'
          : "";

        const content =
          '<div class="promotion-card-copy">' +
            '<span class="promotion-badge">PROMOCIÓN</span>' +
            '<strong>' + escPromo(promotion.title) + '</strong>' +
            total +
            itemHtml +
            (promotion.body ? '<p>' + escPromo(promotion.body) + '</p>' : '') +
          '</div>';

        const image = promotion.image_url
          ? '<img src="' + escPromo(promotion.image_url) + '" alt="' + escPromo(promotion.title) + '">'
          : "";

        return '<div class="promotion-card">' + image + content + '</div>';
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
