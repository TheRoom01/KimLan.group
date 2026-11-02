function Invoke-ReaderNodeProcess {
  param(
    [Parameter(Mandatory=$true)][string]$NodePath,
    [Parameter(Mandatory=$true)][string]$RunnerPath,
    [Parameter(Mandatory=$true)][string]$LogFile,
    [string[]]$RunnerArguments=@()
  )
  # Windows PowerShell 5 turns native stderr into terminating NativeCommandError
  # under ErrorActionPreference=Stop, even with *> redirection. Let Windows
  # redirect both streams directly so warnings cannot kill Node and its Chrome.
  if($RunnerPath.Contains('"')) { throw 'Invalid runner path' }
  $arguments=@('--import','tsx',('"'+$RunnerPath+'"'))+$RunnerArguments
  $child=Start-Process -FilePath $NodePath -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $LogFile -RedirectStandardError ($LogFile+'.stderr.log')
  return $child.ExitCode
}
