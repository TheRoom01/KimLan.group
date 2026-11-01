# Retain authorization for resuming an already-enabled Reader after a UI Stop.
# Changing the Windows account, API target, profile or verified groups invalidates it.
function Get-ReaderResumeKey($ReaderRoot) {
  $cfg=Get-Content -LiteralPath (Join-Path $ReaderRoot 'tools/zalo-reader/production.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $verified=Get-Content -LiteralPath (Join-Path $ReaderRoot '.zalo-reader/official/verified-groups.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $ids=@()
  foreach($key in @('Gio-Hang-Can-Ho-Q1-Q3-Q10','Gio-Hang-Can-Ho-PN-BT-TB')) {
    $group=@($cfg.groups | Where-Object {$_.key -eq $key})
    if($group.Count -ne 1 -or !$verified.$key.groupId -or $group[0].groupId -ne $verified.$key.groupId){throw 'Verified group configuration changed.'}
    $ids+= $verified.$key.groupId
  }
  return (@([Security.Principal.WindowsIdentity]::GetCurrent().User.Value,$cfg.webBaseUrl,$cfg.profileDirectory)+$ids | ConvertTo-Json -Compress)
}
function Test-ReaderResumeAuthorization($ReaderRoot) {
  try {
    $saved=Get-Content -LiteralPath (Join-Path $ReaderRoot '.zalo-reader/official/ui-resume-authorization.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    return $saved.key -eq (Get-ReaderResumeKey $ReaderRoot)
  } catch {return $false}
}
function Save-ReaderResumeAuthorization($ReaderRoot) {
  $key=Get-ReaderResumeKey $ReaderRoot
  $file=Join-Path $ReaderRoot '.zalo-reader/official/ui-resume-authorization.json'
  $temp=$file+'.tmp'
  [IO.File]::WriteAllText($temp,(@{key=$key;authorizedAt=(Get-Date).ToUniversalTime().ToString('o')}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temp -Destination $file -Force
}
