revoke execute on function public.automation_claim_jobs(integer)
from anon,authenticated;

revoke execute on function public.automation_complete_job(uuid,boolean,text)
from anon,authenticated;

revoke execute on function public.automation_bridge_health()
from anon,authenticated;

revoke execute on function public.automation_local_order_context(uuid,uuid)
from anon,authenticated;

revoke execute on function public.automation_driver_context(uuid,uuid)
from anon,authenticated;

revoke execute on function public.delivery_enqueue_local_order_automation(uuid,uuid,uuid,text)
from anon,authenticated;

grant execute on function public.automation_claim_jobs(integer) to service_role;
grant execute on function public.automation_complete_job(uuid,boolean,text) to service_role;
grant execute on function public.automation_bridge_health() to service_role;
grant execute on function public.automation_local_order_context(uuid,uuid) to service_role;
grant execute on function public.automation_driver_context(uuid,uuid) to service_role;
grant execute on function public.delivery_enqueue_local_order_automation(uuid,uuid,uuid,text) to service_role;
