const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

test("LOCAL Pro includes custom domain capability", () => {
  const sql = read("supabase/migrations/20261005123500_local_pro_custom_domains.sql");
  assert.match(sql, /LOC_PRO/);
  assert.match(sql, /domain\.custom\.included/);
  assert.match(sql, /local_domain_requests/);
  assert.match(sql, /request_my_local_domain/);
  assert.match(sql, /master_update_local_domain_request/);
});

test("LOCAL workspace exposes domain request flow", () => {
  const html = read("admin/index.html");
  const js = read("admin/admin.js");
  assert.match(html, /id="localDomainCard"/);
  assert.match(html, /id="localDomainName"/);
  assert.match(html, /id="requestLocalDomainBtn"/);
  assert.match(js, /my_local_domain_snapshot/);
  assert.match(js, /request_my_local_domain/);
  assert.match(js, /cancel_my_local_domain_request/);
});

test("MASTER can manage LOCAL domain requests", () => {
  const js = read("admin/locales-master.js");
  assert.match(js, /master_list_local_domain_requests/);
  assert.match(js, /master_update_local_domain_request/);
  assert.match(js, /masterLocalDomainRows/);
});

test("Mi cuenta shows LOCAL plan domain benefit", () => {
  const html = read("app/mi-cuenta.html");
  assert.match(html, /domain\.custom\.included/);
  assert.match(html, /Dominio propio/);
  assert.match(html, /available_local_plans/);
});
