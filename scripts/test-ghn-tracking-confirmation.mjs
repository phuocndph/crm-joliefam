// Runs the actual delete handler against synthetic callbacks. No database/network.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {ghnStatusLabel,ghnStatusOptions} from '../src/lib/ghn-status.ts';
for(const option of ghnStatusOptions){assert.equal(ghnStatusLabel(option.value),option.label);assert.notEqual(option.label,option.value);}
assert.equal(ghnStatusLabel('storing'),'Đang lưu kho');
assert.equal(ghnStatusLabel('delivered'),'Đã giao hàng');
assert.equal(ghnStatusLabel('future_carrier_status'),'Trạng thái khác');
assert.equal(ghnStatusLabel(null),'Chưa có trạng thái');
assert.equal(new Set(ghnStatusOptions.map(o=>o.value)).size,ghnStatusOptions.length);
const source=await readFile(new URL('../src/pages/GHNTrackingPage.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let initializer;
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='confirmRemoveTracking')initializer=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);
assert.ok(initializer);
const javascript=ts.transpileModule('const handler='+initializer,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';handler';
function harness(local=true){let calls=[],target={id:'synthetic-id',ghn_order_code:'SYNTHETIC'},busy=false,resolve,fail=false;const wait=new Promise(r=>resolve=r);const state={deleteTarget:target,deleteBusy:{current:false},isLocalBackend:()=>local,setDeleting:v=>busy=v,localApi:{deleteGhnTracking:async id=>{calls.push(id);await wait;if(fail)throw Error('synthetic');}},supabase:{from:()=>({delete:()=>({eq:async (_key,id)=>{calls.push(id);await wait;return{error:fail?Error('synthetic'):null};}})})},setSelectedOrders:fn=>fn(new Set(['SYNTHETIC'])),setDeleteTarget:v=>target=v,toast:{success:()=>{},error:()=>{}},loadTrackingData:async()=>{}};return{state,calls,handler:vm.runInNewContext(javascript,state),release:()=>resolve(),get target(){return target},get busy(){return busy},fail:()=>fail=true};}
for(const local of [true,false]){
 const h=harness(local);const first=h.handler();assert.equal(h.busy,true);await h.handler();assert.equal(h.calls.length,1);h.release();await first;assert.equal(h.target,null);assert.equal(h.busy,false);
 const failed=harness(local);failed.fail();const pending=failed.handler();failed.release();await pending;assert.ok(failed.target);assert.equal(failed.busy,false);
 const empty=harness(local);empty.state.deleteTarget=null;await empty.handler();assert.equal(empty.calls.length,0);
}
assert.match(source,/onClick=\{\(\) => \{ if \(!deleteBusy.current\) setDeleteTarget\(item\); \}\}/);
assert.match(source,/deleteCancel.current\?\.focus\(\)/);
assert.match(source,/AlertDialogCancel ref=\{deleteCancel\} disabled=\{deleting\}/);
assert.equal(source.includes('removeTracking(item.id)'),false);
console.log('PASS GHN status labels and confirmed deletion: local/cloud duplicate guard, failure retry, no target, safe cancel focus. Synthetic only.');
