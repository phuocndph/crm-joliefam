// TEST-ONLY: pure comparison and simulated component handlers. No browser, DOM,
// environment files, database, network, GHN provider or operational runtime.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { buildGhnQuoteSnapshot, compareGhnShopQuotes, createGhnQuoteSession, findGhnAutomaticCheapest, findGhnSelectedQuote, ghnServiceChoiceKey, StaleGhnQuoteError } from '../src/lib/ghn-quote-comparison.ts';
import { normalizeGhnAddress } from '../src/lib/ghn-address-match.ts';

let count = 0;
const check = async (name, run) => { await run(); count++; console.log('PASS GHN auto-selection UX: ' + name); };
const shop = _id => ({ _id, name: 'test shop ' + _id, address: 'test pickup ' + _id, district_id: _id + 100 });
const service = (id, type) => ({ service_id: id, service_type_id: type, short_name: 'test type ' + type });
const shops = [3, 1, 2].map(shop);
const input = { provinceId: '202', districtId: '1444', wardCode: '020308', address: 'test address', items: [{ name: 'test item', quantity: 1, weight: 1000, length: 10, width: 10, height: 10 }], cod: 0, insurance: 0 };
const snapshot = buildGhnQuoteSnapshot(input).snapshot;
assert.ok(snapshot);
const row = (id, type, total) => ({ shop: shop(id), service: service(53320, type), total, services: [service(53320, 2), service(53320, 5)], snapshotKey: snapshot.key });

await check('auto recommendation fails closed for null, empty, partial and any stale row', () => {
  const a = row(1, 2, 10000), b = row(2, 5, 12000);
  for (const result of [null, { quotes: [], failures: [], noServices: [] }, { quotes: [a], failures: [{ shop: shop(2), message: 'test failure' }], noServices: [] }, { quotes: [a, { ...b, snapshotKey: 'old' }], failures: [], noServices: [] }]) {
    assert.equal(findGhnAutomaticCheapest(result, snapshot.key), undefined);
  }
  assert.equal(findGhnAutomaticCheapest({ quotes: [a], failures: [], noServices: [] }, undefined), undefined);
  assert.equal(findGhnAutomaticCheapest({ quotes: [a], failures: [], noServices: [shop(3)] }, snapshot.key), a, 'known no-service shop is a completed exclusion');
});
await check('full matrix picks total zero correctly and deterministic tie by shop/type/ID', async () => {
  const session = createGhnQuoteSession(async (action) => action === 'get_services' ? [service(900, 5), service(901, 2), service(899, 2)] : { total: 0 });
  const result = await compareGhnShopQuotes(session, shops, snapshot);
  assert.equal(result.quotes.length, 9);
  assert.equal(result.failures.length, 0);
  const chosen = findGhnAutomaticCheapest(result, snapshot.key);
  assert.deepEqual([chosen.shop._id, chosen.service.service_type_id, chosen.service.service_id, chosen.total], [1, 2, 899, 0]);
  assert.deepEqual(result.quotes.map(r => [r.shop._id, r.service.service_type_id, r.service.service_id]), [[1,2,899],[1,2,901],[1,5,900],[2,2,899],[2,2,901],[2,5,900],[3,2,899],[3,2,901],[3,5,900]]);
});
await check('shared service ID/type stays distinct and exact manual selected quote is retained', async () => {
  const session = createGhnQuoteSession(async (action, body) => action === 'get_services' ? [service(53320, 2), service(53320, 5)] : { total: Number(body.shopId) * 10000 + body.feeData.service_type_id });
  const result = await compareGhnShopQuotes(session, shops, snapshot);
  assert.notEqual(ghnServiceChoiceKey(service(53320,2)), ghnServiceChoiceKey(service(53320,5)));
  assert.equal(findGhnSelectedQuote(result, snapshot.key, '3', service(53320,5)).total, 30005);
  assert.equal(findGhnAutomaticCheapest(result, snapshot.key).total, 10002);
  assert.equal(findGhnSelectedQuote(result, 'stale', '3', service(53320,5)), undefined);
});
await check('partial and all-failed results never become auto cheapest; successful retry recovers', async () => {
  let fail = true;
  const session = createGhnQuoteSession(async (action, body) => {
    if (action === 'get_services') return [service(53320,2)];
    if (fail && body.shopId === '2') throw new Error('test shop failure');
    return { total: Number(body.shopId) * 1000 };
  });
  const partial = await compareGhnShopQuotes(session, shops, snapshot);
  assert.equal(partial.quotes.length, 2); assert.equal(findGhnAutomaticCheapest(partial,snapshot.key),undefined);
  fail = false; session.invalidate();
  const recovered = await compareGhnShopQuotes(session, shops,snapshot);
  assert.equal(recovered.failures.length,0); assert.equal(findGhnAutomaticCheapest(recovered,snapshot.key).shop._id,1);
  const allFailed = await compareGhnShopQuotes(createGhnQuoteSession(async()=>{throw new Error('test all failed');}),shops,snapshot);
  assert.equal(allFailed.failures.length,3); assert.equal(findGhnAutomaticCheapest(allFailed,snapshot.key),undefined);
  const unavailable = await compareGhnShopQuotes(createGhnQuoteSession(async()=>[]),shops,snapshot);
  assert.equal(unavailable.noServices.length,3);assert.equal(findGhnAutomaticCheapest(unavailable,snapshot.key),undefined);
});
await check('same-payload refresh gets changed cheapest shop; no old auto result survives invalidation', async () => {
  let phase = 0;
  const session = createGhnQuoteSession(async(action,body)=>action==='get_services'?[service(53320,2)]:{total: phase === 0 ? Number(body.shopId)*1000 : (4-Number(body.shopId))*1000});
  const first = await compareGhnShopQuotes(session,shops,snapshot);assert.equal(findGhnAutomaticCheapest(first,snapshot.key).shop._id,1);
  phase=1;session.invalidate();const second=await compareGhnShopQuotes(session,shops,snapshot);assert.equal(findGhnAutomaticCheapest(second,snapshot.key).shop._id,3);
  let release;
  const pendingSession=createGhnQuoteSession(async(action)=>action==='get_services'?[service(53320,2)]:new Promise(resolve=>{release=()=>resolve({total:1});}));
  const pending=compareGhnShopQuotes(pendingSession,[shop(1)],snapshot);const rejection=assert.rejects(pending,StaleGhnQuoteError);
  for(let n=0;n<10&&!release;n++)await Promise.resolve();assert.ok(release);pendingSession.invalidate();release();await rejection;
});

