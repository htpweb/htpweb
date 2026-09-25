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

const mimeExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const handler = withSupabase({ auth: "user" }, async (req: Request, ctx: any) => {
  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "Método no permitido", "METHOD_NOT_ALLOWED");
    }

    const form = await req.formData();
    const orderId = String(form.get("order_id") || "");
    const kind = String(form.get("kind") || "").toUpperCase();
    const file = form.get("file");

    if (!validUuid(orderId)) {
      throw new HttpError(400, "order_id inválido", "INVALID_ORDER");
    }
    if (!["PHOTO", "SIGNATURE"].includes(kind)) {
      throw new HttpError(400, "Tipo de evidencia inválido", "INVALID_KIND");
    }
    if (!(file instanceof File)) {
      throw new HttpError(400, "Archivo de evidencia requerido", "FILE_REQUIRED");
    }

    const extension = mimeExtensions[file.type];
    if (!extension) {
      throw new HttpError(415, "Formato no permitido. Usa JPG, PNG o WEBP.", "INVALID_MIME");
    }

    const maxBytes = kind === "SIGNATURE" ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size <= 0 || file.size > maxBytes) {
      throw new HttpError(
        413,
        kind === "SIGNATURE"
          ? "La firma supera el límite de 2 MB."
          : "La foto supera el límite de 5 MB.",
        "FILE_TOO_LARGE",
      );
    }

    const { data: context, error: contextError } = await ctx.supabase.rpc(
      "driver_delivery_proof_upload_context",
      { p_order_id: orderId, p_kind: kind },
    );
    if (contextError || !context) {
      throw new HttpError(
        403,
        contextError?.message || "No autorizado para cargar esta evidencia",
        "PROOF_CONTEXT_DENIED",
      );
    }

    const bucket = String(context.bucket || "delivery-proofs");
    const deliveryId = String(context.delivery_id || "");
    const normalizedKind = String(context.kind || kind.toLowerCase());
    if (!validUuid(deliveryId)) {
      throw new HttpError(500, "Contexto de evidencia inválido", "INVALID_CONTEXT");
    }

    const path = `${deliveryId}/${orderId}/${normalizedKind}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await ctx.supabaseAdmin.storage
      .from(bucket)
      .upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("delivery proof upload:", uploadError);
      throw new HttpError(502, "No se pudo guardar la evidencia", "STORAGE_UPLOAD_FAILED");
    }

    const { data: proof, error: registerError } = await ctx.supabase.rpc(
      "driver_register_delivery_proof_media",
      { p_order_id: orderId, p_kind: kind, p_path: path },
    );

    if (registerError) {
      await ctx.supabaseAdmin.storage.from(bucket).remove([path]);
      throw new HttpError(
        409,
        registerError.message || "No se pudo registrar la evidencia",
        "PROOF_REGISTER_FAILED",
      );
    }

    const previousPath = typeof context.existing_path === "string"
      ? context.existing_path
      : null;
    if (previousPath && previousPath !== path) {
      const { error: cleanupError } = await ctx.supabaseAdmin.storage
        .from(bucket)
        .remove([previousPath]);
      if (cleanupError) console.error("delivery proof cleanup:", cleanupError);
    }

    return jsonResponse({
      ok: true,
      order_id: orderId,
      kind: normalizedKind,
      proof,
    });
  } catch (error) {
    console.error("delivery-proof-upload:", error);
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
