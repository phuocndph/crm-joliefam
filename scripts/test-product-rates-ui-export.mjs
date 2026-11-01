// No .env, database, remote service or business data. Actual XLSX bytes are reloaded.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import ts from 'typescript';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
const stage=path.resolve('.local-staging-runtime/item5s3-baseline/export-tests');
await mkdir(stage,{recursive:true});
const results=[];
async function check(name,work){try{await work();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.stack});}}
await build({entryPoints:['src/lib/product-rate-display.ts'],outfile:path.join(stage,'display.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
await build({entryPoints:['src/lib/payroll-rates-export.ts'],outfile:path.join(stage,'export.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'owned-save-capture',setup(b){b.onResolve({filter:/^file-saver$/},()=>({path:'capture',namespace:'owned'}));b.onLoad({filter:/.*/,namespace:'owned'},()=>({contents:'export function saveAs(blob,filename){globalThis.__rateDownloads.push({blob,filename});}',loader:'js'}));}}]});
const helpers=await import(pathToFileURL(path.join(stage,'display.mjs')).href),{parseExactProductPrice:parse,formatExactProductPrice:format,compareExactProductPrices:compare,productRateUnitLabel:unit,isProductRateISODate:date,literalProductRateText:literal}=helpers;
const {buildPayrollRatesWorkbook:workbook,exportPayrollRatesExcel:download}=await import(pathToFileURL(path.join(stage,'export.mjs')).href);
const row=(rate='12500.25',extra={})=>({productCode:'0001',productName:'Công may tiếng Việt',rate,unit:'PIECE',effectiveFrom:'2026-01-01',effectiveTo:null,source:'excel:synthetic',status:'APPROVED',...extra});
const reload=async book=>{const bytes=await book.xlsx.writeBuffer(),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(bytes);return{bytes,loaded,sheet:loaded.worksheets[0],zip:await JSZip.loadAsync(bytes)};};
await check('P1 exact parser/format boundaries, no numeric fallback',()=>{
 for(const value of [undefined,null,1,0,NaN,'0','0.00','NaN','1e2','1.001','-1','10000000000000000',' 1','1,00'])assert.equal(parse(value),null,String(value));
 for(const [value,canonical,display]of [['0.01','0.01','0,01'],['12500.25','12500.25','12.500,25'],['12500','12500.00','12.500'],['9999999999999999.99','9999999999999999.99','9.999.999.999.999.999,99']]){assert.equal(parse(value).canonical,canonical);assert.equal(format(value),display);}
 assert.equal(format(undefined),'Đơn giá không hợp lệ');
});
await check('P2 six adjacent max cents sort stably, invalid last in both directions',()=>{
 const six=['94','95','96','97','98','99'].map(c=>'9999999999999999.'+c),values=[undefined,...six.toReversed(),'NaN'];
 const records=values.map(value=>({value}));
 assert.deepEqual(records.toSorted((a,b)=>compare(a.value,b.value)).map(r=>r.value),[...six,undefined,'NaN']);
 assert.deepEqual(records.toSorted((a,b)=>compare(a.value,b.value,'desc')).map(r=>r.value),[...six.toReversed(),undefined,'NaN']);
 const ties=[{id:1,value:'1'},{id:2,value:'1.00'}];assert.deepEqual(ties.toSorted((a,b)=>compare(a.value,b.value)).map(x=>x.id),[1,2]);
});
await check('P3 Gregorian dates and truthful recorded units',()=>{
 for(const value of ['0001-01-01','0099-12-31','1900-02-28','2000-02-29','9999-12-31'])assert(date(value),value);
 for(const value of ['0000-01-01','10000-01-01','1900-02-29','2026-02-29','2026-04-31','2026-1-01','infinity',null])assert(!date(value),String(value));
 assert.deepEqual(['PIECE','SET','HOUR','METER'].map(unit),['Sản phẩm','Bộ','Giờ','Mét']);for(const bad of ['constructor','toString','__proto__','GROUP',null])assert.equal(unit(bad),'Đơn vị không hợp lệ');
});
await check('X1 actual XLSX exact prices/types, four units, dates, note, row order and XML',async()=>{
 const values=['0.01','12500.25','9999999999999999.94','9999999999999999.95','9999999999999999.96','9999999999999999.97','9999999999999999.98','9999999999999999.99','999999999999999','1000000000000000','12500.00'];
 const dates=['0001-01-01','0099-12-31','1900-02-28','2000-02-29','9999-12-31'];
 const data=values.map((value,i)=>row(value,{productCode:'000'+i,unit:['PIECE','SET','HOUR','METER'][i%4],effectiveFrom:dates[i%dates.length]}));
 const {bytes,sheet,zip}=await reload(workbook(data));await writeFile(path.join(stage,'exact-roundtrip.xlsx'),bytes);
 assert.equal(sheet.rowCount,data.length+1);assert.equal(sheet.columnCount,9);assert.equal(sheet.getCell('B1').value,'Mã công Excel');assert.equal(sheet.views[0].xSplit,2);assert.equal(sheet.views[0].ySplit,1);assert.equal(sheet.autoFilter,'A1:I12');assert.match(JSON.stringify(sheet.getCell('D1').note),/phần lẻ/);
 data.forEach((item,i)=>{const r=sheet.getRow(i+2),price=parse(item.rate),numeric=price.fraction==='00'&&price.whole.length<=15;assert.equal(r.getCell(2).value,item.productCode);assert.equal(r.getCell(4).value,numeric?Number(price.whole):price.canonical);assert.equal(typeof r.getCell(4).value,numeric?'number':'string');if(!numeric)assert.equal(r.getCell(4).numFmt,'@');assert.equal(r.getCell(5).value,unit(item.unit));assert.equal(r.getCell(6).value,item.effectiveFrom);assert.equal(r.getCell(7).value,'Không giới hạn');});
 for(const file of Object.values(zip.files).filter(f=>f.name.endsWith('.xml')))assert(!/<(?:\w+:)?f(?:\s|>)/.test(await file.async('string')),file.name);
});
await check('X2 literal formula-like text and XML escaping survives bytes unchanged',async()=>{
 const literals=['=HYPERLINK("https://invalid.example","x")','+SUM(1,2)','-2+3','@SUM(A1)','\'0001','000001','\tMã công','Mã & < > " 😀','İ ΟΣ'];
 const data=literals.map(text=>row('1.00',{productCode:text,productName:text,source:text,status:text,effectiveFrom:'0001-01-01',effectiveTo:'9999-12-31'}));const{sheet,zip}=await reload(workbook(data));
 data.forEach((item,i)=>{for(const col of [2,3,8,9])assert.equal(sheet.getRow(i+2).getCell(col).value,item.productCode);assert.equal(sheet.getRow(i+2).getCell(7).value,'9999-12-31');});
 const xml=await zip.file('xl/worksheets/sheet1.xml').async('string');assert(!/<f(?:\s|>)/.test(xml));
 for(const text of ['\u0000','\u0001','\u000b','\ud800','\udfff','\ufffe','\uffff']){assert.throws(()=>literal(text,'Mã'),/ký tự/);assert.throws(()=>workbook([row('1',{productCode:text})]),/ký tự/);}
});
await check('X3 invalid included row blocks entire export with actionable row/code error',()=>{
 assert.throws(()=>workbook([]),/Không có/);
 for(const value of [undefined,NaN,0,'0','1e2','1.001','10000000000000000'])assert.throws(()=>workbook([row(),row('1',{productCode:'BAD',rate:value})]),/Dòng 2 \(BAD\).*đơn giá/);
 for(const extra of [{effectiveFrom:'1900-02-29'},{effectiveFrom:'0000-01-01'},{effectiveTo:'2025-12-31'},...['constructor','toString','__proto__','UNKNOWN'].map(unit=>({unit}))])assert.throws(()=>workbook([row('1',extra)]),/không hợp lệ/);
 assert.equal(workbook([row(12500)]).worksheets[0].getCell('D2').value,12500);
});
await check('X4 unchanged actual download API captures XLSX and direct-click fallback',async()=>{
 globalThis.__rateDownloads=[];globalThis.HTMLAnchorElement=class{};HTMLAnchorElement.prototype.download='';
 const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 try{Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Chrome'}});const prepared=await download([row()],'2026-10-29');assert(prepared.autoDownloadStarted);assert.equal(__rateDownloads.length,1);assert.equal(prepared.filename,'bang-gia-cong-may-2026-10-29.xlsx');const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await __rateDownloads[0].blob.arrayBuffer());assert.equal(loaded.worksheets[0].getCell('D2').value,'12500.25');prepared.download();assert.equal(__rateDownloads.length,2);
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Macintosh AppleWebKit'}});const fallback=await download([row('0.01')]);assert.equal(fallback.autoDownloadStarted,false);assert.equal(__rateDownloads.length,2);fallback.download();assert.equal(__rateDownloads.length,3);
 }finally{delete globalThis.HTMLAnchorElement;if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;}
});
const page=await readFile('src/pages/PayrollSettingsPage.tsx','utf8'),ast=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),tab=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ProductRatesTab'),vars=new Map(tab.body.statements.filter(ts.isVariableStatement).flatMap(s=>s.declarationList.declarations.map(d=>[d.name.getText(),d])));
function execute(names,context,returnNames=names){const code=names.map(name=>'const '+vars.get(name).getText(ast)+';').join('\n')+'\nreturn {'+returnNames.join(',')+'};';const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;return new Function(...Object.keys(context),js)(...Object.values(context));}
await check('U1 actual filter/sort closure exports exact visible rowset and excludes invalid filtered rows',()=>{
 const rates=[{id:'bad',piece_rate_code:'BAD',rate_exact:'NaN',rate:0,status:'DRAFT',source_reference:null,effective_from:'2026-01-01'},{id:'a',piece_rate_code:'A',rate_exact:'9999999999999999.99',rate:1,status:'APPROVED',source_reference:'excel:test',effective_from:'2026-01-01'},{id:'b',piece_rate_code:'B',rate_exact:'9999999999999999.98',rate:1,status:'APPROVED',source_reference:'excel:test',effective_from:'2026-01-01'}];
 const {visibleRates}=execute(['visibleRates'],{useMemo:fn=>fn(),rates,search:'',statusFilter:'APPROVED',sourceFilter:'EXCEL',sourceKind:s=>s?.startsWith('excel:')?'EXCEL':'MANUAL',sortBy:'rate',sortDirection:'asc',productById:new Map(),isLocalBackend:()=>true,compareExactProductPrices:compare});assert.deepEqual(visibleRates.map(r=>r.id),['b','a']);assert.doesNotThrow(()=>workbook(visibleRates.map(r=>row(r.rate_exact,{productCode:r.piece_rate_code}))));
});
await check('U2 actual export closure in-flight guard, immutable captured rowset and missing exact fail closed',async()=>{
 let release,called=0,captured,prepared;const wait=new Promise(r=>release=r),visibleRates=[{piece_rate_code:'CAPTURED',piece_rate_name:'Name',rate_exact:'0.01',rate:999,unit:'PIECE',effective_from:'2026-01-01',effective_to:null,source_reference:null,status:'DRAFT'}],ref={current:false};
 const {exportExcel}=execute(['exportExcel'],{exportInFlight:ref,visibleRates,setExporting:()=>{},setExportError:()=>{},setPreparedExport:v=>prepared=v,isLocalBackend:()=>true,productSku:()=>'',productName:()=>'',today:()=> '2026-10-29',toast:{success:()=>{},error:()=>{}},errorMessage:e=>e.message,require:()=>({exportPayrollRatesExcel:async rows=>{called++;captured=rows;await wait;workbook(rows);return{filename:'captured.xlsx',autoDownloadStarted:false,download:()=>{}};}})});
 const pending=exportExcel();await Promise.resolve();await exportExcel();visibleRates[0].piece_rate_code='CHANGED';release();await pending;assert.equal(called,1);assert.equal(captured[0].productCode,'CAPTURED');assert.equal(captured[0].rate,'0.01');assert.equal(prepared.rowCount,1);assert.equal(ref.current,false);
 let message=null,invalidPrepared='previous';const invalidRows=[{...visibleRates[0],rate_exact:undefined,rate:999}];
 const invalid=execute(['exportExcel'],{exportInFlight:ref,visibleRates:invalidRows,setExporting:()=>{},setExportError:value=>message=value,setPreparedExport:value=>invalidPrepared=value,isLocalBackend:()=>true,productSku:()=>'',productName:()=>'',today:()=> '2026-10-29',toast:{success:()=>{throw Error('Unexpected success');},error:()=>{}},errorMessage:e=>e.message,require:()=>({exportPayrollRatesExcel:async rows=>{workbook(rows);throw Error('Unexpected valid export');}})});
 await invalid.exportExcel();assert.match(message,/đơn giá không hợp lệ/);assert.equal(invalidPrepared,null);assert.equal(ref.current,false);
});
await check('U3 compiled focus callbacks: identity, newer focus, hidden ancestors and verified fallback',()=>{
 function setup(){
  const body={name:'BODY'},document={body,activeElement:body,querySelector:()=>null,querySelectorAll:()=>[]},frames=[],localInvoker={current:{element:null}},localFocusRequest={current:null},localDialogs={current:{form:false,action:false,details:false}},localSearchRef={current:null};
  const element=(name,extra={})=>({name,isConnected:true,disabled:false,dataset:{},getClientRects(){return this.hidden?[]:[{}];},matches(){return this.disabled;},closest(){return this.hiddenAncestor?{}:null;},contains(other){return other?.parent===this;},scrollIntoView(){this.scrolled=true;},focus(){if(!this.refuseFocus)document.activeElement=this;},...extra});
  const callbacks=execute(['rememberLocalInvoker','beginLocalFocus','restoreLocalFocus','closeLocalFocus'],{document,localInvoker,localFocusRequest,localDialogs,localSearchRef,requestAnimationFrame:fn=>frames.push(fn),getComputedStyle:el=>({display:el.display||'block',visibility:el.visibility||'visible'})});
  const search=element('search');localSearchRef.current=search;return{...callbacks,document,frames,element,localInvoker,localFocusRequest,localDialogs,localSearchRef,search,flush(){for(const fn of frames.splice(0))fn();}};
 }
 for(const kind of ['form','action','details']){const s=setup(),original=s.element('original-'+kind),dialog=s.element('dialog'),input=s.element('closing-input',{parent:dialog});s.rememberLocalInvoker(original,{id:'R',piece_rate_code:'CODE'});s.beginLocalFocus(kind);s.document.activeElement=input;let prevented=false;s.closeLocalFocus(kind,{target:dialog,preventDefault(){prevented=true;}});assert(prevented);s.flush();assert.equal(s.document.activeElement,original);assert(original.scrolled);}
 {const s=setup(),original=s.element('old'),other=s.element('new-user-control');s.rememberLocalInvoker(original);s.beginLocalFocus('form');s.closeLocalFocus('form',{preventDefault(){}});s.document.activeElement=other;s.flush();assert.equal(s.document.activeElement,other,'first queued callback respects newer user focus');}
 {const s=setup(),old=s.element('old'),newer=s.element('new');s.rememberLocalInvoker(old);s.beginLocalFocus('details');s.closeLocalFocus('details',{preventDefault(){}});s.rememberLocalInvoker(newer);s.beginLocalFocus('form');s.flush();assert.equal(s.document.activeElement,s.document.body,'stale frame must not consume newer request even at BODY');assert.equal(s.localFocusRequest.current.restored,false);}
 {const s=setup(),old=s.element('disconnected',{isConnected:false}),hidden=s.element('hidden-desktop',{hidden:true,dataset:{localRateAction:'R'}}),replacement=s.element('visible-mobile',{dataset:{localRateAction:'R',localRateCode:'CODE'}});s.rememberLocalInvoker(old,{id:'R',piece_rate_code:'CODE'});s.beginLocalFocus('form');s.document.querySelectorAll=()=>[hidden,replacement];s.restoreLocalFocus();assert.equal(s.document.activeElement,replacement);replacement.isConnected=false;s.document.activeElement=s.document.body;const byCode=s.element('new-id',{dataset:{localRateAction:'R2',localRateCode:'CODE'}});s.document.querySelectorAll=()=>[hidden,byCode];s.restoreLocalFocus();assert.equal(s.document.activeElement,byCode);}
 for(const bad of [{visibility:'hidden'},{visibility:'collapse'},{display:'none'},{hiddenAncestor:'hidden'},{hiddenAncestor:'inert'},{hiddenAncestor:'aria-hidden'},{refuseFocus:true},{disabled:true},{focus(){throw Error('not focusable');}}]){const s=setup(),target=s.element('unusable',bad);s.rememberLocalInvoker(target);s.beginLocalFocus('action');s.restoreLocalFocus();assert.equal(s.document.activeElement,s.search,JSON.stringify(bad));assert.equal(s.localFocusRequest.current.lastTarget,s.search);}
 {const s=setup();s.beginLocalFocus('details');s.restoreLocalFocus();assert.equal(s.document.activeElement,s.search);const moved=s.element('manually-moved');s.document.activeElement=moved;s.restoreLocalFocus();assert.equal(s.document.activeElement,moved);}
 {const s=setup(),target=s.element('target');s.rememberLocalInvoker(target);s.beginLocalFocus('form');s.localDialogs.current.details=true;s.restoreLocalFocus();assert.equal(s.document.activeElement,s.document.body);s.localDialogs.current.details=false;s.closeLocalFocus('action',{preventDefault(){}});assert.equal(s.frames.length,0);s.closeLocalFocus('form',{preventDefault(){}});s.document.querySelector=()=>({role:'another-dialog'});s.flush();assert.equal(s.document.activeElement,s.document.body);}
 {const s=setup(),bad=s.element('refuses',{refuseFocus:true});s.localSearchRef.current=s.element('also-refuses',{refuseFocus:true});s.rememberLocalInvoker(bad);s.beginLocalFocus('form');s.restoreLocalFocus();assert.equal(s.localFocusRequest.current.restored,false);assert.equal(s.document.activeElement,s.document.body,'failed focus must not claim restored');}
});
await writeFile(path.join(stage,'proof.json'),JSON.stringify({scope:'5S.3 own pure/actual XLSX/download/compiled UI closures; GUI and real DB not exercised',results},null,2)+'\n');
for(const r of results)console.log(r.status+' '+r.name+(r.error?'\n'+r.error:''));if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
