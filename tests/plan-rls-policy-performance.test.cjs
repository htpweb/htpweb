const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync(
  'supabase/migrations/20260925195600_plan_rls_policy_performance.sql',
  'utf8'
);

for(const table of ['plan_assignments','plan_entitlements','subscription_plans']){
  test(table+' elimina master_all para evitar SELECT permisivo duplicado',()=>{
    assert.match(
      migration,
      new RegExp('drop policy if exists '+table+'_master_all on public\\.'+table,'i')
    );
  });

  test(table+' conserva escritura exclusiva MASTER por comando',()=>{
    for(const action of ['insert','update','delete']){
      assert.match(
        migration,
        new RegExp(
          'create policy '+table+'_master_'+action+'[\\s\\S]*?on public\\.'+table+
          '[\\s\\S]*?for '+action+'[\\s\\S]*?to authenticated',
          'i'
        )
      );
    }
    assert.match(
      migration,
      new RegExp('public\\.monetization_is_master\\(\\)','i')
    );
  });
}

test('no recrea políticas ALL que volverían a duplicar SELECT',()=>{
  assert.doesNotMatch(migration,/for\s+all/i);
});
