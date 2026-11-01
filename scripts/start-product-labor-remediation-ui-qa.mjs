// Actual SPA against a held, synthetic item-4 API only. No .env or business DB.
// Usage (PTY): node scripts/start-product-labor-mapping-ui-qa.mjs --manifest <owned-qa-manifest.json> --freeze <frozen-hashes.json>
// Stdin: state | fail-list | fail-save | slow-list | slow-save | recover | stop
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { build } from 'vite';
import react from '@vitejs/plugin-react-swc';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const manifestFlag = args.indexOf('--manifest');
assert.ok(manifestFlag >= 0 && args[manifestFlag + 1], 'Pass the owned item-4 QA manifest using --manifest.');
const freezeFlag = args.indexOf('--freeze');
assert.ok(freezeFlag >= 0 && args[freezeFlag + 1], 'Pass the exact item-4 frozen source manifest using --freeze.');
assert.equal(args.length, 4, 'Only --manifest and --freeze are accepted; item-4 always builds a fresh SPA.');
const freezePath = path.resolve(args[freezeFlag + 1]);
const freezeRoot = path.join(root, '.local-staging-runtime', 'item4-baseline');
assert.ok(freezePath.startsWith(freezeRoot + path.sep), 'Freeze manifest must belong to item4-baseline.');
const frozenSources = JSON.parse(await readFile(freezePath, 'utf8'));
assert.ok(Array.isArray(frozenSources) && frozenSources.length > 0);
const verifyFreeze = async () => {
  for (const entry of frozenSources) {
    const filename = path.resolve(entry.Path);
    assert.ok(filename.startsWith(root + path.sep), 'Frozen file must remain inside this checkout.');
    const actual = createHash('sha256').update(await readFile(filename)).digest('hex');
    assert.equal(actual, String(entry.Hash).toLowerCase(), 'Frozen source differs: ' + filename);
  }
};
await verifyFreeze();
const manifestPath = path.resolve(args[manifestFlag + 1]);
assert.equal(path.basename(manifestPath), 'owned-qa-manifest.json');
assert.match(path.basename(path.dirname(manifestPath)), /^product-labor-mapping-owned-[a-z0-9_-]+$/i);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(manifest.synthetic, true);
assert.equal(manifest.owned_test_only, true);
const database = String(manifest.database || '');
assert.match(database, /^product_labor_mapping_qa_[a-z0-9_]+$/i, 'Refusing a shared/business database.');
const upstream = new URL(manifest.apiOrigin || manifest.base || '');
assert.equal(upstream.protocol, 'http:');
assert.equal(upstream.hostname, '127.0.0.1');
assert.equal(upstream.pathname, '/');
assert.equal(upstream.search + upstream.hash + upstream.username + upstream.password, '');
assert.ok(Number(upstream.port) > 0 && !['8787', '16543'].includes(upstream.port));
const trustedOrigin = String(manifest.publicAppUrl || '');
assert.equal(trustedOrigin, 'https://crm.example.com');
const health = async () => {
  const response = await fetch(new URL('/health', upstream), { signal: AbortSignal.timeout(10000), redirect: 'error' });
  assert.equal(response.status, 200, 'Owned API must be live.');
  const value = await response.json();
  assert.equal(value.database, database, 'Owned API database differs from the fixture manifest.');
  assert.equal(value.backend, 'local-postgresql');
  return value;
};
await health();

