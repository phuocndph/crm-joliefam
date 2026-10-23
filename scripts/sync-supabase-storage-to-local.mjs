import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bucketName = value => { if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Tên bucket không hợp lệ.'); return value; };
const objectName = value => { if (typeof value !== 'string' || !value || value.includes('\\') || value.split('/').some(part => !part || part === '.' || part === '..') || /[\x00-\x1f:]/.test(value)) throw new Error('Đường dẫn tệp không hợp lệ.'); return value; };
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);
export async function assertNoSymlinks(target) {
  const absolute = path.resolve(target), root = path.parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (stat?.isSymbolicLink()) throw new Error('Không chấp nhận symlink/junction trong đường dẫn Storage.');
  }
}
const readExisting = async target => { await assertNoSymlinks(target); try { const stat = await fs.stat(target); if (!stat.isFile()) throw new Error('Đích không phải tệp.'); return await fs.readFile(target); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
// Link a temporary complete file into place exclusively: never overwrite a race winner.
async function atomicNew(target, bytes) {
  await assertNoSymlinks(target); await fs.mkdir(path.dirname(target), { recursive: true }); await assertNoSymlinks(target);
  const temp = path.join(path.dirname(target), '.storage-import-' + randomUUID());
  try { await fs.writeFile(temp, bytes, { flag: 'wx', mode: 0o600 }); await fs.link(temp, target); } finally { await fs.unlink(temp).catch(() => {}); }
}
async function* localObjects(sourceRoot, wanted) {
  const buckets = await fs.readdir(sourceRoot, { withFileTypes: true });
  for (const bucket of buckets) {
    if (bucket.name.startsWith('.')) continue;
    bucketName(bucket.name); if (wanted.length && !wanted.includes(bucket.name)) continue;
    if (!bucket.isDirectory() || bucket.isSymbolicLink()) throw new Error('Nguồn bucket phải là thư mục thật.');
    const queue = [''];
    while (queue.length) {
      const prefix = queue.shift(); const folder = path.join(sourceRoot, bucket.name, prefix); await assertNoSymlinks(folder);
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        const key = objectName(prefix ? prefix + '/' + entry.name : entry.name);
        if (entry.isSymbolicLink()) throw new Error('Nguồn có symlink không được hỗ trợ.');
        if (entry.isDirectory()) queue.push(key);
        else if (entry.isFile()) yield { bucket: bucket.name, path: key, bytes: await fs.readFile(path.join(sourceRoot, bucket.name, key)) };
        else throw new Error('Nguồn có đối tượng không phải tệp/thư mục.');
      }
    }
  }
}
async function* remoteObjects(source, wanted) {
  const listed = await source.storage.listBuckets(); if (listed.error) throw new Error('Không liệt kê được bucket; kiểm tra quyền đọc Storage.');
  for (const bucket of listed.data || []) {
    bucketName(bucket.id); if (wanted.length && !wanted.includes(bucket.id)) continue;
    const queue = [''];
    while (queue.length) {
      const prefix = queue.shift();
      for (let offset = 0; ; offset += 100) {
        const listing = await source.storage.from(bucket.id).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
        if (listing.error) throw new Error('Không đọc được danh sách đối tượng Storage.');
        for (const entry of listing.data || []) {
          const key = objectName(prefix ? prefix + '/' + entry.name : entry.name);
          if (!entry.id) { queue.push(key); continue; }
          const download = await source.storage.from(bucket.id).download(key); if (download.error || !download.data) throw new Error('Không tải được tệp nguồn; kiểm tra quyền hoặc trạng thái dịch vụ.');
          yield { bucket: bucket.id, path: key, bytes: Buffer.from(await download.data.arrayBuffer()) };
        }
        if ((listing.data || []).length < 100) break;
      }
    }
  }
}
export async function syncStorage({ storageRoot, sourceDir, source, wanted = [], apply = false, manifest, reportPath }) {
  const targetRoot = path.resolve(storageRoot); await assertNoSymlinks(targetRoot); wanted.forEach(bucketName);
  if (sourceDir) { sourceDir = path.resolve(sourceDir); await assertNoSymlinks(sourceDir); if (inside(sourceDir, targetRoot) || inside(targetRoot, sourceDir)) throw new Error('Thư mục nguồn và đích không được chồng lấn.'); }
  if (!sourceDir && !source) throw new Error('Thiếu nguồn Storage.');
  let expected = null;
  if (manifest) {
    await assertNoSymlinks(path.resolve(manifest)); const parsed = JSON.parse(await fs.readFile(manifest, 'utf8'));
    if (parsed.version !== 1 || !Array.isArray(parsed.files)) throw new Error('Manifest không hợp lệ.');
    expected = new Map(); for (const file of parsed.files) { bucketName(file.bucket); objectName(file.path); if (!/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new Error('Checksum manifest không hợp lệ.'); const key = file.bucket + '/' + file.path; if (expected.has(key)) throw new Error('Manifest trùng đường dẫn.'); expected.set(key, file); }
  }
  const report = { version: 1, mode: apply ? 'apply' : 'dry-run', completed_at: null, files: [], missing_manifest_files: [] };
  const iterable = sourceDir ? localObjects(sourceDir, wanted) : remoteObjects(source, wanted);
  const seen = new Set();
  for await (const file of iterable) {
    const key = file.bucket + '/' + file.path, sha256 = hash(file.bytes), entry = { bucket: file.bucket, path: file.path, bytes: file.bytes.length, sha256, status: '' };
    if (expected) { const spec = expected.get(key); if (!spec || spec.sha256 !== sha256 || spec.bytes !== file.bytes.length) throw new Error('Tệp nguồn không khớp manifest; dừng nhập.'); }
    seen.add(key); const target = path.resolve(targetRoot, file.bucket, file.path); if (!inside(targetRoot, target)) throw new Error('Đường dẫn ngoài Storage.');
    const existing = await readExisting(target);
    if (existing && hash(existing) === sha256) entry.status = 'unchanged';
    else if (existing) { entry.status = 'conflict'; if (apply) { const staged = path.join(targetRoot, '.import-conflicts', sha256, file.bucket, file.path); const previous = await readExisting(staged); if (!previous) await atomicNew(staged, file.bytes); else if (hash(previous) !== sha256) throw new Error('Tệp staging không khớp checksum.'); } }
    else { entry.status = apply ? 'imported' : 'would-import'; if (apply) { try { await atomicNew(target, file.bytes); } catch (error) { if (error.code !== 'EEXIST') throw error; const raced = await readExisting(target); entry.status = raced && hash(raced) === sha256 ? 'unchanged' : 'conflict'; } } }
    report.files.push(entry);
  }
  if (expected) report.missing_manifest_files = [...expected.keys()].filter(key => !seen.has(key));
  report.completed_at = new Date().toISOString();
  if (reportPath) { const reportTarget = path.resolve(reportPath); if (sourceDir && inside(sourceDir, reportTarget)) throw new Error('Không ghi báo cáo vào nguồn.'); await atomicNew(reportTarget, Buffer.from(JSON.stringify(report, null, 2) + '\n')); }
  return report;
}
export async function main(args = process.argv.slice(2), env = process.env) {
  const option = name => args.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1);
  const sourceDir = option('--source-dir'), storageRoot = option('--storage-root') || env.LOCAL_STORAGE_ROOT || '.local-storage';
  const wanted = args.filter(arg => arg.startsWith('--bucket=')).map(arg => arg.slice(9));
  let source;
  if (!sourceDir) { const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY; if (!url || !key) throw new Error('Thiếu biến môi trường URL/khóa đọc Supabase.'); source = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); }
  const report = await syncStorage({ storageRoot, sourceDir, source, wanted, apply: args.includes('--apply'), manifest: option('--manifest'), reportPath: option('--report') });
  const summary = report.files.reduce((counts, file) => ({ ...counts, [file.status]: (counts[file.status] || 0) + 1 }), {}); console.log(JSON.stringify({ mode: report.mode, counts: summary, missing_manifest_files: report.missing_manifest_files.length }));
  if (report.files.some(file => file.status === 'conflict') || report.missing_manifest_files.length) process.exitCode = 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Đồng bộ Storage thất bại; không xóa hoặc ghi đè tệp đích. Kiểm tra đường dẫn, manifest, quyền đọc và cấu hình máy chủ.'); process.exitCode = 1; });
