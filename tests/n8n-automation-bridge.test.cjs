const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const bridge=fs.readFileSync('supabase/migrations/20260929051600_n8n_automation_bridge_queue.sql','utf8');
const events=fs.readFileSync('supabase/migrations/20260929052600_n8n_operational_events.sql','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');

test('puente n8n usa cola privada y secreto hash sin credencial en repositorio',()=>{
  assert.match(bridge,/private\.automation_jobs/);
  assert.match(bridge,/private\.automation_bridge_settings/);
  assert.match(bridge,/automation_bridge_authorized/);
  assert.match(bridge,/extensions\.digest/);
  assert.match(bridge,/automation_claim_jobs/);
  assert.match(bridge,/automation_complete_job/);
  assert.doesNotMatch(bridge,/htpweb-automation-secret/i);
});

test('eventos operativos entran a la cola sin reemplazar el flujo asistido',()=>{
  for(const event of [
    'LOCAL_ORDER_REQUESTED','LOCAL_ETA_CONFIRMED','LOCAL_READY',
    'DRIVER_PLANNED','DRIVER_ASSIGNED','DRIVER_UNASSIGNED'
  ]) assert.match(events,new RegExp(event));
  assert.match(events,/automation_local_order_context/);
  assert.match(events,/automation_driver_context/);
  assert.match(admin,/delivery_enqueue_local_order_automation/);
  assert.match(admin,/htpWhatsappOpenAssisted/);
});

test('JavaScript administrativo sigue compilando con el puente n8n',()=>{
  assert.doesNotThrow(()=>new Function(admin));
});
