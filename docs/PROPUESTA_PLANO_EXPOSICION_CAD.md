# Propuesta: Plano de exposición flexible y a escala

## Conclusión de la investigación

El patrón habitual en herramientas profesionales no es una cuadrícula que
obliga a que todo el recinto sea rectangular. Es un canvas 2D con coordenadas
continuas, zoom y desplazamiento, donde el plano arquitectónico se usa como
fondo y los objetos del evento se colocan encima.

- **Cvent Event Diagramming / Social Tables** parte de archivos arquitectónicos
  a escala (CAD, DWG, PDF o planos escalados), permite objetos, plantillas,
  diagramas reutilizables y colaboración. También ofrece una vista 3D, pero el
  editor base sigue siendo un diagrama 2D.
- **Visio** importa DWG/DXF y normalmente conserva la geometría CAD como una
  capa de fondo; las formas de mobiliario, puertas, mesas y señalización se
  dibujan encima sin convertir todo el CAD en formas editables.
- **Fairoo** usa importación DXF con capas visibles/ocultas, selección de capas
  de snap y obstáculos que permanecen por encima de los stands.
- **SmartDraw** permite comenzar con un PDF o imagen y calibrar una distancia
  conocida para trabajar a escala sin exigir conocimientos de CAD.
- **SeatPlan/Tessumi/Floors.live** siguen el mismo enfoque híbrido: importar
  PDF, imagen o CAD, calibrar escala y colocar elementos editables alrededor de
  columnas, puertas y pasillos.

