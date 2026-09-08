# Diseño de la agenda pública · 8 de septiembre de 2026

## Dónde configurarlo

Eventos → Administrar → Agenda → Pantalla pública.

1. Selecciona una plantilla: Auditorio nocturno, Corporativo claro o Petróleo y energía.
2. Elige la distribución: tarjetas destacadas, programa editorial o panel lateral para pantalla ancha.
3. Ajusta título, subtítulo, tipografía y tamaño de lectura. Activa únicamente el contenido necesario: reloj, actividad actual, próxima, programa, participantes y ubicación. Puedes filtrar por escenario.
4. En **Patrocinantes**, decide de forma independiente qué aparece en cada actividad y en el cintillo: logos, nombres, ambos o ninguna mención. Solo aparecen patrocinantes confirmados, activos o cumplidos. Los logos ausentes o que no cargan se sustituyen por el nombre.
5. Añade un mensaje al cintillo y configura movimiento, sentido, duración de la vuelta y tamaño de logos. La pantalla permite pausar/reanudar; respeta la preferencia del dispositivo de reducir movimiento.
6. Revisa la vista previa con el programa real, en formato horizontal y vertical. Guarda y abre la pantalla guardada. Prueba siempre el televisor/proyector y la distancia de lectura reales.

La vista previa no publica cambios. Guardar conserva las otras secciones de configuración y el intervalo de actualización. Si la escritura no devuelve el evento actualizado se informa del fallo, no se anuncia éxito. La publicación mantiene la regla existente: un evento publicado hace accesible su agenda; la casilla permite publicarla también de forma independiente. No modifica inscripciones ni sesiones.

## Criterios de diseño

Se utilizan zonas separadas para identidad, programa y patrocinantes, inspiradas en los [diseñadores de señalización digital](https://support.signagelive.com/en/articles/137729-introduction-to-the-layout-designer). Se comprueba un contraste mínimo de 4.5:1 de texto y acento sobre fondo, siguiendo la [referencia WCAG](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). No sustituye una auditoría completa de accesibilidad o pruebas del proyector. El cintillo incorpora [pausa y reducción de movimiento](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).

## Verificación

- `npm run build` y `npm run lint` en frontend.
- `scripts/qa-agenda-design.mjs`: prueba local del diseñador con Supabase simulado; modalidades de patrocinantes independientes, pausa, movimiento reducido, distribuciones, guardado, conservación de campos, escritura sin filas, contraste y anchos 1440/768/390. No escribe datos productivos.
- `scripts/qa-public-visual.mjs`: regresión local de portada, plano y agenda clara/oscura a los mismos tres anchos.
- Pendiente de QA organizador: guardar en su evento real, recargar, abrir la URL pública y verificar sus logos, todas las actividades y el equipo de proyección.

No requiere migración ni cambios del Worker. Se usa `events.config.public_agenda` y la RPC pública existente.

## Retorno

Base anterior: `bcec00a`, etiqueta `rollback/pre-agenda-design-20260908`. Artefacto anterior de Pages: `256dcaa4-559b-4b29-870c-547d33fc9b2e` (https://256dcaa4.eventpass-d7d.pages.dev/).

Para retorno inmediato seleccionar ese deployment en Cloudflare Pages y usar Rollback, evitando ejecuciones pendientes de CI. Luego revertir en Git el commit de esta entrega y verificar build antes de publicar nuevamente. No borrar configuraciones ni datos; los campos visuales adicionales son compatibles con la versión previa, que los ignora.

## Entrega verificada

- Commit de implementación: `5f70a9b` (para revertir esta entrega mediante `git revert`).
- [Despliegue aprobado en GitHub Actions](https://github.com/estebanjvasquez/EventPass-VE/actions/runs/34195870281).
- Artefacto: https://e07a74a9.eventpass-d7d.pages.dev/.
- Smoke anónimo en https://eventosfacil.net/: portada y plano con canvas; 31 respuestas de JS/CSS correctas, sin excepciones JavaScript. El bundle servido `AgendaAdmin-Bv4o-lZ3.js` contiene el nuevo diseñador y sus controles.
- La agenda del evento de la guía sigue indicando que no tiene sesiones públicas; no se alteraron sus datos para la prueba. El guardado se comprobó con API simulada, no con una escritura autenticada productiva.
- Lint: sin errores, con la advertencia preexistente de dependencia `load` en `PlanoComercialAdmin.tsx`, fuera de esta entrega.
