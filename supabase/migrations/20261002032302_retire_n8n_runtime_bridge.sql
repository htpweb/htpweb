-- Retire the legacy n8n runtime bridge without touching HTPWEB orders or WhatsApp flows.
update private.automation_bridge_settings
set active=false, updated_at=now()
where upper(bridge_code)='N8N';

update private.automation_jobs
set status='CANCELLED',
    completed_at=now(),
    locked_at=null,
    last_error='Legacy n8n runtime retired from HTPWEB',
    updated_at=now()
where bridge_code='N8N'
  and status in ('PENDING','PROCESSING');

drop trigger if exists trg_order_locals_enqueue_n8n_events
  on public.order_locals;

drop trigger if exists trg_order_driver_plans_enqueue_n8n
  on private.order_driver_plans;

drop trigger if exists trg_order_driver_assignments_enqueue_n8n
  on public.order_driver_assignments;

create or replace function public.delivery_enqueue_local_order_automation(
  p_delivery_id uuid,
  p_order_id uuid,
  p_local_id uuid,
  p_token text
)
returns uuid
language sql
security invoker
set search_path=''
as $function$
  select null::uuid;
$function$;

revoke all on function public.delivery_enqueue_local_order_automation(uuid,uuid,uuid,text)
from public,anon;
grant execute on function public.delivery_enqueue_local_order_automation(uuid,uuid,uuid,text)
to authenticated,service_role;

comment on function public.delivery_enqueue_local_order_automation(uuid,uuid,uuid,text)
is 'Legacy compatibility no-op. n8n runtime bridge retired; HTPWEB uses direct WhatsApp/Meta flows.';
