# Esquema de evento (MVP)

Última actualización: 2026-03-08

Este documento define el esquema mínimo de evento que el módulo de captura enviará al backend en el MVP.

Objetivos:
- Mantener el payload pequeño y sin PII.
- Permitir análisis UX básico (clics, scrolls, errores, páginas).
- Facilitar batching y validación en backend.

## Campos mínimos (requeridos)
- `type` (string) — tipo de evento: `click`, `pageview`, `scroll`, `error`, `input`, etc.
- `ts` (integer) — timestamp del cliente en ms desde epoch.
- `pageUrl` (string) — URL completa donde ocurre el evento.

## Campos recomendados (opcionales)
- `eventId` (string, uuid) — id opcional generado por el cliente; si falta, el servidor generará uno.
- `tag` (string) — tagName del elemento destino (ej. `BUTTON`, `A`).
- `selector` (string) — selector ligero o atributo `data-*` que identifique el elemento (no incluir texto ni valores privados).
- `x`, `y` (number|null) — coordenadas del clic (si aplica).
- `viewport` (object) — `{ width, height }` del viewport en px.
- `referrer` (string) — URL referer.
- `userAgent` (string) — opcional; se recomienda truncar para evitar fingerprinting.
- `sessionId` / `anonId` (string) — identificadores anónimos (hashed), no PII.
- `meta` (object) — mapa libre para datos no sensibles.

## Buenas prácticas y restricciones (GDPR)
- No enviar nombres, emails, teléfonos, tokens, o strings que contengan PII.
- Si se requiere capturar datos potencialmente sensibles, debe existir consentimiento explícito y un motivo documentado en el PR.
- Almacenar identificadores anónimos (`anonId`) hashed con sal rotativa si es necesario.
- Mantener retención mínima por defecto (ej. 30 días para datos de sesión en desarrollo; definir política para producción).

## Ejemplo de payload
```json
{
  "type": "click",
  "ts": 1678280000000,
  "pageUrl": "https://example.com/pricing",
  "tag": "BUTTON",
  "selector": "[data-gtx=cta-plan]",
  "x": 120,
  "y": 450,
  "viewport": { "width": 1366, "height": 768 },
  "sessionId": "s_abc123",
  "anonId": "u_hash_abc",
  "meta": { "plan": "pro" }
}
```

## Criterios de aceptación (MVP)
- `POST /ingest` valida que el body contiene `type`, `ts` y `pageUrl` y responde `204`.
- El backend añade `receivedAt` y `eventId` si faltan.
- Integración: el snippet en `capture/test.html` debe enviar un evento de ejemplo que se vea en `GET /events`.

## Siguientes pasos técnicos
- `capture/src/snippet.ts` actualizado: ahora añade `sessionId`/`anonId`, batching, retry y persistencia cliente en IndexedDB.
- Añadir validación y normalización en backend (`backend/src/index.ts`) y persistencia mínima en servidor (pendiente).
- Tests: se añadió `tools/run_snippet_test.js` como prueba headless que valida encolado y reenvío; integrar en CI si se desea.
