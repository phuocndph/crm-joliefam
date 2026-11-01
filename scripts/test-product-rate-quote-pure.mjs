import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tsImport} from 'tsx/esm/api';
const {parseProductRateQuoteQuery:parse,assertProductRateQuoteAuthority:authority,inspectProductRate,registerProductRateQuote}=await tsImport(new URL('../server/product-rate-quote.ts',import.meta.url).href,import.meta.url);
const {moduleRequirement}=await tsImport(new URL('../server/module-permissions.ts',import.meta.url).href,import.meta.url);
const checks=[];
const check=async(name,work)=>{await work();checks.push(name);console.log('PASS '+name);};
const query=(extra={})=>new URLSearchParams({code:'Vgo',date:'2026-10-29',quantity:'3',...extra});
await check('P01 canonical NFC/case/space and quantity normalize without floating point',()=>{
 for(const code of ['  MÃ-CÔNG  ','mã-công','MÃ-CÔNG'.normalize('NFD')])assert.deepEqual(parse(query({code,quantity:'0003.1'})),{code_key:'mã-công',date:'2026-10-29',quantity:'3.10'});
 assert.equal(parse(query({quantity:'0.01'})).quantity,'0.01');assert.equal(parse(query({quantity:'9999999999.99'})).quantity,'9999999999.99');
});
await check('Q10 NUL code returns400 before pool connect and never becomes missing',async()=>{
 for(const code of ['\u0000','ABC\u0000DEF','\u0000ABC','ABC\u0000'])assert.throws(()=>parse(query({code})),error=>error.status===400&&error.message.includes('ký tự rỗng'));
 let handler,connections=0,errors=0;registerProductRateQuote({get:(_path,fn)=>{handler=fn;}},{pool:{connect:async()=>{connections++;throw Error('NUL must not connect');}},actor:()=> 'actor',role:()=> 'admin',sendError:(_res,error)=>{assert.equal(error.status,400);errors++;}});
 for(const code of ['\u0000','ABC\u0000DEF'])await handler({originalUrl:'/api/payroll/product-rates/quote?'+query({code})},{});assert.equal(connections,0);assert.equal(errors,2);
});
await check('P02 strict scalar keys reject unknown duplicate object array and missing',()=>{
 for(const params of [new URLSearchParams(),new URLSearchParams('code=x&date=2026-10-29'),new URLSearchParams('code=x&code=y&date=2026-10-29&quantity=1'),new URLSearchParams('code[x]=y&date=2026-10-29&quantity=1'),new URLSearchParams('code[]=x&date=2026-10-29&quantity=1')])assert.throws(()=>parse(params),error=>error.status===400);
 for(const field of ['sku','product_id','rateId','worker','group','conversion','factor','source_unit','group_key'])assert.throws(()=>parse(query({[field]:'anything'})),error=>error.status===400);
 for(const code of ['', '  ', 'a'.repeat(121)])assert.throws(()=>parse(query({code})),error=>error.status===400);
});
await check('P03 actual Gregorian day including leap years and bounds',()=>{
 for(const date of ['0001-01-01','0099-12-31','2000-02-29','2024-02-29','9999-12-31'])assert.equal(parse(query({date})).date,date);
 for(const date of ['0000-01-01','10000-01-01','1900-02-29','2026-02-29','2026-02-30','2026-04-31','2026-00-01','2026-13-01','2026-01-00','2026-1-01',' 2026-01-01'])assert.throws(()=>parse(query({date})),error=>error.status===400);
});
await check('P04 decimal grammar rejects signs exponent commas scale overflow and zero',()=>{
 for(const quantity of ['', '0','0.00','000.0','-1','+1','1e3','1E3','1,000','1,5','NaN','Infinity',' 1','1 ','1 0','1.001','.1','1.','10000000000','00000000001'])assert.throws(()=>parse(query({quantity})),error=>error.status===400);
});
await check('P05 current authority role-owned accountant read; employees/delegation never grant prices',async()=>{
 for(const role of ['admin','manager','accountant'])await authority({query:async()=>({rows:[{role,grants:[]}]})},'actor',role);
 for(const role of ['employee','team_leader','unknown'])await assert.rejects(authority({query:async()=>({rows:[{role,grants:['payroll_view','payroll_worker_manage','payroll_rate_view','payroll_rate_manage']}]})},'actor',role),error=>error.status===403);
 await assert.rejects(authority({query:async()=>({rows:[]})},'actor','admin'),error=>error.status===403);
 await assert.rejects(authority({query:async()=>({rows:[{role:'employee',grants:[]}]})},'actor','admin'),error=>error.status===403);
 await assert.rejects(authority({query:async()=>{throw new Error('Must not query without actor');}},'','admin'),error=>error.status===401);
});
await check('P06 single active batch and blocked projections never select arbitrary source or money',async()=>{
 const request=parse(query());
 for(const [row,expected] of [[{candidate_count:0},'MISSING_RATE'],[{candidate_count:2,unit_rate:'100'},'AMBIGUOUS_RATE'],[{candidate_count:1,piece_rate_name:' ',rate_unit:'PIECE'},'INVALID_RATE_SOURCE'],[{candidate_count:1,piece_rate_name:'Công',rate_unit:'piece'},'INVALID_RATE_SOURCE'],[{candidate_count:1,piece_rate_name:'Công',rate_unit:'PIECE',unit_rate:'NaN',amount:'NaN'},'INVALID_RATE_SOURCE'],[{candidate_count:1,piece_rate_name:'Công',rate_unit:'PIECE',unit_rate:'1.00',amount:'Infinity'},'INVALID_RATE_SOURCE'],[{candidate_count:1,piece_rate_name:'Công',rate_unit:'PIECE',unit_rate:'0.00',amount:'0.00'},'ZERO_RATE_UNSUPPORTED']]){
  const result=await inspectProductRate({query:async(sql,params)=>{assert.match(sql,/rate::text unit_rate/);assert.match(sql,/round\(\$2::numeric\(12,2\)\*rate,2\)::text/);assert.match(sql,/effective_from<=\$1::date/);assert.ok(!/limit|join|for update|lower|btrim|normalize/i.test(sql));assert.deepEqual(params,['2026-10-29','3.00']);return{rows:row.candidate_count===0?[]:Array.from({length:row.candidate_count},()=>({...row,piece_rate_code:'VGO'}))};}},request);
  assert.deepEqual(result.blockers,[expected]);for(const field of ['recorded_unit','selected_rate_id','effective_from','effective_to','unit_rate','line_amount'])assert.equal(result[field],null);
  assert.equal(result.pay_ready,false);assert.equal(result.operational_activation,'DISABLED');
 }
});
await check('P07 AVAILABLE contract remains config-only and carries exact strings',async()=>{
 const result=await inspectProductRate({query:async()=>({rows:[{piece_rate_code:'VGO',rate_id:'synthetic',piece_rate_name:'Công',rate_unit:'SET',unit_rate:'12500.25',amount:'37500.75',effective_from:'2026-01-01',effective_to:null}]})},parse(query()));
 assert.equal(result.status,'AVAILABLE');assert.equal(result.unit_rate,'12500.25');assert.equal(result.line_amount,'37500.75');assert.equal(result.quantity_basis,'RECORDED_UNIT');assert.equal(result.mapping_status,'NOT_ASSESSED');assert.equal(result.unit_confirmation,'NOT_ASSESSED');assert.equal(result.pay_ready,false);
 assert.deepEqual(Object.keys(result).sort(),['quote_schema_version','kind','status','code_key','date','quantity','recorded_unit','selected_rate_id','effective_from','effective_to','unit_rate','line_amount','candidate_count','blockers','quantity_basis','unit_confirmation','mapping_status','pay_ready','operational_activation'].sort());
});
await check('Q01-Q03 Unicode same-key inclusion, distinct-key exclusion and every matching duplicate counted',async()=>{
 const row=(code,id='id',extra={})=>({piece_rate_code:code,rate_id:id,piece_rate_name:'Công',rate_unit:'PIECE',unit_rate:'12500.25',amount:'37500.75',effective_from:'2026-01-01',effective_to:null,...extra});
 const inspect=(code,rows)=>inspectProductRate({query:async()=>({rows})},parse(query({code})));
 for(const [stored,requested,other]of [['İ','i\u0307','i'],['ΟΣ','Ος','Οσ']]){
  const result=await inspect(requested,[row(stored,'correct'),row(other,'wrong',{unit_rate:'NaN',amount:'NaN'})]);assert.equal(result.selected_rate_id,'correct');assert.equal(result.candidate_count,1);assert.equal(result.unit_rate,'12500.25');
  const distinct=await inspect(other,[row(stored,'wrong'),row(other,'distinct')]);assert.equal(distinct.selected_rate_id,'distinct');
  for(const conflict of [{},{unit_rate:'1.00'},{rate_unit:'SET'},{piece_rate_name:'Other'}]){const duplicate=await inspect(requested,[row(stored),row(requested,'second',conflict)]);assert.deepEqual(duplicate.blockers,['AMBIGUOUS_RATE']);assert.equal(duplicate.candidate_count,2);assert.equal(duplicate.line_amount,null);}
 }
 const absent=await inspect('missing',[row('İ'),row('ΟΣ')]);assert.deepEqual(absent.blockers,['MISSING_RATE']);
});
let aliases=0;
await check('P08 all canonical raw/action adapter aliases denied after decoding trimming and case normalization',()=>{
 for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE'])for(const surface of ['table','snapshot','rpc','functions'])for(const alias of ['product_rates','local_product_rates',...['list','get','create','update','save','set','upsert','delete','approve','discard','retire','resolve','count','search','export','preview','history'].flatMap(action=>[action+'_product_rates','local_'+action+'_product_rates',action+'_local_product_rates',action+'-local-product-rates'])])for(const wrapped of [alias,' '+alias+' ',alias.toUpperCase(),encodeURIComponent(' '+alias.toUpperCase()+' '),alias.replaceAll('_','%5f')]){assert.equal(moduleRequirement(method,`/api/local-${surface}/${wrapped}`),false,method+' '+surface+' '+wrapped);aliases++;}
 assert.equal(moduleRequirement('GET','/api/local-table/%xx'),false);
 for(const method of ['GET','POST'])assert.equal(moduleRequirement(method,'/api/local-table/product_piece_rate'),false);
 assert.equal(moduleRequirement('GET','/api/payroll/product-rates'),null);assert.equal(moduleRequirement('GET','/api/payroll/product-rates/quote'),null);assert.deepEqual(moduleRequirement('GET','/api/local-table/not_a_rate_alias'),[]);
});
await check('P09 only the two approved UI text literals changed',async()=>{
 for(const [file,from,to] of [['src/components/payroll/LaborCoverageSourceDetails.tsx','Chưa xác nhận nhóm giá hoặc điều kiện tính lương.','Chưa xác nhận đơn giá, đơn vị hoặc điều kiện tính lương.'],['src/components/payroll/LaborRequirementWorkbench.tsx','chưa đánh giá ánh xạ, nhóm giá, phân công hoặc khả năng tính lương.','chưa đánh giá ánh xạ, đơn giá hoặc khả năng tính lương.']])assert.equal(await readFile(file,'utf8'),(await readFile('.local-staging-runtime/item5s1-baseline/before/'+file,'utf8')).replace(from,to));
});
console.log(JSON.stringify({suite:'5S.1 pure',passed:checks.length,aliases_tested:aliases}));
