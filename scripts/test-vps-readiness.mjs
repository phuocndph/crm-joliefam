import assert from 'node:assert/strict';
import { build } from 'esbuild';
const asModule = source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const runtimeBundle = await build({ entryPoints: ['server/runtime.ts'], bundle:true, write:false, platform:'node',format:'esm', define:{'process.env':'{}'} });
const { readRuntimeConfig } = await asModule(runtimeBundle.outputFiles[0].text);
const valid = { NODE_ENV:'production', PUBLIC_APP_URL:'https://crm.example.com', LOCAL_DATABASE_URL:'postgres://app:isolated-test-password@postgres/app', LOCAL_DEMO_AUTH:'true' };
assert.throws(()=>readRuntimeConfig({NODE_ENV:'production'}));
for(const patch of [{PUBLIC_APP_URL:'http://crm.example.com'}, {PUBLIC_APP_URL:'https://crm.example.com/path'}, {LOCAL_DATABASE_URL:''}, {LOCAL_DATABASE_URL:'malformed-secret'}, {LOCAL_DATABASE_URL:'postgres://app:crm_local_dev_only@postgres/app'}, {LOCAL_ALLOWED_ORIGINS:'*'}, {LOCAL_ALLOWED_ORIGINS:'https://other.example.com'}]) assert.throws(()=>readRuntimeConfig({...valid,...patch}));
const config=readRuntimeConfig(valid);
assert.equal(config.demoEnabled,false); assert.equal(config.syncAutomaticEnabled,false);
assert.equal(config.allowedOrigins.has('https://crm.example.com'),true);
assert.equal(config.allowedOrigins.has('https://crm.example.com.attacker.test'),false);
assert.equal(readRuntimeConfig({}).demoEnabled,true);
assert.equal(readRuntimeConfig({LOCAL_DEMO_AUTH:'false'}).demoEnabled,false);
console.log('Runtime: validated production config, exact origins, hard-off demo, explicit sync opt-in.');
const dateBundle = await build({entryPoints:['server/business-date.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {businessDateKey}=await asModule(dateBundle.outputFiles[0].text);
assert.equal(businessDateKey(new Date('2026-10-11T16:59:59Z')), '2026-10-11');
assert.equal(businessDateKey(new Date('2026-10-11T17:00:00Z')), '2026-10-12');
console.log('Business date: UTC+7 midnight boundary independent of host timezone.');
const policyBundle = await build({entryPoints:['server/module-permissions.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {moduleRequirement:p}=await asModule(policyBundle.outputFiles[0].text);
assert.deepEqual(p('POST','/api/quotes/x/approve'),['quote_approval']);
assert.ok(p('GET','/api/catalog/products').includes('orders'));
assert.ok(!p('DELETE','/api/catalog/products/x').includes('orders'));
assert.ok(!p('DELETE','/api/customers/x').includes('quotes'));
assert.deepEqual(p('GET','/api/local-snapshot/unknown_private_table'),[]);
assert.equal(p('POST','/api/local-table/quotes'),false);
assert.deepEqual(p('POST','/api/local-rpc/get_order_stats'),['orders','reports']);
assert.deepEqual(p('POST','/api/local-functions/predictive-analytics'),['customer_care']);
console.log('Permissions: exact module/actions, read lookups, no cross-module mutation grants.');
for (const production of [true,false]) {
 const definitions={ 'import.meta.env.VITE_BACKEND_MODE':'"local"', 'import.meta.env.PROD':String(production), 'import.meta.env.VITE_LOCAL_API_URL':'""', 'import.meta.env.VITE_LOCAL_DEMO_AUTH':'"true"' };
 const authBundle=await build({entryPoints:['src/lib/local-auth.ts'],bundle:true,write:false,platform:'node',format:'esm',define:definitions});
 let n=0;
 const fresh=async(stored,fn)=>{
  const map=new Map(stored===null?[]:[['local_user_session',stored]]);
  globalThis.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
  globalThis.window={location:{origin:'https://crm.example.com'}};
  globalThis.fetch=fn;
  return asModule(authBundle.outputFiles[0].text+'\n//'+production+'-'+n++);
 };
 let calls=[];
 const absent=await fresh(null,async(url)=>{
  calls.push(String(url));
  return new Response(JSON.stringify({token:'demo-fixture',actor:'local-admin',expires_at:new Date(Date.now()+3600000).toISOString()}));
 });
 if(production){
  await assert.rejects(absent.getLocalSession(),e=>e.status===401);
  await assert.rejects(absent.getLocalMe(),e=>e.status===401);
  await assert.rejects(absent.localFetch('https://crm.example.com/api/orders'),e=>e.status===401);
  assert.equal(calls.length,0);
 }else{assert.equal((await absent.getLocalSession()).actor,'local-admin');assert.equal(calls.length,1);}
 const expired=await fresh(JSON.stringify({token:'expired',expires_at:new Date(0).toISOString()}),async()=>{throw new Error('must not fetch')});
 await assert.rejects(expired.getLocalMe(),e=>e.status===401);
 calls=[];
 const revoked=await fresh(JSON.stringify({token:'revoked',expires_at:new Date(Date.now()+3600000).toISOString()}),async(url)=>{calls.push(String(url));return new Response('{}',{status:401});});
 assert.equal((await revoked.localFetch('https://crm.example.com/api/orders')).status,401);
 await assert.rejects(revoked.getLocalMe(),e=>e.status===401);
 assert.ok(calls.every(url=>!url.endsWith('/session')));
 let releaseOld;
 const oldResponse=new Promise(resolve=>{releaseOld=resolve;});
 const oldSession={token:'account-A',expires_at:new Date(Date.now()+3600000).toISOString()};
 const raced=await fresh(JSON.stringify(oldSession),async(url,init)=>{
  if(String(url).endsWith('/login'))return new Response(JSON.stringify({...oldSession,token:'account-B',actor:'B'}));
  if(String(url).endsWith('/logout'))return new Response('{}');
  if(new Headers(init.headers).get('authorization')==='Bearer account-A')return oldResponse;
  return new Response(JSON.stringify({user_id:'B',email:'b@test.invalid',role:'employee'}));
 });
 const delayed=raced.getLocalMe();
 const rejected=assert.rejects(delayed,e=>e.status===401);
 await raced.logoutLocal();
 await raced.loginLocal('b@test.invalid','fixture');
 assert.equal((await raced.getLocalMe()).user_id,'B');
 releaseOld(new Response(JSON.stringify({user_id:'A',role:'admin'})));
 await rejected;
 assert.equal((await raced.getLocalMe()).user_id,'B','Late old account response must not replace new identity');
}
console.log('Frontend auth: production guest/expired/revoked never bootstrap; development demo remains available.');

