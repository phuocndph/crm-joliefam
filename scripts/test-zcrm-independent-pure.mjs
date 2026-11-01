import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// This suite uses only fixture secrets and never loads an env file or a database.
const repo = fileURLToPath(new URL('..', import.meta.url));
const reference = process.env.ZCRM_CONTRACT_REFERENCE_DIR || path.resolve(repo, '../outputs/zcrm-integration-20261029/reference');
const load = relative => import(pathToFileURL(path.join(repo, relative)).href);
const ref = name => import(pathToFileURL(path.join(reference, name)).href);
const clone = value => structuredClone(value);

export async function runPureChecks() {
  process.env.ZCRM_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  const [domain, transfers, upstream, validators] = await Promise.all([
    load('server/zcrm-domain.ts'), load('server/zcrm-transfer.ts'),
    ref('commerce-domain.ts'), ref('commerce-contract.ts'),
  ]);
  const checks = [];
  const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
  const draft = {
    customerId: 'fixture-hotel', orderedBy: '  Lễ tân khách sạn  ',
    recipient: { name: ' Bộ phận buồng ', phone: '0900000001', address: ' Địa chỉ thử riêng, Hà Nội ' },
    desiredDate: '2026-11-01', notes: ' Đơn thử, không gửi bên ngoài ',
    lines: [{ productId: 'fixture-product', name: ' Tên khách nhập ', kind: 'custom', quantity: 2.125,
      unit: 'cái', proposedPrice: 250000, specifications: { 'Chất liệu': ' Cotton ', 'Kích thước': ' 160 x 200 cm ' },
      attachments: [{ name: ' Bản đo.pdf ', mediaId: 'fixture-media-1' }] }],
  };
  await check('Exact upstream normalized draft serialization and SHA256 fingerprint', () => {
    for (const input of [draft, { ...draft, newCustomer: { kind: 'hotel', phone: '+84900000001', name: ' Khách sạn ' } },
      { ...draft, lines: [{ ...draft.lines[0], variant: null, warehouseId: undefined, proposedPrice: null, attachments: [], specifications: {} }] },
      { ...draft, customerId: null, orderedBy: '', recipient: {}, desiredDate: '', notes: '', lines: [] }]) {
      const theirs = upstream.parseDraft(input), ours = domain.parseDraft(input);
      assert.deepEqual(ours, theirs);
      assert.equal(JSON.stringify(ours), JSON.stringify(theirs));
      assert.equal(domain.fingerprint(ours), upstream.fingerprint(theirs));
    }
  });
  await check('Malformed quantities, money types, price cap, dates and bounds rejected', () => {
    for (const quantity of [0, -1, NaN, Infinity, '2', 10000001]) {
      assert.throws(() => domain.parseDraft({ ...draft, lines: [{ ...draft.lines[0], quantity }] }));
    }
    for (const proposedPrice of [-1, 0.5, '1000', 1000000000001, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => upstream.parseDraft({ ...draft, lines: [{ ...draft.lines[0], proposedPrice }] }));
      assert.throws(() => domain.parseDraft({ ...draft, lines: [{ ...draft.lines[0], proposedPrice }] }));
    }
    for (const desiredDate of ['2026-02-29', '2026-11-31', '2026-1-01', 'yesterday']) {
      assert.throws(() => domain.parseDraft({ ...draft, desiredDate }));
    }
    for (const input of [ { ...draft, lines: Array(101).fill(draft.lines[0]) },
      { ...draft, lines: [{ ...draft.lines[0], specifications: Object.fromEntries(Array.from({ length: 31 }, (_, i) => ['field' + i, 'value'])) }] },
      { ...draft, lines: [{ ...draft.lines[0], attachments: Array(11).fill(draft.lines[0].attachments[0]) }] },
      { ...draft, notes: 'x'.repeat(5001) }, { ...draft, recipient: { ...draft.recipient, name: '\0' } } ]) {
      assert.throws(() => domain.parseDraft(input));
    }
  });
  await check('Decimal quantities use whole-VND arithmetic and detect upstream binary tie mismatch', () => {
    for (const [quantity, price, expected] of [[2.125, 250000, 531250], [0.25, 101, 25], [2.5, 101, 253], [1.25, 999, 1249], [0.0001, 10000, 1]]) {
      assert.equal(domain.lineAmount(quantity, price), expected);
      assert.equal(Math.round(quantity * price), expected);
    }
    assert.throws(() => domain.lineAmount(1.005, 100), e => e.code === 'ROUNDING_CONTRACT_MISMATCH' && e.status === 422);
    assert.throws(() => domain.vnd(1.25));
    assert.throws(() => domain.sum([Number.MAX_SAFE_INTEGER, 1]));
    assert.equal(domain.sum([100000, 200000, 123]), 300123);
  });
  await check('Ciphertext is randomized authenticated encryption, not recoverable plaintext', () => {
    const value = 'FixtureOnly-' + randomBytes(32).toString('hex');
    const first = domain.encrypt(value), second = domain.encrypt(value);
    assert.notEqual(first, second); assert.ok(!first.includes(value));
    assert.equal(domain.decrypt(first), value);
    const changed = Buffer.from(first, 'base64'); changed[changed.length - 1] ^= 1;
    assert.throws(() => domain.decrypt(changed.toString('base64')), e => e.code === 'ENCRYPTION_UNAVAILABLE');
    process.env.ZCRM_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    assert.throws(() => domain.decrypt(first));
  });
  await check('Opaque cursor integrity and key binding', () => {
    const value = { connection: 'fixture-one', query: 'hotel', after: 'fixture-id' }, secret = randomBytes(32).toString('hex');
    const cursor = domain.cursorEncode(value, secret);
    assert.deepEqual(domain.cursorDecode(cursor, secret), value);
    assert.throws(() => domain.cursorDecode(cursor + '0', secret));
    assert.throws(() => domain.cursorDecode(cursor, randomBytes(32).toString('hex')));
    assert.throws(() => domain.cursorDecode('x'.repeat(501), secret));
  });
  await check('Exact public HTTPS origin and private/reserved address rejection', () => {
    assert.equal(domain.safeOrigin('https://zcrm.joliefam.vn'), 'https://zcrm.joliefam.vn');
    for (const value of ['http://zcrm.joliefam.vn', 'https://127.0.0.1', 'https://localhost', 'https://user:pass@zcrm.joliefam.vn',
      'https://zcrm.joliefam.vn/api', 'https://zcrm.joliefam.vn:8443', 'https://zcrm.joliefam.vn?x=1', 'https://zcrm.joliefam.vn#x']) {
      assert.throws(() => domain.safeOrigin(value));
    }
    for (const address of ['127.0.0.1', '0.0.0.0', '10.0.0.1', '169.254.169.254', '172.16.1.1', '192.168.1.1', '100.64.1.1',
      '198.18.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1']) {
      assert.equal(transfers.publicIp(address), false, address);
    }
    for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(transfers.publicIp(address), true, address);
  });
  const normalized = domain.parseDraft(draft), origin = 'https://zcrm.joliefam.vn', org = 'fixture-org';
  const manifest = [{ name: 'Bản đo.pdf', mediaId: 'fixture-media-1', url: origin + '/api/v1/joliefam/transfer/' + org + '/fixture-draft/fixture-media-1' }];
  await check('Attachment manifest must exactly match named media, org and one draft', () => {
    assert.equal(transfers.transferManifest(normalized, manifest, origin, org).length, 1);
    for (const input of [[], [...manifest, { ...manifest[0], mediaId: 'not-declared' }], [{ ...manifest[0], name: 'different.pdf' }]]) {
      assert.throws(() => transfers.transferManifest(normalized, input, origin, org));
    }
    for (const url of [manifest[0].url.replace(origin, 'https://evil.invalid'), manifest[0].url.replace(origin, 'http://zcrm.joliefam.vn'),
      manifest[0].url.replace('/fixture-org/', '/other-org/'), manifest[0].url.replace(/fixture-media-1$/, 'other-media'),
      manifest[0].url + '?token=x', manifest[0].url + '#fragment', manifest[0].url.replace('/fixture-draft/', '/%2e%2e/'),
      manifest[0].url.replace(origin, 'https://user:pass@zcrm.joliefam.vn'), manifest[0].url.replace('/transfer/', '/files/')]) {
      assert.throws(() => transfers.transferManifest(normalized, [{ ...manifest[0], url }], origin, org));
    }
    const two = clone(normalized); two.lines[0].attachments.push({ name: 'Image.png', mediaId: 'fixture-media-2' });
    const mixed = [...manifest, { name: 'Image.png', mediaId: 'fixture-media-2', url: origin + '/api/v1/joliefam/transfer/' + org + '/another-draft/fixture-media-2' }];
    assert.throws(() => transfers.transferManifest(two, mixed, origin, org));
  });
  await check('Accepted file bytes and hashes are durable staged data and cleanup removes them', async () => {
    let calls = 0;
    const bytes = Buffer.from('Fixture-only measurement PDF bytes\n');
    const staged = await transfers.stageAttachments(normalized, manifest, origin, org, 'FixtureOnly-Transfer-Token', async (url, options) => {
      calls++; assert.equal(url.href, manifest[0].url); assert.equal(options.method, 'GET');
      assert.equal(options.headers.Authorization, 'Bearer FixtureOnly-Transfer-Token');
      assert.equal(options.maxBytes, 15728640); assert.ok(options.timeoutMs <= 10500);
      return { status: 200, body: bytes, mime: 'application/pdf' };
    });
    assert.equal(calls, 1); assert.equal(staged.files.length, 1);
    assert.equal(staged.files[0].size, bytes.length); assert.equal(staged.files[0].hash, domain.sha(bytes));
    assert.deepEqual(await readFile(staged.files[0].path), bytes);
    await staged.cleanup(); await assert.rejects(stat(staged.files[0].path), { code: 'ENOENT' });
  });
  await check('Oversized, redirected, missing and partly transferred attachments never succeed', async () => {
    for (const response of [{ status: 302, body: Buffer.alloc(0), mime: 'text/html' },
      { status: 404, body: Buffer.alloc(0), mime: 'application/octet-stream' },
      { status: 200, body: Buffer.alloc(15728641), mime: 'application/pdf' }]) {
      await assert.rejects(transfers.stageAttachments(normalized, manifest, origin, org, 'FixtureOnly', async () => response));
    }
    await assert.rejects(transfers.stageAttachments(normalized, manifest, origin, org, 'FixtureOnly', async () => { throw new Error('Fixture network failure'); }));
    const two = clone(normalized); two.lines[0].attachments.push({ name: 'Image.png', mediaId: 'fixture-media-2' });
    const entries = [...manifest, { name: 'Image.png', mediaId: 'fixture-media-2', url: origin + '/api/v1/joliefam/transfer/' + org + '/fixture-draft/fixture-media-2' }];
    const before = new Set((await readdir(os.tmpdir())).filter(n => n.startsWith('joliefam-zcrm-transfer-'))); let calls = 0;
    await assert.rejects(transfers.stageAttachments(two, entries, origin, org, 'FixtureOnly', async () => ++calls === 1
      ? { status: 200, body: Buffer.from('first fixture'), mime: 'application/pdf' }
      : { status: 404, body: Buffer.alloc(0), mime: 'text/plain' }));
    assert.equal(calls, 2);
    const leaked = (await readdir(os.tmpdir())).filter(n => n.startsWith('joliefam-zcrm-transfer-') && !before.has(n));
    assert.deepEqual(leaked, [], 'partial transfer leaves no fixture staging folder');
  });
  await check('Real transport denies private destinations before opening HTTPS', async () => {
    await assert.rejects(transfers.publicTransport(new URL('https://127.0.0.1/fixture'), {
      method: 'GET', headers: {}, maxBytes: 100, timeoutMs: 1000,
    }));
    await assert.rejects(transfers.publicTransport(new URL('https://[::1]/fixture'), {
      method: 'GET', headers: {}, maxBytes: 100, timeoutMs: 1000,
    }));
  });
  await check('Transport deadline includes stalled DNS without opening external sockets', async () => {
    let calls = 0, sentinel;
    try { const started = Date.now();
      const result = await Promise.race([
        transfers.resolvePublicHost('fixture-dns-never-used.invalid', 30, async () => { calls++; return new Promise(() => {}); }).then(() => 'unexpected success', () => 'bounded rejection'),
        new Promise(resolve => { sentinel = setTimeout(() => resolve('DNS exceeded transport deadline'), 400); }),
      ]);
      assert.equal(calls, 1, 'DNS seam intercepts lookup before any network call');
      assert.equal(result, 'bounded rejection'); assert.ok(Date.now() - started < 350);
    } finally { clearTimeout(sentinel); }
  });
  await check('Attachment aggregate100MB and100distinct-file ceilings reject without leaving staged files', async () => {
    assert.equal(transfers.ZCRM_ATTACHMENT_TOTAL_BYTES, 100 * 1024 * 1024); assert.equal(transfers.ZCRM_ATTACHMENT_MAX_FILES, 100);
    const oversized = clone(normalized); oversized.lines[0].attachments = Array.from({ length: 7 }, (_, i) => ({ name: 'File-' + i + '.pdf', mediaId: 'aggregate-' + i }));
    const entries = oversized.lines[0].attachments.map(a => ({ ...a, url: origin + '/api/v1/joliefam/transfer/' + org + '/fixture-draft/' + a.mediaId }));
    const before = new Set((await readdir(os.tmpdir())).filter(n => n.startsWith('joliefam-zcrm-transfer-'))), body = Buffer.alloc(15 * 1024 * 1024); let calls = 0;
    await assert.rejects(transfers.stageAttachments(oversized, entries, origin, org, 'FixtureOnly-Aggregate', async (_url, options) => { calls++; assert.ok(options.maxBytes <= 15 * 1024 * 1024); return { status: 200, body, mime: 'application/pdf' }; }));
    assert.equal(calls, 7); assert.deepEqual((await readdir(os.tmpdir())).filter(n => n.startsWith('joliefam-zcrm-transfer-') && !before.has(n)), []);
    const many = clone(normalized); many.lines = Array.from({ length: 11 }, (_, line) => ({ ...clone(normalized.lines[0]), attachments: Array.from({ length: line === 10 ? 1 : 10 }, (_, item) => ({ name: 'Fixture.pdf', mediaId: 'count-' + line + '-' + item })) }));
    const manifest101 = many.lines.flatMap(l => l.attachments).map(a => ({ ...a, url: origin + '/api/v1/joliefam/transfer/' + org + '/fixture-draft/' + a.mediaId }));
    await assert.rejects(transfers.stageAttachments(many, manifest101, origin, org, 'FixtureOnly-Count', async () => { throw new Error('File-count limit must reject before transport'); }), error => error.code === 'ATTACHMENT_LIMIT');
  });
  await check('Original upstream validators reject missing or fabricated contract fields', () => {
    assert.equal(validators.customerValid({ id: 'c', code: 'C', name: 'Hotel', kind: 'hotel', contacts: [], addresses: [] }), true);
    assert.equal(validators.customerValid({ id: 'c', code: 'C', name: 'Hotel', kind: 'hotel' }), false);
    assert.equal(validators.productValid({ id: 'p', sku: 'P', name: 'Product', kind: 'custom', unit: 'cái', price: null, available: null, updatedAt: new Date().toISOString(), requiredFields: [] }), true);
    assert.equal(validators.summaryValid({ currency: 'VND', orderCount: 0, netSales: 0, collected: 0, due: -1, activeOrderCount: 0 }), false);
    assert.equal(validators.pageValid({ items: [], nextCursor: null }, validators.customerValid), true);
    assert.equal(validators.pageValid({ items: [], nextCursor: 'x'.repeat(501) }, validators.customerValid), false);
  });
  return checks;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const checks = await runPureChecks();
  console.log('ZCRM INDEPENDENT PURE COMPLETE (' + checks.length + ' groups); no hosted connection claimed.');
}
