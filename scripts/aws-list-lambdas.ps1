<#
.SYNOPSIS
  List Outreach Tool Lambda functions (filter by stack prefix).

.EXAMPLE
  .\scripts\aws-list-lambdas.ps1
#>
param([string]$Profile = "astro-invest")

$env:AWS_PROFILE = $Profile
aws lambda list-functions --query "Functions[?contains(FunctionName, 'OutreachTool') || contains(FunctionName, 'HttpApi') || contains(FunctionName, 'PipelineWorker')].{Name:FunctionName,Runtime:Runtime,LastModified:LastModified}" --output table
