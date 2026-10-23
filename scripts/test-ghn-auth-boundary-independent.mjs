// TEST-ONLY. Execute extracted real request/localFetch code against synthetic
// transport/auth guards. No environment, real storage, network, DB or provider.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const api = await readFile(new URL('../src/lib/local-api.ts', import.meta.url), 'utf8');
const auth = await readFile(new URL('../src/lib/local-auth.ts', import.meta.url), 'utf8');
const parsedApi = ts.createSourceFile('local-api.ts', api, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const parsedAuth = ts.createSourceFile('local-auth.ts', auth, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let request, localFetch;
const methods = new Map();
const walkApi = node => {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'request') request = node.getText(parsedApi);
  if (ts.isPropertyAssignment(node) && ['createGhnOrder', 'recentGhnOrder', 'ghnOrderStatus', 'printGhnOrder'].includes(node.name.getText(parsedApi))) methods.set(node.name.getText(parsedApi), node.initializer.getText(parsedApi));
  ts.forEachChild(node, walkApi);
};
walkApi(parsedApi);
const walkAuth = node => { if (ts.isVariableDeclaration(node) && node.name.getText(parsedAuth) === 'localFetch') localFetch = node.initializer.getText(parsedAuth); ts.forEachChild(node, walkAuth); };
walkAuth(parsedAuth);
assert.ok(request && localFetch); assert.equal(methods.size, 4);
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const context = { Headers, LocalApiError: Error, quoteCustomerErrorDetails: () => undefined, localApiUrl: () => 'http://synthetic.invalid', isLocalBackend: () => true };
let current = true, checks = 0, transports = [], lookups = 0, responseGate;
context.hasStoredLocalUserSession = () => { lookups++; return true; };
context.currentToken = async () => { lookups++; throw new Error('guarded call must not resolve current account'); };
context.fetch = async (url, init) => { transports.push({ url, init }); return responseGate ? responseGate.promise : { ok: true, status: 200, json: async () => ({ success: true, data: {} }) }; };
const guard = { assertCurrent() { checks++; if (!current) throw new Error('synthetic stale guard'); }, authorizationToken() { this.assertCurrent(); return 'synthetic-bound-token'; } };
vm.createContext(context);
vm.runInContext(compile('globalThis.localFetch = ' + localFetch + ';\n' + request), context);
for (const [name, initializer] of methods) vm.runInContext(compile(`globalThis.${name}=${initializer};`), context);
for (const [name, args] of [['createGhnOrder', [{ synthetic: true }, guard]], ['recentGhnOrder', ['synthetic-order', guard]], ['ghnOrderStatus', ['synthetic-key', true, guard]], ['printGhnOrder', ['synthetic-key', guard]]]) {
  const before = transports.length; await context[name](...args);
  assert.equal(transports.length, before + 1, name); assert.equal(transports.at(-1).init.headers.get('authorization'), 'Bearer synthetic-bound-token', name);
  current = false; await assert.rejects(() => context[name](...args), /synthetic stale guard/, name); assert.equal(transports.length, before + 1, name + ' stale call never sends'); current = true;
}
assert.equal(lookups, 0, 'all four routes pass captured guard; no current account/demo fallback');
const gate = deferred(); responseGate = gate;
const pending = context.createGhnOrder({ synthetic: true }, guard), before = transports.length;
current = false; gate.resolve({ ok: true, status: 200, json: async () => ({ success: true, data: { request_key: 'synthetic' } }) });
await assert.rejects(pending, /synthetic stale guard/); assert.equal(transports.length, before, 'no retry for changed account');
current = true; responseGate = null;
context.fetch = async (url, init) => { transports.push({ url, init }); return { ok: false, status: 401, json: async () => ({ message: 'synthetic rejected' }) }; };
const rejectedBefore = transports.length;
await assert.rejects(() => context.printGhnOrder('synthetic-key', guard), /synthetic rejected/);
assert.equal(transports.length, rejectedBefore + 1, '401 never refreshes or retries a captured account'); assert.equal(lookups, 0); assert.ok(checks > 0);
console.log('PASS independent GHN auth boundary: four captured-token routes, stale-before-send, stale-response suppression and no 401 fallback/retry (synthetic only).');
