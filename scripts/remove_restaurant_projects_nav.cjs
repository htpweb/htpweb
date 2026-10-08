const fs=require("fs"),path=require("path");
const root=path.resolve(__dirname,"..");
const slugs=["abracadabra-codesa-5a721605","abracadabra-espejo-8fbafced","abracadabra-las-palmas-d3d79e93","asado-d-paolo-2cd6ad85","asados-codesa-bf8e8625","bendito-express-37","big-mac-f5cdeb8b","buffalos-bar-grill-38","cafeter-a-y-restaurante-bolivar-1be83291","carbon-y-le-os-burguer-c1c9a404","casa-bruma-3ce06514","coco-caf-105c25ae","don-da-e6e4f5d9","don-ru-d151e073","don-ru-picadas-937e4c13","el-mariscal-19","fritada-leverone-17","fritadas-mi-chanchito-23","garden-cafe-24","la-parrilla-de-chely-bd570e54","lorejon-16","miguelacho-pizza-972de825","moritos-grill-76d949b9","parrilladas-cede-o-7e9fc905","parrilladas-el-toro-c7e3820c","picoteo-c168ea63","punto-pez-20","rincon-manabita-restaurant-grill-c6713824","samba-492ca1d7","sanduchaso-de-one-26","santas-alitas-36"];
let changed=0,missing=[];
for(const slug of slugs){
 const file=path.join(root,slug,"index.html");if(!fs.existsSync(file)){missing.push(slug);continue;}
 const before=fs.readFileSync(file,"utf8");
 const after=before.replace(/^\s*<a id="projectsNav"[^\r\n]*<\/a>\r?\n/m,"\n");
 if(after!==before){fs.writeFileSync(file,after);changed++}else missing.push(slug+":link not found");
}
console.log(JSON.stringify({target:slugs.length,changed,missing}));
