// Synthetic-only helpers and extracted actual dialog handlers. No env/provider/DB.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as form from '../src/lib/ghn-create-form.ts';
import { formatGhnIntegerInput, parseGhnIntegerInput } from '../src/lib/ghn-integer-input.ts';
import { buildGhnQuoteSnapshot, eligibleGhnServices, buildGhnPackedContent, buildGhnCreateParcelItemName } from '../src/lib/ghn-quote-comparison.ts';
const source=await readFile(new URL('../src/components/LocalCreateGHNOrderDialog.tsx',import.meta.url),'utf8'),parsed=ts.createSourceFile('dialog.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),initializers=new Map();let createPayload;
const visit=node=>{if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer)initializers.set(node.name.text,node.initializer.getText(parsed));if(ts.isCallExpression(node)&&node.expression.getText(parsed)==='localApi.createGhnOrder')createPayload=node.arguments[0].getText(parsed);ts.forEachChild(node,visit);};visit(parsed);
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const field=(name,context)=>vm.runInContext(compile(`globalThis.${name}=${initializers.get(name)};`),context);
const product=(patch={})=>({id:'test-product',name:'TEST product',quantity:2,weightInput:'2.000',code:'TEST-001',...patch});
const parcel=(patch={})=>({id:'test-parcel',weight:0,weightInput:'',length:20,width:30,height:40,...patch});
function harness(){
  let sequence=0;const c=vm.createContext({...form,formatGhnIntegerInput,parseGhnIntegerInput,buildGhnQuoteSnapshot,buildGhnCreateParcelItemName,crypto:{randomUUID:()=>`synthetic-${++sequence}`},locked:false,parcels:[parcel()],items:[product()],weightFollowsProducts:true,multiEditorOpen:false,customOrderNumber:'TEST-REF',addressMode:'OLD3',useMemo:fn=>fn(),requestAnimationFrame:()=>{},dialogContent:{current:null},provinceId:'202',districtId:'1444',wardCode:'020308',toAddress:'Synthetic destination',cod:0,insurance:0,collectFailed:false,failedCod:0,numericComposing:false});
  Object.assign(c,{newAddress:{provinceId:'',wardId:''},order:null,toName:'Synthetic',toPhone:'0900000003',note:'',requiredNote:'KHONGCHOXEMHANG',payment:'2'});
  for(const name of ['parcels','items','weightFollowsProducts','multiEditorOpen'])c['set'+name[0].toUpperCase()+name.slice(1)]=value=>c[name]=typeof value==='function'?value(c[name]):value;
  for(const name of ['blankParcel','parcelInputId','changeParcel','changeOrderWeight','useProductWeight','addParcel','removeParcel','updateItem'])field(name,c);
  const render=()=>{for(const name of ['productWeight','productWeightInputError','effectiveParcels','quoteInput'])field(name,c);};render();return {c,render};
}
let groups=0;const check=(name,run)=>{run();groups++;console.log('PASS GHN product weight: '+name);};
check('2.000g × two products produces one 4.000g parcel and type2',()=>{
  const {c}=harness();assert.equal(c.productWeight.total,4000);assert.equal(c.effectiveParcels.length,1);assert.equal(c.effectiveParcels[0].weightInput,'4.000');assert.equal(c.quoteInput.snapshot.feeData.items.length,1);assert.equal(c.quoteInput.snapshot.feeData.items[0].quantity,1);
  assert.deepEqual(eligibleGhnServices([{service_id:2,service_type_id:2},{service_id:5,service_type_id:5}],c.quoteInput.snapshot.feeData.weight,c.effectiveParcels.length).map(row=>row.service_type_id),[2]);
});
check('unit weight and quantity edits synchronously invalidate old weight identity; 20kg to40kg updates item',()=>{
  const {c,render}=harness();c.updateItem(0,'weightInput','10.000');render();const old=c.quoteInput.snapshot;assert.equal(old.feeData.items[0].weight,20000);
  c.updateItem(0,'quantity',4);render();assert.equal(c.quoteInput.snapshot.feeData.items[0].weight,40000);assert.notEqual(c.quoteInput.snapshot.key,old.key);
  c.updateItem(0,'weightInput','');render();assert.equal(c.quoteInput.snapshot,null);assert.equal(c.effectiveParcels[0].weight,0);
});
check('manual packed gross remains authoritative and opt-in restores sum with focus first',()=>{
  const {c,render}=harness();c.changeOrderWeight('5.500');render();assert.equal(c.weightFollowsProducts,false);assert.equal(c.quoteInput.snapshot.feeData.weight,5500);
  c.updateItem(0,'quantity',3);render();assert.equal(c.quoteInput.snapshot.feeData.weight,5500);assert.equal(c.productWeight.total,6000);
  const events=[];c.dialogContent.current={querySelector:id=>({focus:()=>events.push(id)})};c.setWeightFollowsProducts=value=>{events.push('follow');c.weightFollowsProducts=value;};c.useProductWeight();render();assert.equal(c.quoteInput.snapshot.feeData.weight,6000);assert.deepEqual(events,['#ghn-parcel-weight','follow']);
});
check('adding a real parcel freezes derived first weight and returning to one stays manual',()=>{
  const {c,render}=harness();c.addParcel();render();assert.equal(c.parcels.length,2);assert.equal(c.parcels[0].weight,4000);assert.equal(c.weightFollowsProducts,false);assert.equal(c.multiEditorOpen,true);assert.equal(c.quoteInput.snapshot,null);
  const second=c.parcels[1].id;c.changeParcel(second,{weightInput:'1.000',weight:1000,length:10,width:10,height:10});render();assert.equal(c.quoteInput.snapshot.feeData.weight,5000);assert.equal(c.quoteInput.snapshot.feeData.items.length,2);
  c.updateItem(0,'quantity',9);render();assert.equal(c.parcels[0].weight,4000);c.removeParcel(second);render();assert.equal(c.effectiveParcels[0].weight,4000);assert.equal(c.weightFollowsProducts,false);
});
check('blank unit weights allowed after manual weighing; malformed nonempty values never quote/create',()=>{
  const {c,render}=harness();c.changeOrderWeight('4.000');c.updateItem(0,'weightInput','');render();assert.ok(c.quoteInput.snapshot);assert.equal(form.buildGhnProductLines(c.items)[0].weight,undefined);
  for(const value of ['0','-1','2,5','1e3','50.001']){c.updateItem(0,'weightInput',value);render();assert.equal(c.quoteInput.snapshot,null);assert.ok(c.productWeightInputError);}
});
check('product aggregate may exceed 50kg while physical parcels must be declared independently',()=>{
  assert.equal(form.calculateGhnProductWeight([product({weightInput:'25.000'})]).total,50000);
  assert.equal(form.calculateGhnProductWeight([product({weightInput:'30.000'})]).total,60000);
  assert.equal(form.calculateGhnProductWeight([product({quantity:100,weightInput:'50.000'})]).total,5000000);
  for(const patch of [{weightInput:''},{weightInput:'50.001'},{weightInput:'50.000',quantity:101},{quantity:0},{quantity:1001},{quantity:0.5},{quantity:NaN}])assert.equal(form.calculateGhnProductWeight([product(patch)]).total,null);
  assert.equal(form.calculateGhnProductWeight([product({quantity:1,weightInput:'1'}),product({quantity:1,weightInput:'2'})]).total,3);
  const {c,render}=harness();c.updateItem(0,'weightInput','30.000');render();assert.equal(c.productWeight.total,60000);assert.equal(c.quoteInput.snapshot,null);assert.match(c.quoteInput.error,/Thêm kiện/);
  c.changeOrderWeight('30.000');render();c.addParcel();c.changeParcel(c.parcels[1].id,{weight:30000,weightInput:'30.000',length:30,width:20,height:20});render();assert.equal(c.quoteInput.snapshot.feeData.weight,60000);assert.equal(c.quoteInput.snapshot.feeData.items.length,2);
});
check('actual dialog validation shows a valid multi-parcel total above50kg and rejects one oversized parcel',()=>{
  const {c,render}=harness();c.weightFollowsProducts=false;c.parcels=[parcel({weight:30000,weightInput:'30.000'}),parcel({id:'test-parcel-2',weight:30000,weightInput:'30.000'})];render();
  c.ghnDimensionalWeightGrams=()=>1000;
  const validate=()=>{for(const name of ['parcelWeightIsValid','parcelDimensionsAreComplete','totalWeight','parcelWeightValid','parcelDimensionsComplete','dimensionalWeight','parcelValid','invalidParcelIndex','parcelCreateError'])field(name,c);};validate();
  assert.equal(c.totalWeight,60000);assert.equal(c.parcelValid,true);assert.equal(c.parcelCreateError,'');assert.equal(formatGhnIntegerInput(String(c.totalWeight)),'60.000');
  c.parcels=[parcel({weight:60000,weightInput:'60.000'})];render();validate();assert.equal(c.parcelValid,false);assert.match(c.parcelCreateError,/Thêm kiện/);
});
check('prefill uses explicit per-unit grams/codes only and preserves bad input',()=>{
  const rows=form.createGhnProductDrafts([{name:'A',quantity:2,weight:9999,sku:'SKU-A'},{name:'B',quantity:1,unit_weight_grams:2000,product_code:'SKU-B'},{name:'C',quantity:1,weight_grams:'bad'},{product:{name:'D',weight_grams:1500,sku:'SKU-D'},quantity:2}], '',()=> 'synthetic');
  assert.equal(rows[0].weightInput,'');assert.equal(rows[0].code,'SKU-A');assert.equal(rows[1].weightInput,'2.000');assert.equal(rows[2].weightInput,'bad');assert.equal(rows[3].weightInput,'1.500');assert.equal(rows[3].code,'SKU-D');
});
check('actual create payload keeps metadata separate and local custom reference out of provider physical data',()=>{
  const {c}=harness(),measured=c.quoteInput.snapshot.feeData;
  Object.assign(c,{requestKey:'synthetic-key',shopId:'123',order:undefined,toName:'Synthetic',toPhone:'0900000003',measured,note:'',requiredNote:'KHONGCHOXEMHANG',content:buildGhnPackedContent(c.items),payment:'2',selectedService:{service_type_id:2,service_id:2}});
  const request=vm.runInContext(compile(`(${createPayload})`),c);assert.equal(request.orderNumber,'TEST-REF');assert.equal(request.orderData.weight,4000);assert.equal(request.orderData.items.length,1);assert.equal(request.productLines[0].weight,2000);assert.equal(request.productLines[0].quantity,2);assert.equal(request.productLines[0].code,'TEST-001');assert.equal(request.orderData.productLines,undefined);assert.match(request.orderData.content,/\[TEST-001\] × 2/);
  c.order={id:'linked',order_number:'CRM-REAL'};const linked=vm.runInContext(compile(`(${createPayload})`),c);assert.equal(linked.orderNumber,'CRM-REAL');
});
check('product signatures retain editable metadata but ignore generated IDs',()=>{
  const before=form.ghnProductDraftSignature([product()]);assert.deepEqual(before,form.ghnProductDraftSignature([product({id:'other-id'})]));
  for(const patch of [{weightInput:'2.001'},{quantity:3},{code:'different'},{name:'different'}])assert.notDeepEqual(before,form.ghnProductDraftSignature([product(patch)]));
  assert.match(source,/readOnly=\{Boolean\(order\)\}/);assert.match(source,/weightFollowsProducts,customOrderNumber\]/);
});
console.log('GHN_PRODUCT_WEIGHT_FORM_PASS '+JSON.stringify({groups,network:'none',database:'none'}));
