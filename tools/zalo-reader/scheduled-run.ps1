param([Parameter(Mandatory=$true)][string]$NodePath)
$ErrorActionPreference='Stop'
$readerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (![Environment]::UserInteractive -or [Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) { throw 'INTERACTIVE_WINDOWS_SESSION_REQUIRED' }
Push-Location $readerRoot
$readerExit=1
try {
  $cfg=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'production.config.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if(!$cfg.enabled) { exit 0 }
  # Node sanitizes URL/credential fields before printing. Logs stay local.
  $logDirectory=Join-Path $readerRoot '.zalo-reader/official/console'
  New-Item -ItemType Directory -Path $logDirectory -Force|Out-Null
  $logFile=Join-Path $logDirectory ((Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+$PID+'.log')
  & $NodePath --import tsx (Join-Path $PSScriptRoot 'official-runner.ts') --production --confirm-production *> $logFile
  $readerExit=$LASTEXITCODE
  # An overlapping wrapper is not a completed cycle and must not move the timer.
  $lockPath=Join-Path $readerRoot '.zalo-reader/official/reader.lock'
  $cfg=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'production.config.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if($cfg.enabled -and !(Test-Path -LiteralPath $lockPath)) {
    $task=Get-ScheduledTask -TaskName 'KimLan-ZaloReader-60m'
    if($task.Settings.Enabled) {
      $cycleFile=Join-Path $readerRoot '.zalo-reader/official/cycle-state.json'
      $nextAt=(Get-Date).AddMinutes(60)
      if(Test-Path -LiteralPath $cycleFile) {
        $cycle=Get-Content -LiteralPath $cycleFile -Raw -Encoding UTF8|ConvertFrom-Json
        $eligible=if($cycle.nextEligibleAt -is [DateTime]) { ([DateTimeOffset]$cycle.nextEligibleAt).LocalDateTime } else { [DateTimeOffset]::Parse([string]$cycle.nextEligibleAt,[Globalization.CultureInfo]::InvariantCulture).LocalDateTime }
        if($eligible -gt (Get-Date)) { $nextAt=$eligible }
      }
      $trigger=New-ScheduledTaskTrigger -Once -At $nextAt -RepetitionInterval (New-TimeSpan -Minutes 60)
      Set-ScheduledTask -TaskName 'KimLan-ZaloReader-60m' -Trigger $trigger|Out-Null
    }
  }
} finally { Pop-Location }
exit $readerExit
