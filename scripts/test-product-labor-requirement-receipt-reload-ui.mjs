import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {tsImport} from 'tsx/esm/api';

const root=process.cwd(),stage=path.join(root,'.local-staging-runtime/item5a-receipt-session-20261029');
const label=process.argv.find(v=>v.startsWith('--run-label='))?.slice(12)||'editor';assert.match(label,/^[a-z0-9-]{1,40}$/);const out=path.join(stage,label);
const cacheDiagnostic=process.argv.includes('--cache-diagnostic'),cacheBaseline=process.argv.includes('--cache-baseline');
const origin='https://receipt-session.fixture.invalid',backend=origin+'/api';
const {requirementAuthoringSchema}=await tsImport(pathToFileURL(path.join(root,'server/product-labor-requirement-schema.ts')).href,import.meta.url);
const schema=requirementAuthoringSchema(),definition=structuredClone(schema.families.find(f=>f.key==='PILLOW_CASE').template);
const baseDetail={coverage_status:'SUPPORTED',code_key:'fixture',code:'TEST',name:'Dữ liệu cô lập',unit:'PIECE',semantic_fingerprint:'fingerprint',source_hash:'source-original',source_status:'AVAILABLE',provenance:[],stream_id:'stream',stream_revision:1,requirement:{stream_id:'stream',version:1,content_hash:'current',semantic_fingerprint:'fingerprint',definition,legacy_id:null,legacy_version:null,effective_from:'2026-10-01',effective_to:null},history:[],proposals:[]};
const bundle=await build({stdin:{contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {createMemoryRouter,RouterProvider} from 'react-router-dom';
import Workbench from '@/components/payroll/LaborRequirementWorkbench';import * as receipts from '@/lib/labor-requirement-receipts';
window.qa.receipts=receipts;
const params=new URL(location.href).searchParams,actor=params.get('actor')||'A',date=params.get('date')||'2026-10-29';
const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
// Keep the existing receipt fixture's onSaved boundary deterministic; no full cache workflow claim.
${cacheDiagnostic?'':'client.invalidateQueries=async()=>{};'}window.qa.client=client;
const router=createMemoryRouter([{path:'*',element:<Workbench userId={actor} admin={true} canManage={true}/>}],{initialEntries:['/?requirement_code=fixture&req_date='+date]});
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);`,resolveDir:root,sourcefile:'receipt-real-reload-fixture.tsx',loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':path.join(root,'src')},plugins:[{name:'fully-intercepted-api',setup(b){
 b.onResolve({filter:/^@\/lib\/local-api$/},()=>({path:'api',namespace:'qa'}));
 b.onResolve({filter:/^@\/lib\/local-auth$/},()=>({path:'auth',namespace:'qa-auth'}));
 b.onLoad({filter:/.*/,namespace:'qa-auth'},()=>({contents:`export const captureLocalAuthGuard=async()=>({assertCurrent(){},authorizationToken(){throw new Error('No credentials in fixture');}});`,loader:'js'}));
 b.onResolve({filter:/^(?:\.\/|@\/lib\/)runtime-config$/},()=>({path:'runtime',namespace:'qa-runtime'}));
 b.onLoad({filter:/.*/,namespace:'qa-runtime'},()=>({contents:`export const localApiUrl=()=>${JSON.stringify(backend)};`,loader:'js'}));
 if(cacheBaseline)b.onLoad({filter:/(?:LaborRequirementWorkbench\.tsx|labor-requirement-receipts\.ts)$/},async args=>({contents:await readFile(path.join(stage,'baseline',path.relative(root,args.path)),'utf8'),loader:args.path.endsWith('tsx')?'tsx':'ts',resolveDir:path.dirname(args.path)}));
 b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export class LocalApiError extends Error{constructor(message,status){super(message);this.status=status;this.structuredResponse=true;}}
const call=async(path,body)=>{const response=await fetch('/api/'+path,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body),headers:{'Content-Type':'application/json'}}:{})});const value=await response.json();if(!response.ok)throw new LocalApiError(value.error,response.status);return value;};
export const localApi={laborRequirementSchema:()=>call('schema'),laborRequirementCoverage:()=>call('coverage'),laborRequirementDetail:(code,date)=>call('detail?code='+encodeURIComponent(code)+'&date='+date),validateLaborRequirement:body=>call('validate',body),saveLaborRequirementProposal:body=>call('proposals',body),approveLaborRequirement:body=>call('approve',body),retireLaborRequirement:body=>call('retire',body)};`,loader:'js'}));
}}]});
const layoutCss=`*{box-sizing:border-box}html,body{margin:0;max-width:100%;font:14px Arial,sans-serif}button,input,select{font:inherit;max-width:100%;min-height:44px}button{white-space:normal}p,dd{overflow-wrap:anywhere}section{padding:12px}[role=dialog]{position:fixed!important;inset:5vh auto auto 50%!important;transform:translateX(-50%)!important;width:calc(100vw - 24px)!important;max-width:768px!important;max-height:90vh;overflow-y:auto;background:white;border:1px solid #bbb;padding:16px}[data-requirement-editor]>div{min-width:0}`;
const {chromium}=createRequire(import.meta.url)('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[],errors=[],unexpected=[],fixtureRequests=[];
const contexts=[];
const commands=c=>c.logs.filter(x=>['proposals','approve','retire'].includes(x.kind));
async function fixture({width=1280,fault=null,initialRaw}={}){
 const context=await browser.newContext({viewport:{width,height:900}});contexts.push(context);
 const control={logs:[],mode:'ok',getMode:'ok',failGetAfterPost:false,revision:1,sourceHash:'source-original',fault,initialRaw,navigations:0,holds:[],committedProposals:[],committedEvents:[]};
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());fixtureRequests.push({method:request.method(),path:url.pathname});
  if(url.origin!==origin){unexpected.push(request.url());return route.abort();}
  if(url.pathname==='/fixture'){
   control.navigations++;
   const setup=`window.qa={};window.qaFault=${JSON.stringify(control.fault)};`+(control.initialRaw===undefined?'':`sessionStorage.setItem(${JSON.stringify('crm:requirement-receipt:v1:'+JSON.stringify(['A',backend,'fixture']))},${JSON.stringify(control.initialRaw)});`)+`
const nativeGet=Storage.prototype.getItem,nativeSet=Storage.prototype.setItem,nativeRemove=Storage.prototype.removeItem;
Storage.prototype.getItem=function(key){if(key.startsWith('crm:requirement-receipt:')&&window.qaFault==='get')throw new DOMException('Denied','SecurityError');return nativeGet.call(this,key);};
Storage.prototype.setItem=function(key,value){if(key.startsWith('crm:requirement-receipt:')&&(window.qaFault==='set'||window.qaFault==='phase'&&JSON.parse(value).receipt.phase!=='SENDING'))throw new DOMException('Quota','QuotaExceededError');return nativeSet.call(this,key,value);};
Storage.prototype.removeItem=function(key){if(key.startsWith('crm:requirement-receipt:')&&window.qaFault==='remove')throw new DOMException('Denied','SecurityError');return nativeRemove.call(this,key);};`;
   return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="vi"><head><style>'+layoutCss+'</style></head><body><div id="root"></div><script>'+setup+'\n'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script></body></html>'});
  }
  if(!url.pathname.startsWith('/api/')){unexpected.push(request.url());return route.abort();}
  const kind=url.pathname.slice(5),body=request.postDataJSON(),date=url.searchParams.get('date');control.logs.push({kind,method:request.method(),body,date});
  const respond=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  if(kind==='schema')return respond(schema);
  if(kind==='coverage')return respond({rows:[baseDetail],total:1,counts:{all:1,blank_rows:0}});
  if(kind==='detail')return control.getMode==='error'?respond({error:'Không tải được kết quả thử'},503):respond({...structuredClone(baseDetail),stream_revision:control.revision,source_hash:control.sourceHash,name:'Dữ liệu ngày '+date,proposals:control.committedProposals,history:control.committedEvents});
  if(kind==='validate')return respond({content_hash:'validated'});
  if(['proposals','approve','retire'].includes(kind)){
   if(control.mode==='hold'){await new Promise(resolve=>control.holds.push(resolve));try{return await route.abort();}catch{return;}}
   if(control.mode==='lost')return route.abort('failed');
   if(control.mode==='reject')return respond({error:'Xung đột thử'},409);
   if(control.failGetAfterPost)control.getMode='error';
   const result={stream_id:'stream',stream_revision:2,...(kind==='proposals'?{proposal_id:'saved',proposal_revision:1,proposal_hash:'hash'}:{action:kind==='approve'?'APPROVE':'RETIRE',content_hash:'hash'}),reused:false};control.revision=Math.max(control.revision,result.stream_revision);if(kind==='proposals'){control.committedProposals=[{id:result.proposal_id,revision:result.proposal_revision,content_hash:result.proposal_hash,owner_id:'A',created_by:'A',definition:structuredClone(body.definition),semantic_fingerprint:body.semantic_fingerprint,submitted:body.submitted,reason:body.reason,created_at:'2026-10-29'}];}else{control.committedEvents=[{stream_id:result.stream_id,version:result.stream_revision,action:result.action,content_hash:result.content_hash,history_origin:'USER_EVENT',effective_from:body.effective_from,effective_to:body.effective_to||null,semantic_fingerprint:body.semantic_fingerprint,definition:structuredClone(baseDetail.requirement.definition)}];}return respond(result);
  }
  unexpected.push(request.url());return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>void dialog.accept());
 await page.goto(origin+'/fixture');return {page,control};
}
const retry=page=>page.getByRole('button',{name:'Kiểm tra lại thao tác vừa gửi',exact:true});
const refresh=page=>page.getByRole('button',{name:'Tải lại kết quả đã lưu',exact:true});
const recover=page=>page.getByRole('button',{name:'Thử khôi phục thao tác',exact:true});
async function editable(page){await page.getByLabel('Lý do yêu cầu mã').waitFor();}
async function send(page,reason='Lý do gốc'){await editable(page);await page.getByLabel('Lý do yêu cầu mã').fill(reason);await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('[data-requirement-editor]').first().evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);}
async function check(name,work){await work();results.push({name,status:'PASS'});console.log('PASS '+name);}
try{
 if(cacheDiagnostic){await check('Cache diagnostic: exact uncertain retry under actual onSaved invalidation (no cache fix claim)',async()=>{
  const {page,control}=await fixture();control.mode='lost';await send(page);await retry(page).waitFor();const first=commands(control)[0].body;control.revision=88;control.sourceHash='changed-source';control.mode='ok';await retry(page).click();await page.waitForFunction(()=>qa.client.isFetching()===0&&qa.receipts.getRequirementReceipt('A','fixture')?.phase!=='SENDING');const observed=await page.evaluate(()=>({phase:qa.receipts.getRequirementReceipt('A','fixture')?.phase||'CLEARED',editable:!!document.querySelector('input[aria-label="Lý do yêu cầu mã"]')}));assert.deepEqual(commands(control)[1].body,first);results.push({name:'Observed cache diagnostic',status:'OBSERVED',baseline:cacheBaseline,phase:observed.phase,editor_present:observed.editable,committed_get_only:await refresh(page).count()===1});console.log(JSON.stringify({cacheBaseline,...observed}));
 });}else{
 await check('Actual same-tab reload turns SENDING uncertain and sends exact command only on click',async()=>{
  const {page,control}=await fixture();await editable(page);assert.equal(await recover(page).count(),0);control.mode='hold';await send(page);await page.getByText('Yêu cầu đang được gửi. Vui lòng chờ kết quả, không gửi thêm.',{exact:true}).waitFor();assert.equal(commands(control).length,1);const first=commands(control)[0].body;control.revision=88;control.sourceHash='changed-source';await page.reload();await retry(page).waitFor();assert.equal(control.navigations,2);assert.equal(commands(control).length,1);assert.equal(control.logs.filter(x=>x.kind==='validate').length,1);control.holds.splice(0).forEach(resolve=>resolve());control.mode='ok';await retry(page).click();await editable(page);assert.deepEqual(commands(control)[1].body,first);assert.equal(control.logs.filter(x=>x.kind==='validate').length,1);await noOverflow(page);
 });
 await check('UNCERTAIN actual reload actor isolation, denied retry stays exact and cannot unlock new command',async()=>{
  const {page,control}=await fixture();control.mode='lost';await send(page,'Nội dung riêng A');await retry(page).waitFor();const first=commands(control)[0].body;await page.goto(origin+'/fixture?actor=B');await editable(page);assert.equal(await retry(page).count(),0);assert.ok(!(await page.locator('body').textContent()).includes('Nội dung riêng A'));await page.goto(origin+'/fixture?actor=A');await retry(page).waitFor();assert.equal(commands(control).length,1);control.mode='reject';await retry(page).click();await page.getByText('Xung đột thử',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Lưu nháp',exact:true}).count(),0);await page.reload();await retry(page).waitFor();assert.equal(commands(control).length,2);control.mode='ok';await retry(page).click();await editable(page);assert.deepEqual(commands(control).map(x=>x.body),[first,first,first]);assert.equal(control.logs.filter(x=>x.kind==='validate').length,1);
 });
 await check('COMMITTED actual reload is manual GET-only original source date then current date',async()=>{
  const {page,control}=await fixture();control.failGetAfterPost=true;await send(page);await refresh(page).waitFor();control.getMode='ok';control.failGetAfterPost=false;await page.goto(origin+'/fixture?date=2026-11-03');await refresh(page).waitFor();assert.equal(commands(control).length,1);assert.equal(await retry(page).count(),0);const before=control.logs.length;await refresh(page).click();await editable(page);assert.deepEqual(control.logs.slice(before).filter(x=>x.kind==='detail').map(x=>x.date),['2026-10-29','2026-11-03']);assert.equal(commands(control).length,1);assert.equal(control.logs.filter(x=>x.kind==='validate').length,1);assert.equal(await page.evaluate(()=>qa.receipts.getRequirementReceipt('A','fixture')),null);
 });
 await check('Mobile quota-before-send blocks zero POST; explicit storage recovery then exact retry',async()=>{
  const {page,control}=await fixture({width:390,fault:'set'});await send(page,'Giữ nguyên nội dung di động');await recover(page).waitFor();assert.equal(commands(control).length,0);assert.equal(await retry(page).isDisabled(),true);await recover(page).click();assert.equal(commands(control).length,0);await noOverflow(page);await page.evaluate(()=>qaFault=null);await recover(page).click();await retry(page).waitFor();assert.equal(commands(control).length,0);await retry(page).click();await editable(page);assert.equal(commands(control).length,1);assert.equal(commands(control)[0].body.reason,'Giữ nguyên nội dung di động');assert.equal(control.logs.filter(x=>x.kind==='validate').length,0);await noOverflow(page);
 });
 await check('Mobile committed phase persistence denial keeps truthful result locked until recovery, no replay',async()=>{
  const {page,control}=await fixture({width:390,fault:'phase'});await send(page);await recover(page).waitFor();await refresh(page).waitFor();assert.equal(await refresh(page).isDisabled(),true);assert.equal(await page.evaluate(()=>qa.receipts.getRequirementReceipt('A','fixture').phase),'COMMITTED');assert.equal(commands(control).length,1);await noOverflow(page);await page.evaluate(()=>qaFault=null);await recover(page).click();const before=control.logs.length;assert.equal(commands(control).length,1);await refresh(page).click();await editable(page);assert.equal(commands(control).length,1);assert.deepEqual(control.logs.slice(before).filter(x=>x.kind==='detail').map(x=>x.date),['2026-10-29']);
 });
 await check('Denied reads and malformed empty stored wire stay visible blocked, no overwrite or POST',async()=>{
  for(const settings of [{fault:'get'},{initialRaw:''}]){const {page,control}=await fixture(settings);await recover(page).waitFor();assert.equal(await page.getByRole('button',{name:'Lưu nháp',exact:true}).count(),0);await recover(page).click();assert.equal(commands(control).length,0);if(settings.fault){await page.evaluate(()=>qaFault=null);await recover(page).click();await editable(page);}else{assert.equal(await page.evaluate(backend=>sessionStorage.getItem('crm:requirement-receipt:v1:'+JSON.stringify(['A',backend,'fixture'])),backend),'');await page.reload();await recover(page).waitFor();assert.equal(commands(control).length,0);}}
 });
 await check('Remove denial keeps COMMITTED lock after successful GET; recover then GET-only clear',async()=>{
  const {page,control}=await fixture({fault:'remove'});await send(page);await recover(page).waitFor();assert.equal(await refresh(page).isDisabled(),true);assert.equal(await page.evaluate(()=>qa.receipts.getRequirementReceipt('A','fixture').phase),'COMMITTED');assert.equal(commands(control).length,1);await page.evaluate(()=>qaFault=null);await recover(page).click();await refresh(page).click();await editable(page);assert.equal(commands(control).length,1);assert.equal(await page.evaluate(()=>qa.receipts.getRequirementReceipt('A','fixture')),null);
 });
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
}catch(error){results.push({name:'HARNESS_FAILURE',status:'FAIL',message:error.stack});throw error;}
finally{for(const context of contexts)await context.close();await browser.close();await mkdir(out,{recursive:true});const output=JSON.stringify({cacheDiagnostic,cacheBaseline,results,errors,unexpected_requests:unexpected,synthetic_intercepted_requests:fixtureRequests.length,actual_api_calls:0,database_calls:0,source_calls:0,visual_scope:'Actual production Workbench behavior under minimal fixture layout CSS; deterministic onSaved stub except cache-diagnostic mode, not full cache/app pixel/layout parity'},null,2)+'\n';await writeFile(path.join(out,'reload-ui-result-'+Date.now()+'.json'),output);await writeFile(path.join(out,'reload-ui-result.json'),output);await writeFile(path.join(out,'reload-ui-fixture.js'),bundle.outputFiles[0].text);}
console.log(JSON.stringify({groups:results.length,unexpected_requests:unexpected.length,actual_api_calls:0}));
