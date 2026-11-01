import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {buildGhnEditFee} from '../src/lib/ghn-edit-fee.ts';
import {ExternalReadAdapters} from '../server/external-read-adapters.ts';
const source=await readFile(new URL('../src/components/EditGHNOrderDialog.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('dialog.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler;
function walk(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='calculateFee')handler=n.initializer.getText(ast);ts.forEachChild(n,walk);}walk(ast);assert.ok(handler);
const code=ts.transpileModule('const calculate='+handler,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';calculate';
const services=[2,5].map(service_type_id=>({service_id:53320,service_type_id,short_name:'Synthetic'}));
const wire=[];
const config={token:'synthetic-only',primaryShop:'123',shops:['123'],configured:true,source:'saved',mode:'ENABLED',revision:1,hasSavedKey:true};
const adapter=new ExternalReadAdapters({},async(url,init)=>{const path=new URL(url).pathname;let data;
 if(path.endsWith('/v2/shop/all'))data={shops:[{_id:123,name:'Synthetic',district_id:1452,ward_code:'010101',status:1}],last_offset:0};
 else if(path.endsWith('/v2/shipping-order/fee')){wire.push(JSON.parse(init.body));data={total:12345};}
 else throw Error('Unexpected fake provider '+path);
 return new Response(JSON.stringify({code:200,data}),{status:200,headers:{'Content-Type':'application/json'}});
},async()=>config);
function harness(patch={}){const state={districtId:'1444',wardCode:'020308',provinceId:'202',toAddress:'Synthetic destination',serviceTypeId:'2',totalItemWeight:1500,effectiveDims:{length:40,width:30,height:20},codAmount:7000000,insuranceValue:200000,codFailedEnabled:false,codFailedAmount:0,services,shops:[{_id:123,district_id:1452}],selectedShopId:'123',multipleSourceItems:false,buildGhnEditFee,isLocalBackend:()=>true,isStaleGhnEditResponse:()=>false,setFeeDetail:v=>state.detail=v,setFeeError:v=>state.error=v,setFeeStatus:v=>state.status=v,setLoadingFee:v=>state.loading=v,toast:()=>{throw Error('Unexpected toast');},callGHN:async(action,body)=>{const result=await adapter.ghn({action,...body});assert.equal(result.success,true);return result.data;},...patch};return{state,run:vm.runInNewContext(code,state)};}
for(const weight of [1500,20000]){const test=harness({totalItemWeight:weight,serviceTypeId:weight<20000?'2':'5'});await test.run();assert.equal(test.state.detail.total,12345);const payload=wire.at(-1);assert.equal(payload.items[0].name,'Kiện hàng đã đóng gói');assert.equal(payload.items[0].quantity,1);assert.equal(payload.insurance_value,200000);for(const field of ['weight','length','width','height'])assert.equal(payload[field],payload.items[0][field]);}
for(const patch of [{effectiveDims:{length:0,width:0,height:0}},{effectiveDims:{length:40,width:0,height:20}},{totalItemWeight:20000,serviceTypeId:'2'},{multipleSourceItems:true}]){const count=wire.length,test=harness(patch);await test.run();assert.equal(wire.length,count);assert.ok(test.state.error);assert.equal(test.state.status,'idle');}
assert.doesNotMatch(source,/setInsuranceValue\(codAmount\)/);
assert.match(source,/readOnly=\{isLocalBackend\(\) && multipleSourceItems\}/);
console.log('PASS actual edit fee callback -> strict local adapter -> fake provider: canonical parcel, measured dims, light/heavy service, insurance independent of COD, no dispatch for incomplete or ambiguous parcels.');
