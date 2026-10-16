# Navegación de superadmin y organización

Corrección del 16 de octubre de 2026. Un superadmin con membresía en una organización no debe regresar a ella al navegar por la consola de plataforma.

## Comportamiento

- La entrada administrativa de un superadmin abre la plataforma por defecto, aunque tenga una organización seleccionada o asignada.
- En `/superadmin`, la cabecera, marca, logo y menú corresponden a la plataforma global; no resuelven ni muestran la organización del usuario.
- «Resumen de plataforma», las secciones y los enlaces de menú permanecen en `/superadmin?tab=...`. La sección activa se conserva al recargar y con Atrás/Adelante.
- «Actuar como superadmin» cambia explícitamente al modo plataforma y limpia el cliente que se estaba gestionando. Los enlaces antiguos a `/admin/...` vuelven al resumen de plataforma mientras ese modo esté activo, sin montar la pantalla de organización.
- «Mi organización» permite entrar de forma explícita a la organización propia. «Gestionar como cliente», desde Organizaciones y soporte, conserva la selección del cliente durante la operación.
- Al volver a la consola se abandona el cliente gestionado. Tanto la navegación de escritorio como el menú móvil ofrecen destinos correspondientes al contexto.
- Los usuarios ordinarios siguen entrando a su organización y no obtienen navegación ni permisos de superadmin por modificar el modo del navegador.
- Si no se puede comprobar el rol/acceso, se muestra un error con reintento antes de cargar la organización. La respuesta de otra sesión anterior se descarta.

El modo es una preferencia de navegación por pestaña, no una autorización. Las comprobaciones de rol y permisos de servidor se mantienen. No requiere migración de base de datos.

## Verificación

`frontend/npm run test:admin-navigation` abre los componentes reales de cabecera, protección y consola en Chrome, con autenticación/API de QA simuladas. Comprueba superadmin con organización, destinos del menú, secciones por URL, recarga, historial, organización propia, gestión de cliente, limpieza de contexto, móvil, usuario ordinario y fallo de comprobación de acceso. No utiliza clientes reales.

Se ejecutan además TypeScript, build y lint; se conserva el aviso previo del hook de `PlanoComercialAdmin.tsx`.

## Análisis comercial paralelo

[Estrategia B2B para Venezuela](ESTRATEGIA_B2B_VENEZUELA_2026-10-16.md): propuesta de posicionamiento, segmentos, paquetes, brechas reales y pilotos, sin modificar catálogo ni contratos.
