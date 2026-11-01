// Synthetic tests against pure helpers and actual source handlers; no browser, .env, API or provider.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateQuote, canonicalQuote, assertSavedQuoteFinancials } from '../server/quote-calculation.ts';
import { approvalFinancialSnapshot } from '../server/quote-policy.ts';
import * as dates from '../src/lib/quote-dates.ts';
import { buildQuotePdfHtml, escapeQuoteHtml, safeQuoteImageUrl } from '../src/lib/quote-document.ts';
const { parseQuoteDate, resolveQuoteDates, formatQuoteDate, quoteCalendarDate, quoteCalendarDateIso, quoteDocumentTerms, quoteDateHeading } = dates;
const parse = async file => {
 const source = await readFile(new URL(file, import.meta.url),'utf8');
 const ast = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX), values=new Map(), effects=[], nodes=[];
 const visit=node=>{nodes.push(node);if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer)values.set(node.name.text,node.initializer.getText(ast));if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect')effects.push(node.arguments[0].getText(ast));ts.forEachChild(node,visit);};visit(ast);return{source,ast,values,effects,nodes};
};
const preview=await parse('../src/components/QuotePreviewDialog.tsx');
const list=await parse('../src/hooks/useInfiniteQuotes.ts');
const form=await parse('../src/components/CreateQuoteForm.tsx');
const page=await parse('../src/pages/QuotesPage.tsx');
const details=await parse('../src/components/EditQuoteDetailsDialog.tsx');
const compile=(name,body)=>ts.transpileModule(`globalThis.${name}=${body};`,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const plain=value=>JSON.parse(JSON.stringify(value));
let checks=0;const check=async(label,run)=>{await run();checks++;console.log('PASS quotes Phase 2: '+label);};
const base=canonicalQuote({items:[{name:'test line',quantity:2,price:100000,total:200000}],include_vat:true,vat_rate:8,quote_data:{payment1:50000,payment2:30000}});
await check('strict calendar validation, created_at authority and bounded missing/invalid expiry',()=>{
 for(const [input,expected]of [['29/02/2024','2024-02-29'],['2026-10-01','2026-10-01'],['2026-09-30T18:00:00Z','2026-10-01'],['2026-10-01T00:30:00+07:00','2026-10-01']])assert.equal(parseQuoteDate(input),expected);
 for(const input of [null,'','31/02/2026','29/02/2025','2026-04-31','2026-02-30T12:00:00Z','2026-01-01T24:00:00Z','2026-01-01T12:60:00Z','2026-01-01T12:00:60Z','10/27/2026','2026-10-01 trailing','2026-10-01T12:00:00','2026-10-01T12:00:00+25:00'])assert.equal(parseQuoteDate(input),null,String(input));
 assert.deepEqual(resolveQuoteDates({created_at:'2020-01-01T00:00:00Z',quote_data:{quoteDate:'2030-01-01'},notes:'Ngày hết hạn: 31/12/2020'}),{quoteDate:'2020-01-01',expiryDate:'2020-12-31'});
 assert.equal(resolveQuoteDates({quote_data:JSON.stringify({quoteDate:'2020-01-02'}),notes:''}).quoteDate,'2020-01-02');
 assert.equal(resolveQuoteDates({created_at:'invalid',quote_data:{quoteDate:'2030-01-01'}}).quoteDate,null,'invalid primary date is not hidden by fallback');
 for(const notes of ['', 'Ngày hết hạn: \nĐịa chỉ: 31/12/2040','Ngày hết hạn: 31/02/2026','Other: Ngày hết hạn: 31/12/2040'])assert.equal(resolveQuoteDates({notes,expiryDate:'2040-01-01'}).expiryDate,null,'notes alone is expiry authority');
 assert.equal(formatQuoteDate(null),'Chưa xác định');assert.equal(quoteCalendarDate(null),undefined);
});
await check('saved date results and chosen calendar writes remain stable across clocks and host timezones',()=>{
 const moduleUrl=new URL('../src/lib/quote-dates.ts',import.meta.url).href;
 const program=`import {resolveQuoteDates,formatQuoteDate,quoteCalendarDateIso} from ${JSON.stringify(moduleUrl)};const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...a){super(...(a.length?a:['2040-12-31T23:59:59Z']))}static now(){return 2240611199000}};console.log(JSON.stringify([resolveQuoteDates({created_at:'2020-12-31T18:00:00Z',notes:'Ngày hết hạn: 04/02/2021'}),resolveQuoteDates({created_at:'2020-01-01',notes:''}),formatQuoteDate('2020-12-31T18:00:00Z'),quoteCalendarDateIso(new Date(2026,9,1))]));`;
 const environment=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','PATHEXT'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
 let expected;
 for(const TZ of ['Asia/Ho_Chi_Minh','America/Los_Angeles','Pacific/Kiritimati']){const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',program],{cwd:new URL('..',import.meta.url),encoding:'utf8',env:{...environment,TZ}});assert.equal(result.status,0,result.stderr);const output=JSON.parse(result.stdout);if(expected)assert.deepEqual(output,expected,TZ);else expected=output;}
 assert.equal(expected[0].quoteDate,'2021-01-01');assert.equal(expected[1].expiryDate,null);assert.equal(expected[3],'2026-10-01T05:00:00.000Z');
});
await check('shared read/approval validator rejects audited, root, line and nested-item conflicts without mutation',()=>{
 const cases=[q=>q.items[0].total=1,q=>q.quote_data.total=1,q=>q.quote_data.remaining=1,q=>q.quote_data.includeVAT=false,q=>q.subtotal=1,q=>q.vat_amount=1,q=>q.total_amount=1,q=>q.quote_data.vatRate=10,q=>q.quote_data.items=[],q=>q.quote_data.items[0].quantity=3,q=>q.quote_data.items[0].price=1,q=>q.quote_data.items[0].total=1,q=>q.quote_data.items={},q=>q.quote_data.items='bad JSON'];
 for(const mutate of cases){const quote=structuredClone(base);mutate(quote);const before=structuredClone(quote);const calculated=calculateQuote({items:quote.items,includeVAT:quote.include_vat,vatRate:quote.vat_rate,payment1:quote.quote_data.payment1,payment2:quote.quote_data.payment2});assert.throws(()=>assertSavedQuoteFinancials(quote,calculated,quote.quote_data));assert.throws(()=>approvalFinancialSnapshot(quote),error=>error.status===409&&/sửa bản nháp|nhân bản/.test(error.message));assert.deepEqual(quote,before);}
 for(const [quantity,price,rate]of [[1.5,100.5,8],[2,100000,0],[1,100000,8.125]]){const quote=canonicalQuote({items:[{name:'fraction',quantity,price}],include_vat:true,vat_rate:rate});for(const row of [quote.items[0],quote.quote_data.items[0]])for(const key of ['quantity','price','total'])row[key]=Number(row[key]).toFixed(3);for(const key of ['subtotal','vatAmount','total','vatRate'])quote.quote_data[key]=String(quote.quote_data[key]);const before=structuredClone(quote);assert.doesNotThrow(()=>approvalFinancialSnapshot(quote));assert.deepEqual(quote,before);}
});
await check('remaining snapshots preserve signed exact decimals and old canonical binary representations',()=>{
 for(const [total,payment1,payment2,exact]of [[1,.7,.2,'0.1'],[1,1.2,.3,'-0.5'],[200000,50000.123456,30000.654321,'119999.222223'],[1,.1,.2,'0.7'],[1,.9,.1,'0']]){
  const quote=canonicalQuote({items:[{name:'test planned balance',quantity:1,price:total}],include_vat:false,vat_rate:0,quote_data:{payment1,payment2}});
  const original=quote.quote_data.remaining;
  for(const remaining of [original,String(original),exact,exact.includes('.')?exact+'000':exact+'.000']){
   const candidate=structuredClone(quote);candidate.quote_data.remaining=remaining;const before=structuredClone(candidate);assert.doesNotThrow(()=>approvalFinancialSnapshot(candidate),JSON.stringify({total,payment1,payment2,remaining}));assert.deepEqual(candidate,before);
  }
  for(const remaining of [1,null,{},'NaN','Infinity','bad','1e999999']){const candidate=structuredClone(quote);candidate.quote_data.remaining=remaining;assert.throws(()=>approvalFinancialSnapshot(candidate),error=>error.status===409);}
 }
});
await check('actual list formatter and legacy edit defaults preserve missing dates rather than manufacturing a future date',()=>{
 const context={...dates,Date};vm.createContext(context);vm.runInContext(compile('formatQuote',list.values.get('formatQuote')),context);
 const input={created_at:'2020-01-01T00:00:00Z',notes:'Khách hàng: test\nNgày hết hạn: \nĐịa chỉ: test'};
 const output=context.formatQuote(input);assert.equal(output.quoteDate,'2020-01-01');assert.equal(output.expiryDate,null);
 const dateProperties=form.nodes.filter(node=>ts.isPropertyAssignment(node)&&['quoteDate','expiryDate'].includes(node.name.getText(form.ast))&&node.initializer.getText(form.ast).includes('resolveQuoteDates'));
 assert.equal(dateProperties.length,4,'both useForm defaults and editing reset use the resolver');
 for(const property of dateProperties){const state={...dates,Date,initialData:input};vm.createContext(state);vm.runInContext(compile('value',property.initializer.getText(form.ast)),state);if(property.name.getText(form.ast)==='expiryDate')assert.equal(state.value,undefined);else assert.equal(state.value.getFullYear(),2020);}
 let selected;const state={...dates,quote:input,setCreatedDate:value=>selected=value,setStatus(){}};vm.createContext(state);vm.runInContext(compile('initialize',details.effects.find(effect=>effect.includes('setCreatedDate('))),state);state.initialize();assert.equal(selected.getFullYear(),2020);
});
await check('one saved expiry clause replaces generic template validity while preserving configured other terms',()=>{
 const terms=['Báo giá có hiệu lực trong vòng 30 ngày.','Đặt cọc 70% theo thỏa thuận.','Điều khoản riêng không đổi.'];
 const result=quoteDocumentTerms('15/02/2020',terms);assert.deepEqual(result,['Báo giá có hiệu lực đến ngày 15/02/2020.',...terms.slice(1)]);assert.deepEqual(terms,['Báo giá có hiệu lực trong vòng 30 ngày.','Đặt cọc 70% theo thỏa thuận.','Điều khoản riêng không đổi.']);
 assert.equal(quoteDocumentTerms(null,terms)[0],'Hiệu lực báo giá: Chưa xác định.');
 assert.deepEqual(quoteDocumentTerms(null,[null]),['Hiệu lực báo giá: Chưa xác định.']);assert.deepEqual(quoteDocumentTerms(null,['valid',42]),['Hiệu lực báo giá: Chưa xác định.','valid']);assert.ok(!result.some(term=>term.includes('30 ngày')));
});
await check('actual PDF and Excel export handlers use the same saved dates/terms in every document date cell',async()=>{
 for(const notes of ['Ngày hết hạn: 15/02/2020','','Ngày hết hạn: 31/02/2020']){
  const cells=new Map(), notifications=[];let html='',prints=0;
  const worksheet={getColumn:()=>({}),getRow:()=>({}),mergeCells(){},addImage(){},getCell(key){if(!cells.has(key))cells.set(key,{});return cells.get(key);}};
  class Workbook{addWorksheet(){return worksheet;}addImage(){return 1;}xlsx={writeBuffer:async()=>new Uint8Array()};}
  const popup={onload:null,document:{write:value=>html=value,close(){popup.onload?.();}},print:()=>prints++};
  const context={...dates,React,Date,Blob,console:{warn(){},error:console.error},quote:{...base,quote_number:'OLD-TEST',created_at:'2020-01-01T18:00:00Z',notes},quoteData:{quoteDate:'2030-01-01'},templateSettings:{companyName:'test',address:'test',phone:'test',logoUrl:'',quoteTitleColor:'#1976d2',companyTitleColor:'#d32f2f',taxCode:'test',headquarters:'test',bankInfo:'test',terms:['Báo giá có hiệu lực trong vòng 30 ngày.','Giữ điều khoản riêng.']},
   correctedItems:base.items,calculationError:'',quoteTitle:'BẢNG BÁO GIÁ',quoteNumber:'OLD-TEST',customerName:'test',phone:'',address:'',email:'',subtotal:base.subtotal,includeVAT:true,vatRate:8,vatAmount:16000,totalWithVat:216000,firstPayment:50000,payment2:30000,remaining:136000,
   buildQuotePdfHtml,escapeQuoteHtml,safeQuoteImageUrl,fetch:async()=>{throw new Error('No image/provider request allowed');},ExcelJS:{Workbook},toast:value=>notifications.push(value),setTimeout:callback=>callback(),
   document:{getElementById:()=>({}),createElement:()=>({click(){}})},window:{open:()=>popup,URL:{createObjectURL:()=>'/synthetic-blob',revokeObjectURL(){}}}};
  vm.createContext(context);
  for(const key of ['savedDates','quoteDate','expiryDate','dateHeading','documentTerms'])vm.runInContext(compile(key,preview.values.get(key)),context);
  vm.runInContext(compile('exportPdf',preview.values.get('handleExportPDF')),context);await context.exportPdf();
  const expectedExpiry=notes.includes('15/02')?'15/02/2020':'Chưa xác định';assert.ok(html.includes('02/01/2020'));assert.ok(html.includes(expectedExpiry));assert.ok(!html.includes('30 ngày'));assert.ok(html.includes('Giữ điều khoản riêng.'));assert.equal(prints,1);
  const termsJsx=preview.nodes.filter(node=>ts.isJsxElement(node)&&node.getText(preview.ast).includes('documentTerms.map')).sort((a,b)=>a.getWidth()-b.getWidth())[0];
  vm.runInContext(compile('previewTerms',termsJsx.getText(preview.ast)),context);
  const renderedTerms=renderToStaticMarkup(context.previewTerms);assert.ok(renderedTerms.includes(expectedExpiry));assert.ok(renderedTerms.includes('Giữ điều khoản riêng.'));assert.doesNotMatch(renderedTerms,/15 ngày|30 ngày/);
  const excelBody=preview.values.get('handleExportExcel').replace("await import('exceljs')",'globalThis.ExcelJS');assert.notEqual(excelBody,preview.values.get('handleExportExcel'),'actual Excel lazy import is replaced by an in-memory workbook boundary only');
  vm.runInContext(compile('exportExcel',excelBody),context);await context.exportExcel();
  const values=[...cells.values()].map(cell=>cell.value);assert.ok(values.includes('Hà Nội ngày 2 tháng 1 năm 2020'),JSON.stringify({values,notifications}));assert.ok(values.includes('Ngày báo giá: 02/01/2020'));assert.ok(values.includes('Ngày hết hạn: '+expectedExpiry));assert.ok(values.some(value=>typeof value==='string'&&value.includes(context.documentTerms[0])));assert.ok(!values.some(value=>typeof value==='string'&&/30 ngày|15 ngày|2025/.test(value)));assert.equal(notifications.filter(value=>value.variant==='destructive').length,0);
 }
});
await check('actual inline date editors save selected calendar day and replace only the bounded expiry line',async()=>{
 const calendars=page.nodes.filter(node=>ts.isJsxSelfClosingElement(node)&&node.tagName.getText(page.ast)==='CalendarComponent');
 const handlers=calendars.map(node=>node.attributes.properties.find(prop=>prop.name?.getText(page.ast)==='onSelect')?.initializer?.expression?.getText(page.ast)).filter(Boolean);
 const writes=[];const context={...dates,Date,quote:{id:'synthetic',notes:'Ngày hết hạn: \nĐịa chỉ: cần giữ'},isLocalBackend:()=>true,localApi:{updateQuote:async(id,body)=>writes.push(body)},queryClient:{invalidateQueries(){}},toast(){},format:date=>`${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`};vm.createContext(context);
 const selected=new Date(2026,9,1);
 for(const [index,body]of handlers.entries()){vm.runInContext(compile('save'+index,body),context);await context['save'+index](selected);}
 assert.ok(writes.some(body=>body.created_at==='2026-10-01T05:00:00.000Z'));assert.ok(writes.some(body=>body.notes==='Ngày hết hạn: 01/10/2026\nĐịa chỉ: cần giữ'));
});
console.log(`QUOTES PHASE 2 COMPLETE (${checks} groups; helpers + actual source handlers, synthetic only)`);
