import "jsr:@supabase/functions-js/edge-runtime.d.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, text: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cfg() {
  return {
    token: String(Deno.env.get("WHATSAPP_ACCESS_TOKEN") || ""),
    appToken: String(Deno.env.get("META_APP_ACCESS_TOKEN") || ""),
    version: String(Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v25.0"),
    wabaId: String(Deno.env.get("WHATSAPP_WABA_ID") || ""),
    phoneId: String(Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || ""),
    appId: "1407687117661354",
    verifyToken: String(Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") || ""),
    adminSecret: String(Deno.env.get("HTPWEB_META_ADMIN_SECRET") || ""),
    callback:
      "https://hwfloywzqlgqieonuswl.supabase.co/functions/v1/whatsapp-webhook",
  };
}

async function graph(
  path: string,
  method = "GET",
  body?: unknown,
) {
  const c = cfg();
  const url = "https://graph.facebook.com/" + c.version + "/" + path;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + c.token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let payload: any = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, payload };
  }
  return { ok: true, status: res.status, payload };
}

const templates = [
  {
    name: "htpweb_local_order_v1",
    language: "es",
    category: "UTILITY",
    allow_category_change: true,
    components: [{
      type: "BODY",
      text:
        "HTPWEB | Nuevo pedido {{1}}\nLOCAL: {{2}}\nProductos: {{3}}\nObservaciones: {{4}}\nResponde con los minutos de preparación (por ejemplo, 20). Cuando esté listo, responde LISTO.",
      example: {
        body_text: [[
          "A1B2C3D4",
          "Asados Codesa",
          "2 x Parrillada; 1 x Cola",
          "Sin observaciones",
        ]],
      },
    }],
  },
  {
    name: "htpweb_driver_assignment_v1",
    language: "es",
    category: "UTILITY",
    allow_category_change: true,
    components: [{
      type: "BODY",
      text:
        "HTPWEB | Pedido {{1}} asignado.\nEntrega: {{2}}\nAbre HTPWEB: {{3}}\nUsa ese enlace para gestionar la entrega.",
      example: {
        body_text: [[
          "A1B2C3D4",
          "Av. Principal y Calle 10",
          "https://htpweb.github.io/htpweb",
        ]],
      },
    }],
  },
  {
    name: "htpweb_driver_assignment_v2",
    language: "es",
    category: "UTILITY",
    allow_category_change: true,
    components: [{
      type: "BODY",
      text:
        "HTPWEB | Nuevo pedido asignado\nPedido {{1}}\nAbre HTPWEB para ver la recogida, la ruta y la entrega:\n{{2}}\nGestiona el pedido únicamente desde HTPWEB.",
      example: {
        body_text: [[
          "A1B2C3D4",
          "https://htpweb.github.io/htpweb/admin/index.html",
        ]],
      },
    }],
  },
  {
    name: "htpweb_local_order_brand_v1",
    language: "es",
    category: "UTILITY",
    allow_category_change: true,
    components: [{
      type: "BODY",
      text:
        "Nuevo pedido de {{1}}\nPedido {{2}}\nLOCAL: {{3}}\nProductos: {{4}}\nObservaciones: {{5}}\nResponde con los minutos de preparación (por ejemplo, 20). Cuando esté listo, responde LISTO.\n\nPlataforma HTPWEB",
      example: {
        body_text: [[
          "Sobre Ruedas",
          "A1B2C3D4",
          "Asados Codesa",
          "2 x Parrillada; 1 x Cola",
          "Sin observaciones",
        ]],
      },
    }],
  },
  {
    name: "htpweb_driver_assignment_brand_v1",
    language: "es",
    category: "UTILITY",
    allow_category_change: true,
    components: [{
      type: "BODY",
      text:
        "Nuevo pedido asignado por {{1}}\nPedido {{2}}\nAbre este enlace para ver recogida, ruta y entrega:\n{{3}}\n\nPlataforma HTPWEB",
      example: {
        body_text: [[
          "Sobre Ruedas",
          "A1B2C3D4",
          "https://htpweb.github.io/htpweb/admin/index.html",
        ]],
      },
    }],
  },
  {
    name: "htpweb_driver_unassignment_brand_v1",
    language: "es",
    category: "UTILITY",
    allow_category_change: true,
    components: [{
      type: "BODY",
      text:
        "Actualización de {{1}}\nEl pedido {{2}} ya no está asignado a ti.\n\nPlataforma HTPWEB",
      example: { body_text: [["Sobre Ruedas", "A1B2C3D4"]] },
    }],
  },
  {
    name: "htpweb_driver_unassignment_v1",
    language: "es",
    category: "UTILITY",
    allow_category_change: true,
    components: [{
      type: "BODY",
      text: "HTPWEB | El pedido {{1}} ya no está asignado a ti.",
      example: { body_text: [["A1B2C3D4"]] },
    }],
  },
];

