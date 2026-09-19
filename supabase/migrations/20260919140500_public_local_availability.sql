-- Código #74
-- Disponibilidad pública segura de LOCAL.
-- Sí modifica: crea una RPC pública de solo lectura que usa la hora del servidor.

create or replace function public.public_locals_order_availability(
  p_local_ids uuid[],
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requested_count integer;
  v_allowed_ids uuid[];
  v_allowed_count integer;
begin
  if p_local_ids is null
     or cardinality(p_local_ids) = 0
  then
    return '[]'::jsonb;
  end if;

  select count(*)
    into v_requested_count
  from (
    select distinct x.local_id
    from unnest(p_local_ids) x(local_id)
  ) q;

  select array_agg(q.local_id order by q.ordinality), count(*)
    into v_allowed_ids, v_allowed_count
  from (
    select x.local_id, min(x.ordinality) as ordinality
    from unnest(p_local_ids) with ordinality x(local_id, ordinality)
    join public.locals l
      on l.id = x.local_id
     and l.active = true
    where public.local_is_public(x.local_id)
    group by x.local_id
  ) q;

  if coalesce(v_allowed_count, 0) <> v_requested_count then
    raise exception 'HTPWEB: uno o más LOCAL no están disponibles públicamente';
  end if;

  return public.check_locals_order_availability(
    coalesce(v_allowed_ids, array[]::uuid[]),
    p_at
  );
end;
$function$;

revoke all on function public.public_locals_order_availability(uuid[], timestamptz) from public;
grant execute on function public.public_locals_order_availability(uuid[], timestamptz) to anon;
grant execute on function public.public_locals_order_availability(uuid[], timestamptz) to authenticated;

comment on function public.public_locals_order_availability(uuid[], timestamptz) is
  'Devuelve disponibilidad actual para LOCAL públicos activos. Usa la misma regla backend que crear-pedido y no confía en la hora del navegador.';
