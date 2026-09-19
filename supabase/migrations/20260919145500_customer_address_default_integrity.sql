-- Código #75
-- Garantiza una sola dirección predeterminada activa por CLIENT.
-- Sí modifica: crea un índice único parcial de integridad.

create unique index if not exists ux_customer_addresses_one_active_default
on public.customer_addresses(customer_id)
where active = true and is_default = true;
