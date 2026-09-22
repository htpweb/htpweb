-- HTPWEB Código 105 — activación/desactivación masiva de LOCAL.
-- Reutiliza master_set_local_active para conservar todas las validaciones,
-- triggers de zona/cobertura y auditoría existentes.

create or replace function public.master_set_locals_active(
  p_local_ids uuid[],
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_count integer:=0;
  v_distinct_count integer:=0;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if p_local_ids is null or cardinality(p_local_ids)=0 then
    raise exception 'HTPWEB: seleccione al menos un LOCAL';
  end if;

  select count(distinct x)
  into v_distinct_count
  from unnest(p_local_ids) as t(x)
  where x is not null;

  if v_distinct_count=0 then
    raise exception 'HTPWEB: seleccione al menos un LOCAL válido';
  end if;

  if v_distinct_count>1000 then
    raise exception 'HTPWEB: máximo 1000 LOCAL por operación masiva';
  end if;

  if exists(
    select 1
    from (
      select distinct x as id
      from unnest(p_local_ids) as t(x)
      where x is not null
    ) requested
    left join public.locals l on l.id=requested.id
    where l.id is null
  ) then
    raise exception 'HTPWEB: uno o más LOCAL seleccionados ya no existen';
  end if;

  -- La llamada se ejecuta dentro de una sola transacción. Si un LOCAL no cumple
  -- los requisitos de activación, toda la operación se revierte.
  for v_id in
    select distinct x
    from unnest(p_local_ids) as t(x)
    where x is not null
    order by x
  loop
    perform public.master_set_local_active(v_id,coalesce(p_active,false));
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object(
    'updated',v_count,
    'active',coalesce(p_active,false)
  );
end;
$$;

revoke all on function public.master_set_locals_active(uuid[],boolean)
from public,anon;

grant execute on function public.master_set_locals_active(uuid[],boolean)
to authenticated;
