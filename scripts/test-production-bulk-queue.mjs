import assert from 'node:assert/strict';
import {restoreQueue,editableQueueRow,editQueueRow,freezeQueueRow,runProductionQueue,reportDate,inProductionContext,productionBulkCandidates,buildProductionQueuePayload,validProductionQueueResult,reviewAssignmentAllowsApproval} from '../src/lib/production-bulk-queue.ts';

// Pure state-machine verification: no browser, database, credentials or network.
let checks=0;
const test=async(name,fn)=>{await fn();checks++;console.log(`PASS production queue: ${name}`);};
const clone=value=>JSON.parse(JSON.stringify(value));
const draft=(id,kind='REPORT')=>({id:`${kind}:${id}`,targetId:id,kind,label:`Công việc ${id}`,status:'DRAFT',fields:{date:'2026-09-10',good:'1.2500',rework:'0',remake:'0',defect:'0',notes:'Giữ bản nháp',batchId:'batch-1',itemId:'item-1',stage:'SEWING'}});
const body=row=>({work_date:row.fields.date,quantity_good:row.fields.good,quantity_rework:row.fields.rework,quantity_remake:row.fields.remake,quantity_defect:row.fields.defect,notes:row.fields.notes});
const httpError=status=>Object.assign(new Error(`Fixture HTTP ${status}`),{name:'LocalApiError',status,structuredResponse:true});
const store=(rows,userId='worker-a')=>JSON.stringify({version:1,userId,rows});

await test('one stable key and immutable deep payload per attempted row',()=>{
  let generated=0;const row=draft('freeze'),input={...body(row),nested:{quantity:'1.2500'}};
  const frozen=freezeQueueRow(row,input,()=>`key-${++generated}`);input.nested.quantity='999';
  assert.equal(frozen.status,'SENDING');assert.equal(generated,1);assert.equal(frozen.payload.nested.quantity,'1.2500');assert.equal(frozen.payload.idempotency_key,frozen.key);
  const retry=freezeQueueRow({...frozen,status:'UNKNOWN',everUnknown:true},{quantity_good:'999'},()=>`key-${++generated}`);
  assert.equal(generated,1);assert.deepEqual(retry.payload,frozen.payload);assert.equal(retry.key,frozen.key);
  for(const status of ['SENDING','UNKNOWN','SUCCESS'])assert.throws(()=>editQueueRow({...frozen,status},{...row.fields,good:'99'}),/khóa|nội dung|đã gửi/i);
  const success={...frozen,status:'SUCCESS'};assert.equal(freezeQueueRow(success,{},()=>{throw new Error('Must not allocate key for successful row');}),success);
});

