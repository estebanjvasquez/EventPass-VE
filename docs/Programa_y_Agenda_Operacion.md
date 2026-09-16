# Programa y agenda

## Administrar

En **Programas → Configuración y web → Programa y agenda**:

- Añadir bloques propios (apertura, acreditación, networking) o elegir un evento relacionado.
- Para una Expo multidía, conservar el rango general o duplicar bloques y configurar el horario de apertura/cierre de cada día. Un rango general no significa apertura continua.
- Los campos de inicio/final usan la zona horaria seleccionada; se persisten como instantes UTC.
- Elegir solo resumen, sesiones o ambos por bloque. La presentación global permite resumen o detalle.
- Guardar borrador no cambia lo publicado. Vista previa muestra el borrador. Publicar lo hace visible; retirar publicación oculta la agenda sin cerrar el registro ni eliminar datos.
- Las sesiones se editan en el evento de origen. No se duplican en el programa y se actualizan en la siguiente carga pública. Una pantalla de sala explícitamente despublicada no aporta sesiones a la agenda agregada.

En **Web → Opciones conectadas** se selecciona mostrar/ocultar, alcance programa completo/actividad concreta, evento relacionado y título del enlace. Publicar la web es separado de publicar la agenda.

## Rutas

| Ruta | Uso |
| --- | --- |
| `/p/:programId/agenda` | Programa general publicado |
| `/e/:eventId/programa` | Programa asignado explícitamente al sitio, o agenda propia si no hay asignación |
| `/e/:eventId/programa?solo=evento` | Agenda de esa actividad sin heredar el programa |
| `/e/:eventId/agenda` | Pantalla de sala, conserva enlaces existentes |

La selección del evento que administra la web no modifica las actividades de la agenda.

## Publicación inicial de Expo Energía

La migración de conexión inicial reutiliza únicamente eventos ya públicos del único programa que tiene explícitamente seleccionada esta Expo como administradora de web. No modifica fechas, sesiones, inscripciones ni el estado borrador/publicado del registro del programa. No crea workshops ni horarios diarios ficticios. Si existe una agenda o una elección explícita del alcance, las conserva.

Los datos actuales del foro, la Expo y algunas sesiones tienen fechas distintas; deben revisarse editorialmente antes de anunciar un calendario definitivo.

## Seguridad y verificación

`program_agendas` tiene RLS y no concede acceso a visitantes. El editor lee solo agendas de su organización (o de superadministración). Las escrituras pasan por `save_program_agenda`, que comprueba sesión, organización, vínculos y configuración. `get_public_program_agenda` devuelve exclusivamente la configuración publicada y actividades públicas todavía vinculadas a la misma organización.

Comprobaciones:

```powershell
node --experimental-strip-types scripts/test-program-agenda.mjs
node scripts/smoke-program-agenda.mjs
```

El segundo comando usa la configuración pública de producción sin imprimir claves. Comprueba lecturas públicas y rechazos de escritura/acceso a borradores anónimos.

## Recuperación

Para retirar el contenido sin revertir software, usar **Retirar publicación** en el editor; el borrador permanece. Para revertir frontend se puede recuperar el despliegue Pages anterior. Las migraciones son aditivas; no eliminar la tabla para un rollback de frontend.
