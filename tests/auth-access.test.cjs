const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const access=fs.readFileSync('app/acceso.html','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20260925030000_single_login_delivery_authorization.sql','utf8');

test('single login claims authorized DELIVERY access before routing',()=>{
  assert.match(access,/signInWithPassword/);
  assert.match(access,/claim_my_delivery_authorizations/);
  assert.match(access,/authenticatedDestination/);
  assert.match(access,/MASTER/);
  assert.match(access,/DELIVERY_ADMIN/);
  assert.match(access,/\.\.\/admin\/index\.html/);
  assert.match(access,/signUp/);
});

test('DELIVERY account tab preauthorizes representative instead of self-escalation',()=>{
  assert.match(admin,/Representante autorizado/);
  assert.match(admin,/deliveryWorkspaceRepresentativeName/);
  assert.match(admin,/deliveryWorkspaceRepresentativeId/);
  assert.match(admin,/deliveryWorkspaceRepresentativeEmail/);
  assert.match(admin,/master_authorize_delivery_representative/);
  assert.match(admin,/master_revoke_delivery_authorization/);
  assert.doesNotMatch(admin,/deliveryWorkspaceConvert/);
});

test('authorization is bound to confirmed auth email and protects CI at rest',()=>{
  assert.match(migration,/create table if not exists public\.delivery_access_authorizations/);
  assert.match(migration,/national_id_hash text not null/);
  assert.match(migration,/national_id_last4 text not null/);
  assert.match(migration,/extensions\\.crypt\\(v_national_id,extensions\\.gen_salt\\('bf',10\\)\\)/);
  assert.match(migration,/select lower\(u\.email\), \(u\.email_confirmed_at is not null\)/);
  assert.match(migration,/where u\.id=v_user_id/);
  assert.match(migration,/lower\(a\.email\)=v_email/);
  assert.match(migration,/alter table public\.delivery_access_authorizations enable row level security/);
  assert.match(migration,/revoke all on table public\.delivery_access_authorizations from anon, authenticated/);
});

test('customer context can coexist with administrative role',()=>{
  assert.match(migration,/create or replace function public\.current_customer_id/);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.current_customer_id\(\)[\s\S]*?\$function\$;/)?.[0]||'',
    /r\.code = 'CLIENT'/
  );
  assert.match(migration,/CUSTOMER ya puede coexistir/);
});
