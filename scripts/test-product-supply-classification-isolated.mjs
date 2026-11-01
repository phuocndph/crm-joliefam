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

const suffix=process.pid+'_'+Date.now(),database='product_classification_qa_'+suffix,role='product_classification_role_'+suffix;
const secret=randomBytes(24).toString('hex'),connectionString=`postgres://${role}:${secret}@127.0.0.1:16543/${database}`;
const control=sql=>{const r=spawnSync('docker',['exec','crm-joliefam-local-postgres','psql','-U','crm_local','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',sql],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error('Owned SQL control failed: '+r.stderr);return r.stdout;};
let api,pool,base,token,created=false,logs='',storage,holdManifest;
const key=()=>randomUUID(),passed=[],failures=[],holdRequested=process.env.PRODUCT_CLASSIFICATION_QA_HOLD==='1';
const call=async(route,method='GET',body,credential=token)=>{const r=await fetch(base+route,{method,headers:{origin:'https://crm.example.com',...(credential?{authorization:'Bearer '+credential}:{}),...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return{status:r.status,body:await r.json().catch(()=>null)};};
const must=async(...args)=>{const r=await call(...args);assert.ok(r.status<300,JSON.stringify(r));return r.body;};
const denied=(r,status)=>assert.equal(r.status,status,JSON.stringify(r));
const check=async(name,fn)=>{try{await fn();passed.push(name);console.log('PASS '+name);}catch(e){failures.push({name,error:e.stack});console.log('FAIL '+name+': '+e.message);}};
const prefix='/api/product-supply-classifications';
try{
 storage=await mkdtemp(path.join(tmpdir(),'product-classification-owned-'));
 control(`create role ${role} login nosuperuser nocreatedb nocreaterole password '${secret}'`);control(`create database ${database} owner ${role}`);created=true;
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));base='http://127.0.0.1:'+port;
 const guard='import net from "node:net";const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const value=args[0];const options=typeof value==="object"?value:{host:typeof args[1]==="string"?args[1]:"localhost"};if(options.host&&!new Set(["127.0.0.1","localhost","::1"]).has(options.host))throw new Error("QA denies remote sockets");return connect.apply(this,args)};globalThis.fetch=async()=>{throw new Error("QA denies outbound fetch")};';
 api=spawn(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(guard),'--import','tsx','server/index.ts'],{cwd:new URL('..',import.meta.url),windowsHide:true,detached:holdRequested,stdio:holdRequested?'ignore':['ignore','pipe','pipe'],env:{...Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),NODE_ENV:'production',PUBLIC_APP_URL:'https://crm.example.com',LOCAL_DATABASE_URL:connectionString,LOCAL_STORAGE_ROOT:storage,LOCAL_API_PORT:String(port),LOCAL_API_HOST:'127.0.0.1',LOCAL_SYNC_AUTO:'false',LOCAL_AUTH_SUPABASE_BRIDGE:'false',LOCAL_DEMO_AUTH:'false',LOCAL_INTEGRATION_API:'false'}});
 api.stdout?.on('data',x=>logs+=x);api.stderr?.on('data',x=>logs+=x);let ready=false;
 for(let n=0;n<160;n++){if(api.exitCode!==null)throw new Error('Owned API exited: '+logs.replaceAll(secret,'[redacted]'));try{if((await(await fetch(base+'/health')).json()).database===database){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'Owned API readiness');
 pool=new pg.Pool({connectionString});assert.equal((await pool.query('select current_database() db')).rows[0].db,database);assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,false);
 const actor=async(name,type='manager',assigned=null)=>{const id=key(),password='ProductFixtureOnly!222',salt=randomBytes(16).toString('hex'),email=name+'@classification.invalid';await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,email,`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);await pool.query('insert into local_user_roles(user_id,role,assigned_by)values($1,$2,$3)',[id,type,assigned]);await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'products',true)",[id]);return{id,email,password,token:(await must('/api/local-auth/login','POST',{email,password},null)).token};};
 const manager=await actor('manager'),other=await actor('other'),admin=await actor('admin','admin'),employee=await actor('employee','employee',manager.id);token=manager.token;
 const priceList=async(owner,name)=>{const id=key();await pool.query("insert into local_price_lists(id,name,year,status,manager_id,tenant_id)values($1,$2,2026,'active',$3,'default')",[id,name,owner]);return id;};
 const listA=await priceList(manager.id,'Bảng giá A'),listB=await priceList(other.id,'Bảng giá B');
 const product=async(name,extra={})=>{const id=key();await pool.query('insert into local_products(id,sku,name,category,manager_id,price_list_id,tenant_id,specifications,price,cost_price,description)values($1,$2,$3,$4,$5,$6,$7,$8,100,50,$9)',[id,extra.sku||key(),name,extra.category||name,extra.owner===undefined?manager.id:extra.owner,extra.list||null,extra.tenant||'default',extra.specifications||'160x200cm',extra.description||null]);return id;};
 const p=await product('Ga chun luồn',{list:listA}),foreign=await product('Đệm ngoài phạm vi',{owner:other.id,list:listB}),shared=await product('Khăn dùng chung',{owner:null}),inherited=await product('Vỏ gối kế thừa',{owner:null,list:listA}),conflict=await product('Ga chủ khác bảng giá',{owner:other.id,list:listA}),labor=await product('Áo gối khóa',{category:'Công may'}),duplicate=await product('Ga cùng mã',{sku:'DUPLICATE',list:listA}),duplicateB=await product('Đệm cùng mã',{sku:'DUPLICATE',list:listB,owner:other.id}),combo=await product('Bộ ga + ruột chăn 10OZ');
 const list=async(credential=token,query='')=>must(prefix+query,'GET',undefined,credential);
 const find=async(id,credential=token)=>(await list(credential)).rows.find(row=>row.id===id);
 const input=row=>({product_id:row.id,expected_revision:row.revision,source_fingerprint:row.source_fingerprint,route:row.suggestion.route,use_suggestion:true});
 const confirm=async(rows,extra={},credential=token)=>call(prefix+'/confirm','POST',{rows,reason:'QA xác nhận phân loại',idempotency_key:key(),...extra},credential);
 const {suggestProductSupply,productSupplyFingerprint}=await tsImport('../server/product-fulfillment-classification.ts',import.meta.url);
 await check('rules cover user families with exceptions and no SKU substitution',async()=>{
  const cases=[['Vỏ chăn','SEW'],['Ga chun luồn','SEW'],['Vỏ gối ôm','SEW'],['Ruột chăn Microfiber mỏng','SEW'],['Ruột chăn Microfiber dày','SEW'],['Ruột chăn 10OZ','PURCHASE'],['Ruột chăn 6OZ','PURCHASE'],['Ruột chăn đông 3D','PURCHASE'],['Ruột gối bông 3D','PURCHASE'],['Đệm lò xo','PURCHASE'],['Khăn dệt logo','PURCHASE'],['Khăn trang trí giường','PURCHASE'],['Divang','PURCHASE'],['Divan ASLING','PURCHASE'],['Bảo vệ nệm','UNCLASSIFIED'],['Topper','UNCLASSIFIED'],['Mặt hàng chưa rõ','UNCLASSIFIED'],['Bộ chăn ga','SEW']];
  for(const [name,route]of cases)assert.equal(suggestProductSupply({name}).route,route,name);
  for(const name of ['Bộ ga + ruột chăn 10OZ','Bộ vỏ chăn + ruột gối 3D','Combo ga và đệm','Bộ ruột chăn Microfiber và ruột gối 3D'])assert.equal(suggestProductSupply({name}).requires_split,true,name);
  assert.equal(suggestProductSupply({name:'Vỏ chăn',category:'Ruột chăn'}).route,'UNCLASSIFIED');
  assert.equal(suggestProductSupply({name:'Không rõ',sku:'GA-001'}).route,'UNCLASSIFIED');
 });
 await check('review regressions distinguish inner components, contradictory fields and description composition',async()=>{
  const mixedNames=['Bộ ruột chăn Microfiber + ruột gối bông thường','Bộ ruột chăn Microfiber + ruột gối lông vũ','Bộ ruột chăn Microfiber + ruột gối','Bộ ruột chăn Microfiber + ruột chăn lụa'];
  for(const name of mixedNames){const suggestion=suggestProductSupply({name});assert.equal(suggestion.route,'UNCLASSIFIED',name);assert.equal(suggestion.requires_split,true,name);}
  for(const row of [{name:'Bộ chăn ga',category:'Bộ nhập'},{name:'Ga chun',category:'Đệm bông ép'},{name:'Ruột chăn10OZ',category:'Ruột chăn Microfiber'},{name:'Ruột chăn 10OZ',category:'Ruột chăn Microfiber'},{name:'Vỏ chăn',category:'Ruột chăn'}])assert.equal(suggestProductSupply(row).route,'UNCLASSIFIED',JSON.stringify(row));
  const descriptionMixed={name:'Bộ chăn ga',description:'Gồm ga, vỏ gối và đệm lò xo'};assert.equal(suggestProductSupply(descriptionMixed).requires_split,true);
  assert.equal(suggestProductSupply({name:'Ruột chăn Microfiber mỏng',category:'Ruột chăn'}).route,'SEW');
  assert.equal(suggestProductSupply({name:'Ga chun',description:'Dùng với đệm lò xo, bảo quản nơi thoáng'}).route,'SEW');
  for(const row of [{name:'Bộ ga và vỏ chăn',description:'Kèm ruột chăn 10OZ'},{name:'Bộ chăn ga',specifications:'Gồm ga,vỏ gối và đệm lò xo'},{name:'Ga + ruột chăn10OZ'},{name:'Ruột chăn Microfiber + ruột gối bông thường'}]){const suggestion=suggestProductSupply(row);assert.equal(suggestion.route,'UNCLASSIFIED',JSON.stringify(row));assert.equal(suggestion.requires_split,true,JSON.stringify(row));}
 });
 await check('usage references and Vietnamese quilting never force a single physical item to split',async()=>{
  for(const name of ['Bảo vệ nệm chần bông','Tấm bảo vệ đệm chần bông']){const suggestion=suggestProductSupply({name});assert.equal(suggestion.route,'UNCLASSIFIED',name);assert.equal(suggestion.requires_split,false,name);}
  for(const name of ['Ga tấm phủ T200 trơn190x280 (dùng cho đệm1m)','Ga tấm phủ180x260(dùng cho đệm1m)','Ga chun dành cho đệm1m6','Ga tấm phủ dùng với đệm lòxo','Ga chun phù hợp với đệm bông ép']){const suggestion=suggestProductSupply({name});assert.equal(suggestion.route,'SEW',name);assert.equal(suggestion.requires_split,false,name);}
  assert.equal(suggestProductSupply({name:'Ruột gối chần bông'}).route,'PURCHASE');assert.equal(suggestProductSupply({name:'Ruột gối chần bông'}).requires_split,false);
  for(const name of ['Khăn chần bông','Ruột gối chần bông'])assert.deepEqual(suggestProductSupply({name:name.normalize('NFD')}),suggestProductSupply({name}));
  assert.equal(suggestProductSupply({name:'Khăn chần bông'}).route,'PURCHASE');assert.equal(suggestProductSupply({name:'Khăn chần bông'}).requires_split,false);
  assert.equal(suggestProductSupply({name:'Chân giường gỗ'}).route,'UNCLASSIFIED');assert.equal(suggestProductSupply({name:'Chăn hè chần bông'}).route,'SEW');
  assert.equal(suggestProductSupply({name:'Ruột chăn Microfiber dùng cho đệm'}).route,'SEW');
  assert.equal(suggestProductSupply({name:'Bộ ga và vỏ gối',specifications:'Gồm ga dùng cho đệm1m, vỏ gối'}).requires_split,false);
  assert.equal(suggestProductSupply({name:'Bộ ga và vỏ gối',specifications:'Gồm ga dùng cho đệm1m, kèm ruột chăn10OZ'}).requires_split,true);
  for(const name of ['Bộ ga kèm đệm','Combo ga với đệm','Bảo vệ nệm chần bông + vỏ chăn + ruột gối bông thường','Ga dùng cho đệm1m + ruột chăn10OZ','Ga dùng cho đệm1m, kèm ruột gối3D'])assert.equal(suggestProductSupply({name}).requires_split,true,name);
 });
 await check('usage stripping retains textual next components and reviews ambiguous alternative targets',async()=>{
  for(const name of ['Bộ ga dùng cho đệm kèm ruột chăn10OZ','Ga dành cho đệm1m kèm ruột gối bông thường','Bộ ga dùng cho đệm1m và khăn','Ga dùng cho đệm1m và khăn'])assert.equal(suggestProductSupply({name}).requires_split,true,name);
  for(const field of ['description','specifications'])assert.equal(suggestProductSupply({name:'Bộ ga và vỏ gối',[field]:'Gồm ga dùng cho đệm1m kèm ruột chăn10OZ'}).requires_split,true,field);
  const ambiguous=suggestProductSupply({name:'Ga dùng cho đệm1m và đệm1m2'});assert.equal(ambiguous.route,'UNCLASSIFIED');assert.equal(ambiguous.requires_split,false);
 });
 await check('source fingerprint includes identity technical data and ownership, excludes money/images',async()=>{
  const raw={id:p,name:'Ga',category:'Ga',sku:'GA',specifications:'160x200',manager_id:manager.id};
  assert.equal(productSupplyFingerprint(raw),productSupplyFingerprint({...raw,price:100,images:['x'],updated_at:'later'}));
  for(const changed of [{name:'Đệm'},{specifications:'180x200'},{manager_id:other.id},{price_list_manager_id:other.id},{description:'Yêu cầu khác'}])assert.notEqual(productSupplyFingerprint(raw),productSupplyFingerprint({...raw,...changed}));
 });
 await check('list excludes labor and foreign owners; unowned shared is read-only',async()=>{
  const all=await list();assert.equal(all.total,5);assert.equal(all.counts.all,5);assert.ok(!all.rows.some(row=>[foreign,conflict,labor,duplicateB].includes(row.id)));assert.equal(all.rows.find(x=>x.id===shared).read_only,true);assert.equal(all.rows.find(x=>x.id===inherited).read_only,false);
  assert.equal((await list(admin.token)).total,8);denied(await call(prefix+'/'+foreign+'/history'),404);denied(await call(prefix+'/'+labor+'/history'),404);
  denied(await confirm([{...input(await find(shared)),route:'PURCHASE'}]),403);
 });
 await check('unauthenticated and employee-with-products permission cannot classify or read private history',async()=>{
  denied(await call(prefix,'GET',undefined,null),401);denied(await call(prefix,'GET',undefined,employee.token),403);
  denied(await confirm([input(await find(p))],{},employee.token),403);denied(await call(prefix+'/'+p+'/history','GET',undefined,employee.token),403);
 });
 let initial;
 await check('manager confirms own and inherited products atomically with immutable history',async()=>{
  initial=input(await find(p));const inheritedInput=input(await find(inherited));
  const r=await confirm([initial,inheritedInput]);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.confirmed.length,2);
  assert.equal((await find(p)).route,'SEW');assert.equal((await find(p)).revision,1);assert.equal((await find(p)).status,'CONFIRMED');
  assert.equal((await must(prefix+'/'+p+'/history')).length,1);assert.equal((await pool.query('select local_modified_at from local_products where id=$1',[p])).rows[0].local_modified_at,null);
  await assert.rejects(pool.query('update local_product_supply_classifications set reason=$1 where product_id=$2',['changed',p]),/chỉ được bổ sung/);
  await assert.rejects(pool.query('delete from local_product_supply_classifications where product_id=$1',[p]),/chỉ được bổ sung/);
 });
 await check('admin can confirm unowned products and duplicate SKU never shares a classification',async()=>{
  assert.equal((await confirm([input(await find(shared,admin.token))],{},admin.token)).status,200);
  assert.equal((await confirm([input(await find(duplicate))])).status,200);
  assert.equal((await find(duplicateB,admin.token)).revision,0);assert.equal((await find(shared)).route,'PURCHASE');
 });
 await check('same-key retry returns original result; changed content or actor rejected',async()=>{
  const data={rows:[input(await find(p))],idempotency_key:key(),reason:'QA đổi phiên bản'};
  const a=await call(prefix+'/confirm','POST',data),b=await call(prefix+'/confirm','POST',data);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(b.body.reused,true);assert.equal(b.body.confirmed[0].version,a.body.confirmed[0].version);
  denied(await call(prefix+'/confirm','POST',{...data,reason:'Nội dung khác'}),409);denied(await call(prefix+'/confirm','POST',data,admin.token),409);
  await assert.rejects(pool.query('delete from local_product_supply_receipts where idempotency_key=$1',[data.idempotency_key]),/chỉ được bổ sung/);
 });
 await check('source or classification changes cause 409 and all batch rows roll back',async()=>{
  denied(await confirm([initial]),409);
  const before=(await pool.query('select count(*)::int n from local_product_supply_classifications')).rows[0].n;
  const fresh=input(await find(duplicate)),stale=input(await find(p));await pool.query("update local_products set specifications='180x200cm' where id=$1",[p]);
  denied(await confirm([fresh,stale]),409);assert.equal((await pool.query('select count(*)::int n from local_product_supply_classifications')).rows[0].n,before);
  assert.equal((await find(p)).status,'REVIEW');assert.equal((await find(p)).route,'SEW');
 });
 await check('two simultaneous decisions cannot overwrite one version',async()=>{
  const data=input(await find(duplicate));const results=await Promise.all([confirm([data]),confirm([data])]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 });
 await check('ownership is rechecked before replay and inherited scope changes',async()=>{
  const row=input(await find(inherited)),data={rows:[row],reason:'QA trước chuyển chủ',idempotency_key:key()};assert.equal((await call(prefix+'/confirm','POST',data)).status,200);
  await pool.query('update local_price_lists set manager_id=$2 where id=$1',[listA,other.id]);
  denied(await call(prefix+'/confirm','POST',data),404);denied(await call(prefix+'/'+inherited+'/history'),404);
  assert.ok(!(await list()).rows.some(x=>x.id===inherited));
  // Explicit product manager still wins over the changed price-list manager.
  assert.ok((await list()).rows.some(x=>x.id===p));
  await pool.query('update local_price_lists set manager_id=$2 where id=$1',[listA,manager.id]);
 });
 await check('manual choice needs valid reason; unclear suggestions and mixed combo cannot be auto-confirmed',async()=>{
  denied(await confirm([input(await find(combo))]),409);
  const unknown=await product('Hàng đặc biệt'),row=await find(unknown);denied(await confirm([input(row)]),409);
  denied(await confirm([{...input(row),route:'SEW',use_suggestion:false}],{reason:''}),400);
  assert.equal((await confirm([{...input(row),route:'SEW',use_suggestion:false}],{reason:'Quản lý xác nhận gia công riêng'})).status,200);
  assert.equal((await confirm([{...input(await find(unknown)),route:'UNCLASSIFIED',use_suggestion:false}],{reason:'Cần kiểm tra lại kỹ thuật'})).status,200);
  assert.equal((await find(unknown)).status,'UNCLASSIFIED');assert.equal((await must(prefix+'/'+unknown+'/history')).length,2);
  denied(await confirm([{...input(await find(combo)),route:'PURCHASE',use_suggestion:false}]),409);
 });
 await check('pagination counts search price list and filter reflect scoped actual state',async()=>{
  const all=await list(),first=await list(token,'?limit=2&offset=0'),next=await list(token,'?limit=2&offset=2');assert.equal(first.total,all.total);assert.equal(first.rows.length,2);assert.ok(!next.rows.some(x=>first.rows.some(y=>x.id===y.id)));
  const searched=await list(token,'?search='+encodeURIComponent('ga chun'));assert.equal(searched.total,1);
  const confirmed=await list(token,'?status=CONFIRMED');assert.ok(confirmed.rows.every(row=>row.status==='CONFIRMED'));
  const inList=await list(token,'?price_list_id='+listA);assert.ok(inList.rows.every(row=>row.price_list_id===listA));
  denied(await call(prefix+'?limit=999'),400);denied(await call(prefix+'?status=forged'),400);
 });
 await check('reserved generic adapters do not expose or mutate classification/history receipts',async()=>{
  for(const path of ['/api/local-snapshot/local_product_supply_classifications','/api/local-table/product_supply_receipts','/api/local-rpc/product_supply_classifications'])denied(await call(path,'GET',undefined,admin.token),403);
 });
 await check('API rejects automatic or forced classification of mixed inner and description-only combos',async()=>{
  for(const row of [{name:'Bộ ruột chăn Microfiber + ruột gối bông thường'},{name:'Bộ ruột chăn Microfiber + ruột gối lông vũ'},{name:'Bộ ruột chăn Microfiber + ruột gối'},{name:'Bộ chăn ga',description:'Gồm ga, vỏ gối và đệm lò xo'},{name:'Bộ ga và vỏ chăn',description:'Kèm ruột chăn 10OZ'},{name:'Bộ chăn ga',specifications:'Gồm ga,vỏ gối và đệm lò xo'},{name:'Ga + ruột chăn10OZ'},{name:'Ruột chăn Microfiber + ruột gối bông thường'}]){
   const id=await product(row.name,{description:row.description,specifications:row.specifications}),current=await find(id);assert.equal(current.suggestion.requires_split,true);
   denied(await confirm([input(current)]),409);denied(await confirm([{...input(current),route:'SEW',use_suggestion:false}]),409);denied(await confirm([{...input(current),route:'PURCHASE',use_suggestion:false}]),409);
  }
 });
 await check('API rejects forced decisions when usage suffix contains textual next component',async()=>{
  for(const row of [{name:'Bộ ga dùng cho đệm kèm ruột chăn10OZ'},{name:'Ga dành cho đệm1m kèm ruột gối bông thường'},{name:'Bộ ga dùng cho đệm1m và khăn'},{name:'Bộ ga và vỏ gối',description:'Gồm ga dùng cho đệm1m kèm ruột chăn10OZ'},{name:'Bộ ga và vỏ gối',specifications:'Gồm ga dùng cho đệm1m kèm ruột chăn10OZ'}]){
   const id=await product(row.name,{description:row.description,specifications:row.specifications}),current=await find(id);assert.equal(current.suggestion.requires_split,true);
   denied(await confirm([input(current)]),409);for(const route of ['SEW','PURCHASE'])denied(await confirm([{...input(current),route,use_suggestion:false}]),409);
  }
 });
 await check('single protectors stay manually confirmable and sheets with mattress usage auto-confirm',async()=>{
  for(const name of ['Bảo vệ nệm chần bông','Tấm bảo vệ đệm chần bông']){const id=await product(name),row=await find(id);assert.equal(row.suggestion.requires_split,false);assert.equal((await confirm([{...input(row),route:'SEW',use_suggestion:false}],{reason:'Quản lý xác nhận may bảo vệ nệm'})).status,200);}
  for(const name of ['Ga tấm phủ T200 trơn190x280 (dùng cho đệm1m)','Ga chun dành cho đệm1m6','Ga tấm phủ dùng với đệm lòxo']){const id=await product(name),row=await find(id);assert.equal(row.suggestion.route,'SEW');assert.equal((await confirm([input(row)])).status,200);}
 });
 await check('classification never changes price inventory production or payroll',async()=>{
  const counts=async()=>(await pool.query("select jsonb_build_object('inventory',(select count(*) from local_inventory_movements),'production',(select count(*) from local_production_orders),'payroll',(select count(*) from local_production_entries),'products',(select jsonb_agg(jsonb_build_array(id,price,cost_price,local_modified_at)order by id)from local_products)) state")).rows[0].state;
  const before=await counts(),row=input(await find(duplicate));assert.equal((await confirm([{...row,route:'PURCHASE',use_suggestion:false}],{reason:'QA ngoại lệ có lý do'})).status,200);assert.deepEqual(await counts(),before);
 });
 await check('local snapshot refresh preserves decision history and marks changed source for review',async()=>{
  const syncId=await product('Ruột chăn 10OZ đồng bộ'),row=input(await find(syncId));assert.equal((await confirm([row])).status,200);
  const historyBefore=await must(prefix+'/'+syncId+'/history');
  const payload={id:syncId,sku:(await find(syncId)).sku,name:'Ruột chăn Microfiber đồng bộ',category:'Ruột chăn Microfiber',specifications:'160x200cm',manager_id:manager.id,tenant_id:'default',price:200,cost_price:60,is_active:true,created_at:'2026-10-28T00:00:00Z',updated_at:'2026-10-28T00:00:00Z'};
  await pool.query("insert into local_source_snapshots(source_table,source_key,source_hash,payload)values('products',$1,$2,$3::jsonb)",[syncId,'qa-hash',JSON.stringify(payload)]);
  const {refreshCanonicalProjections}=await import('./sync-supabase-to-local.mjs');await refreshCanonicalProjections(pool);
  assert.deepEqual(await must(prefix+'/'+syncId+'/history'),historyBefore);const after=await find(syncId);assert.equal(after.route,'PURCHASE');assert.equal(after.status,'REVIEW');assert.equal(after.suggestion.route,'SEW');
  assert.equal((await pool.query('select local_modified_at,price from local_products where id=$1',[syncId])).rows[0].local_modified_at,null);
 });
 console.log(JSON.stringify({suite:'product-supply-classification-item1',passed:passed.length,failed:failures.length,failures},null,2));if(failures.length)process.exitCode=1;
 if(holdRequested&&failures.length===0){holdManifest=path.join(storage,'owned-qa-manifest.json');await writeFile(holdManifest,JSON.stringify({synthetic:true,owned_test_only:true,database,role,connectionString,api_pid:api.pid,apiOrigin:base,base,publicAppUrl:'https://crm.example.com',storage,credentials:{email:admin.email,password:admin.password},manager:{email:manager.email,password:manager.password},cleanup:'Stop owned api_pid; drop owned database with force; drop owned role; remove verified temp storage directory.'},null,2));console.log('HOLD owned fixture manifest: '+holdManifest);api.unref();}
}finally{
 if(holdManifest){await pool?.end();console.log('HOLD test-owned resources retained for parent UI verification');}
 else{if(api&&api.exitCode===null){api.kill();await Promise.race([once(api,'exit'),new Promise(r=>setTimeout(r,5000))]);}await pool?.end();if(created)control(`drop database ${database} with (force)`);control(`drop role if exists ${role}`);if(storage){assert.equal(path.dirname(path.resolve(storage)),path.resolve(tmpdir()));assert.ok(path.basename(storage).startsWith('product-classification-owned-'));await rm(storage,{recursive:true,force:true});}assert.ok(!logs.includes(secret));console.log('CLEANUP owned classification API database role and files removed');}
}
