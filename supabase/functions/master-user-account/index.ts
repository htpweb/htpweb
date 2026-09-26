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
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
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
function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}
async function parseJson(req: Request) {
  try { return await req.json(); }
  catch { throw new HttpError(400, "JSON inválido", "INVALID_JSON"); }
}

const handler = withSupabase({ auth: "user" }, async (req: Request, ctx: any) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Método no permitido", "METHOD_NOT_ALLOWED");

    const { data: isMaster, error: masterError } = await ctx.supabase.rpc("is_master");
    if (masterError || isMaster !== true) {
      throw new HttpError(403, "Operación exclusiva de MASTER", "MASTER_REQUIRED");
    }

    const body: any = await parseJson(req);
    const action = String(body?.action || "").toLowerCase();
    const userId = String(body?.user_id || "");
    const deliveryId = String(body?.delivery_id || "");
    const authorizationId = String(body?.authorization_id || "");

    if (!["disable", "enable", "delete"].includes(action)) {
      throw new HttpError(400, "Acción inválida", "INVALID_ACTION");
    }
    if (!validUuid(userId) || !validUuid(deliveryId) || !validUuid(authorizationId)) {
      throw new HttpError(400, "Datos de cuenta inválidos", "INVALID_ACCOUNT");
    }

    const { data: authorization, error: authorizationError } = await ctx.supabaseAdmin
      .from("delivery_access_authorizations")
      .select("id,delivery_id,email")
      .eq("id", authorizationId)
      .eq("delivery_id", deliveryId)
      .maybeSingle();
    if (authorizationError || !authorization) {
      throw new HttpError(404, "Autorización DELIVERY no disponible", "AUTHORIZATION_NOT_FOUND");
    }

    const { data: userResult, error: userError } = await ctx.supabaseAdmin.auth.admin.getUserById(userId);
    const targetUser = userResult?.user;
    if (userError || !targetUser) throw new HttpError(404, "La cuenta HTPWEB ya no existe", "USER_NOT_FOUND");

    if (normalizeEmail(targetUser.email) !== normalizeEmail(authorization.email)) {
      throw new HttpError(409, "La cuenta ya no coincide con esta autorización DELIVERY", "ACCOUNT_MISMATCH");
    }

    const { data: profile, error: profileError } = await ctx.supabaseAdmin
      .from("profiles").select("id,role_id,active").eq("id", userId).maybeSingle();
    if (profileError || !profile) {
      throw new HttpError(409, "La cuenta no tiene un perfil HTPWEB válido", "PROFILE_NOT_FOUND");
    }

    let roleCode = "";
    if (profile.role_id) {
      const { data: role, error: roleError } = await ctx.supabaseAdmin
        .from("roles").select("code").eq("id", profile.role_id).maybeSingle();
      if (roleError) throw new HttpError(500, "No se pudo validar el rol de la cuenta", "ROLE_LOOKUP_FAILED");
      roleCode = String(role?.code || "");
    }
    if (roleCode === "MASTER") {
      throw new HttpError(403, "Una cuenta MASTER no puede administrarse desde DELIVERY", "MASTER_TARGET_BLOCKED");
    }

    if (action === "disable") {
      const previousActive = profile.active !== false;
      const { error: profileDisableError } = await ctx.supabaseAdmin
        .from("profiles").update({ active: false, updated_at: new Date().toISOString() }).eq("id", userId);
      if (profileDisableError) throw new HttpError(500, "No se pudo desactivar el perfil HTPWEB", "PROFILE_DISABLE_FAILED");

      const { data: updated, error: banError } = await ctx.supabaseAdmin.auth.admin.updateUserById(
        userId,{ ban_duration: "876000h" }
      );
      if (banError) {
        await ctx.supabaseAdmin.from("profiles")
          .update({ active: previousActive, updated_at: new Date().toISOString() }).eq("id", userId);
        throw new HttpError(502, "Supabase Auth no pudo desactivar la cuenta", "AUTH_DISABLE_FAILED");
      }
      return jsonResponse({ok:true,action,user_id:userId,email:targetUser.email,disabled:true,banned_until:updated?.user?.banned_until||null});
    }

    if (action === "enable") {
      const { data: updated, error: unbanError } = await ctx.supabaseAdmin.auth.admin.updateUserById(
        userId,{ ban_duration: "none" }
      );
      if (unbanError) throw new HttpError(502, "Supabase Auth no pudo reactivar la cuenta", "AUTH_ENABLE_FAILED");

      const { error: profileEnableError } = await ctx.supabaseAdmin
        .from("profiles").update({ active: true, updated_at: new Date().toISOString() }).eq("id", userId);
      if (profileEnableError) {
        await ctx.supabaseAdmin.auth.admin.updateUserById(userId,{ ban_duration: "876000h" });
        throw new HttpError(500, "No se pudo reactivar el perfil HTPWEB", "PROFILE_ENABLE_FAILED");
      }
      return jsonResponse({ok:true,action,user_id:userId,email:targetUser.email,disabled:false,banned_until:updated?.user?.banned_until||null});
    }

    const { data: preparation, error: preparationError } = await ctx.supabase.rpc(
      "master_prepare_user_account_deletion",{ p_user_id: userId }
    );
    if (preparationError) {
      throw new HttpError(409,preparationError.message||"La cuenta no puede eliminarse","DELETE_PREPARATION_FAILED");
    }
    if (preparation?.ok !== true) {
      throw new HttpError(
        409,
        "La cuenta tiene historial protegido. Desactívala en lugar de eliminarla.",
        String(preparation?.reason || "HISTORY_PROTECTED"),
        preparation?.blockers || []
      );
    }

    const { error: deleteError } = await ctx.supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw new HttpError(
        409,
        "Supabase Auth no pudo eliminar la cuenta. Desactívala si necesitas bloquear el acceso.",
        "AUTH_DELETE_FAILED",
        { message: deleteError.message }
      );
    }
    return jsonResponse({ok:true,action,user_id:userId,email:targetUser.email,deleted:true});
  } catch (error) {
    console.error("master-user-account:", error instanceof HttpError ? error.code : error);
    const status = error instanceof HttpError ? error.status : 500;
    return jsonResponse({
      ok:false,
      code:error instanceof HttpError ? error.code : "UNKNOWN_ERROR",
      error:error instanceof Error ? error.message : "Error desconocido",
      details:error instanceof HttpError ? error.details : undefined
    },status);
  }
});

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok",{headers:corsHeaders});
  return handler(req);
});
