import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const SUPABASE_URL=Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY)throw new Error("Faltan variables Supabase");

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
}
function validUuid(value:unknown){
  return typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
async function sha256Hex(value:string){
  const bytes=new TextEncoder().encode(value);
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
const mimeExtensions:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({ok:false,error:"Método no permitido"},405);

  try{
    const form=await req.formData();
    const token=String(form.get("token")||"").trim();
    const orderId=String(form.get("order_id")||"");
    const kind=String(form.get("kind")||"").toUpperCase();
    const file=form.get("file");

    if(token.length<20)throw new Error("Enlace de repartidor inválido");
    if(!validUuid(orderId))throw new Error("Pedido inválido");
    if(!["PHOTO","SIGNATURE"].includes(kind))throw new Error("Tipo de evidencia inválido");
    if(!(file instanceof File))throw new Error("Archivo requerido");

    const extension=mimeExtensions[file.type];
    if(!extension)throw new Error("Formato no permitido. Usa JPG, PNG o WEBP.");
    const maxBytes=kind==="SIGNATURE"?2*1024*1024:5*1024*1024;
    if(file.size<=0||file.size>maxBytes)throw new Error(kind==="SIGNATURE"?"La firma supera 2 MB.":"La foto supera 5 MB.");

    const tokenHash=await sha256Hex(token);
    const admin=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:context,error:contextError}=await admin.rpc("quick_driver_proof_upload_context",{
      p_token_hash:tokenHash,p_order_id:orderId,p_kind:kind,
    });
    if(contextError||!context)throw new Error(contextError?.message||"Evidencia no autorizada");

    const bucket=String(context.bucket||"delivery-proofs");
    const deliveryId=String(context.delivery_id||"");
    const normalizedKind=String(context.kind||kind.toLowerCase());
    const path=`${deliveryId}/${orderId}/${normalizedKind}/${crypto.randomUUID()}.${extension}`;

    const {error:uploadError}=await admin.storage.from(bucket).upload(path,file,{
      contentType:file.type,cacheControl:"3600",upsert:false,
    });
    if(uploadError)throw new Error("No se pudo guardar la evidencia");

    const {data:proof,error:registerError}=await admin.rpc("quick_driver_register_proof_media",{
      p_token_hash:tokenHash,p_order_id:orderId,p_kind:kind,p_path:path,
    });
    if(registerError){
      await admin.storage.from(bucket).remove([path]);
      throw new Error(registerError.message||"No se pudo registrar la evidencia");
    }

    const previousPath=typeof context.existing_path==="string"?context.existing_path:null;
    if(previousPath&&previousPath!==path)await admin.storage.from(bucket).remove([previousPath]);
    return json({ok:true,order_id:orderId,kind:normalizedKind,proof});
  }catch(error){
    return json({ok:false,error:error instanceof Error?error.message:"No se pudo cargar la evidencia"},400);
  }
});