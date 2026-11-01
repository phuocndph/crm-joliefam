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
const owner=key(),name='dispatch-labor-workflow-'+owner,secret=randomBytes(24).toString('hex');
const stage='.local-staging-runtime/dispatch-labor-workflow-20261030';
const focused=process.argv.includes('--focused-dimensions');
const focusedAliases=process.argv.includes('--focused-attendance-aliases');
const results=[];let container,control,pool,api,storage,base,token,logs='';
const cleanEnv=()=>Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,(r.stderr||'Docker failed').replaceAll(secret,'[redacted]'));return r.stdout.trim();}
const call=async(url,method='GET',body,auth=token)=>{
 const r=await fetch(base+url,{method,headers:{origin:'https://fixture.invalid',...(auth?{authorization:'Bearer '+auth}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 return {status:r.status,body:await r.json().catch(()=>null)};
};
const must=async(...args)=>{const r=await call(...args);assert.ok(r.status<300,JSON.stringify({url:args[0],...r}));return r.body;};
async function check(label,fn){if(focused&&!/^[12] /.test(label)||focusedAliases&&!label.startsWith('9 '))return;try{await fn();results.push({label,status:'PASS'});console.log('PASS '+label);}catch(e){results.push({label,status:'FAIL',error:e.stack?.replaceAll(secret,'[redacted]')});console.log('FAIL '+label+': '+e.message.replaceAll(secret,'[redacted]'));}}
try{
 await mkdir(stage,{recursive:true});
 container=docker(['run','--pull=never','-d','--name',name,'--label','crm.qa.owner='+owner,'--tmpfs','/var/lib/postgresql/data:rw,size=536870912','-p','127.0.0.1::5432','-e','POSTGRES_USER=fixture_owner','-e','POSTGRES_PASSWORD='+secret,'-e','POSTGRES_DB=fixture_control',image]);
 const inspection=JSON.parse(docker(['inspect',container]))[0];assert.equal(inspection.Config.Labels['crm.qa.owner'],owner);assert.equal(inspection.Image,image);
 const binding=inspection.NetworkSettings.Ports['5432/tcp'][0];assert.equal(binding.HostIp,'127.0.0.1');
 const port=binding.HostPort;control=new pg.Pool({connectionString:`postgres://fixture_owner:${secret}@127.0.0.1:${port}/fixture_control`});
 let ready=false;for(let i=0;i<100;i++){try{await control.query('select 1');ready=true;break;}catch{}await delay(100);}assert.ok(ready,'Disposable PostgreSQL ready');
 await control.query(`create role fixture_app login nosuperuser nocreatedb nocreaterole password '${secret}'`);await control.query('create database dispatch_labor_fixture owner fixture_app');
 const connectionString=`postgres://fixture_app:${secret}@127.0.0.1:${port}/dispatch_labor_fixture`;pool=new pg.Pool({connectionString});
 storage=await mkdtemp(path.join(tmpdir(),'dispatch-labor-workflow-'));
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const apiPort=listener.address().port;await new Promise(r=>listener.close(r));base='http://127.0.0.1:'+apiPort;
 const denyFetch='globalThis.fetch=async()=>{throw Error("Test denies external requests")};';
 api=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(denyFetch),'server-dist/index.js'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...cleanEnv(),NODE_ENV:'production',PUBLIC_APP_URL:'https://fixture.invalid',LOCAL_ALLOWED_ORIGINS:'https://fixture.invalid',LOCAL_DATABASE_URL:connectionString,LOCAL_STORAGE_ROOT:storage,LOCAL_API_HOST:'127.0.0.1',LOCAL_API_PORT:String(apiPort),LOCAL_DB_STARTUP_MODE:'normal',LOCAL_SYNC_AUTO:'false',LOCAL_INTEGRATION_API:'false',LOCAL_ZCRM_API:'false',LOCAL_DEMO_AUTH:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false'}});
 api.stdout.on('data',x=>logs+=x);api.stderr.on('data',x=>logs+=x);ready=false;
 for(let i=0;i<300;i++){assert.equal(api.exitCode,null,'Fixture API exited');try{if((await(await fetch(base+'/health',{signal:AbortSignal.timeout(1000)})).json()).database==='dispatch_labor_fixture'){ready=true;break;}}catch{}await delay(100);}assert.ok(ready,'Fixture API ready');
 assert.equal((await pool.query('select current_database() db')).rows[0].db,'dispatch_labor_fixture');
 const actor=key(),password='FixtureOnly!93231',salt=randomBytes(16).toString('hex');
 await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[actor,'name-only@fixture.invalid',`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);await pool.query("insert into local_user_roles(user_id,role)values($1,'admin')",[actor]);
 token=(await must('/api/local-auth/login','POST',{email:'name-only@fixture.invalid',password},null)).token;assert.ok(token);
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
 const employee=key(),employeePassword='SyntheticEmployeeOnly!529',employeeSalt=randomBytes(16).toString('hex');
 await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[employee,'sewing@fixture.invalid',`scrypt$${employeeSalt}$${scryptSync(employeePassword,employeeSalt,64).toString('hex')}`]);
 await pool.query("insert into local_user_roles(user_id,role)values($1,'employee')",[employee]);
 const employeeToken=(await must('/api/local-auth/login','POST',{email:'sewing@fixture.invalid',password:employeePassword},null)).token;
 const newWorker=async(userId=null)=>{const id=key();await pool.query("insert into local_workers(id,employee_code,display_name,worker_type,user_id,is_active)values($1,$2,'Synthetic sewing worker','SEWING',$3,true)",[id,'LAB-'+key(),userId]);await pool.query("insert into local_worker_payroll_profiles(worker_id,piece_output_enabled,effective_from,status,reason,idempotency_key,request_hash,approved_by)values($1,true,'2026-01-01','APPROVED','Synthetic fixture',$2,$2,$3)",[id,key(),actor]);return id;};
 const worker=await newWorker(employee),standaloneWorker=await newWorker();
 const labor='/api/payroll/labor-mappings',requirements='/api/payroll/labor-code-requirements';
 const code='QA_AUTO_VGO';
 const seedRate=async(value,amount='25000.25',name='Synthetic bolster work')=>{const id=key();await pool.query("insert into local_product_rates(id,piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,status,reason)values($1,$2,$3,$4,'PIECE','2026-01-01','APPROVED','Explicit synthetic rate')",[id,value,name,amount]);return id;};
 const priceId=await seedRate(code);
 const seedManifest=JSON.parse(await (await import('node:fs/promises')).readFile('docs/product-labor-requirements-seed10-2026-10-29.json','utf8')).entries;
 const definition=structuredClone(seedManifest.find(x=>x.code_key==='vgo').definition);
 const reqDetail=value=>must(requirements+'/code/'+encodeURIComponent(value)+'?date='+date);
 const reqInput=detail=>({idempotency_key:key(),code_key:detail.code_key,semantic_fingerprint:detail.semantic_fingerprint,source_hash:detail.source_hash,expected_stream_revision:detail.stream_revision,expected_proposal_revision:0,reason:'Explicit synthetic requirement approval',source_date:date});
 const approveRequirement=async(value,def)=>{const draft=await must(requirements+'/proposals','POST',{...reqInput(await reqDetail(value)),definition:def,submitted:true});await must(requirements+'/approve','POST',{...reqInput(await reqDetail(value)),proposal_id:draft.proposal_id,expected_proposal_revision:1,proposal_hash:draft.proposal_hash,effective_from:date});return (await reqDetail(value)).requirement;};
 const requirement=await approveRequirement(code,definition);
 const values={material:'COTTON',pillow_subtype:'BOLSTER',joining:'NO',quilting:'NO',topstitch:'NO',sewing_method:'STANDARD',closure:'ENVELOPE',ruffle:'NO'};
 const getTechnical=id=>must('/api/product-technical-profiles/'+id);
 const confirmTechnical=async(id,extra={})=>{const t=await getTechnical(id);return must('/api/product-technical-profiles/'+id,'PUT',{expected_revision:t.revision,source_fingerprint:t.source_fingerprint,idempotency_key:key(),reason:'Explicit synthetic technical confirmation',action:'CONFIRM',manufacturing_type:'PILLOW_CASE',technical_values:values,...extra});};
 const resolver=id=>must(labor+'/products/'+id+'?date='+date);
 const prepareProduct=async(mapped=true)=>{const id=key();await pool.query("insert into local_products(id,sku,name,category,manager_id,is_active,specifications)values($1,$2,'Synthetic bolster pillow case','Vỏ gối',$3,true,'40x80cm')",[id,'QA-'+key(),actor]);await confirmTechnical(id);const supply=await must('/api/product-supply-classifications/'+id);await must('/api/product-supply-classifications/confirm','POST',{rows:[{product_id:id,expected_revision:supply.revision,source_fingerprint:supply.source_fingerprint,route:'SEW',use_suggestion:false}],reason:'Explicit synthetic SEW route',idempotency_key:key()});if(mapped){const context=await resolver(id),catalog=(await must(labor+'/catalog?date='+date+'&search='+code)).rows.find(x=>x.key===code.toLowerCase());await must(labor+'/decisions','POST',{kind:'EXACT',template_product_id:id,expected_revision:context.exact_revision,source_fingerprint:context.source_fingerprint,action:'APPROVE',effective_from:date,reason:'Explicit synthetic approved mapping',idempotency_key:key(),piece_rate_code:catalog.code,code_semantic_fingerprint:catalog.semantic_fingerprint,expected_requirement_id:requirement.stream_id,expected_requirement_version:requirement.version,expected_requirement_content_hash:requirement.content_hash,source_unit:'PIECE',conversion_factor:'1',conversion_confirmed:false});assert.equal((await resolver(id)).code_status,'RESOLVED');}return id;};
 const production=async(productId=undefined,dimensions='40x80cm')=>{const product=productId||await prepareProduct(),order=key(),batch=key(),item=key(),cutting=key();await pool.query("insert into local_production_orders(id,production_order_number,production_batch_number,product_id,quantity_planned,status,workflow_generation)values($1,$2,'B1',$3,50,'RELEASED','WORKFLOW_V3')",[order,'QA-'+key(),product]);await pool.query("insert into local_production_batches(id,production_order_id,batch_number,planned_quantity)values($1,$2,'B1',50)",[batch,order]);await pool.query("insert into local_production_order_items(id,production_order_id,product_id,product_name,planned_quantity,dimensions)values($1,$2,$3,'Synthetic bolster case',50,$4)",[item,order,product,dimensions]);await pool.query("insert into local_assignments(id,production_order_id,production_batch_id,order_item_id,worker_id,assigned_from,dispatch_stage,allocated_quantity,accepted_quantity,dispatch_status)values($1,$2,$3,$4,$5,$6,'CUTTING',50,50,'ACCEPTED')",[cutting,order,batch,item,worker,date]);await pool.query("insert into local_production_stage_events(production_order_id,production_batch_id,order_item_id,assignment_id,stage,quantity_received,quantity_good,status,work_date)values($1,$2,$3,$4,'CUTTING',50,50,'APPROVED',$5)",[order,batch,item,cutting,date]);return {product,order,batch,item};};
 const assignmentBody=(p,extra={})=>({production_order_id:p.order,production_batch_id:p.batch,order_item_id:p.item,worker_id:worker,stage:'SEWING',quantity:6,assigned_from:date,idempotency_key:key(),...extra});
 const assign=(p,extra={})=>must('/api/production-dispatch/assignments','POST',assignmentBody(p,extra));
 const publish=(p,extra={})=>must('/api/production-dispatch/publications','POST',{...assignmentBody(p,extra),eligible_worker_type:'SEWING'});
 const accept=(a,auth=employeeToken)=>must('/api/production-dispatch/assignments/'+a.id+'/accept','POST',{quantity:Number(a.allocated_quantity),idempotency_key:key()},auth);
 const report=(a,extra={})=>must('/api/production-dispatch/assignments/'+a.id+'/reports','POST',{work_date:date,quantity_good:2,idempotency_key:key(),...extra},employeeToken);
 const reviewBody=()=>({target_status:'APPROVED',reason:'Synthetic manager review',idempotency_key:key()});
 const preview=(a,qty=2)=>must('/api/production-dispatch/assignments/'+a.id+'/pay-preview?work_date='+date+'&quantity_good='+qty,'GET',undefined,employeeToken);
 const entryCount=async()=>Number((await pool.query('select count(*)n from local_production_entries')).rows[0].n);
 const dispatchCount=async()=>Number((await pool.query('select (select count(*)from local_assignments)+(select count(*)from local_production_job_publications)n')).rows[0].n);
 const denied=async(...args)=>{const r=await call(...args);assert.ok(r.status>=400,JSON.stringify({url:args[0],...r}));return r;};
 let main,mainAssignment,mainReport,approvedEntry,reviewCommand;
 await check('1 canonical mapping auto-selects assignment/publication and employee claims without choosing code',async()=>{
  main=await production();const route='/api/production-dispatch/labor-preview?production_order_id='+main.order+'&order_item_id='+main.item+'&date='+date;
  const current=await must(route);assert.equal(current.status,'RESOLVED');assert.equal(current.piece_rate_code,code);assert.equal(current.rate_unit,'PIECE');assert.ok((await call(route,'GET',undefined,employeeToken)).status>=400);
  const a=await assign(main);assert.equal(a.piece_rate_code,code);assert.equal(a.rate_unit,'PIECE');assert.equal(a.labor_basis_status,'PINNED');assert.equal(a.labor_basis,undefined);assert.ok((await pool.query('select labor_basis from local_assignments where id=$1',[a.id])).rows[0].labor_basis.requirement_id,'Assignment stores approved requirement proof');mainAssignment=await accept(a);
  const p=await publish(main,{quantity:3});assert.equal(p.piece_rate_code,code);assert.equal(p.labor_basis_status,'PINNED');assert.equal(p.labor_basis,undefined);
  const claimed=await must('/api/production-dispatch/publications/'+p.id+'/claim','POST',{quantity:2,idempotency_key:key()},employeeToken);assert.equal(claimed.piece_rate_code,code);assert.equal(claimed.dispatch_status,'ACCEPTED');assert.deepEqual((await pool.query('select labor_basis from local_assignments where id=$1',[claimed.id])).rows[0].labor_basis,(await pool.query('select labor_basis from local_production_job_publications where id=$1',[p.id])).rows[0].labor_basis);
 });
 await check('2 unmapped and mismatched supplied code block atomically; manual input cannot bypass resolver',async()=>{
  const unknown=await production(await prepareProduct(false)),wrongDimensions=await production(undefined,'45x80cm');assert.equal((await resolver(wrongDimensions.product)).code_status,'RESOLVED');const before=await dispatchCount();
  for(const [endpoint,p,extra]of [['assignments',unknown,{}],['publications',unknown,{eligible_worker_type:'SEWING'}],['assignments',wrongDimensions,{}],['publications',wrongDimensions,{eligible_worker_type:'SEWING'}],['assignments',main,{piece_rate_code:'srem'}],['publications',main,{piece_rate_code:'srem',eligible_worker_type:'SEWING'}]]){const body=assignmentBody(p,extra),r=await denied('/api/production-dispatch/'+endpoint,'POST',body);assert.equal(r.status,409);assert.equal(Number((await pool.query('select count(*)n from local_dispatch_requests where idempotency_key=$1',[body.idempotency_key])).rows[0].n),0);}
  assert.equal(await dispatchCount(),before);
 });
 await check('3 same-code technical drift blocks pending accept/publication claim/report approval with no partial wage',async()=>{
  const p=await production(),pending=await assign(p),accepted=await accept(await assign(p)),pub=await publish(p,{quantity:2}),submitted=await report(accepted);
  await confirmTechnical(p.product,{finished_width:'45',dimension_unit:'CM'});
  assert.notEqual((await resolver(p.product)).code_status,'RESOLVED');const before=await entryCount();
  for(const [url,body,auth]of [['/assignments/'+pending.id+'/accept',{quantity:6,idempotency_key:key()},employeeToken],['/publications/'+pub.id+'/claim',{quantity:1,idempotency_key:key()},employeeToken],['/assignments/'+accepted.id+'/reports',{work_date:date,quantity_good:1,idempotency_key:key()},employeeToken],['/reports/'+submitted.id+'/review',reviewBody(),token]])assert.equal((await denied('/api/production-dispatch'+url,'POST',body,auth)).status,409);
  assert.equal(await entryCount(),before);assert.equal((await pool.query('select status from local_production_stage_events where id=$1',[submitted.id])).rows[0].status,'SUBMITTED');
 });
 await check('4 missing/ambiguous runtime price blocks preview/create/approve and rolls back payroll',async()=>{
  const before=await entryCount();mainReport=await report(mainAssignment);const duplicate=await seedRate(code,'1');
  try{assert.notEqual((await preview(mainAssignment)).status,'READY');await denied('/api/production-dispatch/assignments','POST',assignmentBody(main));await denied('/api/production-dispatch/reports/'+mainReport.id+'/review','POST',reviewBody());assert.equal(await entryCount(),before);assert.equal((await pool.query('select status from local_production_stage_events where id=$1',[mainReport.id])).rows[0].status,'SUBMITTED');}
  finally{await pool.query('delete from local_product_rates where id=$1',[duplicate]);}
  await pool.query("update local_product_rates set status='RETIRED'where id=$1",[priceId]);
  try{await denied('/api/production-dispatch/assignments','POST',assignmentBody(main));assert.notEqual((await preview(mainAssignment)).status,'READY');}
  finally{await pool.query("update local_product_rates set status='APPROVED'where id=$1",[priceId]);}
 });
 await check('5 approval creates one exact decimal payroll source; replay preserves earned amount after rate change',async()=>{
  assert.equal(Number((await preview(mainAssignment)).pending_amount),50000.5);reviewCommand=reviewBody();const approved=await must('/api/production-dispatch/reports/'+mainReport.id+'/review','POST',reviewCommand);assert.equal(approved.status,'APPROVED');
  approvedEntry=(await pool.query('select * from local_production_entries where source_stage_event_id=$1',[mainReport.id])).rows;assert.equal(approvedEntry.length,1);assert.equal(Number(approvedEntry[0].rate_amount),25000.25);assert.equal(Number(approvedEntry[0].calculated_amount),50000.5);assert.equal(approvedEntry[0].workflow_status,'APPROVED');
  await pool.query('update local_product_rates set rate=30000.75 where id=$1',[priceId]);const replay=await must('/api/production-dispatch/reports/'+mainReport.id+'/review','POST',reviewCommand);assert.equal(replay.reused,true);assert.deepEqual((await pool.query('select * from local_production_entries where source_stage_event_id=$1',[mainReport.id])).rows,approvedEntry);
  const next=await report(mainAssignment,{quantity_good:1});await must('/api/production-dispatch/reports/'+next.id+'/review','POST',reviewBody());const latest=(await pool.query('select * from local_production_entries where source_stage_event_id=$1',[next.id])).rows[0];assert.equal(Number(latest.calculated_amount),30000.75);assert.equal(latest.piece_rate_code,code);
 });
 await check('6 employees cannot bypass dispatch; standalone manager input needs reason and cannot duplicate assigned work',async()=>{
  const body={worker_id:worker,work_date:date,piece_rate_code:code,quantity:1,idempotency_key:key()},before=await entryCount();
  await denied('/api/production/entries','POST',{...body,self_service:true,standalone_reason:'Try bypass',source_stage_event_id:mainReport.id},employeeToken);
  await denied('/api/production/entries','POST',{...body,idempotency_key:key(),dispatchApproval:true,source_stage_event_id:mainReport.id,standalone_reason:'Try spoofing trusted call'});
  await denied('/api/production/entries','POST',{...body,idempotency_key:key(),standalone_reason:'Overlap with assigned work'});
  await denied('/api/production/entries','POST',{...body,worker_id:standaloneWorker,idempotency_key:key()});assert.equal(await entryCount(),before);
  const command={...body,worker_id:standaloneWorker,standalone_reason:'Old independent work without a production order',idempotency_key:key()},created=await must('/api/production/entries','POST',command);assert.equal(Number(created.calculated_amount),30000.75);assert.equal((await must('/api/production/entries','POST',command)).id,created.id);assert.equal(await entryCount(),before+1);
  const row=(await pool.query('select * from local_production_entries where id=$1',[created.id])).rows[0];assert.equal(row.standalone_reason,command.standalone_reason);assert.equal(row.source_stage_event_id,null);
 });
 await check('7 returned internal repair remains nonpayable and never creates a second wage',async()=>{
  const ticket=key(),assignment=key();await pool.query("insert into local_production_repair_tickets(id,production_order_id,production_batch_id,order_item_id,source_stage_event_id,quantity,target_stage,return_stage,reason,created_by)values($1,$2,$3,$4,$5,1,'SEWING','FINISHING','Synthetic returned goods',$6)",[ticket,main.order,main.batch,main.item,mainReport.id,actor]);await pool.query("insert into local_assignments(id,production_order_id,production_batch_id,order_item_id,worker_id,assigned_from,dispatch_stage,allocated_quantity,accepted_quantity,dispatch_status,piece_rate_code,rate_unit,repair_ticket_id)values($1,$2,$3,$4,$5,$6,'SEWING',1,1,'ACCEPTED','SUA_KHONG_TINH_CONG','PIECE',$7)",[assignment,main.order,main.batch,main.item,worker,date,ticket]);
  const a={id:assignment},p=await preview(a,1);assert.equal(p.status,'NON_PAYABLE');assert.equal(p.pending_amount,null);const before=await entryCount(),r=await report(a,{quantity_good:1});assert.equal((await pool.query('select is_payable from local_production_stage_events where id=$1',[r.id])).rows[0].is_payable,false);const reviewed=await must('/api/production-dispatch/reports/'+r.id+'/review','POST',reviewBody());assert.equal(reviewed.status,'APPROVED');assert.equal(reviewed.production_entry_id,null);assert.equal(await entryCount(),before);
 });
 await check('8 two paid curtain-repair codes stay explicit distinct PIECE selections with approved repair policy',async()=>{
  await seedRate('srem1h','35000','Synthetic curtain repair A');await seedRate('srem','40000','Synthetic curtain repair B');
  const repairDefinition={schema_version:1,disposition:'OTHER_STAGE',stage:'REPAIR',family:null,required_fields:[],conditional_fields:[],conditions:{}};
  const before=await entryCount();await denied('/api/production/entries','POST',{worker_id:standaloneWorker,work_date:date,piece_rate_code:'srem',quantity:1,work_kind:'CURTAIN_REPAIR',standalone_reason:'Unapproved repair policy',idempotency_key:key()});assert.equal(await entryCount(),before);
  for(const [value,amount]of [['srem1h',35000],['srem',40000]]){await approveRequirement(value,repairDefinition);const command={worker_id:standaloneWorker,work_date:date,piece_rate_code:value,quantity:2,work_kind:'CURTAIN_REPAIR',standalone_reason:'Manager explicitly selected curtain repair '+value,idempotency_key:key()},created=await must('/api/production/entries','POST',command),row=(await pool.query('select * from local_production_entries where id=$1',[created.id])).rows[0];assert.equal(row.piece_rate_code,value);assert.equal(row.rate_unit_snapshot,'PIECE');assert.equal(Number(row.calculated_amount),amount*2);assert.equal(row.standalone_reason,command.standalone_reason);assert.equal((await must('/api/production/entries','POST',command)).id,created.id);}
  assert.equal(await entryCount(),before+2);
 });
 await check('9 legacy attendance aliases reject new OUTPUT while name-only DAY/HOUR and canonical product wages remain usable',async()=>{
  const count=async()=>Number((await pool.query('select count(*)n from local_attendance')).rows[0].n),before=await count();
  for(const endpoint of ['/api/attendance','/api/production-attendance'])for(const camel of [false,true]){
   const body=camel?{workerId:worker,workDate:date,attendanceMethod:'OUTPUT',outputQuantity:2,idempotencyKey:key()}:{worker_id:worker,work_date:date,attendance_method:'OUTPUT',output_quantity:2,idempotency_key:key()};
   assert.equal((await denied(endpoint,'POST',body)).status,409);assert.equal(await count(),before,'Rejected aliases create no attendance or money');
  }
  for(const endpoint of ['/api/attendance','/api/production-attendance'])for(const method of ['DAY','HOUR']){
   const person=await must('/api/workers','POST',{display_name:'Synthetic name-only '+key()});
   assert.equal(Number((await pool.query('select count(*)n from local_worker_rates where worker_id=$1',[person.id])).rows[0].n),0);
   const saved=await must(endpoint,'POST',{worker_id:person.id,work_date:date,attendance_method:method,...(method==='DAY'?{day_units:1}:{check_in_time:'08:00',check_out_time:'17:00',break_minutes:60}),idempotency_key:key()}),row=(await pool.query('select * from local_attendance where id=$1',[saved.id])).rows[0];
   assert.equal(row.attendance_method,method);assert.equal(row.workflow_status,'SUBMITTED');assert.equal(row.rate_id,null);assert.equal(row.calculated_amount,null);
  }
  assert.equal(await count(),before+4);
  const p=await production(),a=await accept(await assign(p)),r=await report(a);await must('/api/production-dispatch/reports/'+r.id+'/review','POST',reviewBody());
  const earned=(await pool.query('select * from local_production_entries where source_stage_event_id=$1',[r.id])).rows;assert.equal(earned.length,1);assert.equal(earned[0].workflow_status,'APPROVED');assert.equal(Number(earned[0].quantity),2);
  const independent=await must('/api/production/entries','POST',{worker_id:standaloneWorker,work_date:date,piece_rate_code:code,quantity:1,standalone_reason:'Independent product work still uses canonical entry source',idempotency_key:key()});assert.ok(Number(independent.calculated_amount)>0);
  assert.equal(await count(),before+4,'Product wages never leak back into legacy attendance OUTPUT');
 });
}catch(e){results.push({label:'fixture',status:'FAIL',error:e.stack?.replaceAll(secret,'[redacted]')});console.log('FAIL fixture '+e.message.replaceAll(secret,'[redacted]'));}
finally{
 if(api&&api.exitCode===null&&api.signalCode===null){const exit=once(api,'exit');api.kill();await Promise.race([exit,delay(3000)]);if(api.exitCode===null&&api.signalCode===null)api.kill('SIGKILL');}
 await pool?.end();await control?.end();
 if(container){const actual=JSON.parse(docker(['inspect',container]))[0];assert.equal(actual.Id,container);assert.equal(actual.Name,'/'+name);assert.equal(actual.Config.Labels['crm.qa.owner'],owner);docker(['rm','-f',container]);}
 if(storage){const resolved=path.resolve(storage);assert.ok(resolved.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(resolved).startsWith('dispatch-labor-workflow-'));await rm(resolved,{recursive:true,force:true});}
 await mkdir(stage,{recursive:true});const output=path.join(stage,'focused-api-'+Date.now()+'.json');await writeFile(output,JSON.stringify({results,api_stopped:!api||api.exitCode!==null||api.signalCode!==null,container_removed:!!container,source_business_writes:0},null,2));await writeFile(output.replace('.json','.log'),logs.replaceAll(secret,'[redacted]'));
 console.log(JSON.stringify({passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,output}));if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
}


