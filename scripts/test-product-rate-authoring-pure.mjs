import assert from 'node:assert/strict';
import {readFile}from'node:fs/promises';
import {tsImport}from'tsx/esm/api';
import ts from'typescript';
import vm from'node:vm';
const core=await tsImport('../server/product-rate-authoring.ts',import.meta.url),{moduleRequirement}=await tsImport('../server/module-permissions.ts',import.meta.url);
const {preservePayrollApprovalHistory}=await tsImport('../server/payroll-approval-history.ts',import.meta.url);
const id='11111111-1111-4111-8111-111111111111',basis='a'.repeat(64),body={product_id:null,piece_rate_code:' MÃ-CÔNG ',piece_rate_name:' Công việc ',rate:'12500.25',unit:'PIECE',effective_from:'2026-01-01',effective_to:null,source_reference:null,reason:'Kiểm thử',idempotency_key:'test-key-0001'};
const parse=(value=body,action='CREATE')=>core.parseProductRateAction(action,value,id);let groups=0;
const check=(name,fn)=>{fn();groups++;console.log('PASS '+name);};
check('W01 closed bodies, every text NUL/surrogate and exact rate grammar',()=>{
 assert.equal(parse().draft.rate,'12500.25');assert.equal(parse({...body,rate:'00001.2'}).draft.rate,'1.20');assert.equal(parse({...body,rate:'9999999999999999.99'}).draft.rate,'9999999999999999.99');
 for(const rate of [1,0,null,'0','0.00','-1','+1',' 1','1 ','1e2','1,00','1.001','NaN','Infinity','10000000000000000'])assert.throws(()=>parse({...body,rate}));
 for(const extra of ['id','actor','status','currency','sku','group','conversion'])assert.throws(()=>parse({...body,[extra]:'forged'}));for(const value of [null,[],[body],1,'body'])assert.throws(()=>parse(value));
 for(const field of Object.keys(body))for(const bad of ['\u0000','x\u0000x','\ud800','\udc00','x\ud800y'])assert.throws(()=>parse({...body,[field]:bad}),field);
 assert.equal(core.productRateText('😀','Text'),'😀');assert.throws(()=>parse({...body,piece_rate_code:'İ'.repeat(120)}));
 for(const unit of ['PIECE','SET','HOUR','METER'])assert.equal(parse({...body,unit}).draft.unit,unit);for(const unit of ['piece','GROUP',''])assert.throws(()=>parse({...body,unit}));
});
check('W01 calendar, ranges, ids, reason and raw request hashing',()=>{
 for(const date of ['0001-01-01','2000-02-29','2024-02-29','9999-12-31'])assert.equal(parse({...body,effective_from:date}).draft.effective_from,date);
 for(const date of ['0000-01-01','1900-02-29','2026-02-29','2026-02-30','10000-01-01'])assert.throws(()=>parse({...body,effective_from:date}));assert.throws(()=>parse({...body,effective_to:'2025-12-31'}));
 for(const value of ['', 'x','  x'])assert.throws(()=>parse({...body,reason:value}));assert.throws(()=>parse({...body,product_id:'bad'}));assert.throws(()=>parse({...body,expected_basis:basis}));
 const a=parse(),b=parse({...body,rate:'12500.2'}),c=parse({...body,rate:'12500.20'});
 assert.notEqual(core.productRateRequestHash(id,b),core.productRateRequestHash(id,c));assert.equal(core.productRateRequestHash(id,a),core.productRateRequestHash(id,parse(Object.fromEntries(Object.entries(body).reverse()))));
 assert.notEqual(core.productRateRequestHash(id,a),core.productRateRequestHash('other',a));assert.equal(a.recordId,null);
});
check('W03 strict invalid DTOs fail before connect',()=>{
 const handlers={},app={get:(path,fn)=>handlers['GET '+path]=fn,post:(path,fn)=>handlers['POST '+path]=fn,patch:(path,fn)=>handlers['PATCH '+path]=fn};let connects=0;
 core.registerProductRateAuthoring(app,{pool:{connect:()=>{connects++;throw Error('Must not connect');}},actor:()=>id,role:()=> 'admin',lockShared:async()=>{},sendError:(_res,error)=>assert.equal(error.status,400)});
 for(const bad of ['\u0000','\ud800'])handlers['POST /api/payroll/product-rates']({body:{...body,piece_rate_code:bad},params:{}},{});
 assert.equal(connects,0);
});
check('W05 full approved-set basis, deterministic order, exact values and timestamps',()=>{
 const row={id,product_id:null,piece_rate_code:' MÃ '.normalize('NFD'),piece_rate_name:'Work',rate_exact:'9999999999999999.99',unit:'PIECE',effective_from:'0001-01-01',effective_to:null,status:'DRAFT',reason:'Test',source_reference:null,source_row:null,continued_from_id:null,created_at:'2026-01-01T00:00:00.123456Z',updated_at:'2026-01-01T00:00:00.123456Z'};
 const approved={...row,id:'22222222-2222-4222-8222-222222222222',status:'APPROVED'},next={...approved,id:'33333333-3333-4333-8333-333333333333',effective_from:'2027-01-01'};
 const base=core.productRateBasis(row,[approved,next]);assert.equal(base,core.productRateBasis(row,[next,approved]));assert.match(base,/^[0-9a-f]{64}$/);
 for(const [key,value]of Object.entries({product_id:id,rate_exact:'9999999999999999.98',piece_rate_name:'Changed',unit:'HOUR',effective_from:'2025-01-01',effective_to:'2028-01-01',source_reference:'New',status:'RETIRED',updated_at:'2026-01-01T00:00:00.123457Z'}))assert.notEqual(base,core.productRateBasis(row,[{...approved,[key]:value},next]),key);
 assert.notEqual(base,core.productRateBasis({...row,reason:'New'},[approved,next]));assert.notEqual(base,core.productRateBasis(row,[approved]));
});
check('W09 receipt aliases denied for read/write including whitespace and encoding',()=>{
 let count=0;for(const adapter of ['table','snapshot','rpc','functions'])for(const action of ['','local_','list_','get_','create_','update_','save_','set_','upsert_','delete_','approve_','discard_','retire_','resolve_','count_','search_','export_','preview_','history_'])for(const method of ['GET','HEAD','POST','PATCH','DELETE'])for(const transform of [s=>s,s=>' '+s+' ',s=>encodeURIComponent(s.toUpperCase())]){const alias=transform(action+'product_rate_action_receipts');assert.equal(moduleRequirement(method,'/api/local-'+adapter+'/'+alias,{}),false);count++;}console.log('Receipt alias cases '+count);
});
const page=await readFile('src/pages/PayrollSettingsPage.tsx','utf8'),beforePage=await readFile('.local-staging-runtime/item5s2-baseline/before/src/pages/PayrollSettingsPage.tsx','utf8');
const master=await readFile('src/lib/payroll-master-data.ts','utf8'),beforeMaster=await readFile('.local-staging-runtime/item5s2-baseline/before/src/lib/payroll-master-data.ts','utf8');
const history=await readFile('server/payroll-approval-history.ts','utf8'),beforeHistory=await readFile('.local-staging-runtime/item5s2-baseline/before/server/payroll-approval-history.ts','utf8');
const index=await readFile('server/index.ts','utf8'),beforeIndex=await readFile('.local-staging-runtime/item5s2-baseline/before/server/index.ts','utf8');
check('W10 non-product history and every unrelated index statement preserved byte for byte',()=>{
 assert.equal(history.slice(history.indexOf('  if (!Object.hasOwn')),beforeHistory.slice(beforeHistory.indexOf('  if (!Object.hasOwn')));
 const statements=text=>ts.createSourceFile('index.ts',text,ts.ScriptTarget.Latest,true).statements.map(row=>row.getText());const current=new Set(statements(index));let excluded=0;
 for(const statement of statements(beforeIndex)){if(/^app\.(?:get|post|patch)\("\/api\/payroll\/product-rates(?:"|\/:id)/.test(statement)){excluded++;continue;}assert.ok(current.has(statement),'Unrelated statement changed: '+statement.slice(0,100));}assert.equal(excluded,5);
});
for(const rpc of ['create_product_piece_rate_draft','approve_product_piece_rate','update_product_piece_rate_draft','discard_product_piece_rate_draft']){const extract=text=>text.slice(text.indexOf('  const { data, error } = await supabase.rpc("'+rpc+'"'),text.indexOf('\n}',text.indexOf('  const { data, error } = await supabase.rpc("'+rpc+'"')));assert.equal(extract(master),extract(beforeMaster));}
check('W11 execute actual local form save/retry/action closures with captured basis',()=>{
 const source=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let actionText,mutationText;
 const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='localAction')actionText=node.initializer.getText(source);if(ts.isPropertyAssignment(node)&&node.name.getText(source)==='mutationFn'&&node.initializer.getText(source).includes('saveIntent.current'))mutationText=node.initializer.getText(source);ts.forEachChild(node,visit);};visit(source);assert.ok(actionText&&mutationText);
 const calls=[],context={isLocalBackend:()=>true,saveIntent:{current:null},crypto:{randomUUID:()=>String(calls.length)+'-'+Math.random()},createLocalProductPieceRateDraft:input=>{calls.push({action:'CREATE',input});return Promise.resolve(input);},updateLocalProductPieceRateDraft:(id,input)=>{calls.push({action:'UPDATE',id,input});return Promise.resolve(input);},approveLocalProductPieceRate:(id,input)=>{calls.push({action:'APPROVE',id,input});return Promise.resolve(input);},discardLocalProductPieceRateDraft:(id,input)=>{calls.push({action:'DISCARD',id,input});return Promise.resolve(input);}};
 const compile=text=>ts.transpileModule('('+text+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;const save=vm.runInNewContext(compile(mutationText),context),action=vm.runInNewContext(compile(actionText),context),value={product_id:'',piece_rate_code:'MAX',piece_rate_name:'Work',rate:'9999999999999999.99',unit:'METER',effective_from:'2026-01-01',effective_to:'',source_reference:'',reason:'Test'};
 save(value);save(value);assert.equal(calls[0].input.rate,value.rate);assert.equal(calls[0].input.idempotency_key,calls[1].input.idempotency_key);save({...value,rate:'0.01'});assert.notEqual(calls[1].input.idempotency_key,calls[2].input.idempotency_key);
 save({...value,id,expected_basis:basis});assert.equal(calls.at(-1).input.expected_basis,basis);assert.ok(!('id'in calls.at(-1).input));
 const run=action({id,basis},'APPROVE');run('Reason');run('Reason');assert.equal(calls.at(-1).input.idempotency_key,calls.at(-2).input.idempotency_key);assert.equal(calls.at(-1).input.expected_basis,basis);run('Changed reason');assert.notEqual(calls.at(-1).input.idempotency_key,calls.at(-2).input.idempotency_key);
 assert.ok(page.includes('isLocalBackend() ? localRateValue(rate) : {rate: String(rate.rate)'));assert.ok(page.includes('<SelectItem value="HOUR">'));assert.ok(page.includes('<SelectItem value="METER">'));assert.ok(beforePage.includes('rate: Number(value.rate)'));
});
for(const [field,value]of [['from_date','10000-01-01'],['from_date','0001-01-01 BC'],['from_date','infinity'],['from_date','-infinity'],['from_date','2026-02-30'],['from_date','1900-02-29'],['to_date','10000-01-01'],['to_date','0001-01-01 BC'],['to_date','infinity'],['to_date','-infinity'],['to_date','2026-02-30']]){
 const target={id,piece_rate_code:'DATE',piece_rate_name:'Synthetic work',rate_unit:'PIECE',product_id:null,from_date:'2026-01-01',to_date:null,exact_rate:'1.00'},approved={...target,id:'22222222-2222-4222-8222-222222222222',[field]:value};let queries=0;
 await assert.rejects(()=>preservePayrollApprovalHistory({query:async(sql)=>{queries++;if(queries===1)return{rows:[target]};if(queries===2)return{rows:[approved]};throw Error('Invalid legacy source reached a mutation: '+sql);}},'local_product_rates',id,id,'Date test'),error=>error.status===409,field+value);assert.equal(queries,2);
}
groups++;console.log('PASS W08 legacy calendar validation rejects year10000/BC/infinity/impossible dates before any mutation');
console.log(JSON.stringify({status:'PASS',groups}));
