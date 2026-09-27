import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};

const SUPABASE_URL=Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if(!SUPABASE_URL||!SUPABASE_ANON_KEY||!SUPABASE_SERVICE_ROLE_KEY){
  throw new Error("Faltan variables Supabase para quick-driver");
}

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
}

function phoneInfo(value:unknown){
  let digits=String(value||"").replace(/\D/g,"");
  if(digits.startsWith("00"))digits=digits.slice(2);
  if(/^0\d{9}$/.test(digits))digits="593"+digits.slice(1);
  else if(/^9\d{8}$/.test(digits))digits="593"+digits;
  if(!/^\d{8,15}$/.test(digits))throw new Error("Número de WhatsApp inválido");
  return {digits,e164:"+"+digits};
}

function randomToken(bytes=32){
  const data=new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}

async function sha256Hex(value:string){
  const bytes=new TextEncoder().encode(value);
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({ok:false,error:"Método no permitido"},405);

  let createdUserId:string|null=null;

  try{
    const authorization=req.headers.get("Authorization")||"";
    if(!authorization.startsWith("Bearer "))return json({ok:false,error:"Sesión requerida"},401);

    const token=authorization.slice(7).trim();
    const admin=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const userClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
      auth:{persistSession:false,autoRefreshToken:false},
      global:{headers:{Authorization:"Bearer "+token}},
    });

    const {data:userData,error:userError}=await admin.auth.getUser(token);
    if(userError||!userData?.user)return json({ok:false,error:"Sesión inválida"},401);

    const body=await req.json();
    const action=String(body?.action||"create");
    const deliveryId=String(body?.delivery_id||"").trim();
    if(!/^[0-9a-f-]{36}$/i.test(deliveryId))throw new Error("DELIVERY inválido");

    const {data:authz,error:authzError}=await userClient.rpc("delivery_quick_driver_authorize",{p_delivery_id:deliveryId});
    if(authzError||!authz?.allowed)throw new Error(authzError?.message||"No autorizado");

    const actorUserId=String(authz.actor_user_id||userData.user.id);
    const plainTrackingToken=randomToken();
    const tokenHash=await sha256Hex(plainTrackingToken);

    if(action==="link"){
      const driverUserId=String(body?.driver_user_id||"").trim();
      if(!/^[0-9a-f-]{36}$/i.test(driverUserId))throw new Error("Repartidor inválido");

      const {data:driver,error:rotateError}=await admin.rpc("quick_driver_rotate_token",{
        p_delivery_id:deliveryId,
        p_user_id:driverUserId,
        p_token_hash:tokenHash,
        p_created_by:actorUserId,
      });
      if(rotateError)throw rotateError;
      return json({ok:true,action:"link",driver,tracking_token:plainTrackingToken});
    }

    if(action!=="create")throw new Error("Acción inválida");

    const phone=phoneInfo(body?.phone);
    const {data:existing,error:findError}=await admin.rpc("quick_driver_find_by_phone",{p_phone:phone.e164});
    if(findError)throw findError;

    let driverUserId=existing?.user_id?String(existing.user_id):null;

    if(!driverUserId){
      const suffix=phone.digits.slice(-4);
      const generatedPassword=randomToken(36)+"Aa9!";
      const {data:created,error:createError}=await admin.auth.admin.createUser({
        phone:phone.e164,
        phone_confirm:true,
        password:generatedPassword,
        user_metadata:{full_name:"Repartidor "+suffix,phone:phone.e164,quick_driver:true},
      });
      if(createError||!created?.user)throw createError||new Error("No se pudo crear el repartidor");
      driverUserId=created.user.id;
      createdUserId=driverUserId;
    }

    const {data:driver,error:attachError}=await admin.rpc("quick_driver_attach",{
      p_delivery_id:deliveryId,
      p_user_id:driverUserId,
      p_phone:phone.e164,
      p_token_hash:tokenHash,
      p_created_by:actorUserId,
    });
    if(attachError)throw attachError;

    return json({
      ok:true,
      action:"create",
      created_new_user:Boolean(createdUserId),
      driver,
      tracking_token:plainTrackingToken,
    });
  }catch(error){
    if(createdUserId){
      try{
        const admin=createClient(SUPABASE_URL!,SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
        await admin.auth.admin.deleteUser(createdUserId);
      }catch{}
    }
    return json({ok:false,error:error instanceof Error?error.message:"No se pudo crear el repartidor rápido"},400);
  }
});