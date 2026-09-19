import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "npm:openai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_MENU_MODEL = Deno.env.get("OPENAI_MENU_MODEL") || "gpt-6-astra";

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

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getAuthenticatedMaster(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new HttpError(401, "Se requiere iniciar sesión");
  }

  const token = authorization.slice("Bearer ".length).trim();
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !authData?.user) {
    throw new HttpError(401, "La sesión no es válida o expiró");
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id,active,role_id")
    .eq("id", authData.user.id)
    .eq("active", true)
    .maybeSingle();

  if (!profile) throw new HttpError(403, "El profile administrativo no está activo");

  const { data: role } = await supabaseAdmin
    .from("roles")
    .select("code,active")
    .eq("id", profile.role_id)
    .eq("active", true)
    .maybeSingle();

  if (role?.code !== "MASTER") {
    throw new HttpError(403, "La importación por imagen es exclusiva de MASTER");
  }
}

function encodeBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const menuSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    local: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        description: { anyOf: [{ type: "string" }, { type: "null" }] },
        address: { anyOf: [{ type: "string" }, { type: "null" }] },
        phone: { anyOf: [{ type: "string" }, { type: "null" }] },
        whatsapp: { anyOf: [{ type: "string" }, { type: "null" }] }
      },
      required: ["name", "description", "address", "phone", "whatsapp"]
    },
    categories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { anyOf: [{ type: "string" }, { type: "null" }] },
          products: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                description: { anyOf: [{ type: "string" }, { type: "null" }] },
                price: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
                variants: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" },
                      price: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] }
                    },
                    required: ["name", "price"]
                  }
                }
              },
              required: ["name", "description", "price", "variants"]
            }
          }
        },
        required: ["name", "description", "products"]
      }
    },
    warnings: { type: "array", items: { type: "string" } }
  },
  required: ["local", "categories", "warnings"]
};

function countProducts(preview: any) {
  return (preview?.categories || []).reduce(
    (sum: number, category: any) => sum + (Array.isArray(category?.products) ? category.products.length : 0),
    0
  );
}

async function markFailed(jobId: string, message: string) {
  await supabaseAdmin.from("bulk_import_jobs").update({
    status: "FAILED",
    error_message: message.slice(0, 2000),
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq("id", jobId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let jobId: string | null = null;

  try {
    if (req.method !== "POST") throw new HttpError(405, "Método no permitido");
    await getAuthenticatedMaster(req);

    const body = await req.json().catch(() => {
      throw new HttpError(400, "El cuerpo debe ser JSON válido");
    });

    jobId = body?.job_id;
    if (!isUuid(jobId)) throw new HttpError(400, "job_id inválido");

    const { data: job } = await supabaseAdmin
      .from("bulk_import_jobs")
      .select("id,delivery_id,import_type,status")
      .eq("id", jobId)
      .maybeSingle();

    if (!job) throw new HttpError(404, "La importación no existe");
    if (job.import_type !== "MENU_IMAGE") throw new HttpError(400, "El job no es MENU_IMAGE");
    if (!["UPLOADED", "FAILED", "PREVIEW_READY"].includes(job.status)) {
      throw new HttpError(409, "La importación no puede analizarse en su estado actual");
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new HttpError(
        503,
        "OPENAI_API_KEY no está configurado en Supabase; el job quedó guardado para analizarlo después"
      );
    }

    const { data: files } = await supabaseAdmin
      .from("menu_import_files")
      .select("storage_path,mime_type,display_order")
      .eq("job_id", jobId)
      .order("display_order", { ascending: true });

    if (!files?.length || files.length > 5) {
      throw new HttpError(400, "La importación debe contener entre 1 y 5 imágenes");
    }

    const now = new Date().toISOString();
    const { error: processingError } = await supabaseAdmin.from("bulk_import_jobs").update({
      status: "PROCESSING",
      started_at: now,
      finished_at: null,
      error_message: null,
      updated_at: now
    }).eq("id", jobId);

    if (processingError) throw new HttpError(500, "No se pudo iniciar el análisis");

    const content: any[] = [{
      type: "input_text",
      text: [
        "Analiza estas imágenes como un menú comercial para HTPWEB.",
        "Extrae únicamente información visible; no inventes datos.",
        "Si un dato no aparece usa null; si el nombre del local no puede leerse usa cadena vacía.",
        "Agrupa productos por categoría visible y usa 'Otros' solo cuando no exista una categoría identificable.",
        "Tamaños, presentaciones o sabores del mismo producto deben ser variantes cuando tengan opción o precio propio.",
        "No conviertas acompañantes incluidos en la descripción en variantes.",
        "Los precios son números sin símbolo de moneda; si no son legibles usa null.",
        "Incluye warnings para cualquier dato dudoso."
      ].join(" ")
    }];

    for (const file of files) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.mime_type)) {
        throw new HttpError(400, "Formato de imagen no permitido");
      }

      const { data: blob, error: downloadError } = await supabaseAdmin.storage
        .from("htpweb-imports")
        .download(file.storage_path);

      if (downloadError || !blob) throw new HttpError(500, "No se pudo descargar una imagen privada");
      if (blob.size > 10 * 1024 * 1024) throw new HttpError(413, "Cada imagen debe pesar como máximo 10 MB");

      const bytes = new Uint8Array(await blob.arrayBuffer());
      content.push({
        type: "input_image",
        image_url: `data:${file.mime_type};base64,${encodeBase64(bytes)}`,
        detail: "high"
      });
    }

    const openai = new OpenAI({ apiKey });
    const response = await openai.responses.create({
      model: OPENAI_MENU_MODEL,
      store: false,
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "htpweb_menu_import",
          strict: true,
          schema: menuSchema
        }
      },
      max_output_tokens: 12000
    } as any);

    const raw = response.output_text?.trim();
    if (!raw) throw new HttpError(502, "La IA no devolvió un preview utilizable");

    let preview: any;
    try {
      preview = JSON.parse(raw);
    } catch {
      throw new HttpError(502, "La IA devolvió un preview inválido");
    }

    preview.local = {
      ...(preview.local || {}),
      latitude: null,
      longitude: null,
      active: false
    };

    const productCount = countProducts(preview);
    if (!Array.isArray(preview.categories) || preview.categories.length === 0 || productCount === 0) {
      throw new HttpError(422, "No se detectaron productos suficientes");
    }

    const analyzedAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin.from("bulk_import_jobs").update({
      status: "PREVIEW_READY",
      preview_data: preview,
      analysis_model: OPENAI_MENU_MODEL,
      analyzed_at: analyzedAt,
      total_rows: productCount,
      processed_rows: 0,
      success_rows: 0,
      error_rows: 0,
      finished_at: null,
      error_message: null,
      updated_at: analyzedAt
    }).eq("id", jobId);

    if (updateError) throw new HttpError(500, "No se pudo guardar el preview");

    return jsonResponse({
      ok: true,
      job_id: jobId,
      status: "PREVIEW_READY",
      model: OPENAI_MENU_MODEL,
      preview
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Error inesperado";
    console.error("analizar-menu:", error);

    if (jobId && status !== 503) await markFailed(jobId, message);
    return jsonResponse({ ok: false, error: message }, status);
  }
});
