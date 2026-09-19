-- HTPWEB Código #71
-- Sí modifica: corrige ambigüedades PL/pgSQL entre columnas y columnas de salida
-- de public.create_order_transaction sin cambiar su contrato ni permisos.

CREATE OR REPLACE FUNCTION public.create_order_transaction(
    p_delivery_id uuid,
    p_customer_id uuid,
    p_customer_name text,
    p_customer_phone text,
    p_delivery_address text,
    p_latitude numeric,
    p_longitude numeric,
    p_address_reference text,
    p_requires_invoice boolean,
    p_document_type text,
    p_document_number text,
    p_invoice_email text,
    p_notes text,
    p_locals jsonb,
    p_items jsonb
)
RETURNS TABLE(
    order_id uuid,
    subtotal numeric,
    delivery_fee numeric,
    total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_order_id uuid;
    v_delivery_active boolean;

    v_subtotal numeric(12,2) := 0;
    v_delivery_fee numeric(12,2) := 0;
    v_total numeric(12,2) := 0;

    v_local jsonb;
    v_item jsonb;

    v_local_id uuid;
    v_distance_km numeric(10,2);
    v_local_subtotal numeric(12,2);
    v_local_delivery_fee numeric(12,2);
    v_fee_mode text;

    v_product_id uuid;
    v_variant_id uuid;
    v_quantity integer;

    v_product_name text;
    v_variant_name text;

    v_product_price numeric(12,2);
    v_variant_price numeric(12,2);
    v_unit_price numeric(12,2);
    v_item_subtotal numeric(12,2);

    v_product_local_id uuid;
    v_product_active boolean;

    v_variant_active boolean;
    v_variant_product_id uuid;

    v_config_mode text;
    v_item_local_exists boolean;
BEGIN
    IF p_delivery_id IS NULL THEN
        RAISE EXCEPTION 'delivery_id es obligatorio';
    END IF;

    IF p_customer_id IS NULL THEN
        RAISE EXCEPTION 'customer_id es obligatorio';
    END IF;

    IF NULLIF(trim(p_customer_phone), '') IS NULL THEN
        RAISE EXCEPTION 'El teléfono del cliente es obligatorio';
    END IF;

    IF NULLIF(trim(p_delivery_address), '') IS NULL THEN
        RAISE EXCEPTION 'La dirección de entrega es obligatoria';
    END IF;

    IF p_latitude IS NULL OR p_longitude IS NULL THEN
        RAISE EXCEPTION 'La ubicación del cliente es obligatoria';
    END IF;

    IF p_latitude < -90 OR p_latitude > 90 THEN
        RAISE EXCEPTION 'Latitud inválida';
    END IF;

    IF p_longitude < -180 OR p_longitude > 180 THEN
        RAISE EXCEPTION 'Longitud inválida';
    END IF;

    IF p_locals IS NULL
       OR jsonb_typeof(p_locals) <> 'array'
       OR jsonb_array_length(p_locals) = 0
    THEN
        RAISE EXCEPTION 'El pedido debe contener al menos un local';
    END IF;

    IF p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0
    THEN
        RAISE EXCEPTION 'El pedido debe contener al menos un producto';
    END IF;

    SELECT d.active
    INTO v_delivery_active
    FROM public.deliveries AS d
    WHERE d.id = p_delivery_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El delivery no existe';
    END IF;

    IF v_delivery_active IS NOT TRUE THEN
        RAISE EXCEPTION 'El delivery no está activo';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.customers AS c
        WHERE c.id = p_customer_id
          AND c.active = true
    ) THEN
        RAISE EXCEPTION 'El cliente no existe o está inactivo';
    END IF;

    INSERT INTO public.orders (
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
    VALUES (
        p_delivery_id,
        p_customer_id,
        'PENDING',
        0,
        0,
        0,
        NULLIF(trim(p_customer_name), ''),
        trim(p_customer_phone),
        trim(p_delivery_address),
        p_latitude,
        p_longitude,
        NULLIF(trim(p_address_reference), ''),
        COALESCE(p_requires_invoice, false),
        CASE
            WHEN COALESCE(p_requires_invoice, false)
            THEN NULLIF(trim(p_document_type), '')
            ELSE NULL
        END,
        CASE
            WHEN COALESCE(p_requires_invoice, false)
            THEN NULLIF(trim(p_document_number), '')
            ELSE NULL
        END,
        CASE
            WHEN COALESCE(p_requires_invoice, false)
            THEN NULLIF(trim(p_invoice_email), '')
            ELSE NULL
        END,
        NULLIF(trim(p_notes), '')
    )
    RETURNING public.orders.id
    INTO v_order_id;

    FOR v_local IN
        SELECT value
        FROM jsonb_array_elements(p_locals)
    LOOP
        v_local_id := (v_local->>'local_id')::uuid;

        v_distance_km := round(
            (v_local->>'distance_km')::numeric,
            2
        );

        IF v_local_id IS NULL THEN
            RAISE EXCEPTION 'Existe un local sin local_id';
        END IF;

        IF v_distance_km IS NULL OR v_distance_km < 0 THEN
            RAISE EXCEPTION
                'Distancia inválida para el local %',
                v_local_id;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM public.locals AS l
            INNER JOIN public.local_deliveries AS ld
                ON ld.local_id = l.id
               AND ld.delivery_id = p_delivery_id
               AND ld.active = true
            WHERE l.id = v_local_id
              AND l.active = true
        ) THEN
            RAISE EXCEPTION
                'El local % no está activo o no tiene una relación activa con el delivery',
                v_local_id;
        END IF;

        SELECT dfc.mode
        INTO v_config_mode
        FROM public.delivery_fee_configs AS dfc
        WHERE dfc.delivery_id = p_delivery_id
          AND dfc.active = true
        LIMIT 1;

        IF v_config_mode IS NULL THEN
            RAISE EXCEPTION
                'El delivery no tiene una configuración de tarifa activa';
        END IF;

        v_local_delivery_fee :=
            public.calculate_delivery_fee(
                p_delivery_id,
                v_distance_km
            );

        v_local_subtotal := 0;

        INSERT INTO public.order_locals (
            order_id,
            local_id,
            subtotal,
            delivery_distance_km,
            delivery_fee,
            delivery_fee_mode
        )
        VALUES (
            v_order_id,
            v_local_id,
            0,
            v_distance_km,
            v_local_delivery_fee,
            v_config_mode
        );

        v_delivery_fee :=
            v_delivery_fee + v_local_delivery_fee;
    END LOOP;

    FOR v_item IN
        SELECT value
        FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id :=
            (v_item->>'product_id')::uuid;

        v_variant_id :=
            NULLIF(v_item->>'variant_id', '')::uuid;

        v_quantity :=
            (v_item->>'quantity')::integer;

        IF v_product_id IS NULL THEN
            RAISE EXCEPTION 'Producto inválido';
        END IF;

        IF v_quantity IS NULL OR v_quantity <= 0 THEN
            RAISE EXCEPTION
                'La cantidad del producto debe ser mayor a 0';
        END IF;

        SELECT
            p.name,
            p.price,
            p.local_id,
            p.active
        INTO
            v_product_name,
            v_product_price,
            v_product_local_id,
            v_product_active
        FROM public.products AS p
        WHERE p.id = v_product_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'El producto % no existe',
                v_product_id;
        END IF;

        IF v_product_active IS NOT TRUE THEN
            RAISE EXCEPTION
                'El producto % está inactivo',
                v_product_name;
        END IF;

        SELECT EXISTS (
            SELECT 1
            FROM public.order_locals AS ol
            WHERE ol.order_id = v_order_id
              AND ol.local_id = v_product_local_id
        )
        INTO v_item_local_exists;

        IF NOT v_item_local_exists THEN
            RAISE EXCEPTION
                'El producto % pertenece a un local que no está incluido en el pedido',
                v_product_name;
        END IF;

        v_variant_name := NULL;
        v_unit_price := v_product_price;

        IF v_variant_id IS NOT NULL THEN
            SELECT
                pv.name,
                pv.price,
                pv.active,
                pv.product_id
            INTO
                v_variant_name,
                v_variant_price,
                v_variant_active,
                v_variant_product_id
            FROM public.product_variants AS pv
            WHERE pv.id = v_variant_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'La variante no existe';
            END IF;

            IF v_variant_active IS NOT TRUE THEN
                RAISE EXCEPTION
                    'La variante % está inactiva',
                    v_variant_name;
            END IF;

            IF v_variant_product_id <> v_product_id THEN
                RAISE EXCEPTION
                    'La variante no pertenece al producto';
            END IF;

            v_unit_price := v_variant_price;
        END IF;

        v_item_subtotal :=
            ROUND(v_unit_price * v_quantity, 2);

        INSERT INTO public.order_items (
            order_id,
            local_id,
            product_id,
            variant_id,
            product_name,
            variant_name,
            unit_price,
            quantity,
            subtotal
        )
        VALUES (
            v_order_id,
            v_product_local_id,
            v_product_id,
            v_variant_id,
            v_product_name,
            v_variant_name,
            v_unit_price,
            v_quantity,
            v_item_subtotal
        );

        v_subtotal :=
            v_subtotal + v_item_subtotal;

        UPDATE public.order_locals AS ol
        SET
            subtotal = ol.subtotal + v_item_subtotal,
            updated_at = now()
        WHERE ol.order_id = v_order_id
          AND ol.local_id = v_product_local_id;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM public.order_locals AS ol
        WHERE ol.order_id = v_order_id
          AND ol.subtotal <= 0
    ) THEN
        RAISE EXCEPTION
            'Existe un local sin productos válidos en el pedido';
    END IF;

    v_subtotal := ROUND(v_subtotal, 2);
    v_delivery_fee := ROUND(v_delivery_fee, 2);
    v_total := ROUND(v_subtotal + v_delivery_fee, 2);

    UPDATE public.orders AS o
    SET
        subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        total = v_total,
        delivery_distance_km = (
            SELECT ROUND(
                COALESCE(SUM(ol_distance.delivery_distance_km), 0),
                2
            )
            FROM public.order_locals AS ol_distance
            WHERE ol_distance.order_id = v_order_id
        ),
        delivery_fee_mode = CASE
            WHEN (
                SELECT COUNT(DISTINCT ol_mode.delivery_fee_mode)
                FROM public.order_locals AS ol_mode
                WHERE ol_mode.order_id = v_order_id
            ) = 1
            THEN (
                SELECT MIN(ol_mode_value.delivery_fee_mode)
                FROM public.order_locals AS ol_mode_value
                WHERE ol_mode_value.order_id = v_order_id
            )
            ELSE 'MIXED'
        END,
        updated_at = now()
    WHERE o.id = v_order_id;

    RETURN QUERY
    SELECT
        o.id,
        o.subtotal,
        o.delivery_fee,
        o.total
    FROM public.orders AS o
    WHERE o.id = v_order_id;
END;
$function$;
