# Guía de lógicas uniformes para módulos administrativos

Esta guía define el comportamiento común de formularios de administración
(proveedores, expositores, patrocinantes, paquetes y personal). La interfaz
debe conservar estas reglas para que el usuario no tenga que aprender un flujo
distinto en cada módulo.

## Edición y guardado

1. Al abrir una fila se copia el registro a un `draft` local. Mientras se edita
   no se modifica la base de datos.
2. Antes de enviar se validan los campos obligatorios y se normalizan los
   valores: `trim()` para textos y `null` para campos opcionales vacíos. Nunca
   se deben enviar `undefined` ni valores de presentación.
3. El botón de guardar se desactiva durante la petición y conserva el contexto
   del registro mediante su `id`.
4. Si Supabase responde con error, el editor permanece abierto, se muestra un
   mensaje legible y se conserva el contenido para corregirlo. Los conflictos
   de unicidad (`23505`) deben indicar que ya existe otro registro con ese
   nombre o identificador.
5. Sólo después de una respuesta exitosa se limpia el `draft`, se cierra el
   editor, se limpia la selección y se recarga la lista. El mensaje de éxito se
   muestra después de cerrar el formulario.

## Selección y navegación

- Abrir, editar y cerrar son acciones explícitas; `Cerrar` nunca guarda.
- Al cambiar de registro se reemplaza completamente el `draft` para no mezclar
  datos del registro anterior.
- Después de crear o actualizar se mantiene la vista de lista y se refrescan
  los datos relacionados (contactos, personal, servicios y pagos).

## Errores, permisos y seguridad

- La base de datos y sus políticas RLS son la fuente de verdad. No se deben
  relajar políticas para ocultar errores de permisos; cuando una operación
  privilegiada sea necesaria debe resolverse mediante RPC o Worker.
- Mensajes técnicos de Supabase se transforman en mensajes accionables para
  el organizador, conservando el código en consola para diagnóstico.
- Las operaciones destructivas requieren confirmación y una recarga posterior.

## Accesibilidad y responsive

- Todo botón debe indicar su acción con texto o `aria-label`.
- Los estados de carga, éxito y error deben ser visibles y no depender sólo de
  color.
- Los formularios se organizan en una columna en móvil y en varias sólo cuando
  el ancho disponible lo permite.

