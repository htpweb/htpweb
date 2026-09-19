(() => {
const $=id=>document.getElementById(id); let rows=[]; let role=null;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
function msg(t,error=false){const e=$("bulkMessage");e.textContent=t;e.className="message "+(error?"error":"success");}
function normalizeKey(v){return String(v||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
function normalizeRows(input){
 const aliases={categoria:"categoria",category:"categoria",producto:"producto",product:"producto",nombre:"producto",descripcion:"descripcion",description:"descripcion",precio:"precio",price:"precio",orden:"orden",order:"orden",activo:"activo",active:"activo"};
 return input.map((raw,i)=>{const out={categoria:"",producto:"",descripcion:"",precio:"",orden:"0",activo:"si"};
   Object.entries(raw||{}).forEach(([k,v])=>{const key=aliases[normalizeKey(k)];if(key)out[key]=String(v??"").trim();});
   if(!out.producto)throw new Error("Fila "+(i+2)+": producto vacío.");
   const price=Number(out.precio.replace(",", ".")); if(!Number.isFinite(price)||price<0)throw new Error("Fila "+(i+2)+": precio inválido.");
   const order=Number(out.orden||0);if(!Number.isInteger(order)||order<0)throw new Error("Fila "+(i+2)+": orden inválido.");
   if(!["si","sí","true","1","no","false","0"].includes(out.activo.toLowerCase()))throw new Error("Fila "+(i+2)+": activo debe ser Sí/No.");
   out.precio=price.toFixed(2);out.orden=String(order);return out;
 });
}
function parseCSV(text){const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(x=>x.trim());if(!lines.length)return[];
 const parse=line=>{let a=[],v="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c=='"'){if(q&&line[i+1]=='"'){v+='"';i++;}else q=!q;}else if(c==","&&!q){a.push(v);v="";}else v+=c;}a.push(v);return a;};
 const h=parse(lines.shift());return lines.map(line=>Object.fromEntries(h.map((k,i)=>[k,parse(line)[i]??""])));
}
async function readFile(file){if(!file)throw new Error("Selecciona un archivo.");
 const ext=file.name.split(".").pop().toLowerCase();if(ext==="csv")return parseCSV(await file.text());
 if(!["xlsx","xls"].includes(ext))throw new Error("Formato no permitido. Usa CSV o XLSX.");
 const wb=XLSX.read(await file.arrayBuffer(),{type:"array"});const ws=wb.Sheets[wb.SheetNames[0]];return XLSX.utils.sheet_to_json(ws,{defval:""});
}
function render(){ $("bulkSummary").textContent=rows.length+" filas válidas listas para importar.";
 $("bulkPreview").innerHTML='<table><thead><tr><th>Categoría</th><th>Producto</th><th>Precio</th><th>Orden</th><th>Activo</th></tr></thead><tbody>'+
 rows.slice(0,100).map(r=>'<tr><td>'+esc(r.categoria)+'</td><td>'+esc(r.producto)+'</td><td>$'+esc(r.precio)+'</td><td>'+esc(r.orden)+'</td><td>'+esc(r.activo)+'</td></tr>').join("")+'</tbody></table>'+
 (rows.length>100?'<p class="muted">Mostrando las primeras 100 filas.</p>':"");$("applyBulk").disabled=!rows.length;}
async function init(){const user=await obtenerUsuarioActual();if(!user){location.href="../app/acceso.html?return="+encodeURIComponent(location.pathname);return;}
 const rr=await supabaseClient.rpc("current_role_code");if(rr.error)throw rr.error;role=rr.data;if(!["MASTER","LOCAL_ADMIN"].includes(role))throw new Error("Tu rol no tiene acceso a carga masiva.");
 let locals=[];if(role==="MASTER"){const r=await supabaseClient.from("locals").select("id,name,active").eq("active",true).order("name");if(r.error)throw r.error;locals=r.data||[];}
 else {const rel=await supabaseClient.from("user_locals").select("local_id").eq("user_id",user.id).eq("active",true);if(rel.error)throw rel.error;const ids=(rel.data||[]).map(x=>x.local_id);
 if(ids.length){const r=await supabaseClient.from("locals").select("id,name,active").in("id",ids).eq("active",true).order("name");if(r.error)throw r.error;locals=r.data||[];}}
 $("bulkLocal").innerHTML=locals.map(l=>'<option value="'+l.id+'">'+esc(l.name)+'</option>').join("")||'<option value="">Sin LOCAL disponible</option>';
}
$("previewBulk").onclick=async()=>{try{rows=normalizeRows(await readFile($("bulkFile").files[0]));if(!rows.length)throw new Error("El archivo no contiene filas.");if(rows.length>1000)throw new Error("Máximo 1000 filas.");render();msg("Archivo validado. Revisa la vista previa antes de importar.");}catch(e){rows=[];$("applyBulk").disabled=true;msg(e.message,true);}};
$("applyBulk").onclick=async()=>{try{const local=$("bulkLocal").value;if(!local)throw new Error("Selecciona un LOCAL.");if(!rows.length)throw new Error("Primero valida un archivo.");$("applyBulk").disabled=true;
 const r=await supabaseClient.rpc("bulk_import_local_catalog",{p_local_id:local,p_rows:rows});if(r.error)throw r.error;msg("Importación completada: "+(r.data?.products_created||rows.length)+" productos.");rows=[];render();}catch(e){$("applyBulk").disabled=false;msg(e.message,true);}};
$("downloadTemplate").onclick=()=>{const csv="categoria,producto,descripcion,precio,orden,activo\nHamburguesas,Clásica,Carne queso y vegetales,4.50,0,Sí\nBebidas,Cola 500 ml,,1.25,1,Sí\n";const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="plantilla_catalogo_htpweb.csv";a.click();URL.revokeObjectURL(a.href);};
init().catch(e=>msg(e.message||"No se pudo abrir la carga masiva.",true));
})();