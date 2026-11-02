$ErrorActionPreference='Stop'
$readerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
. (Join-Path $PSScriptRoot '../node-process.ps1')
$fixture=Join-Path $readerRoot ('.zalo-reader/node-process-test-'+[Guid]::NewGuid().ToString()+'.ts')
$logFile=$fixture+'.log'
try {
  [IO.File]::WriteAllText($fixture, 'console.error("EXPECTED_WARNING"); setTimeout(() => { console.log("COMPLETED_AFTER_WARNING"); process.exitCode = 7; }, 250);')
  Push-Location $readerRoot
  try { $code=Invoke-ReaderNodeProcess -NodePath (Get-Command node.exe).Source -RunnerPath $fixture -LogFile $logFile }
  finally { Pop-Location }
  if($code -ne 7) { throw "Exit code not preserved: $code" }
  if([IO.File]::ReadAllText($logFile) -notmatch 'COMPLETED_AFTER_WARNING') { throw 'Child terminated on stderr' }
  if([IO.File]::ReadAllText($logFile+'.stderr.log') -notmatch 'EXPECTED_WARNING') { throw 'stderr not captured' }
  Write-Output 'PASS: native stderr does not terminate child; stdout/stderr captured; real exit code preserved (no network/browser)'
} finally {
  foreach($file in @($fixture,$logFile,($logFile+'.stderr.log'))) { if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file} }
}
