-- HTPWEB — hardening de autorizaciones DELIVERY.
-- Defensa en profundidad: acceso directo denegado y cobertura de FK para evitar regresiones de rendimiento.

create index if not exists delivery_access_created_by_idx
  on public.delivery_access_authorizations(created_by);

create index if not exists delivery_access_revoked_by_idx
  on public.delivery_access_authorizations(revoked_by)
  where revoked_by is not null;

drop policy if exists delivery_access_authorizations_no_direct_access
  on public.delivery_access_authorizations;

create policy delivery_access_authorizations_no_direct_access
  on public.delivery_access_authorizations
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
