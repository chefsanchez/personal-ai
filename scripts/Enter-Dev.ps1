[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $projectRoot

function Add-PersonalAiProcessPath([string] $Directory) {
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) { return }
    $segments = $env:PATH -split [IO.Path]::PathSeparator
    if ($segments -notcontains $Directory) {
        $env:PATH = $Directory + [IO.Path]::PathSeparator + $env:PATH
    }
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
$nodeReady = $false
if ($nodeCommand -and $npmCommand) {
    $nodeVersion = & $nodeCommand.Source --version
    $nodeReady = $LASTEXITCODE -eq 0 -and $nodeVersion -match '^v24\.'
}

if (-not $nodeReady) {
    $portableRoot = Join-Path $workspaceRoot '.tools'
    $portableNode = Get-ChildItem -LiteralPath $portableRoot -Directory -Filter 'node-v24.*-win-x64' -ErrorAction SilentlyContinue |
        Where-Object { (Test-Path -LiteralPath (Join-Path $_.FullName 'node.exe')) -and (Test-Path -LiteralPath (Join-Path $_.FullName 'npm.cmd')) } |
        Sort-Object { [version]($_.Name -replace '^node-v', '' -replace '-win-x64$', '') } -Descending |
        Select-Object -First 1
    if (-not $portableNode) {
        throw 'Node.js 24 LTS mit npm fehlt. Installiere die offizielle Windows-LTS-Version oder entpacke die geprüfte node-v24.*-win-x64-ZIP nach ../.tools/. Es wurde nichts global verändert.'
    }
    Add-PersonalAiProcessPath $portableNode.FullName
}

if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    $toolsGit = Join-Path $workspaceRoot '.tools\git\cmd'
    Add-PersonalAiProcessPath $toolsGit
}
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    $bundledGit = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd'
    Add-PersonalAiProcessPath $bundledGit
}
if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    throw 'Git fehlt. Installiere Git for Windows aus der offiziellen Quelle; GitHub-Anmeldung danach über git credential-manager github login --browser.'
}

$env:WRANGLER_LOG_PATH = Join-Path $projectRoot '.wrangler\logs'
$env:WRANGLER_SEND_METRICS = 'false'
Set-Location -LiteralPath $projectRoot
Write-Host "Personal AI: $projectRoot"
& node.exe --version
& npm.cmd --version
& git.exe --version
Write-Host 'Werkzeugpfade gelten nur in diesem PowerShell-Prozess. Start: npm.cmd run dev'
