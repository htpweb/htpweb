import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PUBLIC_ROOT = "https://htpweb.github.io/htpweb/";
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
  const { data: allowed, error: allowedError } = await userDb.rpc("delivery_share_locals", { p_delivery_id: deliveryId });
  if (allowedError) return json({ error: allowedError.message || "Sin permiso para compartir." }, 403);
  const rows = Array.isArray(allowed) ? allowed : [];
  const allowedLocal = rows.find((row: any) => row?.id === localId);
  if (!allowedLocal?.share_code) return json({ error: "LOCAL no disponible para este DELIVERY." }, 404);

  const code = String(allowedLocal.share_code).trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(code)) return json({ error: "Código corto inválido." }, 500);
  return json({ url: PUBLIC_ROOT + code, source: "htpweb", cached: true });
});