alter table public.local_deliveries
  add column if not exists share_tiny_url text,
  add column if not exists share_tiny_url_created_at timestamptz;

comment on column public.local_deliveries.share_tiny_url is
  'Enlace corto externo cacheado para compartir el LOCAL por DELIVERY.';

comment on column public.local_deliveries.share_tiny_url_created_at is
  'Fecha de creación/actualización del enlace corto externo.';

alter table public.local_deliveries
  drop constraint if exists local_deliveries_share_tiny_url_format;

alter table public.local_deliveries
  add constraint local_deliveries_share_tiny_url_format
  check (
    share_tiny_url is null
    or share_tiny_url ~ '^https://tinyurl[.]com/[A-Za-z0-9_-]+$'
  );
