const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const access=fs.readFileSync('app/acceso.html','utf8');
const plans=fs.readFileSync('supabase/migrations/20260925050023_commercial_plan_assignments_notifications.sql','utf8');
const expiry=fs.readFileSync('supabase/migrations/20260925124501_plan_expiry_countdown_notifications.sql','utf8');
const reminder=fs.readFileSync('supabase/functions/delivery-service-reminders/index.ts','utf8');

test('MASTER asigna duración mediante plan y no fechas manuales',()=>{
  const page=fs.readFileSync('admin/monetizacion.html','utf8');
  const js=fs.readFileSync('admin/monetization.js','utf8');
  assert.match(page,/Duración/);
  assert.match(js,/master_assign_commercial_plan/);
  assert.doesNotMatch(admin,/deliveryWorkspaceServiceStart/);
  assert.doesNotMatch(admin,/deliveryWorkspaceServiceEnd/);
});

test('DELIVERY queda bloqueado si no tiene plan vigente',()=>{
  assert.match(plans,/create or replace function public\.delivery_service_is_active/);
  assert.match(admin,/my_delivery_service_access/);
  assert.match(admin,/renderDeliveryServiceBlocked/);
  assert.match(access,/my_delivery_service_access/);
  assert.match(access,/service=blocked/);
});

test('vencimiento genera cuenta regresiva interna desde cinco días antes',()=>{
  assert.match(expiry,/sync_my_plan_notifications/);
  assert.match(expiry,/interval '5 days'/);
  assert.match(expiry,/PLAN_EXPIRING/);
  assert.match(expiry,/v_days/);
  assert.match(expiry,/PLAN_EXPIRING:'\|\|v_row\.assignment_id::text\|\|':'\|\|v_days::text/);
  assert.match(expiry,/n\.dedupe_key<>v_key/);
  assert.match(admin,/my_notifications/);
  assert.match(admin,/Notificaciones HTPWEB/);
  assert.match(admin,/mark_notification_read/);
  assert.match(admin,/Marcar como leída/);
});

test('al vencer se registra aviso interno y la cuenta CLIENT permanece activa',()=>{
  assert.match(expiry,/PLAN_EXPIRED/);
  assert.match(expiry,/Tu cuenta CLIENT sigue activa/);
  assert.match(expiry,/not public\.delivery_service_is_active/);
  assert.match(admin,/renderDeliveryServiceBlocked/);
});

test('correo y SMS externos quedan deshabilitados',()=>{
  assert.match(reminder,/internal_notifications/);
  assert.match(reminder,/disabled:\s*true/);
  assert.doesNotMatch(reminder,/RESEND_API_KEY|TWILIO_|api\.resend\.com|api\.twilio\.com/);
  assert.match(plans,/cron\.unschedule/);
  assert.match(plans,/drop table if exists public\.delivery_service_notifications/);
});
