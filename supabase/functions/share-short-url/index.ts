import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PUBLIC_SHORT_BASE = "https://htpweb.github.io/htpweb/p/";
const PREVIEW_BASE = "https://hwfloywzqlgqieonuswl.supabase.co/functions/v1/share-preview";
const TINY_RE = /^https:\/\/tinyurl\.com\/[A-Za-z0-9_-]+$/;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function createTinyUrl(target: string, alias: string) {
  const token = (Deno.env.get("TINYURL_API_TOKEN") || "").trim();

  if (token) {
    const response = await fetch("https://api.tinyurl.com/create", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ url: target, domain: "tinyurl.com", alias }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("TinyURL API respondió " + response.status + ".");
    const payload = await response.json();
    const tiny = String(payload?.data?.tiny_url || "").trim();
    if (!TINY_RE.test(tiny)) throw new Error("TinyURL API devolvió un enlace inválido.");
    return tiny;
  }

  const endpoint = "https://tinyurl.com/api-create.php?url=" + encodeURIComponent(target)
    + "&alias=" + encodeURIComponent(alias);
  const response = await fetch(endpoint, {
    headers: { "User-Agent": "HTPWEB-Share/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("TinyURL respondió " + response.status + ".");
  const tiny = (await response.text()).trim();
  if (!TINY_RE.test(tiny)) throw new Error("TinyURL no devolvió un enlace válido.");
  return tiny;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization") || "";

  if (!supabaseUrl || !anonKey || !serviceRole) return json({ error: "Servicio no configurado." }, 500);
  if (!authorization) return json({ error: "Autenticación requerida." }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }

  const deliveryId = body?.delivery_id;
  const localId = body?.local_id;
  if (!validUuid(deliveryId) || !validUuid(localId)) return json({ error: "Identificadores inválidos." }, 400);

  const userDb = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: allowed, error: allowedError } = await userDb.rpc("delivery_share_locals", {
    p_delivery_id: deliveryId,
  });
  if (allowedError) return json({ error: allowedError.message || "Sin permiso para compartir." }, 403);
  const rows = Array.isArray(allowed) ? allowed : [];
  if (!rows.some((row: any) => row?.id === localId)) return json({ error: "LOCAL no disponible para este DELIVERY." }, 404);

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [{ data: delivery }, { data: link }] = await Promise.all([
    admin.from("deliveries").select("id,slug,active").eq("id", deliveryId).eq("active", true).maybeSingle(),
    admin.from("local_deliveries")
      .select("delivery_id,local_id,share_code,share_tiny_url,active")
      .eq("delivery_id", deliveryId)
      .eq("local_id", localId)
      .eq("active", true)
      .maybeSingle(),
  ]);

  if (!delivery?.slug || !link?.share_code) return json({ error: "Enlace de compartir no disponible." }, 404);

  const fallback = PUBLIC_SHORT_BASE + encodeURIComponent(String(link.share_code)) + "/";
  const alias = (String(delivery.slug || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 42)
    + "-" + String(link.share_code || "").toLowerCase()).replace(/-+/g, "-");
  const brandedTiny = "https://tinyurl.com/" + alias;

  if (String(link.share_tiny_url || "") === brandedTiny) {
    return json({ url: brandedTiny, source: "tinyurl", cached: true, fallback });
  }

  const preview = new URL(PREVIEW_BASE);
  preview.searchParams.set("d", delivery.slug);
  preview.searchParams.set("l", localId);

  try {
    const tiny = await createTinyUrl(preview.toString(), alias);
    const { error: updateError } = await admin
      .from("local_deliveries")
      .update({ share_tiny_url: tiny, share_tiny_url_created_at: new Date().toISOString() })
      .eq("delivery_id", deliveryId)
      .eq("local_id", localId);

    if (updateError) console.warn("No se pudo cachear TinyURL:", updateError.message);
    return json({ url: tiny, source: "tinyurl", cached: false, fallback });
  } catch (error) {
    console.warn("TinyURL no disponible:", error instanceof Error ? error.message : String(error));
    return json({ url: fallback, source: "htpweb", cached: false, fallback });
  }
});