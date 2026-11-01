// Local-only data correction. Never loads .env or contacts the hosted database.
// Dry-run: PG* variables node scripts/repair-mattress-specifications.mjs
// Apply a reviewed plan: same environment, add --apply --plan=<path>
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';

const mattress = /^(Đệm|Nệm)(?:\s|$)/iu;
const excluded = /^(Ga|Bảo vệ|Vỏ)(?:\s|$)/iu;
const number = String.raw`\d+(?:[.,]\d+)?`;
const token = `(${number})\\s*(cm|m|f)?`;
const dimensions = new RegExp(`${token}\\s*[x×]\\s*${token}(?:\\s*[x×]\\s*${token})?`, 'giu');
const cm = (value, unit) => Number(value.replace(',', '.')) * (unit?.toLowerCase() === 'm' ? 100 : 1);
const sensible = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const fmt = value => String(Number(value.toFixed(4)));

export function parseSku(sku) {
  const match = /^(DBECS|DBE|DCSTH|DLXTDL)(\d{2,3})X(\d{1,2})(F)?(-C|-M)?$/i.exec(sku ?? '');
  if (!match) return null;
  const width = Number(match[2]), height = Number(match[3]);
  return sensible(width, 60, 300) && sensible(height, 1, 60) ? { width, height } : null;
}

export function parseDimensions(text, category = false) {
  const input = String(text ?? '').trim();
  const matches = [...input.matchAll(dimensions)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const round = category ? /tròn/iu.test(input) : /^D/i.test(input);
  if (!category && !new RegExp(`^${round ? 'D\\s*' : ''}${dimensions.source}\\s*(?:cm)?$`, 'iu').test(input)) return null;
  const values = [cm(match[1], match[2]), cm(match[3], match[4])];
  if (match[5]) values.push(cm(match[5], match[6]));
  if (!sensible(values[0], 60, 300)) return null;
  if (round) return values.length === 2 && sensible(values[1], 1, 60) ? { round, values } : null;
  if (!sensible(values[1], 100, 300) || (values.length === 3 && !sensible(values[2], 1, 60))) return null;
  return { round, values };
}

export function planProduct(row) {
  if (excluded.test(row.name ?? '') || excluded.test(row.category ?? '') ||
      !(mattress.test(row.name ?? '') || mattress.test(row.category ?? ''))) return { status: 'excluded' };
  const sku = parseSku(row.sku);
  const existingText = String(row.specifications ?? '').trim();
  const existing = parseDimensions(existingText);
  if (existingText && !existing) return { status: 'skip', reason: 'unrecognized-existing-specifications' };
  const source = existing ?? parseDimensions(row.category, true);
  if (!source) return { status: 'skip', reason: 'no-explicit-dimensions' };
  const { round, values } = source;
  const complete = round || values.length === 3;
  if (sku && (values[0] !== sku.width || (complete && values.at(-1) !== sku.height))) {
    return { status: 'conflict', reason: 'sku-dimensions-disagree' };
  }
  if (existing && complete) return { status: 'complete' };
  if (!complete && !sku) return { status: 'skip', reason: 'no-explicit-height' };
  const result = complete ? values : [...values, sku.height];
  return { status: 'change', specifications: `${round ? 'D' : ''}${result.map(fmt).join('x')}cm` };
}

export function createPlan(rows, generatedAt = new Date().toISOString()) {
  const changes = [], report = [];
  for (const before of rows) {
    const result = planProduct(before);
    if (result.status === 'change') changes.push({ before, after: { ...before, specifications: result.specifications,
      local_modified_at: generatedAt, updated_at: generatedAt } });
    else report.push({ id: before.id, sku: before.sku, ...result });
  }
  return { version: 1, generatedAt, changes, report };
}

export async function applyPlan(client, plan) {
  if (plan.version !== 1 || !Array.isArray(plan.changes) || !Number.isFinite(Date.parse(plan.generatedAt))) throw new Error('Invalid plan');
  const ids = new Set();
  for (const change of plan.changes) {
    const expected = createPlan([change.before], plan.generatedAt).changes[0];
    if (!expected || !isDeepStrictEqual(expected, change) || ids.has(change.before.id)) throw new Error('Plan content is inconsistent');
    ids.add(change.before.id);
  }
  await client.query('BEGIN');
  try {
    for (const { before, after } of plan.changes) {
      const current = await client.query('SELECT to_jsonb(p) AS row FROM local_products p WHERE id = $1 FOR UPDATE', [before.id]);
      if (!isDeepStrictEqual(current.rows[0]?.row, before)) throw new Error(`Product changed since dry-run: ${before.id}`);
      const updated = await client.query('UPDATE local_products SET specifications = $2, local_modified_at = $3, updated_at = $3 WHERE id = $1',
        [before.id, after.specifications, plan.generatedAt]);
      if (updated.rowCount !== 1) throw new Error('Unexpected update count');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  return plan.changes.length;
}

export function connectionConfig(env, urlEnvName) {
  let config;
  if (urlEnvName) {
    const url = new URL(env[urlEnvName] ?? '');
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash) throw new Error('Only a plain PostgreSQL URL is allowed');
    config = { host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port || 5432),
      database: decodeURIComponent(url.pathname.slice(1)), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
  } else {
    config = { host: env.PGHOST, port: Number(env.PGPORT), database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD };
  }
  if (!['127.0.0.1', '::1', 'localhost'].includes(config.host) || config.database !== 'crm_local' ||
      !Number.isInteger(config.port) || config.port < 1 || config.port > 65535 || !config.user || !config.password) {
    throw new Error('Explicit loopback crm_local database credentials and port are required');
  }
  return { ...config, ssl: false, connectionTimeoutMillis: 5000, application_name: 'mattress-spec-repair' };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !/^(--apply|--plan=.+|--output=.+|--database-url-env=[A-Za-z_][A-Za-z0-9_]*)$/.test(arg))) throw new Error('Unknown argument');
  const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const applying = args.includes('--apply');
  if (applying && !option('plan')) throw new Error('--apply requires a reviewed --plan=<path>');
  const client = new pg.Client(connectionConfig(process.env, option('database-url-env')));
  await client.connect();
  try {
    if (applying) {
      const plan = JSON.parse(await readFile(resolve(option('plan')), 'utf8'));
      console.log(JSON.stringify({ applied: await applyPlan(client, plan) }));
    } else {
      const result = await client.query("SELECT to_jsonb(p) AS row FROM local_products p WHERE name ~* '^(Đệm|Nệm)([[:space:]]|$)' OR category ~* '^(Đệm|Nệm)([[:space:]]|$)' ORDER BY id");
      const rows = result.rows.map(item => item.row), plan = createPlan(rows);
      const directory = resolve(option('output') ?? `.local-staging-runtime/mattress-spec-repair/${plan.generatedAt.replace(/[:.]/g, '-')}`);
      await mkdir(directory, { recursive: true });
      // Full original rows are written first; neither file overwrites a previous review.
      await writeFile(resolve(directory, 'backup.json'), JSON.stringify(rows, null, 2), { flag: 'wx', mode: 0o600 });
      const planPath = resolve(directory, 'plan.json');
      await writeFile(planPath, JSON.stringify(plan, null, 2), { flag: 'wx', mode: 0o600 });
      const counts = Object.fromEntries(['complete', 'skip', 'conflict', 'excluded'].map(status => [status, plan.report.filter(item => item.status === status).length]));
      console.log(JSON.stringify({ scanned: rows.length, changes: plan.changes.length, ...counts, plan: planPath }));
    }
  } finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Repair failed'); process.exitCode = 1; });
}
