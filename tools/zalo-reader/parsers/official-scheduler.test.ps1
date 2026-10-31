$ErrorActionPreference='Stop'
$readerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
foreach($name in @('scheduler.ps1','scheduled-run.ps1')) {
  $file=Join-Path $readerRoot ('tools/zalo-reader/'+$name)
  $parseErrors=$null;$parseTokens=$null
  [System.Management.Automation.Language.Parser]::ParseFile($file,[ref]$parseTokens,[ref]$parseErrors)|Out-Null
  if($parseErrors.Count){throw ($parseErrors|Out-String)}
}
# Execute the installer with mocked Task Scheduler cmdlets and -WhatIf.
# This validates the actual scheduling arguments without OS registration/API.
$global:ReaderScheduleAssertions=0
function Get-ScheduledTask { param($TaskName,$ErrorAction) return $null }
function New-ScheduledTaskAction { param($Execute,$Argument,$WorkingDirectory)
  if($Argument -notmatch '-WindowStyle Hidden' -or $Argument -match 'Bypass|password|secret'){throw 'Unsafe task action'}
  $global:ReaderScheduleAssertions++;return @{}
}
function New-ScheduledTaskTrigger { param([switch]$Once,$At,$RepetitionInterval)
  if(!$Once -or $RepetitionInterval.TotalMinutes -ne 60){throw 'Not an hourly trigger'}
  $global:ReaderScheduleAssertions++;return @{}
}
function New-ScheduledTaskPrincipal { param($UserId,$LogonType,$RunLevel)
  if($LogonType -ne 'Interactive' -or $RunLevel -ne 'Limited'){throw 'Not a current-user interactive task'}
  $global:ReaderScheduleAssertions++;return @{}
}
function New-ScheduledTaskSettingsSet { param([switch]$Disable,[switch]$StartWhenAvailable,$MultipleInstances,$ExecutionTimeLimit,[switch]$DisallowHardTerminate,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries)
  if(!$Disable -or !$StartWhenAvailable -or $MultipleInstances -ne 'Parallel' -or !$DisallowHardTerminate -or $ExecutionTimeLimit -ne [TimeSpan]::Zero){throw 'Unsafe task settings'}
  $global:ReaderScheduleAssertions++;return @{}
}
function Register-ScheduledTask { throw 'OFFLINE TEST MUST NOT REGISTER A TASK' }
$configPath=Join-Path $readerRoot 'tools/zalo-reader/production.config.json'
$configBefore=[IO.File]::ReadAllText($configPath)
& (Join-Path $readerRoot 'tools/zalo-reader/scheduler.ps1') -Action Install -WhatIf
if($global:ReaderScheduleAssertions -ne 4){throw 'Installer did not validate all scheduler objects'}
if([IO.File]::ReadAllText($configPath) -ne $configBefore){throw 'Offline test changed configuration'}
Write-Output 'Windows scheduler parser / disabled install / hourly interactive action: PASS (mocked, no OS writes)'

# Evaluate the wrapper's ACTUAL re-scheduling branch against mocked cmdlets.
$wrapperPath=Join-Path $readerRoot 'tools/zalo-reader/scheduled-run.ps1'
$wrapperAst=[System.Management.Automation.Language.Parser]::ParseFile($wrapperPath,[ref]$parseTokens,[ref]$parseErrors)
$reschedule=$wrapperAst.Find({param($node) $node -is [System.Management.Automation.Language.IfStatementAst] -and $node.Extent.Text.StartsWith('if($cfg.enabled')},$true)
if(!$reschedule){throw 'Completion schedule gate missing'}
$cfg=[pscustomobject]@{enabled=$true};$lockPath='fixture-lock';$global:FixtureLock=$false;$global:FixtureTaskEnabled=$true;$global:Rescheduled=0
function Test-Path {param($LiteralPath) return $LiteralPath -eq 'fixture-lock' -and $global:FixtureLock}
function Get-ScheduledTask {param($TaskName) return [pscustomobject]@{Settings=[pscustomobject]@{Enabled=$global:FixtureTaskEnabled}}}
function New-ScheduledTaskTrigger {param([switch]$Once,$At,$RepetitionInterval)
 if(!$Once -or $RepetitionInterval.TotalMinutes -ne 60 -or $At -lt (Get-Date).AddMinutes(59.9) -or $At -gt (Get-Date).AddMinutes(60.1)){throw 'Next scan is not 60 minutes after completion'}
 return @{}
}
function Set-ScheduledTask {param($TaskName,$Trigger) $global:Rescheduled++;return @{} }
& ([scriptblock]::Create($reschedule.Extent.Text))
if($global:Rescheduled -ne 1){throw 'Completion did not re-arm next scan'}
$global:FixtureLock=$true
& ([scriptblock]::Create($reschedule.Extent.Text))
$global:FixtureLock=$false;$global:FixtureTaskEnabled=$false
& ([scriptblock]::Create($reschedule.Extent.Text))
$cfg.enabled=$false;$global:FixtureTaskEnabled=$true
& ([scriptblock]::Create($reschedule.Extent.Text))
if($global:Rescheduled -ne 1){throw 'Overlap/disabled schedule was re-armed'}
Write-Output 'Completion +60 minutes / overlap / disabled gates: PASS (no task writes)'

$wrapperText=[IO.File]::ReadAllText($wrapperPath)
if($wrapperText -notmatch 'official-runner.ts.+--production --confirm-production' -or $wrapperText -match 'official.config.json') { throw 'Scheduled runs must use production config and flags' }
$schedulerText=[IO.File]::ReadAllText((Join-Path $readerRoot 'tools/zalo-reader/scheduler.ps1'))
if($schedulerText -notmatch "configPath=Join-Path.+production.config.json" -or $schedulerText -notmatch '--production --report-enabled') { throw 'Scheduler control must use the production API/config' }
Write-Output 'Production config / scheduled production flags / status control: PASS (offline)'
