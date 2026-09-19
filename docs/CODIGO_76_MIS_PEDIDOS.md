# Código #76 — Mis pedidos del CLIENT

Añade `app/pedidos.html` al frontend existente. Accesos desde la tienda,
Mi cuenta (CLIENT con DELIVERY) y la confirmación de compra.

- Historial del DELIVERY actual, páginas de 20 pedidos, más recientes primero.
- Detalle enlazable con `delivery` y `order`: estado, fecha Ecuador, dirección,
  productos/variantes e importes históricos, total y estados por LOCAL.
- Cancelación solo PENDING mediante `cancel_my_order(p_order_id,p_note)` del
  Código #58. El servidor verifica ownership y estado bajo bloqueo de fila.
- Consultas filtradas por CUSTOMER resuelto de la sesión y DELIVERY. No se
  acepta customer_id desde la URL. Se conserva RLS; no se modifican permisos.
- Sin sesión, acceso con retorno al enlace original. Sin CUSTOMER, historial
  vacío; no se crea un CUSTOMER al consultar. Sin DELIVERY válido, error.
- Actualización manual. No incluye seguimiento GPS ni logística Stage 2.

## Validación

`node --test tests/*.test.cjs`: regresiones de checkout y consultas de pedidos
con backend simulado. Incluye rechazo de invitados/roles administrativos,
filtrado, paginación, enlaces inválidos, cancelación y rechazo del servidor.
Frontend Check ejecuta las pruebas y valida sintaxis externa e inline.

## Prueba pendiente con CLIENT real

1. Desde la tienda abrir Mis pedidos sin sesión; entrar y comprobar retorno al
   mismo DELIVERY. Una cuenta sin compras debe ver historial vacío.
2. Crear un pedido de prueba y pulsar Ver mi pedido. Comparar productos,
   variantes, dirección e importes con la confirmación.
3. Abrir Mi cuenta → Mis pedidos. Recargar el enlace del detalle y actualizar.
4. Probar más de 20 pedidos si existen; anterior/siguiente no debe duplicarlos
   en un conjunto que no cambia durante la prueba.
5. Con un pedido de prueba PENDING, cancelar y verificar CANCELLED en el panel.
   Si el DELIVERY lo confirma primero, el backend debe rechazar la cancelación.
6. Probar un ID de otro CLIENT o de otro DELIVERY: no debe mostrar el pedido.
7. Repetir la prueba en móvil. No se modifican roles para simular un CLIENT.

La prueba de compra real con Supabase/ORS y la comprobación actual de RLS con
sesiones CLIENT A/B no se consideran completadas por los mocks.
