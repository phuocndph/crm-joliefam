import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {tsImport} from 'tsx/esm/api';

// Offline actual React + TanStack Query + production controls. No app/API/DB server.
const root=process.cwd(),stage=path.join(root,'.local-staging-runtime/item5a-mixed-schema-20261029');
const baseline=process.argv.includes('--baseline');
const runLabel=process.argv.find(value=>value.startsWith('--run-label='))?.slice('--run-label='.length)||'editor';
assert.match(runLabel,/^[a-z0-9-]{1,40}$/);const runStage=path.join(stage,runLabel);
const {requirementAuthoringSchema}=await tsImport(pathToFileURL(path.join(root,'server/product-labor-requirement-schema.ts')).href,import.meta.url);
const {requirementAuthoringSchemaV2}=await tsImport(pathToFileURL(path.join(root,'server/product-labor-requirement-schema-v2.ts')).href,import.meta.url);
const schemas={1:requirementAuthoringSchema(),2:requirementAuthoringSchemaV2()};
const pillow=schemas[1].families.find(f=>f.key==='PILLOW_CASE');assert.ok(pillow,'Canonical V1 pillow case family must exist');
const v1=structuredClone(pillow.template);
const generic=schemas[2].families.find(f=>f.key==='GENERIC_SEWN_PRODUCT');
const v2={...structuredClone(generic.template),required_fields:generic.article_required_fields.CHAIR_COVER,conditions:{manufacturing_type:{op:'eq',value:'GENERIC_SEWN_PRODUCT'},article_kind:{op:'eq',value:'CHAIR_COVER'}}};
const articleLabel=generic.fields.find(f=>f.key==='article_kind').label,chairLabel=generic.fields.find(f=>f.key==='article_kind').values.find(v=>v.value==='CHAIR_COVER').label;
const current=definition=>({stream_id:'stream',version:1,content_hash:'current-hash',semantic_fingerprint:'fingerprint',definition,legacy_id:null,legacy_version:null,effective_from:'2026-10-01',effective_to:null});
const history=definition=>({...current(definition),action:'APPROVE'});
const proposal=(definition,submitted=false)=>({id:'proposal',owner_id:submitted?'other':'manager',created_by:'manager',revision:2,semantic_fingerprint:'fingerprint',definition,content_hash:'proposal-hash',submitted,reason:'Nguồn kiểm tra',created_at:'2026-10-29'});
const detail=(edit,old,review=false)=>({coverage_status:'SUPPORTED',code_key:'fixture',code:'TEST',name:'Dữ liệu thử cô lập',unit:'PIECE',semantic_fingerprint:'fingerprint',source_hash:'source',source_status:'AVAILABLE',provenance:[],stream_id:'stream',stream_revision:1,requirement:current(review?old:edit),history:[history(old)],proposals:[proposal(edit,review)]});
const bundle=await build({stdin:{contents:`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider,onlineManager} from '@tanstack/react-query';
import {createMemoryRouter,RouterProvider} from 'react-router-dom';
import Workbench from '@/components/payroll/LaborRequirementWorkbench';
const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
window.qa.client=client;window.qa.onlineManager=onlineManager;
function Fixture(){const [actor,setActor]=useState('manager');window.qa.setActor=setActor;return <Workbench userId={actor} admin={true} canManage={true}/>;}
const router=createMemoryRouter([{path:'*',element:<Fixture/>}],{initialEntries:['/?requirement_code=fixture']});
function Host(){return <QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>}
createRoot(document.getElementById('root')).render(<Host/>);`,resolveDir:root,sourcefile:'mixed-schema-fixture.tsx',loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':path.join(root,'src')},plugins:[{name:'offline-api',setup(b){
 b.onResolve({filter:/^@\/lib\/local-api$/},()=>({path:'offline-api',namespace:'qa'}));
 b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export class LocalApiError extends Error {constructor(message,status=500){super(message);this.status=status;this.structuredResponse=true;}} export const localApi=window.qa.api;`,loader:'js'}));
 if(baseline)b.onLoad({filter:/LaborRequirementWorkbench\.tsx$/},async()=>({contents:await readFile(path.join(stage,'baseline/src/components/payroll/LaborRequirementWorkbench.tsx'),'utf8'),loader:'tsx',resolveDir:path.join(root,'src/components/payroll')}));
}}]});
await mkdir(runStage,{recursive:true});await writeFile(path.join(runStage,baseline?'baseline-fixture.js':'fixture.js'),bundle.outputFiles[0].text);
const {chromium}=createRequire(import.meta.url)('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[],network=[],errors=[];
const check=async(name,work)=>{await work();results.push({name,result:'PASS'});};
async function mount(data,modes={}){
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{network.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><html lang="vi"><body><div id="root"></div></body></html>');
 await page.evaluate(({data,schemas,modes})=>{
  // about:blank is not a secure context; deterministic fixture-only IDs.
  let sequence=0;Object.defineProperty(crypto,'randomUUID',{value:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,configurable:true});
  const qa={data,schemas,modes,calls:[],pending:{},mutationMode:'ok'};window.qa=qa;
  qa.api={laborRequirementSchema:async(version=1)=>{qa.calls.push({kind:'schema',version});const mode=qa.modes[version];if(mode==='hold')return new Promise((resolve,reject)=>{qa.pending[version]={resolve,reject};});if(mode==='error')throw new Error('Lỗi nhãn thử');return structuredClone(qa.schemas[mode==='wrong'?(version===1?2:1):version]);},
   laborRequirementCoverage:async()=>({rows:[structuredClone(qa.data)],total:1,counts:{all:1,blank_rows:0}}),laborRequirementDetail:async()=>structuredClone(qa.data),
   validateLaborRequirement:async body=>{qa.calls.push({kind:'validate',body});return {content_hash:'validated'};},
   saveLaborRequirementProposal:async body=>{qa.calls.push({kind:'save',body});if(qa.mutationMode==='lost')throw new Error('Mất phản hồi thử');return {stream_id:'stream',stream_revision:2,proposal_id:'proposal',proposal_revision:2,reused:false};},
   approveLaborRequirement:async body=>{qa.calls.push({kind:'approve',body});return {stream_id:'stream',stream_revision:2,action:'APPROVE',reused:false};},
   retireLaborRequirement:async body=>{qa.calls.push({kind:'retire',body});return {stream_id:'stream',stream_revision:2,action:'RETIRE',reused:false};}};
 },{data,schemas,modes});
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByLabel('Lý do yêu cầu mã').waitFor();
 return page;
}
const mutations=page=>page.evaluate(()=>qa.calls.filter(c=>['save','approve','retire','validate'].includes(c.kind)));
const allText=page=>page.locator('[data-requirement-editor]').first().textContent();
try{
 await check('V1 editing / V2 generic history uses canonical Vietnamese metadata',async()=>{
  const page=await mount(detail(v1,v2));
  if(baseline){await page.waitForTimeout(80);assert.match(await allText(page),/article_kind|CHAIR_COVER/);results.push({name:'Baseline reproduces wrong raw field/value labels',result:'EXPECTED_FAILURE_CONFIRMED'});await page.close();return;}
  await page.waitForFunction(()=>qa.calls.some(c=>c.kind==='schema'&&c.version===2));await page.getByText(chairLabel,{exact:true}).first().waitFor({state:'attached'});const text=await allText(page);assert.ok(text.includes(articleLabel));assert.ok(!/article_kind|CHAIR_COVER/.test(text));assert.equal((await mutations(page)).length,0);await page.close();
 });
 if(!baseline){
 await check('V2 editing / V1 history, exact editable version retained',async()=>{
  const page=await mount(detail(v2,v1));await page.getByRole('combobox',{name:'Loại hàng',exact:true}).waitFor();assert.ok((await allText(page)).includes(schemas[1].families.find(f=>f.key===v1.family).label));assert.ok(!/article_kind|CHAIR_COVER/.test(await allText(page)));await page.close();
 });
 await check('Clean V1 open remains editable; incomplete enum edit does not masquerade as missing metadata',async()=>{
  const page=await mount(detail(v1,v2));await page.getByRole('combobox',{name:'Loại hàng',exact:true}).waitFor();assert.ok(!(await allText(page)).includes('Nguồn hoặc phiên bản đã thay đổi.'));await page.getByRole('combobox',{name:'Điều kiện Chất liệu',exact:true}).click();await page.getByRole('option',{name:'Bằng giá trị',exact:true}).click();const choice=page.getByRole('combobox',{name:'Giá trị Chất liệu',exact:true});await choice.waitFor();await choice.click();const option=pillow.fields.find(f=>f.key==='material').values[0];await page.getByRole('option',{name:option.label,exact:true}).click();assert.ok((await choice.textContent()).includes(option.label));assert.equal(await page.getByText('Chưa tải được đúng bộ nhãn yêu cầu. Vui lòng thử lại.',{exact:true}).count(),0);assert.equal((await mutations(page)).length,0);await page.close();
 });
 await check('Current V1 / submitted V2 comparison and approval uses frozen proposal only',async()=>{
  const page=await mount(detail(v2,v1,true));const approve=page.getByRole('button',{name:'Duyệt áp dụng bản V2',exact:true});await approve.waitFor();await page.getByText('Đối chiếu với yêu cầu đang áp dụng',{exact:true}).click();assert.ok((await page.getByText('Hiện tại',{exact:true}).locator('..').textContent()).includes(pillow.label));const proposed=await page.getByText('Đề xuất V2',{exact:true}).locator('..').textContent();assert.ok(proposed.includes(articleLabel)&&proposed.includes(chairLabel));assert.ok(!/article_kind|CHAIR_COVER/.test(proposed));await page.getByLabel('Lý do yêu cầu mã').fill('Đã đối chiếu');await approve.click();await page.waitForFunction(()=>qa.calls.some(c=>c.kind==='approve'));const call=(await mutations(page)).find(c=>c.kind==='approve');assert.equal(call.body.proposal_hash,'proposal-hash');assert.equal(call.body.proposal_id,'proposal');assert.equal(call.body.definition,undefined);await page.close();
 });
 await check('Loading exact V2 blocks approval, no raw fallback, GET arrival preserves dirty reason',async()=>{
  const page=await mount(detail(v2,v1,true),{2:'hold'});const approve=page.getByRole('button',{name:'Duyệt áp dụng bản V2',exact:true});assert.ok(await approve.isDisabled());await page.getByLabel('Lý do yêu cầu mã').fill('Nội dung giữ lại');assert.ok(!/article_kind|CHAIR_COVER/.test(await allText(page)));assert.equal((await mutations(page)).length,0);await page.evaluate(()=>qa.pending[2].resolve(structuredClone(qa.schemas[2])));await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Duyệt áp dụng bản V2')?.disabled);assert.equal(await page.getByLabel('Lý do yêu cầu mã').inputValue(),'Nội dung giữ lại');assert.equal((await mutations(page)).length,0);await page.close();
 });
 await check('Error/wrong exact version blocks review; retry changes labels without mutations',async()=>{
  for(const mode of ['error','wrong']){const page=await mount(detail(v2,v1,true),{2:mode});const approve=page.getByRole('button',{name:'Duyệt áp dụng bản V2',exact:true});await page.getByText('Chưa tải được đúng bộ nhãn yêu cầu. Vui lòng thử lại.',{exact:true}).first().waitFor();assert.ok(await approve.isDisabled());assert.ok(!/article_kind|CHAIR_COVER/.test(await allText(page)));await page.getByLabel('Lý do yêu cầu mã').fill('Giữ khi tải lại');await page.evaluate(()=>qa.modes[2]='ok');await page.getByRole('button',{name:'Tải lại bộ nhãn',exact:true}).first().click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Duyệt áp dụng bản V2')?.disabled);assert.equal(await page.getByLabel('Lý do yêu cầu mã').inputValue(),'Giữ khi tải lại');assert.equal((await mutations(page)).length,0);await page.close();}
 });
 await check('History-only metadata failure does not block save; dirty definition survives retry',async()=>{
  const page=await mount(detail(v1,v2),{2:'error'});await page.getByRole('button',{name:'Lưu nháp',exact:true}).waitFor();await page.getByLabel('Lý do yêu cầu mã').fill('Bản đang sửa');await page.getByText('Đặc điểm bổ sung và kích thước',{exact:true}).click();await page.getByRole('combobox',{name:'Điều kiện Rộng (mm)',exact:true}).click();await page.getByRole('option',{name:'Bằng giá trị',exact:true}).click();await page.getByLabel('Giá trị Rộng (mm)',{exact:true}).fill('1234');await page.getByText('Lịch sử áp dụng (1)',{exact:true}).click();await page.evaluate(()=>qa.modes[2]='ok');await page.getByRole('button',{name:'Tải lại bộ nhãn',exact:true}).first().click();await page.getByText(chairLabel,{exact:true}).first().waitFor({state:'attached'});assert.equal(await page.getByLabel('Giá trị Rộng (mm)',{exact:true}).inputValue(),'1234');assert.equal(await page.getByLabel('Lý do yêu cầu mã').inputValue(),'Bản đang sửa');assert.ok(await page.getByRole('button',{name:'Lưu nháp',exact:true}).isEnabled());await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();await page.waitForFunction(()=>qa.calls.some(c=>c.kind==='save'));assert.deepEqual((await mutations(page)).find(c=>c.kind==='save').body.definition,{...v1,conditions:{...v1.conditions,width_mm:{op:'eq',value:'1234'}}});await page.close();
 });
 await check('Version change pauses exact builder without mixed fallback',async()=>{
  const page=await mount(detail(v1,v1));await page.evaluate(()=>{qa.modes[2]='hold';qa.onlineManager.setOnline(false);});await page.getByRole('button',{name:'Tạo đề xuất nâng cao',exact:true}).click();await page.getByText('Đang ngoại tuyến. Chưa tải được bộ nhãn để kiểm tra.',{exact:true}).first().waitFor();assert.ok(await page.getByRole('button',{name:'Lưu nháp',exact:true}).isDisabled());assert.equal(await page.getByRole('combobox',{name:'Loại hàng',exact:true}).count(),0);assert.equal((await mutations(page)).length,0);await page.close();
 });
 await check('Cached metadata refetch cannot enable stale approval',async()=>{
  const page=await mount(detail(v2,v1,true));await page.getByText(chairLabel,{exact:true}).first().waitFor({state:'attached'});await page.evaluate(()=>{qa.modes[2]='hold';void qa.client.invalidateQueries({queryKey:['labor-requirement-schema','manager',true,true,2]});});await page.waitForFunction(()=>!!qa.pending[2]);assert.ok(await page.getByRole('button',{name:'Duyệt áp dụng bản V2',exact:true}).isDisabled());assert.ok(!/article_kind|CHAIR_COVER/.test(await allText(page)));await page.evaluate(()=>qa.pending[2].resolve(structuredClone(qa.schemas[2])));await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Duyệt áp dụng bản V2')?.disabled);assert.equal((await mutations(page)).length,0);await page.close();
 });
 await check('Actor change removes stale review; new identity metadata is fetched',async()=>{
  const page=await mount(detail(v2,v1,true));await page.getByText(chairLabel,{exact:true}).first().waitFor({state:'attached'});await page.evaluate(()=>{qa.modes[2]='hold';qa.setActor('second-manager');});await page.waitForFunction(()=>!document.querySelector('[data-requirement-editor]'));await page.getByRole('button',{name:'Xử lý',exact:true}).first().click();await page.getByLabel('Lý do yêu cầu mã').waitFor();assert.ok(await page.getByRole('button',{name:'Duyệt áp dụng bản V2',exact:true}).isDisabled());assert.equal((await mutations(page)).length,0);const keys=await page.evaluate(()=>qa.client.getQueryCache().getAll().map(q=>q.queryKey));assert.ok(keys.some(k=>k[0]==='labor-requirement-schema'&&k[1]==='second-manager'&&k[4]===2));await page.close();
 });
 await check('Lost response recovery replays identical payload despite later metadata failure',async()=>{
  const page=await mount(detail(v1,v2));await page.getByLabel('Lý do yêu cầu mã').fill('Kiểm tra gửi lại');await page.evaluate(()=>qa.mutationMode='lost');await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();const retry=page.getByRole('button',{name:'Kiểm tra lại thao tác vừa gửi',exact:true});await retry.waitFor();await page.evaluate(async()=>{qa.modes[1]='error';qa.mutationMode='ok';await qa.client.invalidateQueries({queryKey:['labor-requirement-schema']});});assert.ok(await retry.isEnabled());await retry.click();await page.waitForFunction(()=>qa.calls.filter(c=>c.kind==='save').length===2);const calls=(await mutations(page)).filter(c=>c.kind==='save');assert.deepEqual(calls[0].body,calls[1].body);assert.equal((await mutations(page)).filter(c=>c.kind==='validate').length,1);await page.close();
 });
 }
 assert.equal(network.length,0,'All test fixture interactions must remain offline');assert.deepEqual(errors,[]);
}catch(error){results.push({name:'Harness failure',result:'FAIL',message:error.stack});throw error;}finally{await browser.close();const output=JSON.stringify({baseline,results,network,errors},null,2);await writeFile(path.join(runStage,`${baseline?'baseline':'focused'}-${Date.now()}-result.json`),output);await writeFile(path.join(runStage,baseline?'baseline-result.json':'focused-result.json'),output);}
console.log(JSON.stringify({baseline,passed:results.length,results,networkRequests:network.length},null,2));
