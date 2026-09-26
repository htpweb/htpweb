import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_REF = "hwfloywzqlgqieonuswl";
const FUNCTION_BASE = `https://${PROJECT_REF}.supabase.co/functions/v1/share-preview`;
const PUBLIC_APP_BASE = "https://htpweb.github.io/htpweb/app/";

function validUuid(value: string | null): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? "$" + number.toFixed(2) : "";
}

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function errorPage(message: string, status = 404) {
  return htmlResponse(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>HTPWEB</title></head><body><p>${esc(message)}</p></body></html>`, status);
}

Deno.serve(async (req: Request) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    return errorPage("Método no permitido.", 405);
  }

  const url = new URL(req.url);
  const deliverySlug = (url.searchParams.get("d") || "").trim();
  const localId = url.searchParams.get("l");
  const productId = url.searchParams.get("p");

  if (!deliverySlug || !validUuid(localId) || (productId && !validUuid(productId))) {
    return errorPage("Enlace de compartir inválido.", 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return errorPage("Configuración del servicio no disponible.", 500);
  }

  const db = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: delivery, error: deliveryError } = await db
    .from("deliveries")
    .select("id,name,slug,logo_url,description,active")
    .eq("slug", deliverySlug)
    .eq("active", true)
    .maybeSingle();

  if (deliveryError || !delivery) return errorPage("DELIVERY no disponible.");

  const { data: link, error: linkError } = await db
    .from("local_deliveries")
    .select("local_id")
    .eq("delivery_id", delivery.id)
    .eq("local_id", localId)
    .eq("active", true)
    .maybeSingle();

  if (linkError || !link) return errorPage("LOCAL no disponible para este DELIVERY.");

  const { data: local, error: localError } = await db
    .from("locals")
    .select("id,name,description,banner_url,logo_url,business_category_id,active")
    .eq("id", localId)
    .eq("active", true)
    .maybeSingle();

  if (localError || !local) return errorPage("LOCAL no disponible.");

  let product: any = null;
  if (productId) {
    const { data, error } = await db
      .from("products")
      .select("id,name,description,price,image_url,active")
      .eq("id", productId)
      .eq("local_id", localId)
      .eq("active", true)
      .maybeSingle();

    if (error || !data) return errorPage("Producto no disponible.");
    product = data;
  }

  let fallbackProductImage: string | null = null;
  if (!product?.image_url && !local.banner_url && !local.logo_url) {
    const { data } = await db
      .from("products")
      .select("image_url")
      .eq("local_id", localId)
      .eq("active", true)
      .not("image_url", "is", null)
      .order("display_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    fallbackProductImage = data?.image_url || null;
  }

  let categoryName = "";
  if (local.business_category_id) {
    const { data } = await db
      .from("local_business_categories")
      .select("name")
      .eq("id", local.business_category_id)
      .eq("active", true)
      .maybeSingle();
    categoryName = data?.name || "";
  }

  const target = new URL("local.html", PUBLIC_APP_BASE);
  target.searchParams.set("delivery", delivery.slug);
  target.searchParams.set("local", local.id);
  if (product?.id) target.searchParams.set("product", product.id);

  const self = new URL(FUNCTION_BASE);
  self.searchParams.set("d", delivery.slug);
  self.searchParams.set("l", local.id);
  if (product?.id) self.searchParams.set("p", product.id);

  const image =
    product?.image_url ||
    local.banner_url ||
    local.logo_url ||
    fallbackProductImage ||
    delivery.logo_url ||
    "https://htpweb.github.io/htpweb/assets/htpweb-logo.png";

  const title = product
    ? `${product.name}${money(product.price) ? " · " + money(product.price) : ""} | ${local.name}`
    : `${local.name} | ${delivery.name}`;

  const description = product
    ? `PIDE AQUÍ con ${delivery.name}. ${product.description || local.name}`
    : `PIDE AQUÍ con ${delivery.name}. ${categoryName || local.description || "Consulta el menú disponible."}`;

  const page = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <link rel="canonical" href="${esc(self.toString())}">
  <meta name="description" content="${esc(description)}">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(delivery.name)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(image)}">
  <meta property="og:image:secure_url" content="${esc(image)}">
  <meta property="og:url" content="${esc(self.toString())}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(image)}">

  <style>
    body{font-family:Arial,sans-serif;background:#f3f4f6;color:#111827;margin:0;display:grid;place-items:center;min-height:100vh}
    .card{width:min(520px,92vw);background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 16px 50px #0002}
    .hero{width:100%;height:300px;object-fit:cover;background:#e5e7eb}
    .body{padding:22px}
    h1{font-size:24px;margin:0 0 8px}.muted{color:#64748b}
    a{display:block;text-align:center;background:#e53935;color:#fff;text-decoration:none;font-weight:800;padding:14px;border-radius:10px;margin-top:18px}
  </style>
</head>
<body>
  <main class="card">
    <img class="hero" src="${esc(image)}" alt="">
    <div class="body">
      <h1>${esc(product?.name || local.name)}</h1>
      <div class="muted">${esc(product ? local.name + " · " + delivery.name : delivery.name)}</div>
      ${product && money(product.price) ? `<p><strong>${esc(money(product.price))}</strong></p>` : ""}
      <a href="${esc(target.toString())}">PIDE AQUÍ</a>
    </div>
  </main>
  <script>
    setTimeout(function(){ location.replace(${JSON.stringify(target.toString())}); }, 900);
  </script>
</body>
</html>`;

  const userAgent = (req.headers.get("user-agent") || "").toLowerCase();
  const isPreviewCrawler = /whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|linkedinbot|slackbot|discordbot/.test(userAgent);

  if (isPreviewCrawler) {
    if (req.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
      });
    }
    return htmlResponse(page);
  }

  return Response.redirect(target.toString(), 302);
});
