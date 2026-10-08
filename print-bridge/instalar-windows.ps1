$ErrorActionPreference = 'Stop'
$bridgeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js LTS no esta instalado. Instalalo y vuelve a ejecutar este archivo.'
}

Push-Location $bridgeRoot
try {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar el bridge.' }
} finally {
  Pop-Location
}

$launcher = Join-Path $bridgeRoot 'iniciar-bridge.cmd'
$runCommand = "powershell.exe -NoProfile -WindowStyle Hidden -Command `"& '$launcher'`""
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
New-ItemProperty -Path $runKey -Name 'EventosFacilPrintBridge' -Value $runCommand -PropertyType String -Force | Out-Null

Start-Process -FilePath $launcher -WindowStyle Hidden
Write-Host 'EventosFacil Print Bridge instalado, iniciado y configurado para abrir con Windows.' -ForegroundColor Green
Write-Host 'Abre EventosFacil y pulsa Probar conexion en la estacion de impresion.'