await test('partial success, unknown response and exact replay never resend successful rows',async()=>{
  const rows=['a','b','c','d','e'].map(id=>draft(id));let generated=0,persisted=rows,phase=0;
  const calls=[],ledger=new Map(),commits=[];
  const commit=next=>{persisted=clone(next);commits.push(clone(next));};
  const request=async(row,payload)=>{
    const stored=persisted.find(value=>value.id===row.id);assert.equal(stored.status,'SENDING','Request ran before the frozen row was persisted.');assert.deepEqual(stored.payload,payload);assert.equal(stored.key,payload.idempotency_key);
    calls.push({phase,id:row.id,key:payload.idempotency_key,payload:clone(payload)});
    if(phase===0&&row.targetId==='b'){ledger.set(payload.idempotency_key,clone(payload));throw new TypeError('Response lost after the fixture server committed.');}
    if(phase===0&&row.targetId==='c')throw httpError(422);
    if(phase===0&&row.targetId==='d')throw Object.assign(new Error('Unstructured transport error'),{status:400});
    if(phase===0&&row.targetId==='e')throw httpError(503);
    if(phase===1&&row.targetId==='b')throw httpError(403);
    if(phase===2&&row.targetId==='b')assert.deepEqual(payload,ledger.get(payload.idempotency_key),'Replay changed the payload committed before the response was lost.');
    payload.quantity_good='999'; // A request implementation cannot mutate the retained frozen payload.
    return {id:`result-${row.targetId}`};
  };
  const first=await runProductionQueue(rows,rows.flatMap(row=>[row.id,row.id]),body,request,commit,()=>`attempt-${++generated}`);
  assert.equal(first.succeeded,1);assert.equal(first.failed,4);assert.equal(generated,5);assert.equal(calls.length,5);
  assert.deepEqual(first.rows.map(row=>row.status),['SUCCESS','UNKNOWN','ERROR','UNKNOWN','UNKNOWN']);
  assert.equal(editableQueueRow(first.rows[2]),true);assert.equal(editableQueueRow(first.rows[1]),false);
  for(const row of first.rows)assert.equal(row.payload.quantity_good,'1.2500');
  const frozenB=clone(first.rows[1]);
  phase=1;
  const second=await runProductionQueue(first.rows,rows.map(row=>row.id),()=>{throw new Error('Retry must use the persisted payload, not rebuild from refreshed fields.');},request,commit,()=>{throw new Error('Retry allocated a new key.');});
  assert.equal(second.succeeded,3);assert.equal(second.failed,1);assert.equal(second.rows[1].status,'UNKNOWN');assert.equal(second.rows[1].everUnknown,true);assert.equal(editableQueueRow(second.rows[1]),false,'A later definitive 403 unlocked an earlier unknown result.');
  assert.equal(calls.filter(call=>call.id===rows[0].id).length,1);
  phase=2;
  const third=await runProductionQueue(second.rows,rows.map(row=>row.id),body,request,commit,()=>{throw new Error('Reconciliation allocated a new key.');});
  assert.equal(third.succeeded,1);assert.equal(third.failed,0);assert(third.rows.every(row=>row.status==='SUCCESS'));assert.equal(ledger.size,1);
  const bCalls=calls.filter(call=>call.id===rows[1].id);assert.equal(bCalls.length,3);assert(bCalls.every(call=>call.key===frozenB.key));for(const call of bCalls)assert.deepEqual(call.payload,frozenB.payload);
  const fourth=await runProductionQueue(third.rows,rows.map(row=>row.id),body,()=>{throw new Error('Successful rows were sent again.');},commit);assert.equal(fourth.succeeded,0);assert.equal(fourth.failed,0);
  assert(commits.length>calls.length,'Per-line sending/result states were not persisted.');
});

await test('definitive rejection can be edited; unstructured, timeout and unknown remain locked',async()=>{
  for(const status of [400,403,404,409,422]){
    const result=await runProductionQueue([draft(String(status))],[`REPORT:${status}`],body,async()=>{throw httpError(status);},()=>{},()=>`key-${status}`);
    assert.equal(result.rows[0].status,'ERROR');assert.equal(editableQueueRow(result.rows[0]),true);
    const edited=editQueueRow(result.rows[0],{...result.rows[0].fields,good:'2'});assert.equal(edited.status,'DRAFT');assert.equal(edited.key,undefined);assert.equal(edited.payload,undefined);assert.equal(edited.fields.good,'2');
  }
  for(const status of [408,429,500,502]){
    const result=await runProductionQueue([draft(String(status))],[`REPORT:${status}`],body,async()=>{throw httpError(status);},()=>{},()=>`key-${status}`);
    assert.equal(result.rows[0].status,'UNKNOWN');assert.equal(editableQueueRow(result.rows[0]),false);
  }
});

await test('validation error is local per row and does not prevent later valid rows',async()=>{
  const rows=[draft('invalid'),draft('valid')],requests=[];
  const result=await runProductionQueue(rows,rows.map(row=>row.id),row=>{if(row.targetId==='invalid')throw new Error('Sản lượng chưa hợp lệ.');return body(row);},async row=>{requests.push(row.id);return{id:row.id};},()=>{},()=> 'valid-key');
  assert.equal(result.failed,1);assert.equal(result.succeeded,1);assert.equal(result.rows[0].status,'ERROR');assert.equal(result.rows[0].key,undefined);assert.deepEqual(requests,['REPORT:valid']);
});

await test('storage failure prevents sending and recovery keeps exact uncertain key',async()=>{
  let requests=0;
  await assert.rejects(()=>runProductionQueue([draft('before')],['REPORT:before'],body,async()=>{requests++;return{id:'never'};},()=>{throw new Error('Fixture storage full');},()=> 'before-key'),/storage full/);assert.equal(requests,0);
  let durable=null;
  await assert.rejects(()=>runProductionQueue([draft('after')],['REPORT:after'],body,async()=>{requests++;return{id:'committed'};},rows=>{if(rows[0].status==='SUCCESS')throw new Error('Fixture cannot persist response');durable=store(clone(rows));},()=> 'after-key'),/persist response/);
  assert.equal(requests,1);const recovered=restoreQueue(durable,'worker-a');assert.equal(recovered[0].status,'UNKNOWN');assert.equal(recovered[0].everUnknown,true);assert.equal(recovered[0].key,'after-key');assert.equal(recovered[0].payload.idempotency_key,'after-key');
});

