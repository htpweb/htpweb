const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(process.cwd(),'supabase','functions');
const shared=fs.readFileSync(path.join(root,'_shared','ors.ts'),'utf8');
const checkout=fs.readFileSync(path.join(root,'crear-pedido','index.ts'),'utf8');
const distance=fs.readFileSync(path.join(root,'calcular-distancia','index.ts'),'utf8');
const config=fs.readFileSync(path.join(process.cwd(),'supabase','config.toml'),'utf8');

function filesUnder(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

test('ninguna Edge Function usa el host ORS deprecado',()=>{
  const offenders=filesUnder(root)
    .filter(file=>/\.(?:ts|js|json)$/i.test(file))
    .filter(file=>fs.readFileSync(file,'utf8').includes('api.openrouteservice.org'));
  assert.deepEqual(offenders,[]);
});

test('Directions usa el host HeiGIT vigente desde un único módulo compartido',()=>{
  assert.match(shared,/https:\/\/api\.heigit\.org\/openrouteservice\/v2\/directions\/driving-car/);
  assert.match(checkout,/import \{ ORS_DIRECTIONS_DRIVING_URL \} from "\.\.\/_shared\/ors\.ts"/);
  assert.match(checkout,/const ORS_URL = ORS_DIRECTIONS_DRIVING_URL/);
  assert.match(distance,/import \{ ORS_DIRECTIONS_DRIVING_URL \} from "\.\.\/_shared\/ors\.ts"/);
  assert.match(distance,/const ORS_URL = ORS_DIRECTIONS_DRIVING_URL/);
});

test('calcular-distancia queda versionada y exige JWT en Supabase',()=>{
  assert.match(config,/\[functions\.calcular-distancia\]\s*\nverify_jwt = true/);
  assert.match(distance,/Deno\.serve/);
  assert.match(distance,/ORS_API_KEY/);
  assert.match(distance,/distance_km/);
});

test('checkout conserva cálculo autoritativo de distancia con ORS',()=>{
  assert.match(checkout,/calculateRouteDistance/);
  assert.match(checkout,/body\.locals\.distance_km/);
  assert.match(checkout,/NO SE UTILIZA/);
  assert.match(checkout,/create_order_transaction/);
});
