-- HTPWEB Código 103 — reinicio seguro de todos los LOCAL.
-- Solicitud explícita de MASTER: eliminar los locales creados para rehacer la carga.
--
-- Seguridad:
-- 1) Si existe historial en order_locals, la migración aborta completa y no borra nada.
-- 2) Se eliminan primero relaciones directas con FK RESTRICT/NO ACTION.
-- 3) Las relaciones CASCADE / SET NULL se dejan actuar según el esquema.
-- 4) Todo ocurre dentro de la transacción de la migración.

do $reset$
declare
  v_local_count bigint := 0;
  v_has_order_history boolean := false;
  v_fk record;
  v_deleted bigint := 0;
begin
  select count(*) into v_local_count
  from public.locals;

  if v_local_count = 0 then
    raise notice 'HTPWEB Código 103: no hay LOCAL para eliminar.';
    return;
  end if;

  if to_regclass('public.order_locals') is not null then
    execute 'select exists (
      select 1
      from public.order_locals ol
      where ol.local_id is not null
    )'
    into v_has_order_history;
  end if;

  if v_has_order_history then
    raise exception
      'HTPWEB Código 103 cancelado: existen LOCAL vinculados a historial de pedidos. No se eliminó ningún dato.';
  end if;

  -- Resolver automáticamente relaciones directas que impedirían borrar LOCAL.
  -- CASCADE, SET NULL y SET DEFAULT se respetan sin intervención.
  for v_fk in
    select
      ns.nspname as child_schema,
      cl.relname as child_table,
      att.attname as child_column,
      con.confdeltype
    from pg_constraint con
    join pg_class cl
      on cl.oid = con.conrelid
    join pg_namespace ns
      on ns.oid = cl.relnamespace
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'public.locals'::regclass
      and cardinality(con.conkey) = 1
      and con.confdeltype in ('a','r')
  loop
    execute format(
      'delete from %I.%I where %I in (select id from public.locals)',
      v_fk.child_schema,
      v_fk.child_table,
      v_fk.child_column
    );

    get diagnostics v_deleted = row_count;

    if v_deleted > 0 then
      raise notice
        'HTPWEB Código 103: eliminadas % filas dependientes de %.% (%).',
        v_deleted,
        v_fk.child_schema,
        v_fk.child_table,
        v_fk.child_column;
    end if;
  end loop;

  delete from public.locals;
  get diagnostics v_deleted = row_count;

  if v_deleted <> v_local_count then
    raise exception
      'HTPWEB Código 103: se esperaban eliminar % LOCAL y se eliminaron %. La transacción se revierte.',
      v_local_count,
      v_deleted;
  end if;

  raise notice
    'HTPWEB Código 103: reinicio completado. % LOCAL eliminados.',
    v_deleted;
end;
$reset$;
