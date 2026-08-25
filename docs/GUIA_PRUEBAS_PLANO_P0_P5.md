# Guía de pruebas del plano de exposición — P0 a P5

Esta guía permite validar el recorrido completo del plano, desde la edición CAD/canvas hasta la publicación pública y la analítica. Ejecutar en un navegador de escritorio y repetir las pruebas críticas en tableta/móvil.

## 0. Preparación

1. Iniciar sesión con una cuenta de organizador o superadmin.
2. Crear un evento de tipo **Exposición** en estado borrador.
3. Crear o abrir el **Plano de exposición**.
4. Para probar la vista pública, abrir `/admin/plano-publicar/{eventId}` y publicar el plano. La vista pública queda en `/expo/{eventId}/plano`.
5. Tener al menos dos empresas expositoras creadas en el módulo **Expositores**.
6. Si se prueban archivos, usar un PNG/JPG, un PDF y un DXF pequeño como planos de referencia.

Resultado esperado general: los cambios se guardan sin errores 400/409/RLS, el mapa no vuelve a una cuadrícula rígida y los elementos conservan su posición después de recargar.

## P0 — Base del editor, historial y blueprint

| ID | Prueba | Resultado esperado |
|---|---|---|
| P0.1 | Abrir el editor moderno desde `/admin/stands/{eventId}` | Se muestra el canvas Konva y la biblioteca; no aparece texto plano ni errores de módulos. |
| P0.2 | Cargar PNG/JPG como blueprint | Se visualiza como fondo, se puede ocultar y cambiar la opacidad. |
| P0.3 | Cargar PDF y DXF | Se rasteriza o previsualiza sin bloquear el canvas. |
| P0.4 | Colocar un stand, moverlo y recargar | La geometría queda persistida. |
| P0.5 | Guardar versión, hacer cambios, usar deshacer/rehacer y restaurar | El historial restaura elementos y metadatos sin duplicados. |
| P0.6 | Eliminar un elemento y eliminar el plano | Se elimina solo el elemento o el plano completo; el evento permanece. |

## P1 — Dibujo, biblioteca y geometría

| ID | Prueba | Resultado esperado |
|---|---|---|
| P1.1 | Añadir puerta, acceso, verificador, planta, mesa, sofá, lobby e información | Cada objeto aparece con símbolo, etiqueta y tamaño inicial propio. |
| P1.2 | Redimensionar por tiradores de esquina y laterales | Se puede cambiar ancho y alto de forma independiente, sin forzar proporción. |
| P1.3 | Rotar y bloquear un objeto | El objeto gira; uno bloqueado no se mueve ni se elimina accidentalmente. |
| P1.4 | Selección múltiple con Ctrl/Cmd + clic | Se pueden mover o eliminar todos los elementos seleccionados; clic en vacío libera la selección. |
| P1.5 | Dibujar un polígono irregular y editarlo | Se crea un área no rectangular con etiqueta y geometría persistente. |
| P1.6 | Crear pasillos parciales horizontales/verticales y superponer objetos permitidos | El pasillo no ocupa automáticamente toda la sala; las capas y el z-index respetan la intención del diseñador. |

## P2 — Comercialización del plano

| ID | Prueba | Resultado esperado |
|---|---|---|
| P2.1 | Abrir `/admin/plano-comercial/{eventId}` | Se muestran las pestañas Paquetes y Extras. |
| P2.2 | Crear paquete con precio, moneda y beneficios | El paquete aparece activo y persiste tras recargar. |
| P2.3 | Crear extra con precio y límite de cantidad | El extra aparece con su límite. |
| P2.4 | Activar/desactivar paquete o extra | El estado se actualiza sin borrar el registro. |
| P2.5 | Consultar las columnas comerciales del elemento seleccionado mediante Supabase (o el inspector comercial cuando esté habilitado) | `booth_type`, `area_m2`, `price`, `currency`, `tags` y `public_visible` conservan sus valores. |
| P2.6 | Insertar una reserva de prueba desde el flujo administrativo/API | Se registra en `floor_plan_reservations` y queda aislada por organización. |

## P3 — Publicación, portal y directorio

| ID | Prueba | Resultado esperado |
|---|---|---|
| P3.1 | Abrir `/admin/plano-publicar/{eventId}` y publicar | El estado cambia a publicado y aparece el enlace de vista pública. |
| P3.2 | Abrir `/expo/{eventId}/plano` en ventana anónima | Solo se muestran mapas publicados y elementos visibles. |
| P3.3 | Consultar un elemento con empresa asignada | Se muestra el nombre público, stand, tipo y precio cuando estén configurados. |
| P3.4 | Abrir el QR generado | El QR lleva al plano público con el elemento seleccionado. |
| P3.5 | Retirar la publicación | El plano deja de estar disponible para visitantes anónimos. |
| P3.6 | Abrir el portal de expositor | El manual, identidad del evento y datos del expositor siguen disponibles sin romper el plano público. |

## P4 — Experiencia del asistente y orientación

| ID | Prueba | Resultado esperado |
|---|---|---|
| P4.1 | Buscar por nombre, stand, tipo o etiqueta | El mapa y el directorio se filtran en tiempo real. |
| P4.2 | Marcar/desmarcar favorito | El favorito se conserva en el navegador y cambia el icono. |
| P4.3 | Seleccionar un stand y pulsar “Guiarme” | Se registra la solicitud de ruta y se muestra la zona seleccionada. |
| P4.4 | Abrir `?kiosk=1` | La vista queda simplificada para pantalla de información. |
| P4.5 | Usar teclado, zoom del navegador y ancho móvil | Los controles siguen accesibles y no hay desbordamiento horizontal crítico. |
| P4.6 | Probar un plano sin elementos públicos | Se muestra un mensaje claro, no una pantalla en blanco. |

## P5 — Analítica, operación y regresión

| ID | Prueba | Resultado esperado |
|---|---|---|
| P5.1 | Abrir el plano público | Se registra `view` en `floor_plan_analytics`. |
| P5.2 | Buscar, seleccionar, marcar favorito y solicitar ruta | Se registran `search`, `select`, `favorite` y `route` con sesión y elemento. |
| P5.3 | Repetir una búsqueda en dos navegadores | Las sesiones se distinguen y no se mezclan los favoritos. |
| P5.4 | Verificar RLS con usuario de otra organización | No puede leer ni modificar paquetes, reservas, rutas o analítica de otra organización. |
| P5.5 | Recargar después de cada operación | No aparecen duplicados, posiciones antiguas ni pérdida de asignación. |
| P5.6 | Smoke test de rutas | `/admin/login`, `/admin/stands/{eventId}`, `/admin/plano-comercial/{eventId}`, `/admin/plano-publicar/{eventId}` y `/expo/{eventId}/plano` devuelven la SPA y cargan su chunk. |

## Evidencia que debe guardarse

- Captura antes/después de cada operación de geometría.
- URL del preview o dominio probado.
- Consola del navegador sin errores `400`, `RLS`, `MIME`, `Failed to fetch dynamically imported module` o `JSON object requested`.
- Conteo de filas creadas en `floor_plan_analytics` para P5.
- Resultado de `npm run build`, `npm run lint` y `git diff --check`.

## Límites conocidos del pase P0–P5

Este pase cubre el flujo funcional base. Quedan como ampliaciones posteriores: cálculo de rutas sobre grafos con obstáculos, mapas multi-planta sincronizados, pagos en línea, heatmap visual por zonas, modo offline/PWA y comparación automática entre ediciones. No deben marcarse como aprobados hasta contar con pruebas específicas.
