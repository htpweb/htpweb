(() => {
const $=id=>document.getElementById(id);
let rows=[]; let invalidRows=[]; let role=null;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function msg(t,error=false){const e=$("bulkMessage");e.textContent=t;e.className="message "+(error?"error":"success");}
function normalizeKey(v){return String(v||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
function boolText(v){return ["si","sí","true","1"].includes(String(v||"si").toLowerCase())?"si":"no";}

function normalizeRows(input){
 const aliases={
   categoria:"categoria",category:"categoria",
   producto:"producto",product:"producto",nombre:"producto",
   descripcion:"descripcion",description:"descripcion",
   precio:"precio",price:"precio",
   imagen_url:"imagen_url",imagen:"imagen_url",image_url:"imagen_url",
   variante:"variante",variant:"variante",
   precio_variante:"precio_variante",variant_price:"precio_variante",
   orden:"orden",order:"orden",activo:"activo",active:"activo"
 };
 const valid=[]; const bad=[]; const seen=new Map();
 input.forEach((raw,i)=>{
   const rowNumber=i+2;
   const out={categoria:"",producto:"",descripcion:"",precio:"",imagen_url:"",variante:"",precio_variante:"",orden:"0",activo:"si",rowNumber,valid:false,error:""};
   try{
     Object.entries(raw||{}).forEach(([k,v])=>{const key=aliases[normalizeKey(k)];if(key)out[key]=String(v??"").trim();});
     if(!out.producto)throw new Error("Producto vacío.");
     const price=Number(out.precio.replace(",","."));
     if(!Number.isFinite(price)||price<0)throw new Error("Precio inválido.");
     out.precio=price.toFixed(2);
     const order=Number(out.orden||0);
     if(!Number.isInteger(order)||order<0)throw new Error("Orden inválido.");
     out.orden=String(order);
     if(!["si","sí","true","1","no","false","0"].includes(out.activo.toLowerCase()))throw new Error("Activo debe ser Sí/No.");
     out.activo=boolText(out.activo);
     if(out.imagen_url){
       let u; try{u=new URL(out.imagen_url);}catch{throw new Error("IMAGEN_URL no es una URL válida.");}
       if(!["http:","https:"].includes(u.protocol))throw new Error("IMAGEN_URL debe usar HTTP/HTTPS.");
     }
     if(out.variante){
       const vp=Number(out.precio_variante.replace(",","."));
       if(!Number.isFinite(vp)||vp<0)throw new Error("La variante requiere PRECIO_VARIANTE válido.");
       out.precio_variante=vp.toFixed(2);
     }else{
       out.precio_variante="";
     }
     const dupKey=normalizeKey(out.producto)+"|"+normalizeKey(out.variante);
     if(seen.has(dupKey))throw new Error("Duplicado dentro del archivo: coincide con la fila "+seen.get(dupKey)+".");
     seen.set(dupKey,rowNumber);
     out.valid=true; valid.push(out);
   }catch(e){
     out.error=e.message||String(e); bad.push(out);
   }
 });
 return {valid,bad};
}

function parseCSV(text){
 const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim()); if(!lines.length)return[];
 const parse=line=>{let a=[],v="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c=='"'){if(q&&line[i+1]=='"'){v+='"';i++;}else q=!q;}else if(c==","&&!q){a.push(v);v="";}else v+=c;}a.push(v);return a;};
 const h=parse(lines.shift()); return lines.map(line=>{const vals=parse(line);return Object.fromEntries(h.map((k,i)=>[k,vals[i]??""]));});
}
async function readFile(file){
 if(!file)throw new Error("Selecciona un archivo.");
 const ext=file.name.split(".").pop().toLowerCase();
 if(ext==="csv")return parseCSV(await file.text());
 if(!["xlsx","xls"].includes(ext))throw new Error("Formato no permitido. Usa CSV o XLSX.");
 const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});const ws=wb.Sheets[wb.SheetNames[0]];
 return XLSX.utils.sheet_to_json(ws,{defval:""});
}

function render(){
 $("bulkSummary").textContent=rows.length+" filas válidas · "+invalidRows.length+" con observaciones.";
 const all=[...rows,...invalidRows].sort((a,b)=>a.rowNumber-b.rowNumber);
 $("bulkPreview").innerHTML='<table><thead><tr><th>Fila</th><th>Categoría</th><th>Producto</th><th>Precio</th><th>Variante</th><th>Precio variante</th><th>Estado</th></tr></thead><tbody>'+
 all.slice(0,200).map(r=>'<tr><td>'+r.rowNumber+'</td><td>'+esc(r.categoria)+'</td><td>'+esc(r.producto)+'</td><td>'+esc(r.precio)+'</td><td>'+esc(r.variante||"—")+'</td><td>'+esc(r.precio_variante||"—")+'</td><td class="'+(r.valid?"bulk-status-ok":"bulk-status-error")+'">'+esc(r.valid?"Lista":r.error)+'</td></tr>').join("")+'</tbody></table>'+
 (all.length>200?'<p class="muted">Mostrando las primeras 200 filas.</p>':"");
 $("applyBulk").disabled=!rows.length;
 $("downloadBulkErrors").disabled=!invalidRows.length;
}

async function init(){
 const user=await obtenerUsuarioActual();
 if(!user){location.href="../app/acceso.html?return="+encodeURIComponent(location.pathname);return;}
 const rr=await supabaseClient.rpc("current_role_code");if(rr.error)throw rr.error;role=rr.data;
 if(!["MASTER","LOCAL_ADMIN"].includes(role))throw new Error("Tu rol no tiene acceso a carga masiva.");
 let locals=[];
 if(role==="MASTER"){
   const r=await supabaseClient.from("locals").select("id,name,active").order("name");if(r.error)throw r.error;locals=r.data||[];
 }else{
   const rel=await supabaseClient.from("user_locals").select("local_id").eq("user_id",user.id).eq("active",true);if(rel.error)throw rel.error;
   const ids=(rel.data||[]).map(x=>x.local_id);
   if(ids.length){const r=await supabaseClient.from("locals").select("id,name,active").in("id",ids).order("name");if(r.error)throw r.error;locals=r.data||[];}
 }
 $("bulkLocal").innerHTML=locals.map(l=>'<option value="'+l.id+'">'+esc(l.name)+(l.active?"":" · borrador")+'</option>').join("")||'<option value="">Sin LOCAL disponible</option>';
}

$("previewBulk").onclick=async()=>{
 try{
   const parsed=normalizeRows(await readFile($("bulkFile").files[0]));
   rows=parsed.valid; invalidRows=parsed.bad;
   if(!rows.length&&!invalidRows.length)throw new Error("El archivo no contiene filas.");
   if(rows.length+invalidRows.length>2000)throw new Error("Máximo 2000 filas.");
   render();
   msg(invalidRows.length?"Archivo revisado. Puedes importar únicamente las filas válidas y descargar las observaciones.":"Archivo validado. Revisa la vista previa antes de importar.");
 }catch(e){rows=[];invalidRows=[];render();msg(e.message,true);}
};

$("applyBulk").onclick=async()=>{
 try{
   const local=$("bulkLocal").value;if(!local)throw new Error("Selecciona un LOCAL.");
   if(!rows.length)throw new Error("Primero valida un archivo.");
   $("applyBulk").disabled=true;
   const publish=$("publishBulk")?.checked===true;
   const payload=rows.map(({rowNumber,valid,error,...r})=>r);
   const r=await supabaseClient.rpc("bulk_import_local_catalog_v2",{p_local_id:local,p_rows:payload,p_publish:publish});
   if(r.error)throw r.error;
   const d=r.data||{};
   msg("Importación completada: "+(d.products_created||0)+" productos creados, "+(d.products_updated||0)+" actualizados, "+(d.variants_created||0)+" variantes creadas, "+(d.variants_updated||0)+" variantes actualizadas"+(publish?". Publicados según la columna ACTIVO.":". Quedaron en borrador/inactivos para revisión."));
   rows=[];invalidRows=[];render();
 }catch(e){$("applyBulk").disabled=false;msg(e.message,true);}
};

$("downloadTemplate").onclick=()=>{
 const data=[
  {categoria:"Hamburguesas",producto:"Clásica",descripcion:"Carne, queso y vegetales",precio:"4.50",imagen_url:"",variante:"Normal",precio_variante:"4.50",orden:"0",activo:"Sí"},
  {categoria:"Hamburguesas",producto:"Clásica",descripcion:"Carne, queso y vegetales",precio:"4.50",imagen_url:"",variante:"Grande",precio_variante:"6.00",orden:"1",activo:"Sí"},
  {categoria:"Bebidas",producto:"Cola 500 ml",descripcion:"",precio:"1.25",imagen_url:"",variante:"",precio_variante:"",orden:"0",activo:"Sí"}
 ];
 const wb=XLSX.utils.book_new();
 const ws=XLSX.utils.json_to_sheet(data);
 ws["!cols"]=[{wch:22},{wch:28},{wch:42},{wch:12},{wch:45},{wch:22},{wch:18},{wch:10},{wch:10}];
 XLSX.utils.book_append_sheet(wb,ws,"PRODUCTOS");
 const info=XLSX.utils.aoa_to_sheet([
   ["HTPWEB — Carga masiva de productos"],
   ["1","Cada fila representa un producto o una variante de producto."],
   ["2","Para varias variantes, repite PRODUCTO y usa una VARIANTE distinta en cada fila."],
   ["3","Si el producto ya existe en el LOCAL, se actualiza en lugar de duplicarse."],
   ["4","Sin marcar Publicar, productos y variantes quedan inactivos para revisión."],
   ["5","IMAGEN_URL es opcional y debe ser HTTP/HTTPS."]
 ]);
 XLSX.utils.book_append_sheet(wb,info,"INSTRUCCIONES");
 XLSX.writeFile(wb,"HTPWEB_Plantilla_Carga_Masiva_Productos.xlsx");
};

$("downloadBulkErrors").onclick=()=>{
 if(!invalidRows.length)return msg("No hay observaciones para descargar.",true);
 const data=invalidRows.map(r=>({FILA:r.rowNumber,CATEGORIA:r.categoria,PRODUCTO:r.producto,DESCRIPCION:r.descripcion,PRECIO:r.precio,IMAGEN_URL:r.imagen_url,VARIANTE:r.variante,PRECIO_VARIANTE:r.precio_variante,ORDEN:r.orden,ACTIVO:r.activo,ERROR:r.error}));
 const wb=XLSX.utils.book_new();const ws=XLSX.utils.json_to_sheet(data);
 XLSX.utils.book_append_sheet(wb,ws,"OBSERVACIONES");
 XLSX.writeFile(wb,"HTPWEB_Observaciones_Carga_Masiva_Productos.xlsx");
};

init().catch(e=>msg(e.message||"No se pudo abrir la carga masiva.",true));
})();