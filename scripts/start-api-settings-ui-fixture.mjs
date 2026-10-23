// TEST-ONLY SIMULATION: actual SPA + in-memory API, never the operational API.
// Does not read .env, use PostgreSQL, store submitted keys, or contact providers.
// Start: node scripts/start-api-settings-ui-fixture.mjs
// stdin: state | fail-next | conflict-next | stop
import assert from 'node:assert/strict';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { build } from 'vite';
import react from '@vitejs/plugin-react-swc';

const root = fileURLToPath(new URL('..', import.meta.url));
const credentials = { email: 'admin@fixture.invalid', password: 'FixtureOnly!123' };
const session = { actor: 'fixture-admin', token: 'synthetic-ui-fixture-session-only', role: 'admin', expires_at: new Date(Date.now() + 4 * 3600000).toISOString() };
const me = { user_id: session.actor, email: credentials.email, role: 'admin', first_name: 'Dữ liệu thử', last_name: 'API Settings', assigned_by: null, worker_id: null, employee_code: null, worker_name: null };
let mode = 'INHERIT_ENV', revision = 0, savedKey = false, primary = '', shops = [];
let failNext = false, conflictNext = false, selected = 'local';
const events = [];
const ai = [
  { provider: 'f5quota', configured: true, model: 'fixture-text-model', base_url: 'https://fixture.invalid/f5quota', protocol: 'responses' },
  { provider: 'beeknoee', configured: true, model: 'fixture-gemini-model', base_url: 'https://fixture.invalid/beeknoee', protocol: 'gemini' },
];
const status = () => ({ mode, revision, source: mode === 'ENABLED' ? 'saved' : mode === 'DISABLED' ? 'disabled' : 'server_env', configured: mode !== 'DISABLED', configured_shop_count: mode === 'DISABLED' ? 0 : mode === 'ENABLED' ? shops.length : 2, has_saved_key: savedKey, primary_shop_id: mode === 'DISABLED' ? '' : mode === 'ENABLED' ? primary : '901', allowed_shop_ids: mode === 'DISABLED' ? [] : mode === 'ENABLED' ? shops : ['901', '902'] });
const aiStatus = () => ({ selected, providers: ai });
const app = express();
app.use(express.json({ limit: '32kb' }));
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  // The browser cannot connect to any real API, even if a source regression tries.
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:");
  next();
});
app.post('/api/local-auth/login', (req, res) => req.body?.email === credentials.email && req.body?.password === credentials.password ? res.json(session) : res.status(401).json({ message: 'Chỉ dùng tài khoản thử nghiệm fixture.' }));
app.post('/api/local-auth/logout', (_req, res) => res.json({ success: true }));
app.use('/api', (req, res, next) => req.headers.authorization === `Bearer ${session.token}` ? next() : res.status(401).json({ message: 'Phiên fixture không hợp lệ.' }));
app.get('/api/local-auth/me', (_req, res) => res.json(me));
app.get('/api/external-integrations/ghn', (_req, res) => {
  if (failNext) { failNext = false; return res.status(503).json({ message: 'Lỗi giả lập khi tải cấu hình. Hãy thử lại.' }); }
  res.json(status());
});
app.put('/api/external-integrations/ghn', (req, res) => {
  const input = req.body || {};
  if (conflictNext) { conflictNext = false; revision++; return res.status(409).json({ message: 'Cấu hình đã thay đổi ở phiên khác (giả lập). Tải lại cấu hình đã lưu.' }); }
  if (input.revision !== revision) return res.status(409).json({ message: 'Phiên bản cấu hình đã cũ (giả lập).' });
  if (!['ENABLED', 'DISABLED', 'INHERIT_ENV'].includes(input.mode)) return res.status(400).json({ message: 'Chế độ không hợp lệ.' });
  if (input.mode === 'ENABLED') {
    const candidate = String(input.primary_shop_id || '').trim();
    const list = [...new Set(String(input.allowed_shop_ids || '').split(',').map(value => value.trim()).filter(Boolean))];
    if (!/^[1-9][0-9]*$/.test(candidate) || list.some(value => !/^[1-9][0-9]*$/.test(value)) || list.length > 50 || !list.includes(candidate)) return res.status(400).json({ message: 'Nhập shop chính hợp lệ trong danh sách shop được phép.' });
    if (!input.api_key && !savedKey) return res.status(400).json({ message: 'Cần nhập khóa GHN mới để bật cấu hình đã lưu.' });
    primary = candidate; shops = list; savedKey = true;
  } else { savedKey = false; primary = ''; shops = []; }
  mode = input.mode; revision++;
  events.push({ action: 'save', mode, revision }); // Never retain submitted keys or request bodies.
  res.json(status());
});
app.post('/api/external-integrations/ghn/test', (_req, res) => {
  events.push({ action: 'read-only-test', mode, revision });
  res.json({ configured: mode !== 'DISABLED', connected: mode !== 'DISABLED', message: mode === 'DISABLED' ? 'GHN đã tắt (giả lập).' : 'Fixture giả lập xác nhận shop. Không có yêu cầu GHN thật.', checked_at: new Date().toISOString() });
});
app.get('/api/ai/providers', (_req, res) => res.json(aiStatus()));
app.get('/api/ai/providers/:provider/models', (_req, res) => res.json({ data: [{ id: 'fixture-text-model', owned_by: 'fixture' }, { id: 'fixture-gemini-model', owned_by: 'fixture' }] }));
app.post('/api/ai/providers/:provider/models', (_req, res) => res.json({ data: [{ id: 'fixture-text-model', owned_by: 'fixture' }, { id: 'fixture-gemini-model', owned_by: 'fixture' }] }));
app.put('/api/ai/providers/:provider', (req, res) => {
  selected = req.params.provider;
  const provider = ai.find(item => item.provider === selected);
  if (provider) { provider.configured = true; provider.model = req.body.model || provider.model; }
  res.json(aiStatus());
});
app.post('/api/ai/providers/:provider/test', (_req, res) => res.json({ success: true, message: 'Kết nối AI giả lập, không gửi dữ liệu ra ngoài.' }));
app.delete('/api/ai/providers/:provider/key', (req, res) => {
  const provider = ai.find(item => item.provider === req.params.provider);
  if (provider) provider.configured = false;
  if (selected === req.params.provider) selected = 'local';
  res.json(aiStatus());
});
app.get('/api/users/:id/permissions', (_req, res) => res.json([]));
app.get('/api/payroll/capabilities', (_req, res) => res.json([]));
app.get('/api/local-snapshot/:table', (_req, res) => res.json({ rows: [], total: 0 }));
app.get('/api/local-realtime', (_req, res) => res.json({ fixture: true }));
app.get('/api/fixture-state', (_req, res) => res.json({ fixture: true, status: status(), events, selected }));
app.use('/api', (req, res) => req.method === 'GET' ? res.json([]) : res.status(409).json({ message: 'Thao tác ngoài phạm vi fixture thử nghiệm.' }));

