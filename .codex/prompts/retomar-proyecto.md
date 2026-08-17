---
description: Reanuda EventPass VE usando el handoff documentado y valida el contexto antes de cambiar código.
---

Retoma el trabajo de EventPass VE. Usa `$ARGUMENTS` como objetivo adicional si
está presente.

1. Lee primero `task.md`, `docs/ESPECIFICACION_VIGENTE.md`, `CLAUDE.md` y
   `git status --short`.
2. Resume el estado heredado: último hito, decisiones, bloqueos, validaciones y
   siguiente paso recomendado.
3. Si existe un objetivo explícito en `$ARGUMENTS`, comprueba que no contradiga
   la especificación ni las reglas de seguridad. Si falta contexto material,
   inspecciona el código y las migraciones antes de cambiar nada.
4. Revisa el backlog de Notion cuando esté disponible y alinea la tarea activa;
   no cierres tareas sin evidencia de verificación.
5. Propón o ejecuta el siguiente paso dentro del alcance solicitado. Antes de
   terminar una nueva jornada, usa `/cerrar-proyecto` para actualizar el handoff.
