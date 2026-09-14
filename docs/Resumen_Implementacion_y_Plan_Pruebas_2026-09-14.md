# Resumen de implementación y plan de pruebas — 14 de septiembre de 2026

## Estado ejecutivo

Hoy se creó el **centro de control por evento**, las métricas operativas y de conversión, y una base de captación con formularios públicos. La navegación ya no depende de recuadros rígidos para las áreas intervenidas: conserva el evento activo y muestra el menú contextual en escritorio y móvil.

La única dependencia antes de habilitar las nuevas funciones de formularios es aplicar la migración de Supabase indicada en la sección 1. Hasta que se aplique, **no se debe desplegar el frontend de esta entrega**, porque la ruta de formularios depende de esas tablas y RPCs.

## 1. Acción necesaria antes de publicar

En Supabase SQL Editor del proyecto **Eventos Facil** ejecutar, completo y una sola vez:

`infra/supabase/migrations/20260914112812_event_leads_and_launch_checklist.sql`

Esta migración crea:

- `event_lead_forms`: definición de formularios por evento.
- `event_lead_submissions`: respuestas con consentimiento, atribución y fecha.
- RPC pública `get_public_event_lead_form` para leer exclusivamente un formulario publicado.
- RPC pública `submit_public_event_lead` para registrar un lead validado y con consentimiento.
- RPC privada `get_event_lead_submissions` para los miembros de la organización.

Verificación SQL posterior:

```sql
select to_regclass('public.event_lead_forms') as forms,
       to_regclass('public.event_lead_submissions') as submissions,
       exists(select 1 from pg_proc where proname = 'submit_public_event_lead') as public_submit_rpc,
       exists(select 1 from pg_proc where proname = 'get_event_lead_submissions') as admin_read_rpc;
```

Los cuatro resultados deben indicar que existen.

## 2. Lo creado hoy

### Centro de control y navegación

- Menú contextual persistente por evento en escritorio y barra desplazable en móvil.
- Identidad del evento activo y retorno explícito a **Todos los eventos**.
- Ruta canónica de resumen: `/admin/eventos/:eventId/resumen`.
- Ruta canónica de ventas y registros: `/admin/eventos/:eventId/registros`.
- Registros conserva el centro de control y se filtra al evento seleccionado; se eliminó la cabecera antigua con botones que comprimía el contenido.
- La vista de **Promoción y conversiones** es independiente del resumen: `/admin/eventos/:eventId/conversiones`.

### Resumen y conversión

- Resumen con registros, pagos pendientes, confirmados, asistencia y alertas accionables.
- Embudo nativo de visitas, inicios y registros completados.
- Captura de campaña, fuente, medio y referidor sin guardar un identificador personal de navegación.
- Atribución del registro completado en la base de datos.

### Captación pública (lista para activar tras la migración)

- Administración: `/admin/eventos/:eventId/formularios`.
- Creación de formularios de contacto, pre-registro, expositor, patrocinio y newsletter.
- Publicación/despublicación, enlace compartible y listado privado de leads.
- Página pública: `/e/:eventId/interes/:slug`.
- Validación de campos obligatorios, correo y consentimiento explícito.
- UTM (`utm_campaign`, `utm_source`, `utm_medium`) y referidor incluidos en el lead.

### Lanzamiento

- Checklist contextual: `/admin/eventos/:eventId/lanzamiento`.
- Comprueba automáticamente datos básicos, modalidad de registro y publicación.
- Las tareas cuya evidencia vive en agenda, plano, acreditación o contenido enlazan al módulo correspondiente y no se marcan listas de forma artificial.

### Valor de expositor ya disponible y alineado al análisis de ASP

- Portal de expositor con perfil público sujeto a revisión editorial.
- Directorio/plano público con perfiles aprobados.
- Escaneo de credenciales en stand, resumen de visitantes, repeticiones y exportación CSV.
- Controles de consentimiento para revelar datos profesionales en los leads de stand.

