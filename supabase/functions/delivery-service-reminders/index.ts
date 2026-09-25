import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const REMINDER_EMAIL_FROM = Deno.env.get("REMINDER_EMAIL_FROM") || "";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER") || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Faltan variables internas de Supabase");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

type NotificationRow = {
  id: string;
  delivery_id: string;
  channel: "EMAIL" | "SMS";
  recipient: string;
  representative_name: string | null;
  service_end_on: string;
  attempts: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function formatDate(date: string) {
  const [y, m, d] = String(date || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : date;
}

function normalizePhone(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return "+" + raw.slice(1).replace(/\D/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("593")) return "+" + digits;
  if (digits.length === 10 && digits.startsWith("0")) return "+593" + digits.slice(1);
  return digits ? "+" + digits : "";
}

async function mark(
  id: string,
  status: "PROCESSING" | "RETRY" | "SENT" | "SKIPPED",
  values: Record<string, unknown> = {}
) {
  const { error } = await supabaseAdmin
    .from("delivery_service_notifications")
    .update({ status, updated_at: new Date().toISOString(), ...values })
    .eq("id", id);

  if (error) throw error;
}

async function sendEmail(to: string, deliveryName: string, endOn: string) {
  if (!RESEND_API_KEY || !REMINDER_EMAIL_FROM) {
    throw new Error("Proveedor de correo no configurado: faltan RESEND_API_KEY/REMINDER_EMAIL_FROM");
  }

  const date = formatDate(endOn);
  const subject = `HTPWEB: el servicio de ${deliveryName} vence en 5 días`;
  const text = `El servicio HTPWEB de ${deliveryName} vence el ${date}. Renueva antes de esa fecha para evitar el bloqueo del acceso administrativo.`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: REMINDER_EMAIL_FROM,
      to: [to],
      subject,
      text,
      html: `<p>El servicio HTPWEB de <strong>${deliveryName}</strong> vence el <strong>${date}</strong>.</p><p>Renueva antes de esa fecha para evitar el bloqueo del acceso administrativo.</p>`
    })
  });

  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${await response.text()}`);
  }
}

async function sendSms(to: string, deliveryName: string, endOn: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    throw new Error("Proveedor SMS no configurado: faltan credenciales de Twilio");
  }

  const normalized = normalizePhone(to);
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("Número celular inválido para SMS");
  }

  const body = new URLSearchParams({
    To: normalized,
    From: TWILIO_FROM_NUMBER,
    Body: `HTPWEB: el servicio de ${deliveryName} vence el ${formatDate(endOn)}. Renueva antes de esa fecha para evitar el bloqueo del panel.`
  });

  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    }
  );

  if (!response.ok) {
    throw new Error(`Twilio ${response.status}: ${await response.text()}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST requerido" }, 405);

  const secret = req.headers.get("x-htpweb-cron-secret") || "";
  if (!secret) return json({ error: "No autorizado" }, 401);

  const verify = await supabaseAdmin.rpc("verify_delivery_reminder_cron_secret", {
    p_secret: secret
  });

  if (verify.error || verify.data !== true) {
    console.error("Cron secret inválido", verify.error);
    return json({ error: "No autorizado" }, 401);
  }

  const { data: rows, error } = await supabaseAdmin
    .from("delivery_service_notifications")
    .select("id,delivery_id,channel,recipient,representative_name,service_end_on,attempts")
    .in("status", ["PENDING", "RETRY"])
    .lte("scheduled_for", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("No se pudo leer la cola", error);
    return json({ error: "No se pudo leer la cola" }, 500);
  }

  const notifications = (rows || []) as NotificationRow[];
  const providers = {
    email: Boolean(RESEND_API_KEY && REMINDER_EMAIL_FROM),
    sms: Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER)
  };

  if (!notifications.length) {
    return json({ processed: 0, sent: 0, retry: 0, skipped: 0, providers });
  }

  const deliveryIds = [...new Set(notifications.map(item => item.delivery_id))];
  const deliveriesResult = await supabaseAdmin
    .from("deliveries")
    .select("id,name")
    .in("id", deliveryIds);

  if (deliveriesResult.error) {
    console.error("No se pudieron cargar los DELIVERY", deliveriesResult.error);
    return json({ error: "No se pudieron cargar los DELIVERY" }, 500);
  }

  const names = new Map((deliveriesResult.data || []).map(item => [item.id, item.name]));
  let sent = 0;
  let retry = 0;
  let skipped = 0;

  for (const item of notifications) {
    const attempts = Number(item.attempts || 0) + 1;
    try {
      await mark(item.id, "PROCESSING", { attempts, last_error: null });

      const deliveryName = names.get(item.delivery_id);
      if (!deliveryName) {
        await mark(item.id, "SKIPPED", { last_error: "DELIVERY inexistente" });
        skipped++;
        continue;
      }

      if (item.channel === "EMAIL") {
        await sendEmail(item.recipient, deliveryName, item.service_end_on);
      } else if (item.channel === "SMS") {
        await sendSms(item.recipient, deliveryName, item.service_end_on);
      } else {
        await mark(item.id, "SKIPPED", { last_error: "Canal no soportado" });
        skipped++;
        continue;
      }

      await mark(item.id, "SENT", {
        sent_at: new Date().toISOString(),
        last_error: null
      });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Error enviando recordatorio", { id: item.id, message });
      await mark(item.id, "RETRY", {
        attempts,
        last_error: message.slice(0, 1800)
      });
      retry++;
    }
  }

  return json({
    processed: notifications.length,
    sent,
    retry,
    skipped,
    providers
  });
});
