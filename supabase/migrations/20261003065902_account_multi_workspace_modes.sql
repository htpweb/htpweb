-- One HTPWEB account may shop, administer LOCAL and administer DELIVERY.
create table if not exists public.account_delivery_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  role_code text not null check(role_code in ('DELIVERY_ADMIN','DELIVERY_OPERATOR','DELIVERY_DRIVER')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,delivery_id)
);
alter table public.account_delivery_roles enable row level security;
drop policy if exists account_delivery_roles_select_self on public.account_delivery_roles;
create policy account_delivery_roles_select_self on public.account_delivery_roles for select to authenticated
using(user_id=auth.uid() or public.is_master());

insert into public.account_delivery_roles(user_id,delivery_id,role_code,active)
select ud.user_id,ud.delivery_id,r.code,true
from public.user_deliveries ud
join public.profiles p on p.id=ud.user_id
join public.roles r on r.id=p.role_id
where ud.active and r.code in ('DELIVERY_ADMIN','DELIVERY_OPERATOR','DELIVERY_DRIVER')
on conflict(user_id,delivery_id) do update set role_code=excluded.role_code,active=true,updated_at=now();

create or replace function public.convert_profile_to_local_admin(p_user_id uuid,p_convert_customer boolean)
returns void language plpgsql security definer set search_path=''
as $$
declare v_role text; v_target uuid;
begin
 select r.code into v_role from public.profiles p join public.roles r on r.id=p.role_id
 where p.id=p_user_id and p.active and r.active;
 if v_role is null then raise exception 'HTPWEB: profile inexistente o inactivo'; end if;
 if v_role='MASTER' then raise exception 'HTPWEB: una cuenta MASTER no se convierte'; end if;
 if v_role in ('LOCAL_ADMIN','DELIVERY_ADMIN','DELIVERY_OPERATOR','DELIVERY_DRIVER') then return; end if;
 select id into v_target from public.roles where code='LOCAL_ADMIN' and active limit 1;
 update public.profiles set role_id=v_target,updated_at=now() where id=p_user_id;
end $$;

create or replace function public.convert_profile_to_delivery_role(p_user_id uuid,p_role_code text,p_convert_customer boolean)
returns void language plpgsql security definer set search_path=''
as $$
declare v_role text; v_target text:=upper(trim(coalesce(p_role_code,''))); v_target_id uuid;
begin
 if v_target not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR','DELIVERY_DRIVER')
   then raise exception 'HTPWEB: rol DELIVERY inválido'; end if;
 select r.code into v_role from public.profiles p join public.roles r on r.id=p.role_id
 where p.id=p_user_id and p.active and r.active;
 if v_role is null then raise exception 'HTPWEB: profile inexistente o inactivo'; end if;
 if v_role='MASTER' then raise exception 'HTPWEB: una cuenta MASTER no se convierte'; end if;
 if v_role='LOCAL_ADMIN' then return; end if;
 select id into v_target_id from public.roles where code=v_target and active limit 1;
 if v_target_id is null then raise exception 'HTPWEB: rol destino inexistente'; end if;
 update public.profiles set role_id=v_target_id,updated_at=now() where id=p_user_id;
end $$;

create or replace function public.master_assign_delivery_user(p_user_id uuid,p_delivery_id uuid,p_role_code text,p_convert_customer boolean)
returns void language plpgsql security definer set search_path=''
as $$
declare v_role text:=upper(trim(coalesce(p_role_code,'')));
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 if v_role not in ('DELIVERY_ADMIN','DELIVERY_OPERATOR','DELIVERY_DRIVER') then raise exception 'HTPWEB: rol DELIVERY inválido'; end if;
 if not exists(select 1 from public.profiles p where p.id=p_user_id and p.active) then raise exception 'HTPWEB: cuenta inexistente o inactiva'; end if;
 if not exists(select 1 from public.deliveries d where d.id=p_delivery_id and d.active) then raise exception 'HTPWEB: DELIVERY inexistente o inactivo'; end if;
 insert into public.user_deliveries(user_id,delivery_id,active,created_at) values(p_user_id,p_delivery_id,true,now())
 on conflict(user_id,delivery_id) do update set active=true;
 insert into public.account_delivery_roles(user_id,delivery_id,role_code,active,updated_at)
 values(p_user_id,p_delivery_id,v_role,true,now())
 on conflict(user_id,delivery_id) do update set role_code=excluded.role_code,active=true,updated_at=now();
 perform public.convert_profile_to_delivery_role(p_user_id,v_role,false);
