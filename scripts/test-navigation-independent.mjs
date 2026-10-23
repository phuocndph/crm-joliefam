// TEST-ONLY: independent permission oracle, actual pure helpers and deterministic
// execution of the actual favorites hook. No browser, .env, database or network.
// Run: node scripts/test-navigation-independent.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as navigation from '../src/lib/navigation-catalog.ts';

const { NAVIGATION_CATALOG: catalog, NAVIGATION_GROUPS: groups, MAX_NAVIGATION_PINS,
  visibleNavigationItems, isNavigationItemVisible, navigationItemsInSection,
  navigationItemsByGroup, navigationGroupForPath, normalizeNavigationSearch,
  searchNavigationItems, isNavigationSearchShortcut, navigationFavoritesStorageKey,
  sanitizeNavigationFavoriteIds, parseNavigationFavoriteIds, defaultBottomNavigationItems,
} = navigation;
let count = 0;
const check = async (name, run) => { await run(); count++; console.log('PASS navigation: ' + name); };
const ids = items => Array.from(items, item => item.id);
const paths = items => Array.from(items, item => item.path).sort();
const plain = value => JSON.parse(JSON.stringify(value));
const context = (permissions = [], overrides = {}) => ({ actorId: 'fixture-employee', role: 'employee', isLocalBackend: false, hasLocalSession: false, hasPermission: permission => permissions.includes(permission), ...overrides });
const local = (permissions = [], overrides = {}) => context(permissions, { isLocalBackend: true, hasLocalSession: true, ...overrides });
const all = visibleNavigationItems(local([], { actorId: 'fixture-admin', role: 'admin', hasPermission: () => true }));
const byId = id => catalog.find(item => item.id === id);
const expectedRoutes = ['/api-settings', '/integration-access', '/dashboard', '/customers', '/customer-care', '/products', '/fabrics', '/inventory-management', '/production-orders', '/production-attendance', '/my-attendance', '/my-profile', '/payroll-settings', '/quotes', '/orders', '/contracts', '/einvoices', '/ghn-tracking', '/cash-flow', '/transactions', '/reports', '/cost-management', '/knowledge-base', '/ai-settings', '/web-scraper', '/shipping-companies', '/user-management', '/profile-review'];
const expectedGroups = {
  sales: ['customers', 'quotes', 'orders', 'customer-care', 'contracts', 'products'],
  operations: ['production-orders', 'fabrics', 'inventory-management'],
  delivery: ['ghn-tracking', 'shipping-companies'],
  people: ['production-attendance', 'payroll-settings', 'profile-review'],
  finance: ['cash-flow', 'transactions', 'einvoices', 'cost-management'],
  system: ['user-management', 'api-settings', 'integration-access', 'ai-settings', 'knowledge-base', 'web-scraper'],
};
// Deliberately independent of catalog metadata. Every pre-existing permission
// leg must still allow the same route, rather than testing a catalog against itself.
const permissionOracle = {
  dashboard: ['dashboard'], reports: ['reports'], customers: ['customers'], quotes: ['quotes'], orders: ['orders'],
  'customer-care': ['customer_care'], contracts: ['contracts'], products: ['products'], fabrics: ['fabric_management'],
  'inventory-management': ['inventory_view'], 'ghn-tracking': ['ghn_tracking'], 'shipping-companies': ['shipping_companies'],
  'production-orders': ['production_view', 'production_manage', 'production_operations', 'production_sales_submit', 'production_sales_workflow', 'production_cutting_plan', 'inventory_documents', 'ghn_tracking'],
  'production-attendance': ['production_view', 'production_operations', 'production_manage'],
  'payroll-settings': ['payroll_view', 'payroll_team_view', 'payroll_worker_manage', 'payroll_rate_view', 'payroll_rate_manage', 'payroll_policy_manage', 'payroll_insurance_manage', 'payroll_bank_manage', 'payroll_audit'],
  'cash-flow': ['cash_flow'], transactions: ['transactions'], einvoices: ['contracts'],
  'cost-management': ['cost_transactions', 'cost_categories', 'cost_centers', 'cost_objects', 'transaction_types', 'cost_audit'],
  'user-management': ['user_management'], 'profile-review': ['user_management'], 'ai-settings': ['user_management'], 'web-scraper': ['user_management'], 'knowledge-base': ['knowledge_base'],
};

