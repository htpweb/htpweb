-- HTPWEB Código 99 — carga masiva avanzada de productos y variantes.

create or replace function public.bulk_import_local_catalog_v2(
  p_local_id uuid,
  p_rows jsonb,
  p_publish boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_row jsonb;
  v_category_name text;
  v_category_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_product_name text;
  v_variant_name text;
  v_description text;
  v_image_url text;
  v_price numeric;
  v_variant_price numeric;
  v_order integer;
  v_active boolean;
  v_categories_created integer:=0;
  v_products_created integer:=0;
  v_products_updated integer:=0;
  v_variants_created integer:=0;
  v_variants_updated integer:=0;
begin
  if p_local_id is null then raise exception 'LOCAL requerido'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'Filas inválidas'; end if;
  if jsonb_array_length(p_rows)=0 then raise exception 'No hay filas para importar'; end if;
  if jsonb_array_length(p_rows)>1000 then raise exception 'Máximo 1000 filas por importación'; end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_product_name:=nullif(trim(coalesce(v_row->>'producto','')),'');
    v_category_name:=nullif(trim(coalesce(v_row->>'categoria','')),'');
    v_variant_name:=nullif(trim(coalesce(v_row->>'variante','')),'');
    v_description:=nullif(trim(coalesce(v_row->>'descripcion','')),'');
    v_image_url:=nullif(trim(coalesce(v_row->>'imagen_url','')),'');

    if v_product_name is null then raise exception 'Producto vacío en una fila'; end if;

    begin
      v_price:=replace(trim(coalesce(v_row->>'precio','')),',','.')::numeric;
    exception when others then
      raise exception 'Precio inválido para producto %',v_product_name;
    end;
    if v_price<0 then raise exception 'Precio negativo para producto %',v_product_name; end if;

    begin
      v_order:=coalesce(nullif(trim(v_row->>'orden'),''),'0')::integer;
    exception when others then
      raise exception 'Orden inválido para producto %',v_product_name;
    end;
    if v_order<0 then raise exception 'Orden inválido para producto %',v_product_name; end if;

    v_active:=case lower(trim(coalesce(v_row->>'activo','si')))
      when 'si' then true when 'sí' then true when 'true' then true when '1' then true
      when 'no' then false when 'false' then false when '0' then false
      else public.raise_exception_bool('Activo inválido')
    end;
    if not coalesce(p_publish,false) then v_active:=false; end if;

    v_category_id:=null;
    if v_category_name is not null then
      select c.id into v_category_id
      from public.categories c
      where c.local_id=p_local_id and lower(trim(c.name))=lower(v_category_name)
      order by c.active desc,c.display_order,c.id
      limit 1;

      if v_category_id is null then
        v_category_id:=public.save_local_category(
          p_local_id,null,v_category_name,null,null,0,coalesce(p_publish,false)
        );
        v_categories_created:=v_categories_created+1;
      end if;
    end if;

    v_product_id:=null;
    select p.id into v_product_id
    from public.products p
    where p.local_id=p_local_id and lower(trim(p.name))=lower(v_product_name)
    order by p.created_at,p.id
    limit 1;

    if v_product_id is null then
      v_product_id:=public.save_local_product(
        p_local_id,null,v_category_id,v_product_name,v_description,v_price,v_image_url,v_order,v_active
      );
      v_products_created:=v_products_created+1;
    else
      perform public.save_local_product(
        p_local_id,v_product_id,v_category_id,v_product_name,v_description,v_price,
        coalesce(v_image_url,(select p.image_url from public.products p where p.id=v_product_id)),
        v_order,v_active
      );
      v_products_updated:=v_products_updated+1;
    end if;

    if v_variant_name is not null then
      begin
        v_variant_price:=replace(trim(coalesce(v_row->>'precio_variante','')),',','.')::numeric;
      exception when others then
        raise exception 'Precio de variante inválido para % / %',v_product_name,v_variant_name;
      end;
      if v_variant_price<0 then
        raise exception 'Precio de variante negativo para % / %',v_product_name,v_variant_name;
      end if;

      v_variant_id:=null;
      select pv.id into v_variant_id
      from public.product_variants pv
      where pv.product_id=v_product_id and lower(trim(pv.name))=lower(v_variant_name)
      order by pv.created_at,pv.id
      limit 1;

      if v_variant_id is null then
        perform public.save_product_variant(
          v_product_id,null,v_variant_name,v_variant_price,v_order,v_active
        );
        v_variants_created:=v_variants_created+1;
      else
        perform public.save_product_variant(
          v_product_id,v_variant_id,v_variant_name,v_variant_price,v_order,v_active
        );
        v_variants_updated:=v_variants_updated+1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'rows',jsonb_array_length(p_rows),
    'categories_created',v_categories_created,
    'products_created',v_products_created,
    'products_updated',v_products_updated,
    'variants_created',v_variants_created,
    'variants_updated',v_variants_updated,
    'published',coalesce(p_publish,false)
  );
end;
$$;

revoke all on function public.bulk_import_local_catalog_v2(uuid,jsonb,boolean) from public;
grant execute on function public.bulk_import_local_catalog_v2(uuid,jsonb,boolean) to authenticated;