end $$;

create or replace function public.master_assign_local_admin(p_user_id uuid,p_local_id uuid,p_convert_customer boolean)
returns void language plpgsql security definer set search_path=''
as $$
declare v_before jsonb; v_after jsonb;
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 if not exists(select 1 from public.locals l where l.id=p_local_id and l.active) then raise exception 'HTPWEB: LOCAL inexistente o inactivo'; end if;
 select to_jsonb(p) into v_before from public.profiles p where p.id=p_user_id and p.active;
 if v_before is null then raise exception 'HTPWEB: profile inexistente o inactivo'; end if;
 perform public.convert_profile_to_local_admin(p_user_id,false);
 insert into public.user_locals(user_id,local_id,active,created_at) values(p_user_id,p_local_id,true,now())
 on conflict(user_id,local_id) do update set active=true;
 select to_jsonb(p) into v_after from public.profiles p where p.id=p_user_id;
 insert into public.local_change_history(local_id,request_id,change_type,before_data,after_data,changed_by,created_at)
 values(p_local_id,null,'MASTER_ASSIGN_LOCAL_ADMIN',v_before,v_after,auth.uid(),now());
end $$;

create or replace function public.my_account_modes()
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
   'current_role',(select r.code from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid()),
   'customer_id',public.current_customer_id(),
   'locals',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'slug',l.slug) order by lower(l.name))
     from public.user_locals ul join public.locals l on l.id=ul.local_id where ul.user_id=auth.uid() and ul.active and l.active),'[]'::jsonb),
   'deliveries',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'slug',d.slug,'role_code',ar.role_code) order by lower(d.name))
     from public.account_delivery_roles ar join public.deliveries d on d.id=ar.delivery_id
     where ar.user_id=auth.uid() and ar.active and d.active),'[]'::jsonb)
 );
$$;
revoke all on function public.my_account_modes() from public;
grant execute on function public.my_account_modes() to authenticated;

create or replace function public.switch_my_account_mode(p_mode text,p_resource_id uuid default null)
returns text language plpgsql security definer set search_path=''
as $$
declare v_mode text:=upper(trim(coalesce(p_mode,''))); v_role text; v_role_id uuid;
begin
 if auth.uid() is null then raise exception 'HTPWEB: autenticación requerida'; end if;
 select r.code into v_role from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.active;
 if v_role='MASTER' then raise exception 'HTPWEB: MASTER no cambia de modo'; end if;
 if v_mode='CLIENT' then v_role:='CLIENT';
 elsif v_mode='LOCAL' then
   if p_resource_id is null or not exists(select 1 from public.user_locals ul join public.locals l on l.id=ul.local_id
      where ul.user_id=auth.uid() and ul.local_id=p_resource_id and ul.active and l.active)
     then raise exception 'HTPWEB: no administras este LOCAL'; end if;
   v_role:='LOCAL_ADMIN';
 elsif v_mode='DELIVERY' then
   select ar.role_code into v_role from public.account_delivery_roles ar join public.deliveries d on d.id=ar.delivery_id
   where ar.user_id=auth.uid() and ar.delivery_id=p_resource_id and ar.active and d.active;
   if v_role is null then raise exception 'HTPWEB: no tienes acceso a este DELIVERY'; end if;
 else raise exception 'HTPWEB: modo inválido'; end if;
 select id into v_role_id from public.roles where code=v_role and active limit 1;
 if v_role_id is null then raise exception 'HTPWEB: rol de modo no disponible'; end if;
 update public.profiles set role_id=v_role_id,updated_at=now() where id=auth.uid();
 return v_role;
end $$;
revoke all on function public.switch_my_account_mode(text,uuid) from public;
grant execute on function public.switch_my_account_mode(text,uuid) to authenticated;

