# Prueba de tensión de creación y administración de eventos

Fecha: 25 de agosto de 2026  
Entorno: `https://eventosfacil.net` (producción)  
Método: Playwright headless con sesión administrativa autorizada. No se guardaron credenciales en el repositorio.

## Alcance ejecutado

Se recorrió el flujo como organizador para crear y administrar un evento de cada tipo:

| Tipo | Creación | Administrador | Módulos comprobados |
|---|---:|---:|---|
| Exposición | OK (POST 201) | OK | Plano, Expositores, Operación, Patrocinantes, Personal |
| Foro | OK (POST 201) | OK | Agenda, Asientos, Operación, Patrocinantes, Personal |
| Taller | OK (POST 201) | OK | Operación, Patrocinantes, Personal |
| Social | OK (POST 201) | OK | Operación, Patrocinantes, Personal |

Se crearon eventos de prueba con el prefijo `QA tensión ...`. Permanecen en la organización de pruebas para permitir una revisión manual y limpieza posterior.

## Flujo de exposición

1. Se creó `QA tensión Exposición 1787668785617`.
2. Se abrió el administrador del evento.
3. Se abrió `Plano`; el editor nuevo mostró biblioteca, canvas a escala, cotas, snap, blueprint y eliminación del plano.
4. Se creó un plano vacío y se verificó la carga del canvas sin errores de consola ni respuestas HTTP 4xx/5xx.
5. Se publicó el plano.
6. La vista pública `/expo/e65bc5d4-e8d0-4390-8f61-fe01c6bdba95/plano` cargó correctamente con branding del organizador, canvas nuevo, directorio de empresas y estado `0 elementos`.

Resultado: flujo base correcto. La asignación de una empresa a un stand no se ejecutó en esta pasada porque el plano de tensión quedó vacío; debe ser el siguiente caso de prueba con un expositor y un stand real.

## Flujo de foro

El administrador muestra Agenda, Asientos, Operación, Patrocinantes y Personal. Agenda expone acciones de nueva sesión y escenario; Asientos expone `Crear plano de foro`.

El evento no se publicó porque todavía no tenía escenario ni sesión, condición que la aplicación valida antes de publicar. Esto confirma el bloqueo de seguridad, pero falta comprobar la creación de un escenario, una sesión con ponente/moderador y un plano de asientos antes de repetir la publicación.

## Taller y social

Ambos administradores cargaron Operación, Patrocinantes y Personal sin errores de red. No tienen Agenda ni Asientos, coherente con su tipo actual. Debe hacerse una segunda pasada creando personal, patrocinante y configuración operativa para validar persistencia.

## Fallos y fricciones encontrados

### F1 — La lista de eventos tarda en reflejar el evento recién creado (alta)

El insert de cada tipo respondió `201`, el formulario se cerró, pero durante los primeros segundos la lista no contenía el evento recién creado. La prueba no pudo localizar inmediatamente su enlace de administración y marcó los cuatro flujos como fallidos, aunque los eventos aparecieron después de varias consultas/reintentos.

Impacto: el organizador puede interpretar que el evento no se creó o repetir la operación.  
Recomendación: después de guardar, devolver el registro creado (`select('id')`/`return=representation`) y actualizar la lista de forma optimista; añadir estado de “Evento creado, actualizando lista…” y reintento acotado si la lectura tarda.

### F2 — El selector “Nombre” no es suficientemente contextual (media)

En la página administrativa existen varios campos con etiqueta `Nombre` (evento, organización y subdominio). Para el usuario no siempre es evidente el contexto; en QA produjo un selector ambiguo.

Recomendación: usar etiquetas “Nombre del evento”, “Nombre de la organización” y “Subdominio”, además de agrupar el formulario con un título visible.

### F3 — Operación queda sin acción cuando no hay elementos (media)

`Operación del plano` solo muestra “Añade puertas, accesos o garitas desde el plano”, sin enlace o botón para abrir el Plano. El administrador debe descubrir cómo volver al editor.

Recomendación: incluir un CTA `Abrir plano` y un estado vacío con enlace directo al editor correspondiente.

### F4 — Asientos vacío requiere descubrir el siguiente paso (baja/media)

En un foro nuevo solo aparece `Crear plano de foro`. No se explica que después deben definirse filas, columnas, pasillos y reservas nominales.

Recomendación: añadir un flujo guiado breve y un enlace de regreso al administrador del evento.

## Errores técnicos observados

Durante la pasada completa no se capturaron errores de consola ni respuestas HTTP 4xx/5xx en autenticación, administradores, editor nuevo, publicación ni vista pública. La publicación pública mostró el branding y el directorio sin exponer datos fiscales o contactos.

