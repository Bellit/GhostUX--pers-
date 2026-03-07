# GDPR / Privacy Checklist (development)

Este checklist es una guía mínima que debe acompañar a cambios que impliquen recolección, almacenamiento o tratamiento de datos de usuarios.

- **Propósito**: documentar claramente para qué se recogen los datos y limitar la recolección al mínimo necesario.
- **Consentimiento**: comprobar requisitos de consentimiento (banners, gestor de consentimiento) antes de capturar datos identificables.
- **Minimización**: evitar PII en evento (no capturar nombres, emails, tokens, etc.). Anonimizar/hashear cuando sea necesario.
- **Retención**: definir periodos de retención por tipo de dato y exponerlos en la política de privacidad.
- **En tránsito**: siempre cifrar transporte (TLS). No enviar a endpoints HTTP no seguros.
- **En reposo**: cifrar datos sensibles o utilizar tokenización/hashed identifiers.
- **Acceso y roles**: limitar acceso a datos a personas/servicios autorizados; auditar accesos.
- **Anonimización**: aplicar técnicas para evitar re-identificación al analizar datos (agregación, sampling, truncation).
- **Desarrollo vs Producción**: usar datos sintéticos o anonimización en entornos de desarrollo.
- **Notificaciones y borrado**: exponer mecanismos para cumplir solicitudes de borrado/rectificación.
- **Logs y debugging**: evitar imprimir PII en logs; sanitizar antes de enviar a herramientas externas.
- **Evaluación de impacto**: para cambios significativos, realizar un DPIA (Data Protection Impact Assessment).
- **Documentación**: registrar propósito, flujo de datos, terceros y decisiones de privacidad en la documentación del PR.

> Nota: este documento es una lista mínima. Antes de producción, coordinar con el responsable legal/privacidad del proyecto.
