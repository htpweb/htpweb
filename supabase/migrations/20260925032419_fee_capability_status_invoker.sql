-- El estado de la capability se consulta con los permisos/RLS del usuario autenticado.
alter function public.master_delivery_fee_capability_status(uuid) security invoker;
