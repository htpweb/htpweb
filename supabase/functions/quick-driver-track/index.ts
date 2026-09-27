import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};

const SUPABASE_URL=Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY){
  throw new Error("Faltan variables Supabase para quick-driver-track");
}

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
}

async function sha256Hex(value:string){
  const bytes=new TextEncoder().encode(value);
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({ok:false,error:"Método no permitido"},405);

  try{
    const body=await req.json();
    const token=String(body?.token||"").trim();
    if(token.length<20)throw new Error("Enlace de seguimiento inválido");

    const tokenHash=await sha256Hex(token);
    const action=String(body?.action||"context");
    const admin=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

    if(action==="context"){
      const {data,error}=await admin.rpc("quick_driver_tracking_context",{p_token_hash:tokenHash});
      if(error)throw error;
      return json({ok:true,context:data});
    }

    if(action==="location"){
      const lat=Number(body?.latitude);
      const lng=Number(body?.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new Error("Ubicación inválida");

      const {data,error}=await admin.rpc("quick_driver_update_location",{
        p_token_hash:tokenHash,
        p_latitude:lat,
        p_longitude:lng,
        p_accuracy_m:body?.accuracy_m??null,
        p_heading_deg:body?.heading_deg??null,
        p_speed_mps:body?.speed_mps??null,
        p_captured_at:body?.captured_at??null,
      });
      if(error)throw error;
      return json({ok:true,result:data});
    }

    throw new Error("Acción inválida");
  }catch(error){
    return json({ok:false,error:error instanceof Error?error.message:"No se pudo procesar el seguimiento"},400);
  }
});