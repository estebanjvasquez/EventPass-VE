# Tipos de eventos, configuración y aislamiento

Revisión del 16 de octubre de 2026. Esta entrega incluye cambios de frontend y una migración de base de datos que se publican conjuntamente.

## Hallazgos

1. La configuración de eventos y programas tenía rutas protegidas únicamente por sesión. Las políticas históricas permitían modificar eventos y organización a cualquier miembro, incluido `staff`. Algunas funciones privilegiadas también comprobaban membresía, sin exigir administración.
2. La creación solo distinguía foro, exposición, taller y social. No ofrecía boda, gala o graduación. El módulo de operación mostraba hogares y mesas en todos los eventos, aunque luego rechazaba parte de las acciones profesionales.
3. El selector de accesos combinados ofrecía otros eventos y sesiones de toda la organización. La asignación comprobaba organización, pero no un programa compartido.
4. El registro antiguo utilizaba una identidad por organización/correo: registrar a la misma persona en otro programa podía sobrescribir sus datos anteriores.
5. El acceso antiguo mediante pases podía aceptar un derecho por fecha sin comprobar que el evento siguiera perteneciendo al programa.

## Criterio organizacional

La organización es el propietario administrativo. Su industria no determina los tipos que puede organizar. Cada evento tiene formato, subtipo, finalidad y herramientas propias.

