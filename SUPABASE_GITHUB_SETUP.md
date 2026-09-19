# GitHub → Supabase para HTPWEB

Proyecto remoto detectado desde el frontend:

- Project ref: `hwfloywzqlgqieonuswl`
- URL: `https://hwfloywzqlgqieonuswl.supabase.co`

## Secrets que el propietario debe agregar en GitHub

Repositorio → **Settings → Secrets and variables → Actions → New repository secret**

Crear exactamente:

1. `SUPABASE_ACCESS_TOKEN`
2. `SUPABASE_DB_PASSWORD`

Nunca guardar esos valores dentro del repositorio.

## Primera prueba

Después de crear los secrets:

**Actions → Supabase Connection Check → Run workflow**

Este workflow:
- instala Supabase CLI;
- enlaza el runner al proyecto;
- ejecuta únicamente `supabase db push --dry-run`;
- NO aplica migraciones.

## Despliegue real

Cuando la conexión quede validada:

**Actions → Deploy Supabase → Run workflow**

Por seguridad, el workflow es manual inicialmente.

Más adelante, después de validar el proceso y el baseline, se puede habilitar despliegue automático desde `main`.

## Baseline

Los Códigos #1–#64 ya fueron aplicados manualmente en Supabase.

No deben volver a ejecutarse mediante `db push`.

Desde el Código #65 en adelante los cambios nuevos deben guardarse como migraciones nuevas en:

`supabase/migrations/`
