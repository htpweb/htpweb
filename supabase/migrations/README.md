# Migraciones HTPWEB

Los Códigos #1–#64 ya fueron aplicados manualmente en el proyecto Supabase existente.

No deben volver a ejecutarse mediante `supabase db push`.

Desde el siguiente cambio permanente, cada modificación de base de datos se guarda como una nueva migración SQL en esta carpeta y se despliega con Supabase CLI.

Antes de desplegar se usa:

`supabase db push --dry-run`
