$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
Remove-ItemProperty -Path $runKey -Name 'EventosFacilPrintBridge' -ErrorAction SilentlyContinue
Write-Host 'El inicio automatico de EventosFacil Print Bridge fue eliminado.' -ForegroundColor Green
