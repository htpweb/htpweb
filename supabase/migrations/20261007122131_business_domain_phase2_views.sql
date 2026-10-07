begin;

create or replace view public.business_products
with (security_invoker = true)
as
select p.*, p.local_id as business_id
from public.products p;

create or replace view public.business_categories
with (security_invoker = true)
as
select c.*, c.local_id as business_id
from public.categories c;

create or replace view public.business_orders
with (security_invoker = true)
as
select o.*, o.origin_local_id as origin_business_id
from public.orders o;

create or replace view public.business_order_items
with (security_invoker = true)
as
select oi.*, oi.local_id as business_id
from public.order_items oi;

grant select on public.business_products to anon, authenticated, service_role;
grant select on public.business_categories to anon, authenticated, service_role;
grant select on public.business_orders to authenticated, service_role;
grant select on public.business_order_items to authenticated, service_role;

commit;
