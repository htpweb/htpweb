const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const migration=fs.readFileSync('supabase/migrations/20261002185500_express_demo.sql','utf8');
const edge=fs.readFileSync('supabase/functions/create-express-demo/index.ts','utf8');
const signup=fs.readFileSync('express/index.html','utf8');
const order=fs.readFileSync('express/pedido.html','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

function inlineScripts(html){
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
}

test('Express crea demos temporales de 15 dias sin cuenta de usuario',()=>{
  assert.match(migration,/create table if not exists public\.express_demos/);
  assert.match(migration,/expires_at timestamptz not null default \(now\(\) \+ interval '15 days'\)/);
  assert.doesNotMatch(edge,/auth\.admin\.createUser|signUp\(/);
  assert.match(config,/\[functions\.create-express-demo\][\s\S]*verify_jwt = false/);
});

test('Express soporta tarifa simple y avanzada por distancia o zonas',()=>{
  assert.match(migration,/SIMPLE/);
  assert.match(migration,/ADVANCED_DISTANCE/);
  assert.match(migration,/ADVANCED_ZONES/);
  assert.match(signup,/Simple · Día y noche/);
  assert.match(signup,/Avanzada · Distancia o zonas/);
  assert.match(signup,/Por distancia/);
  assert.match(signup,/Por zonas/);
});

test('Express no registra pedidos ni clientes y envia directo a WhatsApp',()=>{
  assert.doesNotMatch(order,/\.from\(["']orders["']\)|crear-pedido|order_items|customers/);
  assert.match(order,/https:\/\/wa\.me\//);
  assert.match(order,/HTPWEB Express no almacena este pedido/);
  assert.match(order,/public_express_demo/);
});

test('Alta Express entrega link, QR y acciones para compartir',()=>{
  assert.match(signup,/CREAR MI PÁGINA/);
  assert.match(signup,/Tu página está lista/);
  assert.match(signup,/new QRCode/);
  assert.match(signup,/Copiar link/);
  assert.match(signup,/Compartir por WhatsApp/);
  assert.match(edge,/express\/pedido\.html\?demo=/);
});

test('scripts inline de Express compilan',()=>{
  for(const script of [...inlineScripts(signup),...inlineScripts(order)]){
    assert.doesNotThrow(()=>new vm.Script(script));
  }
});
