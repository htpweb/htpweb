-- HTPWEB — contador global de visitas públicas
-- Cada DELIVERY conserva su acumulado; el valor público mostrado es la suma global.

create table if not exists public.delivery_visit_counters (
  delivery_id uuid primary key references public.deliveries(id) on delete cascade,
  visits bigint not null default 0 check (visits >= 0),
  updated_at timestamptz not null default now()
);

alter table public.delivery_visit_counters enable row level security;

revoke all on table public.delivery_visit_counters from anon, authenticated;

create or replace function public.global_delivery_visit_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(v.visits), 0)::bigint
  from public.delivery_visit_counters v;
$$;

create or replace function public.register_delivery_visit(p_delivery_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  if p_delivery_id is null or not exists (
    select 1
    from public.deliveries d
    where d.id = p_delivery_id
      and d.active = true
  ) then
    raise exception 'DELIVERY inválido';
  end if;

  insert into public.delivery_visit_counters(delivery_id, visits, updated_at)
  values (p_delivery_id, 1, now())
  on conflict (delivery_id)
  do update
     set visits = public.delivery_visit_counters.visits + 1,
         updated_at = now();

  select coalesce(sum(v.visits), 0)::bigint
    into v_total
  from public.delivery_visit_counters v;

  return v_total;
end;
$$;

revoke all on function public.global_delivery_visit_count() from public;
revoke all on function public.register_delivery_visit(uuid) from public;
grant execute on function public.global_delivery_visit_count() to anon, authenticated;
grant execute on function public.register_delivery_visit(uuid) to anon, authenticated;

comment on table public.delivery_visit_counters
is 'Contador acumulado de visitas por DELIVERY. No expuesto directamente al navegador.';

comment on function public.global_delivery_visit_count()
is 'Devuelve la suma de visitas acumuladas de todos los DELIVERY.';

comment on function public.register_delivery_visit(uuid)
is 'Incrementa una visita del DELIVERY y devuelve inmediatamente el total global HTPWEB.';
