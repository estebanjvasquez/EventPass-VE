# Handoff de trabajo — EventPass VE

**Última actualización:** 2026-08-17
**Estado general:** producto en producción; primera entrega de programa,
registro y planos para el evento del 15 de octubre de 2026 publicada.

## Último hito completado

- Se analizó la estructura y el código vigente.
- Se creó `docs/ESPECIFICACION_VIGENTE.md` como fuente versionada de la
  especificación actual.
- Se creó en Notion el proyecto, su especificación y un backlog inicial de
  revisión.
- Se añadieron los comandos `/cerrar-proyecto` y `/retomar-proyecto` para Codex.
- Se acordó que los seis frentes operativos (roles, permisos por evento,
  comercial, perfiles, check-in móvil e impresión) forman parte del alcance de
  octubre.
- Se aplaza la jerarquía interna de roles del SaaS; el alcance inmediato se
  centra en foro, exposición, stands, movilidad y operación onsite.
- La venta de stands/productos será externa; la plataforma solo gestionará su
  asignación y estado administrativo.
- El registro online se realizará a nivel de programa y perfilará a cada
  participante antes de asignar sus pases de foro/exposición.
- Se publicó el tipo de evento **Exposición** y el mapa básico de stands.
  Desde `/admin/eventos`, una exposición abre `/admin/stands/:eventId`, donde
  se genera una cuadrícula y se cambia cada stand entre disponible y reservado.
- Se corrigió el alias `/admin/programs` para redirigir a `/admin/programas`.
- Se añadió recuperación de contraseña mediante `/recuperar-clave`.

## Decisiones y reglas vigentes

- La fuente técnica es `CLAUDE.md`, el código y las migraciones de Supabase.
- No usar propuestas históricas como contrato de implementación sin verificarlas.
- RLS no se relaja para nuevos flujos: usar RPC validada o Worker.
- Las migraciones son idempotentes y se aplican manualmente en Supabase.

## Estado del repositorio

- Se aplicaron manualmente en Supabase las migraciones
  `20260817160000_event_programs_expo_and_access.sql` y
  `20260817170000_add_exhibition_event_type.sql`.
- Se añadieron las rutas `/admin/programas` y `/p/:programId/registro`.
- Se añadieron `/admin/stands/:eventId`, `/recuperar-clave` y el alias
  `/admin/programs`.
- Se publicó en `main` el commit `bd05c43` y Cloudflare Pages confirmó el
  despliegue. Producción sirve los bundles de Exposición y Stands.
- Validaciones realizadas: `npm run build`, `npm run lint` y `git diff --check`.
  Lint conserva tres advertencias existentes de `src/lib/tenant.tsx`.

## Pendientes priorizados

1. Completar el editor de exposición: pasillos, dimensiones, zonas y asignación
   de empresas/patrocinantes a stands.
2. Completar programa, pases y reglas de acceso por evento/día/sesión/zona.
3. Implementar operación de check-in móvil e impresión por pase y punto de
   acceso; decidir expresamente el alcance PWA/offline.
4. Definir campos obligatorios y perfiles públicos del formulario de registro.
5. Añadir pruebas automatizadas para registro, RLS, pagos y billing.
6. Unificar o marcar como heredada la documentación anterior en `docs/`.

## Próximo paso recomendado

Diseñar el editor visual completo de la exposición y el flujo de asignación de
stands a empresas, partiendo de la cuadrícula ya publicada.

## Verificación de reanudación

```powershell
git status --short
Get-Content task.md
Get-Content docs/ESPECIFICACION_VIGENTE.md
```
