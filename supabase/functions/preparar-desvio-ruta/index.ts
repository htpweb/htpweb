import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";
import { ORS_DIRECTIONS_DRIVING_GEOJSON_URL } from "../_shared/ors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function simplifyPoints(points: unknown[]): number[][] {
  const valid = points
    .filter((p): p is unknown[] => Array.isArray(p) && p.length >= 2)
    .map(p => [Number(p[0]), Number(p[1])])
    .filter(p => validCoordinate(p[1], p[0]));

  if (valid.length < 2) throw new HttpError(502, "La ruta no devolvió geometría válida", "INVALID_ROUTE_GEOMETRY");
  if (valid.length <= 1400) return valid;

  const step = Math.ceil(valid.length / 1400);
  const sampled = valid.filter((_, index) => index === 0 || index === valid.length - 1 || index % step === 0);
  if (sampled[sampled.length - 1] !== valid[valid.length - 1]) sampled.push(valid[valid.length - 1]);
  return sampled;
}

const handler = withSupabase({ auth: "user" }, async (req: Request, ctx: any) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Método no permitido", "METHOD_NOT_ALLOWED");

    const orsApiKey = Deno.env.get("ORS_API_KEY");
    if (!orsApiKey) throw new HttpError(500, "No está configurado ORS_API_KEY", "ORS_NOT_CONFIGURED");

    let body: any;
    try { body = await req.json(); }
    catch { throw new HttpError(400, "JSON inválido", "INVALID_JSON"); }

    const orderId = String(body?.order_id || "");
    const originLat = Number(body?.origin_lat);
    const originLng = Number(body?.origin_lng);

    if (!validUuid(orderId)) throw new HttpError(400, "order_id inválido", "INVALID_ORDER");
    if (!validCoordinate(originLat, originLng)) throw new HttpError(400, "Ubicación inicial inválida", "INVALID_ORIGIN");

    const { data: context, error: contextError } = await ctx.supabase.rpc(
      "driver_route_deviation_plan_context",
      { p_order_id: orderId },
    );
    if (contextError) throw new HttpError(403, contextError.message || "No autorizado para preparar la ruta", "CONTEXT_DENIED");
    if (!context?.can_prepare) {
      const reason = String(context?.reason || "ROUTE_DEVIATION_NOT_AVAILABLE");
      throw new HttpError(
        reason === "ROUTE_DEVIATION_NOT_INCLUDED" || reason === "GPS_NOT_INCLUDED" ? 403 : 409,
        reason === "GPS_NOT_INCLUDED"
          ? "El plan no incluye GPS en vivo."
          : reason === "DESTINATION_COORDINATES_MISSING"
            ? "El pedido no tiene coordenadas de destino."
            : "El plan no incluye monitoreo de desvío de ruta.",
        reason,
      );
    }

    const destinationLat = Number(context.destination_latitude);
    const destinationLng = Number(context.destination_longitude);
    if (!validCoordinate(destinationLat, destinationLng)) {
      throw new HttpError(409, "Destino del pedido inválido", "INVALID_DESTINATION");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let route: any;
    try {
      const response = await fetch(ORS_DIRECTIONS_DRIVING_GEOJSON_URL, {
        method: "POST",
        headers: {
          Authorization: orsApiKey,
          "Content-Type": "application/json",
          Accept: "application/geo+json, application/json",
        },
        body: JSON.stringify({
          coordinates: [[originLng, originLat], [destinationLng, destinationLat]],
          geometry: true,
          geometry_simplify: true,
          instructions: false,
        }),
        signal: controller.signal,
      });

      try { route = await response.json(); } catch { route = null; }
      if (!response.ok) {
        console.error("HeiGIT directions:", route);
        throw new HttpError(
          502,
          route?.error?.message || route?.message || "No se pudo preparar la ruta de seguridad",
          "ROUTE_PROVIDER_ERROR",
        );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new HttpError(504, "El proveedor de rutas tardó demasiado en responder", "ROUTE_PROVIDER_TIMEOUT");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const feature = Array.isArray(route?.features) ? route.features[0] : null;
    const points = simplifyPoints(feature?.geometry?.coordinates || []);
    const summary = feature?.properties?.summary || {};

    const { data: plan, error: registerError } = await ctx.supabase.rpc(
      "driver_register_route_deviation_plan",
      {
        p_order_id: orderId,
        p_route_points: points,
        p_route_distance_m: Number.isFinite(Number(summary.distance)) ? Number(summary.distance) : null,
        p_route_duration_s: Number.isFinite(Number(summary.duration)) ? Number(summary.duration) : null,
      },
    );
    if (registerError) {
      throw new HttpError(409, registerError.message || "No se pudo registrar el plan de desvío", "PLAN_REGISTER_FAILED");
    }

    return jsonResponse({
      ok: true,
      order_id: orderId,
      route_points: points.length,
      route_distance_m: plan?.route_distance_m ?? null,
      route_duration_s: plan?.route_duration_s ?? null,
      threshold_m: plan?.threshold_m ?? 300,
      existing_plan: context?.existing_plan === true,
    });
  } catch (error) {
    console.error("preparar-desvio-ruta:", error);
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse({
      ok: false,
      code: error instanceof HttpError ? error.code : "UNKNOWN_ERROR",
      error: error instanceof Error ? error.message : "Error desconocido",
    }, status);
  }
});

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return handler(req);
});
