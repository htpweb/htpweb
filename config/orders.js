// Código #76: consultas del CLIENT. RLS y la RPC conservan la autoridad final.
const CLIENT_ORDER_PAGE_SIZE = 20;
const CLIENT_ORDER_FIELDS = 'id,delivery_id,customer_id,status,created_at,subtotal,delivery_fee,total,delivery_address';

async function contextoPedidosCliente() {
  const user = await obtenerUsuarioActual();
  if (!user) throw new Error('Inicia sesión para consultar tus pedidos.');
  const role = await supabaseClient.rpc('current_role_code');
  if (role.error) throw role.error;
  if (role.data !== 'CLIENT') throw new Error('Mis pedidos está disponible para cuentas CLIENT. Usa el panel para gestionar pedidos.');
  const result = await supabaseClient.from('customers').select('id')
    .eq('profile_id', user.id).eq('active', true).maybeSingle();
  if (result.error) throw result.error;
  return result.data?.id || null;
}

async function listarPedidosCliente(deliveryId, page = 0) {
  if (!deliveryId) throw new Error('Selecciona un DELIVERY.');
  if (!Number.isInteger(page) || page < 0) throw new Error('Página inválida.');
  const customerId = await contextoPedidosCliente();
  if (!customerId) return { orders: [], hasMore: false };
  const result = await supabaseClient.from('orders').select(CLIENT_ORDER_FIELDS)
    .eq('customer_id', customerId).eq('delivery_id', deliveryId)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(page * CLIENT_ORDER_PAGE_SIZE, (page + 1) * CLIENT_ORDER_PAGE_SIZE);
  if (result.error) throw result.error;
  const rows = result.data || [];
  return { orders: rows.slice(0, CLIENT_ORDER_PAGE_SIZE), hasMore: rows.length > CLIENT_ORDER_PAGE_SIZE };
}

async function obtenerPedidoCliente(deliveryId, orderId) {
  if (!deliveryId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId || '')) {
    throw new Error('Enlace de pedido inválido.');
  }
  const customerId = await contextoPedidosCliente();
  if (!customerId) return null;
  const result = await supabaseClient.from('orders')
    .select(CLIENT_ORDER_FIELDS + ',order_items(local_id,product_name,variant_name,unit_price,quantity,subtotal),order_locals(local_id,status,subtotal,delivery_fee,locals(name))')
    .eq('id', orderId).eq('customer_id', customerId).eq('delivery_id', deliveryId).maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function cancelarPedidoCliente(deliveryId, orderId) {
  const order = await obtenerPedidoCliente(deliveryId, orderId);
  if (!order) throw new Error('Pedido no disponible en esta cuenta y DELIVERY.');
  if (order.status !== 'PENDING') throw new Error('Solo puedes cancelar pedidos pendientes. Actualiza para ver su estado.');
  // El servidor vuelve a comprobar ownership y estado bajo bloqueo transaccional.
  const result = await supabaseClient.rpc('cancel_my_order', { p_order_id: order.id, p_note: null });
  if (result.error) throw result.error;
}