await test('restore is account scoped, strict and makes interrupted sending unknown',async()=>{
  assert.deepEqual(restoreQueue(null,'worker-a'),[]);assert.throws(()=>restoreQueue('{bad','worker-a'));
  const frozen=freezeQueueRow(draft('restore'),body(draft('restore')),()=> 'restore-key'),restored=restoreQueue(store([frozen]),'worker-a');assert.equal(restored[0].status,'UNKNOWN');assert.equal(restored[0].everUnknown,true);assert.equal(editableQueueRow(restored[0]),false);
  assert.throws(()=>restoreQueue(store([frozen],'worker-b'),'worker-a'),/tài khoản|phiên bản/);
  for(const raw of [store([frozen,frozen]),store([{...frozen,key:undefined}]),store([{...frozen,payload:{idempotency_key:'other'}}]),store([{...draft('fields'),fields:{good:1}}]),JSON.stringify({version:2,userId:'worker-a',rows:[]})])assert.throws(()=>restoreQueue(raw,'worker-a'));
  const unknown=restoreQueue(store([{...frozen,status:'UNKNOWN',everUnknown:undefined}]),'worker-a');
  const retry=await runProductionQueue(unknown,[unknown[0].id],body,async()=>{throw httpError(400);},()=>{});assert.equal(retry.rows[0].status,'UNKNOWN','Restored UNKNOWN became editable after a later validation response.');assert.equal(editableQueueRow(retry.rows[0]),false);
});

await test('ordinary refresh does not replace unsent draft or frozen successful requests',()=>{
  const rows=[editQueueRow(draft('draft'),{...draft('draft').fields,good:'7',notes:'Chưa gửi: không được xóa khi tải lại'}),{...freezeQueueRow(draft('done'),body(draft('done')),()=> 'done-key'),status:'SUCCESS',resultId:'server-result'}];
  const reloaded=restoreQueue(store(rows),'worker-a');assert.deepEqual(reloaded.map(row=>row.fields),rows.map(row=>row.fields));assert.equal(reloaded[1].key,'done-key');assert.equal(reloaded[1].resultId,'server-result');assert.equal(reloaded[1].status,'SUCCESS');
});

await test('report dates and exact batch/item/stage context',()=>{
  assert.equal(reportDate({assigned_from:'2026-09-01',assigned_to:null},'2026-09-10'),'2026-09-10');
  assert.equal(reportDate({assigned_from:'2026-09-01',assigned_to:'2026-09-05'},'2026-09-10'),'2026-09-05');
  assert.equal(reportDate({assigned_from:'2026-09-11',assigned_to:null},'2026-09-10'),'');
  const row={production_batch_id:'batch-a',order_item_id:'item-a',dispatch_stage:'SEWING'},context={batchId:'batch-a',itemId:'item-a',stage:'SEWING'};
  assert.equal(inProductionContext(row,context),true);assert.equal(inProductionContext(row),true);
  for(const patch of [{batchId:'batch-b'},{itemId:'item-b'},{stage:'CUTTING'}])assert.equal(inProductionContext(row,{...context,...patch}),false);
  assert.equal(inProductionContext({production_batch_id:'batch-a',order_item_id:'item-a',stage:'COUNTING'},{...context,stage:'COUNTING'}),true);
});

