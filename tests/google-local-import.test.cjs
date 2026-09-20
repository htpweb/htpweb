const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");

const locals=fs.readFileSync("admin/locales-master.js","utf8");
const admin=fs.readFileSync("admin/admin.js","utf8");

test("Google import is explicit and fills full local data",()=>{
  assert.match(locals,/IMPORTAR DATOS DE GOOGLE/);
  assert.match(locals,/fetchFields\(\{fields:\["id","displayName","formattedAddress","addressComponents","location","nationalPhoneNumber","regularOpeningHours"\]\}\)/);
  assert.match(locals,/masterLocalName/);
  assert.match(locals,/applyLocalGoogleAddress/);
  assert.match(locals,/masterLocalPhone/);
  assert.match(locals,/masterLocalPlaceId/);
  assert.match(locals,/setLocalPoint/);
});

test("Google schedule is staged and never auto-saved",()=>{
  assert.match(locals,/googleScheduleDraft/);
  assert.match(locals,/buildGoogleScheduleDraft/);
  assert.match(locals,/applyGoogleScheduleDraftToEditor/);
  assert.match(locals,/Horario importado desde Google — pendiente de guardar/);
  assert.doesNotMatch(locals,/save_local_schedule_week/);
  assert.match(admin,/clearGoogleScheduleDraftForLocal/);
  assert.match(admin,/save_local_schedule_week/);
});

test("unsupported Google hours require manual review",()=>{
  assert.match(locals,/Google tiene .* franjas/);
  assert.match(locals,/cruza medianoche/);
  assert.match(locals,/Google indica atención 24 horas/);
  assert.match(locals,/00:00/);
  assert.match(locals,/23:59/);
});

test("selecting a place does not auto-import before button click",()=>{
  const selectStart=locals.indexOf('search.addEventListener("gmp-select"');
  const importStart=locals.indexOf("async function loadGooglePlaceDetails");
  assert.ok(selectStart>=0&&importStart>selectStart);
  const selectedBlock=locals.slice(selectStart,importStart);
  assert.doesNotMatch(selectedBlock,/masterLocalName"\)\.value=place\.displayName/);
  assert.match(selectedBlock,/Pulsa IMPORTAR DATOS DE GOOGLE/);
});
