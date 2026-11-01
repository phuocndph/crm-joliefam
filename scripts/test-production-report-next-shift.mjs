import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {tsImport} from 'tsx/esm/api';
const {nextProductionReportDraft:next,freezeQueueRow,runProductionQueue}=await tsImport(pathToFileURL(path.join(process.cwd(),'src/lib/production-bulk-queue.ts')).href,import.meta.url);
const checks=[];const check=async(name,fn)=>{await fn();checks.push(name);};
const job={id:'job',production_order_id:'order',production_batch_id:'batch',order_item_id:'item',dispatch_stage:'SEWING',dispatch_status:'ACCEPTED',production_order_number:'LSX-1',order_status:'IN_PROGRESS',batch_status:'IN_PROGRESS',product_name:'Áo gối',assigned_from:'2026-10-01',assigned_to:null,own_assignment:true,remaining_quantity:'5'};
const report={id:'report-1',assignment_id:'job',created_by:'worker',stage:'SEWING',work_date:'2026-10-29',status:'SUBMITTED',quantity_good:'2',worker_name:'Nhân viên'};
const success={id:'REPORT:job',targetId:'job',kind:'REPORT',label:'Cũ',status:'SUCCESS',fields:{date:'2026-10-29',good:'2',rework:'1',remake:'0',defect:'0',notes:'Ghi chú cũ',batchId:'batch',itemId:'item',stage:'SEWING'},key:'old-key',payload:{idempotency_key:'old-key',work_date:'2026-10-29',quantity_good:'2'},resultId:'report-1',error:'old',everUnknown:true};
const context={batchId:'batch',itemId:'item',stage:'SEWING'},today='2026-10-30';
const restart=(row=success,jobs=[job],reports=[report],actor='worker',scope=context,mode='REPORT')=>next(row,mode,jobs,reports,actor,today,scope);
await check('Explicit next shift creates clean blank draft and next send uses a new key',async()=>{
 const before=structuredClone(success),draft=restart();assert.ok(draft);assert.equal(draft.id,success.id);assert.equal(draft.status,'DRAFT');assert.deepEqual(draft.fields,{date:today,good:'',rework:'0',remake:'0',defect:'0',notes:'',batchId:'batch',itemId:'item',stage:'SEWING'});
 for(const key of ['key','payload','resultId','error','everUnknown'])assert.equal(Object.hasOwn(draft,key),false,key);
 assert.deepEqual(success,before);const frozen=freezeQueueRow({...draft,fields:{...draft.fields,good:'1'}},{work_date:today,quantity_good:'1'},()=> 'new-key');assert.equal(frozen.key,'new-key');assert.notEqual(frozen.key,success.key);
});
await check('Unknown sending review draft missing receipt and unrefreshed or foreign proof remain locked',()=>{
 for(const status of ['UNKNOWN','SENDING','ERROR','DRAFT'])assert.equal(restart({...success,status}),null,status);
 assert.equal(restart({...success,kind:'REVIEW'}),null);assert.equal(restart(success,[job],[report],'worker',context,'REVIEW'),null);
 for(const resultId of ['',undefined,'other'])assert.equal(restart({...success,resultId}),null);
 assert.equal(restart(success,[job],[]),null);assert.equal(restart(success,[job],[report],'another-worker'),null);
 for(const patch of [{assignment_id:'other'},{created_by:'other'},{stage:'CUTTING'},{work_date:'2026-10-28'}])assert.equal(restart(success,[job],[{...report,...patch}]),null);
 assert.equal(restart({...success,payload:{...success.payload,work_date:'2026-10-28'}}),null);
});
await check('Context inactive/finished jobs and missing date block restart without touching other rows',()=>{
 for(const patch of [{remaining_quantity:'0'},{dispatch_status:'PENDING'},{own_assignment:false},{order_status:'ON_HOLD'},{batch_status:'COMPLETED'},{assigned_from:'2026-11-01'}])assert.equal(restart(success,[{...job,...patch}]),null);
 for(const patch of [{batchId:'other'},{itemId:'other'},{stage:'CUTTING'}])assert.equal(restart(success,[job],[report],'worker',{...context,...patch}),null);
 const unknown={...success,id:'REPORT:other',targetId:'other',status:'UNKNOWN'},draft={...success,id:'REPORT:draft',status:'DRAFT'},rows=[success,unknown,draft],before=structuredClone(rows),replacement=restart();const changed=rows.map(row=>row.id===success.id?replacement:row);assert.equal(changed[1],unknown);assert.equal(changed[2],draft);assert.deepEqual(rows,before);
});
await check('Actual hook rejects public save during its own same-tick send while internal commits continue',async()=>{
 const bundle=await build({stdin:{contents:"export {useProductionBulkQueue} from './src/hooks/useProductionBulkQueue';",loader:'ts',resolveDir:process.cwd()},alias:{'@':path.join(process.cwd(),'src')},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'synthetic-react',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const useRef=value=>({current:value}); export const useState=value=>[typeof value==="function"?value():value,()=>{}];',loader:'js'}));}}]});
 const storage=new Map(),namespace='crm:production-bulk:v1:worker:REPORT',draft=restart();storage.set(namespace,JSON.stringify({version:1,userId:'worker',rows:[draft]}));globalThis.sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
 const {useProductionBulkQueue}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));const queue=useProductionBulkQueue('worker','REPORT');let sends=0;
 const result=await queue.run([draft.id],()=>({work_date:today,quantity_good:'1'}),async()=>{sends++;assert.throws(()=>queue.save([]),/đang gửi/);return{id:'next-report'};});assert.equal(sends,1);assert.equal(result.succeeded,1);assert.equal(JSON.parse(storage.get(namespace)).rows[0].status,'SUCCESS');
 queue.save([draft]);assert.equal(JSON.parse(storage.get(namespace)).rows[0].status,'DRAFT');
});
console.log(JSON.stringify({suite:'production-report-next-shift',status:'PASS',passed:checks.length,checks,real_api_calls:0,business_writes:0}));
