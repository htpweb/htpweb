create or replace function public.master_list_delivery_authorizations(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not public.is_master() then
    raise exception 'HTPWEB: operación exclusiva de MASTER';
  end if;

  update public.delivery_access_authorizations a
  set status='EXPIRED', updated_at=now()
  where a.status='PENDING' and a.expires_at<=now();

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',a.id,
        'delivery_id',a.delivery_id,
        'representative_name',a.representative_name,
        'email',a.email,
        'phone',a.phone,
        'national_id_last4',a.national_id_last4,
        'role_code',a.role_code,
        'status',a.status,
        'expires_at',a.expires_at,
        'claimed_by',a.claimed_by,
        'claimed_at',a.claimed_at,
        'created_at',a.created_at,
        'active_access',case
          when a.claimed_by is null then false
          else coalesce(pr.active,false)
            and not coalesce(au.banned_until>now(),false)
            and exists (
              select 1 from public.user_deliveries ud
              where ud.user_id=a.claimed_by
                and ud.delivery_id=a.delivery_id
                and ud.active=true
            )
        end,
        'account_exists',au.id is not null,
        'account_user_id',au.id,
        'account_confirmed',au.email_confirmed_at is not null,
        'account_disabled',coalesce(au.banned_until>now(),false)
          or coalesce(pr.active=false,false),
        'account_banned_until',au.banned_until,
        'account_profile_active',pr.active
      )
      order by a.created_at desc
    )
    from public.delivery_access_authorizations a
    left join lateral (
      select u.id,u.email_confirmed_at,u.banned_until
      from auth.users u
      where lower(u.email)=lower(a.email)
        and u.deleted_at is null
      order by u.created_at desc
      limit 1
    ) au on true
    left join public.profiles pr on pr.id=au.id
    where a.delivery_id=p_delivery_id
  ),'[]'::jsonb);
end;
$function$;