const captureSources = async () => {
  const hashes = [];
  const walk = async directory => {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(relative);
      else if (/\.(ts|tsx|sql)$/.test(entry.name)) {
        hashes.push({ filename: relative.replaceAll('\\', '/'), sha256: createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex') });
      }
    }
  };
  await walk('src');
  await walk('server');
  return hashes.sort((a, b) => a.filename.localeCompare(b.filename));
};
const sourceHashes = await captureSources();
const artifactPath = path.join(root, '.local-staging-runtime', 'item4-ui-qa', Date.now() + '-' + process.pid);
await mkdir(artifactPath, { recursive: true });
const result = await build({
  root, configFile: false, envFile: false, envDir: false, publicDir: false,
  logLevel: 'warn', plugins: [react()],
  resolve: {
    alias: { '@': path.join(root, 'src'), react: path.join(root, 'node_modules', 'react'), 'react-dom': path.join(root, 'node_modules', 'react-dom') },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  define: {
    'import.meta.env.VITE_BACKEND_MODE': JSON.stringify('local'),
    'import.meta.env.VITE_LOCAL_API_URL': JSON.stringify(''),
    'import.meta.env.VITE_LOCAL_DEMO_AUTH': JSON.stringify('false'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(''),
  },
  build: { outDir: artifactPath, emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 3000 },
});
assert.deepEqual(await captureSources(), sourceHashes, 'Sources changed during the build; freeze and rebuild.');
await verifyFreeze();
await health();
const bundles = Array.isArray(result) ? result : [result];
const files = bundles.flatMap(bundle => bundle.output).map(item => item.fileName).sort();
assert.ok(files.includes('index.html'));
const hashes = [];
for (const filename of files) {
  hashes.push({ filename, sha256: createHash('sha256').update(await readFile(path.join(artifactPath, filename))).digest('hex') });
}
const artifactHash = createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
await writeFile(path.join(artifactPath, 'qa-artifact-manifest.json'), JSON.stringify({
  synthetic: true, createdAt: new Date().toISOString(), database, apiOrigin: upstream.origin,
  artifactHash, artifactFiles: hashes, sourceHashes, freezePath, frozenSources,
}, null, 2));

const app = express();
let failList = false, failSave = false, failDetail = false, listDelay = 0, saveDelay = 0;
const requests = [];
const mappingPath = pathname => /^\/api\/payroll\/labor-mappings(?:\/|$)/.test(pathname);
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; form-action 'self'; object-src 'none'");
  next();
});
app.get('/qa-ui-state', (_req, res) => res.json({ synthetic: true, database, artifactHash, failList, failSave, failDetail, listDelay, saveDelay, requests }));
app.use('/api', express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
  const target = new URL(req.originalUrl, upstream);
  assert.equal(target.origin, upstream.origin);
  const isMapping = mappingPath(target.pathname);
  const isRead = req.method === 'GET' || req.method === 'HEAD';
  const isSourceSave = req.method === 'POST' && target.pathname === '/api/product-supply-classifications/confirm' || req.method === 'PUT' && /^\/api\/product-technical-profiles\/[^/]+$/.test(target.pathname);
  const isSave = isSourceSave || isMapping && req.method === 'POST' && /\/(?:decisions|batch-confirm)\/?$/.test(target.pathname);
  const isDetail = isMapping && isRead && /^\/api\/payroll\/labor-mappings\/products\/[^/]+$/.test(target.pathname);
  const forcedError = (isMapping && isRead && failList) || (isSave && failSave) || (isDetail && failDetail);
  const filters = isMapping ? Object.fromEntries([...target.searchParams].filter(([key]) => /^(?:search|status|view|issue|diagnostics|custom_specifications|price_list_id|priceListId|limit|offset|date|as_of|scope|kind)$/.test(key))) : {};
  const record = { method: req.method, pathname: target.pathname, filters, status: null };
  requests.push(record);
  if (requests.length > 100) requests.shift();
  try {
    if (isMapping && isRead && listDelay) await new Promise(resolve => setTimeout(resolve, listDelay));
    if (isSave && saveDelay) await new Promise(resolve => setTimeout(resolve, saveDelay));
    if (forcedError) {
      record.status = 503;
      return res.status(503).json({ message: 'Lỗi thử nghiệm; dữ liệu chưa được thay đổi.' });
    }
    if (!isRead) await health();
    const headers = new Headers({ origin: trustedOrigin });
    for (const name of ['authorization', 'content-type', 'accept', 'x-idempotency-key']) {
      if (req.headers[name]) headers.set(name, String(req.headers[name]));
    }
    const response = await fetch(target, {
      method: req.method, headers, redirect: 'error',
      body: isRead || !req.body?.length ? undefined : req.body,
      signal: AbortSignal.timeout(30000),
    });
    record.status = response.status;
    res.status(response.status);
    if (response.headers.get('content-type')) res.setHeader('content-type', response.headers.get('content-type'));
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch {
    record.status = 502;
    res.status(502).json({ message: 'API thử nghiệm không phản hồi; không chuyển sang dữ liệu thật.' });
  }
});
app.use(express.static(artifactPath, { index: false, fallthrough: true, dotfiles: 'allow' }));
app.use((req, res) => path.extname(req.path) ? res.status(404).end() : res.sendFile(path.join(artifactPath, 'index.html'), { dotfiles: 'allow' }));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
console.log('PRODUCT_LABOR_MAPPING_UI_QA_READY ' + JSON.stringify({
  origin, artifactPath, artifactHash, database, synthetic: true, helper_pid: process.pid,
  credentials: manifest.credentials,
  commands: ['state', 'fail-list', 'fail-save', 'fail-detail', 'slow-list', 'slow-save', 'recover', 'stop'],
}));
process.stdin.setEncoding('utf8');
process.stdin.on('data', input => {
  for (const command of input.trim().split(/\r?\n/)) {
    if (command === 'fail-list') failList = true;
    if (command === 'fail-save') failSave = true;
    if (command === 'fail-detail') failDetail = true;
    if (command === 'slow-list') listDelay = 2000;
    if (command === 'slow-save') saveDelay = 5000;
    if (command === 'recover') { failList = false; failSave = false; failDetail = false; listDelay = 0; saveDelay = 0; }
    if (command === 'stop') server.close(() => process.exit(0));
    else console.log(JSON.stringify({ synthetic: true, origin, artifactHash, failList, failSave, failDetail, listDelay, saveDelay, requests }));
  }
});
