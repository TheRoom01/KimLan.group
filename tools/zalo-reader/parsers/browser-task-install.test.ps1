$ErrorActionPreference='Stop'
$readerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$global:BrowserTaskRegistrations=@()
function Get-ScheduledTask {
  param($TaskName,$ErrorAction)
  if($TaskName -eq 'KimLan-ZaloReader-60m') {
    return [pscustomobject]@{Principal=[pscustomobject]@{UserId=[Security.Principal.WindowsIdentity]::GetCurrent().Name};Settings=[pscustomobject]@{Enabled=$false};Actions=@()}
  }
  return $null
}
function New-ScheduledTaskAction { param($Execute,$Argument,$WorkingDirectory)
  if([IO.Path]::GetFileName($Execute) -ne 'wscript.exe' -or $Argument -match 'Bypass|secret|password'){throw 'Unexpected task launcher'}
  return [pscustomobject]@{Execute=$Execute;Arguments=$Argument;WorkingDirectory=$WorkingDirectory}
}
function New-ScheduledTaskTrigger { param([switch]$Once,$At,$RepetitionInterval,[switch]$AtLogOn,$User) return @{} }
function New-ScheduledTaskPrincipal { param($UserId,$LogonType,$RunLevel)
  if($LogonType -ne 'Interactive' -or $RunLevel -ne 'Limited'){throw 'Browser must use the interactive Reader account'}
  return @{UserId=$UserId}
}
function New-ScheduledTaskSettingsSet { param([switch]$StartWhenAvailable,$MultipleInstances,$ExecutionTimeLimit,$Priority,[switch]$DisallowHardTerminate,[switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries)
  return @{MultipleInstances=$MultipleInstances;ExecutionTimeLimit=$ExecutionTimeLimit;DisallowHardTerminate=$DisallowHardTerminate.IsPresent}
}
function Register-ScheduledTask { param($TaskName,$Action,$Principal,$Settings,$Trigger,[switch]$Force)
  $global:BrowserTaskRegistrations+=@{Name=$TaskName;Action=$Action;Settings=$Settings;Trigger=$Trigger}
}
function Set-ScheduledTask { throw 'Offline test must not change real tasks' }
function Start-ScheduledTask { throw 'Installing must not start Zalo or scan messages' }
function Enable-ScheduledTask { throw 'Installing must not enable scans' }
& (Join-Path $readerRoot 'tools/zalo-reader/control-agent-install.ps1') -Action Upgrade -Confirm:$false
if($global:BrowserTaskRegistrations.Count -ne 3){throw 'Expected Control, Now and Browser tasks'}
$browser=@($global:BrowserTaskRegistrations | Where-Object {$_.Name -eq 'KimLan-ZaloReader-Browser'})[0]
if(!$browser -or $browser.Trigger -or $browser.Settings.ExecutionTimeLimit -ne [TimeSpan]::Zero -or $browser.Settings.MultipleInstances -ne 'IgnoreNew' -or !$browser.Settings.DisallowHardTerminate){throw 'Browser lifetime/overlap settings are unsafe'}
if($browser.Action.Arguments -notmatch 'hidden-task.vbs" Browser ".+node.exe"$' -or $browser.Action.WorkingDirectory -ne $readerRoot){throw 'Incorrect Browser host action'}
Write-Output 'Browser task upgrade: interactive owner, independent unlimited task, no triggers, no scan/start, IgnoreNew PASS (mocked, no OS writes)'
