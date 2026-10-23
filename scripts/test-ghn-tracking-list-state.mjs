import assert from 'node:assert/strict';
import { canLoadGhnTrackingSearch, clampGhnTrackingPage, createGhnTrackingRequestGate, ghnTrackingQueryFingerprint } from '../src/lib/ghn-tracking-list-state.ts';

assert.equal(clampGhnTrackingPage(4, 11, 5), 3);
assert.equal(clampGhnTrackingPage(4, 0, 5), 1);
assert.equal(clampGhnTrackingPage(0, 10, 5), 1);
assert.equal(clampGhnTrackingPage(Number.NaN, -1, Number.NaN), 1);
assert.equal(clampGhnTrackingPage(2.9, 10.9, 3.8), 2);
assert.equal(clampGhnTrackingPage(999, 6, 3), 2);
const gate = createGhnTrackingRequestGate();
const first = gate.invalidate();
const second = gate.invalidate();
assert.equal(gate.isCurrent(first), false);
assert.equal(gate.isCurrent(second), true);
assert.equal(canLoadGhnTrackingSearch('a', ''), false);
assert.equal(canLoadGhnTrackingSearch('', 'a'), false);
assert.equal(canLoadGhnTrackingSearch('ab', 'a'), false);
assert.equal(canLoadGhnTrackingSearch('', ''), true);
assert.equal(canLoadGhnTrackingSearch('a', 'a'), true);
const query = { userId: 'u1', authReady: true, role: 'manager', page: 2, pageSize: 50, status: 'delivering', sortBy: 'priority', sortOrder: 'asc', rawSearch: 'a', debouncedSearch: 'a', searchPending: false };
const requestQuery = ghnTrackingQueryFingerprint(query);
assert.notEqual(requestQuery, ghnTrackingQueryFingerprint({ ...query, rawSearch: 'ab', searchPending: true }));
assert.notEqual(requestQuery, ghnTrackingQueryFingerprint({ ...query, role: 'admin' }));
assert.notEqual(requestQuery, ghnTrackingQueryFingerprint({ ...query, page: 1 }));
assert.notEqual(requestQuery, ghnTrackingQueryFingerprint({ ...query, status: 'picked' }));
assert.notEqual(requestQuery, ghnTrackingQueryFingerprint({ ...query, sortOrder: 'desc' }));

// Model two overlapping asynchronous responses: only the newest request is
// allowed to commit, even if the stale promise resolves last.
const deferredGate = createGhnTrackingRequestGate();
const commits = [];
let releaseFirst;
let releaseSecond;
const firstDone = new Promise(resolve => { releaseFirst = resolve; });
const secondDone = new Promise(resolve => { releaseSecond = resolve; });
const firstRequest = deferredGate.invalidate();
const firstResponse = firstDone.then(() => { if (deferredGate.isCurrent(firstRequest)) commits.push('first'); });
const secondRequest = deferredGate.invalidate();
const secondResponse = secondDone.then(() => { if (deferredGate.isCurrent(secondRequest)) commits.push('second'); });
releaseSecond();
await secondResponse;
releaseFirst();
await firstResponse;
assert.deepEqual(commits, ['second']);
console.log('GHN list state: debounce, fingerprint, async gate and page clamping passed.');
