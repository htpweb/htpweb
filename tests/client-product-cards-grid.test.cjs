const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = fs.readFileSync("assets/app.css", "utf8");

test("productos se muestran en tres tarjetas por fila en escritorio", () => {
  assert.match(css, /#products\{[\s\S]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /#products \.product-row\{[\s\S]*flex-direction:column/);
  assert.match(css, /#products \.product-row>div:first-child\{[\s\S]*aspect-ratio:4\/3/);
});

test("productos usan dos tarjetas por fila en móvil", () => {
  assert.match(css, /@media\(max-width:760px\)[\s\S]*#products\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("pantallas muy angostas regresan a una columna", () => {
  assert.match(css, /@media\(max-width:340px\)[\s\S]*#products\{grid-template-columns:1fr\}/);
});

test("controles de compra permanecen dentro de cada tarjeta", () => {
  assert.match(css, /#products \.product-row \.row\{[\s\S]*grid-template-columns:72px minmax\(0,1fr\)/);
  assert.match(css, /#products \.product-row select/);
});
