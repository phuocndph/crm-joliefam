// Disposable UI QA only. Does not load .env, reuse a database, or open a browser.
// Keep stdin open; send "stop" or close stdin to remove ONLY this launcher's resources.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer as createHttpServer, request as httpRequest } from 'node:http';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react-swc';
import ExcelJS from 'exceljs';
import pg from 'pg';

const root=fileURLToPath(new URL('..',import.meta.url)),suffix=process.pid+'_'+Date.now();
const database='attendance_ui_qa_'+suffix,role='attendance_ui_role_'+suffix,secret=randomBytes(24).toString('hex');
const connectionString=`postgres://${role}:${secret}@127.0.0.1:55432/${database}`;
const artifactDir=path.join(root,'.local-staging-runtime','attendance-ui-'+suffix);
const control=sql=>{const r=spawnSync('docker',['exec','crm-joliefam-local-postgres','psql','-U','crm_local','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',sql],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error('Disposable SQL control failed: '+r.stderr);return r.stdout;};
const freePort=async()=>{const s=createHttpServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;};
let api,pool,frontend,created=false,logs='',token,base,webBase;
let holdNextSummary=false,heldSummary=null;
const mutationRequests=[];
const key=()=>randomUUID();
const call=async(route,method='GET',body)=>{const r=await fetch(base+route,{method,headers:{origin:'https://crm.example.com',...(token?{authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const result=await r.json().catch(()=>null);assert.ok(r.status<300,route+': '+JSON.stringify(result));return result;};
const credentials={admin:{email:'attendance-ui-admin@fixture.invalid',password:'UIAdminFixtureOnly!222'},employee:{email:'attendance-ui-employee@fixture.invalid',password:'UIEmployeeFixtureOnly!222'}};
const actor=async(name,roleName)=>{const id=key(),salt=randomBytes(16).toString('hex'),login=credentials[name];await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active,first_name,last_name)values($1,$1,$2,$3,true,$4,$5)',[id,login.email,`scrypt$${salt}$${scryptSync(login.password,salt,64).toString('hex')}`,name==='admin'?'Quản lý QA':'Nhân viên QA','Dữ liệu thử']);await pool.query('insert into local_user_roles(user_id,role)values($1,$2)',[id,roleName]);return id;};
const dateOffset=days=>{const d=new Date();d.setDate(d.getDate()+days);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);};
try{
  const apiPort=await freePort(),webPort=await freePort();base='http://127.0.0.1:'+apiPort;webBase='http://127.0.0.1:'+webPort;
  control(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${secret}'`);control(`alter role ${role} set timezone='UTC'`);control(`create database ${database} owner ${role}`);created=true;
  api=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent('globalThis.fetch=async()=>{throw new Error("UI QA denies hosted requests")};'),'server-dist/index.js'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_ENV:'production',PUBLIC_APP_URL:'https://crm.example.com',LOCAL_DATABASE_URL:connectionString,LOCAL_API_PORT:String(apiPort),LOCAL_API_HOST:'127.0.0.1',LOCAL_SYNC_AUTO:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false',LOCAL_DEMO_AUTH:'false',LOCAL_INTEGRATION_API:'false'}});
  api.stdout.on('data',x=>logs+=x);api.stderr.on('data',x=>logs+=x);
  let ready=false;for(let n=0;n<160;n++){if(api.exitCode!==null)throw new Error('QA API exited before health');try{if((await(await fetch(base+'/health')).json()).database===database){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'Owned API ready');
  pool=new pg.Pool({connectionString});assert.equal((await pool.query('select current_database() db')).rows[0].db,database);assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,false);
  await actor('admin','admin');const employee=await actor('employee','employee');token=(await call('/api/local-auth/login','POST',credentials.admin)).token;
  const group=await call('/api/payroll/policy-groups','POST',{code:'UI-'+key(),name:'Nhóm thử giao diện',reason:'Disposable UI QA'});
  const worker=async(code,name,userId)=>{const w=await call('/api/workers','POST',{employee_code:code,display_name:name,worker_type:'HELPER'});if(userId)await pool.query('update local_workers set user_id=$2 where id=$1',[w.id,userId]);const bundle=await call('/api/payroll/worker-profile-bundle','POST',{worker_id:w.id,compensation_type:'MONTHLY_HELPER',payroll_policy_group_id:group.id,effective_from:'2026-01-01',primary_amount:2600000,overtime_enabled:true,reason:'Disposable UI QA',idempotency_key:key()});for(const[route,item]of[['compensation-assignments',bundle.assignment],['rates',bundle.rate],['worker-profiles',bundle.profile]])if(item)await call('/api/payroll/'+route+'/'+item.id+'/approve','POST',{reason:'Disposable UI QA'});return w;};
  const w=await worker('QA-UI-EMPLOYEE','Nhân viên QA - Công và tăng ca',employee),excelWorker=await worker('QA-UI-EXCEL','Nhân viên QA - Workbook 5 ngày');
  const product=await call('/api/catalog/products','POST',{sku:'UI-QA-'+key(),name:'Áo thử giao diện QA',piece_rate_code:'UI-QA-'+key(),rate:12500,rate_unit:'PIECE',effective_from:'2026-01-01',rate_reason:'Disposable UI QA'});
  const attendance=(worker,date)=>call('/api/attendance','POST',{worker_id:worker.id,attendance_method:'DAY',work_date:date,day_units:1,idempotency_key:key(),notes:'Quản lý QA ghi thay để nhân viên kiểm tra'});
  const overtime=date=>call('/api/attendance/overtime','POST',{worker_id:w.id,work_date:date,overtime_type:'NORMAL_OVERTIME',overtime_minutes:60,reason:'Yêu cầu tăng ca QA cần xem xét',idempotency_key:key()});
  const summary=date=>call('/api/attendance/day-summary?worker_id='+w.id+'&date='+date);
  const confirm=async date=>{const s=await summary(date);return call('/api/attendance/closures','POST',{worker_id:w.id,work_date:date,target_status:'EMPLOYEE_CONFIRMED',expected_revision:s.current_revision,reason:'Quản lý QA đã đối chiếu mọi nguồn, xác nhận hộ',idempotency_key:key()});};
  const approved=async date=>{const a=await attendance(w,date);await call('/api/attendance/status','POST',{attendance_record_id:a.id,target_status:'APPROVED',reason:'QA đã kiểm tra',idempotency_key:key()});return a;};
  const dates={today:dateOffset(0),otOnly:dateOffset(-1),rejectedOnly:dateOffset(-2),staleConfirmation:dateOffset(-3),readyToSeal:dateOffset(-4),sealed:dateOffset(-5)};
  await attendance(w,dates.today);await overtime(dates.today);await call('/api/production/entries','POST',{worker_id:w.id,product_id:product.id,work_date:dates.today,quantity:3,notes:'Nguồn sản lượng QA cùng ngày',idempotency_key:key()});
  await overtime(dates.otOnly);const rejected=await attendance(w,dates.rejectedOnly);await call('/api/attendance/status','POST',{attendance_record_id:rejected.id,target_status:'REJECTED',reason:'QA yêu cầu sửa số công',idempotency_key:key()});
  const stale=await approved(dates.staleConfirmation);await confirm(dates.staleConfirmation);await pool.query("update local_attendance set notes='Nguồn đã được sửa sau xác nhận; cần xác nhận lại' where id=$1",[stale.id]);
  await approved(dates.readyToSeal);await confirm(dates.readyToSeal);await approved(dates.sealed);await confirm(dates.sealed);const sealedSummary=await summary(dates.sealed);await call('/api/attendance/approve-close','POST',{worker_id:w.id,work_date:dates.sealed,expected_revision:sealedSummary.current_revision,source_fingerprint:sealedSummary.source_fingerprint,reason:'QA chốt ngày đã duyệt',idempotency_key:key()});
  const excelDates=[];for(let n=6;n<=10;n++){const date=dateOffset(-n);excelDates.push(date);await attendance(excelWorker,date);}
  // Read-only payslip QA uses historical synthetic snapshots, never business data.
  const qaPeriod=(await pool.query("insert into local_payroll_periods(period_start,period_end,standard_days)values('2019-01-01','2019-01-31',26)returning id")).rows[0];
  const qaRun=(await pool.query("insert into local_payroll_runs(period_id,run_number,calculation_version,standard_days_snapshot,config_snapshot,input_hash,idempotency_key,status)values($1,1,'local-payroll-v3',26,$2,$3,$4,'PREVIEW')returning id",[qaPeriod.id,{worker_scope:{requested_worker_ids:[w.id,excelWorker.id],resolved_worker_ids:[w.id,excelWorker.id]}},key(),key()])).rows[0];
  for(const person of [w,excelWorker]){
    const record=(await pool.query('insert into local_payroll_records(run_id,worker_id,employee_identity_snapshot)values($1,$2,$3)returning id',[qaRun.id,person.id,{employee_code:person.employee_code,display_name:person.display_name,location_code:person.location_code,version:1}])).rows[0];
    for(const [type,amount,direction] of [['DAY_PAY','2600000.123456','EARNING'],['PIECE_RATE','125000','EARNING'],['OVERTIME_PAY','150000','EARNING'],['BONUS','50000','EARNING'],['SOCIAL_INSURANCE','273000','DEDUCTION']])await pool.query("insert into local_payroll_items(payroll_record_id,worker_id,item_type,item_direction,source_type,source_id,quantity,unit_rate,multiplier,amount_precise,formula,details)values($1,$2,$3,$4,'UI_FIXTURE',$5,1,$6,1,$6,'Số liệu giả để kiểm tra giao diện',jsonb_build_object('work_date','2019-01-15','source_marker','ui-qa-only'))",[record.id,person.id,type,direction,key(),amount]);
    await pool.query("update local_payroll_records r set gross_amount=q.gross,deductions_amount=q.deductions,net_amount=q.gross-q.deductions,payment_amount=round(q.gross-q.deductions,0),rounding_delta=round(q.gross-q.deductions,0)-(q.gross-q.deductions) from (select sum(amount_precise)filter(where item_direction='EARNING')gross,sum(amount_precise)filter(where item_direction='DEDUCTION')deductions from local_payroll_items where payroll_record_id=$1)q where r.id=$1",[record.id]);
  }
  await mkdir(artifactDir,{recursive:true});const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('CHOT_NGAY');sheet.addRow(['__example','ma_nv','ngay','trang_thai_de_nghi','ly_do','idempotency_key']);for(const date of excelDates)sheet.addRow(['DATA',excelWorker.employee_code,date,'EMPLOYEE_CONFIRMED','Quản lý QA đối chiếu đủ nguồn và xác nhận hộ cho '+date,'UI-EXCEL-'+date]);const workbookPath=path.join(artifactDir,'QA_CHOT_NGAY_5_days.xlsx');await book.xlsx.writeFile(workbookPath);
  const frontendEnv={VITE_BACKEND_MODE:'local',VITE_LOCAL_API_URL:webBase,VITE_LOCAL_DEMO_AUTH:'false',VITE_SUPABASE_URL:'',VITE_SUPABASE_PUBLISHABLE_KEY:''};
  const frontendDir=path.join(artifactDir,'frontend');
  await build({root,configFile:false,envDir:false,logLevel:'warn',plugins:[react()],resolve:{alias:{'@':path.join(root,'src')},dedupe:['react','react-dom','react/jsx-runtime']},define:Object.fromEntries(Object.entries(frontendEnv).map(([k,v])=>['import.meta.env.'+k,JSON.stringify(v)])),build:{outDir:frontendDir,emptyOutDir:true}});
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
  const proxyApi=(req,res)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method||'GET'))mutationRequests.push({method:req.method,route:new URL(req.url,webBase).pathname});const proxied=httpRequest(base+req.url,{method:req.method,headers:{...req.headers,host:new URL(base).host,origin:'https://crm.example.com'}},upstream=>{res.writeHead(upstream.statusCode||502,upstream.headers);upstream.pipe(res);});proxied.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Owned QA API unavailable');});req.pipe(proxied);};
  frontend=createHttpServer(async(req,res)=>{
    if(req.url?.startsWith('/api/')){if(holdNextSummary&&req.method==='GET'&&new URL(req.url,webBase).pathname==='/api/attendance/day-summary'){holdNextSummary=false;heldSummary={req,res};console.log('QA_SUMMARY_HELD '+req.url);return;}proxyApi(req,res);return;}
    try{const pathname=decodeURIComponent(new URL(req.url||'/',webBase).pathname);let target=path.resolve(frontendDir,'.'+pathname);if(!target.startsWith(frontendDir+path.sep))target=path.join(frontendDir,'index.html');if(!(await stat(target).catch(()=>null))?.isFile())target=path.join(frontendDir,'index.html');const body=await readFile(target);res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream','cache-control':'no-store'});res.end(body);}catch{res.writeHead(500);res.end('QA frontend fixture error');}
  });frontend.listen(webPort,'127.0.0.1');await once(frontend,'listening');
  const manifest={ownerPid:process.pid,apiPid:api.pid,database,role,webBase,apiBase:base,credentials,dates,worker:{id:w.id,code:w.employee_code},excelWorker:{id:excelWorker.id,code:excelWorker.employee_code},payrollRunId:qaRun.id,payrollMonth:'2019-01',excelDates,workbookPath,controls:['hold-summary','release-summary','qa-state','stop'],stop:'Send stop on launcher stdin or close stdin. Do not kill any shared process.'};
  await writeFile(path.join(artifactDir,'manifest.json'),JSON.stringify(manifest,null,2));console.log('UI_FIXTURE_READY '+JSON.stringify(manifest));
  await new Promise(resolve=>{let input='';process.stdin.setEncoding('utf8');process.stdin.resume();process.stdin.on('data',x=>{input+=x;const commands=input.split(/[\r\n]+/);input=commands.pop()||'';for(const command of commands){
    if(command==='stop')resolve();
    else if(command==='hold-summary'){if(heldSummary){console.log('QA_CONTROL_ERROR summary already held');continue;}holdNextSummary=true;console.log('QA_SUMMARY_ARMED');}
    else if(command==='release-summary'){if(!heldSummary){console.log('QA_CONTROL_ERROR no held summary');continue;}const held=heldSummary;heldSummary=null;proxyApi(held.req,held.res);console.log('QA_SUMMARY_RELEASED');}
    else if(command==='qa-state'){void(async()=>{const states=(await pool.query("select 'ATTENDANCE' kind,id::text,work_date::text,workflow_status status from local_attendance where worker_id=$1 union all select 'PRODUCTION_ENTRY',id::text,work_date::text,workflow_status from local_production_entries where worker_id=$1 union all select 'OVERTIME',id::text,work_date::text,status from local_overtime where worker_id=$1 order by work_date,kind,id",[w.id])).rows;const events=(await pool.query('select count(*)::int n from local_attendance_workflow_events')).rows[0].n;console.log('QA_STATE '+JSON.stringify({mutationRequests:[...mutationRequests],events,states}));})().catch(()=>console.log('QA_CONTROL_ERROR state query failed'));}
  }});process.stdin.on('end',resolve);process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
}finally{
  if(frontend){frontend.closeAllConnections();await new Promise(resolve=>frontend.close(resolve));}if(api&&api.exitCode===null){api.kill();await Promise.race([once(api,'exit'),new Promise(r=>setTimeout(r,5000))]);}await pool?.end();if(created)control(`drop database ${database} with (force)`);control(`drop role if exists ${role}`);assert.ok(!logs.includes(secret));console.log('CLEANUP own UI fixture frontend API database and role removed');
}
