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

La evidencia final del despliegue y de los casos repetidos se añadirá tras publicar la versión verificada.
