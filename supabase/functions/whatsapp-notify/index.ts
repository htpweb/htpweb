import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { withSupabase } from "npm:@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-htpweb-whatsapp-hook",
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
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}

function normalizePhone(value: unknown) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0\d{9}$/.test(digits)) digits = "593" + digits.slice(1);
  else if (/^9\d{8}$/.test(digits)) digits = "593" + digits;

  if (!/^\d{8,15}$/.test(digits)) {
    throw new HttpError(422, "El destinatario no tiene un WhatsApp válido", "INVALID_PHONE");
  }
  return digits;
}

function orderRef(orderId: string) {
  return orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function clip(value: unknown, max: number) {
  const text = String(value ?? "").trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function providerConfig() {
  const graphVersion = String(Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "").trim();
  const accessToken = String(Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "").trim();
  const phoneNumberId = String(Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim();
  const localTemplate = String(Deno.env.get("WHATSAPP_TEMPLATE_LOCAL_ORDER") || "").trim();
  const driverAssignedTemplate = String(
    Deno.env.get("WHATSAPP_TEMPLATE_DRIVER_ASSIGNMENT") || "",
  ).trim();
  const driverUnassignedTemplate = String(
    Deno.env.get("WHATSAPP_TEMPLATE_DRIVER_UNASSIGNMENT") || "",
  ).trim();
  const publicUrl = String(Deno.env.get("HTPWEB_PUBLIC_URL") || "").trim();
  const language = String(Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "es").trim();

  const core = Boolean(
    /^v\d+\.\d+$/.test(graphVersion) && accessToken && phoneNumberId,
  );

  return {
    graphVersion,
    accessToken,
    phoneNumberId,
    localTemplate,
    driverAssignedTemplate,
    driverUnassignedTemplate,
    publicUrl,
    language,
    localOrderConfigured: core && Boolean(localTemplate),
    driverDispatchConfigured: core &&
      Boolean(driverAssignedTemplate && driverUnassignedTemplate && publicUrl),
  };
}

function supabaseSecretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed?.default) return String(parsed.default);
    } catch {
      // Fallback legacy abajo.
    }
  }
  return String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
}

function createAdminClient() {
  const url = String(Deno.env.get("SUPABASE_URL") || "");
  const key = supabaseSecretKey();
  if (!url || !key) {
    throw new HttpError(500, "Supabase admin no está configurado", "SUPABASE_ADMIN_NOT_CONFIGURED");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sendTemplate(
  phone: unknown,
  templateName: string,
  parameters: string[],
) {
  const cfg = providerConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId || !cfg.graphVersion) {
    throw new HttpError(
      503,
      "WhatsApp automático todavía no está configurado en Meta",
      "WHATSAPP_NOT_CONFIGURED",
    );
  }
  if (!templateName) {
    throw new HttpError(
      503,
      "Falta la plantilla de WhatsApp requerida",
      "WHATSAPP_TEMPLATE_NOT_CONFIGURED",
    );
  }

  const to = normalizePhone(phone);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(
      "https://graph.facebook.com/" + cfg.graphVersion + "/" +
        encodeURIComponent(cfg.phoneNumberId) + "/messages",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + cfg.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: cfg.language },
            components: [{
              type: "body",
              parameters: parameters.map((text) => ({
                type: "text",
                text: clip(text, 900),
              })),
            }],
          },
        }),
        signal: controller.signal,
      },
    );

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      console.error("whatsapp provider:", response.status, payload?.error?.code);
      throw new HttpError(
        502,
        payload?.error?.message || "Meta no pudo entregar el mensaje",
        "WHATSAPP_PROVIDER_ERROR",
      );
    }

    return {
      message_id: payload?.messages?.[0]?.id || null,
      to,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HttpError(
        504,
        "WhatsApp tardó demasiado en responder",
        "WHATSAPP_TIMEOUT",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJson(req: Request) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "JSON inválido", "INVALID_JSON");
  }
}

