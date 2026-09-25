const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260925160915_stage2_delivery_proof.sql','utf8');
const upload=fs.readFileSync('supabase/functions/delivery-proof-upload/index.ts','utf8');
const viewer=fs.readFileSync('supabase/functions/delivery-proof-view/index.ts','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const orders=fs.readFileSync('app/pedidos.html','utf8');

test('configuración y evidencia viven en private con deny-all',()=>{
  assert.match(migration,/create table if not exists private\.delivery_proof_settings/);
  assert.match(migration,/create table if not exists private\.order_delivery_proofs/);
  assert.match(migration,/revoke all on table private\.delivery_proof_settings from public,anon,authenticated/);
  assert.match(migration,/revoke all on table private\.order_delivery_proofs from public,anon,authenticated/);
  assert.match(migration,/create policy delivery_proof_settings_deny_all/);
  assert.match(migration,/create policy order_delivery_proofs_deny_all/);
  assert.match(migration,/using \(false\)/);
  assert.match(migration,/with check \(false\)/);
});

test('bucket delivery-proofs es privado y restringe tamaño y mime',()=>{
  assert.match(migration,/'delivery-proofs'/);
  assert.match(migration,/false,\s*5242880/);
  assert.match(migration,/image\/jpeg/);
  assert.match(migration,/image\/png/);
  assert.match(migration,/image\/webp/);
  assert.doesNotMatch(admin,/storage\.from\(["']delivery-proofs/);
  assert.doesNotMatch(orders,/storage\.from\(["']delivery-proofs/);
});

test('DELIVERY solo puede exigir métodos incluidos en su plan',()=>{
  const fn=migration.match(/create or replace function public\.delivery_save_proof_settings[\s\S]*?grant execute on function public\.delivery_save_proof_settings/)?.[0]||'';
  assert.match(fn,/current_role_code\(\)<>'DELIVERY_ADMIN'/);
  assert.match(fn,/delivery_proof\.pin/);
  assert.match(fn,/delivery_proof\.photo/);
  assert.match(fn,/delivery_proof\.signature/);
  assert.match(fn,/orders\.manage/);
});

test('requisitos efectivos ignoran una configuración que salió del plan',()=>{
  const fn=migration.match(/create or replace function private\.delivery_proof_requirements[\s\S]*?revoke execute on function private\.delivery_proof_requirements/)?.[0]||'';
  assert.match(fn,/configured_pin/);
  assert.match(fn,/configured_photo/);
  assert.match(fn,/configured_signature/);
  assert.match(fn,/'require_pin',coalesce\(v_pin,false\) and v_available_pin/);
  assert.match(fn,/'require_photo',coalesce\(v_photo,false\) and v_available_photo/);
  assert.match(fn,/'require_signature',coalesce\(v_signature,false\) and v_available_signature/);
});

test('PIN se genera con pgcrypto y queda restringido a seis dígitos',()=>{
  assert.match(migration,/extensions\.gen_random_bytes\(4\)/);
  assert.match(migration,/100000\+\(v_num%900000\)/);
  assert.match(migration,/pin_code ~ '\^\[0-9\]\{6\}\$'/);
  assert.doesNotMatch(migration,/random\(\)/);
});

test('al entrar EN_ROUTE se congela una prueba por pedido y repartidor',()=>{
  const fn=migration.match(/create or replace function private\.ensure_order_delivery_proof[\s\S]*?revoke execute on function private\.ensure_order_delivery_proof/)?.[0]||'';
  assert.match(fn,/status<>'EN_ROUTE'/);
  assert.match(fn,/delivery_proof_requirements/);
  assert.match(fn,/order_driver_assignments/);
  assert.match(fn,/status='ACTIVE'/);
  assert.match(fn,/insert into private\.order_delivery_proofs/);
  assert.match(fn,/on conflict\(order_id\) do nothing/);
  assert.match(fn,/generate_delivery_pin/);
});

test('trigger BEFORE bloquea cualquier DELIVERED si falta evidencia',()=>{
  const fn=migration.match(/create or replace function public\.enforce_delivery_proof_transition[\s\S]*?revoke execute on function public\.enforce_delivery_proof_transition/)?.[0]||'';
  assert.match(fn,/old\.status='EN_ROUTE' and new\.status='DELIVERED'/);
  assert.match(fn,/falta verificar el PIN de entrega/);
  assert.match(fn,/falta cargar la foto de entrega/);
  assert.match(fn,/falta registrar la firma de entrega/);
  assert.match(migration,/create trigger trg_orders_delivery_proof_guard\s+before update of status on public\.orders/);
});

test('lifecycle crea prueba al iniciar ruta y marca final o cancelación',()=>{
  const fn=migration.match(/create or replace function private\.order_delivery_proof_lifecycle[\s\S]*?revoke execute on function private\.order_delivery_proof_lifecycle/)?.[0]||'';
  assert.match(fn,/old\.status='READY' and new\.status='EN_ROUTE'/);
  assert.match(fn,/ensure_order_delivery_proof/);
  assert.match(fn,/old\.status='EN_ROUTE' and new\.status='DELIVERED'/);
  assert.match(fn,/completed_at/);
  assert.match(fn,/new\.status='CANCELLED'/);
  assert.match(fn,/cancelled_at/);
});

test('PIN incorrecto persiste intento sin rollback y PIN correcto verifica',()=>{
  const fn=migration.match(/create or replace function public\.driver_verify_delivery_pin[\s\S]*?grant execute on function public\.driver_verify_delivery_pin/)?.[0]||'';
  assert.match(fn,/pin_attempts=pin_attempts\+1/);
  assert.match(fn,/pin_last_attempt_at=now\(\)/);
  assert.match(fn,/v_verified:=v_proof\.pin_code=v_input/);
  assert.match(fn,/pin_verified_at=case when v_verified then now\(\)/);
  assert.match(fn,/'verified',v_verified/);
  assert.doesNotMatch(fn,/PIN incorrecto/);
  assert.match(fn,/interval '2 seconds'/);
});

test('repartidor nunca recibe el PIN real en sus snapshots',()=>{
  const snap=migration.match(/create or replace function public\.driver_delivery_proof_snapshot[\s\S]*?grant execute on function public\.driver_delivery_proof_snapshot/)?.[0]||'';
  const ordersFn=migration.match(/create or replace function public\.driver_my_orders\(\)[\s\S]*?grant execute on function public\.driver_my_orders/)?.[0]||'';
  assert.doesNotMatch(snap,/'pin_code'/);
  assert.doesNotMatch(snap,/'pin',v_proof\.pin_code/);
  assert.doesNotMatch(ordersFn,/'pin_code'/);
  assert.match(ordersFn,/'pin_verified'/);
});

test('CLIENT solo ve PIN de su propio pedido mientras EN_ROUTE y no verificado',()=>{
  const fn=migration.match(/create or replace function public\.customer_order_delivery_proof_snapshot[\s\S]*?grant execute on function public\.customer_order_delivery_proof_snapshot/)?.[0]||'';
  assert.match(fn,/current_customer_id/);
  assert.match(fn,/o\.customer_id=v_customer_id/);
  assert.match(fn,/v_order\.status='EN_ROUTE'/);
  assert.match(fn,/v_proof\.pin_verified_at is null/);
  assert.match(fn,/then v_proof\.pin_code/);
});

test('upload context exige repartidor asignado, pedido EN_ROUTE y método requerido',()=>{
  const fn=migration.match(/create or replace function public\.driver_delivery_proof_upload_context[\s\S]*?grant execute on function public\.driver_delivery_proof_upload_context/)?.[0]||'';
  assert.match(fn,/current_role_code\(\)<>'DELIVERY_DRIVER'/);
  assert.match(fn,/o\.status='EN_ROUTE'/);
  assert.match(fn,/a\.driver_user_id=auth\.uid\(\)/);
  assert.match(fn,/a\.status='ACTIVE'/);
  assert.match(fn,/este pedido no requiere foto/);
  assert.match(fn,/este pedido no requiere firma/);
});

test('registro de media valida prefijo autoritativo delivery/order/kind',()=>{
  const fn=migration.match(/create or replace function public\.driver_register_delivery_proof_media[\s\S]*?grant execute on function public\.driver_register_delivery_proof_media/)?.[0]||'';
  assert.match(fn,/v_prefix:=v_proof\.delivery_id::text\|\|'\/'\|\|p_order_id::text\|\|'\/'\|\|lower\(v_kind\)\|\|'\/'/);
  assert.match(fn,/p_path not like v_prefix\|\|'%'/);
  assert.match(fn,/photo_uploaded_at=now\(\)/);
  assert.match(fn,/signature_uploaded_at=now\(\)/);
});

test('acceso a media autoriza solo actores del pedido y no devuelve URL pública',()=>{
  const fn=migration.match(/create or replace function public\.delivery_proof_media_access_context[\s\S]*?grant execute on function public\.delivery_proof_media_access_context/)?.[0]||'';
  assert.match(fn,/public\.is_master\(\)/);
  assert.match(fn,/user_has_delivery\(v_proof\.delivery_id\)/);
  assert.match(fn,/v_proof\.driver_user_id=auth\.uid\(\)/);
  assert.match(fn,/v_proof\.customer_id=v_customer_id/);
  assert.match(fn,/'bucket','delivery-proofs'/);
  assert.match(fn,/'path',v_path/);
  assert.doesNotMatch(fn,/signed_url/);
});

test('Edge upload usa usuario para autorizar y admin solo para Storage',()=>{
  assert.match(upload,/withSupabase\(\{ auth: "user" \}/);
  assert.match(upload,/ctx\.supabase\.rpc\(\s*"driver_delivery_proof_upload_context"/);
  assert.match(upload,/ctx\.supabaseAdmin\.storage/);
  assert.match(upload,/req\.formData\(\)/);
  assert.match(upload,/5 \* 1024 \* 1024/);
  assert.match(upload,/2 \* 1024 \* 1024/);
  assert.match(upload,/driver_register_delivery_proof_media/);
  assert.doesNotMatch(upload,/SUPABASE_SERVICE_ROLE_KEY/);
});

test('Edge upload revierte archivo si el registro falla y limpia reemplazo',()=>{
  assert.match(upload,/PROOF_REGISTER_FAILED/);
  assert.match(upload,/remove\(\[path\]\)/);
  assert.match(upload,/previousPath/);
  assert.match(upload,/remove\(\[previousPath\]\)/);
});

test('viewer genera URL firmada de cinco minutos tras autorización RPC',()=>{
  assert.match(viewer,/withSupabase\(\{ auth: "user" \}/);
  assert.match(viewer,/delivery_proof_media_access_context/);
  assert.match(viewer,/createSignedUrl\(path, 300\)/);
  assert.match(viewer,/expires_in: 300/);
  assert.doesNotMatch(viewer,/createPublicUrl/);
});

test('ambas Edge Functions exigen JWT',()=>{
  assert.match(config,/\[functions\.delivery-proof-upload\]\s*\nverify_jwt = true/);
  assert.match(config,/\[functions\.delivery-proof-view\]\s*\nverify_jwt = true/);
});

test('DELIVERY UI solo permite activar métodos disponibles en el plan',()=>{
  assert.match(adminHtml,/id="proofRequirePin"/);
  assert.match(adminHtml,/id="proofRequirePhoto"/);
  assert.match(adminHtml,/id="proofRequireSignature"/);
  assert.match(adminHtml,/id="deliveryProofSettingsSave"/);
  assert.match(admin,/available_pin/);
  assert.match(admin,/available_photo/);
  assert.match(admin,/available_signature/);
  assert.match(admin,/state\.role==="DELIVERY_ADMIN"/);
  assert.match(admin,/delivery_save_proof_settings/);
});

test('DRIVER completa PIN, foto y firma y no puede finalizar antes',()=>{
  assert.match(admin,/renderDriverProofPanel/);
  assert.match(admin,/driver_verify_delivery_pin/);
  assert.match(admin,/delivery-proof-upload/);
  assert.match(admin,/data-proof-signature-canvas/);
  assert.match(admin,/canvas\.toBlob/);
  assert.match(admin,/proofReady=!o\.proof\?\.enabled\|\|o\.proof\?\.ready===true/);
  assert.match(admin,/data-next="DELIVERED" '\+\(proofReady\?'':'disabled'\)/);
});

test('DELIVERY puede auditar estado sin recibir PIN',()=>{
  assert.match(admin,/delivery_order_proof_snapshot/);
  assert.match(admin,/data-dispatch-proof/);
  assert.match(admin,/PIN verificado/);
  assert.doesNotMatch(admin,/proof\.pin_code/);
});

test('CLIENT muestra PIN y evidencia desde RPCs seguros',()=>{
  assert.match(orders,/customer_order_delivery_proof_snapshot/);
  assert.match(orders,/PIN de entrega/);
  assert.match(orders,/Compártelo con el repartidor únicamente cuando recibas tu pedido/);
  assert.match(orders,/delivery-proof-view/);
  assert.match(orders,/customerProofCard\(deliveryProof, order\.id\)/);
});

test('scripts principales siguen compilando',()=>{
  assert.doesNotThrow(()=>new Function(admin));
  const scripts=[...orders.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline=scripts.at(-1)?.[1]||'';
  assert.ok(inline.length>0);
  assert.doesNotThrow(()=>new Function(inline));
});
