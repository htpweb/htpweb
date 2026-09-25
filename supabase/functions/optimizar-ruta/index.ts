import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";
import { ORS_OPTIMIZATION_URL } from "../_shared/ors.ts";

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
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;
}

function contextReasonMessage(reason: string | null | undefined) {
  const messages: Record<string, string> = {
    PLAN_INACTIVE: "El servicio administrativo del DELIVERY no está vigente.",
    ROUTES_NOT_INCLUDED: "El plan vigente no incluye optimización de rutas.",
    NO_ACTIVE_ORDERS: "No tienes pedidos activos para optimizar.",
    INVALID_COORDINATES: "Uno de tus pedidos no tiene coordenadas válidas.",
    ORDER_EN_ROUTE: "Ya existe una entrega EN_ROUTE. Finaliza ese tramo antes de recalcular la ruta.",
    NOT_ENOUGH_STOPS: "Necesitas al menos dos pedidos READY para optimizar una ruta.",
  };
  return messages[reason || ""] || "La ruta no puede optimizarse en este momento.";
}

const authenticatedHandler = withSupabase(
  { auth: "user" },
  async (req: Request, ctx: any) => {
    try {
      if (req.method !== "POST") {
        throw new HttpError(405, "Método no permitido", "METHOD_NOT_ALLOWED");
      }

      const orsApiKey = Deno.env.get("ORS_API_KEY");
      if (!orsApiKey) {
        throw new HttpError(500, "No está configurado ORS_API_KEY", "ORS_NOT_CONFIGURED");
      }

      let body: any;
      try {
        body = await req.json();
      } catch {
        throw new HttpError(400, "El cuerpo de la solicitud no es JSON válido", "INVALID_JSON");
      }

      if (!validUuid(body?.delivery_id)) {
        throw new HttpError(400, "delivery_id inválido", "INVALID_DELIVERY");
      }

      const originLat = Number(body?.origin_lat);
      const originLng = Number(body?.origin_lng);

      if (!validCoordinate(originLat, originLng)) {
        throw new HttpError(400, "La ubicación actual del repartidor no es válida", "INVALID_ORIGIN");
      }

      const { data: context, error: contextError } = await ctx.supabase.rpc(
        "driver_route_context",
        { p_delivery_id: body.delivery_id },
      );

      if (contextError) {
        console.error("driver_route_context:", contextError);
        throw new HttpError(403, contextError.message || "No autorizado para optimizar esta ruta", "ROUTE_CONTEXT_DENIED");
      }

      if (!context?.can_optimize) {
        const reason = typeof context?.reason === "string" ? context.reason : "ROUTE_NOT_AVAILABLE";
        const status = reason === "ROUTES_NOT_INCLUDED" || reason === "PLAN_INACTIVE" ? 403 : 409;
        throw new HttpError(status, contextReasonMessage(reason), reason);
      }

      const orders = Array.isArray(context?.orders) ? context.orders : [];
      if (orders.length < 2) {
        throw new HttpError(409, contextReasonMessage("NOT_ENOUGH_STOPS"), "NOT_ENOUGH_STOPS");
      }

      const jobs = orders.map((order: any, index: number) => {
        const lat = Number(order.latitude);
        const lng = Number(order.longitude);
        if (!validCoordinate(lat, lng)) {
          throw new HttpError(409, contextReasonMessage("INVALID_COORDINATES"), "INVALID_COORDINATES");
        }
        return {
          id: index + 1,
          description: order.order_id,
          location: [lng, lat],
          service: 0,
        };
      });

      const jobMap = new Map<number, any>(
        jobs.map((job: any, index: number) => [job.id, orders[index]]),
      );

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      let optimization: any;
      try {
        const response = await fetch(ORS_OPTIMIZATION_URL, {
          method: "POST",
          headers: {
            Authorization: orsApiKey,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            vehicles: [{
              id: 1,
              profile: "driving-car",
              start: [originLng, originLat],
            }],
            jobs,
          }),
          signal: controller.signal,
        });

        try {
          optimization = await response.json();
        } catch {
          optimization = null;
        }

        if (!response.ok) {
          console.error("HeiGIT VROOM:", optimization);
          throw new HttpError(
            502,
            optimization?.error?.message ||
              optimization?.message ||
              "No se pudo optimizar la ruta",
            "OPTIMIZATION_PROVIDER_ERROR",
          );
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new HttpError(504, "El optimizador de rutas tardó demasiado en responder", "OPTIMIZATION_TIMEOUT");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (Number(optimization?.code) !== 0) {
        throw new HttpError(
          502,
          optimization?.error || "El optimizador no devolvió una solución válida",
          "INVALID_OPTIMIZATION_SOLUTION",
        );
      }

      if (Array.isArray(optimization?.unassigned) && optimization.unassigned.length > 0) {
        throw new HttpError(
          422,
          "El optimizador no pudo incluir todos los pedidos en la ruta",
          "UNASSIGNED_STOPS",
        );
      }

      const route = Array.isArray(optimization?.routes) ? optimization.routes[0] : null;
      if (!route || !Array.isArray(route.steps)) {
        throw new HttpError(502, "El optimizador no devolvió una ruta válida", "MISSING_ROUTE");
      }

      const jobSteps = route.steps.filter((step: any) => step?.type === "job");
      if (jobSteps.length !== orders.length) {
        throw new HttpError(502, "La ruta optimizada no contiene todos los pedidos", "INCOMPLETE_ROUTE");
      }

      const stops = jobSteps.map((step: any, index: number) => {
        const order = jobMap.get(Number(step.id));
        if (!order) {
          throw new HttpError(502, "La respuesta del optimizador contiene una parada desconocida", "UNKNOWN_STOP");
        }
        return {
          sequence: index + 1,
          order_id: order.order_id,
          customer_name: order.customer_name,
          delivery_address: order.delivery_address,
          address_reference: order.address_reference,
          latitude: Number(order.latitude),
          longitude: Number(order.longitude),
          travel_seconds_from_start: Number.isFinite(Number(step.duration))
            ? Number(step.duration)
            : null,
        };
      });

      const distanceMeters = Number(route.distance ?? optimization?.summary?.distance);
      const durationSeconds = Number(route.duration ?? optimization?.summary?.duration);

      return jsonResponse({
        ok: true,
        delivery_id: body.delivery_id,
        optimized_at: new Date().toISOString(),
        origin: {
          latitude: originLat,
          longitude: originLng,
        },
        summary: {
          distance_meters: Number.isFinite(distanceMeters) ? Math.round(distanceMeters) : null,
          distance_km: Number.isFinite(distanceMeters)
            ? Number((distanceMeters / 1000).toFixed(2))
            : null,
          duration_seconds: Number.isFinite(durationSeconds) ? Math.round(durationSeconds) : null,
          duration_minutes: Number.isFinite(durationSeconds)
            ? Math.round(durationSeconds / 60)
            : null,
        },
        stops,
      });
    } catch (error) {
      console.error("optimizar-ruta:", error);
      const status = error instanceof HttpError ? error.status : 500;
      return jsonResponse({
        ok: false,
        code: error instanceof HttpError ? error.code : "UNKNOWN_ERROR",
        error: error instanceof Error ? error.message : "Error desconocido",
      }, status);
    }
  },
);

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return authenticatedHandler(req);
});
