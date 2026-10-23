// Real React hooks and permission events in a disposable browser fixture.
// Local API/auth dependencies are synthetic; no database, credentials or env files.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';

const mocks = {
  '@/lib/runtime-config': `export const isLocalBackend=()=>true; export const isLocalDemoEnabled=()=>false;`,
  '@/integrations/supabase/client': `export const supabase={from(){throw new Error('Unexpected Supabase access')}};`,
  '@/lib/local-auth': `export const hasStoredLocalUserSession=()=>true;
    export const captureLocalAuthGuard=async(actor)=>{const epoch=window.fixture.epoch;return {assertCurrent(){if(epoch!==window.fixture.epoch||actor!=='fixture-worker')throw new Error('Changed session')}}};
    export const getLocalMe=()=>window.fixture.request('role');`,
  '@/lib/local-api': `export const localApi={employeePermissions:()=>window.fixture.request('permissions'),payrollCapabilities:()=>window.fixture.request('payroll')};`,
  '@/lib/payroll-master-data': `export const listPayrollCapabilities=()=>{throw new Error('Unexpected Supabase payroll access')};`,
};
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {useUserRole} from './src/hooks/useUserRole';
    import {useEmployeePermissions} from './src/hooks/useEmployeePermissions';
    import {listenPermissionRefresh,notifyPermissionsChanged,PERMISSION_CHANGED_EVENT} from './src/lib/permission-refresh';
    window.fixture={epoch:0,requests:[],events:[],request(kind){return new Promise((resolve,reject)=>this.requests.push({kind,resolve,reject,settled:false}))},
      settle(kind,value,fail=false){const req=this.requests.find(r=>r.kind===kind&&!r.settled);if(!req)throw new Error('No pending '+kind);req.settled=true;fail?req.reject(new Error('Synthetic unavailable')):req.resolve(value)},
      notify:notifyPermissionsChanged,permissionEvent:PERMISSION_CHANGED_EVENT,listen:listenPermissionRefresh};
    const user={id:'fixture-worker'};
    function App(){const role=useUserRole(user),permissions=useEmployeePermissions(user,role.role);
      window.fixture.state={...role,permissionsLoading:permissions.loading,allowed:permissions.hasPermission('production_view'),count:permissions.permissions.length,payrollCount:permissions.payrollCapabilities.length};
      return <pre>{JSON.stringify(window.fixture.state)}</pre>}
    createRoot(document.getElementById('root')).render(<App/>);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', logLevel: 'silent',
  plugins: [{ name: 'synthetic-local-dependencies', setup(builder) {
    builder.onResolve({ filter: /^@\// }, args => args.path in mocks ? { path: args.path, namespace: 'fixture' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  } }],
});
const server = createServer((req, res) => {
  res.setHeader('content-type', req.url === '/fixture.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].text : '<div id="root"></div><script src="/fixture.js"></script>');
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = createRequire(import.meta.url)('C:/Users/Lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let browser, checks = 0;
const pass = label => { checks++; console.log('PASS production foreground: ' + label); };
const role = { user_id: 'fixture-worker', role: 'employee' };
const permissions = [{permission_type:'production_view',enabled:true}];
const payroll = [{permission_type:'payroll_my_view',allowed:true}];
try {
  browser = await chromium.launch({ headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.goto(origin);
  const pending = kind => page.waitForFunction(kind => window.fixture.requests.some(r => r.kind===kind&&!r.settled), kind);
  const settle = (kind, value, fail=false) => page.evaluate(({kind,value,fail}) => window.fixture.settle(kind,value,fail), {kind,value,fail});
  const ready = () => page.waitForFunction(() => window.fixture.state.role==='employee'&&!window.fixture.state.loading&&!window.fixture.state.permissionsLoading&&window.fixture.state.allowed);
  await pending('role'); await settle('role', role); await pending('permissions');
  await settle('permissions', permissions); await settle('payroll', payroll); await ready();
  pass('initial local role and capabilities resolve normally');

  await page.evaluate(() => {window.fixture.stop=window.fixture.listen(reason=>window.fixture.events.push(reason));window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  await pending('role');
  assert.deepEqual(await page.evaluate(() => window.fixture.events), ['foreground']);
  assert.deepEqual(await page.evaluate(() => [window.fixture.state.role,window.fixture.state.loading,window.fixture.state.permissionsLoading,window.fixture.state.allowed]), ['employee',false,false,true]);
  await settle('role', role); await settle('permissions', permissions); await settle('payroll', payroll); await ready();
  pass('focus plus visibility coalesce and actual hooks retain authorized UI while refreshing');

  await page.evaluate(() => {window.fixture.events=[];window.dispatchEvent(new Event('focus'));window.fixture.notify();});
  await page.waitForFunction(() => window.fixture.state.role===null&&!window.fixture.state.allowed);
  assert.equal((await page.evaluate(() => window.fixture.events))[0], 'permissions-changed');
  await page.evaluate(() => {window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(() => window.fixture.requests.filter(r=>r.kind==='role'&&!r.settled).length>=2);
  assert.deepEqual(await page.evaluate(() => [window.fixture.state.role,window.fixture.state.loading,window.fixture.state.allowed]), [null,true,false]);
  await settle('role', { ...role, role:'admin' });
  await page.evaluate(() => new Promise(resolve=>setTimeout(resolve,20)));
  assert.equal(await page.evaluate(() => window.fixture.state.role), null, 'superseded pre-refresh role must not restore privileges');
  await settle('role', role); await pending('permissions'); await settle('permissions',permissions); await settle('payroll',payroll); await ready();
  pass('hard permission invalidation clears immediately, cannot downgrade to foreground, ignores superseded response');

  await page.evaluate(() => {window.fixture.events=[];window.dispatchEvent(new Event('storage'));const event=new Event('storage');Object.defineProperty(event,'key',{value:window.fixture.permissionEvent});window.dispatchEvent(event);});
  await pending('role'); await page.waitForFunction(() => window.fixture.state.role===null);
  assert.deepEqual(await page.evaluate(() => window.fixture.events), ['permissions-changed']);
  await settle('role',role); await pending('permissions'); await settle('permissions',permissions); await settle('payroll',payroll); await ready();
  pass('cross-tab permission storage event remains a hard invalidation');

  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await pending('role');
  await page.evaluate(() => window.fixture.epoch++);
  await settle('role',role); await settle('permissions',permissions); await settle('payroll',payroll);
  await page.waitForFunction(() => window.fixture.state.role===null&&!window.fixture.state.allowed&&window.fixture.state.count===0&&window.fixture.state.payrollCount===0);
  pass('session change rejects in-flight role and permission responses and fails closed');

  await page.evaluate(() => window.fixture.notify()); await pending('role'); await settle('role',role); await pending('permissions');
  await settle('permissions',permissions); await settle('payroll',payroll); await ready();
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await pending('role');
  await settle('role',null,true); await settle('permissions',permissions); await settle('payroll',payroll);
  await page.waitForFunction(() => window.fixture.state.role===null&&!window.fixture.state.allowed);
  pass('foreground authorization request errors fail closed');

  await page.evaluate(() => {window.fixture.events=[];window.dispatchEvent(new Event('focus'));window.fixture.stop();});
  await page.evaluate(() => new Promise(resolve=>setTimeout(resolve,20)));
  assert.deepEqual(await page.evaluate(() => window.fixture.events), []);
  assert.deepEqual(errors,[]);
  pass('listener cleanup cancels pending foreground callback; browser has no uncaught errors');
  console.log(`PASS ${checks} production foreground regressions`);
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
