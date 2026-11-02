[CmdletBinding(SupportsShouldProcess=$true)]
param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'hidden-task-action.ps1')
$readerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$modes=@{'KimLan-ZaloReader-60m'='Hourly';'KimLan-ZaloReader-Control'='Control';'KimLan-ZaloReader-Now'='Immediate'}
$updates=@()
foreach($name in $modes.Keys) {
  $task=Get-ScheduledTask -TaskName $name -ErrorAction Stop
  $sid=([Security.Principal.NTAccount]$task.Principal.UserId).Translate([Security.Principal.SecurityIdentifier]).Value
  $actions=@($task.Actions)
  if($sid -ne $owner -or $actions.Count -ne 1 -or $actions[0].WorkingDirectory -ne $readerRoot) { throw "Unexpected owner or workspace: $name" }
  $action=$actions[0]
  $wrapper=Join-Path $PSScriptRoot $(if($modes[$name] -eq 'Control'){'control-agent-run.ps1'}else{'scheduled-run.ps1'})
  if([IO.Path]::GetFileName($action.Execute) -eq 'wscript.exe' -and $action.Arguments.Contains('"'+(Join-Path $PSScriptRoot 'hidden-task.vbs')+'" '+$modes[$name])) { continue }
  if([IO.Path]::GetFileName($action.Execute) -ne 'powershell.exe' -or !$action.Arguments.Contains('"'+$wrapper+'"')) { throw "Unexpected action: $name" }
  $nodePath=$null
  if($modes[$name] -ne 'Control') {
    if($action.Arguments -notmatch '-NodePath\s+"([^"]+)"') { throw "Missing Node path: $name" }
    $nodePath=$Matches[1]
  }
  $updates+=@{Task=$task;Action=(New-ReaderHiddenTaskAction -Mode $modes[$name] -NodePath $nodePath)}
}
foreach($update in $updates) {
  $task=$update.Task
  if($PSCmdlet.ShouldProcess($task.TaskName,'Replace console launcher only; preserve schedule, principal, settings and running scan')) {
    $backup=Join-Path $readerRoot ('.zalo-reader/official/task-backups/'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    Export-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath | Set-Content -LiteralPath (Join-Path $backup ($task.TaskName+'.xml')) -Encoding Unicode
    Set-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -Action $update.Action | Out-Null
    Write-Output ('Updated launcher: '+$task.TaskName)
  }
}
