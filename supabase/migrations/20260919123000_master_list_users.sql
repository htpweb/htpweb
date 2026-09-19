-- Código #68
-- Listado seguro de cuentas para administración MASTER.
-- Sí modifica: crea/actualiza una función RPC de solo lectura.

create or replace function public.master_list_users()
returns table (
  user_id uuid,
  email text,
  full_name text,
  phone text,
  role_code text,
  profile_active boolean,
  email_confirmed boolean,
  active_customer boolean,
  delivery_ids uuid[],
  local_ids uuid[],
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: autenticación requerida';
  end if;

  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  return query
  select
    p.id as user_id,
    u.email::text,
    p.full_name,
    p.phone,
    r.code as role_code,
    p.active as profile_active,
    (u.email_confirmed_at is not null) as email_confirmed,
    exists (
      select 1
      from public.customers c
      where c.profile_id = p.id
        and c.active = true
    ) as active_customer,
    coalesce(
      (
        select array_agg(ud.delivery_id order by ud.delivery_id)
        from public.user_deliveries ud
        where ud.user_id = p.id
          and ud.active = true
      ),
      '{}'::uuid[]
    ) as delivery_ids,
    coalesce(
      (
        select array_agg(ul.local_id order by ul.local_id)
        from public.user_locals ul
        where ul.user_id = p.id
          and ul.active = true
      ),
      '{}'::uuid[]
    ) as local_ids,
    p.created_at
  from public.profiles p
  join auth.users u
    on u.id = p.id
  join public.roles r
    on r.id = p.role_id
  order by lower(coalesce(p.full_name, u.email, p.id::text)), p.created_at;
end;
$function$;

revoke all on function public.master_list_users() from public;
revoke all on function public.master_list_users() from anon;
grant execute on function public.master_list_users() to authenticated;
