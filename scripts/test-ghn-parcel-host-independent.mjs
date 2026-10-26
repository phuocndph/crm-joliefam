// TEST-ONLY. Pure parcel contracts and real host component with synthetic hooks.
// No DOM/browser, environment file, operational API, network, DB or GHN calls.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { GHN_PACKED_PARCEL_NAME, buildGhnQuoteSnapshot, parseGhnKilograms } from '../src/lib/ghn-quote-comparison.ts';

let count = 0;
const check = async (name, run) => { await run(); count++; console.log('PASS independent GHN parcel/host: ' + name); };
const input = { provinceId: '202', districtId: '1444', wardCode: '020308', address: 'Synthetic address', cod: 100000, insurance: 200000, items: [{ name: 'Synthetic item', quantity: 3 }] };
const measured = { weight: 5000, length: 40, width: 50, height: 60 };
await check('explicit measured parcel is the only physical truth and does not read product rows', () => {
  const source = structuredClone({ ...input, parcel: measured }), before = structuredClone(source);
  const actual = buildGhnQuoteSnapshot(source).snapshot;
  assert.equal(actual.kind, 'final');
  for (const field of Object.keys(measured)) assert.equal(actual.feeData[field], measured[field]);
  assert.deepEqual(source, before); assert.deepEqual(actual.feeData.items, [{ name: GHN_PACKED_PARCEL_NAME, quantity: 1, ...measured }]);
  source.items[0].name = 'Renamed'; source.parcel.weight = 999;
  assert.equal(actual.feeData.weight, 5000); assert.equal(actual.feeData.items[0].weight, 5000, 'detached canonical parcel');
  assert.equal(buildGhnQuoteSnapshot({ ...input, parcel: measured, items: input.items.map(row => ({ ...row, name: 'Renamed' })) }).snapshot.key, actual.key);
});
await check('measured dimensions are all-or-none and kilograms convert without product physical fields', () => {
  for (const invalid of [0, -1, 1.5, 50001, NaN, Infinity]) assert.equal(buildGhnQuoteSnapshot({ ...input, parcel: { ...measured, weight: invalid } }).snapshot, null, 'weight:' + invalid);
  for (const field of ['length', 'width', 'height']) for (const invalid of [-1, 0.5, 201, NaN]) assert.equal(buildGhnQuoteSnapshot({ ...input, parcel: { ...measured, [field]: invalid } }).snapshot, null, field + ':' + invalid);
  for (const partial of [{ length: 40 }, { width: 50 }, { height: 60 }, { length: 40, width: 50 }]) assert.equal(buildGhnQuoteSnapshot({ ...input, parcel: { weight: 5000, ...partial } }).snapshot, null);
  const preliminary = buildGhnQuoteSnapshot({ ...input, parcel: { weight: 5000 } }).snapshot;
  assert.equal(preliminary.kind, 'preliminary'); assert.equal('items' in preliminary.feeData, false);
  assert.equal(parseGhnKilograms('5,000'), 5000);
});

