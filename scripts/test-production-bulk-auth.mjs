import assert from 'node:assert/strict';
import {build} from 'esbuild';

// Actual frontend modules, bundled in memory. All storage/fetch operations below
// are synthetic mocks; no browser, database, credentials or network is used.
const {outputFiles}=await build({stdin:{contents:"export * from './src/lib/local-auth.ts'; export {localApi} from './src/lib/local-api.ts'; export * from './src/lib/production-bulk-queue.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.VITE_BACKEND_MODE':'"local"','import.meta.env.PROD':'false','import.meta.env.VITE_LOCAL_DEMO_AUTH':'"true"','import.meta.env.VITE_LOCAL_API_URL':'"http://127.0.0.1:1"'},logLevel:'silent'});
let imports=0,checks=0;
const test=async(name,run)=>{await run();checks++;console.log(`PASS production auth: ${name}`);};
const session=(actor='actor-a',token='synthetic-a')=>({actor,token,expires_at:new Date(Date.now()+3600000).toISOString(),role:'employee'});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const fresh=async(initial=session(),fetchImpl=async()=>{throw new Error('Unexpected synthetic fetch');})=>{
  const storage=new Map(initial?[['local_user_session',JSON.stringify(initial)]]:[]),calls=[];
  globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
  globalThis.fetch=async(input,init={})=>{const call={url:String(input),authorization:new Headers(init.headers).get('authorization'),body:init.body};calls.push(call);return fetchImpl(call,init);};
  const module=await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text+`\n// synthetic instance ${imports++}`).toString('base64')}`);
  return {module,storage,calls};
};
const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
const authenticationFailure=error=>error instanceof Error&&error.status===401;
const row=id=>({id:`REPORT:${id}`,targetId:id,kind:'REPORT',label:'Công việc kiểm thử',status:'DRAFT',fields:{date:'2026-09-10',good:'1',rework:'0',remake:'0',defect:'0',notes:'Giữ nguyên'}});
const payload=r=>({work_date:r.fields.date,quantity_good:r.fields.good,quantity_rework:'0',quantity_remake:'0',quantity_defect:'0',notes:r.fields.notes});

try{
  await test('captured actor uses exactly its original token and guarded 401 never refreshes/falls back',async()=>{
    const f=await fresh(session(),async()=>new Response(JSON.stringify({message:'Synthetic revoked session'}),{status:401})),guard=await f.module.captureLocalAuthGuard('actor-a');
    assert.equal((await f.module.localFetch('http://127.0.0.1:1/api/test',{},true,guard)).status,401);assert.equal(f.calls.length,1);assert.equal(f.calls[0].authorization,'Bearer synthetic-a');assert(!f.calls.some(c=>c.url.endsWith('/api/local-auth/session')));
  });
  await test('logout and login B invalidate an A guard before another work request',async()=>{
    const f=await fresh(session(),async call=>call.url.endsWith('/login')?json(session('actor-b','synthetic-b')):json({ok:true})),guard=await f.module.captureLocalAuthGuard('actor-a');
    await f.module.logoutLocal();await f.module.loginLocal('synthetic-b@local.test','synthetic-fixture-only');
    assert.throws(guard.assertCurrent,authenticationFailure);await assert.rejects(f.module.localFetch('http://127.0.0.1:1/api/test',{},true,guard),authenticationFailure);assert(!f.calls.some(c=>c.url.endsWith('/api/test')));assert(!f.calls.some(c=>c.url.endsWith('/api/local-auth/session')));
  });
  await test('same actor new login invalidates prior generation but a fresh send can capture its new session',async()=>{
    const f=await fresh(session(),async call=>call.url.endsWith('/login')?json(session('actor-a','synthetic-a-new')):json({ok:true})),old=await f.module.captureLocalAuthGuard('actor-a');
    await f.module.loginLocal('synthetic-a@local.test','synthetic-fixture-only');assert.throws(old.assertCurrent,authenticationFailure);
    const current=await f.module.captureLocalAuthGuard('actor-a');await f.module.localFetch('http://127.0.0.1:1/api/test',{},true,current);assert.equal(f.calls.at(-1).authorization,'Bearer synthetic-a-new');
  });
  await test('cross-tab identity changes, expiration and corrupt sessions cannot inherit cached caller A',async()=>{
    for(const replacement of [JSON.stringify(session('actor-b','synthetic-b')),JSON.stringify(session('actor-a','synthetic-a-new')),'corrupt',null]){
      const f=await fresh(),guard=await f.module.captureLocalAuthGuard('actor-a');if(replacement===null)f.storage.delete('local_user_session');else f.storage.set('local_user_session',replacement);
      await assert.rejects(f.module.localFetch('http://127.0.0.1:1/api/test',{},true,guard),authenticationFailure);assert.equal(f.calls.length,0);
    }
    for(const invalid of ['corrupt',JSON.stringify({...session(),expires_at:new Date(Date.now()-1000).toISOString()})]){const f=await fresh(null);f.storage.set('local_user_session',invalid);await assert.rejects(f.module.captureLocalAuthGuard('actor-a'),authenticationFailure);assert.equal(f.calls.length,0);}
  });
  await test('missing employee session cannot become a demo work request; explicit demo caller remains supported',async()=>{
    const f=await fresh(null,async()=>json(session('local-admin','synthetic-demo')));await assert.rejects(f.module.captureLocalAuthGuard('actor-a'),authenticationFailure);assert(f.calls.every(c=>c.url.endsWith('/api/local-auth/session')));
    const demo=await f.module.captureLocalAuthGuard('local-admin');await f.module.localFetch('http://127.0.0.1:1/api/test',{},true,demo);assert.equal(f.calls.at(-1).authorization,'Bearer synthetic-demo');
    f.storage.set('local_user_session',JSON.stringify(session('actor-b','synthetic-b')));await assert.rejects(f.module.localFetch('http://127.0.0.1:1/api/test',{},true,demo),authenticationFailure);assert.equal(f.calls.filter(c=>c.url.endsWith('/api/test')).length,1);
  });
  await test('awaiting demo capture cannot cross a concurrent login boundary',async()=>{
    const pending=deferred(),f=await fresh(null,async call=>call.url.endsWith('/session')?pending.promise:json(session('actor-b','synthetic-b'))),capture=f.module.captureLocalAuthGuard('local-admin');
    await f.module.loginLocal('synthetic-b@local.test','synthetic-fixture-only');pending.resolve(json(session('local-admin','synthetic-demo')));await assert.rejects(capture,authenticationFailure);assert(!f.calls.some(c=>c.url.includes('/production-dispatch/')));
  });
  await test('in-flight response after login B is unknown only for A; later draft never sends and A can exact-replay',async()=>{
    const pending=deferred(),started=deferred(),f=await fresh(session(),async call=>{if(call.url.includes('/production-dispatch/')){started.resolve();return pending.promise;}return json(session('actor-b','synthetic-b'));}),guard=await f.module.captureLocalAuthGuard('actor-a'),rows=[row('one'),row('two')];let durable=rows;
    const running=f.module.runProductionQueue(rows,rows.map(r=>r.id),payload,(r,b)=>f.module.localApi.reportProductionDispatchAssignment(r.targetId,b,guard),next=>{durable=structuredClone(next);},()=> 'original-one-key',f.module.validProductionQueueResult,guard.assertCurrent);
    await started.promise;await f.module.loginLocal('synthetic-b@local.test','synthetic-fixture-only');pending.resolve(json({id:'saved-one',assignment_id:'one',status:'SUBMITTED'}));await assert.rejects(running,authenticationFailure);
    assert.deepEqual(durable.map(r=>r.status),['UNKNOWN','DRAFT']);assert.equal(durable[0].key,'original-one-key');assert.equal(durable[1].key,undefined);assert.equal(f.calls.filter(c=>c.url.includes('/production-dispatch/')).length,1);assert.equal(f.calls.find(c=>c.url.includes('/production-dispatch/')).authorization,'Bearer synthetic-a');
    const stored=JSON.stringify({version:1,userId:'actor-a',rows:durable});assert(!stored.includes('synthetic-a'));assert(!stored.includes('synthetic-b'));assert.throws(()=>f.module.restoreQueue(stored,'actor-b'));
    globalThis.fetch=async(input,init={})=>String(input).endsWith('/login')?json(session('actor-a','synthetic-a-new')):json({id:'saved-one',assignment_id:'one',status:'SUBMITTED'});
    await f.module.loginLocal('synthetic-a@local.test','synthetic-fixture-only');const replayGuard=await f.module.captureLocalAuthGuard('actor-a'),restored=f.module.restoreQueue(stored,'actor-a');
    const replay=await f.module.runProductionQueue(restored,[restored[0].id],()=>{throw new Error('Cannot rebuild an unknown report');},(r,b)=>{assert.deepEqual(b,durable[0].payload);return f.module.localApi.reportProductionDispatchAssignment(r.targetId,b,replayGuard);},()=>{},()=>{throw new Error('Cannot allocate a new replay key');},f.module.validProductionQueueResult,replayGuard.assertCurrent);assert.equal(replay.rows[0].status,'SUCCESS');assert.equal(replay.rows[0].key,'original-one-key');assert.equal(replay.rows[1].status,'DRAFT');
  });
  await test('auth change while parsing an accepted body is rejected by actual local API before SUCCESS',async()=>{
    const parsed=deferred(),parseStarted=deferred(),f=await fresh(session(),async()=>({ok:true,status:200,json:()=>{parseStarted.resolve();return parsed.promise;}})),guard=await f.module.captureLocalAuthGuard('actor-a');
    const sending=f.module.localApi.reportProductionDispatchAssignment('one',{quantity_good:'1',idempotency_key:'parse-key'},guard);await parseStarted.promise;f.storage.set('local_user_session',JSON.stringify(session('actor-b','synthetic-b')));parsed.resolve({id:'saved-one',assignment_id:'one',status:'SUBMITTED'});await assert.rejects(sending,authenticationFailure);assert.equal(f.calls.length,1);assert.equal(f.calls[0].authorization,'Bearer synthetic-a');
  });
  await test('auth boundary between committed rows preserves first SUCCESS and leaves later draft unattempted',async()=>{
    const f=await fresh(session(),async()=>json({id:'saved-one',assignment_id:'one',status:'SUBMITTED'})),guard=await f.module.captureLocalAuthGuard('actor-a'),rows=[row('one'),row('two')];let durable=rows;
    await assert.rejects(f.module.runProductionQueue(rows,rows.map(r=>r.id),payload,(r,b)=>f.module.localApi.reportProductionDispatchAssignment(r.targetId,b,guard),next=>{durable=structuredClone(next);if(next[0].status==='SUCCESS')f.storage.set('local_user_session',JSON.stringify(session('actor-b','synthetic-b')));},()=> 'first-key',f.module.validProductionQueueResult,guard.assertCurrent),authenticationFailure);
    assert.deepEqual(durable.map(r=>r.status),['SUCCESS','DRAFT']);assert.equal(durable[1].key,undefined);assert.equal(f.calls.length,1);
  });
  await test('actual manager review transport also pins auth and cannot send a second decision after identity changes',async()=>{
    const f=await fresh(session('manager-a','synthetic-manager-a'),async()=>json({id:'report-one',status:'APPROVED'})),guard=await f.module.captureLocalAuthGuard('manager-a');
    assert.equal((await f.module.localApi.reviewProductionDispatchReport('report-one',{target_status:'APPROVED',reason:'Đã kiểm',idempotency_key:'review-auth-key'},guard)).status,'APPROVED');assert.equal(f.calls[0].authorization,'Bearer synthetic-manager-a');
    f.storage.set('local_user_session',JSON.stringify(session('manager-b','synthetic-manager-b')));await assert.rejects(f.module.localApi.reviewProductionDispatchReport('report-two',{target_status:'REJECTED',reason:'Không gửi dưới tài khoản khác',idempotency_key:'never-sent-key'},guard),authenticationFailure);assert.equal(f.calls.length,1);
  });
  console.log(`PASS production bulk auth: ${checks} actual-module mocked scenarios; no UI rendering or real network claimed.`);
}catch(error){console.error(`FAIL production bulk auth: ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;}
