// TEST-ONLY: independent SQL + official MCP SDK checks. Disposable database/role
// only; never reads .env or operates on crm_local. No real provider writes.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('..',import.meta.url));
const browserChecks=process.argv.includes('--browser');
const require=createRequire(path.join(repo,'package.json'));
const {Pool}=require('pg');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
let chromium;
if(browserChecks){const modulePath=process.env.INTEGRATION_QA_PLAYWRIGHT_MODULE||'playwright';try{({chromium}=createRequire(import.meta.url)(modulePath));}catch{throw new Error('Browser checks require installed Playwright or INTEGRATION_QA_PLAYWRIGHT_MODULE.');}}
const artifactsRoot=process.env.INTEGRATION_QA_ARTIFACTS||path.join((await import('node:os')).tmpdir(),'crm-business-qa-'+process.pid);
if(browserChecks)await (await import('node:fs/promises')).mkdir(artifactsRoot,{recursive:true});
const suffix=process.pid+'_'+Date.now(), database='business_independent_'+suffix, role='business_qa_'+suffix;
const dbPassword='FixtureOnly!'+randomBytes(20).toString('hex');
const container='crm-joliefam-local-postgres';
const sqlAdmin=(sql)=>{const r=spawnSync('docker',['exec',container,'psql','-U','crm_local','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',sql],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error('Fixture admin command failed');return r.stdout;};
const freePort=async()=>{const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(r=>server.close(r));return port;};
const dbUrl='postgres://'+role+':'+encodeURIComponent(dbPassword)+'@127.0.0.1:55432/'+database;
let pool,api,frontend,browser,port,base,created=false,logs='';
const checks=[];
const pass=(name)=>{checks.push(name);console.log('PASS '+name)};
const stopApi=async()=>{if(api&&api.exitCode===null){api.kill();await Promise.race([once(api,'exit'),new Promise(r=>setTimeout(r,5000))]);}};
const startApi=async(production=true,frontendOrigin,integrationEnabled=true)=>{
 port=await freePort();base='http://127.0.0.1:'+port;
 api=spawn(process.execPath,[path.join(repo,'server-dist/index.js')],{cwd:repo,env:{...process.env,NODE_ENV:production?'production':'development',PUBLIC_APP_URL:production?'https://crm.example.com':'',LOCAL_DATABASE_URL:dbUrl,LOCAL_API_HOST:'127.0.0.1',LOCAL_API_PORT:String(port),LOCAL_SYNC_AUTO:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false',LOCAL_DEMO_AUTH:'false',LOCAL_INTEGRATION_API:integrationEnabled?'true':'false',LOCAL_ALLOWED_ORIGINS:production?'https://crm.example.com':frontendOrigin,LOCAL_STORAGE_ROOT:path.join((await import('node:os')).tmpdir(),'crm-business-qa-storage-'+suffix)},windowsHide:true,stdio:['ignore','pipe','pipe']});
 api.stdout.on('data',c=>logs+=c);api.stderr.on('data',c=>logs+=c);
 for(let i=0;i<160;i++){if(api.exitCode!==null)throw new Error('Fixture API exited');try{const r=await fetch(base+'/health');if((await r.json()).database===database)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('API health timeout');
};
const rawFetch=(url,init={})=>new Promise((resolve,reject)=>{const req=httpRequest(String(url),{method:init.method||'GET',headers:Object.fromEntries(new Headers(init.headers).entries())},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));});req.on('error',reject);if(init.body)req.write(init.body);req.end();});
const call=async(route,token,method='GET',body,extra={})=>{const r=await rawFetch(base+route,{method,headers:{host:'crm.example.com',...(token?{authorization:'Bearer '+token}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json().catch(()=>null),headers:r.headers};};
const expectStatus=(result,expected,label)=>{assert.equal(result.status,expected,label+' '+(result.body?.message||''));return result.body;};
const officialClients=[];
const openMcp=async(token,host='crm.example.com')=>{
 const client=new Client({name:'independent-business-qa',version:'1.0.0'});
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/api/mcp'),{fetch:rawFetch,requestInit:{headers:{Authorization:'Bearer '+token,host}}}));
 officialClients.push(client);return client;
};
const jsonData=result=>{assert.notEqual(result.isError,true,JSON.stringify(result.content));return result.structuredContent??JSON.parse(result.content.find(row=>row.type==='text').text);};
const denied=async(client,name,args={})=>{const result=await client.callTool({name,arguments:args}).catch(error=>({isError:true,error}));assert.equal(result.isError,true,name+' must fail closed');return result;};
const loginFixtureActors=async()=>{
 const salt=randomBytes(16).toString('hex'),password='BusinessFixtureLogin!2',hash='scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex');
 for(const identity of ['admin','manager','employee']){await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[identity,identity+'@fixture.invalid',hash]);await pool.query('insert into local_user_roles(user_id,role)values($1,$1)',[identity]);}
 const tokens={};for(const identity of ['admin','manager','employee'])tokens[identity]=expectStatus(await call('/api/local-auth/login',null,'POST',{email:identity+'@fixture.invalid',password}),200,identity+' login').token;
 return{password,...tokens};
};
const assertNoServiceSessions=async()=>{
 const tables=(await pool.query("select table_name from information_schema.tables where table_schema='public' and table_name like 'local_%session%'")).rows;
 for(const {table_name}of tables){assert.match(table_name,/^[a-z_]+$/);const columns=(await pool.query('select column_name from information_schema.columns where table_schema=\'public\' and table_name=$1',[table_name])).rows.map(row=>row.column_name);if(columns.includes('user_id')){const rows=(await pool.query(`select user_id from ${table_name}`)).rows;for(const row of rows)assert.ok(['admin','manager','employee'].includes(row.user_id),'service must not mint a human session');}}
};
const management={
 async connection(admin,name){return expectStatus(await call('/api/integration-access/connections',admin,'POST',{name,description:'Disposable independent business QA',reason:'Independent isolated QA'}),201,'create connection');},
 async execution(admin,connection,role='admin',permissions=[]){return expectStatus(await call('/api/integration-access/connections/'+connection.id+'/execution',admin,'PUT',{version:connection.policy_version,role,permissions,reason:'Independent service execution policy'}),200,'configure execution');},
 async grants(admin,connection,grants){return expectStatus(await call('/api/integration-access/connections/'+connection.id+'/grants',admin,'PUT',{version:connection.policy_version,grants,reason:'Independent explicit grants'}),200,'save grants');},
 async key(admin,connection,capabilities){return expectStatus(await call('/api/integration-access/connections/'+connection.id+'/keys',admin,'POST',{name:'Business QA machine',capabilities,expires_at:new Date(Date.now()+86400000).toISOString(),reason:'Independent machine test'}),201,'issue machine key');},
 async policy(admin,connection){return expectStatus(await call('/api/integration-access/connections/'+connection.id+'/grants',admin),200,'current policy');},
};
const allGrant=capability=>({capability,all_resources:true,resource_ids:[],secondary_ids:[],contact_access:false});
const commandArgs=(body,extra={})=>({body,idempotency_key:randomUUID(),reason:'Independent isolated command',...extra});
const assertPrivateAudit=async(secret)=>{
 const dump=(await pool.query('select action,outcome,reason,details from integration_access.audit')).rows;
 assert.equal(JSON.stringify(dump).includes(secret),false,'audit must not contain raw API key');
};
const assertBusinessCatalog=async()=>{
 const {integrationBusinessTools:tools,integrationBusinessCapabilities:capabilities}=await import('../server-dist/integration-business-catalog.js');
 const expected=['ai','attendance','catalog','contracts','cost','customers','fabric','finance','inventory','invoices','knowledge','manufacturing','orders','payroll','production','quotes','reports','settings','shipping','sync','users'];
 assert.deepEqual([...new Set(tools.map(row=>row.module))].sort(),expected);
 assert.equal(new Set(tools.map(row=>row.name)).size,tools.length,'fixed names unique');assert.equal(new Set(tools.map(row=>row.method+' '+row.path+' '+JSON.stringify(row.fixedBody||{}))).size,tools.length,'canonical operations including fixed actions unique');
 const allowedFixedActions={
  '/api/local-functions/ghn-tracking':['get_provinces','get_districts','get_wards','get_shops','get_services','get_pick_shifts','calculate_fee','track','track_order','get_order_detail','get_new_provinces','get_new_wards','address_autocomplete','address_autocomplete_status'],
  '/api/local-functions/lookup-tax-code':['ai_quote_fill','ai_quote_debug','parse_order_text','parse_order_image','parse_order_file','list_models'],
 };
 const dedicatedFunctions=['ai-customer-suggestions','predictive-analytics','extract-document','import-products','web-scraper'].map(name=>'/api/local-functions/'+name);
 for(const tool of tools){assert.match(tool.name,/^crm_[a-zA-Z0-9_]+$/);assert.match(tool.path,/^\/api\//);assert.ok(!/local-(?:snapshot|table|rpc)|integration-access|\/local-auth|\/mcp|\.\.|https?:/i.test(tool.path),tool.path);if(tool.path.includes('/local-functions/')&&!dedicatedFunctions.includes(tool.path)){assert.equal(tool.method,'POST');const fixed=Object.entries(tool.fixedBody||{});assert.equal(fixed.length,1,'generic function proxy must never be exposed');assert.ok(['action','type'].includes(fixed[0][0]));assert.ok(allowedFixedActions[tool.path]?.includes(fixed[0][1]),'only explicitly reviewed immutable function action');}assert.equal(tool.capability,`business.${tool.module}.${tool.action}`);assert.ok(capabilities.some(row=>row.id===tool.capability&&row.extended===true));}
 for(const [module,method,route]of [['customers','POST','/api/customers'],['customers','PATCH','/api/customers/:id'],['customers','DELETE','/api/customers/:id'],['quotes','POST','/api/quotes'],['quotes','POST','/api/quotes/:id/approve'],['orders','POST','/api/orders'],['orders','PATCH','/api/orders/:id'],['shipping','POST','/api/ghn-orders'],['invoices','POST','/api/einvoices/:id/issue'],['inventory','POST','/api/inventory/documents/:id/confirm']])assert.ok(tools.some(row=>row.module===module&&row.method===method&&row.path===route),method+' '+route);
 return{tools,capabilities};
};
let mockServer;
try{
 sqlAdmin('CREATE ROLE '+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '"+dbPassword+"'");
 sqlAdmin('CREATE DATABASE '+database+' OWNER '+role);created=true;
 await startApi();pool=new Pool({connectionString:dbUrl});
 assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,false);
 assert.ok((await pool.query("select 1 from local_schema_migrations where name like '084%'")).rows[0]);
 const actors=await loginFixtureActors(),admin=actors.admin;
 const {tools,capabilities}=await assertBusinessCatalog();pass('Fixed catalog covers every canonical business module with no raw path SQL or auth proxy');
 const p1=randomUUID(),p2=randomUUID();await pool.query("insert into local_products(id,sku,name)values($1,'BUSINESS-ALLOW','Scoped product'),($2,'BUSINESS-DENY','Other product')",[p1,p2]);
 let legacy=await management.connection(admin,'Legacy seven unchanged');legacy=await management.grants(admin,legacy,[{capability:'products.read',resource_ids:[p1]}]);
 const legacyKey=await management.key(admin,legacy,['products.read']),legacyClient=await openMcp(legacyKey.secret);
 assert.deepEqual((await legacyClient.listTools()).tools.map(row=>row.name),['search_products']);assert.deepEqual(jsonData(await legacyClient.callTool({name:'search_products',arguments:{}})).data.map(row=>row.id),[p1]);
 expectStatus(await call('/api/integration-access/connections/'+legacy.id+'/grants',admin,'PUT',{version:legacy.policy_version,grants:[{capability:'products.read',all_resources:true,resource_ids:[p1]}],reason:'Reject mixed legacy ALL'}),400,'legacy ALL cannot also list records');
 legacy=await management.grants(admin,legacy,[{capability:'products.read',all_resources:true,resource_ids:[]}]);
 assert.deepEqual(jsonData(await legacyClient.callTool({name:'search_products',arguments:{search:'BUSINESS-'}})).data.map(row=>row.id).sort(),[p1,p2].sort(),'explicit legacy ALL covers every active product');
 pass('Seven-capability scope stays per-record unless an admin explicitly chooses ALL');
 let conn=await management.connection(admin,'Business independent');
 expectStatus(await call('/api/integration-access/connections/'+conn.id+'/grants',admin,'PUT',{version:conn.policy_version,grants:[{capability:'business.customers.write',resource_ids:[]}],reason:'Missing ALL test'}),400,'business must explicitly grant ALL');
 conn=await management.grants(admin,conn,capabilities.map(row=>allGrant(row.id)));
 let allKey=await management.key(admin,conn,capabilities.map(row=>row.id));const machine=await openMcp(allKey.secret);
 assert.equal((await machine.listTools()).tools.length,0,'business tools require an explicitly configured execution profile');
 let configured=await management.execution(admin,conn);conn={...conn,...configured};const serviceUser=configured.user_id;
 assert.ok(serviceUser&&serviceUser!=='admin');assert.equal(configured.actor_label,'agent:'+conn.id);
 const profile=(await pool.query('select email,password_hash from local_user_profiles where user_id=$1',[serviceUser])).rows[0];assert.equal(profile.password_hash,null);
 expectStatus(await call('/api/local-auth/login',null,'POST',{email:profile.email,password:actors.password}),401,'service cannot human login');
 await assert.rejects(()=>pool.query("insert into local_auth_sessions(user_id,token_hash,expires_at)values($1,$2,now()+interval '1 day')",[serviceUser,'a'.repeat(64)]));await assertNoServiceSessions();
 await assert.rejects(()=>pool.query('update local_user_profiles set password_hash=$2 where user_id=$1',[serviceUser,'must-never-become-human']));
 await assert.rejects(()=>pool.query("update local_user_roles set role='admin' where user_id=$1",[serviceUser]));
 const listed=(await machine.listTools()).tools;assert.ok(listed.length>=tools.length);for(const row of tools)assert.ok(listed.some(tool=>tool.name===row.name),row.name);
 const smallKey=await management.key(admin,conn,['business.customers.read']),smallClient=await openMcp(smallKey.secret);assert.deepEqual((await smallClient.listTools()).tools.map(row=>row.name).sort(),tools.filter(row=>row.capability==='business.customers.read').map(row=>row.name).sort());await denied(smallClient,'crm_post_customers',commandArgs({name:'Must not create'}));
 pass('Business ALL intersects key capabilities and isolated service role without human credentials or sessions');
 const invoke=async(name,args,expected=200)=>{const result=jsonData(await machine.callTool({name,arguments:args}));assert.equal(result.status,expected,name+' '+JSON.stringify(result.body));return result.body;};
 const customerArgs=commandArgs({name:'Khách QA canonical',phone:'0900000000',email:'qa@fixture.invalid',address:'Địa chỉ QA',customer_code:'BUSINESS-QA'});
 const customer=await invoke('crm_post_customers',customerArgs,201);assert.ok(customer.id);assert.equal((await pool.query('select manager_id from local_customers where id=$1',[customer.id])).rows[0].manager_id,serviceUser);
 const customerReplay=await invoke('crm_post_customers',customerArgs,201);assert.equal(customerReplay.id,customer.id);assert.equal((await pool.query("select count(*) from local_customers where customer_code='BUSINESS-QA'")).rows[0].count,'1');
 const details=await invoke('crm_get_customers_id',{params:{id:customer.id}});assert.equal(details.customer.phone,'0900000000');
 await invoke('crm_patch_customers_id',commandArgs({name:'Khách QA đã sửa'},{params:{id:customer.id}}));assert.equal((await pool.query('select name from local_customers where id=$1',[customer.id])).rows[0].name,'Khách QA đã sửa');
 pass('Actual canonical customer create read update and exact replay persist correctly');
 const order=await invoke('crm_post_orders',commandArgs({order_number:'BUSINESS-QA-ORDER',customer_id:customer.id,total_amount:100000,items:[{name:'QA product',quantity:1,price:100000}]}),201);
 assert.ok(order.id);assert.equal((await pool.query('select manager_id from local_orders where id=$1',[order.id])).rows[0].manager_id,serviceUser);
 await invoke('crm_patch_orders_id',commandArgs({notes:'Canonical QA changed'},{params:{id:order.id}}));assert.equal((await invoke('crm_get_orders_id',{params:{id:order.id}})).notes,'Canonical QA changed');
 const quote=await invoke('crm_post_quotes',commandArgs({quote_number:'BUSINESS-QA-QUOTE',customer_id:customer.id,items:[{name:'QA quote item',quantity:2,price:1250.25}],include_vat:false}),201);assert.ok(quote.id);assert.equal(Number(quote.total_amount),2501);
 await invoke('crm_patch_quotes_id',commandArgs({notes:'Quote changed through canonical handler'},{params:{id:quote.id}}));assert.equal((await pool.query('select notes from local_quotes where id=$1',[quote.id])).rows[0].notes,'Quote changed through canonical handler');
 pass('Actual canonical order and quote writes retain service owner and shared quote arithmetic');
 const goongBefore=await invoke('crm_get_external_integrations_goong',{});const goongDisabled=await invoke('crm_put_external_integrations_goong',commandArgs({mode:'DISABLED',revision:goongBefore.revision}));assert.equal(goongDisabled.mode,'DISABLED');assert.equal((await pool.query('select mode from integration_private.goong_settings where id=true')).rows[0].mode,'DISABLED');
 pass('Actual strict provider settings save accepts canonical fields without invented reason or idempotency metadata');
 await pool.query("insert into local_customers(id,name,manager_id)values('outside-customer','Outside','admin')");await pool.query("insert into local_orders(id,order_number,manager_id)values('outside-order','OUTSIDE','admin')");await pool.query("insert into local_quotes(id,quote_number,manager_id,items)values('outside-quote','OUTSIDE','admin','[]')");
 configured=await management.execution(admin,conn,'manager');conn={...conn,...configured};
 await denied(machine,'crm_post_customers',customerArgs);assert.equal((await pool.query("select count(*) from local_customers where customer_code='BUSINESS-QA'")).rows[0].count,'1','authorization change must not replay or redispatch a former admin result');
 await invoke('crm_get_customers_id',{params:{id:customer.id}});await invoke('crm_get_orders_id',{params:{id:order.id}});
 for(const[name,id]of [['crm_get_customers_id','outside-customer'],['crm_get_orders_id','outside-order'],['crm_get_quotes_id_quote_data','outside-quote']])await denied(machine,name,{params:{id}});
 for(const[name,id]of [['crm_patch_customers_id','outside-customer'],['crm_patch_orders_id','outside-order'],['crm_patch_quotes_id','outside-quote']])await denied(machine,name,commandArgs({notes:'Must remain outside'},{params:{id}}));
 for(const name of ['crm_post_customers','crm_post_orders','crm_post_quotes'])await denied(machine,name,commandArgs({name:'Spoof',order_number:'SPOOF',quote_number:'SPOOF',manager_id:'admin',items:[{name:'QA',quantity:1,price:1}]}));
 assert.notEqual((await pool.query("select notes from local_orders where id='outside-order'")).rows[0].notes,'Must remain outside');
 assert.ok(!(await machine.listTools()).tools.some(row=>row.name==='crm_get_users'),'manager service cannot list admin-only tools');
 pass('Canonical manager owner ACL rejects cross-owner reads mutations and forged create owner');
 configured=await management.execution(admin,conn,'employee',[]);conn={...conn,...configured};assert.ok(!(await machine.listTools()).tools.some(row=>row.name==='crm_post_orders'));await denied(machine,'crm_post_orders',commandArgs({order_number:'NO-RIGHTS'}));
 configured=await management.execution(admin,conn);conn={...conn,...configured};
 for(const route of ['/api/orders','/api/customers','/api/local-auth/me'])expectStatus(await call(route,allKey.secret),401,'machine key cannot normal API '+route);assert.ok([401,403].includes((await call('/api/integration-access/connections',allKey.secret)).status));
 for(const route of ['/api/orders','/api/customers']){const result=await call(route,null,'GET',undefined,{'x-user-id':serviceUser,'x-internal-user-id':serviceUser,'x-integration-user-id':serviceUser,'x-integration-connection':conn.id});assert.ok([401,403].includes(result.status),'external header cannot mint service principal');}
 for(const name of ['execute_sql','raw_request','crm_request','crm_put_integration_access_connections_id_execution','crm_post_local_auth_login'])await denied(machine,name,commandArgs({sql:'select 1',url:'/api/users'}));
 await denied(machine,'crm_get_customers_id',{params:{id:'../../users'}});await denied(machine,'crm_get_customers',{path:'/api/users',sql:'select 1'});await denied(machine,'crm_put_users_id_permissions',commandArgs({permissions:[{permission_type:'orders',enabled:true}]},{params:{id:serviceUser}}));
 await denied(machine,'crm_post_profile_requests_userId_review',commandArgs({decision:'APPROVE',expected_revision:0,note:'Cannot mutate service through human review'},{params:{userId:serviceUser}}));
 pass('Role changes apply immediately; normal API headers raw proxy SQL self-grant and auth entry points fail closed');
 await invoke('crm_delete_quotes_id',commandArgs({},{params:{id:quote.id}}));await invoke('crm_delete_orders_id',commandArgs({},{params:{id:order.id}}));await invoke('crm_delete_customers_id',commandArgs({},{params:{id:customer.id}}));assert.equal((await pool.query('select is_active from local_customers where id=$1',[customer.id])).rows[0].is_active,false);
 pass('Canonical customer order and quote delete paths execute through their real business guards');
 const reduced=await management.grants(admin,conn,[allGrant('business.customers.read')]);conn={...conn,...reduced};await denied(machine,'crm_post_customers',commandArgs({name:'Revoked capability'}));assert.deepEqual((await machine.listTools()).tools.map(row=>row.name).sort(),tools.filter(row=>row.capability==='business.customers.read').map(row=>row.name).sort());
 expectStatus(await call('/api/integration-access/keys/'+allKey.key.id+'/revoke',admin,'POST',{reason:'Independent revoke'}),200,'revoke key');await assert.rejects(()=>machine.listTools());await assertPrivateAudit(allKey.secret);
 pass('Grant reduction and key revocation affect an already connected official SDK client');
 // A second Express app uses the same isolated SQL-backed access/receipt code,
 // with fake canonical provider routes. It cannot contact any real carrier.
 const savedEnv={...process.env};Object.assign(process.env,{NODE_ENV:'production',PUBLIC_APP_URL:'https://crm.example.com',LOCAL_DATABASE_URL:dbUrl,LOCAL_INTEGRATION_API:'true',LOCAL_ALLOWED_ORIGINS:'https://crm.example.com',LOCAL_DEMO_AUTH:'false',LOCAL_SYNC_AUTO:'false'});
 const express=(await import('express')).default,{registerIntegrationAccess}=await import('../server-dist/integration-access.js'),{resolveIntegrationInternalCaller}=await import('../server-dist/integration-internal-principal.js'),{GhnOrders}=await import('../server-dist/ghn-orders.js'),{ExternalReadAdapters}=await import('../server-dist/external-read-adapters.js');
 for(const key of Object.keys(process.env))if(!(key in savedEnv))delete process.env[key];Object.assign(process.env,savedEnv);
 const fakeApp=express();fakeApp.use(express.json());registerIntegrationAccess(fakeApp,pool,async req=>resolveIntegrationInternalCaller(req)||(req.headers.authorization==='Bearer independent-human-admin'?{userId:'admin'}:null));
 const config={token:'synthetic-provider-only',primaryShop:'123',shops:['123'],configured:true,source:'saved',mode:'ENABLED',revision:1,hasSavedKey:true};let realDomainCreates=0,lastDomainCreate;
 const syntheticJson=data=>new Response(JSON.stringify({code:200,data}),{headers:{'Content-Type':'application/json'}});
 const domainProvider=async(rawUrl,init={})=>{
  const endpoint=new URL(rawUrl).pathname.split('/public-api/')[1];
  if(endpoint==='v2/shop/all')return syntheticJson({shops:[{_id:123,name:'Independent fixture',district_id:1452,ward_code:'010101',status:1}],last_offset:0});
  if(endpoint==='master-data/province')return syntheticJson([{ProvinceID:202,ProvinceName:'Synthetic province'}]);
  if(endpoint==='master-data/district')return syntheticJson([{DistrictID:1444,ProvinceID:202,DistrictName:'Synthetic district'}]);
  if(endpoint==='master-data/ward')return syntheticJson([{WardCode:'020308',DistrictID:1444,WardName:'Synthetic ward'}]);
  if(endpoint==='v2/shipping-order/available-services')return syntheticJson([{service_id:53320,service_type_id:2}]);
  if(endpoint==='v2/shipping-order/create'){realDomainCreates++;lastDomainCreate=JSON.parse(init.body);return syntheticJson({order_code:'INDEPENDENTGHN'+realDomainCreates,total_fee:25000});}
  throw new Error('Unexpected synthetic GHN endpoint '+endpoint);
 };
 const domainGhn=new GhnOrders(pool,new ExternalReadAdapters({},domainProvider,async()=>structuredClone(config)),domainProvider);
 let dispatchCount=0,release,signal,revokeRelease,revokeSignal;const dispatched=new Promise(resolve=>signal=resolve),gate=new Promise(resolve=>release=resolve),revokeDispatched=new Promise(resolve=>revokeSignal=resolve),revokeGate=new Promise(resolve=>revokeRelease=resolve);const received=[];
 fakeApp.post('/api/ghn-orders',async(req,res)=>{const principal=resolveIntegrationInternalCaller(req);assert.ok(principal);if(!req.body.scenario){try{return res.json(await domainGhn.create(principal.userId,req.body));}catch(error){return res.status(error.name==='ZodError'?400:error.status||503).json({message:error.message});}}received.push({principal,body:req.body});dispatchCount++;if(req.body.scenario==='concurrent'){signal();await gate;}if(req.body.scenario==='in-flight-revoke'){revokeSignal();await revokeGate;}if(req.body.scenario==='unknown')return res.status(503).json({message:'Synthetic provider lost response'});res.status(201).json({id:'synthetic-shipment-'+dispatchCount,api_key:'must-be-redacted',nested:{token:'must-be-redacted'},note:'Bearer synthetic-private-token'});});
 fakeApp.post('/api/einvoices/:id/issue',(req,res)=>{assert.ok(resolveIntegrationInternalCaller(req));dispatchCount++;res.status(409).json({message:'Synthetic provider unsupported'});});
 let fixedDispatchCount=0;fakeApp.post('/api/local-functions/ghn-tracking',(req,res)=>{assert.ok(resolveIntegrationInternalCaller(req));fixedDispatchCount++;res.json({action:req.body.action});});
 fakeApp.get('/api/invoice-workspace/export',(req,res)=>{assert.ok(resolveIntegrationInternalCaller(req));res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="independent.csv"');res.send('name,amount\nSynthetic,1234\n');});
 const pdfBytes=Buffer.alloc(120000,0xe3);pdfBytes.write('%PDF-1.7\n',0,'ascii');pdfBytes.write('\n%%EOF\n',pdfBytes.length-7,'ascii');const largePdfBytes=Buffer.concat([pdfBytes,Buffer.alloc(1080000,0x94)]);
 fakeApp.post('/api/einvoices/:id/preview',(req,res)=>{assert.ok(resolveIntegrationInternalCaller(req));res.json({fileType:'PDF',fileName:'independent-120kb.pdf',base64:req.params.id==='bad-pdf'?'not-base64':(req.params.id==='synthetic-large-pdf'?largePdfBytes:pdfBytes).toString('base64')});});
 mockServer=fakeApp.listen(0,'127.0.0.1');await once(mockServer,'listening');const originalBase=base;base='http://127.0.0.1:'+mockServer.address().port;
 const mockAdmin='independent-human-admin';let mockConn=await management.connection(mockAdmin,'Mock provider receipt');mockConn={...mockConn,...await management.execution(mockAdmin,mockConn)};mockConn=await management.grants(mockAdmin,mockConn,['business.shipping.provider','business.shipping.read','business.invoices.provider','business.invoices.read'].map(allGrant));const mockKey=await management.key(mockAdmin,mockConn,['business.shipping.provider','business.shipping.read','business.invoices.provider','business.invoices.read']),providerClient=await openMcp(mockKey.secret);
 const realDomainArgs=commandArgs({entryMode:'PACKAGES',shopId:'123',provinceId:202,orderId:null,orderNumber:'INDEPENDENT-GHN',orderData:{to_name:'Synthetic recipient',to_phone:'0900000000',to_address:'Synthetic fixture only',to_district_id:1444,to_ward_code:'020308',weight:1000,length:10,width:10,height:10,cod_amount:0,insurance_value:0,required_note:'KHONGCHOXEMHANG',content:'Synthetic contents',payment_type_id:1,service_type_id:2,service_id:53320,items:[{name:'Kiện 1',quantity:1,weight:1000,length:10,width:10,height:10,price:0}]}});
 const realDomainResult=jsonData(await providerClient.callTool({name:'crm_post_ghn_orders',arguments:realDomainArgs}));assert.equal(realDomainResult.status,200,JSON.stringify(realDomainResult));assert.equal(realDomainResult.body.data.attempt_status,'SUCCESS');assert.equal(realDomainCreates,1);assert.equal(lastDomainCreate.items[0].name,'Kiện 1');assert.equal(lastDomainCreate.weight,1000);assert.equal(lastDomainCreate.idempotency_key,undefined);assert.equal(lastDomainCreate.reason,undefined);
 const actualReceipt=(await pool.query('select id from integration_access.commands where connection_id=$1 and tool_name=$2',[mockConn.id,'crm_post_ghn_orders'])).rows[0];assert.equal((await pool.query('select request_data from integration_private.ghn_order_attempts where idempotency_key=$1',[actualReceipt.id])).rows[0].request_data.idempotencyKey,actualReceipt.id);
 assert.deepEqual(jsonData(await providerClient.callTool({name:'crm_post_ghn_orders',arguments:realDomainArgs})),realDomainResult);assert.equal(realDomainCreates,1);
 pass('MCP dispatch reaches actual strict GhnOrders canonical domain with receipt camel-case key and synthetic provider once');
 const concurrent=commandArgs({scenario:'concurrent'});const first=providerClient.callTool({name:'crm_post_ghn_orders',arguments:concurrent});await Promise.race([dispatched,first.then(()=>{throw new Error('Mock provider did not reach concurrent gate');})]);await denied(providerClient,'crm_post_ghn_orders',concurrent);assert.equal(dispatchCount,1);release();const firstResult=jsonData(await first);assert.equal(firstResult.status,201);assert.equal(firstResult.body.api_key,undefined);assert.equal(firstResult.body.nested.token,undefined);assert.equal(firstResult.body.note,'Bearer [redacted]');assert.equal(received[0].principal.userId,mockConn.user_id??(await pool.query('select user_id from integration_access.service_identities where connection_id=$1',[mockConn.id])).rows[0].user_id);
 const replay=jsonData(await providerClient.callTool({name:'crm_post_ghn_orders',arguments:concurrent}));assert.deepEqual(replay,firstResult);assert.equal(dispatchCount,1);await denied(providerClient,'crm_post_ghn_orders',{...concurrent,body:{scenario:'changed'}});assert.equal(dispatchCount,1);
 pass('Concurrent exact command dispatches once, sanitizes output, replays exact result and rejects hash conflict');
 const unknown=commandArgs({scenario:'unknown'});await denied(providerClient,'crm_post_ghn_orders',unknown);const unknownCount=dispatchCount;await denied(providerClient,'crm_post_ghn_orders',unknown);await denied(providerClient,'crm_post_ghn_orders',{...unknown,force:true});assert.equal(dispatchCount,unknownCount);assert.equal((await pool.query("select state from integration_access.commands where connection_id=$1 and tool_name='crm_post_ghn_orders' order by created_at desc limit 1",[mockConn.id])).rows[0].state,'UNKNOWN');
 const unsupported=commandArgs({},{params:{id:'synthetic-invoice'}});await denied(providerClient,'crm_post_einvoices_id_issue',unsupported);const failedCount=dispatchCount;await denied(providerClient,'crm_post_einvoices_id_issue',unsupported);assert.equal(dispatchCount,failedCount);assert.equal((await pool.query("select state from integration_access.commands where connection_id=$1 and tool_name='crm_post_einvoices_id_issue'",[mockConn.id])).rows[0].state,'FAILED');
 pass('UNKNOWN cannot force retry and definite provider rejection replays FAILED without second dispatch');
 assert.equal(jsonData(await providerClient.callTool({name:'crm_ghn_get_provinces',arguments:{}})).body.action,'get_provinces');
 await denied(providerClient,'crm_ghn_get_provinces',{body:{action:'create_order'}});assert.equal(fixedDispatchCount,1,'immutable function tools cannot switch to another action');
 pass('Named function wrapper keeps its action immutable and cannot become a generic provider proxy');
 const exportResult=jsonData(await providerClient.callTool({name:'crm_get_invoice_workspace_export',arguments:{}}));assert.equal(exportResult.status,200);const artifact=exportResult.body.artifact;assert.ok(artifact?.download_path);assert.equal(artifact.filename,'independent.csv');
 const download=await rawFetch(base+artifact.download_path,{headers:{host:'crm.example.com',Authorization:'Bearer '+mockKey.secret}});assert.equal(download.status,200);assert.equal(await download.text(),'name,amount\nSynthetic,1234\n');
 const otherArtifactKey=await management.key(mockAdmin,mockConn,['business.invoices.read']);assert.equal((await rawFetch(base+artifact.download_path,{headers:{host:'crm.example.com',Authorization:'Bearer '+otherArtifactKey.secret}})).status,404,'artifacts remain bound to their issuing key');
 pass('Binary canonical export becomes a private SQL-backed artifact bound to its issuing key');
 const pdfResult=jsonData(await providerClient.callTool({name:'crm_post_einvoices_id_preview',arguments:{params:{id:'synthetic-pdf'}}}));assert.equal(pdfResult.status,200);const pdfArtifact=pdfResult.body.artifact;assert.equal(pdfArtifact.size_bytes,pdfBytes.length);assert.equal(pdfArtifact.content_type,'application/pdf');assert.equal(pdfArtifact.filename,'independent-120kb.pdf');assert.match(pdfArtifact.expires_at,/^\d{4}-\d{2}-\d{2}T.*Z$/);assert.ok(Date.parse(pdfArtifact.expires_at)>Date.now());
 const pdfDownload=await rawFetch(base+pdfArtifact.download_path,{headers:{host:'crm.example.com',Authorization:'Bearer '+mockKey.secret}});assert.equal(pdfDownload.status,200);assert.deepEqual(Buffer.from(await pdfDownload.arrayBuffer()),pdfBytes,'large JSON base64 PDF must be decoded before any string truncation');await denied(providerClient,'crm_post_einvoices_id_preview',{params:{id:'bad-pdf'}});
 pass('120KB invoice JSON PDF exports exact bytes through private artifact with ISO expiry and rejects malformed base64');
 const largePdfResult=jsonData(await providerClient.callTool({name:'crm_post_einvoices_id_preview',arguments:{params:{id:'synthetic-large-pdf'}}}));assert.equal(largePdfResult.status,200);assert.equal(largePdfResult.body.artifact.size_bytes,largePdfBytes.length);const largePdfDownload=await rawFetch(base+largePdfResult.body.artifact.download_path,{headers:{host:'crm.example.com',Authorization:'Bearer '+mockKey.secret}});assert.equal(largePdfDownload.status,200);assert.deepEqual(Buffer.from(await largePdfDownload.arrayBuffer()),largePdfBytes,'known PDF preview can cross the ordinary 1MB JSON cap without losing bytes');
 pass('1.2MB PDF bypasses only known preview JSON capture limit and downloads exact original bytes');
 const inflightArgs=commandArgs({scenario:'in-flight-revoke'}),inflight=providerClient.callTool({name:'crm_post_ghn_orders',arguments:inflightArgs});await Promise.race([revokeDispatched,inflight.then(()=>{throw new Error('Mock provider did not reach revocation gate');})]);
 mockConn={...mockConn,...await management.execution(mockAdmin,mockConn,'employee',[])};revokeRelease();assert.equal((await inflight).isError,true,'role downgrade during dispatch must withhold result');const afterDowngradeCount=dispatchCount;await denied(providerClient,'crm_post_ghn_orders',inflightArgs);assert.equal(dispatchCount,afterDowngradeCount,'downgrade cannot redispatch completed command');
 assert.equal((await rawFetch(base+artifact.download_path,{headers:{host:'crm.example.com',Authorization:'Bearer '+mockKey.secret}})).status,404,'role downgrade immediately invalidates old private artifact');base=originalBase;
 pass('Role downgrade during in-flight canonical work withholds result and prevents replay or old artifact release');
 if(browserChecks){
  const frontendPort=await freePort(),origin='http://127.0.0.1:'+frontendPort;await stopApi();await startApi(false,origin);
  // Compile a private in-memory SPA with env discovery disabled. Never reuse
  // dist from the operational localhost build: it may embed shared API 8787.
  const{build}=await import('vite'),react=(await import('@vitejs/plugin-react-swc')).default;
  const compiled=await build({root:repo,configFile:false,envDir:false,publicDir:false,logLevel:'warn',plugins:[react()],resolve:{alias:{'@':path.join(repo,'src')},dedupe:['react','react-dom','react/jsx-runtime']},define:{'import.meta.env.VITE_BACKEND_MODE':JSON.stringify('local'),'import.meta.env.VITE_LOCAL_API_URL':JSON.stringify(''),'import.meta.env.VITE_LOCAL_DEMO_AUTH':JSON.stringify('false'),'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(''),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify('')},build:{write:false,sourcemap:false,chunkSizeWarningLimit:3000}});
  const assets=new Map((Array.isArray(compiled)?compiled:[compiled]).flatMap(bundle=>bundle.output).map(item=>['/'+item.fileName,item.type==='chunk'?item.code:item.source]));assert.ok(assets.has('/index.html'));
  frontend=createServer(async(req,res)=>{
   if(req.url.startsWith('/api/')||req.url==='/health'){const upstream=httpRequest(base+req.url,{method:req.method,headers:{...req.headers,host:'127.0.0.1:'+port}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);return;}
   const pathname=new URL(req.url,origin).pathname,file=assets.has(pathname)?pathname:path.extname(pathname)?null:'/index.html';if(!file){res.statusCode=404;res.end();return;}res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; frame-src 'none'");res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(file)]||'application/octet-stream');res.end(assets.get(file));
  });frontend.listen(frontendPort,'127.0.0.1');await once(frontend,'listening');
  browser=await chromium.launch({headless:true,...(process.env.INTEGRATION_QA_CHROMIUM?{executablePath:process.env.INTEGRATION_QA_CHROMIUM}:{})});
  for(const[view,viewport]of[['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
   const context=await browser.newContext({viewport});await context.route('**/*',route=>{const target=new URL(route.request().url());return target.origin===origin?route.continue():route.abort('blockedbyclient');});const page=await context.newPage(),pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
   await page.goto(origin+'/auth');await page.getByLabel('Email',{exact:true}).fill('admin@fixture.invalid');await page.getByLabel('Mật khẩu',{exact:true}).fill(actors.password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(view==='mobile'?'**/menu':'**/dashboard');
   await page.goto(origin+'/integration-access');await page.getByRole('heading',{name:'API & kết nối Agent',exact:true}).waitFor();
   await page.getByRole('textbox',{name:'Tên kết nối',exact:true}).fill('Business UI '+view);await page.getByRole('textbox',{name:'Mô tả kết nối',exact:true}).fill('Isolated service identity UI QA');await page.getByRole('button',{name:'Tạo kết nối',exact:true}).click();await page.getByRole('heading',{name:'Business UI '+view,exact:true}).waitFor();
   assert.equal(await page.getByRole('checkbox',{checked:true}).count(),0,'new connection grants default to none');await page.getByRole('tab',{name:'Danh tính thực thi',exact:true}).click();const roleSelect=page.getByLabel('Vai trò (chọn rõ ràng)',{exact:true});await roleSelect.waitFor();assert.equal(await roleSelect.inputValue(),'','service role has no implicit default');await page.getByRole('textbox',{name:'Lý do cấu hình danh tính dịch vụ',exact:true}).fill('Browser explicit role policy');assert.equal(await page.getByRole('button',{name:'Lưu danh tính thực thi',exact:true}).isDisabled(),true);
   await page.screenshot({path:path.join(artifactsRoot,view+'-blank-execution.png'),fullPage:false});await roleSelect.selectOption('manager');await page.getByRole('button',{name:'Lưu danh tính thực thi',exact:true}).click();await page.getByText('Đã lưu danh tính dịch vụ',{exact:true}).waitFor();
   await page.getByRole('tab',{name:'Quyền truy cập',exact:true}).click();
   for(const label of ['customers.read · Chỉ xem','customers.write · Ghi nghiệp vụ']){const item=page.getByText(label,{exact:true});await item.click();const all=item.locator('..').getByRole('checkbox',{name:'Cấp toàn mô-đun theo phạm vi và vai trò dịch vụ',exact:true});assert.equal(await all.isChecked(),false,'business ALL must require a second explicit action');await all.check();}
   await page.getByRole('textbox',{name:'Lý do thay đổi',exact:true}).fill('Browser explicit business ALL');await page.getByRole('button',{name:'Lưu quyền và phạm vi',exact:true}).click();await page.getByText('Đã lưu quyền truy cập',{exact:true}).waitFor();
   await page.getByRole('tab',{name:'Khóa truy cập',exact:true}).click();assert.equal(await page.getByRole('checkbox',{checked:true}).count(),0,'key capability defaultnone');await page.getByRole('tabpanel').getByText('customers.read',{exact:true}).click();await page.getByLabel('Tên khóa',{exact:true}).fill('Business UI read '+view);await page.getByLabel('Số ngày hiệu lực (1–366)',{exact:true}).fill('1');await page.getByRole('textbox',{name:'Lý do thay đổi',exact:true}).fill('Browser narrow machine key');await page.getByRole('button',{name:'Cấp khóa',exact:true}).click();await page.getByRole('textbox',{name:'Khóa API vừa cấp',exact:true}).waitFor();
   const secret=await page.getByRole('textbox',{name:'Khóa API vừa cấp',exact:true}).inputValue();assert.ok(secret.startsWith('jf_agent_'));await page.keyboard.press('Escape');await page.mouse.click(2,2);assert.equal(await page.getByRole('textbox',{name:'Khóa API vừa cấp',exact:true}).inputValue(),secret,'one-time secret survives Escape and outside click');assert.equal(await page.getByRole('button',{name:'Business independent',exact:true,includeHidden:true}).isDisabled(),true,'connection switch locked while secret visible');
   await page.getByRole('button',{name:'Đã lưu, đóng',exact:true}).click();await page.locator('input[aria-label="Khóa API vừa cấp"]').waitFor({state:'detached'});assert.equal(await page.getByRole('textbox',{name:'Khóa API vừa cấp',exact:true}).count(),0);const uiMachine=await openMcp(secret,'127.0.0.1:'+port);assert.deepEqual((await uiMachine.listTools()).tools.map(row=>row.name).sort(),tools.filter(row=>row.capability==='business.customers.read').map(row=>row.name).sort());await denied(uiMachine,'crm_post_customers',commandArgs({name:'UI must not create'}));
   await page.getByRole('textbox',{name:'Lý do thay đổi',exact:true}).fill('Browser revoke business key');await page.getByRole('button',{name:'Thu hồi',exact:true}).click();await page.getByText('Đã thu hồi khóa',{exact:true}).waitFor();await assert.rejects(()=>uiMachine.listTools());
   await page.getByRole('tab',{name:'Danh tính thực thi',exact:true}).click();await page.getByLabel('Vai trò (chọn rõ ràng)',{exact:true}).waitFor();assert.equal(await page.getByLabel('Vai trò (chọn rõ ràng)',{exact:true}).inputValue(),'manager');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow '+view);assert.deepEqual(pageErrors,[],'no browser exceptions '+view);await page.screenshot({path:path.join(artifactsRoot,view+'-configured-execution.png'),fullPage:false});await context.close();pass('Actual '+view+' admin UI explicit role ALL narrowkey one-time reveal SDK and revoke');
  }
 }
 await assertNoServiceSessions();console.log('BUSINESS_INDEPENDENT_PASS '+JSON.stringify({groups:checks.length,checks,database:'disposable isolated only',provider:'fake canonical routes only',officialMcpSdk:true,browser:browserChecks?artifactsRoot:false}));
}catch(error){
 if(browser){const page=browser.contexts().flatMap(context=>context.pages()).at(-1);if(page&&await page.getByRole('textbox',{name:'Khóa API vừa cấp',exact:true}).count()===0){await page.screenshot({path:path.join(artifactsRoot,'failure.png'),fullPage:false}).catch(()=>{});console.log('Browser failure pathname '+new URL(page.url()).pathname);}}
 throw error;
}finally{
 for(const client of officialClients)await client.close().catch(()=>{});await browser?.close();if(mockServer)await new Promise(resolve=>mockServer.close(resolve));if(frontend)await new Promise(resolve=>frontend.close(resolve));await stopApi();await pool?.end();
 if(created)sqlAdmin('DROP DATABASE '+database+' WITH (FORCE)');sqlAdmin('DROP ROLE IF EXISTS '+role);console.log('CLEANUP business isolated database and role removed');
}
