// TEST-ONLY. Execute real component handlers/hooks using synthetic React state.
// No env, browser, database, provider or network. Race inputs are controlled promises.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as matching from '../src/lib/ghn-address-match.ts';
import { parseGhnGrams, prefillGhnProducts } from '../src/lib/ghn-create-form.ts';
import { buildGhnQuoteSnapshot } from '../src/lib/ghn-quote-comparison.ts';
const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/components/GhnReceiverAddressDialog.tsx', import.meta.url), 'utf8');
const provinces = [1, 2].map(id => ({ ProvinceID:id, ProvinceName:'Tỉnh Test '+id }));
const district = (id, province) => ({ DistrictID:id, ProvinceID:province, DistrictName:'Quận Test '+id });
const ward = (id, parent) => ({ WardCode:id, DistrictID:parent, WardName:'Phường Test '+id });
const initial = { address:'12 Đường giả lập', provinceId:'1', districtId:'11', wardCode:'a', districts:[district(11,1)], wards:[ward('a',11)] };
const deferred = () => { let resolve; const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve}; };
const settle = async () => { for(let i=0;i<16;i++)await Promise.resolve(); };
let groups=0;
const check=async(name,run)=>{await run();groups++;console.log('PASS GHN-like form: '+name);};
function harness(read=async()=>[], provider={configured:false}) {
  let cursor=0,pending=[],dirty=false,tree;
  const hooks=[],timers=new Map(),commits=[],cancels=[];let timer=0;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
  const react={
    useState(value){const at=cursor++;if(!(at in hooks))hooks[at]={value:typeof value==='function'?value():value};return[hooks[at].value,next=>{const value=typeof next==='function'?next(hooks[at].value):next;if(!Object.is(value,hooks[at].value)){hooks[at].value=value;dirty=true;}}];},
    useRef(value){const at=cursor++;if(!(at in hooks))hooks[at]={current:value};return hooks[at];},
    useEffect(effect,deps){const at=cursor++;if(!same(hooks[at]?.deps,deps)){const previous=hooks[at];hooks[at]={deps};pending.push(()=>{previous?.cleanup?.();hooks[at].cleanup=effect();});}},
  };
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    module,exports:module.exports,setTimeout:callback=>{timers.set(++timer,callback);return timer;},clearTimeout:id=>timers.delete(id),require:name=>name==='react'?react:name==='@/lib/ghn-address-match'?matching:name==='./GhnAddressModeSwitch'?{GhnAddressModeSwitch:'mode-switch'}:name==='./GhnDirectorySearch'?{GhnDirectorySearch:'directory'}:name.startsWith('@/components/ui/')?Object.fromEntries(['Dialog','DialogContent','DialogHeader','DialogTitle','Button','Input','Label'].map(key=>[key,key])):require(name),
  });
  const visit=(node,predicate)=>Array.isArray(node)?node.flatMap(child=>visit(child,predicate)):!node||typeof node!=='object'?[]:[...(predicate(node)?[node]:[]),...visit(node.props?.children,predicate)];
  const props={initial:structuredClone(initial),provinces,read:(action,body)=>action==='address_autocomplete_status'?Promise.resolve().then(()=>typeof provider==='function'?provider():provider):read(action,body),onCommit:value=>commits.push(value),onCancel:()=>cancels.push(true)};
  const render=()=>{for(let i=0;i<20;i++){cursor=0;pending=[];dirty=false;tree=module.exports.GhnReceiverAddressDialog(props);pending.forEach(run=>run());if(!dirty)return tree;}throw Error('hooks did not settle');};
  render();
  return{render,commits,cancels,field:id=>visit(tree,node=>node.props?.id===id)[0],button:text=>visit(tree,node=>node.type==='Button'&&node.props.children===text)[0],dialog:()=>visit(tree,node=>node.type==='Dialog')[0],status:()=>visit(tree,node=>node.props?.role==='status')[0],alerts:()=>visit(tree,node=>node.props?.role==='alert'),suggestions:()=>visit(tree,node=>node.props?.['aria-label']==='Gợi ý danh mục GHN'),fullSuggestions:()=>visit(tree,node=>node.props?.role==='option'),content:()=>visit(tree,node=>node.type==='DialogContent')[0],tick:()=>{const jobs=[...timers.values()];timers.clear();jobs.forEach(run=>run());},unmount:()=>hooks.forEach(hook=>hook.cleanup?.())};
}
await check('exact grams and prefill retain invalid values and all rows for correction',()=>{
  for(const [text,value] of [['1',1],['20000',20000],['50000',50000]])assert.equal(parseGhnGrams(text),value);
  for(const text of ['0','50001','20,000','20.5','-1','Infinity',''])assert.equal(parseGhnGrams(text),null,text);
  const input=[{product_name:'Real',quantity:2},{product:{name:'Nested'},quantity:0},{name:'Invalid',quantity:'no'}];
  const before=structuredClone(input),rows=prefillGhnProducts(JSON.stringify(input));
  assert.equal(rows[0].name,'Real');assert.equal(rows[1].quantity,0);assert.ok(Number.isNaN(rows[2].quantity));assert.deepEqual(input,before);
  assert.equal(prefillGhnProducts(Array.from({length:101},()=>({name:'a',quantity:1}))).length,101,'never truncate shipments silently');
});
await check('modal edits are isolated; Cancel and Escape never commit or mutate initial object',()=>{
  const h=harness(),before=structuredClone(initial);
  h.field('ghn-street').props.onChange({target:{value:'new staged text'}});h.render();
  assert.equal(h.commits.length,0);assert.deepEqual(initial,before);
  h.button('Hủy').props.onClick();assert.equal(h.cancels.length,1);assert.equal(h.commits.length,0);
  const escape=harness();escape.dialog().props.onOpenChange(false);assert.equal(escape.cancels.length,1);assert.equal(escape.commits.length,0);
});
await check('Done atomically commits all fields once; incomplete hierarchy cannot commit',()=>{
  const h=harness();assert.equal(h.button('Xong').props.disabled,false);h.button('Xong').props.onClick();h.button('Xong').props.onClick();
  assert.equal(h.commits.length,1);assert.equal(JSON.stringify(h.commits[0]),JSON.stringify(initial));
  const invalid=harness();invalid.field('ghn-street').props.onChange({target:{value:'edited address'}});invalid.render();
  assert.equal(invalid.button('Xong').props.disabled,true);invalid.button('Xong').props.onClick();assert.equal(invalid.commits.length,0);
});
await check('late district/ward hierarchy responses never overwrite newer parent selection',async()=>{
  const p1=deferred(),p2=deferred(),w1=deferred();
  const h=harness((action,body)=>action==='get_wards'?w1.promise:body.provinceId===2?p2.promise:p1.promise);
  h.field('ghn-province').props.onChange('2');h.render();h.field('ghn-province').props.onChange('1');h.render();
  p1.resolve([district(12,1)]);await settle();h.render();
  p2.resolve([district(22,2)]);await settle();h.render();
  assert.equal(h.field('ghn-district').props.options[0].value,'12');
  h.field('ghn-district').props.onChange('12');h.render();h.field('ghn-province').props.onChange('2');h.render();
  w1.resolve([ward('late',12)]);await settle();h.render();assert.equal(h.field('ghn-ward').props.value,'');assert.equal(h.field('ghn-ward').props.options.length,0);
});
await check('cancel/unmount invalidates pending directory responses and recognizer generations',async()=>{
  const pending=deferred(),h=harness(()=>pending.promise);
  h.field('ghn-province').props.onChange('2');h.render();h.button('Hủy').props.onClick();h.unmount();
  pending.resolve([district(22,2)]);await settle();h.render();assert.equal(h.field('ghn-district').props.options.length,0);assert.equal(h.commits.length,0);
  const recognition=deferred(),r=harness(()=>recognition.promise);
  r.field('ghn-street').props.onChange({target:{value:'12 đường giả lập, Tỉnh Test 1'}});r.render();r.tick();await settle();
  r.field('ghn-province').props.onChange('2');r.render();recognition.resolve([district(11,1)]);await settle();r.render();
  assert.equal(r.field('ghn-province').props.value,'2');assert.equal(r.field('ghn-ward').props.value,'');assert.equal(r.commits.length,0);
});
await check('awaited recognizer has friendly missing notices for null suggestion query at each administrative level',async()=>{
  const cases=[
    {text:'12 Đường thử nghiệm',level:'tỉnh/thành',province:'',district:'',reads:0},
    {text:'12 Đường thử nghiệm Tỉnh Test 1',level:'quận/huyện',province:'1',district:'',reads:1},
    {text:'12 Đường thử nghiệm Quận Test 11 Tỉnh Test 1',level:'phường/xã',province:'1',district:'11',reads:2},
  ];
  // All three branches strip matched parents and reach the same street-only
  // remainder, for which a directory suggestion query intentionally is null.
  assert.equal(matching.ghnAddressSuggestionQuery('12 Đường thử nghiệm','province'),null);
  assert.equal(matching.ghnAddressSuggestionQuery('12 Đường thử nghiệm','district'),null);
  assert.equal(matching.ghnAddressSuggestionQuery('12 Đường thử nghiệm','ward'),null);
  for(const sample of cases){
    const reads=[],h=harness(async(action,body)=>{reads.push({action,body});return action==='get_districts'?[district(11,1)]:[ward('a',11)];});
    h.field('ghn-street').props.onChange({target:{value:sample.text}});h.render();h.tick();await settle();h.render();
    assert.equal(h.alerts().length,0,sample.level+' must not surface a TypeError');
    assert.equal(h.suggestions().length,0,sample.level+' must not invent directory hints');
    assert.match(h.status().props.children[1],new RegExp('Chưa xác định chắc chắn '+sample.level));
    assert.equal(h.field('ghn-province').props.value,sample.province);assert.equal(h.field('ghn-district').props.value,sample.district);assert.equal(h.field('ghn-ward').props.value,'');
    assert.equal(h.field('ghn-district').props.loading,false);assert.equal(h.button('Xong').props.disabled,true);assert.equal(h.commits.length,0);assert.equal(reads.length,sample.reads);
  }
});
await check('awaited complete recognizer stages correct tuple and Done commits only after confirmation',async()=>{
  const h=harness(async action=>action==='get_districts'?[district(11,1)]:[ward('a',11)]);
  h.field('ghn-street').props.onChange({target:{value:'12 Đường thử nghiệm Phường Test a Quận Test 11 Tỉnh Test 1'}});h.render();h.tick();await settle();h.render();
  assert.equal(h.alerts().length,0);assert.match(h.status().props.children[1],/Đã nhận diện đủ ba cấp/);
  assert.equal(h.field('ghn-province').props.value,'1');assert.equal(h.field('ghn-district').props.value,'11');assert.equal(h.field('ghn-ward').props.value,'a');
  assert.equal(h.button('Xong').props.disabled,false);assert.equal(h.commits.length,0);h.button('Xong').props.onClick();
  assert.equal(h.commits.length,1);assert.equal(h.commits[0].wardCode,'a');
});
const providerRow = (id, description='123 Đường giả lập, Phường Test a, Quận Test 11, Tỉnh Test 1') => ({place_id:id,description,main_text:'123 Đường giả lập',secondary_text:'Phường Test a, Quận Test 11, Tỉnh Test 1'});
const keyboard = key => ({key,nativeEvent:{isComposing:false},preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}});
const leaveAddress = h => { h.field('ghn-address-widget').props.onBlur({currentTarget:{contains:()=>false},relatedTarget:null});h.render(); };
await check('focus/click never transmit prefill; user-edited search reopens after blur and Escape only on deliberate action',async()=>{
  let calls=0;const h=harness(async action=>action==='address_autocomplete'?(calls++,[providerRow('focus')]):[],{configured:true});await settle();h.render();
  h.field('ghn-street').props.onFocus();h.field('ghn-street').props.onClick();h.render();h.tick();await settle();h.render();assert.equal(calls,0,'prefill focus is not consent to geocode it');
  h.field('ghn-street').props.onChange({target:{value:'123 User search'}});h.render();h.tick();await settle();h.render();assert.equal(calls,1);assert.equal(h.fullSuggestions().length,1);
  leaveAddress(h);assert.equal(h.fullSuggestions().length,0);h.field('ghn-street').props.onFocus();h.render();h.tick();await settle();h.render();assert.equal(calls,2);assert.equal(h.fullSuggestions().length,1);
  h.field('ghn-street').props.onClick();h.render();h.tick();await settle();h.render();assert.equal(calls,2,'focus followed by click must not duplicate a search');
  h.field('ghn-street').props.onKeyDown(keyboard('Escape'));h.render();h.tick();await settle();h.render();assert.equal(h.fullSuggestions().length,0);assert.equal(calls,2,'Escape must not reopen automatically');
  h.field('ghn-street').props.onClick();h.render();h.tick();await settle();h.render();assert.equal(calls,3);assert.equal(h.fullSuggestions().length,1);assert.equal(h.commits.length,0);
});
await check('selecting a suggestion clears refocus eligibility until the next real text edit',async()=>{
  let calls=0;const h=harness(async action=>action==='address_autocomplete'?(calls++,[providerRow('selected')]):action==='get_districts'?[district(11,1)]:[ward('a',11)],{configured:true});await settle();h.render();
  h.field('ghn-street').props.onChange({target:{value:'123 User search'}});h.render();h.tick();await settle();h.render();h.fullSuggestions()[0].props.onClick();h.render();h.tick();await settle();h.render();
  leaveAddress(h);h.field('ghn-street').props.onFocus();h.field('ghn-street').props.onClick();h.render();h.tick();await settle();h.render();assert.equal(calls,1);assert.equal(h.fullSuggestions().length,0);assert.equal(h.field('ghn-ward').props.value,'a');
  h.field('ghn-street').props.onChange({target:{value:'456 New user edit'}});h.render();h.tick();await settle();h.render();assert.equal(calls,2);assert.equal(h.fullSuggestions().length,1);
});
await check('unconfigured state is prominent and recheck enables the already typed query without changing GHN draft',async()=>{
  let enabled=false,calls=0,statusCalls=0;const h=harness(async action=>action==='address_autocomplete'?(calls++,[providerRow('enabled')]):[],()=>{statusCalls++;return{configured:enabled};});await settle();h.render();
  assert.match(h.field('ghn-address-provider-status').props.className,/border-amber/);assert.equal(h.button('Kiểm tra lại gợi ý').props.disabled,false);assert.equal(h.field('ghn-province').props.disabled,undefined);
  h.field('ghn-street').props.onChange({target:{value:'123 User query'}});h.render();h.tick();await settle();h.render();assert.equal(calls,0);
  enabled=true;h.button('Kiểm tra lại gợi ý').props.onClick();h.render();assert.equal(h.button('Kiểm tra lại gợi ý').props.disabled,true);assert.equal(h.field('ghn-address-provider-status').props['aria-busy'],true);
  await settle();h.render();h.tick();await settle();h.render();assert.equal(statusCalls,2);assert.equal(calls,1);assert.equal(h.fullSuggestions().length,1);assert.equal(h.field('ghn-street').props.value,'123 User query');assert.equal(h.field('ghn-province').props.value,'');assert.equal(h.commits.length,0);
});
await check('rechecking from unconfigured to enabled never transmits untouched prefill',async()=>{
  let enabled=false,calls=0;const h=harness(async()=>{calls++;return[];},()=>({configured:enabled}));await settle();h.render();enabled=true;h.button('Kiểm tra lại gợi ý').props.onClick();h.render();await settle();h.render();h.tick();await settle();h.render();
  h.field('ghn-street').props.onFocus();h.field('ghn-street').props.onClick();h.render();h.tick();await settle();h.render();assert.equal(calls,0);assert.equal(h.field('ghn-ward').props.value,'a');assert.equal(h.fullSuggestions().length,0);
});
await check('failed status can retry to enabled while preserving keyboard access and user query',async()=>{
  let failing=true,calls=0;const h=harness(async action=>action==='address_autocomplete'?(calls++,[providerRow('retried')]):[],()=>{if(failing)throw Error('Synthetic status failure');return{configured:true};});await settle();h.render();
  assert.match(h.field('ghn-address-provider-status').props.className,/border-destructive/);assert.equal(h.button('Kiểm tra lại gợi ý').props.disabled,false);
  h.field('ghn-street').props.onChange({target:{value:'123 Retry status'}});h.render();const tab=keyboard('Tab');h.field('ghn-street').props.onKeyDown(tab);h.render();assert.equal(tab.prevented,undefined);assert.ok(h.button('Kiểm tra lại gợi ý'));
  failing=false;h.button('Kiểm tra lại gợi ý').props.onClick();h.render();await settle();h.render();h.tick();await settle();h.render();assert.equal(calls,1);assert.equal(h.fullSuggestions().length,1);assert.equal(h.commits.length,0);
});
await check('keyboard status retry transfers focus before disabled-button native blur can clear the user query',async()=>{
  let enabled=false,calls=0,focused='retry';const h=harness(async action=>action==='address_autocomplete'?(calls++,[providerRow('keyboard-status')]):[],()=>({configured:enabled}));await settle();h.render();
  h.field('ghn-street').props.onChange({target:{value:'456 Keyboard status'}});h.render();
  // Tab stays inside the address widget. Disabling its focused retry button
  // would subsequently blur outside unless activation first hands focus back.
  h.field('ghn-address-widget').props.onBlur({currentTarget:{contains:node=>node==='retry'},relatedTarget:'retry'});h.render();
  h.field('ghn-street').ref.current={focus(){focused='street';h.field('ghn-address-widget').props.onBlur({currentTarget:{contains:node=>node==='street'},relatedTarget:'street'});h.field('ghn-street').props.onFocus();}};
  enabled=true;h.button('Kiểm tra lại gợi ý').props.onClick();h.render();
  if(focused==='retry')leaveAddress(h); // Simulate native blur when loading disables the button.
  assert.equal(focused,'street');assert.equal(h.button('Kiểm tra lại gợi ý').props.disabled,true);
  await settle();h.render();h.tick();await settle();h.render();assert.equal(calls,1);assert.equal(h.field('ghn-street').props.value,'456 Keyboard status');assert.equal(h.fullSuggestions().length,1);assert.equal(h.commits.length,0);
});
await check('full suggestions never query prefill; debounce user edit, select text and strict tuple only in draft until Done',async()=>{
  const calls=[],h=harness(async(action,body)=>{calls.push({action,body});return action==='address_autocomplete'?[providerRow('one')]:action==='get_districts'?[district(11,1)]:[ward('a',11)];},{configured:true});
  await settle();h.render();h.tick();await settle();h.render();assert.equal(calls.length,0,'prefill must not be sent to geocoder');
  h.field('ghn-street').props.onChange({target:{value:'123 Đường'}});h.render();assert.equal(calls.length,0,'debounce must run first');h.tick();await settle();h.render();
  assert.equal(h.fullSuggestions().length,1);assert.equal(h.field('ghn-street').props['aria-expanded'],true);assert.equal(h.commits.length,0);
  h.fullSuggestions()[0].props.onClick();h.render();h.tick();await settle();h.render();
  assert.equal(h.field('ghn-street').props.value,providerRow('one').description);assert.equal(h.field('ghn-ward').props.value,'a');assert.equal(h.commits.length,0);
  assert.equal(calls.filter(row=>row.action==='address_autocomplete').length,1,'select must not requery selected full address');
  assert.equal(calls.filter(row=>row.action==='calculate_fee').length,0,'nothing quotes before Done');h.button('Xong').props.onClick();assert.equal(h.commits[0].wardCode,'a');
});
await check('full suggestion race and manual changes reject late address provider responses',async()=>{
  const old=deferred(),next=deferred(),h=harness((action,body)=>action==='address_autocomplete'?(body.input==='old search'?old.promise:next.promise):Promise.resolve([]),{configured:true});
  await settle();h.render();
  h.field('ghn-street').props.onChange({target:{value:'old search'}});h.render();h.tick();await settle();
  h.field('ghn-street').props.onChange({target:{value:'new search'}});h.render();h.tick();await settle();next.resolve([providerRow('new')]);await settle();h.render();
  old.resolve([providerRow('old')]);await settle();h.render();assert.equal(h.fullSuggestions()[0].key,'new');
  const late=deferred(),manual=harness(action=>action==='address_autocomplete'?late.promise:Promise.resolve([district(22,2)]),{configured:true});await settle();manual.render();
  manual.field('ghn-street').props.onChange({target:{value:'pending search'}});manual.render();manual.tick();await settle();manual.field('ghn-province').props.onChange('2');manual.render();
  late.resolve([providerRow('too-late')]);await settle();manual.render();assert.equal(manual.fullSuggestions().length,0);assert.equal(manual.field('ghn-province').props.value,'2');
});
await check('selecting identical full description restarts pending GHN recognition and discards old generation',async()=>{
  const pending=deferred(),description=providerRow('same').description;let districtsRead=0;
  const h=harness(action=>action==='address_autocomplete'?Promise.resolve([providerRow('same')]):action==='get_districts'?(++districtsRead===1?pending.promise:Promise.resolve([district(11,1)])):Promise.resolve([ward('a',11)]),{configured:true});await settle();h.render();
  h.field('ghn-street').props.onChange({target:{value:description}});h.render();h.tick();await settle();h.render();
  assert.equal(districtsRead,1);assert.equal(h.fullSuggestions().length,1);assert.equal(h.button('Xong').props.disabled,true);
  h.fullSuggestions()[0].props.onClick();h.render();h.tick();await settle();h.render();
  assert.equal(districtsRead,2,'same-text selection must restart recognition effect');assert.equal(h.field('ghn-ward').props.value,'a');assert.equal(h.button('Xong').props.disabled,false);assert.equal(h.commits.length,0);
  pending.resolve([district(99,1)]);await settle();h.render();assert.equal(h.field('ghn-district').props.value,'11');assert.equal(h.field('ghn-ward').props.value,'a');
  h.button('Xong').props.onClick();assert.equal(h.commits[0].address,description);assert.equal(h.commits[0].districtId,'11');
});
await check('Tab preserves keyboard retry target until focus leaves address widget',async()=>{
  let failed=true,calls=0;const h=harness(async action=>{if(action==='address_autocomplete'){calls++;if(failed)throw Error('Synthetic retry');return[providerRow('retry')];}return[];},{configured:true});await settle();h.render();
  h.field('ghn-street').props.onChange({target:{value:'123 Retry'}});h.render();h.tick();await settle();h.render();assert.ok(h.button('Thử lại gợi ý'));
  const tab=keyboard('Tab');h.field('ghn-street').props.onKeyDown(tab);h.render();assert.ok(h.button('Thử lại gợi ý'),'Tab must retain retry button for browser default focus movement');assert.equal(tab.prevented,undefined);assert.equal(h.field('ghn-street').props['aria-expanded'],true);
  failed=false;h.button('Thử lại gợi ý').props.onClick();h.render();h.tick();await settle();h.render();assert.equal(calls,2);assert.equal(h.fullSuggestions().length,1);assert.equal(h.commits.length,0);
});
await check('suggestion overlay stays outside layout flow so blur cannot move Cancel or manual controls before click',async()=>{
  const h=harness(async action=>action==='address_autocomplete'?[providerRow('one')]:[],{configured:true});await settle();h.render();
  h.field('ghn-street').props.onChange({target:{value:'123 Test'}});h.render();h.tick();await settle();h.render();
  assert.equal(h.field('ghn-address-anchor').props.className,'relative');
  const list=h.field('ghn-address-options');assert.equal(list.props.role,'listbox');assert.match(list.props.className,/\babsolute\b/);assert.match(list.props.className,/\btop-full\b/);assert.match(list.props.className,/35dvh/);assert.match(list.props.className,/overflow-y-auto/);
  assert.equal(h.field('ghn-address-anchor').props.children[1],list,'list must be anchored beside input, outside document flow');
  h.field('ghn-street').props.onKeyDown(keyboard('Escape'));h.render();assert.equal(h.field('ghn-address-options'),undefined);assert.ok(h.button('Hủy'));h.button('Hủy').props.onClick();assert.equal(h.cancels.length,1);assert.equal(h.commits.length,0);
});
await check('keyboard/IME and first Escape close suggestions without cancelling address dialog',async()=>{
  let calls=0;const h=harness(async action=>action==='address_autocomplete'?(calls++,[providerRow('one'),providerRow('two','456 Đường giả lập, Tỉnh Test 1')]):[],{configured:true});await settle();h.render();
  h.field('ghn-street').props.onCompositionStart();h.render();h.field('ghn-street').props.onChange({target:{value:'123 Đường'}});h.render();h.tick();await settle();h.render();assert.equal(calls,0,'IME composition must not query');
  h.field('ghn-street').props.onCompositionEnd();h.render();h.tick();await settle();h.render();assert.equal(calls,1);
  h.field('ghn-street').props.onKeyDown(keyboard('ArrowDown'));h.render();assert.equal(h.field('ghn-street').props['aria-activedescendant'],'ghn-address-option-1');
  h.field('ghn-street').props.onKeyDown(keyboard('Enter'));h.render();assert.match(h.field('ghn-street').props.value,/^456/);assert.equal(h.commits.length,0);
  h.field('ghn-street').props.onChange({target:{value:'123 retry'}});h.render();h.tick();await settle();h.render();const escape=keyboard('Escape');h.content().props.onEscapeKeyDown(escape);h.render();
  assert.equal(escape.prevented,true);assert.equal(h.cancels.length,0);assert.equal(h.fullSuggestions().length,0);h.dialog().props.onOpenChange(false);assert.equal(h.cancels.length,1);
});
await check('two-level selected suggestion keeps full text and requires manual GHN district; provider errors retry explicitly',async()=>{
  let fail=true,calls=0;const chosen=providerRow('two-level','123 Đường giả lập, Phường Test a, Tỉnh Test 1');
  const h=harness(async action=>{if(action==='address_autocomplete'){calls++;if(fail)throw Error('Synthetic retry');return[chosen];}return action==='get_districts'?[district(11,1)]:[ward('a',11)];},{configured:true});await settle();h.render();
  h.field('ghn-street').props.onChange({target:{value:'123 Đường'}});h.render();h.tick();await settle();h.render();assert.equal(h.alerts().length,1);assert.equal(calls,1);
  h.render();h.tick();await settle();h.render();assert.equal(calls,1,'failure must not retry automatically');fail=false;h.button('Thử lại gợi ý').props.onClick();h.render();h.tick();await settle();h.render();
  h.fullSuggestions()[0].props.onClick();h.render();h.tick();await settle();h.render();assert.equal(h.field('ghn-street').props.value,chosen.description);assert.equal(h.field('ghn-district').props.value,'');assert.equal(h.field('ghn-ward').props.value,'');assert.equal(h.button('Xong').props.disabled,true);
});
await check('unconfigured, empty and Cancel/unmount keep manual mode and discard late provider result',async()=>{
  let calls=0;const disabled=harness(async()=>{calls++;return[];},{configured:false});await settle();disabled.render();disabled.field('ghn-street').props.onChange({target:{value:'123 Test'}});disabled.render();disabled.tick();await settle();disabled.render();assert.equal(calls,0);assert.equal(disabled.fullSuggestions().length,0);assert.equal(disabled.field('ghn-province').props.disabled,undefined);
  const pending=deferred(),h=harness(action=>action==='address_autocomplete'?pending.promise:Promise.resolve([]),{configured:true});await settle();h.render();h.field('ghn-street').props.onChange({target:{value:'123 Test'}});h.render();h.tick();await settle();h.button('Hủy').props.onClick();h.unmount();pending.resolve([providerRow('late')]);await settle();h.render();assert.equal(h.fullSuggestions().length,0);assert.equal(h.commits.length,0);
  const empty=harness(async()=>[],{configured:true});await settle();empty.render();empty.field('ghn-street').props.onChange({target:{value:'123 Test'}});empty.render();empty.tick();await settle();empty.render();assert.equal(empty.fullSuggestions().length,0);assert.equal(empty.alerts().length,0);assert.equal(empty.button('Xong').props.disabled,true);
});
await check('failed-delivery COD is validated, fingerprinted and sent unchanged in fee snapshot',()=>{
  const input={provinceId:'1',districtId:'11',wardCode:'a',address:'12 Test',cod:10,insurance:20,parcel:{weight:20000,length:20,width:30,height:40}};
  const zero=buildGhnQuoteSnapshot({...input,codFailed:0}).snapshot,paid=buildGhnQuoteSnapshot({...input,codFailed:20000}).snapshot;
  assert.notEqual(zero.key,paid.key);assert.equal(paid.feeData.cod_failed_amount,20000);assert.equal(zero.feeData.cod_failed_amount,0);
  for(const invalid of [-1,0.5,50000001,NaN])assert.equal(buildGhnQuoteSnapshot({...input,codFailed:invalid}).snapshot,null);
});
console.log('PASS '+groups+' GHN-like form groups (real handlers + pure helpers, synthetic only).');
