// Tester-owned extension of the frozen isolated suite. No production source edits.
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const sourcePath=path.join(root,'scripts','test-product-technical-isolated.mjs');
const source=await readFile(sourcePath,'utf8');
const sourceHash=createHash('sha256').update(source).digest('hex');
const frozen=JSON.parse(await readFile(path.join(root,'.local-staging-runtime/item2-baseline/frozen-v1-hashes.json'),'utf8'));
assert.equal(sourceHash,frozen.find(entry=>path.resolve(entry.Path)===sourcePath).Hash.toLowerCase());
const marker=" console.log(JSON.stringify({suite:'product-technical-profile-item2'";
assert.equal(source.split(marker).length,2,'Exactly one insertion point in frozen test harness.');
const supplement=String.raw`
 await check('tester equivalent CM MM METER live cutting and height rules preserve released snapshots',async()=>{
  const id=await product('Ga tester đơn vị cắt độc lập');
  await apply(id,{action:'CONFIRM',manufacturing_type:'FITTED_SHEET',finished_width:'100',finished_length:'200',finished_height:'20',dimension_unit:'CM'});
  const createCutting=async(height)=>{
   const c=await must('/api/manufacturing/cutting-profiles/drafts','POST',{product_id:id,code:'UNITS-'+key(),name:'Kiểm tra quy đổi '+(height?'có cao':'cơ bản'),configuration:{calculation_strategy:'GRID',effective_from:'2026-01-01',piece_width_rule:height?'FINISHED_WIDTH_PLUS_2_HEIGHT_TUCK':'FINISHED_WIDTH',piece_length_rule:height?'FINISHED_LENGTH_PLUS_2_HEIGHT_TUCK':'FINISHED_LENGTH',pieces_per_product:1,default_fabric_width_cm:height?300:200,pattern_direction:'NONE',allow_rotation:false,requires_matching_pattern:false,standard_waste_rate:0,issue_rounding_increment:0.1}});
   await must('/api/manufacturing/cutting-versions/'+c.version.id+'/approve','POST',{reason:'Tester duyệt định mức riêng'});return c;
  };
  const plain=await createCutting(false),height=await createCutting(true);
  const calc=version=>must('/api/manufacturing/cutting-versions/'+version+'/calculate','POST',{quantity:2});
  const baseline={plain:await calc(plain.version.id),height:await calc(height.version.id)};
  assert.equal(baseline.plain.final_issue_recommendation_m,2);
  assert.equal(baseline.height.final_issue_recommendation_m,2.4);
  const orderId=key(),material=await must('/api/inventory/items','POST',{code:'UNITS-'+key(),name:'Vải tester riêng',item_type:'RAW_MATERIAL',base_unit:'METER'},admin.token);
  await pool.query("insert into local_production_orders(id,production_order_number,production_batch_number,product_id,quantity_planned,status,released_at,cutting_params_snapshot)values($1,$2,$2,$3,2,'RELEASED',now(),$4::jsonb)",[orderId,'UNITS-REL-'+key(),id,JSON.stringify({technical:(await get(id)).profile,cutting:baseline})]);
  await pool.query("insert into local_production_order_material_requirements(production_order_id,inventory_item_id,planned_quantity,unit,cutting_profile_version_id,calculation_details)values($1,$2,2,'METER',$3,$4::jsonb)",[orderId,material.id,plain.version.id,JSON.stringify(baseline.plain)]);
  const snapshots=async()=>({order:(await pool.query('select to_jsonb(x)::text value from local_production_orders x where id=$1',[orderId])).rows,requirements:(await pool.query('select to_jsonb(x)::text value from local_production_order_material_requirements x where production_order_id=$1',[orderId])).rows});
  const released=await snapshots(),units=[];
  for(const [unit,width,length,heightValue]of [['CM','100','200','20'],['MM','1000','2000','200'],['METER','1','2','0.2']]){
   const saved=await apply(id,{action:'CONFIRM',finished_width:width,finished_length:length,finished_height:heightValue,dimension_unit:unit});
   assert.equal(saved.profile.dimension_unit,unit);
   const actual={plain:await calc(plain.version.id),height:await calc(height.version.id)};
   assert.deepEqual(actual,baseline,'Same physical dimensions must produce identical cutting in '+unit);
   assert.deepEqual(await snapshots(),released,'Released order/material rows unchanged in '+unit);
   units.push({unit,width:saved.profile.finished_width,length:saved.profile.finished_length,height:saved.profile.finished_height,plain_m:actual.plain.final_issue_recommendation_m,height_rule_m:actual.height.final_issue_recommendation_m,released_snapshot_unchanged:true});
  }
  console.log('TESTER_UNIT_EVIDENCE '+JSON.stringify({synthetic:true,database,consumer:'canonical cuttingGrid through live calculation API',units,snapshot_scope:'Synthetic RELEASED order/material fixture; not full release/delivery acceptance'}));
 });
`;
const temporary=path.join(root,'scripts','.owned-product-technical-units-'+randomUUID()+'.mjs');
assert.equal(path.dirname(temporary),path.dirname(sourcePath));
let output='',exitCode;
try{
 await writeFile(temporary,source.replace(marker,supplement+marker));
 const child=spawn(process.execPath,[temporary],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PRODUCT_TECHNICAL_QA_HOLD:'0'}});
 child.stdout.on('data',data=>{output+=data;process.stdout.write(data);});
 child.stderr.on('data',data=>{output+=data;process.stderr.write(data);});
 exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 const line=output.split(/\r?\n/).find(value=>value.startsWith('TESTER_UNIT_EVIDENCE '));
 await writeFile(path.join(root,'.local-staging-runtime/item2-baseline/tester-unit-conversion-evidence.json'),JSON.stringify({tested_at:new Date().toISOString(),frozen_test_sha256:sourceHash,exit_code:exitCode,evidence:line?JSON.parse(line.slice('TESTER_UNIT_EVIDENCE '.length)):null,output},null,2));
 assert.equal(exitCode,0,'Owned supplementary suite failed.');assert.ok(line,'Supplement must emit successful unit evidence.');
}finally{
 assert.ok(path.basename(temporary).startsWith('.owned-product-technical-units-'));
 await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
}
