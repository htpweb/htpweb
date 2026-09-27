create index if not exists order_items_promotion_item_idx
  on public.order_items(promotion_item_id)
  where promotion_item_id is not null;
