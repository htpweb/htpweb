
create table if not exists public.local_business_category_assignments (
  local_id uuid not null references public.locals(id) on delete cascade,
  category_id uuid not null references public.local_business_categories(id) on delete restrict,
  position smallint not null check (position in (1,2)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (local_id, category_id),
  unique (local_id, position)
);

create index if not exists local_business_category_assignments_category_idx
  on public.local_business_category_assignments(category_id, local_id);

alter table public.local_business_category_assignments enable row level security;

drop policy if exists local_business_category_assignments_read
  on public.local_business_category_assignments;
create policy local_business_category_assignments_read
  on public.local_business_category_assignments
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.local_business_categories c
      where c.id = category_id and c.active = true
    )
    and (
      public.is_master()
      or public.local_is_public(local_id)
      or public.user_can_access_local(local_id)
    )
  );

revoke all on table public.local_business_category_assignments from public;
grant select on table public.local_business_category_assignments to anon, authenticated;

create or replace function public.sync_local_primary_business_category()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.business_category_id is null then
    delete from public.local_business_category_assignments
    where local_id = new.id and position = 1;
    return new;
  end if;

  delete from public.local_business_category_assignments
  where local_id = new.id
    and category_id = new.business_category_id
    and position <> 1;

  insert into public.local_business_category_assignments(local_id, category_id, position, created_at, updated_at)
  values(new.id, new.business_category_id, 1, now(), now())
  on conflict(local_id, position) do update
    set category_id = excluded.category_id,
        updated_at = now();

  return new;
end;
$$;

revoke all on function public.sync_local_primary_business_category() from public;

drop trigger if exists locals_sync_primary_business_category on public.locals;
create trigger locals_sync_primary_business_category
after insert or update of business_category_id on public.locals
for each row execute function public.sync_local_primary_business_category();

insert into public.local_business_category_assignments(local_id, category_id, position)
select id, business_category_id, 1
from public.locals
where business_category_id is not null
on conflict(local_id, position) do nothing;

create or replace function public.master_set_local_business_categories(
  p_local_id uuid,
  p_category_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if not exists(select 1 from public.locals where id = p_local_id) then
    raise exception 'HTPWEB: LOCAL inexistente';
  end if;

  select coalesce(array_agg(x.id order by x.ord), '{}'::uuid[])
  into v_ids
  from (
    select id, min(ord) ord
    from unnest(coalesce(p_category_ids, '{}'::uuid[])) with ordinality u(id,ord)
    where id is not null
    group by id
  ) x;

  if coalesce(array_length(v_ids,1),0) < 1 then
    raise exception 'HTPWEB: selecciona al menos una categoría';
  end if;
  if array_length(v_ids,1) > 2 then
    raise exception 'HTPWEB: un LOCAL puede tener máximo 2 categorías';
  end if;
  if exists(
    select 1
    from unnest(v_ids) id
    left join public.local_business_categories c on c.id=id and c.active=true
    where c.id is null
  ) then
    raise exception 'HTPWEB: categoría inexistente o inactiva';
  end if;

  delete from public.local_business_category_assignments where local_id=p_local_id;

  insert into public.local_business_category_assignments(local_id,category_id,position,created_at,updated_at)
  select p_local_id,id,ord::smallint,now(),now()
  from unnest(v_ids) with ordinality u(id,ord);

  update public.locals
  set business_category_id=v_ids[1], updated_at=now()
  where id=p_local_id;

  return jsonb_build_object('local_id',p_local_id,'category_ids',to_jsonb(v_ids));
end;
$$;

revoke all on function public.master_set_local_business_categories(uuid,uuid[]) from public, anon;
grant execute on function public.master_set_local_business_categories(uuid,uuid[]) to authenticated;

create or replace function public.master_list_local_business_categories()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when not public.is_master() then '[]'::jsonb else
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,
        'name',c.name,
        'description',c.description,
        'active',c.active,
        'local_count',(
          select count(distinct a.local_id)
          from public.local_business_category_assignments a
          where a.category_id=c.id
        )
      ) order by lower(c.name),c.id)
      from public.local_business_categories c
    ),'[]'::jsonb)
  end;
$$;

create or replace function public.master_list_locals()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'name',l.name,'slug',l.slug,'description',l.description,
    'address',l.address,'latitude',l.latitude,'longitude',l.longitude,
    'phone',l.phone,'whatsapp',l.whatsapp,'active',l.active,
    'logo_url',l.logo_url,'banner_url',l.banner_url,'zone_id',l.zone_id,
    'business_category_id',l.business_category_id,
    'business_category_name',bc.name,
    'business_category_ids',coalesce((
      select jsonb_agg(a.category_id order by a.position)
      from public.local_business_category_assignments a
      where a.local_id=l.id
    ),'[]'::jsonb),
    'business_category_names',coalesce((
      select jsonb_agg(c2.name order by a2.position)
      from public.local_business_category_assignments a2
      join public.local_business_categories c2 on c2.id=a2.category_id
      where a2.local_id=l.id
    ),'[]'::jsonb),
    'google_place_id',l.google_place_id,'google_maps_url',l.google_maps_url,
    'location_source',l.location_source,'zone_code',z.code,'zone_name',z.name,
    'city_id',coalesce(l.city_id,z.city_id),
    'canton',coalesce(lc.name,zc.name),
    'province',coalesce(lc.province,zc.province)
  ) order by coalesce(lc.province,zc.province),coalesce(lc.name,zc.name),lower(l.name)),'[]'::jsonb)
  from public.locals l
  left join public.zones z on z.id=l.zone_id
  left join public.cities zc on zc.id=z.city_id
  left join public.cities lc on lc.id=l.city_id
  left join public.local_business_categories bc on bc.id=l.business_category_id
  where public.is_master();
$$;

create or replace function public.master_save_local_business_category(
  p_category_id uuid, p_name text, p_description text, p_active boolean
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid:=coalesce(p_category_id,gen_random_uuid());
  v_name text:=nullif(trim(p_name),'');
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;
  if v_name is null then
    raise exception 'HTPWEB: nombre de categoría requerido';
  end if;
  if exists(
    select 1 from public.local_business_categories c
    where lower(trim(c.name))=lower(v_name) and c.id<>v_id
  ) then
    raise exception 'HTPWEB: ya existe una categoría de LOCAL con ese nombre';
  end if;
  if p_category_id is not null
     and not exists(select 1 from public.local_business_categories c where c.id=p_category_id) then
    raise exception 'HTPWEB: categoría inexistente';
  end if;
  if coalesce(p_active,false)=false
     and exists(
       select 1
       from public.local_business_category_assignments a
       join public.locals l on l.id=a.local_id
       where a.category_id=v_id and l.active=true
     ) then
    raise exception 'HTPWEB: no puede inactivar una categoría utilizada por LOCAL activos';
  end if;

  insert into public.local_business_categories(id,name,description,active,created_at,updated_at)
  values(v_id,v_name,nullif(trim(coalesce(p_description,'')),''),coalesce(p_active,true),now(),now())
  on conflict(id) do update set
    name=excluded.name,description=excluded.description,
    active=excluded.active,updated_at=now();

  return v_id;
end;
$$;

notify pgrst, 'reload schema';