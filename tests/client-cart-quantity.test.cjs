const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function createCartRuntime() {
  const store = new Map();
  const events = [];
  const context = {
    sessionStorage: {
      getItem: key => store.has(key) ? store.get(key) : null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key)
    },
    window: {
      dispatchEvent: event => events.push(event)
    },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("config/cart.js", "utf8"), context);
  return { context, store, events };
}

test("agregar repetidamente el mismo producto y variante suma la cantidad", () => {
  const { context } = createCartRuntime();
  const item = { local_id: "local-1", product_id: "prod-1", variant_id: "var-1" };

  context.carritoAgregar("delivery", item, 1);
  context.carritoAgregar("delivery", item, 1);
  context.carritoAgregar("delivery", item, 1);

  const cart = context.carritoObtener("delivery");
  assert.equal(cart.length, 1);
  assert.equal(cart[0].quantity, 3);
  assert.equal(context.carritoCantidadItem("delivery", item), 3);
  assert.equal(context.carritoCantidad("delivery"), 3);
});

test("variantes distintas mantienen cantidades separadas", () => {
  const { context } = createCartRuntime();
  const base = { local_id: "local-1", product_id: "prod-1" };

  context.carritoAgregar("delivery", { ...base, variant_id: "var-a" }, 2);
  context.carritoAgregar("delivery", { ...base, variant_id: "var-b" }, 1);
  context.carritoAgregar("delivery", { ...base, variant_id: "var-a" }, 1);

  assert.equal(context.carritoCantidadItem("delivery", { ...base, variant_id: "var-a" }), 3);
  assert.equal(context.carritoCantidadItem("delivery", { ...base, variant_id: "var-b" }), 1);
  assert.equal(context.carritoCantidad("delivery"), 4);
});

test("la cantidad usada por carrito se conserva para checkout", () => {
  const { context } = createCartRuntime();
  const item = { local_id: "local-1", product_id: "prod-1", variant_id: null };

  context.carritoAgregar("delivery", item, 1);
  context.carritoAgregar("delivery", item, 1);

  const [stored] = context.carritoObtener("delivery");
  assert.equal(stored.quantity, 2);
});
