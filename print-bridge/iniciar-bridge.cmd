@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js no esta instalado. Instala Node.js LTS y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando EventosFacil Print Bridge...
  call npm ci
  if errorlevel 1 goto error
)

call npm run build
if errorlevel 1 goto error

echo.
echo Mantenga esta ventana abierta durante la acreditacion.
node dist/index.js
exit /b %errorlevel%

:error
echo.
echo No se pudo iniciar el bridge. Revise el mensaje anterior.
pause
exit /b 1