const authenticatedHandler = withSupabase(
  { auth: "user" },
  async (req: Request, ctx: any) => {
    try {
      if (req.method !== "POST") {
        throw new HttpError(405, "Método no permitido", "METHOD_NOT_ALLOWED");
      }

      const body: any = await parseJson(req);
      const kind = String(body?.kind || "").toUpperCase();
      const deliveryId = String(body?.delivery_id || "");

      if (!validUuid(deliveryId)) {
        throw new HttpError(400, "delivery_id inválido", "INVALID_DELIVERY");
      }

      const { data: settings, error: settingsError } = await ctx.supabase.rpc(
        "delivery_whatsapp_settings_snapshot",
        { p_delivery_id: deliveryId },
      );

      if (settingsError || !settings) {
        throw new HttpError(
          403,
          settingsError?.message || "No autorizado para WhatsApp de este DELIVERY",
          "WHATSAPP_ACCESS_DENIED",
        );
      }

      const cfg = providerConfig();

      if (kind === "STATUS") {
        return jsonResponse({
          ok: true,
          configured: cfg.localOrderConfigured && cfg.driverDispatchConfigured,
          local_order_configured: cfg.localOrderConfigured,
          driver_dispatch_configured: cfg.driverDispatchConfigured,
          mode: settings.mode || "ASSISTED",
        });
      }

      if (kind !== "LOCAL_ORDER") {
        throw new HttpError(400, "Tipo de mensaje inválido", "INVALID_KIND");
      }

      if (settings.mode !== "AUTOMATIC") {
        throw new HttpError(
          409,
          "Este DELIVERY usa WhatsApp asistido",
          "WHATSAPP_ASSISTED_MODE",
        );
      }
      if (settings.local_orders !== true) {
        throw new HttpError(
          409,
          "El envío de pedidos a locales por WhatsApp está desactivado",
          "LOCAL_WHATSAPP_DISABLED",
        );
      }
      if (!cfg.localOrderConfigured) {
        throw new HttpError(
          503,
          "WhatsApp automático para locales todavía no está configurado",
          "WHATSAPP_NOT_CONFIGURED",
        );
      }

      const orderId = String(body?.order_id || "");
      const localId = String(body?.local_id || "");
      if (!validUuid(orderId) || !validUuid(localId)) {
        throw new HttpError(400, "Pedido o LOCAL inválido", "INVALID_ORDER_LOCAL");
      }

      const { data: order, error: orderError } = await ctx.supabase
        .from("orders")
        .select(
          "id,delivery_id,notes," +
            "order_items(local_id,product_name,variant_name,quantity,subtotal)," +
            "order_locals(local_id,subtotal,locals(id,name,whatsapp))",
        )
        .eq("id", orderId)
        .eq("delivery_id", deliveryId)
        .maybeSingle();

      if (orderError || !order) {
        throw new HttpError(
          404,
          orderError?.message || "Pedido no disponible",
          "ORDER_NOT_AVAILABLE",
        );
      }

      const localGroup = (order.order_locals || []).find((row: any) =>
        row.local_id === localId
      );
      if (!localGroup) {
        throw new HttpError(404, "El LOCAL no pertenece al pedido", "LOCAL_NOT_IN_ORDER");
      }

      const relation = localGroup.locals;
      const local = Array.isArray(relation) ? relation[0] : relation;
      if (!local?.whatsapp) {
        throw new HttpError(
          422,
          "El LOCAL no tiene WhatsApp registrado",
          "LOCAL_WITHOUT_WHATSAPP",
        );
      }

      const items = (order.order_items || []).filter((item: any) =>
        item.local_id === localId
      );
      if (!items.length) {
        throw new HttpError(409, "El subpedido no tiene productos", "LOCAL_WITHOUT_ITEMS");
      }

      const itemSummary = clip(
        items.map((item: any) => {
          const variant = item.variant_name ? " (" + item.variant_name + ")" : "";
          return String(item.quantity) + " x " + item.product_name + variant;
        }).join("; "),
        900,
      );

      const sent = await sendTemplate(
        local.whatsapp,
        cfg.localTemplate,
        [
          orderRef(order.id),
          clip(local.name || "LOCAL", 120),
          itemSummary,
          clip(order.notes || "Sin observaciones", 300),
        ],
      );

      return jsonResponse({
        ok: true,
        kind,
        order_id: order.id,
        local_id: localId,
        message_id: sent.message_id,
      });
    } catch (error) {
      console.error("whatsapp-notify user:", error instanceof HttpError ? error.code : error);
      const status = error instanceof HttpError ? error.status : 500;
      return jsonResponse({
        ok: false,
        code: error instanceof HttpError ? error.code : "UNKNOWN_ERROR",
        error: error instanceof Error ? error.message : "Error desconocido",
      }, status);
    }
  },
);

