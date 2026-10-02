const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('assets/app.css','utf8');

test('semantic actions stay red across delivery themes',()=>{
  assert.match(css,/#cartLink,[\s\S]*#cartBtn\{[\s\S]*background:#e53935 !important/);
  assert.match(css,/\.btn-danger,[\s\S]*\.media-viewer-close\{[\s\S]*background:#e53935 !important/);
  assert.match(css,/\.media-viewer-close:hover,[\s\S]*background:#c62828 !important/);
});

test('brand colors still drive non-destructive primary actions',()=>{
  assert.match(css,/html\[data-delivery-theme\] \.btn-primary\{[\s\S]*background:var\(--brand-primary\)/);
  assert.match(css,/html\[data-delivery-theme\] \.chip\.active\{[\s\S]*background:var\(--brand-primary\)/);
});
