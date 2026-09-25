import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

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

const handler = withSupabase({ auth: "user" }, async (req: Request, ctx: any) => {
  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "Método no permitido", "METHOD_NOT_ALLOWED");
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, "JSON inválido", "INVALID_JSON");
    }

    const orderId = String(body?.order_id || "");
    const kind = String(body?.kind || "").toUpperCase();

    if (!validUuid(orderId)) {
      throw new HttpError(400, "order_id inválido", "INVALID_ORDER");
    }
    if (!["PHOTO", "SIGNATURE"].includes(kind)) {
      throw new HttpError(400, "Tipo de evidencia inválido", "INVALID_KIND");
    }

    const { data: context, error: contextError } = await ctx.supabase.rpc(
      "delivery_proof_media_access_context",
      { p_order_id: orderId, p_kind: kind },
    );
    if (contextError || !context) {
      throw new HttpError(
        403,
        contextError?.message || "No autorizado para consultar esta evidencia",
        "PROOF_ACCESS_DENIED",
      );
    }

    const bucket = String(context.bucket || "delivery-proofs");
    const path = String(context.path || "");
    if (!path) {
      throw new HttpError(404, "Evidencia no disponible", "PROOF_NOT_FOUND");
    }

    const { data, error } = await ctx.supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, 300);

    if (error || !data?.signedUrl) {
      console.error("delivery proof signed url:", error);
      throw new HttpError(502, "No se pudo abrir la evidencia", "SIGNED_URL_FAILED");
    }

    return jsonResponse({
      ok: true,
      order_id: orderId,
      kind: String(context.kind || kind.toLowerCase()),
      signed_url: data.signedUrl,
      expires_in: 300,
    });
  } catch (error) {
    console.error("delivery-proof-view:", error);
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse({
      ok: false,
      code: error instanceof HttpError ? error.code : "UNKNOWN_ERROR",
      error: error instanceof Error ? error.message : "Error desconocido",
    }, status);
  }
});

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return handler(req);
});
