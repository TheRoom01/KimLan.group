import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const profile = path.join(root, '.zalo-reader/profile');
const escaped = profile.replaceAll("'", "''");
const busy = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$p='${escaped}';$busy=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'chrome.exe' -and $_.CommandLine -like ('*'+$p+'*') -and $_.CommandLine -notmatch '--type='}).Count;if($busy){exit 12};$l=Join-Path $p 'lockfile';if(Test-Path -LiteralPath $l){$h=[IO.File]::Open($l,'Open','ReadWrite','None');$h.Dispose()}`], { windowsHide: true });
const context = await chromium.launchPersistentContext(profile, { headless: true, serviceWorkers: 'block' });
try {
  await context.route('**/*', route => route.request().url().startsWith('https://chat.zalo.me/')
    ? route.fulfill({ contentType: 'text/html', body: '<title>Offline metadata diagnostic</title>' }) : route.abort());
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://chat.zalo.me/');
  const targetIds = JSON.parse(fs.readFileSync(path.join(root,'tools/zalo-reader/production.config.json'),'utf8')).groups.flatMap(group=>[group.groupId,group.accountGroupId].filter(Boolean));
  const result = await page.evaluate(async targetIds => {
    const read = request => new Promise((resolve, reject) => { request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error); });
    const output=[];
    for (const [ordinal,info] of (await indexedDB.databases()).entries()) {
      if (!/^zdb_/.test(info.name || '')) continue;
      const db = await read(indexedDB.open(info.name));
      try {
        const stores=[];
        for (const name of [...db.objectStoreNames].filter(n=>/message/i.test(n))) {
          const getStore=()=>db.transaction(name,'readonly').objectStore(name);
          const store=getStore();
          const indexes=[...store.indexNames].map(n=>({name:n,keyPath:store.index(n).keyPath}));
          const groups=[];
          if(store.indexNames.contains('userId_sendDttm_msgId')) {
            for (const id of targetIds) {
              const sample=await read(getStore().index('userId_sendDttm_msgId').openKeyCursor(IDBKeyRange.bound([id],[id,[]]),'prev'));
              const latest=sample ? Number(sample.key[1]) : null;
              const from=Date.now()-86400000,to=Date.now();
              const keyTime=time=>typeof sample?.key?.[1]==='string'?String(time):time;
              const count24h=sample?await read(getStore().index('userId_sendDttm_msgId').count(IDBKeyRange.bound([id,keyTime(from)],[id,keyTime(to),[]]))):0;
              groups.push({id,hasSample:!!sample,keyTypes:sample?.key?.map(x=>typeof x),latestTimestamp:latest,latestTime:latest?new Date(latest).toISOString():null,count24h});
            }
          }
          stores.push({name,count:await read(getStore().count()),indexes,groups});
        }
        const namedGroups=[];
        for(const name of ['group','group_info']) {
          if(!db.objectStoreNames.contains(name)) continue;
          await new Promise((resolve,reject)=>{
            const request=db.transaction(name,'readonly').objectStore(name).openCursor();
            request.onerror=()=>reject(request.error);
            request.onsuccess=()=>{
              const cursor=request.result;if(!cursor){resolve();return;}
              const normalized=JSON.stringify(cursor.value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
              if(['giohangcanhoq1q3q10','giohangcanhopnbttb'].some(n=>normalized.includes(n))) {
                const value=cursor.value;
                namedGroups.push({store:name,key:cursor.primaryKey,fields:Object.keys(value),ids:Object.fromEntries(Object.entries(value).filter(([k,v])=>/^(groupId|id|grid|gid)$/i.test(k)&&typeof v==='string'&&/^g?\d{10,30}$/.test(v)))});
              }
              cursor.continue();
            };
          });
        }
        output.push({databaseOrdinal:ordinal,namedGroups,stores});
      } finally { db.close(); }
    }
    return output;
  }, targetIds);
  console.log(JSON.stringify(result,null,2));
} finally { await context.close(); }
