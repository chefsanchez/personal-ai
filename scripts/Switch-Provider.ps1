<#
.SYNOPSIS
  Switches the Personal AI model provider between RunPod and OpenRouter.
.EXAMPLE
  .\scripts\Switch-Provider.ps1 -Provider runpod
  .\scripts\Switch-Provider.ps1 -Provider openrouter
  .\scripts\Switch-Provider.ps1 -Provider openrouter -ApiKey "sk-or-v1-..."
#>
[CmdletBinding()]
param(
  [ValidateSet('runpod', 'openrouter')]
  [string]$Provider,
  [string]$ApiKey,
  [string]$Model
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $Provider) {
  Write-Host "==========================================" -ForegroundColor Cyan
  Write-Host " Personal AI - Provider Switcher" -ForegroundColor Cyan
  Write-Host "==========================================" -ForegroundColor Cyan
  Write-Host "1) RunPod (vLLM Qwen 3.6 35B NVFP4)"
  Write-Host "2) OpenRouter (Qwen / Llama Pay-per-Token)"
  $choice = Read-Host "Wähle Anbieter (1 oder 2)"
  if ($choice -eq '1') { $Provider = 'runpod' }
  elseif ($choice -eq '2') { $Provider = 'openrouter' }
  else { Write-Error "Ungültige Auswahl."; exit 1 }
}

$TomlPath = Join-Path $Root "wrangler.toml"
$TomlContent = Get-Content $TomlPath -Raw

if ($Provider -eq 'runpod') {
  Write-Host "`n[+] Konfiguriere RunPod..." -ForegroundColor Green
  $BaseUrl = "https://f1cf2041wgp4d4-8000.proxy.runpod.net"
  $DefaultModel = "nvidia/Qwen3.6-35B-A3B-NVFP4"
  if (-not $Model) { $Model = $DefaultModel }

  $TomlContent = [regex]::Replace($TomlContent, '(?m)^VLLM_BASE_URL\s*=\s*".*"', "VLLM_BASE_URL = `"$BaseUrl`"")
  $TomlContent = [regex]::Replace($TomlContent, '(?m)^VLLM_MODEL\s*=\s*".*"', "VLLM_MODEL = `"$Model`"")
  Set-Content -Path $TomlPath -Value $TomlContent -NoNewline

  if ($ApiKey) {
    Write-Host "[+] Aktualisiere VLLM_API_KEY Secret..." -ForegroundColor Yellow
    $ApiKey | npx wrangler secret put VLLM_API_KEY
  }

  Write-Host "[+] Deploye Worker zu Cloudflare..." -ForegroundColor Cyan
  npx wrangler deploy --keep-vars
  Write-Host "`n[OK] Erfolgreich auf RunPod umgestellt!" -ForegroundColor Green
}
elseif ($Provider -eq 'openrouter') {
  Write-Host "`n[+] Konfiguriere OpenRouter..." -ForegroundColor Green
  $BaseUrl = "https://openrouter.ai/api/v1"
  $DefaultModel = "qwen/qwen3.6-35b-a3b"
  if (-not $Model) { $Model = $DefaultModel }

  $TomlContent = [regex]::Replace($TomlContent, '(?m)^VLLM_BASE_URL\s*=\s*".*"', "VLLM_BASE_URL = `"$BaseUrl`"")
  $TomlContent = [regex]::Replace($TomlContent, '(?m)^VLLM_MODEL\s*=\s*".*"', "VLLM_MODEL = `"$Model`"")
  Set-Content -Path $TomlPath -Value $TomlContent -NoNewline

  if (-not $ApiKey) {
    $ApiKey = Read-Host "Gib deinen OpenRouter API Key ein (oder Enter zum Überspringen, falls schon gesetzt)"
  }
  if ($ApiKey -and $ApiKey.Trim().Length -gt 0) {
    Write-Host "[+] Aktualisiere VLLM_API_KEY Secret..." -ForegroundColor Yellow
    $ApiKey.Trim() | npx wrangler secret put VLLM_API_KEY
  }

  Write-Host "[+] Deploye Worker zu Cloudflare..." -ForegroundColor Cyan
  npx wrangler deploy --keep-vars
  Write-Host "`n[OK] Erfolgreich auf OpenRouter umgestellt (Modell: $Model)!" -ForegroundColor Green
}
