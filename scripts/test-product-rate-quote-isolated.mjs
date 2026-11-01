// Fresh owned API/PostgreSQL only. No env-file loading, real data or outbound I/O.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {createHash,randomBytes,randomUUID,scryptSync} from 'node:crypto';
import {readFile,writeFile,mkdtemp,rm,mkdir,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {tsImport} from 'tsx/esm/api';
const stage=process.env.PRODUCT_RATE_QUOTE_STAGE||'.local-staging-runtime/item5s1-baseline';
if(process.env.PRODUCT_RATE_QUOTE_STAGE&&!/^\.local-staging-runtime\/item5s2q-baseline\/own-[a-z0-9-]+$/.test(stage))throw new Error('Slice output must use its owned staging directory.');
await mkdir(stage,{recursive:true});
const freezePath=process.env.PRODUCT_RATE_QUOTE_FREEZE||stage+'/frozen-v1-hashes.json';
const runLabel=/frozen-(v\d+)-hashes/.exec(freezePath)?.[1]||'custom';
for(const suffix of ['proof.json','api.log','query-evidence.json','payroll-v2.log'])await assert.rejects(access(stage+'/own-'+runLabel+'-'+suffix),'Never overwrite historical QA output');
const hash=value=>createHash('sha256').update(value).digest('hex'),key=()=>randomUUID();
const frozen=JSON.parse(await readFile(freezePath,'utf8')),verify=async()=>{for(const row of frozen)assert.equal(hash(await readFile(row.Path)),row.Hash,'Frozen source changed: '+row.Path);};await verify();
const suffix=process.pid+'_'+Date.now(),database='product_rate_quote_qa_'+suffix,role='product_rate_quote_role_'+suffix,secret=randomBytes(24).toString('hex'),connectionString=`postgres://${role}:${secret}@127.0.0.1:16543/${database}`;
const control=sql=>{const r=spawnSync('docker',['exec','crm-joliefam-local-postgres','psql','-U','crm_local','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',sql],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout;};
const safeEnv=()=>Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'].filter(name=>process.env[name]).map(name=>[name,process.env[name]]));
let pool,api,base,token,storage,created=false,logs='';const passed=[],failures=[],proof={freeze_sha256:hash(await readFile(freezePath)),scope:'5S.1 config-only read inspection; fresh synthetic DB/API, no activation'};
const check=async(name,work)=>{try{await work();passed.push(name);console.log('PASS '+name);}catch(error){failures.push({name,error:error.stack?.replaceAll(secret,'[redacted]')});console.log('FAIL '+name+': '+error.message.replaceAll(secret,'[redacted]'));}};
const call=async(url,method='GET',body,credential=token)=>{const response=await fetch(base+url,{method,headers:{origin:'https://crm.example.com',...(credential?{authorization:'Bearer '+credential}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});return{status:response.status,body:await response.json().catch(()=>null)};};
const must=async(...args)=>{const r=await call(...args);assert.ok(r.status<300,JSON.stringify({url:args[0],...r}));return r.body;};
const quotePath=(code,date='2026-10-15',quantity='3')=>'/api/payroll/product-rates/quote?'+new URLSearchParams({code,date,quantity});
const quote=(code,date,quantity,credential)=>must(quotePath(code,date,quantity),'GET',undefined,credential);
const blocked=(result,code)=>{assert.equal(result.status,'BLOCKED');assert.deepEqual(result.blockers,[code]);for(const field of ['selected_rate_id','recorded_unit','effective_from','effective_to','unit_rate','line_amount'])assert.equal(result[field],null);assert.equal(result.pay_ready,false);};
try{
 storage=await mkdtemp(path.join(tmpdir(),'product-rate-quote-owned-'));control(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${secret}'`);control(`create database ${database} owner ${role}`);created=true;
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));base='http://127.0.0.1:'+port;
 const paths={armed:path.join(storage,'armed.json'),reached:path.join(storage,'reached.json'),release:path.join(storage,'release.json'),queries:path.join(storage,'queries.jsonl')};await writeFile(paths.queries,'');
 const guard='import net from "node:net";const original=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const o=typeof args[0]==="object"?args[0]:{host:typeof args[1]==="string"?args[1]:"localhost"};if(o.host&&!new Set(["127.0.0.1","localhost","::1"]).has(o.host))throw new Error("QA denies remote sockets");return original.apply(this,args)};globalThis.fetch=async()=>{throw new Error("QA denies outbound fetch")};';
 const instrumentation=`import pg from ${JSON.stringify(new URL('../node_modules/pg/lib/index.js',import.meta.url).href)};import{readFile,writeFile,unlink,appendFile}from'node:fs/promises';const files=${JSON.stringify(paths)},original=pg.Client.prototype.query;async function inspect(client,args,result){const sql=typeof args[0]==='string'?args[0]:args[0]?.text;if(!sql)return result;if(sql==='begin isolation level repeatable read read only')client.__quoteQueries=[];if(client.__quoteQueries)client.__quoteQueries.push(sql);const phase=sql==='begin isolation level repeatable read read only'?'BEGIN':sql.startsWith('select r.role,')?'AUTHORITY':null;if(phase){let arm;try{arm=JSON.parse(await readFile(files.armed,'utf8'));}catch{}if(arm?.phase===phase){await unlink(files.armed);await writeFile(files.reached,phase);let released=false;for(let n=0;n<800;n++){try{await readFile(files.release);released=true;break;}catch{}await new Promise(resolve=>setTimeout(resolve,25));}if(!released)throw new Error('Owned quote barrier timeout');}}if(client.__quoteQueries&&/^(commit|rollback)$/i.test(sql)){await appendFile(files.queries,JSON.stringify({queries:client.__quoteQueries})+'\\n');delete client.__quoteQueries;}return result;}pg.Client.prototype.query=function(...args){const cb=args.at(-1);if(typeof cb==='function'){const copy=args.slice();copy[copy.length-1]=(error,result)=>error?cb(error):inspect(this,args,result).then(value=>cb(null,value),error=>cb(error));return original.apply(this,copy);}const result=original.apply(this,args);return result&&typeof result.then==='function'?result.then(value=>inspect(this,args,value)):result;};`;
 api=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(guard),'--import','data:text/javascript,'+encodeURIComponent(instrumentation),'--import','tsx','server/index.ts'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...safeEnv(),NODE_ENV:'production',PUBLIC_APP_URL:'https://crm.example.com',LOCAL_DATABASE_URL:connectionString,LOCAL_STORAGE_ROOT:storage,LOCAL_API_PORT:String(port),LOCAL_API_HOST:'127.0.0.1',LOCAL_SYNC_AUTO:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false',LOCAL_DEMO_AUTH:'false',LOCAL_INTEGRATION_API:'false'}});
 api.stdout.on('data',x=>logs+=x);api.stderr.on('data',x=>logs+=x);
 let ready=false;for(let n=0;n<200;n++){assert.equal(api.exitCode,null,'Owned API exited: '+logs.replaceAll(secret,'[redacted]'));try{if((await(await fetch(base+'/health')).json()).database===database){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,200));}assert.ok(ready,'Owned API ready');
 pool=new pg.Pool({connectionString});assert.equal((await pool.query('select current_database() db')).rows[0].db,database);assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,false);
 const actor=async role=>{const id=key(),email=role+'-'+key()+'@quote.invalid',password='QuoteFixtureOnly!222',salt=randomBytes(16).toString('hex');await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,email,`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);await pool.query('insert into local_user_roles(user_id,role)values($1,$2)',[id,role]);return{id,email,password,token:(await must('/api/local-auth/login','POST',{email,password},null)).token};};
 const admin=await actor('admin'),manager=await actor('manager'),accountant=await actor('accountant'),employee=await actor('employee'),leader=await actor('team_leader');token=admin.token;
 const rate=async(code,extra={})=>{const id=key();await pool.query("insert into local_product_rates(id,product_id,piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,effective_to,status,source_reference,source_row)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,12)",[id,extra.product_id||null,code,extra.name===undefined?'Synthetic work':extra.name,extra.rate===undefined?'12500.25':extra.rate,extra.unit||'PIECE',extra.from||'2026-01-01',extra.to||null,extra.status||'APPROVED','https://user:PRIVATESECRET@private.invalid/path/source.xlsx?token=PRIVATESECRET']);return id;};
 const baseRate=await rate('BASIC');
 await check('S01 exact PostgreSQL numeric products including cents round and maximum unrestricted amount',async()=>{
  const basic=await quote('BASIC');assert.equal(basic.unit_rate,'12500.25');assert.equal(basic.line_amount,'37500.75');assert.equal(basic.selected_rate_id,baseRate);
  await rate('TINY',{rate:'0.01'});assert.equal((await quote('TINY',undefined,'0.01')).line_amount,'0.00');
  await rate('MAX',{rate:'9999999999999999.99'});const maximum=await quote('MAX',undefined,'9999999999.99');assert.equal(maximum.unit_rate,'9999999999999999.99');assert.equal(maximum.line_amount,'99999999999899999900000000.00');
 });
 await check('S02 canonical NFC/NFD/case and every ECMAScript trim character; no SKU fallback',async()=>{
  const trim='\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
  for(const [n,space] of [...trim].entries()){const code='MÃ-CÔNG-'+n;await rate(space+code.normalize('NFD')+space);const result=await quote(' '+code.toLowerCase()+' ');assert.equal(result.status,'AVAILABLE');assert.equal(result.code_key,code.toLowerCase());}
  const product=key();await pool.query("insert into local_products(id,sku,name)values($1,'SKU-ONLY','Synthetic product')",[product]);await rate('ACTUAL-CODE',{product_id:product});blocked(await quote('SKU-ONLY'),'MISSING_RATE');
 });
 await check('Q01-Q03 actual Unicode identity inclusion/exclusion, equivalent duplicates and distinct invalid sources',async()=>{
  const control=(await pool.query("select encode(convert_to(lower(chr(304)),'UTF8'),'hex') dotted_i_lower,encode(convert_to(lower('ΟΣ'),'UTF8'),'hex') sigma_lower")).rows[0];
  assert.notEqual(control.dotted_i_lower,Buffer.from('İ'.toLowerCase()).toString('hex'));assert.notEqual(control.sigma_lower,Buffer.from('ΟΣ'.toLowerCase()).toString('hex'));proof.unicode_control={postgres:control,node:{dotted_i:Buffer.from('İ'.toLowerCase()).toString('hex'),final_sigma:Buffer.from('ΟΣ'.toLowerCase()).toString('hex')}};
  const dotted=await rate('İ',{rate:'0.01'}),plain=await rate('i',{rate:'1.01'}),final=await rate('ΟΣ',{rate:'12500.25'}),normal=await rate('Οσ',{rate:'2.01'});
  for(const [code,id,price]of [['i\u0307',dotted,'0.01'],['\u00a0İ\ufeff',dotted,'0.01'],['i',plain,'1.01'],['Ος',final,'12500.25'],['ος',final,'12500.25'],['Οσ',normal,'2.01']]){const result=await quote(code);assert.equal(result.selected_rate_id,id,code);assert.equal(result.unit_rate,price);assert.equal(result.candidate_count,1);assert.equal(Object.keys(result).length,19);}
  for(const [a,b]of [['İ-DUP','i\u0307-dup'],['ΟΣ','Ος']]){await rate(a);await rate(b,{rate:'0.01'});const result=await quote(a);blocked(result,'AMBIGUOUS_RATE');assert.equal(result.candidate_count,a==='ΟΣ'?3:2);}
  for(const [code,extra]of [['i',{rate:'NaN'}],['Οσ',{rate:'0.00'}],['i-INVALID',{name:null}],['Οσ-INVALID',{unit:'bad'}]])await rate(code,extra);
  const cleanDotted=await quote('İ');assert.equal(cleanDotted.selected_rate_id,dotted);assert.equal(cleanDotted.candidate_count,1);const clean=await rate('ΟΣ-INVALID');assert.equal((await quote('Ος-INVALID')).selected_rate_id,clean);
  blocked(await quote('UNKNOWN-UNICODE-İ'),'MISSING_RATE');
  const started=performance.now(),batch=(await pool.query("select count(*)::int n from local_product_rates where status='APPROVED' and effective_from<=date '2026-10-15' and (effective_to is null or effective_to>=date '2026-10-15')")).rows[0].n;await quote('BASIC');proof.synthetic_active_batch_rows=batch;proof.synthetic_one_quote_latency_ms=performance.now()-started;
 });
 await check('S03 strict HTTP query/date/quantity validation before numeric cast',async()=>{
  const nulRows=(await pool.query('select md5(coalesce(jsonb_agg(to_jsonb(r) order by id),\'[]\'::jsonb)::text) hash from local_product_rates r')).rows[0].hash;
  const beforeNul=await readFile(paths.queries,'utf8');for(const code of ['\u0000','ABC\u0000DEF','\u0000ABC','ABC\u0000']){const result=await call(quotePath(code));assert.equal(result.status,400);assert.ok(JSON.stringify(result.body).includes('ký tự rỗng'));}assert.equal(await readFile(paths.queries,'utf8'),beforeNul,'NUL preflight must not start RR/query client');
  assert.equal((await pool.query('select md5(coalesce(jsonb_agg(to_jsonb(r) order by id),\'[]\'::jsonb)::text) hash from local_product_rates r')).rows[0].hash,nulRows);
  for(const query of ['','code=BASIC&date=2026-10-15','code=BASIC&code=MAX&date=2026-10-15&quantity=1','code[]=BASIC&date=2026-10-15&quantity=1','code[x]=BASIC&date=2026-10-15&quantity=1','code=&date=2026-10-15&quantity=1','code='+('a'.repeat(121))+'&date=2026-10-15&quantity=1'])assert.equal((await call('/api/payroll/product-rates/quote?'+query)).status,400);
  for(const field of ['sku','rateId','group','group_key','worker','conversion','factor','sourceunit'])assert.equal((await call(quotePath('BASIC')+'&'+field+'=x')).status,400);
  for(const quantity of ['1e3','+1','-1','0','0.00','1.001','10000000000','1,5','NaN','Infinity','1 ',' 1'])assert.equal((await call(quotePath('BASIC',undefined,quantity))).status,400,quantity);
  for(const date of ['2026-02-30','2026-02-29','1900-02-29','0000-01-01','10000-01-01'])assert.equal((await call(quotePath('BASIC',date))).status,400,date);
  for(const date of ['0001-01-01','2000-02-29','2024-02-29','9999-12-31'])assert.equal((await call(quotePath('MISSING',date))).status,200,date);
 });
 await check('S04 inclusive dates and missing/draft/retired/future/expired do not fallback',async()=>{
  await rate('BOUNDED',{from:'2026-10-10',to:'2026-10-20'});for(const date of ['2026-10-10','2026-10-20'])assert.equal((await quote('BOUNDED',date)).status,'AVAILABLE');for(const date of ['2026-10-09','2026-10-21'])blocked(await quote('BOUNDED',date),'MISSING_RATE');
  await rate('DRAFT',{status:'DRAFT'});await rate('RETIRED',{status:'RETIRED'});await rate('FUTURE',{from:'2027-01-01'});await rate('EXPIRED',{to:'2026-09-30'});for(const code of ['MISSING','DRAFT','RETIRED','FUTURE','EXPIRED'])blocked(await quote(code),'MISSING_RATE');
 });
 await check('S05 duplicate identical or conflicting candidates always block without money',async()=>{
  for(const [code,second] of [['DUPLICATE',{}],['DIFF-PRICE',{rate:'1.00'}],['DIFF-UNIT',{unit:'SET'}],['DIFF-NAME',{name:'Other work'}]]){await rate(code);await rate(code,second);const result=await quote(code);blocked(result,'AMBIGUOUS_RATE');assert.equal(result.candidate_count,2);}
 });
 await check('S06 invalid source and actual numeric NaN block; zero policy explicit; units config-only',async()=>{
  for(const [code,extra] of [['NO-NAME',{name:null}],['BLANK-NAME',{name:'\u00a0\t'}],['BAD-UNIT',{unit:'piece'}],['NAN',{rate:'NaN'}]]){await rate(code,extra);blocked(await quote(code),'INVALID_RATE_SOURCE');}
  await rate('ZERO',{rate:'0.00'});blocked(await quote('ZERO'),'ZERO_RATE_UNSUPPORTED');
  for(const unit of ['PIECE','SET','HOUR','METER']){const code='UNIT-'+unit;await rate(code,{unit});const result=await quote(code);assert.equal(result.recorded_unit,unit);assert.equal(result.quantity_basis,'RECORDED_UNIT');assert.equal(result.unit_confirmation,'NOT_ASSESSED');assert.equal(result.mapping_status,'NOT_ASSESSED');assert.equal(result.pay_ready,false);assert.equal(result.operational_activation,'DISABLED');assert.equal(result.kind,'CONFIG_PRICE_INSPECTION');assert.equal(result.quote_schema_version,1);assert.ok(!JSON.stringify(result).includes('PRIVATESECRET'));}
 });
 await check('S07 actual roles: accountant read without grants; employees and leaders denied despite forged sensitive grants',async()=>{
  for(const actor of [admin,manager,accountant])assert.equal((await quote('BASIC',undefined,undefined,actor.token)).status,'AVAILABLE');
  for(const actor of [employee,leader]){for(const permission of ['payroll_view','payroll_worker_manage','payroll_rate_view','payroll_rate_manage'])await pool.query('insert into local_employee_permissions(user_id,permission_type,enabled)values($1,$2,true)',[actor.id,permission]);assert.equal((await call(quotePath('BASIC'),'GET',undefined,actor.token)).status,403);}
  assert.equal((await call(quotePath('BASIC'),'GET',undefined,null)).status,401);
  await pool.query('update local_user_profiles set is_active=false where user_id=$1',[manager.id]);assert.equal((await call(quotePath('BASIC'),'GET',undefined,manager.token)).status,401);await pool.query('update local_user_profiles set is_active=true where user_id=$1',[manager.id]);
  await pool.query('update local_user_roles set is_active=false where user_id=$1',[manager.id]);assert.equal((await call(quotePath('BASIC'),'GET',undefined,manager.token)).status,401);await pool.query('update local_user_roles set is_active=true where user_id=$1',[manager.id]);
 });
 const arm=async phase=>{await rm(paths.reached,{force:true});await rm(paths.release,{force:true});await writeFile(paths.armed,JSON.stringify({phase}));};
 const reached=async()=>{for(let n=0;n<400;n++){try{await readFile(paths.reached);return;}catch{}await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Owned quote barrier not reached');};
 await check('S08 current role/profile rechecked after middleware before RR first authority read',async()=>{
  for(const kind of ['role','profile']){await arm('BEGIN');const pending=call(quotePath('BASIC'),'GET',undefined,manager.token);await reached();try{await pool.query(kind==='role'?"update local_user_roles set role='employee' where user_id=$1":'update local_user_profiles set is_active=false where user_id=$1',[manager.id]);}finally{await writeFile(paths.release,'go');}assert.equal((await pending).status,403);await pool.query(kind==='role'?"update local_user_roles set role='manager' where user_id=$1":'update local_user_profiles set is_active=true where user_id=$1',[manager.id]);}
 });
 await check('S09 coherent RR under concurrent price publish; no authority token or operational activation',async()=>{
  await arm('AUTHORITY');const pending=quote('BASIC');await reached();try{await pool.query("update local_product_rates set rate='100.00' where id=$1",[baseRate]);}finally{await writeFile(paths.release,'go');}
  const held=await pending,current=await quote('BASIC');assert.equal(held.unit_rate,'12500.25');assert.equal(held.line_amount,'37500.75');assert.equal(current.unit_rate,'100.00');assert.equal(current.line_amount,'300.00');for(const result of [held,current]){assert.equal(result.pay_ready,false);assert.equal(result.operational_activation,'DISABLED');assert.ok(!Object.keys(result).some(name=>/token|receipt|proof|worker/i.test(name)));}
  await pool.query("update local_product_rates set rate='12500.25' where id=$1",[baseRate]);
 });
 const allDigests=async()=>{const tables=(await pool.query("select tablename from pg_tables where schemaname='public' and tablename<>'local_auth_sessions' order by tablename")).rows;return Object.fromEntries(await Promise.all(tables.map(async({tablename})=>[tablename,(await pool.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text) hash from ${tablename} t`)).rows[0].hash])));};
 const authSessionDigest=async()=>(await pool.query("select md5(coalesce(jsonb_agg(to_jsonb(t)-'last_seen_at' order by id),'[]'::jsonb)::text) hash from local_auth_sessions t")).rows[0].hash;
 await check('S10 actual manager/admin shadow aliases denied and no compatibility records change',async()=>{
  const before=await allDigests();
  for(const actor of [admin,manager])for(const method of ['GET','POST'])for(const surface of ['table','snapshot','rpc','functions'])for(const alias of ['product_rates','local_product_rates','create_product_rates','history_local_product_rates','%20product_rates%20','%20local_product_rates%20','%20create_product_rates%20','%70roduct%5frates'])assert.equal((await call('/api/local-'+surface+'/'+alias,method,method==='GET'?undefined:{values:{rate:1}},actor.token)).status,403,method+' '+surface+' '+alias);
  assert.deepEqual(await allDigests(),before);
 });
 await check('S11 quote GETs are read-only across every business/config table; bounded RR uses exactly authority+one rate SELECT',async()=>{
  const before=await allDigests(),sessions=await authSessionDigest();for(const code of ['BASIC','DUPLICATE','NAN','ZERO','MISSING','UNIT-SET'])await quote(code);await call(quotePath('BASIC')+'&worker=x');assert.deepEqual(await allDigests(),before);assert.equal(await authSessionDigest(),sessions,'Only exact auth session last_seen_at may change');proof.read_only_table_count=Object.keys(before).length;proof.auth_sessions_except_last_seen_at_unchanged=true;
  const text=await readFile(paths.queries,'utf8'),transactions=text.trim().split(String.fromCharCode(10)).filter(Boolean).map(line=>JSON.parse(line));assert.ok(transactions.length>0);for(const {queries} of transactions){assert.equal(queries[0],'begin isolation level repeatable read read only');assert.ok(!queries.some(sql=>/\b(?:insert|update|delete|pg_advisory|lock table|for update)\b/i.test(sql)));const full=queries.at(-1)==='commit';assert.equal(queries.length,full?4:3);assert.equal(queries.filter(sql=>sql.startsWith('select id rate_id,piece_rate_code')).length,full?1:0);}
  proof.transactions=transactions.length;await writeFile(stage+'/own-'+runLabel+'-query-evidence.json',JSON.stringify(transactions,null,2));
 });
 await check('S12 old list and historical fingerprint/semantics unchanged by quote inspection',async()=>{
  const {capturePayrollSourceFingerprint}=await tsImport(new URL('../server/payroll-snapshot.ts',import.meta.url).href,import.meta.url),before=await capturePayrollSourceFingerprint(pool,'2026-10-01','2026-10-31',26,null),list=await must('/api/payroll/product-rates');for(let n=0;n<3;n++)await quote('BASIC');assert.deepEqual(await must('/api/payroll/product-rates'),list);assert.deepEqual(await capturePayrollSourceFingerprint(pool,'2026-10-01','2026-10-31',26,null),before);proof.fingerprint_before_after=before;
 });
 await check('S13 established payroll V2 financial regression on this owned fixture and current source',async()=>{
  await pool.query("insert into local_payroll_calendar_versions(period_start,period_end,location_code,standard_days,daily_minutes,reason,source_reference,created_by,status,approved_by,approved_at)values('2026-09-01','2026-09-30','__UNASSIGNED__',26,480,'V2 isolated fixture','approved synthetic golden calendar','qa-fixture','APPROVED','qa-fixture',now())");
  const source=(await readFile('scripts/test-local-payroll-v2.ps1','utf8')).replaceAll('\r\n','\n');
  const helpers=source.slice(source.indexOf('function Invoke-LocalSql'),source.indexOf('function Stop-TestApi')).replace('-U crm_local','-U $env:LOCAL_TEST_ROLE');
  const body=source.slice(source.indexOf('  # The bootstrap seed'),source.lastIndexOf('\n}\nfinally')).replace('  $workers = @(',`  Invoke-LocalSql "insert into local_payroll_rule_versions(policy_group_id,rule_kind,overtime_type,calculation_method,multiplier,effective_from,effective_to,reason,source_reference,created_by,status,approved_by,approved_at)values('$($group.id)','OT','NORMAL','BASE_RATE_MULTIPLIER',1.5,'2026-09-01','2026-09-30','V2 isolated fixture','approved synthetic golden OT','qa-fixture','APPROVED','qa-fixture',now());"\n  $workers = @(`);
  assert.ok(helpers.includes('function Assert-Decimal')&&body.includes('Local payroll V2 regression passed'),'Known financial fixture boundaries');
  const script=path.join(storage,'payroll-v2-fixture.ps1');await writeFile(script,`$ErrorActionPreference='Stop'\n$port=$env:LOCAL_API_PORT\n$database=$env:LOCAL_TEST_DATABASE\n$container='crm-joliefam-local-postgres'\nfunction Get-LocalAuthHeaders([string]$Base){return @{Authorization=('Bearer '+$env:LOCAL_TEST_AUTH_TOKEN);Origin='https://crm.example.com'}}\n`+helpers+body);
  const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...safeEnv(),LOCAL_API_PORT:String(port),LOCAL_TEST_DATABASE:database,LOCAL_TEST_ROLE:role,LOCAL_TEST_AUTH_TOKEN:token}});let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);const [code]=await once(child,'exit');await writeFile(stage+'/own-'+runLabel+'-payroll-v2.log',output.replaceAll(secret,'[redacted]'));assert.equal(code,0,'Existing payroll financial suite: '+output);assert.ok(output.includes('Local payroll V2 regression passed'));
 });
 await verify();
 proof.fixture={admin_id:admin.id,manager_id:manager.id,base_rate_id:baseRate};
}catch(error){failures.push({name:'HARNESS',error:error.stack?.replaceAll(secret,'[redacted]')});console.log('FAIL HARNESS: '+error.message.replaceAll(secret,'[redacted]'));}
finally{
 if(api&&api.exitCode===null&&api.signalCode===null){const exited=once(api,'exit');api.kill();await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,5000))]);}
 const apiStopped=!api||api.exitCode!==null||api.signalCode!==null;if(!apiStopped)failures.push({name:'CLEANUP',error:'Owned API did not exit; fixture manifest records running pid without claiming stopped.'});await pool?.end();
 const manifest=storage&&path.join(storage,'owned-qa-manifest.json');if(manifest)await writeFile(manifest,JSON.stringify({synthetic:true,owned_test_only:true,database,role,connectionString,storage,api_pid:api?.pid,api_stopped:apiStopped,freeze_sha256:proof.freeze_sha256,...proof.fixture},null,2));
 await writeFile(stage+'/own-'+runLabel+'-api.log',logs.replaceAll(secret,'[redacted]'));await writeFile(stage+'/own-'+runLabel+'-proof.json',JSON.stringify({...proof,passed,failures,created,fixture_manifest:manifest,api_stopped:apiStopped},null,2));
 console.log(JSON.stringify({suite:'5S.1 isolated',passed:passed.length,failed:failures.length,proof:stage+'/own-'+runLabel+'-proof.json',owned_fixture_retained:manifest,api_stopped:apiStopped},null,2));if(failures.length)process.exitCode=1;
}
