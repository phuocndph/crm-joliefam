// Explicitly owned synthetic UI rows only. No mapping/code approval.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),args=process.argv.slice(2);
const value=flag=>{const i=args.indexOf(flag);assert.ok(i>=0&&args[i+1]);return path.resolve(args[i+1]);};
const manifestPath=value('--manifest'),freezePath=value('--freeze'),unmappedOnly=args.includes('--unmapped-only');assert.equal(args.length,unmappedOnly?5:4);
assert.match(path.basename(path.dirname(manifestPath)),/^product-labor-mapping-owned-/);assert.equal(path.basename(manifestPath),'owned-qa-manifest.json');assert.ok(freezePath.startsWith(path.join(root,'.local-staging-runtime/item3-baseline')+path.sep));
const frozen=JSON.parse(await readFile(freezePath,'utf8'));
const verify=async()=>{for(const f of frozen)assert.equal(createHash('sha256').update(await readFile(f.Path)).digest('hex'),f.Hash.toLowerCase());};await verify();
const m=JSON.parse(await readFile(manifestPath,'utf8'));assert.equal(m.synthetic,true);assert.equal(m.owned_test_only,true);assert.match(m.database,/^product_labor_mapping_qa_/);assert.equal(m.publicAppUrl,'https://crm.example.com');
const base=new URL(m.apiOrigin||m.base);assert.equal(base.hostname,'127.0.0.1');assert.equal(base.protocol,'http:');assert.ok(base.port&&!['8787','16543'].includes(base.port));const db=new URL(m.connectionString);assert.equal(db.hostname,'127.0.0.1');assert.equal(db.port,'16543');assert.equal(db.pathname,'/'+m.database);
assert.equal((await(await fetch(new URL('/health',base))).json()).database,m.database);
const pool=new pg.Pool({connectionString:m.connectionString}),created=[],key=()=>randomUUID();
const call=async(route,token,method='GET',body)=>{const r=await fetch(new URL(route,base),{method,headers:{origin:m.publicAppUrl,...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000),redirect:'error'});const result=await r.json();assert.equal(r.status,200,JSON.stringify(result));return result;};
try{
 assert.equal((await pool.query('select current_database() db')).rows[0].db,m.database);assert.equal((await pool.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,false);
 const token=(await call('/api/local-auth/login',null,'POST',m.manager)).token,owner=(await pool.query('select id from local_user_profiles where email=$1',[m.manager.email])).rows[0].id;
 const suffix=key().slice(0,4),values={material:'COTTON',pillow_subtype:'BOLSTER',joining:'NO',quilting:'NO',topstitch:'NO',sewing_method:'STANDARD',closure:'ENVELOPE',ruffle:'NO',waterproof:'NO'};
 for(const label of unmappedOnly?['UI chưa gán Microfiber']:['UI cùng mẫu 1','UI cùng mẫu 2','UI chưa gán']){
  const id=key(),name=label+' '+suffix;
  await pool.query("insert into local_products(id,sku,name,category,manager_id,tenant_id,specifications,is_active)values($1,$2,$3,'Vỏ gối',$4,'default','Rộng 600mm',true)",[id,'UI-TESTER-'+id,name,owner]);
  const technical=await call('/api/product-technical-profiles/'+id,token);
  const micro=label.includes('Microfiber');
  await call('/api/product-technical-profiles/'+id,token,'PUT',{expected_revision:technical.revision,source_fingerprint:technical.source_fingerprint,idempotency_key:key(),action:'CONFIRM',reason:'Tester tạo mẫu UI đồng nhất riêng',manufacturing_type:micro?'DUVET_INSERT':'PILLOW_CASE',finished_width:'600',finished_length:null,finished_height:null,dimension_unit:'MM',technical_values:micro?{material:'MICROFIBER',microfiber_weight:'THIN',joining:'NO',quilting:'NO',topstitch:'NO',sewing_method:'STANDARD'}:values});
  const row=(await call('/api/product-supply-classifications?search='+encodeURIComponent(name),token)).rows.find(r=>r.id===id);assert.ok(row);
  await call('/api/product-supply-classifications/confirm',token,'POST',{rows:[{product_id:id,expected_revision:row.revision,source_fingerprint:row.source_fingerprint,route:'SEW',use_suggestion:false}],reason:'Tester xác nhận tuyến may cho UI',idempotency_key:key()});
  const detail=await call('/api/payroll/labor-mappings/products/'+id+'?date=2026-10-29',token);assert.equal(detail.gate,'READY');assert.equal(detail.exact_revision,0);assert.equal(detail.facts.width_mm,'600');created.push({id,name,code_status:detail.code_status,gate:detail.gate,exact_revision:detail.exact_revision});
 }
 await verify();const evidence={synthetic:true,database:m.database,created,mappings_approved:0,ui_fixture_a_b_untouched:true,frozen_hashes_unchanged:true};await writeFile(path.join(root,'.local-staging-runtime/item3-baseline/tester-ui-seed-'+suffix+'.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await pool.end();}
