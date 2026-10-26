// TEST-ONLY: pure helpers and the actual JSX/payload expressions. No environment
// files, sockets, database, credentials or provider order calls.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { ghnDimensionalWeightGrams } from '../src/lib/ghn-parcel-weight.ts';
import { buildGhnQuoteSnapshot, buildGhnCreateParcelItemName, GHN_FEE_COMPONENT_LABELS, parseGhnFeeQuote } from '../src/lib/ghn-quote-comparison.ts';
import { buildGhnProductLines } from '../src/lib/ghn-create-form.ts';
import { formatGhnIntegerInput } from '../src/lib/ghn-integer-input.ts';

let groups=0;
const check=(name,run)=>{run();groups++;console.log('PASS GHN dimensional UI: '+name);};
const source=await readFile(new URL('../src/components/LocalCreateGHNOrderDialog.tsx',import.meta.url),'utf8');
const parsed=ts.createSourceFile('dialog.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const require=createRequire(import.meta.url);
const visit=(node,fn)=>{fn(node);ts.forEachChild(node,child=>visit(child,fn));};
const evaluate=(expression,context)=>vm.runInNewContext(ts.transpileModule('('+expression+')',{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{require,exports:{},...context});
const jsxSection=heading=>{
  let found;
  visit(parsed,node=>{if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(parsed)==='section'&&node.openingElement.attributes.properties.some(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(parsed)==='aria-labelledby'&&attr.initializer?.text===heading))found=node;});
  assert.ok(found,heading);return found.getText(parsed);
};
const walk=node=>Array.isArray(node)?node.flatMap(walk):node&&typeof node==='object'?[node,...walk(node.props?.children)]:[];
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):node===null||node===undefined||typeof node==='boolean'?'':String(node);
const noop=()=>{};
const money=value=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString('vi-VN')+' đ':'Chưa hợp lệ';
const context=(parcel,patch={})=>({cardClass:'test-card',parcels:[{...parcel,id:'synthetic',weightInput:formatGhnIntegerInput(String(parcel.weight))}],effectiveParcels:[{...parcel,id:'synthetic',weightInput:formatGhnIntegerInput(String(parcel.weight))}],weightFollowsProducts:false,multiEditorOpen:false,setMultiEditorOpen:noop,customOrderNumber:'',setCustomOrderNumber:noop,changeOrderWeight:noop,useProductWeight:noop,formatGhnIntegerInput,totalWeight:parcel.weight,locked:false,addParcel:noop,removeParcel:noop,changeParcel:noop,parcelInputId:(index,field)=>'ghn-parcel-'+field,ghnDimensionalWeightGrams,Plus:'i',Copy:'i',X:'i',parcelCreateError:'',parcelWeightValid:Number.isInteger(parcel.weight)&&parcel.weight>0&&parcel.weight<=50000,parcelDimensionsComplete:[parcel.length,parcel.width,parcel.height].every(v=>Number.isInteger(v)&&v>=1&&v<=200),parcelValid:true,dimensionalWeight:ghnDimensionalWeightGrams(parcel),numericComposing:false,codInput:'0',insuranceInput:'0',insuranceFollowsCod:true,failedCodInput:'0',collectFailed:false,order:undefined,GhnIntegerInput:'input',Input:'input',Label:'label',Button:'button',setNumericComposing:noop,changeCod:noop,changeInsurance:noop,useCodForInsurance:noop,setCollectFailed:noop,setFailedCodInput:noop,money,...patch});
const parcelSection=jsxSection('ghn-parcel-heading');
const feeSection=jsxSection('ghn-fee-details-heading');

check('official cm formula keeps exact sub-gram precision and full volume range',()=>{
  assert.equal(ghnDimensionalWeightGrams({length:50,width:40,height:30}),12000);
  assert.equal(ghnDimensionalWeightGrams({length:1,width:1,height:1}),0.2);
  assert.equal(ghnDimensionalWeightGrams({length:200,width:200,height:200}),1600000);
  assert.equal(ghnDimensionalWeightGrams({length:30,width:50,height:40}),12000);
});
check('partial, cleared, fractional and malformed dimensions remove the derived result',()=>{
  const valid={length:50,width:40,height:30};
  for(const field of Object.keys(valid))for(const value of [undefined,null,'50',0,-1,0.5,200.1,201,NaN,Infinity])assert.equal(ghnDimensionalWeightGrams({...valid,[field]:value}),null,field+':'+value);
  assert.equal(ghnDimensionalWeightGrams({length:1,width:200,height:1}),40);
});
check('real parcel JSX shows actual and dimensional figures; cleared dimensions and composition cannot show valid old values',()=>{
  for(const [weight,length,width,height,actual,volume] of [[20000,50,40,30,'20.000','12.000'],[1000,50,40,30,'1.000','12.000'],[12000,50,40,30,'12.000','12.000'],[50000,200,200,200,'50.000','1.600.000'],[1,1,1,1,'1','0,2']]){
    const tree=evaluate(parcelSection,context({weight,length,width,height}));
    const weightInput=walk(tree).find(node=>node.props?.id==='ghn-parcel-weight'),converted=walk(tree).find(node=>node.type==='output');
    assert.equal(weightInput.props.value,actual);assert.equal(text(converted),volume);assert.equal(converted.props['aria-label'],'Khối lượng quy đổi (gram)');assert.ok(!text(tree).includes('Khối lượng tính cước'));
  }
  const cleared=evaluate(parcelSection,context({weight:20000,length:50,width:40,height:0},{parcelDimensionsComplete:false,parcelValid:false}));
  assert.equal(text(walk(cleared).find(node=>node.type==='output')),'Chưa đủ số đo');
  const composing=evaluate(parcelSection,context({weight:20000,length:50,width:40,height:30},{numericComposing:true}));
  assert.equal(walk(composing).find(node=>node.props?.id==='ghn-parcel-weight').props.onComposingChange,noop);
  assert.equal(walk(cleared).find(node=>node.type==='details').props.open,undefined);
  assert.ok(!text(cleared).includes('Đơn GHN tạo trực tiếp'));
});
check('quote and actual create payload keep measured weight and dimensions regardless of volumetric comparison',()=>{
  let payload;
  visit(parsed,node=>{if(ts.isCallExpression(node)&&node.expression.getText(parsed)==='localApi.createGhnOrder')payload=node.arguments[0].getText(parsed);});
  assert.ok(payload);
  for(const parcel of [{weight:20000,length:50,width:40,height:30},{weight:1000,length:50,width:40,height:30},{weight:12000,length:50,width:40,height:30},{weight:50000,length:200,width:200,height:200}]){
    const before=structuredClone(parcel),volume=ghnDimensionalWeightGrams(parcel);
    const made=buildGhnQuoteSnapshot({provinceId:'202',districtId:'1444',wardCode:'020308',address:'Synthetic destination',cod:0,insurance:0,codFailed:0,parcel});
    assert.ok(made.snapshot,made.error);const measured=made.snapshot.feeData;
    const request=evaluate(payload,{requestKey:'synthetic-key',shopId:'123',order:undefined,customOrderNumber:'',provinceId:'202',toName:'Synthetic',toPhone:'0900000003',toAddress:'Synthetic destination',districtId:'1444',wardCode:'020308',measured,cod:0,insurance:0,note:'',requiredNote:'KHONGCHOXEMHANG',content:'Synthetic parcel',payment:'2',selectedService:{service_type_id:parcel.weight>=20000?5:2,service_id:1},items:[{name:'Synthetic parcel',quantity:7,weightInput:'',code:''}],buildGhnCreateParcelItemName,buildGhnProductLines});
    for(const field of ['weight','length','width','height']){
      assert.equal(measured[field],parcel[field]);assert.equal(measured.items[0][field],parcel[field]);
      assert.equal(request.orderData[field],parcel[field]);assert.equal(request.orderData.items[0][field],parcel[field]);
    }
    if(volume!==parcel.weight)assert.notEqual(request.orderData.weight,volume);
    assert.deepEqual(parcel,before);
  }
});
check('actual money JSX wires one-way COD edits and a separate opt-in button outside the insurance label',()=>{
  const onCod=()=>{},onInsurance=()=>{},resume=()=>{};
  const base=context({weight:20000,length:20,width:30,height:40},{changeCod:onCod,changeInsurance:onInsurance,useCodForInsurance:resume});
  const auto=evaluate(parcelSection,base),manual=evaluate(parcelSection,{...base,insuranceFollowsCod:false});
  assert.equal(walk(auto).find(node=>node.props?.id==='ghn-cod').props.onValueChange,onCod);
  assert.equal(walk(auto).find(node=>node.props?.id==='ghn-insurance').props.onValueChange,onInsurance);
  assert.ok(text(auto).includes('Theo COD'));assert.ok(!text(auto).includes('Dùng COD'));
  const button=walk(manual).find(node=>node.type==='button'&&text(node)==='Dùng COD');
  assert.ok(button);assert.equal(button.props.type,'button');assert.equal(button.props.onClick,resume);
  assert.ok(walk(manual).some(node=>node.type==='label'&&node.props.htmlFor==='ghn-insurance'));
  assert.ok(!walk(manual).filter(node=>node.type==='label').some(node=>walk(node).includes(button)),'button must not also activate the insurance input label');
});
check('all fifteen actual fee rows remain inside closed-by-default detail; zeros and missing values remain distinct',()=>{
  assert.equal(Object.keys(GHN_FEE_COMPONENT_LABELS).length,15);
  const quote=parseGhnFeeQuote({total:43210,...Object.fromEntries(Object.keys(GHN_FEE_COMPONENT_LABELS).map(field=>[field,0]))},1000);
  const base={cardClass:'test-card',rateLabel:'Tổng cước dự kiến',rateText:'43.210 đ',cod:200000,insurance:300000,collectFailed:false,failedCod:0,payment:'2',fee:43210,recipientAmount:243210,selectedFee:quote,feeBusy:false,compareBusy:false,money,GHN_FEE_COMPONENT_LABELS};
  const tree=evaluate(feeSection,base),detail=walk(tree).find(node=>node.type==='details');
  assert.ok(detail);assert.equal(detail.props.open,undefined);assert.equal(text(walk(detail).find(node=>node.type==='summary')),'Chi tiết cước');
  for(const label of Object.values(GHN_FEE_COMPONENT_LABELS))assert.ok(text(detail).includes(label),label);
  assert.equal((text(detail).match(/GHN chưa tách phí/g)||[]).length,0);assert.ok(!text(detail).includes('-0 đ'));
  assert.ok(text(tree).includes('243.210 đ'));assert.ok(text(tree).includes('Cước có thể thay đổi'));
  const missing=evaluate(feeSection,{...base,selectedFee:parseGhnFeeQuote({total:43210,deliver_remote_areas_fee:0},1000)});
  assert.equal((text(missing).match(/GHN chưa tách phí/g)||[]).length,14);
  assert.ok(text(missing).includes(GHN_FEE_COMPONENT_LABELS.deliver_remote_areas_fee));assert.ok(text(missing).includes('0 đ'));
});
check('form root clips without becoming a focus-scroll container; the content retains its own scrolling',()=>{
  let root;
  visit(parsed,node=>{if(ts.isJsxOpeningElement(node)&&node.tagName.getText(parsed)==='DialogContent'&&node.attributes.properties.some(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(parsed)==='aria-describedby'&&attr.initializer?.text==='ghn-create-description'))root=node;});
  assert.ok(root);
  const className=root.attributes.properties.find(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(parsed)==='className').initializer.text;
  assert.ok(className.split(' ').includes('overflow-clip'),'overflow:hidden still permits browser focus to scroll the root and hide its header');
  assert.ok(!className.split(' ').some(token=>['overflow-hidden','overflow-auto','overflow-y-auto'].includes(token)));
  assert.match(source,/<main className="min-h-0 min-w-0 flex-1[^"\n]*overflow-y-auto/);
});
console.log('PASS '+groups+' GHN dimensional UI groups (synthetic only).');
