create table if not exists public.express_demo_slots (
  slot_key text primary key check (slot_key ~ '^express[1-9][0-9]*$'),
  active boolean not null default true,
  demo_id uuid references public.express_demos(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.express_demo_slots enable row level security;
revoke all on table public.express_demo_slots from anon, authenticated;

insert into public.express_demo_slots(slot_key)
values ('express1'),('express2'),('express3')
on conflict (slot_key) do nothing;

create or replace function public.master_express_slots_snapshot()
returns table (
  slot_key text,
  active boolean,
  demo_id uuid,
  used_at timestamptz,
  demo_name text,
  demo_whatsapp text,
  demo_expires_at timestamptz,
  demo_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_master() then
    raise exception 'MASTER requerido';
  end if;
  return query
  select s.slot_key,s.active,s.demo_id,s.used_at,d.name,d.whatsapp,d.expires_at,
         coalesce(d.active,false) and d.expires_at > now()
  from public.express_demo_slots s
  left join public.express_demos d on d.id=s.demo_id
  order by s.slot_key;
end;
$$;

create or replace function public.master_reset_express_slot(p_slot_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_master() then
    raise exception 'MASTER requerido';
  end if;
  update public.express_demo_slots
  set demo_id=null,used_at=null,active=true
  where slot_key=lower(trim(p_slot_key));
  return found;
end;
$$;

revoke all on function public.master_express_slots_snapshot() from public;
revoke all on function public.master_reset_express_slot(text) from public;
grant execute on function public.master_express_slots_snapshot() to authenticated;
grant execute on function public.master_reset_express_slot(text) to authenticated;