await check('exact 28 unique preserved routes, six work groups and two separate sections', () => {
  assert.equal(catalog.length, 28); assert.equal(new Set(ids(catalog)).size, 28);
  assert.deepEqual(paths(catalog), expectedRoutes.sort());
  assert.deepEqual(groups.map(group => group.id), Object.keys(expectedGroups));
  for (const [group, expected] of Object.entries(expectedGroups)) assert.deepEqual(ids(navigationItemsByGroup(catalog, group)), expected);
  assert.deepEqual(ids(navigationItemsInSection(catalog, 'top')), ['dashboard', 'reports']);
  assert.deepEqual(ids(navigationItemsInSection(catalog, 'account')), ['my-attendance', 'my-profile']);
  assert.ok(catalog.every(item => item.path.startsWith('/') && item.icon && item.label && Array.isArray(item.aliases)));
});
await check('catalog is immutable, including aliases and OR-permission arrays', () => {
  assert.ok(Object.isFrozen(catalog) && Object.isFrozen(groups));
  for (const item of catalog) {
    assert.ok(Object.isFrozen(item) && Object.isFrozen(item.aliases));
    if (item.permissions) assert.ok(Object.isFrozen(item.permissions));
  }
});
await check('anonymous, missing identity and empty hosted permissions expose nothing', () => {
  assert.deepEqual(visibleNavigationItems(context()), []);
  for (const actorId of [null, undefined, '']) assert.deepEqual(visibleNavigationItems(local([], { actorId, role: 'admin', hasPermission: () => true })), []);
});
await check('every single and OR permission preserves independent legacy route visibility', () => {
  const permissionList = [...new Set(Object.values(permissionOracle).flat()), 'unrelated_permission'];
  for (const role of ['employee', 'accountant', 'team_leader', 'manager', 'admin']) {
    for (const permission of permissionList) {
      const actual = ids(visibleNavigationItems(context([permission], { role }))).sort();
      const expected = Object.entries(permissionOracle).filter(([, permissions]) => permissions.includes(permission)).map(([id]) => id).sort();
      assert.deepEqual(actual, expected, role + ':' + permission);
    }
  }
});
await check('combined explicit permissions never reveal unauthorized items', () => {
  for (const permissions of [['orders', 'ghn_tracking'], ['contracts', 'payroll_bank_manage'], ['inventory_documents', 'cost_audit'], ['user_management', 'reports'], Object.values(permissionOracle).flat()]) {
    assert.deepEqual(ids(visibleNavigationItems(context(permissions))).sort(), Object.entries(permissionOracle).filter(([, expected]) => expected.some(permission => permissions.includes(permission))).map(([id]) => id).sort());
  }
});
await check('real local sessions retain production and self-route visibility without generic grants', () => {
  assert.deepEqual(ids(visibleNavigationItems(local())).sort(), ['my-attendance', 'my-profile', 'production-orders']);
  assert.deepEqual(visibleNavigationItems(local([], { hasLocalSession: false })), []);
  assert.deepEqual(visibleNavigationItems(context([], { hasLocalSession: true })), []);
});
await check('API and Agent integrations only show for real local admin, not manager/demo/hosted', () => {
  for (const id of ['api-settings', 'integration-access']) {
    assert.equal(isNavigationItemVisible(byId(id), local([], { role: 'admin', actorId: 'real-local-admin' })), true);
    for (const overrides of [{ role: 'manager' }, { role: 'accountant' }, { role: 'employee' }, { role: 'team_leader' }, { role: 'admin', actorId: 'local-admin' }, { role: 'admin', hasLocalSession: false }, { role: 'admin', isLocalBackend: false }]) assert.equal(isNavigationItemVisible(byId(id), local([], { hasPermission: () => true, ...overrides })), false, id + ':' + JSON.stringify(overrides));
  }
});
await check('group selection resolves authorized route only and never invents groups for top/account/menu', () => {
  for (const [group, groupIds] of Object.entries(expectedGroups)) for (const id of groupIds) assert.equal(navigationGroupForPath(byId(id).path, all), group);
  for (const pathname of ['/dashboard', '/reports', '/my-attendance', '/my-profile', '/menu', '/auth', '/not-real']) assert.equal(navigationGroupForPath(pathname, all), null);
  assert.equal(navigationGroupForPath('/orders', visibleNavigationItems(context(['customers']))), null);
});
await check('Vietnamese search removes accents/đ/case, normalizes spaces and supports aliases', () => {
  assert.equal(normalizeNavigationSearch('  ĐƠN   HÀNG  '), 'don hang');
  assert.deepEqual(ids(searchNavigationItems(all, 'don hang')), ['orders']);
  assert.deepEqual(ids(searchNavigationItems(all, 'cham cong xuong')), ['production-attendance']);
  assert.deepEqual(ids(searchNavigationItems(all, 'cskh')), ['customer-care']);
  assert.deepEqual(ids(searchNavigationItems(all, 'hermes')), ['integration-access']);
  assert.ok(ids(searchNavigationItems(all, 'payroll')).includes('payroll-settings'));
  assert.deepEqual(searchNavigationItems(all, 'khong-co-chuc-nang-nay-987'), []);
});
await check('search only sees supplied authorized items, including blank query and hidden admin aliases', () => {
  const visible = visibleNavigationItems(context(['orders']));
  assert.deepEqual(ids(searchNavigationItems(visible, '')), ['orders']);
  assert.deepEqual(ids(searchNavigationItems(visible, '   ')), ['orders']);
  for (const query of ['api', 'hermes', 'lương', 'ghn', 'khach hang']) assert.deepEqual(searchNavigationItems(visible, query), []);
  assert.notEqual(searchNavigationItems(visible, ''), visible, 'search result does not return the caller array for mutation');
});
await check('Ctrl/Cmd K shortcut does not intercept editing fields, Alt or unrelated keys', () => {
  const event = overrides => ({ key: 'k', ctrlKey: true, metaKey: false, altKey: false, target: null, ...overrides });
  assert.equal(isNavigationSearchShortcut(event({})), true);
  assert.equal(isNavigationSearchShortcut(event({ key: 'K', ctrlKey: false, metaKey: true })), true);
  for (const overrides of [{ ctrlKey: false }, { altKey: true }, { key: 'b' }, ...['INPUT', 'textarea', 'select'].map(tagName => ({ target: { tagName } })), { target: { tagName: 'DIV', isContentEditable: true } }]) assert.equal(isNavigationSearchShortcut(event(overrides)), false);
  assert.equal(isNavigationSearchShortcut(event({ target: { tagName: 'BUTTON' } })), true);
});
await check('pin storage keys isolate actor, backend and origin without accepting missing identity', () => {
  const base = { actorId: 'fixture-one', isLocalBackend: true, origin: 'http://127.0.0.1:12345' };
  const keys = [base, { ...base, actorId: 'fixture-two' }, { ...base, isLocalBackend: false }, { ...base, origin: 'http://127.0.0.1:12346' }].map(navigationFavoritesStorageKey);
  assert.equal(new Set(keys).size, 4); assert.ok(keys.every(key => typeof key === 'string' && key.length > 0));
  assert.equal(navigationFavoritesStorageKey({ ...base, actorId: null }), null);
  assert.equal(navigationFavoritesStorageKey({ ...base, origin: '' }), null);
  assert.notEqual(navigationFavoritesStorageKey({ ...base, actorId: 'a:b' }), navigationFavoritesStorageKey({ ...base, actorId: 'a%3Ab' }));
});
await check('pins cap at four, deduplicate and reject unknown, hidden, account and malformed values', () => {
  assert.equal(MAX_NAVIGATION_PINS, 4);
  const candidates = [null, 8, {}, 'unknown', 'my-attendance', 'orders', 'orders', 'quotes', 'customers', 'ghn-tracking', 'reports'];
  assert.deepEqual(sanitizeNavigationFavoriteIds(candidates, all), ['orders', 'quotes', 'customers', 'ghn-tracking']);
  assert.deepEqual(sanitizeNavigationFavoriteIds(candidates, visibleNavigationItems(context(['customers']))), ['customers']);
  for (const bad of [null, undefined, '', '{}', 'null', '123', 'broken json', '"orders"']) assert.deepEqual(parseNavigationFavoriteIds(bad, all), []);
  assert.deepEqual(parseNavigationFavoriteIds(JSON.stringify(candidates), all), ['orders', 'quotes', 'customers', 'ghn-tracking']);
});
await check('revoked permissions prune pins and default shortcuts never promote hidden routes', () => {
  const before = ['orders', 'quotes', 'customers', 'ghn-tracking'];
  const after = visibleNavigationItems(context(['customers', 'ghn_tracking']));
  assert.deepEqual(sanitizeNavigationFavoriteIds(before, after), ['customers', 'ghn-tracking']);
  for (const role of ['admin', 'manager', 'employee', 'accountant', 'team_leader', null]) assert.ok(defaultBottomNavigationItems(after, before, role).every(item => after.includes(item)));
});
await check('bottom defaults are role-specific, deduplicated, max-three and respect favorite priority', () => {
  assert.deepEqual(ids(defaultBottomNavigationItems(all, [], 'admin')), ['orders', 'quotes', 'customers']);
  assert.deepEqual(ids(defaultBottomNavigationItems(all, [], 'manager')), ['orders', 'quotes', 'customers']);
  assert.deepEqual(ids(defaultBottomNavigationItems(all, [], 'accountant')), ['cash-flow', 'transactions', 'reports']);
  assert.deepEqual(ids(defaultBottomNavigationItems(all, [], 'employee')), ['orders', 'quotes', 'customers']);
  assert.deepEqual(ids(defaultBottomNavigationItems(all, [], 'team_leader')), ['my-attendance', 'production-orders', 'production-attendance']);
  assert.deepEqual(ids(defaultBottomNavigationItems(all, ['reports', 'reports', 'orders', 'quotes', 'customers'], 'admin')), ['reports', 'orders', 'quotes']);
  assert.deepEqual(defaultBottomNavigationItems([], ['orders'], 'employee'), []);
});
await check('employee defaults prefer authorized sales work, with workshop self/production fallback only when no CRM work exists', () => {
  const sales = visibleNavigationItems(context(['orders', 'quotes']));
  assert.deepEqual(ids(defaultBottomNavigationItems(sales, [], 'employee')), ['orders', 'quotes']);
  const workshop = visibleNavigationItems(local(['production_operations']));
  assert.deepEqual(ids(defaultBottomNavigationItems(workshop, [], 'employee')), ['my-attendance', 'production-orders', 'production-attendance']);
  const minimal = visibleNavigationItems(local());
  assert.deepEqual(ids(defaultBottomNavigationItems(minimal, [], 'employee')), ['my-attendance', 'production-orders', 'my-profile']);
  const restrictedAccountant = visibleNavigationItems(context(['orders']));
  assert.deepEqual(ids(defaultBottomNavigationItems(restrictedAccountant, [], 'accountant')), ['orders'], 'authorized fallback is retained when finance defaults are not allowed');
});

