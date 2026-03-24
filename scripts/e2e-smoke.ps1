<#
.SYNOPSIS
  Smoke-test the deployed Lambda API (health, prospects, settings).

.EXAMPLE
  .\scripts\e2e-smoke.ps1 -BaseUrl "https://xxxx.lambda-url.us-east-1.on.aws"
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

$paths = @(
  "/api/health",
  "/api/health/ready",
  "/api/prospects",
  "/api/prospects?visibility=default",
  "/api/prospects?visibility=all",
  "/api/pipeline/stats",
  "/api/pipeline/status",
  "/api/pipeline/runs",
  "/api/activity?limit=5",
  "/api/bookings",
  "/api/tools/status",
  "/api/settings"
)

foreach ($p in $paths) {
  $uri = "$BaseUrl$p"
  Write-Host "GET $uri" -ForegroundColor Cyan
  try {
    $r = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 60
    Write-Host "  $($r.StatusCode) $($r.Content.Substring(0, [Math]::Min(200, $r.Content.Length)))..." -ForegroundColor Green
  } catch {
    Write-Host "  FAILED: $_" -ForegroundColor Red
    exit 1
  }
}
Write-Host "`nSmoke tests passed." -ForegroundColor Green
