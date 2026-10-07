const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const baseline = JSON.parse(fs.readFileSync(path.join(root, "config", "legacy-local-baseline.json"), "utf8"));

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(?:html|js|cjs|mjs|ts|css)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function countPattern(pattern) {
  const re = new RegExp(pattern, "g");
  let total = 0;
  for (const rel of baseline.scope) {
    const dir = path.join(root, rel);
    if (!fs.existsSync(dir)) continue;
    for (const file of walk(dir)) {
      if (file.endsWith(path.join("config", "legacy-local-baseline.json"))) continue;
      const source = fs.readFileSync(file, "utf8");
      total += [...source.matchAll(re)].length;
    }
  }
  return total;
}

test("NEGOCIO/BUSINESS is the canonical HTPWEB domain", () => {
  const docs = fs.readFileSync(path.join(root, "docs", "TERMINOLOGIA_DOMINIO.md"), "utf8");
  const domain = fs.readFileSync(path.join(root, "config", "business-domain.js"), "utf8");
  assert.match(docs, /NEGOCIO/);
  assert.match(docs, /businesses/);
  assert.match(domain, /BUSINESS_ADMIN/);
  assert.match(domain, /legacy/);
});

test("canonical business entry routes exist", () => {
  for (const rel of [
    "app/crear-negocio.html",
    "app/reclamar-negocio.html",
    "app/negocio.html",
    "explorar-negocios.html"
  ]) {
    assert.equal(fs.existsSync(path.join(root, rel)), true, rel);
  }
});

test("public navigation says Explorar negocios", () => {
  for (const rel of ["index.html", "como-funciona.html"]) {
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    assert.match(source, /Explorar negocios/);
    assert.doesNotMatch(source, /Explorar locales/);
  }
});

test("canonical database bridge is additive and security-invoker", () => {
  const sql = fs.readFileSync(path.join(root, "supabase", "migrations", "20261007063143_business_domain_compatibility.sql"), "utf8");
  assert.match(sql, /create or replace view public\.businesses/i);
  assert.match(sql, /create or replace view public\.user_businesses/i);
  assert.match(sql, /create or replace view public\.business_deliveries/i);
  assert.match(sql, /security_invoker\s*=\s*true/i);
  assert.doesNotMatch(sql, /drop table|alter table\s+public\.locals\s+rename/i);
});

test("legacy technical vocabulary cannot grow", () => {
  for (const [pattern, max] of Object.entries(baseline.patterns)) {
    const current = countPattern(pattern);
    assert.ok(
      current <= max,
      `${pattern} increased from baseline ${max} to ${current}; new business code must use canonical terminology`
    );
  }
});
