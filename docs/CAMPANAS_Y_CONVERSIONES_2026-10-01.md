# Campañas y atribución

## Problema corregido

El dashboard anterior llamaba «visitas a la página» a aperturas del formulario de registro. La página principal no registraba visitas ni trasladaba UTM al formulario. No había creación de campañas ni desglose por origen.

## Uso

En Promoción y conversiones, crear una campaña indicando nombre, red, medio y página de destino. Copiar el enlace y utilizarlo en la publicación o anuncio de la red social. La aplicación genera y mide enlaces; no publica anuncios ni contrata presupuestos en redes.

Los destinos son sitios públicos activos del evento o sus programas asociados. Si no hay un sitio activo, se utiliza `/evento/:eventId`, página principal con el contenido publicado del evento. Nunca se genera un enlace de campaña directo al formulario.

En sitios compartidos, `ep_event` mantiene el evento promocionado entre los asociados; el registro de programa se atribuye a ese evento de origen aunque el usuario seleccione una actividad distinta. Sin ese parámetro, las visitas a la web compartida se atribuyen a su evento principal.

## Significado de las métricas

- Visita: sesión de 30 minutos en la misma pestaña, evento y campaña. Recargar no aumenta el contador. No equivale a persona única; puede incluir bots o pruebas humanas.
- Abrieron registro: sesiones que visitaron primero la página principal y después abrieron el formulario.
- Completaron: sesiones con una inscripción creada correctamente por la RPC de alta. No significa pago confirmado ni aprobación del organizador.
- Conversión: sesiones con visita e inscripción divididas entre sesiones con visita.
- Sólo formulario: inscripciones de sesiones sin visita previa a la página principal; se excluyen del denominador y numerador anteriores.
- Directo/sin origen identificado: llegada sin campaña ni referencia externa reconocible. Las referencias externas y UTM ajenos al gestor tienen su propia fila.
- Periodo: selecciona las sesiones por fecha de llegada, no por fecha de pago. El resumen del evento muestra los últimos 30 días.

El origen es de primer contacto dentro de la sesión, se guarda en sessionStorage y se mantiene durante la navegación. Otra campaña o la caducidad inician una sesión distinta. No se comparten sesiones entre dispositivos ni entre pestañas nuevas independientes. Si no puede medirse una visita, la inscripción continúa sin atribución.

Las campañas guardadas validan en la base de datos su origen y medio. Archivar conserva enlaces y resultados. No se reconstruyen campañas históricas; las interacciones del contador anterior quedan identificadas y separadas mediante `legacy_funnel`.

## Implementación y pruebas

- Migración `20261001183330_event_campaign_attribution.sql`: tablas con RLS, campañas administrables por owner/admin, resultados agregados para miembros de la organización, visitas públicas sin lectura de sus identificadores. Completado sólo desde wrappers de las RPC reales de registro, en la misma transacción.
- Eventos: conserva categoría, precio, pago, inventario y QR de la RPC anterior.
- Programas: conserva identidad/pases; un alta existente no produce una conversión nueva.
- `cd infra && npm test`: permisos, aislamiento, destino, repetición de visitas, origen inmutable, altas válidas y duplicadas, caducidad, filtros, separación de formulario y programa compartido; migración repetible.
- `frontend/scripts/qa-participant.mjs`: campañas/archivo/reactivación, enlace a página principal, conservación del identificador hasta el alta, escritorio/móvil y regresiones de autoservicio. Tráfico externo simulado.
- Frontend build y lint: correctos; permanece la advertencia previa de PlanoComercialAdmin.
- Migración validada contra el esquema remoto con rollback antes de aplicarla.

Para QA humana, crear una campaña por red, abrir su enlace en una pestaña privada, registrarse y actualizar el dashboard. Repetir desde la página principal sin UTM en otra sesión para comparar la fila directa. Una recarga de la misma campaña no debe duplicar la visita.

## Publicación

Aplicado en Supabase moqywmcbklaeaelttzdm e integrado en develop/main: commit ef27bba. Despliegue frontend 36909941037 completado correctamente el 1 de octubre de 2026. RLS y permisos verificados remotamente. La prueba transaccional real de campaña, recarga, apertura del formulario, dashboard y archivo pasó y se revirtió para no dejar datos QA. No fue necesario modificar el Worker.
