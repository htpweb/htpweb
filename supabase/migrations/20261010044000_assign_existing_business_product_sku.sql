-- HTPWEB: reconciliacion manual, nunca asociar SKUs por similitud automatica.
create or replace function public.assign_existing_business_product_sku(
  p_business_id uuid,
  p_product_id uuid,
  p_sku text
) returns jsonb
language plpgsql security definer set search_path=''
as $sql$
declare old_record public.products%rowtype;
begin
  if not (
    public.is_master() or
    public.user_can_manage_business_resource(p_business_id,'products.manage','products.manage')
  ) then raise exception 'Sin autorizacion para administrar productos de este negocio'; end if;
  if nullif(btrim(p_sku),'') is null or length(btrim(p_sku))>80 then
    raise exception 'SKU invalido';
  end if;
  perform pg_advisory_xact_lock(hashtext('htpweb-product-sku'),hashtext(p_business_id::text));
  select * into old_record from public.products
    where id=p_product_id and business_id=p_business_id for update;
  if not found then raise exception 'Producto no pertenece al negocio'; end if;
  if nullif(btrim(old_record.sku),'') is not null and lower(btrim(old_record.sku))<>lower(btrim(p_sku)) then
    raise exception 'Este producto ya tiene otro SKU, no se reasigna';
  end if;
  if exists(select 1 from public.products
    where business_id=p_business_id and id<>p_product_id
    and lower(btrim(sku))=lower(btrim(p_sku))) then
    raise exception 'SKU ya pertenece a otro producto del negocio';
  end if;
  update public.products set sku=btrim(p_sku),updated_at=now() where id=p_product_id;
  return jsonb_build_object('business_id',p_business_id,'product_id',p_product_id,'sku',btrim(p_sku),'name',old_record.name);
end
$sql$;
revoke all on function public.assign_existing_business_product_sku(uuid,uuid,text) from public;
grant execute on function public.assign_existing_business_product_sku(uuid,uuid,text) to authenticated;