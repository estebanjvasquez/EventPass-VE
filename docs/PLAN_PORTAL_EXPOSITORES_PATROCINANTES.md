# Portal de expositores y patrocinantes

## Alcance

El portal debe permitir que una empresa invitada gestione su ficha, personal,
documentos, tareas, pagos y entregables sin concederle acceso al panel del
organizador. El organizador conserva la administración y trazabilidad completa.

## Referencias funcionales

- Swapcard separa perfil de empresa, miembros del equipo, documentos, tareas,
  paquetes, complementos y selección de stand.
- Cvent centraliza portal de expositor, personal, preguntas personalizadas,
  gestión del stand y reportes de avance.

## Fases

1. **Base del organizador (completada en esta fase):** botón Expositores para
   eventos de exposición, asignación comercial fuera del plano, filtro de
   empresas expositoras en el plano y manual PDF privado del evento.
2. **Identidad y acceso:** tablas de membresía por evento/empresa, invitación
   por correo desde el Worker, aceptación y recuperación de clave, roles
   `owner`, `manager` y `staff`.
3. **Portal:** ficha de empresa, contactos, personal acreditable, stands
   asignados, paquetes y beneficios, tareas con fecha límite, manual y
   documentos del organizador, carga de comprobantes y estado de pagos.
4. **Control del organizador:** vista de avance por expositor, aprobación de
   personal y pagos, auditoría de cambios, exportación y revocación de acceso.
5. **Imagen del evento:** aplicar marca, logo, colores, portada y datos de
   contacto del evento en el portal; el manual se sirve con URL firmada.

## Reglas de seguridad

- Cada consulta del portal debe estar limitada a la organización, evento y
  empresa de la membresía autenticada mediante RLS.
- Los archivos se almacenan en bucket privado; nunca se expone una URL pública.
- Los pagos y comprobantes requieren estado (`pending`, `confirmed`,
  `rejected`) y registro de usuario/fecha de cada cambio.
- El personal no obtiene permisos para modificar el plano ni otros eventos.
