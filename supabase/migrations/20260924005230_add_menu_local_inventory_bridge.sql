create table if not exists public.menu_sync_runs (
  id uuid primary key,
  machine_label text,
  root_label text not null default 'Menu',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  file_count integer not null default 0,
  folder_count integer not null default 0,
  notes text
);

create table if not exists public.menu_sync_inventory (
  id bigserial primary key,
  run_id uuid not null references public.menu_sync_runs(id) on delete cascade,
  relative_path text not null,
  folder_name text,
  file_name text not null,
  extension text,
  size_bytes bigint,
  sha256 text,
  modified_at timestamptz,
  is_gallery boolean not null default false,
  created_at timestamptz not null default now(),
  unique (run_id, relative_path)
);

create index if not exists menu_sync_inventory_run_idx
  on public.menu_sync_inventory(run_id);

create index if not exists menu_sync_inventory_folder_idx
  on public.menu_sync_inventory(folder_name);

create index if not exists menu_sync_inventory_sha_idx
  on public.menu_sync_inventory(sha256);

alter table public.menu_sync_runs enable row level security;
alter table public.menu_sync_inventory enable row level security;
