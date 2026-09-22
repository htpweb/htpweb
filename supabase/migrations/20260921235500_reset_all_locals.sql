-- HTPWEB Código 103 — reinicio total de datos de prueba de pedidos y LOCAL.
-- Autorizado por el usuario: los pedidos existentes son de prueba y pueden eliminarse.
--
-- Alcance:
-- - elimina todos los pedidos de prueba y sus filas dependientes;
-- - elimina todos los LOCAL y únicamente las filas relacionadas con esos LOCAL;
-- - preserva DELIVERY, zonas, ciudades, categorías globales, usuarios y configuración general;
-- - usa DELETE selectivo, no TRUNCATE CASCADE, para no vaciar tablas compartidas completas.
--
-- La migración es transaccional: ante cualquier error, PostgreSQL revierte toda la operación.

do $reset$
declare
  v_order_count bigint := 0;
  v_local_count bigint := 0;
  v_deleted_orders bigint := 0;
  v_deleted_locals bigint := 0;
  v_deleted bigint := 0;
  v_fk record;
begin
  if to_regclass('public.orders') is not null then
    execute 'select count(*) from public.orders' into v_order_count;

    -- Eliminar solo filas que bloqueen DELETE de orders.
    -- CASCADE / SET NULL / SET DEFAULT continúan operando según el esquema.
    for v_fk in
      select
        ns.nspname as child_schema,
        cl.relname as child_table,
        att.attname as child_column
      from pg_constraint con
      join pg_class cl
        on cl.oid = con.conrelid
      join pg_namespace ns
        on ns.oid = cl.relnamespace
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = con.conkey[1]
      where con.contype = 'f'
        and con.confrelid = 'public.orders'::regclass
        and cardinality(con.conkey) = 1
        and con.confdeltype in ('a','r')
    loop
      execute format(
        'delete from %I.%I where %I in (select id from public.orders)',
        v_fk.child_schema,
        v_fk.child_table,
        v_fk.child_column
      );

      get diagnostics v_deleted = row_count;
      if v_deleted > 0 then
        raise notice
          'HTPWEB Código 103: eliminadas % filas de %.% vinculadas a pedidos.',
          v_deleted,
          v_fk.child_schema,
          v_fk.child_table;
      end if;
    end loop;

    execute 'delete from public.orders';
    get diagnostics v_deleted_orders = row_count;

    if v_deleted_orders <> v_order_count then
      raise exception
        'HTPWEB Código 103: se esperaban eliminar % pedidos y se eliminaron %.',
        v_order_count,
        v_deleted_orders;
    end if;
  end if;

  select count(*) into v_local_count
  from public.locals;

  -- Eliminar solo filas que bloqueen DELETE de locals.
  -- Esto cubre relaciones como usuarios, historial, planes o publicidad
  -- sin vaciar por completo tablas que también puedan contener otros destinos.
  for v_fk in
    select
      ns.nspname as child_schema,
      cl.relname as child_table,
      att.attname as child_column
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
        'HTPWEB Código 103: eliminadas % filas de %.% vinculadas a LOCAL.',
        v_deleted,
        v_fk.child_schema,
        v_fk.child_table;
    end if;
  end loop;

  delete from public.locals;
  get diagnostics v_deleted_locals = row_count;

  if v_deleted_locals <> v_local_count then
    raise exception
      'HTPWEB Código 103: se esperaban eliminar % LOCAL y se eliminaron %.',
      v_local_count,
      v_deleted_locals;
  end if;

  if exists(select 1 from public.locals) then
    raise exception 'HTPWEB Código 103: quedaron LOCAL después del reinicio.';
  end if;

  if to_regclass('public.orders') is not null
     and exists(select 1 from public.orders) then
    raise exception 'HTPWEB Código 103: quedaron pedidos después del reinicio.';
  end if;

  raise notice
    'HTPWEB Código 103 completado: % pedidos de prueba y % LOCAL eliminados.',
    v_deleted_orders,
    v_deleted_locals;
end;
$reset$;
