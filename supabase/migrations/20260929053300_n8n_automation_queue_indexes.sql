create index if not exists idx_automation_jobs_delivery
  on private.automation_jobs(delivery_id,created_at desc);

create index if not exists idx_automation_jobs_local
  on private.automation_jobs(local_id,created_at desc);

create index if not exists idx_automation_jobs_driver
  on private.automation_jobs(driver_user_id,created_at desc);
