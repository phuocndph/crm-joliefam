import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {actor,api,checkCount,close,databaseName,dates,denied,isolated,key,manufacturing,must,profiles,snapshots,sql,token,unwrap} from './local-sales-production-test-helpers.mjs';
import {approveLegacyPayrollFixture} from './payroll-approved-fixtures.mjs';

const workspace='/api/production-workspace',dispatch='/api/production-dispatch';
const list=value=>Array.isArray(value)?value:value.rows??value.items??[];
const pathFor=(name)=>{
  const path=resolve(String(process.env[name]||''));
  const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
  const suffix=name.endsWith('CHECKPOINT')?'restart':'qa';
  assert.equal(dirname(path),root);
  assert.equal(basename(path),`.isolated-dispatch-${databaseName.replace('crm_local_test_dispatch_','')}.${suffix}.json`);
  return path;
};
async function snapshotAll(ids){
  return {...await snapshots(ids),
    shipments:(await sql('select to_jsonb(s) row from local_production_shipments s where production_order_id=any($1::uuid[]) order by id',[ids])).rows.map(x=>x.row),
    shipmentLines:(await sql('select to_jsonb(l) row from local_production_shipment_lines l join local_production_shipments s on s.id=l.shipment_id where s.production_order_id=any($1::uuid[]) order by l.id',[ids])).rows.map(x=>x.row),
    tickets:(await sql('select to_jsonb(t) row from local_production_repair_tickets t where production_order_id=any($1::uuid[]) order by id',[ids])).rows.map(x=>x.row),
    movements:(await sql('select to_jsonb(m) row from local_inventory_movements m join local_inventory_documents d on d.id=m.document_id where d.production_order_id=any($1::uuid[]) order by m.id',[ids])).rows.map(x=>x.row),
    dispatchAudit:(await sql('select to_jsonb(a) row from local_dispatch_audit_events a where production_order_id=any($1::uuid[]) order by id',[ids])).rows.map(x=>x.row),
    uncutCancellations:(await sql('select to_jsonb(c) row from local_production_uncut_cancellations c where production_order_id=any($1::uuid[]) order by id',[ids])).rows.map(x=>x.row),
  };
}
async function setup(){
  const bootstrap=await must('GET','/api/local-auth/session');assert(bootstrap.token);
  const admin=bootstrap.token;
  const f={admin,ids:[]};
  f.manager=await actor(admin,'MANAGER','manager','SUPERVISOR');
  f.sale=await actor(admin,'SALE','employee','GENERIC',['orders','production_sales_submit']);
  f.cutter=await actor(admin,'CUTTER','employee','CUTTER',['production_view','production_operations']);
  f.sewer=await actor(admin,'SEWER','employee','SEWER',['production_view','production_operations']);
  f.finisher=await actor(admin,'FINISHER','employee','IRONING',['production_view','production_operations']);
  f.counter=await actor(admin,'COUNTER','employee','QC',['production_view','production_operations']);
  f.outsider=await actor(admin,'OUTSIDER','employee','GENERIC');
  assert.equal((await must('GET',workspace,undefined,f.manager.session)).version,5,'Partial uncut cancellation contract requires workspace capability 5.');
  await profiles([f.manager.worker,f.sale.worker,f.cutter.worker,f.sewer.worker,f.finisher.worker,f.counter.worker]);
  f.product=await must('POST','/api/catalog/products',{sku:`WORKSPACE-${token}`,name:`Kiểm thử xưởng ${token}`},admin);
  f.warehouse=randomUUID();
  await sql("insert into local_inventory_warehouses(id,code,name) values($1,$2,'Kho kiểm thử xưởng')",[f.warehouse,`WS-${token}`]);
  f.fabric=randomUUID();
  await sql("insert into local_fabric_variants(id,variant_name,color,unit,is_snapshot_record) values($1,'Vải kiểm thử','Xanh','m',false)",[f.fabric]);
  f.material=await must('POST','/api/inventory/items',{code:`WS-VAI-${token}`,name:'Vải kiểm thử xưởng',item_type:'RAW_MATERIAL',base_unit:'METER'},admin);
  f.finished=await must('POST','/api/inventory/items',{code:`WS-TP-${token}`,name:'Thành phẩm kiểm thử',item_type:'FINISHED_GOOD',base_unit:'PIECE'},admin);
  await manufacturing(f.product.id,f.manager.session,{lines:[{inventory_item_id:f.material.id,line_type:'MATERIAL',quantity_method:'PER_UNIT',standard_quantity:2,unit:'METER',waste_rate:0,scrap_rate:0}]});
  await must('POST','/api/fabric-inventory-mappings',{fabric_variant_id:f.fabric,inventory_item_id:f.material.id,reason:'Ánh xạ cô lập'},f.manager.session);
  const opening=await must('POST','/api/inventory/documents',{document_type:'OPENING_BALANCE',warehouse_id:f.warehouse,transaction_at:dates.start,idempotency_key:key('opening'),lines:[{inventory_item_id:f.material.id,quantity:2000,unit:'METER',input_unit_cost:10000}]},admin);
  await must('POST',`/api/inventory/documents/${opening.id}/confirm`,{},admin);
  f.code=`CONG-EXCEL-${token}`;
  await sql("insert into local_product_rates(piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,status,reason) values($1,'Công may kiểm thử',12500.25,'PIECE',$2,'APPROVED','Fixture')",[f.code,dates.start]);
  return f;
}
async function prepare(f,order,issueMaterial=true){
  f.ids.push(order.id);
  await must('POST',`/api/production-orders/${order.id}/release`,{idempotency_key:key(`release-${order.id}`)},f.manager.session);
  const details=await must('GET',`${workspace}/${order.id}/details`,undefined,f.manager.session);
  assert.equal(details.order.workflow_generation,'WORKFLOW_V3');
  const batch=details.batches[0],item=details.items[0];
  const estimate=await must('POST',`/api/production-orders/${order.id}/cutting-estimates`,{production_batch_id:batch.id,lines:[{order_item_id:item.id,fabric_variant_id:f.fabric,inventory_item_id:f.material.id,warehouse_id:f.warehouse,output_quantity:batch.planned_quantity,calculation_method:'BOM_PER_UNIT'}],idempotency_key:key(`estimate-${order.id}`)},f.manager.session);
  await must('POST',`/api/cutting-estimates/${estimate.id}/submit`,{idempotency_key:key(`estimate-submit-${order.id}`)},f.manager.session);
  await must('POST',`/api/cutting-estimates/${estimate.id}/review`,{target_status:'APPROVED',reason:'Duyệt độc lập',idempotency_key:key(`estimate-review-${order.id}`)},f.admin);
  if(issueMaterial){
    const issue=await must('POST',`/api/cutting-estimates/${estimate.id}/material-issue`,{warehouse_id:f.warehouse,lines:[{estimate_line_id:estimate.lines[0].id,quantity:Number(batch.planned_quantity)*2}],idempotency_key:key(`material-${order.id}`)},f.manager.session);
    await must('POST',`/api/inventory/documents/${issue.document?.id||issue.id}/confirm`,{},f.admin);
  }
  return {order:details.order,batch,item,estimate};
}
async function manual(f,quantity,label){
  const body={source_type:'MANUAL',planned_start_date:dates.first,planned_end_date:dates.end,notes:label,idempotency_key:key(`manual-${label}`),lines:[{product_id:f.product.id,quantity,fabric_variant_id:f.fabric,color:'Xanh',size:'M'}]};
  const group=await must('POST','/api/production-orders/groups',body,f.manager.session);
  const replay=await must('POST','/api/production-orders/groups',body,f.manager.session);assert.equal(group.orders[0].id,replay.orders[0].id);
  return prepare(f,group.orders[0]);
}
async function assign(f,job,stage,quantity,extra={}){
  const person={CUTTING:f.cutter,SEWING:f.sewer,FINISHING:f.finisher,COUNTING:f.counter}[stage];
  const result=await must('POST',`${dispatch}/assignments`,{production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,worker_id:person.worker.id,stage,quantity,assigned_from:dates.first,piece_rate_code:stage==='SEWING'?f.code:undefined,idempotency_key:key(`assign-${randomUUID()}`),...extra},f.manager.session);
  const row=unwrap(result,'assignment');
  await must('POST',`${dispatch}/assignments/${row.id}/accept`,{quantity,idempotency_key:key(`accept-${row.id}`)},person.session);
  return {row,person};
}
async function report(f,assignment,good,rework=0,defect=0,workDate=dates.first){
  const body={work_date:workDate,quantity_good:good,quantity_rework:rework,quantity_remake:0,quantity_defect:defect,idempotency_key:key(`report-${randomUUID()}`)};
  const result=unwrap(await must('POST',`${dispatch}/assignments/${assignment.row.id}/reports`,body,assignment.person.session),'report');
  const retry=unwrap(await must('POST',`${dispatch}/assignments/${assignment.row.id}/reports`,body,assignment.person.session),'report');assert.equal(retry.id,result.id);
  return result;
}
async function approve(f,row){
  const body={target_status:'APPROVED',reason:'Đối chiếu cô lập',idempotency_key:key(`approve-${row.id}`)};
  await must('POST',`${dispatch}/reports/${row.id}/review`,body,f.manager.session);
  await must('POST',`${dispatch}/reports/${row.id}/review`,body,f.manager.session);
}
async function stages(f,job,quantity){
  for(const stage of ['CUTTING','SEWING','FINISHING','COUNTING']){const assignment=await assign(f,job,stage,quantity);const row=await report(f,assignment,quantity);await approve(f,row);}
}
async function refusalAndRepair(f){
  const job=await manual(f,10,'Kiểm tra hạn mức và trả sửa');
  const historical=await manual(f,1,'Lệnh lịch sử kiểm tra sở hữu');await sql("update local_production_orders set workflow_generation='WORKFLOW_V2' where id=$1",[historical.order.id]);
  const forged={production_order_id:historical.order.id,production_batch_id:historical.batch.id,order_item_id:job.item.id,stage:'COUNTING',worker_id:f.counter.worker.id,quantity_received:10,quantity_good:0,quantity_defect:10,occurred_at:dates.first,idempotency_key:key('foreign-item-generic-defect')};
  await denied('POST','/api/production-stage-events',forged,f.manager.session);
  assert.equal((await sql('select count(*)::int n from local_production_stage_events where order_item_id=$1',[job.item.id])).rows[0].n,0,'Foreign historical report contaminated V3 item.');
  await denied('POST',`/api/production-orders/${job.order.id}/complete`,{quantity_good:10,idempotency_key:key('v3-old-complete')},f.manager.session);
  await denied('POST',`/api/production-batches/${job.batch.id}/status`,{target_status:'COMPLETED'},f.manager.session);
  await denied('POST','/api/production-stage-events',{production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,worker_id:f.cutter.worker.id,stage:'CUTTING',quantity_good:10,work_date:dates.first,idempotency_key:key('generic-bypass')},f.manager.session);
  const cut=await assign(f,job,'CUTTING',10);
  await denied('POST',`${dispatch}/assignments/${cut.row.id}/reports`,{work_date:dates.first,quantity_good:1,idempotency_key:key('foreign-report')},f.sewer.session,[403]);
  const cutReport=await report(f,cut,10);
  const premature={production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,worker_id:f.sewer.worker.id,stage:'SEWING',quantity:1,piece_rate_code:f.code,assigned_from:dates.first,idempotency_key:key('pending-cut-sew')};
  await denied('POST',`${dispatch}/assignments`,premature,f.manager.session);
  await denied('POST',`${dispatch}/reports/${cutReport.id}/review`,{target_status:'APPROVED',idempotency_key:key('staff-review')},f.cutter.session,[403]);
  await approve(f,cutReport);
  const sew=await assign(f,job,'SEWING',10),sewReport=await report(f,sew,10);
  const pending=(await sql('select status from local_production_stage_events where id=$1',[sewReport.id])).rows[0];assert.equal(pending.status,'SUBMITTED');
  assert.equal((await sql("select count(*)::int n from local_production_entries where source_stage_event_id=$1 and workflow_status in ('APPROVED','LOCKED')",[sewReport.id])).rows[0].n,0,'Unreviewed output became payable approved wages.');
  await approve(f,sewReport);
  assert.equal((await sql('select piece_rate_code=$2 and rate_amount=12500.25 and quantity=10 and calculated_amount=125002.50 exact from local_production_entries where source_stage_event_id=$1',[sewReport.id,f.code])).rows[0].exact,true,'Excel work code / precise wage snapshot mismatch.');
  const payBefore=(await sql('select count(*)::int n from local_production_entries where source_stage_event_id in (select id from local_production_stage_events where production_order_id=$1)',[job.order.id])).rows[0].n;assert.equal(payBefore,1);
  const finish=await assign(f,job,'FINISHING',10);await approve(f,await report(f,finish,10));
  const count=await assign(f,job,'COUNTING',10),bad=await report(f,count,9,1);await approve(f,bad);
  await denied('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('repair-unresolved-complete')},f.manager.session);
  await denied('POST',`${workspace}/${job.order.id}/receive`,receiveBody(f,job,10,'receive-before-repair'),f.manager.session);
  const body={source_stage_event_id:bad.id,quantity:1,target_stage:'SEWING',reason:'Sửa đường may sau kiểm đếm',idempotency_key:key('repair-ticket')};
  const ticket=await must('POST',`${workspace}/${job.order.id}/repair-tickets`,body,f.manager.session);
  assert.equal((await must('POST',`${workspace}/${job.order.id}/repair-tickets`,body,f.manager.session)).id,ticket.id);
  await denied('POST',`${workspace}/${job.order.id}/repair-tickets`,{...body,idempotency_key:key('repair-overallocate')},f.manager.session);
  for(const stage of ['SEWING','FINISHING','COUNTING']){const a=await assign(f,job,stage,1,{repair_ticket_id:ticket.id});await approve(f,await report(f,a,1));if(stage!=='COUNTING')await denied('POST',`${workspace}/${job.order.id}/receive`,receiveBody(f,job,10,`repair-intermediate-${stage}`),f.manager.session);}
  assert.equal((await sql('select count(*)::int n from local_production_entries where source_stage_event_id in (select id from local_production_stage_events where production_order_id=$1)',[job.order.id])).rows[0].n,payBefore,'Repair duplicated employee wages.');
  await receipt(f,job,10,'repaired-receipt');await must('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('repaired-complete')},f.manager.session);
}
async function partialAndClaimRace(f){
  const job=await manual(f,5,'Nhận việc đồng thời và bàn giao một phần');
  const publication=await must('POST',`${dispatch}/publications`,{production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,stage:'CUTTING',eligible_worker_type:'CUTTER',quantity:5,assigned_from:dates.first,idempotency_key:key('claim-race-publish')},f.manager.session);
  await denied('POST',`${dispatch}/publications/${publication.id}/claim`,{quantity:1,idempotency_key:key('wrong-worker-type')},f.sewer.session,[409]);
  const bodies=[0,1].map(i=>({quantity:3,idempotency_key:key(`claim-race-${i}`)}));
  const results=await Promise.all(bodies.map(b=>api('POST',`${dispatch}/publications/${publication.id}/claim`,b,f.cutter.session)));
  assert.equal(results.filter(r=>r.ok).length,1,JSON.stringify(results));assert.equal(results.find(r=>!r.ok).status,409);
  const winner=results.findIndex(r=>r.ok),assignment={row:unwrap(results[winner].payload,'assignment'),person:f.cutter};
  assert.equal(unwrap(await must('POST',`${dispatch}/publications/${publication.id}/claim`,bodies[winner],f.cutter.session),'assignment').id,assignment.row.id);
  const row=await report(f,assignment,3);await approve(f,row);
  await denied('POST',`${dispatch}/assignments`,{production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,worker_id:f.sewer.worker.id,stage:'SEWING',quantity:4,piece_rate_code:f.code,assigned_from:dates.first,idempotency_key:key('partial-over-sew')},f.manager.session);
  const sew=await assign(f,job,'SEWING',3);await approve(f,await report(f,sew,3));
  const finish=await assign(f,job,'FINISHING',3);await approve(f,await report(f,finish,3));
  const count=await assign(f,job,'COUNTING',3);await approve(f,await report(f,count,3));
  const receipts=[0,1].map(i=>receiveBody(f,job,3,`race-receive-${i}`));
  const posted=await Promise.all(receipts.map(b=>api('POST',`${workspace}/${job.order.id}/receive`,b,f.manager.session)));
  assert.equal(posted.filter(r=>r.ok).length,1,JSON.stringify(posted));assert.equal(posted.find(r=>!r.ok).status,409);
  const success=posted.findIndex(r=>r.ok);assert.equal((await must('POST',`${workspace}/${job.order.id}/receive`,receipts[success],f.manager.session)).movement.id,posted[success].payload.movement.id);
  assert.equal(Number((await sql('select sum(quantity_good) n from local_production_outputs where production_order_id=$1',[job.order.id])).rows[0].n),3);
  await denied('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('partial-incomplete')},f.manager.session);
}
async function additionalRepair(f,multiRound){
  const job=await manual(f,2,multiRound?'Trả sửa nhiều vòng':'Hỏng tại công đoạn sửa trung gian');
  for(const stage of ['CUTTING','SEWING','FINISHING']){const a=await assign(f,job,stage,2);await approve(f,await report(f,a,2));}
  const count=await assign(f,job,'COUNTING',2);let source=await report(f,count,multiRound?1:0,multiRound?1:2);await approve(f,source);
  const rounds=multiRound?2:1;
  for(let round=0;round<rounds;round++){
    const ticket=await must('POST',`${workspace}/${job.order.id}/repair-tickets`,{source_stage_event_id:source.id,quantity:multiRound?1:2,target_stage:'SEWING',reason:'Đối chiếu sửa nhiều bước',idempotency_key:key(`extra-repair-${job.order.id}-${round}`)},f.manager.session);
    for(const stage of ['SEWING','FINISHING','COUNTING']){
      const quantity=!multiRound&&stage==='SEWING'?2:1,a=await assign(f,job,stage,quantity,{repair_ticket_id:ticket.id});
      source=multiRound&&round===0&&stage==='COUNTING'?await report(f,a,0,1):await report(f,a,1,0,!multiRound&&stage==='SEWING'?1:0);await approve(f,source);
    }
    if(round===0&&multiRound)await denied('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('second-round-unresolved')},f.manager.session);
  }
  await receipt(f,job,multiRound?2:1,`extra-repaired-${job.order.id}`);
  await must('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key(`extra-repair-complete-${job.order.id}`)},f.manager.session);
  assert.equal((await sql('select count(*)::int n from local_production_entries where source_stage_event_id in (select id from local_production_stage_events where production_order_id=$1)',[job.order.id])).rows[0].n,1);
}
const receiveBody=(f,job,quantity,label,cost='50000')=>({production_batch_id:job.batch.id,order_item_id:job.item.id,inventory_item_id:f.finished.id,warehouse_id:f.warehouse,quantity,unit_cost:cost,confirm_product_mapping:true,idempotency_key:key(label)});
async function receipt(f,job,quantity,label,cost='50000'){
  const body=receiveBody(f,job,quantity,label,cost);const result=await must('POST',`${workspace}/${job.order.id}/receive`,body,f.manager.session);
  const retry=await must('POST',`${workspace}/${job.order.id}/receive`,body,f.manager.session);assert.equal(retry.output.id,result.output.id);assert.equal(retry.movement.id,result.movement.id);
  return result.output;
}
async function sales(f){
  const source=await must('POST','/api/orders',{order_number:`WS-SALE-${token}`,manager_id:f.sale.user.user_id,status:'processing',items:[{id:`blue-${token}`,originalProductId:f.product.id,quantity:10,color:'Xanh',size:'M'},{id:`red-${token}`,originalProductId:f.product.id,quantity:4,color:'Đỏ',size:'L'}]},f.manager.session);
  const sources=list(await must('GET','/api/production/source-orders',undefined,f.sale.session));
  const lines=sources.find(x=>x.id===source.id).items;assert.equal(lines.length,2);assert.notEqual(lines[0].source_line_key,lines[1].source_line_key,'Same SKU collapsed two source-line identities.');
  const request=await must('POST','/api/production-sales/requests',{order_id:source.id,idempotency_key:key('sale-submit'),lines:lines.map(line=>({source_line_key:line.source_line_key,quantity:line.ordered_quantity}))},f.sale.session);
  await must('POST',`/api/production-sales/requests/${request.id}/review`,{target_status:'ACCEPTED',reason:'Tiếp nhận',idempotency_key:key('sale-accept')},f.manager.session);
  const allocated=await must('POST',`/api/production-sales/requests/${request.id}/allocate`,{planned_start_date:dates.first,idempotency_key:key('sale-allocate'),lines:request.lines.map(line=>({request_line_id:line.id,quantity:line.requested_quantity,fabric_variant_id:f.fabric}))},f.manager.session);
  assert.equal(allocated.orders.length,2);const jobs=await Promise.all(allocated.orders.map(order=>prepare(f,order))),job=jobs.find(x=>Number(x.item.planned_quantity)===10);job.peer=jobs.find(x=>Number(x.item.planned_quantity)===4);job.sale=source;assert(job.peer);return job;
}
async function mixedUnitsAndMissingRole(f){
  // The board labels these totals as metres; accessory PIECE quantities must
  // not inflate them, but missing accessories must still block cutting.
  const accessory=await must('POST','/api/inventory/items',{code:`WS-PHU-${token}`,name:'Phụ liệu kiểm thử',item_type:'SUPPLY',base_unit:'PIECE'},f.admin);
  const opening=await must('POST','/api/inventory/documents',{document_type:'OPENING_BALANCE',warehouse_id:f.warehouse,transaction_at:dates.start,idempotency_key:key('mixed-opening'),lines:[{inventory_item_id:accessory.id,quantity:50,unit:'PIECE',input_unit_cost:1000}]},f.admin);
  await must('POST',`/api/inventory/documents/${opening.id}/confirm`,{},f.admin);
  const product=await must('POST','/api/catalog/products',{sku:`WS-MIX-${token}`,name:'BOM mét và phụ liệu'},f.admin);
  await manufacturing(product.id,f.manager.session,{lines:[
    {inventory_item_id:f.material.id,line_type:'MATERIAL',quantity_method:'PER_UNIT',standard_quantity:2,unit:'METER',waste_rate:0,scrap_rate:0},
    {inventory_item_id:accessory.id,line_type:'MATERIAL',quantity_method:'PER_UNIT',standard_quantity:3,unit:'PIECE',waste_rate:0,scrap_rate:0},
  ]});
  const group=await must('POST','/api/production-orders/groups',{source_type:'MANUAL',idempotency_key:key('mixed-order'),lines:[{product_id:product.id,quantity:2}]},f.manager.session),order=group.orders[0];f.ids.push(order.id);
  await must('POST',`/api/production-orders/${order.id}/release`,{idempotency_key:key('mixed-release')},f.manager.session);
  const details=await must('GET',`${workspace}/${order.id}/details`,undefined,f.manager.session),batch=details.batches[0],item=details.items[0];
  const estimate=await must('POST',`/api/production-orders/${order.id}/cutting-estimates`,{production_batch_id:batch.id,idempotency_key:key('mixed-estimate'),lines:[f.material.id,accessory.id].map(inventory_item_id=>({order_item_id:item.id,inventory_item_id,warehouse_id:f.warehouse,output_quantity:2,calculation_method:'BOM_PER_UNIT'}))},f.manager.session);
  await must('POST',`/api/cutting-estimates/${estimate.id}/submit`,{idempotency_key:key('mixed-submit')},f.manager.session);
  await must('POST',`/api/cutting-estimates/${estimate.id}/review`,{target_status:'APPROVED',reason:'Duyệt BOM khác đơn vị',idempotency_key:key('mixed-review')},f.admin);
  const material=async()=>{const board=await must('GET',`${workspace}?orderId=${order.id}`,undefined,f.manager.session);assert.equal(board.rows.length,1);return board.rows[0].material;};
  const issue=async(inventoryId,quantity,label)=>{const line=estimate.lines.find(x=>x.inventory_item_id===inventoryId);assert(line);const posted=await must('POST',`/api/cutting-estimates/${estimate.id}/material-issue`,{warehouse_id:f.warehouse,lines:[{estimate_line_id:line.id,quantity}],idempotency_key:key(label)},f.manager.session);await must('POST',`/api/inventory/documents/${posted.document?.id||posted.id}/confirm`,{},f.admin);};
  let projected=await material();assert.equal(Number(projected.estimated),4);assert.equal(Number(projected.issued),0);assert.equal(projected.has_shortage,true);
  await issue(f.material.id,4,'mixed-issue-metres');projected=await material();assert.equal(Number(projected.estimated),4);assert.equal(Number(projected.issued),4);assert.equal(projected.has_shortage,true,'Missing PIECE accessory disappeared from shortage calculation.');
  const publish={production_order_id:order.id,production_batch_id:batch.id,order_item_id:item.id,stage:'CUTTING',eligible_worker_type:'CUTTER',quantity:2,assigned_from:dates.first,idempotency_key:key('mixed-cutting')};
  await denied('POST',`${dispatch}/publications`,publish,f.manager.session,[409]);
  await issue(accessory.id,6,'mixed-issue-accessory');projected=await material();assert.equal(Number(projected.estimated),4);assert.equal(Number(projected.issued),4);assert.equal(projected.has_shortage,false);
  const publication=await must('POST',`${dispatch}/publications`,publish,f.manager.session);
  const generic=await actor(f.admin,'GENERIC_SETUP','employee','GENERIC',['production_view','production_operations']);
  const self=await must('GET',workspace,undefined,generic.session);assert.equal(self.mode,'SELF');assert.equal(self.worker.worker_type,'GENERIC');assert.deepEqual(self.rows,[]);
  const mine=await must('GET',`${dispatch}/mine`,undefined,generic.session);assert.deepEqual(mine.publications,[]);assert.deepEqual(mine.assignments,[]);
  await denied('POST',`${dispatch}/publications/${publication.id}/claim`,{quantity:1,idempotency_key:key('generic-cannot-claim')},generic.session,[409]);
  await denied('GET',`${workspace}/${order.id}/details`,undefined,generic.session,[403]);
}
async function previewMaterialsAndReturn(f){
  const job=await manual(f,5,'Tiền trước khi gửi và mô tả vải an toàn');
  const sourceRows=list(await must('GET',`/api/inventory/return-sources?productionOrderId=${job.order.id}&batchId=${job.batch.id}`,undefined,f.manager.session));
  assert.equal(sourceRows.length,1);const source=sourceRows[0];
  assert.equal(source.production_order_id,job.order.id);assert.equal(source.production_batch_id,job.batch.id);assert.equal(source.order_item_id,job.item.id);
  assert.equal(source.inventory_item_id,f.material.id);assert(source.inventory_item_name&&source.warehouse_name&&source.cutting_estimate_line_id);
  assert(!Object.keys(source).some(k=>/cost|price|value/i.test(k)),'Return source leaked inventory valuation.');
  assert.deepEqual(list(await must('GET',`/api/inventory/return-sources?productionOrderId=${job.order.id}&batchId=${randomUUID()}`,undefined,f.manager.session)),[],'Return source ignored batch filter.');
  const returnBody={document_type:'RETURN_IN',warehouse_id:f.warehouse,production_order_id:job.order.id,transaction_at:dates.first,reason:'Trả dư có liên kết nguồn',description:'Trả dư có liên kết nguồn',idempotency_key:key('preview-material-return'),lines:[{inventory_item_id:f.material.id,quantity:1,unit:'METER',source_movement_id:source.id}]};
  await denied('POST','/api/inventory/documents',{...returnBody,reason:'',idempotency_key:key('return-reason-required')},f.manager.session,[400]);
  const returned=await must('POST','/api/inventory/documents',returnBody,f.manager.session);
  assert.equal((await must('POST','/api/inventory/documents',returnBody,f.manager.session)).id,returned.id);
  await must('POST',`/api/inventory/documents/${returned.id}/confirm`,{},f.admin);
  await must('POST',`/api/inventory/documents/${returned.id}/confirm`,{},f.admin);
  const after=list(await must('GET',`/api/inventory/return-sources?productionOrderId=${job.order.id}&batchId=${job.batch.id}`,undefined,f.manager.session));
  assert.equal(Number(after.find(s=>s.id===source.id).remaining_quantity),9);
  const gateBody={production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,worker_id:f.cutter.worker.id,stage:'CUTTING',quantity:5,assigned_from:dates.first,idempotency_key:key('preview-return-gate')};
  await denied('POST',`${dispatch}/assignments`,gateBody,f.manager.session,[409]);
  const reissue=await must('POST',`/api/cutting-estimates/${source.cutting_estimate_id}/material-issue`,{warehouse_id:f.warehouse,idempotency_key:key('preview-reissue'),lines:[{estimate_line_id:source.cutting_estimate_line_id,quantity:1}]},f.manager.session);
  await must('POST',`/api/inventory/documents/${reissue.document?.id||reissue.id}/confirm`,{},f.admin);
  const cut=await assign(f,job,'CUTTING',5);
  const mine=await must('GET',`${dispatch}/mine`,undefined,f.cutter.session),selfCut=mine.assignments.find(a=>a.id===cut.row.id);
  assert(selfCut&&selfCut.materials?.length===1,'Cutter cannot identify material to cut.');
  const material=selfCut.materials[0];assert.equal(material.inventory_item_code,f.material.code);assert.equal(material.inventory_item_name,f.material.name);assert.equal(material.variant_name,'Vải kiểm thử');assert.equal(material.color,'Xanh');assert.equal(material.unit,'METER');assert.equal(Number(material.estimated_quantity),10);assert.equal(Number(material.issued_quantity),11);assert.equal(Number(material.returned_quantity),1);
  console.log('PASS workspace fabric reconciliation: planned10m for5units; issued10m -> returned1m => net9m blockscut; reissued1m => issued11m-returned1m=net10m unlockscut; exact-key return/confirm retries unchanged.');
  assert(!Object.keys(material).some(k=>/cost|price|value|rate/i.test(k)),'Self cutter materials leaked monetary values.');
  const preview=(assignment,good,session=assignment.person.session,date=dates.first)=>must('GET',`${dispatch}/assignments/${assignment.row.id}/pay-preview?work_date=${date}&quantity_good=${good}`,undefined,session);
  assert.equal((await preview(cut,1)).status,'NON_PAYABLE');
  await approve(f,await report(f,cut,5));const sew=await assign(f,job,'SEWING',5);
  const counts=async()=>(await sql('select (select count(*)::int from local_production_stage_events where assignment_id=$1) reports,(select count(*)::int from local_production_entries where source_stage_event_id in (select id from local_production_stage_events where assignment_id=$1)) entries',[sew.row.id])).rows[0];
  const before=await counts(),first=await preview(sew,3.25);assert.equal(first.status,'READY');assert.equal(first.piece_rate_code,f.code);assert.equal(Number(first.rate_amount),12500.25);assert.equal(first.pending_amount,'40625.81');assert.deepEqual(await counts(),before,'GET preview mutated production or payroll.');
  await denied('GET',`${dispatch}/assignments/${sew.row.id}/pay-preview?work_date=${dates.first}&quantity_good=1`,undefined,f.cutter.session,[403]);
  await denied('GET',`${dispatch}/assignments/${sew.row.id}/pay-preview?work_date=${dates.first}&quantity_good=6`,undefined,f.sewer.session,[409]);
  await denied('GET',`${dispatch}/assignments/${sew.row.id}/pay-preview?work_date=2026-02-31&quantity_good=1`,undefined,f.sewer.session,[400]);
  await denied('GET',`${dispatch}/assignments/${sew.row.id}/pay-preview?work_date=${dates.first}&quantity_good=1.001`,undefined,f.sewer.session,[400]);
  await sql("update local_worker_payroll_profiles set piece_output_enabled=false where worker_id=$1 and status='APPROVED'",[f.sewer.worker.id]);
  try{const unavailable=await preview(sew,1);assert.equal(unavailable.status,'UNAVAILABLE');assert.equal(unavailable.pending_amount,null);assert(unavailable.reason);}finally{await sql("update local_worker_payroll_profiles set piece_output_enabled=true where worker_id=$1 and status='APPROVED'",[f.sewer.worker.id]);}
  await report(f,sew,3.25);assert.equal((await preview(sew,1.75)).pending_amount,'21875.44');
  await denied('GET',`${dispatch}/assignments/${sew.row.id}/pay-preview?work_date=${dates.first}&quantity_good=2`,undefined,f.sewer.session,[409]);
}
async function operationalRoles(f){
  const planner=await actor(f.admin,'LIMITED_PLANNER','employee','CUTTER',['production_cutting_plan']);
  (f.qaAccounts??={}).dualRolePlanner=planner;
  const inventory=await actor(f.admin,'LIMITED_INVENTORY','employee','HELPER',['inventory_view','inventory_documents','inventory_confirm']);
  const job=await manual(f,2,'Vai trò dự toán và kho độc lập');
  for(const person of [planner,inventory]){
    const board=await must('GET',`${workspace}?orderId=${job.order.id}`,undefined,person.session);
    assert.equal(board.mode,'OPERATIONS');assert.equal(board.rows.length,1);assert.equal(board.permissions.manage,false);assert.equal(board.permissions.dispatch,false);assert.equal(board.permissions.review,false);assert.equal(board.permissions.ship,false);
    assert.equal(board.permissions.plan,person===planner);assert.equal(board.permissions.inventory,person===inventory);
    assert.equal(board.worker?.id,person.worker.id,'Operational rights hid the same account\'s linked worker.');
    assert.equal(board.worker?.worker_type,person.worker.worker_type);
    const detail=await must('GET',`${workspace}/${job.order.id}/details`,undefined,person.session);
    assert(detail.material_options?.inventory.some(x=>x.id===f.material.id),'Scoped estimator material choices are missing.');
    assert(detail.material_options.warehouses.some(x=>x.id===f.warehouse));
    assert(!JSON.stringify(detail.material_options).match(/"(?:unit_cost|value_delta|rate_amount|average_cost|cost_price)"/),'Operational choices leaked monetary values.');
    assert.deepEqual(detail.shipments,[]);assert.deepEqual(detail.tickets,[]);
    await denied('GET',`${dispatch}?orderId=${job.order.id}`,undefined,person.session,[403]);
    await denied('POST',`${workspace}/workers/${f.cutter.worker.id}/type`,{worker_type:'QC',reason:'No worker management permission',idempotency_key:key(`role-deny-worker-${person.worker.id}`)},person.session,[403]);
  }
  await denied('GET','/api/inventory/items',undefined,planner.session,[403]);
  await denied('GET','/api/inventory/warehouses',undefined,planner.session,[403]);
  const dualJob=await manual(f,1,'Thợ cắt kiêm lập dự toán vẫn nhận việc của mình');
  const dualPublication=await must('POST',`${dispatch}/publications`,{production_order_id:dualJob.order.id,production_batch_id:dualJob.batch.id,order_item_id:dualJob.item.id,stage:'CUTTING',eligible_worker_type:'CUTTER',quantity:1,assigned_from:dates.first,idempotency_key:key('dual-planner-publication')},f.manager.session);
  assert((await must('GET',`${dispatch}/mine`,undefined,planner.session)).publications.some(p=>p.id===dualPublication.id),'Dual-role cutter cannot read eligible work.');
  const dualAssignment=unwrap(await must('POST',`${dispatch}/publications/${dualPublication.id}/claim`,{quantity:1,idempotency_key:key('dual-planner-claim')},planner.session),'assignment');assert.equal(dualAssignment.worker_id,planner.worker.id);
  const dualReport=await report(f,{row:dualAssignment,person:planner},1);assert.equal(dualReport.created_by,planner.user.user_id);
  const dualSnapshot=await snapshotAll([dualJob.order.id]);
  await denied('POST',`/api/production-orders/${dualJob.order.id}/transition`,{target_status:'ON_HOLD',reason:'Planner vẫn không được quản lý toàn lệnh'},planner.session,[403]);
  await denied('POST',`${dispatch}/reports/${dualReport.id}/review`,{target_status:'APPROVED',idempotency_key:key('dual-planner-no-review')},planner.session,[403]);
  assert.deepEqual(await snapshotAll([dualJob.order.id]),dualSnapshot,'Operational+worker rights escalated into management/review.');
  await approve(f,dualReport);
  await must('GET',`/api/production-orders/${job.order.id}/cutting-estimates`,undefined,inventory.session);
  const group=await must('POST','/api/production-orders/groups',{source_type:'MANUAL',idempotency_key:key('planner-draft-order'),lines:[{product_id:f.product.id,quantity:1,fabric_variant_id:f.fabric}]},f.manager.session),draft=group.orders[0];f.ids.push(draft.id);
  await must('POST',`/api/production-orders/${draft.id}/release`,{idempotency_key:key('planner-draft-release')},f.manager.session);
  const detail=await must('GET',`${workspace}/${draft.id}/details`,undefined,planner.session);
  const estimate=await must('POST',`/api/production-orders/${draft.id}/cutting-estimates`,{production_batch_id:detail.batches[0].id,lines:[{order_item_id:detail.items[0].id,fabric_variant_id:f.fabric,inventory_item_id:f.material.id,warehouse_id:f.warehouse,output_quantity:1,calculation_method:'BOM_PER_UNIT'}],idempotency_key:key('planner-own-estimate')},planner.session);
  await must('POST',`/api/cutting-estimates/${estimate.id}/submit`,{idempotency_key:key('planner-own-submit')},planner.session);
  await denied('POST',`/api/cutting-estimates/${estimate.id}/review`,{target_status:'APPROVED',reason:'Planner must not approve independently',idempotency_key:key('planner-cannot-review')},planner.session,[403]);
  await stages(f,job,2);
  await denied('POST',`${workspace}/${job.order.id}/receive`,receiveBody(f,job,1,'planner-no-stock'),planner.session,[403]);
  await denied('POST',`${workspace}/${job.order.id}/receive`,receiveBody(f,job,1,'inventory-cannot-set-cost'),inventory.session,[403]);
  const receiptBody=receiveBody(f,job,1,'inventory-dedicated-receive',null),received=await must('POST',`${workspace}/${job.order.id}/receive`,receiptBody,inventory.session);
  assert.equal(received.output.valuation_status,'UNVALUED');assert.equal(received.movement.unit_cost,null);assert.equal(received.movement.value_delta,null);
  assert.equal((await must('POST',`${workspace}/${job.order.id}/receive`,receiptBody,inventory.session)).movement.id,received.movement.id);
  await denied('POST',`${workspace}/${job.order.id}/receive`,receiveBody(f,job,2,'inventory-overreceive',null),inventory.session,[409]);
  await denied('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('inventory-cannot-complete')},inventory.session,[403]);
}
async function workspaceWorkerMetadata(f){
  const linked=await actor(f.admin,'WORKER_METADATA_LINKED','employee','CUTTER',['production_cutting_plan']);
  const other=await actor(f.admin,'WORKER_METADATA_OTHER','employee','CUTTER',['production_cutting_plan']);
  const missing=await actor(f.admin,'WORKER_METADATA_NONE','employee','CUTTER',['production_cutting_plan']);
  await must('PATCH',`/api/users/${missing.user.user_id}/worker-link`,{worker_id:null,reason:'Fixture hồ sơ chưa liên kết'},f.admin);
  const state=async()=>(await sql('select id,user_id,worker_type,is_active from local_workers where id=any($1::uuid[]) order by id',[[linked.worker.id,other.worker.id,missing.worker.id]])).rows;
  const linksBefore=await state();
  for(const person of [linked,other]){
    const result=await must('GET',workspace,undefined,person.session);assert.equal(result.mode,'OPERATIONS');assert.deepEqual(result.worker_link,{status:'LINKED',active_count:1});assert.equal(result.worker.id,person.worker.id);
  }
  const none=await must('GET',workspace,undefined,missing.session);assert.equal(none.mode,'OPERATIONS');assert.deepEqual(none.worker_link,{status:'NONE',active_count:0});assert.equal(none.worker,undefined);
  assert.deepEqual(await state(),linksBefore,'Reading operational worker metadata created or relinked worker profiles.');
  // The unique user_id index makes >1 linked row structurally impossible. Do not
  // drop it to reach an otherwise defensive AMBIGUOUS branch in a runtime test.
  const refusal=await denied('PATCH',`/api/users/${linked.user.user_id}/worker-link`,{worker_id:other.worker.id,reason:'Không được chiếm hồ sơ đã thuộc tài khoản khác'},f.admin,[409]);assert.match(refusal.payload.message,/liên kết.*khác/);assert.deepEqual(await state(),linksBefore,'Rejected worker link changed either account\'s existing profile.');
  const selfMissing=await actor(f.admin,'WORKER_METADATA_SELF_NONE','employee','CUTTER',['production_view','production_operations']);await must('PATCH',`/api/users/${selfMissing.user.user_id}/worker-link`,{worker_id:null,reason:'Fixture tự phục vụ chưa có hồ sơ'},f.admin);
  await denied('GET',workspace,undefined,selfMissing.session,[409]);
}
async function pendingStageProjection(f){
  const job=await manual(f,10,'Báo chờ duyệt nhiều công đoạn và đúng phạm vi');
  const otherBatch=await must('POST',`${dispatch}/batches/${job.batch.id}/split`,{planned_quantity:2,batch_number:`PENDING-SPLIT-${token}`,reason:'Báo cùng lệnh khác lô không được tăng bộ đếm',idempotency_key:key('pending-split')},f.manager.session);
  const estimate=await must('POST',`/api/production-orders/${job.order.id}/cutting-estimates`,{production_batch_id:otherBatch.id,lines:[{order_item_id:job.item.id,fabric_variant_id:f.fabric,inventory_item_id:f.material.id,warehouse_id:f.warehouse,output_quantity:2,calculation_method:'BOM_PER_UNIT'}],idempotency_key:key('pending-split-estimate')},f.manager.session);
  await must('POST',`/api/cutting-estimates/${estimate.id}/submit`,{idempotency_key:key('pending-split-submit')},f.manager.session);
  await must('POST',`/api/cutting-estimates/${estimate.id}/review`,{target_status:'APPROVED',reason:'Duyệt lô độc lập để kiểm phạm vi',idempotency_key:key('pending-split-review')},f.admin);
  const issue=await must('POST',`/api/cutting-estimates/${estimate.id}/material-issue`,{warehouse_id:f.warehouse,lines:[{estimate_line_id:estimate.lines[0].id,quantity:4}],idempotency_key:key('pending-split-material')},f.manager.session);
  await must('POST',`/api/inventory/documents/${issue.document?.id||issue.id}/confirm`,{},f.admin);
  const differentBatch=await assign(f,{...job,batch:otherBatch},'CUTTING',1);await report(f,differentBatch,1);
  const firstCut=await assign(f,job,'CUTTING',4);await approve(f,await report(f,firstCut,4));
  const laterCut=await assign(f,job,'CUTTING',3),cutPending=await report(f,laterCut,2),cutPendingSecond=await report(f,laterCut,1);
  const sewing=await assign(f,job,'SEWING',4),sewPending=await report(f,sewing,4);
  const foreign=await manual(f,1,'Báo ngoài lệnh không tăng bộ đếm');const foreignCut=await assign(f,foreign,'CUTTING',1);await report(f,foreignCut,1);
  const inspect=async()=>{
    const board=await must('GET',`${workspace}?orderId=${job.order.id}`,undefined,f.manager.session);assert.equal(board.rows.length,2);const projected=board.rows.find(row=>row.batch_id===job.batch.id&&row.item_id===job.item.id),separate=board.rows.find(row=>row.batch_id===otherBatch.id&&row.item_id===job.item.id);assert(projected&&separate);assert.equal(Number(separate.pending_by_stage?.CUTTING),1,'Other batch pending report lost its own independent counter.');assert.equal(Number(separate.pending_reports),1);
    const expected=(await sql("select stage,count(*)::int n from local_production_stage_events where production_order_id=$1 and production_batch_id=$2 and order_item_id=$3 and status='SUBMITTED' group by stage order by stage",[job.order.id,job.batch.id,job.item.id])).rows;
    for(const stage of ['CUTTING','SEWING','FINISHING','COUNTING'])assert.equal(Number(projected.pending_by_stage?.[stage]||0),expected.find(e=>e.stage===stage)?.n||0,'Per-stage pending count mixed scopes, quantity or non-SUBMITTED statuses.');
    assert.equal(Number(projected.pending_reports),expected.reduce((sum,e)=>sum+e.n,0));return projected;
  };
  let projected=await inspect();assert.equal(Number(projected.pending_by_stage.CUTTING),2);assert.equal(Number(projected.pending_by_stage.SEWING),1);assert.equal(projected.pending_reports,3);
  await approve(f,cutPending);await must('POST',`${dispatch}/reports/${cutPending.id}/reverse`,{reason:'Loại báo đã đảo khỏi số chờ duyệt',idempotency_key:key('pending-projection-reverse')},f.manager.session);projected=await inspect();assert.equal(Number(projected.pending_by_stage.CUTTING),1);assert.equal(Number(projected.pending_by_stage.SEWING),1);
  await approve(f,cutPendingSecond);await approve(f,sewPending);
  const finishing=await assign(f,job,'FINISHING',4);await approve(f,await report(f,finishing,4));const counter=await assign(f,job,'COUNTING',4),bad=await report(f,counter,3,1);await approve(f,bad);
  const ticket=await must('POST',`${workspace}/${job.order.id}/repair-tickets`,{source_stage_event_id:bad.id,quantity:1,target_stage:'SEWING',reason:'Sửa để kiểm bộ đếm báo sửa',idempotency_key:key('pending-projection-ticket')},f.manager.session);
  const repair=await assign(f,job,'SEWING',1,{repair_ticket_id:ticket.id});projected=await inspect();assert(Number(projected.repair_by_stage?.SEWING)>0,'Active repair stage is absent from independent membership data.');await report(f,repair,1);projected=await inspect();assert.equal(Number(projected.pending_by_stage.SEWING),1,'Submitted repair reports were omitted from stage pending count.');assert.equal(projected.pending_reports,1);
}
async function reviewerWorkspaceAccess(f){
  const actors=[];
  for(const role of ['accountant','team_leader'])for(const linked of [false,true]){
    const person=await actor(f.admin,`REVIEW_WORKSPACE_${role.toUpperCase()}_${linked?'LINKED':'NONE'}`,role,'GENERIC',['production_attendance_approve']);
    if(!linked)await must('PATCH',`/api/users/${person.user.user_id}/worker-link`,{worker_id:null,reason:'Reviewer-only không bắt buộc có hồ sơ công nhân'},f.admin);
    actors.push({...person,linked,expectedReview:true});
    (f.qaAccounts??={})[`${role}Reviewer${linked?'Linked':'None'}`]=person;
  }
  const noPermission=await actor(f.admin,'REVIEW_WORKSPACE_NO_PERMISSION','accountant','GENERIC');actors.push({...noPermission,linked:true,expectedReview:false});
  const disabled=await actor(f.admin,'REVIEW_WORKSPACE_DISABLED','team_leader','GENERIC',['production_attendance_approve']);await sql("update local_employee_permissions set enabled=false where user_id=$1 and permission_type='production_attendance_approve'",[disabled.user.user_id]);actors.push({...disabled,linked:true,expectedReview:false});
  const employee=await actor(f.admin,'REVIEW_WORKSPACE_EMPLOYEE_APPROVE','employee','CUTTER',['production_attendance_approve']);actors.push({...employee,linked:true,expectedReview:false});
  const job=await manual(f,1,'Không lộ bảng điều hành qua quyền duyệt');
  const personIds=actors.map(p=>p.user.user_id),workerIds=actors.map(p=>p.worker.id);
  const configuration=async()=>({permissions:(await sql('select to_jsonb(p) row from local_employee_permissions p where user_id=any($1::text[]) order by user_id,permission_type',[personIds])).rows.map(r=>r.row),workers:(await sql('select to_jsonb(w) row from local_workers w where id=any($1::uuid[]) order by id',[workerIds])).rows.map(r=>r.row),profiles:(await sql('select to_jsonb(p) row from local_user_profiles p where user_id=any($1::text[]) order by user_id',[personIds])).rows.map(r=>r.row)});
  const before=await configuration(),business=await snapshotAll([job.order.id]);
  for(const person of actors){
    const board=await must('GET',`${workspace}?orderId=${job.order.id}`,undefined,person.session);
    assert.deepEqual(board.rows,[],'Approver/SELF-only access leaked the production board.');assert.equal(board.mode,person.expectedReview?'REVIEW':'SELF');assert.deepEqual(board.worker_link,{status:person.linked?'LINKED':'NONE',active_count:person.linked?1:0});
    if(person.linked)assert.equal(board.worker?.id,person.worker.id);else assert.equal(board.worker,undefined);
    if(person.expectedReview){
      assert.deepEqual(Object.keys(board).sort(),['mode','worker_link','rows','permissions','version',...(person.linked?['worker']:[])].sort(),'Reviewer workspace leaked unrelated board/material/payroll fields.');
      const expectedKeys=['manage','release','complete','inventory','inventory_cost','create_inventory_item','plan','dispatch','material_read','sales','ship','review'];
      assert.deepEqual(Object.keys(board.permissions).sort(),expectedKeys.sort());
      for(const [permission,value]of Object.entries(board.permissions))assert.equal(value,permission==='review',`Reviewer-only acquired implicit ${permission} rights.`);
      const queue=await must('GET',`${dispatch}/review-queue?limit=1`,undefined,person.session);assert(Array.isArray(queue.reports));assert(Array.isArray(queue.assignments));
    }else{
      assert.equal(board.permissions?.review,undefined);await denied('GET',`${dispatch}/review-queue`,undefined,person.session,[403]);
    }
    await denied('GET',`${workspace}/${job.order.id}/details`,undefined,person.session,[403]);
    await denied('GET',`${workspace}/reference-images?product_id=${f.product.id}`,undefined,person.session,[403]);
    await denied('GET',`${dispatch}?orderId=${job.order.id}`,undefined,person.session,[403]);
    await denied('POST',`/api/production-orders/${job.order.id}/transition`,{target_status:'ON_HOLD',reason:'Quyền duyệt không phải quyền quản lý'},person.session,[403]);
    await denied('POST',`${dispatch}/assignments`,{production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,worker_id:f.cutter.worker.id,stage:'CUTTING',quantity:1,assigned_from:dates.first,idempotency_key:key(`reviewer-no-dispatch-${person.worker.id}`)},person.session,[403]);
  }
  assert.deepEqual(await configuration(),before,'Workspace/queue reads or refusals changed permission grants, profile or worker links.');assert.deepEqual(await snapshotAll([job.order.id]),business,'Reviewer-only access or refusals mutated production/stock/payroll/audit.');
  // Losing approval must fail closed without granting replacement operational
  // rights or forcing an account/worker creation to keep a page accessible.
  const revoked=actors.find(p=>p.expectedReview&&!p.linked);await sql("update local_employee_permissions set enabled=false where user_id=$1 and permission_type='production_attendance_approve'",[revoked.user.user_id]);
  const afterRevocation=await configuration();await denied('GET',workspace,undefined,revoked.session,[409]);await denied('GET',`${dispatch}/review-queue`,undefined,revoked.session,[403]);assert.deepEqual(await configuration(),afterRevocation);await sql("update local_employee_permissions set enabled=true where user_id=$1 and permission_type='production_attendance_approve'",[revoked.user.user_id]);
}
async function globalReviewQueue(f){
  const reviewer=await actor(f.admin,'GLOBAL_REVIEW_ONLY','accountant','GENERIC',['production_attendance_approve']);
  const deniedAccountant=await actor(f.admin,'GLOBAL_REVIEW_NONE','accountant','GENERIC');
  const employee=await actor(f.admin,'GLOBAL_REVIEW_EMPLOYEE','employee','CUTTER',['production_manage','production_attendance_approve']);
  const leaderA=await actor(f.admin,'GLOBAL_REVIEW_LEADER_A','team_leader','CUTTER',['production_operations','production_attendance_approve']);
  const leaderB=await actor(f.admin,'GLOBAL_REVIEW_LEADER_B','team_leader','SUPERVISOR',['production_operations','production_attendance_approve']);
  const noApproveLeader=await actor(f.admin,'GLOBAL_REVIEW_LEADER_NONE','team_leader','SUPERVISOR',['production_manage']);
  const member=await actor(f.admin,'GLOBAL_REVIEW_MEMBER','employee','CUTTER',['production_view','production_operations']);
  // Do not infer scope from the assignment start date or today's membership:
  // the same assignment has reports on either side of an effective-date change.
  // Self-supervision is already forbidden by a database CHECK; do not weaken
  // it merely to exercise a second defensive own-worker exclusion branch.
  await sql("insert into local_payroll_team_assignments(supervisor_worker_id,worker_id,effective_from,effective_to,reason,created_by) values($1,$3,$4,$5,'Isolated report-date scope','local-admin'),($2,$3,$6,$7,'Isolated report-date scope','local-admin')",[leaderA.worker.id,leaderB.worker.id,member.worker.id,dates.start,dates.first,dates.second,dates.end]);
  const first=await manual(f,8,'Duyệt nhanh lệnh A'),second=await manual(f,3,'Duyệt nhanh lệnh B');
  const memberFixture={...f,cutter:member},ownFixture={...f,cutter:leaderA};
  const a=await assign(memberFixture,first,'CUTTING',4),b=await assign(memberFixture,second,'CUTTING',2);
  const early=await report(f,a,1,0,0,dates.first),late=await report(f,a,1,0,0,dates.second),otherOrder=await report(f,b,1,0,0,dates.first);
  const own=await assign(ownFixture,first,'CUTTING',1);
  const ownWorker=await report(f,{...own,person:f.manager},1);
  const outsider=await assign(f,first,'CUTTING',1),outsideReport=await report(f,outsider,1);
  const maker=await assign(memberFixture,first,'CUTTING',1),makerReport=await report(f,{...maker,person:leaderA},1);
  const managerMade=await assign(memberFixture,first,'CUTTING',1),managerReport=await report(f,{...managerMade,person:f.manager},1);
  const path=`${dispatch}/review-queue`,scopeIds=[first.order.id,second.order.id],before=await snapshotAll(scopeIds);
  const fields={report:['id','assignment_id','worker_name','stage','work_date','quantity_good','status','created_by'].sort(),assignment:['id','production_order_id','production_batch_id','order_item_id','dispatch_stage','dispatch_status','production_order_number','order_status','batch_status','product_name','assigned_from','assigned_to'].sort()};
  const validate=(page,limit)=>{
    assert.deepEqual(Object.keys(page).sort(),['assignments','reports','total','has_more','next_cursor','limit'].sort());assert.equal(page.limit,limit);assert(page.reports.length<=limit);assert.equal(typeof page.total,'number');assert.equal(typeof page.has_more,'boolean');
    assert.equal(page.next_cursor,page.has_more?page.reports.at(-1)?.id:null);assert.equal(new Set(page.assignments.map(a=>a.id)).size,page.assignments.length);
    assert.deepEqual(new Set(page.assignments.map(a=>a.id)),new Set(page.reports.map(r=>r.assignment_id)),'Review DTO includes assignments outside this page.');
    for(const value of page.reports){assert.deepEqual(Object.keys(value).sort(),fields.report);assert.equal(value.status,'SUBMITTED');}
    for(const value of page.assignments)assert.deepEqual(Object.keys(value).sort(),fields.assignment,'Review DTO leaked unrelated payroll, stock, audit or personnel fields.');
  };
  const expected=async(person,team)=>(await sql(`select e.id from local_production_stage_events e join local_assignments a on a.id=e.assignment_id and a.dispatch_stage is not null join local_workers w on w.id=e.worker_id join local_production_orders o on o.id=a.production_order_id join local_production_batches b on b.id=a.production_batch_id where e.status='SUBMITTED' and e.created_by is distinct from $1::text ${team?`and e.worker_id<>$2::uuid and exists(select 1 from local_payroll_team_assignments t where t.supervisor_worker_id=$2 and t.worker_id=e.worker_id and t.status='ACTIVE' and t.effective_from<=e.work_date and (t.effective_to is null or t.effective_to>=e.work_date))`:''} order by e.id desc`,team?[person.user.user_id,person.worker.id]:[person.user.user_id])).rows.map(r=>r.id);
  const collect=async(person,team,limit)=>{
    const wanted=await expected(person,team),seen=[];let cursor=null,firstPage;
    do{
      const page=await must('GET',`${path}?limit=${limit}${cursor?`&cursor=${cursor}`:''}`,undefined,person.session);validate(page,limit);firstPage??=page;assert.equal(page.total,wanted.length,'Count must be authorized before cursor/limit, not page length.');seen.push(...page.reports.map(r=>r.id));cursor=page.next_cursor;assert(seen.length<=wanted.length,'Pagination repeated or widened authorized reports.');
    }while(cursor);
    assert.deepEqual(seen,wanted,'Scope or keyset pagination lost, duplicated or leaked pending reports.');return {ids:seen,firstPage};
  };
  for(const person of [deniedAccountant,employee,noApproveLeader,f.cutter])await denied('GET',path,undefined,person.session,[403]);
  const all=await collect(reviewer,false,2);assert(all.ids.includes(early.id)&&all.ids.includes(otherOrder.id),'Global review failed to span at least two production orders.');
  const left=await collect(leaderA,true,1),right=await collect(leaderB,true,2);
  assert(left.ids.includes(early.id)&&left.ids.includes(otherOrder.id)&&left.ids.includes(managerReport.id));
  assert(!left.ids.includes(late.id)&&!left.ids.includes(ownWorker.id)&&!left.ids.includes(outsideReport.id)&&!left.ids.includes(makerReport.id),'Leader queue widened date/team/own worker/self-maker scope.');
  assert.deepEqual(right.ids,[late.id],'Later team should receive only the later report from the same earlier-starting assignment.');
  const manager=await collect(f.manager,false,2);assert(!manager.ids.includes(managerReport.id)&&!manager.ids.includes(ownWorker.id),'Manager global queue includes reports created by the current actor.');
  const ignoredOrder=await must('GET',`${path}?limit=2&orderId=${first.order.id}`,undefined,leaderB.session);validate(ignoredOrder,2);assert.deepEqual(ignoredOrder.reports.map(r=>r.id),right.ids,'An extraneous orderId widened team report scope.');
  for(const query of ['limit=0','limit=101','limit=-1','limit=1.5','limit=abc','cursor=not-a-uuid'])await denied('GET',`${path}?${query}`,undefined,reviewer.session,[400]);
  const end=await must('GET',`${path}?limit=1&cursor=00000000-0000-0000-0000-000000000000`,undefined,leaderA.session);validate(end,1);assert.deepEqual(end.reports,[]);assert.equal(end.total,left.ids.length);
  assert.deepEqual(await snapshotAll(scopeIds),before,'Reading/refusing global review queue mutated production, payroll, inventory or audit.');
  for(const person of [employee,leaderA]){
    const id=person===leaderA?makerReport.id:early.id;
    await denied('POST',`${dispatch}/reports/${id}/review`,{target_status:'APPROVED',idempotency_key:key(`global-self-denied-${person.worker.id}`)},person.session,[403]);
    assert.deepEqual(await snapshotAll(scopeIds),before,'Employee/self-maker review denial mutated business data.');
  }
  // A report can become inactive between GET and POST. Server state, not the
  // client candidate list, remains the approval authority.
  await must('POST',`/api/production-orders/${second.order.id}/transition`,{target_status:'ON_HOLD',reason:'Kiểm tra thay đổi sau khi mở duyệt nhanh'},f.manager.session);
  const paused=await snapshotAll(scopeIds),pausedQueue=await collect(reviewer,false,2);assert(pausedQueue.ids.includes(otherOrder.id),'Paused SUBMITTED report disappeared instead of offering rejection correction.');
  await denied('POST',`${dispatch}/reports/${otherOrder.id}/review`,{target_status:'APPROVED',idempotency_key:key('global-approve-paused')},reviewer.session,[400,409]);assert.deepEqual(await snapshotAll(scopeIds),paused,'Paused approval left partial records.');
  await denied('POST',`${dispatch}/reports/${otherOrder.id}/review`,{target_status:'REJECTED',reason:' ',idempotency_key:key('global-reject-paused-no-reason')},reviewer.session,[400,409]);assert.deepEqual(await snapshotAll(scopeIds),paused,'Reasonless paused rejection mutated records.');
  const rejection={target_status:'REJECTED',reason:'Lệnh tạm dừng, cần xác nhận lại sản lượng',idempotency_key:key('global-reject-paused')};
  const rejected=await must('POST',`${dispatch}/reports/${otherOrder.id}/review`,rejection,reviewer.session);assert.equal(rejected.status,'REJECTED');assert.equal((await must('POST',`${dispatch}/reports/${otherOrder.id}/review`,rejection,reviewer.session)).id,rejected.id);
  assert(!(await collect(reviewer,false,2)).ids.includes(otherOrder.id),'Rejected report remained in the pending queue.');
}
async function scopedCuttingStock(f){
  const planner=await actor(f.admin,'STOCK_PLANNER','employee','CUTTER',['production_cutting_plan']);
  const inventory=await actor(f.admin,'STOCK_INVENTORY','employee','HELPER',['inventory_view','inventory_documents','inventory_confirm']);
  const partial=await actor(f.admin,'STOCK_PARTIAL_INVENTORY','employee','HELPER',['inventory_view','inventory_documents']);
  const viewer=await actor(f.admin,'STOCK_VIEWER','employee','CUTTER',['production_view']);
  const leader=await actor(f.admin,'STOCK_TEAM_LEADER','team_leader','SUPERVISOR',['production_view','production_cutting_plan','inventory_view','inventory_documents','inventory_confirm']);
  const limitedWarehouse=randomUUID(),foreignWarehouse=randomUUID();
  for(const [id,suffix] of [[limitedWarehouse,'LIMITED'],[foreignWarehouse,'FOREIGN']])await sql('insert into local_inventory_warehouses(id,code,name) values($1,$2,$3)',[id,`WS-STOCK-${suffix}-${token}`,`Kho kiểm thử ${suffix}`]);
  const foreignItem=await must('POST','/api/inventory/items',{code:`WS-FOREIGN-${token}`,name:'Vật tư không thuộc dự toán',item_type:'RAW_MATERIAL',base_unit:'METER'},f.admin);
  for(const [warehouse,inventoryId,quantity,label] of [[limitedWarehouse,f.material.id,5,'stock-limited'],[foreignWarehouse,f.material.id,333,'stock-other-warehouse'],[f.warehouse,foreignItem.id,777,'stock-foreign-item']]){
    const opening=await must('POST','/api/inventory/documents',{document_type:'OPENING_BALANCE',warehouse_id:warehouse,transaction_at:dates.start,idempotency_key:key(label),lines:[{inventory_item_id:inventoryId,quantity,unit:'METER',input_unit_cost:12345.67}]},f.admin);
    await must('POST',`/api/inventory/documents/${opening.id}/confirm`,{},f.admin);
  }
  const group=await must('POST','/api/production-orders/groups',{source_type:'MANUAL',planned_start_date:dates.first,lines:[{product_id:f.product.id,quantity:3,fabric_variant_id:f.fabric}],idempotency_key:key('stock-pairs-order')},f.manager.session),order=group.orders[0];f.ids.push(order.id);
  await must('POST',`/api/production-orders/${order.id}/release`,{idempotency_key:key('stock-pairs-release')},f.manager.session);
  const detail=await must('GET',`${workspace}/${order.id}/details`,undefined,f.manager.session),batch=detail.batches[0],item=detail.items[0];
  const estimate=await must('POST',`/api/production-orders/${order.id}/cutting-estimates`,{production_batch_id:batch.id,idempotency_key:key('stock-pairs-estimate'),lines:[[limitedWarehouse,4],[limitedWarehouse,6],[f.warehouse,3]].map(([warehouse_id,estimated_quantity])=>({order_item_id:item.id,fabric_variant_id:f.fabric,inventory_item_id:f.material.id,warehouse_id,output_quantity:1,calculation_method:'MANUAL_MEASURED',estimated_quantity,override_reason:'Đo riêng ba phần để kiểm nhu cầu cùng vật tư/kho'}))},f.manager.session);
  const path=`/api/production-orders/${order.id}/cutting-estimates`,before=await snapshotAll([order.id]);
  const expectedKeys=['inventory_item_id','warehouse_id','unit','stock_quantity','required_remaining','shortage_quantity'].sort();
  let canonical;
  for(const session of [f.admin,f.manager.session,planner.session,inventory.session]){
    const result=list(await must('GET',path,undefined,session)).find(e=>e.id===estimate.id);assert(result&&Array.isArray(result.stock));assert.equal(result.lines.length,3);assert.equal(result.stock.length,2,'Repeated item/warehouse demand must be grouped, not receive independent copies of stock.');
    for(const stock of result.stock){
      assert.deepEqual(Object.keys(stock).sort(),expectedKeys,'Stock projection returned values outside its quantity-only contract.');assert.equal(stock.inventory_item_id,f.material.id);assert.equal(stock.unit,'METER');assert([f.warehouse,limitedWarehouse].includes(stock.warehouse_id));
      const actual=(await sql('select coalesce(sum(quantity_delta),0) n from local_inventory_movements where inventory_item_id=$1 and warehouse_id=$2',[stock.inventory_item_id,stock.warehouse_id])).rows[0].n;
      assert.equal(Number(stock.stock_quantity),Number(actual),'Preview did not use the exact warehouse movement ledger.');
      assert.equal(Number(stock.required_remaining),stock.warehouse_id===limitedWarehouse?10:3);assert.equal(Number(stock.shortage_quantity),Math.max(Number(stock.required_remaining)-Number(actual),0));
    }
    assert.equal(Number(result.stock.find(s=>s.warehouse_id===limitedWarehouse).shortage_quantity),5,'Duplicate demand hid a real warehouse shortage.');
    if(canonical)assert.deepEqual(result.stock,canonical);else canonical=result.stock;
    const forged=list(await must('GET',`${path}?inventory_item_id=${foreignItem.id}&warehouse_id=${foreignWarehouse}`,undefined,session)).find(e=>e.id===estimate.id);assert.deepEqual(forged.stock,canonical,'Query parameters widened stock to an unrelated material or warehouse.');
  }
  for(const person of [f.cutter,viewer,partial,leader]){
    const result=list(await must('GET',path,undefined,person.session)).find(e=>e.id===estimate.id);assert(result);assert.equal(Object.hasOwn(result,'stock'),false,'SELF, partial warehouse or team-leader rights leaked warehouse stock.');
  }
  await denied('GET',path,undefined,f.outsider.session,[403]);
  assert.deepEqual(await snapshotAll([order.id]),before,'Stock preview mutated the production/inventory state.');
}
async function shippingWithoutCost(f){
  const shipping=await actor(f.admin,'LIMITED_SHIPPING','employee','HELPER',['orders','inventory_view','inventory_documents','inventory_confirm']);
  const source=await must('POST','/api/orders',{order_number:`WS-SHIP-${token}`,manager_id:shipping.user.user_id,status:'processing',items:[{id:`shipping-${token}`,originalProductId:f.product.id,quantity:1,color:'Xanh',size:'M'}]},f.manager.session);
  const sourceLine=list(await must('GET','/api/production/source-orders',undefined,f.manager.session)).find(x=>x.id===source.id).items[0];
  const request=await must('POST','/api/production-sales/requests',{order_id:source.id,idempotency_key:key('shipping-sale-submit'),lines:[{source_line_key:sourceLine.source_line_key,quantity:1}]},f.admin);
  await must('POST',`/api/production-sales/requests/${request.id}/review`,{target_status:'ACCEPTED',reason:'Tiếp nhận kiểm tra phân quyền giao',idempotency_key:key('shipping-sale-accept')},f.manager.session);
  const allocated=await must('POST',`/api/production-sales/requests/${request.id}/allocate`,{planned_start_date:dates.first,idempotency_key:key('shipping-sale-allocate'),lines:[{request_line_id:request.lines[0].id,quantity:1,fabric_variant_id:f.fabric}]},f.manager.session);
  const job=await prepare(f,allocated.orders[0]);await stages(f,job,1);const output=await receipt(f,job,1,'shipping-known-cost','50000');
  const ledgerBefore=(await sql('select sum(value_delta)/sum(quantity_delta) cost from local_inventory_movements where inventory_item_id=$1 and warehouse_id=$2',[f.finished.id,f.warehouse])).rows[0].cost;
  const body={output_id:output.id,quantity:1,idempotency_key:key('shipping-no-cost-mutation')};
  const first=await must('POST',`${workspace}/${job.order.id}/ship`,body,shipping.session),retry=await must('POST',`${workspace}/${job.order.id}/ship`,body,shipping.session);
  assert.equal(first.movement.id,retry.movement.id);assert.equal(first.shipment.id,retry.shipment.id);
  for(const response of [first,retry])for(const field of ['unit_cost','value_delta'])assert(response.movement[field]==null,`No-cost shipping response leaked ${field}.`);
  const movement=(await sql('select unit_cost,value_delta from local_inventory_movements where id=$1',[first.movement.id])).rows[0];
  assert(ledgerBefore,'Known-cost fixture must not silently become unvalued.');
  assert.equal((await sql('select $1::numeric=round($2::numeric,4) and $3::numeric=round(-$2::numeric,2) same',[movement.unit_cost,ledgerBefore,movement.value_delta])).rows[0].same,true,'Response redaction changed canonical shipment valuation (numeric unit4/value2 scale).');
  await sql("insert into local_employee_permissions(user_id,permission_type,enabled,assigned_by,reason) values($1,'inventory_cost_view',true,'local-admin','Disposable replay authorization regression')",[shipping.user.user_id]);
  const privilegedReplay=await must('POST',`${workspace}/${job.order.id}/ship`,body,shipping.session);assert.equal((await sql('select $1::numeric=$2::numeric same',[privilegedReplay.movement.unit_cost,movement.unit_cost])).rows[0].same,true,'Authorized replay lost canonical cost.');
  await sql("update local_employee_permissions set enabled=false where user_id=$1 and permission_type='inventory_cost_view'",[shipping.user.user_id]);
  const downgradedReplay=await must('POST',`${workspace}/${job.order.id}/ship`,body,shipping.session);assert.equal(downgradedReplay.movement.id,first.movement.id);assert(downgradedReplay.movement.unit_cost==null&&downgradedReplay.movement.value_delta==null,'Revoked cost rights retained cached replay costs.');
  assert.equal((await sql('select count(*)::int n from local_inventory_movements where document_id=$1',[first.movement.document_id])).rows[0].n,1,'Authorization replay issued inventory twice.');
}
async function shipmentRaces(f){
  const create=async(label,quantity,parts)=>{
    const source=await must('POST','/api/orders',{order_number:`WS-RACE-${label}-${token}`,manager_id:f.sale.user.user_id,status:'processing',items:[{id:`race-${label}-${token}`,originalProductId:f.product.id,quantity,color:'Xanh',size:'M'}]},f.manager.session);
    const line=list(await must('GET','/api/production/source-orders',undefined,f.manager.session)).find(x=>x.id===source.id).items[0];
    const request=await must('POST','/api/production-sales/requests',{order_id:source.id,lines:[{source_line_key:line.source_line_key,quantity}],idempotency_key:key(`${label}-request`)},f.sale.session);
    await must('POST',`/api/production-sales/requests/${request.id}/review`,{target_status:'ACCEPTED',reason:'Nguồn hợp lệ cho kiểm tra giao đồng thời',idempotency_key:key(`${label}-accept`)},f.manager.session);
    const allocated=await must('POST',`/api/production-sales/requests/${request.id}/allocate`,{planned_start_date:dates.first,lines:parts.map(part=>({request_line_id:request.lines[0].id,quantity:part,fabric_variant_id:f.fabric})),idempotency_key:key(`${label}-allocate`)},f.manager.session);
    const jobs=[];for(const order of allocated.orders){const job=await prepare(f,order);await stages(f,job,Number(job.item.planned_quantity));jobs.push(job);}
    return {source,line,jobs};
  };
  const race=async(label,fixture,outputs,amount)=>{
    const bodies=outputs.map((output,index)=>({output_id:output.id,quantity:amount,idempotency_key:key(`${label}-ship-${index}`)}));
    const results=await Promise.all(bodies.map((body,index)=>api('POST',`${workspace}/${fixture.jobs[index]?.order.id||fixture.jobs[0].order.id}/ship`,body,f.manager.session)));
    assert.equal(results.filter(result=>result.ok).length,1,`${label}: ${JSON.stringify(results)}`);
    const winner=results.findIndex(result=>result.ok),loser=1-winner;
    assert([400,409].includes(results[loser].status));
    const replay=await must('POST',`${workspace}/${fixture.jobs[winner]?.order.id||fixture.jobs[0].order.id}/ship`,bodies[winner],f.manager.session);
    assert.equal(replay.shipment.id,results[winner].payload.shipment.id);assert.equal(replay.movement.id,results[winner].payload.movement.id);
    const actual=(await sql(`select (select coalesce(sum(l.quantity),0) from local_production_shipment_lines l join local_production_shipments s on s.id=l.shipment_id where s.order_id=$1 and l.source_order_item_key=$2) shipped,
      (select count(*)::int from local_production_shipments where order_id=$1) shipments,
      (select count(*)::int from local_inventory_documents where idempotency_key=$3) winner_docs,
      (select count(*)::int from local_inventory_movements where document_id=$4) winner_movements,
      (select count(*)::int from local_inventory_documents where idempotency_key=$5) loser_docs,
      (select count(*)::int from local_dispatch_requests where idempotency_key=$6) loser_requests`,[fixture.source.id,fixture.line.source_line_key,`production-ISSUE:${bodies[winner].idempotency_key}`,replay.document.id,`production-ISSUE:${bodies[loser].idempotency_key}`,bodies[loser].idempotency_key])).rows[0];
    assert.equal(Number(actual.shipped),amount);assert.equal(actual.shipments,1);assert.equal(actual.winner_docs,1);assert.equal(actual.winner_movements,1);assert.equal(actual.loser_docs,0);assert.equal(actual.loser_requests,0,'Losing shipment must leave no committed idempotency result.');
    if(outputs[0].id!==outputs[1].id)assert.equal((await sql('select count(*)::int n from local_production_shipment_lines where output_id=$1',[outputs[loser].id])).rows[0].n,0,'Losing output was partially shipped.');
  };
  const same=await create('same-output',3,[3]),sameOutput=await receipt(f,same.jobs[0],3,'race-same-receive');
  await race('same-output',same,[sameOutput,sameOutput],2);
  const normal=await create('normal-sale-line',6,[3,3]),normalOutputs=[];
  for(const [index,job] of normal.jobs.entries())normalOutputs.push(await receipt(f,job,3,`normal-distinct-receive-${index}`));
  const normalBodies=normalOutputs.map((output,index)=>({output_id:output.id,quantity:3,idempotency_key:key(`normal-distinct-ship-${index}`)}));
  const normalResults=await Promise.all(normalBodies.map((body,index)=>api('POST',`${workspace}/${normal.jobs[index].order.id}/ship`,body,f.manager.session)));
  assert(normalResults.every(result=>result.ok),`Normal split outputs within Sale quota must both commit: ${JSON.stringify(normalResults)}`);
  for(const [index,body] of normalBodies.entries()){
    const replay=await must('POST',`${workspace}/${normal.jobs[index].order.id}/ship`,body,f.manager.session);
    assert.equal(replay.shipment.id,normalResults[index].payload.shipment.id);assert.equal(replay.movement.id,normalResults[index].payload.movement.id);
  }
  const normalActual=(await sql(`select sum(l.quantity)::text shipped,count(*)::int lines,count(distinct l.inventory_movement_id)::int movements
    from local_production_shipment_lines l join local_production_shipments s on s.id=l.shipment_id where s.order_id=$1 and l.source_order_item_key=$2`,[normal.source.id,normal.line.source_line_key])).rows[0];
  assert.equal(Number(normalActual.shipped),6);assert.equal(normalActual.lines,2);assert.equal(normalActual.movements,2);
  const shared=await create('same-sale-line',6,[3,3]);
  const outputs=[];for(const [index,job] of shared.jobs.entries())outputs.push(await receipt(f,job,3,`race-distinct-receive-${index}`));
  // Legitimate outputs/allocations above were all created through APIs. This
  // adversarial source-change fixture (not a supported end-user edit flow)
  // models a later customer quantity reduction on this disposable database;
  // it does not invent stock, completed output, allocation or shipment rows.
  // Each output still permits 3, but the SAME current Sale line permits only 4.
  const updated=(await sql("update local_orders set items=jsonb_set(items,'{0,quantity}','4'::jsonb),local_modified_at=now() where id=$1 returning items",[shared.source.id])).rows[0];
  assert.equal(Number(updated.items[0].quantity),4);
  await race('same-sale-line',shared,outputs,3);
}
async function referenceSnapshotsAndInstructions(f){
  const local=path=>`/api/local-storage/product-images/object?path=${encodeURIComponent(path)}`;
  const first=local(`qa-${token}/front.jpg`),second=local(`qa-${token}/back.png`),third=local(`qa-${token}/detail.webp`);
  const publicSecond=`https://production-qa.supabase.co/storage/v1/object/public/product-images/qa-${token}/back.png`;
  const unsafe=[`https://elsewhere.invalid/qa-${token}.jpg`,`https://production-qa.supabase.co/storage/v1/object/sign/product-images/qa-${token}/private.jpg?token=private-fixture`,local('../private.jpg'),local(`qa-${token}/active.svg`),`${first}&token=private-fixture`];
  await must('PATCH',`/api/catalog/products/${f.product.id}`,{images:[first,{url:publicSecond,cost_price:987654,private_metadata:'MUST_NOT_LEAK'},...unsafe.map(url=>({url}))],image_url:third},f.admin);
  const choices=await must('GET',`${workspace}/reference-images?product_id=${f.product.id}`,undefined,f.manager.session);
  assert.deepEqual(choices,{product_id:f.product.id,reference_images:[first,second,third]},'Canonical string/object-url photos must normalize without unsafe URLs or raw metadata.');
  await denied('GET',`${workspace}/reference-images?product_id=${f.product.id}`,undefined,f.cutter.session,[403]);
  const base={source_type:'MANUAL',planned_start_date:dates.first,dispatch_notes:'Hướng dẫn chung: đối chiếu ảnh trước khi cắt'};
  for(const [index,photo] of [...unsafe,local(`qa-${token}/unlisted.jpg`),{url:first}].entries())await denied('POST','/api/production-orders/groups',{...base,lines:[{product_id:f.product.id,quantity:1,reference_images:[photo]}],idempotency_key:key(`unsafe-photo-${index}`)},f.manager.session,[400]);
  await denied('POST','/api/production-orders/groups',{...base,lines:[{product_id:f.product.id,quantity:1,reference_images:Array(9).fill(first)}],idempotency_key:key('too-many-photos')},f.manager.session,[400]);
  const group=await must('POST','/api/production-orders/groups',{...base,lines:[{product_id:f.product.id,quantity:1,fabric_variant_id:f.fabric,notes:'Hướng dẫn dòng xanh: cắt theo ảnh mặt trước',reference_images:[first]},{product_id:f.product.id,quantity:1,fabric_variant_id:f.fabric,notes:'Dòng không cần ảnh',reference_images:[]},{product_id:f.product.id,quantity:1,fabric_variant_id:f.fabric,notes:'Dòng dùng ảnh danh mục mặc định'}],idempotency_key:key('manual-photo-multi')},f.manager.session);
  assert.equal(group.orders.length,3);
  const draft=await must('GET',`${workspace}/${group.orders[0].id}/details`,undefined,f.manager.session),draftItem=draft.items[0];
  assert.deepEqual(draftItem.reference_images,[first]);assert(draft.order.updated_at);
  const editPath=`${workspace}/${group.orders[0].id}/draft-reference`,editBase={expected_updated_at:draft.order.updated_at,reason:'Sửa hướng dẫn và ảnh khi lệnh còn nháp'};
  const beforeDraft=await snapshotAll([group.orders[0].id]);
  await denied('POST',editPath,{...editBase,notes:'Không có quyền sửa',idempotency_key:key('draft-worker-denied')},f.cutter.session,[403]);
  for(const [index,change] of [{quantity_planned:999},{source_type:'FROM_ORDER'},{reason:''},{items:[{id:draftItem.id,quantity:999}]},{items:[{id:randomUUID(),notes:'Sai dòng'}]},{items:[{id:draftItem.id,reference_images:[unsafe[0]]}]},{planned_start_date:'2026-02-31'},{planned_start_date:dates.end,planned_end_date:dates.start},{dispatch_priority:'SUPER'},{dispatch_reference:{value:'Không phải chuỗi'}}].entries())await denied('POST',editPath,{...editBase,...change,idempotency_key:key(`draft-invalid-${index}`)},f.manager.session,[400]);
  assert.deepEqual(await snapshotAll([group.orders[0].id]),beforeDraft,'Rejected draft edits changed authoritative order/item/audit data.');
  const concurrent=[0,1].map(index=>({...editBase,notes:`Hướng dẫn chung đã sửa ${index}`,items:[{id:draftItem.id,notes:`Hướng dẫn dòng đã sửa ${index}`}],idempotency_key:key(`draft-concurrent-${index}`)}));
  const edited=await Promise.all(concurrent.map(body=>api('POST',editPath,body,f.manager.session)));
  assert.equal(edited.filter(result=>result.ok).length,1,'Two stale draft editors both committed.');assert.equal(edited.find(result=>!result.ok).status,409);
  const winner=edited.findIndex(result=>result.ok),afterConcurrent=await must('GET',`${workspace}/${group.orders[0].id}/details`,undefined,f.manager.session);
  assert.deepEqual(afterConcurrent.items[0].reference_images,[first],'Omitted photo field must retain saved selection, not reload catalog/defaults.');
  assert.equal(afterConcurrent.order.notes,concurrent[winner].notes);assert.equal(afterConcurrent.items[0].notes,concurrent[winner].items[0].notes);
  const replay=await must('POST',editPath,concurrent[winner],f.manager.session);assert.equal(replay.updated_at,edited[winner].payload.updated_at);
  const finalEdit={expected_updated_at:afterConcurrent.order.updated_at,reason:'Chọn ảnh chi tiết và kế hoạch cuối trước phát hành',notes:base.dispatch_notes,planned_start_date:dates.first,planned_end_date:dates.end,dispatch_priority:'HIGH',dispatch_reference:`REF-${token}`,items:[{id:draftItem.id,notes:'Hướng dẫn dòng xanh: cắt theo ảnh chi tiết',reference_images:[third]}],idempotency_key:key('draft-final-edit')};
  await must('POST',editPath,finalEdit,f.manager.session);
  const audit=(await sql("select data from local_dispatch_audit_events where production_order_id=$1 and action='DRAFT_REFERENCE' order by created_at",[group.orders[0].id])).rows;
  assert.equal(audit.length,2,'Replaying draft update duplicated audit.');assert(audit.every(row=>row.data.reason&&row.data.items.length===1));
  const manualJob=await prepare(f,group.orders[0]),emptyJob=await prepare(f,group.orders[1]),defaultJob=await prepare(f,group.orders[2]);
  assert.deepEqual(manualJob.item.reference_images,[third]);assert.deepEqual(emptyJob.item.reference_images,[]);assert.deepEqual(defaultJob.item.reference_images,[first,second,third]);
  assert.equal(manualJob.order.planned_start_date,dates.first);assert.equal(manualJob.order.planned_end_date,dates.end);assert.equal(manualJob.order.dispatch_priority,'HIGH');assert.equal(manualJob.order.dispatch_reference,finalEdit.dispatch_reference);assert.equal(Number(manualJob.item.planned_quantity),1);assert.equal(manualJob.item.product_id,f.product.id);assert.equal(manualJob.order.order_id,null);
  await denied('POST',editPath,{...finalEdit,idempotency_key:key('draft-edit-after-release')},f.manager.session,[409]);
  const source=await must('POST','/api/orders',{order_number:`WS-PHOTO-${token}`,manager_id:f.sale.user.user_id,status:'processing',items:[{id:`photo-${token}`,originalProductId:f.product.id,quantity:1,color:'Xanh',size:'M'}]},f.manager.session);
  const line=list(await must('GET','/api/production/source-orders',undefined,f.sale.session)).find(x=>x.id===source.id).items[0];
  const request=await must('POST','/api/production-sales/requests',{order_id:source.id,notes:'Sale cần kiểm tra mặt sau',lines:[{source_line_key:line.source_line_key,quantity:1}],idempotency_key:key('photo-sale-request')},f.sale.session);
  await must('POST',`/api/production-sales/requests/${request.id}/review`,{target_status:'ACCEPTED',reason:'Đối chiếu ảnh sản phẩm',idempotency_key:key('photo-sale-review')},f.manager.session);
  await denied('POST',`/api/production-sales/requests/${request.id}/allocate`,{lines:[{request_line_id:request.lines[0].id,quantity:1,reference_images:[unsafe[0]]}],idempotency_key:key('photo-sale-unsafe')},f.manager.session,[400]);
  const saleGroup=await must('POST',`/api/production-sales/requests/${request.id}/allocate`,{planned_start_date:dates.first,notes:'Hướng dẫn chung đơn Sale',lines:[{request_line_id:request.lines[0].id,quantity:1,fabric_variant_id:f.fabric,notes:'Hướng dẫn dòng Sale',reference_images:[second]}],idempotency_key:key('photo-sale-allocate')},f.manager.session);
  const saleJob=await prepare(f,saleGroup.orders[0]);assert.deepEqual(saleJob.item.reference_images,[second]);
  // A released instruction/photo snapshot must never follow subsequent catalog edits.
  await must('PATCH',`/api/catalog/products/${f.product.id}`,{images:[local(`qa-${token}/replacement.jpg`)],image_url:null},f.admin);
  for(const [job,expected] of [[manualJob,[third]],[saleJob,[second]],[emptyJob,[]],[defaultJob,[first,second,third]]]){
    const detail=await must('GET',`${workspace}/${job.order.id}/details`,undefined,f.manager.session);assert.deepEqual(detail.items[0].reference_images,expected);assert(detail.order.notes);assert(detail.items[0].notes);
  }
  const publication=await must('POST',`${dispatch}/publications`,{production_order_id:manualJob.order.id,production_batch_id:manualJob.batch.id,order_item_id:manualJob.item.id,stage:'CUTTING',eligible_worker_type:'CUTTER',quantity:1,assigned_from:dates.first,notes:'Hướng dẫn nhận việc: giữ đúng chiều vải',idempotency_key:key('photo-open')},f.manager.session);
  const mine=()=>must('GET',`${dispatch}/mine`,undefined,f.cutter.session);
  const open=(await mine()).publications.find(row=>row.id===publication.id);assert(open,'Eligible worker cannot read OPEN reference instructions.');
  assert.deepEqual(open.reference_images,[third]);assert.equal(open.product_notes,manualJob.item.notes);assert.equal(open.dispatch_notes,base.dispatch_notes);assert.equal(open.notes,publication.notes);
  assert(!JSON.stringify(open).includes('MUST_NOT_LEAK'));assert(!Object.keys(open).some(field=>/cost|price|value/i.test(field)));
  const wrong=await must('GET',`${dispatch}/mine`,undefined,f.sewer.session);assert(!wrong.publications.some(row=>row.id===publication.id),'Wrong-stage worker saw cutting photo/instructions.');
  const claimed=unwrap(await must('POST',`${dispatch}/publications/${publication.id}/claim`,{quantity:1,idempotency_key:key('photo-claim')},f.cutter.session),'assignment');
  const own=(await mine()).assignments.find(row=>row.id===claimed.id);assert.deepEqual(own.reference_images,[third]);assert.equal(own.product_notes,open.product_notes);assert.equal(own.dispatch_notes,open.dispatch_notes);assert.equal(own.notes,publication.notes);assert.equal(own.own_assignment,true);
  const outsider=await must('GET',`${dispatch}/mine`,undefined,f.outsider.session);assert(!outsider.assignments.some(row=>row.id===claimed.id));assert(!outsider.publications.some(row=>row.id===publication.id));
  // Historical rows have NULL rather than a retroactive snapshot. They remain
  // valid and do not acquire newly changed catalog photos on read/release.
  await sql('update local_production_order_items set reference_images=null where id=$1',[emptyJob.item.id]);
  const legacy=await must('GET',`${workspace}/${emptyJob.order.id}/details`,undefined,f.manager.session);assert.deepEqual(legacy.items[0].reference_images,[]);
}
async function historicalRateSelection(f){
  const old=`HIST-OLD-${token}`,later=`HIST-NEW-${token}`;
  await sql("insert into local_product_rates(piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,effective_to,status,reason) values($1,'Mã hiệu lực trước ngày chọn',11111.11,'PIECE',$3,$4,'APPROVED','Fixture ngày hiệu lực'),($2,'Mã hiệu lực từ ngày sau',22222.22,'PIECE',$5,null,'APPROVED','Fixture ngày hiệu lực')",[old,later,dates.start,dates.first,dates.second]);
  const first=list(await must('GET',`${dispatch}/rates?date=${dates.first}`,undefined,f.manager.session)),second=list(await must('GET',`${dispatch}/rates?date=${dates.second}`,undefined,f.manager.session));
  assert(first.some(row=>row.piece_rate_code===old));assert(!first.some(row=>row.piece_rate_code===later));assert(second.some(row=>row.piece_rate_code===later));assert(!second.some(row=>row.piece_rate_code===old));
  await denied('GET',`${dispatch}/rates?date=2026-02-31`,undefined,f.manager.session,[400]);
  await denied('GET',`${dispatch}/rates?date=${dates.first}`,undefined,f.sewer.session,[403]);
  const job=await manual(f,2,'Chọn mã công theo ngày giao việc');const cutting=await assign(f,job,'CUTTING',2);await approve(f,await report(f,cutting,2));
  await denied('POST',`${dispatch}/assignments`,{production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,worker_id:f.sewer.worker.id,stage:'SEWING',quantity:1,piece_rate_code:later,assigned_from:dates.first,idempotency_key:key('rate-not-effective-selected-day')},f.manager.session,[400]);
  const publication={production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,stage:'SEWING',eligible_worker_type:'SEWER',quantity:1,assigned_from:dates.first};
  await denied('POST',`${dispatch}/publications`,{...publication,piece_rate_code:later,idempotency_key:key('publication-rate-not-effective-selected-day')},f.manager.session,[400]);
  const published=await must('POST',`${dispatch}/publications`,{...publication,piece_rate_code:old,idempotency_key:key('publication-rate-historical')},f.manager.session);assert.equal(published.piece_rate_code,old);
  const sewing=await assign(f,job,'SEWING',1,{piece_rate_code:old,assigned_from:dates.first});
  const preview=await must('GET',`${dispatch}/assignments/${sewing.row.id}/pay-preview?work_date=${dates.first}&quantity_good=1`,undefined,f.sewer.session);assert.equal(preview.status,'READY');assert.equal(preview.piece_rate_code,old);assert.equal(preview.pending_amount,'11111.11');
  const unavailable=await must('GET',`${dispatch}/assignments/${sewing.row.id}/pay-preview?work_date=${dates.second}&quantity_good=1`,undefined,f.sewer.session);assert.equal(unavailable.status,'UNAVAILABLE');assert.equal(unavailable.pending_amount,null);
}
async function sameWorkerMultipleAssignmentsEarnings(f){
  const earnings=()=>must('GET',`/api/my-attendance/earnings?month=${dates.first.slice(0,7)}`,undefined,f.sewer.session);
  const baseline=await earnings(),job=await manual(f,2,'Một nhân viên báo cuối ca cho nhiều phần việc');
  const cutting=await assign(f,job,'CUTTING',2);await approve(f,await report(f,cutting,2));
  const assignments=[await assign(f,job,'SEWING',1),await assign(f,job,'SEWING',1)];
  assert.notEqual(assignments[0].row.id,assignments[1].row.id);
  const reports=[await report(f,assignments[0],1),await report(f,assignments[1],1)];
  const pending=await earnings();assert.equal(pending.worker.id,f.sewer.worker.id);assert.equal(pending.income_scope,'PRODUCT_OUTPUT_ONLY');
  for(const reportRow of reports){const row=pending.rows.find(x=>x.id===reportRow.id);assert(row);assert.equal(row.work_date,dates.first);assert.equal(row.approved_amount,null);assert.equal(Number(row.pending_amount),12500.25);}
  const compare=async(actualPending,actualApproved,pendingDelta,approvedDelta)=>assert.equal((await sql('select $1::numeric=$2::numeric+$3::numeric and $4::numeric=$5::numeric+$6::numeric exact',[actualPending,baseline.pending_total,pendingDelta,actualApproved,baseline.approved_total,approvedDelta])).rows[0].exact,true,'Daily reports did not reconcile with monthly pending/approved totals.');
  await compare(pending.pending_total,pending.approved_total,'25000.50','0');
  await approve(f,reports[0]);const partial=await earnings();await compare(partial.pending_total,partial.approved_total,'12500.25','12500.25');
  await approve(f,reports[1]);const final=await earnings();await compare(final.pending_total,final.approved_total,'0','25000.50');
  const ownReports=final.rows.filter(row=>reports.some(reportRow=>reportRow.id===row.id));assert.equal(ownReports.length,2);assert(ownReports.every(row=>row.pending_amount==null&&Number(row.approved_amount)===12500.25));
  const daily=(await sql("select work_date::text,sum(calculated_amount)::text amount,count(*)::int n from local_production_entries where worker_id=$1 and source_stage_event_id=any($2::uuid[]) and workflow_status='APPROVED' and not is_reversed group by work_date",[f.sewer.worker.id,reports.map(row=>row.id)])).rows;
  assert.equal(daily.length,1);assert.equal(daily[0].work_date,dates.first);assert.equal(Number(daily[0].amount),25000.50);assert.equal(daily[0].n,2);
  const summary=await must('GET',`/api/my-attendance/day-summary?date=${dates.first}`,undefined,f.sewer.session);assert(summary,'Own daily detail is unavailable after reporting multiple assignments.');
  const outsider=await must('GET',`/api/my-attendance/earnings?month=${dates.first.slice(0,7)}`,undefined,f.cutter.session);assert(!outsider.rows.some(row=>reports.some(reportRow=>reportRow.id===row.id)),'Another worker read these earnings.');
  console.log(`PASS workspace earnings reconciliation: ${dates.first} two1unit assignments at12500.25VND; monthdelta pending25000.50/approved0 -> pending12500.25/approved12500.25 -> pending0/approved25000.50; exactly2 source-linked daily entries sum25000.50, not a second wage ledger.`);
}
const uncutBody=(job,quantity,label)=>({production_batch_id:job.batch.id,order_item_id:job.item.id,quantity,reason:'Hủy phần kế hoạch chưa cắt theo yêu cầu kiểm thử',idempotency_key:key(label)});
async function cancelUncut(f,job,quantity,label){
  const body=uncutBody(job,quantity,label),row=await must('POST',`${workspace}/${job.order.id}/cancel-uncut`,body,f.manager.session);
  assert.equal((await must('POST',`${workspace}/${job.order.id}/cancel-uncut`,body,f.manager.session)).id,row.id);
  assert.equal(Number(row.quantity),quantity);return row;
}
async function uncutFinancialState(job){
  const all=await snapshotAll([job.order.id]);
  return Object.fromEntries(['items','materialRequirements','estimates','estimateLines','inventoryDocuments','inventoryMovements','movements','earnings','payrollItems','allocations','requests','requestLines','outputs','reports','assignments','publications'].map(key=>[key,all[key]]));
}
async function uncutSettlement(f,withScrap=false){
  const job=await manual(f,10,withScrap?'Hủy chưa cắt khác hỏng thực tế':'Hủy chưa cắt khi may đang làm');
  const cut=await assign(f,job,'CUTTING',4);await approve(f,await report(f,cut,withScrap?3:4,0,withScrap?1:0));
  const good=withScrap?3:4,sewing=await assign(f,job,'SEWING',good);
  if(withScrap)await approve(f,await report(f,sewing,good));
  const wipSnapshot=await snapshotAll([job.order.id]);
  await denied('POST',`/api/production-orders/${job.order.id}/transition`,{target_status:'CANCELLED',reason:'Không hủy toàn lệnh đang may'},f.manager.session,[409]);
  await denied('POST',`/api/production-batches/${job.batch.id}/status`,{target_status:'CANCELLED',reason:'Không hủy toàn lô đang may'},f.manager.session,[409]);
  assert.deepEqual(await snapshotAll([job.order.id]),wipSnapshot,'Whole order/batch cancellation changed WIP before any uncut ledger existed.');
  const before=await uncutFinancialState(job);if(withScrap)assert.equal(before.earnings.length,1,'Money immutability fixture must contain an existing approved wage.');
  await denied('POST',`${workspace}/${job.order.id}/cancel-uncut`,uncutBody(job,7,`cancel-not-count-good-${job.order.id}`),f.manager.session,[409]);
  const row=await cancelUncut(f,job,6,`cancel-six-${job.order.id}`);
  assert.deepEqual(await uncutFinancialState(job),before,'Canceling uncut work changed stock, approved BOM/estimates, assignments or money.');
  const board=await must('GET',`${workspace}?orderId=${job.order.id}`,undefined,f.manager.session),projected=board.rows.find(x=>x.batch_id===job.batch.id&&x.item_id===job.item.id)||board.rows[0];
  assert.equal(Number(projected.planned_quantity),10);assert.equal(Number(projected.cancelled_uncut),6);assert.equal(Number(projected.executable_quantity),4);
  assert.equal(Number(projected.material.estimated),20,'Approved estimate snapshot must remain original.');assert.equal(Number(projected.material.required),8,'Remaining BOM requirement should use the original formula for four outputs.');assert.equal(Number(projected.material.issued),20,'Canceling must not automatically return material.');assert.equal(projected.material.has_shortage,false);
  const published={production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,stage:'CUTTING',eligible_worker_type:'CUTTER',quantity:1,assigned_from:dates.first,idempotency_key:key(`cancel-no-more-cut-${job.order.id}`)};
  await denied('POST',`${dispatch}/publications`,published,f.manager.session,[409]);
  await denied('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key(`cancel-wip-not-complete-${job.order.id}`)},f.manager.session,[409]);
  await denied('POST',`/api/production-orders/${job.order.id}/transition`,{target_status:'CANCELLED',reason:'Không xóa công việc đang chạy'},f.manager.session,[409]);
  if(!withScrap)await approve(f,await report(f,sewing,good));
  for(const stage of ['FINISHING','COUNTING']){const a=await assign(f,job,stage,good);await approve(f,await report(f,a,good));}
  const output=await receipt(f,job,good,`cancel-receive-${job.order.id}`),outputCount=(await sql('select count(*)::int n from local_production_outputs where production_order_id=$1',[job.order.id])).rows[0].n;
  const complete=await must('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key(`cancel-complete-${job.order.id}`)},f.manager.session);
  assert.equal(complete.status,'COMPLETED');assert.equal(Number(complete.quantity_good),good);assert.equal(Number(complete.quantity_scrap),withScrap?1:0,'Uncut cancellation must not become scrap.');assert.equal(Number(complete.quantity_planned),10);
  assert.equal((await sql('select count(*)::int n from local_production_outputs where production_order_id=$1',[job.order.id])).rows[0].n,outputCount,'Completion duplicated the received output.');
  assert.equal((await sql('select sum(quantity)=6 exact from local_production_uncut_cancellations where production_order_id=$1',[job.order.id])).rows[0].exact,true);
  await assert.rejects(()=>sql('update local_production_uncut_cancellations set quantity=1 where id=$1',[row.id]),/append-only/);
  await assert.rejects(()=>sql('delete from local_production_uncut_cancellations where id=$1',[row.id]),/append-only/);
  await denied('POST',`${workspace}/${job.order.id}/cancel-uncut`,uncutBody(job,1,`cancel-after-complete-${job.order.id}`),f.manager.session,[409]);
  return {job,output};
}
async function uncutSalePromise(f){
  const source=await must('POST','/api/orders',{order_number:`WS-CANCEL-SALE-${token}`,manager_id:f.sale.user.user_id,status:'processing',items:[{id:`cancel-sale-${token}`,originalProductId:f.product.id,quantity:10,color:'Xanh',size:'M'}]},f.manager.session);
  const line=list(await must('GET','/api/production/source-orders',undefined,f.sale.session)).find(row=>row.id===source.id).items[0];
  const request=await must('POST','/api/production-sales/requests',{order_id:source.id,lines:[{source_line_key:line.source_line_key,quantity:10}],idempotency_key:key('cancel-sale-submit')},f.sale.session);
  await must('POST',`/api/production-sales/requests/${request.id}/review`,{target_status:'ACCEPTED',reason:'Kiểm tra nghĩa vụ giao không tự hủy',idempotency_key:key('cancel-sale-accept')},f.manager.session);
  const allocation=await must('POST',`/api/production-sales/requests/${request.id}/allocate`,{planned_start_date:dates.first,lines:[{request_line_id:request.lines[0].id,quantity:10,fabric_variant_id:f.fabric}],idempotency_key:key('cancel-sale-allocate')},f.manager.session),job=await prepare(f,allocation.orders[0]);
  await must('POST',`/api/production-sales/requests/${request.id}/change-request`,{reason:'Kiểm tra tiếp tục không được bỏ qua điều chỉnh Sale',idempotency_key:key('cancel-sale-adjustment-hold')},f.sale.session);
  const adjustmentSnapshot=await snapshotAll([job.order.id]);
  const resumeRefused=await denied('POST',`/api/production-orders/${job.order.id}/transition`,{target_status:'IN_PROGRESS',reason:'Đã có lý do nhưng chưa duyệt điều chỉnh Sale'},f.manager.session,[409]);assert.match(resumeRefused.payload.message,/điều chỉnh/);assert.deepEqual(await snapshotAll([job.order.id]),adjustmentSnapshot,'Resume bypassed the outstanding Sale adjustment.');
  const releaseRefused=await denied('POST',`/api/production-orders/${job.order.id}/release`,{reason:'Không thể dùng phát hành để bỏ qua điều chỉnh Sale',idempotency_key:key('cancel-sale-release-adjustment-denied')},f.manager.session,[409]);assert.match(releaseRefused.payload.message,/điều chỉnh/);assert.deepEqual(await snapshotAll([job.order.id]),adjustmentSnapshot,'Release/resume bypassed the outstanding Sale adjustment.');
  await must('POST',`/api/production-sales/requests/${request.id}/review`,{target_status:'ACCEPTED',reason:'Quản lý chấp nhận điều chỉnh trước tiếp tục',idempotency_key:key('cancel-sale-adjustment-accept')},f.manager.session);
  const cut=await assign(f,job,'CUTTING',4);await approve(f,await report(f,cut,4));
  const before=(await sql('select items,status from local_orders where id=$1',[source.id])).rows[0],financial=await uncutFinancialState(job);
  await cancelUncut(f,job,6,'cancel-sale-six');assert.deepEqual(await uncutFinancialState(job),financial);assert.deepEqual((await sql('select items,status from local_orders where id=$1',[source.id])).rows[0],before);
  for(const stage of ['SEWING','FINISHING','COUNTING']){const a=await assign(f,job,stage,4);await approve(f,await report(f,a,4));}
  const output=await receipt(f,job,4,'cancel-sale-receive');await must('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('cancel-sale-complete')},f.manager.session);
  const shipment=await must('POST',`${workspace}/${job.order.id}/ship`,{output_id:output.id,quantity:4,idempotency_key:key('cancel-sale-ship')},f.manager.session);
  const delivered=await must('POST',`${workspace}/shipments/${shipment.shipment.id}/deliver`,{recipient_name:'Người nhận kiểm thử',delivery_evidence:'Giao phần đã làm, còn thiếu sáu',idempotency_key:key('cancel-sale-deliver')},f.manager.session);assert.equal(delivered.order_delivered,false);
  assert.notEqual((await sql('select status from local_orders where id=$1',[source.id])).rows[0].status,'delivered');
  assert.equal((await sql('select sum(quantity)=10 exact from local_production_sales_allocations where production_order_id=$1',[job.order.id])).rows[0].exact,true,'Uncut cancellation silently released Sale allocation.');
  const allocationSnapshot=await snapshotAll([job.order.id]);
  const refusal=await denied('POST',`/api/production-sales/requests/${request.id}/allocate`,{lines:[{request_line_id:request.lines[0].id,quantity:1}],idempotency_key:key('cancel-sale-no-free-allocation')},f.manager.session,[400,409]);assert.match(refusal.payload.message,/vượt số đã tiếp nhận/);assert.deepEqual(await snapshotAll([job.order.id]),allocationSnapshot,'Rejected extra Sale allocation changed the original promise or production state.');
}
async function uncutScrapAcrossStages(f){
  const job=await manual(f,10,'Đối soát hỏng thực tế ở mọi công đoạn');
  let quantity=8;
  for(const stage of ['CUTTING','SEWING','FINISHING','COUNTING']){const a=await assign(f,job,stage,quantity);await approve(f,await report(f,a,quantity-1,0,1));quantity--;}
  const before=await uncutFinancialState(job);await cancelUncut(f,job,2,'uncut-all-stage-scrap');assert.deepEqual(await uncutFinancialState(job),before);
  await receipt(f,job,4,'uncut-all-stage-scrap-receive');
  const completed=await must('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('uncut-all-stage-scrap-complete')},f.manager.session);
  assert.equal(Number(completed.quantity_good),4);assert.equal(Number(completed.quantity_scrap),4,'Actual defects from four distinct stages must count once each; uncut cancellation is not scrap.');
  const aggregate=(await sql("select sum(quantity_defect)=4 exact from local_production_stage_events where production_order_id=$1 and status in ('APPROVED','LOCKED')",[job.order.id])).rows[0];assert.equal(aggregate.exact,true);
}
async function uncutReservationsAndRaces(f){
  const job=await manual(f,10,'Chặn hủy khi phần cắt còn giữ chỗ'),path=`${workspace}/${job.order.id}/cancel-uncut`;
  const failWithoutResidue=async(label,body=uncutBody(job,6,label),session=f.manager.session,statuses=[409])=>{const before=await snapshotAll([job.order.id]);await denied('POST',path,body,session,statuses);assert.deepEqual(await snapshotAll([job.order.id]),before,`${label} left partial ledger/audit/state.`);};
  await failWithoutResidue('cancel-no-rights',uncutBody(job,6,'cancel-no-rights'),f.cutter.session,[403]);
  for(const [index,change] of [{quantity:0},{quantity:-1},{quantity:'0.00001'},{reason:''},{production_batch_id:randomUUID()},{order_item_id:randomUUID()}].entries())await failWithoutResidue(`cancel-invalid-${index}`,{...uncutBody(job,6,`cancel-invalid-${index}`),...change},f.manager.session,[400,409]);
  const publicationBody={production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,stage:'CUTTING',eligible_worker_type:'CUTTER',quantity:4,assigned_from:dates.first,idempotency_key:key('uncut-open')};
  const publication=await must('POST',`${dispatch}/publications`,publicationBody,f.manager.session);await failWithoutResidue('cancel-open-blocked');
  await must('POST',`${dispatch}/publications/${publication.id}/close`,{status:'CLOSED',idempotency_key:key('uncut-close-open')},f.manager.session);
  const direct={production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,worker_id:f.cutter.worker.id,stage:'CUTTING',quantity:4,assigned_from:dates.first,idempotency_key:key('uncut-pending')};
  const pending=unwrap(await must('POST',`${dispatch}/assignments`,direct,f.manager.session),'assignment');await failWithoutResidue('cancel-pending-blocked');
  await must('POST',`${dispatch}/assignments/${pending.id}/reject`,{reason:'Trả lại trước khi hủy',idempotency_key:key('uncut-reject-pending')},f.cutter.session);
  const accepted=await assign(f,job,'CUTTING',4);await failWithoutResidue('cancel-accepted-remaining-blocked');
  const reportRow=await report(f,accepted,4);await failWithoutResidue('cancel-submitted-blocked');await approve(f,reportRow);
  const bodies=[0,1].map(index=>uncutBody(job,6,`uncut-race-${index}`)),raced=await Promise.all(bodies.map(body=>api('POST',path,body,f.manager.session)));
  assert.equal(raced.filter(result=>result.ok).length,1);assert.equal(raced.find(result=>!result.ok).status,409);
  const winning=raced.findIndex(result=>result.ok);assert.equal((await must('POST',path,bodies[winning],f.manager.session)).id,raced[winning].payload.id);
  await denied('POST',path,{...bodies[winning],quantity:5},f.manager.session,[400,409]);await denied('POST',path,bodies[winning],f.admin,[400,409]);
  const committed=(await sql("select (select count(*)::int from local_production_uncut_cancellations where production_order_id=$1) ledger,(select count(*)::int from local_dispatch_audit_events where production_order_id=$1 and action='CANCEL_UNCUT') audit",[job.order.id])).rows[0];assert.deepEqual(committed,{ledger:1,audit:1});
  const loser=1-winning;assert.equal((await sql('select count(*)::int n from local_dispatch_requests where idempotency_key=$1',[bodies[loser].idempotency_key])).rows[0].n,0);
  for(const mode of ['publication','assignment']){
    const other=await manual(f,10,`Đua hủy và ${mode}`),cut=await assign(f,other,'CUTTING',4);await approve(f,await report(f,cut,4));
    const cancel=uncutBody(other,6,`uncut-vs-${mode}`),create={...publicationBody,production_order_id:other.order.id,production_batch_id:other.batch.id,order_item_id:other.item.id,quantity:6,idempotency_key:key(`uncut-racing-${mode}`),...(mode==='assignment'?{worker_id:f.cutter.worker.id}:{})};
    const results=await Promise.all([api('POST',`${workspace}/${other.order.id}/cancel-uncut`,cancel,f.manager.session),api('POST',`${dispatch}/${mode==='publication'?'publications':'assignments'}`,create,f.manager.session)]);assert.equal(results.filter(result=>result.ok).length,1,`${mode} raced beyond original plan.`);
    const totals=(await sql("select (select coalesce(sum(quantity),0) from local_production_uncut_cancellations where production_order_id=$1)+(select coalesce(sum(coalesce(accepted_quantity,allocated_quantity)-returned_quantity),0) from local_assignments where production_order_id=$1 and dispatch_stage='CUTTING' and dispatch_status<>'REJECTED')+(select coalesce(sum(quantity),0) from local_production_job_publications where production_order_id=$1 and status='OPEN')<=10 exact",[other.order.id])).rows[0];assert.equal(totals.exact,true);
  }
  const noSplitSnapshot=await snapshotAll([job.order.id]);
  const splitRefusal=await denied('POST',`${dispatch}/batches/${job.batch.id}/split`,{planned_quantity:1,batch_number:`NO-SPLIT-${token}`,idempotency_key:key('uncut-no-split')},f.manager.session,[400,409]);assert.match(splitRefusal.payload.message,/đã có hủy phần chưa cắt/);
  const resizeRefusal=await denied('PATCH',`${dispatch}/batches/${job.batch.id}`,{planned_quantity:4,idempotency_key:key('uncut-no-resize')},f.manager.session,[400,409]);assert.match(resizeRefusal.payload.message,/đã có hủy phần chưa cắt/);assert.deepEqual(await snapshotAll([job.order.id]),noSplitSnapshot,'Split/resize moved cancellation or changed original plans.');
  const historical=await manual(f,1,'Không áp quy trình hủy mới lên lệnh lịch sử');await sql("update local_production_orders set workflow_generation='WORKFLOW_V2' where id=$1",[historical.order.id]);
  await denied('POST',`${workspace}/${historical.order.id}/cancel-uncut`,uncutBody(historical,1,'uncut-history-denied'),f.manager.session,[409]);
  // Existing OPEN jobs must be closed before any cancellation. Concurrent claim
  // cannot make cancellation silently consume the worker's held quantity.
  const claimJob=await manual(f,10,'Đua nhận việc đang mở và hủy chưa cắt'),open=await must('POST',`${dispatch}/publications`,{...publicationBody,production_order_id:claimJob.order.id,production_batch_id:claimJob.batch.id,order_item_id:claimJob.item.id,quantity:10,idempotency_key:key('uncut-claim-publication')},f.manager.session);
  const claimResults=await Promise.all([api('POST',`${workspace}/${claimJob.order.id}/cancel-uncut`,uncutBody(claimJob,6,'uncut-vs-claim'),f.manager.session),api('POST',`${dispatch}/publications/${open.id}/claim`,{quantity:4,idempotency_key:key('uncut-concurrent-claim')},f.cutter.session)]);
  assert.equal(claimResults[0].status,409);assert(claimResults[1].ok);assert.equal((await sql('select count(*)::int n from local_production_uncut_cancellations where production_order_id=$1',[claimJob.order.id])).rows[0].n,0);
  const reportJob=await manual(f,10,'Đua báo cắt và hủy chưa cắt'),reportAssignment=await assign(f,reportJob,'CUTTING',4);
  const reportResults=await Promise.all([api('POST',`${workspace}/${reportJob.order.id}/cancel-uncut`,uncutBody(reportJob,6,'uncut-vs-report'),f.manager.session),api('POST',`${dispatch}/assignments/${reportAssignment.row.id}/reports`,{work_date:dates.first,quantity_good:4,idempotency_key:key('uncut-concurrent-report')},f.cutter.session)]);
  assert.equal(reportResults[0].status,409);assert(reportResults[1].ok);assert.equal((await sql('select count(*)::int n from local_production_uncut_cancellations where production_order_id=$1',[reportJob.order.id])).rows[0].n,0);
}
async function uncutMultiBatchAndWholeCancel(f){
  const job=await manual(f,10,'Nhiều lô cùng dòng sản phẩm và hủy chưa cắt');
  const split=await must('POST',`${dispatch}/batches/${job.batch.id}/split`,{planned_quantity:4,batch_number:`UNCUT-SPLIT-${token}`,reason:'Chia lô trước khi giao việc',idempotency_key:key('uncut-split-before')},f.manager.session);
  await cancelUncut(f,job,6,'uncut-first-batch-six');
  const next={...job,batch:split};await denied('POST',`${workspace}/${job.order.id}/cancel-uncut`,uncutBody(next,5,'uncut-second-overbatch'),f.manager.session,[409]);
  await cancelUncut(f,next,4,'uncut-second-batch-four');
  assert.equal((await sql('select sum(quantity)=10 exact from local_production_uncut_cancellations where order_item_id=$1',[job.item.id])).rows[0].exact,true);
  const before=await snapshotAll([job.order.id]);await denied('POST',`${workspace}/${job.order.id}/cancel-uncut`,uncutBody(next,0.0001,'uncut-item-overaggregate'),f.manager.session,[409]);assert.deepEqual(await snapshotAll([job.order.id]),before);
  const completed=await must('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('uncut-all-no-output-complete')},f.manager.session);assert.equal(Number(completed.quantity_good),0);assert.equal(Number(completed.quantity_scrap),0);
  assert.equal((await sql('select count(*)::int n from local_production_outputs where production_order_id=$1',[job.order.id])).rows[0].n,0,'All-uncut cancellation created fake finished output.');
  const bare=async(label,release)=>{
    const group=await must('POST','/api/production-orders/groups',{source_type:'MANUAL',planned_start_date:dates.first,lines:[{product_id:f.product.id,quantity:1}],idempotency_key:key(label)},f.manager.session),order=group.orders[0];f.ids.push(order.id);
    if(release)await must('POST',`/api/production-orders/${order.id}/release`,{idempotency_key:key(`${label}-release`)},f.manager.session);return order;
  };
  for(const release of [false,true]){
    const order=await bare(`whole-unstarted-${release}`,release);
    if(!release){
      const details=await must('GET',`${workspace}/${order.id}/details`,undefined,f.manager.session),draftJob={order:details.order,batch:details.batches[0],item:details.items[0]},snapshot=await snapshotAll([order.id]);
      for(const amount of [0.5,1]){const refusal=await denied('POST',`${workspace}/${order.id}/cancel-uncut`,uncutBody(draftJob,amount,`uncut-draft-denied-${amount}`),f.manager.session,[409]);assert.match(refusal.payload.message,/Lệnh nháp chưa phát hành/);assert.deepEqual(await snapshotAll([order.id]),snapshot,'Draft partial cancellation created ledger/audit or stranded the draft.');}
    }
    const cancelled=await must('POST',`/api/production-orders/${order.id}/transition`,{target_status:'CANCELLED',reason:'Hủy toàn lệnh chưa bắt đầu'},f.manager.session);assert.equal(cancelled.status,'CANCELLED');
    assert.equal((await sql('select count(*)::int n from local_production_uncut_cancellations where production_order_id=$1',[order.id])).rows[0].n,0,'Whole-order cancellation must not fake partial ledger.');
  }
  const started=await manual(f,1,'Có phiếu vải không hủy toàn lệnh');await denied('POST',`/api/production-orders/${started.order.id}/transition`,{target_status:'CANCELLED',reason:'Đã có chứng từ vải'},f.manager.session,[409]);
  await denied('POST',`/api/production-batches/${started.batch.id}/status`,{target_status:'CANCELLED',reason:'Không hủy lô có vật tư'},f.manager.session,[409]);
}
async function productionTransitionPermissions(f){
  const employee=await actor(f.admin,'TRANSITION_EMPLOYEE_MANAGE','employee','GENERIC',['production_manage']);
  const leader=await actor(f.admin,'TRANSITION_TEAM_LEADER','team_leader','SUPERVISOR',['production_manage']);
  const accountant=await actor(f.admin,'TRANSITION_ACCOUNTANT_NONE','accountant','GENERIC');
  const releaseOnly=await actor(f.admin,'TRANSITION_ACCOUNTANT_RELEASE_ONLY','accountant','GENERIC',['production_release']);
  const releaseLeader=await actor(f.admin,'TRANSITION_TEAM_LEADER_RELEASE_ONLY','team_leader','SUPERVISOR',['production_release']);
  const scoped=await actor(f.admin,'TRANSITION_ACCOUNTANT_MANAGE','accountant','GENERIC',['production_manage']);
  const bare=async(label)=>{
    const group=await must('POST','/api/production-orders/groups',{source_type:'MANUAL',planned_start_date:dates.first,lines:[{product_id:f.product.id,quantity:1}],idempotency_key:key(`permission-${label}`)},f.manager.session),order=group.orders[0];f.ids.push(order.id);
    await must('POST',`/api/production-orders/${order.id}/release`,{idempotency_key:key(`permission-release-${label}`)},f.manager.session);
    const details=await must('GET',`${workspace}/${order.id}/details`,undefined,f.manager.session);return {order:details.order,batch:details.batches[0],item:details.items[0]};
  };
  const job=await bare('unstarted'),forbidden=[f.cutter,f.sale,employee,leader,accountant];
  const noMutation=async(path,body,person)=>{const snapshot=await snapshotAll([job.order.id]);await denied('POST',path,body,person.session,[403]);assert.deepEqual(await snapshotAll([job.order.id]),snapshot,'Forbidden transition changed order/batch/audit.');};
  for(const person of forbidden){
    await noMutation(`/api/production-orders/${job.order.id}/transition`,{target_status:'CANCELLED',reason:'Không được hủy lệnh dù chưa có WIP'},person);
    await noMutation(`/api/production-batches/${job.batch.id}/status`,{target_status:'CANCELLED',reason:'Không được hủy lô dù chưa có WIP'},person);
    await noMutation(`/api/production-orders/${job.order.id}/transition`,{target_status:'ON_HOLD',reason:'Không được tạm dừng'},person);
    await noMutation(`/api/production-batches/${job.batch.id}/status`,{target_status:'IN_PROGRESS'},person);
  }
  for(const reason of [undefined,'','   ']){const before=await snapshotAll([job.order.id]);await denied('POST',`/api/production-orders/${job.order.id}/transition`,{target_status:'ON_HOLD',reason},f.manager.session,[400,409]);assert.deepEqual(await snapshotAll([job.order.id]),before,'Pause without a reason changed order/batch/audit.');}
  const paused=await must('POST',`/api/production-orders/${job.order.id}/transition`,{target_status:'ON_HOLD',reason:'Quản lý tạm dừng hợp lệ'},f.manager.session);assert.equal(paused.status,'ON_HOLD');
  for(const person of [releaseOnly,releaseLeader])for(const prefix of ['/api/production-orders','/api/legacy-production-orders'])await noMutation(`${prefix}/${job.order.id}/release`,{reason:'Có quyền phát hành nhưng không có quyền tiếp tục lệnh'},person);
  for(const person of forbidden)await noMutation(`/api/production-orders/${job.order.id}/transition`,{target_status:'IN_PROGRESS',reason:'Không được tự tiếp tục'},person);
  for(const reason of [undefined,'','   ']){
    const before=await snapshotAll([job.order.id]);await denied('POST',`/api/production-orders/${job.order.id}/transition`,{target_status:'IN_PROGRESS',reason},scoped.session,[400,409]);assert.deepEqual(await snapshotAll([job.order.id]),before,'Resume without a reason changed order/batch/audit.');
    for(const prefix of ['/api/production-orders','/api/legacy-production-orders']){await denied('POST',`${prefix}/${job.order.id}/release`,{reason,idempotency_key:key(`release-resume-no-reason-${prefix.includes('legacy')}-${String(reason)}`)},f.manager.session,[400,409]);assert.deepEqual(await snapshotAll([job.order.id]),before,'Release/resume without a reason changed order/batch/audit.');}
  }
  const resumed=await must('POST',`/api/production-orders/${job.order.id}/transition`,{target_status:'IN_PROGRESS',reason:'Người được cấp quyền điều hành tiếp tục'},scoped.session);assert.equal(resumed.status,'IN_PROGRESS');
  const running=await must('POST',`/api/production-batches/${job.batch.id}/status`,{target_status:'IN_PROGRESS'},scoped.session);assert.equal(running.status,'IN_PROGRESS');
  const orderCancel=await bare('scoped-order-cancel'),batchCancel=await bare('scoped-batch-cancel');
  assert.equal((await must('POST',`/api/production-orders/${orderCancel.order.id}/transition`,{target_status:'CANCELLED',reason:'Hủy lệnh chưa có công việc bởi người có quyền'},scoped.session)).status,'CANCELLED');
  assert.equal((await must('POST',`/api/production-batches/${batchCancel.batch.id}/status`,{target_status:'CANCELLED',reason:'Hủy lô chưa có công việc bởi người có quyền'},scoped.session)).status,'CANCELLED');
  const audit=(await sql("select count(*)::int n from local_dispatch_audit_events where actor_id=$1 and production_order_id=any($2::uuid[]) and action in ('TRANSITION_ORDER','TRANSITION_BATCH')",[scoped.user.user_id,[job.order.id,orderCancel.order.id,batchCancel.order.id]])).rows[0];assert.equal(audit.n,4);
}
async function pausedProductionWork(f,completed){
  const job=await manual(f,4,'Tạm dừng giữ nguyên việc đang làm và việc mở');
  const accepted=await assign(f,job,'CUTTING',1);
  const pending=unwrap(await must('POST',`${dispatch}/assignments`,{production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,worker_id:f.cutter.worker.id,stage:'CUTTING',quantity:1,assigned_from:dates.first,idempotency_key:key('pause-pending-assignment')},f.manager.session),'assignment');
  const publishBody={production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,stage:'CUTTING',eligible_worker_type:'CUTTER',quantity:2,assigned_from:dates.first,idempotency_key:key('pause-existing-publication')};
  const publication=await must('POST',`${dispatch}/publications`,publishBody,f.manager.session);
  await must('POST',`/api/production-orders/${job.order.id}/transition`,{target_status:'ON_HOLD',reason:'Thiếu hướng dẫn cần giữ nguyên việc và hạn mức'},f.manager.session);
  const before=await snapshotAll([job.order.id]);
  const refused=async(path,body,session)=>{await denied('POST',path,body,session,[400,409]);assert.deepEqual(await snapshotAll([job.order.id]),before,'A paused-order action left partial assignment/report/ledger/audit state.');};
  await refused(`${dispatch}/publications`,{...publishBody,quantity:1,idempotency_key:key('pause-new-publication')},f.manager.session);
  await refused(`${dispatch}/publications/${publication.id}/claim`,{quantity:1,idempotency_key:key('pause-claim')},f.cutter.session);
  await refused(`${dispatch}/assignments/${pending.id}/accept`,{quantity:1,idempotency_key:key('pause-accept-pending')},f.cutter.session);
  await refused(`${dispatch}/assignments/${accepted.row.id}/reports`,{work_date:dates.first,quantity_good:1,idempotency_key:key('pause-report')},f.cutter.session);
  await must('POST',`/api/production-orders/${job.order.id}/transition`,{target_status:'IN_PROGRESS',reason:'Đã bổ sung hướng dẫn, cho phép tiếp tục'},f.manager.session);
  await must('POST',`${dispatch}/assignments/${pending.id}/accept`,{quantity:1,idempotency_key:key('pause-accept-pending')},f.cutter.session);
  await must('POST',`${dispatch}/publications/${publication.id}/claim`,{quantity:1,idempotency_key:key('pause-claim')},f.cutter.session);
  const row=await must('POST',`${dispatch}/assignments/${accepted.row.id}/reports`,{work_date:dates.first,quantity_good:1,idempotency_key:key('pause-report')},f.cutter.session);await approve(f,unwrap(row,'report'));
  await must('POST',`/api/production-orders/${job.order.id}/transition`,{target_status:'ON_HOLD',reason:'Kiểm thử đường phát hành tiếp tục có lý do'},f.manager.session);
  const releaseResume=await must('POST',`/api/production-orders/${job.order.id}/release`,{reason:'  Đã xác nhận đủ hướng dẫn để tiếp tục  ',idempotency_key:key('release-resume-valid-reason')},f.manager.session);assert.equal(releaseResume.status,'IN_PROGRESS');
  const resumeAudit=(await sql("select reason from local_dispatch_audit_events where production_order_id=$1 and action='RESUME_ORDER' order by created_at desc limit 1",[job.order.id])).rows[0];assert.equal(resumeAudit.reason,'Đã xác nhận đủ hướng dẫn để tiếp tục','Resume audit must record the real trimmed reason.');
  const settled=await snapshotAll([completed.order.id]);
  for(const target_status of ['ON_HOLD','IN_PROGRESS']){await denied('POST',`/api/production-orders/${completed.order.id}/transition`,{target_status,reason:'Không được mở lại lệnh đã hoàn thành'},f.manager.session,[400,409]);assert.deepEqual(await snapshotAll([completed.order.id]),settled,'Pause/resume reopened or changed a completed order.');}
}
async function uncutManualMeasuredAndPartialReturn(f){
  const group=await must('POST','/api/production-orders/groups',{source_type:'MANUAL',planned_start_date:dates.first,lines:[{product_id:f.product.id,quantity:10,fabric_variant_id:f.fabric}],idempotency_key:key('uncut-manual-measured-order')},f.manager.session),order=group.orders[0];f.ids.push(order.id);
  await must('POST',`/api/production-orders/${order.id}/release`,{idempotency_key:key('uncut-manual-measured-release')},f.manager.session);
  const detail=await must('GET',`${workspace}/${order.id}/details`,undefined,f.manager.session),job={order:detail.order,batch:detail.batches[0],item:detail.items[0]};
  const estimate=await must('POST',`/api/production-orders/${order.id}/cutting-estimates`,{production_batch_id:job.batch.id,lines:[{order_item_id:job.item.id,fabric_variant_id:f.fabric,inventory_item_id:f.material.id,warehouse_id:f.warehouse,output_quantity:10,calculation_method:'MANUAL_MEASURED',estimated_quantity:25,override_reason:'Đo sơ đồ cắt thực tế của fixture'}],idempotency_key:key('uncut-manual-estimate')},f.manager.session);
  await must('POST',`/api/cutting-estimates/${estimate.id}/submit`,{idempotency_key:key('uncut-manual-submit')},f.manager.session);await must('POST',`/api/cutting-estimates/${estimate.id}/review`,{target_status:'APPROVED',reason:'Duyệt đo thủ công độc lập',idempotency_key:key('uncut-manual-review')},f.admin);
  const issue=await must('POST',`/api/cutting-estimates/${estimate.id}/material-issue`,{warehouse_id:f.warehouse,lines:[{estimate_line_id:estimate.lines[0].id,quantity:25}],idempotency_key:key('uncut-manual-issue')},f.manager.session);await must('POST',`/api/inventory/documents/${issue.document?.id||issue.id}/confirm`,{},f.admin);
  const accepted=await assign(f,job,'CUTTING',10),cut=await report(f,accepted,4);await approve(f,cut);
  await denied('POST',`${workspace}/${job.order.id}/cancel-uncut`,uncutBody(job,6,'uncut-before-return'),f.manager.session,[409]);
  await must('POST',`${dispatch}/assignments/${accepted.row.id}/return`,{quantity:6,reason:'Trả phần chưa cắt để quản lý hủy',idempotency_key:key('uncut-return-six')},f.cutter.session);
  const before=await uncutFinancialState(job);await cancelUncut(f,job,6,'uncut-manual-after-return');assert.deepEqual(await uncutFinancialState(job),before);
  const board=await must('GET',`${workspace}?orderId=${order.id}`,undefined,f.manager.session);assert.equal(Number(board.rows[0].material.required),25);assert.equal(Number(board.rows[0].material.estimated),25);assert.equal(Number(board.rows[0].material.issued),25);assert.equal(board.rows[0].material.reconciliation_required,true,'Measured estimate was silently scaled instead of flagged for reconciliation.');
  const estimates=list(await must('GET',`/api/production-orders/${order.id}/cutting-estimates`,undefined,f.manager.session)),line=estimates.find(row=>row.id===estimate.id).lines[0];assert.equal(Number(line.estimated_quantity),25);assert.equal(Number(line.required_quantity),25);assert.equal(Number(line.executable_output_quantity),4);assert.equal(line.reconciliation_required,true);
  const assignments=await must('GET',`${dispatch}/mine`,undefined,f.cutter.session),remaining=assignments.assignments.find(row=>row.id===accepted.row.id);assert.equal(Number(remaining.remaining_quantity),0);assert.equal(Number(remaining.returned_quantity),6);
}
async function uncutManualMeasuredZeroOutput(f){
  const group=await must('POST','/api/production-orders/groups',{source_type:'MANUAL',planned_start_date:dates.first,lines:[{product_id:f.product.id,quantity:10,fabric_variant_id:f.fabric}],idempotency_key:key('uncut-zero-measured-order')},f.manager.session),order=group.orders[0];f.ids.push(order.id);
  await must('POST',`/api/production-orders/${order.id}/release`,{idempotency_key:key('uncut-zero-measured-release')},f.manager.session);
  const details=await must('GET',`${workspace}/${order.id}/details`,undefined,f.manager.session),job={order:details.order,batch:details.batches[0],item:details.items[0]};
  const estimate=await must('POST',`/api/production-orders/${order.id}/cutting-estimates`,{production_batch_id:job.batch.id,lines:[{order_item_id:job.item.id,fabric_variant_id:f.fabric,inventory_item_id:f.material.id,warehouse_id:f.warehouse,output_quantity:10,calculation_method:'MANUAL_MEASURED',estimated_quantity:25,override_reason:'Đo sơ đồ trước khi hủy toàn phần chưa cắt'}],idempotency_key:key('uncut-zero-measured-estimate')},f.manager.session);
  await must('POST',`/api/cutting-estimates/${estimate.id}/submit`,{idempotency_key:key('uncut-zero-measured-submit')},f.manager.session);
  await must('POST',`/api/cutting-estimates/${estimate.id}/review`,{target_status:'APPROVED',reason:'Duyệt đo thủ công độc lập',idempotency_key:key('uncut-zero-measured-review')},f.admin);
  const issue=await must('POST',`/api/cutting-estimates/${estimate.id}/material-issue`,{warehouse_id:f.warehouse,lines:[{estimate_line_id:estimate.lines[0].id,quantity:5}],idempotency_key:key('uncut-zero-measured-issue')},f.manager.session);
  await must('POST',`/api/inventory/documents/${issue.document?.id||issue.id}/confirm`,{},f.admin);
  const before=await uncutFinancialState(job);await cancelUncut(f,job,10,'uncut-zero-measured-cancel');assert.deepEqual(await uncutFinancialState(job),before,'Zero executable output auto-returned fabric or rewrote the approved measured estimate.');
  const board=await must('GET',`${workspace}?orderId=${order.id}`,undefined,f.manager.session),row=board.rows.find(x=>x.batch_id===job.batch.id&&x.item_id===job.item.id);assert(row);
  assert.equal(Number(row.executable_quantity),0);assert.equal(Number(row.material.estimated),25);assert.equal(Number(row.material.required),0,'A fully uncut-cancelled measured order must not request extra material.');assert.equal(Number(row.material.issued),5);assert.equal(row.material.has_shortage,false);
  const estimates=list(await must('GET',`/api/production-orders/${order.id}/cutting-estimates`,undefined,f.manager.session)),line=estimates.find(x=>x.id===estimate.id).lines[0];assert.equal(Number(line.estimated_quantity),25);assert.equal(Number(line.output_quantity),10);assert.equal(Number(line.executable_output_quantity),0);assert.equal(Number(line.required_quantity),0);
  const snapshot=await snapshotAll([order.id]);await denied('POST',`/api/cutting-estimates/${estimate.id}/material-issue`,{warehouse_id:f.warehouse,lines:[{estimate_line_id:line.id,quantity:1}],idempotency_key:key('uncut-zero-measured-no-more-issue')},f.manager.session,[409]);assert.deepEqual(await snapshotAll([order.id]),snapshot,'Rejected extra issue left an inventory draft.');
}
async function uncutExistingMaterialDrafts(f){
  for(const cancelled of [6,10]){
    const group=await must('POST','/api/production-orders/groups',{source_type:'MANUAL',planned_start_date:dates.first,lines:[{product_id:f.product.id,quantity:10,fabric_variant_id:f.fabric}],idempotency_key:key(`uncut-draft-issue-order-${cancelled}`)},f.manager.session),job=await prepare(f,group.orders[0],false);
    const draft=await must('POST',`/api/cutting-estimates/${job.estimate.id}/material-issue`,{warehouse_id:f.warehouse,lines:[{estimate_line_id:job.estimate.lines[0].id,quantity:20}],idempotency_key:key(`uncut-old-material-draft-${cancelled}`)},f.manager.session);
    const before=await uncutFinancialState(job);await cancelUncut(f,job,cancelled,`uncut-before-confirm-draft-${cancelled}`);assert.deepEqual(await uncutFinancialState(job),before);
    const snapshot=await snapshotAll([job.order.id]);await denied('POST',`/api/inventory/documents/${draft.id}/confirm`,{},f.admin,[409]);assert.deepEqual(await snapshotAll([job.order.id]),snapshot,'Confirming an obsolete issue draft left status/movement residue.');
    assert.equal((await sql('select status from local_inventory_documents where id=$1',[draft.id])).rows[0].status,'DRAFT');
    assert.equal((await sql('select count(*)::int n from local_inventory_movements where document_id=$1',[draft.id])).rows[0].n,0);
    if(cancelled===10)await denied('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('uncut-old-material-draft-completion')},f.manager.session,[409]);
    const voided=await must('POST',`/api/inventory/documents/${draft.id}/void`,{reason:'Hủy phiếu cũ vượt nhu cầu sau hủy phần chưa cắt'},f.admin);assert.equal(voided.status,'VOIDED');
    if(cancelled===6){
      const smaller=await must('POST',`/api/cutting-estimates/${job.estimate.id}/material-issue`,{warehouse_id:f.warehouse,lines:[{estimate_line_id:job.estimate.lines[0].id,quantity:8}],idempotency_key:key('uncut-small-material-draft')},f.manager.session);
      await must('POST',`/api/inventory/documents/${smaller.id}/confirm`,{},f.admin);
      assert.equal((await sql('select -sum(quantity_delta)=8 exact from local_inventory_movements where cutting_estimate_line_id=$1',[job.estimate.lines[0].id])).rows[0].exact,true);
    }else{
      const completed=await must('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('uncut-cleaned-material-draft-completion')},f.manager.session);assert.equal(Number(completed.quantity_good),0);assert.equal(Number(completed.quantity_scrap),0);
    }
    assert.equal((await sql('select estimated_quantity=20 and output_quantity=10 exact from local_cutting_estimate_lines where id=$1',[job.estimate.lines[0].id])).rows[0].exact,true,'Issue validation rewrote the original approved estimate.');
  }
}
async function uncutCompletionBlockersAndForeignItems(f){
  const job=await manual(f,10,'Không chốt khi phần đã cắt còn cần sửa'),foreign=await manual(f,1,'Dòng khác không được hủy hộ');
  const before=await snapshotAll([job.order.id,foreign.order.id]);
  for(const change of [{order_item_id:foreign.item.id},{production_batch_id:foreign.batch.id},{order_item_id:foreign.item.id,production_batch_id:foreign.batch.id}])await denied('POST',`${workspace}/${job.order.id}/cancel-uncut`,{...uncutBody(job,1,`uncut-foreign-${randomUUID()}`),...change},f.manager.session,[409]);assert.deepEqual(await snapshotAll([job.order.id,foreign.order.id]),before);
  for(const stage of ['CUTTING','SEWING','FINISHING']){const a=await assign(f,job,stage,4);await approve(f,await report(f,a,4));}
  const counter=await assign(f,job,'COUNTING',4),bad=await report(f,counter,3,1);await approve(f,bad);await cancelUncut(f,job,6,'uncut-with-pending-repair');
  await denied('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('uncut-unresolved-rework-complete')},f.manager.session,[409]);
  const ticket=await must('POST',`${workspace}/${job.order.id}/repair-tickets`,{source_stage_event_id:bad.id,quantity:1,target_stage:'SEWING',reason:'Sửa phần đã làm trước khi chốt',idempotency_key:key('uncut-repair-ticket')},f.manager.session);
  for(const stage of ['SEWING','FINISHING','COUNTING']){const a=await assign(f,job,stage,1,{repair_ticket_id:ticket.id});await approve(f,await report(f,a,1));}
  await receipt(f,job,4,'uncut-repaired-receive');
  const pending=await must('POST','/api/inventory/documents',{document_type:'ISSUE',warehouse_id:f.warehouse,production_order_id:job.order.id,transaction_at:dates.first,description:'Phiếu nháp chưa xử lý',idempotency_key:key('uncut-pending-inventory'),lines:[{inventory_item_id:f.material.id,quantity:1,unit:'METER'}]},f.admin);
  const snapshot=await snapshotAll([job.order.id]);await denied('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('uncut-draft-inventory-complete')},f.manager.session,[409]);assert.deepEqual(await snapshotAll([job.order.id]),snapshot);
  // The normal inventory confirmation resolves the blocker; no deletion or
  // invented ledger row is used to make completion pass.
  await must('POST',`/api/inventory/documents/${pending.id}/confirm`,{},f.admin);
  const completed=await must('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('uncut-repair-inventory-resolved')},f.manager.session);assert.equal(Number(completed.quantity_good),4);assert.equal(Number(completed.quantity_scrap),0);
}
async function uncutLockedPayrollInvariant(f){
  const person=await actor(f.admin,'UNCUT_LOCKED_SEWER','employee','SEWER',['production_view','production_operations']);
  // Use a separate work day: other deliberately-pending regression reports must
  // continue to block their own period rather than weakening the global guard.
  const lockDate=dates.start;
  // Explicit synthetic payroll prerequisites affect this owned fixture only.
  const policy=(await sql('select id from local_payroll_policy_groups where code=$1',[`FLOW-${token}`])).rows[0];
  await sql("insert into local_worker_compensation_assignments(worker_id,compensation_type,payroll_policy_group_id,effective_from,status,reason,approved_by) values($1,'PIECE_RATE',$2,$3,'APPROVED','Isolated uncut payroll fixture','local-admin')",[person.worker.id,policy.id,dates.start]);
  await sql("insert into local_worker_payroll_profiles(worker_id,piece_output_enabled,effective_from,status,reason,idempotency_key,request_hash,approved_by) values($1,true,$2,'APPROVED','Isolated uncut payroll fixture',$3,$3,'local-admin')",[person.worker.id,dates.start,key('uncut-locked-profile')]);
  const job=await manual(f,10,'Hủy chưa cắt không đổi kỳ lương đã khóa'),cut=await assign(f,job,'CUTTING',4,{assigned_from:lockDate});await approve(f,await report(f,cut,4,0,0,lockDate));
  const assigned=unwrap(await must('POST',`${dispatch}/assignments`,{production_order_id:job.order.id,production_batch_id:job.batch.id,order_item_id:job.item.id,worker_id:person.worker.id,stage:'SEWING',quantity:4,piece_rate_code:f.code,assigned_from:lockDate,idempotency_key:key('uncut-locked-assignment')},f.manager.session),'assignment');
  await must('POST',`${dispatch}/assignments/${assigned.id}/accept`,{quantity:4,idempotency_key:key('uncut-locked-accept')},person.session);const sewing={row:assigned,person};
  const reportBody={work_date:lockDate,quantity_good:4,idempotency_key:key('uncut-locked-report')},reportRow=unwrap(await must('POST',`${dispatch}/assignments/${sewing.row.id}/reports`,reportBody,person.session),'report');await approve(f,reportRow);
  const summary=await must('GET',`/api/my-attendance/day-summary?date=${lockDate}`,undefined,person.session);await must('POST','/api/my-attendance/day-confirm',{work_date:lockDate,expected_revision:summary.current_revision,idempotency_key:key('uncut-locked-confirm')},person.session);
  const managerSummary=await must('GET',`/api/attendance/day-summary?worker_id=${person.worker.id}&date=${lockDate}`,undefined,f.manager.session);await must('POST','/api/attendance/closures',{worker_id:person.worker.id,work_date:lockDate,target_status:'LEADER_CONFIRMED',reason:'Đối chiếu tiền may trước khóa',expected_revision:managerSummary.current_revision,idempotency_key:key('uncut-locked-close')},f.manager.session);
  // The established scope guard recognizes explicitly-labelled PAYTEST/HARDEN
  // records. Label only this run's verified synthetic actors, never relax that
  // guard or relabel an unowned/real worker to make a scoped run lock.
  const fixturePrefix=`FLOW-${token}-`,synthetic=(await sql('select id,employee_code,display_name from local_workers where left(employee_code,length($1))=$1 and id<>$2 order by id',[fixturePrefix,person.worker.id])).rows;
  assert(synthetic.length>=6);assert(synthetic.every(row=>row.employee_code.startsWith(fixturePrefix)&&row.display_name.startsWith('Workflow ')));
  const actorIds=synthetic.map(row=>row.id),marked=await sql("update local_workers set display_name='PAYTEST '||display_name where id=any($1::uuid[]) and left(employee_code,length($2))=$2 returning id",[actorIds,fixturePrefix]);assert.equal(marked.rows.length,actorIds.length);
  assert.equal((await sql('select display_name from local_workers where id=$1',[person.worker.id])).rows[0].display_name,person.worker.display_name);
  await approveLegacyPayrollFixture({query:sql},lockDate,lockDate,26);
  const run=await must('POST','/api/payroll/runs',{period_start:lockDate,period_end:lockDate,standard_days:26,worker_ids:[person.worker.id],idempotency_key:key('uncut-locked-payroll')},f.admin);assert.equal(Number(run.blocking_exception_count),0);
  const locked=await must('POST',`/api/payroll/runs/${run.id}/lock`,{},f.admin);assert.equal(locked.status,'LOCKED');assert(locked.items.some(row=>Number(row.amount_precise)===50001));assert(locked.config_snapshot.worker_scope_lock.omitted_test_worker_count>0);assert.deepEqual(locked.config_snapshot.worker_scope_lock.current_real_eligible_worker_ids,[person.worker.id]);
  const before=await uncutFinancialState(job);assert.equal(before.earnings.length,1);assert.equal(before.payrollItems.length,1,'Locked payroll invariant requires an actual source-linked payroll item.');await cancelUncut(f,job,6,'uncut-after-payroll-locked');assert.deepEqual(await uncutFinancialState(job),before);
  const after=await must('GET',`/api/payroll/runs/${run.id}`,undefined,f.admin);assert.deepEqual(after.items,locked.items,'Canceling uncut plan modified locked payroll items.');
  await denied('POST',`${dispatch}/reports/${reportRow.id}/reverse`,{reason:'Không được đảo nguồn lương đã khóa',idempotency_key:key('uncut-locked-reverse')},f.manager.session,[400,409]);
}
async function run(f){
  const internal=await manual(f,2,'Đơn nội bộ nghiệm thu');
  await denied('POST',`${workspace}/${internal.order.id}/complete`,{idempotency_key:key('complete-early')},f.manager.session);
  await stages(f,internal,2);
  await receipt(f,internal,2,'internal-receive');
  const completeBody={idempotency_key:key('internal-complete')};
  await must('POST',`${workspace}/${internal.order.id}/complete`,completeBody,f.manager.session);
  await refusalAndRepair(f);
  await partialAndClaimRace(f);
  await additionalRepair(f,false);await additionalRepair(f,true);
  await must('POST',`${workspace}/${internal.order.id}/complete`,completeBody,f.manager.session);
  const job=await sales(f);
  await stages(f,job,10);
  const first=await receipt(f,job,3,'sales-receive3'),second=await receipt(f,job,7,'sales-receive7','80000');
  await denied('POST',`${workspace}/${job.order.id}/receive`,receiveBody(f,job,1,'sales-overreceive'),f.manager.session);
  await denied('POST',`${workspace}/${job.order.id}/receive`,{...receiveBody(f,job,1,'cross-order-receive'),order_item_id:internal.item.id},f.manager.session);
  for(const [index,part] of [{output:first,quantity:1},{output:first,quantity:2},{output:second,quantity:7}].entries()){
    const {output,quantity}=part;
    const expectedCost=(await sql('select sum(value_delta)/sum(quantity_delta) cost from local_inventory_movements where inventory_item_id=$1 and warehouse_id=$2',[f.finished.id,f.warehouse])).rows[0].cost;
    const body={output_id:output.id,quantity,carrier_reference:`Giao thử ${index}`,idempotency_key:key(`ship-${index}`)};
    const posted=await must('POST',`${workspace}/${job.order.id}/ship`,body,f.manager.session);
    assert.equal((await sql('select $1::numeric=$2::numeric exact',[posted.movement.unit_cost,expectedCost])).rows[0].exact,true,'Shipment did not use current canonical weighted-average ledger cost.');
    const replay=await must('POST',`${workspace}/${job.order.id}/ship`,body,f.manager.session);assert.equal(replay.movement.id,posted.movement.id);
    const delivery={recipient_name:'Người nhận kiểm thử',delivery_evidence:'Biên bản giao cô lập',idempotency_key:key(`deliver-${index}`)};
    const delivered=await must('POST',`${workspace}/shipments/${posted.shipment.id}/deliver`,delivery,f.manager.session);
    await must('POST',`${workspace}/shipments/${posted.shipment.id}/deliver`,delivery,f.manager.session);
    assert.equal(delivered.order_delivered,false,'One same-SKU source line cannot deliver its unfulfilled sibling.');
  }
  await stages(f,job.peer,4);const sibling=await receipt(f,job.peer,4,'same-sku-sibling-receipt');
  await denied('POST',`${workspace}/${job.order.id}/ship`,{output_id:sibling.id,quantity:1,idempotency_key:key('cross-order-ship')},f.manager.session);
  const siblingShipment=await must('POST',`${workspace}/${job.peer.order.id}/ship`,{output_id:sibling.id,quantity:4,idempotency_key:key('same-sku-sibling-ship')},f.manager.session);
  const siblingDelivery=await must('POST',`${workspace}/shipments/${siblingShipment.shipment.id}/deliver`,{recipient_name:'Người nhận dòng đỏ',delivery_evidence:'Kiểm đủ hai dòng cùng mã sản phẩm',idempotency_key:key('same-sku-sibling-deliver')},f.manager.session);assert.equal(siblingDelivery.order_delivered,true);
  await must('POST',`${workspace}/${job.peer.order.id}/complete`,{idempotency_key:key('same-sku-sibling-complete')},f.manager.session);
  await must('POST',`${workspace}/${job.order.id}/complete`,{idempotency_key:key('sales-complete')},f.manager.session);
  assert.equal((await sql('select count(*)::int n from local_production_entries where source_stage_event_id in (select id from local_production_stage_events where production_order_id=$1)',[job.order.id])).rows[0].n,1);
  assert.equal(Number((await sql('select coalesce(sum(quantity_delta),0) balance from local_inventory_movements where inventory_item_id=$1',[f.finished.id])).rows[0].balance),18);
  const outcome=(await sql(`select
    (select sum(-m.quantity_delta)::text from local_inventory_movements m join local_inventory_documents d on d.id=m.document_id where d.production_order_id=$1 and m.inventory_item_id=$2) fabric_net,
    (select jsonb_object_agg(stage,quantity) from (select stage,sum(quantity_good)::text quantity from local_production_effective_stage_good where production_order_id=$1 group by stage) stages) stages,
    (select sum(quantity_good)::text from local_production_outputs where production_order_id=$1 and inventory_receipt_id is not null) received,
    (select sum(l.quantity)::text from local_production_shipment_lines l join local_production_shipments s on s.id=l.shipment_id where s.production_order_id=$1) shipped,
    (select sum(l.quantity)::text from local_production_shipment_lines l join local_production_shipments s on s.id=l.shipment_id where s.production_order_id=$1 and s.status='DELIVERED') delivered,
    (select count(*)::int from local_production_entries p join local_production_stage_events e on e.id=p.source_stage_event_id where e.production_order_id=$1 and p.workflow_status='APPROVED' and not p.is_reversed) wage_sources,
    (select sum(p.calculated_amount)::text from local_production_entries p join local_production_stage_events e on e.id=p.source_stage_event_id where e.production_order_id=$1 and p.workflow_status='APPROVED' and not p.is_reversed) piece_pay,
    (select status from local_production_orders where id=$1) status`,[job.order.id,f.material.id])).rows[0];
  assert.equal(Number(outcome.fabric_net),20);for(const stage of ['CUTTING','SEWING','FINISHING','COUNTING'])assert.equal(Number(outcome.stages[stage]),10);for(const field of ['received','shipped','delivered'])assert.equal(Number(outcome[field]),10);assert.equal(outcome.wage_sources,1);assert.equal(outcome.piece_pay,'125002.50');assert.equal(outcome.status,'COMPLETED');
  console.log('PASS workspace full-order outcome: ordered10; fabric net20m; cut10/sew10/finish10/count10; received10/shipped10/delivered10; exactly1 approved Excel-code wage source =125002.50VND; create/report/review/receipt/delivery exact-key retries did not duplicate.');
  await mixedUnitsAndMissingRole(f);
  await previewMaterialsAndReturn(f);
  await shippingWithoutCost(f);
  await shipmentRaces(f);
  await operationalRoles(f);
  await workspaceWorkerMetadata(f);
  await pendingStageProjection(f);
  await reviewerWorkspaceAccess(f);
  await globalReviewQueue(f);
  await scopedCuttingStock(f);
  await referenceSnapshotsAndInstructions(f);
  await historicalRateSelection(f);
  await sameWorkerMultipleAssignmentsEarnings(f);
  await uncutSettlement(f,false);await uncutSettlement(f,true);await uncutSalePromise(f);await uncutScrapAcrossStages(f);await uncutReservationsAndRaces(f);await uncutMultiBatchAndWholeCancel(f);
  await productionTransitionPermissions(f);await pausedProductionWork(f,internal);await uncutManualMeasuredAndPartialReturn(f);await uncutManualMeasuredZeroOutput(f);await uncutExistingMaterialDrafts(f);await uncutCompletionBlockersAndForeignItems(f);
  // Retained UI work must be prepared before the final fixture locks its
  // payroll period; never weaken that lock or move report dates around it.
  let progress;
  if(process.env.LOCAL_DISPATCH_QA_MANIFEST){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),dayPart=type=>parts.find(part=>part.type===type).value,qaDate=`${dayPart('year')}-${dayPart('month')}-${dayPart('day')}`;
    progress=await manual(f,10,'QA giao diện: đồng thời Cắt – May – Gấp là – Kiểm đếm');
    for(const [stage,quantity] of [['CUTTING',4],['SEWING',3],['FINISHING',2]]){const work=await assign(f,progress,stage,quantity,{assigned_from:qaDate});await approve(f,await report(f,work,quantity,0,0,qaDate));}
    for(const stage of ['CUTTING','COUNTING']){const work=await assign(f,progress,stage,1,{assigned_from:qaDate});await report(f,work,1,0,0,qaDate);}
    for(const [stage,quantity] of [['CUTTING',5],['SEWING',1],['FINISHING',1],['COUNTING',1]])await must('POST',`${dispatch}/publications`,{production_order_id:progress.order.id,production_batch_id:progress.batch.id,order_item_id:progress.item.id,stage,eligible_worker_type:{CUTTING:'CUTTER',SEWING:'SEWER',FINISHING:'IRONING',COUNTING:'QC'}[stage],quantity,piece_rate_code:stage==='SEWING'?f.code:undefined,assigned_from:qaDate,idempotency_key:key(`qa-progress-open-${stage}`)},f.manager.session);
    await sql("insert into local_payroll_team_assignments(supervisor_worker_id,worker_id,effective_from,reason,created_by) select $1,x,$2,'Retained QA reviewer team only','local-admin' from unnest($3::uuid[]) x",[f.qaAccounts.team_leaderReviewerLinked.worker.id,qaDate,[f.cutter.worker.id,f.sewer.worker.id,f.finisher.worker.id,f.counter.worker.id]]);
  }
  await uncutLockedPayrollInvariant(f);
  const self=await must('GET',workspace,undefined,f.sewer.session);assert.equal(self.mode,'SELF');assert.deepEqual(self.rows,[]);
  await denied('GET',`${workspace}/${job.order.id}/details`,undefined,f.sewer.session,[403]);
  const qa=await manual(f,10,'Đơn mở để kiểm tra giao diện');
  const publication=await must('POST',`${dispatch}/publications`,{production_order_id:qa.order.id,production_batch_id:qa.batch.id,order_item_id:qa.item.id,stage:'CUTTING',eligible_worker_type:'CUTTER',quantity:10,assigned_from:dates.first,idempotency_key:key('qa-open-cutting')},f.manager.session);
  return {internal,job,qa,publication,progress};
}
if(process.argv.includes('--serve-ui')){
  await isolated();await close();
  const {createServer}=await import('vite'),{default:react}=await import('@vitejs/plugin-react-swc');
  const {createServer:reserve}=await import('node:net');
  const temporary=reserve();await new Promise(r=>temporary.listen(0,'127.0.0.1',r));const port=temporary.address().port;await new Promise(r=>temporary.close(r));
  const webBase=`http://127.0.0.1:${port}`,root=fileURLToPath(new URL('../',import.meta.url));
  const frontendEnv={VITE_BACKEND_MODE:'local',VITE_LOCAL_API_URL:webBase,VITE_LOCAL_DEMO_AUTH:'false',VITE_SUPABASE_URL:'',VITE_SUPABASE_PUBLISHABLE_KEY:''};
  const frontend=await createServer({root,configFile:false,envFile:false,envDir:false,cacheDir:resolve(root,'.local-staging-runtime',`${databaseName}-web-${process.pid}`,'vite-cache'),logLevel:'warn',plugins:[react()],resolve:{alias:{'@':resolve(root,'src')},dedupe:['react','react-dom','react/jsx-runtime']},optimizeDeps:{entries:['src/main.tsx'],include:['react','react-dom','react/jsx-runtime','react-dom/client']},define:Object.fromEntries(Object.entries(frontendEnv).map(([k,v])=>['import.meta.env.'+k,JSON.stringify(v)])),server:{host:'127.0.0.1',port,strictPort:true,watch:{ignored:['**/.local*/**','**/.isolated-*','**/server-dist/**','**/dist/**']},proxy:{'/api':{target:process.env.LOCAL_API_URL,changeOrigin:true,configure:proxy=>proxy.on('proxyReq',request=>request.setHeader('origin','http://127.0.0.1:8090'))}}}});
  await frontend.listen();const path=pathFor('LOCAL_DISPATCH_QA_MANIFEST'),manifest=JSON.parse(await readFile(path,'utf8'));manifest.webBase=webBase;manifest.webPid=process.pid;await writeFile(path,JSON.stringify(manifest,null,2));
  console.log(`Owned source UI ready: ${webBase}/production-orders (PID ${process.pid}); envFile:false; only owned API ${manifest.apiUrl}`);
}else if(process.argv.includes('--verify-restart')){
  try{
    await isolated();const saved=JSON.parse(await readFile(pathFor('LOCAL_DISPATCH_RESTART_CHECKPOINT'),'utf8'));
    assert.equal(saved.database,databaseName);assert.deepEqual(await snapshotAll(saved.orderIds),saved.snapshot,'Restart changed authoritative workflow data.');
    if(process.env.LOCAL_DISPATCH_QA_MANIFEST){const path=pathFor('LOCAL_DISPATCH_QA_MANIFEST');const qa=JSON.parse(await readFile(path,'utf8'));qa.apiRootPid=Number(process.env.LOCAL_DISPATCH_QA_API_PID);await writeFile(path,JSON.stringify(qa,null,2));}
    console.log(`PASS workspace restart: ${saved.orderIds.length} orders and shipment/ledger/repair snapshots unchanged.`);
  }finally{await close();}
}else{
  try{
    await isolated();const f=await setup(),details=await run(f);
    await writeFile(pathFor('LOCAL_DISPATCH_RESTART_CHECKPOINT'),JSON.stringify({database:databaseName,orderIds:f.ids,snapshot:await snapshotAll(f.ids)}),{flag:'wx'});
    if(process.env.LOCAL_DISPATCH_QA_MANIFEST){const qaPeople={...Object.fromEntries(['manager','sale','cutter','sewer','finisher','counter','outsider'].map(name=>[name,f[name]])),...f.qaAccounts};await writeFile(pathFor('LOCAL_DISPATCH_QA_MANIFEST'),JSON.stringify({database:databaseName,apiUrl:process.env.LOCAL_API_URL,apiRootPid:Number(process.env.LOCAL_DISPATCH_QA_API_PID),fixtureKey:token,suite:'production-workspace',accounts:Object.fromEntries(Object.entries(qaPeople).map(([name,person])=>[name,{email:person.user.email,workerId:person.worker.id}])),orders:{internal:details.internal.order.id,sales:details.job.order.id,open:details.qa.order.id,...(details.progress?{simultaneousStages:details.progress.order.id}:{})}},null,2),{flag:'wx'});}
    console.log(`PASS local production workspace: ${checkCount()} HTTP checks; manual+Sale → four stages → receipts → shipments → completion.`);
  }finally{await close();}
}
