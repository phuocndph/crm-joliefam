import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";
import { laborRequirementSeedHash, laborRequirementSeedManifest } from "../product-labor-requirement-seeds.js";
import { installationQuarantineActor, installationQuarantineEventIds, installationQuarantineReason } from "../product-labor-requirement-history.js";
import { productDigest } from "../product-catalog-snapshot.js";
import { item5aHistoricalLedgerManifest } from "./item5a-ledger-manifest.js";
import { item5aSchemaManifest } from "./item5a-schema-manifest.js";

type Row = Record<string, unknown>;
type Database = Pick<PoolClient, "query">;
type LedgerEntry = { name: string; checksum: string; source: string };

const here = path.dirname(fileURLToPath(import.meta.url));
export const item5aSourceRoot = path.resolve(here, "../..");
export const item5aMigrationFiles = [
  ["070_local_product_supply_classifications.sql", "91b9023f1805879f1b15cd2a5dcb4a0acb8742ac2f5fcb42fec2fd6651bea76a"],
  ["071_local_product_technical_profiles.sql", "2d0a3fc202d67c5cb8dbd8bcc2a655ab7fa94543958760df8ae2b5c2b8338dff"],
  ["072_local_product_labor_mappings.sql", "abc9666f4f83886ac86d530ed3ce949bd5302f60444f502cf6177af3dcb4c12d"],
  ["073_local_labor_code_requirements.sql", "094ac235a9e1ccbda1ae5d510dea21aeddec97b97c993f632b7737b4f1b4cefb"],
  ["074_local_product_rate_action_receipts.sql", "6ef726866300c4ea13007b7fb643aaa515305a4e9d48501c5749054df094d736"],
  ["077_local_labor_requirement_seed_quarantine.sql", "a500cba48d564881da6c63f3ade868551ad8ac8024ad9f12943b8fa5ae493a25"],
] as const;

const targetTables = [
  "local_product_supply_classifications", "local_product_supply_receipts",
  "local_product_technical_versions", "local_product_technical_receipts",
  "local_labor_mapping_decisions", "local_labor_mapping_versions", "local_labor_mapping_receipts",
  "local_labor_requirement_streams", "local_labor_requirement_proposals", "local_labor_requirement_drafts", "local_labor_requirement_events", "local_labor_requirement_receipts",
  "local_product_rate_action_receipts",
] as const;
const targetFunctions = [
  "local_product_supply_immutable", "local_product_technical_immutable", "local_product_technical_single_profile",
  "local_labor_mapping_immutable", "local_labor_requirement_immutable", "local_product_rate_action_receipts_immutable",
] as const;
const targetTriggers = [
  "local_product_supply_history_immutable", "local_product_supply_receipt_immutable",
  "local_product_technical_versions_immutable", "local_product_technical_receipts_immutable", "local_product_technical_single_profile",
  "local_labor_mapping_decisions_immutable", "local_labor_mapping_versions_immutable", "local_labor_mapping_receipts_immutable",
  "local_labor_requirement_streams_immutable", "local_labor_requirement_proposals_immutable", "local_labor_requirement_drafts_immutable", "local_labor_requirement_events_immutable", "local_labor_requirement_receipts_immutable",
  "local_product_rate_action_receipts_immutable",
] as const;
const sourceTrigger071 = {
  table: "local_manufacturing_records",
  name: "local_product_technical_single_profile",
  sourceStatement: "CREATE TRIGGER local_product_technical_single_profile BEFORE INSERT OR UPDATE ON local_manufacturing_records FOR EACH ROW EXECUTE FUNCTION local_product_technical_single_profile();",
} as const;
const targetRelationTriggers = targetTriggers.filter((name) => name !== sourceTrigger071.name);
const emptyInstallationTables = [
  "local_product_supply_classifications", "local_product_supply_receipts",
  "local_product_technical_versions", "local_product_technical_receipts",
  "local_labor_mapping_decisions", "local_labor_mapping_versions", "local_labor_mapping_receipts",
  "local_labor_requirement_proposals", "local_labor_requirement_drafts", "local_labor_requirement_receipts",
  "local_product_rate_action_receipts",
] as const;
const targetMigrationNames = item5aMigrationFiles.map(([name]) => name);

