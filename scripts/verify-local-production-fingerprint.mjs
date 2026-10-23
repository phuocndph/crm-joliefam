// Read-only live fingerprint comparison against a validated clone rehearsal.
// Never starts an API, applies migrations, or outputs business rows/credentials.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),baselineIndex=args.indexOf('--baseline');
assert(baselineIndex>=0&&args[baselineIndex+1],'Use --baseline <validated clone report.json>.');
const after=args.includes('--after058');assert(after!==args.includes('--before'),'Select exactly one of --before or --after058.');
const reportPath=path.resolve(args[baselineIndex+1]);
assert.equal(path.dirname(reportPath),path.join(root,'.local-staging-runtime'),'Baseline report must be in this workspace ignored runtime folder.');
assert(/^production-upgrade-\d+\.json$/.test(path.basename(reportPath)),'Expected approved clone report filename.');
const baseline=JSON.parse(await readFile(reportPath,'utf8'));
assert.equal(baseline.status,'PASS');assert.equal(baseline.database,'crm_local_qa_production_20261019_pre058');
assert.equal(baseline.baseline.database,baseline.database);assert.equal(baseline.after.database,baseline.database);
const databaseUrl=process.env.LOCAL_FINGERPRINT_DATABASE_URL;assert(databaseUrl,'Explicit LOCAL_FINGERPRINT_DATABASE_URL required; no default database.');
const parsed=new URL(databaseUrl);assert(['postgres:','postgresql:'].includes(parsed.protocol));
assert.equal(parsed.search,'','Connection query overrides are forbidden.');assert.equal(parsed.hash,'','URL fragments are forbidden.');
assert(['127.0.0.1','localhost'].includes(parsed.hostname)&&parsed.port==='55432');assert.equal(decodeURIComponent(parsed.pathname.slice(1)),'crm_local','Only explicit live local database is accepted for READ ONLY fingerprinting.');
const ident=x=>'"'+String(x).replaceAll('"','""')+'"';
const pool=new pg.Pool({connectionString:databaseUrl,max:1}),client=await pool.connect();
try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal((await client.query('select current_database() database,current_setting(\'transaction_read_only\') readonly')).rows[0].database,'crm_local');
  assert.equal((await client.query("select current_setting('transaction_read_only') readonly")).rows[0].readonly,'on');
  const tables=(await client.query(`select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by n.nspname,c.relname`)).rows;
  const names=tables.map(t=>`${t.schema}.${t.name}`),expected=after?baseline.after:baseline.baseline;
  assert.deepEqual(names,Object.keys(expected.tables),'Table inventory differs from the validated upgrade stage.');
  for(const table of tables){
    const name=`${table.schema}.${table.name}`,stageTable=expected.tables[name],old=baseline.baseline.tables[name];
    const columns=(await client.query('select column_name name,data_type,udt_name,is_nullable from information_schema.columns where table_schema=$1 and table_name=$2 order by ordinal_position',[table.schema,table.name])).rows;
    assert.deepEqual(columns,stageTable.columns,`Column contract differs in ${name}.`);
    const kept=old?old.columns.map(c=>c.name):columns.map(c=>c.name),extra=columns.map(c=>c.name).filter(c=>!kept.includes(c));
    const expression='md5((to_jsonb(t)-$1::text[])::text)';
    const digest=(await client.query(`select count(*)::text count,md5(coalesce(string_agg(${expression},'' order by ${expression}),'')) row_hash from ${ident(table.schema)}.${ident(table.name)} t`,[extra])).rows[0];
    assert.equal(digest.count,stageTable.count,`Row count differs in ${name}.`);
    if(!(after&&name==='public.local_schema_migrations'))assert.equal(digest.row_hash,stageTable.row_hash,`Row fingerprint differs in ${name}.`);
    if(after&&old&&extra.length){
      const checks=extra.map(c=>c==='valuation_status'?`${ident(c)} is distinct from 'UNVALUED'`:`${ident(c)} is not null`).join(' or ');
      assert.equal((await client.query(`select count(*)::text n from ${ident(table.schema)}.${ident(table.name)} where ${checks}`)).rows[0].n,'0',`Unexpected values in newly added columns of ${name}.`);
    }
  }
  const ledger=(await client.query('select name,checksum,source,applied_at::text applied_at from local_schema_migrations order by name')).rows;
  if(after){
    // The live migration is a different application transaction from clone;
    // only058's timestamp may differ. Historical timestamps stay exact.
    assert.deepEqual(ledger.filter(x=>x.name!=='058_local_production_workspace.sql'),baseline.baseline.ledger,'Historical ledger or seed marker differs.');
    const added=ledger.filter(x=>!baseline.baseline.ledger.some(y=>y.name===x.name));assert.equal(added.length,1);
    const expectedAdded=baseline.after.ledger.find(x=>x.name==='058_local_production_workspace.sql');assert.equal(added[0].name,expectedAdded.name);assert.equal(added[0].checksum,expectedAdded.checksum);assert.equal(added[0].source,'APPLIED');
  }else assert.deepEqual(ledger,baseline.baseline.ledger,'Historical migration checksums/timestamps or seed marker differ.');
  const sequenceRows=(await client.query(`select n.nspname schema,c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='S' and n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by n.nspname,c.relname`)).rows,sequences={};
  for(const row of sequenceRows)sequences[`${row.schema}.${row.name}`]=(await client.query(`select last_value::text last_value,is_called from ${ident(row.schema)}.${ident(row.name)}`)).rows[0];
  assert.deepEqual(sequences,baseline.baseline.sequences,'Sequence positions differ from the validated backup clone.');
  await client.query('ROLLBACK');
  console.log(`PASS READ ONLY crm_local ${after?'after058':'before058'} fingerprint: ${tables.length} tables, old-column digests/counts, sequences and ${after?'expected058 + unchanged historical':'exact pre058'} ledger verified.`);
}finally{await client.query('ROLLBACK').catch(()=>undefined);client.release();await pool.end();}
