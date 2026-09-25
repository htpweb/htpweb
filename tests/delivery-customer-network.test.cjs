const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const adminHtml=fs.readFileSync('admin/index.html','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const access=fs.readFileSync('app/acceso.html','utf8');
const checkout=fs.readFileSync('supabase/functions/crear-pedido/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260925121909_delivery_contacts_referral_links.sql','utf8');
const referralGuard=fs.readFileSync('supabase/migrations/20260925122813_referral_preserves_delivery_block.sql','utf8');

test('contacts.import tiene flujo real cerrado por RPC',()=>{
  assert.match(migration,/create table if not exists public\.delivery_contacts/);
  assert.match(migration,/revoke all on table public\.delivery_contacts from anon,authenticated/);
  assert.match(migration,/delivery_import_contacts/);
  assert.match(migration,/delivery_contacts_snapshot/);
  assert.match(migration,/delivery_set_contact_active/);
  assert.match(migration,/delivery_has_capability\(p_delivery_id,'contacts\.import'\)/);
  assert.match(adminHtml,/id="networkContactsInput"/);
  assert.match(adminHtml,/id="networkImportContacts"/);
  assert.match(admin,/delivery_import_contacts/);
  assert.match(admin,/delivery_contacts_snapshot/);
});

test('contactos privados se reconocen sin saltar relaciones bloqueadas',()=>{
  assert.match(migration,/v_relation\.active is null[\s\S]*?v_mode='PRIVATE'[\s\S]*?delivery_contacts/);
  assert.match(migration,/v_source:='CONTACT'/);
  assert.match(migration,/if v_relation\.active is not null then[\s\S]*?CUSTOMER_BLOCKED/);
  assert.match(checkout,/\["PUBLIC", "CONTACT"\]\.includes\(policy\?\.relationship_source\)/);
  assert.match(checkout,/relationship_source: relationshipSource/);
  assert.doesNotMatch(checkout,/relationship_source:\s*"PUBLIC"/);
});

test('APPROVAL_REQUIRED exige capability customers.approval',()=>{
  const checks=migration.match(/customers\.approval/g)||[];
  assert.ok(checks.length>=2);
  assert.match(migration,/v_mode='APPROVAL_REQUIRED'[\s\S]*?delivery_has_capability\(p_delivery_id,'customers\.approval'\)/);
  assert.match(admin,/approvalEnabled=ent\["customers\.approval"\]===true/);
  assert.match(admin,/approvalOption\.disabled=!approvalEnabled/);
});

test('código y enlace de referido conservan origen distinto',()=>{
  assert.match(migration,/p_source text/);
  assert.match(migration,/REFERRAL_CODE','REFERRAL_LINK/);
  assert.match(migration,/v_source='REFERRAL_LINK'[\s\S]*?'referrals\.links'/);
  assert.match(migration,/v_source='REFERRAL_CODE'[\s\S]*?'referrals\.codes'/);
  assert.match(access,/p_source: source/);
  assert.match(access,/claimReferral\(referralCodeParam, "REFERRAL_LINK"\)/);
  assert.match(access,/claimReferral\(\$\("referralCode"\)\.value, "REFERRAL_CODE"\)/);
  assert.match(admin,/url\.searchParams\.set\("ref",code\)/);
  assert.match(admin,/Copiar enlace/);
});

test('red privada mantiene horarios nocturnos y origen visible',()=>{
  assert.match(adminHtml,/red abierta de día y privada desde las 18:00 hasta las 06:00/i);
  assert.match(admin,/relationship_source/);
  assert.match(admin,/Contactos:/);
  assert.match(admin,/Enlaces:/);
  assert.match(admin,/Aprobación:/);
});

test('script inline de acceso compila después de integrar referidos',()=>{
  const scripts=[...access.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const inline=scripts.at(-1)?.[1]||'';
  assert.ok(inline.length>0);
  assert.doesNotThrow(()=>new Function(inline));
});

test('un referido no puede reactivar un cliente bloqueado por DELIVERY',()=>{
  assert.match(referralGuard,/v_existing\.active is distinct from true/);
  assert.match(referralGuard,/v_existing\.allow_orders is distinct from true/);
  assert.match(referralGuard,/un referido no puede reactivarlo/);
  const conflict=referralGuard.match(/on conflict\(customer_id,delivery_id\)[\s\S]*?return jsonb_build_object/)?.[0]||'';
  assert.doesNotMatch(conflict,/active=true/);
  assert.doesNotMatch(conflict,/allow_orders=true/);
});
