import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  return match ? [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2')]] : [];
}));
const readEnv = async (name) => parseEnv(await fs.readFile(path.join(root, name), 'utf8').catch(() => ''));
const env = { ...(await readEnv('.env')), ...(await readEnv('.env.local')), ...process.env };
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Thiếu URL hoặc khóa đọc Supabase.');
const source = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const storageRoot = path.resolve(env.LOCAL_STORAGE_ROOT || path.join(root, '.local-storage'));
const safePath = (bucket, objectPath) => {
  const cleanBucket = bucket.replace(/[^a-zA-Z0-9_-]/g, '_');
  const target = path.resolve(storageRoot, cleanBucket, objectPath.replace(/\\/g, '/').replace(/^\/+/, ''));
  if (!target.startsWith(`${path.resolve(storageRoot, cleanBucket)}${path.sep}`)) throw new Error('Đường dẫn Storage không hợp lệ.');
  return target;
};
const wanted = process.argv.filter((arg) => arg.startsWith('--bucket=')).map((arg) => arg.slice('--bucket='.length)).filter(Boolean);
const bucketsResult = await source.storage.listBuckets();
if (bucketsResult.error) throw new Error(bucketsResult.error.message);
const buckets = (bucketsResult.data || []).filter((bucket) => !wanted.length || wanted.includes(bucket.id));
const summary = [];
for (const bucket of buckets) {
  const queue = [''];
  const stat = { bucket: bucket.id, downloaded: 0, unchanged: 0, errors: [] };
  while (queue.length) {
    const prefix = queue.shift();
    for (let offset = 0; ; offset += 100) {
      const result = await source.storage.from(bucket.id).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (result.error) { stat.errors.push(result.error.message); break; }
      for (const entry of result.data || []) {
        const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (!entry.id) { queue.push(objectPath); continue; }
        try {
          const target = safePath(bucket.id, objectPath);
          const existing = await fs.stat(target).catch(() => null);
          if (existing?.isFile() && entry.metadata?.size != null && existing.size === Number(entry.metadata.size)) { stat.unchanged += 1; continue; }
          const downloaded = await source.storage.from(bucket.id).download(objectPath);
          if (downloaded.error) throw downloaded.error;
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.writeFile(target, Buffer.from(await downloaded.data.arrayBuffer()));
          stat.downloaded += 1;
        } catch (error) { stat.errors.push(`${objectPath}: ${error?.message || error}`); }
      }
      if (!result.data || result.data.length < 100) break;
    }
  }
  summary.push(stat);
  console.log(`${bucket.id}: ${stat.downloaded} tải mới, ${stat.unchanged} đã có, ${stat.errors.length} lỗi`);
}
const output = env.NODE_ENV === 'production' ? path.join(storageRoot, '.sync-reports', 'local-storage-sync-last-run.json') : path.join(root, 'docs', 'local-storage-sync-last-run.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({ completed_at: new Date().toISOString(), buckets: summary }, null, 2) + '\n');
if (summary.some((item) => item.errors.length)) process.exitCode = 2;
