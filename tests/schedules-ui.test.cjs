const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const js=fs.readFileSync("admin/admin.js","utf8");

test("horario ofrece copiar el lunes a toda la semana",()=>{
  assert.match(js,/Copiar horario del lunes a todos los días/);
  assert.match(js,/function copyMondayScheduleToAll\(\)/);
  assert.match(js,/const monday = 1/);
  assert.match(js,/scheduleDayNames\.forEach/);
  assert.match(js,/Guardar semana completa/);
});

test("copiar lunes valida horas antes de sobrescribir el formulario",()=>{
  assert.match(js,/Completa primero la hora de apertura y cierre del lunes/);
  assert.match(js,/la apertura debe ser anterior al cierre/);
  assert.match(js,/scheduleClosed" \+ day/);
  assert.match(js,/scheduleOpen" \+ day/);
  assert.match(js,/scheduleClose" \+ day/);
});