## 3. Pruebas funcionales prioritarias

### A. Navegación y responsive

1. Abrir un evento como owner en `/admin/eventos/:eventId/resumen`.
2. Recorrer cada opción del menú y verificar que el nombre del evento y el enlace **Todos los eventos** permanecen visibles.
3. Abrir **Venta y registros** y confirmar que solo se ven los registros de ese evento.
4. Repetir en anchos de 320, 375, 768, 1024 y 1440 px.
5. Confirmar que no aparece la cabecera antigua de botones dentro de registros.

### B. Resumen y analítica

1. Verificar que los contadores de registros, pagos y asistentes coinciden con sus módulos de origen.
2. Abrir **Promoción y conversiones**: debe tener el título propio y tres pasos del embudo, no el contenido de resumen.
3. Abrir un enlace público con `?utm_source=prueba&utm_medium=email&utm_campaign=septiembre` y completar un registro de prueba.
4. Confirmar que aumentan las métricas del embudo sin mezclar datos de otro evento.

### C. Formularios de interés (después de aplicar la migración)

1. En **Formularios y leads**, crear un formulario de contacto y dejarlo inicialmente en borrador.
2. Comprobar que su URL pública informa que no está disponible.
3. Publicarlo, copiar la URL y abrirla sin iniciar sesión.
4. Intentar enviar sin consentimiento: debe bloquear el envío.
5. Enviar con nombre y correo válidos; debe mostrar el mensaje de confirmación.
6. Volver al área administrativa y comprobar el lead, fecha y origen UTM.
7. Iniciar sesión con una organización distinta: no debe poder ver ni consultar ese lead.
8. Despublicar el formulario y comprobar que el enlace deja de aceptar envíos.

### D. Expositor y patrocinio

1. Entrar como expositor y completar/enviar el perfil público; confirmar que la publicación depende de la aprobación del organizador.
2. Escanear una credencial autorizada desde el portal de visitantes.
3. Confirmar el contador, listado y exportación CSV.
4. Verificar que un visitante sin consentimiento no entrega sus datos profesionales al expositor.

### E. Checklist de lanzamiento

1. Abrir **Checklist de lanzamiento**.
2. Completar descripción, modalidad de registro y publicación desde los enlaces sugeridos.
3. Recargar y comprobar que las verificaciones automáticas cambian según los datos reales.

## 4. Límites conocidos y siguientes extensiones

Estas piezas no se declaran implementadas todavía porque requieren decisiones de producto y contenido antes de almacenar datos:

- Editor de campos personalizados y flujos multi-paso para formularios.
- Comparador de entradas/paquetes y pruebas A/B de CTAs.
- Catálogo de productos/servicios por expositor y métricas de visibilidad por patrocinio.
- Biblioteca pública de noticias, recursos, vídeos y galerías con almacenamiento, moderación y SEO.
- Integración opcional de GA4; el embudo nativo ya funciona sin ella.

## 5. Evidencia técnica

- Frontend: `npm run build` correcto.
- Frontend: `npm run lint` correcto, salvo una advertencia preexistente en `PlanoComercialAdmin.tsx` sobre dependencia de `useEffect`.
- No hay pruebas automatizadas en el repositorio; las pruebas anteriores son la verificación manual de aceptación.
- Se preservaron los documentos locales existentes y no se incluyeron en los commits.

## 6. Correspondencia con la investigación de ASP Events

ASP destaca formularios de interés, comparadores, bibliotecas/galerías, perfiles de expositores y analítica accionable como palancas para convertir visitantes en registros y oportunidades comerciales. Esta entrega prioriza la infraestructura que permite medir y captar con consentimiento, además del flujo de retorno para expositor que ya existía. La evidencia se puede contrastar en [Features de ASP](https://www.asp.events/our-product/features), [CRO](https://www.asp.events/our-product/digital-marketing/conversion-rate-optimisation) y [Data Insights](https://www.asp.events/our-product/digital-marketing/data-insights-analytics).
