import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Content-Type":"application/json"
};

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const auth=req.headers.get("Authorization")||"";
    const token=auth.replace(/^Bearer\s+/i,"");
    if(!token)throw new Error("Sesión requerida.");

    const url=Deno.env.get("SUPABASE_URL")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const payToken=Deno.env.get("PAYPHONE_TOKEN")||"";
    const storeId=Deno.env.get("PAYPHONE_STORE_ID")||"";
    if(!payToken||!storeId){
      return new Response(JSON.stringify({configured:false,message:"PayPhone aún no está configurado en HTPWEB."}),{status:409,headers:cors});
    }

    const supabase=createClient(url,service,{auth:{persistSession:false}});
    const {data:{user},error:userError}=await supabase.auth.getUser(token);
    if(userError||!user)throw new Error("Sesión inválida.");

    const body=await req.json().catch(()=>({}));
    const paymentId=String(body?.payment_id||"");
    if(!paymentId)throw new Error("Pago requerido.");

    const {data:payment,error}=await supabase
      .from("subscription_payment_requests")
      .select("id,local_id,plan_id,method,status,amount,currency,client_reference,created_by,subscription_plans(name,code)")
      .eq("id",paymentId).single();
    if(error||!payment)throw new Error("Pago inexistente.");
    if(payment.created_by!==user.id)throw new Error("No autorizado.");
    if(payment.method!=="CARD")throw new Error("Método de pago inválido.");
    if(!["PENDING","PROCESSING"].includes(payment.status))throw new Error("Este pago ya no puede procesarse.");

    const amount=Math.round(Number(payment.amount||0)*100);
    if(amount<=0)throw new Error("Monto inválido.");
    const callback=url+"/functions/v1/payphone-subscription-callback";
    const planName=Array.isArray(payment.subscription_plans)?payment.subscription_plans[0]?.name:payment.subscription_plans?.name;

    const pp=await fetch("https://pay.payphonetodoesposible.com/api/button/Prepare",{
      method:"POST",
      headers:{"Authorization":"Bearer "+payToken,"Content-Type":"application/json"},
      body:JSON.stringify({
        amount,
        amountWithoutTax:amount,
        amountWithTax:0,
        tax:0,
        service:0,
        tip:0,
        clientTransactionId:payment.client_reference,
        reference:"HTPWEB "+(planName||"Suscripción LOCAL"),
        storeId,
        currency:payment.currency||"USD",
        responseUrl:callback,
        cancellationUrl:"https://htpweb.github.io/htpweb/admin/index.html",
        lang:"es",
        timeZone:"-5"
      })
    });
    const data=await pp.json().catch(()=>({}));
    if(!pp.ok||!data?.payWithCard){
      await supabase.from("subscription_payment_requests").update({status:"FAILED",metadata:{payphone_prepare:data}}).eq("id",payment.id);
      throw new Error(data?.message||"PayPhone no pudo preparar el pago.");
    }

    await supabase.from("subscription_payment_requests").update({
      status:"PROCESSING",
      provider:"PAYPHONE",
      provider_transaction_id:String(data.paymentId||""),
      metadata:{payphone_payment_id:data.paymentId||null}
    }).eq("id",payment.id);

    return new Response(JSON.stringify({configured:true,checkout_url:data.payWithCard,payment_id:payment.id}),{headers:cors});
  }catch(e){
    return new Response(JSON.stringify({message:e instanceof Error?e.message:"No se pudo preparar el pago."}),{status:400,headers:cors});
  }
});