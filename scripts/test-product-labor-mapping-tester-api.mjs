// Tester-owned supplementary API assertions. Run only after root assigns a freeze.
// All writes are new tester synthetic rows in an explicitly owned held fixture.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID,randomBytes,scryptSync} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),args=process.argv.slice(2);
const argument=name=>{const i=args.indexOf(name);assert.ok(i>=0&&args[i+1],name+' is required');return path.resolve(args[i+1]);};
const manifestPath=argument('--manifest'),freezePath=argument('--freeze');assert.equal(args.length,4);
assert.equal(path.basename(manifestPath),'owned-qa-manifest.json');assert.match(path.basename(path.dirname(manifestPath)),/^product-labor-mapping-owned-[a-z0-9_-]+$/i);
assert.ok(freezePath.startsWith(path.join(root,'.local-staging-runtime/item3-baseline')+path.sep));
const frozen=JSON.parse(await readFile(freezePath,'utf8'));
const verifyFreeze=async()=>{for(const entry of frozen){assert.ok(path.resolve(entry.Path).startsWith(root+path.sep));assert.equal(createHash('sha256').update(await readFile(entry.Path)).digest('hex'),String(entry.Hash).toLowerCase(),'Frozen source changed: '+entry.Path);}};
await verifyFreeze();
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
assert.equal(manifest.synthetic,true);assert.equal(manifest.owned_test_only,true);assert.match(manifest.database,/^product_labor_mapping_qa_[0-9]+_[0-9]+$/);
const base=new URL(manifest.apiOrigin||manifest.base);assert.equal(base.protocol,'http:');assert.equal(base.hostname,'127.0.0.1');assert.equal(base.pathname,'/');assert.equal(base.search+base.hash+base.username+base.password,'');assert.ok(base.port&&!['8787','16543'].includes(base.port));
assert.equal(manifest.publicAppUrl,'https://crm.example.com');
const connection=new URL(manifest.connectionString);assert.equal(connection.hostname,'127.0.0.1');assert.equal(connection.port,'16543');assert.equal(connection.pathname,'/'+manifest.database);assert.match(connection.username,/^product_labor_mapping_role_[0-9]+_[0-9]+$/);
const health=await(await fetch(new URL('/health',base),{signal:AbortSignal.timeout(10000),redirect:'error'})).json();assert.equal(health.database,manifest.database);assert.equal(health.backend,'local-postgresql');
const pool=new pg.Pool({connectionString:manifest.connectionString});
const key=()=>randomUUID(),prefix='/api/payroll/labor-mappings',date='2026-10-29';
const evidence={synthetic:true,database:manifest.database,freeze_path:freezePath,started_at:new Date().toISOString(),passed:[],failures:[],created:{products:[],rates:[],actors:[],price_lists:[]},production_writes:0,supabase_writes:0};
const mark=key().slice(0,8),name=label=>'TESTER-'+mark+' '+label;
const call=async(route,token,method='GET',body)=>{const r=await fetch(new URL(route,base),{method,headers:{origin:manifest.publicAppUrl,...(token?{authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000),redirect:'error'});return{status:r.status,body:await r.json().catch(()=>null)};};
const must=async(...a)=>{const r=await call(...a);assert.equal(r.status,200,JSON.stringify(r));return r.body;};
const check=async(label,fn)=>{try{await fn();evidence.passed.push(label);console.log('PASS '+label);}catch(error){evidence.failures.push({name:label,error:error.stack});console.log('FAIL '+label+': '+error.message);}};
let admin,a,b;
const actor=async(label)=>{const id=key(),email=mark+'-'+label+'@tester-labor.invalid',password='TesterFixtureOnly!222',salt=randomBytes(16).toString('hex');await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,email,`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);await pool.query("insert into local_user_roles(user_id,role)values($1,'manager')",[id]);evidence.created.actors.push(id);return{id,token:(await must('/api/local-auth/login',null,'POST',{email,password})).token};};
const createProduct=async(label,owner=a.id)=>{const id=key();await pool.query("insert into local_products(id,sku,name,category,manager_id,tenant_id,specifications,price,cost_price,is_active)values($1,$2,$3,'Vỏ gối',$4,'default','Theo hồ sơ quản lý',100,50,true)",[id,name(label),name(label),owner]);evidence.created.products.push(id);return id;};
const technicalValues={material:'COTTON',pillow_subtype:'BOLSTER',joining:'NO',quilting:'NO',topstitch:'NO',sewing_method:'STANDARD',closure:'ENVELOPE',ruffle:'NO'};
const technical=async(id,token=a.token,extra={})=>{const current=await must('/api/product-technical-profiles/'+id,token);return must('/api/product-technical-profiles/'+id,token,'PUT',{expected_revision:current.revision,source_fingerprint:current.source_fingerprint,idempotency_key:key(),action:'CONFIRM',manufacturing_type:'PILLOW_CASE',technical_values:technicalValues,reason:name('xác nhận hồ sơ riêng'),...extra});};
const classify=async(id,token=a.token)=>{const product=(await pool.query('select name from local_products where id=$1',[id])).rows[0];const list=await must('/api/product-supply-classifications?limit=100&search='+encodeURIComponent(product.name),token);const row=list.rows.find(r=>r.id===id);assert.ok(row);return must('/api/product-supply-classifications/confirm',token,'POST',{rows:[{product_id:id,expected_revision:row.revision,source_fingerprint:row.source_fingerprint,route:'SEW',use_suggestion:false}],reason:name('xác nhận may'),idempotency_key:key()});};
const prepare=async(label,owner=a)=>{const id=await createProduct(label,owner.id);await technical(id,owner.token);await classify(id,owner.token);return id;};
const resolve=(id,token=a.token,on=date)=>must(prefix+'/products/'+id+'?date='+on,token);
const rate=async(code,meaning,extra={})=>{const id=key();await pool.query("insert into local_product_rates(id,product_id,piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,effective_to,status,source_reference)values($1,null,$2,$3,1234,$4,$5,$6,'APPROVED',$7)",[id,code,meaning,extra.unit||'PIECE',extra.from||'2026-01-01',extra.to||null,name('synthetic.xlsx')]);evidence.created.rates.push(id);return id;};
const catalog=async(code,on=date)=>{const result=await must(prefix+'/catalog?limit=100&date='+on+'&search='+encodeURIComponent(code),a.token);return result.rows.find(r=>r.key===code.trim().toLowerCase());};
const mapping=async(id,code,token=a.token,extra={})=>{const c=await resolve(id,token,extra.effective_from||date),cat=await catalog(code,extra.effective_from||date);assert.ok(cat);return{kind:'EXACT',template_product_id:id,decision_id:c.exact_decision_id||undefined,expected_revision:c.exact_revision,source_fingerprint:c.source_fingerprint,action:'APPROVE',effective_from:date,reason:name('duyệt mã riêng'),idempotency_key:key(),piece_rate_code:cat.code,code_semantic_fingerprint:cat.semantic_fingerprint,source_unit:'PIECE',conversion_factor:'1',conversion_confirmed:false,...extra};};
const approve=async(id,code,token=a.token,extra={})=>{const body=await mapping(id,code,token,extra);const result=await must(prefix+'/decisions',token,'POST',body);return{body,result};};
const blocked=async(id,token=a.token)=>{const r=await resolve(id,token);assert.notEqual(r.code_status,'RESOLVED');assert.equal(r.match,null);assert.equal(r.pay_ready,false);return r;};
const versions=ids=>pool.query('select decision_id,version,snapshot,action from local_labor_mapping_versions where decision_id=any($1::uuid[]) order by decision_id,version',[ids]).then(r=>r.rows);
try{
 assert.equal((await pool.query('select current_database() db')).rows[0].db,manifest.database);assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,false);
 admin=(await must('/api/local-auth/login',null,'POST',manifest.credentials)).token;a=await actor('a');b=await actor('b');
 await check('forged CONFIRMED namespace without audit cannot resolve or create exact mapping',async()=>{
  const id=await createProduct('hồ sơ giả');await classify(id);
  const detail=await must('/api/product-technical-profiles/'+id,a.token),profileId=key();
  await pool.query("insert into local_manufacturing_records(id,record_type,product_id,payload)values($1,'manufacturing_profile',$2,$3::jsonb)",[profileId,id,JSON.stringify({id:profileId,product_id:id,manufacturing_type:'PILLOW_CASE',dimension_unit:'CM',finished_width:null,finished_length:null,finished_height:null,is_active:true,extra_dimensions:{technical_attributes:{schema_version:1,status:'CONFIRMED',confirmed_version:1,confirmed_raw_source_fingerprint:detail.source_fingerprint,values:technicalValues}}})]);
  assert.equal((await blocked(id)).code_status,'TECHNICAL_REVIEW');
  const code=name('forgedcode').replaceAll(' ','' );await rate(code,'Công thử hồ sơ giả');const response=await call(prefix+'/decisions',a.token,'POST',await mapping(id,code));assert.equal(response.status,409);
 });
 await check('altered audited technical payload inactive profile and stale supply never reuse old proof',async()=>{
  const code='Vgo';
  const tampered=await prepare('hồ sơ đã sửa ngầm');await approve(tampered,code);
  await pool.query("update local_manufacturing_records set payload=jsonb_set(payload,'{finished_width}','999'::jsonb) where product_id=$1 and record_type='manufacturing_profile'",[tampered]);assert.equal((await blocked(tampered)).code_status,'TECHNICAL_REVIEW');
  const inactive=await prepare('hồ sơ ngừng dùng');await approve(inactive,code);await technical(inactive,a.token,{is_active:false});assert.equal((await must('/api/product-technical-profiles/'+inactive,a.token)).status,'INACTIVE');assert.ok(['TECHNICAL_REVIEW','SUPPLY_REVIEW'].includes((await blocked(inactive)).code_status),'Inactive proof must block even when it first invalidates supply basis');
  const stale=await prepare('nguồn đã đổi');await approve(stale,code);await pool.query("update local_products set specifications='Nguồn mới chưa xác nhận' where id=$1",[stale]);assert.equal((await blocked(stale)).code_status,'SUPPLY_REVIEW');
 });
 await check('approved mapping is blocked by overlapping semantic meaning or unit conflict',async()=>{
  for(const conflict of [{unit:'SET',name:'Vỏ gối ôm'},{unit:'PIECE',name:'Vỏ gối chần ôm'}]){
   const code='Vgo',on='2096-10-29',id=await prepare('xung đột '+conflict.unit);await approve(id,code,a.token,{effective_from:on});assert.equal((await resolve(id,a.token,on)).code_status,'RESOLVED');
   const ownRate=await rate(code,conflict.name,{unit:conflict.unit,from:on,to:on});
   try{const r=await resolve(id,a.token,on);assert.equal(r.code_status,'CODE_REVIEW');assert.equal(r.match,null);assert.equal((await catalog(code,on)).status,'CONFLICT');}
   finally{await pool.query("update local_product_rates set status='DRAFT' where id=$1",[ownRate]);}
   assert.equal((await resolve(id,a.token,on)).code_status,'RESOLVED');
  }
 });
 await check('nonoverlapping semantic versions are date-scoped and expired exact never falls back',async()=>{
  const code=name('dated').replaceAll(' ',''),id=await prepare('mã khác nghĩa theo ngày');await rate(code,'May chăn',{from:'2026-01-01',to:'2026-01-31'});await rate(code,'May chần',{from:'2026-02-01',to:'2026-02-28'});
  for(const on of ['2026-01-31','2026-02-01']){const cat=await catalog(code,on);assert.equal(cat.status,'AVAILABLE');assert.equal(cat.contract_status,'CODE_REQUIREMENTS_REVIEW');assert.equal((await call(prefix+'/decisions',a.token,'POST',await mapping(id,code,a.token,{effective_from:on}))).status,409);}
  assert.notEqual((await catalog(code,'2026-01-31')).semantic_fingerprint,(await catalog(code,'2026-02-01')).semantic_fingerprint);assert.equal(await catalog(code,'2026-03-01'),undefined);
  const expired=await prepare('ánh xạ hết hạn');await approve(expired,'Vgo',a.token,{effective_from:'2026-01-01',effective_to:'2026-01-31'});assert.equal((await resolve(expired,a.token,'2026-01-31')).code_status,'RESOLVED');assert.equal((await resolve(expired,a.token,'2026-02-01')).code_status,'EXPIRED_REVIEW');
 });
 await check('batch updates two existing exact decisions once and stale second rolls back everything',async()=>{
  const code='Vgo',x=await prepare('batch một'),y=await prepare('batch hai');const first=await approve(x,code),second=await approve(y,code);
  const ids=[first.result.results[0].decision_id,second.result.results[0].decision_id];assert.notEqual(ids[0],ids[1]);const before=await versions(ids);
  const make=async()=>{const bx=await mapping(x,code),by=await mapping(y,code);return{...bx,decision_id:undefined,template_product_id:undefined,expected_revision:undefined,source_fingerprint:undefined,rows:[{template_product_id:x,decision_id:bx.decision_id,expected_revision:bx.expected_revision,source_fingerprint:bx.source_fingerprint},{template_product_id:y,decision_id:by.decision_id,expected_revision:by.expected_revision,source_fingerprint:by.source_fingerprint}],reason:name('batch hai quyết định')};};
  const stale=await make();stale.rows[1].expected_revision-=1;const rejected=await call(prefix+'/batch-confirm',a.token,'POST',stale);assert.equal(rejected.status,409);assert.deepEqual(await versions(ids),before);assert.equal((await pool.query('select count(*)::int n from local_labor_mapping_receipts where idempotency_key=$1',[stale.idempotency_key])).rows[0].n,0);
  const body=await make(),saved=await must(prefix+'/batch-confirm',a.token,'POST',body);assert.deepEqual(saved.results.map(r=>r.decision_id).sort(),[...ids].sort());assert.ok(saved.results.every(r=>r.version===2));assert.deepEqual((await versions(ids)).filter(r=>r.version===1),before);
  const retry=await must(prefix+'/batch-confirm',a.token,'POST',body);assert.equal(retry.reused,true);assert.equal((await versions(ids)).length,4);
  await pool.query('update local_products set manager_id=$2 where id=$1',[y,b.id]);assert.equal((await call(prefix+'/batch-confirm',a.token,'POST',body)).status,404);assert.equal((await call(prefix+'/decisions/'+ids[1]+'/history',a.token)).status,404);assert.equal((await call(prefix+'/products/'+y,a.token)).status,404);assert.equal((await versions(ids)).length,4);
 });
 await check('global rule reanchor never returns former private template proof through history list or match',async()=>{
  const code='vgol',privateB=await prepare('PRIVATE-B-PROOF',b),privateA=await prepare('PRIVATE-A-PROOF',a);
  const uniqueWidth=String(1000+Number.parseInt(mark.slice(0,4),16)),privateValues={...technicalValues,material:'SILK',closure:'ZIPPER'};
  await technical(privateB,b.token,{finished_width:uniqueWidth,technical_values:privateValues});await classify(privateB,b.token);await technical(privateA,a.token,{finished_width:uniqueWidth,technical_values:privateValues});await classify(privateA,a.token);
  const cB=await resolve(privateB,b.token),baseBody=await mapping(privateB,code,b.token,{kind:'RULE',global:true,expected_revision:0,decision_id:undefined});
  baseBody.conditions={...Object.fromEntries(Object.entries({manufacturing_type:'PILLOW_CASE',...privateValues}).map(([k,v])=>[k,{op:'eq',value:v}])),width_mm:{op:'eq',value:cB.facts.width_mm}};
  const first=await must(prefix+'/decisions',admin,'POST',baseBody),decision=first.results[0].decision_id;
  const secondBody=await mapping(privateA,code,a.token,{kind:'RULE',global:true,decision_id:decision,expected_revision:1,conditions:baseBody.conditions});await must(prefix+'/decisions',admin,'POST',secondBody);
  const hist=await must(prefix+'/decisions/'+decision+'/history',a.token),list=await must(prefix+'/decisions',a.token),current=await resolve(privateA,a.token);
  assert.ok(hist.some(r=>r.version===2));assert.ok(!hist.some(r=>r.version===1));const selected=list.filter(r=>r.decision_id===decision);assert.ok(selected.some(r=>r.version===2));assert.ok(!selected.some(r=>r.version===1));
  const allowedName=(await pool.query('select name from local_products where id=$1',[privateA])).rows[0].name;
  for(const value of [hist,selected])assert.equal(value.find(r=>r.version===2).template_product_name,allowedName,'Only current in-scope template name is returned');
  for(const value of [hist,selected,current]){const serialized=JSON.stringify(value);assert.ok(!serialized.includes(privateB),'Private B UUID leaked');assert.ok(!serialized.includes(cB.source_fingerprint),'Private B fingerprint leaked');assert.ok(!serialized.includes('PRIVATE-B-PROOF'),'Private B name leaked');}
  assert.equal(current.code_status,'RESOLVED');assert.equal(current.match.decision_id,decision);for(const field of ['template_product_id','provenance','facts_fingerprint','context_fingerprint'])assert.ok(!(field in current.match),'Rule match exposed private template '+field);assert.equal(current.match.product_id,privateA);
 });
 await check('retiring rule from a different private product cannot disclose retirement proof',async()=>{
  const code='Vgo',privateA=await prepare('RETIRE-PRIVATE-A',a),privateB=await prepare('RETIRE-PRIVATE-B',b);
  const approval=await mapping(privateA,code,a.token,{kind:'RULE',global:true,expected_revision:0,decision_id:undefined});
  const created=await must(prefix+'/decisions',admin,'POST',approval),decision=created.results[0].decision_id,cB=await resolve(privateB,b.token);
  await must(prefix+'/decisions',admin,'POST',{kind:'RULE',global:true,template_product_id:privateB,decision_id:decision,expected_revision:1,source_fingerprint:cB.source_fingerprint,action:'RETIRE',effective_from:date,reason:name('ngừng rule bằng nguồn B riêng'),idempotency_key:key()});
  const hist=await must(prefix+'/decisions/'+decision+'/history',a.token),list=(await must(prefix+'/decisions',a.token)).filter(r=>r.decision_id===decision);
  const allowedName=(await pool.query('select name from local_products where id=$1',[privateA])).rows[0].name;
  for(const rows of [hist,list])for(const row of rows)assert.equal(row.template_product_name,allowedName,'Retire version must name only its readable template');
  for(const value of [hist,list]){const serialized=JSON.stringify(value);assert.ok(!serialized.includes(privateB),'Retirement source private B UUID leaked');assert.ok(!serialized.includes(cB.proof.raw_source_fingerprint),'Retirement source private B raw fingerprint leaked');assert.ok(!serialized.includes('RETIRE-PRIVATE-B'),'Retirement source private B name leaked');}
 });
}catch(error){evidence.failures.push({name:'setup-or-unhandled',error:error.stack});}
finally{
 try{await verifyFreeze();evidence.frozen_hashes_unchanged=true;}catch(error){evidence.frozen_hashes_unchanged=false;evidence.failures.push({name:'post-freeze',error:error.stack});}
 await pool.end();evidence.finished_at=new Date().toISOString();evidence.cleanup_scope='Held owned fixture retained; only new tester-tagged synthetic rows were added. No shared/business DB mutations.';
 const output=path.join(root,'.local-staging-runtime/item3-baseline/tester-api-supplement-'+mark+'.json');await writeFile(output,JSON.stringify(evidence,null,2));console.log(JSON.stringify({suite:'tester-independent-labor-api',passed:evidence.passed.length,failed:evidence.failures.length,evidence:output,failures:evidence.failures},null,2));
}
if(evidence.failures.length)process.exitCode=1;