await test('REPORT remains active-only; REVIEW retains paused correction candidates and excludes self/wrong context',()=>{
  const assignment=(id,patch={})=>({id,production_batch_id:'batch-1',order_item_id:'item-1',dispatch_stage:'SEWING',order_status:'RELEASED',batch_status:'PLANNED',dispatch_status:'ACCEPTED',own_assignment:true,remaining_quantity:'3',assigned_from:'2026-09-01',assigned_to:'2026-09-15',...patch});
  const jobs=[assignment('eligible'),assignment('pending',{dispatch_status:'PENDING'}),assignment('rejected',{dispatch_status:'REJECTED'}),assignment('other-worker',{own_assignment:false}),assignment('zero',{remaining_quantity:'0'}),assignment('paused',{order_status:'ON_HOLD'}),assignment('completed-batch',{batch_status:'COMPLETED'}),assignment('foreign-batch',{production_batch_id:'batch-2'}),assignment('foreign-item',{order_item_id:'item-2'}),assignment('foreign-stage',{dispatch_stage:'CUTTING'})];
  const context={batchId:'batch-1',itemId:'item-1',stage:'SEWING'},reports=[{id:'ok',assignment_id:'eligible',created_by:'worker',status:'SUBMITTED'},{id:'self',assignment_id:'eligible',created_by:'reviewer',status:'SUBMITTED'},{id:'already-approved',assignment_id:'eligible',created_by:'worker',status:'APPROVED'},{id:'foreign',assignment_id:'foreign-batch',created_by:'worker',status:'SUBMITTED'},{id:'paused-report',assignment_id:'paused',created_by:'worker',status:'SUBMITTED'},{id:'completed-quantity',assignment_id:'zero',created_by:'worker',status:'SUBMITTED'}];
  assert.deepEqual(productionBulkCandidates(jobs,reports,'reviewer',true,context).jobs.map(row=>row.id),['eligible']);
  // Intentional Repair2 contract: pending inactive work stays visible for a
  // reasoned REJECTED correction, never for APPROVED or new REPORT submission.
  const selected=productionBulkCandidates(jobs,reports,'reviewer',false,context);assert.deepEqual(selected.reports.map(row=>row.id),['ok','paused-report','completed-quantity']);
  for(const patch of [{order_status:'ON_HOLD'},{order_status:'COMPLETED'},{order_status:'CANCELLED'},{batch_status:'COMPLETED'},{batch_status:'CANCELLED'}]){
    const inactive=assignment('inactive',patch),pending={id:'inactive-report',assignment_id:inactive.id,created_by:'worker',status:'SUBMITTED'};
    assert.equal(reviewAssignmentAllowsApproval(inactive),false);
    assert.deepEqual(productionBulkCandidates([inactive],[pending],'reviewer',true,context).jobs,[]);
    assert.equal(productionBulkCandidates([inactive],[pending],'reviewer',false,context).reports.length,1);
    const review={...draft(pending.id,'REVIEW'),fields:{target:'APPROVED',reason:'Đối chiếu',batchId:'batch-1',itemId:'item-1',stage:'SEWING'}};
    assert.throws(()=>buildProductionQueuePayload(review,[inactive],[pending],'reviewer','2026-09-10',context),/chỉ có thể từ chối/);
    assert.throws(()=>buildProductionQueuePayload({...review,fields:{...review.fields,target:'REJECTED',reason:' '}},[inactive],[pending],'reviewer','2026-09-10',context),/lý do/);
    assert.deepEqual(buildProductionQueuePayload({...review,fields:{...review.fields,target:'REJECTED',reason:'  Lệnh dừng, báo lại  '}},[inactive],[pending],'reviewer','2026-09-10',context),{target_status:'REJECTED',reason:'Lệnh dừng, báo lại'});
  }
});

await test('actual payload builder validates report quantities/dates and per-line review reason',()=>{
  const assignment={id:'build',production_batch_id:'batch-1',order_item_id:'item-1',dispatch_stage:'SEWING',order_status:'IN_PROGRESS',batch_status:'PLANNED',dispatch_status:'ACCEPTED',own_assignment:true,remaining_quantity:'3',assigned_from:'2026-09-01',assigned_to:'2026-09-15'},row={...draft('build'),fields:{...draft('build').fields,good:'1.25'}},today='2026-09-10';
  const build=next=>buildProductionQueuePayload(next,[assignment],[],'worker',today);
  assert.equal(build(row).quantity_good,'1.25');
  const defectOnly={...row,fields:{...row.fields,good:'0',defect:'2',notes:'  Hỏng cần đối chiếu  '}};assert.equal(build(defectOnly).quantity_defect,'2');assert.equal(build(defectOnly).notes,'Hỏng cần đối chiếu');
  for(const patch of [{good:'0'},{good:'-1'},{good:'1e2'},{good:'0.001'},{good:'1.2500'},{good:'3.01'},{date:'2026-02-30'},{date:'2026-08-31'},{date:'2026-09-11'},{date:''}])assert.throws(()=>build({...row,fields:{...row.fields,...patch}}));
  const decimalRow={...row,fields:{...row.fields,good:'0.1',rework:'0.2'}};
  assert.equal(buildProductionQueuePayload(decimalRow,[{...assignment,remaining_quantity:'0.3'}],[],'worker',today).quantity_good,'0.1','Valid 0.10 + 0.20 must not exceed a 0.30 quota due to floating point.');
  assert.throws(()=>buildProductionQueuePayload(row,[{...assignment,assigned_to:'2026-09-09'}],[],'worker',today));
  assert.throws(()=>buildProductionQueuePayload(row,[{...assignment,remaining_quantity:'0'}],[],'worker',today));
  const review={...draft('report-1','REVIEW'),fields:{target:'APPROVED',reason:'  Đã kiểm  ',batchId:'batch-1',itemId:'item-1',stage:'SEWING'}},reports=[{id:'report-1',assignment_id:'build',created_by:'worker',status:'SUBMITTED'}];
  const reviewBody=buildProductionQueuePayload(review,[assignment],reports,'manager',today);assert.deepEqual(reviewBody,{target_status:'APPROVED',reason:'Đã kiểm'});
  assert.throws(()=>buildProductionQueuePayload(review,[assignment],reports,'worker',today),/phạm vi/);
  for(const fields of [{target:'REJECTED',reason:''},{target:'LOCKED',reason:'Không hợp lệ'}])assert.throws(()=>buildProductionQueuePayload({...review,fields:{...review.fields,...fields}},[assignment],reports,'manager',today));
  assert.deepEqual(buildProductionQueuePayload({...review,fields:{...review.fields,target:'REJECTED',reason:'Sai số cần sửa'}},[assignment],reports,'manager',today),{target_status:'REJECTED',reason:'Sai số cần sửa'});
});

