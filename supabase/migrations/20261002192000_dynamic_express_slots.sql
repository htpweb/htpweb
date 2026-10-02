create or replace function public.master_create_express_slot()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_key text;
begin
  if not public.is_master() then
    raise exception 'MASTER requerido';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('htpweb_express_slots', 0));

  select coalesce(max((regexp_match(slot_key, '^express([0-9]+)$'))[1]::integer), 0) + 1
    into v_next
  from public.express_demo_slots
  where slot_key ~ '^express[0-9]+$';

  v_key := 'express' || v_next::text;

  insert into public.express_demo_slots(slot_key, active)
  values (v_key, true);

  return v_key;
end;
$$;

revoke all on function public.master_create_express_slot() from public;
grant execute on function public.master_create_express_slot() to authenticated;