begin;

-- Capa canónica BUSINESS/NEGOCIO sobre el esquema histórico LOCAL.
-- Es aditiva: no renombra ni elimina tablas, columnas, RLS, triggers o funciones existentes.

create or replace view public.businesses
with (security_invoker = true)
as
select
  l.*,
  l.id as business_id
from public.locals l;

comment on view public.businesses is
  'Canonical HTPWEB business view. Backed by legacy public.locals during the staged LOCAL -> BUSINESS migration.';

grant select on public.businesses to anon, authenticated, service_role;

create or replace view public.user_businesses
with (security_invoker = true)
as
select
  ul.user_id,
  ul.local_id as business_id,
  ul.local_id as legacy_local_id,
  ul.active,
  ul.created_at
from public.user_locals ul;

comment on view public.user_businesses is
  'Canonical user-to-business view. Backed by legacy public.user_locals.';

grant select on public.user_businesses to authenticated, service_role;

create or replace view public.business_deliveries
with (security_invoker = true)
as
select
  ld.local_id as business_id,
  ld.local_id as legacy_local_id,
  ld.delivery_id,
  ld.active,
  ld.created_at,
  ld.share_code,
  ld.share_tiny_url,
  ld.share_tiny_url_created_at,
  ld.public_share_code
from public.local_deliveries ld;

comment on view public.business_deliveries is
  'Canonical business-to-delivery view. Backed by legacy public.local_deliveries.';

grant select on public.business_deliveries to anon, authenticated, service_role;

comment on table public.locals is
  'LEGACY domain name. Canonical entity is NEGOCIO/BUSINESS; use public.businesses for new read paths.';
comment on table public.user_locals is
  'LEGACY relation. Canonical read model is public.user_businesses.';
comment on table public.local_deliveries is
  'LEGACY relation. Canonical read model is public.business_deliveries.';

commit;
