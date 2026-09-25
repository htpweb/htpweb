const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260925114824_commercial_security_hardening.sql','utf8');

test('tarifas usan un snapshot autorizado en lugar del helper interno',()=>{
  assert.match(admin,/rpc\("delivery_fee_capability_status"/);
  assert.doesNotMatch(admin,/rpc\("delivery_has_capability"/);
  assert.match(migration,/delivery_fee_capability_status/);
  assert.match(migration,/public\.is_master\(\)/);
  assert.match(migration,/public\.user_has_delivery\(p_delivery_id\)/);
});

test('helpers internos del plan no quedan expuestos al navegador',()=>{
  assert.match(migration,/revoke execute on function public\.effective_plan_entitlement\(uuid,uuid,text,text\) from public, anon, authenticated/i);
  assert.match(migration,/revoke execute on function public\.delivery_limit_value\(uuid,text\) from public, anon, authenticated/i);
  assert.match(migration,/revoke execute on function public\.delivery_has_capability\(uuid,text\) from public, anon, authenticated/i);
  assert.match(migration,/grant execute on function public\.effective_plan_entitlement\(uuid,uuid,text,text\) to service_role/i);
  assert.match(migration,/grant execute on function public\.delivery_limit_value\(uuid,text\) to service_role/i);
  assert.match(migration,/grant execute on function public\.delivery_has_capability\(uuid,text\) to service_role/i);
});

test('plan_usage_snapshot fija search_path vacío',()=>{
  assert.match(migration,/alter function public\.plan_usage_snapshot\(uuid,uuid\) set search_path = ''/i);
});

test('nuevas relaciones comerciales tienen índices de FK',()=>{
  assert.match(migration,/customer_deliveries_referral_code_idx/);
  assert.match(migration,/delivery_restricted_areas_zone_id_idx/);
  assert.match(migration,/notifications_delivery_id_idx/);
  assert.match(migration,/plan_assignments_previous_assignment_id_idx/);
});
