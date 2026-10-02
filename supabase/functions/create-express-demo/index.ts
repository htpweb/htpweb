import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function cleanWhatsapp(value: unknown) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function validMoney(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 9999 ? n : null;
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}

function normalizeFeeConfig(mode: string, raw: any) {
  if (mode === "SIMPLE") {
    const day = validMoney(raw?.day_fee);
    const night = validMoney(raw?.night_fee);
    if (day === null || night === null) throw new Error("Ingresa tarifa de día y noche.");
    return { day_fee: day, night_fee: night };
  }

  if (mode === "ADVANCED_DISTANCE") {
    const rows = Array.isArray(raw?.bands) ? raw.bands : [];
    if (!rows.length || rows.length > 10) throw new Error("Configura entre 1 y 10 rangos por distancia.");
    let previous = 0;
    const bands = rows.map((row: any, index: number) => {
      const max = Number(row?.max_km);
      const day = validMoney(row?.day_fee);
      const night = validMoney(row?.night_fee);
      if (!Number.isFinite(max) || max <= previous || max > 200 || day === null || night === null) {
        throw new Error("Revisa los rangos y valores de distancia.");
      }
      previous = max;
      return { max_km: max, day_fee: day, night_fee: night, order: index + 1 };
    });
    return { bands };
  }

  if (mode === "ADVANCED_ZONES") {
    const sameDay = validMoney(raw?.same_zone_day_fee);
    const sameNight = validMoney(raw?.same_zone_night_fee);
    const otherDay = validMoney(raw?.other_zone_day_fee);
    const otherNight = validMoney(raw?.other_zone_night_fee);
    if ([sameDay,sameNight,otherDay,otherNight].some(v => v === null)) {
      throw new Error("Completa las tarifas por zonas.");
    }
    return {
      same_zone_day_fee: sameDay,
      same_zone_night_fee: sameNight,
      other_zone_day_fee: otherDay,
      other_zone_night_fee: otherNight,
    };
  }

  throw new Error("Modalidad de tarifa inválida.");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return json({ error: "Servicio no configurado." }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Solicitud inválida." }, 400); }

  const slotKey = String(body?.slot_key || "").trim().toLowerCase();
  const name = String(body?.name || "").trim().slice(0, 80);
  const whatsapp = cleanWhatsapp(body?.whatsapp);
  const feeMode = String(body?.fee_mode || "").trim().toUpperCase();
  if (!/^express[1-9][0-9]*$/.test(slotKey)) return json({ error: "Link Express inválido." }, 400);
  if (name.length < 2) return json({ error: "Escribe el nombre del DELIVERY." }, 400);
  if (whatsapp.length < 9) return json({ error: "Ingresa un WhatsApp válido." }, 400);

  let feeConfig: any;
  try { feeConfig = normalizeFeeConfig(feeMode, body?.fee_config || {}); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Tarifa inválida." }, 400); }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: slot, error: slotError } = await admin
    .from("express_demo_slots")
    .select("slot_key,active,demo_id")
    .eq("slot_key", slotKey)
    .maybeSingle();

  if (slotError || !slot || slot.active !== true) return json({ error: "Este link Express no está disponible." }, 404);
  if (slot.demo_id) return json({ error: "Este link Express ya fue utilizado. Solicita uno nuevo a HTPWEB." }, 409);

  const { data: existing } = await admin
    .from("express_demos")
    .select("id,public_code,name,logo_url,expires_at")
    .eq("whatsapp", whatsapp)
    .eq("active", true)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await admin.from("express_demo_slots").update({ demo_id: existing.id, used_at: new Date().toISOString() }).eq("slot_key", slotKey).is("demo_id", null);
    const url = "https://htpweb.github.io/htpweb/express/pedido.html?demo=" + encodeURIComponent(existing.public_code);
    return json({ ...existing, url, reused: true });
  }

  let code = makeCode();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: collision } = await admin.from("express_demos").select("id").eq("public_code", code).maybeSingle();
    if (!collision) break;
    code = makeCode();
  }

  const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
  const { data: created, error } = await admin
    .from("express_demos")
    .insert({
      public_code: code,
      name,
      whatsapp,
      fee_mode: feeMode,
      fee_config: feeConfig,
      expires_at: expiresAt,
    })
    .select("id,public_code,name,expires_at")
    .single();

  if (error || !created) return json({ error: "No se pudo crear la demo." }, 500);

  let logoUrl: string | null = null;
  const logoDataUrl = String(body?.logo_data_url || "");
  const match = logoDataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (match && match[2].length < 1_400_000) {
    const mime = match[1];
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
    const path = "express/" + created.id + "/logo." + ext;
    const upload = await admin.storage.from("htpweb-media").upload(path, bytes, {
      contentType: mime, upsert: true, cacheControl: "3600"
    });
    if (!upload.error) {
      logoUrl = admin.storage.from("htpweb-media").getPublicUrl(path).data.publicUrl;
      await admin.from("express_demos").update({ logo_url: logoUrl }).eq("id", created.id);
    }
  }

  const { data: claimed, error: claimError } = await admin
    .from("express_demo_slots")
    .update({ demo_id: created.id, used_at: new Date().toISOString() })
    .eq("slot_key", slotKey)
    .is("demo_id", null)
    .select("slot_key")
    .maybeSingle();

  if (claimError || !claimed) {
    await admin.from("express_demos").delete().eq("id", created.id);
    return json({ error: "Este link Express acaba de ser utilizado. Solicita uno nuevo a HTPWEB." }, 409);
  }

  const url = "https://htpweb.github.io/htpweb/express/pedido.html?demo=" + encodeURIComponent(created.public_code);
  return json({
    public_code: created.public_code,
    name: created.name,
    expires_at: created.expires_at,
    logo_url: logoUrl,
    url,
    reused: false
  });
});
