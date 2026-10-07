-- ROLLBACK seguro de la capa aditiva BUSINESS/NEGOCIO creada el 2026-10-07.
-- No toca datos ni tablas históricas.

begin;

drop view if exists public.business_deliveries;
drop view if exists public.user_businesses;
drop view if exists public.businesses;

comment on table public.locals is null;
comment on table public.user_locals is null;
comment on table public.local_deliveries is null;

commit;
