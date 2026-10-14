import pg from "pg";
import { bootstrapDatabase, pool as bootstrapPool } from "../server/db/bootstrap.ts";
import { refreshCanonicalProjections } from "./sync-supabase-to-local.mjs";

const { Pool } = pg;
const databaseUrl = process.env.LOCAL_DATABASE_URL;
if (!databaseUrl) throw new Error("LOCAL_DATABASE_URL is required");
const testPool = new Pool({ connectionString: databaseUrl });
const key = "tombstone-test-transaction";

try {
  await bootstrapDatabase();
  await testPool.query(
    `insert into local_source_snapshots
      (source, source_schema, source_table, source_key, source_hash, payload, is_deleted)
       values ('SUPABASE', 'public', 'transactions', $1::text, 'test-hash',
       jsonb_build_object('id', $1::text, 'amount', 1234.56, 'type', 'income'), false)
     on conflict (source, source_schema, source_table, source_key) do update
       set source_hash=excluded.source_hash, payload=excluded.payload, is_deleted=false`,
    [key],
  );
  await refreshCanonicalProjections(testPool);
  let projected = (await testPool.query("select amount from local_transactions where id=$1", [key])).rows[0];
  if (!projected || String(projected.amount) !== "1234.56") throw new Error("projection insert failed");

  await testPool.query(
    `insert into local_projection_tombstones(source_table, source_key, tombstone_kind)
     values ('transactions', $1, 'LOCAL')
     on conflict (source_table, source_key) do update set tombstone_kind='LOCAL', updated_at=now()`,
    [key],
  );
  await testPool.query("delete from local_transactions where id=$1", [key]);
  await refreshCanonicalProjections(testPool);
  projected = (await testPool.query("select id from local_transactions where id=$1", [key])).rows[0];
  if (projected) throw new Error("local tombstone resurrected");

  await testPool.query("delete from local_projection_tombstones where source_table='transactions' and source_key=$1", [key]);
  await testPool.query("update local_source_snapshots set is_deleted=true where source_table='transactions' and source_key=$1", [key]);
  await refreshCanonicalProjections(testPool);
  projected = (await testPool.query("select id from local_transactions where id=$1", [key])).rows[0];
  if (projected) throw new Error("source tombstone left a canonical row");
  console.log("local_tombstone_projection_test: PASS");
} finally {
  await testPool.query("delete from local_projection_tombstones where source_key=$1", [key]).catch(() => undefined);
  await testPool.query("delete from local_transactions where id=$1", [key]).catch(() => undefined);
  await testPool.query("delete from local_source_snapshots where source_key=$1", [key]).catch(() => undefined);
  await testPool.end();
  await bootstrapPool.end();
}
