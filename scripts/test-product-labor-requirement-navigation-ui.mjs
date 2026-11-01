import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {tsImport} from 'tsx/esm/api';

const root=process.cwd(),stage=path.join(root,'.local-staging-runtime/item5a-browser-navigation-20261029'),baseline=process.argv.includes('--baseline');
const label=process.argv.find(v=>v.startsWith('--run-label='))?.slice(12)||'editor';assert.match(label,/^[a-z0-9-]{1,40}$/);const out=path.join(stage,label);
const {requirementAuthoringSchema}=await tsImport(pathToFileURL(path.join(root,'server/product-labor-requirement-schema.ts')).href,import.meta.url);
const schema=requirementAuthoringSchema(),family=schema.families.find(f=>f.key==='PILLOW_CASE');assert.ok(family);
const definition=structuredClone(family.template);
const detail={coverage_status:'SUPPORTED',code_key:'fixture',code:'TEST',name:'Dữ liệu thử điều hướng cô lập',unit:'PIECE',semantic_fingerprint:'fingerprint',source_hash:'source',source_status:'AVAILABLE',provenance:[],stream_id:'stream',stream_revision:1,requirement:{stream_id:'stream',version:1,content_hash:'current',semantic_fingerprint:'fingerprint',definition,legacy_id:null,legacy_version:null,effective_from:'2026-10-01',effective_to:null},history:[],proposals:[]};
const bundle=await build({stdin:{contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {createBrowserRouter,RouterProvider,Routes,Route,Link} from 'react-router-dom';
import Workbench from '@/components/payroll/LaborRequirementWorkbench';
const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
const onBusy=value=>window.qa.busy=value;
function Shell(){return <Routes><Route path='/before' element={<main><h1>Trước trang nhập</h1><Link to='/workspace?requirement_code=fixture'>Mở yêu cầu</Link></main>}/><Route path='/workspace' element={<Workbench userId='manager' admin={true} canManage={true} onBusyChange={onBusy}/>}/><Route path='/after' element={<h1>Trang khác</h1>}/></Routes>}
const router=createBrowserRouter([{id:'app-shell',path:'*',element:<Shell/>}]);window.qa.router=router;window.qa.client=client;
let wasBlocked=false;router.subscribe(state=>{const blocked=[...state.blockers.values()].some(item=>item.state==='blocked');if(blocked&&!wasBlocked)window.qa.blockedCount++;if(!blocked&&wasBlocked)window.qa.resetCount++;wasBlocked=blocked;});
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);`,resolveDir:root,loader:'tsx',sourcefile:'requirement-browser-history-fixture.tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',alias:{'@':path.join(root,'src')},plugins:[{name:'offline-api',setup(b){
 b.onResolve({filter:/^@\/lib\/local-api$/},()=>({path:'offline-api',namespace:'qa'}));
 b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export class LocalApiError extends Error{constructor(message,status=500){super(message);this.status=status;this.structuredResponse=true;}}export const localApi=window.qa.api;`,loader:'js'}));
 if(baseline)b.onLoad({filter:/LaborRequirementWorkbench\.tsx$/},async()=>({contents:await readFile(path.join(stage,'baseline/src/components/payroll/LaborRequirementWorkbench.tsx'),'utf8'),loader:'tsx',resolveDir:path.join(root,'src/components/payroll')}));
}}]});
await mkdir(out,{recursive:true});await writeFile(path.join(out,baseline?'baseline-fixture.js':'fixture.js'),bundle.outputFiles[0].text);
const {chromium}=createRequire(import.meta.url)('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');
const browser=await chromium.launch({channel:'msedge',headless:true}),results=[],denied=[],pageErrors=[],fixtureRequests=[];
async function mount(extraEntry=false){
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',error=>pageErrors.push(error.message));
 await page.addInitScript(({schema,detail})=>{
  let sequence=0;Object.defineProperty(crypto,'randomUUID',{value:()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,configurable:true});
  const qa={schema,detail,calls:[],pending:{},mutationMode:'ok',getMode:'ok',busy:false,popEvents:0,blockedCount:0,resetCount:0};window.qa=qa;
  window.addEventListener('popstate',()=>qa.popEvents++);
  qa.api={laborRequirementSchema:async()=>structuredClone(schema),laborRequirementCoverage:async()=>({rows:[structuredClone(detail)],total:1,counts:{all:1,blank_rows:0}}),laborRequirementDetail:async()=>{qa.calls.push({kind:'get'});if(qa.getMode==='error')throw new Error('Chưa tải được kết quả thử');return structuredClone(detail);},validateLaborRequirement:async body=>{qa.calls.push({kind:'validate',body});return {content_hash:'validated'};},saveLaborRequirementProposal:async body=>{qa.calls.push({kind:'save',body});if(qa.mutationMode==='hold')return new Promise((resolve,reject)=>qa.pending.save={resolve,reject});if(qa.mutationMode==='lost')throw new Error('Mất phản hồi thử');return {stream_id:'stream',stream_revision:2,proposal_id:'saved',proposal_revision:1,reused:false};},approveLaborRequirement:async body=>{qa.calls.push({kind:'approve',body});return {stream_id:'stream',stream_revision:2,action:'APPROVE',reused:false};},retireLaborRequirement:async body=>{qa.calls.push({kind:'retire',body});return {stream_id:'stream',stream_revision:2,action:'RETIRE',reused:false};}};
 },{schema,detail});
 await page.route('**/*',async route=>{const request=route.request();if(request.isNavigationRequest()&&request.url()==='http://labor-navigation.test/before'){fixtureRequests.push(request.url());await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html lang="vi"><body><div id="root"></div><script>'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script></body></html>'});}else{denied.push(request.url());await route.abort();}});
 await page.goto('http://labor-navigation.test/before');if(extraEntry){await page.evaluate(()=>qa.router.navigate('/before?step=extra'));await page.waitForFunction(()=>location.search==='?step=extra');}await page.getByRole('link',{name:'Mở yêu cầu',exact:true}).click();await page.getByLabel('Lý do yêu cầu mã').waitFor();await page.waitForFunction(()=>!qa.busy);
 return page;
}
const state=page=>page.evaluate(()=>({url:location.href,length:history.length,pops:qa.popEvents,blocked:qa.blockedCount,resets:qa.resetCount,blockers:[...qa.router.state.blockers.values()].map(b=>b.state)}));
const mutations=page=>page.evaluate(()=>qa.calls.filter(c=>['save','approve','retire'].includes(c.kind)));
async function blockedBack(page){const before=await state(page);await page.evaluate(()=>history.back());await page.waitForFunction(({pops,url})=>qa.popEvents>=pops+2&&location.href===url&&[...qa.router.state.blockers.values()].every(b=>b.state==='unblocked'),before);assert.equal((await state(page)).length,before.length);return before;}
async function blockedNavigate(page,to,replace=false){const before=await state(page);await page.evaluate(({to,replace})=>{void qa.router.navigate(to,{replace});},{to,replace});await page.waitForFunction(({url,blocked,resets})=>qa.blockedCount>blocked&&qa.resetCount>resets&&location.href===url&&[...qa.router.state.blockers.values()].every(b=>b.state==='unblocked'),before);assert.equal((await state(page)).length,before.length);}
async function unloadBlocked(page){assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),true);}
async function unloadClean(page){assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),false);}
async function cleanBack(page){await unloadClean(page);await page.evaluate(()=>history.back());await page.getByRole('heading',{name:'Trước trang nhập',exact:true}).waitFor();}
const check=async(name,work)=>{await work();results.push({name,result:'PASS'});console.log('PASS '+name);};
try{
 if(baseline){await check('Baseline Browser Back loses dirty editor',async()=>{const page=await mount();await page.getByLabel('Lý do yêu cầu mã').fill('Nội dung chưa lưu');await page.evaluate(()=>history.back());await page.getByRole('heading',{name:'Trước trang nhập',exact:true}).waitFor();assert.equal(await page.getByLabel('Lý do yêu cầu mã').count(),0);assert.equal((await mutations(page)).length,0);await page.close();});}
 else{
 await check('Dirty Back/PUSH/REPLACE/search/hash and repeated Back preserve draft and history',async()=>{
  const page=await mount();await page.getByLabel('Lý do yêu cầu mã').fill('Nội dung chưa lưu');await blockedBack(page);await blockedBack(page);await blockedNavigate(page,'/after');await blockedNavigate(page,'/after',true);await blockedNavigate(page,'?thay-doi=1');await blockedNavigate(page,'#lich-su');assert.equal(await page.getByLabel('Lý do yêu cầu mã').inputValue(),'Nội dung chưa lưu');await unloadBlocked(page);assert.equal((await mutations(page)).length,0);await page.close();
 });
 await check('Sending Back stays mounted; completion does not auto resend',async()=>{
  const page=await mount();await page.getByLabel('Lý do yêu cầu mã').fill('Đang gửi thử');await page.evaluate(()=>qa.mutationMode='hold');await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();await page.waitForFunction(()=>!!qa.pending.save);await blockedBack(page);await unloadBlocked(page);assert.equal((await mutations(page)).length,1);await page.evaluate(()=>qa.pending.save.resolve({stream_id:'stream',stream_revision:2,proposal_id:'saved',proposal_revision:1,reused:false}));await page.waitForFunction(()=>!qa.busy);assert.equal((await mutations(page)).length,1);await cleanBack(page);await page.close();
 });
 await check('Lost response Back keeps frozen retry; retry remains identical without automatic resend',async()=>{
  const page=await mount();await page.getByLabel('Lý do yêu cầu mã').fill('Giữ yêu cầu gửi');await page.evaluate(()=>qa.mutationMode='lost');await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();const retry=page.getByRole('button',{name:'Kiểm tra lại thao tác vừa gửi',exact:true});await retry.waitFor();await blockedBack(page);await blockedNavigate(page,'/after',true);await unloadBlocked(page);assert.equal((await mutations(page)).length,1);assert.ok(await retry.isEnabled());await page.evaluate(()=>qa.mutationMode='ok');await retry.click();await page.waitForFunction(()=>qa.calls.filter(c=>c.kind==='save').length===2&&!qa.busy);const calls=await mutations(page);assert.deepEqual(calls[0].body,calls[1].body);assert.equal(await page.evaluate(()=>qa.calls.filter(c=>c.kind==='validate').length),1);await cleanBack(page);await page.close();
 });
 await check('Committed failed GET Back/close lock retains receipt and GET-only recovery',async()=>{
  const page=await mount();await page.getByLabel('Lý do yêu cầu mã').fill('Đã lưu chưa tải');await page.evaluate(()=>qa.getMode='error');await page.getByRole('button',{name:'Lưu nháp',exact:true}).click();const refresh=page.getByRole('button',{name:'Tải lại kết quả đã lưu',exact:true});await refresh.waitFor();assert.equal(await page.evaluate(()=>qa.busy),true);await blockedBack(page);await blockedNavigate(page,'/after');await page.keyboard.press('Escape');assert.ok(await refresh.isVisible());await page.getByRole('button',{name:'Đóng',exact:true}).first().click();assert.ok(await refresh.isVisible());await unloadBlocked(page);assert.equal((await mutations(page)).length,1);await page.evaluate(()=>qa.getMode='ok');await refresh.click();await page.waitForFunction(()=>!qa.busy);assert.equal((await mutations(page)).length,1);assert.ok(await page.getByLabel('Lý do yêu cầu mã').isVisible());await cleanBack(page);await page.close();
 });
 await check('Clean Back then Forward works without adding history entries',async()=>{
  const page=await mount(),before=await state(page);await unloadClean(page);await page.evaluate(()=>history.back());await page.getByRole('heading',{name:'Trước trang nhập',exact:true}).waitFor();await page.evaluate(()=>history.forward());await page.getByRole('region',{name:'Yêu cầu mã công',exact:true}).waitFor();assert.equal((await state(page)).length,before.length);assert.equal((await state(page)).url,before.url);assert.equal((await mutations(page)).length,0);await page.close();
 });
 await check('Explicit dirty discard releases editor lock and then Back works',async()=>{
  const page=await mount();await page.getByLabel('Lý do yêu cầu mã').fill('Sẽ bỏ nội dung');await blockedBack(page);await page.getByRole('button',{name:'Đóng',exact:true}).first().click();await page.getByRole('button',{name:'Tiếp tục sửa',exact:true}).click();assert.equal(await page.getByLabel('Lý do yêu cầu mã').inputValue(),'Sẽ bỏ nội dung');await blockedBack(page);await page.getByRole('button',{name:'Đóng',exact:true}).first().click();await page.getByRole('button',{name:'Bỏ thay đổi',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-requirement-editor]'));await unloadClean(page);await page.evaluate(()=>history.back());await page.getByRole('heading',{name:'Trước trang nhập',exact:true}).waitFor();assert.equal((await mutations(page)).length,0);await page.close();
 });
 await check('Three-entry go(-2) and locked Forward preserve current history position',async()=>{
  const page=await mount(true);await page.getByRole('button',{name:'Đóng',exact:true}).first().click();await page.waitForFunction(()=>!document.querySelector('[data-requirement-editor]'));await page.evaluate(()=>qa.router.navigate('/after'));await page.getByRole('heading',{name:'Trang khác',exact:true}).waitFor();await page.evaluate(()=>history.back());await page.getByRole('region',{name:'Yêu cầu mã công',exact:true}).waitFor();await page.getByRole('button',{name:'Xử lý',exact:true}).first().click();await page.getByLabel('Lý do yêu cầu mã').fill('Giữ vị trí giữa');const before=await state(page);await page.evaluate(()=>history.forward());await page.waitForFunction(({pops,url})=>qa.popEvents>=pops+2&&location.href===url&&[...qa.router.state.blockers.values()].every(b=>b.state==='unblocked'),before);assert.equal((await state(page)).length,before.length);await page.evaluate(()=>history.go(-2));await page.waitForFunction(({pops,url})=>qa.popEvents>=pops+4&&location.href===url&&[...qa.router.state.blockers.values()].every(b=>b.state==='unblocked'),before);assert.equal((await state(page)).length,before.length);assert.equal(await page.getByLabel('Lý do yêu cầu mã').inputValue(),'Giữ vị trí giữa');assert.equal((await mutations(page)).length,0);await page.close();
 });
 }
 assert.deepEqual(denied,[]);assert.deepEqual(pageErrors,[]);
}catch(error){results.push({name:'Harness failure',result:'FAIL',message:error.stack});throw error;}finally{await browser.close();const output=JSON.stringify({baseline,results,fixtureRequests,externalRequests:denied,pageErrors},null,2);await writeFile(path.join(out,`${baseline?'baseline':'focused'}-${Date.now()}-result.json`),output);await writeFile(path.join(out,baseline?'baseline-result.json':'focused-result.json'),output);}
console.log(JSON.stringify({baseline,passed:results.length,results,fixtureRequests:fixtureRequests.length,externalRequests:denied.length},null,2));
