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
const owner=key(),name='readygoods-fulfillment-'+owner,secret=randomBytes(24).toString('hex');
const stage='.local-staging-runtime/readygoods-fulfillment-20261030';
const focused=process.argv.includes('--focused-replan');
const results=[];let container,control,pool,api,storage,base,token,logs='';
const cleanEnv=()=>Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,(r.stderr||'Docker failed').replaceAll(secret,'[redacted]'));return r.stdout.trim();}
const call=async(url,method='GET',body,auth=token)=>{
 const r=await fetch(base+url,{method,headers:{origin:'https://fixture.invalid',...(auth?{authorization:'Bearer '+auth}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 return {status:r.status,body:await r.json().catch(()=>null)};
};
const must=async(...args)=>{const r=await call(...args);assert.ok(r.status<300,JSON.stringify({url:args[0],...r}));return r.body;};
async function check(label,fn){if(focused&&!label.startsWith('focused'))return;try{await fn();results.push({label,status:'PASS'});console.log('PASS '+label);}catch(e){results.push({label,status:'FAIL',error:e.stack?.replaceAll(secret,'[redacted]')});console.log('FAIL '+label+': '+e.message.replaceAll(secret,'[redacted]'));}}
try{
 await mkdir(stage,{recursive:true});
 container=docker(['run','--pull=never','-d','--name',name,'--label','crm.qa.owner='+owner,'--tmpfs','/var/lib/postgresql/data:rw,size=536870912','-p','127.0.0.1::5432','-e','POSTGRES_USER=fixture_owner','-e','POSTGRES_PASSWORD='+secret,'-e','POSTGRES_DB=fixture_control',image]);
 const inspection=JSON.parse(docker(['inspect',container]))[0];assert.equal(inspection.Config.Labels['crm.qa.owner'],owner);assert.equal(inspection.Image,image);
 const binding=inspection.NetworkSettings.Ports['5432/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');
 const port=binding.HostPort;control=new pg.Pool({connectionString:`postgres://fixture_owner:${secret}@127.0.0.1:${port}/fixture_control`});
 let ready=false;for(let i=0;i<100;i++){try{await control.query('select 1');ready=true;break;}catch{}await delay(100);}assert.ok(ready,'Disposable PostgreSQL ready');
 await control.query(`create role fixture_app login nosuperuser nocreatedb nocreaterole password '${secret}'`);await control.query('create database readygoods_fixture owner fixture_app');
 const connectionString=`postgres://fixture_app:${secret}@127.0.0.1:${port}/readygoods_fixture`;pool=new pg.Pool({connectionString});
 storage=await mkdtemp(path.join(tmpdir(),'readygoods-fulfillment-'));
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const apiPort=listener.address().port;await new Promise(r=>listener.close(r));base='http://127.0.0.1:'+apiPort;
 const denyFetch='globalThis.fetch=async()=>{throw Error("Test denies external requests")};';
 api=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(denyFetch),'server-dist/index.js'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...cleanEnv(),NODE_ENV:'production',PUBLIC_APP_URL:'https://fixture.invalid',LOCAL_ALLOWED_ORIGINS:'https://fixture.invalid',LOCAL_DATABASE_URL:connectionString,LOCAL_STORAGE_ROOT:storage,LOCAL_API_HOST:'127.0.0.1',LOCAL_API_PORT:String(apiPort),LOCAL_DB_STARTUP_MODE:'normal',LOCAL_SYNC_AUTO:'false',LOCAL_INTEGRATION_API:'false',LOCAL_ZCRM_API:'false',LOCAL_DEMO_AUTH:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false'}});
 api.stdout.on('data',x=>logs+=x);api.stderr.on('data',x=>logs+=x);ready=false;
 for(let i=0;i<300;i++){assert.equal(api.exitCode,null,'Fixture API exited');try{if((await(await fetch(base+'/health',{signal:AbortSignal.timeout(1000)})).json()).database==='readygoods_fixture'){ready=true;break;}}catch{}await delay(100);}assert.ok(ready,'Fixture API ready');
 assert.equal((await pool.query('select current_database() db')).rows[0].db,'readygoods_fixture');
 const actor=key(),password='FixtureOnly!93231',salt=randomBytes(16).toString('hex');
 await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[actor,'name-only@fixture.invalid',`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);await pool.query("insert into local_user_roles(user_id,role)values($1,'admin')",[actor]);
 token=(await must('/api/local-auth/login','POST',{email:'name-only@fixture.invalid',password},null)).token;assert.ok(token);
 const saleId=key(),salePass='FixtureSaleOnly!84133',saleSalt=randomBytes(16).toString('hex');
 await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[saleId,'sale@fixture.invalid',`scrypt$${saleSalt}$${scryptSync(salePass,saleSalt,64).toString('hex')}`]);await pool.query("insert into local_user_roles(user_id,role)values($1,'employee')",[saleId]);
 await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled,assigned_by,reason)select $1,p,true,$2,'Isolated sale fixture'from unnest($3::text[])p",[saleId,actor,['orders','production_sales_submit']]);
 const sale=(await must('/api/local-auth/login','POST',{email:'sale@fixture.invalid',password:salePass},null)).token;

 const product=async(route='PURCHASE',classified=true)=>{const id=key();await pool.query('insert into local_products(id,sku,name,category,is_active)values($1,$2,$3,$4,true)',[id,'QA-'+key(),'Ready goods '+id,'Đệm']);if(classified){const view=await must('/api/product-supply-classifications/'+id);await must('/api/product-supply-classifications/confirm','POST',{rows:[{product_id:id,route,expected_revision:view.revision,source_fingerprint:view.source_fingerprint}],reason:'Explicit isolated supply classification',idempotency_key:key()});}return id;};
 const item=async(unit='PIECE')=>(await pool.query("insert into local_inventory_items(code,name,item_type,base_unit)values($1,$2,'FINISHED_GOOD',$3)returning *",['QA-'+key(),'Synthetic goods',unit])).rows[0];
 const warehouse=async()=>(await pool.query("insert into local_inventory_warehouses(code,name)values($1,'Synthetic warehouse')returning *",['QA-'+key()])).rows[0];
 const order=async(p,quantity=10)=>must('/api/orders','POST',{order_number:'READY-QA-'+key(),manager_id:saleId,status:'processing',items:[{id:'line-'+key(),product_id:p,quantity}]});
 const source=async(o)=>(await must('/api/production/source-orders?order_id='+o.id,'GET',undefined,sale)).find(x=>x.id===o.id);
 const request=async(p,quantity=10,accept=true)=>{const o=await order(p,quantity),s=await source(o),req=await must('/api/production-sales/requests','POST',{order_id:o.id,lines:[{source_line_key:s.items[0].source_line_key,quantity}],idempotency_key:key()},sale);if(accept)await must('/api/production-sales/requests/'+req.id+'/review','POST',{target_status:'ACCEPTED',reason:'Independent manager approval',idempotency_key:key()});return {o,req,line:req.lines[0]};};
 const stock=async(i,w,quantity,{type='RECEIPT',confirm=true,to,unit=i.base_unit,...extra}={})=>{const doc=await must('/api/inventory/documents','POST',{document_type:type,warehouse_id:w.id,to_warehouse_id:to?.id,lines:[{inventory_item_id:i.id,quantity,unit,...extra}],idempotency_key:key()});if(confirm)await must('/api/inventory/documents/'+doc.id+'/confirm','POST',{});const movement=(await pool.query('select * from local_inventory_movements where document_id=$1 order by movement_sequence',[doc.id])).rows[0];return {doc,movement};};
 const planBody=(r,i,w,extra={})=>({request_id:r.req.id,lines:[{request_line_id:r.line.id,inventory_item_id:i.id,warehouse_id:w.id,confirm_product_mapping:true}],idempotency_key:key(),...extra});
 const list=async(r,auth=token)=>(await must('/api/purchase-fulfillment?request_id='+r.req.id,'GET',undefined,auth)).plans;
 const create=async(r,i,w,body=planBody(r,i,w))=>must('/api/purchase-fulfillment/plans','POST',body);
 const reserve=async(r,i,w)=>{await create(r,i,w);return (await list(r))[0];};
 const balance=async(i,w)=>Number((await pool.query('select coalesce(sum(quantity_delta),0)n from local_inventory_movements where inventory_item_id=$1 and warehouse_id=$2',[i.id,w.id])).rows[0].n);
 const denied=async(...args)=>{const r=await call(...args);assert.ok(r.status>=400,JSON.stringify(r));return r;};
 let main,mainItem,mainWarehouse,mainPlan,replayBody;
 await check('1 confirmed PURCHASE accepted source and explicit product mapping required',async()=>{
  mainItem=await item();mainWarehouse=await warehouse();
  const unaccepted=await request(await product(),1,false);await denied('/api/purchase-fulfillment/plans','POST',planBody(unaccepted,mainItem,mainWarehouse));
  for(const p of [await product('SEW'),await product('PURCHASE',false)]){const r=await request(p,1);await denied('/api/purchase-fulfillment/plans','POST',planBody(r,mainItem,mainWarehouse));}
  main=await request(await product(),10);const noConfirm=planBody(main,mainItem,mainWarehouse);noConfirm.lines[0].confirm_product_mapping=false;await denied('/api/purchase-fulfillment/plans','POST',noConfirm);
  assert.equal(Number((await pool.query('select count(*)n from local_production_product_inventory_maps where product_id=$1',[main.line.product_id])).rows[0].n),0,'No SKU/name-based mapping');
 });
 await check('2 need10 stock6 reserves6 and requests4 without stock movement or fake production',async()=>{
  await stock(mainItem,mainWarehouse,6);const before=Number((await pool.query('select count(*)n from local_inventory_movements')).rows[0].n),pos=Number((await pool.query('select count(*)n from local_production_orders')).rows[0].n);
  mainPlan=await reserve(main,mainItem,mainWarehouse);assert.equal(Number(mainPlan.held_quantity),6);assert.equal(Number(mainPlan.shortage_quantity),4);assert.equal(await balance(mainItem,mainWarehouse),6);assert.equal(Number((await pool.query('select count(*)n from local_inventory_movements')).rows[0].n),before);assert.equal(Number((await pool.query('select count(*)n from local_production_orders')).rows[0].n),pos);
 });
 await check('3 same-key replay and new-key retry cannot duplicate plan reservation or demand',async()=>{
  const body=planBody(main,mainItem,mainWarehouse);replayBody=body;await create(main,mainItem,mainWarehouse,body);await create(main,mainItem,mainWarehouse,body);await create(main,mainItem,mainWarehouse);const rows=await list(main);assert.equal(rows.length,1);assert.equal(rows[0].id,mainPlan.id);assert.equal(Number(rows[0].held_quantity),6);assert.equal(Number(rows[0].shortage_quantity),4);
 });
 let productionShip;
 await check('4 generic debit writers and direct production shipping cannot consume held goods',async()=>{
  const other=await warehouse();
  for(const [type,extra]of[['ISSUE',{}],['TRANSFER',{to:other}],['ADJUSTMENT',{adjustment_direction:'DECREASE'}],['RETURN_OUT',{}]]){
   const pending=await stock(mainItem,mainWarehouse,1,{type,confirm:false,...extra});await denied('/api/inventory/documents/'+pending.doc.id+'/confirm','POST',{});assert.equal(await balance(mainItem,mainWarehouse),6,type);assert.equal((await pool.query('select status from local_inventory_documents where id=$1',[pending.doc.id])).rows[0].status,'DRAFT');
  }
  const p=await product('SEW'),o=await order(p,6),s=await source(o),po=(await pool.query("insert into local_production_orders(production_order_number,production_batch_number,product_id,quantity_planned,status,order_id,workflow_generation)values($1,'SYNTHETIC', $2,6,'RELEASED',$3,'WORKFLOW_V3')returning id",['QA-PO-'+key(),p,o.id])).rows[0];
  const line=(await pool.query("insert into local_production_order_items(production_order_id,product_id,product_name,planned_quantity,source_order_item_key)values($1,$2,'Synthetic sewn goods',6,$3)returning id",[po.id,p,s.items[0].source_line_key])).rows[0];
  const receipt=(await pool.query("select * from local_inventory_movements where inventory_item_id=$1 and warehouse_id=$2 and movement_kind='RECEIPT'order by movement_sequence limit 1",[mainItem.id,mainWarehouse.id])).rows[0];
  const output=(await pool.query('insert into local_production_outputs(production_order_id,order_item_id,inventory_item_id,inventory_receipt_id,inventory_movement_id,quantity_good,warehouse_id,idempotency_key,created_by)values($1,$2,$3,$4,$5,6,$6,$7,$8)returning id',[po.id,line.id,mainItem.id,receipt.document_id,receipt.id,mainWarehouse.id,key(),actor])).rows[0];
  productionShip={url:'/api/production-workspace/'+po.id+'/ship',body:{output_id:output.id,quantity:1,idempotency_key:key()}};await denied(productionShip.url,'POST',productionShip.body);assert.equal(await balance(mainItem,mainWarehouse),6);assert.equal(Number((await pool.query('select count(*)n from local_production_shipments where production_order_id=$1',[po.id])).rows[0].n),0);
 });
 const receive=(shortage,movement,quantity,extra={})=>({url:'/api/purchase-fulfillment/shortages/'+shortage+'/receipts',body:{inventory_movement_id:movement,quantity,idempotency_key:key(),...extra}});
 await check('5 receipt links require confirmed exact stock and bound partial quantities/retries',async()=>{
  const shortage=mainPlan.shortage_id;assert.ok(shortage);const wrongItem=await item(),wrongWarehouse=await warehouse();
  for(const r of[await stock(wrongItem,mainWarehouse,1),await stock(mainItem,wrongWarehouse,1),await stock(mainItem,mainWarehouse,1,{unit:'METER'}),await stock(mainItem,mainWarehouse,1,{type:'OPENING_BALANCE'})]){const x=receive(shortage,r.movement.id,1);await denied(x.url,'POST',x.body);}
  const draft=await stock(mainItem,mainWarehouse,1,{confirm:false}),draftLine=(await pool.query('select id from local_inventory_document_lines where document_id=$1',[draft.doc.id])).rows[0];const d=receive(shortage,draftLine.id,1);await denied(d.url,'POST',d.body);
  const first=await stock(mainItem,mainWarehouse,2),r=receive(shortage,first.movement.id,1);await must(r.url,'POST',r.body);await must(r.url,'POST',r.body);assert.equal(Number((await list(main))[0].held_quantity),7,'Same-key receipt retry once');await must(r.url,'POST',{...r.body,idempotency_key:key()});await denied(r.url,'POST',{...r.body,idempotency_key:key()});assert.equal(Number((await list(main))[0].held_quantity),8);assert.equal(Number((await list(main))[0].shortage_quantity),2);
  const next=await stock(mainItem,mainWarehouse,3),over=receive(shortage,next.movement.id,3);await denied(over.url,'POST',over.body);const last=receive(shortage,next.movement.id,2);await must(last.url,'POST',last.body);const final=(await list(main))[0];assert.equal(Number(final.held_quantity),10);assert.equal(Number(final.shortage_quantity),0);assert.equal(Number(final.received_quantity),4);
  const otherRequest=await request(main.line.product_id,10),otherPlan=await reserve(otherRequest,mainItem,mainWarehouse);assert.ok(Number(otherPlan.shortage_quantity)>0);const double=receive(otherPlan.shortage_id,first.movement.id,1);await denied(double.url,'POST',double.body);
 });
 await check('6 stale/cancelled sources reject work and explicit release retains stock/history',async()=>{
  const p=await product(),i=await item(),w=await warehouse(),r=await request(p,2),plan=await reserve(r,i,w),receipt=await stock(i,w,1);
  await pool.query("update local_orders set items=jsonb_set(items,'{0,quantity}','3'::jsonb)where id=$1",[r.o.id]);const x=receive(plan.shortage_id,receipt.movement.id,1);await denied(x.url,'POST',x.body);await denied('/api/purchase-fulfillment/plans','POST',planBody(r,i,w));
  const release={reason:'Explicit manager release after source changed',idempotency_key:key()};await must('/api/purchase-fulfillment/plans/'+plan.id+'/release','POST',release);await must('/api/purchase-fulfillment/plans/'+plan.id+'/release','POST',release);
  const cancelled=await request(await product(),1);await pool.query("update local_orders set status='cancelled'where id=$1",[cancelled.o.id]);await denied('/api/purchase-fulfillment/plans','POST',planBody(cancelled,i,w));
  const before=await balance(mainItem,mainWarehouse);await must('/api/purchase-fulfillment/plans/'+mainPlan.id+'/release','POST',{reason:'Manager explicitly releases fulfilled reservation',idempotency_key:key()});const released=(await list(main))[0];assert.equal(Number(released.held_quantity),0);assert.equal(Number(released.received_quantity),4,'Confirmed receipt history retained');assert.equal(await balance(mainItem,mainWarehouse),before,'Release is not a stock movement');
  await must(productionShip.url,'POST',{...productionShip.body,idempotency_key:key()});assert.equal(await balance(mainItem,mainWarehouse),before-1,'Same direct ship succeeds after release');
  await create(main,mainItem,mainWarehouse);const replanned=(await list(main))[0];assert.notEqual(replanned.id,mainPlan.id);assert.equal(Number(replanned.received_quantity),0,'New plan starts with no receipts');assert.equal(Number((await pool.query('select received_quantity from local_purchase_shortage_demands where plan_id=$1',[mainPlan.id])).rows[0].received_quantity),4,'Released demand preserves receipt history');assert.equal(Number(replanned.held_quantity)+Number(replanned.shortage_quantity),10,'Replan covers exactly current need');const held=Number(replanned.held_quantity),short=Number(replanned.shortage_quantity);await create(main,mainItem,mainWarehouse);assert.equal(Number((await list(main))[0].held_quantity),held);assert.equal(Number((await list(main))[0].shortage_quantity),short);
 });
 await check('7 concurrent plans and generic issue share stock lock and never over-reserve',async()=>{
  const i=await item(),w=await warehouse(),p=await product();await stock(i,w,6);const a=await request(p,5),b=await request(p,5);
  await Promise.all([create(a,i,w),create(b,i,w)]);const pa=(await list(a))[0],pb=(await list(b))[0];assert.equal(Number(pa.held_quantity)+Number(pb.held_quantity),6);assert.equal(Number(pa.shortage_quantity)+Number(pb.shortage_quantity),4);
  const i2=await item(),w2=await warehouse(),p2=await product();await stock(i2,w2,6);const req=await request(p2,6),issue=await stock(i2,w2,4,{type:'ISSUE',confirm:false});
  const pair=await Promise.all([call('/api/purchase-fulfillment/plans','POST',planBody(req,i2,w2)),call('/api/inventory/documents/'+issue.doc.id+'/confirm','POST',{})]);assert.ok(pair[0].status<300,JSON.stringify(pair));const hold=Number((await list(req))[0].held_quantity),physical=await balance(i2,w2);assert.ok(hold<=physical);assert.equal(hold,physical);assert.ok([2,6].includes(hold));
 });
 await check('8 permission denial, scoped quantity-only projection and no mapping heuristics',async()=>{
  assert.equal((await call('/api/purchase-fulfillment?request_id='+main.req.id,'GET',undefined,null)).status,401);
  await denied('/api/purchase-fulfillment/plans','POST',planBody(main,mainItem,mainWarehouse),sale);
  await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled,assigned_by,reason)select $1,p,true,$2,'Isolated scoped read'from unnest($3::text[])p",[saleId,actor,['production_sales_workflow','inventory_view']]);
  assert.equal((await call('/api/purchase-fulfillment/plans','POST',planBody(main,mainItem,mainWarehouse),sale)).status,403,'Inventory view plus production workflow cannot mutate');
  const view=await must('/api/purchase-fulfillment?request_id='+main.req.id,'GET',undefined,sale);assert.ok(Array.isArray(view.plans));assert.ok(Array.isArray(view.receipt_candidates));const text=JSON.stringify(view);assert.doesNotMatch(text,/unit_cost|value_delta|subtotal|total_amount|input_unit_cost/,'Quantity view cannot leak cost fields');
  const stranger=key(),salt2=randomBytes(16).toString('hex'),pass='FixtureUnrelated!81231';await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[stranger,'stranger@fixture.invalid',`scrypt$${salt2}$${scryptSync(pass,salt2,64).toString('hex')}`]);await pool.query("insert into local_user_roles(user_id,role)values($1,'employee')",[stranger]);await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled,assigned_by,reason)select $1,p,true,$2,'Isolated scope test'from unnest($3::text[])p",[stranger,actor,['production_sales_workflow','inventory_view']]);const strangerToken=(await must('/api/local-auth/login','POST',{email:'stranger@fixture.invalid',password:pass},null)).token;const foreign=await call('/api/purchase-fulfillment?request_id='+main.req.id,'GET',undefined,strangerToken);assert.equal(foreign.status,403,JSON.stringify(foreign));
  await pool.query("update local_user_roles set role='employee'where user_id=$1",[actor]);try{assert.equal((await call('/api/purchase-fulfillment/plans','POST',replayBody)).status,403,'Revoked manager cannot replay cached plan result');}finally{await pool.query("update local_user_roles set role='admin'where user_id=$1",[actor]);}
 });
 if(focused)await check('focused release/reclassification/replan preserves immutable receipt history',async()=>{
  const p=await product(),i=await item(),w=await warehouse();await stock(i,w,2);const r=await request(p,5),old=await reserve(r,i,w);assert.equal(Number(old.held_quantity),2);assert.equal(Number(old.shortage_quantity),3);const receipt=await stock(i,w,3),x=receive(old.shortage_id,receipt.movement.id,1);await must(x.url,'POST',x.body);const oldBefore=(await pool.query('select * from local_purchase_shortage_demands where id=$1',[old.shortage_id])).rows[0];
  await must('/api/purchase-fulfillment/plans/'+old.id+'/release','POST',{reason:'Explicit release before classification revision',idempotency_key:key()});const releasedBefore=(await pool.query('select * from local_purchase_shortage_demands where id=$1',[old.shortage_id])).rows[0];assert.equal(Number(releasedBefore.received_quantity),1);assert.equal(Number(releasedBefore.cancelled_quantity),2);
  const view=await must('/api/product-supply-classifications/'+p);await must('/api/product-supply-classifications/confirm','POST',{rows:[{product_id:p,route:'PURCHASE',expected_revision:view.revision,source_fingerprint:view.source_fingerprint}],reason:'Explicit manager reconfirmation after release',idempotency_key:key()});
  await create(r,i,w);const fresh=(await list(r))[0];assert.notEqual(fresh.id,old.id);assert.equal(fresh.status,'ACTIVE');assert.equal(Number(fresh.held_quantity),5);assert.equal(Number(fresh.received_quantity),0);assert.equal(Number(fresh.shortage_quantity),0);await create(r,i,w);assert.equal((await list(r))[0].id,fresh.id);assert.equal(Number((await list(r))[0].held_quantity),5);
  const stale=receive(old.shortage_id,receipt.movement.id,1);await denied(stale.url,'POST',stale.body);assert.deepEqual((await pool.query('select * from local_purchase_shortage_demands where id=$1',[old.shortage_id])).rows[0],releasedBefore);assert.equal(Number((await pool.query('select sum(quantity)n from local_purchase_receipt_allocations where shortage_demand_id=$1',[old.shortage_id])).rows[0].n),1);assert.equal(Number(oldBefore.received_quantity),1);assert.equal(Number((await pool.query("select count(*)n from local_purchase_fulfillment_plans where sales_request_line_id=$1 and status='ACTIVE'",[r.line.id])).rows[0].n),1);
 });
}catch(e){results.push({label:'fixture',status:'FAIL',error:e.stack?.replaceAll(secret,'[redacted]')});console.log('FAIL fixture '+e.message.replaceAll(secret,'[redacted]'));}
finally{
 if(api&&api.exitCode===null&&api.signalCode===null){const exit=once(api,'exit');api.kill();await Promise.race([exit,delay(3000)]);if(api.exitCode===null&&api.signalCode===null)api.kill('SIGKILL');}
 await pool?.end();await control?.end();
 if(container){const actual=JSON.parse(docker(['inspect',container]))[0];assert.equal(actual.Id,container);assert.equal(actual.Name,'/'+name);assert.equal(actual.Config.Labels['crm.qa.owner'],owner);docker(['rm','-f',container]);}
 if(storage){const resolved=path.resolve(storage);assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(resolved).startsWith('readygoods-fulfillment-'));await rm(resolved,{recursive:true,force:true});}
 await mkdir(stage,{recursive:true});const output=path.join(stage,'focused-api-'+Date.now()+'.json');await writeFile(output,JSON.stringify({results,api_stopped:!api||api.exitCode!==null||api.signalCode!==null,container_removed:!!container,source_business_writes:0},null,2));await writeFile(output.replace('.json','.log'),logs.replaceAll(secret,'[redacted]'));
 console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,output}));if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
}
