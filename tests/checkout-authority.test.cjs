const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const authority=fs.readFileSync('supabase/migrations/20260925123758_checkout_zone_and_limit_authority.sql','utf8');
const fees=fs.readFileSync('supabase/migrations/20260925050557_commercial_plan_fee_integration.sql','utf8');
const order=fs.readFileSync('supabase/migrations/20260919062000_fix_create_order_transaction_ambiguity.sql','utf8');
const edge=fs.readFileSync('supabase/functions/crear-pedido/index.ts','utf8');

test('un plan comercial no hereda LIMIT legacy ausente',()=>{
  const planGuard=authority.indexOf('if v_has_plan then');
  const legacy=authority.indexOf("delivery_limit_value_legacy");
  assert.ok(planGuard>=0);
  assert.ok(legacy>planGuard);
  assert.match(authority,/if v_has_plan then\s+return null;/i);
});

test('checkout exige cobertura antes de área restringida y red de clientes',()=>{
  const coverage=authority.indexOf("'OUTSIDE_COVERAGE'");
  const restricted=authority.indexOf("'RESTRICTED_AREA'");
  const network=authority.indexOf('delivery_customer_access_mode_at');
  assert.ok(coverage>=0);
  assert.ok(restricted>coverage);
  assert.ok(network>restricted);
  assert.match(authority,/zones\.active\.max/);
  assert.match(authority,/htp_zone_contains/);
});

test('checkout bloquea cobertura sin configurar o por encima del plan',()=>{
  assert.match(authority,/COVERAGE_NOT_AVAILABLE/);
  assert.match(authority,/COVERAGE_NOT_CONFIGURED/);
  assert.match(authority,/v_zone_count>v_zone_limit/);
  assert.match(authority,/PLAN_RECONFIGURATION_REQUIRED/);
});

test('distancia del navegador no tiene autoridad y ORS calcula la real',()=>{
  assert.match(edge,/const localIds = body\.locals\.map\(\(local\)=>local\?\.local_id\)/);
  assert.match(edge,/calculateRouteDistance/);
  assert.match(edge,/localsWithDistance/);
  assert.match(edge,/body\.locals\.distance_km:\s*NO SE UTILIZA|body\.locals\.distance_km/);
  assert.doesNotMatch(edge,/distance_km:\s*local\?\.distance_km/);
});

test('precios de productos y variantes se releen en SQL',()=>{
  assert.match(order,/FROM public\.products AS p/);
  assert.match(order,/p\.price/);
  assert.match(order,/FROM public\.product_variants AS pv/);
  assert.match(order,/pv\.price/);
  assert.match(order,/v_item_subtotal :=\s*ROUND\(v_unit_price \* v_quantity, 2\)/);
});

test('tarifa final se calcula en backend según capability del plan',()=>{
  assert.match(order,/public\.calculate_delivery_fee/);
  assert.match(fees,/delivery_fee_mode_enabled/);
  assert.match(fees,/delivery_fees\.fixed/);
  assert.match(fees,/delivery_fees\.distance/);
  assert.match(fees,/delivery_fees\.day_night/);
  assert.match(fees,/America\/Guayaquil/);
});

test('Edge comunica decisiones de cobertura y conserva JWT',()=>{
  assert.match(edge,/COVERAGE_NOT_AVAILABLE/);
  assert.match(edge,/COVERAGE_NOT_CONFIGURED/);
  assert.match(edge,/OUTSIDE_COVERAGE/);
  assert.match(edge,/auth\.getUser\(accessToken\)/);
});
