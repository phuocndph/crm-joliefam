import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, stat } from 'node:fs/promises';
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
const artifactsRoot=process.env.INTEGRATION_QA_ARTIFACTS||path.join((await import('node:os')).tmpdir(),'crm-hermes-qa-'+process.pid);
if(browserChecks)await (await import('node:fs/promises')).mkdir(artifactsRoot,{recursive:true});
const suffix=process.pid+'_'+Date.now(), database='hermes_independent_'+suffix, role='hermes_qa_'+suffix;
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
 api=spawn(process.execPath,[path.join(repo,'server-dist/index.js')],{cwd:repo,env:{...process.env,NODE_ENV:production?'production':'development',PUBLIC_APP_URL:production?'https://crm.example.com':'',LOCAL_DATABASE_URL:dbUrl,LOCAL_API_HOST:'127.0.0.1',LOCAL_API_PORT:String(port),LOCAL_SYNC_AUTO:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false',LOCAL_DEMO_AUTH:'false',LOCAL_INTEGRATION_API:integrationEnabled?'true':'false',LOCAL_ALLOWED_ORIGINS:production?'https://crm.example.com':frontendOrigin,LOCAL_STORAGE_ROOT:path.join((await import('node:os')).tmpdir(),'crm-hermes-qa-storage-'+suffix)},windowsHide:true,stdio:['ignore','pipe','pipe']});
 api.stdout.on('data',c=>logs+=c);api.stderr.on('data',c=>logs+=c);
 for(let i=0;i<160;i++){if(api.exitCode!==null)throw new Error('Fixture API exited');try{const r=await fetch(base+'/health');if((await r.json()).database===database)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('API health timeout');
};
const rawFetch=(url,init={})=>new Promise((resolve,reject)=>{const req=httpRequest(String(url),{method:init.method||'GET',headers:Object.fromEntries(new Headers(init.headers).entries())},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));});req.on('error',reject);if(init.body)req.write(init.body);req.end();});
const call=async(route,token,method='GET',body,extra={})=>{const r=await rawFetch(base+route,{method,headers:{host:'crm.example.com',...(token?{authorization:'Bearer '+token}:{}),...(body!==undefined?{'content-type':'application/json'}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json().catch(()=>null),headers:r.headers};};
const expectStatus=(result,expected,label)=>{assert.equal(result.status,expected,label+' '+(result.body?.message||''));return result.body;};
try{
 sqlAdmin('CREATE ROLE '+role+" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '"+dbPassword+"'");
 sqlAdmin('CREATE DATABASE '+database+' OWNER '+role);created=true;
 await startApi();pool=new Pool({connectionString:dbUrl});
 assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,false);
 assert.equal((await pool.query('select count(*) from local_workers')).rows[0].count,'0');
 assert.ok((await pool.query("select 1 from local_schema_migrations where name like '050%'")).rows[0]);
 pass('NOSUPERUSER migration and production no seed');
 const salt=randomBytes(16).toString('hex'),password='FixtureLogin!2',hash='scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex');
 for(const r of ['admin','manager','employee']){await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[r,r+'@fixture.invalid',hash]);await pool.query('insert into local_user_roles(user_id,role)values($1,$1)',[r]);}
 const admin=expectStatus(await call('/api/local-auth/login',null,'POST',{email:'admin@fixture.invalid',password}),200,'admin login').token;
 const manager=expectStatus(await call('/api/local-auth/login',null,'POST',{email:'manager@fixture.invalid',password}),200,'manager login').token;
 const employee=expectStatus(await call('/api/local-auth/login',null,'POST',{email:'employee@fixture.invalid',password}),200,'employee login').token;
 const p1=randomUUID(),p2=randomUUID(),w1=randomUUID(),w2=randomUUID(),i1=randomUUID(),i2=randomUUID();
 await pool.query("insert into local_products(id,sku,name)values($1,'QA-ALLOW','Sản phẩm được cấp'),($2,'QA-DENY','Sản phẩm ngoài phạm vi')",[p1,p2]);
 await pool.query("insert into local_customers(id,customer_code,name,phone,email,address,total_spent,notes)values('c1','QA-C1','Khách được cấp','0900000000','secret@fixture.invalid','Địa chỉ riêng',9999,'private marker'),('c2','QA-C2','Khách ngoài phạm vi','0911111111','other@fixture.invalid','Other',777,'outside marker')");
 await pool.query("insert into local_orders(id,order_number,total_amount,items,notes)values('o1','QA-O1',98765,'[{\"price\":100,\"secret\":\"line\"}]','sensitive notes'),('o2','QA-O2',123,'[]','outside')");
 await pool.query("insert into local_quotes(id,quote_number,total_amount,quote_data,notes)values('q1','QA-Q1',55555,'{\"private\":\"marker\"}','sensitive'),('q2','QA-Q2',88888,'{}','outside')");
 const production1=randomUUID(),production2=randomUUID();await pool.query("insert into local_production_orders(id,production_order_number,production_batch_number,product_id,quantity_planned,quantity_good,created_by)values($1,'QA-SX1','QA-B1',$3,12.1250,2.5000,'private actor'),($2,'QA-SX2','QA-B2',$3,99,33,'outside')",[production1,production2,p1]);
 await pool.query("insert into local_inventory_warehouses(id,code,name)values($1,'QA-W1','Kho được cấp'),($2,'QA-W2','Kho khác')",[w1,w2]);
 await pool.query("insert into local_inventory_items(id,code,name)values($1,'QA-I1','Vật tư được cấp'),($2,'QA-I2','Vật tư khác')",[i1,i2]);
 const doc=randomUUID();await pool.query("insert into local_inventory_documents(id,document_number,document_type,status,transaction_at,warehouse_id,idempotency_key)values($1,'QA-DOC','RECEIPT','CONFIRMED',now(),$2,'qa-ledger')",[doc,w1]);
 for(const [warehouse,item,qty]of [[w1,i1,'12.1234'],[w1,i1,'-2.0001'],[w1,i2,'777'],[w2,i1,'999']])await pool.query("insert into local_inventory_movements(document_id,inventory_item_id,warehouse_id,movement_kind,quantity_delta,unit,transaction_at,unit_cost,value_delta)values($1,$2,$3,'QA_FIXTURE',$4,'PIECE',now(),9876,999999)",[doc,item,warehouse,qty]);
 const create=async(name)=>expectStatus(await call('/api/integration-access/connections',admin,'POST',{name,description:'Independent QA fixture',reason:'Independent test'}),201,'create connection');
 let conn=await create('Hermes QA');
 const emptyConn=await create('No scope QA');expectStatus(await call('/api/integration-access/connections/'+emptyConn.id+'/keys',admin,'POST',{name:'Forbidden empty scope',capabilities:['products.read'],expires_at:new Date(Date.now()+86400000).toISOString(),reason:'Empty scope test'}),400,'no rights no key');
 expectStatus(await call('/api/integration-access/connections/'+emptyConn.id+'/grants',admin,'PUT',{version:emptyConn.policy_version,grants:[{capability:'products.read',resource_ids:['not-a-uuid']}],reason:'Invalid typed scope'}),400,'invalid typed scope rejected');
 const grants=[{capability:'products.read',resource_ids:[p1.toUpperCase(),p1]},{capability:'customers.read',resource_ids:['c1']},{capability:'orders.read',resource_ids:['o1']},{capability:'quotes.read',resource_ids:['q1']},{capability:'production.read',resource_ids:[production1]}];
 conn=expectStatus(await call('/api/integration-access/connections/'+conn.id+'/grants',admin,'PUT',{version:conn.policy_version,grants,reason:'Scoped access'}),200,'save grant');
 const newKey=async(capabilities,rotate_key_id)=>expectStatus(await call('/api/integration-access/connections/'+conn.id+'/keys',admin,'POST',{name:'QA key',capabilities,expires_at:new Date(Date.now()+86400000).toISOString(),reason:'QA grant',...(rotate_key_id?{rotate_key_id}:{})}),201,'create key');
 let key=await newKey(['products.read','customers.read','orders.read']);
 const otherKey=await newKey(['quotes.read','production.read']);
 const quote=expectStatus(await call('/api/integrations/v1/quotes',otherKey.secret),200,'nonempty quote query');assert.deepEqual(quote.data.map(r=>r.id),['q1']);for(const f of ['total_amount','quote_data','items','notes'])assert.ok(!(f in quote.data[0]),'quote privacy');
 const production=expectStatus(await call('/api/integrations/v1/production-orders',otherKey.secret),200,'nonempty production query');assert.deepEqual(production.data.map(r=>r.id),[production1]);assert.equal(production.data[0].quantity_planned,'12.1250');assert.equal(production.data[0].quantity_good,'2.5000');assert.ok(!('created_by' in production.data[0]));
 expectStatus(await call('/api/integrations/v1/products/'+p1.toUpperCase(),key.secret),200,'uppercase UUID detail canonical');
 pass('Nonempty quote production DTO privacy numeric precision and UUID normalization');
 for(const token of [null,employee,manager,key.secret]){const result=await call('/api/integration-access/connections',token);assert.ok([401,403].includes(result.status),'admin-only management');}
 pass('Real admin management and service/human role separation');
 for(const route of ['/api/orders','/api/local-auth/me','/api/local-snapshot/integration_access.keys','/api/local-table/integration_access.keys'])expectStatus(await call(route,key.secret),401,'machine cannot human route');
 expectStatus(await call('/api/local-auth/logout',key.secret,'POST',{}),401,'machine cannot human logout');
 for(const token of [admin,manager,employee])for(const target of ['integration_access.keys','integration_access.connections','integration_access.audit','integration_keys','integration%5Faccess.keys','integration_access%2Ekeys','local_integration_keys']){
   const result=await call('/api/local-snapshot/'+target,token);assert.ok([403,404].includes(result.status),'private snapshot denied for all roles');
 }
 pass('Human API boundaries and private adapter deny');
 let result=expectStatus(await call('/api/integrations/v1/products',key.secret),200,'scoped products');assert.deepEqual(result.data.map(r=>r.id),[p1]);assert.equal(result.has_more,false);
 expectStatus(await call('/api/integrations/v1/products/'+p2,key.secret),404,'out-of-scope detail');
 const customers=expectStatus(await call('/api/integrations/v1/customers',key.secret),200,'customers');assert.equal(customers.data.length,1);for(const f of ['phone','email','address','total_spent','notes','manager_id','tenant_id'])assert.ok(!(f in customers.data[0]),'private customer field');
 const orders=expectStatus(await call('/api/integrations/v1/orders',key.secret),200,'orders');for(const f of ['items','notes','total_amount','customer_id'])assert.ok(!(f in orders.data[0]),'private order field');
 expectStatus(await call('/api/integrations/v1/products?limit=101',key.secret),400,'row cap');
 expectStatus(await call('/api/integrations/v1/products?scope=all',key.secret),400,'unknown scope filter');
 expectStatus(await call('/api/integrations/v1/inventory',key.secret),403,'missing capability');
 pass('Scoped rows counts and field privacy');
 expectStatus(await call('/api/integrations/v1/products',key.secret,'GET',undefined,{origin:'https://evil.invalid'}),403,'evil Origin');
 expectStatus(await call('/api/integrations/v1/products',key.secret,'GET',undefined,{host:'evil.invalid'}),403,'evil Host');
 expectStatus(await call('/api/integrations/v1/products',key.secret,'POST',{}),405,'write denied');
 expectStatus(await call('/api/integrations/v2/products',key.secret),404,'unknown version');
 expectStatus(await call('/api/mcp',null,'POST',{jsonrpc:'2.0',id:1,method:'tools/list',params:{}},{accept:'application/json, text/event-stream'}),401,'MCP missing authentication');
 expectStatus(await call('/api/mcp',key.secret),405,'MCP GET denied');
 expectStatus(await call('/api/mcp/unknown',key.secret,'POST',{}),405,'MCP unknown path closed');
 expectStatus(await call('/api/mcp',key.secret,'POST',{padding:'x'.repeat(32769)},{accept:'application/json, text/event-stream'}),413,'MCP request body cap');
 expectStatus(await call('/api/integrations/v1/products',key.secret,'POST',{padding:'x'.repeat(32769)}),413,'REST request body cap');
 const client=new Client({name:'independent-qa',version:'1.0.0'});
 const transport=new StreamableHTTPClientTransport(new URL(base+'/api/mcp'),{fetch:rawFetch,requestInit:{headers:{Authorization:'Bearer '+key.secret,host:'crm.example.com'}}});
 await client.connect(transport);
 const listed=await client.listTools();assert.deepEqual(listed.tools.map(t=>t.name).sort(),['search_customers','search_orders','search_products']);
 result=await client.callTool({name:'search_products',arguments:{limit:10}});assert.equal(result.isError,undefined);assert.deepEqual(result.structuredContent.data.map(r=>r.id),[p1]);
 result=await client.callTool({name:'get_inventory_availability',arguments:{}});assert.equal(result.isError,true);
 result=await client.callTool({name:'unknown_tool',arguments:{}});assert.equal(result.isError,true);
 pass('Official MCP SDK initialize list call with shared permissions');
 const narrow=await newKey(['products.read']);expectStatus(await call('/api/integrations/v1/customers',narrow.secret),403,'key capabilities narrower');
 const expired=await newKey(['products.read']);await pool.query("update integration_access.keys set expires_at=now()-interval '1 second' where id=$1",[expired.key.id]);expectStatus(await call('/api/integrations/v1/products',expired.secret),401,'expired');
 key=await newKey(['products.read','customers.read','orders.read'],key.key.id);
 result=await client.listTools().catch(e=>({error:true}));assert.equal(result.error,true,'rotated key invalid on existing MCP client');await client.close();
 expectStatus(await call('/api/integrations/v1/products',key.secret),200,'rotated new key');
 await stopApi();await startApi();expectStatus(await call('/api/integrations/v1/products',key.secret),200,'key persists restart');
 pass('Narrow key expiry immediate rotation and restart persistence');
 const concurrency=await Promise.all([call('/api/integration-access/connections/'+conn.id+'/grants',admin,'PUT',{version:conn.policy_version,grants,reason:'Concurrent first'}),call('/api/integration-access/connections/'+conn.id+'/grants',admin,'PUT',{version:conn.policy_version,grants,reason:'Concurrent second'})]);assert.deepEqual(concurrency.map(r=>r.status).sort(),[200,409]);conn=concurrency.find(r=>r.status===200).body;
 const worker1=randomUUID(),worker2=randomUUID();await pool.query("insert into local_workers(id,employee_code,display_name)values($1,'QA-NV1','Nhân sự được cấp'),($2,'QA-NV2','Nhân sự khác')",[worker1,worker2]);
 await pool.query("insert into local_attendance(worker_id,attendance_method,work_date,day_units,calculated_amount,idempotency_key)values($1,'DAY','2026-10-12',1,55555,'qa-one'),($2,'DAY','2026-10-12',1,77777,'qa-two')",[worker1,worker2]);
 conn=expectStatus(await call('/api/integration-access/connections/'+conn.id+'/grants',admin,'PUT',{version:conn.policy_version,grants:[...grants,{capability:'attendance.read',resource_ids:[worker1]},{capability:'inventory.read',resource_ids:[w1],secondary_ids:[i1]}],reason:'Additional scopes'}),200,'add attendance and inventory');
 const wideKey=await newKey(['attendance.read','inventory.read']);
 const summary=expectStatus(await call('/api/integrations/v1/attendance?from=2026-10-01&to=2026-10-31',wideKey.secret),200,'scoped attendance');assert.deepEqual(summary.data.map(r=>r.worker_id),[worker1]);for(const f of ['rate_amount','calculated_amount','notes','bank_account'])assert.ok(!(f in summary.data[0]),'attendance privacy');
 const inventory=expectStatus(await call('/api/integrations/v1/inventory',wideKey.secret),200,'inventory scope intersection ledger');assert.equal(inventory.data.length,1);assert.equal(inventory.data[0].warehouse_id,w1);assert.equal(inventory.data[0].inventory_item_id,i1);assert.equal(inventory.data[0].quantity_on_hand,'10.1233');assert.equal(inventory.data[0].unit,'PIECE');for(const f of ['unit_cost','value_delta','reservation','available_to_promise'])assert.ok(!(f in inventory.data[0]),'inventory excludes valuation and not ATP');
 expectStatus(await call('/api/integrations/v1/attendance?from=2026-02-30&to=2026-03-01',wideKey.secret),400,'strict calendar date');
 expectStatus(await call('/api/integrations/v1/attendance?from=2026-10-01&to=2026-12-01',wideKey.secret),400,'bounded date range');
 expectStatus(await call('/api/integrations/v1/inventory/'+w2,wideKey.secret),404,'inventory outside warehouse');
 pass('Attendance privacy calendar bounds and warehouse scope');
 conn=expectStatus(await call('/api/integration-access/connections/'+conn.id+'/grants',admin,'PUT',{version:conn.policy_version,grants:[grants[0]],reason:'Reduced scope'}),200,'reduce grant');expectStatus(await call('/api/integrations/v1/customers',key.secret),403,'grant reduction effective');
 await call('/api/integration-access/keys/'+key.key.id+'/revoke',admin,'POST',{reason:'Test revoke'});expectStatus(await call('/api/integrations/v1/products',key.secret),401,'revoked');
 pass('Optimistic concurrent policy edits and live grant reduction/revocation');
 const auditRows=(await pool.query('select * from integration_access.audit')).rows;
 assert.ok(auditRows.length>0);assert.ok(!JSON.stringify(auditRows).includes(key.secret));assert.ok(!JSON.stringify(auditRows).includes(dbPassword));assert.ok(!logs.includes(dbPassword));
 pass('Audit present and fixture secrets excluded');
 const quotaKey=await newKey(['products.read']);
 await pool.query("insert into integration_access.quotas(key_id,minute,requests)values($1,date_trunc('minute',now()),59)",[quotaKey.key.id]);
 expectStatus(await call('/api/integrations/v1/products',quotaKey.secret),200,'quota request 60');
 expectStatus(await call('/api/mcp',quotaKey.secret,'POST',{jsonrpc:'2.0',id:1,method:'tools/list',params:{}},{accept:'application/json, text/event-stream'}),429,'MCP shares REST quota');
 await stopApi();await startApi();expectStatus(await call('/api/integrations/v1/products',quotaKey.secret),429,'quota survives process restart');
 pass('Combined REST MCP database quota survives restart');
 const concurrencyKey=await newKey(['products.read']);const lock=await pool.connect();await lock.query('begin');await lock.query('select id from integration_access.connections where id=$1 for update',[conn.id]);
 const pending=Array.from({length:4},()=>call('/api/integrations/v1/products',concurrencyKey.secret));
 try{
  for(let n=0;n<100;n++){const quota=(await pool.query('select sum(requests)::integer requests from integration_access.quotas where key_id=$1',[concurrencyKey.key.id])).rows[0].requests;if(quota===4)break;await new Promise(r=>setTimeout(r,10));}
  await new Promise(r=>setTimeout(r,100));expectStatus(await call('/api/integrations/v1/products',concurrencyKey.secret),429,'fifth simultaneous request denied');
 }finally{await lock.query('rollback');lock.release();}
 for(const result of await Promise.all(pending))expectStatus(result,200,'four permitted concurrent reads');
 pass('Four inflight request cap enforced independently of database minute quota');
 const abortedKey=await newKey(['products.read']);const abortLock=await pool.connect();await abortLock.query('begin');await abortLock.query('select id from integration_access.connections where id=$1 for update',[conn.id]);
 const waitForBlocked=async(pattern,count)=>{for(let attempt=0;attempt<150;attempt++){const n=(await pool.query("select count(*)::integer n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query ilike $1",[pattern])).rows[0].n;if(n>=count)return;await new Promise(r=>setTimeout(r,10));}throw new Error('Aborted-request fixture did not reach SQL wait');};
 const fireAbort=()=>{const req=httpRequest(base+'/api/integrations/v1/products',{headers:{host:'crm.example.com',authorization:'Bearer '+abortedKey.secret}},res=>res.resume());req.on('error',()=>{});req.end();return req;};
 try{for(let n=0;n<4;n++){const req=fireAbort();await waitForBlocked('select id from integration_access.connections%',n+1);req.destroy();await new Promise(r=>setTimeout(r,50));}expectStatus(await call('/api/integrations/v1/products',abortedKey.secret),429,'aborted SQL still occupies four slots');}finally{await abortLock.query('rollback');abortLock.release();}
 await new Promise(r=>setTimeout(r,300));expectStatus(await call('/api/integrations/v1/products',abortedKey.secret),200,'aborted SQL slots released after settlement');
 const authLock=await pool.connect();await authLock.query('begin');await authLock.query('lock table integration_access.keys in access exclusive mode');
 try{for(let n=0;n<4;n++){const req=fireAbort();await waitForBlocked('select k.id key_id%',n+1);req.destroy();await new Promise(r=>setTimeout(r,30));}}finally{await authLock.query('rollback');authLock.release();}
 await new Promise(r=>setTimeout(r,300));expectStatus(await call('/api/integrations/v1/products',abortedKey.secret),200,'auth-await aborts do not leak key slots');
 const mcpLock=await pool.connect();await mcpLock.query('begin');await mcpLock.query('select id from integration_access.connections where id=$1 for update',[conn.id]);
 try{for(let n=0;n<4;n++){const req=httpRequest(base+'/api/mcp',{method:'POST',headers:{host:'crm.example.com',authorization:'Bearer '+abortedKey.secret,accept:'application/json, text/event-stream','content-type':'application/json'}},res=>res.resume());req.on('error',()=>{});req.end(JSON.stringify({jsonrpc:'2.0',id:n+1,method:'tools/call',params:{name:'search_products',arguments:{}}}));await waitForBlocked('select id from integration_access.connections%',n+1);req.destroy();await new Promise(r=>setTimeout(r,30));}expectStatus(await call('/api/integrations/v1/products',abortedKey.secret),429,'aborted MCP work retains four shared slots');}finally{await mcpLock.query('rollback');mcpLock.release();}
 await new Promise(r=>setTimeout(r,300));expectStatus(await call('/api/integrations/v1/products',abortedKey.secret),200,'MCP abort slots recover after SQL settles');
 const recoveredMcp=expectStatus(await call('/api/mcp',abortedKey.secret,'POST',{jsonrpc:'2.0',id:99,method:'tools/call',params:{name:'search_products',arguments:{}}},{accept:'application/json, text/event-stream'}),200,'valid MCP after abort settlement');assert.deepEqual(recoveredMcp.result.structuredContent.data.map(r=>r.id),[p1]);
 pass('Aborted SQL retains budget until settled and authentication aborts do not leak');
 const batchKey=await newKey(['products.read']);const batch=Array.from({length:6},(_,n)=>({jsonrpc:'2.0',id:n+1,method:'tools/call',params:{name:'search_products',arguments:{}}}));
 expectStatus(await call('/api/mcp',batchKey.secret,'POST',batch,{accept:'application/json, text/event-stream'}),400,'MCP batch rejected');
 assert.equal((await pool.query("select count(*)::integer n from integration_access.audit where key_id=$1 and action='products.read'",[batchKey.key.id])).rows[0].n,0,'batch ran no tool reads');assert.ok(Number((await pool.query('select coalesce(sum(requests),0)::integer n from integration_access.quotas where key_id=$1',[batchKey.key.id])).rows[0].n)<=1,'batch at most one quota request');
 pass('Six-tool MCP array rejected before dispatch');
 let partialConn=await create('Partial inventory scope QA');partialConn=expectStatus(await call('/api/integration-access/connections/'+partialConn.id+'/grants',admin,'PUT',{version:partialConn.policy_version,grants:[{capability:'products.read',resource_ids:[p1]},{capability:'inventory.read',resource_ids:[w1],secondary_ids:[]}],reason:'Incomplete inventory scope'}),200,'partial scope persisted as disabled');
 const partialBody={name:'Partial scope key',capabilities:['inventory.read'],expires_at:new Date(Date.now()+86400000).toISOString(),reason:'Incomplete scope must not issue'};expectStatus(await call('/api/integration-access/connections/'+partialConn.id+'/keys',admin,'POST',partialBody),400,'partial inventory cannot issue key');
 const partialOld=expectStatus(await call('/api/integration-access/connections/'+partialConn.id+'/keys',admin,'POST',{...partialBody,capabilities:['products.read']}),201,'create valid product key');expectStatus(await call('/api/integration-access/connections/'+partialConn.id+'/keys',admin,'POST',{...partialBody,rotate_key_id:partialOld.key.id}),400,'invalid rotation rejected before revoke');expectStatus(await call('/api/integrations/v1/products',partialOld.secret),200,'invalid rotation preserves old key');
 pass('Partial inventory key issue and rotation rejected without revoking old key');
 await create('Kết nối kiểm thử có tên dài để kiểm tra giao diện di động một');await create('Kết nối kiểm thử có tên dài để kiểm tra giao diện di động hai');
 await stopApi();await startApi(true,undefined,false);expectStatus(await call('/api/integrations/v1/products',quotaKey.secret),503,'feature off REST');expectStatus(await call('/api/mcp',quotaKey.secret,'POST',{}),503,'feature off MCP');assert.equal(expectStatus(await call('/api/integration-access/catalog',admin),200,'off admin catalog').enabled,false);await stopApi();await startApi();
 pass('Feature OFF REST MCP blocked while admin setup visible');
 // Real frontend workflows use a separate, isolated development API with demo
 // explicitly disabled. All requests hit the SQL fixture; no UI route mocks.
 if(browserChecks){
 const frontendPort=await freePort(),origin='http://127.0.0.1:'+frontendPort;
 await stopApi();await startApi(false,origin);
 frontend=createServer(async(req,res)=>{
   if(req.url.startsWith('/api/')||req.url==='/health'){
     const upstream=httpRequest(base+req.url,{method:req.method,headers:{...req.headers,host:'127.0.0.1:'+port}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);return;
   }
   try{const requested=path.join(repo,'dist',new URL(req.url,origin).pathname);let file=requested;try{if(!(await stat(file)).isFile())file=path.join(repo,'dist/index.html');}catch{file=path.join(repo,'dist/index.html');}const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'})[ext]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=500;res.end('fixture static error');}
 });frontend.listen(frontendPort,'127.0.0.1');await once(frontend,'listening');
 browser=await chromium.launch({headless:true,...(process.env.INTEGRATION_QA_CHROMIUM?{executablePath:process.env.INTEGRATION_QA_CHROMIUM}:{})});
 for(const [view,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
   const context=await browser.newContext({viewport});const page=await context.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
   await page.goto(origin+'/auth');await page.getByLabel('Email',{exact:true}).fill('admin@fixture.invalid');await page.getByLabel('Mật khẩu',{exact:true}).fill(password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(view==='mobile'?'**/menu':'**/dashboard');
   if(view==='desktop')await page.getByRole('link',{name:/API & kết nối Agent/}).click();
   else{await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:/API.*Agent/}).click();}
   await page.waitForURL('**/integration-access');await page.getByRole('heading',{name:'API & kết nối Agent',exact:true}).waitFor();
   if(view==='mobile'){await page.goto(origin+'/menu');await page.getByText('API & Agent',{exact:true}).click();await page.waitForURL('**/integration-access');}
   await page.getByRole('textbox',{name:'Tên kết nối',exact:true}).fill('UI QA '+view);await page.getByRole('textbox',{name:'Mô tả kết nối',exact:true}).fill('Actual independent browser test');await page.getByRole('button',{name:'Tạo kết nối',exact:true}).click();await page.getByRole('heading',{name:'UI QA '+view,exact:true}).waitFor();
   await page.getByText('Sản phẩm · Chỉ xem',{exact:true}).click();await page.getByRole('textbox',{name:'Tìm Sản phẩm',exact:true}).fill('QA-ALLOW');await page.getByText('QA-ALLOW · Sản phẩm được cấp',{exact:true}).click();
   await page.getByRole('textbox',{name:'Lý do thay đổi',exact:true}).fill('Browser scope test');await page.getByRole('button',{name:'Lưu quyền và phạm vi',exact:true}).click();await page.getByText('Đã lưu quyền truy cập',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Hermes QA',exact:true}).click();await page.getByRole('heading',{name:'Hermes QA',exact:true}).waitFor();await page.getByRole('button',{name:'UI QA '+view,exact:true}).click();await page.getByText('QA-ALLOW · Sản phẩm được cấp',{exact:true}).waitFor();
   await page.getByText('Khách hàng · Chỉ xem',{exact:true}).click();await page.getByRole('textbox',{name:'Tìm Khách hàng',exact:true}).fill('QA-C1');await page.getByText('QA-C1 · Khách được cấp',{exact:true}).click();
   await page.getByRole('tab',{name:'Khóa truy cập',exact:true}).click();await page.getByLabel('Tên khóa',{exact:true}).fill('Browser '+view);await page.getByLabel('Số ngày hiệu lực (1–366)',{exact:true}).fill('1');
   assert.equal(await page.getByRole('tabpanel').getByText('Khách hàng',{exact:true}).count(),0,'unsaved draft does not grant key rights');
   await page.getByRole('tabpanel').getByText('Sản phẩm',{exact:true}).click();await page.getByRole('textbox',{name:'Lý do thay đổi',exact:true}).fill('Browser key test');await page.getByRole('button',{name:'Cấp khóa',exact:true}).click();await page.getByRole('dialog').waitFor();
   const revealed=await page.getByRole('textbox',{name:'Khóa API vừa cấp',exact:true}).inputValue();assert.ok(revealed.startsWith('jf_agent_'));
   await page.getByRole('button',{name:'Đã lưu, đóng',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.getByRole('textbox',{name:'Khóa API vừa cấp',exact:true}).count(),0);
   const check=await fetch(base+'/api/integrations/v1/products',{headers:{authorization:'Bearer '+revealed}});assert.equal(check.status,200);assert.deepEqual((await check.json()).data.map(r=>r.id),[p1]);
   await page.getByRole('textbox',{name:'Lý do thay đổi',exact:true}).fill('Browser revoke test');await page.getByRole('button',{name:'Thu hồi',exact:true}).click();await page.getByText('Đã thu hồi khóa',{exact:true}).waitFor();assert.equal((await fetch(base+'/api/integrations/v1/products',{headers:{authorization:'Bearer '+revealed}})).status,401);
   await page.getByRole('tab',{name:'Quyền truy cập',exact:true}).click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no page horizontal overflow '+view);assert.deepEqual(pageErrors,[],'no browser exceptions '+view);
   await page.getByRole('textbox',{name:'Lý do thay đổi',exact:true}).fill('Browser pause draft test');await page.getByRole('button',{name:'Tạm dừng',exact:true}).click();await page.getByRole('button',{name:'Bật kết nối',exact:true}).waitFor();
   await page.getByRole('textbox',{name:'Lý do thay đổi',exact:true}).fill('Browser resume draft test');await page.getByRole('button',{name:'Bật kết nối',exact:true}).click();await page.getByRole('button',{name:'Tạm dừng',exact:true}).waitFor();
   await page.getByRole('textbox',{name:'Lý do thay đổi',exact:true}).fill('Browser save retained draft');const savedResponse=page.waitForResponse(r=>r.url().endsWith('/grants')&&r.request().method()==='PUT');await page.getByRole('button',{name:'Lưu quyền và phạm vi',exact:true}).click();assert.equal((await savedResponse).status(),200,'retained draft save not409');
   await page.getByRole('tab',{name:'Khóa truy cập',exact:true}).click();await page.getByRole('tabpanel').getByText('Khách hàng',{exact:true}).waitFor();
   // Hold real SQL-backed mutation responses to exercise UI interaction locks.
   if(view==='desktop'){
    const delayed=async(pattern,method)=>{let release,signal;const gate=new Promise(r=>release=r),started=new Promise(r=>signal=r);await page.route(pattern,async route=>{if(route.request().method()!==method){await route.continue();return;}const response=await route.fetch();signal(response.status());await gate;await route.fulfill({response});});return{release,started,close:()=>page.unroute(pattern)};};
    await page.getByRole('textbox',{name:'Lý do thay đổi',exact:true}).fill('Locked delayed key creation');const keyDelay=await delayed('**/api/integration-access/connections/*/keys','POST');await page.getByRole('button',{name:'Cấp khóa',exact:true}).click();assert.equal(await keyDelay.started,201);assert.equal(await page.getByRole('button',{name:'Hermes QA',exact:true}).isEnabled(),false,'switch disabled while key pending');
    let refetchFailures=0;await page.route('**/api/integration-access/connections',async route=>{if(route.request().method()==='GET'){refetchFailures++;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Isolated fixture background refresh error'})});}else await route.continue();});
    keyDelay.release();await page.getByRole('dialog').waitFor();const pendingSecret=await page.getByRole('textbox',{name:'Khóa API vừa cấp',exact:true}).inputValue();assert.equal((await fetch(base+'/api/integrations/v1/products',{headers:{authorization:'Bearer '+pendingSecret}})).status,200);
    await page.waitForTimeout(1500);assert.ok(refetchFailures>0,'actual key creation triggered failing background refresh');await page.keyboard.press('Escape');await page.mouse.click(4,4);assert.equal(await page.getByRole('dialog').isVisible(),true,'refetch error Escape and outside click preserve one-time key');assert.equal(await page.getByRole('textbox',{name:'Khóa API vừa cấp',exact:true}).inputValue(),pendingSecret,'key retained on failing parent refresh');
    await page.getByRole('button',{name:'Đã lưu, đóng',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await keyDelay.close();await page.unroute('**/api/integration-access/connections');await page.getByRole('button',{name:'Tải lại danh sách',exact:true}).click();
    await page.getByRole('textbox',{name:'Lý do thay đổi',exact:true}).fill('Locked delayed rotation');await page.getByRole('button',{name:'Đổi khóa',exact:true}).first().click();const rotateDelay=await delayed('**/api/integration-access/connections/*/keys','POST');await page.getByRole('button',{name:'Đổi và thu hồi khóa cũ',exact:true}).click();assert.equal(await rotateDelay.started,201);assert.equal(await page.getByRole('button',{name:'Hermes QA',exact:true}).isEnabled(),false,'switch disabled while rotate pending');rotateDelay.release();await page.getByRole('dialog').waitFor();const rotatedSecret=await page.getByRole('textbox',{name:'Khóa API vừa cấp',exact:true}).inputValue();assert.equal((await fetch(base+'/api/integrations/v1/products',{headers:{authorization:'Bearer '+rotatedSecret}})).status,200);await page.getByRole('button',{name:'Đã lưu, đóng',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await rotateDelay.close();
    await page.getByRole('tab',{name:'Quyền truy cập',exact:true}).click();await page.getByRole('textbox',{name:'Lý do thay đổi',exact:true}).fill('Locked delayed permission save');const saveDelay=await delayed('**/api/integration-access/connections/*/grants','PUT');await page.getByRole('button',{name:'Lưu quyền và phạm vi',exact:true}).click();assert.equal(await saveDelay.started,200);assert.equal(await page.getByRole('checkbox',{name:'Cho xem email, số điện thoại và địa chỉ khách hàng',exact:true}).isEnabled(),false,'contact draft disabled during save');assert.equal(await page.getByRole('checkbox',{name:'QA-C1 · Khách được cấp',exact:true}).isEnabled(),false,'resource draft disabled during save');saveDelay.release();await page.getByRole('button',{name:'Lưu quyền và phạm vi',exact:true}).waitFor();await saveDelay.close();
    pass('Delayed key create rotation and permission save lock editor until response');
   }
   await page.getByRole('tab',{name:'Quyền truy cập',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(5500);await page.screenshot({path:path.join(artifactsRoot,view+'-viewport.png'),fullPage:false});
   await context.close();pass('Actual '+view+' admin login create scope picker key one-time reveal revoke');
 }
 }
 console.log('CORE QA COMPLETE ('+checks.length+' groups)');
}catch(error){
 if(browser){const page=browser.contexts().flatMap(c=>c.pages()).at(-1);if(page&&await page.getByRole('textbox',{name:'Khóa API vừa cấp',exact:true}).count()===0){await page.screenshot({path:path.join(artifactsRoot,'failure.png'),fullPage:true});console.log('Failure browser pathname: '+new URL(page.url()).pathname);console.log((await page.locator('body').innerText()).slice(0,1200));}}
 throw error;
}finally{
 await browser?.close();if(frontend)await new Promise(r=>frontend.close(r));await stopApi();await pool?.end();
 if(created)sqlAdmin('DROP DATABASE '+database+' WITH (FORCE)');sqlAdmin('DROP ROLE IF EXISTS '+role);
 console.log('CLEANUP isolated database and role removed');
}