await test('malformed 2xx and wrong result identity/status remain unknown and replay both exact keys',async()=>{
  const variants=[
    {row:draft('malformed'),result:{}},
    {row:draft('wrong-assignment'),result:{id:'saved',assignment_id:'some-other-assignment',status:'SUBMITTED'}},
    {row:draft('wrong-status'),result:{id:'saved',assignment_id:'wrong-status',status:'REJECTED'}},
    {row:{...draft('review-target','REVIEW'),fields:{target:'APPROVED',reason:''}},result:{id:'other-report',status:'APPROVED'}},
    {row:{...draft('review-status','REVIEW'),fields:{target:'REJECTED',reason:'Không đạt'}},result:{id:'review-status',status:'APPROVED'}},
  ];
  for(const fixture of variants){
    const build=row=>row.kind==='REPORT'?body(row):{target_status:row.fields.target,reason:row.fields.reason};
    const result=await runProductionQueue([fixture.row],[fixture.row.id],build,async()=>fixture.result,()=>{},()=>`unknown-${fixture.row.targetId}`,validProductionQueueResult);
    assert.equal(result.failed,1);assert.equal(result.succeeded,0);assert.equal(result.rows[0].status,'UNKNOWN');assert.equal(editableQueueRow(result.rows[0]),false);
    const frozen=clone(result.rows[0]),restored=restoreQueue(store(result.rows),'worker-a');
    const replay=await runProductionQueue(restored,[fixture.row.id],()=>{throw new Error('Rebuilt a result with an unknown prior outcome.');},async(row,payload)=>{assert.deepEqual(payload,frozen.payload);return row.kind==='REPORT'?{id:'confirmed-report',assignment_id:row.targetId,status:'SUBMITTED'}:{id:row.targetId,status:payload.target_status};},()=>{},()=>{throw new Error('Allocated a fresh key for malformed 2xx');},validProductionQueueResult);
    assert.equal(replay.rows[0].status,'SUCCESS');assert.equal(replay.rows[0].key,frozen.key);
  }
  const originals=['unknown-a','unknown-b'].map(id=>freezeQueueRow(draft(id),body(draft(id)),()=>id+'-key')).map(row=>({...row,status:'UNKNOWN',everUnknown:true}));
  const calls=[];const both=await runProductionQueue(originals,originals.map(row=>row.id),()=>{throw new Error('Rebuilt unknown rows');},async(row,payload)=>{calls.push([row.targetId,payload.idempotency_key]);return{id:'saved-'+row.targetId,assignment_id:row.targetId,status:'SUBMITTED'};},()=>{},undefined,validProductionQueueResult);
  assert.equal(both.succeeded,2);assert.deepEqual(calls,[['unknown-a','unknown-a-key'],['unknown-b','unknown-b-key']]);
});

await test('quota refresh after an ambiguous commit cannot rebuild or erase an attempted report',async()=>{
  const row={...freezeQueueRow(draft('refresh'),body(draft('refresh')),()=> 'refresh-key'),status:'UNKNOWN',everUnknown:true};
  const result=await runProductionQueue([row],[row.id],r=>buildProductionQueuePayload(r,[],[],'worker','2026-09-10'),async(r,payload)=>{assert.equal(payload.idempotency_key,'refresh-key');return{id:'already-recorded',assignment_id:r.targetId,status:'APPROVED'};},()=>{},undefined,validProductionQueueResult);
  assert.equal(result.rows[0].status,'SUCCESS');assert.deepEqual(result.rows[0].fields,row.fields);assert.deepEqual(result.rows[0].payload,row.payload);
});

