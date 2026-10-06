import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors});}
function blockedHost(host:string){
  const h=host.toLowerCase().replace(/^\[|\]$/g,"");
  if(h==="localhost"||h.endsWith(".local")||h.endsWith(".internal"))return true;
  if(h==="::1"||h==="0.0.0.0"||h==="169.254.169.254")return true;
  if(/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h))return true;
  const m=h.match(/^172\.(\d+)\./);if(m&&Number(m[1])>=16&&Number(m[1])<=31)return true;
  if(/^169\.254\./.test(h))return true;
  return false;
}
function safeUrl(value:string){
  let u:URL;try{u=new URL(value)}catch{throw new Error("URL inválida");}
  if(!["http:","https:"].includes(u.protocol))throw new Error("Solo se permiten URLs http/https");
  if(blockedHost(u.hostname))throw new Error("Ese destino no está permitido");
  if(u.port&&!["80","443"].includes(u.port))throw new Error("Puerto no permitido");
  u.username="";u.password="";return u;
}
async function fetchSafe(start:URL,accept:string){
  let current=start;
  for(let i=0;i<5;i++){
    const res=await fetch(current.toString(),{method:"GET",redirect:"manual",headers:{"User-Agent":"HTPWEB-Design-Importer/1.1","Accept":accept}});
    if([301,302,303,307,308].includes(res.status)){
      const loc=res.headers.get("location");if(!loc)throw new Error("Redirección inválida");
      current=safeUrl(new URL(loc,current).toString());continue;
    }
    return {res,current};
  }
  throw new Error("Demasiadas redirecciones");
}
async function readLimited(res:Response,max:number){
  const reader=res.body?.getReader();if(!reader)throw new Error("No se pudo leer la respuesta");
  const chunks:Uint8Array[]=[];let total=0;
  while(true){const {done,value}=await reader.read();if(done)break;if(value){total+=value.byteLength;if(total>max)throw new Error("El recurso es demasiado grande para analizarlo");chunks.push(value);}}
  const bytes=new Uint8Array(total);let off=0;for(const c of chunks){bytes.set(c,off);off+=c.length;}
  return {text:new TextDecoder("utf-8",{fatal:false}).decode(bytes),bytes:total};
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Método no permitido"},405);
  try{
    const body=await req.json().catch(()=>({}));
    const url=safeUrl(String(body?.url||"").trim());
    const {res,current}=await fetchSafe(url,"text/html,application/xhtml+xml;q=0.9,*/*;q=0.5");
    if(!res.ok)throw new Error("La web respondió "+res.status);
    const type=(res.headers.get("content-type")||"").toLowerCase();
    if(!type.includes("text/html")&&!type.includes("application/xhtml+xml"))throw new Error("La URL no devuelve una página HTML");
    const page=await readLimited(res,900_000);
    let html=page.text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
    const title=(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,200);

    const hrefs=[...html.matchAll(/<link\b[^>]*rel=["'][^"']*stylesheet[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi),
                 ...html.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi)]
      .map(m=>m[1]).filter(Boolean);
    const unique=[...new Set(hrefs)].slice(0,8);
    let css="",cssBytes=0;
    for(const href of unique){
      try{
        const cssUrl=safeUrl(new URL(href,current).toString());
        const got=await fetchSafe(cssUrl,"text/css,*/*;q=0.2");
        if(!got.res.ok)continue;
        const ct=(got.res.headers.get("content-type")||"").toLowerCase();
        if(ct&&!ct.includes("text/css")&&!ct.includes("text/plain"))continue;
        const left=450_000-cssBytes;if(left<=0)break;
        const part=await readLimited(got.res,Math.min(left,120_000));
        css+="\n/* "+cssUrl.hostname+" */\n"+part.text;cssBytes+=part.bytes;
      }catch{ /* stylesheet is optional */ }
    }
    return json({ok:true,url:url.toString(),final_url:current.toString(),title,html,css,bytes:page.bytes,css_bytes:cssBytes});
  }catch(e){return json({ok:false,error:e instanceof Error?e.message:"No se pudo analizar la URL"},400);}
});