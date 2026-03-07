# Capture - Test page

Para probar localmente el módulo de captura junto con el backend:

1. Ejecuta el backend desde la carpeta `backend`:

```bash
cd backend
npm install
npm run dev
```

2. Abre `capture/test.html` en el navegador (puedes abrirlo desde un servidor estático o copiar su contenido a un servidor que apunte al backend en `http://localhost:3000`).

3. Haz clic en la página; los eventos se enviarán a `POST /ingest` y podrás verlos en `GET /events`.

Notas:
- Esto es una prueba mínima para desarrollo local. No usar en producción sin añadir autenticación, validación y medidas de privacidad.
