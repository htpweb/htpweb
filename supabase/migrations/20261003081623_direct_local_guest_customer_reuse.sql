create or replace function public.create_direct_local_order(
 p_local_id uuid,p_customer_name text,p_customer_phone text,p_address text,p_notes text,
 p_fulfillment text,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_customer uuid; v_order uuid:=gen_random_uuid(); v_subtotal numeric:=0; v_method text:=upper(trim(coalesce(p_fulfillment,'')));
 v_item jsonb; v_product uuid; v_variant uuid; v_promotion uuid; v_qty integer; v_price numeric; v_name text; v_variant_name text;
begin
 if p_local_id is null or not public.local_is_owner_managed(p_local_id) then raise exception 'HTPWEB: LOCAL no habilitado para pedidos directos'; end if;
 if not exists(select 1 from public.local_commerce_settings s where s.local_id=p_local_id and s.storefront_enabled)
   then raise exception 'HTPWEB: tienda directa no habilitada'; end if;
 if v_method not in ('PICKUP','OWN_DELIVERY') then raise exception 'HTPWEB: forma directa inválida'; end if;
 if nullif(trim(coalesce(p_customer_name,'')),'') is null then raise exception 'HTPWEB: nombre del cliente requerido'; end if;
 if nullif(regexp_replace(coalesce(p_customer_phone,''),'\D','','g'),'') is null then raise exception 'HTPWEB: teléfono requerido'; end if;
 if v_method<>'PICKUP' and nullif(trim(coalesce(p_address,'')),'') is null then raise exception 'HTPWEB: dirección requerida'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'HTPWEB: carrito vacío'; end if;

 for v_item in select value from jsonb_array_elements(p_items) loop
   v_qty:=greatest(coalesce((v_item->>'quantity')::integer,0),0);
   if v_qty<1 then raise exception 'HTPWEB: cantidad inválida'; end if;
   begin v_promotion:=(v_item->>'promotion_id')::uuid; exception when others then v_promotion:=null; end;
   if v_promotion is not null then
     select pr.promotion_price,pr.title into v_price,v_name from public.local_promotions pr
     where pr.id=v_promotion and pr.local_id=p_local_id and pr.active
       and (pr.starts_at is null or pr.starts_at<=now()) and (pr.ends_at is null or pr.ends_at>=now());
     if v_price is null then raise exception 'HTPWEB: promoción no disponible'; end if;
   else
     begin v_product:=(v_item->>'product_id')::uuid; exception when others then v_product:=null; end;
     begin v_variant:=(v_item->>'variant_id')::uuid; exception when others then v_variant:=null; end;
     select p.price,p.name into v_price,v_name from public.products p
     where p.id=v_product and p.local_id=p_local_id and p.active and p.catalog_visible;
     if v_price is null then raise exception 'HTPWEB: producto no disponible'; end if;
     if v_variant is not null then
       select pv.price,pv.name into v_price,v_variant_name from public.product_variants pv
       where pv.id=v_variant and pv.product_id=v_product and pv.active;
       if v_price is null then raise exception 'HTPWEB: variante no disponible'; end if;
     end if;
   end if;
   v_subtotal:=v_subtotal+(v_price*v_qty);
 end loop;

 if auth.uid() is not null then
   v_customer:=public.current_customer_id();
   if v_customer is null then
     insert into public.customers(name,phone,email,active,marketing_consent,profile_id,created_at,updated_at)
     select trim(p_customer_name),trim(p_customer_phone),u.email,true,false,auth.uid(),now(),now()
     from auth.users u where u.id=auth.uid()
     returning id into v_customer;
   else
     update public.customers set name=trim(p_customer_name),phone=trim(p_customer_phone),updated_at=now() where id=v_customer;
   end if;
 else
   select c.id into v_customer
   from public.customers c
   where c.profile_id is null and c.active=true
     and regexp_replace(coalesce(c.phone,''),'\D','','g')=regexp_replace(coalesce(p_customer_phone,''),'\D','','g')
   order by c.updated_at desc limit 1;
   if v_customer is null then
     insert into public.customers(name,phone,active,marketing_consent,created_at,updated_at)
     values(trim(p_customer_name),trim(p_customer_phone),true,false,now(),now()) returning id into v_customer;
   else
     update public.customers set name=trim(p_customer_name),phone=trim(p_customer_phone),updated_at=now()
     where id=v_customer and profile_id is null;
   end if;
 end if;

 insert into public.orders(id,delivery_id,customer_id,status,subtotal,delivery_fee,total,customer_name,customer_phone,
   delivery_address,notes,order_channel,origin_local_id,fulfillment_method,created_at,updated_at)
 values(v_order,null,v_customer,'PENDING',v_subtotal,0,v_subtotal,trim(p_customer_name),trim(p_customer_phone),
   case when v_method='PICKUP' then 'RETIRO EN LOCAL' else trim(p_address) end,
   nullif(trim(coalesce(p_notes,'')),''),'DIRECT_LOCAL',p_local_id,v_method,now(),now());
 insert into public.order_locals(order_id,local_id,subtotal,delivery_fee,status,created_at,updated_at)
 values(v_order,p_local_id,v_subtotal,0,'PENDING',now(),now());

 for v_item in select value from jsonb_array_elements(p_items) loop
   v_qty:=greatest(coalesce((v_item->>'quantity')::integer,0),0);
   v_price:=null;v_name:=null;v_variant_name:=null;v_product:=null;v_variant:=null;v_promotion:=null;
   begin v_promotion:=(v_item->>'promotion_id')::uuid; exception when others then v_promotion:=null; end;
   if v_promotion is not null then
     select pr.promotion_price,pr.title into v_price,v_name from public.local_promotions pr
     where pr.id=v_promotion and pr.local_id=p_local_id and pr.active
       and (pr.starts_at is null or pr.starts_at<=now()) and (pr.ends_at is null or pr.ends_at>=now());
     insert into public.order_items(order_id,local_id,product_name,unit_price,quantity,subtotal,promotion_id,promotion_title,created_at)
     values(v_order,p_local_id,v_name,v_price,v_qty,v_price*v_qty,v_promotion,v_name,now());
   else
     v_product:=(v_item->>'product_id')::uuid;
     select p.price,p.name into v_price,v_name from public.products p where p.id=v_product and p.local_id=p_local_id and p.active and p.catalog_visible;
     begin v_variant:=(v_item->>'variant_id')::uuid; exception when others then v_variant:=null; end;
     if v_variant is not null then select pv.price,pv.name into v_price,v_variant_name from public.product_variants pv where pv.id=v_variant and pv.product_id=v_product and pv.active; end if;
     insert into public.order_items(order_id,local_id,product_id,variant_id,product_name,variant_name,unit_price,quantity,subtotal,created_at)
     values(v_order,p_local_id,v_product,v_variant,v_name,v_variant_name,v_price,v_qty,v_price*v_qty,now());
   end if;
 end loop;
 return jsonb_build_object('order_id',v_order,'subtotal',v_subtotal,'total',v_subtotal,'channel','DIRECT_LOCAL');
end $$;
revoke all on function public.create_direct_local_order(uuid,text,text,text,text,text,jsonb) from public;
grant execute on function public.create_direct_local_order(uuid,text,text,text,text,text,jsonb) to anon,authenticated;