// Exercise the real component's JSX event handlers with a tiny deterministic
// hook simulator. This is not browser/rendered interaction or accessibility QA.
const source = await readFile(new URL('../src/components/GhnDirectorySearch.tsx',import.meta.url),'utf8');
const require = createRequire(import.meta.url);
function componentHarness(props) {
  const hooks=[];let cursor=0,pending=[],tree,dirty=false;
  const dependenciesEqual=(a,b)=>Boolean(a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index])));
  const react={
    useState(initial){const at=cursor++;if(!(at in hooks))hooks[at]={value:typeof initial==='function'?initial():initial};return[hooks[at].value,next=>{const value=typeof next==='function'?next(hooks[at].value):next;if(!Object.is(value,hooks[at].value)){hooks[at].value=value;dirty=true;}}];},
    useRef(initial){const at=cursor++;if(!(at in hooks))hooks[at]={current:initial};return hooks[at];},
    useEffect(effect,deps){const at=cursor++;if(!dependenciesEqual(hooks[at]?.deps,deps)){hooks[at]={deps};pending.push(effect);}},
  };
  const module={exports:{}};
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>name==='react'?react:name==='@/components/ui/input'?{Input:'input'}:name==='@/lib/ghn-address-match'?{normalizeGhnAddress}:require(name)});
  const render=()=>{for(let n=0;n<20;n++){cursor=0;pending=[];dirty=false;tree=module.exports.GhnDirectorySearch(props);pending.forEach(run=>run());if(!dirty)return tree;}throw new Error('hook state did not settle');};
  const visit=(node,predicate)=>{if(Array.isArray(node))return node.flatMap(child=>visit(child,predicate));if(!node||typeof node!=='object')return[];return[...(predicate(node)?[node]:[]),...visit(node.props?.children,predicate)];};
  render();return {render,find:role=>visit(tree,node=>node.props?.role===role),root:()=>tree,setProps:next=>{props={...props,...next};return render();}};
}
const options=[{value:'HN',label:'Thành phố Hà Nội',aliases:['Ha Noi']},{value:'HNa',label:'Tỉnh Hà Nam'},{value:'HCM',label:'Thành phố Hồ Chí Minh',aliases:['Sài Gòn','TP.HCM']}];
const event=key=>({key,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}});
await check('directory real handlers: accents/aliases, keyboard selection, Escape/Tab and bounded index',()=>{
  const selected=[];let searches=0;
  const harness=componentHarness({id:'test-province',label:'Tỉnh/thành',value:'HCM',options,onSearch:()=>searches++,onChange:value=>selected.push(value)});
  const input=()=>harness.find('combobox')[0];
  assert.equal(input().props.value,'Thành phố Hồ Chí Minh');input().props.onFocus();harness.render();
  input().props.onChange({target:{value:'ha'}});harness.render();assert.equal(searches,1);assert.equal(harness.find('option').length,2);
  input().props.onKeyDown(event('ArrowDown'));harness.render();assert.equal(input().props['aria-activedescendant'],'test-province-option-1');
  input().props.onKeyDown(event('ArrowDown'));harness.render();assert.equal(input().props['aria-activedescendant'],'test-province-option-1');
  input().props.onKeyDown(event('ArrowUp'));harness.render();assert.equal(input().props['aria-activedescendant'],'test-province-option-0');
  input().props.onKeyDown(event('ArrowDown'));harness.render();const enter=event('Enter');input().props.onKeyDown(enter);harness.render();assert.ok(enter.prevented);assert.deepEqual(selected,['HNa']);assert.equal(input().props['aria-expanded'],false);
  harness.setProps({value:'HNa'});input().props.onFocus();harness.render();input().props.onChange({target:{value:'sai gon'}});harness.render();assert.equal(harness.find('option')[0].props.children,'Thành phố Hồ Chí Minh');
  const escape=event('Escape');input().props.onKeyDown(escape);harness.render();assert.ok(escape.prevented&&escape.stopped);assert.equal(input().props.value,'Tỉnh Hà Nam');assert.equal(input().props['aria-expanded'],false);
  input().props.onFocus();harness.render();const tab=event('Tab');input().props.onKeyDown(tab);harness.render();assert.equal(tab.prevented,false);assert.equal(input().props['aria-expanded'],false);
});
await check('directory loading/disabled/parent resets and no-match Enter are safe',()=>{
  let changes=0;const harness=componentHarness({id:'test-dir',label:'Địa chỉ',value:'HN',options,onSearch:()=>{},onChange:()=>changes++});const input=()=>harness.find('combobox')[0];
  input().props.onFocus();harness.render();input().props.onChange({target:{value:'not found'}});harness.render();assert.equal(harness.find('option').length,0);const enter=event('Enter');input().props.onKeyDown(enter);harness.render();assert.ok(enter.prevented);assert.equal(changes,0);
  harness.setProps({parentKey:'new-parent'});assert.equal(input().props['aria-expanded'],false);
  harness.setProps({loading:true});assert.equal(input().props.disabled,true);assert.equal(input().props.placeholder,'Đang tải…');
  harness.setProps({loading:false,disabled:true});assert.equal(input().props.disabled,true);assert.equal(harness.find('listbox').length,0);
});
await check('directory reclick reopens after mouse selection/Escape without clearing an active query',()=>{
  const selected=[];const harness=componentHarness({id:'test-reclick',label:'Tỉnh/thành',value:'HCM',options,onSearch:()=>{},onChange:value=>selected.push(value)});const input=()=>harness.find('combobox')[0];
  input().props.onFocus();harness.render();harness.find('option')[0].props.onClick();harness.render();assert.deepEqual(selected,['HN']);assert.equal(input().props['aria-expanded'],false);
  harness.setProps({value:'HN'});assert.equal(typeof input().props.onClick,'function','same focused input needs a click handler, not focus alone');
  input().props.onClick();harness.render();assert.equal(input().props['aria-expanded'],true,'click reopens without a new focus event');
  input().props.onChange({target:{value:'ha n'}});harness.render();input().props.onClick();harness.render();assert.equal(input().props.value,'ha n','ordinary input click preserves active search');
  input().props.onKeyDown(event('Escape'));harness.render();assert.equal(input().props['aria-expanded'],false);input().props.onClick();harness.render();assert.equal(input().props['aria-expanded'],true,'click reopens after Escape');
});

