# Handoff de trabajo — EventPass VE

**Última actualización:** 2026-08-17
**Estado general:** producto en producción; arquitectura objetivo para el evento del 15 de octubre de 2026 definida y pendiente de aprobación.

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

## Decisiones y reglas vigentes

- La fuente técnica es `CLAUDE.md`, el código y las migraciones de Supabase.
- No usar propuestas históricas como contrato de implementación sin verificarlas.
- RLS no se relaja para nuevos flujos: usar RPC validada o Worker.
- Las migraciones son idempotentes y se aplican manualmente en Supabase.

## Estado del repositorio

- Se añadió la migración `20260817160000_event_programs_expo_and_access.sql`.
- Se añadieron las rutas `/admin/programas` y `/p/:programId/registro`.
- El build de frontend pasó con los nuevos componentes.
- La migración aún debe aplicarse manualmente en el SQL Editor de Supabase antes
  de probar los flujos de programa y registro.

## Pendientes priorizados

1. Revisar y aprobar `docs/ESPECIFICACION_VIGENTE.md`.
2. Decidir el alcance de PWA/offline para check-in.
3. Definir plan de pruebas automatizadas para registro, pagos, RLS y billing.
4. Unificar o marcar como heredada la documentación anterior en `docs/`.
5. Aprobar `docs/ARQUITECTURA_SAAS_OBJETIVO.md` y convertir Fase 1 en
   migraciones y tareas técnicas.
6. Modelar `event_program` para vincular foro y exposición, con pases por
   evento/día/sesión/zona y un mapa de stands.
7. Definir los campos obligatorios y perfiles públicos del formulario de
   registro online.
8. Completar el editor visual de planos/stands y la operación de check-in por
   pase, zona y punto de acceso.

## Próximo paso recomendado

Definir los campos de registro y los perfiles públicos. Luego implementar la
base de programas, participantes, pases y mapas.

## Verificación de reanudación

```powershell
git status --short
Get-Content task.md
Get-Content docs/ESPECIFICACION_VIGENTE.md
```
