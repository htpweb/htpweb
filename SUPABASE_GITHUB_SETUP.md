# Conexión GitHub → Supabase

Proyecto HTPWEB:
- Project ref: `hwfloywzqlgqieonuswl`

## Secrets requeridos

En GitHub:

**Settings → Secrets and variables → Actions → New repository secret**

Crear:

1. `SUPABASE_ACCESS_TOKEN`
2. `SUPABASE_DB_PASSWORD`

No guardar sus valores dentro del repositorio.

## Primera prueba

Actions → **Supabase Connection Check** → **Run workflow**

La prueba solo enlaza el proyecto y ejecuta:

`supabase db push --dry-run`

No modifica la base de datos.

## Despliegue

Después de validar la conexión:

Actions → **Deploy Supabase** → **Run workflow**

El despliegue queda manual al inicio por seguridad.

Los Códigos #1–#64 son el baseline ya aplicado manualmente. Las nuevas migraciones empiezan a partir del siguiente cambio.
