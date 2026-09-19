# HTPWEB — PLAN MAESTRO ACTUALIZADO / CORTE CÓDIGO #80

**Fecha:** 2026-09-19  
**Fuente de verdad:** Supabase  
**Arquitectura:** multi-DELIVERY, multi-LOCAL y multicliente  
**Último bloque funcional fusionado antes de este corte:** Código #79  
**Objetivo de este corte:** verificar el estado real, registrar pendientes y endurecer la verificación automática antes de continuar hacia monetización.

---

## 1. Reglas arquitectónicas vigentes

1. MASTER gobierna infraestructura, seguridad, catálogo global y configuración transversal.
2. Cada DELIVERY opera aislado dentro de la misma infraestructura.
3. Un LOCAL es global y puede relacionarse con múltiples DELIVERY.
4. `created_by` no representa propiedad.
5. La relación LOCAL ↔ DELIVERY es independiente de cobertura geográfica.
6. Supabase es la fuente de verdad.
7. El navegador no decide permisos, precios finales, distancia, tarifa, subtotal ni total.
8. Reglas críticas deben quedar respaldadas por RLS, RPC, triggers, Edge Functions o transacciones.
9. ADMIN es único y role-aware.
10. Deep links conservan el contexto del DELIVERY.
11. No se reconstruyen componentes existentes sin inspeccionarlos.
12. Logística completa (courier/GPS/tracking) sigue siendo Stage 2.

---

## 2. Estado actual por macroárea

| Área | Estado en código | Observación |
|---|---|---|
| Auth / Profiles / Roles | ✅ | CLIENT por defecto; roles administrativos controlados |
| RLS / permisos / capabilities / limits | ✅ base endurecida | Mantener auditoría con cada tabla/RPC nueva |
| DELIVERY / CITY / ZONE | ✅ | Cobertura y aislamiento implementados |
| LOCAL global ↔ DELIVERY | ✅ | Many-to-many |
| LOCAL_ADMIN / DELIVERY_ADMIN | ✅ | Autogestión dentro de scope |
| Categorías / productos / variantes | ✅ | CRUD ADMIN |
| Horarios / disponibilidad | ✅ | Validación pública y en crear-pedido |
| Tarifas | ✅ | FIXED/DISTANCE + precio por km Día/Noche |
| CLIENT / direcciones | ✅ | Direcciones guardadas y default |
| Carrito / checkout / ORS / pedido | ✅ código | Falta E2E real final contra entorno desplegado |
| Mis pedidos CLIENT | ✅ | Historial, detalle y cancelación PENDING |
| Compartir LOCAL / producto | ✅ | Deep link mantiene DELIVERY |
| Storage público | ✅ | DELIVERY/LOCAL/PRODUCT |
| Publicidad backend | ✅ | Código #60 |
| Publicidad ADMIN | ✅ | Código #78 |
| Publicidad pública rotativa | ✅ | Código #77, 5 segundos |
| Analytics backend | ✅ base | Falta instrumentación y dashboard útil |
| Carga masiva tradicional | 🟡 | Infraestructura de jobs lista; CSV/XLSX aún sin procesador |
| Importar menú desde imagen | ✅ código / 🟡 despliegue | Código #79; requiere migración + Edge Function + OPENAI_API_KEY |
| Monetización | ⏳ | Próxima fase después de Analytics/importaciones |
| Logística completa | ⏳ Stage 2 | No avanzar todavía |
| Producción | 🟡 | Requiere E2E, despliegue #79 y auditoría final |

---

## 3. Códigos #65–#79 confirmados en main

- #65 — solicitudes de LOCAL guiadas para DELIVERY.
- #66 — autogestión DELIVERY_ADMIN.
- #67 — autogestión LOCAL_ADMIN.
- #68 — gestión MASTER de usuarios y accesos.
- #69 — tarifas de entrega.
- #69B — tarifa por km Día/Noche.
- #70 — cobertura geográfica por zonas.
- #71 — variantes + horario semanal.
- #72 — catálogo completo categorías/productos.
- #73 — disponibilidad real del LOCAL en checkout.
- #74 — disponibilidad pública de LOCAL.
- #74B — compartir LOCAL/productos conservando DELIVERY.
- #75 — direcciones guardadas del CLIENT.
- #75B — corrección del estado de direcciones en checkout.
- #76 — Mis pedidos del CLIENT.
- #77 — publicidad rotativa persistente en navegación pública.
- #78 — gestión ADMIN de publicidad con scopes y Storage.
- #79 — importación MASTER de LOCAL/menú desde 1–5 imágenes, preview editable y aplicación transaccional.

