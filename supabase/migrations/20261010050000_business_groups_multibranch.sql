-- HTPWEB block 1: company hierarchy without replacing existing branch IDs.
create table if not exists public.business_groups (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(btrim(name)) between 2 and 180),
 slug text not null unique,
 website_url text,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.business_group_branches (
 group_id uuid not null references public.business_groups(id) on delete restrict,
 business_id uuid not null references public.locals(id) on delete restrict,
 branch_label text not null check (length(btrim(branch_label)) between 1 and 120),
 display_order integer not null default 0,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 primary key (group_id,business_id),
 unique(business_id)
);
create index if not exists business_group_branches_group_idx on public.business_group_branches(group_id,display_order);
create table if not exists public.business_group_admins (
 group_id uuid not null references public.business_groups(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 primary key(group_id,user_id)
);
alter table public.business_groups enable row level security;
alter table public.business_group_branches enable row level security;
alter table public.business_group_admins enable row level security;
drop policy if exists business_groups_read on public.business_groups;
create policy business_groups_read on public.business_groups for select to anon,authenticated using(active);
drop policy if exists business_group_branches_read on public.business_group_branches;
create policy business_group_branches_read on public.business_group_branches for select to anon,authenticated using(active);
drop policy if exists business_group_admins_read on public.business_group_admins;
create policy business_group_admins_read on public.business_group_admins for select to authenticated using(auth.uid()=user_id or public.is_master());
create or replace function public.master_upsert_business_group(
 p_group_id uuid,p_name text,p_slug text,p_branches jsonb
) returns uuid language plpgsql security definer set search_path=''
as $body$
declare
 v_group uuid;
 v_branch jsonb;
 v_business_id uuid;
 v_used uuid[] := array[]::uuid[];
begin
 if not public.is_master() then raise exception 'MASTER requerido'; end if;
 if nullif(btrim(p_name),'') is null or length(btrim(p_name))>180 or
    nullif(btrim(p_slug),'') is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
   raise exception 'Nombre o slug invalido';
 end if;
 if p_branches is null or jsonb_typeof(p_branches)<>'array' or jsonb_array_length(p_branches) not between 1 and 50 then
   raise exception 'Debe incluir entre 1 y 50 sucursales';
 end if;
 if p_group_id is null then
   insert into public.business_groups(name,slug) values(btrim(p_name),p_slug) returning id into v_group;
 else
   update public.business_groups set name=btrim(p_name),slug=p_slug,updated_at=now()
    where id=p_group_id returning id into v_group;
   if v_group is null then raise exception 'Empresa no encontrada'; end if;
 end if;
 for v_branch in select value from jsonb_array_elements(p_branches) loop
   v_business_id := (v_branch->>'business_id')::uuid;
   if v_business_id is null or v_business_id=any(v_used) then raise exception 'Sucursal repetida o invalida'; end if;
   if not exists(select 1 from public.locals where id=v_business_id) then raise exception 'Sucursal no existe'; end if;
   if exists(select 1 from public.business_group_branches where business_id=v_business_id and group_id<>v_group) then
     raise exception 'Sucursal vinculada a otra empresa: %',v_business_id;
   end if;
   v_used:=array_append(v_used,v_business_id);
   insert into public.business_group_branches(group_id,business_id,branch_label,display_order,active)
    values(v_group,v_business_id,coalesce(nullif(btrim(v_branch->>'label'),''),(select name from public.locals where id=v_business_id)),
      coalesce((v_branch->>'order')::integer,0),true)
   on conflict(group_id,business_id) do update set
    branch_label=excluded.branch_label,display_order=excluded.display_order,active=true;
 end loop;
 return v_group;
end $body$;
revoke all on function public.master_upsert_business_group(uuid,text,text,jsonb) from public;
grant execute on function public.master_upsert_business_group(uuid,text,text,jsonb) to authenticated;
create or replace view public.business_branch_catalog as
 select g.id group_id,g.name company_name,g.slug company_slug,
        gb.business_id,gb.branch_label,gb.display_order,
        l.name business_name,l.whatsapp,l.phone,l.active business_active
 from public.business_groups g
 join public.business_group_branches gb on gb.group_id=g.id
 join public.locals l on l.id=gb.business_id
 where g.active and gb.active;
grant select on public.business_branch_catalog to anon,authenticated;