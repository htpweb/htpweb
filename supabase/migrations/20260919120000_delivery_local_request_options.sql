-- Código #65
-- Opciones seguras para que un DELIVERY_ADMIN solicite vincular o actualizar LOCAL
-- Sí modifica: crea/actualiza una función RPC de solo lectura.

create or replace function public.delivery_local_request_options(
  p_delivery_id uuid,
  p_mode text
)
returns table (
  id uuid,
  name text,
  address text,
  phone text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mode text;
begin
  if auth.uid() is null then
    raise exception 'HTPWEB: se requiere autenticación';
  end if;

  if p_delivery_id is null then
    raise exception 'HTPWEB: se requiere delivery_id';
  end if;

  if not exists (
    select 1
    from public.deliveries d
    where d.id = p_delivery_id
      and d.active = true
  ) then
    raise exception 'HTPWEB: DELIVERY inexistente o inactivo';
  end if;

  if not public.is_master() then
    if not public.has_permission('locals.request') then
      raise exception 'HTPWEB: no tiene permiso locals.request';
    end if;

    if not public.user_has_delivery(p_delivery_id) then
      raise exception 'HTPWEB: no pertenece al DELIVERY';
    end if;
  end if;

  v_mode := upper(trim(coalesce(p_mode, '')));

  if v_mode = 'LINK_EXISTING' then
    return query
    select
      l.id,
      l.name,
      l.address,
      l.phone
    from public.locals l
    where l.active = true
      and not exists (
        select 1
        from public.local_deliveries ld
        where ld.delivery_id = p_delivery_id
          and ld.local_id = l.id
          and ld.active = true
      )
    order by lower(l.name), l.id;

    return;
  end if;

  if v_mode = 'RELATED' then
    return query
    select
      l.id,
      l.name,
      l.address,
      l.phone
    from public.local_deliveries ld
    join public.locals l
      on l.id = ld.local_id
    where ld.delivery_id = p_delivery_id
      and ld.active = true
      and l.active = true
    order by lower(l.name), l.id;

    return;
  end if;

  raise exception 'HTPWEB: modo inválido para opciones de LOCAL';
end;
$function$;

revoke all on function public.delivery_local_request_options(uuid, text) from public;
revoke all on function public.delivery_local_request_options(uuid, text) from anon;
grant execute on function public.delivery_local_request_options(uuid, text) to authenticated;
