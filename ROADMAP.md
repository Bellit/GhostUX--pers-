# Roadmap y checklist - GhostUX

Última actualización: 2026-03-08

Este documento centraliza lo que se ha hecho y los pasos siguientes para el proyecto GhostUX. Está pensado para mantenerse en el repo: marca las casillas en este archivo cuando completes tareas y pide al agente que sincronice el estado con la lista de tareas del repositorio.

## Estado actual (hecho)
- [x] Añadir endpoint de ingest y endpoint `/events` para pruebas (backend)
- [x] Servidor plano Node para entornos con Node antiguo (`backend/run-server-plain.js`)
- [x] Página de prueba `capture/test.html` y servidor estático `capture/static-server.js`
- [x] OpenAPI mínimo (`backend/openapi.yaml`)
- [x] Test de integración `backend/test/integration.js` (pasó localmente)
- [x] Workflow CI básico `.github/workflows/ci.yml` (ejecuta server plano + test)
- [x] Documentación mínima de privacidad `docs/gdpr-checklist.md`
- [x] Plantilla de PR `.github/PULL_REQUEST_TEMPLATE.md`

## Hoja de ruta inmediata (MVP)
Objetivo: tener un flujo reproducible captura -> ingest -> persistencia mínima -> visualización.

- [ ] 1) Definir el contrato final del MVP (eventos mínimos, campos obligatorios, retención, GDPR) — responsable: equipo
 - [x] 2) Implementar batching + retry en el snippet de captura (`capture/src/snippet.ts`) — reducir requests y mejorar fiabilidad
 - [ ] 3) Añadir persistencia mínima de eventos en backend (archivo append-only o SQLite) para pruebas y reinicios
 - [x] 4) Añadir endpoint y UI mínima `/dashboard` que muestre lista/agregados de eventos
 - [ ] 5) Añadir tests E2E que cubran flujo completo (snippet -> ingest -> persistencia -> dashboard) — en progreso (script headless disponible en `tools/run_snippet_test.js`)

## Mediano plazo
- [ ] Migrar backend TypeScript para funcionar con Node>=16 y preparar build/deploy
- [ ] Sustituir almacenamiento en memoria por Redis / Kafka / base de datos según necesidades de escalado
- [ ] Añadir control de consentimientos y anonimización configurable (GDPR)
- [ ] Instrumentar métricas y alertas (rate, error rate, latencia)

## Largo plazo
- [ ] Motor de optimización (generación de variantes UI y aplicación automática)
- [ ] Integraciones con CMS (WordPress, Shopify, Webflow)
- [ ] Panel de control SaaS multi-tenant y modelo de facturación

## Cómo usar este archivo
- Para marcar una tarea como completada: cambia `[ ]` por `[x]` y registra en el PR o pide al agente que sincronice la lista de tareas.
- Para sincronizar la lista de tareas del agente con este archivo, ejecuta: pedir al agente "sincroniza la lista de tareas con ROADMAP.md".

## Notas y decisiones recientes
- Se añadió un servidor plano para evitar dependencias de Node modernas en máquinas de desarrollo.
- Se implementó `batching + retry` en el snippet de captura y persistencia cliente en IndexedDB (`capture/src/snippet.ts` + `capture/snippet.js`).
- Se añadió un script de prueba headless `tools/run_snippet_test.js` que valida encolado en IndexedDB y reenvío tras recuperación del backend.
- Los endpoints actuales son experimentales y sólo deben usarse en entorno de desarrollo hasta añadir autenticación y validación.

Branch con cambios: `feature/batching-retry-idb` (subida a origin). PR sugerida: https://github.com/Bellit/GhostUX--pers-/pull/new/feature/batching-retry-idb
