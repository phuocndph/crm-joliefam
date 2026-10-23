// TEST-ONLY: actual SPA compiled in memory, synthetic role sessions and API.
// No .env, operational database, provider traffic, persisted session or mutations.
// Start: node scripts/start-navigation-ui-fixture.mjs
// stdin: state | actor <role> | revoke <permission> | grant <permission>
// role <role> | role reset | delay <milliseconds> | error on|off | reset | stop
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { build } from 'vite';
import react from '@vitejs/plugin-react-swc';

const root = fileURLToPath(new URL('..', import.meta.url));
const password = 'NavigationFixtureOnly!123';
const roles = ['admin', 'manager', 'accountant', 'employee', 'team_leader'];
const payroll = ['payroll_view', 'payroll_team_view', 'payroll_worker_manage', 'payroll_rate_view', 'payroll_rate_manage', 'payroll_policy_manage', 'payroll_insurance_manage', 'payroll_bank_manage', 'payroll_audit'];
const generic = ['dashboard', 'customers', 'products', 'quotes', 'orders', 'cash_flow', 'transactions', 'reports', 'user_management', 'customer_care', 'fabric_management', 'ghn_tracking', 'knowledge_base', 'contracts', 'shipping_companies', 'inventory_view', 'inventory_documents', 'production_view', 'production_manage', 'production_operations', 'production_sales_submit', 'production_sales_workflow', 'production_cutting_plan', 'cost_transactions', 'cost_categories', 'cost_centers', 'cost_objects', 'transaction_types', 'cost_audit'];
const basePermissions = {
  admin: [...generic], manager: [...generic],
  accountant: ['dashboard', 'cash_flow', 'transactions', 'reports', 'contracts', 'cost_transactions'],
  employee: ['orders', 'quotes', 'customers', 'ghn_tracking'],
  team_leader: ['production_view', 'production_operations', 'inventory_view', 'fabric_management'],
};
const basePayroll = { admin: [...payroll], manager: ['payroll_team_view'], accountant: ['payroll_view', 'payroll_bank_manage'], employee: [], team_leader: ['payroll_team_view'] };
const profiles = new Map(roles.map(role => [role, {
  actor: `fixture-navigation-${role}`, email: `${role}@navigation.invalid`,
  originalRole: role, role, permissions: new Set(basePermissions[role]), payroll: new Set(basePayroll[role]),
}]));
const sessions = new Map();
let sequence = 0, targetRole = 'admin', delayMs = 0, permissionError = false;
const counters = { logins: 0, logouts: 0, reads: 0, blockedMutations: 0, deniedReads: 0, externalCalls: 0, databaseConnections: 0 };
const summary = () => ({ fixture: true, inMemory: true, operationalDatabase: false, externalCalls: 0, counters, activeSessions: sessions.size, controls: { targetActor: targetRole, delayMs, permissionError }, profiles: [...profiles.entries()].map(([loginRole, profile]) => ({ loginRole, actor: profile.actor, role: profile.role, permissions: [...profile.permissions], payroll: [...profile.payroll] })) });
const app = express();
app.use(express.json({ limit: '16kb' }));
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; form-action 'self'; object-src 'none'");
  next();
});
app.get(['/health', '/api/health'], (_req, res) => res.json({ ok: true, backend: 'local', fixture: true, database: 'not-connected' }));
app.post('/api/local-auth/login', (req, res) => {
  const profile = [...profiles.values()].find(value => value.email === req.body?.email);
  if (!profile || req.body?.password !== password) return res.status(401).json({ message: 'Chỉ dùng tài khoản fixture navigation.invalid.' });
  const token = `synthetic-navigation-session-${profile.originalRole}-${++sequence}`;
  sessions.set(token, profile);
  targetRole = profile.originalRole;
  counters.logins++;
  res.json({ actor: profile.actor, token, role: profile.role, expires_at: new Date(Date.now() + 4 * 3600000).toISOString() });
});
app.use('/api', (req, res, next) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const profile = sessions.get(token);
  if (!profile) return res.status(401).json({ message: 'Phiên giả lập không hợp lệ. Đăng nhập bằng tài khoản navigation.invalid.' });
  req.fixtureProfile = profile;
  req.fixtureToken = token;
  next();
});
app.post('/api/local-auth/logout', (req, res) => {
  sessions.delete(req.fixtureToken); counters.logouts++;
  res.json({ success: true });
});
app.use('/api', async (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    counters.blockedMutations++;
    return res.status(409).json({ message: 'Fixture chỉ kiểm tra điều hướng; mọi thay đổi dữ liệu nghiệp vụ đều bị chặn.' });
  }
  counters.reads++;
  const capturedDelay = delayMs;
  if (capturedDelay && (req.path === '/local-auth/me' || req.path.endsWith('/permissions') || req.path === '/payroll/capabilities')) await new Promise(resolve => setTimeout(resolve, capturedDelay));
  next();
});
app.get('/api/local-auth/me', (req, res) => {
  const p = req.fixtureProfile;
  res.json({ user_id: p.actor, email: p.email, role: p.role, first_name: 'Thử điều hướng', last_name: p.role, assigned_by: null, worker_id: null, worker_type: null, employee_code: null, worker_name: null });
});
app.get('/api/users/:id/permissions', (req, res) => {
  if (req.params.id !== req.fixtureProfile.actor) return res.status(403).json({ message: 'Fixture không cho đọc quyền tài khoản khác.' });
  if (permissionError) return res.status(503).json({ message: 'Lỗi quyền giả lập có kiểm soát.' });
  res.json([...req.fixtureProfile.permissions].map(permission_type => ({ permission_type, enabled: true })));
});
app.get('/api/payroll/capabilities', (req, res) => {
  if (req.query.userId && req.query.userId !== req.fixtureProfile.actor) return res.status(403).json({ message: 'Fixture không cho đọc quyền tài khoản khác.' });
  if (permissionError) return res.status(503).json({ message: 'Lỗi quyền lương giả lập có kiểm soát.' });
  res.json(payroll.map(permission_type => ({ permission_type, allowed: req.fixtureProfile.payroll.has(permission_type), scope: 'all' })));
});
app.get('/api/dashboard/stats', (_req, res) => res.json(Object.fromEntries(['totalRevenue', 'totalOrders', 'totalCustomers', 'totalQuotes', 'totalProducts', 'pendingOrders', 'approvedQuotes', 'monthlyRevenue', 'previousMonthRevenue', 'monthlyOrders', 'monthlyCustomers', 'totalContracts', 'monthlyExpenses', 'activeWorkers', 'attendanceEntries', 'productionQuantity', 'inventoryValue', 'payrollRuns'].map(key => [key, 0]))));
app.get('/api/local-realtime', (_req, res) => res.json({ fixture: true }));
app.get('/api/local-snapshot/:table', (req, res) => res.json({ table: req.params.table, rows: [], total: 0, limit: 200, offset: 0 }));
app.get(['/api/orders', '/api/customers', '/api/quotes', '/api/products', '/api/production/entries', '/api/my-attendance/production-entries', '/api/production/workspace', '/api/my-production-dispatch/jobs'], (_req, res) => res.json([]));
app.get('/api/users', (_req, res) => res.json([...profiles.values()].map(p => ({ user_id: p.actor, email: p.email, role: p.role, first_name: 'Fixture', last_name: p.role }))));
app.use('/api', (_req, res) => { counters.deniedReads++; res.status(404).json({ message: 'Endpoint ngoài phạm vi fixture điều hướng; không có dữ liệu nghiệp vụ.' }); });

