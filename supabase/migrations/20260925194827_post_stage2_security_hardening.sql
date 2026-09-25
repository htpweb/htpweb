-- Post-Stage 2 security hardening.
-- Scope: close internal RPC helpers that do not belong to the public API,
-- fix the mutable search_path warning, and remove one proven duplicate index.

begin;

-- Helper only raises a controlled exception; pin its lookup path.
alter function public.raise_exception_bool(text)
  set search_path = pg_catalog;

-- Trigger function: it is invoked by PostgreSQL through the trigger, not as a client RPC.
revoke execute on function public.htp_validate_local_delivery_zone()
  from public, anon, authenticated;
grant execute on function public.htp_validate_local_delivery_zone()
  to service_role;

-- Internal LOCAL authorization/plan helpers.
-- Their current callers are SECURITY DEFINER RPCs, so browser roles do not need direct EXECUTE.
revoke execute on function public.user_can_manage_local_resource(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.user_can_manage_local_resource(uuid,text,text)
  to service_role;

revoke execute on function public.local_effective_limit_value(uuid,text)
  from public, anon, authenticated;
grant execute on function public.local_effective_limit_value(uuid,text)
  to service_role;

revoke execute on function public.local_has_effective_capability(uuid,text)
  from public, anon, authenticated;
grant execute on function public.local_has_effective_capability(uuid,text)
  to service_role;

-- MASTER workspace is still callable by authenticated MASTER users, but not by anon/PUBLIC.
-- The function itself keeps its explicit is_master() authorization check.
revoke execute on function public.master_save_delivery_workspace(
  uuid,text,text,text,text,text,uuid,boolean,uuid,boolean,uuid[],text,numeric,
  time without time zone,time without time zone,numeric,numeric
) from public, anon;
grant execute on function public.master_save_delivery_workspace(
  uuid,text,text,text,text,text,uuid,boolean,uuid,boolean,uuid[],text,numeric,
  time without time zone,time without time zone,numeric,numeric
) to authenticated, service_role;

-- local_deliveries_pkey already enforces UNIQUE(local_id, delivery_id).
drop index if exists public.uq_local_deliveries_local_delivery;

commit;
