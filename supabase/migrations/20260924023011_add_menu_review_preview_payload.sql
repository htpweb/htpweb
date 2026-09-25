alter table public.menu_review_images
  add column if not exists preview_payload text;