Fuentes consultadas: [Cvent Event Diagramming](https://www.cvent.com/en/event-marketing-management/cvent-event-design-software),
[Social Tables](https://www.socialtables.com/),
[Microsoft Visio: importar CAD](https://support.microsoft.com/en-au/office/import-or-insert-graphics-into-visio-drawings-f05e556d-a158-4e16-9bd8-5d45071c9b8c),
[Fairoo Floor Plan Designer](https://www.fairoo.de/en/modules/floor-plan-designer),
[SmartDraw Event Plans](https://www.smartdraw.com/event-plan/event-planning.htm).

## Decisión de producto

El plano de exposición debe evolucionar a un **canvas de escena 2D a escala**,
no a un CAD completo. El usuario no necesita editar muros arquitectónicos con
la complejidad de AutoCAD; necesita importar el recinto, calibrarlo y diseñar
con libertad.

La cuadrícula actual se conserva sólo como modo rápido para crear stands
regulares. No será el sistema de coordenadas principal del plano de exposición
y tampoco se aplicará a foros/asientos existentes.

## Nuevo modelo visual

### Capas

1. **Plano base**: PDF, PNG, JPG, SVG o DXF renderizado. Opacidad ajustable,
   bloquear/desbloquear y ocultar/mostrar.
2. **Arquitectura y obstáculos**: paredes, columnas, límites, salidas y zonas
   no utilizables. No se mueven al arrastrar un stand.
3. **Circulación**: pasillos libres, accesos, puertas y flechas de flujo. Un
   pasillo puede ser un rectángulo o un trazado con varios segmentos; no ocupa
   automáticamente toda una fila o columna.
4. **Montaje**: stands, mesas, sillas, escenarios, mostradores, plantas,
   sofás, controles de acceso y objetos de biblioteca.
5. **Anotaciones**: textos, cotas, leyenda, numeración y notas operativas.

Cada capa puede bloquearse, ocultarse y cambiar su orden. La superposición se
permite por defecto; sólo se marcan advertencias cuando un objeto bloqueado,
una salida o un área de seguridad quedan cubiertos.

### Coordenadas y escala

Cada plano tendrá ancho/alto en metros o pies y una transformación de viewport:

```text
mapa:       40.00 m × 22.50 m
viewport:   zoom, panX, panY
elemento:   x, y, width, height, rotation en unidades reales
snap:       opcional (0.05 m, 0.10 m, 0.25 m o desactivado)
```

El usuario podrá importar un archivo y elegir una de estas calibraciones:

- escala leída del DXF;
- ancho/alto real del recinto;
- dibujar una línea sobre una distancia conocida (por ejemplo, 10 m);
- mantener el tamaño original cuando el archivo ya está a escala.

## Importación recomendada por fases

### Fase A: base de imagen/PDF (primera entrega)

- Cargar PDF, PNG, JPG o SVG como fondo.
- Mostrar previsualización, rotación, opacidad y bloqueo.
- Calibrar con una línea de distancia conocida.
- Recortar el área útil y guardar la transformación.
- Colocar objetos libres sobre el fondo.

Esta fase resuelve la necesidad real de la mayoría de organizadores y evita
convertir PDFs complejos en geometría editable.

### Fase B: DXF

- Importar DXF y conservar sus entidades/layers como fondo vectorial.
- Permitir mostrar/ocultar capas y elegir las que sirven como obstáculos o
  referencias de snap.
- Mantener el archivo original para exportación/auditoría.
- Renderizar en el navegador o mediante un procesador aislado; nunca aceptar
  que una geometría CAD importada ejecute contenido.

### Fase C: DWG y asistencia de interpretación

DWG requiere un conversor o servicio especializado y no debe bloquear la
primera entrega. Puede añadirse después como conversión a DXF/SVG, con revisión
manual antes de publicar el plano.

## Objetos y edición

Todos los objetos comparten un inspector lateral:

- posición X/Y y ancho/alto en unidades reales;
- rotación, color, borde, opacidad y etiqueta;
- capa, orden Z, bloqueo y visibilidad;
- duplicar, copiar/pegar, alinear, distribuir y agrupar;
- asignación de empresa para uno o varios stands;
- advertencias de salida, obstáculo o separación mínima sin impedir guardar.

Los pasillos se crean dibujando un segmento o una polilínea y se redimensionan
desde tiradores en los extremos y en los vértices. Las puertas se representan
con símbolo de puerta y arco de apertura, con orientación y sentido entrada /
salida. Las flechas de flujo son líneas con uno o varios puntos y punta de
flecha; nunca se convierten en bloques de una celda.

## Modelo de datos compatible con lo existente

Se recomienda evolucionar `venue_maps` y `venue_map_elements` sin romper los
foros actuales:

```sql
venue_maps
  metadata.plan_type = 'exhibition_canvas'
  metadata.coordinate_system = 'metric' | 'imperial'
  metadata.width_units, metadata.height_units
  metadata.snap_grid, metadata.background_asset_id

venue_map_elements
  geometry jsonb       -- x, y, width, height, rotation, points[]
  style jsonb          -- fill, stroke, opacity, icon, label
  layer text            -- background, architecture, circulation, layout, annotation
  z_index integer
  locked boolean
  visible boolean
  parent_id uuid       -- grupos
```

Las columnas enteras `x`, `y`, `width`, `height` continúan siendo la fuente
compatibilidad para mapas de foro y el modo de cuadrícula de exposición. El
canvas nuevo usa `geometry` cuando `plan_type = 'exhibition_canvas'`. Las
asignaciones de empresas siguen vinculadas al `venue_map_elements.id`, por lo
que la persistencia de expositores no cambia.

Para el fondo se debe crear un registro de archivo del mapa con nombre, tipo,
tamaño, URL de Storage, hash y transformación de calibración. RLS debe validar
que el archivo pertenece a la misma organización del mapa; no se debe hacer
público el bucket completo.

## Flujo para el organizador

1. Crear plano: “Importar plano del recinto” o “Empezar vacío”.
2. Cargar PDF/imagen/SVG y calibrar una distancia.
3. Confirmar unidades, tamaño y orientación.
4. Bloquear la capa base.
5. Dibujar límites, columnas, salidas y pasillos sólo donde existan.
6. Colocar stands desde la biblioteca; elegir tamaño libre o plantilla.
7. Asignar empresa desde el inspector o desde “Expositores”.
8. Añadir puertas, control de acceso y flechas de flujo.
9. Revisar advertencias de seguridad y generar leyenda.
10. Guardar versión, duplicar alternativa y exportar PDF/PNG con escala.

## Reemplazo gradual del editor actual

1. Añadir modo `exhibition_canvas` y mantener `grid` como modo legado.
2. Extraer el viewport y la escena a componentes independientes del formulario
   actual (`CanvasViewport`, `SceneLayer`, `ElementInspector`).
3. Añadir importación de imagen/PDF y calibración.
4. Migrar stands y asignaciones existentes a `geometry` manteniendo sus IDs.
5. Añadir pasillos polilínea, puertas y flechas sin la regla de “una fila o
   columna completa”.
6. Incorporar DXF y control de layers cuando el modo de imagen esté estable.
7. Añadir exportación con leyenda, escala, norte, fecha y versión.

El criterio de aceptación es que un organizador pueda importar un recinto no
rectangular, colocar un pasillo diagonal o parcial, mover stands alrededor de
columnas y asignar empresas sin que el sistema cree filas/columnas automáticas
ni bloquee superposiciones legítimas.