export class Item5aInstallError extends Error {
  constructor(message: string) { super(message); this.name = "Item5aInstallError"; }
}
const fail = (message: string): never => { throw new Item5aInstallError(message); };
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const asRows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((row): row is Row => !!row && typeof row === "object") : [];
const exactly = (actual: unknown, expected: unknown, message: string) => { if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(message); };

export type Item5aSource = {
  root: string;
  migrations: Array<{ name: string; checksum: string; raw: Buffer; sql: string }>;
};

const ledgerRowText = (entries: LedgerEntry[]) => entries
  .slice()
  .sort((left, right) => left.name.localeCompare(right.name))
  .map((entry) => `${entry.name}\t${entry.checksum}\t${entry.source}`)
  .join("\n");
const ledgerHash = (entries: LedgerEntry[]) => sha256(ledgerRowText(entries));

async function migrationDirectory(root: string) {
  const sourceDirectory = path.join(root, "server", "db", "migrations");
  try {
    await fs.access(sourceDirectory);
    return sourceDirectory;
  } catch {
    return path.join(here, "migrations");
  }
}

function assertItem5aSourceChain(source: Item5aSource) {
  if (!source || typeof source.root !== "string" || source.migrations.length !== item5aMigrationFiles.length) fail("Chuỗi sáu migration Item5A không đầy đủ; không cài đặt.");
  if (JSON.stringify(item5aSchemaManifest.rawSourceChain) !== JSON.stringify(item5aMigrationFiles)) fail("Manifest catalog Item5A không khớp chuỗi raw migration đã duyệt; không cài đặt.");
  for (const [index, [name, checksum]] of item5aMigrationFiles.entries()) {
    const migration = source.migrations[index];
    if (!migration || migration.name !== name || migration.checksum !== checksum || !Buffer.isBuffer(migration.raw)) fail("Thứ tự/tên/checksum chuỗi Item5A không đúng; không cài đặt.");
    if (sha256(migration.raw) !== checksum || migration.sql !== migration.raw.toString("utf8") || !migration.raw.equals(Buffer.from(migration.sql, "utf8"))) fail(`Raw buffer migration ${name} không đúng; không cài đặt.`);
  }
  const technical = source.migrations.find((migration) => migration.name === "071_local_product_technical_profiles.sql");
  if (!technical || !technical.sql.includes(sourceTrigger071.sourceStatement)) fail("Migration 071 thiếu trigger nguồn canonical đã duyệt; không cài đặt.");
}

export async function loadItem5aSource(root = item5aSourceRoot): Promise<Item5aSource> {
  const resolvedRoot = path.resolve(root);
  const migrationsDirectory = await migrationDirectory(resolvedRoot);
  const adoptedSeed = item5aHistoricalLedgerManifest.adoptedSeed;
  if (item5aHistoricalLedgerManifest.entries !== 73 || adoptedSeed.name !== "__seed.sql" || !/^[a-f0-9]{64}$/.test(adoptedSeed.checksum) || adoptedSeed.source !== "ADOPTED") fail("Mốc 73 bản ghi Item5A không đúng; dừng an toàn.");
  const migrations: Item5aSource["migrations"] = [];
  for (const [name, checksum] of item5aMigrationFiles) {
    const location = path.join(migrationsDirectory, name);
    const raw = await fs.readFile(location);
    const sql = raw.toString("utf8");
    if (sha256(raw) !== checksum || !raw.equals(Buffer.from(sql, "utf8"))) fail(`Mã nguồn migration ${name} đã thay đổi; không cài đặt.`);
    migrations.push({ name, checksum, raw, sql });
  }
  const source = { root: resolvedRoot, migrations };
  assertItem5aSourceChain(source);
  return source;
}

async function resolveItem5aSource(options: Pick<Item5aInstallOptions, "source" | "sourceRoot">): Promise<Item5aSource> {
  const sourceRoot = options.sourceRoot ?? options.source?.root;
  const rawSource = await loadItem5aSource(sourceRoot);
  if (!options.source) return rawSource;
  assertItem5aSourceChain(options.source);
  if (path.resolve(options.source.root) !== rawSource.root || options.source.migrations.some((migration, index) => !migration.raw.equals(rawSource.migrations[index]?.raw ?? Buffer.alloc(0)))) {
    fail("Nguồn Item5A được truyền vào không trùng raw buffer đã kiểm; không cài đặt.");
  }
  return rawSource;
}

