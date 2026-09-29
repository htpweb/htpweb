const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const acceso=fs.readFileSync('app/acceso.html','utf8');
const config=fs.readFileSync('supabase/config.toml','utf8');
const recovery=fs.readFileSync('supabase/templates/recovery.html','utf8');
const confirmation=fs.readFileSync('supabase/templates/confirmation.html','utf8');

test('acceso permite solicitar y completar recuperación de contraseña',()=>{
  assert.match(acceso,/Olvidé mi contraseña/);
  assert.match(acceso,/resetPasswordForEmail/);
  assert.match(acceso,/PASSWORD_RECOVERY/);
  assert.match(acceso,/updateUser\(\{ password \}\)/);
  assert.match(acceso,/Crear nueva contraseña/);
});

test('plantillas de autenticación HTPWEB están en español y versionadas',()=>{
  assert.match(config,/HTPWEB \| Confirma tu correo electrónico/);
  assert.match(config,/HTPWEB \| Cambia tu contraseña/);
  assert.match(config,/HTPWEB \| Invitación de acceso/);
  assert.match(config,/HTPWEB \| Enlace de acceso/);
  assert.match(recovery,/CAMBIAR CONTRASEÑA/);
  assert.match(recovery,/HTPWEB/);
  assert.match(confirmation,/CONFIRMAR MI CORREO/);
});
