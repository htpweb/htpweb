import fs from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL=process.env.SUPABASE_URL||"https://hwfloywzqlgqieonuswl.supabase.co";
const SUPABASE_KEY=process.env.SUPABASE_KEY||"sb_publishable_NYoHIme-48fZeXAjF6OZaQ_twFybYI1";
const PUBLIC_ORIGIN=(process.env.HTPWEB_PUBLIC_ORIGIN||"https://htpweb.github.io").replace(/\/$/,"");
const PLATFORM_BASE=(process.env.HTPWEB_PLATFORM_BASE||PUBLIC_ORIGIN+"/htpweb").replace(/\/$/,"");
const MANIFEST=".seo-generated-businesses.json";
const LEGACY_MANIFEST=".seo-generated-locals.json";
const MARKER="<!-- HTPWEB_AUTO_SEO_BUSINESS -->";
const LEGACY_MARKER="<!-- HTPWEB_AUTO_SEO_LOCAL -->";

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
async function fetchBusinesses(){
  const select="id,business_id,name,slug,active,address,phone,whatsapp,description,latitude,longitude,logo_url,banner_url,updated_at";
  const url=SUPABASE_URL+"/rest/v1/businesses?select="+encodeURIComponent(select)+"&active=eq.true&order=name.asc";
  const res=await fetch(url,{headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY}});
  if(!res.ok)throw new Error("Supabase businesses: "+res.status+" "+await res.text());
  const rows=await res.json();
  return rows.filter(x=>safeSlug(x.slug)&&x.slug!=="htpweb-local-pruebas"&&!/^HTPWEB LOCAL PRUEBAS$/i.test(x.name||""));
}
function staticSeoHead(business){
  const name=cleanText(business.name)||"Negocio";
  const address=cleanText(business.address);
  const desc=(cleanText(business.description)||("Conoce "+name+(address?" en "+address:"")+", sus productos, servicios y formas de contacto.")).slice(0,160);
  const url=PUBLIC_ORIGIN+"/"+encodeURIComponent(business.slug)+"/";
  const image=business.banner_url||business.logo_url||"";
  const schema={
    "@context":"https://schema.org",
    "@type":"LocalBusiness",
    name,
    description:desc,
    url,
    telephone:cleanText(business.phone||business.whatsapp)||undefined,
    image:image||undefined,
    address:address?{"@type":"PostalAddress","streetAddress":address}:undefined,
    geo:Number.isFinite(Number(business.latitude))&&Number.isFinite(Number(business.longitude))?{
      "@type":"GeoCoordinates",latitude:Number(business.latitude),longitude:Number(business.longitude)
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
    '<script type="application/ld+json" id="businessSchema">'+JSON.stringify(schema).replace(/</g,"\\u003c")+"</script>"
  ].filter(Boolean).join("\n");
}
async function generatedPage(template,business){
  let out=template;
  out=out.replace("<html lang=\"es\">",'<html lang="es" data-local-slug="'+htmlEsc(business.slug)+'" data-business-slug="'+htmlEsc(business.slug)+'" data-initial-section="home">');
  out=out.replace("<title>Tienda HTPWEB</title>",staticSeoHead(business));
  out=out.replace("</head>",MARKER+"\n</head>");
  return out;
}
async function readManifest(){
  for(const candidate of [MANIFEST,LEGACY_MANIFEST]){
    try{return JSON.parse(await fs.readFile(candidate,"utf8"))}catch{}
  }
  return {slugs:[]};
}
async function removeOldGenerated(previous,current){
  const keep=new Set(current);
  for(const slug of previous.slugs||[]){
    if(keep.has(slug))continue;
    const file=path.join(slug,"index.html");
    try{
      const text=await fs.readFile(file,"utf8");
      if(text.includes(MARKER)||text.includes(LEGACY_MARKER))await fs.rm(slug,{recursive:true,force:true});
    }catch{}
  }
}
function sitemap(businesses){
  const urls=[
    {loc:PLATFORM_BASE+"/",lastmod:isoDate()},
    {loc:PLATFORM_BASE+"/como-funciona.html",lastmod:isoDate()},
    {loc:PLATFORM_BASE+"/explorar-negocios.html",lastmod:isoDate()},
    ...businesses.map(b=>({loc:PUBLIC_ORIGIN+"/"+encodeURIComponent(b.slug)+"/",lastmod:isoDate(b.updated_at)}))
  ];
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+
    urls.map(x=>'  <url><loc>'+xmlEsc(x.loc)+'</loc><lastmod>'+x.lastmod+'</lastmod></url>').join("\n")+
    "\n</urlset>\n";
}
async function main(){
  const businesses=await fetchBusinesses();
  const template=await fs.readFile("app/tienda.html","utf8");
  const previous=await readManifest();
  await removeOldGenerated(previous,businesses.map(x=>x.slug));
  for(const business of businesses){
    await fs.mkdir(business.slug,{recursive:true});
    await fs.writeFile(path.join(business.slug,"index.html"),await generatedPage(template,business),"utf8");
  }
  await fs.writeFile("sitemap.xml",sitemap(businesses),"utf8");
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
  await fs.writeFile(MANIFEST,JSON.stringify({generated_at:new Date().toISOString(),slugs:businesses.map(x=>x.slug)},null,2)+"\n","utf8");
  try{await fs.rm(LEGACY_MANIFEST,{force:true})}catch{}
  console.log("SEO business pages generated:",businesses.length);
}
await main();
