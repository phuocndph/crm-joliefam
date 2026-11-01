// Focused actual API/PostgreSQL checks. Disposable tmpfs container; no .env or business DB.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {randomBytes,randomUUID,scryptSync} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';

const key=()=>randomUUID(),delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const image='sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
const owner=key(),name='sales-fulfillment-'+owner,secret=randomBytes(24).toString('hex');
const stage='.local-staging-runtime/production-sales-fulfillment-20261030';
const results=[];let container,control,pool,api,storage,base,token,logs='';
const cleanEnv=()=>Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,(r.stderr||'Docker failed').replaceAll(secret,'[redacted]'));return r.stdout.trim();}
const call=async(url,method='GET',body,auth=token)=>{
 const r=await fetch(base+url,{method,headers:{origin:'https://fixture.invalid',...(auth?{authorization:'Bearer '+auth}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 return {status:r.status,body:await r.json().catch(()=>null)};
};
const must=async(...args)=>{const r=await call(...args);assert.ok(r.status<300,JSON.stringify({url:args[0],...r}));return r.body;};
async function check(label,fn){try{await fn();results.push({label,status:'PASS'});console.log('PASS '+label);}catch(e){results.push({label,status:'FAIL',error:e.stack?.replaceAll(secret,'[redacted]')});console.log('FAIL '+label+': '+e.message.replaceAll(secret,'[redacted]'));}}
try{
 await mkdir(stage,{recursive:true});
 container=docker(['run','--pull=never','-d','--name',name,'--label','crm.qa.owner='+owner,'--tmpfs','/var/lib/postgresql/data:rw,size=536870912','-p','127.0.0.1::5432','-e','POSTGRES_USER=fixture_owner','-e','POSTGRES_PASSWORD='+secret,'-e','POSTGRES_DB=fixture_control',image]);
 const inspection=JSON.parse(docker(['inspect',container]))[0];assert.equal(inspection.Config.Labels['crm.qa.owner'],owner);assert.equal(inspection.Image,image);
 const binding=inspection.NetworkSettings.Ports['5432/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');
 const port=binding.HostPort;control=new pg.Pool({connectionString:`postgres://fixture_owner:${secret}@127.0.0.1:${port}/fixture_control`});
 let ready=false;for(let i=0;i<100;i++){try{await control.query('select 1');ready=true;break;}catch{}await delay(100);}assert.ok(ready,'Disposable PostgreSQL ready');
 await control.query(`create role fixture_app login nosuperuser nocreatedb nocreaterole password '${secret}'`);await control.query('create database sales_fulfillment_fixture owner fixture_app');
 const connectionString=`postgres://fixture_app:${secret}@127.0.0.1:${port}/sales_fulfillment_fixture`;pool=new pg.Pool({connectionString});
 storage=await mkdtemp(path.join(tmpdir(),'sales-fulfillment-'));
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const apiPort=listener.address().port;await new Promise(r=>listener.close(r));base='http://127.0.0.1:'+apiPort;
 const denyFetch='globalThis.fetch=async()=>{throw Error("Test denies external requests")};';
 api=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(denyFetch),'server-dist/index.js'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...cleanEnv(),NODE_ENV:'production',PUBLIC_APP_URL:'https://fixture.invalid',LOCAL_ALLOWED_ORIGINS:'https://fixture.invalid',LOCAL_DATABASE_URL:connectionString,LOCAL_STORAGE_ROOT:storage,LOCAL_API_HOST:'127.0.0.1',LOCAL_API_PORT:String(apiPort),LOCAL_DB_STARTUP_MODE:'normal',LOCAL_SYNC_AUTO:'false',LOCAL_INTEGRATION_API:'false',LOCAL_ZCRM_API:'false',LOCAL_DEMO_AUTH:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false'}});
 api.stdout.on('data',x=>logs+=x);api.stderr.on('data',x=>logs+=x);ready=false;
 for(let i=0;i<300;i++){assert.equal(api.exitCode,null,'Fixture API exited');try{if((await(await fetch(base+'/health',{signal:AbortSignal.timeout(1000)})).json()).database==='sales_fulfillment_fixture'){ready=true;break;}}catch{}await delay(100);}assert.ok(ready,'Fixture API ready');
 assert.equal((await pool.query('select current_database() db')).rows[0].db,'sales_fulfillment_fixture');
 const actor=key(),password='FixtureOnly!93231',salt=randomBytes(16).toString('hex');
 await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[actor,'name-only@fixture.invalid',`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);await pool.query("insert into local_user_roles(user_id,role)values($1,'admin')",[actor]);
 token=(await must('/api/local-auth/login','POST',{email:'name-only@fixture.invalid',password},null)).token;assert.ok(token);
 const saleId=key(),salePass='FixtureSaleOnly!84133',saleSalt=randomBytes(16).toString('hex');
 await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[saleId,'sale@fixture.invalid',`scrypt$${saleSalt}$${scryptSync(salePass,saleSalt,64).toString('hex')}`]);await pool.query("insert into local_user_roles(user_id,role)values($1,'employee')",[saleId]);
 await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled,assigned_by,reason)select $1,p,true,$2,'Isolated sale fixture'from unnest($3::text[])p",[saleId,actor,['orders','production_sales_submit']]);
 const sale=(await must('/api/local-auth/login','POST',{email:'sale@fixture.invalid',password:salePass},null)).token;
 const product=async(name,route)=>{const id=key();await pool.query('insert into local_products(id,sku,name,category,is_active)values($1,$2,$3,$4,true)',[id,'QA-'+key(),name,route==='PURCHASE'?'Đệm':'Ga']);if(route){const view=await must('/api/product-supply-classifications/'+id);await must('/api/product-supply-classifications/confirm','POST',{rows:[{product_id:id,route,expected_revision:view.revision,source_fingerprint:view.source_fingerprint}],reason:'Explicit isolated product route',idempotency_key:key()});}return id;};
 const sew=await product('Ga may fixture','SEW'),purchase=await product('Đệm nhập fixture','PURCHASE'),unknown=await product('Ga chưa xác nhận fixture'),stale=await product('Ga đổi đặc điểm fixture','SEW');
 await pool.query("update local_products set specifications='Changed specification after classification'where id=$1",[stale]);
 const order=async(products,owner=saleId)=>must('/api/orders','POST',{order_number:'SALE-QA-'+key(),manager_id:owner,status:'processing',items:products.map((p,i)=>({id:'line-'+key(),product_id:p.product||p,quantity:p.quantity||10,color:p.color||null,dimensions:p.dimensions||null}))});
 const source=async(id,auth=sale)=>{const rows=await must('/api/production/source-orders?order_id='+id,'GET',undefined,auth);assert.ok(Array.isArray(rows));return rows.find(x=>x.id===id);};
 const submit=async(o,lines,auth=sale,extra={})=>must('/api/production-sales/requests','POST',{order_id:o.id,lines,idempotency_key:key(),...extra},auth);
 const accept=req=>must('/api/production-sales/requests/'+req.id+'/review','POST',{target_status:'ACCEPTED',reason:'Independent manager acceptance',idempotency_key:key()});
 const allocate=(req,lines,extra={})=>({url:'/api/production-sales/requests/'+req.id+'/allocate',body:{lines,idempotency_key:key(),...extra}});
 const poCount=async()=>Number((await pool.query('select count(*) n from local_production_orders')).rows[0].n);
 let main,mainSource,mainRequest;
 await check('1 exact source lookup retains Sale ownership and confirmed route',async()=>{
  main=await order([{product:sew,quantity:10}]);const foreign=await order([{product:sew,quantity:10}],actor);mainSource=await source(main.id);assert.ok(mainSource);assert.equal(mainSource.items.length,1);assert.equal(Number(mainSource.items[0].ordered_quantity),10);assert.equal(mainSource.items[0].fulfillment_route,'SEW');assert.equal(mainSource.items[0].fulfillment_status,'CONFIRMED');assert.equal(await source(foreign.id),undefined);
  const exact=await must('/api/production/source-orders?order_id='+main.id+'&search=not-the-order-number','GET',undefined,sale);assert.equal(exact.length,1);assert.equal(exact[0].id,main.id);
 });
 await check('2 partial Sale submission/replay/oversend and remaining quantities',async()=>{
  const body={order_id:main.id,lines:[{source_line_key:mainSource.items[0].source_line_key,quantity:4}],idempotency_key:key()};mainRequest=await must('/api/production-sales/requests','POST',body,sale);assert.equal((await must('/api/production-sales/requests','POST',body,sale)).id,mainRequest.id);
  const remaining=(await source(main.id)).items[0];assert.equal(Number(remaining.ordered_quantity),10);assert.equal(Number(remaining.submitted_quantity),4);assert.equal(Number(remaining.remaining_quantity),6);
  const over=await call('/api/production-sales/requests','POST',{...body,idempotency_key:key(),lines:[{source_line_key:mainSource.items[0].source_line_key,quantity:7}]},sale);assert.ok(over.status>=400,JSON.stringify(over));assert.equal(Number((await source(main.id)).items[0].remaining_quantity),6);
 });
 await check('3 separate manager acceptance required and RETURNED releases reservation',async()=>{
  const line=mainRequest.lines[0];const pre=allocate(mainRequest,[{request_line_id:line.id,quantity:1}]);const before=await poCount();assert.ok((await call(pre.url,'POST',pre.body)).status>=400);assert.equal(await poCount(),before);
  const denied=await call('/api/production-sales/requests/'+mainRequest.id+'/review','POST',{target_status:'ACCEPTED',idempotency_key:key()},sale);assert.equal(denied.status,403);
  const returned=await submit(main,[{source_line_key:mainSource.items[0].source_line_key,quantity:6}]);assert.equal(Number((await source(main.id)).items[0].remaining_quantity),0);await must('/api/production-sales/requests/'+returned.id+'/review','POST',{target_status:'RETURNED',reason:'Return unused request',idempotency_key:key()});assert.equal(Number((await source(main.id)).items[0].remaining_quantity),6);await accept(mainRequest);
 });
 await check('4 only accepted SEW allocation creates partial waves without retry duplicates',async()=>{
  const line=mainRequest.lines[0],first=allocate(mainRequest,[{request_line_id:line.id,quantity:2}]);const result=await must(first.url,'POST',first.body);const count=await poCount();const replay=await must(first.url,'POST',first.body);assert.equal(replay.orders[0].id,result.orders[0].id);assert.equal(await poCount(),count);
  const remainder=allocate(mainRequest,[{request_line_id:line.id,quantity:2}]);await must(remainder.url,'POST',remainder.body);const over=allocate(mainRequest,[{request_line_id:line.id,quantity:1}]);assert.ok((await call(over.url,'POST',over.body)).status>=400);assert.equal(await poCount(),count+1);
 });
 await check('5 PURCHASE unknown and stale classifications cannot create production orders',async()=>{
  for(const p of [purchase,unknown,stale]){const o=await order([{product:p,quantity:2}]),s=await source(o.id);assert.equal(s.items[0].fulfillment_status,p===purchase?'CONFIRMED':p===stale?'REVIEW':'UNCLASSIFIED');const req=await submit(o,[{source_line_key:s.items[0].source_line_key,quantity:2}]);await accept(req);const a=allocate(req,[{request_line_id:req.lines[0].id,quantity:2}]),before=await poCount(),r=await call(a.url,'POST',a.body);assert.ok(r.status>=400,JSON.stringify(r));assert.equal(await poCount(),before);}
 });
 await check('6 mixed valid SEW plus PURCHASE allocation fails as a whole',async()=>{
  const o=await order([{product:sew,quantity:2},{product:purchase,quantity:2}]),s=await source(o.id),req=await submit(o,s.items.map(l=>({source_line_key:l.source_line_key,quantity:2})));await accept(req);const a=allocate(req,req.lines.map(l=>({request_line_id:l.id,quantity:2}))),before=await poCount();assert.ok((await call(a.url,'POST',a.body)).status>=400);assert.equal(await poCount(),before);assert.equal(Number((await pool.query('select count(*) n from local_production_sales_allocations a join local_production_sales_request_lines l on l.id=a.request_line_id where l.request_id=$1',[req.id])).rows[0].n),0);
 });
 await check('7 changed source product quantity cannot allocate against old acceptance',async()=>{
  const o=await order([{product:sew,quantity:3}]),s=await source(o.id),req=await submit(o,[{source_line_key:s.items[0].source_line_key,quantity:3}]);await accept(req);await pool.query("update local_orders set items=jsonb_set(items,'{0,quantity}','4'::jsonb)where id=$1",[o.id]);const a=allocate(req,[{request_line_id:req.lines[0].id,quantity:1}]),before=await poCount();assert.ok((await call(a.url,'POST',a.body)).status>=400);assert.equal(await poCount(),before);
 });
 await check('8 concurrent requests and allocation waves do not exceed source limits',async()=>{
  const o=await order([{product:sew,quantity:3}]),s=await source(o.id),body=()=>({order_id:o.id,lines:[{source_line_key:s.items[0].source_line_key,quantity:2}],idempotency_key:key()});const pair=await Promise.all([call('/api/production-sales/requests','POST',body(),sale),call('/api/production-sales/requests','POST',body(),sale)]);assert.equal(pair.filter(x=>x.status<300).length,1);const req=pair.find(x=>x.status<300).body;await accept(req);const a=()=>allocate(req,[{request_line_id:req.lines[0].id,quantity:2}]);const a1=a(),a2=a(),waves=await Promise.all([call(a1.url,'POST',a1.body),call(a2.url,'POST',a2.body)]);assert.equal(waves.filter(x=>x.status<300).length,1);assert.equal(Number((await pool.query('select sum(quantity) n from local_production_sales_allocations where request_line_id=$1',[req.lines[0].id])).rows[0].n),2);
 });

}catch(e){results.push({label:'fixture',status:'FAIL',error:e.stack?.replaceAll(secret,'[redacted]')});console.log('FAIL fixture '+e.message.replaceAll(secret,'[redacted]'));}
finally{
 if(api&&api.exitCode===null&&api.signalCode===null){const exit=once(api,'exit');api.kill();await Promise.race([exit,delay(3000)]);if(api.exitCode===null&&api.signalCode===null)api.kill('SIGKILL');}
 await pool?.end();await control?.end();
 if(container){const actual=JSON.parse(docker(['inspect',container]))[0];assert.equal(actual.Id,container);assert.equal(actual.Name,'/'+name);assert.equal(actual.Config.Labels['crm.qa.owner'],owner);docker(['rm','-f',container]);}
 if(storage){const resolved=path.resolve(storage);assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(resolved).startsWith('sales-fulfillment-'));await rm(resolved,{recursive:true,force:true});}
 await mkdir(stage,{recursive:true});const output=path.join(stage,'focused-api-'+Date.now()+'.json');await writeFile(output,JSON.stringify({results,api_stopped:!api||api.exitCode!==null||api.signalCode!==null,container_removed:!!container,source_business_writes:0},null,2));await writeFile(output.replace('.json','.log'),logs.replaceAll(secret,'[redacted]'));
 console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,output}));if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
}
