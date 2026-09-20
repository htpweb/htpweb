import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) throw new Error("No está configurado SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("No está configurado SUPABASE_SERVICE_ROLE_KEY");

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function requireMaster(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "Se requiere iniciar sesión");
  const token = authorization.slice("Bearer ".length).trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "La sesión no es válida o expiró");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,active,role_id")
    .eq("id", data.user.id)
    .eq("active", true)
    .maybeSingle();
  if (!profile) throw new HttpError(403, "El perfil administrativo no está activo");

  const { data: role } = await supabaseAdmin
    .from("roles")
    .select("code,active")
    .eq("id", profile.role_id)
    .eq("active", true)
    .maybeSingle();
  if (role?.code !== "MASTER") throw new HttpError(403, "Operación exclusiva de MASTER");
}

function isAllowedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "maps.app.goo.gl" ||
    host === "goo.gl" ||
    host === "google.com" ||
    host === "www.google.com" ||
    host === "maps.google.com";
}

function validCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function pairFromText(text: string | null) {
  if (!text) return null;
  const clean = decodeURIComponent(text);
  const match = clean.match(/(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return validCoordinate(lat, lng) ? { lat, lng } : null;
}

function extractLocation(urlString: string) {
  const url = new URL(urlString);
  const decoded = decodeURIComponent(urlString);

  const at = decoded.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?),/);
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (validCoordinate(lat, lng)) return { lat, lng };
  }

  const bang = decoded.match(/!3d(-?\d{1,2}(?:\.\d+)?)[^!]*!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (bang) {
    const lat = Number(bang[1]);
    const lng = Number(bang[2]);
    if (validCoordinate(lat, lng)) return { lat, lng };
  }

  for (const key of ["query", "q", "ll", "center", "destination", "daddr"]) {
    const pair = pairFromText(url.searchParams.get(key));
    if (pair) return pair;
  }

  return null;
}

function extractSearchText(urlString: string) {
  try {
    const url = new URL(urlString);
    const path = decodeURIComponent(url.pathname);
    const placeMatch = path.match(/\/maps\/place\/([^/]+)/i);
    if (placeMatch?.[1]) return placeMatch[1].replace(/\+/g, " ").trim();

    const q = url.searchParams.get("query") || url.searchParams.get("q");
    if (q && !pairFromText(q)) return q.trim();
  } catch {
    return null;
  }
  return null;
}

function extractPlaceId(urlString: string) {
  try {
    const url = new URL(urlString);
    return url.searchParams.get("query_place_id") || url.searchParams.get("place_id") || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") throw new HttpError(405, "Método no permitido");
    await requireMaster(req);

    const body = await req.json().catch(() => {
      throw new HttpError(400, "El cuerpo debe ser JSON válido");
    });

    const raw = typeof body?.url === "string" ? body.url.trim() : "";
    if (!raw || raw.length > 2000) throw new HttpError(400, "Enlace de Google Maps inválido");

    let input: URL;
    try {
      input = new URL(raw);
    } catch {
      throw new HttpError(400, "El enlace no es una URL válida");
    }

    if (input.protocol !== "https:" || !isAllowedHost(input.hostname)) {
      throw new HttpError(400, "Solo se permiten enlaces HTTPS de Google Maps");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let response: Response;
    try {
      response = await fetch(input.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 HTPWEB Location Resolver"
        }
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new HttpError(504, "Google Maps tardó demasiado en resolver el enlace");
      }
      throw new HttpError(502, "No se pudo resolver el enlace de Google Maps");
    } finally {
      clearTimeout(timeout);
    }

    const resolvedUrl = response.url || input.toString();
    let resolved: URL;
    try {
      resolved = new URL(resolvedUrl);
    } catch {
      throw new HttpError(502, "Google Maps devolvió una URL inválida");
    }

    if (!isAllowedHost(resolved.hostname)) {
      throw new HttpError(400, "El enlace redirigió fuera de Google Maps");
    }

    const location = extractLocation(resolved.toString()) || extractLocation(input.toString());

    return jsonResponse({
      ok: true,
      original_url: input.toString(),
      resolved_url: resolved.toString(),
      latitude: location?.lat ?? null,
      longitude: location?.lng ?? null,
      place_id: extractPlaceId(resolved.toString()),
      search_text: extractSearchText(resolved.toString())
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("resolver-google-maps:", error);
    return jsonResponse({ ok: false, error: message }, status);
  }
});