export async function item5aOfflinePlan(root = item5aSourceRoot) {
  const source = await loadItem5aSource(root);
  return {
    mode: "OFFLINE_PLAN" as const,
    database_connections: 0,
    writes: 0,
    migrations: source.migrations.map(({ name, checksum }) => ({ name, checksum })),
    historical_ledger_entries: item5aHistoricalLedgerManifest.entries,
    excluded: ["039_local_migration_ledger.sql", "__seed.sql", "075_local_zcrm_commerce.sql", "076_local_zcrm_projection_events.sql"],
  };
}

async function rows(db: Database, sql: string, values: unknown[] = []) { return asRows((await db.query(sql, values)).rows); }
async function one(db: Database, sql: string, values: unknown[] = []) { return (await rows(db, sql, values))[0] ?? {}; }

async function assertDatabaseIdentity(db: Database, expectedDatabase?: string, expectedUser?: string) {
  const identity = await one(db, "select current_database() database,current_user database_user,current_setting('server_version_num') server_version_num,current_setting('TimeZone') timezone,pg_is_in_recovery() is_in_recovery");
  if (expectedDatabase && identity.database !== expectedDatabase) fail("Cơ sở dữ liệu không đúng mục tiêu Item5A.");
  if (expectedUser && identity.database_user !== expectedUser) fail("Người dùng cơ sở dữ liệu không đúng mục tiêu Item5A.");
  const version = Number(identity.server_version_num);
  if (version < 160000 || version >= 170000 || identity.is_in_recovery !== false) fail("Item5A chỉ chạy trên primary PostgreSQL 16.");
  return { database: String(identity.database ?? ""), database_user: String(identity.database_user ?? ""), server_version_num: String(identity.server_version_num ?? ""), timezone: String(identity.timezone ?? "") };
}

