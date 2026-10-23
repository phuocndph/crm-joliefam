// TEST-ONLY: execute the actual dialog's extracted lifecycle handlers with a
// deterministic synthetic state boundary. Not rendered React/DOM/browser QA.
// No .env, database, provider, operational API or browser automation is used.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/LocalCreateGHNOrderDialog.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/pages/OrderManagement.tsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('LocalCreateGHNOrderDialog.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const initializers = new Map(), effects = [];
const visit = node => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) initializers.set(node.name.text, node.initializer.getText(parsed));
  if (ts.isCallExpression(node) && ['useEffect', 'useLayoutEffect'].includes(node.expression.getText(parsed))) effects.push({ kind: node.expression.getText(parsed), text: node.arguments[0].getText(parsed), dependencies: node.arguments[1]?.getText(parsed) });
  ts.forEachChild(node, visit);
};
visit(parsed);
const init = effects.find(row => row.kind === 'useEffect' && row.text.includes('localApi.recentGhnOrder'));
const generation = effects.find(row => row.kind === 'useLayoutEffect' && row.text.includes('const epoch=attemptSession.current.epoch+1'));
assert.ok(init && generation, 'actual initialization and generation effects found');
const functions = ['blankItem', 'blankParcel', 'metadataAddress', 'unresolved', 'validPrintUrl', 'assertSessionAuth', 'currentAttemptSession', 'resetForm', 'applyAttempt', 'checkStatus', 'submit', 'newAttempt', 'printAttempt', 'copyCode', 'finishClose', 'changeOpen', 'cancelDiscard', 'confirmDiscard', 'openApiSettings', 'reloadAddress'];
const compile = (name, text) => ts.transpileModule(`globalThis.${name}=${text};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const settle = async () => { for (let n = 0; n < 16; n++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const terminal = status => ({ attempt_status: status, request_key: 'old-key', reference: 'test-old-reference', ...(status === 'SUCCESS' ? { order_code: 'TESTOLD001' } : {}) });
const freshSuccess = key => ({ attempt_status: 'SUCCESS', request_key: key, reference: 'test-new-reference', order_code: 'TESTNEW001' });
const contextHarness = ({ recent = null } = {}) => {
  const calls = { creates: [], prints: [], statuses: [], storage: [], notifications: 0, openChanges: [], resets: 0, navigation: [], guards: [] };
  let keyIndex = 0, authCurrent = true;
  const guard = { assertCurrent() { if (!authCurrent) throw new Error('synthetic account changed'); }, authorizationToken: () => 'synthetic-account-token' };
  const context = {
    attemptSession: { current: { epoch: 1, open: true, scope: 'standalone', key: 'current-key' } },
    sessionAuth: { current: guard }, authGuard: guard, authClose: { current: value => calls.openChanges.push(value) },
    pendingDestination: { current: null }, discardOpen: false,
    latestAttempt: { current: null }, notified: { current: '' }, addressGeneration: { current: { next() {} } }, quoteSession: { current: { invalidate() {} } },
    latestMode: { current: 'auto' }, formOwner: { current: '' }, initialDefaults: { current: { order: undefined, remainingAmount: 0 } }, initialForm: { current: '' }, formSignature: 'initial-form',
    useCallback: callback => callback, cancelAddressMatch() {},
    open: true, order: undefined, remainingAmount: 0, requestKey: 'current-key', storageKey: 'test-storage', attempt: null,
    recoveryReady: true, locked: false, matchingAddress: false, compareBusy: false, dataBusy: false, feeBusy: false,
    autoSelectionReady: true, pickupConfirmed: true, quoteInput: { snapshot: { key: 'test-fee', feeData: { weight: 1200, length: 20, width: 30, height: 40 } } }, selectedService: { service_id: 53320, service_type_id: 2 },
    fee: 25000, shopId: '456', provinceId: '202', districtId: '1444', wardCode: '020308',
    toName: 'test recipient', toPhone: '0900000003', toAddress: 'test synthetic address', items: [{ name: 'test parcel', quantity: 1, weight: 1000, length: 10, width: 10, height: 10 }],
    totalWeight: 1000, packageLength: 10, packageWidth: 10, packageHeight: 10, cod: 0, insurance: 0, note: '', requiredNote: 'KHONGCHOXEMHANG', payment: '1',
    createValidationError: '', busy: false, initializing: false, unresolvedAttempt: false, printBusy: false,
    crypto: { randomUUID: () => 'new-key-' + ++keyIndex }, navigator: { clipboard: { writeText: async () => {} } },
    storageSet: (key, value) => calls.storage.push({ key, value }), errorText: error => String(error?.message || error),
    getLocalMe: async () => ({ user_id: 'fixture-admin' }),
    captureLocalAuthGuard: async () => guard, getLocalUserSession: () => ({ actor: 'fixture-admin' }), navigate: value => calls.navigation.push(value),
    onSuccess: () => calls.notifications++, onOpenChange: value => calls.openChanges.push(value),
    localApi: {
      recentGhnOrder: async (_order, auth) => { calls.guards.push(auth); auth.assertCurrent(); return { data: recent }; },
      createGhnOrder: async (input, auth) => { calls.guards.push(auth); auth.assertCurrent(); calls.creates.push(input); return { success: true, data: freshSuccess(input.idempotencyKey) }; },
      ghnOrderStatus: async (key, reconcile, auth) => { calls.guards.push(auth); auth.assertCurrent(); calls.statuses.push({ key, reconcile }); return { success: true, data: freshSuccess(key) }; },
      printGhnOrder: async (key, auth) => { calls.guards.push(auth); auth.assertCurrent(); calls.prints.push(key); return { success: true, data: { printUrl: 'https://online-gateway.ghn.vn/a5/public-api/printA5?token=test-only-print-token' } }; },
    },
  };
  for (const name of new Set(source.match(/\bset[A-Z][A-Za-z0-9_]+(?=\()/g))) {
    if (name === 'setTimeout') continue;
    const property = name[3].toLowerCase() + name.slice(4);
    context[name] = value => {
      context[property] = typeof value === 'function' ? value(context[property]) : value;
      if (name === 'setAttempt') { context.latestAttempt.current = context.attempt; context.unresolvedAttempt = Boolean(context.attempt && ['IN_FLIGHT', 'UNKNOWN', 'REMOTE_CREATED'].includes(context.attempt.attempt_status)); }
    };
  }
  vm.createContext(context);
  for (const name of functions) { assert.ok(initializers.has(name), name); vm.runInContext(compile(name, initializers.get(name)), context); }
  vm.runInContext(compile('initialize', init.text), context);
  vm.runInContext(compile('resetGeneration', generation.text), context);
  return { context, calls, guard, changeActor: () => { authCurrent = false; }, begin: () => { const cleanup = context.resetGeneration(); context.initialize(); return cleanup; }, invalidate: () => { context.attemptSession.current = { ...context.attemptSession.current, epoch: context.attemptSession.current.epoch + 1, key: 'different-session-key' }; } };
};
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log('PASS GHN success lifecycle: ' + name); };

await check('historical SUCCESS/REJECTED ignored; open starts blank and mints fresh key', async () => {
  for (const status of ['SUCCESS', 'REJECTED']) {
    const { context, calls, begin } = contextHarness({ recent: terminal(status) });
    context.toName = 'stale draft'; context.toAddress = 'stale address'; context.attempt = terminal(status); context.latestAttempt.current = context.attempt;
    begin(); await settle();
    assert.equal(context.attempt, null, status); assert.match(context.requestKey, /^new-key-/); assert.notEqual(context.requestKey, 'old-key');
    assert.equal(context.toName, ''); assert.equal(context.toAddress, ''); assert.equal(context.printUrl, ''); assert.equal(context.recoveryReady, true);
    assert.equal(calls.notifications, 0); assert.equal(calls.creates.length, 0);
  }
});
await check('every unresolved status restores its existing key and never posts new create', async () => {
  for (const status of ['IN_FLIGHT', 'UNKNOWN', 'REMOTE_CREATED']) {
    const { context, calls, begin } = contextHarness({ recent: terminal(status) });
    begin(); await settle();
    assert.equal(context.attempt.attempt_status, status); assert.equal(context.requestKey, 'old-key'); assert.equal(context.attemptSession.current.key, 'old-key');
    assert.equal(context.unresolvedAttempt, true); assert.equal(context.recoveryReady, true); assert.equal(calls.creates.length, 0);
    await context.submit(); assert.equal(calls.creates.length, 0, 'restored attempt blocks even if quote data is supplied');
  }
});
await check('late initialization cannot replace closed/reopened/different order session', async () => {
  const pending = deferred(), harness = contextHarness();
  harness.context.localApi.recentGhnOrder = () => pending.promise;
  const cleanup = harness.begin(); await settle();
  cleanup(); harness.context.order = { id: 'another-order', customers: {} }; harness.context.resetGeneration();
  pending.resolve({ data: terminal('SUCCESS') }); await settle();
  assert.equal(harness.context.attempt, null); assert.equal(harness.context.requestKey, ''); assert.equal(harness.context.attemptSession.current.scope, 'another-order');
  assert.equal(harness.calls.notifications, 0);
});
await check('only matching current create/status evidence applies and notifies once', async () => {
  const { context, calls } = contextHarness();
  const token = { ...context.attemptSession.current };
  context.applyAttempt(freshSuccess('wrong-key'), token); assert.equal(context.attempt, null);
  context.applyAttempt(freshSuccess(token.key), token); context.applyAttempt(freshSuccess(token.key), token);
  assert.equal(context.attempt.order_code, 'TESTNEW001'); assert.equal(calls.notifications, 1); assert.equal(calls.openChanges.length, 0);
});
await check('late create response or error does not replace new session or notify parent', async () => {
  for (const outcome of ['success', 'error']) {
    const pending = deferred(), harness = contextHarness();
    harness.context.localApi.createGhnOrder = input => { harness.calls.creates.push(input); return pending.promise; };
    const request = harness.context.submit(); assert.equal(harness.calls.creates.length, 1);
    harness.invalidate(); harness.context.busy = false; harness.context.error = 'new-session-error';
    outcome === 'success' ? pending.resolve({ data: freshSuccess('current-key') }) : pending.reject(new Error('old error'));
    await request; assert.equal(harness.context.attempt, null); assert.equal(harness.context.error, 'new-session-error'); assert.equal(harness.calls.notifications, 0);
    assert.equal(harness.context.busy, false);
  }
});
await check('lost create response binds different unresolved server key and releases busy for reconciliation', async () => {
  const h = contextHarness();
  h.context.localApi.createGhnOrder = async input => { h.calls.creates.push(input); throw new Error('test lost response'); };
  h.context.localApi.recentGhnOrder = async () => ({ data: terminal('UNKNOWN') });
  await h.context.submit();
  assert.equal(h.calls.creates.length, 1); assert.equal(h.context.requestKey, 'old-key'); assert.equal(h.context.attemptSession.current.key, 'old-key');
  assert.equal(h.context.attempt.attempt_status, 'UNKNOWN'); assert.equal(h.context.busy, false, 'key rebinding cannot strand busy on old-token finally');
  assert.equal(h.calls.notifications, 0);
});
await check('reconcile success shows current code, delayed status cannot update reopened form', async () => {
  const h = contextHarness(); h.context.attempt = terminal('UNKNOWN'); h.context.attempt.request_key = 'current-key'; h.context.unresolvedAttempt = true;
  await h.context.checkStatus(true); assert.equal(h.context.attempt.attempt_status, 'SUCCESS'); assert.equal(h.calls.notifications, 1); assert.equal(h.calls.creates.length, 0);
  const pending = deferred(), stale = contextHarness(); stale.context.unresolvedAttempt = true; stale.context.localApi.ghnOrderStatus = () => pending.promise;
  const request = stale.context.checkStatus(true); stale.invalidate(); pending.resolve({ data: freshSuccess('current-key') }); await request;
  assert.equal(stale.context.attempt, null); assert.equal(stale.calls.notifications, 0);
});
await check('print handles error/retry safely and ignores late response after session changes', async () => {
  const h = contextHarness(); h.context.attempt = freshSuccess('current-key'); h.context.latestAttempt.current = h.context.attempt;
  h.context.localApi.printGhnOrder = async () => { throw new Error('test print failed'); };
  await h.context.printAttempt(); assert.equal(h.context.printError, 'test print failed'); assert.equal(h.context.attempt.order_code, 'TESTNEW001');
  h.context.localApi.printGhnOrder = async () => ({ success: true, data: { printUrl: 'https://attacker.invalid/not-a-label' } });
  await h.context.printAttempt(); assert.equal(h.context.printUrl, ''); assert.match(h.context.printError, /không hợp lệ/);
  h.context.localApi.printGhnOrder = async () => ({ success: true, data: { printUrl: 'https://online-gateway.ghn.vn/a5/public-api/printA5?token=test-only-print-token' } });
  await h.context.printAttempt(); assert.match(h.context.printUrl, /token=test-only-print-token$/); assert.equal(h.context.printError, ''); assert.equal(h.calls.creates.length, 0);
  const pending = deferred(); h.context.localApi.printGhnOrder = () => pending.promise;
  const request = h.context.printAttempt(); h.invalidate(); h.context.printUrl = ''; h.context.printError = 'new-session-print';
  pending.resolve({ success: true, data: { printUrl: 'https://online-gateway.ghn.vn/a5/public-api/printA5?token=old-response-token' } }); await request;
  assert.equal(h.context.printUrl, ''); assert.equal(h.context.printError, 'new-session-print');
});
await check('new-attempt and close synchronously invalidate pending work, reset sensitive print URL', () => {
  const h = contextHarness(); h.context.attempt = freshSuccess('current-key'); h.context.printUrl = 'old label'; h.context.newAttempt();
  assert.equal(h.context.attempt, null); assert.equal(h.context.attemptSession.current.key, ''); assert.equal(h.context.printUrl, ''); assert.equal(h.context.recoveryReady, false);
  vm.runInContext(compile('formSignature', initializers.get('formSignature')), h.context);
  h.context.changeOpen(false); assert.equal(h.context.attemptSession.current.open, false); assert.equal(h.context.attemptSession.current.key, ''); assert.deepEqual(h.calls.openChanges, [false]);
});
await check('directory reload preserves recipient/items/draft within same open owner but reopen resets them', async () => {
  const h = contextHarness();
  h.begin(); await settle();
  h.context.toName = 'test typed recipient'; h.context.toPhone = '0900000005'; h.context.toAddress = 'test typed address';
  h.context.items = [{ name: 'test typed parcel', weight: 25000 }]; h.context.cod = 200000;
  const items = h.context.items;
  h.context.reloadAddress(); h.context.resetGeneration();
  assert.equal(h.context.toName, 'test typed recipient'); assert.equal(h.context.toPhone, '0900000005'); assert.equal(h.context.toAddress, 'test typed address');
  assert.equal(h.context.items, items); assert.equal(h.context.cod, 200000);
  h.context.open = false; h.context.resetGeneration(); h.context.open = true; h.context.resetGeneration();
    assert.equal(h.context.toName, ''); assert.equal(h.context.toAddress, ''); assert.notEqual(h.context.items, items); assert.equal(h.context.items[0].name, '');
});
await check('create uses exact measured fee parcel, untouched item details and visible COD/payer', async () => {
  const h = contextHarness();
  await h.context.submit();
  assert.equal(h.calls.creates.length, 1);
  const payload = h.calls.creates[0].orderData;
  for (const field of ['weight', 'length', 'width', 'height']) assert.equal(payload[field], h.context.quoteInput.snapshot.feeData[field], field);
  assert.notEqual(payload.weight, h.context.totalWeight, 'measured weight must not fall back to old item-derived weight');
  assert.equal(payload.items[0].weight, 1000, 'item detail is not fabricated to fit the parcel');
  assert.equal(payload.cod_amount, h.context.cod); assert.equal(payload.payment_type_id, Number(h.context.payment));
});
await check('unconfirmed pickup fails closed, even with a complete current quote', async () => {
  const h = contextHarness(); h.context.pickupConfirmed = false;
  await h.context.submit();
  assert.equal(h.calls.creates.length, 0); assert.match(h.context.error, /Xác nhận điểm lấy hàng/);
});
await check('dirty close opens in-app confirmation; cancel keeps draft, confirm discards; pending locks never show it', () => {
  const dirty = contextHarness(); dirty.context.initialForm.current = 'old-form';
  const name = dirty.context.toName, items = dirty.context.items;
  dirty.context.changeOpen(false);
  assert.equal(dirty.context.discardOpen, true); assert.equal(dirty.calls.openChanges.length, 0); assert.equal(dirty.context.attemptSession.current.open, true);
  dirty.context.cancelDiscard(); assert.equal(dirty.context.discardOpen, false); assert.equal(dirty.context.toName, name); assert.equal(dirty.context.items, items); assert.equal(dirty.calls.openChanges.length, 0);
  dirty.context.changeOpen(false); dirty.context.confirmDiscard();
  assert.deepEqual(dirty.calls.openChanges, [false]); assert.equal(dirty.context.attemptSession.current.open, false);
  for (const lock of ['busy', 'unresolvedAttempt']) {
    const h = contextHarness(); h.context.initialForm.current = 'old-form'; h.context[lock] = true;
    h.context.changeOpen(false);
    assert.equal(h.calls.openChanges.length, 0); assert.equal(h.context.discardOpen, false); assert.equal(h.context.attemptSession.current.open, true);
    assert.match(h.context.error, /đối soát/);
  }
});
await check('first standalone field edit cannot become the reset baseline and skip discard prompt', () => {
  const h = contextHarness(), c = h.context;
  Object.assign(c, { toName: '', toPhone: '', toAddress: '', provinceId: '', districtId: '', wardCode: '', items: [c.blankItem()], parcel: c.blankParcel(), cod: 0, insurance: 0, payment: '2', note: '', requiredNote: 'CHOXEMHANGKHONGTHU', selectionMode: 'auto' });
  const formEffect = effects.find(row => row.kind === 'useLayoutEffect' && row.text.includes('initialForm.current=formSignature'));
  const signature = () => vm.runInContext(compile('formSignature', initializers.get('formSignature')) + '\nformSignature;', c);
  let priorDependencies;
  const runBaseline = () => {
    if (!formEffect) return;
    const dependencies = vm.runInContext(formEffect.dependencies, c);
    if (!priorDependencies || !dependencies.every((value, index) => Object.is(value, priorDependencies[index]))) {
      vm.runInContext(compile('baselineEffect', formEffect.text), c); c.baselineEffect(); priorDependencies = dependencies;
    }
  };
  signature(); runBaseline(); c.resetGeneration();
  signature(); runBaseline(); // Actual unchanged-dependency effect cannot run twice.
  c.toName = 'Only first edit'; signature(); runBaseline();
  c.changeOpen(false);
  assert.equal(c.discardOpen, true); assert.equal(h.calls.openChanges.length, 0);
});
await check('settings action uses same close protection for dirty, pending and clear form', () => {
  const dirty = contextHarness(); dirty.context.initialForm.current = 'old';
  dirty.context.openApiSettings(); assert.deepEqual(dirty.calls.navigation, []); assert.equal(dirty.calls.openChanges.length, 0); assert.equal(dirty.context.discardOpen, true);
  dirty.context.cancelDiscard(); assert.equal(dirty.context.pendingDestination.current, null); assert.equal(dirty.context.discardOpen, false);
  dirty.context.changeOpen(false); dirty.context.confirmDiscard(); assert.deepEqual(dirty.calls.navigation, [], 'cancelled settings intent never leaks into a later ordinary close');
  const confirmed = contextHarness(); confirmed.context.initialForm.current = 'old'; confirmed.context.openApiSettings(); confirmed.context.confirmDiscard();
  assert.deepEqual(confirmed.calls.openChanges, [false]); assert.deepEqual(confirmed.calls.navigation, ['/api-settings']);
  for (const lock of ['busy', 'unresolvedAttempt']) {
    const h = contextHarness(); h.context[lock] = true; h.context.openApiSettings(); assert.deepEqual(h.calls.navigation, []); assert.equal(h.calls.openChanges.length, 0); assert.equal(h.context.discardOpen, false); assert.equal(h.context.pendingDestination.current, null);
  }
  const clean = contextHarness(); clean.context.openApiSettings(); assert.deepEqual(clean.calls.openChanges, [false]); assert.deepEqual(clean.calls.navigation, ['/api-settings']);
  assert.match(source, /onClick=\{openApiSettings\}/); assert.equal(/<Link[^>]*to="\/api-settings"/.test(source), false, 'no unguarded navigation link');
});
await check('discard confirmation rechecks pending state and actor; no native browser dialog remains', () => {
  for (const lock of ['busy', 'initializing', 'unresolvedAttempt']) {
    const h = contextHarness(); h.context.initialForm.current = 'old'; h.context.openApiSettings(); assert.equal(h.context.discardOpen, true);
    h.context[lock] = true; h.context.confirmDiscard();
    assert.equal(h.context.discardOpen, false); assert.equal(h.context.pendingDestination.current, null); assert.deepEqual(h.calls.navigation, []); assert.equal(h.calls.openChanges.length, 0);
  }
  const h = contextHarness(); h.context.initialForm.current = 'old'; h.context.openApiSettings(); h.changeActor(); h.context.confirmDiscard();
  assert.deepEqual(h.calls.navigation, []); assert.deepEqual(h.calls.openChanges, [false], 'stale actor closes via authentication boundary, not discard navigation');
  assert.equal(/window\.confirm\(/.test(source), false);
  assert.match(source, /<AlertDialog open=\{discardOpen\}/); assert.match(source, /onClick=\{cancelDiscard\}/); assert.match(source, /event\.preventDefault\(\);confirmDiscard\(\)/);
});
await check('dialog actor changes block create/status/print before any API invocation, without waiting for host timer', async () => {
  for (const action of ['submit', 'checkStatus', 'printAttempt']) {
    const h = contextHarness();
    if (action === 'checkStatus') { h.context.attempt = terminal('UNKNOWN'); h.context.unresolvedAttempt = true; }
    if (action === 'printAttempt') { h.context.attempt = freshSuccess('current-key'); h.context.latestAttempt.current = h.context.attempt; }
    h.changeActor(); await h.context[action]();
    assert.equal(h.calls.creates.length, 0, action); assert.equal(h.calls.statuses.length, 0, action); assert.equal(h.calls.prints.length, 0, action); assert.equal(h.calls.guards.length, 0, action);
    assert.equal(h.context.attemptSession.current.open, false, action); assert.deepEqual(h.calls.openChanges, [false], action);
  }
  const h = contextHarness(); h.begin(); await settle(); assert.equal(h.calls.guards[0], h.guard, 'recent initialization receives pinned actor');
});
await check('dialog actor switch while create is pending cannot notify or apply old response', async () => {
  const h = contextHarness(), gate = deferred();
  h.context.localApi.createGhnOrder = async (_body, auth) => { assert.equal(auth, h.guard); auth.assertCurrent(); return gate.promise; };
  const pending = h.context.submit(); h.changeActor(); gate.resolve({ data: freshSuccess('current-key') }); await pending;
  assert.equal(h.context.attempt, null); assert.equal(h.calls.notifications, 0); assert.deepEqual(h.calls.openChanges, [false]);
});
await check('review confirmation is tied to parcel/shop/service/fee/payer/COD and reset on change', () => {
  const h = contextHarness();
  const evaluate = () => vm.runInContext(compile('reviewKey', initializers.get('reviewKey')) + '\nreviewKey;', h.context);
  const base = evaluate(); assert.ok(base);
  for (const [name, value] of [['shopId', 'other-shop'], ['fee', 26000], ['payment', '2'], ['cod', 1000], ['autoSelectionReady', false]]) {
    const previous = h.context[name]; h.context[name] = value; assert.notEqual(evaluate(), base, name); h.context[name] = previous;
  }
  h.context.selectedService = { service_id: 53320, service_type_id: 5 }; assert.notEqual(evaluate(), base);
  h.context.selectedService.service_type_id = 2; h.context.quoteInput.snapshot.key = 'changed-measured-parcel'; assert.notEqual(evaluate(), base);
  const reset = effects.find(row => row.kind === 'useLayoutEffect' && row.text.includes("setPickupConsent('')") && !row.text.includes('resetForm'));
  assert.ok(reset, 'actual review-change effect exists'); h.context.pickupConsent = base;
  vm.runInContext(compile('resetConsent', reset.text), h.context); h.context.resetConsent(); assert.equal(h.context.pickupConsent, '');
});
await check('prefill flags malformed metadata without modifying original customer data or guessing parcel', () => {
  const h = contextHarness();
  const customer = { name: 'Synthetic recipient', phone: 'Email:', address: 'Ngày hết hạn: 08/09/2026' };
  h.context.initialDefaults.current = { order: { customers: customer, order_number: 'TEST', total_amount: 100000 }, remainingAmount: 50000 };
  h.context.resetForm();
  assert.equal(h.context.toPhone, ''); assert.equal(h.context.toAddress, ''); assert.match(h.context.prefillWarning, /dữ liệu khách gốc không bị thay đổi/);
  assert.equal(customer.phone, 'Email:'); assert.equal(customer.address, 'Ngày hết hạn: 08/09/2026'); assert.equal(h.context.payment, '2');
  for (const value of Object.values(h.context.parcel)) assert.equal(value, 0, 'operator must measure parcel');
  h.context.initialDefaults.current.order.customers = { ...customer, phone: '0900000003', address: '12 Đường Email, Hà Nội' };
  h.context.resetForm(); assert.equal(h.context.toPhone, '0900000003'); assert.equal(h.context.toAddress, '12 Đường Email, Hà Nội'); assert.equal(h.context.prefillWarning, '');
});
await check('success popup is separate from form and standalone onSuccess refresh does not close it', () => {
  assert.match(source, /if\(attempt\?\.attempt_status==='SUCCESS'&&recoveryReady&&!initializing\)return <Dialog/);
  for (const text of ['Tạo vận đơn thành công', 'Mã vận đơn GHN', 'In phiếu gửi A5', 'Mở phiếu in A5']) assert.ok(source.includes(text), text);
  assert.match(source, /href=\{printUrl\} target="_blank" rel="noopener noreferrer"/);
  assert.equal(/window\.open\(/.test(source), false, 'no delayed window.open or auto-open of a print target');
  const at = page.indexOf('open={standaloneGHNOpen}'); assert.ok(at >= 0);
  const standalone = page.slice(at, page.indexOf('/>', at));
  assert.ok(standalone.includes('onSuccess=')); assert.equal(standalone.includes('setStandaloneGHNOpen(false)'), false, 'refresh parent without dismissing success');
});
console.log('PASS ' + checks + ' GHN success lifecycle groups (extracted actual handlers + static JSX wiring; rendered QA still required).');
