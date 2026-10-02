const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const bootstrap=fs.readFileSync('config/theme-bootstrap.js','utf8');
const negocio=fs.readFileSync('config/negocio.js','utf8');
const css=fs.readFileSync('assets/app.css','utf8');
const pages=['app/index.html','app/local.html','app/carrito.html','app/pedidos.html','app/acceso.html'];

test('delivery theme is bootstrapped before public page paint',()=>{
  assert.match(bootstrap,/HTPWEB_THEME:/);
  assert.match(bootstrap,/sessionStorage\.getItem/);
  assert.match(bootstrap,/delivery-theme-pending/);
  assert.match(css,/html\.delivery-theme-pending body\{[\s\S]*visibility:hidden/);
});

test('resolved theme is cached by delivery slug',()=>{
  assert.match(negocio,/sessionStorage\.setItem\("HTPWEB_THEME:" \+ slug, resolvedKey\)/);
  assert.match(negocio,/classList\.remove\("delivery-theme-pending"\)/);
});

test('theme bootstrap runs before Supabase on public client pages',()=>{
  for(const path of pages){
    const html=fs.readFileSync(path,'utf8');
    const themeIndex=html.indexOf('../config/theme-bootstrap.js');
    const supabaseIndex=html.indexOf('@supabase/supabase-js');
    assert.ok(themeIndex>=0,path+' includes theme bootstrap');
    assert.ok(themeIndex<supabaseIndex,path+' loads theme bootstrap first');
  }
});
