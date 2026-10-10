-- MASTER grants enterprise supervision, never implicit access to unrelated groups.
create or replace function public.master_set_business_group_admin(
 p_group_id uuid,p_user_id uuid,p_active boolean default true
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
begin
 if not public.is_master() then raise exception 'Solo MASTER puede asignar administradores empresariales'; end if;
 if not exists(select 1 from public.business_groups where id=p_group_id) then raise exception 'Empresa no encontrada'; end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'Usuario no encontrado'; end if;
 insert into public.business_group_admins(group_id,user_id,active)
 values(p_group_id,p_user_id,coalesce(p_active,false))
 on conflict(group_id,user_id) do update set active=excluded.active;
 return jsonb_build_object('group_id',p_group_id,'user_id',p_user_id,'active',coalesce(p_active,false));
end $fn$;
revoke all on function public.master_set_business_group_admin(uuid,uuid,boolean) from public;
grant execute on function public.master_set_business_group_admin(uuid,uuid,boolean) to authenticated;
create or replace function public.my_business_group_branches()
returns table(group_id uuid,company_name text,business_id uuid,branch_name text,branch_label text)
language sql security definer set search_path='' stable
as $fn$
 select g.id,g.name,b.id,l.name,b.branch_label
 from public.business_groups g
 join public.business_group_branches b on b.group_id=g.id
 join public.locals l on l.id=b.business_id
 where g.active and b.active and (
  public.is_master()
  or exists(select 1 from public.business_group_admins ga where ga.group_id=g.id and ga.user_id=(select auth.uid()) and ga.active)
  or public.user_can_manage_business_resource(b.business_id,'products.manage','products.manage')
 )
 order by g.name,b.display_order
$fn$;
revoke all on function public.my_business_group_branches() from public;
grant execute on function public.my_business_group_branches() to authenticated;
-- Group-level permission is provided only through explicit enterprise manager authorization.
create or replace function public.can_manage_enterprise_branch(p_business_id uuid)
returns boolean language sql security definer set search_path='' stable
as $fn$
 select coalesce(public.is_master(),false) or exists(
  select 1 from public.business_group_branches b
  join public.business_group_admins a on a.group_id=b.group_id
  where b.business_id=p_business_id and b.active and a.active and a.user_id=(select auth.uid())
 )
$fn$;
revoke all on function public.can_manage_enterprise_branch(uuid) from public;
grant execute on function public.can_manage_enterprise_branch(uuid) to authenticated;