await test('unstructured LocalApiError 4xx never permits editing a possibly committed request',async()=>{
  for(const structuredResponse of [undefined,false]){
    const row=draft(`malformed-http-${String(structuredResponse)}`),error=Object.assign(new Error('No trustworthy JSON error body'),{name:'LocalApiError',status:403,...(structuredResponse===undefined?{}:{structuredResponse})});
    const result=await runProductionQueue([row],[row.id],body,async()=>{throw error;},()=>{},()=> 'same-unstructured-key');
    assert.equal(result.rows[0].status,'UNKNOWN');assert.equal(editableQueueRow(result.rows[0]),false);assert.equal(result.rows[0].key,'same-unstructured-key');
  }
});

await test('manager review partial failure restores exact per-report decisions and never reviews success twice',async()=>{
  const assignment={id:'review-assignment',production_batch_id:'batch-1',order_item_id:'item-1',dispatch_stage:'SEWING',order_status:'IN_PROGRESS',batch_status:'PLANNED',dispatch_status:'ACCEPTED',own_assignment:false,remaining_quantity:'0',assigned_from:'2026-09-01',assigned_to:'2026-09-15'};
  const reports=['approved-first','rejected-lost','retry-definitive'].map(id=>({id,assignment_id:assignment.id,created_by:'worker',status:'SUBMITTED'}));
  const rows=reports.map((report,index)=>({...draft(report.id,'REVIEW'),fields:{target:index===1?'REJECTED':'APPROVED',reason:index===1?'Sai số cần báo lại':'Đã đối chiếu',batchId:'batch-1',itemId:'item-1',stage:'SEWING'}}));
  const build=row=>buildProductionQueuePayload(row,[assignment],reports,'manager','2026-09-10',{batchId:'batch-1',itemId:'item-1',stage:'SEWING'}),calls=[],ledger=new Map();let phase=0,generated=0,durable=[];
  const request=async(row,payload)=>{calls.push({id:row.targetId,payload:clone(payload)});if(phase===0&&row.targetId==='retry-definitive')throw httpError(409);let result=ledger.get(payload.idempotency_key);if(!result){result={id:row.targetId,status:payload.target_status};ledger.set(payload.idempotency_key,result);}if(phase===0&&row.targetId==='rejected-lost')throw new TypeError('Response lost after review commit');return result;};
  const first=await runProductionQueue(rows,rows.map(r=>r.id),build,request,next=>{durable=clone(next);},()=>`review-key-${++generated}`,validProductionQueueResult);
  assert.equal(first.succeeded,1);assert.equal(first.failed,2);assert.deepEqual(first.rows.map(r=>r.status),['SUCCESS','UNKNOWN','ERROR']);assert.equal(generated,3);assert.throws(()=>editQueueRow(first.rows[1],{...first.rows[1].fields,target:'APPROVED'}));
  const frozen=clone(first.rows),restored=restoreQueue(store(durable,'manager'),'manager');phase=1;
  // Restore the same account/kind queue after changing from a detail context
  // to a global page where the committed report is no longer returned. The
  // actual builder would reject an empty candidate list; replay must bypass it.
  let rebuilt=0;const noLongerOnPage=row=>{rebuilt++;return buildProductionQueuePayload(row,[],[],'manager','2026-09-10',{batchId:'another-detail',stage:'CUTTING'});};
  const second=await runProductionQueue(restored,restored.map(r=>r.id),noLongerOnPage,request,()=>{},()=>{throw new Error('Retry allocated a new review key');},validProductionQueueResult);assert.equal(rebuilt,0,'A restored review retry was rebuilt against a different global/detail candidate scope.');
  assert.equal(second.succeeded,2);assert.equal(second.failed,0);assert(second.rows.every(r=>r.status==='SUCCESS'));assert.equal(calls.filter(c=>c.id==='approved-first').length,1);assert.equal(ledger.size,3);
  for(const row of frozen){const seen=calls.filter(c=>c.id===row.targetId);for(const call of seen)assert.deepEqual(call.payload,row.payload);assert.equal(second.rows.find(r=>r.id===row.id).key,row.key);}
});

console.log(`PASS production bulk queue: ${checks} deterministic state-machine scenarios; no UI rendering claimed.`);