const result = await build({ root, configFile: false, envDir: false, publicDir: false, logLevel: 'warn', plugins: [react()], resolve: { alias: { '@': path.join(root, 'src') }, dedupe: ['react', 'react-dom', 'react/jsx-runtime'] }, define: { 'import.meta.env.VITE_BACKEND_MODE': JSON.stringify('local'), 'import.meta.env.VITE_LOCAL_API_URL': JSON.stringify(''), 'import.meta.env.VITE_LOCAL_DEMO_AUTH': JSON.stringify('false'), 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('') }, build: { write: false, sourcemap: false, chunkSizeWarningLimit: 3000 } });
const output = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output);
const assets = new Map(output.map(item => ['/' + item.fileName, item.type === 'chunk' ? item.code : item.source]));
assert.ok(assets.has('/index.html'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
app.use((req, res) => {
  const name = assets.has(req.path) ? req.path : path.extname(req.path) ? null : '/index.html';
  if (!name) return res.status(404).end();
  res.type(mime[path.extname(name)] || 'application/octet-stream').send(assets.get(name));
});
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const check = await fetch(origin + '/api/external-integrations/ghn', { headers: { authorization: `Bearer ${session.token}` } });
assert.equal(check.status, 200);
console.log('API_SETTINGS_UI_FIXTURE_READY ' + JSON.stringify({ origin, credentials, simulation: true, apiBase: 'same origin only', noDatabase: true, noProviderCalls: true, controls: ['state', 'fail-next', 'conflict-next', 'stop'] }));
await new Promise(resolve => {
  let pending = '';
  process.stdin.setEncoding('utf8'); process.stdin.resume();
  process.stdin.on('data', data => {
    pending += data;
    const commands = pending.split(/[\r\n]+/); pending = commands.pop() || '';
    for (const command of commands) {
      if (command === 'stop') resolve();
      else if (command === 'fail-next') { failNext = true; console.log('FIXTURE_FAIL_NEXT_READY'); }
      else if (command === 'conflict-next') { conflictNext = true; console.log('FIXTURE_CONFLICT_NEXT_READY'); }
      else if (command === 'state') console.log('FIXTURE_STATE ' + JSON.stringify({ status: status(), events, selected }));
    }
  });
  process.stdin.on('end', resolve); process.once('SIGINT', resolve); process.once('SIGTERM', resolve);
});
server.closeAllConnections();
await new Promise(resolve => server.close(resolve));
console.log('FIXTURE_STOPPED in-memory mock and compiled SPA only; no database resources exist.');
