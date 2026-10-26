[CmdletBinding()]
param(
    [uri] $BaseUrl = 'https://personal-ai.philippbartsch748.workers.dev/',
    [switch] $Authenticated
)

$ErrorActionPreference = 'Stop'
if ($BaseUrl.Scheme -ne 'https' -and -not ($BaseUrl.Scheme -eq 'http' -and $BaseUrl.IsLoopback)) {
    throw 'Nur HTTPS oder lokales HTTP ist erlaubt.'
}
if ($BaseUrl.UserInfo -or $BaseUrl.Query -or $BaseUrl.Fragment) { throw 'Basis-URL darf keine Zugangsdaten, Query oder Fragment enthalten.' }
$base = $BaseUrl.GetLeftPart([UriPartial]::Authority)

function Invoke-PersonalAiHttp([string] $Url, [hashtable] $Headers = @{}) {
    $req = [System.Net.HttpWebRequest]::Create($Url)
    $req.Timeout = 20000
    $req.UserAgent = 'PersonalAiVerifier/1.0'
    foreach ($k in $Headers.Keys) { $req.Headers.Add($k, $Headers[$k]) }
    $status = 0
    $body = ""
    $contentType = ""
    try {
        $resp = $req.GetResponse()
        $status = [int]$resp.StatusCode
        $contentType = [string]$resp.ContentType
        $stream = $resp.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        $reader.Dispose(); $resp.Dispose()
    } catch {
        if ($_.Exception.InnerException -is [System.Net.WebException] -and $_.Exception.InnerException.Response) {
            $resp = $_.Exception.InnerException.Response
        } elseif ($_.Exception -is [System.Net.WebException] -and $_.Exception.Response) {
            $resp = $_.Exception.Response
        } else {
            throw $_
        }
        $status = [int]$resp.StatusCode
        $contentType = [string]$resp.ContentType
        $stream = $resp.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        $reader.Dispose(); $resp.Dispose()
    }
    return @{ Status = $status; ContentType = $contentType; Body = $body }
}

function Get-PersonalAiJson([string] $Path, [hashtable] $Headers = @{}) {
    $res = Invoke-PersonalAiHttp ($base + $Path) $Headers
    $data = $null
    if ($res.ContentType -like '*application/json*') {
        try { $data = $res.Body | ConvertFrom-Json } catch {}
    }
    return @{ Status = $res.Status; Data = $data }
}

$root = Invoke-PersonalAiHttp ($base + '/')
[pscustomobject]@{ Check = 'Oberfläche'; HttpStatus = [int]$root.Status; Detail = 'HTML: ' + ([string]$root.ContentType -like '*text/html*') }
$health = Get-PersonalAiJson '/api/health'
[pscustomobject]@{
    Check = 'Health'; HttpStatus = $health.Status
    Detail = if ($health.Data) { "Version: $($health.Data.version); D1-Bindung: $($health.Data.d1Configured); Anmeldung konfiguriert: $($health.Data.authConfigured)" } else { 'Kein Health-JSON; Anmeldung und Routing im Browser prüfen.' }
}
if (-not $Authenticated) {
    $denied = Get-PersonalAiJson '/api/memories'
    [pscustomobject]@{
        Check = 'Ohne Anmeldung'; HttpStatus = $denied.Status
        Detail = if ($denied.Status -in 401, 403) { 'Private API verweigert.' } elseif ($null -eq $denied.Data) { 'Kein API-JSON; Access-Anmeldung oder Routing im Browser prüfen.' } else { 'Unerwartete API-Antwort ohne Anmeldung; Zugriffsschutz prüfen.' }
    }
    Write-Host 'Nur öffentliche Erreichbarkeit geprüft. Kein Nachweis für D1-Inhalte oder eine echte Modellantwort.'
} else {
    $secureToken = Read-Host 'App-Token nur für diesen Prüflauf (verdeckte Eingabe)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try {
        $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $status = Get-PersonalAiJson '/api/status' @{ Authorization = 'Bearer ' + $plainToken }
        [pscustomobject]@{ Check = 'Angemeldeter Status'; HttpStatus = $status.Status; Detail = "Angemeldet: $($status.Data.authenticated); D1 bereit: $($status.Data.memoryReady); Modell konfiguriert: $($status.Data.modelConfigured)" }
        if (-not $status.Data) { Write-Host 'Möglicherweise Cloudflare-Access-Anmeldung nötig. Bitte im Browser prüfen.' }
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $plainToken = $null
        $secureToken.Dispose()
    }
}
Write-Host 'Es wurden keine Chat-Anfragen gesendet, Daten geschrieben oder GPUs gestartet.'
