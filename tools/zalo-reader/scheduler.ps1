[CmdletBinding(SupportsShouldProcess=$true)]
param([ValidateSet('Install','Enable','Disable','Status','Run','Trial')][string]$Action='Status', [switch]$Confirmed)
$ErrorActionPreference='Stop'
$readerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$configPath=Join-Path $PSScriptRoot 'official.config.json'
$taskName='KimLan-ZaloReader-60m'
$nodePath=(Get-Command node.exe -ErrorAction Stop).Source
$runnerPath=Join-Path $PSScriptRoot 'official-runner.ts'
$taskUser=[Security.Principal.WindowsIdentity]::GetCurrent().Name
function Save-Enabled([bool]$value) {
  $cfg=Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $cfg.enabled=$value
  $tmpPath=$configPath+'.tmp'
  [IO.File]::WriteAllText($tmpPath,($cfg|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $tmpPath -Destination $configPath -Force
}
switch($Action) {
 'Install' {
   if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Task already exists. Inspect Status; do not overwrite an active schedule.' }
   $wrapperPath=Join-Path $PSScriptRoot 'scheduled-run.ps1'
   $arguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$wrapperPath+'" -NodePath "'+$nodePath+'"'
   $taskAction=New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument $arguments -WorkingDirectory $readerRoot
   $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 60)
   $principal=New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
   # Parallel wrappers only: the Node atomic PID lock logs and exits overlapping runs.
   # No forced termination of an in-progress browser/profile.
   $settings=New-ScheduledTaskSettingsSet -Disable -StartWhenAvailable -MultipleInstances Parallel -ExecutionTimeLimit ([TimeSpan]::Zero) -DisallowHardTerminate -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
   if ($PSCmdlet.ShouldProcess($taskName,'Register DISABLED hourly task for the current interactive user')) {
     Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
     Save-Enabled $false
     Write-Output 'Installed DISABLED. Enable requires a successful two-group live trial and final confirmation.'
   }
 }
 'Enable' {
   if (!$Confirmed) { throw 'Final user confirmation required: -Confirmed' }
   $verifiedPath=Join-Path $readerRoot '.zalo-reader/official/verified-groups.json'
   if (!(Test-Path -LiteralPath $verifiedPath)) { throw 'Both group IDs must first be verified in the authorized live trial.' }
   $verified=Get-Content -LiteralPath $verifiedPath -Raw -Encoding UTF8|ConvertFrom-Json
   foreach($key in @('Gio-Hang-Can-Ho-Q1-Q3-Q10','Gio-Hang-Can-Ho-PN-BT-TB')) {
     if (!$verified.$key.groupId) { throw 'Both groups must be verified.' }
   }
   $reports=Get-ChildItem -LiteralPath (Join-Path $readerRoot '.zalo-reader/official/runs') -Filter '*.json' -ErrorAction SilentlyContinue |
     ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8|ConvertFrom-Json } |
     Where-Object { $_.mode -eq 'trial' -and $_.groups.Count -eq 2 -and @($_.groups|Where-Object { !$_.groupId -or !$_.coverageComplete -or $_.counters.failed -gt 0 -or $_.status -notin @('idle','needs_review') }).Count -eq 0 }
   if (!$reports) { throw 'No completed two-group trial with verified coverage and zero failures. Inspect reports before enabling.' }
   $task=Get-ScheduledTask -TaskName $taskName
   if ($task.Principal.UserId -ne $taskUser) { throw 'Use the Windows account that owns the Zalo profile/task.' }
   if ($PSCmdlet.ShouldProcess($taskName,'Enable hourly Reader after final user confirmation')) {
     Push-Location $readerRoot
     try {
       & $nodePath --import tsx $runnerPath --report-enabled
       if ($LASTEXITCODE -ne 0) { throw 'Status API unavailable; schedule remains disabled.' }
       Save-Enabled $true
       try { Enable-ScheduledTask -TaskName $taskName|Out-Null }
       catch {
         $enableFailure=$_
         Save-Enabled $false
         & $nodePath --import tsx $runnerPath --report-disabled
         throw $enableFailure
       }
     } finally { Pop-Location }
   }
 }
 'Disable' {
   if ($PSCmdlet.ShouldProcess($taskName,'Disable future runs; leave any running Reader to finish safely')) {
     Disable-ScheduledTask -TaskName $taskName|Out-Null
     Save-Enabled $false
     Push-Location $readerRoot
     try { & $nodePath --import tsx $runnerPath --report-disabled } finally { Pop-Location }
   }
 }
 'Status' { Get-ScheduledTask -TaskName $taskName; Get-ScheduledTaskInfo -TaskName $taskName }
 'Run' { if($PSCmdlet.ShouldProcess('Zalo Reader','Run ONE official scan')) { Push-Location $readerRoot; try { & $nodePath --import tsx $runnerPath } finally { Pop-Location } } }
 'Trial' { if($PSCmdlet.ShouldProcess('Zalo Reader','Authorized live trial of both groups; up to 10 NEW TEST Pending')) { Push-Location $readerRoot; try { & $nodePath --import tsx $runnerPath --trial } finally { Pop-Location } } }
}