const hookSource = await readFile(new URL('../src/hooks/useNavigationFavorites.ts', import.meta.url), 'utf8');
const dependenciesEqual = (a, b) => Boolean(a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index])));
// This executes the real hook, but deliberately does not claim React DOM timing,
// browser keyboard, focus, accessibility, or rendered layout coverage.
function hookHarness(initialInput, { storage = new Map(), storageBlocked = false } = {}) {
  const hooks = [], listeners = new Map();
  let cursor = 0, pending = [], dirty = false, input = initialInput, result, frames = [];
  let blocked = storageBlocked;
  const react = {
    useState(initial) { const at = cursor++; if (!(at in hooks)) hooks[at] = { value: typeof initial === 'function' ? initial() : initial }; return [hooks[at].value, next => { const value = typeof next === 'function' ? next(hooks[at].value) : next; if (!Object.is(value, hooks[at].value)) { hooks[at].value = value; dirty = true; } }]; },
    useRef(initial) { const at = cursor++; if (!(at in hooks)) hooks[at] = { current: initial }; return hooks[at]; },
    useMemo(factory, deps) { const at = cursor++; if (!dependenciesEqual(hooks[at]?.deps, deps)) hooks[at] = { deps, value: factory() }; return hooks[at].value; },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) { const at = cursor++; if (!dependenciesEqual(hooks[at]?.deps, deps)) { const previous = hooks[at]?.cleanup; hooks[at] = { deps }; pending.push(() => { previous?.(); hooks[at].cleanup = effect(); }); } },
  };
  const fixtureWindow = {
    location: { origin: 'http://navigation-fixture.invalid' },
    localStorage: { getItem(key) { if (blocked) throw new Error('fixture storage blocked'); return storage.get(key) ?? null; }, setItem(key, value) { if (blocked) throw new Error('fixture storage blocked'); storage.set(key, value); }, removeItem(key) { if (blocked) throw new Error('fixture storage blocked'); storage.delete(key); } },
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
  };
  const module = { exports: {} };
  const javascript = ts.transpileModule(hookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(javascript, { module, exports: module.exports, window: fixtureWindow, require: name => { if (name === 'react') return react; if (name === '@/lib/navigation-catalog') return navigation; throw new Error('Unexpected hook dependency: ' + name); } });
  const render = () => {
    frames = [];
    for (let n = 0; n < 40; n++) { cursor = 0; pending = []; dirty = false; result = module.exports.useNavigationFavorites(input); frames.push(result); pending.forEach(run => run()); if (!dirty) return result; }
    throw new Error('Favorites hook state did not settle');
  };
  render();
  return { render, get result() { return result; }, get frames() { return frames; }, storage, setInput(next) { input = { ...input, ...next }; return render(); }, blockStorage(value) { blocked = value; }, dispatchStorage(event) { listeners.get('storage')?.forEach(callback => callback(event)); return render(); }, unmount() { hooks.forEach(hook => hook.cleanup?.()); }, listenerCount() { return listeners.get('storage')?.size || 0; } };
}
const hookInput = overrides => ({ actorId: 'fixture-one', isLocalBackend: true, visibleItems: all, ...overrides });
const hookKey = (actorId = 'fixture-one', isLocalBackend = true) => navigationFavoritesStorageKey({ actorId, isLocalBackend, origin: 'http://navigation-fixture.invalid' });

