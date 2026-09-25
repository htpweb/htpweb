const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync(
  'supabase/migrations/20260925194827_post_stage2_security_hardening.sql',
  'utf8'
);

test('post Stage 2 fija search_path del helper señalado por advisor',()=>{
  assert.match(
    migration,
    /alter function public\.raise_exception_bool\(text\)[\s\S]*?set search_path = pg_catalog/i
  );
});

test('helpers internos LOCAL dejan de ser RPC directos para browser roles',()=>{
  for(const fn of [
    'htp_validate_local_delivery_zone\\(\\)',
    'user_can_manage_local_resource\\(uuid,text,text\\)',
    'local_effective_limit_value\\(uuid,text\\)',
    'local_has_effective_capability\\(uuid,text\\)'
  ]){
    assert.match(
      migration,
      new RegExp('revoke execute on function public\\.'+fn+'[\\s\\S]*?from public, anon, authenticated','i')
    );
  }
});

test('workspace MASTER conserva authenticated pero elimina acceso anónimo heredado',()=>{
  assert.match(
    migration,
    /revoke execute on function public\.master_save_delivery_workspace[\s\S]*?from public, anon/i
  );
  assert.match(
    migration,
    /grant execute on function public\.master_save_delivery_workspace[\s\S]*?to authenticated, service_role/i
  );
});

test('índice único duplicado se elimina sin tocar la primary key',()=>{
  assert.match(migration,/drop index if exists public\.uq_local_deliveries_local_delivery/i);
  assert.doesNotMatch(migration,/drop index[\s\S]*?local_deliveries_pkey/i);
});
