const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260925185541_stage2_referral_analytics.sql','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

function analyticsFn(){
  return migration.match(/create or replace function public\.delivery_referral_analytics_snapshot[\s\S]*?grant execute on function public\.delivery_referral_analytics_snapshot/)?.[0]||'';
}

test('atribución de referidos vive en private con RLS deny-all',()=>{
  assert.match(migration,/create table if not exists private\.delivery_referral_attributions/);
  assert.match(migration,/alter table private\.delivery_referral_attributions enable row level security/);
  assert.match(migration,/revoke all on table private\.delivery_referral_attributions from public,anon,authenticated/);
  assert.match(migration,/create policy delivery_referral_attributions_deny_all/);
  assert.match(migration,/using\(false\)/);
  assert.match(migration,/with check\(false\)/);
  assert.doesNotMatch(admin,/\.from\(["']delivery_referral_attributions/);
});

test('primer referido queda congelado por cliente y DELIVERY',()=>{
  assert.match(migration,/unique\(delivery_id,customer_id\)/);
  const recorder=migration.match(/create or replace function private\.record_delivery_referral_attribution[\s\S]*?revoke execute on function private\.record_delivery_referral_attribution/)?.[0]||'';
  assert.match(recorder,/on conflict\(delivery_id,customer_id\) do nothing/);
  assert.doesNotMatch(recorder,/do update/);
});

test('backfill solo toma relaciones que ya tienen código válido del mismo DELIVERY',()=>{
  const before=migration.indexOf('create or replace function private.record_delivery_referral_attribution');
  const backfill=migration.slice(0,before);
  assert.match(backfill,/from public\.customer_deliveries cd/);
  assert.match(backfill,/join public\.delivery_referral_codes r/);
  assert.match(backfill,/r\.id=cd\.referral_code_id/);
  assert.match(backfill,/r\.delivery_id=cd\.delivery_id/);
  assert.match(backfill,/where cd\.referral_code_id is not null/);
});

test('claim_delivery_referral registra atribución después de vincular cliente',()=>{
  const fn=migration.match(/create or replace function public\.claim_delivery_referral\([\s\S]*?grant execute on function public\.claim_delivery_referral\(text,text\)/)?.[0]||'';
  const upsert=fn.indexOf('insert into public.customer_deliveries');
  const attribution=fn.indexOf('perform private.record_delivery_referral_attribution');
  assert.ok(upsert>=0&&attribution>upsert);
  assert.match(fn,/v_ref\.delivery_id/);
  assert.match(fn,/v_ref\.id/);
  assert.match(fn,/v_customer/);
  assert.match(fn,/v_source/);
});

test('analytics exige DELIVERY_ADMIN con analytics.view o MASTER',()=>{
  const fn=analyticsFn();
  assert.match(fn,/public\.is_master\(\)/);
  assert.match(fn,/current_role_code\(\)='DELIVERY_ADMIN'/);
  assert.match(fn,/user_has_delivery\(p_delivery_id\)/);
  assert.match(fn,/has_permission\('analytics\.view'\)/);
});

test('referrals.analytics controla disponibilidad del reporte',()=>{
  const fn=analyticsFn();
  assert.match(fn,/delivery_has_capability\(\s*p_delivery_id,\s*'referrals\.analytics'/);
  assert.match(fn,/'available',false/);
  assert.match(fn,/'codes','\[\]'::jsonb/);
  assert.match(fn,/'available',true/);
});

test('rango inválido o mayor a 366 días se rechaza',()=>{
  const fn=analyticsFn();
  assert.match(fn,/if v_from>=v_to/);
  assert.match(fn,/rango de fechas inválido/);
  assert.match(fn,/v_to-v_from>interval '366 days'/);
  assert.match(fn,/rango máximo de analítica es 366 días/);
});

test('pedidos solo se atribuyen si ocurren después del primer referido',()=>{
  const fn=analyticsFn();
  const matches=[...fn.matchAll(/o\.created_at>=a\.attributed_at/g)];
  assert.ok(matches.length>=5,'Debe proteger todos los agregados de pedidos contra compras previas al referido');
  assert.match(fn,/o\.created_at>=v_from/);
  assert.match(fn,/o\.created_at<v_to/);
});

test('facturación atribuida usa únicamente pedidos DELIVERED',()=>{
  const fn=analyticsFn();
  assert.match(fn,/'delivered_revenue'/);
  assert.match(fn,/sum\(o\.total\)/);
  assert.match(fn,/o\.status='DELIVERED'/);
  assert.match(fn,/'cancelled_orders_in_period'/);
});

test('desglose por código distingue código y enlace',()=>{
  const fn=analyticsFn();
  assert.match(fn,/'code_customers_total'/);
  assert.match(fn,/a\.relationship_source='REFERRAL_CODE'/);
  assert.match(fn,/'link_customers_total'/);
  assert.match(fn,/a\.relationship_source='REFERRAL_LINK'/);
  assert.match(fn,/'last_attributed_at'/);
});

test('ticket promedio se calcula solo sobre entregas',()=>{
  const fn=analyticsFn();
  assert.match(fn,/'average_delivered_ticket'/);
  assert.match(fn,/o_stats\.delivered_orders_in_period/);
  assert.match(fn,/o_stats\.delivered_revenue/);
});

test('índice soporta recorrido DELIVERY cliente fecha de pedidos',()=>{
  assert.match(migration,/idx_orders_delivery_customer_created/);
  assert.match(migration,/on public\.orders\(delivery_id,customer_id,created_at\)/);
});

test('UI incluye rango, KPIs y tabla de analítica',()=>{
  assert.match(html,/Analítica de referidos/);
  assert.match(html,/id="networkReferralAnalyticsFrom"/);
  assert.match(html,/id="networkReferralAnalyticsTo"/);
  assert.match(html,/id="networkReferralAnalyticsRefresh"/);
  assert.match(html,/id="networkReferralAnalyticsKpis"/);
  assert.match(html,/id="networkReferralAnalyticsTable"/);
});

test('UI explica primer referido y facturación DELIVERED',()=>{
  assert.match(html,/atribución queda fijada al primer referido válido/i);
  assert.match(html,/pedidos DELIVERED/i);
  assert.match(admin,/La compra solo se atribuye después del primer referido válido/);
});

test('UI respeta capability y carga RPC solo dentro del DELIVERY seleccionado',()=>{
  assert.match(admin,/ent\["referrals\.analytics"\]===true/);
  assert.match(admin,/referralAnalytics:referralAnalyticsEnabled/);
  assert.match(admin,/delivery_referral_analytics_snapshot/);
  assert.match(admin,/p_delivery_id:networkDeliveryId\(\)/);
  assert.match(admin,/networkReferralAnalyticsRefresh/);
});

test('UI muestra métricas comerciales y desglose de origen',()=>{
  assert.match(admin,/Referidos históricos/);
  assert.match(admin,/Nuevos en periodo/);
  assert.match(admin,/Compradores en periodo/);
  assert.match(admin,/Facturación entregada/);
  assert.match(admin,/Código /);
  assert.match(admin,/Enlace /);
  assert.match(admin,/average_delivered_ticket/);
});

test('UI convierte Hasta en límite exclusivo del día siguiente',()=>{
  const start=admin.indexOf('function referralAnalyticsRange(){');
  const end=admin.indexOf('function referralAnalyticsMoney',start);
  assert.ok(start>=0&&end>start);
  const fn=admin.slice(start,end);
  assert.match(fn,/to\.setDate\(to\.getDate\(\)\+1\)/);
  assert.match(fn,/from:from\.toISOString\(\),to:to\.toISOString\(\)/);
});

test('admin.js sigue compilando tras cerrar Etapa 2',()=>{
  assert.doesNotThrow(()=>new Function(admin));
});