async function internalDriverHandler(req: Request) {
  try {
    if (req.method !== "POST") {
      throw new HttpError(405, "Método no permitido", "METHOD_NOT_ALLOWED");
    }

    const admin = createAdminClient();
    const hookSecret = String(req.headers.get("x-htpweb-whatsapp-hook") || "");
    if (!hookSecret) {
      throw new HttpError(401, "Hook no autorizado", "INVALID_HOOK");
    }

    const { data: validSecret, error: secretError } = await admin.rpc(
      "verify_whatsapp_dispatch_hook_secret",
      { p_secret: hookSecret },
    );

    if (secretError || validSecret !== true) {
      throw new HttpError(401, "Hook no autorizado", "INVALID_HOOK");
    }

    const body: any = await parseJson(req);
    const kind = String(body?.kind || "").toUpperCase();
    const assignmentId = String(body?.assignment_id || "");

    if (!["DRIVER_ASSIGNED", "DRIVER_UNASSIGNED"].includes(kind)) {
      throw new HttpError(400, "Evento de repartidor inválido", "INVALID_KIND");
    }
    if (!validUuid(assignmentId)) {
      throw new HttpError(400, "assignment_id inválido", "INVALID_ASSIGNMENT");
    }

    const { data: assignment, error: assignmentError } = await admin
      .from("order_driver_assignments")
      .select("id,order_id,delivery_id,driver_user_id,status,unassigned_at")
      .eq("id", assignmentId)
      .maybeSingle();

    if (assignmentError || !assignment) {
      throw new HttpError(404, "Asignación inexistente", "ASSIGNMENT_NOT_FOUND");
    }

    if (
      (kind === "DRIVER_ASSIGNED" &&
        (assignment.status !== "ACTIVE" || assignment.unassigned_at)) ||
      (kind === "DRIVER_UNASSIGNED" && assignment.status !== "UNASSIGNED")
    ) {
      throw new HttpError(409, "El evento ya no coincide con la asignación", "STALE_ASSIGNMENT_EVENT");
    }

    const [{ data: driver, error: driverError }, { data: order, error: orderError }] =
      await Promise.all([
        admin.from("profiles")
          .select("id,full_name,phone,active")
          .eq("id", assignment.driver_user_id)
          .maybeSingle(),
        admin.from("orders")
          .select("id,delivery_address")
          .eq("id", assignment.order_id)
          .eq("delivery_id", assignment.delivery_id)
          .maybeSingle(),
      ]);

    if (driverError || !driver?.phone) {
      throw new HttpError(422, "El repartidor no tiene teléfono válido", "DRIVER_WITHOUT_PHONE");
    }
    if (orderError || !order) {
      throw new HttpError(404, "Pedido inexistente", "ORDER_NOT_FOUND");
    }

    const cfg = providerConfig();
    if (!cfg.driverDispatchConfigured) {
      throw new HttpError(
        503,
        "WhatsApp automático para repartidores todavía no está configurado",
        "WHATSAPP_NOT_CONFIGURED",
      );
    }

    const templateName = kind === "DRIVER_ASSIGNED"
      ? cfg.driverAssignedTemplate
      : cfg.driverUnassignedTemplate;

    const parameters = kind === "DRIVER_ASSIGNED"
      ? [
        orderRef(order.id),
        clip(order.delivery_address || "Ver detalle en HTPWEB", 240),
        cfg.publicUrl,
      ]
      : [orderRef(order.id)];

    const sent = await sendTemplate(driver.phone, templateName, parameters);

    return jsonResponse({
      ok: true,
      kind,
      assignment_id: assignment.id,
      order_id: order.id,
      message_id: sent.message_id,
    });
  } catch (error) {
    console.error("whatsapp-notify hook:", error instanceof HttpError ? error.code : error);
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse({
      ok: false,
      code: error instanceof HttpError ? error.code : "UNKNOWN_ERROR",
      error: error instanceof Error ? error.message : "Error desconocido",
    }, status);
  }
}

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.headers.get("x-htpweb-whatsapp-hook")) {
    return internalDriverHandler(req);
  }

  return authenticatedHandler(req);
});
