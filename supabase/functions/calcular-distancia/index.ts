import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { ORS_DIRECTIONS_DRIVING_URL } from "../_shared/ors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ORS_URL = ORS_DIRECTIONS_DRIVING_URL;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      throw new Error("Método no permitido");
    }

    const orsApiKey = Deno.env.get("ORS_API_KEY");

    if (!orsApiKey) {
      throw new Error("No está configurado ORS_API_KEY");
    }

    const body = await req.json();

    const originLat = Number(body.origin_lat);
    const originLng = Number(body.origin_lng);
    const destinationLat = Number(body.destination_lat);
    const destinationLng = Number(body.destination_lng);

    if (
      !Number.isFinite(originLat) ||
      !Number.isFinite(originLng) ||
      !Number.isFinite(destinationLat) ||
      !Number.isFinite(destinationLng)
    ) {
      throw new Error("Coordenadas inválidas");
    }

    if (
      originLat < -90 ||
      originLat > 90 ||
      destinationLat < -90 ||
      destinationLat > 90 ||
      originLng < -180 ||
      originLng > 180 ||
      destinationLng < -180 ||
      destinationLng > 180
    ) {
      throw new Error("Coordenadas fuera de rango");
    }

    const orsResponse = await fetch(ORS_URL, {
      method: "POST",
      headers: {
        Authorization: orsApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [originLng, originLat],
          [destinationLng, destinationLat],
        ],
        instructions: false,
      }),
    });

    const orsData = await orsResponse.json();

    if (!orsResponse.ok) {
      console.error("OpenRouteService:", orsData);

      throw new Error(
        orsData?.error?.message ||
        orsData?.message ||
        "Error al consultar OpenRouteService"
      );
    }

    const route = orsData?.routes?.[0];

    if (!route?.summary?.distance) {
      throw new Error(
        "OpenRouteService no devolvió una ruta válida"
      );
    }

    const distanceMeters = Number(
      route.summary.distance
    );

    const distanceKm = Number(
      (distanceMeters / 1000).toFixed(2)
    );

    return new Response(
      JSON.stringify({
        ok: true,
        distance_km: distanceKm,
        distance_meters: Math.round(distanceMeters),
        profile: "driving-car",
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("calcular-distancia:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Error desconocido",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});