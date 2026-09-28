import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};

const SUPABASE_URL=Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ORS_API_KEY=Deno.env.get("ORS_API_KEY");
const ORS_MATRIX_URL="https://api.heigit.org/openrouteservice/v2/matrix/driving-car";
const ORS_GEOJSON_URL="https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson";

if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY){
  throw new Error("Faltan variables Supabase para quick-driver-track");
}

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
}

function validUuid(value:unknown){
  return typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validPoint(lat:unknown,lng:unknown){
  const a=Number(lat),b=Number(lng);
  return Number.isFinite(a)&&Number.isFinite(b)&&a>=-90&&a<=90&&b>=-180&&b<=180;
}

async function sha256Hex(value:string){
  const bytes=new TextEncoder().encode(value);
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function orsFetch(url:string,body:unknown){
  if(!ORS_API_KEY)throw new Error("HTPWEB: ORS_API_KEY no configurada");
  const response=await fetch(url,{
    method:"POST",
    headers:{
      Authorization:ORS_API_KEY,
      "Content-Type":"application/json",
      Accept:"application/json, application/geo+json",
    },
    body:JSON.stringify(body),
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok){
    throw new Error(data?.error?.message||data?.error||"OpenRouteService no pudo calcular la ruta");
  }
  return data;
}

function nearestRoadOrder(matrix:any,localCount:number){
  const remaining=new Set<number>();
  for(let i=1;i<=localCount;i++)remaining.add(i);
  const ordered:number[]=[];
  let current=0;
  while(remaining.size){
    let best:number|null=null;
    let bestValue=Number.POSITIVE_INFINITY;
    for(const candidate of remaining){
      const duration=Number(matrix?.durations?.[current]?.[candidate]);
      const distance=Number(matrix?.distances?.[current]?.[candidate]);
      const value=Number.isFinite(duration)?duration:(Number.isFinite(distance)?distance:Number.POSITIVE_INFINITY);
      if(value<bestValue){best=candidate;bestValue=value;}
    }
    if(best===null)best=[...remaining][0];
    ordered.push(best);
    remaining.delete(best);
    current=best;
  }
  return ordered;
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
      if(!validPoint(lat,lng))throw new Error("Ubicación inválida");
      const {data,error}=await admin.rpc("quick_driver_update_location",{
        p_token_hash:tokenHash,p_latitude:lat,p_longitude:lng,
        p_accuracy_m:body?.accuracy_m??null,p_heading_deg:body?.heading_deg??null,
        p_speed_mps:body?.speed_mps??null,p_captured_at:body?.captured_at??null,
      });
      if(error)throw error;
      return json({ok:true,result:data});
    }

    if(action==="stop"){
      const orderId=String(body?.order_id||"");
      const localId=String(body?.local_id||"");
      if(!validUuid(orderId)||!validUuid(localId))throw new Error("Pedido o LOCAL inválido");
      const {data,error}=await admin.rpc("quick_driver_stop_action",{
        p_token_hash:tokenHash,p_order_id:orderId,p_local_id:localId,
        p_action:String(body?.stop_action||""),
      });
      if(error)throw error;
      return json({ok:true,context:data});
    }

    if(action==="status"){
      const orderId=String(body?.order_id||"");
      if(!validUuid(orderId))throw new Error("Pedido inválido");
      const {data,error}=await admin.rpc("quick_driver_set_order_status",{
        p_token_hash:tokenHash,p_order_id:orderId,p_new_status:String(body?.status||""),
      });
      if(error)throw error;
      return json({ok:true,context:data});
    }

    if(action==="pin"){
      const orderId=String(body?.order_id||"");
      if(!validUuid(orderId))throw new Error("Pedido inválido");
      const {data,error}=await admin.rpc("quick_driver_verify_delivery_pin",{
        p_token_hash:tokenHash,p_order_id:orderId,p_pin:String(body?.pin||""),
      });
      if(error)throw error;
      return json({ok:true,result:data});
    }

    if(action==="route"){
      const orderId=String(body?.order_id||"");
      const originLat=Number(body?.origin_lat);
      const originLng=Number(body?.origin_lng);
      if(!validUuid(orderId)||!validPoint(originLat,originLng))throw new Error("Pedido u origen inválido");

      const {data:ctx,error:ctxError}=await admin.rpc("quick_driver_tracking_context",{p_token_hash:tokenHash});
      if(ctxError)throw ctxError;
      const order=(ctx?.orders||[]).find((o:any)=>o.order_id===orderId);
      if(!order)throw new Error("Pedido no disponible para este repartidor");
      if(!validPoint(order.latitude,order.longitude))throw new Error("El destino del cliente no tiene coordenadas válidas");

      const locals=(Array.isArray(order.locals)?order.locals:[])
        .filter((l:any)=>l.status!=="CANCELLED"&&l.pickup_status!=="PICKED_UP"&&validPoint(l.latitude,l.longitude));

      const nodes=[
        {type:"ORIGIN",name:"Mi ubicación",lat:originLat,lng:originLng},
        ...locals.map((l:any)=>({
          type:"LOCAL",local_id:l.local_id,name:l.name||"LOCAL",address:l.address||"",
          lat:Number(l.latitude),lng:Number(l.longitude),pickup_status:l.pickup_status||"PENDING",
        })),
        {type:"CUSTOMER",order_id:orderId,name:order.customer_name||"Cliente",
          address:order.delivery_address||"",lat:Number(order.latitude),lng:Number(order.longitude)},
      ];

      let orderedNodes=nodes;
      if(locals.length>1&&ctx?.routes_optimize){
        const matrix=await orsFetch(ORS_MATRIX_URL,{
          locations:nodes.map((n:any)=>[n.lng,n.lat]),
          metrics:["duration","distance"],
        });
        const localOrder=nearestRoadOrder(matrix,locals.length);
        const customerIndex=nodes.length-1;
        orderedNodes=[nodes[0],...localOrder.map(i=>nodes[i]),nodes[customerIndex]];
      }

      const directions=await orsFetch(ORS_GEOJSON_URL,{
        coordinates:orderedNodes.map((n:any)=>[n.lng,n.lat]),
        instructions:false,
      });
      const feature=directions?.features?.[0];
      const summary=feature?.properties?.summary;
      if(!feature?.geometry?.coordinates||!summary)throw new Error("ORS no devolvió una ruta vial válida");

      return json({ok:true,route:{
        order_id:orderId,
        optimized:Boolean(locals.length>1&&ctx?.routes_optimize),
        profile:"driving-car",
        distance_km:Number((Number(summary.distance||0)/1000).toFixed(2)),
        duration_minutes:Math.round(Number(summary.duration||0)/60),
        geometry:feature.geometry,
        stops:orderedNodes.slice(1).map((node:any,index:number)=>({...node,sequence:index+1})),
      }});
    }

    throw new Error("Acción inválida");
  }catch(error){
    return json({ok:false,error:error instanceof Error?error.message:"No se pudo procesar la consola del repartidor"},400);
  }
});