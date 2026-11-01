import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';

const root=process.cwd(),stage=path.join(root,'.local-staging-runtime/item5a-receipt-session-20261029');
const label=process.argv.find(v=>v.startsWith('--run-label='))?.slice(12)||'editor';assert.match(label,/^[a-z0-9-]{1,40}$/);
const {outputFiles}=await build({entryPoints:[path.join(root,'src/lib/labor-requirement-receipts.ts')],bundle:true,write:false,format:'iife',globalName:'receipts',platform:'browser',plugins:[{name:'public-runtime-only',setup(b){b.onResolve({filter:/^\.\/runtime-config$/},()=>({path:'runtime',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:'export const localApiUrl=()=>globalThis.backend;',loader:'js'}));}}]});
const bundle=outputFiles[0].text,backend='https://api.fixture.invalid',code='fixture',actor='A',sourceDate='2026-10-29';
const definition={schema_version:2,disposition:'SEWING_APPLICABLE',stage:'SEWING',family:'PILLOW_CASE',required_fields:['manufacturing_type'],conditional_fields:[],conditions:{manufacturing_type:{op:'eq',value:'PILLOW_CASE'}}};
const command={idempotency_key:'original-key',code_key:code,semantic_fingerprint:'source-semantic',source_hash:'source-hash',expected_stream_revision:1,expected_proposal_revision:0,reason:'Lý do gốc',source_date:sourceDate,definition,submitted:false};
const proposalResult={stream_id:'stream',stream_revision:1,proposal_id:'proposal',proposal_revision:1,proposal_hash:'proposal-hash',reused:false};
const key=(a=actor,c=code,b=backend)=>'crm:requirement-receipt:v1:'+JSON.stringify([a,b,c]);
function fake(){const map=new Map(),calls=[],faults={};return {map,calls,faults,getItem(k){calls.push(['get',k]);if(faults.get)throw new Error('DENIED_GET');return map.get(k)??null;},setItem(k,v){calls.push(['set',k]);if(faults.set)throw new Error('QUOTA_OR_DENIED_SET');if(!faults.silentSet)map.set(k,v);if(faults.afterSet)throw new Error('AFTER_SET');},removeItem(k){calls.push(['remove',k]);if(faults.remove)throw new Error('DENIED_REMOVE');map.delete(k);if(faults.afterRemove)throw new Error('AFTER_REMOVE');}};}
function realm(storage=fake(),b=backend){const context=vm.createContext({sessionStorage:storage,crypto:webcrypto,backend:b,URL});vm.runInContext('globalThis.structuredClone=value=>JSON.parse(JSON.stringify(value));',context);vm.runInContext(bundle,context);return{storage,context,run(fn,...args){context.input=JSON.stringify(args);return JSON.parse(vm.runInContext(`JSON.stringify((${fn.toString()})(...JSON.parse(input)))`,context)??'null');},hmr(){vm.runInContext('globalThis.oldReceipts=receipts;',context);vm.runInContext(bundle,context);}};}
const state=r=>r.run(()=>receipts.getRequirementReceiptState('A','fixture'));
const begin=(r,p=command,action='proposals',date=sourceDate)=>r.run((payload,action,date)=>receipts.beginRequirementReceipt('A','fixture',action,payload,date),p,action,date);
const transition=(r,phase='UNCERTAIN',response)=>r.run((phase,response)=>receipts.transitionRequirementReceipt(receipts.getRequirementReceipt('A','fixture'),phase,response),phase,response);
const recover=r=>r.run(()=>receipts.recoverRequirementReceiptStorage('A','fixture'));
const checks=[];let assertions=0;
function equal(actual,expected){assert.deepEqual(actual,expected);assertions++;}
async function check(name,work){await work();checks.push({name,status:'PASS'});console.log('PASS '+name);}
try{
 await check('Persist-before-return, deep freeze, exact retry and action-specific positive wires',()=>{
  for(const action of ['proposals','approve','retire']){
   const r=realm(),payload=action==='proposals'?command:{...command,effective_from:sourceDate};if(action!=='proposals'){delete payload.source_date;delete payload.definition;delete payload.submitted;if(action==='approve'){payload.proposal_id='proposal';payload.proposal_hash='hash';payload.effective_to=null;}}
   const first=begin(r,payload,action);equal(JSON.parse(r.storage.map.get(key())).receipt.payload,payload);equal(first.phase,'SENDING');
   equal(r.run(()=>{const x=receipts.getRequirementReceipt('A','fixture');try{x.payload.reason='tampered';}catch{}return Object.isFrozen(x)&&Object.isFrozen(x.payload)&&x.payload.reason==='Lý do gốc';}),true);
   transition(r);const saved=state(r).receipt;const retry=r.run(()=>{const x=receipts.getRequirementReceipt('A','fixture');return receipts.beginRequirementReceipt('A','fixture','retire',{bad:'replacement'},'2099-12-31',x);});equal(retry.payload,payload);equal(retry.sourceDate,sourceDate);equal(retry.action,action);assert.notEqual(retry.token,saved.token);assertions++;
   const result=action==='proposals'?proposalResult:{stream_id:'stream',stream_revision:2,action:action==='approve'?'APPROVE':'RETIRE',content_hash:'hash',reused:false};transition(r,'COMMITTED',result);const restored=realm(r.storage);equal(state(restored).receipt.phase,'COMMITTED');equal(state(restored).receipt.result,result);
  }
 });
 await check('Fresh realms hydrate SENDING as UNCERTAIN, retain command/key/date, zero side effects',()=>{
  const r=realm();begin(r);const bytes=r.storage.map.get(key());r.storage.calls.length=0;const fresh=realm(r.storage);equal(state(fresh).receipt.phase,'UNCERTAIN');equal(state(fresh).receipt.payload,command);equal(state(fresh).receipt.sourceDate,sourceDate);equal(r.storage.map.get(key()),bytes);equal(r.storage.calls.filter(c=>c[0]!=='get'),[]);
 });
 await check('Actor/backend/code exact isolation and no auth/session secret fields persisted',()=>{
  const r=realm();begin(r);equal(r.run(()=>receipts.getRequirementReceipt('B','fixture')),null);equal(r.run(()=>receipts.getRequirementReceipt('A','different-code')),null);equal(state(realm(r.storage,'https://other-api.fixture.invalid')).receipt,null);equal(r.storage.map.size,1);const raw=r.storage.map.get(key());assert.ok(!/authorization|password|bearer|access_token|refresh_token|role/.test(raw));assertions++;
  for(const badBackend of ['https://user:secret@api.fixture.invalid','https://api.fixture.invalid?token=secret','https://api.fixture.invalid#secret','javascript:secret']){const isolated=realm(fake(),badBackend);equal(begin(isolated),null);equal(state(isolated).blocked,true);equal(isolated.storage.map.size,0);}
 });
 await check('Malformed, empty, unknown-version/scope/action/date/result and oversized wire retained failclosed',()=>{
  const original=realm();begin(original);const base=JSON.parse(original.storage.map.get(key()));
  const mutate=fn=>{const value=structuredClone(base);fn(value);return JSON.stringify(value);};
  const bad=['','{','null',mutate(w=>w.version=2),mutate(w=>w.unknown=true),mutate(w=>w.receipt.actor='B'),mutate(w=>w.receipt.backend='https://other.invalid'),mutate(w=>w.receipt.code='other'),mutate(w=>w.receipt.payload.code_key='other'),mutate(w=>w.receipt.action='install'),mutate(w=>w.receipt.sourceDate='2026-02-30'),mutate(w=>w.receipt.payload.expected_stream_revision=-1),mutate(w=>w.receipt.payload.definition.schema_version=99),mutate(w=>w.receipt.payload.definition.conditions.x={op:'unknown'}),mutate(w=>w.receipt.payload.idempotency_key=''),mutate(w=>w.receipt.payload.access_token='secret'),mutate(w=>w.receipt.phase='COMMITTED'),mutate(w=>w.receipt.result=proposalResult),mutate(w=>{w.receipt.phase='COMMITTED';w.receipt.result={...proposalResult,action:'RETIRE'};}),' '.repeat(131073)];
  for(const raw of bad){const s=fake();s.map.set(key(),raw);const r=realm(s);equal(state(r).blocked,true);equal(begin(r),null);equal(recover(r),false);equal(s.map.get(key()),raw);equal(s.calls.filter(c=>c[0]!=='get'),[]);}
 });
 await check('New invalid input remains editable without storage reset; corrected input can save',()=>{
  for(const invalid of [{...command,definition:{...definition,conditions:{manufacturing_type:{op:'eq',value:''}}}},{...command,source_date:'2026-02-30'},{...command,expected_stream_revision:-1}]){const r=realm();equal(begin(r,invalid),null);equal(state(r).blocked,false);equal(state(r).receipt,null);equal(r.storage.calls.filter(c=>c[0]==='set'),[]);equal(begin(r)?.phase,'SENDING');}
 });
 await check('Denied get and quota/set/verification failures block before send; explicit recovery exact only',()=>{
  for(const fault of ['get','set','silentSet','afterSet']){const r=realm();if(fault!=='get')state(r);r.storage.faults[fault]=true;equal(begin(r),null);equal(state(r).blocked,true);equal(begin(r),null);equal(recover(r),false);r.storage.faults[fault]=false;equal(recover(r),true);if(fault==='get'){equal(state(r).receipt,null);equal(begin(r)?.phase,'SENDING');}else{equal(state(r).receipt.phase,'UNCERTAIN');equal(state(r).receipt.payload,command);equal(JSON.parse(r.storage.map.get(key())).receipt.phase,'UNCERTAIN');}}
 });
 await check('Committed/uncertain phase failures retain truthful memory result and exact raw; no clear until recovered',()=>{
  for(const phase of ['UNCERTAIN','COMMITTED']){const r=realm();begin(r);const oldRaw=r.storage.map.get(key());r.storage.faults.set=true;equal(transition(r,phase,phase==='COMMITTED'?proposalResult:undefined),null);equal(state(r).receipt.phase,phase);if(phase==='COMMITTED')equal(state(r).receipt.result,proposalResult);equal(r.storage.map.get(key()),oldRaw);equal(state(r).blocked,true);equal(r.run(()=>receipts.clearRequirementReceipt(receipts.getRequirementReceipt('A','fixture'))),false);r.storage.faults.set=false;equal(recover(r),true);equal(state(r).receipt.phase,phase);equal(state(realm(r.storage)).receipt.phase,phase);}
 });
 await check('Remove denied/after-remove failures retain lock and receipt; recovery before explicit clear',()=>{
  for(const fault of ['remove','afterRemove']){const r=realm();begin(r);transition(r,'COMMITTED',proposalResult);const before=state(r).receipt;r.storage.faults[fault]=true;equal(r.run(()=>receipts.clearRequirementReceipt(receipts.getRequirementReceipt('A','fixture'))),false);equal(state(r).receipt,before);equal(state(r).blocked,true);equal(begin(r),null);r.storage.faults[fault]=false;equal(recover(r),true);equal(JSON.parse(r.storage.map.get(key())).receipt.result,proposalResult);equal(r.run(()=>receipts.clearRequirementReceipt(receipts.getRequirementReceipt('A','fixture'))),true);equal(r.storage.map.has(key()),false);}
 });
 await check('Shared HMR old closures notify current subscribers; stale clear/transition cannot consume newer receipt',()=>{
  const r=realm();begin(r);r.run(()=>{globalThis.old=receipts.getRequirementReceipt('A','fixture');globalThis.notifications=0;receipts.subscribeRequirementReceipt('A','fixture',()=>notifications++);return true;});r.hmr();equal(r.run(()=>oldReceipts.transitionRequirementReceipt(old,'UNCERTAIN').phase),'UNCERTAIN');equal(r.run(()=>notifications),1);equal(r.run(()=>oldReceipts.clearRequirementReceipt(receipts.getRequirementReceipt('A','fixture'))),true);begin(r,{...command,idempotency_key:'new-key'});const newer=state(r).receipt;equal(r.run(()=>oldReceipts.clearRequirementReceipt(old)),false);equal(r.run(()=>oldReceipts.transitionRequirementReceipt(old,'COMMITTED',{stream_id:'stream',stream_revision:1,proposal_id:'proposal',proposal_revision:1,reused:false})),null);equal(state(r).receipt,newer);
 });
 await check('External raw replacement cannot be overwritten/removed even by matching old memory token',()=>{
  const r=realm();begin(r);const foreign=r.storage.map.get(key()).replace('original-key','foreign-key');r.storage.map.set(key(),foreign);equal(transition(r),null);equal(state(r).blocked,true);equal(recover(r),false);equal(r.storage.map.get(key()),foreign);equal(r.run(()=>receipts.clearRequirementReceipt(receipts.getRequirementReceipt('A','fixture'))),false);
 });
 await check('Invalid response never becomes COMMITTED, preserves exact retry command',()=>{const r=realm();begin(r);equal(transition(r,'COMMITTED',{...proposalResult,action:'RETIRE'}),null);equal(state(r).receipt.phase,'UNCERTAIN');equal(state(r).receipt.payload,command);equal(state(realm(r.storage)).receipt.phase,'UNCERTAIN');});
}catch(error){checks.push({name:'HARNESS_FAILURE',status:'FAIL',message:error.stack});throw error;}
finally{await mkdir(path.join(stage,label),{recursive:true});await writeFile(path.join(stage,label,'storage-result.json'),JSON.stringify({checks,assertions,network_calls:0,database_calls:0,source_calls:0},null,2)+'\n');}
console.log(JSON.stringify({groups:checks.length,assertions,network_calls:0}));
