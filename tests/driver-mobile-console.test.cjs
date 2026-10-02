const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260928135622_driver_mobile_console_common_operations.sql','utf8');
const terminal=fs.readFileSync('supabase/migrations/20260928140624_driver_mobile_console_terminal_return.sql','utf8');
const centerMigration=fs.readFileSync('supabase/migrations/20260928140952_order_control_driver_pickup_progress.sql','utf8');
const track=fs.readFileSync('supabase/functions/quick-driver-track/index.ts','utf8');
const proof=fs.readFileSync('supabase/functions/quick-driver-proof-upload/index.ts','utf8');
const mobile=fs.readFileSync('app/repartidor-rapido.html','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');

test('contexto móvil entrega cliente, factura, locales y productos',()=>{
  assert.match(migration,/'customer_name'/);
  assert.match(migration,/'customer_phone'/);
  assert.match(migration,/'delivery_address'/);
  assert.match(migration,/'requires_invoice'/);
  assert.match(migration,/'document_type'/);
  assert.match(migration,/'document_number'/);
  assert.match(migration,/'invoice_email'/);
  assert.match(migration,/'locals'/);
  assert.match(migration,/'items'/);
  assert.match(migration,/'product_name'/);
  assert.match(migration,/'variant_name'/);
  assert.match(migration,/'quantity'/);
});

test('REGULAR y EMERGENCY usan el mismo token y contexto operativo',()=>{
  assert.match(migration,/ud\.driver_mode<>'EMERGENCY'/);
  assert.match(migration,/emergency_expires_at>now\(\)/);
  assert.match(migration,/quick_driver_tracking_context/);
  assert.match(admin,/Tipo: ".+EMERGENCIA.+REGULAR/s);
  assert.match(admin,/Consola de repartidor/);
});

test('progreso por LOCAL soporta llegada y recogida sin alterar estado comercial del LOCAL',()=>{
  assert.match(migration,/private\.driver_order_stop_progress/);
  assert.match(migration,/PENDING','ARRIVED','PICKED_UP/);
  assert.match(migration,/quick_driver_stop_action/);
  assert.match(migration,/primero marca que llegaste al LOCAL/);
  assert.match(migration,/el LOCAL todavía no marcó este pedido como READY/);
  assert.match(migration,/pickup_progress/);
});

test('pedido no inicia entrega hasta recoger todos los LOCAL',()=>{
  assert.match(migration,/quick_driver_set_order_status/);
  assert.match(migration,/debes confirmar la recogida de todos los LOCAL/);
  assert.match(migration,/EN_ROUTE','DELIVERED/);
  assert.match(terminal,/exception when others/);
  assert.match(terminal,/'access_closed',true/);
});

test('prueba de entrega móvil conserva PIN foto y firma',()=>{
  assert.match(migration,/quick_driver_verify_delivery_pin/);
  assert.match(migration,/quick_driver_proof_upload_context/);
  assert.match(migration,/quick_driver_register_proof_media/);
  assert.match(proof,/quick_driver_proof_upload_context/);
  assert.match(proof,/quick_driver_register_proof_media/);
  assert.match(proof,/delivery-proofs/);
  assert.match(config,/\[functions\.quick-driver-proof-upload\]\s*\nverify_jwt = false/);
});

test('ruta móvil usa carretera y deja cliente como última parada',()=>{
  assert.match(track,/ORS_MATRIX_URL/);
  assert.match(track,/ORS_GEOJSON_URL/);
  assert.match(track,/nearestRoadOrder/);
  assert.match(track,/pickup_status!==["']PICKED_UP["']/);
  assert.match(track,/orderedNodes=\[nodes\[0\],\.\.\.localOrder\.map\(i=>nodes\[i\]\),nodes\[customerIndex\]\]/);
  assert.match(track,/profile:"driving-car"/);
});

test('consola móvil muestra contactos productos facturación ruta y acciones',()=>{
  assert.match(mobile,/Consola móvil de reparto/);
  assert.match(mobile,/Cliente y entrega final/);
  assert.match(mobile,/Datos de facturación solicitados/);
  assert.match(mobile,/Recogidas/);
  assert.match(mobile,/Llegué al LOCAL/);
  assert.match(mobile,/Confirmar recogido/);
  assert.match(mobile,/Iniciar entrega al cliente/);
  assert.match(mobile,/Marcar entregado/);
  assert.match(mobile,/Llamar /);
  assert.match(mobile,/WhatsApp /);
  assert.match(mobile,/Calcular ruta/);
  assert.match(mobile,/quick-driver-proof-upload/);
});

test('centro de control recibe progreso de recogidas',()=>{
  assert.match(centerMigration,/'pickup_status'/);
  assert.match(centerMigration,/'arrived_at'/);
  assert.match(centerMigration,/'picked_up_at'/);
  assert.match(admin,/pickup_status&&ol\.pickup_status!=="PENDING"/);
  assert.match(admin,/Repartidor llegó/);
  assert.match(admin,/Recogido/);
});

test('JavaScript del admin y consola móvil compila',()=>{
  assert.doesNotThrow(()=>new Function(admin));
  const scripts=[...mobile.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline=scripts.at(-1)?.[1]||'';
  assert.ok(inline.length>0);
  assert.doesNotThrow(()=>new Function(inline));
});