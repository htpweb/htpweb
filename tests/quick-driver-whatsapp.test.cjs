const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260927214500_quick_driver_whatsapp_tracking.sql','utf8');
const registerFn=fs.readFileSync('supabase/functions/quick-driver/index.ts','utf8');
const trackFn=fs.readFileSync('supabase/functions/quick-driver-track/index.ts','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const mobile=fs.readFileSync('app/repartidor-rapido.html','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

test('alta rápida usa token privado y no expone tabla a anon/authenticated',()=>{
  assert.match(migration,/private\.quick_driver_tracking_tokens/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on table private\.quick_driver_tracking_tokens from public,anon,authenticated/);
  assert.match(migration,/token_hash text not null unique/);
  assert.match(migration,/expires_at timestamptz/);
});

test('registro rápido exige DELIVERY_ADMIN y respeta drivers.active.max',()=>{
  assert.match(migration,/delivery_quick_driver_authorize/);
  assert.match(migration,/current_role_code\(\)<>'DELIVERY_ADMIN'/);
  assert.match(migration,/has_permission\('users\.manage'\)/);
  assert.match(migration,/delivery_limit_value\(p_delivery_id,'drivers\.active\.max'\)/);
  assert.match(migration,/alcanzó el máximo de repartidores activos/);
});

test('Edge de alta requiere JWT y crea usuario técnico solo desde WhatsApp',()=>{
  assert.match(config,/\[functions\.quick-driver\]\s*\nverify_jwt = true/);
  assert.match(registerFn,/delivery_quick_driver_authorize/);
  assert.match(registerFn,/auth\.admin\.createUser/);
  assert.match(registerFn,/phone_confirm:true/);
  assert.match(registerFn,/quick_driver:true/);
  assert.match(registerFn,/quick_driver_attach/);
  assert.match(registerFn,/quick_driver_rotate_token/);
  assert.match(registerFn,/SHA-256/);
});

test('Edge público de tracking usa token hash y nunca acepta driver_user_id directo',()=>{
  assert.match(config,/\[functions\.quick-driver-track\]\s*\nverify_jwt = false/);
  assert.match(trackFn,/SHA-256/);
  assert.match(trackFn,/quick_driver_tracking_context/);
  assert.match(trackFn,/quick_driver_update_location/);
  assert.doesNotMatch(trackFn,/driver_user_id/);
});

test('GPS rápido solo opera con entrega activa y gps.live',()=>{
  assert.match(migration,/delivery_has_capability\(v_token\.delivery_id,'gps\.live'\)/);
  assert.match(migration,/o\.status in \('READY','EN_ROUTE'\)/);
  assert.match(migration,/interval '5 seconds'/);
  assert.match(migration,/driver_live_locations/);
  assert.match(migration,/driver_location_history/);
  assert.match(migration,/realtime\.send/);
  assert.match(migration,/'order-tracking:'\|\|v_order\.id::text/);
});

test('panel DELIVERY permite crear solo con WhatsApp y regenerar acceso GPS',()=>{
  assert.match(html,/id="quickDriverPhone"/);
  assert.match(html,/Crear repartidor y abrir WhatsApp/);
  assert.match(admin,/functions\.invoke\("quick-driver"/);
  assert.match(admin,/quickDriverInvoke\("create"/);
  assert.match(admin,/quickDriverInvoke\("link"/);
  assert.match(admin,/Enviar acceso GPS/);
  assert.match(admin,/repartidor-rapido\.html/);
});

test('página móvil guarda el token en sessionStorage y comparte geolocalización voluntaria',()=>{
  assert.match(mobile,/sessionStorage\.setItem\("htpweb\.quickDriverToken"/);
  assert.match(mobile,/history\.replaceState/);
  assert.match(mobile,/navigator\.geolocation\.watchPosition/);
  assert.match(mobile,/quick-driver-track/);
  assert.match(mobile,/action:"location"/);
  assert.match(mobile,/enableHighAccuracy:true/);
  assert.match(mobile,/Compartir ubicación/);
});

test('JavaScript del admin y móvil compila',()=>{
  assert.doesNotThrow(()=>new Function(admin));
  const scripts=[...mobile.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline=scripts.at(-1)?.[1]||'';
  assert.ok(inline.length>0);
  assert.doesNotThrow(()=>new Function(inline));
});