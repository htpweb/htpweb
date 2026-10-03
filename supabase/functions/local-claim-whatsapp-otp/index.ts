import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...corsHeaders,"Content-Type":"application/json"}
});
const digits=(v:string)=>String(v||"").replace(/\D/g,"");
const e164=(v:string)=>{
  const d=digits(v);
  if(d.startsWith("593"))return d;
  if(d.length===10&&d.startsWith("0"))return "593"+d.slice(1);
  return d;
};
const mask=(v:string)=>{const d=digits(v);return d.length>=4?"***"+d.slice(-4):"***";};
const validUuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f-]{36}$/i.test(v);

async function digest(text:string){
  const data=new TextEncoder().encode(text);
  const hash=await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return json({ok:false,error:"Método no permitido"},405);
  try{
    const auth=req.headers.get("Authorization")||"";
    const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
    const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
    const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:auth}}});
    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user)return json({ok:false,error:"Sesión requerida"},401);

    const body=await req.json().catch(()=>({}));
    const action=String(body.action||"request").toLowerCase();
    const localId=String(body.local_id||"");
    if(!validUuid(localId))return json({ok:false,error:"LOCAL inválido"},400);

    const {data:local,error:localError}=await admin.from("locals")
      .select("id,name,whatsapp,active").eq("id",localId).maybeSingle();
    if(localError||!local?.active)return json({ok:false,error:"LOCAL no disponible"},404);
    const target=e164(local.whatsapp||"");
    if(!target)return json({ok:false,error:"Este LOCAL no tiene WhatsApp registrado"},409);
    const pepper=Deno.env.get("CLAIM_OTP_PEPPER")||"";
    if(!pepper)return json({ok:false,error:"Verificación WhatsApp no configurada"},503);

    if(action==="verify"){
      const code=String(body.code||"").trim();
      if(!/^\d{6}$/.test(code))return json({ok:false,error:"Escribe el código de 6 dígitos"},400);
      const {data:otp}=await admin.from("local_claim_whatsapp_otps")
        .select("*").eq("user_id",user.id).eq("local_id",localId).maybeSingle();
      if(!otp)return json({ok:false,error:"Solicita un código primero"},409);
      if(otp.verified_at)return json({ok:true,verified:true});
      if(new Date(otp.expires_at).getTime()<Date.now())return json({ok:false,error:"El código venció. Solicita uno nuevo."},410);
      if(Number(otp.attempts||0)>=5)return json({ok:false,error:"Demasiados intentos. Solicita un código nuevo."},429);
      const expected=await digest(user.id+":"+localId+":"+code+":"+pepper);
      const ok=expected===otp.code_hash;
      await admin.from("local_claim_whatsapp_otps").update({
        attempts:Number(otp.attempts||0)+1,
        verified_at:ok?new Date().toISOString():null
      }).eq("user_id",user.id).eq("local_id",localId);
      return ok?json({ok:true,verified:true}):json({ok:false,error:"Código incorrecto"},400);
    }

    const token=Deno.env.get("META_WHATSAPP_TOKEN")||"";
    const phoneId=Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID")||"";
    const template=Deno.env.get("META_WHATSAPP_OTP_TEMPLATE")||"";
    const version=Deno.env.get("META_WHATSAPP_API_VERSION")||"v23.0";
    const language=Deno.env.get("META_WHATSAPP_LANGUAGE")||"es";
    if(!token||!phoneId||!template){
      return json({ok:false,error:"El envío automático por WhatsApp aún no está conectado. Usa la verificación documental."},503);
    }

    const code=String(Math.floor(100000+Math.random()*900000));
    const codeHash=await digest(user.id+":"+localId+":"+code+":"+pepper);
    const expiresAt=new Date(Date.now()+10*60*1000).toISOString();

    const metaBody={
      messaging_product:"whatsapp",to:target,type:"template",
      template:{name:template,language:{code:language},components:[
        {type:"body",parameters:[{type:"text",text:code}]},
        {type:"button",sub_type:"url",index:"0",parameters:[{type:"text",text:code}]}
      ]}
    };
    const metaUrl="https://graph.facebook.com/"+version+"/"+phoneId+"/messages";
    const meta=await fetch(metaUrl,{
      method:"POST",
      headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify(metaBody)
    });
    const metaResult=await meta.json().catch(()=>({}));
    if(!meta.ok){
      console.error("Meta OTP error",meta.status,metaResult);
      return json({ok:false,error:"No se pudo enviar el código por WhatsApp. Puedes continuar con documentos."},502);
    }

    const {error:saveError}=await admin.from("local_claim_whatsapp_otps").upsert({
      user_id:user.id,local_id:localId,code_hash:codeHash,expires_at:expiresAt,
      attempts:0,verified_at:null,created_at:new Date().toISOString()
    },{onConflict:"user_id,local_id"});
    if(saveError)return json({ok:false,error:"No se pudo registrar el código"},500);

    return json({ok:true,sent:true,masked_whatsapp:mask(target),expires_in_seconds:600});
  }catch(error){
    console.error(error);
    return json({ok:false,error:error instanceof Error?error.message:"Error de verificación"},500);
  }
});
