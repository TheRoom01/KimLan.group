$ErrorActionPreference='Stop'
$readerRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
. (Join-Path $PSScriptRoot '../scheduler-authorization.ps1')
$fixture=Join-Path $readerRoot ('.zalo-reader/offline-control-auth/'+[guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path (Join-Path $fixture 'tools/zalo-reader'),(Join-Path $fixture '.zalo-reader/official') -Force | Out-Null
$keys=@('Gio-Hang-Can-Ho-Q1-Q3-Q10','Gio-Hang-Can-Ho-PN-BT-TB')
$cfg=@{webBaseUrl='https://example.test';profileDirectory='.zalo-reader/profile';groups=@(@{key=$keys[0];groupId='g123'},@{key=$keys[1];groupId='g456'})}
$verified=@{};$verified[$keys[0]]=@{groupId='g123'};$verified[$keys[1]]=@{groupId='g456'}
$configFile=Join-Path $fixture 'tools/zalo-reader/production.config.json'
$verifiedFile=Join-Path $fixture '.zalo-reader/official/verified-groups.json'
$cfg|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $configFile -Encoding UTF8
$verified|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $verifiedFile -Encoding UTF8
if(Test-ReaderResumeAuthorization $fixture){throw 'Fresh install must not inherit authorization'}
Save-ReaderResumeAuthorization $fixture
if(!(Test-ReaderResumeAuthorization $fixture)){throw 'Existing setup did not retain resume authorization'}
$cfg.webBaseUrl='https://other.test';$cfg|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $configFile -Encoding UTF8
if(Test-ReaderResumeAuthorization $fixture){throw 'Changed target must invalidate authorization'}
$cfg.webBaseUrl='https://example.test';$cfg.profileDirectory='.zalo-reader/different-profile';$cfg|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $configFile -Encoding UTF8
if(Test-ReaderResumeAuthorization $fixture){throw 'Changed profile must invalidate authorization'}
$cfg.profileDirectory='.zalo-reader/profile';$cfg|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $configFile -Encoding UTF8
$verified[$keys[0]].groupId='g999';$verified|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $verifiedFile -Encoding UTF8
if(Test-ReaderResumeAuthorization $fixture){throw 'Changed group identity must invalidate authorization'}
Write-Output 'Resume authorization: fresh install denied / saved setup accepted / changed API, profile, group rejected: PASS (fixture only)'
