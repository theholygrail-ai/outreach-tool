<#
.SYNOPSIS
  Deploy all CDK stacks (Billing, Data, API) using the astro-invest AWS CLI profile.

.EXAMPLE
  .\scripts\deploy-aws.ps1
  .\scripts\deploy-aws.ps1 -Stacks "OutreachTool-Data","OutreachTool-Api"
#>
param(
  [string[]]$Stacks = @(),
  [string]$Profile = "astro-invest",
  [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"
$env:AWS_PROFILE = $Profile
$env:CDK_DEFAULT_REGION = $Region

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repoRoot
try {
  if ($Stacks.Count -eq 0) {
    npm run deploy:all -w infra
  } else {
    foreach ($s in $Stacks) {
      npm run deploy -w infra -- $s
    }
  }
} finally {
  Pop-Location
}

Write-Host "`nDone. Copy ApiFunctionUrl from the output and set VITE_API_URL on Vercel (no trailing slash)." -ForegroundColor Green
