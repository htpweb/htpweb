-- Harden advertising RPC execution privileges.
-- Keep only the public client feed callable by anon.

revoke execute on function public.advertisement_visible_to_delivery(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.advertising_delivery_requests(uuid) from public, anon, authenticated;
revoke execute on function public.advertising_delivery_stats(uuid) from public, anon, authenticated;
revoke execute on function public.save_advertising_split(numeric,numeric,numeric) from public, anon, authenticated;
revoke execute on function public.save_advertisement_commercial(uuid,uuid[],numeric,uuid,boolean) from public, anon, authenticated;
revoke execute on function public.submit_advertising_request(uuid,uuid,text,text,text,integer,numeric) from public, anon, authenticated;

grant execute on function public.advertising_delivery_requests(uuid) to authenticated;
grant execute on function public.advertising_delivery_stats(uuid) to authenticated;
grant execute on function public.save_advertising_split(numeric,numeric,numeric) to authenticated;
grant execute on function public.save_advertisement_commercial(uuid,uuid[],numeric,uuid,boolean) to authenticated;
grant execute on function public.submit_advertising_request(uuid,uuid,text,text,text,integer,numeric) to authenticated;

revoke execute on function public.public_delivery_advertisements(uuid) from public, anon, authenticated;
grant execute on function public.public_delivery_advertisements(uuid) to anon, authenticated;
