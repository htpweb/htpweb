const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const index=fs.readFileSync('app/index.html','utf8');

test('public catalog search is accent-insensitive and global',()=>{
  assert.match(index,/function normalizeSearchText/);
  assert.match(index,/normalize\("NFD"\)/);
  assert.match(index,/replace\(\/\[\\u0300-\\u036f\]\/g/);
  assert.match(index,/return q \? textMatch : categoryMatch/);
});

test('product matches keep the matching products visible',()=>{
  assert.match(index,/matchingProducts/);
  assert.match(index,/normalizeSearchText\(p\.name \+ " " \+ \(p\.description \|\| ""\)\)/);
});
