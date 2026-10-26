[CmdletBinding()]
param([switch] $ReinstallDependencies)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Enter-Dev.ps1')

$installNeeded = $ReinstallDependencies -or -not (Test-Path -LiteralPath 'node_modules' -PathType Container)
if (-not $installNeeded) {
    & npm.cmd ls --depth=0 --silent *> $null
    $installNeeded = $LASTEXITCODE -ne 0
}
if ($installNeeded) {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci ist fehlgeschlagen. Es wurde kein Cloud-Deployment gestartet.' }
} else {
    Write-Host 'Projektabhängigkeiten sind bereits vorhanden.'
}

$devVarsPath = Join-Path $projectRoot '.dev.vars'
if (-not (Test-Path -LiteralPath $devVarsPath)) {
    $randomBytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($randomBytes)
    $localToken = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $content = "# Nur lokales Entwicklungsgeheimnis. Nicht teilen oder committen.`nAPP_TOKEN=`"$localToken`"`n"
    $stream = [IO.File]::Open($devVarsPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($content)
        $stream.Write($bytes, 0, $bytes.Length)
    } finally {
        $stream.Dispose()
        $localToken = $null
        $content = $null
        [Array]::Clear($randomBytes, 0, $randomBytes.Length)
    }
    Write-Host '.dev.vars wurde neu angelegt; der lokale Token wird nicht ausgegeben. Bestehende Dateien werden nicht ersetzt.'
} else {
    Write-Host 'Vorhandene .dev.vars bleibt unverändert.'
}

& npm.cmd run db:local
if ($LASTEXITCODE -ne 0) { throw 'Lokale D1-Migration fehlgeschlagen. Keine entfernte Datenbank wurde verändert.' }
Write-Host 'Lokale Umgebung bereit. npm.cmd run dev startet ausschließlich den lokalen Worker.'
Write-Host 'Ein Modell wird nicht konfiguriert oder gestartet. Automatisierte Tests verwenden lokale Testantworten.'
