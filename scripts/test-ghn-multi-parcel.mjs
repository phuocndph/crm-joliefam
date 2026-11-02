// Synthetic-only contract and actual-handler regression checks. No env, DB or provider.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { buildGhnQuoteSnapshot, buildGhnCreateParcelItemName, buildGhnPackedContent, eligibleGhnServices, createGhnQuoteSession, compareGhnShopQuotes, findGhnAutomaticCheapest, StaleGhnQuoteError } from '../src/lib/ghn-quote-comparison.ts';
import { ghnPackedParcelItemName, ghnMultiParcelEvidenceMatches, validateGhnPackedParcel } from '../server/ghn-orders.ts';

const source=await readFile(new URL('../src/components/LocalCreateGHNOrderDialog.tsx',import.meta.url),'utf8');
const parsed=ts.createSourceFile('dialog.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),initializers=new Map();
const visit=node=>{if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer)initializers.set(node.name.text,node.initializer.getText(parsed));ts.forEachChild(node,visit);};visit(parsed);
const evaluate=(code,context)=>vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
const products=[{name:'TEST sheets',quantity:12},{name:'TEST pillows',quantity:50}];
const packed=(weight=1000,dimensions={length:40,width:30,height:20})=>({weight,...dimensions});
const input=(parcels,patch={})=>({provinceId:'202',districtId:'1444',wardCode:'020308',address:'Synthetic test address',cod:100000,insurance:100000,codFailed:2000,items:products,parcels,...patch});
const make=(parcels,patch)=>{const result=buildGhnQuoteSnapshot(input(parcels,patch));assert.ok(result.snapshot,result.error);return result.snapshot;};
let groups=0;const check=async(name,run)=>{await run();groups++;console.log('PASS GHN multi parcel: '+name);};
const previousFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Network forbidden in multi-parcel tests');};
try{
await check('single-parcel compatibility includes weight-only preliminary quotes',()=>{
  for(const parcel of [packed(1000),packed(20000),{weight:20000}]){
    const a=make([parcel]),b=buildGhnQuoteSnapshot({...input(undefined),parcel}).snapshot;
    assert.deepEqual(a,b);
  }
});
await check('multi measurements never manufacture a root box or multiply product quantities',()=>{
  const value=make([packed(1000),packed(2000,{length:10,width:15,height:25})]);
  assert.equal(value.kind,'final');assert.equal(value.feeData.weight,3000);assert.equal(value.feeData.items.length,2);
  assert.equal(value.feeData.cod_value,100000);assert.equal(value.feeData.insurance_value,100000);assert.equal(value.feeData.cod_failed_amount,2000);
  for(const field of ['length','width','height'])assert.equal(Object.hasOwn(value.feeData,field),false);
  assert.deepEqual(value.feeData.items.map(row=>row.quantity),[1,1]);
  assert.equal(make([packed(1000),packed(2000,{length:10,width:15,height:25})],{items:[{name:'renamed',quantity:999}]}).key,value.key);
});
await check('count, each physical field, and distribution form the price identity',()=>{
  const original=make([packed(20000),packed(20000)]);
  assert.notEqual(make([packed(1000),packed(39000)]).key,original.key);
  for(const field of ['weight','length','width','height']){const parcels=[packed(20000),packed(20000)];parcels[1][field]++;assert.notEqual(make(parcels).key,original.key);}
  assert.notEqual(make([packed(40000)]).key,original.key);
});
await check('multi preserves totals above 50kg with each physical bound and the 100-parcel cap',()=>{
  for(const field of ['weight','length','width','height'])for(const value of [undefined,0,-1,0.5,NaN,Infinity,field==='weight'?50001:201]){
    const parcels=[packed(1000),{...packed(1000),[field]:value}];assert.equal(buildGhnQuoteSnapshot(input(parcels)).snapshot,null);
  }
  assert.equal(make([packed(25000),packed(25000)]).feeData.weight,50000);
  assert.equal(make([packed(30000),packed(30000)]).feeData.weight,60000);
  assert.equal(make([packed(40000),packed(40000),packed(40000)]).feeData.weight,120000);
  assert.equal(make(Array.from({length:100},()=>packed(50000))).feeData.weight,5000000);
  for(const parcels of [[],[packed(50001),packed(1)],Array.from({length:101},()=>packed(1))])assert.equal(buildGhnQuoteSnapshot(input(parcels)).snapshot,null);
  assert.equal(make(Array.from({length:100},()=>packed(1))).feeData.items.length,100);
});
await check('multi always selects available service5 including less than20kg',()=>{
  const services=[2,5].map(service_type_id=>({service_id:service_type_id,service_type_id,short_name:'Synthetic'}));
  for(const weight of [2,3000,19999,20000,50000,60000,100000])assert.deepEqual(eligibleGhnServices(services,weight,2).map(row=>row.service_type_id),[5]);
  assert.deepEqual(eligibleGhnServices(services,19999,1).map(row=>row.service_type_id),[2]);
  assert.deepEqual(eligibleGhnServices(services,1,101),[]);
  for(const weight of [1,100001,Number.MAX_SAFE_INTEGER,NaN,Infinity,1.5])assert.deepEqual(eligibleGhnServices(services,weight,2),[]);
  assert.deepEqual(eligibleGhnServices(services,60000),[],'unmanifested single parcel retains its bound');
  assert.deepEqual(eligibleGhnServices(services,5000000,100).map(row=>row.service_type_id),[5]);
});
await check('all-shop comparison prices every parcel and preserves provider totals',async()=>{
  const calls=[],session=createGhnQuoteSession(async(action,body)=>{
    if(action==='get_services')return [2,5].map(service_type_id=>({service_id:service_type_id,service_type_id,short_name:'Synthetic'}));
    calls.push(body);assert.equal(body.feeData.service_type_id,5);
    return {total:body.feeData.items.reduce((sum,row)=>sum+row.weight,0)*4+(body.shopId==='456'?5000:0)};
  });
  const snapshot=make([packed(1000),packed(2000)]),comparison=await compareGhnShopQuotes(session,[123,456].map(_id=>({_id,name:'Synthetic',address:'Synthetic',district_id:1})),snapshot);
  assert.equal(calls.length,2);assert.equal(findGhnAutomaticCheapest(comparison,snapshot.key).total,12000);
  assert.equal(calls[0].feeData.items.length,2);
});
await check('late one-parcel quote cannot overwrite a changed multi-parcel quote',async()=>{
  const pending=[];const session=createGhnQuoteSession(async()=>new Promise(resolve=>pending.push(resolve)));
  const service={service_id:5,service_type_id:5,short_name:'Synthetic'};
  const one=make([packed(20000)]),multi=make([packed(20000),packed(1000)]);
  const old=session.quote('123',service,one),rejected=assert.rejects(old,StaleGhnQuoteError);session.invalidate();
  const current=session.quote('123',service,multi);pending[1]({total:84000});assert.equal(await current,84000);
  pending[0]({total:80000});await rejected;assert.equal(session.peekQuote('123',service,one),undefined);
});
await check('frontend/server create labels agree without multiplying goods descriptions',()=>{
  for(const rows of [products,[{name:'x'.repeat(190)+'😀',quantity:20}]])for(let index=0;index<3;index++){
    const label=buildGhnCreateParcelItemName(rows,index,3);assert.equal(label,ghnPackedParcelItemName(buildGhnPackedContent(rows),index,3));assert.ok(label.length<=200);
    if(index>0)assert.ok(!label.includes(rows[0].name));
  }
});
await check('UNKNOWN evidence rejects missing, multiplied, redistributed or malformed parcels',()=>{
  const snapshot=make([packed(1000),packed(2000)]),content=buildGhnPackedContent(products);
  const submitted={...snapshot.feeData,content,service_type_id:5,items:snapshot.feeData.items.map((row,index)=>({...row,name:buildGhnCreateParcelItemName(products,index,2),price:0}))};
  validateGhnPackedParcel(submitted);assert.equal(ghnMultiParcelEvidenceMatches(submitted,[...submitted.items].reverse()),true);
  for(const value of [undefined,[],[submitted.items[0]],submitted.items.map((row,index)=>({...row,weight:row.weight+(index===0?1:-1)})),submitted.items.map(row=>({...row,quantity:2})),submitted.items.map(row=>({...row,weight:String(row.weight)}))])assert.equal(ghnMultiParcelEvidenceMatches(submitted,value),false);
});
await check('actual parcel handlers add, copy and remove independently and retain stable keys',()=>{
  let sequence=0;const context=vm.createContext({crypto:{randomUUID:()=>`test-parcel-${++sequence}`},locked:false,parcels:[],requestAnimationFrame:()=>{},dialogContent:{current:null}});
  context.setParcels=update=>context.parcels=typeof update==='function'?update(context.parcels):update;
  context.setWeightFollowsProducts=()=>{};context.setMultiEditorOpen=()=>{};Object.defineProperty(context,'effectiveParcels',{get:()=>context.parcels});
  for(const name of ['blankParcel','parcelInputId','changeParcel','addParcel','removeParcel'])evaluate(`globalThis.${name}=${initializers.get(name)}`,context);
  context.parcels=[context.blankParcel()];const first=context.parcels[0].id;
  context.changeParcel(first,{weightInput:'1.000',weight:1000,length:40,width:30,height:20});context.addParcel(context.parcels[0]);
  assert.equal(context.parcels.length,2);assert.equal(context.parcels[0].id,first);assert.notEqual(context.parcels[1].id,first);assert.equal(context.parcels[1].weightInput,'1.000');
  const second=context.parcels[1].id;context.changeParcel(second,{weight:2000,weightInput:'2.000'});assert.equal(context.parcels[0].weight,1000);
  context.removeParcel(first);assert.equal(context.parcels.length,1);assert.equal(context.parcels[0].id,second);context.removeParcel(second);assert.equal(context.parcels.length,1);
  context.locked=true;context.addParcel();assert.equal(context.parcels.length,1);
});
console.log('GHN_MULTI_PARCEL_PASS '+JSON.stringify({groups,network:'forbidden',database:'none',realGhnVerified:false}));
}finally{globalThis.fetch=previousFetch;}
