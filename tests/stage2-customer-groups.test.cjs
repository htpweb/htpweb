const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260925182904_stage2_customer_groups.sql','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

test('grupos y membresías viven en private con deny-all',()=>{
  assert.match(migration,/create table if not exists private\.delivery_customer_groups/);
  assert.match(migration,/create table if not exists private\.delivery_customer_group_members/);
  assert.match(migration,/revoke all on table private\.delivery_customer_groups from public,anon,authenticated/);
  assert.match(migration,/revoke all on table private\.delivery_customer_group_members from public,anon,authenticated/);
  assert.match(migration,/create policy delivery_customer_groups_deny_all/);
  assert.match(migration,/create policy delivery_customer_group_members_deny_all/);
  assert.match(migration,/using\(false\)/);
  assert.match(migration,/with check\(false\)/);
});

test('nombres de grupo son únicos por DELIVERY ignorando mayúsculas y espacios',()=>{
  assert.match(migration,/delivery_customer_groups_name_ci_idx/);
  assert.match(migration,/delivery_id,lower\(trim\(name\)\)/);
  assert.match(migration,/ya existe un grupo con ese nombre/);
});

test('snapshot de grupos exige actor autorizado y capability customers.groups',()=>{
  const fn=migration.match(/create or replace function public\.delivery_customer_groups_snapshot[\s\S]*?grant execute on function public\.delivery_customer_groups_snapshot/)?.[0]||'';
  assert.match(fn,/public\.is_master\(\)/);
  assert.match(fn,/current_role_code\(\)='DELIVERY_ADMIN'/);
  assert.match(fn,/user_has_delivery\(p_delivery_id\)/);
  assert.match(fn,/customers\.view/);
  assert.match(fn,/delivery_has_capability\(p_delivery_id,'customers\.groups'\)/);
  assert.match(fn,/'available',false/);
});

test('solo DELIVERY_ADMIN con customers.manage puede crear o editar grupos',()=>{
  const fn=migration.match(/create or replace function public\.delivery_save_customer_group[\s\S]*?grant execute on function public\.delivery_save_customer_group/)?.[0]||'';
  assert.match(fn,/current_role_code\(\)<>'DELIVERY_ADMIN'/);
  assert.match(fn,/user_has_delivery\(p_delivery_id\)/);
  assert.match(fn,/has_permission\('customers\.manage'\)/);
  assert.match(fn,/delivery_has_capability\(p_delivery_id,'customers\.groups'\)/);
  assert.match(fn,/char_length\(v_name\)<1 or char_length\(v_name\)>120/);
  assert.match(fn,/char_length\(v_description\)>300/);
});

test('eliminar grupo no elimina clientes ni relaciones CUSTOMER/DELIVERY',()=>{
  const fn=migration.match(/create or replace function public\.delivery_delete_customer_group[\s\S]*?grant execute on function public\.delivery_delete_customer_group/)?.[0]||'';
  assert.match(fn,/delete from private\.delivery_customer_groups/);
  assert.doesNotMatch(fn,/delete from public\.customers/);
  assert.doesNotMatch(fn,/delete from public\.customer_deliveries/);
});

test('membresía acepta únicamente clientes ya vinculados al mismo DELIVERY',()=>{
  const fn=migration.match(/create or replace function public\.delivery_set_customer_group_members[\s\S]*?grant execute on function public\.delivery_set_customer_group_members/)?.[0]||'';
  assert.match(fn,/join public\.customer_deliveries cd/);
  assert.match(fn,/cd\.customer_id=requested\.customer_id/);
  assert.match(fn,/cd\.delivery_id=p_delivery_id/);
  assert.match(fn,/uno o más clientes no pertenecen a este DELIVERY/);
  assert.match(fn,/máximo 2000 clientes por grupo/);
});

test('membresía se reemplaza atómicamente dentro del grupo',()=>{
  const fn=migration.match(/create or replace function public\.delivery_set_customer_group_members[\s\S]*?grant execute on function public\.delivery_set_customer_group_members/)?.[0]||'';
  const remove=fn.indexOf('delete from private.delivery_customer_group_members');
  const insert=fn.indexOf('insert into private.delivery_customer_group_members');
  assert.ok(remove>=0&&insert>remove);
  assert.match(fn,/select distinct customer_id/);
  assert.match(fn,/return public\.delivery_customer_groups_snapshot\(p_delivery_id\)/);
});

test('grupos no alteran por sí solos permisos de compra',()=>{
  assert.doesNotMatch(migration,/allow_orders\s*=/);
  assert.doesNotMatch(migration,/update public\.customer_deliveries/);
  assert.doesNotMatch(migration,/delivery_save_customer_access_settings/);
  assert.doesNotMatch(migration,/delivery_replace_customer_access_rules/);
});

test('UI integra grupos dentro de Clientes y referidos',()=>{
  assert.match(html,/Grupos de clientes/);
  assert.match(html,/id="networkGroupNew"/);
  assert.match(html,/id="networkGroupSave"/);
  assert.match(html,/id="networkGroupMembersPanel"/);
  assert.match(html,/id="networkGroupMembersSave"/);
});

test('UI carga grupos junto con la red de clientes y respeta el plan',()=>{
  assert.match(admin,/delivery_customer_groups_snapshot/);
  assert.match(admin,/ent\["customers\.groups"\]===true/);
  assert.match(admin,/groupsEnabled=ent\["customers\.groups"\]===true&&groupsSnapshot\?\.available===true/);
  assert.match(admin,/groups:groupsEnabled/);
  assert.match(admin,/El plan vigente no incluye grupos de clientes/);
});

test('UI reutiliza clientes vinculados como candidatos a miembros',()=>{
  assert.match(admin,/const customers=Array\.isArray\(networkState\.customers\)\?networkState\.customers:\[\]/);
  assert.match(admin,/data-group-customer/);
  assert.match(admin,/customer\.customer_id/);
  assert.match(admin,/customer\.relationship_source/);
});

test('UI cubre crear editar eliminar y guardar miembros',()=>{
  assert.match(admin,/delivery_save_customer_group/);
  assert.match(admin,/delivery_delete_customer_group/);
  assert.match(admin,/delivery_set_customer_group_members/);
  assert.match(admin,/resetNetworkGroupForm/);
  assert.match(admin,/renderNetworkGroupMembers/);
  assert.match(admin,/saveNetworkGroupMembers/);
});

test('solo clientes marcados se envían al RPC de membresía',()=>{
  const start=admin.indexOf('async function saveNetworkGroupMembers(){');
  const end=admin.indexOf('async function loadCustomerNetwork(){',start);
  assert.ok(start>=0&&end>start);
  const fn=admin.slice(start,end);
  assert.match(fn,/querySelectorAll\("\[data-group-customer\]:checked"\)/);
  assert.match(fn,/p_customer_ids:ids/);
});

test('admin.js sigue compilando',()=>{
  assert.doesNotThrow(()=>new Function(admin));
});
