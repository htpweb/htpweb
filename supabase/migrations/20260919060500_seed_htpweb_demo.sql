-- HTPWEB Código #68
-- Datos mínimos DEMO para validar el flujo público en una base actualmente vacía.
-- Idempotente: puede ejecutarse nuevamente sin duplicar estos registros.

begin;

insert into public.deliveries (
  id, name, slug, description, phone, whatsapp, active
) values (
  'a0000000-0000-4000-8000-000000000001',
  'Delivery Demo HTPWEB',
  'htpweb-demo',
  'Entorno de demostración para validar el flujo público de HTPWEB.',
  null,
  null,
  true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  active = true,
  updated_at = now();

insert into public.locals (
  id, name, slug, description, address, latitude, longitude, active
) values (
  'b0000000-0000-4000-8000-000000000001',
  'Local Demo',
  'local-demo',
  'Local de demostración para probar catálogo, carrito y navegación.',
  'Esmeraldas, Ecuador',
  0.9682,
  -79.6517,
  true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  active = true,
  updated_at = now();

insert into public.local_deliveries (
  local_id, delivery_id, active
) values (
  'b0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  true
)
on conflict (local_id, delivery_id) do update set
  active = true;

insert into public.categories (
  id, local_id, name, description, display_order, active
) values (
  'c0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'Demo',
  'Productos de demostración.',
  1,
  true
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  display_order = excluded.display_order,
  active = true,
  updated_at = now();

insert into public.products (
  id, local_id, category_id, name, description, price, display_order, active
) values
(
  'd0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'Producto Demo',
  'Producto de prueba para validar variantes y carrito.',
  5.00,
  1,
  true
),
(
  'd0000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'Bebida Demo',
  'Producto de prueba sin variantes.',
  1.50,
  2,
  true
)
on conflict (id) do update set
  local_id = excluded.local_id,
  category_id = excluded.category_id,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  display_order = excluded.display_order,
  active = true,
  updated_at = now();

insert into public.product_variants (
  id, product_id, name, price, display_order, active
) values
(
  'e0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000001',
  'Normal',
  5.00,
  1,
  true
),
(
  'e0000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000001',
  'Grande',
  7.00,
  2,
  true
)
on conflict (id) do update set
  product_id = excluded.product_id,
  name = excluded.name,
  price = excluded.price,
  display_order = excluded.display_order,
  active = true,
  updated_at = now();

insert into public.delivery_fee_configs (
  id, delivery_id, mode, fixed_fee, active
) values (
  'f0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'FIXED',
  1.50,
  true
)
on conflict (delivery_id) do update set
  mode = 'FIXED',
  fixed_fee = 1.50,
  active = true,
  updated_at = now();

commit;
