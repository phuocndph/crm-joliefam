import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, types } from "pg";
import { createHash } from "node:crypto";
import { runtime } from '../runtime.js';
import { BUSINESS_TIMEZONE, businessTimezoneConnectionOptions } from './business-timezone.js';
import { verifyItem5aInstallation } from './item5a-install.js';
import { verifyInstalledSchema } from './installed-schema.js';

// Keep PostgreSQL DATE values as YYYY-MM-DD strings for the date-based UI.
types.setTypeParser(1082, (value) => value);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
export const databaseUrl = runtime.databaseUrl;
export const pool = new Pool({ ...businessTimezoneConnectionOptions(databaseUrl, process.env.PGOPTIONS), max: 10 });

async function assertVerifiedItem5aReceiptOnlyFinancialSchema() {
  const row = (await pool.query(`select
    to_regclass('public.local_order_refunds') refunds,
    to_regclass('public.local_order_returns') returns`)).rows[0];
  if (row?.refunds || row?.returns) {
    throw new Error('Chế độ Item5A đã xác minh chỉ cho phép sổ thu. Phát hiện sổ hoàn/trả; cần bảo trì cấu trúc bên ngoài API và khởi động lại để xác minh lại.');
  }
}

export async function bootstrapDatabase() {
  if (runtime.startupMode === 'serve-installed') {
    const result = await verifyInstalledSchema(pool);
    await assertVerifiedItem5aReceiptOnlyFinancialSchema();
    return result;
  }
  if (runtime.startupMode !== 'normal') {
    const result = await verifyItem5aInstallation(pool, { expectedDatabase: 'crm_local', expectedUser: 'crm_local', expectedOwner: 'crm_local' });
    await assertVerifiedItem5aReceiptOnlyFinancialSchema();
    return result;
  }
  const migrationsDir = path.join(here, "migrations");
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  const client = await pool.connect();
  try {
    const timezone = (await client.query("select current_setting('TimeZone') timezone")).rows[0]?.timezone;
    if (timezone !== BUSINESS_TIMEZONE) throw new Error('Múi giờ phiên cơ sở dữ liệu API không đúng Asia/Ho_Chi_Minh; kiểm tra cấu hình kết nối.');
    await client.query('BEGIN');
    await client.query("select pg_advisory_xact_lock(hashtextextended('local-schema-migration-bootstrap',0))");
    const initial = (await client.query(`select to_regclass('public.local_schema_migrations') ledger,
      to_regclass('public.local_workers') business,
      to_regclass('public.local_payroll_import_batches') imports,
      to_regclass('public.local_dispatch_requests') dispatch`)).rows[0];
    await client.query(await fs.readFile(path.join(migrationsDir,'039_local_migration_ledger.sql'),'utf8'));
    if (initial.ledger && initial.business) {
      const marker = (await client.query("select count(*)::int count from local_schema_migrations where name ~ '^[0-9]{3}_' and substring(name,1,3)::int <= 38")).rows[0];
      if (Number(marker?.count || 0) < 38) throw new Error('Sổ phiên bản cơ sở dữ liệu local chưa đầy đủ; dừng để tránh chạy lại migration lịch sử và ghi đè dữ liệu. Hãy khôi phục sổ phiên bản hoặc kiểm tra thủ công.');
    }
    // The old bootstrap executed every SQL file in order on each start. Its last
    // schema marker proves the preceding migrations were installed. Record that
    // boundary without replaying their INSERT/UPDATE backfills (notably 021).
    // Refuse an unknown older layout rather than guess and overwrite its data.
    if (!initial.ledger && initial.business) {
      if (!initial.imports) throw new Error('Cơ sở dữ liệu local cũ chưa có mốc cấu trúc 037 để tiếp nhận an toàn. Cần kiểm tra lịch sử trước khi áp dụng; dữ liệu được giữ nguyên.');
      const through = initial.dispatch ? 38 : 37;
      for (const file of files.filter(file => Number(file.slice(0,3)) <= through)) {
        const sql=await fs.readFile(path.join(migrationsDir,file),'utf8');
        await client.query("insert into local_schema_migrations(name,checksum,source) values($1,$2,'ADOPTED')",[file,createHash('sha256').update(sql).digest('hex')]);
      }
      const seed=await fs.readFile(path.join(root,'server','db','seed.sql'),'utf8');
      await client.query("insert into local_schema_migrations(name,checksum,source) values('__seed.sql',$1,'ADOPTED')",[createHash('sha256').update(seed).digest('hex')]);
    }
    for (const file of files) {
      const sql=await fs.readFile(path.join(migrationsDir,file),'utf8');
      const checksum=createHash('sha256').update(sql).digest('hex');
      const applied=(await client.query('select checksum from local_schema_migrations where name=$1',[file])).rows[0];
      if (applied) {
        if (applied.checksum !== checksum) throw new Error(`Migration ${file} đã áp dụng bị thay đổi. Hãy thêm migration mới, không sửa lịch sử.`);
        continue;
      }
      await client.query(sql);
      await client.query("insert into local_schema_migrations(name,checksum,source) values($1,$2,'APPLIED')",[file,checksum]);
    }
    if (!runtime.production && !(await client.query("select 1 from local_schema_migrations where name='__seed.sql'")).rows[0]) {
      const seed=await fs.readFile(path.join(root,'server','db','seed.sql'),'utf8');
      await client.query(seed);
      await client.query("insert into local_schema_migrations(name,checksum,source) values('__seed.sql',$1,'APPLIED')",[createHash('sha256').update(seed).digest('hex')]);
    }
    await client.query('COMMIT');
  } catch(error) {await client.query('ROLLBACK').catch(()=>undefined);throw error;}
  finally {client.release();}
}
