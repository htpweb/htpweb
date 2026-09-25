create table if not exists public.menu_review_images (
  id uuid primary key default gen_random_uuid(),
  sha256 text not null unique,
  file_name text not null,
  source_relative_path text,
  mime_type text,
  size_bytes bigint,
  storage_path text not null unique,
  signed_url text,
  signed_url_expires_at timestamptz,
  status text not null default 'PENDING',
  proposed_local text,
  confidence numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.menu_review_images enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-review',
  'menu-review',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
