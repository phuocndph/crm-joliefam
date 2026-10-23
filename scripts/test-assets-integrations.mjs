import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { syncStorage } from './sync-supabase-storage-to-local.mjs';
import { normalizeStorageUrl, rewriteStorageUrls } from '../server/storage-urls.ts';
import { ExternalReadAdapters } from '../server/external-read-adapters.ts';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'crm-assets-test-'));
const source = path.join(root, 'source'), target = path.join(root, 'target');
const checks = [];
const check = async (label, action) => { await action(); checks.push(label); console.log('PASS ' + label); };
try {
  await fs.mkdir(path.join(source, 'product-images', 'nested'), { recursive: true });
  await fs.writeFile(path.join(source, 'product-images', 'nested', 'ảnh.png'), 'original');
  await check('dry run changes no assets; apply imports exact bytes and repeated run unchanged', async () => {
    const dry = await syncStorage({ sourceDir: source, storageRoot: target }); assert.equal(dry.files[0].status, 'would-import'); await assert.rejects(fs.stat(target));
    const applied = await syncStorage({ sourceDir: source, storageRoot: target, apply: true }); assert.equal(applied.files[0].status, 'imported');
    assert.equal(await fs.readFile(path.join(target, 'product-images', 'nested', 'ảnh.png'), 'utf8'), 'original');
    assert.equal((await syncStorage({ sourceDir: source, storageRoot: target, apply: true })).files[0].status, 'unchanged');
  });
  await check('equal-size changed data is SHA256 conflict; existing asset preserved and incoming staged', async () => {
    await fs.writeFile(path.join(source, 'product-images', 'nested', 'ảnh.png'), 'modified');
    const report = await syncStorage({ sourceDir: source, storageRoot: target, apply: true }); assert.equal(report.files[0].status, 'conflict');
    assert.equal(await fs.readFile(path.join(target, 'product-images', 'nested', 'ảnh.png'), 'utf8'), 'original');
    assert.equal(await fs.readFile(path.join(target, '.import-conflicts', report.files[0].sha256, 'product-images', 'nested', 'ảnh.png'), 'utf8'), 'modified');
  });
  await check('source overlap and symlink/junction reject without following links', async () => {
    await assert.rejects(syncStorage({ sourceDir: source, storageRoot: path.join(source, 'output'), apply: true }));
    const link = path.join(root, 'linked-source'); await fs.symlink(source, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(syncStorage({ sourceDir: link, storageRoot: target, apply: true }));
  });
  await check('manifest validates bytes and checksum, rejects mismatch', async () => {
    const manifest = path.join(root, 'manifest.json');
    await fs.writeFile(manifest, JSON.stringify({ version: 1, files: [{ bucket: 'product-images', path: 'nested/ảnh.png', bytes: 8, sha256: createHash('sha256').update('modified').digest('hex') }] }));
    assert.equal((await syncStorage({ sourceDir: source, storageRoot: target, manifest })).files[0].status, 'conflict');
    await fs.writeFile(manifest, JSON.stringify({ version: 1, files: [{ bucket: 'product-images', path: 'nested/ảnh.png', bytes: 8, sha256: '0'.repeat(64) }] }));
    await assert.rejects(syncStorage({ sourceDir: source, storageRoot: target, manifest, apply: true }));
  });
  await check('remote nested bucket listing paginates and traversal entries fail closed', async () => {
    const calls = [], remote = { storage: { listBuckets: async () => ({ data: [{ id: 'logos' }, { id: 'knowledge-files' }] }), from: bucket => ({ list: async (prefix, options) => { calls.push([bucket, prefix, options.offset]); return { data: Array.from({ length: options.offset === 0 ? 100 : 1 }, (_, n) => ({ id: 'id', name: 'file-' + (n + options.offset) })) }; }, download: async name => ({ data: new Blob([name]) }) }) } };
    const report = await syncStorage({ source: remote, storageRoot: target }); assert.equal(report.files.length, 202); assert.equal(calls.length, 4);
    remote.storage.from = () => ({ list: async () => ({ data: [{ id: 'id', name: '../escape' }] }) }); await assert.rejects(syncStorage({ source: remote, storageRoot: target }));
  });
  await check('known storage URLs and serialized fields normalize, unrelated text and origins preserved', async () => {
    const canonical = '/api/local-storage/product-images/object?path=nested%2F%E1%BA%A3nh.png';
    assert.equal(normalizeStorageUrl('https://project.supabase.co/storage/v1/render/image/public/product-images/nested/%E1%BA%A3nh.png?width=400'), canonical);
    assert.equal(normalizeStorageUrl('http://127.0.0.1:8787' + canonical), canonical);
    const hostile = 'https://attacker.example/storage/v1/object/public/product-images/a.png'; assert.equal(normalizeStorageUrl(hostile), hostile);
    const embedded = 'See https://project.supabase.co/storage/v1/object/public/logos/a.png'; assert.equal(rewriteStorageUrls(embedded), embedded);
    const serialized = JSON.stringify([{ image: 'https://project.supabase.co/storage/v1/object/sign/knowledge-files/doc.pdf?token=SECRET' }]);
    const rewritten = rewriteStorageUrls(serialized); assert.ok(!rewritten.includes('SECRET')); assert.equal(JSON.parse(rewritten)[0].image, '/api/local-storage/knowledge-files/object?path=doc.pdf');
    assert.equal(normalizeStorageUrl('https://project.supabase.co/storage/v1/object/public/logos/%2e%2e%2fsecret'), 'https://project.supabase.co/storage/v1/object/public/logos/%2e%2e%2fsecret');
  });
  await check('GHN unconfigured and all unsupported writes fail without network or fake fees/shipments', async () => {
    let calls = 0; const adapter = new ExternalReadAdapters({}, async () => { calls++; throw new Error('never'); });
    for (const action of ['create_order', 'save_tracking', 'update_cod', 'update_order', 'cancel_order', 'print_a5', 'bulk_sync']) assert.equal((await adapter.ghn({ action })).success, false);
    assert.equal((await adapter.ghn({ action: 'calculate_fee' })).success, false); assert.equal(calls, 0); assert.equal(adapter.status().ghn.configured, false);
  });
  await check('GHN fixed host and allowlisted shop reject client override; fee and tracking retain real response', async () => {
    const requests = [], adapter = new ExternalReadAdapters({ GHN_API_KEY: 'test-key-not-real', GHN_SHOP_ID: '123' }, async (url, init) => {
      requests.push({ url, init, body: init.body?JSON.parse(init.body):{} });
      const data = String(url).endsWith('/detail') ? { order_code: 'GHN123', shop_id: 123, status: 'delivered', to_name: 'QA' } : String(url).endsWith('/fee') ? { total: 34567, service_fee: 30000 } : new URL(url).pathname.endsWith('/shop/all') ? { shops: [{ _id: 123,status:1,district_id:1442 }, { _id: 999,status:1,district_id:2222 }],last_offset:0 } : [];
      return new Response(JSON.stringify({ code: 200, data }), { status: 200 });
    });
    assert.equal(adapter.status().ghn.configured, true);
    await adapter.ghn({ action: 'get_provinces', url: 'https://evil.invalid' }); await adapter.ghn({ action: 'get_districts', provinceId: 201 }); await adapter.ghn({ action: 'get_wards', districtId: 1442 });
    await assert.rejects(adapter.ghn({ action: 'get_services', shopId: 999, fromDistrictId: 1, toDistrictId: 2 }),error=>error.status===403);
    await adapter.ghn({ action: 'get_services', shopId: '123', toDistrictId: 2 });
    const fee = await adapter.ghn({ action: 'calculate_fee', shopId: '123', feeData: { to_district_id: 2, to_ward_code: '012345', weight: 1000, service_type_id: 2 } }); assert.equal(fee.data.total, 34567);
    assert.deepEqual((await adapter.ghn({ action: 'get_shops' })).data.map(row=>row._id), [123]);
    assert.equal((await adapter.ghn({ action: 'track', orderCode: 'GHN123' })).data.customerName, 'QA');
    for (const request of requests) { assert.ok(request.url.startsWith('https://online-gateway.ghn.vn/shiip/public-api/')); assert.equal(request.init.headers.ShopId, '123'); assert.equal(request.init.redirect, 'error'); assert.ok(request.init.signal); if (request.body.shop_id) assert.equal(request.body.shop_id, 123); }
  });
  await check('external failures and malformed input do not expose tokens or upstream errors', async () => {
    const adapter = new ExternalReadAdapters({ GHN_API_KEY: 'DO-NOT-LEAK', GHN_SHOP_ID: '123' }, async () => { throw new Error('DO-NOT-LEAK credentials'); });
    await assert.rejects(adapter.ghn({ action: 'get_provinces' }), error => !error.message.includes('DO-NOT-LEAK'));
    await assert.rejects(adapter.ghn({ action: 'get_districts', provinceId: '../' })); await assert.rejects(adapter.taxCode('../secret'));
    const wrongShop = new ExternalReadAdapters({ GHN_API_KEY: 'test-key-not-real', GHN_SHOP_ID: '123' }, async () => new Response(JSON.stringify({ code: 200, data: { shop_id: 999 } })));
    await assert.rejects(wrongShop.ghn({ action: 'track', orderCode: 'GHN123' }), error => error.status === 403);
  });
  await check('tax lookup validates input and maps a real VietQR response only', async () => {
    let calls = 0; const adapter = new ExternalReadAdapters({}, async url => { calls++; assert.equal(url, 'https://api.vietqr.io/v2/business/0123456789'); return new Response(JSON.stringify({ code: '00', data: { name: 'Doanh nghiệp QA', address: 'Địa chỉ QA' } })); });
    assert.equal((await adapter.taxCode('0123456789')).company_name, 'Doanh nghiệp QA'); assert.equal(calls, 1);
  });
  console.log(`ASSETS + INTEGRATIONS: ${checks.length} groups passed.`);
} finally { await fs.rm(root, { recursive: true, force: true }); }
