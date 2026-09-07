# Retorno seguro: entrega visual del 7 de septiembre de 2026

## Punto anterior verificado

- Código: `afbaeb0`.
- Etiqueta anotada y publicada en origin: `rollback/pre-visual-20260907`.
- Cloudflare Pages, proyecto `eventpass`, despliegue de producción: `e3b9fb0d-bb47-4bed-9d5a-add42d807834`.
- URL conservada: https://e3b9fb0d.eventpass-d7d.pages.dev/
- Antes de publicar: la URL conservada y https://eventosfacil.net/ respondían 200 y entregaban HTML idéntico.

Esta entrega solo cambia el frontend y documentación/pruebas. No cambia Worker, secretos, configuración de infraestructura ni base de datos. El retorno revierte la interfaz completa, no borra la actividad que los usuarios registren después del despliegue. No se creó ni se necesita un backup de datos para revertir este cambio de frontend.

## Recuperación inmediata

Commit visual a revertir: `55da1cea33c277c0e5a02cb41e299c576436c97b`. Si no existen cambios posteriores solapados, `git revert 55da1ce` revierte esta entrega sin borrar el historial; revisar y compilar antes de publicar el revert.

1. Comprobar que no hay una ejecución pendiente de `Deploy frontend` en GitHub Actions, para evitar que una nueva publicación sustituya el rollback.
2. Abrir [el despliegue anterior en Cloudflare](https://dash.cloudflare.com/cb77662770c0955288691715afa25690/pages/view/eventpass/e3b9fb0d-bb47-4bed-9d5a-add42d807834).
3. En Deployments / All deployments seleccionar ese despliegue y **Rollback to this deployment**. Confirmar.
4. Abrir la portada, una agenda y un plano público con recarga completa. Confirmar módulos JS/CSS con respuesta 200 y MIME correcto.
5. Antes del siguiente despliegue, revertir también el commit visual en Git mediante `git revert`, conservando el historial (no usar reset ni push forzado).

Referencia: [rollback oficial de Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/rollbacks/).

## Recuperación desde código si el artefacto de Pages deja de estar disponible

Crear un worktree separado desde la etiqueta, instalar dependencias con `npm ci` en su carpeta `frontend/`, configurar localmente las mismas variables públicas de producción y ejecutar `npm run build`. Tras comprobar TypeScript, desplegar ese `dist` en `eventpass`, rama `main`. No reutilizar un `dist` generado antes de una compilación fallida. No copiar secretos a Git.

El tag incluye el árbol completo del repositorio anterior y sus lockfiles. Mantener el despliegue de Pages anterior sin eliminarlo proporciona además el artefacto ya compilado, sin depender de una reconstrucción.

## Publicación confirmada

- Nuevo despliegue: `256dcaa4-559b-4b29-870c-547d33fc9b2e`, fuente `55da1ce`.
- URL: https://256dcaa4.eventpass-d7d.pages.dev/
- [GitHub Actions aprobado](https://github.com/estebanjvasquez/EventPass-VE/actions/runs/34132391155).
- Se comprobó que el HTML del dominio productivo coincide con el nuevo despliegue; el anterior continúa respondiendo 200.
- Smoke Chromium anónimo: portada nueva visible, plano del evento de la guía con canvas y directorio, módulos JS/CSS sin errores HTTP/MIME, sin excepciones JavaScript.
- Avisos detectados: blueprint del evento de la guía inaccesible (stands visibles), agenda de ese evento sin sesiones publicadas. Se conservan permisos y datos, sin intentar solventarlos mediante cambios de seguridad.
- No se realizó smoke autenticado de edición en esta publicación.