const source = await readFile(new URL('../src/components/LocalGhnCreateHost.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function hostHarness() {
  let pathname = '/orders', account = 'user-a', local = true, getMe = async () => ({ user_id: account });
  const hooks = [], timers = new Set(), listeners = new Map(), events = [];
  let cursor = 0, pending = [], dirty = false, tree;
  const same = (a, b) => Boolean(a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i])));
  const react = {
    createContext: () => ({ Provider: 'provider' }), useContext: () => null,
    useState(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { value: typeof initial === 'function' ? initial() : initial }; return [hooks[i].value, next => { const value = typeof next === 'function' ? next(hooks[i].value) : next; if (!Object.is(value, hooks[i].value)) { hooks[i].value = value; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useCallback(callback, deps) { const i = cursor++; if (!same(hooks[i]?.deps, deps)) hooks[i] = { deps, callback }; return hooks[i].callback; },
    useLayoutEffect(effect, deps) { const i = cursor++; if (!same(hooks[i]?.deps, deps)) { const previous = hooks[i]; hooks[i] = { deps }; pending.push(() => { previous?.cleanup?.(); hooks[i].cleanup = effect(); }); } },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const window = { setInterval(callback) { timers.add(callback); return callback; }, clearInterval(callback) { timers.delete(callback); }, addEventListener(name, callback) { listeners.set(name, callback); }, removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); }, dispatchEvent(event) { events.push(event.type); } };
  vm.runInNewContext(code, { module, exports: module.exports, Event, window, require: name => {
    if (name === 'react') return react;
    if (name === 'react-router-dom') return { useLocation: () => ({ pathname }) };
    if (name === '@/lib/local-auth') return { getLocalMe: () => getMe(), getLocalUserSession: () => ({ actor: account }), captureLocalAuthGuard: async actor => ({ assertCurrent() { if (actor !== account) throw new Error('synthetic auth changed'); } }) };
    if (name === '@/lib/runtime-config') return { isLocalBackend: () => local };
    if (name === './LocalCreateGHNOrderDialog') return { LocalCreateGHNOrderDialog: 'local-dialog' };
    return require(name);
  } });
  const render = () => { for (let i = 0; i < 20; i++) { cursor = 0; pending = []; dirty = false; tree = module.exports.LocalGhnCreateHostProvider({ children: 'route-layout' }); pending.forEach(run => run()); if (!dirty) return tree; } throw new Error('host did not settle'); };
  const dialog = () => tree.props.children.find(child => child?.type === 'local-dialog');
  render();
  return { render, dialog, events, timers, listeners, show: draft => tree.props.value(draft), setPath: path => { pathname = path; render(); }, setAccount: value => { account = value; }, setLocal: value => { local = value; }, setGetMe: value => { getMe = value; }, tick: () => { [...timers].forEach(run => run()); render(); } };
}
await check('host retains same in-memory draft across rerender and success does not dismiss', async () => {
  const h = hostHarness(), order = { id: 'synthetic-order' };
  await h.show({ order, remainingAmount: 100000 }); h.render();
  assert.equal(h.dialog().props.order, order); assert.equal(h.dialog().props.remainingAmount, 100000);
  const before = h.dialog(); h.render(); assert.equal(h.dialog().props.order, before.props.order);
  assert.equal(typeof h.dialog().props.authGuard?.assertCurrent, 'function', 'host forwards captured actor guard into dialog');
  const pinned = h.dialog().props.authGuard; pinned.assertCurrent(); h.setAccount('temporary-other-account'); assert.throws(() => pinned.assertCurrent(), /auth changed/); h.setAccount('user-a');
  h.dialog().props.onSuccess(); h.render(); assert.ok(h.dialog()); assert.deepEqual(h.events, ['crm-local-ghn-created']);
  assert.ok(app.indexOf('<LocalGhnCreateHostProvider>') < app.indexOf('<AppRoutes'), 'host wraps responsive route tree');
  assert.equal(/sessionStorage|localStorage/.test(source), false, 'draft PII not persisted');
});
await check('host drops draft on route/account change and cancels stale open requests', async () => {
  const h = hostHarness(); await h.show({ order: { id: 'one' } }); h.render(); assert.ok(h.dialog());
  h.setAccount('user-b'); h.tick(); assert.equal(h.dialog(), undefined); assert.equal(h.timers.size, 0);
  await h.show(); h.render(); assert.ok(h.dialog()); h.setPath('/quotes'); assert.equal(h.dialog(), undefined);
  await h.show({ order: { id: 'should-not-open' } }); h.render(); assert.equal(h.dialog(), undefined);
  h.setPath('/orders'); const gate = deferred(); h.setGetMe(() => gate.promise);
  const pending = h.show({ order: { id: 'late' } }); h.setPath('/quotes'); gate.resolve({ user_id: 'user-b' }); await pending; h.render(); assert.equal(h.dialog(), undefined);
  h.setPath('/orders'); h.setLocal(false); await h.show(); h.render(); assert.equal(h.dialog(), undefined);
});
await check('host stale success never broadcasts for changed account, close cleans listeners', async () => {
  const h = hostHarness(); await h.show(); h.render(); const stale = h.dialog();
  h.setAccount('other-account'); stale.props.onSuccess(); h.render(); assert.equal(h.dialog(), undefined); assert.deepEqual(h.events, []);
  await h.show(); h.render(); h.dialog().props.onOpenChange(false); h.render();
  assert.equal(h.dialog(), undefined); assert.equal(h.timers.size, 0); assert.equal(h.listeners.size, 0);
});
console.log(`PASS ${count} independent GHN parcel/host groups (pure/synthetic, not browser interaction).`);