async function status() {
  const c = cfg();
  const [waba, phones, subscriptions, tpl] = await Promise.all([
    graph(c.wabaId + "?fields=id,name,timezone_id,message_template_namespace"),
    graph(c.wabaId + "/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status"),
    graph(c.wabaId + "/subscribed_apps"),
    graph(c.wabaId + "/message_templates?limit=100"),
  ]);
  return { waba, phones, subscriptions, templates: tpl };
}

async function subscribe() {
  const c = cfg();
  const first = await graph(c.wabaId + "/subscribed_apps", "POST", {});
  const override = await graph(c.wabaId + "/subscribed_apps", "POST", {
    override_callback_uri: c.callback,
    verify_token: c.verifyToken,
  });
  return { first, override };
}

async function createTemplates() {
  const c = cfg();
  const current = await graph(c.wabaId + "/message_templates?limit=100");
  if (!current.ok) return { current, results: [] };

  const existing = new Map<string, any>(
    (current.payload?.data || []).map((t: any) => [String(t.name), t]),
  );
  const results: any[] = [];

  for (const tpl of templates) {
    const old = existing.get(tpl.name);
    if (old) {
      results.push({
        name: tpl.name,
        action: "exists",
        status: old.status,
        category: old.category,
        id: old.id,
      });
      continue;
    }
    const created = await graph(c.wabaId + "/message_templates", "POST", tpl);
    results.push({ name: tpl.name, action: "create", ...created });
  }
  return { results };
}

async function setCommands() {
  const c = cfg();
  const profile = await graph(c.phoneId + "/whatsapp_business_profile?fields=about,address,description,email,websites,vertical");
  return { profile };
}

async function appSubscriptions() {
  const c = cfg();
  const url = `https://graph.facebook.com/${c.version}/${c.appId}/subscriptions?access_token=${encodeURIComponent(c.appToken)}`;
  const res = await fetch(url);
  const text = await res.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  return { ok: res.ok, status: res.status, payload };
}

async function debugAccessToken() {
  const c = cfg();
  const url = `https://graph.facebook.com/${c.version}/debug_token?input_token=${encodeURIComponent(c.token)}&access_token=${encodeURIComponent(c.appToken)}`;
  const res = await fetch(url);
  const text = await res.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  const data = payload?.data || null;
  return {
    ok: res.ok,
    status: res.status,
    token: data ? {
      is_valid: data.is_valid === true,
      app_id: data.app_id || null,
      type: data.type || null,
      expires_at: data.expires_at ?? null,
      data_access_expires_at: data.data_access_expires_at ?? null,
      scopes: Array.isArray(data.scopes) ? data.scopes : [],
      user_id: data.user_id || null,
    } : null,
    error: payload?.error || null,
  };
}

async function businessSystemUsers() {
  const c = cfg();
  const businessId = "962481732913622";
  const url = `https://graph.facebook.com/${c.version}/${businessId}/system_users?fields=id,name,role&access_token=${encodeURIComponent(c.appToken)}`;
  const res = await fetch(url);
  const text = await res.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  return { ok: res.ok, status: res.status, payload };
}

async function configureAppWebhook() {
  const c = cfg();
  const url = `https://graph.facebook.com/${c.version}/${c.appId}/subscriptions`;
  const form = new URLSearchParams({
    object: "whatsapp_business_account",
    callback_url: c.callback,
    verify_token: c.verifyToken,
    fields: "messages",
    include_values: "true",
    access_token: c.appToken,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  return { ok: res.ok, status: res.status, payload };
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
    const c = cfg();
    const incoming = String(req.headers.get("x-htpweb-meta-admin") || "");
    if (!c.adminSecret || !incoming || !safeEqual(incoming, c.adminSecret)) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    if (!c.token || !c.wabaId || !c.phoneId) {
      return json({ ok: false, error: "Meta secrets incomplete" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "status");
    if ((action === "app_subscriptions" || action === "configure_app_webhook" || action === "debug_access_token" || action === "business_system_users") && !c.appToken) {
      return json({ ok: false, error: "Meta app token missing" }, 500);
    }

    if (action === "status") return json({ ok: true, data: await status() });
    if (action === "subscribe_webhook") {
      return json({ ok: true, data: await subscribe() });
    }
    if (action === "create_templates") {
      return json({ ok: true, data: await createTemplates() });
    }
    if (action === "profile") return json({ ok: true, data: await setCommands() });
    if (action === "app_subscriptions") return json({ ok: true, data: await appSubscriptions() });
    if (action === "debug_access_token") return json({ ok: true, data: await debugAccessToken() });
    if (action === "business_system_users") return json({ ok: true, data: await businessSystemUsers() });
    if (action === "configure_app_webhook") return json({ ok: true, data: await configureAppWebhook() });

    return json({ ok: false, error: "invalid action" }, 400);
  } catch (error) {
    console.error(error);
    return json({
      ok: false,
      error: error instanceof Error ? error.message : "unknown",
    }, 500);
  }
});