const result = await build({
  root, configFile: false, envDir: false, publicDir: false, logLevel: 'warn', plugins: [react()],
  resolve: { alias: { '@': path.join(root, 'src') }, dedupe: ['react', 'react-dom', 'react/jsx-runtime'] },
  define: {
    'import.meta.env.VITE_BACKEND_MODE': JSON.stringify('local'),
    'import.meta.env.VITE_LOCAL_API_URL': JSON.stringify(''),
    'import.meta.env.VITE_LOCAL_DEMO_AUTH': JSON.stringify('false'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(''),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(''),
  },
  build: { write: false, sourcemap: false, chunkSizeWarningLimit: 3000 },
});
const assets = new Map(result.output.map(value => [value.fileName, value.type === 'asset' ? Buffer.from(value.source) : Buffer.from(value.code)]));
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
app.use((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { counters.blockedMutations++; return res.status(409).json({ message: 'Thao tác thay đổi ngoài đăng nhập/đăng xuất giả lập bị chặn.' }); }
  const requested = decodeURIComponent(req.path).replace(/^\/+/, '');
  const key = assets.has(requested) ? requested : !path.extname(requested) ? 'index.html' : null;
  if (!key || !assets.has(key)) return res.status(404).end();
  res.type(contentTypes[path.extname(key)] || 'application/octet-stream').send(assets.get(key));
});
const server = createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
console.log('NAVIGATION_FIXTURE_READY ' + JSON.stringify({ origin, landing: origin + '/menu', credentials: roles.map(role => ({ email: `${role}@navigation.invalid`, password })), safety: { envFiles: false, operationalDatabase: false, providerCalls: false, businessMutations: 'denied' }, controls: 'state | actor ROLE | revoke PERMISSION | grant PERMISSION | role ROLE|reset | delay MS | error on|off | reset | stop' }));
const input = createInterface({ input: process.stdin });
input.on('line', line => {
  const [command, value] = line.trim().split(/\s+/);
  const p = profiles.get(targetRole);
  if (command === 'stop') { input.close(); server.close(() => process.exit(0)); return; }
  if (command === 'actor' && profiles.has(value)) targetRole = value;
  else if ((command === 'revoke' || command === 'grant') && [...generic, ...payroll].includes(value)) {
    const target = value.startsWith('payroll_') ? p.payroll : p.permissions;
    if (command === 'revoke') target.delete(value); else target.add(value);
  } else if (command === 'role' && (roles.includes(value) || value === 'reset')) p.role = value === 'reset' ? p.originalRole : value;
  else if (command === 'delay' && /^\d+$/.test(value || '')) delayMs = Math.min(10000, Number(value));
  else if (command === 'error' && ['on', 'off'].includes(value)) permissionError = value === 'on';
  else if (command === 'reset') {
    delayMs = 0; permissionError = false;
    for (const profile of profiles.values()) { profile.role = profile.originalRole; profile.permissions = new Set(basePermissions[profile.originalRole]); profile.payroll = new Set(basePayroll[profile.originalRole]); }
  } else if (command !== 'state') console.log('NAVIGATION_FIXTURE_CONTROL_ERROR Unknown command or value.');
  console.log('NAVIGATION_FIXTURE_STATE ' + JSON.stringify(summary()));
});
process.on('SIGINT', () => { input.close(); server.close(() => process.exit(0)); });
