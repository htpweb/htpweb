import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() => new Response(JSON.stringify({
  ok: true,
  disabled: true,
  mode: "internal_notifications",
  message: "HTPWEB usa notificaciones internas para vencimientos de planes."
}), {
  status: 200,
  headers: { "Content-Type": "application/json" }
}));
