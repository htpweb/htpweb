const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20260919203500_monetization_backend.sql"),
  "utf8"
);

test("Código #84 crea planes, prestaciones y asignaciones", () => {
  for (const token of ["subscription_plans","plan_entitlements","plan_assignments"]) {
    assert.match(sql, new RegExp("create table if not exists public\\."+token));
  }
});

test("solo MASTER puede gestionar o asignar planes", () => {
  assert.match(sql, /monetization_is_master\(\)/);
  assert.match(sql, /Solo MASTER puede gestionar planes/);
  assert.match(sql, /Solo MASTER puede asignar planes/);
});

test("cada plan y asignación conserva el scope DELIVERY o LOCAL", () => {
  assert.match(sql, /target_type in \('DELIVERY','LOCAL'\)/);
  assert.match(sql, /Seleccione exactamente un DELIVERY o LOCAL/);
  assert.match(sql, /El plan requiere DELIVERY/);
  assert.match(sql, /El plan requiere LOCAL/);
});

test("las prestaciones distinguen capabilities y límites validados", () => {
  assert.match(sql, /entitlement_type in \('CAPABILITY','LIMIT'\)/);
  assert.match(sql, /Capability % debe ser booleana/);
  assert.match(sql, /Límite % debe ser numérico y no negativo/);
});

test("el backend no aplica enforcement antes del Código #85", () => {
  assert.match(sql, /El enforcement se incorpora en #85/);
  assert.doesNotMatch(sql, /create trigger/i);
});
