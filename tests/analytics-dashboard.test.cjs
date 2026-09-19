const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const html=fs.readFileSync('admin/analytics.html','utf8');const js=fs.readFileSync('admin/analytics-dashboard.js','utf8');const css=fs.readFileSync('assets/analytics-dashboard.css','utf8');
test('dashboard reutiliza summaries existentes',()=>{assert.match(js,/analytics_master_summary/);assert.match(js,/analytics_delivery_summary/);assert.match(js,/analytics_local_summary/);});
test('dashboard es role-aware',()=>{assert.match(js,/MASTER/);assert.match(js,/DELIVERY_ADMIN/);assert.match(js,/LOCAL_ADMIN/);assert.match(js,/user_deliveries/);assert.match(js,/user_locals/);});
test('dashboard permite rango de fechas',()=>{assert.match(html,/analyticsFrom/);assert.match(html,/analyticsTo/);assert.match(js,/p_from/);assert.match(js,/p_to/);});
test('dashboard no escribe analytics_events',()=>{assert.doesNotMatch(js,/from\(["']analytics_events["']\).*insert/s);assert.doesNotMatch(js,/record_analytics_event/);});
test('dashboard tiene presentación responsive',()=>{assert.match(css,/analytics-metrics/);assert.match(css,/@media/);assert.match(html,/analyticsMetrics/);});