La planificación corporativa abarca congresos, exposiciones, capacitación, recepciones y recaudación: [guía de planificación corporativa de Cvent](https://www.cvent.com/en/blog/events/guide-corporate-event-planning). Los eventos benéficos también pueden necesitar patrocinantes, presupuestos y logística de invitados: [soluciones para organizaciones sin fines de lucro de Cvent](https://www.cvent.com/en/event-marketing-management/non-profit-solutions).

La separación de formato y finalidad siguiente es una decisión de diseño para este producto, basada en esas diferencias operativas y en los casos aportados por el usuario. Una gala benéfica no constituye una funcionalidad fiscal de donaciones.

| Formato | Subtipos | Herramientas particulares |
| --- | --- | --- |
| Foro | Foro, congreso/conferencia, presentación de producto, encuentro corporativo | Agenda, ponentes, sesiones, accesos y puestos cuando correspondan |
| Exposición | Exposición/feria | Plano, stands, expositores y paquetes |
| Taller | Taller/capacitación | Sesiones, reservas y precios de actividades |
| Social | Encuentro social, boda, fiesta/aniversario, graduación, gala/recepción | Grupos, acompañantes, RSVP y mesas activados inicialmente |

Finalidades independientes: comercial/profesional, celebración privada, benéfico/recaudación e institucional/académico. Por ejemplo, una gala social puede ser benéfica y una presentación corporativa también puede recaudar fondos.

Los grupos y mesas pueden habilitarse expresamente en un evento profesional —por ejemplo, una cena del laboratorio— sin convertirlo en boda ni mostrar subtipos matrimoniales. Presupuesto, proveedores, tareas, invitaciones y control de acceso son herramientas comunes, siempre filtradas por el evento.

## Accesos

| Perfil | Configuración | Operación |
| --- | --- | --- |
| Propietario / administrador de la organización | Organización, eventos, perfiles, programas y vínculos | Gestión del evento según contrato |
| Personal (`staff`) | Sin modificación de configuración | Registro, acreditación, impresión y check-in según los permisos operativos existentes |
| Distribuidor externo | Sin configuración | Sus asignaciones y códigos; nombres únicamente si el organizador los autorizó |
| Proveedor asignado | Sin configuración | Sus tareas asignadas |
| Superadmin | Conserva permisos globales | Mantiene la separación de navegación entre plataforma y organización |

La configuración general se presenta en `/admin/organizacion/configuracion`: identidad de respaldo, subdominio y medios de pago. La configuración específica continúa en cada evento. Las rutas administrativas exigen propietario/administrador; los disparadores de base de datos impiden modificaciones de personal incluso a través de funciones privilegiadas antiguas. Las políticas de lectura operativa preexistentes no se sustituyen por un nuevo modelo de visibilidad por empleado en esta entrega.

## Información y programas

- Compartir organización no concede acceso a otro evento ni copia participantes, hogares, mesas, presupuestos o tareas.
- Solo un administrador puede crear o cambiar los vínculos de un programa. Se comprueba que programa y eventos pertenecen a la misma organización y se registra el cambio.
- Las invitaciones combinadas solo pueden seleccionar componentes de un programa compartido. No se enlazan eventos automáticamente.
- La validación de acceso vuelve a comprobar el vínculo actual. Desvincular un componente deniega el ingreso combinado aunque la credencial ya exista. También impide emitir o canjear asignaciones que conserven un componente desvinculado; el administrador debe revocar los códigos disponibles y crear una asignación válida.
- Las sesiones ofrecidas pertenecen al propio evento o a sus componentes expresamente vinculados.
- Las identidades de registros se separan por programa. Los registros individuales de eventos ya utilizan su propia tabla y ámbito por evento.
- Las identidades históricas compartidas se copian por programa y se redirigen sus participaciones y pedidos conservando los identificadores de estos, sus credenciales y estados. El registro original del directorio se conserva. No se generan invitaciones ni consentimientos adicionales.
- Si un perfil histórico ya fue sobrescrito antes de esta corrección, la separación conserva los datos actualmente almacenados; no puede reconstruir versiones anteriores que no se guardaron.
- Compartir un programa habilita sus flujos configurados de registro/acceso. No fusiona hogares, presupuestos, tareas ni todos los datos de los eventos.

## Compatibilidad y límites

Se conserva el enum histórico de formatos y se guardan los detalles en `events.config`: `event_subtype`, `event_purpose` y `guest_management`. Un social antiguo conserva la denominación genérica; no se convierte automáticamente en boda. Las bodas nuevas comienzan con registro por invitación. Los lanzamientos y encuentros corporativos no exigen crear escenarios y sesiones únicamente para publicarlos desde la lista de eventos.

No se cambia el formato de un evento que ya tiene invitaciones o participantes. No se oculta el módulo de grupos si contiene hogares que todavía deben administrarse. La selección de subtipo es validada también por la base de datos.

La finalidad benéfica no añade pasarela de donaciones, comprobantes fiscales, subastas, gestión de regalos o un diseñador visual de mesas. Esas funciones requieren desarrollo específico. Los patrocinantes siguen siendo una herramienta disponible para acuerdos, especialmente útil en galas y recaudaciones; no se importan desde otros eventos automáticamente.

## Verificación y publicación

- Pruebas PostgreSQL temporal: permisos de propietario/personal, bloqueo mediante función privilegiada, perfiles válidos, grupos, invitaciones, capacidades, sesiones, aislamiento de identidades históricas y desvinculación de programas.
- Navegador Chrome: creación de boda, opciones profesionales separadas, canje, RSVP, mesas, presupuesto y tareas de proveedor.
- Validación de la migración y ambos registros reales de programas sobre el esquema conectado, con organizaciones ficticias dentro de una transacción terminada en `ROLLBACK`. Incluye la regresión real de invitaciones y operación; no envía correos ni crea usuarios de autenticación.
- Compilación y lint del frontend; regresión de navegación administrativa.

Migración: `infra/supabase/migrations/20261016112244_event_profiles_configuration_isolation.sql`.
Prueba real reversible adicional: `scripts/verify-event-profiles-rollback.sql`.

Antes de publicar, aplicar la migración con su historial y publicar el frontend en conjunto. Validar después con una cuenta administradora y otra de personal, una boda y un foro independientes, y finalmente un programa que vincule explícitamente dos componentes. La verificación posterior debe confirmar también el historial de migraciones, las funciones de aislamiento y los módulos del frontend publicado.
