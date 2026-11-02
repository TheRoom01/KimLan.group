function New-ReaderHiddenTaskAction {
  param([Parameter(Mandatory=$true)][ValidateSet('Control','Hourly','Immediate')][string]$Mode, [string]$NodePath)
  $launcher=Join-Path $PSScriptRoot 'hidden-task.vbs'
  $readerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
  $arguments='//B //Nologo "'+$launcher+'" '+$Mode
  if($Mode -ne 'Control') {
    if(!$NodePath -or $NodePath.Contains('"')) { throw 'Invalid Node path' }
    $arguments+=' "'+$NodePath+'"'
  }
  New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32/wscript.exe') -Argument $arguments -WorkingDirectory $readerRoot
}
