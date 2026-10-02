const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const html=fs.readFileSync("app/index.html","utf8");
const migration=fs.readFileSync("supabase/migrations/20261002112500_global_delivery_visit_counter.sql","utf8");

test("cada DELIVERY muestra el mismo contador global HTPWEB",()=>{
  assert.match(html,/id="globalVisitCounter"/);
  assert.match(html,/Visitas HTPWEB/);
  assert.match(html,/global_delivery_visit_count/);
  assert.match(html,/register_delivery_visit/);
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

test("contador usa el cliente Supabase global real en PC y móvil",()=>{
  assert.match(html,/typeof supabaseClient === "undefined"/);
  assert.doesNotMatch(html,/!window\.supabaseClient\?\.rpc/);
});
