-- HTPWEB Código 98 — enriquecimiento Google y aprobación masiva segura de locales.

create table if not exists public.local_google_reviews (
  local_id uuid primary key references public.locals(id) on delete cascade,
  phone text,
  schedule_json jsonb,
  status text not null default 'PENDING' check (status in ('PENDING','REVIEW_REQUIRED','APPROVED')),
  warnings text[] not null default '{}'::text[],
  fetched_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.local_google_reviews enable row level security;

drop policy if exists local_google_reviews_master_read on public.local_google_reviews;
create policy local_google_reviews_master_read
  on public.local_google_reviews
  for select
  to authenticated
  using(public.is_master());

create or replace function public.master_upsert_local_google_review(
  p_local_id uuid,
  p_phone text,
  p_schedule jsonb,
  p_status text,
  p_warnings text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;
  if not exists(select 1 from public.locals l where l.id=p_local_id) then
    raise exception 'HTPWEB: LOCAL inexistente';
  end if;
  if upper(coalesce(p_status,'')) not in ('PENDING','REVIEW_REQUIRED') then
    raise exception 'HTPWEB: estado de revisión Google inválido';
  end if;
  if p_schedule is not null and jsonb_typeof(p_schedule) <> 'array' then
    raise exception 'HTPWEB: horario Google inválido';
  end if;

  insert into public.local_google_reviews(
    local_id,phone,schedule_json,status,warnings,fetched_at,approved_at,approved_by,updated_at
  )
  values(
    p_local_id,
    nullif(trim(coalesce(p_phone,'')),''),
    p_schedule,
    upper(p_status),
    coalesce(p_warnings,'{}'::text[]),
    now(),null,null,now()
  )
  on conflict(local_id) do update set
    phone=excluded.phone,
    schedule_json=excluded.schedule_json,
    status=excluded.status,
    warnings=excluded.warnings,
    fetched_at=now(),
    approved_at=null,
    approved_by=null,
    updated_at=now();
end;
$$;

create or replace function public.master_list_local_google_reviews()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select case when not public.is_master() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'local_id',r.local_id,
      'local_name',l.name,
      'phone',r.phone,
      'schedule',r.schedule_json,
      'status',r.status,
      'warnings',to_jsonb(r.warnings),
      'fetched_at',r.fetched_at,
      'active',l.active,
      'google_place_id',l.google_place_id
    ) order by r.fetched_at desc,l.name)
    from public.local_google_reviews r
    join public.locals l on l.id=r.local_id
  ),'[]'::jsonb) end;
$$;

create or replace function public.master_approve_local_google_reviews(
  p_local_ids uuid[],
  p_publish boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_review public.local_google_reviews%rowtype;
  v_item jsonb;
  v_day smallint;
  v_closed boolean;
  v_open time;
  v_close time;
  v_approved integer := 0;
  v_skipped integer := 0;
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;
  if coalesce(array_length(p_local_ids,1),0)=0 then
    raise exception 'HTPWEB: seleccione al menos un LOCAL';
  end if;

  foreach v_id in array p_local_ids
  loop
    select * into v_review
    from public.local_google_reviews r
    where r.local_id=v_id
    for update;

    if not found or v_review.status<>'PENDING' then
      v_skipped:=v_skipped+1;
      continue;
    end if;

    if v_review.phone is not null then
      update public.locals
      set phone=coalesce(nullif(trim(phone),''),v_review.phone),
          updated_at=now()
      where id=v_id;
    end if;

    if v_review.schedule_json is null
       or jsonb_typeof(v_review.schedule_json)<>'array'
       or jsonb_array_length(v_review.schedule_json)<>7 then
      raise exception 'HTPWEB: horario Google incompleto para LOCAL %',v_id;
    end if;

    for v_item in select value from jsonb_array_elements(v_review.schedule_json)
    loop
      v_day:=(v_item->>'day_of_week')::smallint;
      v_closed:=(v_item->>'is_closed')::boolean;

      if v_closed then
        perform public.save_local_schedule(v_id,v_day,true,null,null);
      else
        v_open:=(v_item->>'opening_time')::time;
        v_close:=(v_item->>'closing_time')::time;
        if v_open>=v_close then
          raise exception 'HTPWEB: horario Google no compatible para LOCAL % día %',v_id,v_day;
        end if;
        perform public.save_local_schedule(v_id,v_day,false,v_open,v_close);
      end if;
    end loop;

    if coalesce(p_publish,true) then
      perform public.master_set_local_active(v_id,true);
    end if;

    update public.local_google_reviews
    set status='APPROVED',approved_at=now(),approved_by=auth.uid(),updated_at=now()
    where local_id=v_id;

    v_approved:=v_approved+1;
  end loop;

  return jsonb_build_object('approved',v_approved,'skipped',v_skipped);
end;
$$;

revoke all on function public.master_upsert_local_google_review(uuid,text,jsonb,text,text[]) from public,anon;
revoke all on function public.master_list_local_google_reviews() from public,anon;
revoke all on function public.master_approve_local_google_reviews(uuid[],boolean) from public,anon;

grant execute on function public.master_upsert_local_google_review(uuid,text,jsonb,text,text[]) to authenticated;
grant execute on function public.master_list_local_google_reviews() to authenticated;
grant execute on function public.master_approve_local_google_reviews(uuid[],boolean) to authenticated;
