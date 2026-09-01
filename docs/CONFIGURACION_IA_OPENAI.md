# Configuración segura de IA para el plano de foros

Esta función usa OpenAI únicamente desde el Worker `eventpass-api`. La clave **no se coloca en el frontend**, en una variable `VITE_*`, en una migración ni en Git. El navegador envía la instrucción del organizador al Worker autenticado. OpenAI interpreta capacidad, pasillos y accesos; después, un motor determinista de EventPass calcula todas las coordenadas, comprueba capacidad y colisiones, y devuelve una propuesta editable. El organizador decide si la aplica.

## Antes de comenzar

1. En la plataforma de OpenAI crea un proyecto exclusivo para EventPass (por ejemplo, `eventpass-produccion`).
2. Configura un límite de gasto y alertas en ese proyecto.
3. Crea una API key de proyecto para el Worker. No uses una clave de administración de la organización.
4. Guárdala en un gestor de contraseñas. La clave se muestra una sola vez: no la pegues en un chat, documento, ticket ni repositorio.

La configuración actual usa `gpt-5.4-mini` para interpretar instrucciones del
plano de foros y `gpt-5.4` para visión de blueprints de exposición. Se controlan
con `OPENAI_FORUM_MODEL` y `OPENAI_VISION_MODEL`; `OPENAI_MODEL` queda como
respaldo común. La clave sigue siendo secreta.

El Worker reintenta una vez únicamente los errores transitorios recomendados
por OpenAI (timeout, conflicto, límite temporal y errores 5xx). Los errores de
clave, cuota, modelo o formato no se reintentan y se muestran con un código
diagnóstico seguro, sin revelar la respuesta ni la API key.

## Producción: cargar la clave en Cloudflare

Abre PowerShell en la carpeta `backend` y ejecuta este comando. Wrangler solicitará el valor de forma interactiva: escribe o pega la clave **sólo cuando el programa la solicite**. No pongas la clave después de `put`, ni la pases como argumento.

```powershell
cd C:\Proyectos\Github\EventPass-VE\backend
npx wrangler secret put OPENAI_API_KEY
```

Si una clave se usó por error como nombre del secreto, debe revocarse y regenerarse inmediatamente: los nombres de secretos son visibles para quienes pueden administrar el Worker.

Después, verifica sólo el nombre del secreto y despliega el Worker:

```powershell
npx wrangler secret list
npm run deploy
```

`wrangler secret list` debe mostrar `OPENAI_API_KEY`, pero nunca su valor. El secreto queda disponible sólo como `c.env.OPENAI_API_KEY` dentro del Worker.

## Desarrollo local

Crea manualmente `backend/.dev.vars` (este archivo está ignorado por Git) con una sola línea:

```text
OPENAI_API_KEY=pega_aqui_tu_clave_local
```

No copies ese archivo a producción, no lo subas y no uses `VITE_OPENAI_API_KEY`. Para probar localmente, inicia el Worker desde `backend` con `npm run dev` y mantén la URL del Worker en `frontend/.env` como `VITE_API_URL`.

## Qué protege la implementación

- Sólo un `owner`, `admin` de la organización o superadministrador autenticado puede pedir o aplicar una propuesta.
- La API de OpenAI se llama desde el Worker; la clave nunca viaja al navegador.
- La respuesta de OpenAI es una intención compacta en JSON estructurado; OpenAI no genera coordenadas ni registros de sillas.
- El motor determinista del Worker genera el plano, comprueba límites, capacidad exacta y colisiones. La RPC de Supabase vuelve a validarlo antes de guardar.
- La IA entrega una propuesta; no guarda nada hasta que el organizador pulsa **Aplicar al plano**.
- Si hay sillas reservadas o confirmadas, no permite reemplazar el plano con IA.
- El mensaje se limita a 1.600 caracteres y no debe incluir datos de asistentes. Se envía únicamente información geométrica del recinto.
- La llamada usa `store: false`. Aun así, el equipo responsable debe revisar los controles de datos y retención de OpenAI antes de enviar información sensible.

## Uso por el organizador

1. Abra **Administrar evento → Asientos**.
2. En **Asistente de plano con IA**, describa el montaje. Ejemplo: “Crea un plano para un foro con escenario para 180 personas, pasillo central vertical, un pasillo delante y otro detrás, y entradas laterales”.
3. Puede partir de uno de los ejemplos visibles o escribir su propia instrucción. Indique siempre la capacidad.
4. Pulse **Crear propuesta** o **Proponer modificación**.
5. Revise la interpretación, la capacidad exacta, el tamaño y el número de pasillos/accesos.
6. Pulse **Aplicar al plano** sólo si el resultado representa el montaje. Después se puede mover, renombrar, añadir o eliminar elementos manualmente.

Al eliminar un pasillo desde el editor, el sistema cierra ese espacio y actualiza la posición física de las sillas posteriores. Al reducir filas o columnas, el sistema reubica elementos sin borrar reservas.

## Requisito de base de datos y despliegue

En un entorno nuevo, aplique en orden las migraciones `20260830113712`, `20260830114000` y `20260830114100` de `infra/supabase/migrations/`. Después despliegue el Worker y el frontend por el flujo habitual. Estas migraciones ya fueron aplicadas en el proyecto de producción de EventPass el 30 de agosto de 2026.

## MVP: importar un plano de exposición con IA

El editor de exposiciones admite un segundo flujo independiente del plano de foro. El administrador puede cargar un **PNG, JPG o PDF de una sola página**, conservarlo como blueprint y convertirlo en elementos editables con IA.

1. Abra el evento y entre en **Plano de exposiciones**.
2. Cree o abra un plano vacío y sin publicar.
3. Pulse **Cargar blueprint** y seleccione un PNG, JPG o PDF de hasta 10 MB.
4. Pulse **Analizar con IA**. En ese momento el archivo se envía a OpenAI; no se envía automáticamente al cargarlo.
5. Revise las cajas superpuestas: verde indica una detección segura y ámbar indica baja confianza o conflicto.
6. Desmarque los elementos incorrectos. Si dos stands seleccionados se superponen, el sistema impedirá aplicar la propuesta.
7. Pulse **Aplicar elementos**. Los objetos quedan disponibles en el editor manual para moverlos, redimensionarlos, renombrarlos o eliminarlos.

Límites deliberados del MVP:

- Sólo procesa la primera página del PDF. El navegador la renderiza como PNG
  antes del análisis para conservar la correlación espacial; OpenAI no recibe
  el PDF como documento de texto.
- Sólo aplica sobre un plano vacío, sin stands ni asignaciones existentes.
- Nunca publica el plano ni reemplaza contenido automáticamente.
- SVG y DXF siguen disponibles como blueprint manual, pero no se envían a la IA.
- La detección reconoce stands, pasillos, accesos, salidas, escenario, baños, servicios, paredes, columnas e información.
- Cada stand debe detectarse individualmente. El backend descarta cajas que
  representen filas, franjas, áreas o grupos de stands.
- Las coordenadas de la IA se normalizan y ajustan a la escala métrica antes de guardarse.

La migración requerida es `20260830150000_ai_exhibition_import_mvp.sql`. Crea el bucket privado `floorplan-sources`, la tabla protegida `venue_map_imports` y la RPC transaccional `apply_ai_exhibition_import`. Fue aplicada en producción el 30 de agosto de 2026.
