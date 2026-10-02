const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20261002191000_master_express_slots.sql','utf8');
const edge=fs.readFileSync('supabase/functions/create-express-demo/index.ts','utf8');
const expressHtml=fs.readFileSync('express/index.html','utf8');

test('MASTER incluye modulo Express Demo',()=>{
  assert.match(admin,/expressdemo/);
  assert.match(admin,/loadExpressDemoSlots/);
  assert.match(html,/data-section="expressdemo"/);
  assert.match(html,/id="section-expressdemo"/);
});

test('MASTER genera express1 express2 express3',()=>{
  assert.match(migration,/\('express1'\),\('express2'\),\('express3'\)/);
  assert.match(admin,/EXPRESS_DEMO_ROOT/);
  assert.match(admin,/Copiar link/);
  assert.match(admin,/Liberar/);
});

test('cada link Express se consume una sola vez hasta liberarlo en MASTER',()=>{
  assert.match(edge,/slot_key/);
  assert.match(edge,/express_demo_slots/);
  assert.match(edge,/Este link Express ya fue utilizado/);
  assert.match(edge,/\.is\("demo_id", null\)/);
  assert.match(migration,/master_reset_express_slot/);
});

test('alta Express exige slot generado por MASTER',()=>{
  assert.match(expressHtml,/URLSearchParams\(location\.search\)\.get\("slot"\)/);
  assert.match(expressHtml,/slot_key:slotKey/);
  assert.match(expressHtml,/Solicita un link a HTPWEB/);
});
