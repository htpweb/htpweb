update public.plan_feature_catalog
set stage=1, updated_at=now()
where code in (
  'restricted_areas.active.max',
  'restricted_areas.manage',
  'restricted_areas.schedule'
)
  and stage<>1;
