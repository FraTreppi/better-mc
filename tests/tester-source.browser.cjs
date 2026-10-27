const fs=require('node:fs'),assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'..'),id='00000000-0000-4000-8000-000000000001';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.SFMCFIX_CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),headless:true,args:['--no-sandbox']});
 try{
 const ctx=await browser.newContext({viewport:{width:1280,height:900}}),settings={'s50:123':{testers:[['Local','Mario','local@example.com']]}};
 const calls=[],errors=[];let fail=false,badRows=false,nested=false;
 await ctx.exposeBinding('readSettings',(_,key)=>structuredClone(key==='SFMCFIX---SETTINGS-V2'?settings:{}));
 await ctx.exposeBinding('mergeSettings',(_,key,patch)=>{for(const [scope,value]of Object.entries(patch))settings[scope]={...settings[scope],...value};return {[key]:structuredClone(settings)}});
 await ctx.addInitScript(()=>{
 window.__sendCount=0;window.__alerts=[];window.alert=m=>__alerts.push(m);
 window.sfmcfix={retryjQ:cb=>cb(),initAjaxHanlders:()=>{},addCss:()=>{},temp:{},ajax:{success:{},error:{},transport:{},prefilter:{}},storage:{getItem:key=>readSettings(key),mergeItem:(key,patch)=>mergeSettings(key,patch),onChange:()=>{}},
 addJs:(file,cb)=>{const s=document.createElement('script');s.src='/assets/js/'+file+'.js';s.onload=()=>cb?.();document.head.append(s)},
 addHtml:async(file,place,cb)=>{const html=await fetch('/assets/html/'+file+'.html').then(r=>r.text());document.body.insertAdjacentHTML('beforeend',html);cb(html)},notificationLogger:()=>{}};
 });
 await ctx.route('https://**/*',async route=>{
 const u=new URL(route.request().url()),p=u.pathname;
 if(p==='/jquery.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(process.env.SFMCFIX_JQUERY_PATH || (fs.existsSync('/usr/share/javascript/jquery/jquery.js') ? '/usr/share/javascript/jquery/jquery.js' : require.resolve('jquery/dist/jquery.js')))});
 if(p.startsWith('/assets/'))return route.fulfill({contentType:p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(root+p)});
 if(p.startsWith('/fuelapi/')){
 calls.push({url:u.href,method:route.request().method()});
 if(fail)return route.fulfill({status:403,contentType:'application/json',body:'{}'});
 let value;
 if(p.includes('/category/0'))value={count:1,items:[{id,name:'tester_content_builder',customerKey:'tester_content_builder',categoryId:11}]};
 else if(p.includes('/fullPath'))value={items:nested?[{id:10,parentId:0,categoryType:'dataextension',name:'Data Extensions'},{id:20,parentId:10,name:'Progetti'},{id:11,parentId:20,name:'SFMC_UI_Fixer'}]:[{id:10,parentId:0,categoryType:'dataextension',name:'Data Extensions'},{id:11,parentId:10,name:'SFMC_UI_Fixer'}]};
 else if(p.endsWith('/fields/'))value={fields:[{name:'Nome',type:'Text',maxLength:400},{name:'Cognome',type:'Text',maxLength:400},{name:'Email',type:'EmailAddress',isPrimaryKey:true}]};
 else if(p.includes('/customObjectData/'))value=badRows?{count:3,items:[{email:'not-email'},{nome:'Without address'},{Email:'a@example.com',email:'b@example.com'}]}:{count:10,items:Array.from({length:10},(_,i)=>{
 const values={nome:i===9?'<img src=x onerror="window.__xss=1">':'Tester '+i,cognome:'Team'};
 return i%2?{keys:{EMAIL:`tester${i}@example.com`},values}:{email:`tester${i}@example.com`,...values};
 })};
 else throw Error('Unknown endpoint '+p);
 return route.fulfill({contentType:'application/json',body:JSON.stringify(value)});
 }
 if(p==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:`<html><head><link rel="stylesheet" href="/assets/css/styles.css"></head><body><main id="preview-panel"><div class="test-send-recipients-tab-content"><div class="test-send-recipients-pillbox"><input class="pillbox-add-item"></div></div></main><button id="send-test" onclick="window.__sendCount++">Send Test</button><script src="/jquery.js"></script><script src="/assets/js/context.js"></script><script>sfmcfix.context.ready.then(()=>sfmcfix.addJs('contentbuilder/_index'))</script></body></html>`});
 throw Error('Unexpected request '+u.href);
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://content-builder.s50.marketingcloudapps.com/?mid=123');
 const trigger=page.getByRole('button',{name:'Impostazioni SFMC',exact:true});await trigger.waitFor();
 await trigger.click();await page.locator('[data-context-action="testers"]').click();
 const editor=page.locator('#sfmcfix-tester-editor');await editor.waitFor();
 await editor.locator('[data-tester-source]').selectOption('de');
 await page.waitForFunction(()=>document.querySelector('[data-tester-de-status]')?.textContent.startsWith('10 tester disponibili'));
 assert.equal(calls.length,4);assert.equal(await editor.locator('[data-tester-local]').isVisible(),false);
 assert.ok((await editor.locator('[data-tester-de-link]').getAttribute('href')).includes('/contactsmeta/admin.html#admin/data-extension/'+id));
 nested=true;
 await editor.getByRole('textbox',{name:'Percorso della cartella tester',exact:true}).fill('Progetti / SFMC_UI_Fixer');
 assert.equal(await editor.getByRole('button',{name:'Salva sorgente',exact:true}).isDisabled(),true);
 assert.equal(settings['s50:123'].testerFolderPath,undefined);
 await editor.getByRole('button',{name:'Verifica e carica DE',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-tester-de-status]').textContent.startsWith('10 tester disponibili'));
 await editor.getByRole('button',{name:'Salva sorgente',exact:true}).click();await page.waitForFunction(()=>sfmcfix.preferences.get().testerSource==='de');
 assert.deepEqual(settings['s50:123'].testerFolderPath,['Progetti','SFMC_UI_Fixer']);
 assert.equal(settings['s50:123'].testers[0][2],'local@example.com');assert.equal(settings['s50:123'].testerSource,'de');
 await editor.getByRole('button',{name:'Chiudi',exact:true}).click();
 await page.locator('.test-send-recipients-tab-content').hover();await page.locator('#tester-input').waitFor();
 await page.locator('#tester-input').fill('tester9');
 await page.waitForFunction(()=>document.querySelectorAll('.suggestion-list-item').length===1);
 assert.equal(await page.locator('.suggestion-list-item img').count(),0);assert.equal(await page.evaluate(()=>window.__xss||0),0);
 await page.locator('.suggestion-list-item').click();assert.equal(await page.locator('.pillbox-add-item').inputValue(),'tester9@example.com');assert.equal(await page.evaluate(()=>__sendCount),0);
 await trigger.click();await page.locator('[data-context-action="testers"]').click();await editor.waitFor();
 assert.equal(await editor.getByRole('textbox',{name:'Percorso della cartella tester',exact:true}).inputValue(),'Progetti / SFMC_UI_Fixer');
 await editor.getByRole('textbox',{name:'Percorso della cartella tester',exact:true}).fill('Altra / SFMC_UI_Fixer');
 await editor.getByRole('button',{name:'Verifica e carica DE',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-tester-de-status]').textContent.includes('Altra / SFMC_UI_Fixer'));
 assert.equal(await editor.getByRole('button',{name:'Salva sorgente',exact:true}).isDisabled(),true);
 assert.deepEqual(settings['s50:123'].testerFolderPath,['Progetti','SFMC_UI_Fixer']);
 await editor.getByRole('textbox',{name:'Percorso della cartella tester',exact:true}).fill('Progetti / SFMC_UI_Fixer');
 badRows=true;await editor.getByRole('button',{name:'Verifica e carica DE',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-tester-de-status]').textContent.startsWith('0 tester disponibili'));
 assert.equal(await editor.getByRole('button',{name:'Salva sorgente',exact:true}).isDisabled(),true);
 const invalid=await editor.locator('[data-tester-de-status]').textContent();assert.ok(invalid.includes('Email'));assert.ok(invalid.includes('ambigui'));assert.ok(!invalid.includes('Premi Salva sorgente'));
 badRows=false;
 fail=true;await editor.getByRole('button',{name:'Verifica e carica DE',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-tester-de-status]').textContent.includes('403'));
 assert.equal(await editor.getByRole('button',{name:'Salva sorgente',exact:true}).isDisabled(),true);
 await editor.getByRole('button',{name:'Annulla',exact:true}).click();
 await page.locator('#tester-input').fill('local');await page.waitForFunction(()=>document.querySelector('#sfmcfix-tester-search-status').textContent.includes('403'));
 assert.equal(await page.locator('.suggestion-list-item').count(),0);
 fail=false;await page.reload();await trigger.waitFor();assert.deepEqual(await page.evaluate(()=>sfmcfix.preferences.get().testerFolderPath),['Progetti','SFMC_UI_Fixer']);assert.equal(await page.evaluate(()=>sfmcfix.preferences.get().testerSource),'de');
 await page.locator('.test-send-recipients-tab-content').hover();await page.locator('#tester-input').waitFor();await page.locator('#tester-input').fill('Team');await page.waitForFunction(()=>document.querySelectorAll('.suggestion-list-item').length===5);
 await page.evaluate(()=>{history.replaceState(null,'','?mid=999');window.dispatchEvent(new Event('sfmcfix:contextchange'))});
 assert.equal(await page.locator('.suggestion-list-item').count(),0);
 assert.ok(calls.every(call=>call.method==='GET'));assert.deepEqual(errors,[]);
 console.log('PASS lowercase + keys/values record responses, all-invalid reasons disable saving; actual module chain + editor: editable nested tester path, re-verification before save, wrong/unsaved path blocked, persisted per BU after reload, DE verification, exact fields, saved source survives reload, local data preserved, safe search + recipient selection without sends, refresh failure blocks stale/local fallback, context clears suggestions. GET only.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
