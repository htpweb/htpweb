create or replace function public.create_direct_local_order(
  p_local_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_address text,
  p_reference text,
  p_latitude numeric,
  p_longitude numeric,
  p_requires_invoice boolean,
  p_document_type text,
  p_document_number text,
  p_invoice_email text,
  p_notes text,
  p_fulfillment text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_order uuid;
  v_method text := upper(trim(coalesce(p_fulfillment,'')));
begin
  if v_method='OWN_DELIVERY' then
    if nullif(trim(coalesce(p_address,'')),'') is null then
      raise exception 'HTPWEB: dirección requerida';
    end if;
    if p_latitude is null or p_longitude is null then
      raise exception 'HTPWEB: ubicación requerida';
    end if;
    if p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
      raise exception 'HTPWEB: ubicación inválida';
    end if;
  end if;

  if coalesce(p_requires_invoice,false) and (
    nullif(trim(coalesce(p_document_type,'')),'') is null or
    nullif(trim(coalesce(p_document_number,'')),'') is null or
    nullif(trim(coalesce(p_invoice_email,'')),'') is null
  ) then
    raise exception 'HTPWEB: datos de facturación incompletos';
  end if;

  v_result := public.create_direct_local_order(
    p_local_id,p_customer_name,p_customer_phone,p_address,p_notes,p_fulfillment,p_items
  );
  v_order := (v_result->>'order_id')::uuid;

  update public.orders
  set latitude = case when v_method='OWN_DELIVERY' then p_latitude else null end,
      longitude = case when v_method='OWN_DELIVERY' then p_longitude else null end,
      address_reference = nullif(trim(coalesce(p_reference,'')),''),
      requires_invoice = coalesce(p_requires_invoice,false),
      document_type = case when coalesce(p_requires_invoice,false) then nullif(trim(p_document_type),'') else null end,
      document_number = case when coalesce(p_requires_invoice,false) then nullif(trim(p_document_number),'') else null end,
      invoice_email = case when coalesce(p_requires_invoice,false) then nullif(trim(p_invoice_email),'') else null end,
      updated_at = now()
  where id=v_order and order_channel='DIRECT_LOCAL';

  return v_result;
end $$;

revoke all on function public.create_direct_local_order(uuid,text,text,text,text,numeric,numeric,boolean,text,text,text,text,text,jsonb) from public;
grant execute on function public.create_direct_local_order(uuid,text,text,text,text,numeric,numeric,boolean,text,text,text,text,text,jsonb) to anon,authenticated;
