# EventosFácil Print Bridge

Servicio local para Windows que recibe credenciales desde `eventosfacil.net`, genera un PDF con medidas físicas exactas y lo envía silenciosamente a la cola de impresión seleccionada.

## Instalación y ejecución

Descarga **Descargar conector para Windows** desde el **Centro de impresión → Estación de impresión**. Instala Node.js LTS y el controlador de tu impresora, y extrae el ZIP completo en una carpeta permanente antes de ejecutar el instalador. La instalación necesita conexión a Internet para descargar las dependencias.

En Windows, haz clic derecho sobre `instalar-windows.ps1` y elige **Ejecutar con PowerShell**. El instalador prepara el bridge, lo inicia de forma oculta y registra el arranque automático para el usuario actual. No requiere permisos de administrador.

Para una ejecución manual o para ver el diagnóstico en pantalla, haz doble clic en `iniciar-bridge.cmd`. Usa `desinstalar-inicio-automatico.ps1` si quieres retirar el inicio automático.

También puede iniciarse desde PowerShell:

```powershell
npm ci
npm run build
npm start
```

El instalador muestra un **código de vinculación** antes de cerrar. En EventosFácil abre **Centro de impresión → Estación de impresión**, introduce ese código, pulsa **Probar conexión** y selecciona una impresora instalada en Windows. También puedes consultar el campo `token` de `%USERPROFILE%\.eventosfacil-print-bridge\settings.json`. Para ver el diagnóstico en pantalla, detén primero el conector y ejecuta `iniciar-bridge.cmd`.

El servicio escucha únicamente en `127.0.0.1:18181`, limita los orígenes admitidos y requiere el código local para consultar impresoras o crear trabajos. La versión **0.3.0** deduplica envíos simultáneos, conserva los pendientes y sincroniza sus resultados aunque se cierre la página. La sincronización usa una autorización limitada al evento y estación, válida durante ocho horas; no contiene la sesión del usuario ni una clave de servicio. Abre el Centro de impresión para renovar la vinculación. Los datos locales se guardan en `%USERPROFILE%\.eventosfacil-print-bridge`; no compartas `settings.json` ni `cloud-links.json`.

Los trabajos ya aceptados por Windows no se cancelan desde el conector. Un timeout de la página conserva el trabajo pendiente y no autoriza reenviarlo. Después de una interrupción durante la impresión, comprueba la cola de Windows antes de reintentar. Frente/reverso, calibración, copias y prioridad se conservan por trabajo. Se imprime al tamaño del PDF, sin ajustar automáticamente a otro papel; selecciona el tamaño correcto en el controlador.

Para actualizar desde una versión anterior, espera a que termine la cola, detén el conector actual, extrae el nuevo ZIP en la carpeta permanente y ejecuta otra vez `instalar-windows.ps1`. Se conserva el código de vinculación. En cada ordenador que imprime debe instalarse la nueva versión.