const dialog=await readFile(new URL('../src/components/LocalCreateGHNOrderDialog.tsx',import.meta.url),'utf8');
await check('dialog Escape capture contract prevents only its own expanded GHN picker dismissal',()=>{
  // Extract and execute the actual JSX callback, not a duplicate implementation.
  // DOM containment and selector matching below are synthetic contracts; browser
  // capture/bubble ordering must still be verified through the fixture UI.
  const parsed=ts.createSourceFile('LocalCreateGHNOrderDialog.tsx',dialog,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let handler;
  const visit=node=>{if(ts.isJsxAttribute(node)&&node.name.getText(parsed)==='onEscapeKeyDown')handler=node.initializer.expression;ts.forEachChild(node,visit);};visit(parsed);assert.ok(handler,'local Radix callback exists');
  const javascript=ts.transpileModule('const callback = '+handler.getText(parsed)+';',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const harness=componentHarness({id:'test-escape',label:'Tỉnh/thành',value:'HN',options,onSearch:()=>{},onChange:()=>{}});const input=()=>harness.find('combobox')[0];
  assert.equal(input().props['data-ghn-directory-combobox'],'true');
  input().props.onFocus();harness.render();
  const focused={matches:selector=>selector==='[data-ghn-directory-combobox="true"][aria-expanded="true"]'&&input().props['data-ghn-directory-combobox']==='true'&&input().props['aria-expanded']===true};
  const reference={current:{ownerDocument:{activeElement:focused},contains:node=>node===focused}};
  const callback=vm.runInNewContext(javascript+'\ncallback;',{dialogContent:reference});
  const capture=event('Escape');callback(capture);assert.equal(capture.prevented,true,'Radix capture sees expanded child');
  const bubble=event('Escape');input().props.onKeyDown(bubble);harness.render();assert.ok(bubble.prevented&&bubble.stopped);assert.equal(input().props['aria-expanded'],false,'picker still closes itself');
  const closed=event('Escape');callback(closed);assert.equal(closed.prevented,false,'normal Escape remains available after child closes');
  reference.current.ownerDocument.activeElement={matches:()=>false};const other=event('Escape');callback(other);assert.equal(other.prevented,false,'ordinary field does not block dialog dismissal');
  reference.current.ownerDocument.activeElement={matches:()=>true};const outside=event('Escape');callback(outside);assert.equal(outside.prevented,false,'expanded picker outside this dialog is not intercepted');
  reference.current=null;assert.doesNotThrow(()=>callback(event('Escape')),'unmounted dialog safe');
});
await check('static dialog wiring: auto default, all-shop comparison, intent guards and render-time create gating',()=>{
  assert.match(dialog,/useState<'auto'\|'manual'>\('auto'\)/);
  assert.match(dialog,/compareGhnShopQuotes\(session,shops,snapshot\)/);
  assert.match(dialog,/selectionIntent\.current!==intent\|\|latestMode\.current!=='auto'/);
  assert.match(dialog,/selectionIntent\.current\+\+;latestMode\.current=mode/);
  assert.match(dialog,/const currentComparison=comparison\?\.context===quoteContext\?comparison.data:null/);
  assert.match(dialog,/const autoSelectionReady=selectionMode==='manual'\|\|Boolean\(automaticCheapest/);
  assert.match(dialog,/if\(!recoveryReady\|\|locked\|\|attempt\|\|matchingAddress\|\|compareBusy\|\|dataBusy\|\|feeBusy\|\|!autoSelectionReady/);
  assert.match(dialog,/disabled=\{!recoveryReady\|\|locked\|\|matchingAddress\|\|dataBusy\|\|feeBusy\|\|compareBusy\|\|!autoSelectionReady/);
  const refresh=dialog.slice(dialog.indexOf('const refreshQuote='),dialog.indexOf('const applyAttempt='));
  assert.match(refresh,/selectionMode==='manual'&&\(!shopId\|\|!selectedService\)/);assert.match(refresh,/invalidate\(\)/);assert.match(refresh,/setQuoteRevision/);
});
await check('static address/layout wiring uses one directory per level and parent-child clear, scroll body/fixed footer',()=>{
  assert.equal((dialog.match(/<GhnDirectorySearch /g)||[]).length,3);
  assert.match(dialog,/const selectProvince=[\s\S]*?setProvinceId\(value\);setDistrictId\(''\);setWardCode\(''\)/);
  assert.match(dialog,/const selectDistrict=[\s\S]*?setDistrictId\(value\);setWardCode\(''\)/);
  assert.match(dialog,/parentKey=\{provinceId\}/);assert.match(dialog,/parentKey=\{districtId\}/);
  assert.match(dialog,/min-h-0 flex-1[^"\n]*overflow-y-auto/);assert.match(dialog,/shrink-0[^"\n]*border-t/);
});
console.log('PASS '+count+' GHN auto-selection UX groups (pure/synthetic handlers + static wiring, not rendered browser interaction).');