## Próxima pasada recomendada

1. Exposición: crear stand, crear/seleccionar empresa, asignar stand, publicar y verificar nombre/color en directorio público.
2. Foro: crear escenario, sesión, ponente y moderador; crear plano de asientos y validar la publicación.
3. Todos los tipos: registrar personal, proveedor y patrocinante; editar y comprobar persistencia tras recargar.
4. Repetir creación con espera de red lenta para confirmar la corrección de F1.

## Segunda pasada de tensión

Se repitieron los flujos con esperas cortas, recarga inmediata y operaciones reales sobre los módulos.

### Exposición: crear y asignar un stand

- El botón `Stand` creó registros con `POST 201` en `venue_map_elements`.
- En la primera actualización el canvas siguió mostrando `0 elementos`; después de una recarga y nuevas lecturas apareció el stand persistido.
- La asignación desde Expositores también respondió `POST 201` para `booth_assignments` y `PATCH 204` para marcar el stand como asignado, sin errores HTTP.
- La selección del stand no se reflejó inmediatamente en el selector tras guardar/recargar en la misma ventana de prueba. Debe verificarse con una consulta posterior y con la vista pública antes de considerar cerrado el caso.

Esto amplía F1: hay una ventana de consistencia entre la escritura y las lecturas de eventos, elementos y asignaciones. El usuario puede pensar que el stand no se creó o que la asignación se perdió.

### Foro: escenario, sesión y validación de duplicados

- `Añadir escenario` creó `Auditorio QA` y el escenario apareció en la agenda.
- Al intentar crearlo de nuevo, la base devolvió `409 duplicate key ... event_stages_event_id_name_key`; la interfaz mostró el mensaje y mantuvo el modal abierto. La validación de duplicados funciona, aunque el mensaje es técnico para un organizador.
- Con el escenario creado, la ventana `Nueva actividad` muestra título, fechas, escenario, ponentes, moderadores, patrocinantes y opciones virtuales. La sesión no se confirmó en esta pasada porque el modal quedó afectado por el intento duplicado; requiere una ejecución aislada con un nombre de escenario distinto.

### Carga inicial y navegación

Con una espera de solo un segundo, la ruta de Agenda llegó a observarse vacía; esperando `networkidle` y unos segundos adicionales cargó correctamente. Esto indica una fricción de carga perceptible en rutas lazy: debe existir un estado de carga visible para no confundirlo con una pantalla rota.

### Operación y asientos sin configuración

- Operación muestra únicamente “Añade puertas, accesos o garitas desde el plano”, sin CTA hacia el Plano.
- Asientos muestra `Crear plano de foro`, pero no explica filas, columnas, pasillos ni reservas nominales.

Se mantienen F3 y F4 como pendientes de experiencia de usuario.

### Severidad actualizada

| ID | Severidad | Estado |
|---|---|---|
| F1 Consistencia posterior a guardar | Alta | Reproducida en eventos, elementos del plano y asignación de stands |
| F2 Etiquetas de nombre ambiguas | Media | Pendiente |
| F3 Operación sin CTA al plano | Media | Reproducida |
| F4 Asientos sin guía | Media | Reproducida |
| F5 Mensaje técnico al duplicar escenario | Baja/Media | Reproducida; debe traducirse a lenguaje de usuario |
| F6 Estado de carga insuficiente en Agenda | Media | Reproducida con carga corta; requiere indicador explícito |

No se detectaron errores de consola distintos de los 409 esperado por la prueba deliberada de duplicado, ni respuestas 4xx/5xx inesperadas en los flujos exitosos.

## Correcciones aplicadas

- El formulario de eventos ahora recibe el registro creado y lo incorpora inmediatamente a la lista; la sincronización remota se reintenta después de una breve espera para evitar que una lectura obsoleta lo oculte.
- El editor de exposición incorpora de inmediato el elemento recién creado y mantiene la asignación de empresa en pantalla mientras se confirma la lectura remota.
- Las etiquetas del formulario distinguen `Nombre del evento` de otros nombres.
- Operación incluye `Abrir plano para añadir elementos` y selecciona el editor de exposición o foro según el tipo de evento.
- Asientos incluye instrucciones de filas, columnas, reservas y pasillos, y su retorno ahora apunta al administrador del evento.
- La creación de escenarios usa el mensaje `Ya existe un escenario con ese nombre en este evento` para duplicados.

Validación local: `npm run build` y `npm run lint` completados. Lint mantiene únicamente dos advertencias preexistentes de dependencias de hooks (`PlanoPublico` y `PlanoComercialAdmin`).
