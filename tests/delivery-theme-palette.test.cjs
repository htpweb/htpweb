const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const negocio=fs.readFileSync('config/negocio.js','utf8');
const appCss=fs.readFileSync('assets/app.css','utf8');
const admin=fs.readFileSync('admin/admin.js','utf8');
const adminHtml=fs.readFileSync('admin/index.html','utf8');
const migration=fs.readFileSync('supabase/migrations/20261002010245_delivery_public_theme_palette.sql','utf8');

test('public delivery loads and applies saved theme key',()=>{
  assert.match(negocio,/theme_key/);
  assert.match(negocio,/HTPWEB_DELIVERY_THEMES/);
  assert.match(negocio,/htpApplyDeliveryTheme/);
  assert.match(negocio,/--brand-primary/);
  assert.match(appCss,/html\[data-delivery-theme\] header/);
  assert.match(appCss,/var\(--brand-primary\)/);
});

test('delivery admin can choose only approved theme presets',()=>{
  for(const key of ['HTPWEB','OCEAN','SKY','FOREST','SUNSET','PURPLE','TURQUOISE','GRAPHITE']){
    assert.match(adminHtml,new RegExp('data-theme-key="'+key+'"'));
  }
  assert.match(admin,/update_my_delivery_theme/);
  assert.match(admin,/renderDeliveryThemeSelection/);
});

test('database migration restricts theme and protects update rpc',()=>{
  assert.match(migration,/add column if not exists theme_key/);
  assert.match(migration,/deliveries_theme_key_check/);
  assert.match(migration,/current_role_code\(\) = 'DELIVERY_ADMIN'/);
  assert.match(migration,/user_has_delivery\(p_delivery_id\)/);
  assert.match(migration,/grant execute on function public\.update_my_delivery_theme/);
});
