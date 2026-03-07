# GhostUX — Proyecto (esqueleto)

Resumen rápido

Este repositorio contiene un scaffold mínimo para el proyecto GhostUX: esqueleto para `backend`, `analytics`, `dashboard` y `capture`, además de una configuración local con `docker-compose`.

Requisitos locales mínimos

- Node.js (LTS)
- Python 3.11+
- Docker / Docker Compose

Instalación rápida (PowerShell / WSL)

```bash
# 1. Clona o sitúate en el repo
cd "c:\Visuaal-remote\GhostUX (pers)"

# 2. Backend (Node + TS)
cd backend
npm install
cd ..

# 3. Analytics (Python)
cd analytics
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..

# 4. Dashboard (placeholder)
cd dashboard
npm install
cd ..

# 5. Capture (snippet build)
cd capture
npm install
cd ..

# 6. Levantar servicios de dependencia (Postgres, Redis)
docker-compose up -d
```

Estructura creada

- `backend/` — API en Node.js + TypeScript (Fastify). 
- `analytics/` — servicios Python (FastAPI) para análisis y modelos.
- `dashboard/` — app React/TypeScript (placeholder).
- `capture/` — snippet de captura en TypeScript para inyectar en webs.

Siguientes pasos sugeridos

- Revisar y personalizar `docker-compose.yml` para añadir ClickHouse o Kafka si se necesita.
- Configurar CI (GitHub Actions) y linters/formatters.
- Ejecutar los servicios y comenzar a desarrollar funcionalidades.

---
Archivo generado automáticamente por el asistente.
