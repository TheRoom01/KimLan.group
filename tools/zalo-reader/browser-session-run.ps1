param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'node-process.ps1')
if (![Environment]::UserInteractive -or [Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) { throw 'INTERACTIVE_WINDOWS_SESSION_REQUIRED' }
$readerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location $readerRoot
try {
  $logDirectory=Join-Path $readerRoot '.zalo-reader/official/console'
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  $logFile=Join-Path $logDirectory ('browser-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+$PID+'.log')
  $browserExit=Invoke-ReaderNodeProcess -NodePath $NodePath -RunnerPath (Join-Path $PSScriptRoot 'browser-session.ts') -LogFile $logFile
  exit $browserExit
} finally { Pop-Location }
