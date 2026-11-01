// Independent item-4 supplement. PREPARED ONLY until parent supplies the final freeze.
// New TESTER4 rows only in a held owned synthetic fixture. Never reads .env.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID,randomBytes,scryptSync} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),args=process.argv.slice(2);
const argument=name=>{const i=args.indexOf(name);assert.ok(i>=0&&args[i+1],name+' required');return path.resolve(args[i+1]);};
const manifestPath=argument('--manifest'),freezePath=argument('--freeze');assert.equal(args.length,4);
assert.equal(path.basename(manifestPath),'owned-qa-manifest.json');assert.match(path.basename(path.dirname(manifestPath)),/^product-labor-mapping-owned-[a-z0-9_-]+$/i);
assert.ok(freezePath.startsWith(path.join(root,'.local-staging-runtime/item4-baseline')+path.sep));
const frozen=JSON.parse(await readFile(freezePath,'utf8'));assert.ok(Array.isArray(frozen)&&frozen.length>0);
const freeze=async()=>{for(const f of frozen){assert.ok(path.resolve(f.Path).startsWith(root+path.sep));assert.equal(createHash('sha256').update(await readFile(f.Path)).digest('hex'),f.Hash.toLowerCase(),'Frozen source differs: '+f.Path);}};await freeze();
const m=JSON.parse(await readFile(manifestPath,'utf8'));assert.equal(m.synthetic,true);assert.equal(m.owned_test_only,true);assert.match(m.database,/^product_labor_mapping_qa_[0-9]+_[0-9]+$/);assert.equal(m.publicAppUrl,'https://crm.example.com');
const base=new URL(m.apiOrigin||m.base),db=new URL(m.connectionString);assert.equal(base.protocol,'http:');assert.equal(base.hostname,'127.0.0.1');assert.equal(base.pathname,'/');assert.equal(base.username+base.password+base.search+base.hash,'');assert.ok(base.port&&!['8787','16543'].includes(base.port));assert.equal(db.hostname,'127.0.0.1');assert.equal(db.port,'16543');assert.equal(db.pathname,'/'+m.database);assert.match(db.username,/^product_labor_mapping_role_[0-9]+_[0-9]+$/);
const health=await(await fetch(new URL('/health',base),{redirect:'error',signal:AbortSignal.timeout(10000)})).json();assert.equal(health.database,m.database);assert.equal(health.backend,'local-postgresql');
const pool=new pg.Pool({connectionString:m.connectionString}),key=()=>randomUUID(),tag=key().slice(0,8),name=s=>'TESTER4-'+tag+' '+s,prefix='/api/payroll/labor-mappings',date='2026-10-29';
const evidence={synthetic:true,database:m.database,freeze_path:freezePath,started_at:new Date().toISOString(),passed:[],failures:[],created:{actors:[],products:[],lists:[],decision_ids:[]},production_writes:0,supabase_writes:0,provider_requests:0};
const call=async(route,token,method='GET',body)=>{const r=await fetch(new URL(route,base),{method,headers:{origin:m.publicAppUrl,...(token?{authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});return{status:r.status,body:await r.json().catch(()=>null)};};
const must=async(...args)=>{const r=await call(...args);assert.equal(r.status,200,JSON.stringify(r));return r.body;};
const check=async(label,fn)=>{try{await fn();evidence.passed.push(label);console.log('PASS '+label);}catch(error){evidence.failures.push({name:label,error:error.stack});console.log('FAIL '+label+': '+error.message);}};
const safe=r=>{assert.equal(r.pay_ready,false);assert.equal(r.pay_status,'GROUP_CHECK_PENDING');return r;};
let a,b,employee,admin,operationalBefore,originalBefore;
const actor=async(label,role='manager',assigned=null)=>{const id=key(),email=tag+'-'+label+'@tester4.invalid',password='Tester4FixtureOnly!222',salt=randomBytes(16).toString('hex');await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,email,`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);await pool.query('insert into local_user_roles(user_id,role,assigned_by)values($1,$2,$3)',[id,role,assigned]);evidence.created.actors.push(id);return{id,token:(await must('/api/local-auth/login',null,'POST',{email,password})).token};};
const priceList=async(label,owner=a.id)=>{const id=key();await pool.query("insert into local_price_lists(id,name,year,status,manager_id,tenant_id)values($1,$2,2026,'active',$3,'default')",[id,name(label),owner]);evidence.created.lists.push(id);return id;};
const product=async(label,extra={})=>{const id=key();await pool.query("insert into local_products(id,sku,name,category,manager_id,price_list_id,tenant_id,specifications,is_active)values($1,$2,$3,$4,$5,$6,'default',$7,$8)",[id,extra.sku||'TESTER4-'+id,name(label),extra.category||'Vỏ gối',extra.owner===undefined?a.id:extra.owner,extra.list||null,extra.specifications||'Nguồn TESTER4 riêng',extra.active!==false]);evidence.created.products.push(id);return id;};
const values={material:'COTTON',pillow_subtype:'BOLSTER',joining:'NO',quilting:'NO',topstitch:'NO',sewing_method:'STANDARD',closure:'ENVELOPE',ruffle:'NO',waterproof:'NO'};
const technical=async(id,token=a.token,extra={})=>{const c=await must('/api/product-technical-profiles/'+id,token);return must('/api/product-technical-profiles/'+id,token,'PUT',{expected_revision:c.revision,source_fingerprint:c.source_fingerprint,idempotency_key:key(),action:'CONFIRM',reason:name('xác nhận kỹ thuật'),manufacturing_type:'PILLOW_CASE',finished_width:'613',dimension_unit:'MM',technical_values:values,...extra});};
const supply=async(id,route='SEW',token=a.token)=>{const p=(await pool.query('select name from local_products where id=$1',[id])).rows[0];const row=(await must('/api/product-supply-classifications?limit=100&search='+encodeURIComponent(p.name),token)).rows.find(r=>r.id===id);assert.ok(row);return must('/api/product-supply-classifications/confirm',token,'POST',{rows:[{product_id:id,expected_revision:row.revision,source_fingerprint:row.source_fingerprint,route,use_suggestion:false}],reason:name('xác nhận cách đáp ứng'),idempotency_key:key()});};
const resolve=async(id,token=a.token,on=date)=>safe(await must(prefix+'/products/'+id+'?date='+on+'&diagnostics=true',token));
const prepare=async(label,owner=a,extra={})=>{const id=await product(label,{owner:owner.id,...extra});await technical(id,owner.token);await supply(id,'SEW',owner.token);return id;};
const mapping=async(id,extra={},token=a.token)=>{const on=extra.effective_from||date,c=await resolve(id,token,on),code=(await must(prefix+'/catalog?date='+on+'&limit=100&search=Vgo',token)).rows.find(r=>r.key==='vgo');assert.ok(code);return{kind:'EXACT',template_product_id:id,decision_id:c.exact_decision_id||undefined,expected_revision:c.exact_revision,source_fingerprint:c.source_fingerprint,action:'APPROVE',effective_from:date,reason:name('duyệt rõ ràng'),idempotency_key:key(),piece_rate_code:code.code,code_semantic_fingerprint:code.semantic_fingerprint,source_unit:'PIECE',conversion_factor:'1',conversion_confirmed:false,...extra};};
const approve=async(id,extra={},token=a.token)=>{const body=await mapping(id,extra,token),result=await must(prefix+'/decisions',token,'POST',body);for(const row of result.results)if(!evidence.created.decision_ids.includes(row.decision_id))evidence.created.decision_ids.push(row.decision_id);return{body,result};};
const list=(query={},token=a.token)=>must(prefix+'/products?'+new URLSearchParams({date,view:'ATTENTION',limit:'50',...query}),token);
const diagnostics=r=>{const d=r.diagnostics;assert.ok(d&&typeof d==='object'&&!Array.isArray(d),'Typed diagnostics missing');assert.ok(Array.isArray(d.candidates));assert.ok(Number.isSafeInteger(d.candidate_count));assert.ok(Array.isArray(d.missing_fact_keys));return d;};
const mappingState=async ids=>(await pool.query('select decision_id,version,action,snapshot from local_labor_mapping_versions where decision_id=any($1::uuid[]) order by decision_id,version',[ids])).rows;
const operational=async()=>{const tables=(await pool.query("select tablename from pg_tables where schemaname='public' and (tablename ~ '^local_(inventory_|production_|attendance$|payroll_|finance_|bank_|assignments$)' or tablename='local_transactions') order by tablename")).rows.map(r=>r.tablename);return Object.fromEntries(await Promise.all(tables.map(async t=>[t,createHash('sha256').update(JSON.stringify((await pool.query('select coalesce(jsonb_agg(to_jsonb(t)order by to_jsonb(t)::text),\'[]\'::jsonb) s from '+t+' t')).rows[0].s)).digest('hex')])));};
const originals=async()=>{const ids=Object.values(m.products||{});return{products:(await pool.query('select * from local_products where id=any($1::uuid[])order by id',[ids])).rows,versions:(await pool.query('select v.* from local_labor_mapping_versions v join local_labor_mapping_decisions d on d.id=v.decision_id where d.product_id=any($1::uuid[]) order by v.decision_id,v.version',[ids])).rows};};
try{
 assert.equal((await pool.query('select current_database() db')).rows[0].db,m.database);assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,false);operationalBefore=await operational();originalBefore=await originals();
 admin=(await must('/api/local-auth/login',null,'POST',m.credentials)).token;a=await actor('manager-a');b=await actor('manager-b');employee=await actor('employee','employee',a.id);
 await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'products',true),($1,'bom_view',true),($1,'bom_manage',true)",[employee.id]);
 await check('queue scopes and counts precede fifty-row pagination search issue and list filters',async()=>{
  const la=await priceList('bảng giá A'),lb=await priceList('bảng giá B',b.id),lc=await priceList('bảng giá C'),ids=[],duplicateSKU='DUPLICATE-'+tag;
  for(let n=0;n<57;n++)ids.push(await product('pagination '+String(n).padStart(3,'0'),{list:la,sku:n===0?duplicateSKU:'PAGINATION-'+tag+'-'+n}));
  const ownDuplicate=await product('same SKU own second list',{list:lc,sku:duplicateSKU}),foreign=await product('pagination ngoài quyền',{list:lb,owner:b.id,sku:duplicateSKU}),inactive=await product('pagination ngừng dùng',{list:la,active:false}),labor=await product('pagination công may',{list:la,category:'Công may'}),purchase=await product('pagination nhập sẵn',{list:la});await supply(purchase,'PURCHASE');
  const query={search:name('pagination'),price_list_id:la},first=await list(query),second=await list({...query,offset:'50'}),all=await list({...query,limit:'100'});
  assert.equal(first.total,57);assert.equal(second.total,57);assert.equal(first.rows.length,50);assert.equal(second.rows.length,7);assert.ok(first.counts&&typeof first.counts==='object');assert.deepEqual(first.counts,second.counts);assert.deepEqual(first.counts,all.counts);
  assert.deepEqual([...first.rows,...second.rows].map(r=>r.product.id),all.rows.map(r=>r.product.id));assert.equal(new Set(all.rows.map(r=>r.product.id)).size,57);assert.deepEqual(new Set(all.rows.map(r=>r.product.id)),new Set(ids));all.rows.forEach(safe);
  assert.ok(!JSON.stringify(first).includes(foreign));for(const excluded of [inactive,labor,purchase])assert.ok(!all.rows.some(r=>r.product.id===excluded));assert.ok(!first.price_lists.some(r=>r.id===lb));
  const single=await list({search:duplicateSKU,price_list_id:la,limit:'100'});assert.equal(single.total,1);assert.equal(single.rows[0].product.id,ids[0]);const across=await list({search:duplicateSKU,limit:'100'});assert.equal(across.total,2);assert.deepEqual(new Set(across.rows.map(r=>r.product.id)),new Set([ids[0],ownDuplicate]));
  const issue=first.rows[0].diagnostics?.issue||first.rows[0].issue||'SUPPLY_REVIEW',filtered=await list({...query,issue});assert.equal(filtered.total,57);assert.deepEqual(filtered.counts,first.counts);
 });
 await check('current PURCHASE excluded stale PURCHASE stays first source issue and inactive stays excluded',async()=>{
  const id=await product('purchase stale');await supply(id,'PURCHASE');assert.equal((await list({search:name('purchase stale')})).total,0);
  await pool.query("update local_products set specifications='Nguồn TESTER4 đã đổi'where id=$1",[id]);const stale=await resolve(id);assert.equal(stale.code_status,'SUPPLY_REVIEW');assert.equal((await list({search:name('purchase stale')})).total,1);
  await pool.query('update local_products set is_active=false where id=$1',[id]);assert.equal((await list({search:name('purchase stale')})).total,0);
 });
 await check('exact UUID source technical mapping progression never approves implicitly and PURCHASE terminates',async()=>{
  const listA=await priceList('progression A'),listB=await priceList('progression B'),id=await product('progression',{list:listA,sku:'PROGRESSION-'+tag}),other=await product('progression twin',{list:listB,sku:'PROGRESSION-'+tag}),count=async()=>Number((await pool.query("select count(*) n from local_labor_mapping_versions v join local_labor_mapping_decisions d on d.id=v.decision_id where d.product_id=$1 and v.action='APPROVE'",[id])).rows[0].n);
  assert.equal((await resolve(id)).code_status,'SUPPLY_REVIEW');await supply(id);assert.equal((await resolve(id)).code_status,'TECHNICAL_REVIEW');assert.equal(await count(),0);
  await technical(id);let afterTechnical=await resolve(id);assert.ok(['READY','SUPPLY_REVIEW'].includes(afterTechnical.gate));assert.equal(await count(),0);assert.equal(afterTechnical.exact_revision,0);assert.equal((await resolve(other)).gate,'SUPPLY_REVIEW');
  // A newly declared technical supply basis may invalidate the earlier source proof.
  // Follow that authoritative blocker explicitly; neither save may approve mapping.
  if(afterTechnical.gate==='SUPPLY_REVIEW'){await supply(id);afterTechnical=await resolve(id);}assert.equal(afterTechnical.gate,'READY');assert.equal(await count(),0);await approve(id);assert.equal((await resolve(id)).code_status,'RESOLVED');assert.equal(await count(),1);assert.equal((await resolve(other)).exact_revision,0);
  assert.equal((await list({search:name('progression'),view:'ATTENTION'})).rows.some(r=>r.product.id===id),false);assert.equal((await list({search:name('progression'),view:'ALL'})).rows.some(r=>r.product.id===id),true);
  const end=await product('progression purchase');await supply(end,'PURCHASE');assert.equal((await list({search:name('progression purchase'),view:'ALL'})).total,0);assert.equal((await resolve(end)).code_status,'NOT_APPLICABLE');
 });
 await check('date selects permanent exact supersession and never broad fallback or draft masking',async()=>{
  const id=await prepare('date boundaries');await approve(id,{effective_from:'2026-01-01'});await approve(id,{effective_from:'2026-02-01',effective_to:'2026-02-28'});await approve(id,{action:'DRAFT',effective_from:'2026-01-01'});
  assert.equal((await resolve(id,a.token,'2026-01-31')).code_status,'RESOLVED');assert.equal((await resolve(id,a.token,'2026-02-28')).code_status,'RESOLVED');assert.equal((await resolve(id,a.token,'2026-03-01')).code_status,'EXPIRED_REVIEW');
  const row=await list({search:name('date boundaries'),date:'2026-03-01'});assert.equal(row.total,1);assert.equal(row.date,'2026-03-01');const d=diagnostics(await resolve(id,a.token,'2026-03-01'));assert.ok(d.candidates.every(v=>Number(v.version||v.decision_version)!==1),'Superseded exact V1 must not revive as repair candidate');
 });
 await check('closed unresolved status matrix reports current typed diagnostics and immutable legacy versions',async()=>{
  const rows=[];
  const missing=await prepare('matrix missing');await technical(missing,a.token,{technical_values:{...values,joining:'UNKNOWN'}});await supply(missing);rows.push([missing,'MISSING_FACTS']);assert.ok(diagnostics(await resolve(missing)).missing_fact_keys.includes('joining'));
  const unsupported=await product('matrix unsupported');await technical(unsupported,a.token,{manufacturing_type:'MATTRESS',technical_values:{material:'COTTON'}});await supply(unsupported);rows.push([unsupported,'UNSUPPORTED']);
  // Append brand-new simulated historical versions, never alter immutable snapshots.
  // This represents stored contracts predating the current resolver/code registry.
  for(const [label,field,value,status]of [['old contract','contract_version','legacy-tester4','CONTRACT_REVIEW'],['old requirements','code_contract_version',-1,'CODE_REQUIREMENTS_REVIEW']]){
   const id=await prepare('matrix '+label),created=await approve(id),decision=created.result.results[0].decision_id,previous=(await mappingState([decision]))[0],snapshot={...previous.snapshot,[field]:value};
   await pool.query("insert into local_labor_mapping_versions(decision_id,version,action,effective_from,snapshot,reason,created_by)values($1,2,'APPROVE',$2,$3::jsonb,$4,$5)",[decision,date,JSON.stringify(snapshot),name('fixture phiên bản cũ '+label),a.id]);rows.push([id,status]);
  }
  const changed=await prepare('matrix changed source');await approve(changed);await technical(changed,a.token,{finished_width:'628'});await supply(changed);rows.push([changed,'REVIEW']);
  const rateConflict=await prepare('matrix code conflict'),on='2095-10-29';await approve(rateConflict,{effective_from:on});const ownRate=key();
  await pool.query("insert into local_product_rates(id,piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,effective_to,status,source_reference)values($1,'Vgo','Vỏ gối ôm',1000,'SET',$2,$2,'APPROVED',$3)",[ownRate,on,name('fixture rate conflict')]);
  try{assert.equal((await resolve(rateConflict,a.token,on)).code_status,'CODE_REVIEW');const q=await list({search:name('matrix code conflict'),date:on,issue:'CODE_REVIEW'});assert.equal(q.total,1);assert.equal(q.counts.issues.CODE_REVIEW,1);q.rows.forEach(safe);}finally{await pool.query("update local_product_rates set status='DRAFT'where id=$1",[ownRate]);}
  for(const [id,status]of rows){const r=await resolve(id);assert.equal(r.code_status,status);const d=diagnostics(r);assert.equal(d.issue,status);const p=(await pool.query('select name from local_products where id=$1',[id])).rows[0];const q=await list({search:p.name,issue:status});assert.equal(q.total,1);assert.equal(q.counts.issues[status],1);assert.equal(q.rows[0].product.id,id);}
  const overrideTarget=await prepare('matrix override'),override=safe(await must(prefix+'/products/'+overrideTarget+'?date='+date+'&diagnostics=true&custom_specifications=true',a.token));assert.equal(override.code_status,'OVERRIDE_REVIEW');assert.equal(diagnostics(override).issue,'OVERRIDE_REVIEW');const catalogOnly=await list({search:name('matrix override')});assert.equal(catalogOnly.counts.issues.OVERRIDE_REVIEW,0);assert.notEqual(catalogOnly.rows[0].code_status,'OVERRIDE_REVIEW');
 });
 await check('ambiguity shows relevant same-code candidates but excludes nonmatching rule',async()=>{
  const target=await prepare('relevant target'),c=await resolve(target),conditions={...c.template_conditions,width_mm:{op:'eq',value:'613'}},first=await approve(target,{kind:'RULE',decision_id:undefined,expected_revision:0,conditions}),second=await approve(target,{kind:'RULE',decision_id:undefined,expected_revision:0,conditions});
  const different=await prepare('irrelevant template');await technical(different,a.token,{finished_width:'614'});await supply(different);const irrelevant=await approve(different,{kind:'RULE',decision_id:undefined,expected_revision:0,conditions:{...(await resolve(different)).template_conditions,width_mm:{op:'eq',value:'614'}}});
  const r=await resolve(target);assert.equal(r.code_status,'AMBIGUOUS');const d=diagnostics(r),serialized=JSON.stringify(d);assert.equal(d.candidate_count,2);for(const id of [first.result.results[0].decision_id,second.result.results[0].decision_id])assert.ok(serialized.includes(id));assert.ok(!serialized.includes(irrelevant.result.results[0].decision_id));
  await approve(target,{kind:'RULE',decision_id:second.result.results[0].decision_id,expected_revision:1,action:'RETIRE'});assert.equal((await resolve(target)).code_status,'RESOLVED');
 });
 await check('hidden private global candidate and private retirement proof have closed safe projection',async()=>{
  const width='619.'+String(Number.parseInt(tag.slice(0,4),16)%10000).padStart(4,'0'),source=await prepare('PRIVATE-GLOBAL-SOURCE',b),target=await prepare('public target');await technical(source,b.token,{finished_width:width});await supply(source,'SEW',b.token);await technical(target,a.token,{finished_width:width});await supply(target);const proof=await resolve(source,b.token);
  const own=await approve(target,{kind:'RULE',decision_id:undefined,expected_revision:0,conditions:{...(await resolve(target)).template_conditions,width_mm:{op:'eq',value:width}}});
  const hidden=await approve(source,{kind:'RULE',global:true,decision_id:undefined,expected_revision:0,conditions:{...(await resolve(source,b.token)).template_conditions,width_mm:{op:'eq',value:width}}},admin),decision=hidden.result.results[0].decision_id;
  const r=await resolve(target);assert.equal(r.code_status,'AMBIGUOUS');const d=diagnostics(r),serialized=JSON.stringify(d);assert.equal(d.candidate_count,2);
  for(const denied of [source,decision,'PRIVATE-GLOBAL-SOURCE',b.id,proof.source_fingerprint,proof.context_fingerprint,proof.facts_fingerprint])assert.ok(!serialized.includes(denied),'Private candidate leakage: '+denied);
  assert.ok(serialized.includes('ADMIN_REVIEW'),'Hidden repair requires administrator');assert.ok(serialized.includes(own.result.results[0].decision_id));
  const created=await approve(target,{kind:'RULE',global:true,decision_id:undefined,expected_revision:0,conditions:{...(await resolve(target)).template_conditions,width_mm:{op:'eq',value:width}}},admin),retired=created.result.results[0].decision_id;
  await approve(source,{kind:'RULE',global:true,decision_id:retired,expected_revision:1,action:'RETIRE'},admin);
  for(const route of [prefix+'/decisions',prefix+'/decisions/'+retired+'/history']){const rows=await must(route,a.token),text=JSON.stringify(rows.filter(v=>v.decision_id===retired));for(const denied of [source,'PRIVATE-GLOBAL-SOURCE',proof.proof.raw_source_fingerprint])assert.ok(!text.includes(denied),'Retirement source leaked');}
  await approve(target,{kind:'RULE',global:true,decision_id:decision,expected_revision:1,action:'RETIRE'},admin);
 });
 await check('historical own RULE with current shared template remains readable but never writable',async()=>{
  const target=await prepare('historical own current shared');await technical(target,a.token,{finished_width:'631'});await supply(target);
  const shared=await product('current shared template',{owner:null});await technical(shared,admin,{finished_width:'631'});await supply(shared,'SEW',admin);
  const conditions={...(await resolve(target)).template_conditions,width_mm:{op:'eq',value:'631'}},created=await approve(target,{kind:'RULE',decision_id:undefined,expected_revision:0,conditions}),decision=created.result.results[0].decision_id;
  await approve(shared,{kind:'RULE',decision_id:decision,expected_revision:1,action:'DRAFT',effective_from:'2030-01-01',conditions},admin);
  const d=diagnostics(await resolve(target)),candidate=d.candidates.find(c=>c.decision_id===decision);assert.ok(candidate);assert.equal(candidate.version,1);assert.equal(candidate.revision,2);assert.equal(candidate.template_product_id,target);assert.equal(candidate.capability,'READ_ONLY');assert.equal(candidate.can_retire,false);assert.equal(candidate.can_reconfirm,false);
  const before=await mappingState([decision]),body=await mapping(target,{kind:'RULE',decision_id:decision,expected_revision:2,action:'RETIRE'});assert.equal((await call(prefix+'/decisions',a.token,'POST',body)).status,403);assert.deepEqual(await mappingState([decision]),before);assert.equal((await pool.query('select count(*)::int n from local_labor_mapping_receipts where idempotency_key=$1',[body.idempotency_key])).rows[0].n,0);
  await approve(target,{kind:'RULE',decision_id:decision,expected_revision:2,action:'RETIRE'},admin);assert.equal(diagnostics(await resolve(target)).candidate_count,0);
 });
 await check('source409 retry receipt and owner transfer recheck stay atomic',async()=>{
  const id=await prepare('race ownership'),created=await approve(id),decision=created.result.results[0].decision_id,before=await mappingState([decision]);assert.equal((await must(prefix+'/decisions',a.token,'POST',created.body)).reused,true);assert.deepEqual(await mappingState([decision]),before);
  assert.equal((await call(prefix+'/decisions',a.token,'POST',{...created.body,reason:name('changed key payload')})).status,409);const pending=await mapping(id);await technical(id,a.token,{finished_width:'627'});await supply(id);assert.equal((await call(prefix+'/decisions',a.token,'POST',pending)).status,409);assert.deepEqual(await mappingState([decision]),before);
  await pool.query('update local_products set manager_id=$2 where id=$1',[id,b.id]);assert.equal((await call(prefix+'/products/'+id,a.token)).status,404);assert.equal((await call(prefix+'/decisions/'+decision+'/history',a.token)).status,404);assert.equal((await call(prefix+'/decisions',a.token,'POST',created.body)).status,404);const current=await resolve(id,b.token);assert.equal(current.read_only,true);assert.equal(current.code_status,'SUPPLY_REVIEW');assert.equal((await call(prefix+'/decisions',b.token,'POST',await mapping(id,{},b.token))).status,404);assert.deepEqual(await mappingState([decision]),before);
  // Current owner retains independent source-edit rights despite mapping recovery.
  assert.equal(diagnostics(current).can_edit_source,true);assert.equal(diagnostics(current).can_edit_mapping,false);await technical(id,b.token,{finished_width:'629'});await supply(id,'SEW',b.token);const fixedSource=await resolve(id,b.token);assert.equal(fixedSource.read_only,true);assert.equal(fixedSource.code_status,'REVIEW');assert.deepEqual(await mappingState([decision]),before);
 });
 await check('employee denied all queue diagnostics and mutation routes despite product permissions',async()=>{
  const id=await product('employee denial');for(const route of [prefix+'/products?view=ATTENTION',prefix+'/products/'+id+'?diagnostics=true',prefix+'/catalog',prefix+'/decisions'])assert.equal((await call(route,employee.token)).status,403);
  for(const route of [prefix+'/decisions',prefix+'/batch-preview',prefix+'/batch-confirm'])assert.equal((await call(route,employee.token,'POST',{product_ids:[id]})).status,403);assert.equal((await call(prefix+'/products?view=ATTENTION',null)).status,401);
 });
 await check('invalid closed queue filters reject without confusing legacy status combinations',async()=>{
  for(const query of ['view=NOPE','view=ATTENTION&issue=NOPE','view=ATTENTION&status=REVIEW','issue=SUPPLY_REVIEW','date=2026-02-30','limit=101','offset=-1','price_list_id=bad'])assert.equal((await call(prefix+'/products?'+query,a.token)).status,400);
  const omitted=await must(prefix+'/products?search='+encodeURIComponent(name('progression'))+'&date='+date,a.token);assert.ok(Array.isArray(omitted.rows),'Legacy omitted-view contract retained');
 });
 await check('all operational data and original editor fixture remain byte-equivalent',async()=>{assert.deepEqual(await operational(),operationalBefore);assert.deepEqual(await originals(),originalBefore);});
}catch(error){evidence.failures.push({name:'setup-or-unhandled',error:error.stack});}
finally{
 try{await freeze();evidence.frozen_hashes_unchanged=true;}catch(error){evidence.failures.push({name:'post-freeze',error:error.stack});evidence.frozen_hashes_unchanged=false;}
 await pool.end();evidence.finished_at=new Date().toISOString();evidence.cleanup='Held owned synthetic fixture retained; only new TESTER4-tagged rows added. Original UI a/b unchanged.';evidence.unexecuted_external_gates=['real desktop/mobile CUA','DB query instrumentation fast-path and batching','full main-suite closed status matrix'];
 const output=path.join(root,'.local-staging-runtime/item4-baseline/tester-api-supplement-'+tag+'.json');await writeFile(output,JSON.stringify(evidence,null,2));console.log(JSON.stringify({suite:'tester-independent-item4-api',passed:evidence.passed.length,failed:evidence.failures.length,evidence:output,failures:evidence.failures},null,2));
}
if(evidence.failures.length)process.exitCode=1;
