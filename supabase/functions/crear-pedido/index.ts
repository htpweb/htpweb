import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ORS_DIRECTIONS_DRIVING_URL } from "../_shared/ors.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const ORS_URL = ORS_DIRECTIONS_DRIVING_URL;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ORS_API_KEY = Deno.env.get("ORS_API_KEY");
if (!SUPABASE_URL) {
  throw new Error("No está configurado SUPABASE_URL");
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("No está configurado SUPABASE_SERVICE_ROLE_KEY");
}
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
/* ============================================================
   ERROR HTTP
   ============================================================ */ class HttpError extends Error {
  status;
  constructor(status, message){
    super(message);
    this.status = status;
  }
}
/* ============================================================
   RESPUESTA JSON
   ============================================================ */ function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
/* ============================================================
   UUID
   ============================================================ */ function isValidUuid(value) {
  if (typeof value !== "string") {
    return false;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
/* ============================================================
   COORDENADAS
   ============================================================ */ function validCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
/* ============================================================
   TEXTO OPCIONAL
   ============================================================ */ function optionalText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
/* ============================================================
   AUTENTICACIÓN OPCIONAL

   Comprar no requiere cuenta. Si llega una sesión válida,
   HTPWEB conserva la experiencia de cliente registrado.
   ============================================================ */ async function getOptionalAuthenticatedUser(req) {
  const authorization = req.headers.get("Authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) return null;

  const accessToken = authorization.slice("Bearer ".length).trim();
  if (!accessToken || accessToken.startsWith("sb_publishable_")) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return data.user;
}
/* ============================================================
   CUSTOMER REAL DEL USUARIO

   AUTH USER
       ↓
   customers.profile_id
       ↓
   customer_id real

   body.customer_id queda completamente ignorado.
   ============================================================ */ async function getCustomerForUser(userId) {
  const { data: customer, error } = await supabaseAdmin.from("customers").select(`
        id,
        profile_id,
        name,
        phone,
        email,
        active
      `).eq("profile_id", userId).eq("active", true).maybeSingle();
  if (error) {
    console.error("Error consultando customer:", error);
    throw new HttpError(500, "No se pudo validar el cliente");
  }
  if (!customer) {
    throw new HttpError(403, "El usuario autenticado no tiene un customer activo");
  }
  if (!isValidUuid(customer.id)) {
    throw new HttpError(500, "El customer asociado no es válido");
  }
  if (typeof customer.phone !== "string" || !customer.phone.trim()) {
    throw new HttpError(400, "El customer debe tener un teléfono válido antes de realizar pedidos");
  }
  return customer;
}

function normalizeGuestPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0\d{9}$/.test(digits)) digits = "593" + digits.slice(1);
  else if (/^9\d{8}$/.test(digits)) digits = "593" + digits;

  if (!/^\d{8,15}$/.test(digits)) {
    throw new HttpError(400, "Ingresa un teléfono válido");
  }
  return digits;
}

async function getOrCreateGuestCustomer(nameValue, phoneValue, emailValue) {
  const name = String(nameValue || "").trim();
  const phone = normalizeGuestPhone(phoneValue);
  const email = optionalText(emailValue)?.toLowerCase() || null;

  if (!name) throw new HttpError(400, "Ingresa tu nombre");
  if (name.length > 120) throw new HttpError(400, "El nombre es demasiado largo");
  if (email && email.length > 254) throw new HttpError(400, "El correo es demasiado largo");

  const { data: matches, error: lookupError } = await supabaseAdmin
    .from("customers")
    .select("id,profile_id,name,phone,email,active,updated_at")
    .is("profile_id", null)
    .eq("phone", phone)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (lookupError) {
    console.error("Error buscando customer invitado:", lookupError);
    throw new HttpError(500, "No se pudo preparar el cliente del pedido");
  }

  const existing = Array.isArray(matches) ? matches[0] : null;
  if (existing) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("customers")
      .update({
        name,
        email: email || existing.email || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", existing.id)
      .is("profile_id", null)
      .select("id,profile_id,name,phone,email,active")
      .single();

    if (updateError || !updated) {
      console.error("Error actualizando customer invitado:", updateError);
      throw new HttpError(500, "No se pudo actualizar el cliente del pedido");
    }
    return updated;
  }

  const now = new Date().toISOString();
  const { data: created, error: insertError } = await supabaseAdmin
    .from("customers")
    .insert({
      profile_id: null,
      name,
      phone,
      email,
      active: true,
      marketing_consent: false,
      created_at: now,
      updated_at: now
    })
    .select("id,profile_id,name,phone,email,active")
    .single();

  if (insertError || !created) {
    console.error("Error creando customer invitado:", insertError);
    throw new HttpError(500, "No se pudo preparar el cliente del pedido");
  }
  return created;
}
/* ============================================================
   CUSTOMER ↔ DELIVERY

   Si no existe aún la relación:
   - se crea automáticamente para este CLIENT.

   Si existe pero está deshabilitada:
   - NO se reactiva automáticamente.
   ============================================================ */ async function ensureCustomerDelivery(
  customerId,
  deliveryId,
  latitude,
  longitude
) {
  const { data: policy, error: policyError } = await supabaseAdmin.rpc(
    "evaluate_customer_order_policy",
    {
      p_customer_id: customerId,
      p_delivery_id: deliveryId,
      p_latitude: latitude,
      p_longitude: longitude,
      p_at: new Date().toISOString()
    }
  );

  if (policyError) {
    console.error("Error evaluando política de pedido:", policyError);
    throw new HttpError(500, "No se pudo validar la política operativa del delivery");
  }

  if (!policy?.allowed) {
    const messages = {
      PLAN_INACTIVE: "El servicio administrativo de este delivery no está vigente",
      PLAN_RECONFIGURATION_REQUIRED: "Este delivery está reconfigurando su plan y temporalmente no recibe pedidos",
      INVALID_LOCATION: "La ubicación de entrega no es válida",
      COVERAGE_NOT_AVAILABLE: "El plan de este delivery no tiene capacidad de zonas operativas",
      COVERAGE_NOT_CONFIGURED: "Este delivery todavía no ha configurado sus zonas operativas",
      OUTSIDE_COVERAGE: "La ubicación de entrega está fuera de las zonas operativas de este delivery",
      RESTRICTED_AREA: "Esta ubicación está restringida para este delivery en este horario",
      PRIVATE_NETWORK_REQUIRED: "Este delivery recibe pedidos solo de sus contactos y referidos en este horario",
      APPROVAL_REQUIRED: "Este delivery requiere que tu cuenta esté aprobada antes de realizar pedidos",
      CUSTOMER_BLOCKED: "Tu cuenta no está habilitada para realizar pedidos en este delivery",
      DELIVERY_INACTIVE: "El delivery está inactivo",
      CUSTOMER_INACTIVE: "Tu perfil de cliente no está activo"
    };
    throw new HttpError(403, messages[policy?.reason] || "El pedido no está permitido por la política actual del delivery");
  }

  if (policy.auto_create === true) {
    const relationshipSource = ["PUBLIC", "CONTACT"].includes(policy?.relationship_source)
      ? policy.relationship_source
      : "PUBLIC";
    const now = new Date().toISOString();
    const { error: insertError } = await supabaseAdmin
      .from("customer_deliveries")
      .upsert({
        customer_id: customerId,
        delivery_id: deliveryId,
        active: true,
        allow_orders: true,
        relationship_source: relationshipSource,
        created_at: now,
        updated_at: now
      }, {
        onConflict: "customer_id,delivery_id",
        ignoreDuplicates: true
      });

    if (insertError) {
      console.error("Error creando relación customer_deliveries:", insertError);
      throw new HttpError(500, "No se pudo vincular al cliente con el delivery");
    }
  }
}

/* ============================================================
   DISPONIBILIDAD REAL DE LOCALES

   - La hora la resuelve PostgreSQL, no el navegador.
   - Usa local_schedules.
   - Si un LOCAL todavía no tiene horarios configurados,
     se mantiene compatibilidad y se permite ordenar.
   - Si ya existen horarios, el día/hora actual debe estar abierto.
   ============================================================ */ async function ensureLocalsOpenForOrders(locals) {
  const localIds = locals.map((local)=>local.id);
  const { data, error } = await supabaseAdmin.rpc("check_locals_order_availability", {
    p_local_ids: localIds
  });

  if (error) {
    console.error("Error consultando disponibilidad de LOCAL:", error);
    throw new HttpError(500, "No se pudo validar si los locales están abiertos");
  }

  if (!Array.isArray(data) || data.length !== localIds.length) {
    console.error("Disponibilidad inesperada:", data);
    throw new HttpError(500, "La disponibilidad de los locales no es válida");
  }

  const byLocal = new Map(data.map((row)=>[
      row?.local_id,
      row
    ]));

  for (const local of locals){
    const availability = byLocal.get(local.id);

    if (!availability) {
      throw new HttpError(500, `No se pudo obtener la disponibilidad del local "${local.name}"`);
    }

    if (availability.is_open === true) {
      continue;
    }

    const opening = typeof availability.opening_time === "string" ? availability.opening_time : null;
    const closing = typeof availability.closing_time === "string" ? availability.closing_time : null;

    switch(availability.reason){
      case "CLOSED_TODAY":
        throw new HttpError(409, `El local "${local.name}" está cerrado hoy`);
      case "DAY_NOT_CONFIGURED":
        throw new HttpError(409, `El local "${local.name}" no recibe pedidos hoy`);
      case "BEFORE_OPENING":
        throw new HttpError(409, opening ? `El local "${local.name}" todavía está cerrado. Abre a las ${opening}` : `El local "${local.name}" todavía está cerrado`);
      case "AFTER_CLOSING":
        throw new HttpError(409, opening && closing ? `El local "${local.name}" ya cerró. Horario de hoy: ${opening}–${closing}` : `El local "${local.name}" ya cerró por hoy`);
      default:
        throw new HttpError(409, `El local "${local.name}" no está disponible para recibir pedidos en este momento`);
    }
  }
}
/* ============================================================
   DISTANCIA REAL MEDIANTE ORS
   ============================================================ */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function calculateRouteDistance(originLat, originLng, destinationLat, destinationLng) {
  if (!ORS_API_KEY) {
    throw new HttpError(500, "No está configurado ORS_API_KEY");
  }

  const payload = {
    coordinates: [
      [originLng, originLat],
      [destinationLng, destinationLat]
    ],
    instructions: false
  };

  let lastError = null;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 15000);

    try {
      const response = await fetch(ORS_URL, {
        method: "POST",
        headers: {
          Authorization: ORS_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        const message = data?.error?.message || data?.message || "No se pudo calcular la ruta";
        if (!retryable) {
          throw new HttpError(502, message);
        }
        lastError = new HttpError(502, message);
      } else {
        const distanceMeters = Number(data?.routes?.[0]?.summary?.distance);
        if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
          throw new HttpError(502, "OpenRouteService no devolvió una distancia válida");
        }
        return Number((distanceMeters / 1000).toFixed(2));
      }
    } catch (error) {
      if (error instanceof HttpError && error.status === 502 && !String(error.message || "").includes("No se pudo calcular la ruta")) {
        // Explicit non-retryable ORS validation errors keep their original message.
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        lastError = new HttpError(504, "OpenRouteService tardó demasiado en responder");
      } else if (!(error instanceof HttpError)) {
        // Transport errors such as HTTP/2 connection resets are transient.
        console.warn(`OpenRouteService intento ${attempt}/${maxAttempts} falló:`, error);
        lastError = new HttpError(502, "No se pudo conectar temporalmente con el servicio de rutas");
      } else {
        lastError = error;
      }
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < maxAttempts) {
      await wait(attempt === 1 ? 350 : 900);
    }
  }

  throw lastError || new HttpError(502, "No se pudo calcular la ruta por carretera");
}
/* ============================================================
   SELECCIONES DE VARIANTES EN PROMOCIONES COMBINABLES
   ============================================================ */
async function validatePromotionSelections(items) {
  const notes = [];

  for (const item of items) {
    const selection = item?.promotion_selection;
    if (selection === undefined || selection === null) continue;

    if (!Array.isArray(selection) || selection.length === 0) {
      throw new HttpError(400, "La selección de la promoción no es válida");
    }

    if (!isValidUuid(item?.promotion_id)) {
      throw new HttpError(400, "La selección promocional no tiene una promoción válida");
    }

    if (item?.promotion_item_id) {
      throw new HttpError(400, "La selección combinable no admite promotion_item_id");
    }

    const { data: promotion, error: promotionError } = await supabaseAdmin
      .from("local_promotions")
      .select("id,title,promotion_type,active")
      .eq("id", item.promotion_id)
      .maybeSingle();

    if (promotionError || !promotion) {
      throw new HttpError(400, "La promoción seleccionada ya no existe");
    }

    if (promotion.promotion_type !== "COMBO" || promotion.active !== true) {
      throw new HttpError(400, "La promoción no admite selección combinable");
    }

    const { data: components, error: componentError } = await supabaseAdmin
      .from("local_promotion_items")
      .select("id,product_id,variant_id,quantity")
      .eq("promotion_id", item.promotion_id);

    if (componentError || !Array.isArray(components)) {
      throw new HttpError(500, "No se pudo validar la configuración de la promoción");
    }

    if (
      components.length !== 1 ||
      components[0].variant_id !== null ||
      Number(components[0].quantity || 0) <= 1
    ) {
      throw new HttpError(400, "La promoción no tiene una configuración combinable válida");
    }

    const component = components[0];
    const required = Number(component.quantity);
    const normalizedSelection = [];
    const variantIds = [];
    let totalSelected = 0;

    for (const row of selection) {
      if (!isValidUuid(row?.variant_id)) {
        throw new HttpError(400, "Existe una variante inválida en la promoción");
      }

      const quantity = Number(row?.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > required) {
        throw new HttpError(400, "La cantidad seleccionada en la promoción no es válida");
      }

      if (variantIds.includes(row.variant_id)) {
        throw new HttpError(400, "La promoción contiene variantes repetidas");
      }

      variantIds.push(row.variant_id);
      totalSelected += quantity;
    }

    if (totalSelected !== required) {
      throw new HttpError(
        400,
        "Debes seleccionar exactamente " + required + " unidades para la promoción"
      );
    }

    const { data: variants, error: variantsError } = await supabaseAdmin
      .from("product_variants")
      .select("id,product_id,name,active")
      .in("id", variantIds);

    if (
      variantsError ||
      !Array.isArray(variants) ||
      variants.length !== variantIds.length
    ) {
      throw new HttpError(400, "No se pudieron validar las variantes de la promoción");
    }

    const variantMap = new Map(variants.map(variant => [variant.id, variant]));

    for (const row of selection) {
      const variant = variantMap.get(row.variant_id);

      if (
        !variant ||
        variant.active !== true ||
        variant.product_id !== component.product_id
      ) {
        throw new HttpError(400, "Una variante seleccionada ya no está disponible");
      }

      normalizedSelection.push({
        product_id: component.product_id,
        variant_id: variant.id,
        variant_name: variant.name,
        quantity: Number(row.quantity)
      });
    }

    item.promotion_selection = normalizedSelection;

    const composition = normalizedSelection
      .map(row => row.quantity + "× " + row.variant_name)
      .join(", ");

    const bundles = Number(item?.quantity || 1);
    notes.push(
      "PROMO " + promotion.title + ": " +
      composition +
      (bundles > 1 ? " · " + bundles + " combos" : "")
    );
  }

  return notes;
}

/* ============================================================
   EDGE FUNCTION
   ============================================================ */ Deno.serve(async (req)=>{
  /* ========================================================
       CORS
       ======================================================== */ if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    /* ======================================================
         1. MÉTODO
         ====================================================== */ if (req.method !== "POST") {
      return jsonResponse({
        ok: false,
        error: "Método no permitido"
      }, 405);
    }
    /* ======================================================
         2. LEER BODY
         ====================================================== */ let body;
    try {
      body = await req.json();
    } catch  {
      throw new HttpError(400, "El cuerpo de la solicitud no es JSON válido");
    }

    /* ======================================================
         3. SESIÓN OPCIONAL

         - Con sesión: pedido asociado a la cuenta.
         - Sin sesión: checkout invitado.
         ====================================================== */ const user = await getOptionalAuthenticatedUser(req);
    let customer = null;
    let customerId = null;
    /* ======================================================
         5. DELIVERY
         ====================================================== */ if (!isValidUuid(body.delivery_id)) {
      throw new HttpError(400, "delivery_id inválido");
    }
    /* ======================================================
         6. DIRECCIÓN / COORDENADAS DEL CHECKOUT

         customer_id enviado por navegador:
         IGNORADO.

         customer_name/customer_phone:
         NO determinan identidad.
         Usamos los datos del CUSTOMER real.
         ====================================================== */ if (typeof body.delivery_address !== "string" || !body.delivery_address.trim()) {
      throw new HttpError(400, "La dirección de entrega es obligatoria");
    }
    const customerLat = Number(body.latitude);
    const customerLng = Number(body.longitude);
    if (!validCoordinate(customerLat, customerLng)) {
      throw new HttpError(400, "Las coordenadas del cliente son inválidas");
    }
    /* ======================================================
         7. LOCALES E ITEMS
         ====================================================== */ if (!Array.isArray(body.locals) || body.locals.length === 0) {
      throw new HttpError(400, "El pedido debe contener al menos un local");
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new HttpError(400, "El pedido debe contener al menos un producto o promoción");
    }
    /* ======================================================
         8. EXTRAER ÚNICAMENTE LOCAL_ID

         Cualquier distance_km recibido del navegador
         se ignora.
         ====================================================== */ const localIds = body.locals.map((local)=>local?.local_id);
    if (localIds.some((id)=>!isValidUuid(id))) {
      throw new HttpError(400, "Existe un local_id inválido");
    }
    if (new Set(localIds).size !== localIds.length) {
      throw new HttpError(400, "El pedido contiene locales duplicados");
    }
    /* ======================================================
         9. VALIDAR DELIVERY ACTIVO
         ====================================================== */ const { data: delivery, error: deliveryError } = await supabaseAdmin.from("deliveries").select(`
            id,
            active
          `).eq("id", body.delivery_id).maybeSingle();
    if (deliveryError) {
      console.error("Error consultando delivery:", deliveryError);
      throw new HttpError(500, "No se pudo validar el delivery");
    }
    if (!delivery) {
      throw new HttpError(404, "El delivery no existe");
    }
    if (delivery.active !== true) {
      throw new HttpError(403, "El delivery está inactivo");
    }
    /* ======================================================
         10. RESOLVER CUSTOMER Y POLÍTICA DEL DELIVERY

         La cuenta es opcional. Un invitado obtiene un customer
         interno sin profile_id para conservar integridad.
         ====================================================== */
    customer = user
      ? await getCustomerForUser(user.id)
      : await getOrCreateGuestCustomer(body.customer_name, body.customer_phone, body.customer_email);
    customerId = customer.id;

    await ensureCustomerDelivery(customerId, body.delivery_id, customerLat, customerLng);
    /* ======================================================
         11. OBTENER LOCALES REALES
         ====================================================== */ const { data: locals, error: localsError } = await supabaseAdmin.from("locals").select(`
            id,
            name,
            latitude,
            longitude,
            active
          `).in("id", localIds);
    if (localsError) {
      console.error("Error consultando locales:", localsError);
      throw new HttpError(500, "No se pudieron consultar los locales");
    }
    if (!locals || locals.length !== localIds.length) {
      throw new HttpError(404, "Uno o más locales no existen");
    }
    /* ======================================================
         12. VALIDAR LOCALES Y COORDENADAS
         ====================================================== */ for (const local of locals){
      if (local.active !== true) {
        throw new HttpError(403, `El local "${local.name}" está inactivo`);
      }
      const localLat = Number(local.latitude);
      const localLng = Number(local.longitude);
      if (!validCoordinate(localLat, localLng)) {
        throw new HttpError(400, `El local "${local.name}" no tiene coordenadas válidas`);
      }
    }
    /* ======================================================
         13. VALIDAR LOCAL ↔ DELIVERY ACTIVO
         ====================================================== */ const { data: assignments, error: assignmentsError } = await supabaseAdmin.from("local_deliveries").select(`
            local_id,
            delivery_id,
            active
          `).eq("delivery_id", body.delivery_id).eq("active", true).in("local_id", localIds);
    if (assignmentsError) {
      console.error("Error consultando asignaciones:", assignmentsError);
      throw new HttpError(500, "No se pudieron validar los locales del delivery");
    }
    const assignedLocalIds = new Set((assignments || []).map((row)=>row.local_id));
    for (const localId of localIds){
      if (!assignedLocalIds.has(localId)) {
        throw new HttpError(403, `El local ${localId} no tiene una relación activa con el delivery`);
      }
    }
    /* ======================================================
         14. VALIDAR ITEMS BÁSICOS

         PRECIOS:
         Nunca llegan con autoridad desde navegador.
         SQL vuelve a validar productos, promociones y precios.
         ====================================================== */ for (const item of body.items){
      if (!isValidUuid(item?.local_id)) {
        throw new HttpError(400, "Existe un item con local_id inválido");
      }

      const hasPromotion = item?.promotion_id !== undefined &&
        item?.promotion_id !== null &&
        item?.promotion_id !== "";

      if (hasPromotion) {
        if (!isValidUuid(item.promotion_id)) {
          throw new HttpError(400, "Existe un promotion_id inválido");
        }
        if (
          item?.promotion_item_id !== undefined &&
          item?.promotion_item_id !== null &&
          item?.promotion_item_id !== "" &&
          !isValidUuid(item.promotion_item_id)
        ) {
          throw new HttpError(400, "Existe un promotion_item_id inválido");
        }
        if (item?.product_id) {
          throw new HttpError(400, "Un item promocional no debe incluir product_id");
        }
      } else {
        if (!isValidUuid(item?.product_id)) {
          throw new HttpError(400, "Existe un item con product_id inválido");
        }
        if (
          item?.variant_id !== undefined &&
          item?.variant_id !== null &&
          item?.variant_id !== "" &&
          !isValidUuid(item.variant_id)
        ) {
          throw new HttpError(400, "Existe un variant_id inválido");
        }
      }

      const quantity = Number(item?.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 999) {
        throw new HttpError(400, "La cantidad de cada producto o promoción debe estar entre 1 y 999");
      }
      if (!localIds.includes(item.local_id)) {
        throw new HttpError(400, "Existe un item asociado a un local que no forma parte del pedido");
      }
    }
    const promotionSelectionNotes = await validatePromotionSelections(body.items);

    /* ======================================================
         15. VALIDAR DISPONIBILIDAD REAL DE LOS LOCALES

         Esta validación ocurre antes de llamar a ORS:
         si un LOCAL está cerrado, no consumimos una consulta
         de rutas innecesaria ni intentamos crear el pedido.
         ====================================================== */ await ensureLocalsOpenForOrders(locals);
    /* ======================================================
         16. CALCULAR DISTANCIA REAL CON ORS

         LOCAL
           ↓
         ORS
           ↓
         coordenadas de entrega

         body.locals.distance_km:
         NO SE UTILIZA.
         ====================================================== */ const localsWithDistance = await Promise.all(locals.map(async (local)=>{
      const distanceKm = await calculateRouteDistance(Number(local.latitude), Number(local.longitude), customerLat, customerLng);
      return {
        local_id: local.id,
        distance_km: distanceKm
      };
    }));
    /* ======================================================
         17. TRANSACCIÓN SQL

         SEGURIDAD:

         p_customer_id:
         customerId resuelto por el servidor desde una cuenta
         autenticada o desde un customer invitado interno.

         NO:
         body.customer_id.

         p_customer_name / phone:
         datos del CUSTOMER real.

         distance_km:
         únicamente ORS.
         ====================================================== */ const { data: transactionData, error: transactionError } = await supabaseAdmin.rpc("create_order_transaction", {
      p_delivery_id: body.delivery_id,
      p_customer_id: customerId,
      p_customer_name: optionalText(customer.name),
      p_customer_phone: customer.phone.trim(),
      p_delivery_address: body.delivery_address.trim(),
      p_latitude: customerLat,
      p_longitude: customerLng,
      p_address_reference: optionalText(body.address_reference),
      p_requires_invoice: Boolean(body.requires_invoice),
      p_document_type: optionalText(body.document_type),
      p_document_number: optionalText(body.document_number),
      p_invoice_email: optionalText(body.invoice_email),
      p_notes: [optionalText(body.notes), ...promotionSelectionNotes]
        .filter(Boolean)
        .join("\n") || null,
      p_locals: localsWithDistance,
      p_items: body.items.map((item)=>{
        const hasPromotion = item?.promotion_id !== undefined &&
          item?.promotion_id !== null &&
          item?.promotion_id !== "";

        if (hasPromotion) {
          return {
            local_id: item.local_id,
            promotion_id: item.promotion_id,
            promotion_item_id: item.promotion_item_id ?? null,
            promotion_selection: item.promotion_selection ?? null,
            quantity: Number(item.quantity)
          };
        }

        return {
          local_id: item.local_id,
          product_id: item.product_id,
          variant_id: item.variant_id ?? null,
          quantity: Number(item.quantity)
        };
      })
    });
    if (transactionError) {
      console.error("Error create_order_transaction:", transactionError);
      throw new HttpError(400, transactionError.message || "No se pudo crear el pedido");
    }
    /* ======================================================
         18. RESULTADO
         ====================================================== */ const order = Array.isArray(transactionData) ? transactionData[0] : transactionData;
    if (!order?.order_id) {
      throw new HttpError(500, "La transacción no devolvió el pedido creado");
    }
    let orderDetail = null;
    try {
      const detailResult = await supabaseAdmin
        .from("orders")
        .select(`
          id,delivery_id,status,created_at,subtotal,delivery_fee,total,
          customer_name,customer_phone,delivery_address,latitude,longitude,address_reference,notes,
          order_items(local_id,product_name,variant_name,unit_price,quantity,subtotal,promotion_id,promotion_title),
          order_locals(local_id,status,subtotal,delivery_fee,locals(name))
        `)
        .eq("id", order.order_id)
        .single();

      if (detailResult.error) {
        console.warn("Pedido creado, pero no se pudo preparar order_detail:", detailResult.error);
      } else {
        orderDetail = detailResult.data;
      }
    } catch (detailError) {
      console.warn("Pedido creado, pero falló order_detail:", detailError);
    }

    return jsonResponse({
      ok: true,
      customer_mode: user ? "ACCOUNT" : "GUEST",
      order: {
        id: order.order_id,
        subtotal: Number(order.subtotal),
        delivery_fee: Number(order.delivery_fee),
        total: Number(order.total)
      },
      order_detail: orderDetail,
      distances: localsWithDistance
    });
  } catch (error) {
    console.error("crear-pedido:", error);
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Error desconocido"
    }, status);
  }
});
