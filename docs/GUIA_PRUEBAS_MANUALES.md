# Guía de pruebas manuales — EventPass VE

**Versión:** 2026-08-28  
**Objetivo:** validar de punta a punta el sistema antes de un evento real.  
**Ámbito:** producción (`https://eventosfacil.net`) y un tenant de QA; no usar previews de Pages para pruebas autenticadas con datos reales.

## 1. Preparación y reglas

- Usar cuentas de QA, nunca credenciales ni datos personales reales en este documento o en el repositorio.
- Crear todos los datos temporales con el prefijo `QA-AAAA-MM-DD-`. No borrar eventos ni organizaciones reales.
- Preparar: un admin/owner de QA, un operador invitado, un usuario de portal de expositor y dos correos de participante que puedan recibir mensajes.
- Tener un teléfono con cámara, un segundo dispositivo o navegador, una impresora de prueba y un PDF menor de 10 MB.
- Antes de empezar, anotar URL, navegador, dispositivo, hora, usuario y resultado de cada caso. Adjuntar captura, consola y respuesta HTTP solo cuando falle.
- Las migraciones de `infra/supabase/migrations/` se aplican manualmente. Confirmar que están aplicadas antes de probar el módulo que las requiere; un despliegue no las sustituye.

### Datos mínimos

| Dato | Valor sugerido |
| --- | --- |
| Organización | `QA Operaciones` |
| Programa | `QA Programa Integral` |
| Foro | `QA Foro Integral` |
| Exposición | `QA Expo Integral` |
| Participante | `QA Participante Uno` |
| Empresa expositora | `QA Expositor Uno` |
| Empresa patrocinante | `QA Patrocinante Uno` |

### Resultado por caso

Marcar **Pasa**, **Falla** o **No aplica**, e indicar el ID/URL creado. Un fallo es bloqueante si permite acceso entre organizaciones, cobra/autoriza incorrectamente, pierde datos, impide registro o impide la operación de acceso el día del evento.

## 2. Acceso, cuentas y tenancy

| ID | Acción | Resultado esperado |
| --- | --- | --- |
| ACC-01 | Abrir `/` desde dominio raíz y desde el subdominio del tenant QA. | Carga la marca y solo el contenido público del tenant correspondiente. |
| ACC-02 | Crear cuenta en `/crear-cuenta`, confirmar el correo y abrir `/bienvenida`. | La cuenta queda confirmada y el alta de organización continúa sin duplicarla. |
| ACC-03 | Recuperar contraseña en `/recuperar-clave` y completar `/definir-clave`. | Llega un enlace válido y la nueva clave permite iniciar sesión. |
| ACC-04 | Iniciar y cerrar sesión en `/admin/login`. | Redirección correcta; una ruta `/admin/*` sin sesión vuelve al acceso. |
| ACC-05 | Con un admin de tenant A intentar abrir por URL directa un evento del tenant B. | No se muestran ni modifican datos del tenant B. **Bloqueante** si ocurre. |
| ACC-06 | Con superadmin entrar a `/superadmin`, gestionar temporalmente un cliente y salir de esa gestión. | La organización activa cambia de forma explícita y se restaura al salir. |

## 3. Plataforma, suscripción y aprovisionamiento

| ID | Acción | Resultado esperado |
| --- | --- | --- |
| PLT-01 | En `/superadmin`, crear/editar un cliente de QA y validar slug. | No acepta slug inválido o repetido; la organización queda aislada. |
| PLT-02 | Solicitar plan y cargar comprobante en `/admin/suscripcion`; aprobar/rechazar desde superadmin. | Estados, auditoría y límites se actualizan; no se aprueba dos veces. |
| PLT-03 | Crear evento hasta el límite del plan y probar uno adicional. | El límite se impone por base de datos; no solo por la interfaz. |
| PLT-04 | Aprovisionar o reintentar subdominio desde la administración autorizada. | Estado visible; cuando quede activo el dominio responde con el tenant correcto. |

## 4. Configuración del organizador

| ID | Acción | Resultado esperado |
| --- | --- | --- |
| ORG-01 | Abrir `/admin`, revisar indicadores y navegar a cada módulo. | No hay errores de carga, rutas rotas ni datos de otro tenant. |
| ORG-02 | En `/admin/eventos`, crear foro en borrador, editarlo, guardar y recargar. | Los datos persisten y los botones se identifican claramente. |
| ORG-03 | Crear exposición y abrir sus accesos a Expositores, plano, operación y publicación. | Cada enlace usa el evento correcto. |
| ORG-04 | Configurar medios de pago y publicar solo cuando el formulario esté completo. | La interfaz explica requisitos y el evento público refleja únicamente datos publicados. |
| ORG-05 | Cerrar/archivar un evento de QA e intentar un nuevo registro. | No permite registros incompatibles con el estado y conserva trazabilidad. |

