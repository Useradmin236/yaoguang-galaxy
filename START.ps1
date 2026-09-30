param([switch]$Gallery, [int]$Port = 43178)
$ErrorActionPreference = 'Stop'
$previewRoot = $PSScriptRoot
$pythonCommand = Get-Command python -ErrorAction Stop
$previewUrl = 'http://127.0.0.1:' + $Port
New-Item -ItemType Directory -Path (Join-Path $previewRoot 'artifacts') -Force | Out-Null
try {
    $probe = Invoke-WebRequest -Uri ($previewUrl + '/index.html') -TimeoutSec 2
    $running = $probe.Content -match 'id="universe"'
} catch { $running = $false }
if (-not $running) {
    $previousPort = $env:PORT
    try {
        $env:PORT = [string]$Port
        Start-Process -FilePath $pythonCommand.Source -ArgumentList ('"' + (Join-Path $previewRoot 'server.py') + '"') -WorkingDirectory $previewRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $previewRoot 'artifacts/server.log') -RedirectStandardError (Join-Path $previewRoot 'artifacts/server-error.log')
    } finally { $env:PORT = $previousPort }
    $ready = $false
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $probe = Invoke-WebRequest -Uri ($previewUrl + '/index.html') -TimeoutSec 1
            if ($probe.Content -match 'id="universe"') { $ready = $true; break }
        } catch { }
    }
    if (-not $ready) { throw 'Preview failed to start. Check artifacts/server-error.log or choose another -Port.' }
}
if ($Gallery) { $previewUrl += '/gallery.html' }
Start-Process $previewUrl
