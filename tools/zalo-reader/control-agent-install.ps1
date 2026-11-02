[CmdletBinding(SupportsShouldProcess=$true)]
param([ValidateSet('Install','Upgrade','Remove','Status')][string]$Action='Status')
$ErrorActionPreference='Stop'
$taskName='KimLan-ZaloReader-Control'
$immediateTaskName='KimLan-ZaloReader-Now'
. (Join-Path $PSScriptRoot 'scheduler-authorization.ps1')
. (Join-Path $PSScriptRoot 'hidden-task-action.ps1')
switch($Action) {
 {$_ -in @('Install','Upgrade')} {
   $existingControl=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
   if($existingControl -and $Action -eq 'Install'){throw 'Control task already exists; use Upgrade.'}
   $reader=Get-ScheduledTask -TaskName 'KimLan-ZaloReader-60m' -ErrorAction Stop
   $taskUser=[Security.Principal.WindowsIdentity]::GetCurrent()
   $ownerSid=([Security.Principal.NTAccount]$reader.Principal.UserId).Translate([Security.Principal.SecurityIdentifier]).Value
   if($ownerSid -ne $taskUser.User.Value){throw 'Use the Windows account that owns the Reader task.'}
   foreach($existingName in @($taskName,$immediateTaskName)){
     $existing=Get-ScheduledTask -TaskName $existingName -ErrorAction SilentlyContinue
     if($existing){
       $existingOwner=([Security.Principal.NTAccount]$existing.Principal.UserId).Translate([Security.Principal.SecurityIdentifier]).Value
       if($existingOwner -ne $taskUser.User.Value -or $existing.Actions.WorkingDirectory -ne [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))){throw 'Unexpected task owner or workspace; not modified.'}
     }
   }
   $actionDef=New-ReaderHiddenTaskAction -Mode Control
   $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
   $logonTrigger=New-ScheduledTaskTrigger -AtLogOn -User $taskUser.Name
   $principal=New-ScheduledTaskPrincipal -UserId $taskUser.Name -LogonType Interactive -RunLevel Limited
   $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -Priority 4 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
   if($PSCmdlet.ShouldProcess($taskName,'Install lightweight UI control polling every minute; does not launch a scan')){
     $readerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
     $cfg=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'production.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
     if($reader.Settings.Enabled -and $cfg.enabled){Save-ReaderResumeAuthorization $readerRoot}
     # Upgrade only the known Reader action; keep triggers and enabled state.
     $expectedWrapper=Join-Path $PSScriptRoot 'scheduled-run.ps1'
     $mainAction=@($reader.Actions)
     if($mainAction.Count -eq 1 -and [IO.Path]::GetFileName($mainAction[0].Execute) -eq 'powershell.exe' -and $mainAction[0].Arguments.Contains('"'+$expectedWrapper+'"')){
       $compatibleAction=New-ReaderHiddenTaskAction -Mode Hourly -NodePath (Get-Command node.exe -ErrorAction Stop).Source
       Set-ScheduledTask -TaskName 'KimLan-ZaloReader-60m' -Action $compatibleAction | Out-Null
     }
     $nodePath=(Get-Command node.exe -ErrorAction Stop).Source
     $immediateAction=New-ReaderHiddenTaskAction -Mode Immediate -NodePath $nodePath
     $immediateSettings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -DisallowHardTerminate -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
     Register-ScheduledTask -TaskName $immediateTaskName -Action $immediateAction -Principal $principal -Settings $immediateSettings -Force | Out-Null
     Register-ScheduledTask -TaskName $taskName -Action $actionDef -Trigger @($trigger,$logonTrigger) -Principal $principal -Settings $settings -Force | Out-Null
   }
 }
 'Remove' { if($PSCmdlet.ShouldProcess($taskName,'Remove UI control polling and on-demand task only')){Unregister-ScheduledTask -TaskName $taskName -Confirm:$false;Unregister-ScheduledTask -TaskName $immediateTaskName -Confirm:$false -ErrorAction SilentlyContinue} }
 'Status' {Get-ScheduledTask -TaskName $taskName,$immediateTaskName;Get-ScheduledTaskInfo -TaskName $taskName}
}
