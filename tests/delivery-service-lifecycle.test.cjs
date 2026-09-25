const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const access=fs.readFileSync('app/acceso.html','utf8');
const plans=fs.readFileSync('supabase/migrations/20260925050023_commercial_plan_assignments_notifications.sql','utf8');

test('vigencia DELIVERY proviene de un plan comercial y no de fechas manuales',()=>{
  assert.match(plans,/master_assign_commercial_plan/);
  assert.match(plans,/duration_months_snapshot/);
  assert.match(plans,/make_interval\(months=>v_plan\.duration_months\)/);
  assert.doesNotMatch(admin,/deliveryWorkspaceServiceStart/);
  assert.doesNotMatch(admin,/deliveryWorkspaceServiceEnd/);
  assert.doesNotMatch(admin,/master_set_delivery_service_period/);
});

test('DELIVERY queda bloqueado si no existe contrato vigente',()=>{
  assert.match(plans,/create or replace function public\.delivery_service_is_active/);
  assert.match(admin,/my_delivery_service_access/);
  assert.match(admin,/renderDeliveryServiceBlocked/);
  assert.match(access,/my_delivery_service_access/);
  assert.match(access,/service=blocked/);
});

test('vigencia avisa dentro de HTPWEB cuando faltan cinco días',()=>{
  assert.match(plans,/ends_at<=now\(\)\+interval '5 days'/);
  assert.match(plans,/create table if not exists public\.notifications/);
  assert.match(plans,/sync_my_plan_notifications/);
  assert.match(plans,/my_notifications/);
  assert.match(admin,/renderDeliveryServiceWarning/);
  assert.match(admin,/Notificaciones HTPWEB|myNotifications/);
});

test('correo SMS cron y proveedores externos quedan retirados',()=>{
  assert.match(plans,/cron\.unschedule/);
  assert.match(plans,/drop table if exists public\.delivery_service_notifications/);
  assert.doesNotMatch(admin,/Twilio|Resend|correo y celular/i);
  assert.equal(fs.existsSync('supabase/functions/delivery-service-reminders/index.ts'),false);
});

test('renovación y downgrade pueden entrar al próximo ciclo',()=>{
  assert.match(plans,/NEXT_CYCLE/);
  assert.match(plans,/RENEW/);
  assert.match(plans,/DOWNGRADE/);
  assert.match(plans,/UPGRADE/);
  assert.match(plans,/selection_reset_required/);
});
