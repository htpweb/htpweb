-- Frontend reads these tables directly; RLS continues to enforce MASTER/DELIVERY scope.
grant select on table public.advertisement_zones to authenticated;
grant select on table public.advertising_requests to authenticated;
