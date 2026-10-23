// Independent actual-page React lifecycle fixture. All API/auth/UI dependencies
// are synthetic; this does not exercise the real application, backend or CSS.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createRequire} from 'node:module';

const mocks={
  '@/lib/local-api': `export class LocalApiError extends Error {constructor(message,status,structuredResponse=false){super(message);this.status=status;this.structuredResponse=structuredResponse}};
    export const localApi={productionWorkspace:()=>window.fixture.request(),myProductEarnings:async()=>null};
    window.fixtureError=(kind)=>kind==='network'?new TypeError('Failed to fetch'):new LocalApiError('Synthetic '+kind,Number(kind),false);`,
  '@/lib/local-auth': `export const captureLocalAuthGuard=async(actor)=>{const epoch=window.fixture.epoch;return {assertCurrent(){if(epoch!==window.fixture.epoch||actor!==window.fixture.auth.user?.id)throw new Error('Changed session')}}};`,
  '@/hooks/useAuthReady': `import {useEffect,useState} from 'react';export function useAuthReady(){const [,render]=useState(0);useEffect(()=>{const cb=()=>render(x=>x+1);window.fixture.authListeners.push(cb);return()=>{window.fixture.authListeners=window.fixture.authListeners.filter(x=>x!==cb)}},[]);return window.fixture.auth}`,
  '@/hooks/useDispatchMutation': `export const useDispatchMutation=()=>({busy:false,execute:async()=>{throw new Error('Unexpected mutation')}});`,
  '@/hooks/use-toast': `export const useToast=()=>({toast(){}});`,
  '@/lib/production-dispatch-types': `export const dispatchLabels={IN_PROGRESS:'Đang làm'};export const dispatchNumber=x=>String(x);export const dispatchToday=()=>'2026-10-23';`,
  'react-router-dom': `import React from 'react';export const Link=({children,to})=><a href={to}>{children}</a>;`,
  '@/components/workspace/WorkspaceShell': `import React from 'react';export const WorkspaceCommandBar=({title,actions})=><header>{title}{actions}</header>;const Strip=({items})=><nav>{items.map(x=><button key={x.id} onClick={x.onClick}>{x.label}</button>)}</nav>;export const WorkflowStepStrip=Strip,StatusFilterStrip=Strip;`,
  '@/components/ProductionWorkspaceDetail': `import React,{useState,useEffect} from 'react';export default function Detail({context,row,actorId}){const [notes,setNotes]=useState('');useEffect(()=>{window.fixture.detailMounts++},[]);return <section data-testid="selected-detail" data-actor={actorId} data-batch={context.batchId} data-item={context.itemId}><input aria-label="Synthetic detail draft" value={notes} onChange={e=>setNotes(e.target.value)}/>{row.product_name}</section>}`,
  '@/components/ui/dialog': `import React from 'react';export const Dialog=({open,children})=>open?<div>{children}</div>:null;export const DialogContent=({children})=><div>{children}</div>;export const DialogHeader=DialogContent,DialogTitle=DialogContent,DialogDescription=DialogContent;`,
  '@/components/ui/button': `import React from 'react';export const Button=({children,onClick,disabled,...p})=><button onClick={onClick} disabled={disabled} aria-label={p['aria-label']}>{children}</button>;`,
  '@/components/ui/input': `import React from 'react';export const Input=p=><input {...p}/>;`,
  '@/components/ui/label': `import React from 'react';export const Label=p=><label {...p}/>;`,
  '@/components/ui/badge': `import React from 'react';export const Badge=({children})=><span>{children}</span>;`,
  '@/components/ui/dropdown-menu': `import React from 'react';export const DropdownMenu=({children})=><div>{children}</div>;export const DropdownMenuContent=DropdownMenu,DropdownMenuTrigger=DropdownMenu;export const DropdownMenuItem=({children,onSelect})=><button onClick={onSelect}>{children}</button>;`,
};
for(const name of ['MyProductionDispatch','ProductionSalesQueue','ProductionReviewQueue'])mocks[`@/components/${name}`]='export default function Empty(){return null}';
mocks['@/components/ProductionReferenceImages']='export const ProductionReferenceImagePicker=()=>null';
const {outputFiles}=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';
  import Page from './src/pages/ProductionWorkspacePage';
  window.fixture={auth:{user:{id:'actor-a'},isReady:true},epoch:0,requests:[],authListeners:[],intervals:[],detailMounts:0,
    request(){return new Promise((resolve,reject)=>this.requests.push({resolve,reject,settled:false}))},
    settle(value,error){const req=this.requests.find(x=>!x.settled);if(!req)throw new Error('No pending workspace request');req.settled=true;error?req.reject(window.fixtureError(error)):req.resolve(value)},
    switchActor(actor){this.epoch++;this.auth={user:{id:actor},isReady:true};this.authListeners.forEach(cb=>cb())}};
  window.setInterval=(fn,ms)=>{const item={fn,ms,active:true};window.fixture.intervals.push(item);return window.fixture.intervals.length};
  window.clearInterval=id=>{if(window.fixture.intervals[id-1])window.fixture.intervals[id-1].active=false};
  createRoot(document.getElementById('root')).render(<Page/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',logLevel:'silent',plugins:[{name:'isolated-page-dependencies',setup(b){
  b.onResolve({filter:/.*/},args=>args.path in mocks?{path:args.path,namespace:'mock'}:undefined);
  b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'tsx',resolveDir:process.cwd()}));
}}]});
const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?outputFiles[0].text:'<div id="root"></div><script src="/fixture.js"></script>')});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`;
const {chromium}=createRequire(import.meta.url)('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const counts={CUTTING:0,SEWING:0,FINISHING:0,COUNTING:0};
const row={id:'order-a',production_order_number:'LSX-FIXTURE-A',workflow_generation:'WORKFLOW_V3',status:'IN_PROGRESS',order_id:null,source_type:'MANUAL',source_order_number:null,planned_end_date:null,dispatch_priority:'NORMAL',quantity_planned:'100',batch_id:'batch-a',batch_number:'LO-A',batch_quantity:'100',item_id:'item-a',product_id:'product-a',product_name:'Sản phẩm kiểm thử A',product_sku:'SKU-A',fabric_variant_id:null,color:null,size:null,dimensions:null,planned_quantity:'100',good:counts,reserved:counts,processed:counts,open:counts,received:'0',shipped:'0',delivered:'0',pending_reports:0,material:{status:'APPROVED',no_material_required:true,estimated:0,issued:0}};
const workspace=(patch={})=>({version:5,mode:'MANAGER',rows:[row],permissions:{manage:true,review:true,sales:true},...patch});
let browser,checks=0;
const pass=label=>{checks++;console.log('PASS independent production page: '+label)};
try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('FIXTURE PAGE ERROR: '+e.message)});
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const pending=()=>page.waitForFunction(()=>window.fixture.requests.some(x=>!x.settled));
  const settle=(value=workspace(),error)=>page.evaluate(({value,error})=>window.fixture.settle(value,error),{value,error});
  const tick=ms=>page.evaluate(ms=>window.fixture.intervals.filter(x=>x.active&&x.ms===ms).forEach(x=>x.fn()),ms);
  const board=()=>page.getByRole('heading',{name:'Bảng theo dõi sản xuất'});
  const detail=()=>page.getByTestId('selected-detail');
  await page.goto(origin);await pending();await settle();await board().waitFor();
  assert.deepEqual(errors,[]);pass('actual page mounts without undefined workflowStep crash');
  await page.getByRole('button',{name:/Cắt · LSX-FIXTURE-A/}).first().click();await detail().waitFor();
  await page.getByRole('textbox',{name:'Synthetic detail draft'}).fill('Giữ nguyên bản nháp');
  assert.equal(await detail().getAttribute('data-batch'),'batch-a');assert.equal(await detail().getAttribute('data-item'),'item-a');
  await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))});await pending();
  assert.equal(await detail().count(),1);assert.equal(await board().count(),1);
  assert.equal(await page.evaluate(()=>window.fixture.requests.filter(x=>!x.settled).length),1);
  await settle();await page.waitForFunction(()=>window.fixture.requests.every(x=>x.settled));
  assert.equal(await page.getByRole('textbox',{name:'Synthetic detail draft'}).inputValue(),'Giữ nguyên bản nháp');
  assert.equal(await page.evaluate(()=>window.fixture.detailMounts),1);
  pass('foreground coalesces while preserving board, exact selection and mounted detail draft');
  for(const error of ['network','503']){await tick(15000);await pending();await settle(null,error);await page.getByRole('alert').waitFor();assert.equal(await board().count(),1);assert.equal(await detail().count(),1);assert.equal(await page.getByRole('textbox',{name:'Synthetic detail draft'}).inputValue(),'Giữ nguyên bản nháp');}
  pass('polling TypeError network and unstructured 503 retain actor-bound board and selection');
  await tick(15000);await pending();await settle(null,'403');await page.waitForFunction(()=>!document.querySelector('[data-testid="selected-detail"]'));
  assert.equal(await board().count(),0);pass('403 permission rejection clears privileged board and selected detail');
  await page.getByRole('button',{name:'Thử lại'}).click();await pending();await settle();await board().waitFor();
  await tick(15000);await pending();await page.evaluate(()=>window.dispatchEvent(new Event('crm-permissions-changed')));
  await page.waitForFunction(()=>window.fixture.requests.filter(x=>!x.settled).length===2);
  assert.equal(await board().count(),0);await settle();assert.equal(await board().count(),0);
  await settle(workspace({mode:'REVIEW',rows:[],permissions:{review:true}}));
  await page.waitForFunction(()=>document.querySelector('header')?.textContent.includes('Duyệt báo cáo sản xuất'));
  assert.equal(await board().count(),0);pass('hard invalidation clears immediately, ignores prior poll response and REVIEW never shows board');
  await page.evaluate(()=>window.dispatchEvent(new Event('crm-permissions-changed')));await pending();
  await page.evaluate(()=>window.fixture.switchActor('actor-b'));
  await page.waitForFunction(()=>window.fixture.requests.filter(x=>!x.settled).length===2);
  await settle();assert.equal(await board().count(),0);
  const bRow={...row,id:'order-b',batch_id:'batch-b',item_id:'item-b',production_order_number:'LSX-FIXTURE-B',product_name:'Sản phẩm kiểm thử B'};
  await settle(workspace({rows:[bRow]}));await board().waitFor();
  assert.equal(await page.getByText('LSX-FIXTURE-A',{exact:true}).count(),0);
  assert.equal(await page.getByText('LSX-FIXTURE-B',{exact:true}).count(),1);
  pass('account switch ignores in-flight actor A response and publishes only actor B data');
  await page.evaluate(()=>window.fixture.epoch++);await tick(500);
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll('h2')).some(x=>x.textContent==='Bảng theo dõi sản xuất'));
  assert.equal(await board().count(),0);assert.deepEqual(errors,[]);
  pass('same-account session epoch change clears board even without a new auth user object');
  console.log(`PASS ${checks} independent actual-page lifecycle regressions; mocked children/API/auth, no real API or visual CSS claims.`);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
