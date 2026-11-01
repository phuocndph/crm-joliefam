// Disposable non-superuser local API/DB; never reads .env or connects to hosted services.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {randomBytes,randomUUID,scryptSync} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';
import {tsImport} from 'tsx/esm/api';

const suffix=process.pid+'_'+Date.now(),database='product_technical_qa_'+suffix,role='product_technical_role_'+suffix;
const secret=randomBytes(24).toString('hex'),connectionString=`postgres://${role}:${secret}@127.0.0.1:16543/${database}`;
const control=sql=>{const r=spawnSync('docker',['exec','crm-joliefam-local-postgres','psql','-U','crm_local','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',sql],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error('Owned SQL control failed: '+r.stderr);return r.stdout;};
let api,pool,base,token,created=false,logs='',storage,holdManifest;
const key=()=>randomUUID(),passed=[],failures=[],holdRequested=process.env.PRODUCT_TECHNICAL_QA_HOLD==='1';
const call=async(route,method='GET',body,credential=token)=>{const r=await fetch(base+route,{method,headers:{origin:'https://crm.example.com',...(credential?{authorization:'Bearer '+credential}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return{status:r.status,body:await r.json().catch(()=>null)};};
const must=async(...args)=>{const r=await call(...args);assert.ok(r.status<300,JSON.stringify(r));return r.body;};
const denied=(r,status)=>assert.equal(r.status,status,JSON.stringify(r));
const check=async(name,fn)=>{try{await fn();passed.push(name);console.log('PASS '+name);}catch(e){failures.push({name,error:e.stack});console.log('FAIL '+name+': '+e.message);}};
const prefix='/api/product-technical-profiles';
try{
 storage=await mkdtemp(path.join(tmpdir(),'product-technical-owned-'));
 control(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${secret}'`);control(`create database ${database} owner ${role}`);created=true;
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));base='http://127.0.0.1:'+port;
 const guard='import net from "node:net";const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const value=args[0];const options=typeof value==="object"?value:{host:typeof args[1]==="string"?args[1]:"localhost"};if(options.host&&!new Set(["127.0.0.1","localhost","::1"]).has(options.host))throw new Error("QA denies remote sockets");return connect.apply(this,args)};globalThis.fetch=async()=>{throw new Error("QA denies outbound fetch")};';
 api=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(guard),'--import','tsx','server/index.ts'],{cwd:new URL('..',import.meta.url),windowsHide:true,detached:holdRequested,stdio:holdRequested?'ignore':['ignore','pipe','pipe'],env:{...Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),NODE_ENV:'production',PUBLIC_APP_URL:'https://crm.example.com',LOCAL_DATABASE_URL:connectionString,LOCAL_STORAGE_ROOT:storage,LOCAL_API_PORT:String(port),LOCAL_API_HOST:'127.0.0.1',LOCAL_SYNC_AUTO:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false',LOCAL_DEMO_AUTH:'false',LOCAL_INTEGRATION_API:'false'}});
 api.stdout?.on('data',x=>logs+=x);api.stderr?.on('data',x=>logs+=x);let ready=false;
 for(let n=0;n<160;n++){if(api.exitCode!==null)throw new Error('Owned API exited: '+logs.replaceAll(secret,'[redacted]'));try{if((await(await fetch(base+'/health')).json()).database===database){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'Owned API readiness');
 pool=new pg.Pool({connectionString});assert.equal((await pool.query('select current_database() db')).rows[0].db,database);assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,false);
 const actor=async(name,type='manager',assigned=null)=>{const id=key(),password='ProductFixtureOnly!222',salt=randomBytes(16).toString('hex'),email=name+'@technical.invalid';await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,email,`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);await pool.query('insert into local_user_roles(user_id,role,assigned_by)values($1,$2,$3)',[id,type,assigned]);await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'products',true)",[id]);return{id,email,password,token:(await must('/api/local-auth/login','POST',{email,password},null)).token};};
 const manager=await actor('manager'),other=await actor('other'),admin=await actor('admin','admin'),employee=await actor('employee','employee',manager.id);token=manager.token;
 const priceList=async(owner,name)=>{const id=key();await pool.query("insert into local_price_lists(id,name,year,status,manager_id,tenant_id)values($1,$2,2026,'active',$3,'default')",[id,name,owner]);return id;};
 const listA=await priceList(manager.id,'Bảng giá A'),listB=await priceList(other.id,'Bảng giá B');
 const product=async(name,extra={})=>{const id=key();await pool.query('insert into local_products(id,sku,name,category,manager_id,price_list_id,tenant_id,specifications,price,cost_price,description)values($1,$2,$3,$4,$5,$6,$7,$8,100,50,$9)',[id,extra.sku||key(),name,extra.category||name,extra.owner===undefined?manager.id:extra.owner,extra.list||null,extra.tenant||'default',extra.specifications||'160x200cm',extra.description||null]);return id;};
 const p=await product('Ga chun luồn chuẩn',{list:listA}),foreign=await product('Đệm ngoài phạm vi',{owner:other.id,list:listB}),shared=await product('Khăn dùng chung',{owner:null}),inherited=await product('Vỏ gối kế thừa',{owner:null,list:listA}),labor=await product('Áo gối khóa',{category:'Công may'}),duplicate=await product('Ga cùng mã',{sku:'DUPLICATE',list:listA}),duplicateB=await product('Đệm cùng mã',{sku:'DUPLICATE',list:listB,owner:other.id});
 const get=(id,credential=token)=>must(prefix+'/'+id,'GET',undefined,credential);
 const input=(detail,extra={})=>({expected_revision:detail.revision,source_fingerprint:detail.source_fingerprint,idempotency_key:key(),reason:'QA chuẩn hóa đặc điểm',action:'DRAFT',...extra});
 const save=(id,body,credential=token)=>call(prefix+'/'+id,'PUT',body,credential);
 const apply=async(id,extra={},credential=token)=>{const result=await save(id,input(await get(id,credential),extra),credential);assert.equal(result.status,200,JSON.stringify(result));return result.body;};
 const attrs=profile=>profile.extra_dimensions.technical_attributes;
 const history=id=>must(prefix+'/'+id+'/history');
 const supply='/api/product-supply-classifications';
 const supplyRow=async(id)=>(await must(supply+'?limit=100&search='+encodeURIComponent((await get(id)).product.name))).rows.find(row=>row.id===id);
 const confirmSupply=async(row,extra={})=>call(supply+'/confirm','POST',{rows:[{product_id:row.id,expected_revision:row.revision,source_fingerprint:row.source_fingerprint,route:row.suggestion.route,use_suggestion:true,...extra}],reason:'QA xác nhận cách đáp ứng',idempotency_key:key()});
 await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'bom_view',true),($1,'bom_manage',true)",[employee.id]);
 const {rawProductFingerprint,productDigest,rawProductSnapshot}=await tsImport('../server/product-catalog-snapshot.ts',import.meta.url);
 const {productSupplyFingerprint,suggestProductSupply}=await tsImport('../server/product-fulfillment-classification.ts',import.meta.url);
 const {validateTechnicalValues,applicableTechnicalFields}=await tsImport('../server/product-technical-schema.ts',import.meta.url);
 await check('pure absent confirmed basis remains byte-identical to V5 raw catalog fingerprint',async()=>{
  const raw={id:p,sku:'GA',name:'Ga',specifications:'160x200',manager_id:manager.id};
  assert.equal(productSupplyFingerprint(raw),productDigest(rawProductSnapshot(raw)));assert.equal(productSupplyFingerprint(raw),rawProductFingerprint(raw));
  assert.equal(productSupplyFingerprint({...raw,technical_confirmed_profile:{manufacturing_type:'UNKNOWN',extra_dimensions:{technical_attributes:{schema_version:1,values:{}}}}}),rawProductFingerprint(raw));
  for(const name of ['Khăn chần bông','Ruột gối chần bông'])assert.deepEqual(suggestProductSupply({name:name.normalize('NFD')}),suggestProductSupply({name}));
 });
 await check('schema preserves explicit UNKNOWN NO NOT_APPLICABLE and applicable elastic straps joining types',async()=>{
  const v=validateTechnicalValues('FITTED_SHEET',{joining:'YES',joining_detail:'TWO_SIDES',elastic:'YES',elastic_type:'LUON',straps:'NO'});
  assert.equal(v.quilting,'UNKNOWN');assert.equal(v.closure,'NOT_APPLICABLE');assert.equal(v.straps,'NO');assert.equal(v.elastic_type,'LUON');
  assert.ok(!applicableTechnicalFields('MATTRESS').some(f=>f.key==='elastic'));assert.ok(!applicableTechnicalFields('FITTED_SHEET',{elastic:'NO'}).some(f=>f.key==='elastic_type'));
  assert.throws(()=>validateTechnicalValues('MATTRESS',{elastic:'YES'}));assert.throws(()=>validateTechnicalValues('PILLOW_CASE',{joining:'MAYBE'}));assert.throws(()=>validateTechnicalValues('FITTED_SHEET',{forged:'YES'}));
 });
 await check('auth ownership labor exclusion shared read-only and admin catalog binding',async()=>{
  denied(await call(prefix+'/catalog','GET',undefined,null),401);denied(await call(prefix+'/catalog','GET',undefined,employee.token),403);
  denied(await call(prefix+'/'+p,'GET',undefined,employee.token),403);denied(await save(p,{},employee.token),403);
  denied(await call(prefix+'/'+foreign),404);denied(await call(prefix+'/'+labor),404);
  const rows=(await must(prefix+'/catalog')).rows;assert.ok(!rows.some(x=>[foreign,labor,duplicateB].includes(x.id)));assert.ok(rows.some(x=>x.id===inherited));
  assert.equal((await get(shared)).read_only,true);denied(await save(shared,input(await get(shared))),403);
  assert.ok((await must(prefix+'/catalog','GET',undefined,admin.token)).rows.some(x=>x.id===foreign));
 });
 await check('paged server search covers products beyond 500 with accent and d-stroke equivalence',async()=>{
  await pool.query("insert into local_products(sku,name,category,manager_id,tenant_id)select 'PAGE-'||n,'Hàng kiểm thử '||lpad(n::text,4,'0'),'QA',$1,'default' from generate_series(1,510)n",[manager.id]);
  const tail=await product('ZZ Đệm đặc điểm cuối danh mục');
  const first=await must(prefix+'/catalog?limit=100'),last=await must(prefix+'/catalog?limit=100&offset=500');assert.ok(first.total>500);assert.ok(last.rows.some(x=>x.id===tail));
  const plain=await must(prefix+'/catalog?search=dem%20dac%20diem'),accented=await must(prefix+'/catalog?search='+encodeURIComponent('đệm đặc điểm'));assert.deepEqual(plain.rows,accented.rows);assert.equal(plain.rows[0].id,tail);
  denied(await call(prefix+'/catalog?limit=101'),400);denied(await call(prefix+'/catalog?offset=-1'),400);
 });
 await check('blank partial draft has null dimensions and no inferred family or technical facts',async()=>{
  const before=await get(p);assert.equal(before.status,'EMPTY');const result=await apply(p);assert.equal(result.profile.manufacturing_type,'UNKNOWN');
  for(const field of ['finished_width','finished_length','finished_height'])assert.equal(result.profile[field],null);
  assert.equal(result.status,'DRAFT');assert.ok(Object.values(attrs(result.profile).values).every(v=>v==='NOT_APPLICABLE'));
  assert.equal((await get(p)).code_readiness,'NOT_EVALUATED');
 });
 await check('positive dimensions units enum validation and unsupported metadata writes roll back',async()=>{
  const before=await get(p);for(const bad of [{finished_width:0},{finished_length:-1},{finished_height:'1.00001'},{finished_width:'Infinity'},{dimension_unit:'INCH'},{manufacturing_type:'INVENTED'},{technical_values:[]},{extra_dimensions:[]},{confirmed_version:999}])denied(await save(p,input(before,bad)),400);
  assert.equal((await get(p)).revision,before.revision);
  const valid=await apply(p,{manufacturing_type:'FITTED_SHEET',finished_width:'160.125',finished_length:'200',finished_height:'25',technical_values:{elastic:'YES',elastic_type:'LUON',straps:'NO',joining:'NO'}});
  assert.equal(valid.profile.finished_width,160.125);assert.equal(attrs(valid.profile).values.joining_detail,'NOT_APPLICABLE');
 });
 await check('facts confirmation is audited but explicitly not labor-code readiness',async()=>{
  const saved=await apply(p,{action:'CONFIRM'});assert.equal(saved.status,'CONFIRMED');assert.equal(attrs(saved.profile).confirmed_version,saved.revision);
  const detail=await get(p);assert.equal(detail.code_readiness,'NOT_EVALUATED');assert.equal(detail.profile.finished_height,25);
  const h=await history(p);assert.equal(h[0].action,'CONFIRM');assert.equal(h[0].snapshot.extra_dimensions.technical_attributes.status,'CONFIRMED');
 });
 let legacyId,legacyProfile;
 await check('legacy imported canonical profile remains readable unconfirmed without a second master',async()=>{
  legacyId=await product('Vỏ gối hồ sơ cũ');const id=key();legacyProfile={id,product_id:legacyId,manufacturing_type:'PILLOW_CASE',finished_width:40,finished_length:60,finished_height:null,dimension_unit:'CM',is_active:true,extra_dimensions:{flap:20,vendor:{source:'legacy',raw:[1,'giữ nguyên']}},default_bom_id:key(),default_cutting_profile_id:key(),legacy_note:'Giữ nguyên dữ liệu cũ'};
  await pool.query("insert into local_manufacturing_records(id,record_type,product_id,status,payload,is_snapshot_record)values($1,'manufacturing_profile',$2,'ACTIVE',$3::jsonb,true)",[id,legacyId,JSON.stringify(legacyProfile)]);
  const detail=await get(legacyId);assert.equal(detail.status,'LEGACY_UNCONFIRMED');assert.equal(detail.revision,0);assert.deepEqual(detail.profile,legacyProfile);
  const old=await must('/api/manufacturing/products/'+legacyId+'/profile');assert.equal(old._revision,0);assert.equal(old.id,id);assert.equal((await must('/api/manufacturing/products/'+legacyId+'/profile','GET',undefined,employee.token)).id,id);
 });
 await check('legacy writer requires revision and merges dimensions without erasing extras defaults or provenance',async()=>{
  const route='/api/manufacturing/products/'+legacyId+'/profile',old=await must(route);
  denied(await call(route,'PUT',{finished_width:41,finished_length:61,dimension_unit:'CM'}),409);
  const saved=await must(route,'PUT',{_revision:old._revision,_source_fingerprint:old._source_fingerprint,idempotency_key:key(),reason:'Sửa kích thước hồ sơ cũ',finished_width:41,finished_length:61});
  assert.equal(saved.id,legacyProfile.id);assert.equal(saved.default_bom_id,legacyProfile.default_bom_id);assert.equal(saved.default_cutting_profile_id,legacyProfile.default_cutting_profile_id);assert.equal(saved.legacy_note,legacyProfile.legacy_note);
  assert.deepEqual(saved.extra_dimensions.vendor,legacyProfile.extra_dimensions.vendor);assert.equal(saved.extra_dimensions.flap,20);assert.equal(saved._technical_status,'DRAFT');
  const stored=(await pool.query('select is_snapshot_record,local_modified_at from local_manufacturing_records where id=$1',[saved.id])).rows[0];assert.equal(stored.is_snapshot_record,true);assert.ok(stored.local_modified_at);
  assert.equal((await pool.query('select count(*)::int n from local_manufacturing_records where product_id=$1 and record_type=\'manufacturing_profile\'',[legacyId])).rows[0].n,1);
 });
 await check('legacy cannot forge technical namespace or erase confirmed fields and all edits share revision',async()=>{
  await apply(legacyId,{action:'CONFIRM',technical_values:{pillow_subtype:'BOLSTER',closure:'ENVELOPE',joining:'NO'}});
  const old=await must('/api/manufacturing/products/'+legacyId+'/profile'),before=attrs(old);
  const body={_revision:old._revision,_source_fingerprint:old._source_fingerprint,idempotency_key:key(),reason:'Sửa hồ sơ qua giao diện cũ'};
  denied(await call('/api/manufacturing/products/'+legacyId+'/profile','PUT',{...body,extra_dimensions:{technical_attributes:{...before,confirmed_version:100}}}),400);
  denied(await call('/api/manufacturing/products/'+legacyId+'/profile','PUT',{...body,technical_values:{closure:'ZIPPER'}}),400);
  const next=await must('/api/manufacturing/products/'+legacyId+'/profile','PUT',{...body,finished_width:42,extra_dimensions:{flap:21}});
  assert.equal(next._revision,old._revision+1);assert.equal(attrs(next).values.pillow_subtype,'BOLSTER');assert.equal(attrs(next).status,'DRAFT');assert.equal(attrs(next).confirmed_version,before.confirmed_version);
  assert.deepEqual(next.extra_dimensions.vendor,legacyProfile.extra_dimensions.vendor);assert.equal(next.default_bom_id,legacyProfile.default_bom_id);
 });
 await check('append-only audit and receipt rows cannot be rewritten or deleted',async()=>{
  await assert.rejects(pool.query('update local_product_technical_versions set reason=$1 where product_id=$2',['forged',p]),/chỉ được bổ sung/);
  await assert.rejects(pool.query('delete from local_product_technical_versions where product_id=$1',[p]),/chỉ được bổ sung/);
  await assert.rejects(pool.query('delete from local_product_technical_receipts'),/chỉ được bổ sung/);
 });
 await check('legacy scalar or array extras fail safely without losing payload audit or receipts',async()=>{
  for(const extra_dimensions of [[{legacy_dimension:12}],'legacy notes',42,false]){
   const id=await product('Hồ sơ kiểu cũ cần kiểm tra'),profileId=key(),payload={manufacturing_type:'FITTED_SHEET',finished_width:160,finished_length:200,dimension_unit:'CM',extra_dimensions};
   await pool.query("insert into local_manufacturing_records(id,record_type,product_id,payload)values($1,'manufacturing_profile',$2,$3::jsonb)",[profileId,id,JSON.stringify(payload)]);
   const before=(await pool.query('select * from local_manufacturing_records where id=$1',[profileId])).rows[0],d=await get(id),receipts=(await pool.query('select count(*)::int n from local_product_technical_receipts')).rows[0].n;
   denied(await save(id,input(d)),409);denied(await call('/api/manufacturing/products/'+id+'/profile','PUT',input(d,{finished_width:161})),409);
   assert.deepEqual((await pool.query('select * from local_manufacturing_records where id=$1',[profileId])).rows[0],before);assert.equal((await history(id)).length,0);assert.equal((await pool.query('select count(*)::int n from local_product_technical_receipts')).rows[0].n,receipts);
  }
 });
 await check('legacy claimed confirmation without exact audited proof is never trusted or propagated',async()=>{
  const id=await product('Ga namespace cũ chưa chứng minh'),d=await get(id),profileId=key(),values=validateTechnicalValues('FITTED_SHEET',{});
  await pool.query("insert into local_manufacturing_records(id,record_type,product_id,payload)values($1,'manufacturing_profile',$2,$3::jsonb)",[profileId,id,JSON.stringify({manufacturing_type:'FITTED_SHEET',finished_width:160,finished_length:200,finished_height:null,dimension_unit:'CM',is_active:true,extra_dimensions:{technical_attributes:{schema_version:1,status:'CONFIRMED',confirmed_version:1,confirmed_raw_source_fingerprint:d.source_fingerprint,values}}})]);
  assert.equal((await get(id)).status,'LEGACY_UNCONFIRMED');const body=input(await get(id));const saved=await must('/api/manufacturing/products/'+id+'/profile','PUT',body);assert.equal(saved._technical_status,'DRAFT');
  await apply(id,{action:'CONFIRM'});assert.equal((await get(id)).status,'CONFIRMED');
  // Tamper only a synthetic legacy payload to prove audit/facts mismatch is detected.
  await pool.query("update local_manufacturing_records set payload=jsonb_set(payload,'{finished_width}','999'::jsonb) where id=$1",[profileId]);assert.equal((await get(id)).status,'LEGACY_UNCONFIRMED');
  const old=await get(id);const changed=await must('/api/manufacturing/products/'+id+'/profile','PUT',input(old));assert.equal(changed._technical_status,'DRAFT');
 });
 await check('lost response same-key retry creates exactly one version and changed body or actor fails',async()=>{
  const initial=await get(p),body=input(initial,{finished_width:'161'}),first=await save(p,body),retry=await save(p,body);assert.equal(first.status,200);assert.equal(retry.status,200);assert.equal(retry.body.reused,true);assert.equal(retry.body.revision,initial.revision+1);
  denied(await save(p,{...body,finished_width:'162'}),409);denied(await save(p,body,admin.token),409);
  assert.equal((await get(p)).revision,initial.revision+1);
 });
 await check('concurrent editors cannot overwrite or append duplicate versions',async()=>{
  const d=await get(p),a=input(d,{finished_width:'162'}),b=input(d,{finished_width:'163'});const results=await Promise.all([save(p,a),save(p,b)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await get(p)).revision,d.revision+1);
 });
 await check('raw catalog changes make confirmed facts review and stale save fails without partial audit',async()=>{
  await apply(p,{action:'CONFIRM'});const d=await get(p),before=(await history(p)).length;
  await pool.query("update local_products set specifications='180x200cm' where id=$1",[p]);denied(await save(p,input(d,{finished_width:180})),409);
  assert.equal((await get(p)).status,'REVIEW');assert.equal((await history(p)).length,before);await apply(p,{action:'CONFIRM'});
 });
 await check('confirmed critical basis invalidates make buy without rewriting route or history',async()=>{
  const id=await product('Ruột chăn Microfiber mỏng');let row=await supplyRow(id);assert.equal((await confirmSupply(row)).status,200);const before=await must(supply+'/'+id+'/history');
  await apply(id,{action:'CONFIRM',manufacturing_type:'DUVET_INSERT',technical_values:{material:'MICROFIBER',microfiber_weight:'THIN',joining:'NO'}});
  row=await supplyRow(id);assert.equal(row.route,'SEW');assert.equal(row.status,'REVIEW');assert.deepEqual(await must(supply+'/'+id+'/history'),before);assert.equal((await confirmSupply(row)).status,200);
  const fp=(await supplyRow(id)).source_fingerprint;
  await apply(id,{action:'CONFIRM',finished_width:'160',finished_length:'200'});assert.equal((await supplyRow(id)).source_fingerprint,fp);assert.equal((await supplyRow(id)).status,'CONFIRMED');
  await apply(id,{action:'DRAFT',technical_values:{material:'COTTON',joining:'NO'}});assert.equal((await supplyRow(id)).source_fingerprint,fp);
  await apply(id,{action:'CONFIRM'});row=await supplyRow(id);assert.notEqual(row.source_fingerprint,fp);assert.equal(row.status,'REVIEW');assert.equal(row.route,'SEW');
 });
 await check('structured type material conflict blocks auto suggestion while explicit manual reason remains allowed',async()=>{
  const id=await product('Ruột chăn 10OZ đối chiếu');await apply(id,{action:'CONFIRM',manufacturing_type:'DUVET_INSERT',technical_values:{material:'MICROFIBER',microfiber_weight:'THICK'}});
  const row=await supplyRow(id);assert.equal(row.suggestion.route,'UNCLASSIFIED');assert.equal(row.suggestion.requires_split,false);assert.match(row.suggestion.reason,/mâu thuẫn/);
  denied(await confirmSupply(row,{route:'PURCHASE'}),409);assert.equal((await confirmSupply(row,{route:'SEW',use_suggestion:false})).status,200);
 });
 await check('product identity wins over duplicate SKU and actual parent ownership is rechecked before replay',async()=>{
  await apply(duplicate,{manufacturing_type:'FITTED_SHEET'});assert.equal((await get(duplicateB,admin.token)).revision,0);
  const d=await get(inherited),body=input(d);assert.equal((await save(inherited,body)).status,200);
  await pool.query('update local_price_lists set manager_id=$2 where id=$1',[listA,other.id]);denied(await save(inherited,body),404);denied(await call(prefix+'/'+inherited+'/history'),404);
  assert.equal((await get(p)).product.id,p);await pool.query('update local_price_lists set manager_id=$2 where id=$1',[listA,manager.id]);
  assert.equal((await apply(shared,{manufacturing_type:'TOWEL'},admin.token)).status,'DRAFT');
 });
 await check('generic profile aliases cannot read or write a shadow master or technical history',async()=>{
  for(const route of ['/api/local-snapshot/product_manufacturing_profiles','/api/local-table/local_manufacturing_profiles','/api/local-table/local_manufacturing_records','/api/local-rpc/upsert_product_technical_profiles','/api/local-functions/save_manufacturing_profile','/api/local-snapshot/local_product_technical_versions']){
   denied(await call(route,'GET',undefined,admin.token),403);denied(await call(route,'POST',{technical_attributes:{status:'CONFIRMED'}},admin.token),403);
  }
 });
 await check('inactive profile is explicit and requires an intentional activation change preserving identity',async()=>{
  const id=await product('Ga hồ sơ ngừng dùng'),profileId=key();await pool.query("insert into local_manufacturing_records(id,record_type,product_id,status,payload)values($1,'manufacturing_profile',$2,'ACTIVE',$3::jsonb)",[profileId,id,JSON.stringify({manufacturing_type:'FITTED_SHEET',is_active:false,finished_width:160,finished_length:200,dimension_unit:'CM'})]);
  assert.equal((await get(id)).status,'INACTIVE');assert.equal((await apply(id,{action:'CONFIRM'})).status,'INACTIVE');assert.equal((await get(id)).profile.is_active,false);
  const active=await apply(id,{is_active:true,reason:'Quản lý bật dùng lại hồ sơ'});assert.equal(active.profile.id,profileId);assert.equal(active.profile.is_active,true);assert.equal((await history(id)).length,2);
 });
 await check('duplicate active canonical profile is refused at database layer without replacing original',async()=>{
  const before=(await get(p)).profile;await assert.rejects(pool.query("insert into local_manufacturing_records(id,record_type,product_id,payload)values($1,'manufacturing_profile',$2,'{}'::jsonb)",[key(),p]),/nhiều hồ sơ/);assert.deepEqual((await get(p)).profile,before);
 });
 await check('source sync preserves local technical profile and audit while surfacing raw source review',async()=>{
  const id=await product('Vỏ gối nguồn đồng bộ');await apply(id,{action:'CONFIRM',manufacturing_type:'PILLOW_CASE',finished_width:'40',finished_length:'60',technical_values:{pillow_subtype:'BOLSTER'}});
  const before=await get(id),h=await history(id),payload={id,sku:before.product.sku,name:'Vỏ gối nguồn đã đổi',category:'Vỏ gối',specifications:'50x70',manager_id:manager.id,tenant_id:'default',price:200,cost_price:60,is_active:true,created_at:'2026-10-28T00:00:00Z',updated_at:'2026-10-28T00:00:00Z'};
  await pool.query("insert into local_source_snapshots(source_table,source_key,source_hash,payload)values('products',$1,'technical-sync',$2::jsonb)",[id,JSON.stringify(payload)]);
  const {refreshCanonicalProjections}=await import('./sync-supabase-to-local.mjs');await refreshCanonicalProjections(pool);
  const after=await get(id);assert.equal(after.status,'REVIEW');assert.deepEqual(after.profile,before.profile);assert.deepEqual(await history(id),h);
 });
 await check('live cutting reads same canonical dimensions while released material snapshots remain immutable',async()=>{
  const id=await product('Ga thử định mức cắt');await apply(id,{action:'CONFIRM',manufacturing_type:'FITTED_SHEET',finished_width:'100',finished_length:'200'});
  const cutting=await must('/api/manufacturing/cutting-profiles/drafts','POST',{product_id:id,code:'QA-CUT-'+key(),name:'Định mức kiểm thử',configuration:{calculation_strategy:'GRID',effective_from:'2026-01-01',piece_width_rule:'FINISHED_WIDTH',piece_length_rule:'FINISHED_LENGTH',pieces_per_product:1,default_fabric_width_cm:200,pattern_direction:'NONE',allow_rotation:false,requires_matching_pattern:false,standard_waste_rate:0,issue_rounding_increment:0.1}});
  await must('/api/manufacturing/cutting-versions/'+cutting.version.id+'/approve','POST',{reason:'Duyệt cấu hình kiểm thử độc lập'});
  const calculate=()=>must('/api/manufacturing/cutting-versions/'+cutting.version.id+'/calculate','POST',{quantity:2});const before=await calculate();assert.equal(before.final_issue_recommendation_m,2);
  const material=await must('/api/inventory/items','POST',{code:'TECH-'+key(),name:'Vải kiểm thử riêng',item_type:'RAW_MATERIAL',base_unit:'METER'},admin.token),orderId=key();
  await pool.query("insert into local_production_orders(id,production_order_number,production_batch_number,product_id,quantity_planned,status,released_at,cutting_params_snapshot)values($1,$2,$2,$3,2,'RELEASED',now(),$4::jsonb)",[orderId,'TECH-REL-'+key(),id,JSON.stringify({profile:before,technical:(await get(id)).profile})]);
  await pool.query("insert into local_production_order_material_requirements(production_order_id,inventory_item_id,planned_quantity,unit,cutting_profile_version_id,calculation_details)values($1,$2,2,'METER',$3,$4::jsonb)",[orderId,material.id,cutting.version.id,JSON.stringify(before)]);
  const snapshots=async()=>({order:(await pool.query('select * from local_production_orders where id=$1',[orderId])).rows,requirements:(await pool.query('select * from local_production_order_material_requirements where production_order_id=$1',[orderId])).rows});const frozen=await snapshots();
  await apply(id,{action:'CONFIRM',finished_length:'300'});assert.equal((await calculate()).final_issue_recommendation_m,3);assert.deepEqual(await snapshots(),frozen);
  await apply(id,{finished_width:null});const missing=await call('/api/manufacturing/cutting-versions/'+cutting.version.id+'/calculate','POST',{quantity:2});denied(missing,400);assert.match(missing.body.message,/kích thước hợp lệ/);assert.deepEqual(await snapshots(),frozen);
 });
 await check('profile edits have no inventory payroll financial or catalog side effects',async()=>{
  const state=async()=>(await pool.query("select jsonb_build_object('inventory',(select jsonb_agg(to_jsonb(x))from local_inventory_movements x),'payroll',(select jsonb_agg(to_jsonb(x))from local_production_entries x),'products',(select jsonb_agg(jsonb_build_array(id,price,cost_price,local_modified_at)order by id)from local_products)) state")).rows[0].state;
  const before=await state();await apply(p,{action:'CONFIRM',technical_values:{elastic:'YES',elastic_type:'VIEN',straps:'NO',joining:'YES',joining_detail:'ONE_SIDE',quilting:'NO'}});assert.deepEqual(await state(),before);
 });
 console.log(JSON.stringify({suite:'product-technical-profile-item2',passed:passed.length,failed:failures.length,failures},null,2));if(failures.length)process.exitCode=1;
 if(holdRequested&&failures.length===0){holdManifest=path.join(storage,'owned-qa-manifest.json');await writeFile(holdManifest,JSON.stringify({synthetic:true,owned_test_only:true,database,role,connectionString,api_pid:api.pid,apiOrigin:base,base,publicAppUrl:'https://crm.example.com',storage,credentials:{email:admin.email,password:admin.password},manager:{email:manager.email,password:manager.password},cleanup:'Stop owned api_pid; drop owned database with force; drop owned role; remove verified temp storage directory.'},null,2));console.log('HOLD owned fixture manifest: '+holdManifest);api.unref();}
}finally{
 if(holdManifest){await pool?.end();console.log('HOLD test-owned resources retained for parent UI verification');}
 else{if(api&&api.exitCode===null){api.kill();await Promise.race([once(api,'exit'),new Promise(r=>setTimeout(r,5000))]);}await pool?.end();if(created)control(`drop database ${database} with (force)`);control(`drop role if exists ${role}`);if(storage){assert.equal(path.dirname(path.resolve(storage)),path.resolve(tmpdir()));assert.ok(path.basename(storage).startsWith('product-technical-owned-'));await rm(storage,{recursive:true,force:true});}assert.ok(!logs.includes(secret));console.log('CLEANUP owned technical API database role and files removed');}
}
