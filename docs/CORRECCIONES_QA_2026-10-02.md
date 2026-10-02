# Correcciones de QA — 2 de octubre de 2026

Se corrigen QA-01 a QA-06 del informe `QA_SMOKE_INTEGRAL_2026-10-01.md`. Las mejoras QA-07 a QA-14 quedan para decisión posterior.

| Caso | Corrección |
|---|---|
| QA-01 | Un programa sin pases explica que el registro conjunto no está habilitado y ofrece enlaces a las entradas individuales. Los errores al cargar accesos tienen mensaje y reintento. No se crearon pases ni se inventaron reglas de acceso. |
| QA-02 | El CTA de información sólo aparece cuando su formulario está publicado y disponible. |
| QA-03 | Los enlaces secundarios conservan la campaña y el registro individual continúa la visita del mismo evento desde la portada compartida. La función SQL admite completar esa visita conservando evento, caducidad y permisos. |
| QA-04 | Los dominios de sitios públicos resuelven su organización; el registro individual y de programa filtran por ella. El parámetro `org` no reemplaza la organización de un dominio. Un dominio que no se puede verificar falla con mensaje. |
| QA-05 | Las rutas inexistentes muestran una página de recuperación con enlace al inicio. |
| QA-06 | El cintillo respeta movimiento reducido al cargar y al cambiar la preferencia durante la sesión. La comprobación mide la animación WAAPI real. |

## Verificación previa

- Compilación de producción: PASS.
- Base de datos aislada, incluida migración repetida y conversión programa → registro individual: PASS.
- Regresiones de participante, estados, categorías y editor compartido: PASS en escritorio/móvil.
- Interfaz pública: PASS a 1440, 768 y 390 px.
- Diseñador de agenda: PASS, incluida pausa manual y movimiento reducido.
- Nueva suite `frontend/scripts/qa-corrections.mjs`: PASS a 1440 y 390 px; comprueba estado sin pases, errores de accesos, 404, CTA disponible/no disponible y continuidad de la misma visita.
- Lint: sin errores; permanece el aviso previo de dependencia `load` en `PlanoComercialAdmin.tsx`.

Migración específica: `20261001200749_qa_public_flows.sql`, proyecto `moqywmcbklaeaelttzdm`. Se aplica en transacción y se registra su versión; no se ejecuta un push global del historial divergente.

## Despliegue y repetición en producción

Código publicado: commit `f645986ea6968f83dd13543638b4db43168d057a`. GitHub Actions `36976520993`: **completed / success**, incluyendo compilación y despliegue Cloudflare Pages.

Se repitieron los seis casos contra `eventosfacil.net` y `expo-energia-2026.eventosfacil.net` usando respuestas reales, sin mocks:

| Caso | Resultado publicado |
|---|---|
| QA-01 | PASS a 1440/390 px: estado explícito sin pases, alternativas individuales y ausencia del selector vacío. |
| QA-02 | PASS a 1440/390 px: el CTA del formulario no publicado no aparece. La variante con formulario disponible se verificó localmente. |
| QA-03 | PASS a 1440/390 px: el enlace secundario conserva UTM; landing y formulario envían el mismo ID de visita y programa, con respuestas RPC exitosas. |
| QA-04 | PASS a 1440/390 px en contexto anónimo: el evento de JUANCHO EVENTOS no muestra formulario ni permite reservar bajo el dominio del programa de Expo. |
| QA-05 | PASS a 1440/390 px: la ruta desconocida muestra «Página no encontrada». |
| QA-06 | PASS: pantalla pública real del Foro sin animación con movimiento reducido; se reactiva al quitar la preferencia y vuelve a detenerse al restaurarla. |

Smoke anónimo publicado: **8 casos PASS** (administración/portal/superadmin protegidos y mensajes de acceso inválido). Registro de migraciones remoto: versión `20261001200749` presente una vez; definición SQL verificada sin la restricción obsoleta.

Instrumental reproducible: `frontend/scripts/qa-corrections-production.mjs`. Evidencia local generada: `frontend/test-results/corrections-production/results.json`, con fechas y visitas de QA. Estas pruebas añaden visitas/aperturas a la campaña **QA Smoke 2026-10-01**, no envían registros, correos ni pagos. El envío exitoso y la conversión completa se verifican en SQL aislado para la ruta compartida → individual.

Observación de seguridad previa, ajena a estas seis correcciones: el advisor sigue señalando `public.published_exhibition_directory` como vista SECURITY DEFINER. No se modificó su modelo de acceso en este cambio.

Permanece sin incluir el archivo previo `.github/workflows/checks.yml`. Las mejoras de contenido, fechas, precios, etiquetas y checklist del informe original requieren decisión posterior.
