-- Isolated PostgreSQL only. Never execute this fixture against Supabase.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function public.is_master() returns boolean language sql stable as
$$ select coalesce(current_setting('test.role',true),'')='MASTER' $$;
create function public.current_role_code() returns text language sql stable as
$$ select current_setting('test.role',true) $$;
create function public.has_permission(text) returns boolean language sql stable as $$ select true $$;
create function public.delivery_has_capability(uuid,text) returns boolean language sql stable as $$ select true $$;
create table cities(id uuid primary key default gen_random_uuid(),name text not null,province text,country text default 'Ecuador',active boolean default true);
create table zones(id uuid primary key default gen_random_uuid(),name text not null,city text not null,province text,country text default 'Ecuador',city_id uuid not null references cities(id),active boolean default true,created_at timestamptz default now());
create table deliveries(id uuid primary key default gen_random_uuid(),name text,city_id uuid references cities(id),active boolean default true);
create table delivery_zones(delivery_id uuid references deliveries(id),zone_id uuid references zones(id),active boolean default true,created_at timestamptz default now(),primary key(delivery_id,zone_id));
create table locals(id uuid primary key default gen_random_uuid(),zone_id uuid references zones(id),name text not null,slug text unique,description text,address text,latitude numeric,longitude numeric,phone text,whatsapp text,logo_url text,banner_url text,active boolean default false,created_at timestamptz default now(),updated_at timestamptz default now());
create table local_deliveries(local_id uuid references locals(id),delivery_id uuid references deliveries(id),active boolean default true,created_at timestamptz default now(),primary key(local_id,delivery_id));
create table user_deliveries(user_id uuid,delivery_id uuid references deliveries(id),active boolean default true);
create function public.user_has_delivery(p_id uuid) returns boolean language sql stable as $$
select public.is_master() or exists(select 1 from public.user_deliveries where user_id=auth.uid() and delivery_id=p_id and active) $$;
create table local_change_history(local_id uuid references locals(id),request_id uuid,change_type text,before_data jsonb,after_data jsonb,changed_by uuid,created_at timestamptz);
create table order_locals(id uuid primary key default gen_random_uuid(),local_id uuid references locals(id));
create table categories(id uuid primary key default gen_random_uuid(),local_id uuid references locals(id));
create table products(id uuid primary key default gen_random_uuid(),local_id uuid references locals(id));
create function public.set_delivery_zone(p_delivery_id uuid,p_zone_id uuid,p_active boolean)
returns void language sql as $$ insert into delivery_zones values(p_delivery_id,p_zone_id,p_active,now())
on conflict(delivery_id,zone_id) do update set active=excluded.active $$;
alter table locals enable row level security;
alter table products enable row level security;
alter table categories enable row level security;
alter table local_deliveries enable row level security;
create policy read_locals on locals for select to authenticated using(true);
create policy read_products on products for select to authenticated using(true);
create policy read_categories on categories for select to authenticated using(true);
create policy read_links on local_deliveries for select to authenticated using(true);
grant usage on schema public,auth to authenticated;
grant select on locals,products,categories,local_deliveries,user_deliveries to authenticated;
