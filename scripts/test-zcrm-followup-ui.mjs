import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import path from 'node:path';
import express from 'express';
import {build} from 'vite';
import react from '@vitejs/plugin-react-swc';

const repo=fileURLToPath(new URL('..',import.meta.url));
const out=path.resolve(repo,'../outputs/zcrm-integration-20261029/followup-ui');
const manifest=JSON.parse(await readFile(path.resolve(out,'../audit-followup-manifest.json'),'utf8'));
async function verifyManifest(){for(const item of manifest)assert.equal(createHash('sha256').update(await readFile(path.join(repo,item.path))).digest('hex'),item.sha256,item.path);}
await verifyManifest();await mkdir(out,{recursive:true});
const connection={id:'fixture-connection',org_id:'fixture-org',tenant_id:'fixture-tenant',name:'Fixture existing connection',origin:'https://zcrm.example.com',enabled:false,revision:1,actor_mappings:[],customer_ids:[],product_grants:[],outbox:{pending:0,retrying:0,last_error:null}};
let detailVersion=1,settingsPosts=[],orderReads=0,approvalBody,holdDetail,releaseDetail;
const amounts={subtotal:100000,discount:0,shipping:0,tax:0,deposit:0,collected:0,refunded:0,due:100000};
const order={id:'fixture-order',code:'QA-FOLLOWUP-ORDER',approval:{code:'pending',label:'Chờ duyệt'},orderedBy:'Fixture customer',owner:'Fixture manager',total:100000,amounts,lines:[{productId:'fixture-product',name:'Fixture pillow',kind:'stock',quantity:1,unit:'cái',unitPrice:100000,proposedPrice:null,specifications:{}}]};
const app=express();app.use(express.json());
app.get('/api/zcrm-admin/settings',(_req,res)=>res.json({featureEnabled:true,encryptionReady:true,apiUrl:'https://crm.example.com/api/zcrm/v1',connections:[connection]}));
app.get('/api/zcrm-admin/catalog',(req,res)=>res.json(req.query.kind==='tenants'?[{id:'fixture-tenant'}]:[]));
app.post('/api/zcrm-admin/connections',(req,res)=>{settingsPosts.push(req.body);if(req.body.revision!==connection.revision)return res.status(409).json({message:'Cấu hình đã đổi; tải lại trước khi lưu.'});res.json({id:connection.id});});
app.get('/api/zcrm-admin/review-orders',(_req,res)=>res.json({items:[{id:order.id,order_number:order.code,approval_status:'pending',approval_revision:1,total_amount:100000,customer_name:'Fixture customer',intake_submitted_by:'Fixture manager'}]}));
app.get('/api/zcrm-admin/orders/'+order.id,async(_req,res)=>{if(holdDetail)await holdDetail;res.json({order:{...order,version:detailVersion},review_unit_prices:[100000],revision:1,reason:null,attachments:[],history:detailVersion===1?[]:[{action:'fixture.read-version-change',actor_id:'fixture',created_at:'2026-10-29T10:00:00Z',detail:{}}]});});
app.post('/api/zcrm-admin/orders/'+order.id+'/review',(req,res)=>{approvalBody=req.body;res.json({id:order.id,approval_status:'approved',revision:2});});
app.get('/api/fixture-orders',(_req,res)=>{orderReads++;res.json([{id:order.id,total_amount:order.total}]);});
app.post('/fixture/remote',(req,res)=>{if(req.body.settings)connection.revision++;if(req.body.detail)detailVersion++;res.json({revision:connection.revision,detailVersion});});
const fixtureDir=path.join(out,'fixture');await mkdir(fixtureDir,{recursive:true});
await writeFile(path.join(fixtureDir,'index.html'),'<html><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>');
const src=path.join(repo,'src').replaceAll('\\','/');
await writeFile(path.join(fixtureDir,'main.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider,useQuery}from'@tanstack/react-query';import{ZcrmSettingsPanel}from'${src}/components/ZcrmSettingsPanel.tsx';import{ZcrmOrderReviewPanel}from'${src}/components/ZcrmOrderReviewPanel.tsx';const client=new QueryClient({defaultOptions:{queries:{staleTime:120000,gcTime:600000,refetchOnWindowFocus:false,refetchOnReconnect:false,retry:1}}});window.fixtureClient=client;function MainList(){const q=useQuery({queryKey:['orders-infinite','all',''],queryFn:()=>fetch('/api/fixture-orders').then(r=>r.json()),refetchOnWindowFocus:false});return <output aria-label="Main list fixture">{JSON.stringify(q.data)}</output>}createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><ZcrmSettingsPanel/><ZcrmOrderReviewPanel/><MainList/></QueryClientProvider>);`);
await build({configFile:false,root:fixtureDir,envDir:false,plugins:[react()],logLevel:'warn',resolve:{alias:{'@':path.join(repo,'src'),'react':path.join(repo,'node_modules/react'),'react-dom':path.join(repo,'node_modules/react-dom'),'@tanstack/react-query':path.join(repo,'node_modules/@tanstack/react-query')}},define:{'import.meta.env.VITE_BACKEND_MODE':JSON.stringify('local'),'import.meta.env.VITE_LOCAL_API_URL':JSON.stringify(''),'import.meta.env.VITE_LOCAL_DEMO_AUTH':JSON.stringify('false')},build:{outDir:path.join(fixtureDir,'dist'),emptyOutDir:true}});
app.use(express.static(path.join(fixtureDir,'dist')));let server,browser;
const findings=[];
try{
server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');
browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1400,height:1000}});
await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
await context.addInitScript(()=>localStorage.setItem('local_user_session',JSON.stringify({actor:'fixture-admin',token:'fixture-session-not-real',expires_at:new Date(Date.now()+3600000).toISOString(),role:'admin'})));
const page=await context.newPage();await page.goto(origin);await page.getByRole('heading',{name:/^ZCRM —/}).waitFor();
await page.getByLabel('Chọn kết nối ZCRM').selectOption(connection.id);
await page.request.post(origin+'/fixture/remote',{data:{settings:true}});
const save=page.getByRole('button',{name:'Lưu kết nối ZCRM',exact:true});
await save.click();await page.getByRole('alert').filter({hasText:'Cấu hình đã đổi'}).waitFor();
const reloaded=page.waitForResponse(r=>r.url().endsWith('/api/zcrm-admin/settings'));await page.getByRole('button',{name:'Tải lại',exact:true}).click();await reloaded;
await save.click();await page.getByRole('alert').filter({hasText:'Cấu hình đã đổi'}).waitFor();
assert.equal(connection.revision,2);assert.deepEqual(settingsPosts.map(b=>b.revision),[1,1]);
findings.push({priority:'P2',title:'Reload after settings revision conflict does not update form revision',observed:{remoteRevision:connection.revision,postedRevisions:settingsPosts.map(b=>b.revision)},lines:['src/components/ZcrmSettingsPanel.tsx:21','src/components/ZcrmSettingsPanel.tsx:35']});
await page.screenshot({path:path.join(out,'settings-revision-conflict.png'),fullPage:true});
await page.getByRole('button',{name:'Kiểm tra và duyệt',exact:true}).click();const dialog=page.getByRole('dialog');
const price=dialog.getByLabel('Đơn giá chính thức dòng 1');await price.waitFor();
await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
await page.request.post(origin+'/fixture/remote',{data:{detail:true}});
// Fast-forward the cached detail's age to the real application's two-minute
// stale threshold. Reopening then performs its normal refetch; no forced
// invalidation, window-focus behavior or production settings are fabricated.
await page.evaluate(()=>{const q=window.fixtureClient.getQueryCache().find({queryKey:['zcrm','review-detail','fixture-order']});q.setState({dataUpdatedAt:Date.now()-121000});});
holdDetail=new Promise(resolve=>{releaseDetail=resolve;});
await page.getByRole('button',{name:'Kiểm tra và duyệt',exact:true}).click();await price.waitFor();await price.fill('12345');
await dialog.getByRole('textbox').last().fill('Fixture unsaved approval reason');
const detailReload=page.waitForResponse(r=>r.url().endsWith('/api/zcrm-admin/orders/'+order.id));releaseDetail();await detailReload;holdDetail=undefined;
await price.waitFor();assert.equal(await price.inputValue(),'100000');assert.equal(await dialog.getByRole('textbox').last().inputValue(),'');
findings.push({priority:'P2',title:'Reopening a stale cached detail lets its slow normal refresh silently reset new approval edits',observed:{cacheAgeMs:121000,typedPrice:12345,afterRefreshPrice:await price.inputValue(),afterRefreshReason:await dialog.getByRole('textbox').last().inputValue()},lines:['src/components/ZcrmOrderReviewPanel.tsx:19','src/components/ZcrmOrderReviewPanel.tsx:20']});
await dialog.screenshot({path:path.join(out,'approval-values-reset.png')});
const before=orderReads;await dialog.getByRole('button',{name:'Duyệt đơn',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.waitForTimeout(200);
assert.equal(approvalBody.unit_prices[0],100000);assert.equal(orderReads,before);
findings.push({priority:'P2',title:'Approval does not refresh main orders-infinite query',observed:{orderReadsBefore:before,orderReadsAfter:orderReads,approvalPrice:approvalBody.unit_prices[0]},lines:['src/components/ZcrmOrderReviewPanel.tsx:25','src/hooks/useInfiniteOrders.ts:35']});
await verifyManifest();await writeFile(path.join(out,'report.json'),JSON.stringify({status:'confirmed-findings',scope:'actual production ZCRM components with isolated fixture API; no real CRM database/provider',manifestCount:manifest.length,findings},null,2));console.log('FOLLOWUP UI: '+findings.length+' confirmed findings; no production writes or external calls.');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
