-- HTPWEB platform expansion: business sectors + scalable public directory.
create table if not exists public.business_sectors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  display_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.business_sectors enable row level security;

drop policy if exists business_sectors_select_public on public.business_sectors;
create policy business_sectors_select_public
on public.business_sectors for select
to anon,authenticated
using (active or public.is_master());

insert into public.business_sectors(code,name,description,display_order,active)
values ('RESTAURANTS','Restaurantes y alimentos','Restaurantes, cafeterías, comida preparada y bebidas.',10,true)
on conflict(code) do update set name=excluded.name,description=excluded.description,active=true,updated_at=now();

alter table public.local_business_categories
  add column if not exists sector_id uuid references public.business_sectors(id);

update public.local_business_categories c
set sector_id=s.id
from public.business_sectors s
where c.sector_id is null and s.code='RESTAURANTS';

create index if not exists local_business_categories_sector_idx
on public.local_business_categories(sector_id,active,name);

create or replace function public.master_list_business_sectors()
returns jsonb language sql stable security definer set search_path=''
as $$
  select case when not public.is_master() then '[]'::jsonb else
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'code',s.code,'name',s.name,'description',s.description,
        'display_order',s.display_order,'active',s.active,
        'category_count',(select count(*) from public.local_business_categories c where c.sector_id=s.id),
        'local_count',(select count(distinct a.local_id)
          from public.local_business_category_assignments a
          join public.local_business_categories c on c.id=a.category_id
          where c.sector_id=s.id)
      ) order by s.display_order,lower(s.name))
      from public.business_sectors s
    ),'[]'::jsonb)
  end;
$$;

revoke all on function public.master_list_business_sectors() from public;
grant execute on function public.master_list_business_sectors() to authenticated;

create or replace function public.master_save_business_sector(
  p_sector_id uuid,p_code text,p_name text,p_description text,p_display_order integer,p_active boolean
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid:=coalesce(p_sector_id,gen_random_uuid());
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'HTPWEB: nombre del sector requerido'; end if;
  if nullif(trim(p_code),'') is null then raise exception 'HTPWEB: código del sector requerido'; end if;
  insert into public.business_sectors(id,code,name,description,display_order,active,updated_at)
  values(v_id,upper(trim(p_code)),trim(p_name),nullif(trim(coalesce(p_description,'')),''),
    coalesce(p_display_order,100),coalesce(p_active,true),now())
  on conflict(id) do update set code=excluded.code,name=excluded.name,description=excluded.description,
    display_order=excluded.display_order,active=excluded.active,updated_at=now();
  return v_id;
end;
$$;
revoke all on function public.master_save_business_sector(uuid,text,text,text,integer,boolean) from public;
grant execute on function public.master_save_business_sector(uuid,text,text,text,integer,boolean) to authenticated;

create or replace function public.master_list_local_business_categories()
returns jsonb language sql stable security definer set search_path=''
as $$
  select case when not public.is_master() then '[]'::jsonb else
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'name',c.name,'description',c.description,'active',c.active,
        'sector_id',c.sector_id,'sector_name',s.name,
        'local_count',(select count(distinct a.local_id)
          from public.local_business_category_assignments a where a.category_id=c.id)
      ) order by coalesce(s.display_order,999),lower(c.name),c.id)
      from public.local_business_categories c
      left join public.business_sectors s on s.id=c.sector_id
    ),'[]'::jsonb)
  end;
$$;

