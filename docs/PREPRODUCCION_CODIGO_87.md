# HTPWEB — Código #87: corte preproducción

Fecha: 2026-09-19

## Alcance

Este corte congela la secuencia previa a producción después de #81–#86. Logística Stage 2 queda expresamente fuera.

## Estado técnico confirmado

- #82 Dashboards: fusionado antes de este corte.
- #83 Carga masiva CSV/XLSX: fusionado antes de este corte.
- #84 Monetización backend: fusionado.
- #85 Enforcement de planes: fusionado.
- #86 Monetización ADMIN: fusionado.
- `main` al iniciar #87: `bdd7694264173f934be02fa678a692169684a88b`.

## Gate de salida

### CI y esquema

- [ ] Frontend Check verde sobre el HEAD exacto del PR #87.
- [ ] Supabase Connection Check verde sobre el HEAD exacto del PR #87.
- [ ] No hay migraciones pendientes inesperadas.
- [ ] Edge Functions pasan `deno check`.
- [ ] Runtime Audit ejecutado contra el proyecto enlazado.

### E2E CLIENT

Validar en entorno desplegado:

`registro/login → DELIVERY → LOCAL → producto/variante → carrito → dirección → checkout → ORS → tarifa → pedido → Mis pedidos`

Además:

- [ ] cancelación de pedido PENDING;
- [ ] LOCAL cerrado bloquea pedido;
- [ ] variante/precio se resuelve en backend;
- [ ] tarifa Día/Noche se resuelve en backend;
- [ ] error de ORS no genera pedido parcial ni total inconsistente.

### Aislamiento multi-tenant

- [ ] DELIVERY A no administra recursos privados de DELIVERY B.
- [ ] LOCAL_ADMIN A no administra LOCAL B.
- [ ] LOCAL compartido entre varios DELIVERY conserva catálogo global sin transferir propiedad.
- [ ] deep links de LOCAL/producto conservan el DELIVERY de origen.
- [ ] capabilities/limits efectivos respetan plan y excepciones MASTER.

### Monetización

- [ ] MASTER crea/edita plan.
- [ ] MASTER asigna plan a DELIVERY y LOCAL según scope.
- [ ] trial/vigencia se refleja en plan efectivo.
- [ ] límites bloquean la operación correspondiente al agotarse.
- [ ] excepción MASTER prevalece sobre plan sin modificar el catálogo comercial.
- [ ] ADMIN muestra consumo/límite coherente con backend.

### Carga masiva

- [ ] CSV válido crea/aplica únicamente filas autorizadas.
- [ ] XLSX válido produce el mismo resultado lógico.
- [ ] filas inválidas quedan identificadas sin ocultar errores.
- [ ] reintento no duplica operaciones ya aplicadas.
- [ ] scope DELIVERY y capabilities se respetan.

### Storage

- [ ] upload DELIVERY/LOCAL/PRODUCT autorizado.
- [ ] reemplazo conserva referencias correctas.
- [ ] eliminación autorizada funciona.
- [ ] usuario fuera de scope no puede escribir/eliminar.

### Código #79 — importación desde imagen

No marcar como operativo hasta verificar en el proyecto desplegado:

- [ ] migración `20260919153500_menu_image_import.sql` aplicada;
- [ ] Edge Function `analizar-menu` desplegada;
- [ ] secreto `OPENAI_API_KEY` configurado en Supabase;
- [ ] prueba real con 1–5 imágenes;
- [ ] preview editable y aplicación transaccional;
- [ ] LOCAL nuevo sin coordenadas permanece inactivo;
- [ ] importación a LOCAL existente no sobrescribe datos globales indebidamente.

## Criterio GO / NO-GO

**GO** únicamente cuando todos los checks automatizables estén verdes y las pruebas E2E/runtime que dependen del entorno desplegado estén verificadas. Una credencial externa ausente no debe resolverse debilitando seguridad ni colocando secretos en navegador/repositorio.

**NO-GO** si falla aislamiento, cálculo backend, RLS, checkout, monetización efectiva o integridad transaccional.

## Pendientes externos permitidos

`OPENAI_API_KEY` es un secreto de Supabase requerido solo para activar #79. No debe almacenarse en GitHub ni en frontend. Si falta, el resto del corte puede continuar, pero #79 permanece no operativo.

## Fuera de alcance

Courier, GPS, tracking y Logística Stage 2. No avanzar esos componentes en este corte.
