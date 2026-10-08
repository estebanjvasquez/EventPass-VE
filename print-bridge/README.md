# EventosFácil Print Bridge

Servicio local para Windows que recibe credenciales desde `eventosfacil.net`, genera un PDF con medidas físicas exactas y lo envía silenciosamente a la cola de impresión seleccionada.

## Instalación y ejecución

En Windows, haz clic derecho sobre `instalar-windows.ps1` y elige **Ejecutar con PowerShell**. El instalador prepara el bridge, lo inicia de forma oculta y registra el arranque automático para el usuario actual. No requiere permisos de administrador.

Para una ejecución manual o para ver el diagnóstico en pantalla, haz doble clic en `iniciar-bridge.cmd`. Usa `desinstalar-inicio-automatico.ps1` si quieres retirar el inicio automático.

También puede iniciarse desde PowerShell:

```powershell
npm ci
npm run build
npm start
```

Al iniciarse muestra un **código de vinculación**. En EventosFácil abre **Acreditación → Estación de impresión**, introduce ese código y selecciona una impresora instalada en Windows.

El servicio escucha únicamente en `127.0.0.1:18181`, limita los orígenes admitidos y requiere el código local para consultar impresoras o crear trabajos. Los últimos 500 trabajos se conservan en `%USERPROFILE%\.eventosfacil-print-bridge` para diagnóstico. La versión 0.2 admite frente/reverso, calibración, copias, prioridad y cancelación de trabajos aún no enviados a Windows.