## 5. Programa, agenda, sesiones y asientos

| ID | Acción | Resultado esperado |
| --- | --- | --- |
| PRG-01 | En `/admin/programas`, crear programa y vincular foro + exposición. | Ambos componentes se relacionan al mismo programa sin duplicar personas. |
| PRG-02 | En `/admin/agenda/:eventId`, crear escenario, sesión, charla, taller y receso. | El modal recibe foco, guarda y los elementos reaparecen al recargar. |
| PRG-03 | Asignar moderador, ponente y varios patrocinantes a una actividad. | Cada selector muestra solo perfiles válidos y la agenda pública los refleja si procede. |
| PRG-04 | En `/admin/asientos/:eventId`, crear plano, redimensionar y reservar asientos. | Capacidad, estados y selección no producen solapamientos ni reservas dobles. |
| PRG-05 | Sin plano previo, elegir **Foro 120**, crear la propuesta IA y revisar antes de aplicar. | Muestra exactamente 120 sillas, escenario, pasillo central, pasillos frontal/posterior y dos accesos laterales; no hay solapamientos. |
| PRG-06 | Aplicar la propuesta IA, recargar y mover una silla libre. Luego eliminar un pasillo. | El plano persiste y sigue editable; al eliminar el pasillo, las posiciones posteriores se reajustan sin perder sillas. |
| PRG-07 | Probar capacidades 1, 80, 180 y 5.000, variando pasillos y accesos. | Cada propuesta informa la capacidad exacta y siempre queda dentro de la cuadrícula. |
| PRG-08 | Intentar reemplazar mediante IA un plano con una silla reservada o confirmada. | El sistema lo bloquea y conserva intacto el plano existente. |
| PRG-05 | Abrir `/e/:eventId/agenda` sin sesión. | Solo se expone agenda publicada y el orden/horas son correctos. |

## 6. Registro, pago y credencial

| ID | Acción | Resultado esperado |
| --- | --- | --- |
| REG-01 | Registrarse en `/e/:eventId` con un evento publicado. | Validaciones, cupo y registro se crean correctamente. |
| REG-02 | Registrarse en `/p/:programId/registro` para foro y exposición. | Se reutiliza la persona y se generan participaciones/pases correctos. |
| REG-03 | Intentar dos reservas simultáneas del último asiento. | Solo una se confirma; la otra recibe un resultado controlado. **Bloqueante** si se sobrevende. |
| REG-04 | Abrir `/comprobante/:token`, cargar archivo permitido y uno no permitido. | Acepta únicamente tipo/tamaño configurados, guarda el comprobante y cambia a pendiente. |
| REG-05 | Aprobar y rechazar comprobantes como admin. | Estado, aviso y credencial coinciden; no se procesa un token ajeno. |
| REG-06 | Abrir `/credencial/:token`, revisar QR y datos; probar token inválido. | Credencial válida solo tras confirmación; token inválido no filtra información. |
| REG-08 | Registrar en un evento gratuito y revisar HTML/texto plano del correo. | Confirma registro y credencial; no contiene “pago”, “comprobante” ni “pago verificado”. |
| REG-09 | Registrar en un evento con pago y revisar el primer correo. | Sólo muestra medios globales o del mismo evento, fecha/sede configuradas y enlace al comprobante. |
| REG-10 | Aprobar el pago y revisar el segundo correo. | Dice “Pago confirmado”, abre la credencial correcta y conserva branding del organizador. |
| REG-11 | Reenviar una notificación desde el participante y desde admin. | No duplica el registro; `email_log` incrementa intento y conserva tipo/estado correctos. |

## 7. Acreditación, check-in y operación onsite

| ID | Acción | Resultado esperado |
| --- | --- | --- |
| OPS-01 | En `/admin/equipo-operativo`, invitar operador y asignar evento/punto/permisos. | La invitación crea usuario o reutiliza Auth y solo habilita el alcance otorgado. |
| OPS-02 | Configurar puntos en `/admin/puntos-acceso`. | Punto, zona y evento quedan identificables y disponibles para operación. |
| OPS-03 | En `/admin/acreditacion`, buscar participante e imprimir por primera vez. | Se abre impresión tras guardar auditoría `initial`. |
| OPS-04 | Reimprimir y escribir motivo. | No permite reimpresión sin motivo y registra `reprint`. |
| OPS-05 | En `/admin/checkin`, escanear QR válido y usar ingreso manual. | Ambos caminos son visibles; registra resultado, operador, punto y hora. |
| OPS-06 | Repetir QR, usar QR de otro evento/zona y un QR inválido. | Diferencia duplicado, denegado e inválido sin registrar un acceso indebido. |
| OPS-07 | En `/admin/checkin/control`, buscar, filtrar, exportar CSV, crear y resolver incidencia. | Resultados coinciden con los registros y la incidencia conserva historial. |
| OPS-08 | Con dos dispositivos, procesar el mismo participante casi a la vez. | No quedan dos accesos simultáneos contradictorios. |
| OPS-09 | Cortar conectividad de un dispositivo y repetir una operación controlada. | Documentar el comportamiento real. Es una brecha conocida hasta implementar PWA/offline; no declarar soporte offline sin evidencia. |

