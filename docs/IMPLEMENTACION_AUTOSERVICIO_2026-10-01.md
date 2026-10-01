# Implementación y validación del autoservicio

Implementado en `feat/participant-self-service` e integrado en `develop` y `main`. Migración y despliegues publicados el 1 de octubre de 2026 tras autorización explícita.

## Entregas

- Web compartida: ruta canónica por programa, selección explícita ante varios programas, cancelación de cargas obsoletas y guardado atómico autorizado. Borrador y publicación se conservan separados; un sitio heredado conserva su dirección y dominio.
- Resumen y estado: resumen persistido e inmutable, página «Mi registro», estado de pago separado del correo, acciones según estado y enlaces desde registro, comprobante y credencial. Los importes históricos desconocidos no se reconstruyen con precios actuales.
- Categorías: editor administrativo, activación opcional por evento, precio/moneda/beneficios/cupo/ventana, selector público y validación de inventario en base de datos. El precio de categoría sustituye al precio del asiento. Pendientes reservan cupo; rechazo o vencimiento lo libera. Categorías de programas quedan fuera del MVP.
- Recuperación: respuesta uniforme, límites persistentes, tokens almacenados como hash, enlace de 30 minutos y canje explícito de un solo uso. Sesión de 24 horas revocable. El QR existente no se rota ni se confirma un pago al recuperar.

## Evidencia local

- `cd infra && npm test`: PostgreSQL embebido PGlite; migración aplicada dos veces, permisos, aislamiento, borrador/publicación, inventario, precio inmutable, recuperación/caducidad/canje único, cierre de sesión y compatibilidad de QR.
- `cd backend && npm run typecheck`: correcto.
- `cd frontend && npm run build`: correcto.
- `cd frontend && npm run lint`: correcto, con advertencia previa en `PlanoComercialAdmin.tsx` sobre dependencia de `useEffect`.
- Playwright: iniciar frontend con `npm run dev -- --host 127.0.0.1 --mode production` y ejecutar `node scripts/qa-participant.mjs`. Prueba con datos simulados, intercepta tráfico externo y no escribe en producción. Recorridos de guardado desde ambos eventos, recarga, categorías/resumen, estados y canje explícito; tamaños 1440 y 390. Capturas en `frontend/test-results/participant/`.
- Workflow `checks.yml` preparado localmente para pruebas SQL, tipos, lint y build. No incluido en GitHub: el token utilizado no dispone del permiso `workflow`.

Estas pruebas usan un esquema mínimo de dependencias y tráfico simulado. No sustituyen aplicar toda la cadena de migraciones en una rama Supabase de QA ni probar compradores simultáneos en conexiones independientes.

## Aplicación coordinada pendiente

1. Confirmar acceso al proyecto Supabase `moqywmcbklaeaelttzdm`. El conector disponible previamente sólo exponía otro proyecto; no se utilizó para esta implementación.
2. Revisar en QA los programas y sus `registration_config.web_event_id`, vínculos `program_events` y sitios heredados. Un principal ausente o inválido provoca un error explícito; no se elige un UUID arbitrario ni se reconcilian contenidos diferentes automáticamente.
3. Aplicar primero `infra/supabase/migrations/20261001171204_shared_site_and_participant_self_service.sql` sobre el esquema completo de QA y verificar grants/RLS con dos organizaciones y roles owner/admin/staff/anónimo. Comprobar también rutas institucionales existentes.
4. Probar último cupo con dos conexiones concurrentes, reservas institucionales, categorías gratuitas/pagadas, ventanas y agotamiento; comprobar rechazo, vencimiento y reactivación. Las escrituras bloquean el evento para serializar inventario.
5. Publicar Worker con los bindings existentes de Supabase, EMAIL, EMAIL_FROM y APP_BASE_URL correctos; luego frontend. Verificar correo real y cron de vencimientos/limpieza. El procesamiento de solicitud de recuperación utiliza `waitUntil`.
6. Reproducir el incidente original con sesión autenticada: abrir desde cada evento, guardar, recargar, publicar y comprobar dominio. Probar programa de un evento, varios programas y navegación rápida.
7. Validar recuperación real existente/inexistente, enlace usado/vencido, selección de registros de programa, permisos, móvil e impresión. Registrar versiones desplegadas y resultados.

Ante una regresión, volver al frontend/Worker anterior conservando las tablas y snapshots nuevos. La RPC anterior de alta sigue disponible, aunque la validación de categorías activadas también se aplica a inserciones antiguas.

## Publicación ejecutada

- Código desplegado: 9bd60ec.
- Supabase: moqywmcbklaeaelttzdm (Eventos Facil), migración 20261001171204 aplicada en transacción y registrada. Se preservó el historial remoto; db push detectó versiones remotas ausentes del repositorio.
- Verificación remota: RLS activo en las tres tablas nuevas; RPC privada inaccesible a anon; guardado disponible a authenticated con autorización interna; sin eventos principales inválidos en programas configurados.
- Worker: versión 8be2fee3-6db0-4184-9a65-22c21196e5f2, rutas y cron publicados. Versión anterior para rollback: 2bd11a02-3a15-4e7d-be27-78b0abc16d67.
- Frontend producción: GitHub Actions 36906416620 finalizado correctamente; https://eventosfacil.net.
- Preview QA: https://a22088cb.eventpass-d7d.pages.dev.
- Smoke: las pantallas nuevas cargan con Playwright en móvil; la API de registros sin bearer responde 401 y no-store; las RPC con identificadores inexistentes rechazan el acceso sin modificar registros reales.
- Advisor de seguridad: detecta la vista preexistente published_exhibition_directory como SECURITY DEFINER; no fue creada por esta entrega y requiere revisión separada.
- Pendientes de QA humana: guardado autenticado desde eventos asociados, inventario concurrente, recuperación con correo real y recorridos institucionales.
