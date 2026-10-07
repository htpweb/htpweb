import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]||c));
const page=(title:string,msg:string,ok:boolean)=>`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font-family:system-ui;background:#f5f7fb;margin:0;display:grid;place-items:center;min-height:100vh;color:#0f172a}.card{width:min(520px,90vw);background:white;border:1px solid #e2e8f0;border-radius:22px;padding:28px;box-shadow:0 22px 60px #0f172a22}.icon{font-size:42px}a{display:inline-block;margin-top:16px;background:#0f172a;color:white;text-decoration:none;padding:11px 16px;border-radius:10px;font-weight:800}p{color:#64748b;line-height:1.55}</style></head><body><div class="card"><div class="icon">${ok?"✅":"⚠️"}</div><h1>${esc(title)}</h1><p>${esc(msg)}</p><a href="https://htpweb.github.io/htpweb/admin/index.html">Volver a HTPWEB</a></div></body></html>`;

Deno.serve(async(req)=>{
  try{
    const u=new URL(req.url);
    const id=u.searchParams.get("id")||"";
    const clientTx=u.searchParams.get("clientTransactionId")||u.searchParams.get("clientTransactionID")||"";
    if(!id||!clientTx)return new Response(page("Pago incompleto","No recibimos los datos necesarios para confirmar la transacción.",false),{status:400,headers:{"Content-Type":"text/html; charset=utf-8"}});

    const payToken=Deno.env.get("PAYPHONE_TOKEN")||"";
    if(!payToken)return new Response(page("Pago pendiente","HTPWEB aún no tiene configurada la credencial de PayPhone.",false),{status:503,headers:{"Content-Type":"text/html; charset=utf-8"}});

    const url=Deno.env.get("SUPABASE_URL")!;
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase=createClient(url,service,{auth:{persistSession:false}});

    const {data:payment,error:payErr}=await supabase.from("subscription_payment_requests")
      .select("id,amount,currency,status,client_reference").eq("client_reference",clientTx).single();
    if(payErr||!payment)return new Response(page("Pago no identificado","No encontramos esta referencia en HTPWEB.",false),{status:404,headers:{"Content-Type":"text/html; charset=utf-8"}});

    const confirm=await fetch("https://pay.payphonetodoesposible.com/api/button/V2/Confirm",{
      method:"POST",
      headers:{"Authorization":"Bearer "+payToken,"Content-Type":"application/json"},
      body:JSON.stringify({id:Number(id),clientTxId:clientTx})
    });
    const data=await confirm.json().catch(()=>({}));
    const approved=confirm.ok&&String(data?.transactionStatus||"").toLowerCase()==="approved";
    const expected=Math.round(Number(payment.amount||0)*100);
    const paid=Number(data?.amount||0);
    if(!approved||paid!==expected){
      await supabase.from("subscription_payment_requests").update({
        status:approved?"FAILED":"REJECTED",
        provider_transaction_id:String(data?.transactionId||id),
        metadata:{payphone_confirm:data}
      }).eq("id",payment.id);
      return new Response(page("Pago no aprobado",data?.message||"La transacción no fue aprobada o el monto no coincide.",false),{status:400,headers:{"Content-Type":"text/html; charset=utf-8"}});
    }

    const {data:activated,error:activateError}=await supabase.rpc("activate_local_plan_from_payment",{
      p_payment_id:payment.id,p_provider_transaction_id:String(data?.transactionId||id)
    });
    if(activateError)throw activateError;

    await supabase.from("subscription_payment_requests").update({metadata:{payphone_confirm:data}}).eq("id",payment.id);
    return new Response(page("Suscripción activada","El pago fue aprobado y tu plan del LOCAL ya está activo.",true),{headers:{"Content-Type":"text/html; charset=utf-8"}});
  }catch(e){
    return new Response(page("No pudimos confirmar el pago",e instanceof Error?e.message:"Error inesperado.",false),{status:500,headers:{"Content-Type":"text/html; charset=utf-8"}});
  }
});