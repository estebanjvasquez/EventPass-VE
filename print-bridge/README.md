# EventosFácil Print Bridge

Servicio local para Windows que recibe credenciales desde `eventosfacil.net`, genera un PDF con medidas físicas exactas y lo envía silenciosamente a la cola de impresión seleccionada.

## Instalación y ejecución

En Windows, haz doble clic en `iniciar-bridge.cmd`. La primera ejecución instala las dependencias y compila el servicio. Mantén la ventana abierta durante la acreditación.

También puede iniciarse desde PowerShell:

```powershell
npm ci
npm run build
npm start
```

Al iniciarse muestra un **código de vinculación**. En EventosFácil abre **Acreditación → Estación de impresión**, introduce ese código y selecciona una impresora instalada en Windows.

El servicio escucha únicamente en `127.0.0.1:18181`, limita los orígenes admitidos y requiere el código local para consultar impresoras o crear trabajos. Los últimos 500 trabajos se conservan en `%USERPROFILE%\.eventosfacil-print-bridge` para diagnóstico.
