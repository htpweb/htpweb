import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_BASE="https://htpweb.github.io/htpweb/app/";

function validCode(value:string|null){
  return !!value && /^[A-F0-9]{6}$/i.test(value);
}

Deno.serve(async (req:Request)=>{
  if(!["GET","HEAD"].includes(req.method)){
    return new Response("Método no permitido",{status:405});
  }

  const url=new URL(req.url);
  const code=(url.searchParams.get("s")||"").trim().toUpperCase();
  if(!validCode(code)){
    return new Response("Enlace inválido",{status:400});
  }

  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!supabaseUrl||!serviceRole){
    return new Response("Servicio no disponible",{status:500});
  }

  const db=createClient(supabaseUrl,serviceRole,{
    auth:{persistSession:false,autoRefreshToken:false}
  });

  const {data:link,error}=await db
    .from("local_deliveries")
    .select("local_id,delivery_id,active")
    .eq("share_code",code)
    .eq("active",true)
    .maybeSingle();

  if(error||!link){
    return new Response("Enlace no disponible",{status:404});
  }

  const [{data:delivery},{data:local}]=await Promise.all([
    db.from("deliveries").select("slug,active").eq("id",link.delivery_id).eq("active",true).maybeSingle(),
    db.from("locals").select("id,active").eq("id",link.local_id).eq("active",true).maybeSingle()
  ]);

  if(!delivery?.slug||!local?.id){
    return new Response("LOCAL no disponible",{status:404});
  }

  const target=new URL("local.html",APP_BASE);
  target.searchParams.set("delivery",delivery.slug);
  target.searchParams.set("local",local.id);

  if(req.method==="HEAD"){
    return new Response(null,{
      status:204,
      headers:{"Cache-Control":"public, max-age=300"}
    });
  }

  return Response.redirect(target.toString(),302);
});
