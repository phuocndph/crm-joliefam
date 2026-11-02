// Real SPA + memory-only API fixture. All off-origin browser requests are blocked.
// No .env, PostgreSQL, provider writes or real shipment is used by this harness.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const artifacts=path.join(root,'.local-staging-runtime','ghn-comparison-display-browser-20261102');
const fixture=spawn(process.execPath,['scripts/start-ghn-orders-ui-fixture.mjs'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
let output='',manifest,browser,page,dialog;
fixture.stdout.on('data',chunk=>{output+=chunk;});fixture.stderr.on('data',chunk=>{output+=chunk;});
const checks=[],failures=[],errors=[],blocked=[],requests=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(test,label,timeout=20000){const until=Date.now()+timeout;while(Date.now()<until){if(await test())return;if(fixture.exitCode!==null)throw Error('Fixture stopped: '+output.slice(-1500));await delay(100);}throw Error('Timed out: '+label);}
async function check(name,run){try{await run();checks.push(name);console.log('PASS GHN comparison display browser: '+name);}catch(error){failures.push({name,message:error.message});throw error;}}
async function control(command,marker){const offset=output.length;fixture.stdin.write(command+'\n');await waitFor(()=>output.slice(offset).includes(marker),command);}
async function state(){const offset=output.length;fixture.stdin.write('state\n');let result;await waitFor(()=>{const line=output.slice(offset).split(/\r?\n/).find(row=>row.startsWith('FIXTURE_STATE '));if(line)result=JSON.parse(line.slice('FIXTURE_STATE '.length));return !!result;},'fixture state');return result;}
const numeric=value=>Number(String(value).replaceAll('.',''));
const createButton=()=>dialog.getByRole('button',{name:'Tạo đơn',exact:true});
async function ready(){await waitFor(()=>createButton().isEnabled(),'complete current quotes');}
const feeRequests=()=>requests.filter(row=>row.body.action==='calculate_fee'&&row.body.entryMode==='PACKAGES');
const latestCreate=()=>requests.filter(row=>row.path==='/api/ghn-orders'&&row.body.entryMode==='PACKAGES').at(-1)?.body;
async function firstWeight(value){await dialog.locator('#ghn-parcel-weight').fill(String(value));}
async function fillParcel(index,values){const prefix=index===0?'#ghn-parcel-':`#ghn-parcel-${index+1}-`;for(const [field,value]of Object.entries(values))await dialog.locator(prefix+field).fill(String(value));}
async function recipient(){await dialog.locator('#ghn-to-phone').fill('0900000003');await dialog.locator('#ghn-to-name').fill('Khách thử_4321');await dialog.locator('#ghn-address-summary').click();await page.locator('#ghn-street').fill('789 Đường Giả Lập');for(const[id,name]of[['ghn-province','Tỉnh Thử Nghiệm'],['ghn-district','Quận Giả Lập'],['ghn-ward','Phường Dữ Liệu Thử']]){await page.locator('#'+id).click();await page.getByRole('option',{name,exact:true}).click();}await page.getByRole('button',{name:'Xong',exact:true}).click();await dialog.locator('#ghn-content').fill('Chăn ga thử nghiệm');}
async function capture(name){await page.screenshot({path:path.join(artifacts,name+'.png'),fullPage:false});}
async function layout(width,name){await page.setViewportSize({width,height:900});await ready();await dialog.locator('main').evaluate(node=>{node.scrollTop=0;});const box=await dialog.evaluate(node=>({client:node.clientWidth,scroll:node.scrollWidth,left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right}));assert.ok(box.scroll<=box.client+1,JSON.stringify(box));assert.ok(box.left>=-1&&box.right<=width+1,JSON.stringify(box));const main=await dialog.locator('main').evaluate(node=>({client:node.clientWidth,scroll:node.scrollWidth}));assert.ok(main.scroll<=main.client+1,JSON.stringify(main));const button=await createButton().boundingBox();assert.ok(button&&button.y>=0&&button.y+button.height<=900,JSON.stringify(button));await capture(name);await dialog.locator('#ghn-content').evaluate(node=>node.scrollIntoView({block:'start'}));await capture(name+'-shipment');}
function assertFeeMatchesCreate(fee,created){assert.ok(fee);assert.equal(fee.entryMode,'PACKAGES');assert.equal(created.entryMode,'PACKAGES');assert.equal(created.orderMode,undefined);assert.equal(created.shopId,fee.shopId);for(const field of ['weight','length','width','height','service_id','service_type_id','insurance_value','cod_failed_amount'])assert.equal(created.orderData[field],fee.feeData[field],field);assert.equal(created.orderData.cod_amount,fee.feeData.cod_value);assert.deepEqual(created.orderData.items.map(({price,...row})=>{assert.equal(price,0);return row;}),fee.feeData.items);assert.equal(created.orderData.pick_shift,undefined);}
try{
  await mkdir(artifacts,{recursive:true});
  await waitFor(()=>{const line=output.split(/\r?\n/).find(row=>row.startsWith('GHN_ORDERS_UI_FIXTURE_READY '));if(line)manifest=JSON.parse(line.slice('GHN_ORDERS_UI_FIXTURE_READY '.length));return !!manifest;},'fixture ready',180000);
  assert.equal(manifest.noDatabase,true);assert.equal(manifest.noProviderCalls,true);
  const{chromium}=createRequire(import.meta.url)('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===manifest.origin||['data:','blob:'].includes(url.protocol))return route.continue();blocked.push(url.origin);return route.abort();});
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()!=='POST')return;const pathname=new URL(request.url()).pathname;if(!pathname.startsWith('/api/'))return;let body;try{body=request.postDataJSON();}catch{return;}if(body?.action==='calculate_fee'||pathname.startsWith('/api/ghn-orders'))requests.push({path:pathname,body});});
  await page.goto(manifest.origin+'/auth');await page.getByLabel('Email',{exact:true}).fill(manifest.credentials.email);await page.getByLabel('Mật khẩu',{exact:true}).fill(manifest.credentials.password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.waitForURL(url=>url.pathname!=='/auth');await page.goto(manifest.origin+'/orders');await page.getByRole('button',{name:'Tạo đơn GHN',exact:true}).first().dispatchEvent('click');
  dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Tạo đơn GHN',exact:true})});await dialog.locator('#ghn-to-phone').waitFor();
  const comparison=()=>dialog.locator('#ghn-quote-comparison');
  const summaries=()=>dialog.locator('dl[aria-label^="Khối lượng kiện "]');
  const totals=()=>dialog.locator('dl[aria-label="Tổng khối lượng các kiện"]');
  const quotes=()=>comparison().locator('[data-ghn-selected]');
  const compact=value=>value.replace(/\s+/g,' ').trim();
  const has=async(locator,pattern)=>assert.match(compact(await locator.innerText()),pattern);
  await check('configured shops are visible before valid inputs, with no old quote rows',async()=>{
    await comparison().waitFor();await waitFor(async()=>/2 cửa hàng/.test(await comparison().innerText()),'configured shops loaded');assert.equal(await quotes().count(),0);
  });
  await check('dimensions convert immediately before real weight and retain fractional grams',async()=>{
    await fillParcel(0,{length:30,width:20,height:20});await has(summaries().nth(0),/2\.400 g/);assert.equal(await createButton().isDisabled(),true);
    await fillParcel(0,{length:1,width:1,height:1});await has(summaries().nth(0),/0,2 g/);
    await dialog.locator('#ghn-parcel-height').fill('');assert.doesNotMatch(await summaries().nth(0).innerText(),/0,2 g/);
    await fillParcel(0,{length:30,width:20,height:20});
  });
  await recipient();await firstWeight(1000);await ready();
  await check('one parcel displays all four shop/service quotes and the true winner',async()=>{
    assert.equal(await quotes().count(),4);await has(comparison(),/2 cửa hàng/);await has(comparison(),/4 báo giá hợp lệ/);
    for(const value of ['21.000','25.000','31.000','35.000'])await has(comparison(),new RegExp(value.replace('.','\\.')));
    await has(comparison(),/Đang chọn · Thấp nhất/);await has(dialog.locator('footer'),/21\.000/);
  });
  await check('changed inputs clear old prices and winner during delayed comparison',async()=>{
    await control('quotes-delay-123','FIXTURE_QUOTES_DELAY_READY 123');await firstWeight(1001);assert.equal(await quotes().count(),0);assert.equal(await createButton().isDisabled(),true);assert.doesNotMatch(await comparison().innerText(),/21\.000|35\.000/);await ready();await control('quotes-reset','FIXTURE_QUOTES_RESET_READY');
  });
  await check('per-parcel maxima sum to2900g while real1500g and dimensional2600g remain distinct',async()=>{
    await firstWeight(1000);await dialog.getByRole('button',{name:'Thêm kiện',exact:true}).click();await fillParcel(1,{weight:500,length:10,width:10,height:10});await ready();
    await has(summaries().nth(0),/2\.400 g/);await has(summaries().nth(1),/200 g/);await has(totals(),/1\.500 g/);await has(totals(),/2\.600 g/);await has(totals(),/2\.900 g/);assert.equal(await quotes().count(),2);
  });
  await check('desktop1280 and mobile390 comparisons do not overflow; footer stays visible',async()=>{
    for(const width of [1280,390]){await page.setViewportSize({width,height:900});const bounds=await dialog.evaluate(node=>({client:node.clientWidth,scroll:node.scrollWidth,left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right}));assert.ok(bounds.scroll<=bounds.client+1&&bounds.left>=0&&bounds.right<=width+1,JSON.stringify(bounds));const listBounds=await comparison().evaluate(node=>({client:node.clientWidth,scroll:node.scrollWidth}));assert.ok(listBounds.scroll<=listBounds.client+1,JSON.stringify(listBounds));const footer=await dialog.locator('footer').boundingBox();assert.ok(footer.y>=0&&footer.y+footer.height<=900);await comparison().evaluate(node=>node.scrollIntoView({block:'center'}));await capture('comparison-'+width);}
  });
  await check('partial transport failure exposes incomplete counts and never claims a cheapest winner',async()=>{
    await control('quotes-fail-456','FIXTURE_QUOTES_FAIL_456_READY');await firstWeight(1002);await dialog.locator('footer').getByText('Chưa lấy đủ báo cước.',{exact:true}).waitFor();assert.equal(await createButton().isDisabled(),true);assert.equal(await quotes().count(),1);assert.doesNotMatch(await comparison().innerText(),/Đang chọn · Thấp nhất/);await has(comparison(),/2 cửa hàng/);await control('quotes-reset','FIXTURE_QUOTES_RESET_READY');
  });
  await check('empty catalog counts stay accurate and retry recovers all candidates',async()=>{
    await control('quotes-no-services-all','FIXTURE_QUOTES_NO_SERVICES_ALL_READY');await dialog.locator('footer').getByRole('button',{name:'Thử lại',exact:true}).click();await dialog.locator('footer').getByText('GHN chưa có dịch vụ phù hợp.',{exact:true}).waitFor();assert.equal(await quotes().count(),0);assert.equal(await createButton().isDisabled(),true);await has(comparison(),/2 cửa hàng/);assert.doesNotMatch(await comparison().innerText(),/Đang chọn · Thấp nhất/);await control('quotes-reset','FIXTURE_QUOTES_RESET_READY');await dialog.locator('footer').getByRole('button',{name:'Thử lại',exact:true}).click();await ready();assert.equal(await quotes().count(),2);
  });
  assert.deepEqual(errors,[]);assert.deepEqual(blocked.filter(origin=>/ghn\.vn/.test(origin)),[]);assert.ok((await state()).counters.quoteMaxActive<=3);
  console.log('GHN_COMPARISON_DISPLAY_BROWSER_PASS '+JSON.stringify({checks:checks.length,artifacts,noDatabase:true,noProviderCalls:true}));
}catch(error){if(page)await page.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true}).catch(()=>{});console.error('GHN_COMPARISON_DISPLAY_BROWSER_FAILED '+JSON.stringify({checks,failures}));throw error;}
finally{await writeFile(path.join(artifacts,'result.json'),JSON.stringify({checks,failures,errors,blocked,requests},null,2));if(browser)await browser.close();fixture.stdin.write('stop\n');if(fixture.exitCode===null)await Promise.race([once(fixture,'exit'),delay(8000)]);if(fixture.exitCode===null)fixture.kill();}
