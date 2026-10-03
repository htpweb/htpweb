create table if not exists public.express_demos (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique,
  name text not null,
  whatsapp text not null,
  logo_url text,
  fee_mode text not null check (fee_mode in ('SIMPLE','ADVANCED_DISTANCE','ADVANCED_ZONES')),
  fee_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 days'),
  created_at timestamptz not null default now(),
  constraint express_demos_code_format check (public_code ~ '^[A-HJ-NP-Z2-9]{8}$')
);

alter table public.express_demos enable row level security;
revoke all on table public.express_demos from anon, authenticated;

create index if not exists express_demos_expires_idx
  on public.express_demos (expires_at)
  where active = true;

create or replace function public.public_express_demo(p_code text)
returns table (
  public_code text,
  name text,
  whatsapp text,
  logo_url text,
  fee_mode text,
  fee_config jsonb,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select d.public_code,d.name,d.whatsapp,d.logo_url,d.fee_mode,d.fee_config,d.expires_at
  from public.express_demos d
  where d.public_code = upper(trim(p_code))
    and d.active = true
    and d.expires_at > now()
  limit 1;
$$;

revoke all on function public.public_express_demo(text) from public;
grant execute on function public.public_express_demo(text) to anon, authenticated;
