const fs=require('node:fs'),assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.SFMCFIX_PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'..'),A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.SFMCFIX_CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),headless:true,args:['--no-sandbox']});
 try{
 const ctx=await browser.newContext(),page=await ctx.newPage(),errors=[];let downloads=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('download',()=>downloads++);
 await ctx.route('https://**/*',route=>route.fulfill({contentType:'text/html',body:'<body><div id="dataExtension"><div class="repeater-records"><div class="repeater-header"><button class="btn btn-default export">Export</button></div><div class="repeater-pagination"><input class="repeater-secondaryPaging" value="1"></div></div></div></body>'}));
 await page.goto(`https://mc.s50.exacttarget.com/contactsmeta/admin.html#admin/data-extension/${A}/records/`);
 await page.addScriptTag({content:fs.readFileSync(process.env.SFMCFIX_JQUERY_PATH || (fs.existsSync('/usr/share/javascript/jquery/jquery.js') ? '/usr/share/javascript/jquery/jquery.js' : require.resolve('jquery/dist/jquery.js')),'utf8')});
 await page.evaluate(()=>{
 window.__scope='s50:123';window.__requests={};window.__notices=[];window.__revoked=[];window.__created=[];
 window.debounce=callback=>callback;
 window.sfmcfix={context:{current:()=>({scope:__scope})},local:{getItem:()=>null},retryjQ:callback=>callback(),notificationLogger:(_,__,message)=>__notices.push(message)};
 jQuery.ajaxTransport('+*',options=>({send:(_,complete)=>{__requests[options.fixture]={options,complete}},abort:()=>{}}));
 window.__request=(tag,id,{page=1,global=true,lower=false,data,updatePage=false}={})=>jQuery.ajax({url:`/contactsmeta/fuelapi/internal/v1/${lower?'customobjectdata':'CustomObjectData'}/${id}/?$page=${page}&$pagesize=200`,data,dataType:'json',global,fixture:tag,success:()=>{if(updatePage)document.querySelector('.repeater-secondaryPaging').value=page}});
 window.__complete=(tag,items,status=200)=>__requests[tag].complete(status,status===200?'OK':'error',{text:JSON.stringify({items,count:900000})},'Content-Type: application/json');
 const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=blob=>{const url=create(blob);__created.push(url);return url};URL.revokeObjectURL=url=>{__revoked.push(url);revoke(url)};
 });
 await page.addScriptTag({content:fs.readFileSync(process.env.SFMCFIX_DE_SOURCE || root+'/assets/js/contactbuilder/de.js','utf8')});
 const button=page.locator('#axportascsv');await button.waitFor();
 async function request(tag,id=A,options={}){await page.evaluate(({tag,id,options})=>{__request(tag,id,options);},{tag,id,options})}
 async function complete(tag,rows,status=200){await page.evaluate(({tag,rows,status})=>__complete(tag,rows,status),{tag,rows,status})}
 async function readCsv(){const ready=page.waitForEvent('download');await button.click();const download=await ready;return {name:download.suggestedFilename(),text:fs.readFileSync(await download.path(),'utf8')}}
 async function navigate(id){await page.evaluate(id=>new Promise(resolve=>{window.addEventListener('hashchange',()=>setTimeout(resolve,0),{once:true});location.hash='#admin/data-extension/'+id+'/records/';document.querySelector('.repeater-secondaryPaging').value='1'}),id)}
 await request('first');await complete('first',[{CardNumber:'A-only'}]);
 const first=await readCsv();assert.ok(first.text.includes('A-only'));
 await request('large-next');assert.equal(await button.isDisabled(),true,'A new page request must block stale CSV export while loading');
 await complete('large-next',[],503);assert.equal(await button.isDisabled(),true,'Failed page must not leave old records exportable');
 await request('mixed-case',A,{lower:true,global:false});const rows=Array.from({length:200},(_,i)=>({CardNumber:`B-${i}`,FirstName:i===199?'È | "ultimo"\nseconda riga':'Nome'}));await complete('mixed-case',rows);
 assert.equal(await button.isDisabled(),false);assert.ok((await button.getAttribute('title')).includes('200'));
 const csv=await readCsv();assert.ok(csv.text.includes('B-199'));assert.ok(!csv.text.includes('A-only'));assert.equal((csv.text.match(/"B-\d+"/g)||[]).length,200);
 assert.ok(csv.text.includes('"È | ""ultimo""\nseconda riga"'));assert.ok(csv.name.includes(A));
 await request('stress');const stress=Array.from({length:5000},(_,i)=>({CardNumber:`STRESS-${i}`,Value:'Dato È'.repeat(50)}));await complete('stress',stress);const large=await readCsv();assert.equal((large.text.match(/STRESS-/g)||[]).length,5000);assert.ok(!large.text.includes('B-199'));
 await request('older');await request('newest');await complete('newest',[{CardNumber:'newest'}]);await complete('older',[{CardNumber:'late-old'}]);
 assert.ok((await readCsv()).text.includes('newest'));assert.ok(!(await readCsv()).text.includes('late-old'));
 await page.evaluate(id=>{jQuery.ajax({url:`/contactsmeta/fuelapi/internal/v1/CustomObjectData/${id}/?$page=1`,fixture:'native-format',dataType:'json',success:data=>{data.items[0].CardNumber='formatted &amp; HTML'}});},A);await complete('native-format',[{CardNumber:'raw & original'}]);assert.ok((await readCsv()).text.includes('raw & original'));
 await request('page-two',A,{page:2,updatePage:true});await complete('page-two',[{CardNumber:'page-two-only'}]);assert.equal(await button.isDisabled(),false);const secondPage=await readCsv();assert.ok(secondPage.name.includes('page-2'));assert.ok(secondPage.text.includes('page-two-only'));await request('page-one',A,{page:1,updatePage:true});await complete('page-one',[{CardNumber:'page-one-again'}]);assert.equal(await button.isDisabled(),false);
 await request('late-A');await navigate(B);assert.equal(await button.isDisabled(),true);await request('B',B);await complete('B',[{CardNumber:'B-current'}]);await complete('late-A',[{CardNumber:'A-old'}]);
 assert.ok((await readCsv()).text.includes('B-current'));
 await request('old-B');await navigate(A);await navigate(B);await request('new-B',B);await complete('new-B',[{CardNumber:'B-second-visit'}]);await complete('old-B',[{CardNumber:'B-first-visit'}]);
 assert.ok((await readCsv()).text.includes('B-second-visit'));
 await request('before-BU',B);await page.evaluate(()=>{__scope='s50:999';window.dispatchEvent(new Event('sfmcfix:contextchange'))});assert.equal(await button.isDisabled(),true);await complete('before-BU',[{CardNumber:'previous-BU'}]);assert.equal(await button.isDisabled(),true);
 await request('after-BU',B);await complete('after-BU',[{CardNumber:'current-BU',Optional:null},{CardNumber:'=1+1',LaterField:'later'},{CardNumber:'-10',LaterField:'tail'}]);
 const safe=await readCsv();assert.ok(safe.text.includes('current-BU'));assert.ok(!safe.text.includes('previous-BU'));assert.ok(safe.text.includes('"\'=1+1"'));assert.ok(safe.text.includes('"\'-10"'));assert.ok(safe.text.includes('LaterField'));
 await request('empty',B);await complete('empty',[]);assert.equal(await button.isDisabled(),true);
 await request('malformed',B);await page.evaluate(()=>__requests.malformed.complete(200,'OK',{text:JSON.stringify({items:{bad:true}})},'Content-Type: application/json'));assert.equal(await button.isDisabled(),true);
 await request('cleanup',B);await complete('cleanup',[{CardNumber:'cleanup'}]);await readCsv();await page.waitForFunction(()=>__revoked.length===__created.length,{},{timeout:8000});
 assert.deepEqual(errors,[]);console.log('PASS CSV: current page only, 200 rows from large DE + 5000-row stress case, case-insensitive + global:false reads, loading/errors/empty/malformed block stale data, overlapping requests, A→B→A and BU guards, quoted values/union columns/formula protection, Blob URLs released. Downloads:',downloads);
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
