---
description: Cierra una jornada o hito, actualiza la documentación y deja el proyecto listo para retomar.
---

Ejecuta el cierre del trabajo actual de EventPass VE. Usa `$ARGUMENTS` como
contexto adicional si está presente.

1. Inspecciona `git status --short`, el diff y los archivos modificados. No
   descartes ni sobrescribas cambios ajenos.
2. Ejecuta las validaciones proporcionales a los cambios y reporta resultados.
3. Actualiza `docs/ESPECIFICACION_VIGENTE.md` si cambió comportamiento,
   arquitectura, seguridad, datos, despliegue o una decisión relevante.
4. Actualiza el proyecto y backlog de Notion cuando la integración esté
   disponible: refleja decisiones, estado y tareas siguientes. Si no está
   disponible, anota claramente esa limitación en `task.md`.
5. Reescribe `task.md` con: fecha, hito realizado, archivos/cambios, decisiones,
   validaciones, bloqueos, trabajo pendiente priorizado y el siguiente paso
   concreto. Nunca escribas secretos, tokens ni datos personales.
6. Entrega un resumen final breve con enlaces o rutas a los artefactos.
7. Para compactar el contexto de la sesión, termina pidiendo al usuario ejecutar
   `/compact` y proporciona un handoff autosuficiente. La compactación es una
   acción del cliente de Codex y no puede activarse automáticamente desde un
   prompt del repositorio.
