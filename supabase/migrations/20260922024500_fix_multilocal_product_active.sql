-- HTPWEB Código 107 — corrección de ACTIVO en importación multilocal.
-- Evita evaluar una función de excepción dentro de CASE y valida de forma explícita.
create or replace function public.bulk_import_catalog_multilocal_v3(
  p_rows jsonb,
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row jsonb;
  v_local_id uuid;
  v_local_name text;
  v_local_matches integer;
  v_category_name text;
  v_category_id uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_product_name text;
  v_sku text;
  v_variant_name text;
  v_description text;
  v_image_url text;
  v_price numeric;
  v_variant_price numeric;
  v_product_order integer;
  v_variant_order integer;
  v_active boolean;
  v_product_key text;
  v_seen_products text[]:='{}';
  v_seen_locals uuid[]:='{}';
  v_categories_created integer:=0;
  v_products_created integer:=0;
  v_products_updated integer:=0;
  v_variants_created integer:=0;
  v_variants_updated integer:=0;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  if p_rows is null or jsonb_typeof(p_rows)<>'array' then
    raise exception 'HTPWEB: filas de productos inválidas';
  end if;
  if jsonb_array_length(p_rows)=0 then
    raise exception 'HTPWEB: no hay filas para importar';
  end if;
  if jsonb_array_length(p_rows)>3000 then
    raise exception 'HTPWEB: máximo 3000 filas por importación';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_local_id:=null;
    v_local_name:=nullif(trim(coalesce(v_row->>'local','')),'');
    v_category_name:=nullif(trim(coalesce(v_row->>'categoria','')),'');
    v_product_name:=nullif(trim(coalesce(v_row->>'producto','')),'');
    v_sku:=nullif(trim(coalesce(v_row->>'sku','')),'');
    v_variant_name:=nullif(trim(coalesce(v_row->>'variante','')),'');
    v_description:=nullif(trim(coalesce(v_row->>'descripcion','')),'');
    v_image_url:=nullif(trim(coalesce(v_row->>'imagen_url','')),'');

    if nullif(trim(coalesce(v_row->>'local_id','')),'') is not null then
      begin
        v_local_id:=(trim(v_row->>'local_id'))::uuid;
      exception when others then
        raise exception 'HTPWEB: LOCAL_ID inválido para producto %',coalesce(v_product_name,'(sin nombre)');
      end;

      if not exists(select 1 from public.locals l where l.id=v_local_id) then
        raise exception 'HTPWEB: LOCAL_ID no existe para producto %',coalesce(v_product_name,'(sin nombre)');
      end if;

      if v_local_name is not null and not exists(
        select 1 from public.locals l
        where l.id=v_local_id and lower(trim(l.name))=lower(v_local_name)
      ) then
        raise exception 'HTPWEB: LOCAL y LOCAL_ID no corresponden para producto %',coalesce(v_product_name,'(sin nombre)');
      end if;
    else
      if v_local_name is null then
        raise exception 'HTPWEB: cada fila requiere LOCAL o LOCAL_ID';
      end if;

      select count(*)
      into v_local_matches
      from public.locals l
      where lower(trim(l.name))=lower(v_local_name);

      if v_local_matches=0 then
        raise exception 'HTPWEB: LOCAL no encontrado: %',v_local_name;
      end if;
      if v_local_matches>1 then
        raise exception 'HTPWEB: LOCAL ambiguo: %. Use LOCAL_ID',v_local_name;
      end if;

      select l.id into v_local_id
      from public.locals l
      where lower(trim(l.name))=lower(v_local_name)
      limit 1;
    end if;

    if not (v_local_id=any(v_seen_locals)) then
      v_seen_locals:=array_append(v_seen_locals,v_local_id);
    end if;

    if v_product_name is null then
      raise exception 'HTPWEB: PRODUCTO vacío en una fila';
    end if;

    if v_sku is not null and length(v_sku)>80 then
      raise exception 'HTPWEB: SKU demasiado largo para %',v_product_name;
    end if;

    begin
      v_price:=replace(trim(coalesce(v_row->>'precio','')),',','.')::numeric;
    exception when others then
      raise exception 'HTPWEB: precio inválido para %',v_product_name;
    end;
    if v_price<0 then
      raise exception 'HTPWEB: precio negativo para %',v_product_name;
    end if;

    begin
      v_product_order:=coalesce(
        nullif(trim(v_row->>'orden_producto'),''),
        nullif(trim(v_row->>'orden'),''),
        '0'
      )::integer;
    exception when others then
      raise exception 'HTPWEB: ORDEN_PRODUCTO inválido para %',v_product_name;
    end;
    if v_product_order<0 then
      raise exception 'HTPWEB: ORDEN_PRODUCTO inválido para %',v_product_name;
    end if;

    begin
      v_variant_order:=coalesce(
        nullif(trim(v_row->>'orden_variante'),''),
        nullif(trim(v_row->>'orden'),''),
        '0'
      )::integer;
    exception when others then
      raise exception 'HTPWEB: ORDEN_VARIANTE inválido para %',v_product_name;
    end;
    if v_variant_order<0 then
      raise exception 'HTPWEB: ORDEN_VARIANTE inválido para %',v_product_name;
    end if;

    if lower(trim(coalesce(v_row->>'activo','si'))) in ('si','sí','true','1') then
      v_active:=true;
    elsif lower(trim(coalesce(v_row->>'activo','si'))) in ('no','false','0') then
      v_active:=false;
    else
      raise exception 'HTPWEB: ACTIVO inválido para %: %',
        v_product_name,
        coalesce(v_row->>'activo','NULL');
    end if;

    if not coalesce(p_publish,false) then
      v_active:=false;
    end if;

    v_category_id:=null;
    if v_category_name is not null then
      select c.id into v_category_id
      from public.categories c
      where c.local_id=v_local_id
        and lower(trim(c.name))=lower(v_category_name)
      order by c.active desc,c.display_order,c.id
      limit 1;

      if v_category_id is null then
        v_category_id:=public.save_local_category(
          v_local_id,null,v_category_name,null,null,0,coalesce(p_publish,false)
        );
        v_categories_created:=v_categories_created+1;
      end if;
    end if;

    v_product_key:=v_local_id::text||'|'||
      case when v_sku is not null then 'SKU:'||lower(v_sku)
           else 'NAME:'||lower(v_product_name) end;

    v_product_id:=null;
    if v_sku is not null then
      select p.id into v_product_id
      from public.products p
      where p.local_id=v_local_id
        and p.sku is not null
        and lower(trim(p.sku))=lower(v_sku)
      order by p.created_at,p.id
      limit 1;
    end if;

    if v_product_id is null then
      select p.id into v_product_id
      from public.products p
      where p.local_id=v_local_id
        and lower(trim(p.name))=lower(v_product_name)
      order by p.created_at,p.id
      limit 1;
    end if;

    if not (v_product_key=any(v_seen_products)) then
      if v_product_id is null then
        v_product_id:=public.save_local_product(
          v_local_id,null,v_category_id,v_product_name,v_description,v_price,v_image_url,
          v_product_order,v_active
        );
        v_products_created:=v_products_created+1;
      else
        perform public.save_local_product(
          v_local_id,v_product_id,v_category_id,v_product_name,v_description,v_price,
          coalesce(v_image_url,(select p.image_url from public.products p where p.id=v_product_id)),
          v_product_order,v_active
        );
        v_products_updated:=v_products_updated+1;
      end if;

      if v_sku is not null then
        update public.products
        set sku=v_sku
        where id=v_product_id;
      end if;

      v_seen_products:=array_append(v_seen_products,v_product_key);
    elsif v_product_id is null then
      raise exception 'HTPWEB: no se pudo resolver el producto repetido %',v_product_name;
    end if;

    if v_variant_name is not null then
      begin
        v_variant_price:=replace(trim(coalesce(v_row->>'precio_variante','')),',','.')::numeric;
      exception when others then
        raise exception 'HTPWEB: PRECIO_VARIANTE inválido para % / %',v_product_name,v_variant_name;
      end;
      if v_variant_price<0 then
        raise exception 'HTPWEB: PRECIO_VARIANTE negativo para % / %',v_product_name,v_variant_name;
      end if;

      v_variant_id:=null;
      select pv.id into v_variant_id
      from public.product_variants pv
      where pv.product_id=v_product_id
        and lower(trim(pv.name))=lower(v_variant_name)
      order by pv.created_at,pv.id
      limit 1;

      if v_variant_id is null then
        perform public.save_product_variant(
          v_product_id,null,v_variant_name,v_variant_price,v_variant_order,v_active
        );
        v_variants_created:=v_variants_created+1;
      else
        perform public.save_product_variant(
          v_product_id,v_variant_id,v_variant_name,v_variant_price,v_variant_order,v_active
        );
        v_variants_updated:=v_variants_updated+1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'rows',jsonb_array_length(p_rows),
    'locals',cardinality(v_seen_locals),
    'categories_created',v_categories_created,
    'products_created',v_products_created,
    'products_updated',v_products_updated,
    'variants_created',v_variants_created,
    'variants_updated',v_variants_updated,
    'published',coalesce(p_publish,false)
  );
end;
$$;

revoke all on function public.bulk_import_catalog_multilocal_v3(jsonb,boolean)
from public,anon;

grant execute on function public.bulk_import_catalog_multilocal_v3(jsonb,boolean)
to authenticated;


