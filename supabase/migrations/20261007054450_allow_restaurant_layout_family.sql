-- Allow the dedicated RESTAURANT storefront family before restaurant presets are inserted.
alter table public.local_storefront_presets
drop constraint if exists local_storefront_presets_layout_family_check;

alter table public.local_storefront_presets
add constraint local_storefront_presets_layout_family_check
check (layout_family = any(array[
  'FOOD'::text,
  'RESTAURANT'::text,
  'RETAIL'::text,
  'FASHION'::text,
  'HEALTH'::text,
  'HARDWARE'::text,
  'SERVICES'::text,
  'GENERAL'::text,
  'BOOKS'::text,
  'FLOWERS'::text,
  'PROFESSIONAL'::text,
  'BEAUTY'::text
]));
