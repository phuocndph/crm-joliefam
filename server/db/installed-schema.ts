import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { item5aHistoricalLedgerManifest } from './item5a-ledger-manifest.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const hash = (raw: Buffer) => createHash('sha256').update(raw).digest('hex');

// Verification only: this mode never adopts a ledger, applies SQL, or seeds data.
export async function verifyInstalledSchema(pool: Pick<Pool, 'connect'>) {
  const directory = path.join(here, 'migrations');
  const files = (await fs.readdir(directory)).filter(name => /^\d{3}_.+\.sql$/.test(name)).sort();
  if (!files.includes('078_local_purchase_fulfillment.sql')) throw new Error('Thiếu nguồn migration 078.');
  const expected = new Map(await Promise.all(files.map(async name => [name, hash(await fs.readFile(path.join(directory, name)))] as const)));
  const client = await pool.connect();
  try {
    await client.query('begin isolation level repeatable read read only');
    const identity = (await client.query(`select current_database() database,current_user database_user,
      pg_get_userbyid(d.datdba) database_owner,current_setting('TimeZone') timezone,
      current_setting('server_version_num') server_version_num,pg_is_in_recovery() is_in_recovery
      from pg_database d where d.datname=current_database()`)).rows[0];
    if (identity?.database !== 'crm_local' || identity.database_user !== 'crm_local' || identity.database_owner !== 'crm_local'
      || identity.timezone !== 'Asia/Ho_Chi_Minh' || Number(identity.server_version_num) < 160000
      || Number(identity.server_version_num) >= 170000 || identity.is_in_recovery !== false) throw new Error('Danh tính cơ sở dữ liệu local không đúng mục tiêu đã cài đặt.');
    const ledger = (await client.query('select name,checksum,source from public.local_schema_migrations order by name')).rows as Array<{name:string;checksum:string;source:string}>;
    const seen = new Set<string>();
    for (const entry of ledger) {
      if (seen.has(entry.name)) throw new Error(`Trùng migration đã cài: ${entry.name}.`);
      seen.add(entry.name);
      if (!['APPLIED', 'ADOPTED'].includes(entry.source)) throw new Error(`Nguồn sổ migration không hợp lệ: ${entry.name}.`);
      if (entry.name === '__seed.sql') {
        const adopted = item5aHistoricalLedgerManifest.adoptedSeed;
        if (entry.name === adopted.name && entry.source === adopted.source && entry.checksum === adopted.checksum) continue;
        const seed = path.resolve(here, '../../server/db/seed.sql');
        if (entry.checksum !== hash(await fs.readFile(seed))) throw new Error('Checksum seed đã cài không khớp.');
      } else if (!expected.has(entry.name) || expected.get(entry.name) !== entry.checksum) throw new Error(`Checksum migration đã cài không khớp: ${entry.name}.`);
    }
    for (const name of files) {
      // ZCRM is optional only in this integrations-disabled runtime mode.
      if (!seen.has(name) && ![75, 76].includes(Number(name.slice(0, 3)))) throw new Error(`Migration chưa được cài: ${name}.`);
    }
    if (!seen.has('__seed.sql')) throw new Error('Thiếu mốc seed lịch sử của cơ sở dữ liệu local.');
    await client.query('commit');
    return { mode: 'INSTALLED_VERIFIED' as const, database: identity.database, ledger_entries: ledger.length, writes: 0 };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
