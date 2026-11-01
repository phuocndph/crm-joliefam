// Actual SPA against a held, synthetic item-2 API only. No .env or business DB.
// Usage (PTY): node scripts/start-product-technical-ui-qa.mjs --manifest <owned-qa-manifest.json>
// Stdin: state | fail-list | fail-save | slow-list | recover | stop
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { build } from 'vite';
import react from '@vitejs/plugin-react-swc';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const manifestFlag = args.indexOf('--manifest');
assert.ok(manifestFlag >= 0 && args[manifestFlag + 1], 'Pass the owned item-2 QA manifest using --manifest.');
assert.equal(args.length, 2, 'Only --manifest is accepted; item-2 always builds a fresh SPA.');
const manifestPath = path.resolve(args[manifestFlag + 1]);
assert.equal(path.basename(manifestPath), 'owned-qa-manifest.json');
assert.match(path.basename(path.dirname(manifestPath)), /^product-technical-owned-[a-z0-9_-]+$/i);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(manifest.synthetic, true);
assert.equal(manifest.owned_test_only, true);
const database = String(manifest.database || '');
assert.match(database, /^product_technical_qa_[a-z0-9_]+$/i, 'Refusing a shared/business database.');
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
const artifactPath = path.join(root, '.local-staging-runtime', 'item2-ui-qa', Date.now() + '-' + process.pid);
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
  artifactHash, artifactFiles: hashes, sourceHashes,
}, null, 2));

const app = express();
let failList = false, failSave = false, listDelay = 0;
const requests = [];
const technicalPath = pathname => /^\/api\/product-technical-profiles(?:\/|$)/.test(pathname);
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; form-action 'self'; object-src 'none'");
  next();
});
app.get('/qa-ui-state', (_req, res) => res.json({ synthetic: true, database, artifactHash, failList, failSave, listDelay, requests }));
app.use('/api', express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
  const target = new URL(req.originalUrl, upstream);
  assert.equal(target.origin, upstream.origin);
  const isTechnical = technicalPath(target.pathname);
  const isRead = req.method === 'GET' || req.method === 'HEAD';
  const forcedError = isTechnical && (isRead ? failList : failSave);
  const record = { method: req.method, pathname: target.pathname, status: null };
  requests.push(record);
  if (requests.length > 100) requests.shift();
  try {
    if (isTechnical && isRead && listDelay) await new Promise(resolve => setTimeout(resolve, listDelay));
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
console.log('PRODUCT_TECHNICAL_UI_QA_READY ' + JSON.stringify({
  origin, artifactPath, artifactHash, database, synthetic: true, helper_pid: process.pid,
  credentials: manifest.credentials,
  commands: ['state', 'fail-list', 'fail-save', 'slow-list', 'recover', 'stop'],
}));
process.stdin.setEncoding('utf8');
process.stdin.on('data', input => {
  for (const command of input.trim().split(/\r?\n/)) {
    if (command === 'fail-list') failList = true;
    if (command === 'fail-save') failSave = true;
    if (command === 'slow-list') listDelay = 2000;
    if (command === 'recover') { failList = false; failSave = false; listDelay = 0; }
    if (command === 'stop') server.close(() => process.exit(0));
    else console.log(JSON.stringify({ synthetic: true, origin, artifactHash, failList, failSave, listDelay, requests }));
  }
});
