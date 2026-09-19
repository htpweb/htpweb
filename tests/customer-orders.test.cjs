const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const orderId = '12345678-1234-1234-1234-123456789abc';
function setup({user={id:'user'}, role='CLIENT', customer={id:'customer'}, orders=[], order=null, rpcError=null}={}) {
  const calls=[];
  const client={
    rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='current_role_code'?role:null,error:name==='cancel_my_order'?rpcError:null};},
    from(table){
      const entry={table, filters:[], range:null};calls.push(entry);
      const query={select(){return query;},eq(...args){entry.filters.push(args);return query;},order(){return query;},
        range(...args){entry.range=args;return Promise.resolve({data:orders});},
        maybeSingle:async()=>({data:table==='customers'?customer:order})};
      return query;
    }
  };
  const context=vm.createContext({supabaseClient:client,obtenerUsuarioActual:async()=>user});
  vm.runInContext(fs.readFileSync('config/orders.js','utf8'),context);
  return {calls,run:code=>vm.runInContext(code,context)};
}
test('guest and administrative accounts cannot query client orders',async()=>{
  for(const options of [{user:null},{role:'MASTER'}]) {
    const {calls,run}=setup(options);
    await assert.rejects(run("listarPedidosCliente('delivery')"));
    assert.equal(calls.some(x=>x.table==='orders'),false);
  }
});
test('client without customer has empty history, with no writes',async()=>{
  const {calls,run}=setup({customer:null});
  const result=await run("listarPedidosCliente('delivery')");
  assert.equal(result.orders.length,0);
  assert.equal(calls.some(x=>x.table==='orders'),false);
});
test('history scopes both customer and delivery and paginates 20 rows',async()=>{
  const {calls,run}=setup({orders:Array.from({length:21},(_,i)=>({id:i}))});
  const result=await run("listarPedidosCliente('delivery',1)");
  assert.equal(result.orders.length,20);assert.equal(result.hasMore,true);
  const query=calls.find(x=>x.table==='orders');
  assert.deepEqual(query.filters,[['customer_id','customer'],['delivery_id','delivery']]);
  assert.deepEqual(query.range,[20,40]);
});
test('detail constrains order, authenticated customer and delivery',async()=>{
  const {calls,run}=setup();
  assert.equal(await run(`obtenerPedidoCliente('delivery','${orderId}')`),null);
  assert.deepEqual(calls.find(x=>x.table==='orders').filters,[['id',orderId],['customer_id','customer'],['delivery_id','delivery']]);
});
test('unavailable or confirmed orders never invoke cancellation',async()=>{
  for(const order of [null,{id:orderId,status:'CONFIRMED'}]) {
    const {calls,run}=setup({order});
    await assert.rejects(run(`cancelarPedidoCliente('delivery','${orderId}')`));
    assert.equal(calls.some(x=>x[0]==='cancel_my_order'),false);
  }
});
test('pending cancellation uses protected RPC and propagates backend rejection',async()=>{
  for(const rpcError of [null,new Error('El pedido ya fue confirmado')]) {
    const {calls,run}=setup({order:{id:orderId,status:'PENDING'},rpcError});
    const pending=run(`cancelarPedidoCliente('delivery','${orderId}')`);
    if(rpcError) await assert.rejects(pending,/confirmado/);else await pending;
    const call=calls.find(x=>x[0]==='cancel_my_order');
    assert.equal(call[1].p_order_id,orderId);assert.equal(call[1].p_note,null);
  }
});
test('invalid deep link does not query customer or order',async()=>{
  const {calls,run}=setup();
  await assert.rejects(run("obtenerPedidoCliente('delivery','bad-id')"),/inválido/);
  assert.equal(calls.length,0);
});

function screen({order=null,user={id:'u'}}={}) {
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id)) elements.set(id,{innerHTML:'',textContent:'',className:'',disabled:false,classList:{add(){},remove(){}},scrollIntoView(){},focus(){}});
    return elements.get(id);
  };
  let redirected=false;
  const context=vm.createContext({document:{getElementById:element,querySelectorAll:()=>[]},
    location:{search:'?delivery=demo'},URLSearchParams,history:{replaceState(){}},
    supabaseClient:{auth:{onAuthStateChange(){}}},obtenerUsuarioActual:async()=>user,
    obtenerPedidoCliente:async()=>order,irAAcceso:()=>{redirected=true;},rutaActualRelativa:()=>'/app/pedidos.html?delivery=demo',
    urlDelivery:path=>path+'?delivery=demo',setTimeout,console});
  const html=fs.readFileSync('app/pedidos.html','utf8');
  const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('async function renderDetail'));
  vm.runInContext(script.replace(/\binit\(\);\s*$/,''),context);
  const run=code=>vm.runInContext(code,context);
  run(`delivery={id:'d'};selectedId='${orderId}';`);
  return {element,run,redirected:()=>redirected};
}
test('detail escapes user content, uses stored prices and hides cancellation after confirmation',async()=>{
  const {element,run}=screen({order:{id:orderId,status:'CONFIRMED',created_at:'2026-09-19T14:00:00Z',delivery_address:'<script>bad</script>',subtotal:12,delivery_fee:2,total:14,
    order_locals:[{local_id:'l',status:'PREPARING',locals:{name:'Local'}}],order_items:[{local_id:'l',product_name:'<b>Producto</b>',quantity:2,unit_price:6,subtotal:12}]}});
  await run('renderDetail()');
  const html=element('detail').innerHTML;
  assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(html,/&lt;b&gt;Producto&lt;\/b&gt;/);
  assert.match(html,/\$14\.00/);
  assert.equal(html.includes('id="cancelBtn"'),false);
});
test('unavailable detail clears previously rendered personal data',async()=>{
  const {element,run}=screen();
  element('detail').innerHTML='Previous private order';
  await assert.rejects(run('renderDetail()'),/no disponible/);
  assert.equal(element('detail').innerHTML,'');
});
test('guest screen redirects to access before loading delivery',async()=>{
  const {run,redirected}=screen({user:null});
  await run('init()');
  assert.equal(redirected(),true);
});
