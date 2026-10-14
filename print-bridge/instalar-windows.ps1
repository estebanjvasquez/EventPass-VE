$ErrorActionPreference = 'Stop'
$bridgeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js LTS no esta instalado. Instalalo y vuelve a ejecutar este archivo.'
}

$portInUse = Get-NetTCPConnection -LocalPort 18181 -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
  Write-Host 'El conector sigue activo. Espera a que termine la cola y detenlo antes de instalar o actualizar.' -ForegroundColor Yellow
  Read-Host 'Pulsa Enter para cerrar'
  exit 1
}

Push-Location $bridgeRoot
try {
  npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias.' }
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar el bridge.' }
} finally {
  Pop-Location
}

$nodePath = (Get-Command node).Source.Replace("'", "''")
$indexPath = (Join-Path $bridgeRoot 'dist\index.js').Replace("'", "''")
$escapedRoot = $bridgeRoot.Replace("'", "''")
$startCode = "Start-Process -FilePath '$nodePath' -ArgumentList '`"$indexPath`"' -WorkingDirectory '$escapedRoot' -WindowStyle Hidden"
$encodedStart = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($startCode))
$runCommand = "powershell.exe -NoProfile -WindowStyle Hidden -EncodedCommand $encodedStart"
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
New-ItemProperty -Path $runKey -Name 'EventosFacilPrintBridge' -Value $runCommand -PropertyType String -Force | Out-Null

Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-EncodedCommand', $encodedStart) -WindowStyle Hidden
Write-Host 'EventosFacil Print Bridge instalado, iniciado y configurado para abrir con Windows.' -ForegroundColor Green
Write-Host 'Abre EventosFacil y pulsa Probar conexion en la estacion de impresion.'
Write-Host 'Esperando el codigo de vinculacion...'
$settingsPath = Join-Path $env:USERPROFILE '.eventosfacil-print-bridge\settings.json'
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  if (Test-Path -LiteralPath $settingsPath) {
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    Write-Host "Codigo de vinculacion: $($settings.token)" -ForegroundColor Cyan
    break
  }
  Start-Sleep -Seconds 1
}
Write-Host "Puedes consultar el codigo en $settingsPath"
Read-Host 'Pulsa Enter para cerrar'
