# HTPWEB — Importación de menú por imagen (Código #79)

## Arquitectura

`MASTER → Storage privado (htpweb-imports) → job MENU_IMAGE → Edge Function analizar-menu → preview editable → RPC master_apply_menu_import → LOCAL/categorías/productos/variantes`

La IA **no escribe catálogo directamente**. Solo devuelve una vista previa estructurada. La creación/actualización ocurre cuando MASTER confirma y PostgreSQL ejecuta una sola transacción.

## Configuración requerida una sola vez

La Edge Function usa un secreto de Supabase:

- `OPENAI_API_KEY`: obligatorio para analizar imágenes.
- `OPENAI_MENU_MODEL`: opcional. Si no se define, usa `gpt-6-astra`.

El secreto debe configurarse en Supabase/Edge Functions. **Nunca** se agrega al HTML, JavaScript público, repositorio ni variables del navegador.

Si `OPENAI_API_KEY` todavía no existe, MASTER puede subir las imágenes y el job queda guardado. El análisis puede reintentarse después desde el ADMIN.

## Despliegue

El workflow existente `Deploy Supabase` debe ejecutarse con **Deploy Edge Functions too = true** para aplicar:

1. la migración `20260919153500_menu_image_import.sql`;
2. la Edge Function `analizar-menu`.

## Límites de esta versión

- solo MASTER;
- 1 a 5 imágenes;
- JPG, PNG o WEBP;
- máximo 10 MB por imagen desde el frontend/Edge Function;
- el preview debe revisarse antes de confirmar;
- un LOCAL nuevo queda inactivo por defecto;
- para publicar un LOCAL nuevo al confirmar se exigen latitud y longitud;
- si se selecciona un LOCAL existente, sus datos globales no se sobrescriben;
- productos/categorías/variantes con el mismo nombre se reutilizan/actualizan para evitar duplicados en reintentos.

## Privacidad y costo

Las imágenes se guardan en el bucket privado de importaciones. La Edge Function envía las imágenes al proveedor de IA solo durante el análisis. La llamada usa `store: false`. El consumo de la API se factura en la cuenta asociada a `OPENAI_API_KEY`.