## 8. Exposición, plano y publicación pública

| ID | Acción | Resultado esperado |
| --- | --- | --- |
| EXP-01 | Abrir `/admin/stands/:eventId`, crear plano vacío y plantilla. | El evento y el mapa cargan; si falla, registrar mensaje seguro, usuario y consulta fallida. |
| EXP-02 | Añadir stand, pasillo horizontal/vertical, puerta, acceso, zona y otros elementos. | Sin objetos duplicados u ocupados de forma ambigua. |
| EXP-03 | Mover, ampliar, reducir, deshacer/rehacer y recargar. | Geometría y metadatos persisten; intersecciones de pasillos son legibles. |
| EXP-04 | En `/admin/expositores/:eventId`, crear empresa, asignar/liberar stand y subir manual PDF. | Solo empresas expositoras aparecen; asignación, contacto y archivo persisten. |
| EXP-05 | En plano comercial, publicar, despublicar y revisar la vista pública `/expo/:eventId/plano`. | Solo se expone plano publicado y contenido aprobado/visible. |
| EXP-06 | Revisar stand con perfil en borrador, revisión y aprobado. | Los borradores no se exponen; los aprobados muestran logo, descripción y enlace permitido. |

## 9. Portal de expositor, patrocinantes y proveedores

| ID | Acción | Resultado esperado |
| --- | --- | --- |
| COM-01 | Invitar usuario a `/portal/expositor/:eventId` y aceptar invitación. | Solo accede a su empresa y evento; puede ver branding, manual, tareas y documentos autorizados. |
| COM-02 | Editar perfil, personal, comprobante/pago y documento en el portal. | Los borradores locales sobreviven a recargas; el admin puede revisar sin que se publique antes de aprobar. |
| COM-03 | En `/admin/patrocinantes`, crear paquete, patrocinante, acuerdo, pago parcial y entregable. | Montos, moneda, estado, cumplimiento y actividad vinculada persisten. |
| COM-04 | Probar editar/desactivar paquete usado. | No corrompe acuerdos existentes ni permite selección indebida. |
| COM-05 | En `/admin/proveedores`, crear proveedor, contacto y personal; abrir la ficha separada. | La ficha identifica origen y estado del personal; un contacto no obtiene permisos hasta ser invitado como usuario. |

## 10. Seguridad, móvil y regresión

| ID | Acción | Resultado esperado |
| --- | --- | --- |
| SEG-01 | Repetir casos clave con rol `staff`. | No puede administrar clientes, planes, otros eventos ni acciones fuera de alcance. |
| SEG-02 | Probar URL, token y archivo de otro tenant desde sesión autenticada y anónima. | RLS/RPC bloquean acceso sin revelar contenido. **Bloqueante** si expone datos. |
| MOV-01 | Repetir ACC-04, ORG-01, COM-03 y OPS-05 a 390 × 844. | Menú admin utilizable, sin overflow horizontal global y controles alcanzables. |
| REG-07 | Repetir registro público y pago en móvil. | Formularios, carga de archivo y enlaces de correo funcionan. |
| QLT-01 | Antes de liberar cambios: ejecutar `npm run lint`, `npm run build` en `frontend` y `npm run typecheck` en `backend`. | Sin errores nuevos; registrar cualquier advertencia existente. |

## 11. Fases restantes y criterio de cierre

1. **QA integral y estabilización (inmediata).** Ejecutar esta guía y corregir los bloqueantes hallados: acceso al evento/plano, registro-pago-credencial y operación de acceso.
2. **Operación presencial.** Validar permisos por evento/punto, dos dispositivos, cámara, impresión térmica y contingencia de conectividad. PWA/offline, cola y resolución de conflictos siguen pendientes.
3. **Seguridad y administración.** Completar RBAC departamental de plataforma y alcances granulares por evento/zona; hoy existen `owner`, `admin`, `staff` y superadmin, pero no la jerarquía completa objetivo.
4. **Calidad de entrega.** Añadir pruebas automatizadas de RPC/RLS, registro, comprobantes, billing y flujos críticos; mantener un checklist de migraciones, Worker y despliegue reversible.
5. **Producto posterior.** Profundizar edición comercial de stands, catálogo/contratos externos, cruces visuales de pasillos y consolidar/retirar documentación heredada.

Un release operativo requiere que todos los casos bloqueantes pasen, las migraciones aplicadas estén registradas, frontend/Worker desplegados y que el smoke test se ejecute sobre el dominio y datos reales de producción controlados.
