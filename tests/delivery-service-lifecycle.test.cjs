const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const access=fs.readFileSync('app/acceso.html','utf8');
const plans=fs.readFileSync('supabase/migrations/20260925050023_commercial_plan_assignments_notifications.sql','utf8');
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

test('vencimiento genera notificación interna cinco días antes',()=>{
  assert.match(plans,/sync_my_plan_notifications/);
  assert.match(plans,/interval '5 days'/);
  assert.match(plans,/PLAN_EXPIRING/);
  assert.match(admin,/my_notifications/);
  assert.match(admin,/Notificaciones HTPWEB/);
});

test('correo y SMS externos quedan deshabilitados',()=>{
  assert.match(reminder,/internal_notifications/);
  assert.match(reminder,/disabled:\s*true/);
  assert.doesNotMatch(reminder,/RESEND_API_KEY|TWILIO_|api\.resend\.com|api\.twilio\.com/);
  assert.match(plans,/cron\.unschedule/);
  assert.match(plans,/drop table if exists public\.delivery_service_notifications/);
});