await check('actual favorites hook handles add/remove, cap, duplicates and unavailable routes', () => {
  const h = hookHarness(hookInput());
  for (const id of ['orders', 'quotes', 'customers', 'reports']) { assert.equal(h.result.toggleFavorite(id), 'added'); h.render(); }
  assert.equal(h.result.toggleFavorite('ghn-tracking'), 'limit');
  assert.equal(h.result.toggleFavorite('my-profile'), 'unavailable');
  assert.equal(h.result.toggleFavorite('not-real'), 'unavailable');
  assert.deepEqual(plain(h.result.favoriteIds), ['orders', 'quotes', 'customers', 'reports']);
  assert.equal(h.result.toggleFavorite('quotes'), 'removed'); h.render();
  assert.equal(h.result.toggleFavorite('ghn-tracking'), 'added'); h.render();
  assert.deepEqual(JSON.parse(h.storage.get(hookKey())), ['orders', 'customers', 'reports', 'ghn-tracking']); h.unmount();
});
await check('actual hook isolates account/backend storage and tolerates malformed storage', () => {
  const storage = new Map([[hookKey(), '["orders","quotes"]'], [hookKey('fixture-two'), '["customers"]'], [hookKey('fixture-two', false), 'broken']]);
  const h = hookHarness(hookInput(), { storage });
  assert.deepEqual(plain(h.result.favoriteIds), ['orders', 'quotes']);
  h.setInput({ actorId: 'fixture-two' }); assert.deepEqual(plain(h.frames[0].favoriteIds), [], 'old actor pins must be hidden even before effects run'); assert.deepEqual(plain(h.result.favoriteIds), ['customers']);
  h.setInput({ isLocalBackend: false }); assert.deepEqual(plain(h.result.favoriteIds), []);
  h.setInput({ actorId: null }); assert.deepEqual(plain(h.result.favoriteIds), []); h.unmount();
});
await check('actual hook prunes revoked permission and never displays it from storage updates', () => {
  const h = hookHarness(hookInput(), { storage: new Map([[hookKey(), '["orders","customers"]']]) });
  const reduced = visibleNavigationItems(context(['customers']));
  h.setInput({ visibleItems: reduced });
  assert.deepEqual(plain(h.result.favoriteIds), ['customers']);
  assert.deepEqual(ids(h.result.visibleFavoriteItems), ['customers']);
  h.dispatchStorage({ key: hookKey(), newValue: '["orders","customers","unknown"]' });
  assert.deepEqual(plain(h.result.favoriteIds), ['customers']);
  assert.deepEqual(JSON.parse(h.storage.get(hookKey())), ['customers'], 'pruning is persisted, not just visually filtered');
  h.setInput({ visibleItems: all }); assert.deepEqual(plain(h.result.favoriteIds), ['customers'], 're-grant must not resurrect a pruned pin'); h.unmount();
});
await check('actual hook hides unresolved authority without overwriting stored favorites or enabling toggles', () => {
  const initial = '["orders","customers"]';
  const h = hookHarness(hookInput({ accessResolved: false, visibleItems: [] }), { storage: new Map([[hookKey(), initial]]) });
  assert.deepEqual(plain(h.result.favoriteIds), []); assert.equal(h.storage.get(hookKey()), initial);
  assert.equal(h.result.toggleFavorite('orders'), 'unavailable');
  h.setInput({ accessResolved: true, visibleItems: all }); assert.deepEqual(plain(h.result.favoriteIds), ['orders', 'customers']);
  h.setInput({ accessResolved: false, visibleItems: [] }); assert.deepEqual(plain(h.result.favoriteIds), []); assert.equal(h.storage.get(hookKey()), initial);
  h.setInput({ accessResolved: true, visibleItems: visibleNavigationItems(context(['customers'])) });
  assert.deepEqual(plain(h.result.favoriteIds), ['customers']); assert.deepEqual(JSON.parse(h.storage.get(hookKey())), ['customers']); h.unmount();
});
await check('actual hook cross-tab sync only listens to matching identity and cleans up on unmount', () => {
  const h = hookHarness(hookInput());
  assert.equal(h.listenerCount(), 1);
  h.dispatchStorage({ key: hookKey('fixture-two'), newValue: '["orders"]' }); assert.deepEqual(plain(h.result.favoriteIds), []);
  h.dispatchStorage({ key: hookKey(), newValue: '["orders","orders","quotes","customers","reports","ghn-tracking"]' });
  assert.deepEqual(plain(h.result.favoriteIds), ['orders', 'quotes', 'customers', 'reports']);
  h.dispatchStorage({ key: hookKey(), newValue: null }); assert.deepEqual(plain(h.result.favoriteIds), []);
  h.setInput({ actorId: 'fixture-two' }); assert.equal(h.listenerCount(), 1);
  h.dispatchStorage({ key: hookKey(), newValue: '["orders"]' }); assert.deepEqual(plain(h.result.favoriteIds), []);
  h.unmount(); assert.equal(h.listenerCount(), 0);
});
await check('actual hook keeps choices in memory when localStorage is blocked', () => {
  const h = hookHarness(hookInput(), { storageBlocked: true });
  assert.equal(h.result.toggleFavorite('orders'), 'added'); h.render();
  assert.equal(h.result.toggleFavorite('customers'), 'added'); h.render();
  assert.deepEqual(plain(h.result.favoriteIds), ['orders', 'customers']);
  assert.equal(h.result.toggleFavorite('orders'), 'removed'); h.render();
  assert.deepEqual(plain(h.result.favoriteIds), ['customers']);
  h.setInput({ accessResolved: false, visibleItems: [] }); assert.deepEqual(plain(h.result.favoriteIds), []);
  h.setInput({ accessResolved: true, visibleItems: all }); assert.deepEqual(plain(h.result.favoriteIds), ['customers'], 'permission refresh cannot lose in-memory choices when storage is blocked');
  h.unmount();
});

