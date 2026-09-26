
drop policy if exists local_business_categories_read
  on public.local_business_categories;
drop policy if exists local_business_categories_public_read
  on public.local_business_categories;
drop policy if exists local_business_categories_authenticated_read
  on public.local_business_categories;

create policy local_business_categories_public_read
  on public.local_business_categories
  for select
  to anon
  using (active = true);

create policy local_business_categories_authenticated_read
  on public.local_business_categories
  for select
  to authenticated
  using (active = true or public.is_master());

drop policy if exists local_business_category_assignments_read
  on public.local_business_category_assignments;
drop policy if exists local_business_category_assignments_public_read
  on public.local_business_category_assignments;
drop policy if exists local_business_category_assignments_authenticated_read
  on public.local_business_category_assignments;

create policy local_business_category_assignments_public_read
  on public.local_business_category_assignments
  for select
  to anon
  using (
    exists (
      select 1
      from public.local_business_categories c
      where c.id = category_id and c.active = true
    )
    and public.local_is_public(local_id)
  );

create policy local_business_category_assignments_authenticated_read
  on public.local_business_category_assignments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.local_business_categories c
      where c.id = category_id and c.active = true
    )
    and (
      public.local_is_public(local_id)
      or public.user_can_access_local(local_id)
      or public.is_master()
    )
  );

notify pgrst, 'reload schema';