import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car";
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
   AUTENTICACIÓN

   IMPORTANTE:
   - Nunca confiamos en body.customer_id.
   - La identidad sale del JWT real.
   ============================================================ */ async function getAuthenticatedUser(req) {
  const authorization = req.headers.get("Authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new HttpError(401, "Se requiere iniciar sesión para crear el pedido");
  }
  const accessToken = authorization.slice("Bearer ".length).trim();
  if (!accessToken) {
    throw new HttpError(401, "Token de autenticación inválido");
  }
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) {
    console.error("Error validando JWT:", error);
    throw new HttpError(401, "La sesión no es válida o expiró");
  }
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
/* ============================================================
   CUSTOMER ↔ DELIVERY

   Si no existe aún la relación:
   - se crea automáticamente para este CLIENT.

   Si existe pero está deshabilitada:
   - NO se reactiva automáticamente.
   ============================================================ */ async function ensureCustomerDelivery(customerId, deliveryId) {
  const { data: existing, error: existingError } = await supabaseAdmin.from("customer_deliveries").select(`
        customer_id,
        delivery_id,
        active,
        allow_orders
      `).eq("customer_id", customerId).eq("delivery_id", deliveryId).maybeSingle();
  if (existingError) {
    console.error("Error consultando customer_deliveries:", existingError);
    throw new HttpError(500, "No se pudo validar la relación del cliente con el delivery");
  }
  if (existing) {
    if (existing.active !== true || existing.allow_orders !== true) {
      throw new HttpError(403, "El cliente no está habilitado para realizar pedidos en este delivery");
    }
    return;
  }
  const now = new Date().toISOString();
  const { error: insertError } = await supabaseAdmin.from("customer_deliveries").insert({
    customer_id: customerId,
    delivery_id: deliveryId,
    active: true,
    allow_orders: true,
    created_at: now,
    updated_at: now
  });
  if (insertError) {
    console.error("Error creando customer_deliveries:", insertError);
    throw new HttpError(500, "No se pudo habilitar al cliente para este delivery");
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
   ============================================================ */ async function calculateRouteDistance(originLat, originLng, destinationLat, destinationLng) {
  if (!ORS_API_KEY) {
    throw new HttpError(500, "No está configurado ORS_API_KEY");
  }
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), 15000);
  try {
    const response = await fetch(ORS_URL, {
      method: "POST",
      headers: {
        Authorization: ORS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        coordinates: [
          [
            originLng,
            originLat
          ],
          [
            destinationLng,
            destinationLat
          ]
        ],
        instructions: false
      }),
      signal: controller.signal
    });
    let data = null;
    try {
      data = await response.json();
    } catch  {
      data = null;
    }
    if (!response.ok) {
      console.error("OpenRouteService error:", data);
      throw new HttpError(502, data?.error?.message || data?.message || "No se pudo calcular la ruta");
    }
    const distanceMeters = Number(data?.routes?.[0]?.summary?.distance);
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
      throw new HttpError(502, "OpenRouteService no devolvió una distancia válida");
    }
    return Number((distanceMeters / 1000).toFixed(2));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new HttpError(504, "OpenRouteService tardó demasiado en responder");
    }
    throw error;
  } finally{
    clearTimeout(timeout);
  }
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
         2. AUTENTICAR USUARIO

         Primero autenticamos.
         Después leemos cualquier dato comercial.
         ====================================================== */ const user = await getAuthenticatedUser(req);
    /* ======================================================
         3. RESOLVER CUSTOMER REAL

         NO usamos body.customer_id.
         ====================================================== */ const customer = await getCustomerForUser(user.id);
    const customerId = customer.id;
    /* ======================================================
         4. LEER BODY
         ====================================================== */ let body;
    try {
      body = await req.json();
    } catch  {
      throw new HttpError(400, "El cuerpo de la solicitud no es JSON válido");
    }
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
      throw new HttpError(400, "El pedido debe contener al menos un producto");
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
         10. CUSTOMER ↔ DELIVERY

         El CUSTOMER fue obtenido del JWT.
         Nunca del body.
         ====================================================== */ await ensureCustomerDelivery(customerId, body.delivery_id);
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
         SQL los consulta de nuevo.
         ====================================================== */ for (const item of body.items){
      if (!isValidUuid(item?.local_id)) {
        throw new HttpError(400, "Existe un item con local_id inválido");
      }
      if (!isValidUuid(item?.product_id)) {
        throw new HttpError(400, "Existe un item con product_id inválido");
      }
      if (item?.variant_id !== undefined && item?.variant_id !== null && item?.variant_id !== "" && !isValidUuid(item.variant_id)) {
        throw new HttpError(400, "Existe un variant_id inválido");
      }
      const quantity = Number(item?.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new HttpError(400, "La cantidad de cada producto debe ser un entero mayor a 0");
      }
      if (!localIds.includes(item.local_id)) {
        throw new HttpError(400, "Existe un producto asociado a un local que no forma parte del pedido");
      }
    }
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
         customerId derivado del JWT.

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
      p_notes: optionalText(body.notes),
      p_locals: localsWithDistance,
      p_items: body.items.map((item)=>({
          local_id: item.local_id,
          product_id: item.product_id,
          variant_id: item.variant_id ?? null,
          quantity: Number(item.quantity)
        }))
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
    return jsonResponse({
      ok: true,
      order: {
        id: order.order_id,
        subtotal: Number(order.subtotal),
        delivery_fee: Number(order.delivery_fee),
        total: Number(order.total)
      },
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
