const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium } = require('playwright');

async function main() {
  const mocks = {
    'next/link': `import React from 'react';export default ({children,...props})=><a {...props}>{children}</a>`,
    'next/image': `import React from 'react';export default ({fill,priority,unoptimized,loader,...props})=><img {...props}/>`,
    'next/dynamic': `export default ()=>()=>null`,
    '@/lib/supabase': `export const supabase={rpc:async()=>({data:null,error:null})}`,
  };
  const script = (await build({stdin:{contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Card from './components/RoomCard';
    const room={id:'fixture',room_code:'101',room_type:'Studio',house_number:'12',address:'Test',district:'Quận 3',price:6000000,status:'Đang trống',image_urls:['https://fixture.test/cover.png'],creator_admin_phone:'0901111111',creator_admin_name:'Admin tạo phòng',zalo_phone:'0903333333'};
    function App(){const[scenario,setScenario]=useState({level:1,user:'viewer',phone:'0902222222',name:'Admin đang xem',missing:false});window.setScenario=setScenario;return <Card key={JSON.stringify(scenario)} room={{...room,creator_admin_phone:scenario.missing?null:room.creator_admin_phone}} adminLevel={scenario.level} currentUserId={scenario.user} currentAdminPhone={scenario.phone} currentAdminName={scenario.name} onNavigate={()=>{}}/>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',logLevel:'silent',loader:{'.module.css':'empty'},define:{'process.env':'{}'},plugins:[{name:'offline',setup(b){b.onResolve({filter:/.*/},a=>a.path in mocks?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:process.cwd()}));}}]})).outputFiles[0].text;
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();await page.route('**/*',r=>r.abort());await page.setContent(`<div id="root"></div><script>${script}</script>`);
    for(const level of [1,2]) {
      await page.evaluate(level=>window.setScenario({level,user:'viewer',phone:'0902222222',name:'Admin đang xem'}),level);
      const button=page.getByRole('button',{name:'Liên hệ',exact:true});await button.waitFor();assert.equal(await button.getAttribute('title'),'Admin tạo phòng');await button.evaluate(b=>b.click());
      await page.locator('a[href="tel:0901111111"]').first().waitFor();assert.equal(await page.locator('a[href="tel:0902222222"]').count(),0);assert.equal(await page.locator('a[href="tel:0903333333"]').count(),0);
    }
    await page.evaluate(()=>window.setScenario({level:0,user:null,phone:'0904444444',name:'Admin tạo VIP'}));
    const vip=page.getByRole('button',{name:'Liên hệ',exact:true});await vip.waitFor();assert.equal(await vip.getAttribute('title'),'Admin tạo VIP');await vip.evaluate(b=>b.click());await page.locator('a[href="tel:0904444444"]').first().waitFor();assert.equal(await page.locator('a[href="tel:0901111111"]').count(),0);
    for(const level of [1,2]) {await page.evaluate(level=>window.setScenario({level,user:'viewer',phone:'0904444444',name:'VIP còn lưu',missing:true}),level);await page.waitForFunction(()=>!document.querySelector('.home-room-contact'));assert.equal(await page.getByRole('button',{name:'Liên hệ',exact:true}).count(),0);}
    await page.evaluate(()=>window.setScenario({level:0,user:null,phone:null,name:null}));const anon=page.getByRole('button',{name:'Liên hệ',exact:true});await anon.waitFor();await anon.evaluate(b=>b.click());await page.locator('a[href="tel:0967467587"]').first().waitFor();
    console.log('PASS: L1/L2 use room creator; VIP uses link creator; authenticated admin with stale VIP uses room creator; missing creator never uses viewer/landlord/VIP; public hotline unchanged.');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
