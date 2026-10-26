// TEST-ONLY: exact integer editor helpers + actual component event handlers.
// No environment, provider, database, network, or real order dispatch.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as integer from '../src/lib/ghn-integer-input.ts';
import { buildGhnQuoteSnapshot, GHN_FEE_COMPONENT_LABELS, ghnRecipientAmount, parseGhnFeeQuote, eligibleGhnServices } from '../src/lib/ghn-quote-comparison.ts';
const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/components/GhnIntegerInput.tsx', import.meta.url),'utf8');
let groups=0;
const check=(name,run)=>{run();groups++;console.log('PASS GHN integer input: '+name);};
const parse=(text,min=0,max=50000000)=>integer.parseGhnIntegerInput(text,min,max);
check('exact plain/grouped integers, zero, empty, caps and unsafe values',()=>{
  for(const [text,value] of [['0',0],['20000',20000],['20.000',20000],['1.250.000',1250000],['50.000.000',50000000]])assert.equal(parse(text),value);
  for(const text of ['','-1','+1','1e3','Infinity','NaN','1.5','20,5','20,000','1 000','1.00.000',' 100 ','0.0001','9007199254740993','50.000.001'])assert.equal(parse(text),null,text);
  assert.equal(parse('50.000',1,50000),50000);assert.equal(parse('50.001',1,50000),null);assert.equal(parse('0',1,50000),null);
  assert.equal(parse('5.000.001',0,5000000),null);assert.equal(integer.formatGhnIntegerInput('5000001'),'5.000.001','overlimit remains visible');
});
check('sequential typing and middle/range digit edits preserve exact intended digits',()=>{
  let text='';for(const digit of '1250000')text=integer.editGhnIntegerInput(text,text+digit,text.length+1,'insertText').text;
  assert.equal(text,'1.250.000');
  assert.deepEqual(integer.editGhnIntegerInput('12.345','12.9345',4,'insertText'),{text:'129.345',caret:3});
  assert.deepEqual(integer.editGhnIntegerInput('12.345','19.345',2,'insertText'),{text:'19.345',caret:2});
  assert.equal(integer.editGhnIntegerInput('12.345','1.345',1,'deleteContentBackward').text,'1.345');
  assert.equal(integer.editGhnIntegerInput('1.000','',0,'deleteContentBackward').text,'');
  assert.equal(integer.editGhnIntegerInput('1','1.5',3,'insertText').text,'1.5','fraction not transformed');
});
check('paste accepts strict grouped digits and preserves invalid text, selection and caret',()=>{
  assert.deepEqual(integer.pasteGhnIntegerInput('','1250000',0,0),{text:'1.250.000',caret:9});
  assert.deepEqual(integer.pasteGhnIntegerInput('20.000','1.250.000',0,6),{text:'1.250.000',caret:9});
  assert.deepEqual(integer.pasteGhnIntegerInput('12.345','90',1,4),{text:'19.045',caret:4});
  assert.deepEqual(integer.pasteGhnIntegerInput('1.5','1250000',0,3),{text:'1.250.000',caret:9});
  assert.deepEqual(integer.pasteGhnIntegerInput('1.5','-1250000',0,3),{text:'-1250000',caret:8});
  for(const text of ['-1','1.5','1e3','20,5','hello'])assert.equal(integer.pasteGhnIntegerInput('0',text,0,1).text,text);
});
check('Backspace/Delete beside a grouping dot remove the intended adjacent digit',()=>{
  assert.deepEqual(integer.deleteGhnIntegerSeparator('12.345',3,'Backspace'),{text:'1.345',caret:1});
  assert.deepEqual(integer.deleteGhnIntegerSeparator('12.345',2,'Delete'),{text:'1.245',caret:3});
  assert.deepEqual(integer.deleteGhnIntegerSeparator('1.000',2,'Backspace'),{text:'0',caret:0});
  assert.equal(integer.deleteGhnIntegerSeparator('12.345',1,'Backspace'),null);
});
function harness(initial='0'){
  let value=initial,tree,cursor=0,pending=[],composition=false;const hooks=[];
  const dom={value:initial,selectionStart:0,selectionEnd:0,setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;}};
  const document={activeElement:dom};
  const module={exports:{}};
  const onComposingChange=next=>composition=next;
  const react={useRef:initial=>{const at=cursor++;return hooks[at]??=( {current:initial} );},useLayoutEffect:(run,deps)=>{const at=cursor++,old=hooks[at];if(!deps||!old||deps.some((dep,index)=>!Object.is(dep,old.deps?.[index]))){hooks[at]={deps};pending.push(()=>{old?.cleanup?.();hooks[at].cleanup=run();});}}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,document,require:name=>name==='react'?react:name==='@/components/ui/input'?{Input:'Input'}:name==='@/lib/ghn-integer-input'?integer:require(name)});
  const render=()=>{cursor=0;pending=[];tree=module.exports.GhnIntegerInput({id:'test-integer',min:0,max:50000000,value,onValueChange:next=>value=next,onComposingChange});tree.ref.current=dom;dom.value=value;pending.forEach(run=>run());return tree;};
  const target=(text,start,end=start)=>{dom.value=text;dom.selectionStart=start;dom.selectionEnd=end;return dom;};
  render();return{render,get value(){return value;},get composition(){return composition;},get field(){return tree;},dom,target,set:next=>{value=next;render();},unmount:()=>hooks.forEach(hook=>hook.cleanup?.())};
}
check('actual component handles paste, caret, clear and external prefill/reset',()=>{
  const h=harness();h.target('0',0,1);
  let prevented=false;h.field.props.onPaste({currentTarget:h.dom,clipboardData:{getData:()=>'1250000'},preventDefault:()=>prevented=true});h.render();
  assert.equal(prevented,true);assert.equal(h.value,'1.250.000');assert.equal(h.dom.selectionStart,9);
  h.field.props.onChange({currentTarget:h.target('1.2950.000',4),nativeEvent:{inputType:'insertText'}});h.render();assert.equal(h.value,'12.950.000');assert.equal(h.dom.selectionStart,4);
  h.field.props.onChange({currentTarget:h.target('',0),nativeEvent:{inputType:'deleteContentBackward'}});h.render();assert.equal(h.value,'');assert.equal(h.field.props['aria-invalid'],true);
  h.set('7.500.000');assert.equal(h.value,'7.500.000');h.set('0');assert.equal(h.field.props['aria-invalid'],false);
});
check('actual component preserves invalid paste and blocks valid-looking interim IME text',()=>{
  const h=harness();h.target('0',0,1);h.field.props.onPaste({currentTarget:h.dom,clipboardData:{getData:()=>'1.5'},preventDefault(){}});h.render();assert.equal(h.value,'1.5');assert.equal(h.field.props['aria-invalid'],true);
  h.field.props.onCompositionStart({currentTarget:h.dom});h.render();assert.equal(h.composition,true);
  h.field.props.onChange({currentTarget:h.target('1000',4),nativeEvent:{inputType:'insertCompositionText'}});h.render();assert.equal(h.value,'1000');assert.equal(h.field.props['aria-invalid'],true);
  h.field.props.onCompositionEnd({currentTarget:h.dom});h.render();assert.equal(h.value,'1.000');assert.equal(h.composition,false);assert.equal(h.field.props['aria-invalid'],false);
});
check('actual component formats replacement paste after invalid input with final caret',()=>{
  const h=harness('1.5');h.target(h.value,0,3);
  h.field.props.onPaste({currentTarget:h.dom,clipboardData:{getData:()=>'1250000'},preventDefault(){}});h.render();
  assert.equal(h.value,'1.250.000');assert.equal(h.dom.selectionStart,9);assert.equal(h.field.props['aria-invalid'],false);
});
check('modified separator keys are left to native browser shortcuts',()=>{
  for(const key of ['Backspace','Delete'])for(const modifier of ['ctrlKey','shiftKey','altKey','metaKey']){
    const h=harness('12.345');h.target(h.value,key==='Backspace'?3:2);let prevented=false;
    h.field.props.onKeyDown({currentTarget:h.dom,key,[modifier]:true,preventDefault:()=>prevented=true});h.render();
    assert.equal(prevented,false,key+' '+modifier);assert.equal(h.value,'12.345');
  }
});
check('middle IME digit insertion normalizes old grouping and preserves caret; decimal/sign/exponent stay invalid',()=>{
  const h=harness('12.345');h.target(h.value,3);h.field.props.onCompositionStart({currentTarget:h.dom});h.render();
  h.field.props.onChange({currentTarget:h.target('12.9345',4),nativeEvent:{inputType:'insertCompositionText'}});h.render();assert.equal(h.value,'12.9345');assert.equal(h.composition,true);assert.equal(h.field.props['aria-invalid'],true);
  h.field.props.onCompositionEnd({currentTarget:h.dom});h.render();assert.equal(h.value,'129.345');assert.equal(h.dom.selectionStart,3);assert.equal(h.composition,false);assert.equal(h.field.props['aria-invalid'],false);
  for(const text of ['12.5','-125','1e3']){
    const bad=harness('12.345');bad.target(bad.value,0,6);bad.field.props.onCompositionStart({currentTarget:bad.dom});bad.render();
    bad.field.props.onChange({currentTarget:bad.target(text,text.length),nativeEvent:{inputType:'insertCompositionText'}});bad.render();bad.field.props.onCompositionEnd({currentTarget:bad.dom});bad.render();
    assert.equal(bad.value,text);assert.equal(bad.field.props['aria-invalid'],true);
  }
});
check('external reset cancels interim IME and stale end; unmount clears owner composition guard',()=>{
  const h=harness('12.345');h.target(h.value,3);h.field.props.onCompositionStart({currentTarget:h.dom});h.render();
  h.field.props.onChange({currentTarget:h.target('12.9345',4),nativeEvent:{inputType:'insertCompositionText'}});h.render();
  h.set('0');h.render();assert.equal(h.composition,false);assert.equal(h.value,'0');assert.equal(h.field.props['aria-invalid'],false);
  h.field.props.onCompositionEnd({currentTarget:h.target('12.9345',4)});h.render();assert.equal(h.value,'0');
  h.field.props.onCompositionStart({currentTarget:h.dom});h.render();assert.equal(h.composition,true);h.unmount();assert.equal(h.composition,false);
});
check('parsed payloads retain exact grams/COD/insurance/failed collection; eligibility stays technical',()=>{
  const made=buildGhnQuoteSnapshot({provinceId:'202',districtId:'1444',wardCode:'020308',address:'Synthetic test',cod:parse('1.250.000'),insurance:parse('2.000.000',0,5000000),codFailed:parse('20.000'),parcel:{weight:parse('40.000',1,50000),length:20,width:30,height:40}});
  assert.equal(made.snapshot.feeData.weight,40000);
  assert.equal(made.snapshot.feeData.cod_value,1250000);assert.equal(made.snapshot.feeData.insurance_value,2000000);assert.equal(made.snapshot.feeData.cod_failed_amount,20000);assert.equal(made.snapshot.feeData.items[0].weight,40000);
  const services=[{service_id:1,service_type_id:2},{service_id:2,service_type_id:5}];assert.equal(eligibleGhnServices(services,19999)[0].service_type_id,2);assert.equal(eligibleGhnServices(services,20000)[0].service_type_id,5);
  const quote=parseGhnFeeQuote({total:80000,service_fee:70000,deliver_remote_areas_fee:10000});
  assert.equal(ghnRecipientAmount(parse('1.250.000'),'2',quote),1330000);assert.equal(ghnRecipientAmount(parse('1.250.000'),'1',quote),1250000);
});
const dialog=await readFile(new URL('../src/components/LocalCreateGHNOrderDialog.tsx',import.meta.url),'utf8');
check('all fee rows stay visible, zero coupon has no negative sign, principals distinct and IME gates snapshots',()=>{
  assert.equal(Object.keys(GHN_FEE_COMPONENT_LABELS).length,15);
  assert.match(dialog,/as GhnFeeComponent\[\]\)\.map\(field/);assert.doesNotMatch(dialog,/Hàng nặng \(|Hàng nhẹ \(/);
  assert.match(dialog,/field==='coupon_value'&&selectedFee.components\[field\]!==0/);
  for(const label of ['GHN chưa tách phí','Giá trị khai báo bảo hiểm (không phải phí)','Tiền thu riêng khi giao thất bại','Người gửi trả cước dự kiến'])assert.ok(dialog.includes(label),label);
  assert.match(dialog,/cod:numericComposing\?NaN:cod/);
  assert.match(dialog,/const formSignature=JSON\.stringify\(\[[^\n]*parcelDraft\(parcels\),codInput,insuranceInput/);
  assert.match(dialog,/const parcelDraft=[^\n]*parcels\.map\(\(\{weight,weightInput,length,width,height\}\)=>\(\{weight,weightInput,length,width,height\}\)\)/);
});
console.log('PASS '+groups+' GHN integer input groups (helpers + actual synthetic component handlers; browser keyboard verified separately).');