---

## 4. Código #79 — condición de activación

El código está fusionado, pero la función no debe considerarse operativa en producción hasta completar:

1. aplicar la migración `20260919153500_menu_image_import.sql`;
2. desplegar la Edge Function `analizar-menu`;
3. configurar `OPENAI_API_KEY` como secreto de Supabase;
4. ejecutar una prueba real con una imagen de menú;
5. revisar preview y confirmar importación;
6. comprobar que el LOCAL nuevo queda inactivo si no tiene coordenadas;
7. comprobar importación sobre LOCAL existente sin sobrescribir datos globales.

La API key nunca debe estar en el navegador ni en GitHub.

---

## 5. Código #80 — auditoría y CI

Este corte incorpora una mejora de verificación:

- `supabase-check.yml` se ejecutará también en PR que modifiquen migraciones, Edge Functions o `supabase/config.toml`;
- ejecutará `deno check` sobre las Edge Functions;
- enlazará el proyecto con las credenciales protegidas existentes;
- ejecutará `supabase db push --dry-run`;
- PR de forks no recibe estas comprobaciones con secretos.

Objetivo: no volver a fusionar una migración o Edge Function sin una validación automática cuando el cambio se haga desde una rama del mismo repositorio.

---

## 6. Pendientes reales antes de monetización

### Analytics
- instrumentar impresiones/clicks de publicidad;
- instrumentar navegación y eventos comerciales relevantes desde backend/Edge cuando corresponda;
- transformar el panel actual de JSON crudo en dashboard MASTER/DELIVERY/LOCAL;
- no exponer escritura directa de `analytics_events` al navegador.

### Carga masiva tradicional
- procesador CSV;
- procesador XLSX;
- validación fila por fila;
- errores descargables/consultables;
- reintentos seguros;
- respetar scope DELIVERY y capacidades.

### Importación de menú
- desplegar #79;
- configurar secreto;
- E2E con menú real;
- después evaluar mejoras de detección de duplicados/scoring.

### Producción
- E2E CLIENT completo:
  `registro/login → DELIVERY → LOCAL → producto/variante → carrito → dirección → checkout → ORS → tarifa → pedido → Mis pedidos`;
- prueba LOCAL compartido por varios DELIVERY;
- prueba de aislamiento DELIVERY A/B y LOCAL A/B sobre el frontend actual;
- prueba Storage upload/reemplazo/eliminación;
- rendimiento y errores de red.

---

## 7. Secuencia aprobada después de #80

La continuación técnica propuesta queda fijada así:

- **#81 — Analytics instrumentado:** impresiones/clicks de publicidad y eventos comerciales seguros.
- **#82 — Dashboards:** MASTER, DELIVERY_ADMIN y LOCAL_ADMIN con métricas útiles.
- **#83 — Carga masiva tradicional:** procesador CSV/XLSX y errores.
- **#84 — Monetización backend:** planes, catálogo de prestaciones y asignación.
- **#85 — Enforcement de planes:** capabilities + limits derivados del plan con excepciones MASTER.
- **#86 — Monetización ADMIN:** gestión de planes/asignaciones y visualización del consumo/límites.
- **#87 — Corte preproducción:** E2E, seguridad, despliegues y lista de salida.

Logística completa sigue fuera de esta secuencia y permanece en Stage 2.

---

## 8. Criterio de avance

Para cada código:

`inspeccionar existente → diseñar sobre arquitectura actual → implementar → tests → CI → corregir → merge → siguiente bloque`

No crear frontend paralelo, no duplicar backend existente y no debilitar RLS para facilitar interfaces.
