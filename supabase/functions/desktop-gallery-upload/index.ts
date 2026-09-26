import { createClient } from "npm:@supabase/supabase-js@2";

const KEY = "htpwebDesktopMedia_20260924_Q7f3Kp9N2mX8Vb4R";
const URL = Deno.env.get("SUPABASE_URL")!;

function getSecret(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) throw new Error("Supabase secret key is unavailable");
  const parsed = JSON.parse(raw);
  const key = parsed.default || Object.values(parsed)[0];
  if (!key || typeof key !== "string") throw new Error("Supabase secret key is invalid");
  return key;
}

Deno.serve(async (req: Request) => {
  try {
    if ((req.headers.get("x-htp-upload-key") || "") !== KEY) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const localId = (req.headers.get("x-local-id") || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(localId)) {
      return Response.json({ error: "invalid_local_id" }, { status: 400 });
    }

    const admin = createClient(URL, getSecret());

    if (req.method === "GET") {
      const { data, error } = await admin
        .from("local_gallery_images")
        .select("id,image_url,storage_path,display_order")
        .eq("local_id", localId)
        .eq("active", true)
        .order("display_order")
        .order("created_at");
      if (error) throw error;
      return Response.json({ ok: true, local_id: localId, gallery: data || [] });
    }

    if (req.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }

    const contentType = (req.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!["image/jpeg","image/png","image/webp","image/gif"].includes(contentType)) {
      return Response.json({ error: "unsupported_mime" }, { status: 400 });
    }

    const data = new Uint8Array(await req.arrayBuffer());
    if (!data.length || data.length > 5 * 1024 * 1024) {
      return Response.json({ error: "invalid_file_size", bytes: data.length }, { status: 400 });
    }

    const { data: local, error: localError } = await admin.from("locals").select("id").eq("id", localId).maybeSingle();
    if (localError || !local) return Response.json({ error: "local_not_found" }, { status: 404 });

    const imageId = crypto.randomUUID();
    const storagePath = `local/${localId}/gallery/${imageId}`;

    const { error: uploadError } = await admin.storage.from("htpweb-media").upload(storagePath, data, {
      contentType,
      upsert: false,
      cacheControl: "3600",
    });
    if (uploadError) throw uploadError;

    const { data: pub } = admin.storage.from("htpweb-media").getPublicUrl(storagePath);
    const imageUrl = pub.publicUrl + "?v=" + Date.now();

    const { error: insertError } = await admin.from("local_gallery_images").insert({
      id: imageId,
      local_id: localId,
      image_url: imageUrl,
      storage_path: storagePath,
      display_order: 0,
      active: true,
      created_by: null,
    });

    if (insertError) {
      await admin.storage.from("htpweb-media").remove([storagePath]);
      throw insertError;
    }

    return Response.json({ ok: true, id: imageId, local_id: localId, image_url: imageUrl, storage_path: storagePath, bytes: data.length });
  } catch (e) {
    return Response.json({ error: "internal_error", message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});