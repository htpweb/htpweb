-- HTPWEB Código #83 — carga masiva transaccional CSV/XLSX
create or replace function public.raise_exception_bool(p_message text)
returns boolean language plpgsql immutable as $
begin raise exception '%', p_message; end;
$;

create or replace function public.bulk_import_local_catalog(
  p_local_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row jsonb;
  v_category_name text;
  v_category_id uuid;
  v_product_name text;
  v_price numeric;
  v_order integer;
  v_active boolean;
  v_categories integer := 0;
  v_products integer := 0;
begin
  if p_local_id is null then raise exception 'LOCAL requerido'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Filas inválidas'; end if;
  if jsonb_array_length(p_rows) = 0 then raise exception 'No hay filas para importar'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'Máximo 1000 filas por importación'; end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_product_name := trim(coalesce(v_row->>'producto',''));
    v_category_name := trim(coalesce(v_row->>'categoria',''));
    if v_product_name = '' then raise exception 'Producto vacío en una fila'; end if;

    begin
      v_price := replace(trim(coalesce(v_row->>'precio','')), ',', '.')::numeric;
    exception when others then
      raise exception 'Precio inválido para producto %', v_product_name;
    end;
    if v_price < 0 then raise exception 'Precio negativo para producto %', v_product_name; end if;

    begin
      v_order := coalesce(nullif(trim(v_row->>'orden'), ''), '0')::integer;
    exception when others then
      raise exception 'Orden inválido para producto %', v_product_name;
    end;
    if v_order < 0 then raise exception 'Orden inválido para producto %', v_product_name; end if;

    v_active := case lower(trim(coalesce(v_row->>'activo','si')))
      when 'si' then true when 'sí' then true when 'true' then true when '1' then true
      when 'no' then false when 'false' then false when '0' then false
      else raise_exception_bool('Activo inválido')
    end;

    v_category_id := null;
    if v_category_name <> '' then
      select c.id into v_category_id
      from public.categories c
      where c.local_id = p_local_id and lower(trim(c.name)) = lower(v_category_name)
      order by c.active desc, c.display_order, c.id
      limit 1;

      if v_category_id is null then
        perform public.save_local_category(
          p_local_id := p_local_id,
          p_category_id := null,
          p_name := v_category_name,
          p_description := null,
          p_image_url := null,
          p_display_order := 0,
          p_active := true
        );
        select c.id into v_category_id
        from public.categories c
        where c.local_id = p_local_id and lower(trim(c.name)) = lower(v_category_name)
        order by c.id desc limit 1;
        v_categories := v_categories + 1;
      end if;
    end if;

    perform public.save_local_product(
      p_local_id := p_local_id,
      p_product_id := null,
      p_category_id := v_category_id,
      p_name := v_product_name,
      p_description := nullif(trim(coalesce(v_row->>'descripcion','')), ''),
      p_price := v_price,
      p_image_url := null,
      p_display_order := v_order,
      p_active := v_active
    );
    v_products := v_products + 1;
  end loop;

  return jsonb_build_object('categories_created',v_categories,'products_created',v_products,'rows',jsonb_array_length(p_rows));
end;
$$;

revoke all on function public.bulk_import_local_catalog(uuid,jsonb) from public;
grant execute on function public.bulk_import_local_catalog(uuid,jsonb) to authenticated;
