import fs from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL=process.env.SUPABASE_URL||"https://hwfloywzqlgqieonuswl.supabase.co";
const SUPABASE_KEY=process.env.SUPABASE_KEY||"sb_publishable_NYoHIme-48fZeXAjF6OZaQ_twFybYI1";
const PUBLIC_ORIGIN=(process.env.HTPWEB_PUBLIC_ORIGIN||"https://htpweb.github.io").replace(/\/$/,"");
const PLATFORM_BASE=(process.env.HTPWEB_PLATFORM_BASE||PUBLIC_ORIGIN+"/htpweb").replace(/\/$/,"");
const MANIFEST=".seo-generated-locals.json";
const MARKER="<!-- HTPWEB_AUTO_SEO_LOCAL -->";

const xmlEsc=v=>String(v??"").replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]));
const htmlEsc=v=>String(v??"").replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&#39;",'"':"&quot;"}[c]));
const cleanText=v=>String(v??"").replace(/\s+/g," ").trim();
const isoDate=v=>{
  const d=new Date(v||Date.now());
  return Number.isNaN(d.getTime())?new Date().toISOString().slice(0,10):d.toISOString().slice(0,10);
};
function safeSlug(v){
  const s=String(v||"").trim();
  if(!/^[a-z0-9][a-z0-9-]{0,119}$/i.test(s))return "";
  return s;
}
async function fetchLocals(){
  const select="id,name,slug,active,address,phone,whatsapp,description,latitude,longitude,logo_url,banner_url,updated_at";
  const url=SUPABASE_URL+"/rest/v1/locals?select="+encodeURIComponent(select)+"&active=eq.true&order=name.asc";
  const res=await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY}});
  if(!res.ok)throw new Error("Supabase locals: "+res.status+" "+await res.text());
  const rows=await res.json();
  return rows.filter(x=>safeSlug(x.slug)&&x.slug!=="htpweb-local-pruebas"&&!/^HTPWEB LOCAL PRUEBAS$/i.test(x.name||""));
}
function staticSeoHead(local){
  const name=cleanText(local.name)||"Negocio";
  const address=cleanText(local.address);
  const desc=(cleanText(local.description)||("Conoce "+name+(address?" en "+address:"")+", sus productos, servicios y formas de contacto.")).slice(0,160);
  const url=PUBLIC_ORIGIN+"/"+encodeURIComponent(local.slug)+"/";
  const image=local.banner_url||local.logo_url||"";
  const schema={
    "@context":"https://schema.org",
    "@type":"LocalBusiness",
    name,
    description:desc,
    url,
    telephone:cleanText(local.phone||local.whatsapp)||undefined,
    image:image||undefined,
    address:address?{"@type":"PostalAddress","streetAddress":address}:undefined,
    geo:Number.isFinite(Number(local.latitude))&&Number.isFinite(Number(local.longitude))?{
      "@type":"GeoCoordinates",latitude:Number(local.latitude),longitude:Number(local.longitude)
    }:undefined
  };
  return [
    "<title>"+htmlEsc(name)+" | Sitio oficial</title>",
    '<meta name="description" content="'+htmlEsc(desc)+'">',
    '<meta name="robots" content="index,follow,max-image-preview:large">',
    '<link rel="canonical" href="'+htmlEsc(url)+'">',
    '<meta property="og:type" content="website">',
    '<meta property="og:title" content="'+htmlEsc(name)+' | Sitio oficial">',
    '<meta property="og:description" content="'+htmlEsc(desc)+'">',
    '<meta property="og:url" content="'+htmlEsc(url)+'">',
    image?'<meta property="og:image" content="'+htmlEsc(image)+'">':"",
    '<script type="application/ld+json" id="localBusinessSchema">'+JSON.stringify(schema).replace(/</g,"\\u003c")+'</script>'
  ].filter(Boolean).join("\n");
}
async function generatedPage(template,local){
  let out=template;
  out=out.replace("<html lang=\"es\">",'<html lang="es" data-local-slug="'+htmlEsc(local.slug)+'" data-initial-section="home">');
  out=out.replace("<title>Tienda HTPWEB</title>",staticSeoHead(local));
  out=out.replace("</head>",MARKER+"\n</head>");
  return out;
}
async function readManifest(){
  try{return JSON.parse(await fs.readFile(MANIFEST,"utf8"))}catch{return {slugs:[]}}
}
async function removeOldGenerated(previous,current){
  const keep=new Set(current);
  for(const slug of previous.slugs||[]){
    if(keep.has(slug))continue;
    const file=path.join(slug,"index.html");
    try{
      const text=await fs.readFile(file,"utf8");
      if(text.includes(MARKER))await fs.rm(slug,{recursive:true,force:true});
    }catch{}
  }
}
function sitemap(locals){
  const urls=[
    {loc:PLATFORM_BASE+"/",lastmod:isoDate()},
    {loc:PLATFORM_BASE+"/como-funciona.html",lastmod:isoDate()},
    {loc:PLATFORM_BASE+"/explorar-negocios.html",lastmod:isoDate()},
    ...locals.map(l=>({loc:PUBLIC_ORIGIN+"/"+encodeURIComponent(l.slug)+"/",lastmod:isoDate(l.updated_at)}))
  ];
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
    urls.map(x=>'  <url><loc>'+xmlEsc(x.loc)+'</loc><lastmod>'+x.lastmod+'</lastmod></url>').join("\n")+
    '\n</urlset>\n';
}
async function main(){
  const locals=await fetchLocals();
  const template=await fs.readFile("app/tienda.html","utf8");
  const previous=await readManifest();
  await removeOldGenerated(previous,locals.map(x=>x.slug));
  for(const local of locals){
    await fs.mkdir(local.slug,{recursive:true});
    await fs.writeFile(path.join(local.slug,"index.html"),await generatedPage(template,local),"utf8");
  }
  await fs.writeFile("sitemap.xml",sitemap(locals),"utf8");
  await fs.writeFile("robots.txt",[
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /app/acceso.html",
    "Disallow: /app/mi-cuenta.html",
    "Disallow: /app/configuracion.html",
    "Sitemap: "+PLATFORM_BASE+"/sitemap.xml",
    ""
  ].join("\n"),"utf8");
  await fs.writeFile(MANIFEST,JSON.stringify({generated_at:new Date().toISOString(),slugs:locals.map(x=>x.slug)},null,2)+"\n","utf8");
  console.log("SEO pages generated:",locals.length);
}
await main();
