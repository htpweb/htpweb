const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('admin/index.html','utf8');
const js=fs.readFileSync('admin/admin.js','utf8');

test('analytics lives in the integrated admin workspace',()=>{
  assert.match(html,/analyticsScope/);
  assert.match(js,/function loadAnalytics/);
  assert.match(js,/analytics_master_summary/);
  assert.match(js,/analytics_delivery_summary/);
  assert.match(js,/analytics_local_summary/);
});

test('integrated analytics is role-aware',()=>{
  assert.match(js,/MASTER/);
  assert.match(js,/DELIVERY_ADMIN/);
  assert.match(js,/BUSINESS_ADMIN/);
});

test('integrated analytics does not write analytics_events',()=>{
  const block=js.match(/async function loadAnalytics\(\)[\s\S]*?\n}/)?.[0]||'';
  assert.doesNotMatch(block,/\.insert\(/);
  assert.doesNotMatch(block,/record_analytics_event/);
});

test('retired standalone analytics files stay deleted',()=>{
  for(const file of ['admin/analytics.html','admin/analytics-dashboard.js','assets/analytics-dashboard.css']){
    assert.equal(fs.existsSync(file),false,file);
  }
});