create or replace function public.master_save_local_business_category(
  p_category_id uuid,p_name text,p_description text,p_active boolean,p_sector_id uuid
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid:=coalesce(p_category_id,gen_random_uuid()); v_name text:=nullif(trim(p_name),'');
begin
  if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
  if v_name is null then raise exception 'HTPWEB: nombre de categoría requerido'; end if;
  if p_sector_id is null or not exists(select 1 from public.business_sectors s where s.id=p_sector_id and s.active)
    then raise exception 'HTPWEB: selecciona un sector de negocio activo'; end if;
  if exists(select 1 from public.local_business_categories c
    where lower(trim(c.name))=lower(v_name) and c.sector_id=p_sector_id and c.id<>v_id)
    then raise exception 'HTPWEB: ya existe esa categoría en el sector seleccionado'; end if;
  insert into public.local_business_categories(id,name,description,active,sector_id,created_at,updated_at)
  values(v_id,v_name,nullif(trim(coalesce(p_description,'')),''),coalesce(p_active,true),p_sector_id,now(),now())
  on conflict(id) do update set name=excluded.name,description=excluded.description,
    active=excluded.active,sector_id=excluded.sector_id,updated_at=now();
  return v_id;
end;
$$;
revoke all on function public.master_save_local_business_category(uuid,text,text,boolean,uuid) from public;
grant execute on function public.master_save_local_business_category(uuid,text,text,boolean,uuid) to authenticated;

create or replace function public.public_htpweb_directory_filters()
returns jsonb language sql stable security definer set search_path=''
as $$
select jsonb_build_object(
 'sectors',coalesce((select jsonb_agg(jsonb_build_object(
   'id',s.id,'code',s.code,'name',s.name,'description',s.description,'display_order',s.display_order,
   'local_count',(select count(distinct a.local_id)
      from public.local_business_category_assignments a
      join public.local_business_categories c on c.id=a.category_id
      join public.locals l on l.id=a.local_id and l.active=true
      where c.sector_id=s.id and c.active=true)
 ) order by s.display_order,lower(s.name)) from public.business_sectors s where s.active),'[]'::jsonb),
 'categories',coalesce((select jsonb_agg(jsonb_build_object(
   'id',c.id,'sector_id',c.sector_id,'name',c.name,'description',c.description
 ) order by lower(c.name)) from public.local_business_categories c where c.active),'[]'::jsonb)
);
$$;
grant execute on function public.public_htpweb_directory_filters() to anon,authenticated;

create or replace function public.public_htpweb_directory(
 p_sector_id uuid default null,p_category_id uuid default null,p_search text default null,
 p_limit integer default 48,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_limit integer:=least(greatest(coalesce(p_limit,48),1),96);
        v_offset integer:=greatest(coalesce(p_offset,0),0);
        v_q text:=lower(trim(coalesce(p_search,'')));
begin
 return jsonb_build_object(
  'items',coalesce((
   select jsonb_agg(row_data order by sort_name)
   from (
    select lower(l.name) sort_name,jsonb_build_object(
      'id',l.id,'name',l.name,'slug',l.slug,'description',l.description,
      'banner_url',l.banner_url,'logo_url',l.logo_url,'address',l.address,
      'claimed',public.local_is_owner_managed(l.id),
      'delivery_count',(select count(*) from public.local_deliveries ld join public.deliveries d on d.id=ld.delivery_id and d.active where ld.local_id=l.id and ld.active),

      'category_ids',coalesce((select jsonb_agg(a.category_id order by a.position)
        from public.local_business_category_assignments a where a.local_id=l.id),'[]'::jsonb),
      'sector_ids',coalesce((select jsonb_agg(distinct c.sector_id)
        from public.local_business_category_assignments a
        join public.local_business_categories c on c.id=a.category_id
        where a.local_id=l.id and c.sector_id is not null),'[]'::jsonb),
      'products',coalesce((select jsonb_agg(to_jsonb(pv) order by pv.display_order,pv.name)
        from (select p.id,p.name,p.description,p.price,p.image_url,p.display_order
              from public.products p where p.local_id=l.id and p.active=true and p.catalog_visible=true
              order by p.display_order,p.name limit 3) pv),'[]'::jsonb)
    ) row_data
    from public.locals l
    where l.active=true
      and (p_category_id is null or exists(select 1 from public.local_business_category_assignments a where a.local_id=l.id and a.category_id=p_category_id))
      and (p_sector_id is null or exists(select 1 from public.local_business_category_assignments a
          join public.local_business_categories c on c.id=a.category_id
          where a.local_id=l.id and c.sector_id=p_sector_id))
      and (v_q='' or lower(concat_ws(' ',l.name,l.description,l.address)) like '%'||v_q||'%'
        or exists(select 1 from public.products p where p.local_id=l.id and p.active=true and p.catalog_visible=true
          and lower(concat_ws(' ',p.name,p.description)) like '%'||v_q||'%'))
    order by lower(l.name)
    limit v_limit offset v_offset
   ) q
  ),'[]'::jsonb),
  'limit',v_limit,'offset',v_offset
 );
end;
$$;
grant execute on function public.public_htpweb_directory(uuid,uuid,text,integer,integer) to anon,authenticated;

