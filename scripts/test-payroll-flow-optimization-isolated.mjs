// Synthetic fixtures only; invoked by the owned disposable, outbound-disabled runner.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { approveLegacyPayrollFixture } from './payroll-approved-fixtures.mjs';

export async function runPayrollFlowOptimizationTests({ pool, admin, call, must }) {
  const passed = [], failures = [], key = () => randomUUID();
  const check = async (name, action) => { try { await action(); passed.push(name); console.log('PASS ' + name); } catch (error) { failures.push({ name, error: error.stack }); console.log('FAIL ' + name + ': ' + error.message); } };
  const components = {
    assignment_id: ['local_worker_compensation_assignments', 'compensation-assignments'],
    profile_id: ['local_worker_payroll_profiles', 'worker-profiles'],
    rate_id: ['local_worker_rates', 'rates'],
    insurance_id: ['local_social_insurance_versions', 'insurance'],
  };
  const selection = b => Object.fromEntries([['assignment_id', b.assignment], ['profile_id', b.profile], ['rate_id', b.rate], ['insurance_id', b.insurance]].filter(([, r]) => r).map(([k, r]) => [k, r.id]));
  const p = (year, month) => ({ period_start: `${year}-${month}-01`, period_end: `${year}-${month}-${month === '02' ? '28' : ['04','06','09','11'].includes(month) ? '30' : '31'}`, standard_days: 26 });
  const preview = async (period, workers) => { await approveLegacyPayrollFixture(pool,period.period_start,period.period_end,26); return must('/api/payroll/runs', 'POST', { ...period, worker_ids: workers.map(w => w.id), idempotency_key: key() }); };
  const preflight = async (period, workers) => { await approveLegacyPayrollFixture(pool,period.period_start,period.period_end,26); return must('/api/payroll/preflight?period_start=' + period.period_start + '&period_end=' + period.period_end + '&standard_days=26&worker_ids=' + workers.map(w => w.id).join(',')); };
  const review = (w, selected) => must('/api/payroll/worker-profile-bundle/review', 'POST', { worker_id: w.id, selection: selected });
  const approvalBody = async (w, selected) => ({ worker_id: w.id, selection: selected, expected_fingerprint: (await review(w, selected)).fingerprint, reason: 'isolated continuation QA', idempotency_key: key() });
  const approveBundle = async (w, bundle) => must('/api/payroll/worker-profile-bundle/approve', 'POST', await approvalBody(w, selection(bundle)));
  async function fixture(start, { insurance = false, type = 'MONTHLY_HELPER', location = 'FLOW-A' } = {}) {
    await pool.query("update local_workers set payroll_status='SUSPENDED' where payroll_status='ACTIVE'");
    const w = await must('/api/workers', 'POST', { employee_code: 'FLOW-' + key(), display_name: 'Nhân sự tối ưu QA', worker_type: 'HELPER' });
    const group = await must('/api/payroll/policy-groups', 'POST', { code: 'FLOW-' + key(), name: 'Nhóm tối ưu QA', reason: 'isolated QA' });
    const payload = { worker_id: w.id, compensation_type: type, payroll_policy_group_id: group.id, effective_from: start, ...(type === 'PIECE_RATE' ? {} : { primary_amount: 2600000 }), overtime_enabled: true, ...(insurance ? { insurance_enabled: true, insurance_amount: 123456.78, insurance_source_reference: 'synthetic insurance' } : {}), reason: 'isolated QA', idempotency_key: key() };
    const bundle = await must('/api/payroll/worker-profile-bundle', 'POST', payload);
    await pool.query('update local_workers set location_code=$2 where id=$1', [w.id, location]);
    await approveBundle(w, bundle);
    return { ...w, group, payload, bundle };
  }
  async function attendance(w, date) {
    const a = await must('/api/attendance', 'POST', { worker_id: w.id, attendance_method: 'DAY', work_date: date, day_units: 1, idempotency_key: key() });
    await must('/api/attendance/status', 'POST', { attendance_record_id: a.id, target_status: 'APPROVED', reason: 'isolated QA', idempotency_key: key() });
    return a;
  }
  const business = async (table, id) => (await pool.query(`select to_jsonb(t)-array['status','updated_at'] business from ${table} t where id=$1`, [id])).rows[0].business;
  async function assertSegments(table, oldId, ranges) {
    const rows = (await pool.query(`select effective_from::text f,effective_to::text t,status from ${table} where continued_from_id=$1 order by effective_from`, [oldId])).rows;
    assert.deepEqual(rows, ranges.map(([f,t]) => ({ f,t,status:'APPROVED' })), table + ' continuation intervals');
    const audits = (await pool.query("select action,actor_id,reason from local_payroll_audit_events where entity_id=$1 or entity_id in (select id from " + table + " where continued_from_id=$1)", [oldId])).rows;
    assert.equal(audits.filter(a => a.action === 'CONTINUE_RANGE').length, ranges.length);
    assert.equal(audits.filter(a => a.action === 'REPLACE_RANGE').length, 1);
    assert.ok(audits.filter(a => ['CONTINUE_RANGE','REPLACE_RANGE'].includes(a.action)).every(a => String(a.actor_id).includes(admin) && a.reason.includes('replaced_by=')), 'history replacement and real actor');
    assert.ok(audits.filter(a => a.action==='CONTINUE_RANGE').every(a=>a.reason.includes('continued_from='+oldId)), 'history source lineage');
    const clones = (await pool.query(`select (to_jsonb(t)-array['id','continued_from_id','effective_from','effective_to','created_at','updated_at','local_modified_at','idempotency_key','request_hash']) = (to_jsonb(p)-array['id','continued_from_id','effective_from','effective_to','created_at','updated_at','local_modified_at','idempotency_key','request_hash','status']) || jsonb_build_object('status','APPROVED') same_business from ${table} t join ${table} p on p.id=t.continued_from_id where p.id=$1`, [oldId])).rows;
    assert.ok(clones.every(r => r.same_business), table + ' every field including numeric money copied exactly in SQL');
  }
  async function cloneDraft(table, id, start, end, changes = {}) {
    const newid = key();
    await pool.query(`insert into ${table} select (jsonb_populate_record(null::${table},to_jsonb(t)||$2::jsonb)).* from ${table} t where id=$1`, [id, JSON.stringify({ id: newid, status:'DRAFT', continued_from_id:null, effective_from:start, effective_to:end, idempotency_key:key(), request_hash:key(), ...changes })]);
    return newid;
  }

  await check('future and bounded bundle replacements retain every component and numeric old/new payroll', async () => {
    const w = await fixture('2021-01-01', { insurance:true });
    const old = selection(w.bundle), before = Object.fromEntries(await Promise.all(Object.entries(old).map(async ([field,id]) => [field, await business(components[field][0],id)])));
    await attendance(w,'2021-02-15');
    const future = await must('/api/payroll/worker-profile-bundle', 'POST', { ...w.payload, effective_from:'2021-03-01', primary_amount:5200000, idempotency_key:key() });
    await approveBundle(w, future);
    for (const [field,id] of Object.entries(old)) { const table=components[field][0]; assert.deepEqual(await business(table,id),before[field]); await assertSegments(table,id,[['2021-01-01','2021-02-28']]); }
    await attendance(w,'2021-03-15');
    assert.equal(Number((await preview(p(2021,'02'),[w])).gross_total),100000);
    assert.equal(Number((await preview(p(2021,'03'),[w])).gross_total),200000);
    const bounded = await must('/api/payroll/worker-profile-bundle', 'POST', { ...w.payload, effective_from:'2021-04-10', effective_to:'2021-04-20', primary_amount:7800000, idempotency_key:key() });
    await approveBundle(w,bounded);
    for (const [field,id] of Object.entries(selection(future))) await assertSegments(components[field][0],id,[['2021-03-01','2021-04-09'],['2021-04-21',null]]);
    for (const day of ['09','10','20','21']) await attendance(w,'2021-04-'+day);
    assert.equal(Number((await preview(p(2021,'04'),[w])).gross_total),1000000,'two old days 200k plus two new days 300k');
  });

  await check('standalone assignment/profile/rate/insurance approvals preserve both sides with exact SQL money', async () => {
    const w = await fixture('2022-01-01',{insurance:true});
    await pool.query("update local_worker_rates set rate_amount='1234567890123456.78' where id=$1",[w.bundle.rate.id]);
    for (const [field,id] of Object.entries(selection(w.bundle))) {
      const [table,endpoint]=components[field], before=await business(table,id), draft=await cloneDraft(table,id,'2022-02-10','2022-02-20');
      await must('/api/payroll/'+endpoint+'/'+draft+'/approve','POST',{reason:'isolated standalone replacement'});
      assert.deepEqual(await business(table,id),before); await assertSegments(table,id,[['2022-01-01','2022-02-09'],['2022-02-21',null]]);
    }
    const money=(await pool.query("select distinct rate_amount::text amount from local_worker_rates where worker_id=$1 and status='APPROVED'",[w.id])).rows;
    assert.deepEqual(money,[{amount:'1234567890123456.78'}],'no JS floating point conversion of continuation money');
  });

  await check('product code approvals preserve decimal rates left/right and leave other codes alone', async () => {
    const code='FLOW-'+key();
    const old=await must('/api/payroll/product-rates','POST',{piece_rate_code:code,rate:12345.67,effective_from:'2022-03-01',reason:'isolated product'});
    await must('/api/payroll/product-rates/'+old.id+'/approve','POST',{reason:'isolated initial'});
    const untouched=await must('/api/payroll/product-rates','POST',{piece_rate_code:code+'-other',rate:19.99,effective_from:'2022-03-01',reason:'isolated unrelated'});
    await must('/api/payroll/product-rates/'+untouched.id+'/approve','POST',{reason:'isolated initial'});
    const before=await business('local_product_rates',old.id), otherBefore=await business('local_product_rates',untouched.id);
    const draft=await cloneDraft('local_product_rates',old.id,'2022-03-10','2022-03-20',{piece_rate_code:code.toLowerCase(),rate:'23456.78'});
    await must('/api/payroll/product-rates/'+draft+'/approve','POST',{reason:'isolated bounded product'});
    assert.deepEqual(await business('local_product_rates',old.id),before); await assertSegments('local_product_rates',old.id,[['2022-03-01','2022-03-09'],['2022-03-21',null]]);
    assert.deepEqual(await business('local_product_rates',untouched.id),otherBefore);
    const money=(await pool.query("select r.rate::text rate,(r.rate*3::numeric)::text three from local_product_rates r where lower(piece_rate_code)=lower($1) and status='APPROVED' order by effective_from",[code])).rows;
    assert.deepEqual(money,[{rate:'12345.67',three:'37037.01'},{rate:'23456.78',three:'70370.34'},{rate:'12345.67',three:'37037.01'}]);
  });

  await check('product-id replacement preserves history and never retires another product sharing its code',async()=>{
    const products=[];
    for(let i=0;i<2;i++) products.push((await pool.query('insert into local_products(sku,name,is_active)values($1,$2,true)returning id',['FLOW-'+key(),'Synthetic rate product'])).rows[0]);
    const code='FLOW-'+key(), rates=[];
    for(const product of products) { const r=await must('/api/payroll/product-rates','POST',{product_id:product.id,piece_rate_code:code,rate:33.33,effective_from:'2022-08-01',reason:'isolated product id'});await must('/api/payroll/product-rates/'+r.id+'/approve','POST',{reason:'isolated product id'});rates.push(r); }
    const before=await business('local_product_rates',rates[1].id),draft=await cloneDraft('local_product_rates',rates[0].id,'2022-08-10','2022-08-20',{rate:'66.66',piece_rate_code:code+'-renamed'});
    await must('/api/payroll/product-rates/'+draft+'/approve','POST',{reason:'isolated product replacement'});
    await assertSegments('local_product_rates',rates[0].id,[['2022-08-01','2022-08-09'],['2022-08-21',null]]);
    assert.deepEqual(await business('local_product_rates',rates[1].id),before);
    assert.equal((await pool.query('select status from local_product_rates where id=$1',[rates[1].id])).rows[0].status,'APPROVED');
  });

  await check('late continuation audit failure rolls back original, clones and receipt; exact retry succeeds once', async () => {
    const w=await fixture('2022-04-01',{insurance:true}), selected=selection(w.bundle);
    const next=await must('/api/payroll/worker-profile-bundle','POST',{...w.payload,effective_from:'2022-05-10',effective_to:'2022-05-20',primary_amount:5200000,idempotency_key:key()});
    const body=await approvalBody(w,selection(next)), before=Object.fromEntries(await Promise.all(Object.entries(selected).map(async([field])=>[field,(await pool.query('select * from '+components[field][0]+' where worker_id=$1 order by id',[w.id])).rows])));
    await pool.query(`create function qa_flow_fail_audit()returns trigger language plpgsql as $$begin if new.action='CONTINUE_RANGE' and new.entity_type='social_insurance_versions' then raise exception 'QA late continuation audit failure';end if;return new;end$$;create trigger qa_flow_fail_audit before insert on local_payroll_audit_events for each row execute function qa_flow_fail_audit()`);
    try { assert.ok((await call('/api/payroll/worker-profile-bundle/approve','POST',body)).status>=400); for(const [field] of Object.entries(selected)) assert.deepEqual((await pool.query('select * from '+components[field][0]+' where worker_id=$1 order by id',[w.id])).rows,before[field]); assert.equal((await pool.query('select count(*)::int n from local_payroll_bundle_approvals where idempotency_key=$1',[body.idempotency_key])).rows[0].n,0); }
    finally { await pool.query('drop trigger qa_flow_fail_audit on local_payroll_audit_events;drop function qa_flow_fail_audit()'); }
    const result=await Promise.all([must('/api/payroll/worker-profile-bundle/approve','POST',body),must('/api/payroll/worker-profile-bundle/approve','POST',body)]);
    assert.equal(result.filter(r=>r.reused).length,1);
    for (const [field,id] of Object.entries(selected)) await assertSegments(components[field][0],id,[['2022-04-01','2022-05-09'],['2022-05-21',null]]);
  });

  await check('ambiguous approved predecessor ranges reject replacement atomically', async () => {
    const w=await fixture('2022-06-01'), table='local_worker_rates';
    const duplicate=await cloneDraft(table,w.bundle.rate.id,'2022-06-01',null); await pool.query("update local_worker_rates set status='APPROVED' where id=$1",[duplicate]);
    const draft=await cloneDraft(table,w.bundle.rate.id,'2022-06-15',null), before=(await pool.query('select * from local_worker_rates where worker_id=$1 order by id',[w.id])).rows;
    assert.equal((await call('/api/payroll/rates/'+draft+'/approve','POST',{reason:'ambiguous fail closed'})).status,409);
    assert.deepEqual((await pool.query('select * from local_worker_rates where worker_id=$1 order by id',[w.id])).rows,before);
  });

  await check('predecessor left-tail ambiguity outside replacement still rejects instead of creating overlapping continuations',async()=>{
    const w=await fixture('2022-07-01'),table='local_worker_rates';
    const tail=await cloneDraft(table,w.bundle.rate.id,'2022-07-05','2022-07-08');await pool.query("update local_worker_rates set status='APPROVED' where id=$1",[tail]);
    const draft=await cloneDraft(table,w.bundle.rate.id,'2022-07-15','2022-07-20'),before=(await pool.query('select * from local_worker_rates where worker_id=$1 order by id',[w.id])).rows;
    assert.equal((await call('/api/payroll/rates/'+draft+'/approve','POST',{reason:'outside replacement tail ambiguity'})).status,409);
    assert.deepEqual((await pool.query('select * from local_worker_rates where worker_id=$1 order by id',[w.id])).rows,before);
  });

  async function pending(w,date,kind,period) {
    if(kind==='ATTENDANCE') { const a=await must('/api/attendance','POST',{worker_id:w.id,attendance_method:'DAY',work_date:date,day_units:1,idempotency_key:key()}); return {...a,table:'local_attendance',status:'workflow_status',reject:()=>must('/api/attendance/status','POST',{attendance_record_id:a.id,target_status:'REJECTED',reason:'isolated resolved',idempotency_key:key()})}; }
    if(kind==='OVERTIME') { const a=(await pool.query("insert into local_overtime(worker_id,work_date,overtime_type,overtime_minutes,reason,status,idempotency_key)values($1,$2,'NORMAL',120,'pending isolated QA','SUBMITTED',$3)returning id",[w.id,date,key()])).rows[0]; return {...a,table:'local_overtime',status:'status',reject:()=>must('/api/attendance/overtime/status','POST',{overtime_record_id:a.id,target_status:'REJECTED',reason:'isolated resolved',idempotency_key:key()})}; }
    if(kind==='PRODUCTION_ENTRY') { const a=(await pool.query("insert into local_production_entries(worker_id,piece_rate_code,piece_rate_name_snapshot,work_date,quantity,rate_amount,calculated_amount,workflow_status,idempotency_key)values($1,$2,'synthetic pending piecework',$3,3,123,369,'SUBMITTED',$4)returning id",[w.id,'FLOW-'+key(),date,key()])).rows[0]; return {...a,table:'local_production_entries',status:'workflow_status',reject:()=>must('/api/production/entries/status','POST',{production_entry_id:a.id,target_status:'REJECTED',reason:'isolated resolved',idempotency_key:key()})}; }
    const a=await must('/api/payroll/adjustments','POST',{...period,worker_id:w.id,item_type:'BONUS',item_direction:'EARNING',amount:321000,reason:'isolated pending',idempotency_key:key()});
    await must('/api/payroll/adjustments/'+a.id+'/submit','POST',{reason:'isolated pending'});
    return {...a,table:'local_payroll_adjustments',status:'status',reject:()=>must('/api/payroll/adjustments/'+a.id+'/reject','POST',{reason:'isolated resolved'})};
  }
  for(const [index,kind] of ['ATTENDANCE','PRODUCTION_ENTRY','OVERTIME','ADJUSTMENT'].entries()) await check(kind+' pending blocks selected preview, whole-period lock and inactive out-of-scope close; rejection resolves',async()=>{
    const month=String(index+1).padStart(2,'0'), period=p(2023,month), a=await fixture(period.period_start), b=await fixture(period.period_start,{location:'FLOW-B'});
    await pool.query("update local_workers set payroll_status='ACTIVE' where id=$1",[a.id]);
    const source=await pending(b,`2023-${month}-15`,kind,period);
    const selected=await preflight(period,[b]); assert.equal(selected.is_ready,false); assert.ok(selected.issues.some(i=>i.severity==='BLOCKING'&&i.source_id===source.id),'diagnose exact submitted source '+JSON.stringify(selected.issues));
    assert.equal((await call('/api/payroll/runs','POST',{...period,worker_ids:[b.id],idempotency_key:key()})).status,409);
    await pool.query("update local_workers set payroll_status='SUSPENDED',is_active=false where id=$1",[b.id]);
    const inactive=await preflight(period,[b]); assert.equal(inactive.is_ready,false); assert.ok(inactive.issues.some(i=>i.severity==='BLOCKING'&&i.source_id===source.id),'inactive pending source remains explicit');
    const scoped=await preflight(period,[a]); assert.equal(scoped.is_ready,true,'outside scope does not block scoped preview');
    assert.ok(scoped.lock_blocking_count>0&&scoped.lock_issues.some(i=>i.source_id===source.id&&i.worker_id===b.id),'preflight exposes exact period-wide close blocker');
    const run=await preview(period,[a]), before=(await pool.query('select * from local_payroll_runs where id=$1',[run.id])).rows;
    assert.equal((await call('/api/payroll/runs/'+run.id+'/lock','POST',{})).status,409,'whole-period close must include inactive submitted-only worker');
    assert.deepEqual((await pool.query('select * from local_payroll_runs where id=$1',[run.id])).rows,before);
    await source.reject(); assert.equal((await pool.query('select '+source.status+' state from '+source.table+' where id=$1',[source.id])).rows[0].state,'REJECTED');
    const ready=await preflight(period,[a]); assert.equal(ready.is_ready,true);
    const fresh=await preview(period,[a]); assert.equal((await must('/api/payroll/runs/'+fresh.id+'/lock','POST',{})).status,'LOCKED');
  });

  await check('pending submitted after preview is rechecked at lock and serializes against concurrent new source',async()=>{
    const period=p(2023,'05'),w=await fixture(period.period_start),run=await preview(period,[w]),source=await pending(w,'2023-05-15','ATTENDANCE',period);
    assert.equal((await call('/api/payroll/runs/'+run.id+'/lock','POST',{})).status,409);
    await source.reject(); const fresh=await preview(period,[w]);
    const results=await Promise.all([call('/api/payroll/runs/'+fresh.id+'/lock','POST',{}),call('/api/attendance','POST',{worker_id:w.id,attendance_method:'DAY',work_date:'2023-05-16',day_units:1,idempotency_key:key()})]);
    assert.ok(!(results[0].status<300&&results[1].status<300),'lock and newly pending source cannot both commit');
    assert.ok(results.some(r=>r.status<300),'one serialized operation succeeds '+JSON.stringify(results));
    if(results[1].status<300) { await must('/api/attendance/status','POST',{attendance_record_id:results[1].body.id,target_status:'REJECTED',reason:'resolve race fixture',idempotency_key:key()}); const next=await preview(period,[w]); await must('/api/payroll/runs/'+next.id+'/lock','POST',{}); }
  });

  await check('draft adjustments including overlapping ranges block close and remain cancellable through API',async()=>{
    const period=p(2023,'06'),w=await fixture(period.period_start),run=await preview(period,[w]),drafts=[];
    for(const bounds of [period,{period_start:'2023-06-15',period_end:'2023-07-15'}]) drafts.push(await must('/api/payroll/adjustments','POST',{...bounds,worker_id:w.id,item_type:'BONUS',item_direction:'EARNING',amount:12345,reason:'isolated draft overlap',idempotency_key:key()}));
    const blocked=await preflight(period,[w]);assert.equal(blocked.is_ready,false);
    for(const draft of drafts) assert.ok(blocked.issues.some(i=>i.source_id===draft.id&&i.severity==='BLOCKING'),'draft range intersects month and must be resolved');
    assert.equal((await call('/api/payroll/runs/'+run.id+'/lock','POST',{})).status,409);
    for(const draft of drafts) { await must('/api/payroll/adjustments/'+draft.id+'/reject','POST',{reason:'cancel unused draft'});assert.equal((await pool.query('select status from local_payroll_adjustments where id=$1',[draft.id])).rows[0].status,'REJECTED'); }
    assert.equal((await preflight(period,[w])).is_ready,true);
    const fresh=await preview(period,[w]);assert.equal((await must('/api/payroll/runs/'+fresh.id+'/lock','POST',{})).status,'LOCKED');
  });
  console.log(JSON.stringify({suite:'payroll flow optimization',passed:passed.length,failed:failures.length,failures},null,2));
  if(failures.length) throw new Error(failures.length+' payroll flow regression groups failed');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) { const child=spawn(process.execPath,['scripts/test-payroll-integrity-isolated.mjs','--optimization',...process.argv.slice(2)],{cwd:new URL('..',import.meta.url),windowsHide:true,stdio:'inherit',env:process.env});const [code]=await once(child,'exit');process.exitCode=code; }
