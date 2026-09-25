const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('admin/monetizacion.html','utf8');
const js=fs.readFileSync('admin/monetization.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260925115840_commercial_subscription_contract_hardening.sql','utf8');

test('MASTER define precio, moneda, duración y prestaciones del plan',()=>{
  assert.match(html,/id="price"/);
  assert.match(html,/id="currency"/);
  assert.match(html,/id="durationMonths"/);
  assert.match(html,/Capacidad y funciones incluidas/);
  assert.match(js,/p_currency:currency/);
  assert.match(js,/p_duration_months/);
  assert.match(js,/p_entitlements:collectEntitlements/);
  assert.match(migration,/p_currency text/);
  assert.match(migration,/currency=excluded\.currency/);
});

test('HTPWEB decide automáticamente la vigencia de altas y cambios',()=>{
  assert.doesNotMatch(html,/id="effectiveMode"/);
  assert.doesNotMatch(js,/\$\("effectiveMode"\)/);
  assert.match(js,/p_effective_mode:"AUTO"/);
  assert.match(migration,/v_change in \('RENEW','DOWNGRADE'\)/);
  assert.match(migration,/then 'NEXT_CYCLE'/);
  assert.match(migration,/else 'NOW'/);
});

test('cada contratación congela versión, precio, moneda, duración y prestaciones',()=>{
  assert.match(migration,/plan_version_snapshot/);
  assert.match(migration,/v_plan\.plan_version/);
  assert.match(migration,/plan_name_snapshot,price_snapshot,currency_snapshot,duration_months_snapshot/);
  assert.match(migration,/plan_assignment_entitlements/);
  assert.match(migration,/'plan_version',coalesce\(v_current\.plan_version_snapshot/);
  assert.match(js,/Versión contratada/);
});

test('Excepciones MASTER escribe por RPC seguro y no por tabla directa',()=>{
  assert.match(migration,/create or replace function public\.master_set_plan_override/);
  assert.match(migration,/security definer/);
  assert.match(migration,/if not public\.is_master\(\)/);
  assert.match(migration,/set search_path=''/);
  assert.doesNotMatch(js,/\.from\("plan_entitlement_overrides"\)/);
});