const permissionSource = await readFile(new URL('../src/hooks/useEmployeePermissions.tsx', import.meta.url), 'utf8');
function permissionHarness({ hosted = false, role = 'employee', generic = ['orders', 'customers'], payroll = [] } = {}) {
  const hooks = [];
  let cursor = 0, pending = [], dirty = false, result, refresh;
  let user = { id: 'fixture-permission-one' }, userRole = role;
  let scenario = { generic, payroll, genericFailure: false, payrollFailure: false, guardFailure: false };
  const react = {
    useState(initial) { const at = cursor++; if (!(at in hooks)) hooks[at] = { value: typeof initial === 'function' ? initial() : initial }; return [hooks[at].value, next => { const value = typeof next === 'function' ? next(hooks[at].value) : next; if (!Object.is(value, hooks[at].value)) { hooks[at].value = value; dirty = true; } }]; },
    useRef(initial) { const at = cursor++; if (!(at in hooks)) hooks[at] = { current: initial }; return hooks[at]; },
    useEffect(effect, deps) { const at = cursor++; if (!dependenciesEqual(hooks[at]?.deps, deps)) { const previous = hooks[at]?.cleanup; hooks[at] = { deps }; pending.push(() => { previous?.(); hooks[at].cleanup = effect(); }); } },
  };
  const genericRead = async () => { if (scenario.genericFailure) throw new Error('synthetic generic permission failure'); return scenario.generic.map(permission_type => ({ permission_type, enabled: true })); };
  const payrollRead = async () => { if (scenario.payrollFailure) throw new Error('synthetic payroll permission failure'); return scenario.payroll.map(permission_type => ({ permission_type, allowed: true })); };
  const hostedGenericRead = async () => {
    try { return { data: await genericRead(), error: null }; }
    catch (error) { return { data: null, error }; }
  };
  const module = { exports: {} };
  const javascript = ts.transpileModule(permissionSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const imports = {
    react,
    '@/integrations/supabase/client': { supabase: { from(table) { assert.equal(table, 'employee_permissions'); return { select: () => ({ eq: () => hostedGenericRead() }) }; } } },
    '@/lib/payroll-master-data': { listPayrollCapabilities: payrollRead },
    '@/lib/runtime-config': { isLocalBackend: () => !hosted },
    '@/lib/local-api': { localApi: { employeePermissions: genericRead, payrollCapabilities: payrollRead } },
    '@/lib/permission-refresh': { listenPermissionRefresh(callback) { refresh = callback; return () => { refresh = null; }; } },
    '@/lib/local-auth': { captureLocalAuthGuard: async () => ({ assertCurrent() { if (scenario.guardFailure) throw new Error('synthetic stale identity'); } }) },
  };
  vm.runInNewContext(javascript, { module, exports: module.exports, console: { error() {} }, require: name => { if (name in imports) return imports[name]; throw new Error('Unexpected permission-hook dependency: ' + name); } });
  const render = () => {
    for (let n = 0; n < 40; n++) { cursor = 0; pending = []; dirty = false; result = module.exports.useEmployeePermissions(user, userRole); pending.forEach(run => run()); if (!dirty) return result; }
    throw new Error('Permission hook state did not settle');
  };
  const settle = async () => { for (let n = 0; n < 16; n++) { await Promise.resolve(); render(); } return result; };
  render();
  return { render, settle, get result() { return result; }, configure(next) { scenario = { ...scenario, ...next }; }, refresh(reason = 'permissions-changed') { refresh?.(reason); return render(); }, setIdentity(nextUser, nextRole) { user = nextUser; userRole = nextRole; return render(); }, unmount() { hooks.forEach(hook => hook.cleanup?.()); } };
}

await check('actual permission metadata distinguishes successful empty reads from generic/payroll/guard errors', async () => {
  for (const hosted of [false, true]) {
    const h = permissionHarness({ hosted, generic: [], payroll: [] });
    assert.equal(h.result.permissionDataResolved, false, 'unresolved initial authority is not an empty successful result');
    await h.settle(); assert.equal(h.result.loading, false); assert.equal(h.result.permissionDataResolved, true);
    for (const failure of ['genericFailure', 'payrollFailure', ...(!hosted ? ['guardFailure'] : [])]) {
      h.configure({ genericFailure: false, payrollFailure: false, guardFailure: false, [failure]: true });
      h.refresh(); assert.equal(h.result.permissionDataResolved, false);
      await h.settle(); assert.equal(h.result.loading, false); assert.equal(h.result.permissionDataResolved, false, 'error does not authorize persistent pruning: ' + failure);
      h.configure({ [failure]: false }); h.refresh(); await h.settle(); assert.equal(h.result.permissionDataResolved, true, 'successful retry resolves metadata');
    }
    h.setIdentity({ id: 'fixture-permission-two' }, 'employee'); assert.equal(h.result.permissionDataResolved, false, 'old identity metadata is never reused');
    await h.settle(); assert.equal(h.result.permissionDataResolved, true);
    h.setIdentity(null, null); await h.settle(); assert.equal(h.result.permissionDataResolved, false); h.unmount();
  }
});
await check('actual permission-hook/favorites pipeline preserves pins on read error and prunes only authoritative success', async () => {
  const permissions = permissionHarness();
  const storage = new Map([[hookKey(), '["orders","customers"]']]);
  const favorite = hookHarness(hookInput({ accessResolved: permissions.result.permissionDataResolved, visibleItems: [] }), { storage });
  const sync = () => favorite.setInput({ accessResolved: permissions.result.permissionDataResolved, visibleItems: visibleNavigationItems(local([], { hasPermission: permissions.result.hasPermission })) });
  await permissions.settle(); sync(); assert.deepEqual(plain(favorite.result.favoriteIds), ['orders', 'customers']);
  permissions.configure({ genericFailure: true }); permissions.refresh(); sync(); await permissions.settle(); sync();
  assert.equal(permissions.result.loading, false); assert.equal(permissions.result.permissionDataResolved, false);
  assert.deepEqual(plain(favorite.result.favoriteIds), []); assert.equal(storage.get(hookKey()), '["orders","customers"]', 'failed lookup must not erase saved favorites');
  permissions.configure({ genericFailure: false }); permissions.refresh(); await permissions.settle(); sync();
  assert.deepEqual(plain(favorite.result.favoriteIds), ['orders', 'customers']);
  permissions.configure({ generic: [] }); permissions.refresh(); await permissions.settle(); sync();
  assert.equal(permissions.result.permissionDataResolved, true); assert.deepEqual(JSON.parse(storage.get(hookKey())), [], 'confirmed revocation is persisted');
  permissions.unmount(); favorite.unmount();
});
await check('hosted permission reads retain each successful domain when the other domain fails', async () => {
  const h = permissionHarness({ hosted: true, generic: ['orders'], payroll: ['payroll_view'] });
  await h.settle(); assert.equal(h.result.hasPermission('orders'), true); assert.equal(h.result.hasPermission('payroll_view'), true);
  h.configure({ payrollFailure: true }); h.refresh(); await h.settle();
  assert.equal(h.result.loading, false); assert.equal(h.result.permissionDataResolved, false);
  assert.equal(h.result.hasPermission('orders'), true, 'payroll transport failure must not remove successfully read generic access');
  assert.equal(h.result.hasPermission('payroll_view'), false);
  h.configure({ payrollFailure: false, genericFailure: true }); h.refresh(); await h.settle();
  assert.equal(h.result.loading, false); assert.equal(h.result.permissionDataResolved, false);
  assert.equal(h.result.hasPermission('orders'), false);
  assert.equal(h.result.hasPermission('payroll_view'), true, 'generic transport failure must not discard successfully read payroll capability');
  h.unmount();
});

const parseTsx = (name, source) => ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const unwrap = node => ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
const jsxTag = node => ts.isJsxElement(node) ? node.openingElement.tagName.getText() : ts.isJsxSelfClosingElement(node) ? node.tagName.getText() : null;
const jsxAttributes = node => ts.isJsxElement(node) ? node.openingElement.attributes.properties : ts.isJsxSelfClosingElement(node) ? node.attributes.properties : [];
await check('both layout loading and ready branches preserve NavigationProvider root and use success metadata, not loading alone', async () => {
  for (const name of ['MainLayout', 'MobileLayout']) {
    const source = await readFile(new URL('../src/components/layout/' + name + '.tsx', import.meta.url), 'utf8');
    const tree = parseTsx(name + '.tsx', source);
    let component;
    const find = node => { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) component = node.initializer; ts.forEachChild(node, find); }; find(tree);
    assert.ok(component && ts.isArrowFunction(component));
    const roots = [];
    const visit = node => {
      if (node !== component.body && (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node))) return;
      if (ts.isReturnStatement(node) && node.expression) roots.push(unwrap(node.expression));
      ts.forEachChild(node, visit);
    }; visit(component.body);
    assert.ok(roots.length > 0);
    for (const root of roots) {
      assert.equal(jsxTag(root), 'NavigationProvider', name + ' cannot unmount provider by returning a loading div at the root');
      const attributes = jsxAttributes(root);
      const access = attributes.find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'accessResolved');
      assert.ok(access?.initializer && access.initializer.getText(tree).includes('permissionDataResolved'), name + ' must use successful identity-bound permission metadata');
      assert.equal(attributes.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'key'), false, 'provider is not keyed by loading state');
    }
  }
});
await check('settled permission errors cannot leave either layout blocked behind an infinite loading screen', async () => {
  for (const name of ['MainLayout', 'MobileLayout']) {
    const source = await readFile(new URL('../src/components/layout/' + name + '.tsx', import.meta.url), 'utf8');
    const tree = parseTsx(name + '.tsx', source);
    let component;
    const find = node => { if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) component = node.initializer; ts.forEachChild(node, find); }; find(tree);
    const guards = [];
    const visit = node => {
      if (node !== component.body && (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node))) return;
      if (ts.isIfStatement(node) && ts.isReturnStatement(node.thenStatement) && node.thenStatement.expression && jsxTag(unwrap(node.thenStatement.expression)) === 'NavigationProvider') guards.push(node.expression);
      ts.forEachChild(node, visit);
    }; visit(component.body);
    for (const guard of guards) {
      const javascript = ts.transpileModule('(' + guard.getText(tree) + ')', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
      const blocked = vm.runInNewContext(javascript, { loading: false, roleLoading: false, permissionsLoading: false, permissionDataResolved: false, user: { id: 'fixture-active-user' }, userRole: 'employee' });
      assert.equal(Boolean(blocked), false, name + ' finished a failed request; unresolved metadata protects pins but must not be a loading gate');
    }
  }
});
await check('desktop/tablet has a visible function-search trigger at 800px, not only a lg-and-up wrapper', async () => {
  const source = await readFile(new URL('../src/components/layout/MainLayout.tsx', import.meta.url), 'utf8');
  const tree = parseTsx('MainLayout.tsx', source);
  const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 };
  const displayed = classes => {
    let visible = true;
    const relevant = classes.split(/\s+/).map(token => { const parts = token.split(':'); const utility = parts.pop(); const at = parts.length ? breakpoints[parts[0]] : 0; return { utility, at }; }).filter(row => row.at !== undefined && row.at <= 800 && ['hidden', 'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid'].includes(row.utility)).sort((a, b) => a.at - b.at);
    for (const row of relevant) visible = row.utility !== 'hidden';
    return visible;
  };
  const candidates = [];
  const visit = node => {
    if (jsxTag(node) === 'DesktopNavigationSearch') {
      let visible = true, parent = node.parent;
      while (parent) {
        const attr = jsxAttributes(parent).find(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(tree) === 'className');
        if (attr?.initializer && ts.isStringLiteral(attr.initializer)) visible = visible && displayed(attr.initializer.text);
        parent = parent.parent;
      }
      candidates.push(visible);
    }
    ts.forEachChild(node, visit);
  }; visit(tree);
  assert.ok(candidates.some(Boolean), 'tablet users must have a visible search trigger without knowing Ctrl K');
});

