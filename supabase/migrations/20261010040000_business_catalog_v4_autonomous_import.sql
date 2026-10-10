-- HTPWEB V4: upsert por negocio + SKU, disponible para MASTER y administradores autorizados.
-- Conserva la tabla public.products como fuente única. Ningún borrado masivo.
create or replace function public.import_business_catalog_v4_rows(
  p_business_id uuid,
  p_rows jsonb,
  p_publish boolean default false
) returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  row_item jsonb;
  v_name text;
  v_sku text;
  v_category text;
  v_variant text;
  v_description text;
  v_image text;
  v_price numeric;
  v_product_id uuid;
  v_category_id uuid;
  v_variant_id uuid;
  v_matches integer;
  v_created integer := 0;
  v_updated integer := 0;
  v_variants integer := 0;
  v_seen text[] := '{}';
  v_active boolean;
begin
  if p_business_id is null or not exists (select 1 from public.businesses where id=p_business_id) then
    raise exception 'Negocio no encontrado';
  end if;
  if not (public.is_master() or public.user_can_manage_business_resource(p_business_id,'products.manage','products.manage')) then
    raise exception 'Sin autorización para este negocio';
  end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 3000 then
    raise exception 'La importación debe contener entre 1 y 3000 filas';
  end if;
  for row_item in select value from jsonb_array_elements(p_rows) loop
    v_sku:=nullif(btrim(row_item->>'sku'),'');
    v_name:=nullif(btrim(row_item->>'name'),'');
    v_category:=nullif(btrim(row_item->>'category'),'');
    v_variant:=nullif(btrim(row_item->>'variant'),'');
    v_description:=nullif(btrim(row_item->>'description'),'');
    v_image:=nullif(btrim(row_item->>'image_url'),'');
    if v_sku is null or length(v_sku)>80 or v_name is null or length(v_name)>180 then
      raise exception 'SKU o nombre inválido';
    end if;
    if v_sku=any(v_seen) and v_variant is null then
      raise exception 'SKU duplicado sin variante: %',v_sku;
    end if;
    begin
      v_price:=(row_item->>'price')::numeric;
    exception when others then
      raise exception 'Precio inválido para SKU %',v_sku;
    end;
    if v_price is null or v_price<0 or v_price>1000000 then
      raise exception 'Precio ausente o fuera de rango: %',v_sku;
    end if;
    if v_image is not null and v_image !~* '^https://[^[:space:]]+$' then
      raise exception 'La imagen de % debe ser una URL HTTPS cargada en Storage',v_sku;
    end if;
    v_active:=coalesce(p_publish,false) and v_image is not null;
    select count(*) into v_matches
      from public.products where business_id=p_business_id and lower(btrim(sku))=lower(v_sku);
    select id into v_product_id from public.products
      where business_id=p_business_id and lower(btrim(sku))=lower(v_sku)
      order by created_at,id limit 1;
    if v_matches>1 then
      raise exception 'SKU existente duplicado en negocio: %',v_sku;
    end if;
    v_category_id:=null;
    if v_category is not null then
      select id into v_category_id from public.categories
        where local_id=p_business_id and lower(btrim(name))=lower(v_category)
        order by id limit 1;
      if v_category_id is null then
        v_category_id:=public.save_local_category(p_business_id,null,v_category,null,null,0,false);
      end if;
    end if;
    if v_product_id is null then
      v_product_id:=public.save_business_product(p_business_id,null,v_category_id,v_name,v_description,v_price,v_image,0,v_active);
      update public.products set sku=v_sku where id=v_product_id and business_id=p_business_id;
      v_created:=v_created+1;
    elsif not (v_sku=any(v_seen)) then
      perform public.save_business_product(p_business_id,v_product_id,v_category_id,v_name,v_description,v_price,
        coalesce(v_image,(select image_url from public.products where id=v_product_id)),0,
        v_active and coalesce(v_image,(select image_url from public.products where id=v_product_id)) is not null);
      v_updated:=v_updated+1;
    end if;
    if v_variant is not null then
      select id into v_variant_id from public.product_variants
       where product_id=v_product_id and lower(btrim(name))=lower(v_variant)
       order by id limit 1;
      perform public.save_product_variant(v_product_id,v_variant_id,v_variant,v_price,0,v_active);
      v_variants:=v_variants+1;
    end if;
    v_seen:=array_append(v_seen,v_sku);
  end loop;
  return jsonb_build_object('business_id',p_business_id,'created',v_created,'updated',v_updated,'variants_touched',v_variants,'rows',jsonb_array_length(p_rows),'requested_publish',p_publish);
end
$fn$;
revoke all on function public.import_business_catalog_v4_rows(uuid,jsonb,boolean) from public;
grant execute on function public.import_business_catalog_v4_rows(uuid,jsonb,boolean) to authenticated;
