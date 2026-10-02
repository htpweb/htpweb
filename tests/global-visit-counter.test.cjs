const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const html=fs.readFileSync("app/index.html","utf8");
const admin=fs.readFileSync("admin/admin.js","utf8");
const migration=fs.readFileSync("supabase/migrations/20261002112500_global_delivery_visit_counter.sql","utf8");

test("la vista pública registra visitas pero no muestra el contador",()=>{
  assert.match(html,/registerDeliveryVisit/);
  assert.match(html,/register_delivery_visit/);
  assert.doesNotMatch(html,/id="globalVisitCounter"/);
  assert.doesNotMatch(html,/Visitas HTPWEB/);
});

test("el contador global suma los acumulados de todos los DELIVERY",()=>{
  assert.match(migration,/create table if not exists public\.delivery_visit_counters/);
  assert.match(migration,/delivery_id uuid primary key/);
  assert.match(migration,/select coalesce\(sum\(v\.visits\), 0\)::bigint/);
  assert.match(migration,/visits = public\.delivery_visit_counters\.visits \+ 1/);
});

test("una recarga de la misma sesión no infla el contador",()=>{
  assert.match(html,/sessionStorage\.getItem\(storageKey\)/);
  assert.match(html,/sessionStorage\.setItem\(storageKey, "1"\)/);
});

test("MASTER muestra Visitas como KPI global",()=>{
  assert.match(admin,/global_delivery_visit_count/);
  assert.match(admin,/label: "Visitas"/);
  assert.match(admin,/Acumuladas en todos los DELIVERY/);
  assert.match(admin,/state\.role === "MASTER"/);
});
