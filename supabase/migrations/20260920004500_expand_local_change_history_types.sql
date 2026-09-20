-- HTPWEB Código #88A hotfix — tipos extensibles de auditoría de LOCAL
-- La auditoría debe aceptar eventos nuevos sin perder la validación de contenido.

alter table public.local_change_history
  drop constraint if exists local_change_history_type_check;

alter table public.local_change_history
  add constraint local_change_history_type_check
  check (change_type is not null and btrim(change_type) <> '');
