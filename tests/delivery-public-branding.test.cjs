const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const index=fs.readFileSync('app/index.html','utf8');
const negocio=fs.readFileSync('config/negocio.js','utf8');
const whatsapp=fs.readFileSync('config/whatsapp.js','utf8');
const localPedido=fs.readFileSync('app/local-pedido.html','utf8');
const driver=fs.readFileSync('app/repartidor-rapido.html','utf8');

test('index muestra logo y nombre del DELIVERY con HTPWEB secundario',()=>{
  assert.match(index,/id="deliveryLogo"/);
  assert.match(index,/id="deliveryLogoFallback"/);
  assert.match(index,/id="brand">DELIVERY/);
  assert.match(index,/by HTPWEB/);
  assert.match(index,/htpApplyDeliveryBrand\(negocioActual\)/);
  assert.match(negocio,/delivery\.logo_url/);
  assert.match(negocio,/Logo de /);
});

test('WhatsApp del cliente usa DELIVERY como marca principal',()=>{
  const sandbox={window:{},console};
  vm.createContext(sandbox);
  vm.runInContext(whatsapp,sandbox);
  const order={
    id:'12345678-1111-2222-3333-444444444444',
    customer_name:'Cliente',
    customer_phone:'0999999999',
    delivery_address:'Dirección',
    latitude:null,longitude:null,
    order_locals:[],
    order_items:[],
    subtotal:0,delivery_fee:0,total:0
  };
  const text=sandbox.window.htpWhatsappBuildCustomerOrderText(order,'Sobre Ruedas');
  assert.match(text,/^\*Sobre Ruedas · Pedido #12345678\*/);
  assert.doesNotMatch(text,/^\*HTPWEB · Pedido/);
  assert.match(text,/_Plataforma HTPWEB_$/);
});

test('flujos de LOCAL y repartidor usan DELIVERY como marca principal',()=>{
  assert.match(localPedido,/id="brandName">DELIVERY/);
  assert.match(localPedido,/by HTPWEB/);
  assert.match(localPedido,/data\.delivery_name/);
  assert.match(driver,/id="driverBrand">DELIVERY · Repartidor/);
  assert.match(driver,/context\?\.delivery_name/);
  assert.match(driver,/by HTPWEB/);
});
