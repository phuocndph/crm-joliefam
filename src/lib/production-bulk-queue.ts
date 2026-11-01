import {dispatchLabels,type ProductionQueueAssignment,type ProductionQueueReport} from './production-dispatch-types';
// Durable per-line requests. This is deliberately not an atomic bulk transaction.
export type QueueStatus='DRAFT'|'SENDING'|'SUCCESS'|'ERROR'|'UNKNOWN';
export type QueueKind='REPORT'|'REVIEW';
export interface ProductionQueueRow {id:string;targetId:string;kind:QueueKind;label:string;fields:Record<string,string>;status:QueueStatus;key?:string;payload?:Record<string,unknown>;everUnknown?:boolean;error?:string;resultId?:string}
export interface ProductionQueueStore {version:1;userId:string;rows:ProductionQueueRow[]}
export function restoreQueue(raw:string|null,userId:string):ProductionQueueRow[]{
  if(!raw)return[];
  const parsed=JSON.parse(raw) as ProductionQueueStore;
  if(parsed.version!==1||parsed.userId!==userId||!Array.isArray(parsed.rows))throw new Error('Bản nháp không đúng tài khoản hoặc phiên bản. Không gửi để tránh trùng.');
  const ids=new Set<string>();
  return parsed.rows.map(row=>{
    if(!row||typeof row.id!=='string'||ids.has(row.id)||typeof row.targetId!=='string'||typeof row.label!=='string'||!['REPORT','REVIEW'].includes(row.kind)||!['DRAFT','SENDING','SUCCESS','ERROR','UNKNOWN'].includes(row.status)||!row.fields||Object.values(row.fields).some(v=>typeof v!=='string'))throw new Error('Bản nháp không hợp lệ. Cần đối chiếu trước khi gửi.');
    ids.add(row.id);
    if((['SENDING','SUCCESS','UNKNOWN'].includes(row.status)||row.key||row.payload)&&(!row.key||!row.payload||row.payload.idempotency_key!==row.key))throw new Error('Bản nháp thiếu khóa đối chiếu. Không gửi khóa mới.');
    return {...row,status:row.status==='SENDING'?'UNKNOWN':row.status,everUnknown:row.everUnknown||row.status==='SENDING'||row.status==='UNKNOWN'};
  });
}
export function editableQueueRow(row:ProductionQueueRow){return row.status==='DRAFT'||row.status==='ERROR'&&!row.everUnknown;}
export function editQueueRow(row:ProductionQueueRow,fields:Record<string,string>):ProductionQueueRow{
  if(!editableQueueRow(row))throw new Error('Dòng đã gửi hoặc chưa rõ kết quả: chỉ được thử lại nguyên nội dung và khóa.');
  return {...row,fields,status:'DRAFT',payload:undefined,key:undefined,error:undefined};
}
export function freezeQueueRow(row:ProductionQueueRow,payload:Record<string,unknown>,keyFactory:()=>string=()=>crypto.randomUUID()):ProductionQueueRow{
  if(row.status==='SUCCESS')return row;
  if(row.key&&row.payload)return {...row,status:'SENDING',everUnknown:row.everUnknown||row.status==='UNKNOWN'||row.status==='SENDING',error:undefined};
  const key=keyFactory();return {...row,key,payload:JSON.parse(JSON.stringify({...payload,idempotency_key:key})),status:'SENDING',error:undefined};
}
export async function runProductionQueue(rows:ProductionQueueRow[],ids:string[],build:(row:ProductionQueueRow)=>Record<string,unknown>,request:(row:ProductionQueueRow,body:Record<string,unknown>)=>Promise<unknown>,commit:(rows:ProductionQueueRow[])=>void,keyFactory?:()=>string,validateResult?:(row:ProductionQueueRow,result:unknown)=>boolean,beforeEach?:()=>void){
  let state=rows;let succeeded=0,failed=0;
  for(const id of [...new Set(ids)]){
    const initial=state.find(r=>r.id===id);if(!initial||initial.status==='SUCCESS')continue;
    beforeEach?.(); // A changed auth boundary stops the loop before freezing/sending another row.
    let row:ProductionQueueRow;
    try{row=freezeQueueRow(initial,initial.payload||build(initial),keyFactory);}catch(error){state=state.map(r=>r.id===id?{...r,status:'ERROR',error:error instanceof Error?error.message:'Dữ liệu chưa hợp lệ.'}:r);commit(state);failed++;continue;}
    state=state.map(r=>r.id===id?row:r);commit(state); // Must persist BEFORE contacting server.
    let result:unknown;
    try{result=await request(row,JSON.parse(JSON.stringify(row.payload)));if(validateResult&&!validateResult(row,result))throw new Error('Máy chủ trả kết quả không đủ để xác nhận đã lưu. Thử lại nguyên khóa.');}
    catch(error){
      const status=error&&typeof error==='object'&&'status'in error?Number(error.status):0;
      // Only a structured local HTTP validation failure on an unambiguous first request permits editing.
      const definitive=error instanceof Error&&error.name==='LocalApiError'&&'structuredResponse'in error&&error.structuredResponse===true&&status>=400&&status<500&&![408,429].includes(status);
      const unknown=!!row.everUnknown||!definitive;
      row={...row,status:unknown?'UNKNOWN':'ERROR',everUnknown:unknown,error:error instanceof Error?error.message:'Không rõ kết quả máy chủ.'};
      state=state.map(r=>r.id===id?row:r);commit(state);failed++;continue;
    }
    row={...row,status:'SUCCESS',error:undefined,resultId:result&&typeof result==='object'&&'id'in result?String(result.id):undefined};
    state=state.map(r=>r.id===id?row:r);commit(state);succeeded++;
  }
  return {rows:state,succeeded,failed};
}
export function reportDate(assignment:{assigned_from:string;assigned_to:string|null},today:string){const end=assignment.assigned_to&&assignment.assigned_to<today?assignment.assigned_to:today;return assignment.assigned_from>end?'':end;}
export function reviewAssignmentAllowsApproval(a:ProductionQueueAssignment){return ['RELEASED','IN_PROGRESS'].includes(a.order_status)&&['PLANNED','IN_PROGRESS'].includes(a.batch_status);}
export function inProductionContext(row:{production_batch_id:string;order_item_id?:string|null;dispatch_stage?:string;stage?:string},context?:{batchId?:string;itemId?:string;stage?:string}){return !context||(!context.batchId||row.production_batch_id===context.batchId)&&(!context.itemId||row.order_item_id===context.itemId)&&(!context.stage||(row.dispatch_stage||row.stage)===context.stage);}
export function productionBulkCandidates(assignments:ProductionQueueAssignment[],reports:ProductionQueueReport[],actorId:string,own:boolean,context?:{batchId?:string;itemId?:string;stage?:string}){
  const jobs=assignments.filter(a=>inProductionContext(a,context)&&(!own||['RELEASED','IN_PROGRESS'].includes(a.order_status)&&['PLANNED','IN_PROGRESS'].includes(a.batch_status)&&a.own_assignment&&a.dispatch_status==='ACCEPTED'&&Number(a.remaining_quantity)>0));
  return {jobs,reports:reports.filter(r=>r.status==='SUBMITTED'&&r.created_by!==actorId&&jobs.some(a=>a.id===r.assignment_id))};
}
/** A new shift is an explicit new draft, never a replay/reset of an uncertain request. */
export function nextProductionReportDraft(row:ProductionQueueRow,mode:QueueKind,assignments:ProductionQueueAssignment[],reports:ProductionQueueReport[],actorId:string,today:string,context?:{batchId?:string;itemId?:string;stage?:string}):ProductionQueueRow|null{
  if(mode!=='REPORT'||row.kind!=='REPORT'||row.status!=='SUCCESS'||!row.resultId?.trim()||!actorId||!inProductionContext({production_batch_id:row.fields.batchId,order_item_id:row.fields.itemId,stage:row.fields.stage},context))return null;
  const report=reports.find(report=>report.id===row.resultId&&report.assignment_id===row.targetId&&report.created_by===actorId);
  if(!report||report.stage!==row.fields.stage||report.work_date!==row.fields.date||row.payload?.work_date!==report.work_date)return null;
  const job=productionBulkCandidates(assignments,reports,actorId,true,context).jobs.find(job=>job.id===row.targetId&&job.dispatch_stage===report.stage);
  if(!job)return null;
  const date=reportDate(job,today);if(!date)return null;
  return {id:row.id,targetId:job.id,kind:'REPORT',label:`${job.production_order_number} · ${job.product_name} · ${dispatchLabels[job.dispatch_stage]}`,status:'DRAFT',fields:{date,good:'',rework:'0',remake:'0',defect:'0',notes:'',batchId:job.production_batch_id,itemId:job.order_item_id||'',stage:job.dispatch_stage}};
}
export function buildProductionQueuePayload(row:ProductionQueueRow,assignments:ProductionQueueAssignment[],reports:ProductionQueueReport[],actorId:string,today:string,context?:{batchId?:string;itemId?:string;stage?:string}):Record<string,unknown>{
  const candidates=productionBulkCandidates(assignments,reports,actorId,row.kind==='REPORT',context),f=row.fields;
  if(row.kind==='REPORT'){
    const a=candidates.jobs.find(a=>a.id===row.targetId);if(!a)throw new Error('Việc không còn đủ điều kiện báo mới; tải lại và kiểm tra.');
    const values=[f.good||'0',f.rework||'0',f.remake||'0',f.defect||'0'];if(values.some(v=>!/^\d+(\.\d{1,2})?$/.test(v)))throw new Error('Sản lượng không âm, tối đa 2 số thập phân.');
    const hundredths=(value:string)=>{const [integer,fraction='']=value.split('.');return BigInt(integer)*100n+BigInt(fraction.padEnd(2,'0').slice(0,2));};
    const total=values.reduce((sum,value)=>sum+hundredths(value),0n),remaining=String(a.remaining_quantity);
    if(!/^\d+(\.\d+)?$/.test(remaining)||total<=0n||total>hundredths(remaining))throw new Error('Tổng đạt/sửa/làm lại/hỏng phải dương và trong phần còn lại.');if(!/^\d{4}-\d{2}-\d{2}$/.test(f.date)||Number.isNaN(Date.parse(f.date))||new Date(`${f.date}T00:00:00Z`).toISOString().slice(0,10)!==f.date||f.date<a.assigned_from||f.date>(a.assigned_to&&a.assigned_to<today?a.assigned_to:today))throw new Error('Ngày làm phải trong thời gian được giao và không ở tương lai.');
    return {work_date:f.date,quantity_good:values[0],quantity_rework:values[1],quantity_remake:values[2],quantity_defect:values[3],notes:f.notes.trim()||null};
  }
  const report=candidates.reports.find(r=>r.id===row.targetId);if(!report)throw new Error('Báo cáo không còn trong phạm vi chờ duyệt của bạn.');
  const assignment=candidates.jobs.find(a=>a.id===report.assignment_id);
  if(f.target==='APPROVED'&&(!assignment||!reviewAssignmentAllowsApproval(assignment)))throw new Error('Lệnh / lô đã dừng hoặc kết thúc: chỉ có thể từ chối kèm lý do.');
  if(!['APPROVED','REJECTED'].includes(f.target))throw new Error('Chọn duyệt hoặc từ chối.');if(f.target==='REJECTED'&&!f.reason.trim())throw new Error('Từ chối phải có lý do cho dòng này.');
  return {target_status:f.target,reason:f.reason.trim()||null};
}
export function validProductionQueueResult(row:ProductionQueueRow,result:unknown){
  if(!result||typeof result!=='object')return false;const value=result as Record<string,unknown>;
  return typeof value.id==='string'&&!!value.id&&(row.kind==='REPORT'?value.assignment_id===row.targetId&&['SUBMITTED','APPROVED','LOCKED'].includes(String(value.status)):value.id===row.targetId&&value.status===row.payload?.target_status);
}