const searchSource = await readFile(new URL('../src/components/navigation/NavigationSearch.tsx', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
function searchHarness(initialProps) {
  const hooks = [], listeners = new Map(), navigated = [], scrolled = [];
  let cursor = 0, pending = [], dirty = false, props = initialProps, tree;
  const react = {
    useState(initial) { const at = cursor++; if (!(at in hooks)) hooks[at] = { value: typeof initial === 'function' ? initial() : initial }; return [hooks[at].value, next => { const value = typeof next === 'function' ? next(hooks[at].value) : next; if (!Object.is(value, hooks[at].value)) { hooks[at].value = value; dirty = true; } }]; },
    useRef(initial) { const at = cursor++; if (!(at in hooks)) hooks[at] = { current: initial }; return hooks[at]; },
    useMemo(factory, deps) { const at = cursor++; if (!dependenciesEqual(hooks[at]?.deps, deps)) hooks[at] = { deps, value: factory() }; return hooks[at].value; },
    useEffect(effect, deps) { const at = cursor++; if (!dependenciesEqual(hooks[at]?.deps, deps)) { const previous = hooks[at]?.cleanup; hooks[at] = { deps }; pending.push(() => { previous?.(); hooks[at].cleanup = effect(); }); } },
  };
  const module = { exports: {} };
  const javascript = ts.transpileModule(searchSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const imports = {
    react, 'lucide-react': { Search: 'search-icon' },
    'react-router-dom': { useNavigate: () => path => navigated.push(path) },
    '@/components/ui/button': { Button: 'button' }, '@/components/ui/input': { Input: 'input' },
    '@/components/ui/dialog': { Dialog: 'dialog', DialogContent: 'dialog-content', DialogHeader: 'dialog-header', DialogTitle: 'dialog-title' },
    '@/lib/navigation-catalog': navigation,
    './NavigationItemRow': { NavigationItemRow: 'navigation-row' },
  };
  const fixtureWindow = {
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
  };
  vm.runInNewContext(javascript, { module, exports: module.exports, window: fixtureWindow, require: name => name in imports ? imports[name] : require(name) });
  const visit = (node, predicate) => {
    if (Array.isArray(node)) return node.flatMap(child => visit(child, predicate));
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...visit(node.props?.children, predicate)];
  };
  const find = predicate => visit(tree, predicate);
  const render = () => {
    for (let n = 0; n < 40; n++) {
      cursor = 0; pending = []; dirty = false; tree = module.exports.NavigationSearch(props);
      find(node => node.type === 'navigation-row').forEach(node => node.props.rowRef?.({ scrollIntoView(options) { scrolled.push({ id: node.props.item.id, options: plain(options) }); } }));
      pending.forEach(run => run()); if (!dirty) return tree;
    }
    throw new Error('Search handler state did not settle');
  };
  render();
  return { render, find, navigated, scrolled, setProps(next) { props = { ...props, ...next }; return render(); }, shortcut(event) { listeners.get('keydown')?.forEach(callback => callback(event)); return render(); }, unmount() { hooks.forEach(hook => hook.cleanup?.()); }, listenerCount() { return listeners.get('keydown')?.size || 0; } };
}
const searchProps = overrides => ({ items: all, pathname: '/menu', favoriteIds: [], onToggleFavorite: () => 'added', ...overrides });
const keyboardEvent = key => ({ key, ctrlKey: false, metaKey: false, altKey: false, target: null, prevented: false, preventDefault() { this.prevented = true; } });
await check('actual search handlers keep arrow selection in view and controls/descriptions point at rendered nodes', () => {
  const h = searchHarness(searchProps());
  const input = () => h.find(node => node.type === 'input')[0];
  const dialog = () => h.find(node => node.type === 'dialog')[0];
  const selected = () => h.find(node => node.type === 'navigation-row' && node.props.className?.includes('ring-'))[0];
  h.find(node => node.type === 'button' && node.props['aria-label'] === 'Tìm chức năng')[0].props.onClick(); h.render();
  assert.equal(dialog().props.open, true);
  const controls = input().props['aria-controls'], description = input().props['aria-describedby'];
  assert.ok(controls && h.find(node => node.props?.id === controls).length === 1, 'aria-controls resolves to the actual result container');
  assert.ok(description && h.find(node => node.props?.id === description).length === 1, 'selection announcement exists');
  const searchable = all.filter(item => item.section !== 'account');
  for (let n = 0; n < searchable.length + 3; n++) { input().props.onKeyDown(keyboardEvent('ArrowDown')); h.render(); }
  assert.equal(selected().props.item.id, searchable.at(-1).id);
  assert.equal(h.scrolled.at(-1).id, searchable.at(-1).id); assert.deepEqual(h.scrolled.at(-1).options, { block: 'nearest' });
  input().props.onKeyDown(keyboardEvent('ArrowUp')); h.render();
  assert.equal(h.scrolled.at(-1).id, searchable.at(-2).id);
  h.setProps({ items: visibleNavigationItems(context(['orders'])) });
  assert.equal(selected().props.item.id, 'orders', 'shrinking authorized result list clamps keyboard index');
  input().props.onKeyDown(keyboardEvent('Enter')); h.render(); assert.deepEqual(h.navigated, ['/orders']); assert.equal(dialog().props.open, false); h.unmount();
});
await check('actual search shortcut/query/no-result/reset handlers preserve authorization and listener lifetime', () => {
  let closed = 0;
  const h = searchHarness(searchProps({ items: visibleNavigationItems(context(['orders', 'quotes'])), onNavigate: () => closed++ }));
  const input = () => h.find(node => node.type === 'input')[0];
  const dialog = () => h.find(node => node.type === 'dialog')[0];
  assert.equal(h.listenerCount(), 1);
  const shortcut = { ...keyboardEvent('k'), ctrlKey: true }; h.shortcut(shortcut); assert.equal(shortcut.prevented, true); assert.equal(dialog().props.open, true);
  input().props.onChange({ target: { value: 'don hang' } }); h.render();
  assert.deepEqual(h.find(node => node.type === 'navigation-row').map(node => node.props.item.id), ['orders']);
  input().props.onChange({ target: { value: 'hermes' } }); h.render();
  assert.equal(h.find(node => node.type === 'navigation-row').length, 0); assert.equal(h.find(node => node.props?.role === 'status').length, 1);
  input().props.onKeyDown(keyboardEvent('Enter')); h.render(); assert.deepEqual(h.navigated, []);
  input().props.onKeyDown(keyboardEvent('Escape')); h.render(); assert.equal(dialog().props.open, false); assert.equal(input().props.value, ''); assert.equal(closed, 1);
  h.setProps({ enableShortcut: false }); assert.equal(h.listenerCount(), 0); h.unmount();
});
console.log('PASS ' + count + ' navigation independent groups (pure helpers and actual-hook simulation; rendered browser QA is separate).');
