import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

// The actual production routing helper, bundled in memory. Fixtures are plain
// read-model objects: no browser, DOM, API, database or network is involved.
const sourcePath='src/lib/production-workspace-context.ts';
const fingerprint=()=>readFile(sourcePath).then(bytes=>createHash('sha256').update(bytes).digest('hex'));
const before=await fingerprint();
const {outputFiles}=await build({entryPoints:[sourcePath],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const {stageContext,nextWorkspaceAction,workspaceStageMembership,workspaceShowsBoard}=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
let checks=0;
const test=(name,run)=>{run();checks++;console.log(`PASS production context: ${name}`);};
const stages=['CUTTING','SEWING','FINISHING','COUNTING'];
const counts=(cut=0,sew=0,finish=0,count=0)=>({CUTTING:cut,SEWING:sew,FINISHING:finish,COUNTING:count});
const row=(patch={})=>({id:'order-context',production_order_number:'LSX-CONTEXT',workflow_generation:'WORKFLOW_V3',status:'IN_PROGRESS',order_id:null,source_type:'MANUAL',source_order_number:null,planned_end_date:'2026-10-31',dispatch_priority:'NORMAL',quantity_planned:'100',batch_id:'batch-context',batch_number:'LO-01',batch_quantity:'100',item_id:'item-context',product_id:'product-context',product_name:'Sản phẩm kiểm thử',product_sku:'SKU-CONTEXT',fabric_variant_id:null,color:'Xanh',size:'M',dimensions:'40 × 60',planned_quantity:'100',cancelled_uncut:'0',executable_quantity:'100',good:counts(),reserved:counts(),processed:counts(),open:counts(),received:'0',shipped:'0',delivered:'0',pending_reports:0,needs_repair:false,material:{status:'APPROVED',no_material_required:false,estimated:200,issued:200,required:200,has_shortage:false},...patch});
const expect=(fixture,label,section='FLOW',intent='VIEW',stage=undefined)=>{
  const frozen=structuredClone(fixture),actual=nextWorkspaceAction(fixture);
  assert.deepEqual(actual,{label,context:{section,batchId:fixture.batch_id,itemId:fixture.item_id,intent,...(stage?{stage}:{})}});
  assert.deepEqual(fixture,frozen,'Reading the next action mutated authoritative row data.');
};

test('actual board helper never treats REVIEW, SELF, missing or unknown modes as operational visibility',()=>{
  for(const mode of ['MANAGER','OPERATIONS','SALES'])assert.equal(workspaceShowsBoard(mode),true);
  for(const mode of ['REVIEW','SELF','',undefined,null,'ADMIN','UNKNOWN'])assert.equal(workspaceShowsBoard(mode),false);
});

test('explicit clicks retain exact batch/item and are VIEW-only in all four stages',()=>{
  for(const status of ['DRAFT','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED'])for(const stage of stages){
    const fixture=row({status,batch_id:`batch-${status}`,item_id:`item-${status}`}),beforeRow=structuredClone(fixture);
    assert.deepEqual(stageContext(fixture,stage),{section:'FLOW',stage,batchId:fixture.batch_id,itemId:fixture.item_id,intent:'VIEW'});assert.deepEqual(fixture,beforeRow);
  }
});
test('historical generation wins over status and never acquires new workflow actions',()=>{
  for(const workflow_generation of ['WORKFLOW_V2','LEGACY',''])expect(row({workflow_generation,status:'COMPLETED',order_id:'sale',received:'20',delivered:'0',pending_reports:4,needs_repair:true}),'Lệnh lịch sử');
});
test('cancelled order is view-only despite outstanding work, materials and shipments',()=>{
  expect(row({status:'CANCELLED',order_id:'sale',received:'20',pending_reports:4,needs_repair:true,material:null}),'Đã hủy lệnh');
});
test('completed production can lead to shipping but never another production assignment',()=>{
  expect(row({status:'COMPLETED',order_id:'sale-context',received:'60',delivered:'40',pending_reports:2,needs_repair:true,material:null}),'Giao hàng','STOCK','SHIP');
  expect(row({status:'COMPLETED',order_id:'sale-context',received:'60',delivered:'60'}),'Đã hoàn thành','STOCK');
  expect(row({status:'COMPLETED',received:'60',delivered:'0'}),'Đã hoàn thành','STOCK');
  expect(row({status:'COMPLETED',order_id:'sale-context',received:'0',delivered:'0'}),'Đã hoàn thành','STOCK');
});
test('draft and pause override review/repair/material prompts without starting work',()=>{
  expect(row({status:'DRAFT',pending_reports:2,needs_repair:true,material:null}),'Chuẩn bị vải','MATERIAL');
  expect(row({status:'ON_HOLD',pending_reports:2,needs_repair:true,material:null}),'Đang tạm dừng','FLOW','RESUME');
});
test('pending review precedes repair and full uncut cancellation closure',()=>{
  expect(row({pending_reports:1,needs_repair:true,cancelled_uncut:'100',executable_quantity:'0',material:null}),'Duyệt sản lượng','FLOW','REVIEW');
  expect(row({needs_repair:true,cancelled_uncut:'100',executable_quantity:'0',material:null}),'Xử lý hàng sửa','FLOW','REPAIR');
});
test('fully cancelled uncut quantity can close before requesting material and does not become scrap',()=>{
  expect(row({cancelled_uncut:'100',executable_quantity:'0',material:null}),'Chốt phần đã hủy','FLOW','COMPLETE');
  expect(row({cancelled_uncut:'100',executable_quantity:'0',material:{status:'REJECTED',no_material_required:false,has_shortage:true}}),'Chốt phần đã hủy','FLOW','COMPLETE');
});
test('missing/unapproved material is distinct from approved warehouse shortage',()=>{
  expect(row({material:null}),'Duyệt dự toán vải','MATERIAL');
  for(const status of ['DRAFT','SUBMITTED','REJECTED','SUPERSEDED'])expect(row({material:{status,no_material_required:false,has_shortage:true}}),'Duyệt dự toán vải','MATERIAL');
  expect(row({material:{status:'APPROVED',no_material_required:false,has_shortage:true}}),'Cấp vật tư','MATERIAL');
  expect(row({material:{status:'APPROVED',no_material_required:true,has_shortage:true}}),'Cắt','FLOW','ASSIGN','CUTTING');
  expect(row(),'Cắt','FLOW','ASSIGN','CUTTING');
});
test('40 approved cut of 100 can open sewing while remaining cut work is already allocated',()=>{
  const partial=row({good:counts(40),reserved:counts(100),processed:counts(40)});
  expect(partial,'May','FLOW','ASSIGN','SEWING');
  assert.deepEqual(stageContext(partial,'SEWING'),{section:'FLOW',stage:'SEWING',batchId:partial.batch_id,itemId:partial.item_id,intent:'VIEW'});
  // A suggested next action is not the only allowed action: if cutting also has
  // unallocated capacity, the deterministic earliest-stage shortcut remains cut.
  expect(row({good:counts(40),reserved:counts(40),processed:counts(40)}),'Cắt','FLOW','ASSIGN','CUTTING');
  expect(row({good:counts(),reserved:counts(100),processed:counts()}),'Đang cắt','FLOW','VIEW','CUTTING');
});
test('each next stage uses only predecessor approved quantity minus assigned/open quota',()=>{
  expect(row({good:counts(100,40),reserved:counts(100,100),processed:counts(100,40)}),'Gấp – là','FLOW','ASSIGN','FINISHING');
  expect(row({good:counts(100,100,40),reserved:counts(100,100,100),processed:counts(100,100,40)}),'Kiểm đếm','FLOW','ASSIGN','COUNTING');
  expect(row({good:counts(40),reserved:counts(100,20),processed:counts(40),open:counts(0,20)}),'Chờ nhận may','FLOW','VIEW','SEWING');
});
test('open jobs and accepted unprocessed jobs take precedence over closure',()=>{
  expect(row({open:counts(100)}),'Chờ nhận cắt','FLOW','VIEW','CUTTING');
  for(let index=0;index<stages.length;index++){
    const ready=counts(100,100,100,100),reserved=counts(100,100,100,100),processed=counts(100,100,100,100);
    for(let next=index;next<stages.length;next++){ready[stages[next]]=99;processed[stages[next]]=99;if(next>index)reserved[stages[next]]=99;}
    const names=['cắt','may','gấp – là','kiểm đếm'];expect(row({good:ready,reserved,processed,received:'99'}),`Đang ${names[index]}`,'FLOW','VIEW',stages[index]);
  }
});
test('receipt is offered only after approved counting and settled upstream work',()=>{
  const settled={good:counts(100,100,100,100),reserved:counts(100,100,100,100),processed:counts(100,100,100,100)};
  expect(row({...settled,received:'40'}),'Nhập thành phẩm','STOCK','RECEIVE');
  expect(row({...settled,received:'100'}),'Chốt sản xuất','FLOW','COMPLETE');
  expect(row({...settled,received:'100',order_id:'sale-context',shipped:'0',delivered:'0'}),'Chốt sản xuất','FLOW','COMPLETE');
});
test('partial cancellation reduces executable cutting demand without changing original plan',()=>{
  expect(row({cancelled_uncut:'60',executable_quantity:'40',good:counts(40),reserved:counts(40),processed:counts(40)}),'May','FLOW','ASSIGN','SEWING');
  const good=counts(40,40,40,40),reserved=counts(40,40,40,40),processed=counts(40,40,40,40);
  expect(row({cancelled_uncut:'60',executable_quantity:'40',good,reserved,processed,received:'40'}),'Chốt sản xuất','FLOW','COMPLETE');
});
test('legacy read models without optional quota maps retain planned-quantity fallback',()=>{
  expect(row({executable_quantity:undefined,cancelled_uncut:undefined,open:undefined,processed:undefined}),'Cắt','FLOW','ASSIGN','CUTTING');
});
test('independent stage membership overlaps cut and sewing when only 40 of 100 were cut',()=>{
  const partial=row({good:counts(40),reserved:counts(40),processed:counts(40)}),unchanged=structuredClone(partial);
  assert.equal(workspaceStageMembership(partial,'CUTTING'),true);assert.equal(workspaceStageMembership(partial,'SEWING'),true);assert.equal(workspaceStageMembership(partial,'FINISHING'),false);assert.equal(workspaceStageMembership(partial,'COUNTING'),false);assert.deepEqual(partial,unchanged);
  expect(partial,'Cắt','FLOW','ASSIGN','CUTTING'); // The shortcut must not drive filter membership.
});
test('pending reports and active repair keep each related stage in its own filter',()=>{
  const pending=row({executable_quantity:'0',cancelled_uncut:'100',pending_reports:3,pending_by_stage:{CUTTING:2,SEWING:1}});
  assert.deepEqual(stages.filter(stage=>workspaceStageMembership(pending,stage)),['CUTTING','SEWING']);expect(pending,'Duyệt sản lượng','FLOW','REVIEW');
  const repair=row({executable_quantity:'0',cancelled_uncut:'100',needs_repair:true,repair_by_stage:{FINISHING:1}});assert.deepEqual(stages.filter(stage=>workspaceStageMembership(repair,stage)),['FINISHING']);
});
test('paused stage filters retain relevant work and terminal rows never invent future capacity',()=>{
  const paused=row({status:'ON_HOLD',good:counts(40),reserved:counts(40),processed:counts(40),pending_reports:1,pending_by_stage:{SEWING:1}});assert.deepEqual(stages.filter(stage=>workspaceStageMembership(paused,stage)),['CUTTING','SEWING']);expect(paused,'Đang tạm dừng','FLOW','RESUME');
  for(const status of ['COMPLETED','CANCELLED']){
    assert.deepEqual(stages.filter(stage=>workspaceStageMembership(row({status}),stage)),[]);
    const historicalActivity=row({status,good:counts(40),reserved:counts(40),processed:counts(40),pending_by_stage:{FINISHING:1}});assert.deepEqual(stages.filter(stage=>workspaceStageMembership(historicalActivity,stage)),['CUTTING','FINISHING']);
  }
});
test('full cancellation and draft do not create phantom cutting work; legacy stays outside V3 filters',()=>{
  assert.deepEqual(stages.filter(stage=>workspaceStageMembership(row({cancelled_uncut:'100',executable_quantity:'0'}),stage)),[]);
  assert.deepEqual(stages.filter(stage=>workspaceStageMembership(row({status:'DRAFT'}),stage)),[]);
  for(const workflow_generation of ['WORKFLOW_V2','LEGACY'])assert.deepEqual(stages.filter(stage=>workspaceStageMembership(row({workflow_generation,good:counts(100,100,100,100),pending_by_stage:{CUTTING:1}}),stage)),[]);
});

assert.equal(await fingerprint(),before,'Production helper changed during context verification.');
console.log(`PASS production workspace context: ${checks} actual-helper scenarios; source SHA256 ${before}; no rendered UI claimed.`);
