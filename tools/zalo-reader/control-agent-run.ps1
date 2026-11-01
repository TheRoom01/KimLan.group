$ErrorActionPreference='Stop'
if (![Environment]::UserInteractive -or [Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) { throw 'INTERACTIVE_WINDOWS_SESSION_REQUIRED' }
$readerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location $readerRoot
try {
  $logDirectory=Join-Path $readerRoot '.zalo-reader/official/console'
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  $logFile=Join-Path $logDirectory ('control-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+$PID+'.log')
  & (Get-Command node.exe -ErrorAction Stop).Source --import tsx (Join-Path $PSScriptRoot 'control-agent.ts') *> $logFile
  exit $LASTEXITCODE
} finally { Pop-Location }
