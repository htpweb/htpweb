-- Keep multi-workspace access synchronized and expose owned DELIVERY still in setup.
create or replace function public.my_account_modes()
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
   'current_role',(select r.code from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid()),
   'customer_id',public.current_customer_id(),
   'locals',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'slug',l.slug,'active',l.active) order by lower(l.name))
     from public.user_locals ul join public.locals l on l.id=ul.local_id where ul.user_id=auth.uid() and ul.active),'[]'::jsonb),
   'deliveries',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'slug',d.slug,'active',d.active,'role_code',ar.role_code) order by lower(d.name))
     from public.account_delivery_roles ar
     join public.user_deliveries ud on ud.user_id=ar.user_id and ud.delivery_id=ar.delivery_id and ud.active
     join public.deliveries d on d.id=ar.delivery_id
     where ar.user_id=auth.uid() and ar.active),'[]'::jsonb)
 );
$$;

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
      where ul.user_id=auth.uid() and ul.local_id=p_resource_id and ul.active)
     then raise exception 'HTPWEB: no administras este LOCAL'; end if;
   v_role:='LOCAL_ADMIN';
 elsif v_mode='DELIVERY' then
   select ar.role_code into v_role
   from public.account_delivery_roles ar
   join public.user_deliveries ud on ud.user_id=ar.user_id and ud.delivery_id=ar.delivery_id and ud.active
   where ar.user_id=auth.uid() and ar.delivery_id=p_resource_id and ar.active;
   if v_role is null then raise exception 'HTPWEB: no tienes acceso a este DELIVERY'; end if;
 else raise exception 'HTPWEB: modo inválido'; end if;
 select id into v_role_id from public.roles where code=v_role and active limit 1;
 if v_role_id is null then raise exception 'HTPWEB: rol de modo no disponible'; end if;
 update public.profiles set role_id=v_role_id,updated_at=now() where id=auth.uid();
 return v_role;
end $$;

create or replace function public.master_unassign_delivery_user(p_user_id uuid,p_delivery_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_client uuid;
begin
 if not public.is_master() then raise exception 'HTPWEB: operación exclusiva de MASTER'; end if;
 if exists(select 1 from public.order_driver_assignments a join public.orders o on o.id=a.order_id
   where a.driver_user_id=p_user_id and a.delivery_id=p_delivery_id and a.status='ACTIVE'
     and a.unassigned_at is null and o.status in ('READY','EN_ROUTE'))
   then raise exception 'HTPWEB: el usuario tiene entregas activas y no puede desvincularse'; end if;
 update public.user_deliveries set active=false where user_id=p_user_id and delivery_id=p_delivery_id;
 update public.account_delivery_roles set active=false,updated_at=now() where user_id=p_user_id and delivery_id=p_delivery_id;
 if not exists(select 1 from public.user_deliveries where user_id=p_user_id and active)
   and exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id=p_user_id and r.code like 'DELIVERY_%')
 then
   select id into v_client from public.roles where code='CLIENT' and active limit 1;
   update public.profiles set role_id=v_client,updated_at=now() where id=p_user_id;
 end if;
end $$;
