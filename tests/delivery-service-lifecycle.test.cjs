const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const admin=fs.readFileSync('admin/admin.js','utf8');
const access=fs.readFileSync('app/acceso.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20260925035215_delivery_service_lifecycle.sql','utf8');
const fix=fs.readFileSync('supabase/migrations/20260925035539_fix_delivery_service_period_overlap.sql','utf8');
const reminder=fs.readFileSync('supabase/functions/delivery-service-reminders/index.ts','utf8');

test('MASTER configura inicio, fin y renovación mensual del DELIVERY',()=>{
  assert.match(admin,/Servicio mensual/);
  assert.match(admin,/deliveryWorkspaceServiceStart/);
  assert.match(admin,/deliveryWorkspaceServiceEnd/);
  assert.match(admin,/Guardar periodo/);
  assert.match(admin,/Renovar 1 mes/);
  assert.match(admin,/master_set_delivery_service_period/);
  assert.match(admin,/master_renew_delivery_service_month/);
});

test('DELIVERY queda bloqueado si el servicio no está vigente',()=>{
  assert.match(migration,/create or replace function public\.delivery_service_is_active/);
  assert.match(migration,/create or replace function public\.user_has_delivery/);
  assert.match(migration,/public\.delivery_service_is_active\(p_delivery_id\)/);
  assert.match(admin,/my_delivery_service_access/);
  assert.match(admin,/renderDeliveryServiceBlocked/);
  assert.match(admin,/Servicio DELIVERY no disponible/);
  assert.match(access,/my_delivery_service_access/);
  assert.match(access,/service=blocked/);
});

test('vigencia advierte al DELIVERY cuando faltan cinco días',()=>{
  assert.match(migration,/v_days<=5/);
  assert.match(admin,/renderDeliveryServiceWarning/);
  assert.match(admin,/expiring_soon/);
  assert.match(admin,/días/);
});

test('recordatorios se encolan cinco días antes por email y SMS',()=>{
  assert.match(migration,/delivery_service_notifications/);
  assert.match(migration,/EXPIRY_5_DAYS/);
  assert.match(migration,/v_today\+5/);
  assert.match(migration,/'EMAIL'/);
  assert.match(migration,/'SMS'/);
  assert.match(migration,/queue_delivery_service_expiry_reminders/);
});

test('cron diario invoca Edge Function protegida por secreto interno',()=>{
  assert.match(migration,/create extension if not exists pg_cron/);
  assert.match(migration,/htpweb-delivery-service-reminders/);
  assert.match(migration,/'0 13 \* \* \*'/);
  assert.match(migration,/delivery-service-reminders/);
  assert.match(migration,/delivery_reminder_cron_secret/);
  assert.match(reminder,/x-htpweb-cron-secret/);
  assert.match(reminder,/verify_delivery_reminder_cron_secret/);
});

test('Edge Function soporta Resend y Twilio sin exponer credenciales',()=>{
  assert.match(reminder,/RESEND_API_KEY/);
  assert.match(reminder,/REMINDER_EMAIL_FROM/);
  assert.match(reminder,/TWILIO_ACCOUNT_SID/);
  assert.match(reminder,/TWILIO_AUTH_TOKEN/);
  assert.match(reminder,/TWILIO_FROM_NUMBER/);
  assert.match(reminder,/api\.resend\.com\/emails/);
  assert.match(reminder,/api\.twilio\.com/);
  assert.doesNotMatch(reminder,/sk_live_|AC[a-f0-9]{20,}/i);
});

test('reemplazar un periodo futuro no viola ends_at mayor que starts_at',()=>{
  assert.match(fix,/when a\.starts_at<v_start/);
  assert.match(fix,/else a\.ends_at/);
  assert.match(fix,/a\.starts_at<v_end/);
  assert.match(fix,/a\.ends_at>v_start/);
});
