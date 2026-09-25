create table if not exists private.delivery_customer_groups(
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_customer_groups_name_check
    check (char_length(trim(name)) between 1 and 120),
  constraint delivery_customer_groups_description_check
    check (description is null or char_length(description)<=300),
  unique(delivery_id,id)
);

create unique index if not exists delivery_customer_groups_name_ci_idx
  on private.delivery_customer_groups(delivery_id,lower(trim(name)));

create table if not exists private.delivery_customer_group_members(
  delivery_id uuid not null,
  group_id uuid not null,
  customer_id uuid not null,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(group_id,customer_id),
  constraint delivery_customer_group_members_group_fk
    foreign key(delivery_id,group_id)
    references private.delivery_customer_groups(delivery_id,id)
    on delete cascade,
  constraint delivery_customer_group_members_customer_fk
    foreign key(customer_id,delivery_id)
    references public.customer_deliveries(customer_id,delivery_id)
    on delete cascade
);

create index if not exists delivery_customer_group_members_delivery_idx
  on private.delivery_customer_group_members(delivery_id,customer_id);

alter table private.delivery_customer_groups enable row level security;
alter table private.delivery_customer_group_members enable row level security;
revoke all on table private.delivery_customer_groups from public,anon,authenticated;
revoke all on table private.delivery_customer_group_members from public,anon,authenticated;

drop policy if exists delivery_customer_groups_deny_all on private.delivery_customer_groups;
create policy delivery_customer_groups_deny_all
on private.delivery_customer_groups
for all to public
using(false)
with check(false);

drop policy if exists delivery_customer_group_members_deny_all on private.delivery_customer_group_members;
create policy delivery_customer_group_members_deny_all
on private.delivery_customer_group_members
for all to public
using(false)
with check(false);

create or replace function public.delivery_customer_groups_snapshot(p_delivery_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_available boolean;
  v_groups jsonb;
begin
  if not (
    public.is_master()
    or (
      public.current_role_code()='DELIVERY_ADMIN'
      and public.user_has_delivery(p_delivery_id)
      and public.has_permission('customers.view')
    )
  ) then
    raise exception 'HTPWEB: no autorizado para consultar grupos de clientes';
  end if;

  v_available:=public.delivery_has_capability(p_delivery_id,'customers.groups');

  if not v_available then
    return jsonb_build_object(
      'delivery_id',p_delivery_id,
      'available',false,
      'groups','[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',g.id,
    'name',g.name,
    'description',g.description,
    'active',g.active,
    'created_at',g.created_at,
    'updated_at',g.updated_at,
    'member_count',coalesce(m.member_count,0),
    'customer_ids',coalesce(m.customer_ids,'[]'::jsonb)
  ) order by lower(g.name),g.created_at),'[]'::jsonb)
  into v_groups
  from private.delivery_customer_groups g
  left join lateral (
    select
      count(*)::integer member_count,
      coalesce(jsonb_agg(gm.customer_id order by gm.created_at),'[]'::jsonb) customer_ids
    from private.delivery_customer_group_members gm
    where gm.group_id=g.id and gm.delivery_id=g.delivery_id
  ) m on true
  where g.delivery_id=p_delivery_id;

  return jsonb_build_object(
    'delivery_id',p_delivery_id,
    'available',true,
    'groups',v_groups
  );
end;
$$;

revoke execute on function public.delivery_customer_groups_snapshot(uuid) from public,anon;
grant execute on function public.delivery_customer_groups_snapshot(uuid) to authenticated;

