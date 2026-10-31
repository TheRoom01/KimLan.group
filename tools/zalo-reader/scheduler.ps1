[CmdletBinding(SupportsShouldProcess=$true)]
param([ValidateSet('Install','Enable','Disable','Status','Run','Trial')][string]$Action='Status', [switch]$Confirmed)
$ErrorActionPreference='Stop'
$readerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$configPath=Join-Path $PSScriptRoot 'production.config.json'
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
function Get-NextReaderRun {
  $nextAt=(Get-Date).AddMinutes(2)
  $cycleFile=Join-Path $readerRoot '.zalo-reader/official/cycle-state.json'
  if(Test-Path -LiteralPath $cycleFile) {
    $cycle=Get-Content -LiteralPath $cycleFile -Raw -Encoding UTF8|ConvertFrom-Json
    if($cycle.runId -and $cycle.nextEligibleAt) {
      $eligible=if($cycle.nextEligibleAt -is [DateTime]) { ([DateTimeOffset]$cycle.nextEligibleAt).LocalDateTime } else { [DateTimeOffset]::Parse([string]$cycle.nextEligibleAt,[Globalization.CultureInfo]::InvariantCulture).LocalDateTime }
      if($eligible -gt $nextAt) { $nextAt=$eligible }
    }
  }
  return $nextAt
}
switch($Action) {
 'Install' {
   if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw 'Task already exists. Inspect Status; do not overwrite an active schedule.' }
   $wrapperPath=Join-Path $PSScriptRoot 'scheduled-run.ps1'
   $arguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$wrapperPath+'" -NodePath "'+$nodePath+'"'
   $taskAction=New-ScheduledTaskAction -Execute (Get-Command powershell.exe -ErrorAction Stop).Source -Argument $arguments -WorkingDirectory $readerRoot
   $trigger=New-ScheduledTaskTrigger -Once -At (Get-NextReaderRun) -RepetitionInterval (New-TimeSpan -Minutes 60)
   $principal=New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
   # Parallel wrappers only: the Node atomic PID lock logs and exits overlapping runs.
   # No forced termination of an in-progress browser/profile.
   $settings=New-ScheduledTaskSettingsSet -Disable -StartWhenAvailable -MultipleInstances Parallel -ExecutionTimeLimit ([TimeSpan]::Zero) -DisallowHardTerminate -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
   if ($PSCmdlet.ShouldProcess($taskName,'Register DISABLED hourly task for the current interactive user')) {
     Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
     Save-Enabled $false
     Write-Output 'Installed DISABLED. Enable requires a verified two-group run and user confirmation.'
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
   $completedPath=Join-Path $readerRoot '.zalo-reader/official/last-completed-run.json'
   if (!(Test-Path -LiteralPath $completedPath)) { $completedPath=Join-Path $readerRoot '.zalo-reader/official/cycle-state.json' }
   $cycle=Get-Content -LiteralPath $completedPath -Raw -Encoding UTF8|ConvertFrom-Json
   $reports=Get-ChildItem -LiteralPath (Join-Path $readerRoot '.zalo-reader/official/runs') -Filter '*.json' -ErrorAction SilentlyContinue |
     ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8|ConvertFrom-Json } |
     Where-Object { $report=$_; $report.groups.Count -eq 2 -and @($report.groups.groupKey|Sort-Object -Unique).Count -eq 2 -and @($report.groups|Where-Object { !$_.groupId -or !$_.coverageComplete -or !$_.finishedAt -or $verified.($_.groupKey).groupId -ne $_.groupId }).Count -eq 0 -and (
       ($report.mode -eq 'trial' -and @($report.groups|Where-Object { $_.counters.failed -gt 0 -or $_.status -notin @('idle','needs_review') }).Count -eq 0) -or
       ($report.mode -eq 'official' -and $cycle.runId -eq $report.runId -and $cycle.finishedAt -and @($report.groups|Where-Object { $_.status -eq 'login_required' }).Count -eq 0)
     ) }
   if (!$reports) { throw 'No completed two-group run with verified identity and coverage. Inspect reports before enabling.' }
   $task=Get-ScheduledTask -TaskName $taskName
   $ownerSid=([Security.Principal.NTAccount]$task.Principal.UserId).Translate([Security.Principal.SecurityIdentifier]).Value
   if ($ownerSid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value) { throw 'Use the Windows account that owns the Zalo profile/task.' }
   if ($PSCmdlet.ShouldProcess($taskName,'Enable hourly Reader after final user confirmation')) {
     Push-Location $readerRoot
     try {
       & $nodePath --import tsx $runnerPath --production --report-enabled
       if ($LASTEXITCODE -ne 0) { throw 'Status API unavailable; schedule remains disabled.' }
       Save-Enabled $true
       try {
         $trigger=New-ScheduledTaskTrigger -Once -At (Get-NextReaderRun) -RepetitionInterval (New-TimeSpan -Minutes 60)
         Set-ScheduledTask -TaskName $taskName -Trigger $trigger|Out-Null
         Enable-ScheduledTask -TaskName $taskName|Out-Null
       }
       catch {
         $enableFailure=$_
         Save-Enabled $false
         & $nodePath --import tsx $runnerPath --production --report-disabled
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
     try { & $nodePath --import tsx $runnerPath --production --report-disabled } finally { Pop-Location }
   }
 }
 'Status' { Get-ScheduledTask -TaskName $taskName; Get-ScheduledTaskInfo -TaskName $taskName }
 'Run' { if($PSCmdlet.ShouldProcess('Zalo Reader','Run ONE production scan')) { Push-Location $readerRoot; try { & $nodePath --import tsx $runnerPath --production } finally { Pop-Location } } }
 'Trial' { if($PSCmdlet.ShouldProcess('Zalo Reader','Authorized live trial of both groups; up to 10 NEW TEST Pending')) { Push-Location $readerRoot; try { & $nodePath --import tsx $runnerPath --trial } finally { Pop-Location } } }
}