async function assertDependencies(db: Database) {
  const relations = await rows(db, `select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[])`, [["local_products", "local_manufacturing_records", "local_product_rates", "local_schema_migrations"]]);
  for (const name of ["local_products", "local_manufacturing_records", "local_product_rates", "local_schema_migrations"]) if (relations.filter((row) => row.relname === name && row.relkind === "r").length !== 1) fail(`Thiếu bảng phụ thuộc thường public.${name}.`);
  const columns = await rows(db, `select table_name,column_name,data_type,udt_name,is_nullable,column_default is not null has_default from information_schema.columns where table_schema='public' and table_name=any($1::text[])`, [["local_products", "local_manufacturing_records", "local_product_rates", "local_schema_migrations"]]);
  const column = (table: string, name: string) => columns.find((row) => row.table_name === table && row.column_name === name);
  const requireColumn = (table: string, name: string, types: string[], nullable = "NO", hasDefault?: boolean) => {
    const value = column(table, name);
    if (!value || !types.includes(String(value.data_type)) || String(value.is_nullable) !== nullable || hasDefault !== undefined && Boolean(value.has_default) !== hasDefault) fail(`Cột phụ thuộc public.${table}.${name} không đúng hợp đồng Item5A.`);
  };
  requireColumn("local_products", "id", ["uuid"]);
  requireColumn("local_manufacturing_records", "id", ["text", "character varying"]);
  requireColumn("local_manufacturing_records", "record_type", ["text", "character varying"]);
  requireColumn("local_manufacturing_records", "product_id", ["text", "character varying"], "YES");
  requireColumn("local_manufacturing_records", "payload", ["jsonb"]);
  requireColumn("local_product_rates", "id", ["uuid"]);
  requireColumn("local_schema_migrations", "name", ["text"]);
  requireColumn("local_schema_migrations", "checksum", ["text"]);
  requireColumn("local_schema_migrations", "source", ["text"]);
  requireColumn("local_schema_migrations", "applied_at", ["timestamp with time zone"], "NO", true);
  const keys = await rows(db, `select c.relname,con.contype,array_agg(att.attname order by array_position(con.conkey,att.attnum)) columns from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace join unnest(con.conkey) key(attnum) on true join pg_attribute att on att.attrelid=c.oid and att.attnum=key.attnum where n.nspname='public' and c.relname=any($1::text[]) and con.contype in ('p','u') and con.convalidated group by c.relname,con.contype`, [["local_products", "local_manufacturing_records", "local_product_rates", "local_schema_migrations"]]);
  for (const [table, key] of [["local_products", "id"], ["local_manufacturing_records", "id"], ["local_product_rates", "id"], ["local_schema_migrations", "name"]]) if (!keys.some((row) => row.relname === table && String(row.columns).replace(/[{}"]/g, "") === key)) fail(`Thiếu khóa một cột đã xác thực trên public.${table}.${key}.`);
  const uuid = await one(db, "select to_regprocedure('public.gen_random_uuid()') is not null available");
  if (uuid.available !== true) fail("Thiếu hàm public.gen_random_uuid() cần cho chuỗi Item5A.");
}

async function assertPublicAclSafe(db: Database) {
  const grants = await rows(db, `select c.relname,x.privilege_type from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x where n.nspname='public' and c.relname=any($1::text[]) and x.grantee=0`, [targetTables]);
  if (grants.length) fail("Phát hiện quyền PUBLIC trên bảng Item5A; cần hardening riêng.");
  const columnGrants = await rows(db, `select c.relname,a.attname,x.privilege_type from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid cross join lateral aclexplode(a.attacl) x where n.nspname='public' and c.relname=any($1::text[]) and a.attnum>0 and not a.attisdropped and x.grantee=0`, [targetTables]);
  if (columnGrants.length) fail("Phát hiện quyền PUBLIC theo cột trên bảng Item5A; cần hardening riêng.");
  const defaults = await one(db, `select exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) x where d.defaclrole=(select oid from pg_roles where rolname=current_user) and d.defaclobjtype='r' and (d.defaclnamespace=0 or d.defaclnamespace='public'::regnamespace) and x.grantee=0) unsafe`);
  if (defaults.unsafe === true) fail("Default privilege PUBLIC của người cài đặt không an toàn cho Item5A.");
}

async function assertTargetObjectsAbsent(db: Database) {
  const tableRows = await rows(db, "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[])", [targetTables]);
  const functions = await rows(db, "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1::text[])", [targetFunctions]);
  const triggers = await rows(db, "select t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and t.tgname=any($1::text[])", [targetTriggers]);
  if (tableRows.length || functions.length || triggers.length) fail("Đích Item5A đã có một phần đối tượng; không tự sửa hoặc cài chồng.");
}

const canonicalAcl = (acl: string, owner: string) => `coalesce((select jsonb_agg(jsonb_build_object(
  'grantee',case when x.grantee=0 then 'PUBLIC' when x.grantee=${owner} then 'OWNER' else pg_get_userbyid(x.grantee) end,
  'grantor',case when x.grantor=0 then 'PUBLIC' when x.grantor=${owner} then 'OWNER' else pg_get_userbyid(x.grantor) end,
  'privilege_type',x.privilege_type,
  'is_grantable',x.is_grantable
) order by case when x.grantee=0 then 'PUBLIC' when x.grantee=${owner} then 'OWNER' else pg_get_userbyid(x.grantee) end,case when x.grantor=0 then 'PUBLIC' when x.grantor=${owner} then 'OWNER' else pg_get_userbyid(x.grantor) end,x.privilege_type,x.is_grantable) from aclexplode(${acl}) x),'[]'::jsonb)`;

export async function item5aSchemaOracle(db: Database) {
  const relations = await rows(db, `select c.relname table_name,c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relowner=(select oid from pg_roles where rolname=current_user) owner_is_current_user,${canonicalAcl("coalesce(c.relacl,acldefault('r',c.relowner))", "c.relowner")} relation_acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by 1`, [targetTables]);
  const columns = await rows(db, `select c.relname table_name,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) data_type,a.attnotnull,coalesce(pg_get_expr(d.adbin,d.adrelid),'') default_expression,${canonicalAcl("a.attacl", "c.relowner")} column_acl from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname='public' and c.relname=any($1::text[]) and a.attnum>0 and not a.attisdropped order by 1,2`, [targetTables]);
  const constraints = await rows(db, "select c.relname table_name,co.conname,co.contype,co.condeferrable,co.condeferred,co.convalidated,pg_get_constraintdef(co.oid,true) definition from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by 1,2", [targetTables]);
  const indices = await rows(db, "select c.relname table_name,i.relname index_name,x.indisunique,x.indisprimary,x.indisvalid,x.indpred is not null partial,pg_get_indexdef(i.oid) definition from pg_index x join pg_class c on c.oid=x.indrelid join pg_class i on i.oid=x.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by 1,2", [targetTables]);
  const functions = await rows(db, `select p.proname,pg_get_function_identity_arguments(p.oid) arguments,l.lanname,p.provolatile,p.prosecdef,p.proleakproof,p.proowner=(select oid from pg_roles where rolname=current_user) owner_is_current_user,coalesce(array_to_string(p.proconfig,','),'') proconfig,${canonicalAcl("coalesce(p.proacl,acldefault('f',p.proowner))", "p.proowner")} function_acl,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='public' and p.proname=any($1::text[]) order by 1,2`, [targetFunctions]);
  const triggers = await rows(db, "select t.tgname,c.relname table_name,p.proname function_name,t.tgtype,t.tgenabled,t.tgisinternal,pg_get_triggerdef(t.oid,true) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and not t.tgisinternal and (c.relname=any($1::text[]) or (c.relname=$2 and t.tgname=$3)) order by 2,1", [targetTables, sourceTrigger071.table, sourceTrigger071.name]);
  const policies = await rows(db, "select c.relname table_name,p.polname,p.polcmd,p.polpermissive,coalesce(pg_get_expr(p.polqual,p.polrelid),'') using_expression,coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') check_expression from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by 1,2", [targetTables]);
  return { relations, columns, constraints, indices, functions, triggers, policies };
}

async function assertTargetSchema(db: Database) {
  const actualHash = sha256(JSON.stringify(await item5aSchemaOracle(db)));
  if (actualHash !== item5aSchemaManifest.schemaSha256) fail(`Cấu trúc Item5A không khớp catalog PostgreSQL 16 đã duyệt (${actualHash}).`);
}

async function assertTargetOwners(db: Database, expectedOwner?: string) {
  const identity = await one(db, "select current_user database_user");
  const owner = expectedOwner ?? String(identity.database_user ?? "");
  const owners = await rows(db, "select 'relation' kind,c.relname name,pg_get_userbyid(c.relowner) owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) union all select 'function',p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',pg_get_userbyid(p.proowner) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($2::text[]) order by 1,2", [targetTables, targetFunctions]);
  if (owners.some((row) => row.owner !== owner)) fail("Owner đối tượng Item5A phải khớp người dùng local hiện tại/đã kỳ vọng.");
}

async function assertTargetObjectsPresent(db: Database, expectedOwner?: string) {
  const tableRows = await rows(db, "select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[])", [targetTables]);
  const functions = await rows(db, "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any($1::text[])", [targetFunctions]);
  const triggers = await rows(db, "select t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and c.relname=any($1::text[]) order by t.tgname", [targetTables]);
  const sourceTrigger = await rows(db, "select t.tgname,c.relname table_name from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and c.relname=$1 and t.tgname=$2", [sourceTrigger071.table, sourceTrigger071.name]);
  if (tableRows.length !== targetTables.length || tableRows.some((row) => row.relkind !== "r") || functions.length !== targetFunctions.length || triggers.length !== targetRelationTriggers.length || JSON.stringify(triggers.map((row) => row.tgname)) !== JSON.stringify([...targetRelationTriggers].sort()) || sourceTrigger.length !== 1) fail("Đối tượng Item5A sau cài đặt không đúng footprint đã duyệt.");
  await assertTargetOwners(db, expectedOwner);
  await assertTargetSchema(db);
  await assertPublicAclSafe(db);
}

async function ledger(db: Database) { return (await rows(db, "select name,checksum,source from public.local_schema_migrations order by name")).map((row) => ({ name: String(row.name), checksum: String(row.checksum), source: String(row.source) })); }
async function assertLedger(db: Database, source: Item5aSource, installed: boolean) {
  const actual = await ledger(db);
  const target = actual.filter((entry) => (targetMigrationNames as readonly string[]).includes(entry.name));
  const historical = actual.filter((entry) => !(targetMigrationNames as readonly string[]).includes(entry.name));
  const seed = historical.find((entry) => entry.name === item5aHistoricalLedgerManifest.adoptedSeed.name);
  if (historical.length !== item5aHistoricalLedgerManifest.entries || ledgerHash(historical) !== item5aHistoricalLedgerManifest.sortedRowsSha256 || JSON.stringify(seed) !== JSON.stringify(item5aHistoricalLedgerManifest.adoptedSeed)) fail("Sổ 73 bản ghi lịch sử Item5A không đúng mốc đã duyệt.");
  const expectedTarget = installed ? source.migrations.map(({ name, checksum }) => ({ name, checksum, source: "APPLIED" })).sort((left, right) => left.name.localeCompare(right.name)) : [];
  exactly(target, expectedTarget, installed ? "Sổ Item5A không phải đúng 79 bản ghi đã duyệt." : "Sổ tiền cài đặt chứa migration Item5A.");
  if (actual.length !== historical.length + expectedTarget.length) fail("Sổ Item5A có mục nằm ngoài phạm vi đã duyệt.");
}

async function assertNoOtherDatabaseSessions(db: Database) {
  const state = await one(db, "select count(*)::int count from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()");
  if (Number(state.count) !== 0) fail("Còn phiên cơ sở dữ liệu khác; cần cửa sổ bảo trì riêng trước khi cài Item5A.");
}

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;
const canonicalRows = (value: Row[]) => value.map((row) => Object.keys(row).sort().map((key) => `${key}=${JSON.stringify(row[key] ?? null)}`).join("\u0001")).join("\n");
type PublicBaseline = { rows: Record<string, { count: string; digest: string }>; catalog: string; sequences: string };

async function lockPreexistingPublicTables(db: Database) {
  const tables = await rows(db, "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relname=any($1::text[]) order by c.relname", [targetTables]);
  for (const table of tables) await db.query(`lock table public.${quoteIdentifier(String(table.relname))} in share row exclusive mode`);
}

async function capturePublicBaseline(db: Database): Promise<PublicBaseline> {
  const tableRows = await rows(db, "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') and not c.relname=any($1::text[]) order by c.relname", [targetTables]);
  const data: PublicBaseline["rows"] = {};
  for (const table of tableRows) {
    const name = String(table.relname);
    const ledgerFilter = name === "local_schema_migrations" ? ` where not name=any($1::text[])` : "";
    const value = await one(db, `select count(*)::text count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public.${quoteIdentifier(name)} t${ledgerFilter}`, name === "local_schema_migrations" ? [targetMigrationNames] : []);
    data[name] = { count: String(value.count ?? ""), digest: String(value.digest ?? "") };
  }
  const catalog = await rows(db, `
    select 'class' kind,c.relname name,'' identifier,c.relkind::text||':'||c.relpersistence::text||':'||c.relrowsecurity::text||':'||c.relforcerowsecurity::text||':'||pg_get_userbyid(c.relowner),coalesce(c.reloptions::text,'')||':'||coalesce(c.relacl::text,'') extra from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S') and not c.relname=any($1::text[])
    union all select 'column',c.relname,a.attname,format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text,coalesce(pg_get_expr(d.adbin,d.adrelid),'')||':'||coalesce(a.attacl::text,'') from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname='public' and c.relkind in ('r','p','v','m','S') and a.attnum>0 and not a.attisdropped and not c.relname=any($1::text[])
    union all select 'constraint',c.relname,co.conname,co.contype::text,pg_get_constraintdef(co.oid,true) from pg_constraint co join pg_class c on c.oid=co.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not c.relname=any($1::text[])
    union all select 'index',c.relname,i.relname,'index',pg_get_indexdef(i.oid) from pg_index x join pg_class c on c.oid=x.indrelid join pg_class i on i.oid=x.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not c.relname=any($1::text[])
    union all select 'trigger',c.relname,t.tgname,'trigger:'||t.tgenabled::text,pg_get_triggerdef(t.oid,true) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and not (c.relname=any($1::text[]) and t.tgname=any($2::text[])) and not (c.relname=$4 and t.tgname=$5)
    union all select 'function',p.proname,pg_get_function_identity_arguments(p.oid),p.prokind::text||':'||p.prosecdef::text||':'||p.proleakproof::text||':'||pg_get_userbyid(p.proowner)||':'||coalesce(array_to_string(p.proconfig,','), '')||':'||coalesce(p.proacl::text,''),coalesce(p.prosrc,'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and not p.proname=any($3::text[])
    union all select 'policy',c.relname,p.polname,p.polcmd::text||':'||p.polpermissive::text||':'||coalesce(p.polroles::text,''),coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'') from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not c.relname=any($1::text[])
    union all select 'default_acl',coalesce(n.nspname,''),d.defaclobjtype::text,pg_get_userbyid(d.defaclrole),coalesce(d.defaclacl::text,'') from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclnamespace=0 or n.nspname='public'
    order by 1,2,3,4,5`, [targetTables, targetRelationTriggers, targetFunctions, sourceTrigger071.table, sourceTrigger071.name]);
  const sequenceNames = await rows(db, "select sequencename from pg_sequences where schemaname='public' order by sequencename");
  const sequences: Row[] = [];
  for (const row of sequenceNames) {
    const name = String(row.sequencename);
    const settings = await one(db, "select data_type,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value from pg_sequences where schemaname='public' and sequencename=$1", [name]);
    const state = await one(db, `select last_value,is_called from public.${quoteIdentifier(name)}`);
    sequences.push({ sequencename: name, ...settings, ...state });
  }
  return { rows: data, catalog: sha256(canonicalRows(catalog)), sequences: sha256(canonicalRows(sequences)) };
}

async function assertPublicBaseline(db: Database, baseline: PublicBaseline) {
  exactly(await capturePublicBaseline(db), baseline, "Dữ liệu, cấu trúc, hoặc sequence public có trước Item5A đã thay đổi trong khi cài đặt.");
}

async function assertSeedIdentity(db: Database) {
  const ids = laborRequirementSeedManifest.map((entry) => entry.stream_id);
  const records = await rows(db, `select s.id::text stream_id,s.code_key,s.created_by stream_created_by,isfinite(s.created_at) stream_created_at_finite,e.id::text event_id,isfinite(e.created_at) event_created_at_finite,e.version,e.action,e.effective_from::text effective_from,e.effective_to::text effective_to,e.semantic_fingerprint,e.definition,e.content_hash,e.proposal_id,e.proposal_revision,e.author_id,e.reviewer_id,e.reason,e.legacy_id,e.legacy_version,e.seed_manifest_hash from public.local_labor_requirement_streams s join public.local_labor_requirement_events e on e.stream_id=s.id where s.id=any($1::uuid[]) and e.version in (1,2)`, [ids]);
  if (records.length !== 20) fail("Mẫu kỹ thuật cài đặt/quarantine không đủ 20 event bất biến.");
  for (const seed of laborRequirementSeedManifest) {
    const first = records.find((row) => row.stream_id === seed.stream_id && Number(row.version) === 1);
    const retired = records.find((row) => row.stream_id === seed.stream_id && Number(row.version) === 2);
    const common = (row: Row | undefined) => !!row && row.code_key === seed.code_key && row.stream_created_by === "REVIEWED_SEED" && row.stream_created_at_finite === true && row.event_created_at_finite === true && row.effective_from === seed.effective_from && row.effective_to === null && row.semantic_fingerprint === seed.semantic_fingerprint && row.content_hash === seed.content_hash && productDigest(row.definition) === productDigest(seed.definition) && row.legacy_id === seed.legacy_id && row.legacy_version === seed.legacy_version && row.seed_manifest_hash === laborRequirementSeedHash && row.proposal_id === null && row.proposal_revision === null;
    if (!common(first) || !/^[a-f0-9-]{36}$/i.test(String(first!.event_id)) || first!.action !== "APPROVE" || first!.author_id !== "REVIEWED_SEED" || first!.reviewer_id !== "REVIEWED_SEED" || first!.reason !== "Nhập đúng mười hợp đồng đã được rà soát") fail(`Mẫu kỹ thuật bất biến không khớp: ${seed.code_key}.`);
    if (!common(retired) || retired!.action !== "RETIRE" || retired!.event_id !== installationQuarantineEventIds[seed.code_key] || retired!.author_id !== installationQuarantineActor || retired!.reviewer_id !== installationQuarantineActor || retired!.reason !== installationQuarantineReason) fail(`Quarantine bất biến không khớp: ${seed.code_key}.`);
  }
}

async function assertFreshPostconditions(db: Database) {
  for (const name of emptyInstallationTables) {
    const value = await one(db, `select count(*)::int count from public.${name}`);
    if (Number(value.count) !== 0) fail(`Bảng Item5A phải rỗng ngay sau cài đặt: ${name}.`);
  }
  const streams = await one(db, "select count(*)::int count from public.local_labor_requirement_streams");
  const events = await one(db, "select count(*)::int count from public.local_labor_requirement_events");
  if (Number(streams.count) !== 10 || Number(events.count) !== 20) fail("Cài đặt mới phải có đúng 10 stream và 20 event seed/quarantine.");
  for (const at of ["0001-01-01", "2026-10-29", "2099-12-31"]) {
    const active = await one(db, `select count(*)::int count from (select distinct on(stream_id) action,effective_to from public.local_labor_requirement_events where effective_from<=$1::date order by stream_id,version desc) selected where action='APPROVE' and (effective_to is null or effective_to>=$1::date)`, [at]);
    if (Number(active.count) !== 0) fail("Quarantine phải không còn requirement active tại mọi mốc kiểm tra.");
  }
  await assertSeedIdentity(db);
}

async function lockForInstall(db: Database) {
  await db.query("select pg_advisory_xact_lock(hashtextextended('local-schema-migration-bootstrap',0))");
  await db.query("select pg_advisory_xact_lock(hashtextextended('local-attendance-payroll-source-guard',0))");
  await db.query("select pg_advisory_xact_lock(hashtextextended('labor-mapping-writer',0))");
  await db.query("select pg_advisory_xact_lock(hashtextextended('payroll-product-rate-config',0))");
}

async function begin(db: Database, readOnly: boolean) {
  await db.query(readOnly ? "begin isolation level repeatable read read only" : "begin isolation level read committed");
  await db.query("set local statement_timeout='15s'");
  await db.query("set local lock_timeout='3s'");
  await db.query("set local idle_in_transaction_session_timeout='20s'");
  await db.query("set local TimeZone='Asia/Ho_Chi_Minh'");
  await db.query("set local search_path=public,pg_catalog");
  await db.query("set local DateStyle='ISO, YMD'");
  await db.query("set local extra_float_digits=3");
}

export type Item5aInstallOptions = { source?: Item5aSource; sourceRoot?: string; expectedDatabase?: string; expectedUser?: string; expectedOwner?: string };
export async function installItem5a(pool: Pick<Pool, "connect">, options: Item5aInstallOptions = {}) {
  const source = await resolveItem5aSource(options);
  const client = await pool.connect();
  try {
    await begin(client, false);
    await lockForInstall(client);
    const identity = await assertDatabaseIdentity(client, options.expectedDatabase, options.expectedUser);
    await assertNoOtherDatabaseSessions(client);
    await assertDependencies(client);
    await assertPublicAclSafe(client);
    await assertLedger(client, source, false);
    await assertTargetObjectsAbsent(client);
    await lockPreexistingPublicTables(client);
    const before = await capturePublicBaseline(client);
    for (const migration of source.migrations) {
      await client.query(migration.sql);
      await client.query("insert into public.local_schema_migrations(name,checksum,source) values($1,$2,'APPLIED')", [migration.name, migration.checksum]);
    }
    await assertLedger(client, source, true);
    await assertTargetObjectsPresent(client, options.expectedOwner ?? options.expectedUser);
    await assertFreshPostconditions(client);
    await assertPublicBaseline(client, before);
    await client.query("commit");
    return { mode: "INSTALLED" as const, database: identity.database, migrations: source.migrations.map(({ name, checksum }) => ({ name, checksum })), historical_ledger_entries: 73, ledger_entries: 79, seed_streams: 10, seed_events: 20, active_requirements: 0 };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function verifyItem5aInstallation(pool: Pick<Pool, "connect">, options: Item5aInstallOptions = {}) {
  const source = await resolveItem5aSource(options);
  const client = await pool.connect();
  try {
    await begin(client, true);
    const identity = await assertDatabaseIdentity(client, options.expectedDatabase, options.expectedUser);
    await assertDependencies(client);
    await assertLedger(client, source, true);
    await assertTargetObjectsPresent(client, options.expectedOwner ?? options.expectedUser);
    await assertSeedIdentity(client);
    await client.query("commit");
    return { mode: "VERIFIED" as const, database: identity.database, migrations: source.migrations.map(({ name, checksum }) => ({ name, checksum })), historical_ledger_entries: 73, ledger_entries: 79, immutable_seed_streams: 10, immutable_seed_and_quarantine_events: 20, human_configuration_allowed: true };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
