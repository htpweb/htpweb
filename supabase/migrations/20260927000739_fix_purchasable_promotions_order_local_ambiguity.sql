CREATE OR REPLACE FUNCTION public.create_order_transaction(p_delivery_id uuid, p_customer_id uuid, p_customer_name text, p_customer_phone text, p_delivery_address text, p_latitude numeric, p_longitude numeric, p_address_reference text, p_requires_invoice boolean, p_document_type text, p_document_number text, p_invoice_email text, p_notes text, p_locals jsonb, p_items jsonb)
 RETURNS TABLE(order_id uuid, subtotal numeric, delivery_fee numeric, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_order_id uuid;
    v_delivery_active boolean;

    v_subtotal numeric(12,2) := 0;
    v_delivery_fee numeric(12,2) := 0;
    v_total numeric(12,2) := 0;

    v_local jsonb;
    v_item jsonb;

    v_local_id uuid;
    v_distance_km numeric(10,2);
    v_local_delivery_fee numeric(12,2);

    v_product_id uuid;
    v_variant_id uuid;
    v_quantity integer;

    v_product_name text;
    v_variant_name text;

    v_product_price numeric;
    v_variant_price numeric;
    v_unit_price numeric;
    v_item_subtotal numeric(12,2);

    v_product_local_id uuid;
    v_product_active boolean;

    v_variant_active boolean;
    v_variant_product_id uuid;

    v_config_mode text;
    v_item_local_exists boolean;

    v_promotion_id uuid;
    v_promotion_item_id uuid;
    v_promotion_local_id uuid;
    v_promotion_title text;
    v_promotion_type text;
    v_promotion_price numeric;
    v_promotion_starts_at timestamptz;
    v_promotion_ends_at timestamptz;
    v_promotion_days smallint[];
    v_promotion_active boolean;

    v_component record;
    v_component_count integer;
    v_component_index integer;
    v_component_quantity integer;
    v_component_regular_unit numeric;
    v_component_regular_line numeric;
    v_combo_regular_total numeric;
    v_combo_allocated numeric(12,2);
    v_line_promo_per_bundle numeric(12,2);
    v_effective_quantity integer;
begin
    if p_delivery_id is null then
        raise exception 'delivery_id es obligatorio';
    end if;

    if p_customer_id is null then
        raise exception 'customer_id es obligatorio';
    end if;

    if nullif(trim(p_customer_phone), '') is null then
        raise exception 'El teléfono del cliente es obligatorio';
    end if;

    if nullif(trim(p_delivery_address), '') is null then
        raise exception 'La dirección de entrega es obligatoria';
    end if;

    if p_latitude is null or p_longitude is null then
        raise exception 'La ubicación del cliente es obligatoria';
    end if;

    if p_latitude < -90 or p_latitude > 90 then
        raise exception 'Latitud inválida';
    end if;

    if p_longitude < -180 or p_longitude > 180 then
        raise exception 'Longitud inválida';
    end if;

    if p_locals is null
       or jsonb_typeof(p_locals) <> 'array'
       or jsonb_array_length(p_locals) = 0
    then
        raise exception 'El pedido debe contener al menos un local';
    end if;

    if p_items is null
       or jsonb_typeof(p_items) <> 'array'
       or jsonb_array_length(p_items) = 0
    then
        raise exception 'El pedido debe contener al menos un producto o promoción';
    end if;

    select d.active
    into v_delivery_active
    from public.deliveries as d
    where d.id = p_delivery_id;

    if not found then
        raise exception 'El delivery no existe';
    end if;

    if v_delivery_active is not true then
        raise exception 'El delivery no está activo';
    end if;

    if not exists (
        select 1
        from public.customers as c
        where c.id = p_customer_id
          and c.active = true
    ) then
        raise exception 'El cliente no existe o está inactivo';
    end if;

    insert into public.orders (
        delivery_id,
        customer_id,
        status,
        subtotal,
        delivery_fee,
        total,
        customer_name,
        customer_phone,
        delivery_address,
        latitude,
        longitude,
        address_reference,
        requires_invoice,
        document_type,
        document_number,
        invoice_email,
        notes
    )
    values (
        p_delivery_id,
        p_customer_id,
        'PENDING',
        0,
        0,
        0,
        nullif(trim(p_customer_name), ''),
        trim(p_customer_phone),
        trim(p_delivery_address),
        p_latitude,
        p_longitude,
        nullif(trim(p_address_reference), ''),
        coalesce(p_requires_invoice, false),
        case when coalesce(p_requires_invoice, false)
             then nullif(trim(p_document_type), '') else null end,
        case when coalesce(p_requires_invoice, false)
             then nullif(trim(p_document_number), '') else null end,
        case when coalesce(p_requires_invoice, false)
             then nullif(trim(p_invoice_email), '') else null end,
        nullif(trim(p_notes), '')
    )
    returning public.orders.id into v_order_id;

    for v_local in
        select value from jsonb_array_elements(p_locals)
    loop
        v_local_id := (v_local->>'local_id')::uuid;
        v_distance_km := round((v_local->>'distance_km')::numeric, 2);

        if v_local_id is null then
            raise exception 'Existe un local sin local_id';
        end if;

        if v_distance_km is null or v_distance_km < 0 then
            raise exception 'Distancia inválida para el local %', v_local_id;
        end if;

        if not exists (
            select 1
            from public.locals as l
            join public.local_deliveries as ld
              on ld.local_id = l.id
             and ld.delivery_id = p_delivery_id
             and ld.active = true
            where l.id = v_local_id
              and l.active = true
        ) then
            raise exception 'El local % no está activo o no tiene una relación activa con el delivery', v_local_id;
        end if;

        select dfc.mode
        into v_config_mode
        from public.delivery_fee_configs as dfc
        where dfc.delivery_id = p_delivery_id
          and dfc.active = true
        limit 1;

        if v_config_mode is null then
            raise exception 'El delivery no tiene una configuración de tarifa activa';
        end if;

        v_local_delivery_fee :=
            public.calculate_delivery_fee_for_order(
                p_delivery_id,
                v_local_id,
                v_distance_km,
                p_latitude,
                p_longitude,
                now()
            );

        insert into public.order_locals (
            order_id,
            local_id,
            subtotal,
            delivery_distance_km,
            delivery_fee,
            delivery_fee_mode
        )
        values (
            v_order_id,
            v_local_id,
            0,
            v_distance_km,
            v_local_delivery_fee,
            v_config_mode
        );

        v_delivery_fee := v_delivery_fee + v_local_delivery_fee;
    end loop;

    for v_item in
        select value from jsonb_array_elements(p_items)
    loop
        v_promotion_id := nullif(v_item->>'promotion_id', '')::uuid;

        if v_promotion_id is not null then
            v_local_id := nullif(v_item->>'local_id', '')::uuid;
            v_promotion_item_id := nullif(v_item->>'promotion_item_id', '')::uuid;
            v_quantity := (v_item->>'quantity')::integer;

            if v_local_id is null then
                raise exception 'La promoción no tiene LOCAL válido';
            end if;

            if v_quantity is null or v_quantity <= 0 or v_quantity > 999 then
                raise exception 'La cantidad de la promoción debe estar entre 1 y 999';
            end if;

            select
                lp.local_id,
                lp.title,
                lp.promotion_type,
                lp.promotion_price,
                lp.starts_at,
                lp.ends_at,
                lp.days_of_week,
                lp.active
            into
                v_promotion_local_id,
                v_promotion_title,
                v_promotion_type,
                v_promotion_price,
                v_promotion_starts_at,
                v_promotion_ends_at,
                v_promotion_days,
                v_promotion_active
            from public.local_promotions lp
            where lp.id = v_promotion_id;

            if not found then
                raise exception 'La promoción ya no existe';
            end if;

            if v_promotion_local_id <> v_local_id then
                raise exception 'La promoción no pertenece al LOCAL indicado';
            end if;

            select exists (
                select 1
                from public.order_locals ol
                where ol.order_id = v_order_id
                  and ol.local_id = v_promotion_local_id
            ) into v_item_local_exists;

            if not v_item_local_exists then
                raise exception 'La promoción pertenece a un LOCAL que no forma parte del pedido';
            end if;

            if v_promotion_active is not true
               or (v_promotion_starts_at is not null and v_promotion_starts_at > now())
               or (v_promotion_ends_at is not null and v_promotion_ends_at < now())
               or (
                    cardinality(coalesce(v_promotion_days, '{}'::smallint[])) > 0
                    and extract(dow from timezone('America/Guayaquil', now()))::smallint
                        <> all(v_promotion_days)
               )
            then
                raise exception 'La promoción "%" ya no está disponible', v_promotion_title;
            end if;

            if v_promotion_type = 'OPTIONS' then
                if v_promotion_item_id is null then
                    raise exception 'Selecciona una opción de la promoción "%" ', v_promotion_title;
                end if;

                select
                    i.id as promotion_item_id,
                    i.product_id,
                    i.variant_id,
                    i.quantity as component_quantity,
                    i.promo_price,
                    p.name as product_name,
                    p.price as product_price,
                    p.local_id as product_local_id,
                    p.active as product_active,
                    pv.name as variant_name,
                    pv.price as variant_price,
                    pv.active as variant_active,
                    pv.product_id as variant_product_id
                into v_component
                from public.local_promotion_items i
                join public.products p on p.id = i.product_id
                left join public.product_variants pv on pv.id = i.variant_id
                where i.id = v_promotion_item_id
                  and i.promotion_id = v_promotion_id;

                if not found then
                    raise exception 'La opción seleccionada ya no pertenece a la promoción';
                end if;

                if v_component.product_local_id <> v_promotion_local_id
                   or v_component.product_active is not true
                   or (
                        v_component.variant_id is not null
                        and (
                            v_component.variant_product_id is distinct from v_component.product_id
                            or v_component.variant_active is not true
                        )
                   )
                then
                    raise exception 'La opción promocional "%" ya no está disponible', v_promotion_title;
                end if;

                if v_component.promo_price is null then
                    raise exception 'La opción promocional "%" no tiene un precio válido', v_promotion_title;
                end if;

                v_component_quantity := v_component.component_quantity;
                v_effective_quantity := v_component_quantity * v_quantity;
                v_item_subtotal := round(v_component.promo_price * v_quantity, 2);
                v_unit_price := case
                    when v_effective_quantity > 0
                    then v_item_subtotal / v_effective_quantity
                    else 0
                end;

                insert into public.order_items (
                    order_id, local_id, product_id, variant_id,
                    product_name, variant_name, unit_price, quantity, subtotal,
                    promotion_id, promotion_item_id, promotion_title
                )
                values (
                    v_order_id, v_promotion_local_id, v_component.product_id, v_component.variant_id,
                    v_component.product_name, v_component.variant_name,
                    v_unit_price, v_effective_quantity, v_item_subtotal,
                    v_promotion_id, v_component.promotion_item_id, v_promotion_title
                );

                v_subtotal := v_subtotal + v_item_subtotal;

                update public.order_locals as ol
        set subtotal = ol.subtotal + v_item_subtotal,
            updated_at = now()
        where ol.order_id = v_order_id
          and ol.local_id = v_promotion_local_id;

            elsif v_promotion_type = 'COMBO' then
                if v_promotion_item_id is not null then
                    raise exception 'El combo "%" se compra completo, no por una línea individual', v_promotion_title;
                end if;

                select count(*)
                into v_component_count
                from public.local_promotion_items i
                where i.promotion_id = v_promotion_id;

                if v_component_count <= 0 then
                    raise exception 'El combo "%" no tiene productos configurados', v_promotion_title;
                end if;

                if exists (
                    select 1
                    from public.local_promotion_items i
                    join public.products p on p.id = i.product_id
                    left join public.product_variants pv on pv.id = i.variant_id
                    where i.promotion_id = v_promotion_id
                      and (
                        p.local_id <> v_promotion_local_id
                        or p.active is not true
                        or (
                            i.variant_id is not null
                            and (
                                pv.id is null
                                or pv.product_id <> i.product_id
                                or pv.active is not true
                            )
                        )
                      )
                ) then
                    raise exception 'Uno o más productos del combo "%" ya no están disponibles', v_promotion_title;
                end if;

                select coalesce(sum(coalesce(pv.price, p.price) * i.quantity), 0)
                into v_combo_regular_total
                from public.local_promotion_items i
                join public.products p on p.id = i.product_id
                left join public.product_variants pv on pv.id = i.variant_id
                where i.promotion_id = v_promotion_id;

                v_component_index := 0;
                v_combo_allocated := 0;

                for v_component in
                    select
                        i.id as promotion_item_id,
                        i.product_id,
                        i.variant_id,
                        i.quantity as component_quantity,
                        i.promo_price,
                        p.name as product_name,
                        p.price as product_price,
                        p.local_id as product_local_id,
                        pv.name as variant_name,
                        pv.price as variant_price
                    from public.local_promotion_items i
                    join public.products p on p.id = i.product_id
                    left join public.product_variants pv on pv.id = i.variant_id
                    where i.promotion_id = v_promotion_id
                    order by i.display_order, i.id
                loop
                    v_component_index := v_component_index + 1;
                    v_component_quantity := v_component.component_quantity;
                    v_component_regular_unit := coalesce(v_component.variant_price, v_component.product_price);
                    v_component_regular_line := v_component_regular_unit * v_component_quantity;

                    if v_promotion_price is not null then
                        if v_component_index = v_component_count then
                            v_line_promo_per_bundle := round(v_promotion_price - v_combo_allocated, 2);
                        elsif v_combo_regular_total > 0 then
                            v_line_promo_per_bundle := round(
                                v_promotion_price * v_component_regular_line / v_combo_regular_total,
                                2
                            );
                            v_combo_allocated := v_combo_allocated + v_line_promo_per_bundle;
                        else
                            v_line_promo_per_bundle := round(v_promotion_price / v_component_count, 2);
                            v_combo_allocated := v_combo_allocated + v_line_promo_per_bundle;
                        end if;
                    else
                        v_line_promo_per_bundle := coalesce(
                            v_component.promo_price,
                            round(v_component_regular_line, 2)
                        );
                    end if;

                    v_effective_quantity := v_component_quantity * v_quantity;
                    v_item_subtotal := round(v_line_promo_per_bundle * v_quantity, 2);
                    v_unit_price := case
                        when v_effective_quantity > 0
                        then v_item_subtotal / v_effective_quantity
                        else 0
                    end;

                    insert into public.order_items (
                        order_id, local_id, product_id, variant_id,
                        product_name, variant_name, unit_price, quantity, subtotal,
                        promotion_id, promotion_item_id, promotion_title
                    )
                    values (
                        v_order_id, v_promotion_local_id, v_component.product_id, v_component.variant_id,
                        v_component.product_name, v_component.variant_name,
                        v_unit_price, v_effective_quantity, v_item_subtotal,
                        v_promotion_id, v_component.promotion_item_id, v_promotion_title
                    );

                    v_subtotal := v_subtotal + v_item_subtotal;

                    update public.order_locals as ol
        set subtotal = ol.subtotal + v_item_subtotal,
            updated_at = now()
        where ol.order_id = v_order_id
          and ol.local_id = v_promotion_local_id;
                end loop;
            else
                raise exception 'Tipo de promoción no compatible';
            end if;

            continue;
        end if;

        v_product_id := nullif(v_item->>'product_id', '')::uuid;
        v_variant_id := nullif(v_item->>'variant_id', '')::uuid;
        v_quantity := (v_item->>'quantity')::integer;

        if v_product_id is null then
            raise exception 'Producto inválido';
        end if;

        if v_quantity is null or v_quantity <= 0 then
            raise exception 'La cantidad del producto debe ser mayor a 0';
        end if;

        select
            p.name,
            p.price,
            p.local_id,
            p.active
        into
            v_product_name,
            v_product_price,
            v_product_local_id,
            v_product_active
        from public.products as p
        where p.id = v_product_id;

        if not found then
            raise exception 'El producto % no existe', v_product_id;
        end if;

        if v_product_active is not true then
            raise exception 'El producto % está inactivo', v_product_name;
        end if;

        select exists (
            select 1
            from public.order_locals as ol
            where ol.order_id = v_order_id
              and ol.local_id = v_product_local_id
        )
        into v_item_local_exists;

        if not v_item_local_exists then
            raise exception 'El producto % pertenece a un local que no está incluido en el pedido', v_product_name;
        end if;

        v_variant_name := null;
        v_unit_price := v_product_price;

        if v_variant_id is not null then
            select
                pv.name,
                pv.price,
                pv.active,
                pv.product_id
            into
                v_variant_name,
                v_variant_price,
                v_variant_active,
                v_variant_product_id
            from public.product_variants as pv
            where pv.id = v_variant_id;

            if not found then
                raise exception 'La variante no existe';
            end if;

            if v_variant_active is not true then
                raise exception 'La variante % está inactiva', v_variant_name;
            end if;

            if v_variant_product_id <> v_product_id then
                raise exception 'La variante no pertenece al producto';
            end if;

            v_unit_price := v_variant_price;
        end if;

        v_item_subtotal := round(v_unit_price * v_quantity, 2);

        insert into public.order_items (
            order_id, local_id, product_id, variant_id,
            product_name, variant_name, unit_price, quantity, subtotal,
            promotion_id, promotion_item_id, promotion_title
        )
        values (
            v_order_id, v_product_local_id, v_product_id, v_variant_id,
            v_product_name, v_variant_name, v_unit_price, v_quantity, v_item_subtotal,
            null, null, null
        );

        v_subtotal := v_subtotal + v_item_subtotal;

        update public.order_locals as ol
        set subtotal = ol.subtotal + v_item_subtotal,
            updated_at = now()
        where ol.order_id = v_order_id
          and ol.local_id = v_product_local_id;
    end loop;

    if exists (
        select 1
        from public.order_locals as ol
        where ol.order_id = v_order_id
          and ol.subtotal <= 0
    ) then
        raise exception 'Existe un local sin productos válidos en el pedido';
    end if;

    v_subtotal := round(v_subtotal, 2);
    v_delivery_fee := round(v_delivery_fee, 2);
    v_total := round(v_subtotal + v_delivery_fee, 2);

    update public.orders as o
    set
        subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        total = v_total,
        delivery_distance_km = (
            select round(coalesce(sum(ol_distance.delivery_distance_km), 0), 2)
            from public.order_locals as ol_distance
            where ol_distance.order_id = v_order_id
        ),
        delivery_fee_mode = case
            when (
                select count(distinct ol_mode.delivery_fee_mode)
                from public.order_locals as ol_mode
                where ol_mode.order_id = v_order_id
            ) = 1
            then (
                select min(ol_mode_value.delivery_fee_mode)
                from public.order_locals as ol_mode_value
                where ol_mode_value.order_id = v_order_id
            )
            else 'MIXED'
        end,
        updated_at = now()
    where o.id = v_order_id;

    return query
    select
        o.id,
        o.subtotal,
        o.delivery_fee,
        o.total
    from public.orders as o
    where o.id = v_order_id;
end;
$function$
;

revoke all on function public.create_order_transaction(
  uuid,uuid,text,text,text,numeric,numeric,text,boolean,text,text,text,text,jsonb,jsonb
) from public, anon, authenticated;

grant execute on function public.create_order_transaction(
  uuid,uuid,text,text,text,numeric,numeric,text,boolean,text,text,text,text,jsonb,jsonb
) to service_role;

notify pgrst, 'reload schema';