create or replace function public.delivery_save_customer_group(
  p_delivery_id uuid,
  p_group_id uuid,
  p_name text,
  p_description text default null,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid:=p_group_id;
  v_name text:=trim(coalesce(p_name,''));
  v_description text:=nullif(trim(coalesce(p_description,'')),'');
  v_result jsonb;
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('customers.manage')
  then
    raise exception 'HTPWEB: no autorizado para administrar grupos de clientes';
  end if;

  if not public.delivery_has_capability(p_delivery_id,'customers.groups') then
    raise exception 'HTPWEB: el plan vigente no incluye grupos de clientes';
  end if;

  if char_length(v_name)<1 or char_length(v_name)>120 then
    raise exception 'HTPWEB: el nombre del grupo debe tener entre 1 y 120 caracteres';
  end if;

  if v_description is not null and char_length(v_description)>300 then
    raise exception 'HTPWEB: la descripción del grupo supera 300 caracteres';
  end if;

  begin
    if v_id is null then
      insert into private.delivery_customer_groups(
        delivery_id,name,description,active,created_by,created_at,updated_at
      )
      values(
        p_delivery_id,v_name,v_description,coalesce(p_active,true),auth.uid(),now(),now()
      )
      returning id into v_id;
    else
      update private.delivery_customer_groups
      set name=v_name,
          description=v_description,
          active=coalesce(p_active,false),
          updated_at=now()
      where id=v_id and delivery_id=p_delivery_id;

      if not found then
        raise exception 'HTPWEB: grupo inexistente en este DELIVERY';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'HTPWEB: ya existe un grupo con ese nombre';
  end;

  select jsonb_build_object(
    'id',g.id,'delivery_id',g.delivery_id,'name',g.name,
    'description',g.description,'active',g.active,
    'created_at',g.created_at,'updated_at',g.updated_at
  )
  into v_result
  from private.delivery_customer_groups g
  where g.id=v_id and g.delivery_id=p_delivery_id;

  return v_result;
end;
$$;

revoke execute on function public.delivery_save_customer_group(uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.delivery_save_customer_group(uuid,uuid,text,text,boolean) to authenticated;

create or replace function public.delivery_delete_customer_group(
  p_delivery_id uuid,
  p_group_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('customers.manage')
  then
    raise exception 'HTPWEB: no autorizado para eliminar grupos de clientes';
  end if;

  if not public.delivery_has_capability(p_delivery_id,'customers.groups') then
    raise exception 'HTPWEB: el plan vigente no incluye grupos de clientes';
  end if;

  delete from private.delivery_customer_groups
  where id=p_group_id and delivery_id=p_delivery_id;

  return found;
end;
$$;

revoke execute on function public.delivery_delete_customer_group(uuid,uuid) from public,anon;
grant execute on function public.delivery_delete_customer_group(uuid,uuid) to authenticated;

create or replace function public.delivery_set_customer_group_members(
  p_delivery_id uuid,
  p_group_id uuid,
  p_customer_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_ids uuid[]:=coalesce(p_customer_ids,'{}'::uuid[]);
  v_requested integer;
  v_valid integer;
begin
  if public.current_role_code()<>'DELIVERY_ADMIN'
     or not public.user_has_delivery(p_delivery_id)
     or not public.has_permission('customers.manage')
  then
    raise exception 'HTPWEB: no autorizado para administrar miembros del grupo';
  end if;

  if not public.delivery_has_capability(p_delivery_id,'customers.groups') then
    raise exception 'HTPWEB: el plan vigente no incluye grupos de clientes';
  end if;

  if not exists(
    select 1 from private.delivery_customer_groups g
    where g.id=p_group_id and g.delivery_id=p_delivery_id
  ) then
    raise exception 'HTPWEB: grupo inexistente en este DELIVERY';
  end if;

  select count(distinct customer_id)::integer
  into v_requested
  from unnest(v_ids) as requested(customer_id);

  if v_requested>2000 then
    raise exception 'HTPWEB: máximo 2000 clientes por grupo';
  end if;

  select count(*)::integer
  into v_valid
  from (
    select distinct customer_id
    from unnest(v_ids) as requested(customer_id)
  ) requested
  join public.customer_deliveries cd
    on cd.customer_id=requested.customer_id
   and cd.delivery_id=p_delivery_id;

  if v_valid<>v_requested then
    raise exception 'HTPWEB: uno o más clientes no pertenecen a este DELIVERY';
  end if;

  delete from private.delivery_customer_group_members
  where delivery_id=p_delivery_id and group_id=p_group_id;

  insert into private.delivery_customer_group_members(
    delivery_id,group_id,customer_id,added_by,created_at
  )
  select p_delivery_id,p_group_id,requested.customer_id,auth.uid(),now()
  from (
    select distinct customer_id
    from unnest(v_ids) as values_list(customer_id)
  ) requested;

  return public.delivery_customer_groups_snapshot(p_delivery_id);
end;
$$;

revoke execute on function public.delivery_set_customer_group_members(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.delivery_set_customer_group_members(uuid,uuid,uuid[]) to authenticated;
