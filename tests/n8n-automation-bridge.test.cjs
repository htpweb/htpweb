const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const bridge=fs.readFileSync('supabase/migrations/20260929051602_n8n_automation_bridge_queue.sql','utf8');
const retire=fs.readFileSync('supabase/migrations/20261002032302_retire_n8n_runtime_bridge.sql','utf8');
const revoke=fs.readFileSync('supabase/migrations/20261002032426_retire_n8n_public_rpc_access.sql','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');

test('puente n8n histórico no contiene credenciales en repositorio',()=>{
  assert.match(bridge,/private\.automation_jobs/);
  assert.match(bridge,/automation_bridge_authorized/);
  assert.doesNotMatch(bridge,/values\s*\(\s*['"]N8N['"]\s*,\s*['"][a-f0-9]{64}['"]/i);
  assert.doesNotMatch(bridge,/sb_publishable_[A-Za-z0-9_-]+/);
});

test('runtime n8n queda retirado sin romper los flujos directos',()=>{
  assert.match(retire,/active=false/);
  assert.match(retire,/status='CANCELLED'/);
  assert.match(retire,/drop trigger if exists trg_order_locals_enqueue_n8n_events/);
  assert.match(retire,/drop trigger if exists trg_order_driver_plans_enqueue_n8n/);
  assert.match(retire,/drop trigger if exists trg_order_driver_assignments_enqueue_n8n/);
  assert.match(revoke,/revoke execute on function public\.automation_claim_jobs/);
  assert.doesNotMatch(admin,/delivery_enqueue_local_order_automation/);
  assert.match(admin,/htpWhatsappOpenAssisted/);
});

test('JavaScript administrativo compila sin depender de n8n',()=>{
  assert.doesNotThrow(()=>new Function(admin));
});
