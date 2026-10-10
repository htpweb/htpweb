/* HTPWEB: lector seguro de la matriz universal V4.
 * Solo previsualiza; no publica ni escribe en Supabase.
 * Los nombres de imágenes se conservan literalmente para conciliación por negocio + SKU.
 */
(function(global){
  "use strict";
  const HEADERS=["Negocio","SKU producto","Categoría","Producto","Variante","Precio USD","Grupo de opciones","Cantidad a elegir","Opciones (|)","Permitir repetición","Es promoción","Días promo","Inicio promo","Fin promo","Código imagen","Archivo imagen","Estado imagen","Descripción","Fuente original","Observaciones","Estado importación","Código variante","Mínimo","Máximo","Máximo sabores distintos","Tiene acompañamientos","Tipo de selección","Mostrar selector de acompañamientos"];
  const clean=x=>String(x??"").trim();
  const parsePrice=v=>{
    if(v===null||v===undefined||clean(v)==="")return null;
    const n=typeof v==="number"?v:Number(clean(v).replace(/\s/g,"").replace(",","."));
    return Number.isFinite(n)&&n>=0?Math.round(n*100)/100:null;
  };
  const isYes=v=>/^(s[ií]|yes|true|1)$/i.test(clean(v));
  function parse(workbook){
    if(!global.XLSX)throw new Error("No se cargó el lector Excel.");
    const sheet=workbook.Sheets["MATRIZ V4"];
    if(!sheet)throw new Error("Se requiere la hoja MATRIZ V4.");
    const raw=global.XLSX.utils.sheet_to_json(sheet,{defval:null,raw:true});
    const first=global.XLSX.utils.sheet_to_json(sheet,{header:1,range:0})[0]||[];
    const absent=HEADERS.filter(h=>!first.includes(h));
    if(absent.length)throw new Error("Faltan columnas V4: "+absent.join(", "));
    const issues=[],groups=new Map(),keys=new Set(),productRows=new Map();
    raw.forEach((row,i)=>{
      const line=i+2,business=clean(row["Negocio"]),sku=clean(row["SKU producto"]),name=clean(row["Producto"]);
      if(!business||!sku||!name){issues.push({line,business,sku,type:"ERROR",message:"Falta negocio, SKU o nombre"});return;}
      const key=business.toLocaleLowerCase("es")+"::"+sku;
      // Una matriz puede tener varias filas para un SKU por variante: no fusionarlas ni eliminarlas.
      if(!groups.has(business))groups.set(business,[]);
      const price=parsePrice(row["Precio USD"]),file=clean(row["Archivo imagen"]),variant=clean(row["Variante"]);
      const record={line,business,sku,name,variant,variantCode:clean(row["Código variante"]),category:clean(row["Categoría"]),price,imageFile:file,imageCode:clean(row["Código imagen"]),description:clean(row["Descripción"]),optionGroup:clean(row["Grupo de opciones"]),optionValues:clean(row["Opciones (|)"]),quantity:row["Cantidad a elegir"],minimum:row["Mínimo"],maximum:row["Máximo"],repeat:isYes(row["Permitir repetición"]),promotion:isYes(row["Es promoción"]),source:clean(row["Fuente original"]),notes:clean(row["Observaciones"]),importStatus:clean(row["Estado importación"]),raw:row};
      groups.get(business).push(record);
      if(price===null)issues.push({line,business,sku,type:"REVIEW",message:"Precio ausente o inválido: comprobar variantes antes de permitir compra"});
      if(clean(row["Precio USD"])!==""&&price===null)issues.push({line,business,sku,type:"ERROR",message:"Precio no numérico o negativo"});
      if(!productRows.has(key))productRows.set(key,[]);
      productRows.get(key).push(record);
      if(!file)issues.push({line,business,sku,type:"REVIEW",message:"Sin archivo de imagen declarado"});
      if(!/^([^\\/]+)\.(png|jpe?g|webp)$/i.test(file)&&file)issues.push({line,business,sku,type:"REVIEW",message:"Archivo no es un nombre de foto válido"});
      if(record.optionGroup&&!record.optionValues)issues.push({line,business,sku,type:"REVIEW",message:"Grupo de opciones sin valores; revisar hoja OPCIONES NO PRODUCTOS"});
      if(keys.has(key+"::"+record.variantCode+"::"+variant)&&!record.optionGroup)issues.push({line,business,sku,type:"REVIEW",message:"Posible fila repetida, revisar antes de importar"});
      keys.add(key+"::"+record.variantCode+"::"+variant);
    });
    for(const [key,records] of productRows){
      const names=new Set(records.map(r=>r.name.toLocaleLowerCase("es")));
      const categories=new Set(records.map(r=>r.category.toLocaleLowerCase("es")).filter(Boolean));
      if(names.size>1||categories.size>1)issues.push({line:records[0].line,business:records[0].business,sku:records[0].sku,type:"ERROR",message:"Mismo SKU con nombres o categorías diferentes: requiere revisión, no fusionar"});
      const variants=records.filter(r=>r.variantCode||r.variant);
      const noVariants=records.filter(r=>!r.variantCode&&!r.variant);
      if(variants.length&&noVariants.length)issues.push({line:records[0].line,business:records[0].business,sku:records[0].sku,type:"REVIEW",message:"Filas base y variantes combinadas; revisar precios antes de publicar"});
    }
    const sheetNames=workbook.SheetNames;
    const required=["MATRIZ V4","RESUMEN 40","REVISION","IMAGENES","PROMOCIONES","OPCIONES NO PRODUCTOS","CONTROL DE EXCLUSIONES","COMPONENTES ALMUERZO SAMBA"];
    for(const name of required)if(!sheetNames.includes(name))issues.push({line:0,type:"REVIEW",message:"Hoja auxiliar ausente: "+name});
    const auxiliary={};
    for(const name of sheetNames.filter(n=>n!=="MATRIZ V4")){
      const sh=workbook.Sheets[name];auxiliary[name]=global.XLSX.utils.sheet_to_json(sh,{defval:null,raw:true});
    }
    return {version:"V4",auxiliary,businesses:[...groups].map(([name,products])=>({name,rows:products.length,uniqueProducts:new Set(products.map(p=>p.sku)).size,products})),totalRows:raw.length,issues,sheets:sheetNames};
  }
  async function read(file){
    if(!/\.xlsx?$/i.test(file.name))throw new Error("Selecciona una matriz Excel .xlsx");
    const buffer=await file.arrayBuffer();
    return parse(global.XLSX.read(buffer,{type:"array"}));
  }
  global.HTPWEBUniversalV4={parse,read,parsePrice};
})(window);
