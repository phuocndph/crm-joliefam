import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { installItem5a, item5aSchemaOracle, loadItem5aSource, verifyItem5aInstallation } from "../server/db/item5a-install.ts";
import { item5aHistoricalLedgerManifest } from "../server/db/item5a-ledger-manifest.ts";
import { item5aSchemaManifest } from "../server/db/item5a-schema-manifest.ts";

const databaseUrl = process.env.ITEM5A_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("ITEM5A_TEST_DATABASE_URL is required for the isolated Item5A test.");
const target = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(target.hostname) || target.pathname !== '/item5a_oracle') throw new Error("Item5A test only accepts the owned item5a_oracle loopback database.");
const fixtureRole = process.env.ITEM5A_TEST_OWNER || "item5a_owner";
if (!/^[a-z][a-z0-9_]{0,62}$/.test(fixtureRole)) throw new Error("ITEM5A_TEST_OWNER must be a synthetic lowercase PostgreSQL role name.");
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const root = fileURLToPath(new URL("..", import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const historicalFiles = (await readdir(new URL("../server/db/migrations/", import.meta.url)))
  .filter((name) => /^[0-9]{3}_.+\.sql$/.test(name) && Number(name.slice(0, 3)) <= 69)
  .sort();
const entries = await Promise.all(historicalFiles.map(async (name) => ({
  name,
  checksum: sha256(await readFile(new URL(`../server/db/migrations/${name}`, import.meta.url))),
  source: Number(name.slice(0, 3)) <= 38 ? "ADOPTED" : "APPLIED",
})));
entries.push(item5aHistoricalLedgerManifest.adoptedSeed);
const ledgerHash = sha256(entries.slice().sort((left, right) => left.name.localeCompare(right.name)).map((entry) => `${entry.name}\t${entry.checksum}\t${entry.source}`).join("\n"));
assert.equal(entries.length, item5aHistoricalLedgerManifest.entries, "Owned fixture history must contain the frozen 73 ledger entries.");
assert.equal(ledgerHash, item5aHistoricalLedgerManifest.sortedRowsSha256, "Raw local history must match the frozen Item5A ledger hash.");
const rawSource = await loadItem5aSource(root);
let blockedConnects = 0;
await assert.rejects(
  () => verifyItem5aInstallation({ connect: async () => { blockedConnects += 1; throw new Error("must not connect"); } }, { source: { ...rawSource, migrations: [...rawSource.migrations].reverse() } }),
  /Thứ tự\/tên\/checksum/,
);
assert.equal(blockedConnects, 0, "A supplied source override must be rejected from raw buffers before any database connection.");
const administrator = new Pool({ connectionString: databaseUrl, max: 1 });
let administratorClosed = false;
try {
  await administrator.query("create extension if not exists pgcrypto");
  await administrator.query(`create role ${quoteIdentifier(fixtureRole)} nologin`);
  await administrator.query(`grant usage,create on schema public to ${quoteIdentifier(fixtureRole)}`);
  await administrator.end();
  administratorClosed = true;
  const owner = new Pool({ connectionString: databaseUrl, options: `-c role=${fixtureRole}`, max: 1 });
  try {
    await owner.query("create table local_products(id uuid primary key)");
    await owner.query("create table local_manufacturing_records(id text primary key,record_type text not null,product_id text,payload jsonb not null default '{}'::jsonb)");
    await owner.query("create table local_product_rates(id uuid primary key)");
    await owner.query("create table local_schema_migrations(name text primary key,checksum text not null,source text not null,applied_at timestamptz not null default now())");
    for (const entry of entries) await owner.query("insert into local_schema_migrations(name,checksum,source) values($1,$2,$3)", [entry.name, entry.checksum, entry.source]);
    const installed = await installItem5a(owner, { sourceRoot: root });
    assert.equal(installed.ledger_entries, 79);
    assert.equal((await owner.query("select count(*)::int count from local_labor_requirement_streams")).rows[0].count, 10);
    assert.equal((await owner.query("select count(*)::int count from local_labor_requirement_events")).rows[0].count, 20);
    await verifyItem5aInstallation(owner, { sourceRoot: root });
    await owner.query("begin");
    await owner.query("set local TimeZone='Asia/Ho_Chi_Minh'");
    await owner.query("set local search_path=public,pg_catalog");
    await owner.query("set local DateStyle='ISO, YMD'");
    await owner.query("set local extra_float_digits=3");
    const oracle = await item5aSchemaOracle(owner);
    await owner.query("commit");
    assert.equal(sha256(JSON.stringify(oracle)), item5aSchemaManifest.schemaSha256);
    assert.ok(oracle.relations.every((row) => row.owner_is_current_user === true));
    assert.ok(oracle.functions.every((row) => row.owner_is_current_user === true));
    const proposal = (await owner.query("insert into local_labor_requirement_streams(code_key,created_by) values('human-test','tester') returning id")).rows[0];
    const proposalId = (await owner.query("insert into local_labor_requirement_proposals(stream_id,owner_id,created_by) values($1,'tester','tester') returning id", [proposal.id])).rows[0].id;
    await owner.query("insert into local_labor_requirement_drafts(proposal_id,revision,semantic_fingerprint,definition,content_hash,submitted,reason,created_by) values($1,1,$2,'{}'::jsonb,$2,true,'Đề xuất kiểm thử hợp lệ','tester')", [proposalId, "0".repeat(64)]);
    await owner.query("insert into local_labor_requirement_events(stream_id,version,action,effective_from,semantic_fingerprint,definition,content_hash,proposal_id,proposal_revision,author_id,reviewer_id,reason) values($1,1,'APPROVE','2026-10-29',$2,'{}'::jsonb,$2,$3,1,'tester','reviewer','Phê duyệt kiểm thử hợp lệ')", [proposal.id, "0".repeat(64), proposalId]);
    await verifyItem5aInstallation(owner, { sourceRoot: root });
    console.log(JSON.stringify({
      suite: "item5a-owned-isolated-install",
      result: "passed",
      fixture: {
        database: "item5a_oracle",
        host: target.hostname,
        port: target.port || "5432",
        ownership: "fresh synthetic PostgreSQL 16 fixture; current_user owns Item5A relations/functions",
        external_network_calls: 0,
        loopback_tcp_used: true,
        source_database_accessed: false,
        staging_runtime_dependency: false,
      },
      raw_source_chain: rawSource.migrations.map(({ name, checksum }) => ({ name, checksum })),
      schema_oracle: {
        sha256: item5aSchemaManifest.schemaSha256,
        relation_rows: oracle.relations.length,
        column_rows: oracle.columns.length,
        trigger_rows: oracle.triggers.length,
        function_rows: oracle.functions.length,
        policy_rows: oracle.policies.length,
      },
    }));
  } finally { await owner.end(); }
} finally { if (!administratorClosed) await administrator.end(); }
