-- V4 option groups normalize multiple Excel rows for one product / variant.
create table if not exists public.product_option_groups (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id) on delete cascade,
 variant_name text not null default '',
 name text not null,
 min_select integer not null default 0 check(min_select>=0),
 max_select integer not null default 1 check(max_select>=0),
 allow_repeat boolean not null default false,
 max_distinct integer,
 active boolean not null default false,
 display_order integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint product_option_group_limits check(max_select>=min_select),
 constraint product_option_group_distinct check(max_distinct is null or (max_distinct>0 and max_distinct<=max_select)),
 unique(product_id,variant_name,name)
);
create table if not exists public.product_option_values (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.product_option_groups(id) on delete cascade,
 name text not null,
 price_delta numeric(12,2) not null default 0 check(price_delta>=0),
 display_order integer not null default 0,
 active boolean not null default false,
 unique(group_id,name)
);
create index if not exists product_option_groups_product_idx on public.product_option_groups(product_id,variant_name);
create index if not exists product_option_values_group_idx on public.product_option_values(group_id,display_order);
alter table public.product_option_groups enable row level security;
alter table public.product_option_values enable row level security;
drop policy if exists catalog_option_group_read on public.product_option_groups;
create policy catalog_option_group_read on public.product_option_groups for select to anon,authenticated
 using(active and exists(select 1 from public.products p where p.id=product_id and p.active=true));
drop policy if exists catalog_option_value_read on public.product_option_values;
create policy catalog_option_value_read on public.product_option_values for select to anon,authenticated
 using(active and exists(select 1 from public.product_option_groups g join public.products p on p.id=g.product_id
 where g.id=group_id and g.active=true and p.active=true));
-- Authorized owners write only through controlled RPC, never direct DML.
create or replace function public.upsert_product_option_group_v4(
 p_business_id uuid,p_sku text,p_variant text,p_group_name text,
 p_min integer,p_max integer,p_repeat boolean,p_max_distinct integer,
 p_values jsonb,p_activate boolean default false
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare pid uuid;gid uuid;row_value jsonb;value_name text;value_delta numeric;value_id uuid;n integer:=0;
begin
 if not (public.is_master() or public.user_can_manage_business_resource(p_business_id,'products.manage','products.manage')) then
   raise exception 'Sin autorizacion';
 end if;
 if nullif(btrim(p_sku),'') is null or nullif(btrim(p_group_name),'') is null then raise exception 'SKU y grupo requeridos'; end if;
 if p_min is null or p_max is null or p_min<0 or p_max<p_min or p_max>100 then raise exception 'Limites de opciones invalidos'; end if;
 if p_max_distinct is not null and (p_max_distinct<1 or p_max_distinct>p_max) then raise exception 'Maximo de sabores invalido'; end if;
 if p_values is null or jsonb_typeof(p_values)<>'array' or jsonb_array_length(p_values) not between 1 and 100 then raise exception 'Opciones invalidas'; end if;
 select id into pid from public.products where business_id=p_business_id and lower(btrim(sku))=lower(btrim(p_sku))
 order by id limit 1;
 if pid is null then raise exception 'Producto no encontrado'; end if;
 insert into public.product_option_groups(product_id,variant_name,name,min_select,max_select,allow_repeat,max_distinct,active)
 values(pid,coalesce(btrim(p_variant),''),btrim(p_group_name),p_min,p_max,coalesce(p_repeat,false),p_max_distinct,coalesce(p_activate,false))
 on conflict(product_id,variant_name,name) do update set
 min_select=excluded.min_select,max_select=excluded.max_select,allow_repeat=excluded.allow_repeat,
 max_distinct=excluded.max_distinct,active=excluded.active,updated_at=now()
 returning id into gid;
 for row_value in select value from jsonb_array_elements(p_values) loop
   value_name:=nullif(btrim(row_value->>'name'),'');
   begin value_delta:=coalesce((row_value->>'price_delta')::numeric,0);
   exception when others then raise exception 'Recargo invalido'; end;
   if value_name is null or length(value_name)>160 or value_delta<0 or value_delta>10000 then raise exception 'Valor de opcion invalido'; end if;
   insert into public.product_option_values(group_id,name,price_delta,display_order,active)
   values(gid,value_name,value_delta,n,coalesce(p_activate,false))
   on conflict(group_id,name) do update set price_delta=excluded.price_delta,
       display_order=excluded.display_order,active=excluded.active
   returning id into value_id;
   n:=n+1;
 end loop;
 return jsonb_build_object('product_id',pid,'group_id',gid,'option_count',n,'published',coalesce(p_activate,false));
end $fn$;
revoke all on function public.upsert_product_option_group_v4(uuid,text,text,text,integer,integer,boolean,integer,jsonb,boolean) from public;
grant execute on function public.upsert_product_option_group_v4(uuid,text,text,text,integer,integer,boolean,integer,jsonb,boolean) to authenticated;