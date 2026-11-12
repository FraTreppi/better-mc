// Real bundled browser engine, dedicated SQL worker and settings UI; Salesforce/runtime are simulated.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SFMCFIX_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const config={mid:'123',stack:'s10',authUrl:'https://fixture.auth.marketingcloudapis.com/',clientId:'FICTIONAL_CLIENT',clientSecret:'FICTIONAL_SECRET',version:'v1'};
const escape=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const xml=value=>Object.entries(value).map(([key,value])=>Array.isArray(value)?value.map(v=>`<${key}>${xml(v)}</${key}>`).join(''):`<${key}>${value&&typeof value==='object'?xml(value):escape(value??'')}</${key}>`).join('');
const envelope=value=>`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${value}</s:Body></s:Envelope>`;
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Security-Policy',"script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'text/plain');res.end(fs.readFileSync(file));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port, browser=await chromium.launch({executablePath:process.env.SFMCFIX_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const ctx=await browser.newContext(),page=await ctx.newPage(),errors=[],calls=[];let tokens=0,broken=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error('Browser:',m.text());});
  await ctx.addInitScript(({base})=>{window.clockShift=0;const now=Date.now;Date.now=()=>now()+clockShift;window.chrome={runtime:{id:'fixture',getURL:p=>base+'/'+p,onMessage:{addListener:listener=>{window.engineCall=message=>new Promise(resolve=>listener({__sfmcfixDEEngine:true,...message},{id:'fixture',url:base+'/assets/js/background.js'},resolve));}}}};},{base});
  await ctx.route('https://**/*',async route=>{
   const req=route.request(),url=new URL(req.url()),body=req.postData()||'';
   const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST, OPTIONS'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   assert.equal(req.method(),'POST');assert.ok(!req.headers().cookie);calls.push({host:url.hostname,path:url.pathname,body});
   if(url.hostname==='fixture.auth.marketingcloudapis.com'){
    assert.equal(url.pathname,'/v2/token');assert.equal(JSON.parse(body).account_id,123);tokens++;
    return route.fulfill({headers,json:{access_token:'FICTIONAL_TOKEN',expires_in:1200,soap_instance_url:'https://fixture.soap.marketingcloudapis.com/'}});
   }
   assert.equal(url.hostname,'fixture.soap.marketingcloudapis.com');assert.equal(url.pathname,'/Service.asmx');
   const type=body.match(/<ObjectType>([^<]+)<\/ObjectType>/)?.[1];assert.ok(['DataExtension','QueryDefinition','Automation'].includes(type));
   let response;
   if(body.includes('DefinitionRequestMsg')){
    const fields={DataExtension:['ObjectID','CustomerKey','Name','Client.ID'],QueryDefinition:['ObjectID','CustomerKey','Name','QueryText','TargetUpdateType','DataExtensionTarget'],Automation:['ObjectID','ProgramID','Name','Status','AutomationTasks']}[type];
    response=envelope('<DefinitionResponseMsg><ObjectDefinition><IsRetrievable>true</IsRetrievable>'+fields.map(n=>`<Properties><Name>${n}</Name><IsRetrievable>true</IsRetrievable></Properties>`).join('')+'</ObjectDefinition></DefinitionResponseMsg>');
   }else{
    assert.match(body,/<ClientIDs><ID>123<\/ID>/);assert.match(body,/<QueryAllAccounts>false/);
    const data={DataExtension:[{ObjectID:id(1),CustomerKey:'customers',Name:'Customers'},{ObjectID:id(2),CustomerKey:'output',Name:'Output'}],QueryDefinition:[{ObjectID:id(10),CustomerKey:'q',Name:'Audience query',QueryText:broken?'invalid SQL':"SELECT * FROM [Customers] WHERE Email <> 'FROM [Fake]'",TargetUpdateType:'Overwrite',DataExtensionTarget:{ObjectID:id(2),CustomerKey:'output'}}],Automation:[{ObjectID:id(20),ProgramID:id(21),Name:'Daily Audience',Status:6,AutomationTasks:{AutomationTask:{Sequence:1,Activities:{AutomationActivity:{ActivityObject:{ObjectID:id(10)}}}}}}]}[type];
    response=envelope('<RetrieveResponseMsg><OverallStatus>OK</OverallStatus><RequestID>fixture</RequestID>'+data.map(v=>'<Results>'+xml(v)+'</Results>').join('')+'</RetrieveResponseMsg>');
   }
   return route.fulfill({headers,contentType:'text/xml',body:response});
  });
  await page.goto(base+'/assets/html/de-usage-offscreen.html');await page.waitForFunction(()=>typeof engineCall==='function');
  const call=message=>page.evaluate(message=>engineCall(message),message);
  const request={mid:'123',stack:'s10',configVersion:'v1',deId:id(1)};
  const configured=await call({action:'configure',config});if(!configured.ok)console.log({configured,calls:calls.map(c=>c.host+c.path),errors});assert.equal(configured.ok,true);assert.equal(tokens,1);
  assert.equal((await call({...request,action:'lookup'})).result.state,'building');
  async function ready(){for(let i=0;i<100;i++){const r=await call({...request,action:'lookup'});assert.equal(r.ok,true);if(r.result.state!=='building')return r.result;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Browser scan timed out');}
  let result=await ready();assert.equal(result.state,'ready');assert.equal(result.result.rows.length,1);
  assert.equal(result.result.rows[0].reads,true);assert.equal(result.result.rows[0].writes,false);assert.equal(result.result.rows[0].automation.name,'Daily Audience');assert.equal(result.result.rows[0].automation.step,'1');assert.equal(result.result.coverage.sources,true);
  assert.ok(!JSON.stringify(result).includes(config.clientSecret));assert.ok(!JSON.stringify(result).includes('QueryText'));assert.equal(tokens,1);
  await page.evaluate(()=>clockShift+=1200000);await call({...request,action:'refresh'});await ready();assert.equal(tokens,2);
  broken=true;await call({...request,action:'refresh'});result=await ready();assert.equal(result.result.coverage.sources,false);assert.equal(result.result.counts.sourceErrors,1);
  assert.equal((await call({...request,action:'lookup',mid:'999'})).result.state,'not-configured');
  await call({action:'clear'});assert.equal((await call({...request,action:'status'})).result.state,'not-configured');assert.deepEqual(errors,[]);
  const settings=await ctx.newPage();await settings.addInitScript(()=>{window.messages=[];window.savedApproval=false;window.chrome={runtime:{sendMessage:async message=>{messages.push(message);if(message.action==='approval')return {ok:true,result:{approved:savedApproval&&message.mid==='123'&&message.stack==='s10'}};if(message.action==='save')savedApproval=true;return {ok:true,result:message.action==='save'?{configured:true,mid:message.config.mid,stack:message.config.stack}:{configured:false}};}}};});
  await settings.goto(base+'/assets/html/de-usage-settings.html');
  for(const [field,value]of Object.entries(config).filter(([field])=>field!=='version'))await settings.locator('#'+field).fill(value);
  await settings.locator('#approveBU').check();await settings.getByRole('button',{name:'Salva e autorizza questa BU'}).click();
  await settings.waitForFunction(()=>document.querySelector('#status').textContent.includes('API configurate'));
  assert.equal(await settings.locator('#clientSecret').inputValue(),'');assert.equal(await settings.evaluate(()=>messages.find(m=>m.action==='save').approveBU),true);
  await settings.waitForFunction(()=>document.querySelector('#consent').hidden);
  await settings.locator('#clientSecret').fill(config.clientSecret);await settings.getByRole('button',{name:'Salva collegamento API',exact:true}).click();
  await settings.waitForFunction(()=>messages.filter(m=>m.action==='save').length===2);assert.equal(await settings.evaluate(()=>messages.filter(m=>m.action==='save').at(-1).approveBU),false);
  await settings.getByRole('button',{name:'Rimuovi credenziali API'}).click();await settings.waitForFunction(()=>document.querySelector('#status').textContent.includes('non ancora configurate'));
  await ctx.close();console.log('PASS browser engine: packaged offscreen bundle + real SQL worker, OAuth renewal without new approval, same MID SOAP reads, exact sources/targets/automation, partial parsing, clear, private settings and combined approval. Salesforce/runtime simulated.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
