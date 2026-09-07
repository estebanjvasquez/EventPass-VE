# Retorno seguro: entrega visual del 7 de septiembre de 2026

## Punto anterior verificado

- Código: `afbaeb0`.
- Etiqueta anotada y publicada en origin: `rollback/pre-visual-20260907`.
- Cloudflare Pages, proyecto `eventpass`, despliegue de producción: `e3b9fb0d-bb47-4bed-9d5a-add42d807834`.
- URL conservada: https://e3b9fb0d.eventpass-d7d.pages.dev/
- Antes de publicar: la URL conservada y https://eventosfacil.net/ respondían 200 y entregaban HTML idéntico.

Esta entrega solo cambia el frontend y documentación/pruebas. No cambia Worker, secretos, configuración de infraestructura ni base de datos. El retorno revierte la interfaz completa, no borra la actividad que los usuarios registren después del despliegue. No se creó ni se necesita un backup de datos para revertir este cambio de frontend.

## Recuperación inmediata

1. Comprobar que no hay una ejecución pendiente de `Deploy frontend` en GitHub Actions, para evitar que una nueva publicación sustituya el rollback.
2. Abrir [el despliegue anterior en Cloudflare](https://dash.cloudflare.com/cb77662770c0955288691715afa25690/pages/view/eventpass/e3b9fb0d-bb47-4bed-9d5a-add42d807834).
3. En Deployments / All deployments seleccionar ese despliegue y **Rollback to this deployment**. Confirmar.
4. Abrir la portada, una agenda y un plano público con recarga completa. Confirmar módulos JS/CSS con respuesta 200 y MIME correcto.
5. Antes del siguiente despliegue, revertir también el commit visual en Git mediante `git revert`, conservando el historial (no usar reset ni push forzado).

Referencia: [rollback oficial de Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/rollbacks/).

## Recuperación desde código si el artefacto de Pages deja de estar disponible

Crear un worktree separado desde la etiqueta, instalar dependencias con `npm ci` en su carpeta `frontend/`, configurar localmente las mismas variables públicas de producción y ejecutar `npm run build`. Tras comprobar TypeScript, desplegar ese `dist` en `eventpass`, rama `main`. No reutilizar un `dist` generado antes de una compilación fallida. No copiar secretos a Git.

El tag incluye el árbol completo del repositorio anterior y sus lockfiles. Mantener el despliegue de Pages anterior sin eliminarlo proporciona además el artefacto ya compilado, sin depender de una reconstrucción.
