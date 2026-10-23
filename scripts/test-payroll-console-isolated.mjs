// Synthetic data only, inside the owned unprivileged/outbound-disabled harness.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { approveLegacyPayrollFixture } from './payroll-approved-fixtures.mjs';

export async function runPayrollConsoleTests({ pool, base, token, admin, call, must }) {
  const passed = [], failures = [], key = () => randomUUID();
  const check = async (name, action) => { try { await action(); passed.push(name); console.log('PASS ' + name); } catch (error) { failures.push({ name, error: error.stack }); console.log('FAIL ' + name + ': ' + error.message); } };
  const request = async (path, credential = token, method = 'GET', body) => {
    const r = await fetch(base + path, { method, headers: { origin: 'https://crm.example.com', ...(credential ? { authorization:'Bearer '+credential } : {}), ...(body === undefined ? {} : {'content-type':'application/json'}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status:r.status, body:await r.json().catch(()=>null) };
  };
  async function user(role, permissions = []) {
    const id=key(), email=id+'@console.invalid', password='ConsoleFixtureOnly!239', salt=randomBytes(16).toString('hex');
    await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,email,`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`]);
    await pool.query('insert into local_user_roles(user_id,role,assigned_by)values($1,$2,$3)',[id,role,admin]);
    for(const p of permissions) await pool.query('insert into local_employee_permissions(user_id,permission_type,enabled)values($1,$2,true)',[id,p]);
    return {id,token:(await must('/api/local-auth/login','POST',{email,password})).token};
  }
  const worker = async (userId=null) => (await pool.query('insert into local_workers(user_id,employee_code,display_name,location_code)values($1,$2,$3,$4)returning *',[userId,'CONSOLE-'+key(),'Synthetic "console", person','CONSOLE-A'])).rows[0];
  const scope = ids => ({worker_scope:{requested_worker_ids:ids,resolved_worker_ids:ids}});
  async function snapshot({workers, month='01', year=2019, config=scope(workers.map(w=>w.id)), version='local-payroll-v3', standard='26', status='PREVIEW', entries={}, stamp, fixtureId=key()}={}) {
    const p=(await pool.query("insert into local_payroll_periods(period_start,period_end,standard_days)values($1,$2,26)on conflict(period_start,period_end)do update set standard_days=excluded.standard_days returning id",[`${year}-${month}-01`,`${year}-${month}-${month==='02'?'28':['04','06','09','11'].includes(month)?'30':'31'}`])).rows[0];
    const r=(await pool.query('insert into local_payroll_runs(period_id,run_number,calculation_version,standard_days_snapshot,config_snapshot,input_hash,idempotency_key,status,created_at,id)values($1,(select coalesce(max(run_number),0)+1 from local_payroll_runs where period_id=$1),$2,$3,$4,$5,$6,$7,coalesce($8::timestamptz,now()),$9)returning id,run_number',[p.id,version,standard,config,key(),key(),'PREVIEW',stamp??null,fixtureId])).rows[0];
    for(const w of workers) {
      const rec=(await pool.query('insert into local_payroll_records(run_id,worker_id,employee_identity_snapshot)values($1,$2,$3)returning id',[r.id,w.id,{employee_code:w.employee_code,display_name:w.display_name,location_code:w.location_code,version:1}])).rows[0];
      for(const [type,amount,direction='EARNING'] of entries[w.id]||[]) await pool.query("insert into local_payroll_items(payroll_record_id,worker_id,item_type,item_direction,source_type,source_id,quantity,unit_rate,multiplier,amount_precise,formula,details)values($1,$2,$3,$4,'CONSOLE_FIXTURE',$5,1,$6,1,$6,'synthetic exact numeric',jsonb_build_object('work_date','2019-01-15','source_marker','console'))",[rec.id,w.id,type,direction,key(),amount]);
      await pool.query("update local_payroll_records r set gross_amount=q.gross,deductions_amount=q.deductions,net_amount=q.gross-q.deductions,payment_amount=round(q.gross-q.deductions,0),rounding_delta=round(q.gross-q.deductions,0)-(q.gross-q.deductions) from (select coalesce(sum(amount_precise)filter(where item_direction='EARNING'),0)gross,coalesce(sum(amount_precise)filter(where item_direction='DEDUCTION'),0)deductions from local_payroll_items where payroll_record_id=$1)q where r.id=$1",[rec.id]);
    }
    if(status!=='PREVIEW')await pool.query('update local_payroll_runs set status=$2 where id=$1',[r.id,status]);
    return r;
  }
  const reconciliation = r => must('/api/payroll/runs/'+r.id+'/reconciliation');
  const decimal = value => { assert.equal(typeof value,'string','money crosses API as a decimal string'); assert.match(value,/^-?\d+(?:\.\d+)?$/); return value; };
  const canonical = value => { const [whole,fraction='']=decimal(value).split('.'); return whole+(fraction.replace(/0+$/,'')?'.'+fraction.replace(/0+$/,''):''); };
  const eq = (a,b,label) => assert.equal(canonical(a),canonical(b),label);
  const allFinancialState = async () => (await pool.query("select jsonb_build_object('runs',(select jsonb_agg(to_jsonb(t)order by id)from local_payroll_runs t),'records',(select jsonb_agg(to_jsonb(t)order by id)from local_payroll_records t),'items',(select jsonb_agg(to_jsonb(t)order by id)from local_payroll_items t),'audit',(select jsonb_agg(to_jsonb(t)order by id)from local_payroll_audit_events t),'bank',(select jsonb_agg(to_jsonb(t)order by id)from local_payroll_bank_accounts t)) state")).rows[0].state;

  await check('reconciliation categories and totals preserve SQL decimal precision and snapshot identity', async()=>{
    const w=await worker(), z=await worker(), run=await snapshot({workers:[w,z],entries:{[w.id]:[['DAY_PAY','12345678901234.123456'],['HOURLY_PAY','0.000001'],['PIECE_RATE','8.765432'],['OVERTIME_PAY','2.111111'],['BONUS','3.000003'],['SOCIAL_INSURANCE','1.123456','DEDUCTION']]}});
    await pool.query('update local_workers set display_name=$2,location_code=$3 where id=$1',[w.id,'Changed master name','CONSOLE-B']);
    await pool.query("insert into local_payroll_exceptions(run_id,worker_id,severity,code,message)values($1,$2,'WARNING','CONSOLE_WARNING','Synthetic warning')",[run.id,w.id]);
    const d=await reconciliation(run), row=d.rows.find(r=>r.worker_id===w.id), zero=d.rows.find(r=>r.worker_id===z.id);assert.equal(d.freshness.status,'UNVERIFIABLE','historical snapshot missing source signature');
    assert.equal(row.worker_name,w.display_name);assert.equal(row.location_code,'CONSOLE-A');assert.equal(row.identity_source,'SNAPSHOT');
    eq(row.main_pay,'12345678901234.123457');eq(row.output_overtime,'10.876543');eq(row.other_earnings,'3.000003');eq(row.gross_amount,'12345678901248.000003');eq(row.deductions_amount,'1.123456');eq(row.net_amount,'12345678901246.876547');eq(row.payment_amount,'12345678901247');
    assert.equal(row.has_exception,true);assert.equal(zero.nonpositive,true);assert.equal(row.missing_verified_bank,true);
    const totals=(await pool.query('select count(*)::int record_count,sum(gross_amount)::text gross_total,sum(deductions_amount)::text deductions_total,sum(net_amount)::text net_total,sum(payment_amount)::text payment_total from local_payroll_records where run_id=$1',[run.id])).rows[0];
    assert.equal(d.totals.record_count,totals.record_count);for(const name of ['gross_total','deductions_total','net_total','payment_total'])eq(d.totals[name],totals[name],name);
    for(const item of d.items) for(const name of ['quantity','unit_rate','multiplier','amount_precise'])decimal(item[name]);
    assert.ok(d.items.every(i=>i.details.source_marker==='console'&&i.source_id&&i.payroll_record_id));
  });

  await check('CSV values match SQL totals after deduplicating record totals; zero-item people are exported', async()=>{
    const w=await worker(), zero=await worker(), run=await snapshot({workers:[w,zero],month:'02',entries:{[w.id]:[['DAY_PAY','12345678901234.123456'],['BONUS','3.000003'],['FINE','1.000001','DEDUCTION']]}});
    const r=await fetch(base+'/api/payroll/runs/'+run.id+'/export.csv',{headers:{origin:'https://crm.example.com',authorization:'Bearer '+token}});assert.equal(r.status,200);
    const lines=(await r.text()).replace(/^\uFEFF/,'').trim().split(/\r?\n/), parse=line=>[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m=>m[1].replace(/""/g,'"'));
    const names=parse(lines.shift()), rows=lines.map(parse).map(c=>Object.fromEntries(names.map((n,i)=>[n,c[i]]))), unique=new Map();
    for(const row of rows) { const prior=unique.get(row.employee_code);if(prior) for(const k of ['gross_amount','deductions_amount','net_amount','payment_amount'])assert.equal(row[k],prior[k]);unique.set(row.employee_code,row); }
    assert.equal(unique.size,2,'CSV must include zero-item records even when another worker has items');
    const expected=(await pool.query("select employee_identity_snapshot->>'employee_code' employee_code,gross_amount::text,deductions_amount::text,net_amount::text,payment_amount::text from local_payroll_records where run_id=$1",[run.id])).rows;
    for(const record of expected)for(const k of ['gross_amount','deductions_amount','net_amount','payment_amount'])eq(unique.get(record.employee_code)[k],record[k],k);
    assert.ok(rows.some(row=>canonical(row.amount_precise||'0')==='12345678901234.123456'),'item exact precision');
  });

  await check('compatible baseline gives exact deltas and changed/added/removed/unchanged flags',async()=>{
    const a=await worker(),b=await worker(),c=await worker(),z=await worker(),all=[a,b,c,z],config=scope(all.map(w=>w.id));
    const first=await snapshot({workers:[a,b,z],month:'03',config,entries:{[a.id]:[['DAY_PAY','100.1']],[b.id]:[['DAY_PAY','20']],[z.id]:[['DAY_PAY','0']]},stamp:'2019-03-01T00:00:00Z'});
    const second=await snapshot({workers:[a,c,z],month:'03',config:{worker_scope:{requested_worker_ids:[...all].reverse().map(w=>w.id),resolved_worker_ids:all.map(w=>w.id)}},entries:{[a.id]:[['DAY_PAY','101.1']],[c.id]:[['BONUS','12']],[z.id]:[['DAY_PAY','0']]},stamp:'2019-03-02T00:00:00Z'});
    const d=await reconciliation(second);assert.equal(d.comparison.previous_run_id,first.id);assert.equal(d.comparison.comparable,true);
    for(const [w,flag,delta]of [[a,'CHANGED','1'],[b,'REMOVED','-20'],[c,'ADDED','12'],[z,'UNCHANGED','0']]){const row=d.rows.find(r=>r.worker_id===w.id);assert.equal(row.change_status,flag);eq(row.payment_delta,delta);}
  });

  await check('comparison ignores scope/version/standard-day mismatches and never borrows missing metadata',async()=>{
    const a=await worker(),b=await worker(),workers=[a],stamp=n=>`2019-04-${String(n).padStart(2,'0')}T00:00:00Z`;
    await snapshot({workers,month:'04',config:scope([a.id]),stamp:stamp(1)});
    for(const [n,options]of [[2,{config:scope([b.id])}],[3,{version:'incompatible-engine'}],[4,{standard:'25'}],[5,{config:{}}],[6,{config:{worker_scope:{requested_worker_ids:null,resolved_worker_ids:'bad'}}}]]){
      const run=await snapshot({workers,month:'04',...options,stamp:stamp(n)}),d=await reconciliation(run);assert.equal(d.comparison.comparable,false);assert.equal(d.comparison.previous_run_id,null);assert.ok(d.rows.every(r=>r.payment_delta===null&&r.change_status==='INCOMPARABLE'));assert.equal(d.comparison.reason,[5,6].includes(n)?'MISSING_SCOPE_METADATA':'NO_COMPATIBLE_PREVIOUS_RUN');
    }
    const later=await snapshot({workers,month:'04',stamp:stamp(7)});assert.equal((await reconciliation(later)).comparison.comparable,true,'skip intervening incompatible previews');
  });

  await check('comparison follows run sequence when timestamps tie and UUID order is reversed',async()=>{
    const w=await worker(),stamp='2019-07-01T00:00:00Z';
    const first=await snapshot({workers:[w],month:'07',stamp,fixtureId:'ffffffff-ffff-4fff-8fff-ffffffffffff',entries:{[w.id]:[['DAY_PAY','10']]}});
    const second=await snapshot({workers:[w],month:'07',stamp,fixtureId:'00000000-0000-4000-8000-000000000001',entries:{[w.id]:[['DAY_PAY','20']]}});
    const d=await reconciliation(second);assert.equal(d.comparison.previous_run_id,first.id);eq(d.rows[0].payment_delta,'10');
    const earlier=await reconciliation(first);assert.equal(earlier.comparison.comparable,false,'later preview is never a baseline of an earlier one');
  });

  await check('locked reconciliation remains immutable after later previews and all reads have no financial/audit side effects',async()=>{
    const w=await worker(),locked=await snapshot({workers:[w],month:'05',entries:{[w.id]:[['DAY_PAY','99.123456']]},status:'LOCKED',stamp:'2019-05-01T00:00:00Z'}),before=await reconciliation(locked);
    await snapshot({workers:[w],month:'05',entries:{[w.id]:[['DAY_PAY','123.654321']]},stamp:'2019-05-02T00:00:00Z'});
    const state=await allFinancialState();assert.equal(before.freshness.status,'NOT_APPLICABLE');assert.deepEqual(before.scope_guard,{status:'NOT_APPLICABLE',omitted_worker_count:0,omitted_workers:[]});assert.deepEqual(await reconciliation(locked),before);await reconciliation(locked);assert.deepEqual(await allFinancialState(),state);
    assert.equal((await request('/api/payroll/runs/'+key()+'/reconciliation')).status,404);
  });

  await check('reconciliation authorization denies anonymous, employee/team and honors accountant grant revocation',async()=>{
    const w=await worker(),run=await snapshot({workers:[w],month:'06'}), employee=await user('employee',['payroll_view']),leader=await user('team_leader',['payroll_view','payroll_team_view']),accountant=await user('accountant');
    const path='/api/payroll/runs/'+run.id+'/reconciliation';assert.equal((await request(path,null)).status,401);
    for(const u of [employee,leader])assert.equal((await request(path,u.token)).status,403);
    assert.equal((await request(path,accountant.token)).status,200);
    await pool.query("update local_user_roles set role='employee' where user_id=$1 and is_active",[accountant.id]);assert.equal((await request(path,accountant.token)).status,403,'existing session role revocation');
  });

  await check('real successive previews compare SUPERSEDED baseline; pending outside scope and source changes still block lock',async()=>{
    await pool.query("update local_workers set payroll_status='SUSPENDED' where payroll_status='ACTIVE'");
    const w=await must('/api/workers','POST',{employee_code:'CONSOLE-ENGINE-'+key(),display_name:'Synthetic console engine',worker_type:'HELPER'}),group=await must('/api/payroll/policy-groups','POST',{code:'CONSOLE-'+key(),name:'Synthetic console engine',reason:'isolated QA'});
    const bundle=await must('/api/payroll/worker-profile-bundle','POST',{worker_id:w.id,compensation_type:'MONTHLY_HELPER',payroll_policy_group_id:group.id,effective_from:'2018-01-01',primary_amount:2600000,reason:'isolated QA',idempotency_key:key()});
    for(const [endpoint,row] of [['compensation-assignments',bundle.assignment],['rates',bundle.rate],['worker-profiles',bundle.profile]])if(row)await must('/api/payroll/'+endpoint+'/'+row.id+'/approve','POST',{reason:'isolated QA'});
    const bounds={period_start:'2018-01-01',period_end:'2018-01-31',standard_days:26};await approveLegacyPayrollFixture(pool,bounds.period_start,bounds.period_end,26);
    const preview=()=>must('/api/payroll/runs','POST',{...bounds,worker_ids:[w.id],idempotency_key:key()});
    const first=await preview();assert.equal((await reconciliation(first)).freshness.status,'CURRENT');
    const a=await must('/api/attendance','POST',{worker_id:w.id,attendance_method:'DAY',work_date:'2018-01-15',day_units:1,idempotency_key:key()});
    await must('/api/attendance/status','POST',{attendance_record_id:a.id,target_status:'APPROVED',reason:'isolated QA',idempotency_key:key()});
    const stillReady=await must('/api/payroll/preflight?period_start=2018-01-01&period_end=2018-01-31&standard_days=26&worker_ids='+w.id);assert.equal(stillReady.is_ready,true,'valid additional approved source need not create a blocker');assert.equal((await reconciliation(first)).freshness.status,'STALE','read-side freshness catches valid changed money before lock');
    assert.equal((await call('/api/payroll/runs/'+first.id+'/lock','POST',{})).status,409);
    const second=await preview(),d=await reconciliation(second);assert.equal(d.freshness.status,'CURRENT');assert.equal((await pool.query('select status from local_payroll_runs where id=$1',[first.id])).rows[0].status,'SUPERSEDED');assert.equal((await reconciliation(first)).freshness.status,'NOT_APPLICABLE');assert.equal(d.comparison.previous_run_id,first.id);eq(d.rows.find(r=>r.worker_id===w.id).payment_delta,'100000');
    const outsider=await worker();await pool.query("update local_workers set payroll_status='SUSPENDED',is_active=false where id=$1",[outsider.id]);
    const pending=(await pool.query("insert into local_attendance(worker_id,attendance_method,work_date,day_units,workflow_status,idempotency_key)values($1,'DAY','2018-01-16',1,'SUBMITTED',$2)returning id",[outsider.id,key()])).rows[0];
    const pre=await must('/api/payroll/preflight?period_start=2018-01-01&period_end=2018-01-31&standard_days=26&worker_ids='+w.id);assert.equal(pre.is_ready,true);assert.ok(pre.lock_issues.some(i=>i.source_id===pending.id&&i.worker_id===outsider.id));
    assert.equal((await call('/api/payroll/runs/'+second.id+'/lock','POST',{})).status,409);
    await must('/api/attendance/status','POST',{attendance_record_id:pending.id,target_status:'REJECTED',reason:'resolve synthetic outside blocker',idempotency_key:key()});
    const final=await preview();assert.equal((await must('/api/payroll/runs/'+final.id+'/lock','POST',{})).status,'LOCKED');
    const immutable=await reconciliation(final);await pool.query('update local_workers set display_name=$2 where id=$1',[w.id,'Changed after close']);assert.deepEqual(await reconciliation(final),immutable,'locked identity and snapshot remain stable');
  });

  await check('bank proposal exposes only approved matching profile banking fields and creates no account automatically',async()=>{
    const accountant=await user('accountant'),employee=await user('employee',['payroll_view']),manager=await user('manager'),w=await worker(employee.id),other=await worker(),approved={bank_account_number:'111122223333',bank_account_name:'Synthetic approved name',bank_name:'Synthetic bank',bank_code:'SYN',tax_code:'NEVER_RETURN_TAX',identity_number:'NEVER_RETURN_ID'},draft={...approved,bank_account_number:'999900001111'};
    await pool.query("insert into local_employee_profile_forms(user_id,status,profile_data,approved_data,revision,approved_revision)values($1,'APPROVED',$2,$3,1,1)",[employee.id,draft,approved]);
    const path='/api/payroll/bank-accounts/proposal?workerId='+w.id,before=await allFinancialState();
    for(const u of [employee,manager])assert.equal((await request(path,u.token)).status,403,'bank manage required even self');
    const result=await request(path,accountant.token);assert.equal(result.status,200);assert.deepEqual(Object.keys(result.body).sort(),['form_id','approved_revision','reviewed_at','account_number','account_name','bank_name','bank_code'].sort());assert.equal(result.body.approved_revision,'1');assert.match(result.body.form_id,/^[0-9a-f-]{36}$/i);assert.equal(result.body.account_number,approved.bank_account_number);assert.equal(result.body.account_name,approved.bank_account_name);assert.equal(result.body.bank_name,approved.bank_name);assert.equal(result.body.bank_code,approved.bank_code);assert.deepEqual(await allFinancialState(),before,'read only proposal');
    assert.equal((await request('/api/payroll/bank-accounts/proposal?workerId='+other.id,accountant.token)).body,null,'no cross worker proposal');
    for(const state of ['DRAFT','SUBMITTED','NEEDS_INFO']){await pool.query('update local_employee_profile_forms set status=$2 where user_id=$1',[employee.id,state]);assert.equal((await request(path,accountant.token)).body,null,state);}
    await pool.query("update local_employee_profile_forms set status='APPROVED',approved_revision=0 where user_id=$1",[employee.id]);assert.equal((await request(path,accountant.token)).body,null,'unapproved revision is never proposed');
    await pool.query('update local_employee_profile_forms set approved_revision=1,revision=2 where user_id=$1',[employee.id]);assert.equal((await request(path,accountant.token)).body,null,'unreviewed edit revision is never proposed');
    await pool.query('update local_employee_profile_forms set revision=1 where user_id=$1',[employee.id]);await pool.query('update local_user_profiles set is_active=false where user_id=$1',[employee.id]);assert.equal((await request(path,accountant.token)).body,null,'inactive profile hidden');await pool.query('update local_user_profiles set is_active=true where user_id=$1',[employee.id]);
    assert.ok((await request('/api/payroll/bank-accounts/proposal',accountant.token)).status>=400);assert.ok((await request('/api/payroll/bank-accounts/proposal?workerId=not-a-worker',accountant.token)).status>=400);
    const created=await request('/api/payroll/bank-accounts',accountant.token,'POST',{worker_id:w.id,account_number:approved.bank_account_number,account_name:approved.bank_account_name,bank_name:approved.bank_name,bank_code:approved.bank_code,effective_from:'2026-01-01',reason:'Synthetic proposal manually accepted'});assert.equal(created.status,201);assert.equal(created.body.status,'DRAFT');assert.equal((await pool.query('select verified_at,verified_by from local_payroll_bank_accounts where id=$1',[created.body.id])).rows[0].verified_at,null);
    await pool.query("update local_user_roles set role='employee' where user_id=$1 and is_active",[accountant.id]);assert.equal((await request(path,accountant.token)).status,403,'bank role revoked in existing session');
  });

  await check('decimal display and scope helpers retain small fractions, signs and canonical scope without floating point',async()=>{
    const source=`import assert from 'node:assert/strict';import {formatPayrollDecimal,canonicalPayrollScope} from './src/lib/payroll-reconciliation.ts';
      assert.equal(formatPayrollDecimal('12345678901234.123456'),'12.345.678.901.234,123456');
      assert.equal(formatPayrollDecimal('-0.000001'),'-0,000001');assert.equal(formatPayrollDecimal('1234.500000'),'1.234,5');
      assert.equal(formatPayrollDecimal('0.000000'),'0');for(const value of [null,undefined,'','1e12','NaN'])assert.equal(formatPayrollDecimal(value),'—');
      const a='FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF',b='00000000-0000-4000-8000-000000000001';
      assert.deepEqual(canonicalPayrollScope({worker_scope:{requested_worker_ids:[a,b,a],resolved_worker_ids:[b,a]}}),{requested:[b,a.toLowerCase()],resolved:[b,a.toLowerCase()]});
      assert.deepEqual(canonicalPayrollScope({worker_scope:{requested_worker_ids:null,resolved_worker_ids:[]}}),{requested:null,resolved:[]});
      for(const config of [{},null,{worker_scope:{}},{worker_scope:{requested_worker_ids:null,resolved_worker_ids:['invalid']}}])assert.equal(canonicalPayrollScope(config),null);`;
    const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',source],{cwd:new URL('..',import.meta.url),windowsHide:true,stdio:'inherit',env:process.env});const[code]=await once(child,'exit');assert.equal(code,0);
  });

  await check('work queue deduplicates mirrored blockers and keeps distinct source dates/IDs with safe return links',async()=>{
    const source=`import assert from 'node:assert/strict';import {mergePayrollIssues,payrollIssueLink,payrollSourceDate,payrollIssueTarget} from './src/lib/payroll-reconciliation.ts';
      const issue={code:'PENDING',worker_id:'worker-a',source_type:'ATTENDANCE',source_id:'record-a',source_date:'2026-10-15',resolution_target:'SOURCE'};
      const second={...issue,source_id:'record-b'},third={...issue,source_date:'2026-10-16'},otherLocation={...issue,location_code:'B'};
      const merged=mergePayrollIssues([issue,second,third,otherLocation],[{...issue,message:'period-wide wording'},second]);assert.equal(merged.length,4);
      assert.ok(merged.some(i=>i.source_id==='record-b'));assert.ok(merged.some(i=>i.source_date==='2026-10-16'));assert.ok(merged.some(i=>i.location_code==='B'));
      assert.equal(payrollSourceDate('2026-10-15T08:00:00Z','2026-10'),'2026-10-15');for(const date of ['2026-09-30','2026-10-32','not-date',null])assert.equal(payrollSourceDate(date,'2026-10'),undefined);
      assert.equal(payrollSourceDate('2026-02-29','2026-02'),undefined);assert.equal(payrollSourceDate('2024-02-29','2024-02'),'2024-02-29');
      const context=new URLSearchParams({month:'2026-10',location:'Factory A',worker:'worker-a'}),link=new URL(payrollIssueLink(issue,context),'http://fixture.invalid');
      assert.equal(link.pathname,'/production-attendance');assert.equal(link.searchParams.get('month'),'2026-10');assert.equal(link.searchParams.get('location'),'Factory A');assert.equal(link.searchParams.get('worker'),'worker-a');assert.equal(link.searchParams.get('date'),'2026-10-15');
      const back=new URL(link.searchParams.get('returnTo'),'http://fixture.invalid');assert.equal(back.pathname,'/payroll-settings');assert.equal(back.searchParams.get('tab'),'runs');assert.equal(back.searchParams.get('month'),'2026-10');assert.equal(back.searchParams.get('location'),'Factory A');
      assert.equal(new URL(payrollIssueLink({...issue,location_code:null,source_date:'2026-09-30'},context),'http://fixture.invalid').searchParams.get('location'),'__UNASSIGNED__');
      assert.equal(new URL(payrollIssueLink({...issue,source_date:'2026-10-99'},context),'http://fixture.invalid').searchParams.get('date'),null);
      for(const [target,tab]of [['WORKER','workers'],['POLICY','policies'],['ADJUSTMENT','adjustments'],['REVIEW','runs']]){const u=new URL(payrollIssueLink({...issue,resolution_target:target},context),'http://fixture.invalid');assert.equal(u.pathname,'/payroll-settings');assert.equal(u.searchParams.get('tab'),tab);assert.equal(u.searchParams.get('month'),'2026-10');}
      assert.equal(new URL(payrollIssueLink({...issue,resolution_target:'POLICY',code:'PAYROLL_CALENDAR'},context),'http://fixture.invalid').searchParams.get('editor'),'calendar');
      const missingProfile={code:'MISSING_PAYROLL_PROFILE',worker_id:'worker-a'},profileLink=new URL(payrollIssueLink(missingProfile,context),'http://fixture.invalid');assert.equal(profileLink.searchParams.get('tab'),'workers');assert.equal(profileLink.searchParams.get('worker'),'worker-a');
      const calendarLink=new URL(payrollIssueLink({code:'PAYROLL_CALENDAR'},context),'http://fixture.invalid');assert.equal(calendarLink.searchParams.get('tab'),'policies');assert.equal(calendarLink.searchParams.get('editor'),'calendar');
      for(const code of ['UNAPPROVED_ATTENDANCE','UNAPPROVED_PRODUCTION','UNAPPROVED_OVERTIME','LEGACY_OUTPUT_ATTENDANCE_SOURCE','INVALID_ATTENDANCE_SNAPSHOT','MISSING_PRODUCTION_RATE_SNAPSHOT']){const u=new URL(payrollIssueLink({code,source_date:'2026-10-15',worker_id:'worker-a'},context),'http://fixture.invalid');assert.equal(u.pathname,'/production-attendance',code);assert.equal(u.searchParams.get('date'),'2026-10-15');assert.equal(payrollIssueTarget({code}),'SOURCE');}
      assert.equal(payrollIssueTarget({code:'UNAPPROVED_ADJUSTMENT'}),'ADJUSTMENT');assert.equal(payrollIssueTarget({code:'UNKNOWN_BLOCKER'}),'REVIEW');
      for(const code of ['MISSING_PAYROLL_PROFILE','PAYROLL_CALENDAR','UNAPPROVED_ATTENDANCE']){assert.equal(payrollIssueTarget({code,resolution_target:'ADJUSTMENT'}),'ADJUSTMENT','explicit server destination wins');assert.equal(new URL(payrollIssueLink({code,resolution_target:'ADJUSTMENT'},context),'http://fixture.invalid').searchParams.get('tab'),'adjustments');}`;
    const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',source],{cwd:new URL('..',import.meta.url),windowsHide:true,stdio:'inherit',env:process.env});const[code]=await once(child,'exit');assert.equal(code,0);
  });

  await check('roster summaries and worker-filtered lists preserve scope and reveal no extra money or bank fields',async()=>{
    const employee=await user('employee',['payroll_view']),leader=await user('team_leader',['payroll_view','payroll_team_view','payroll_worker_manage']),a=await worker(employee.id),b=await worker(),supervisor=await worker(leader.id);
    await pool.query("insert into local_payroll_team_assignments(supervisor_worker_id,worker_id,effective_from,reason,status)values($1,$2,'2000-01-01','Synthetic scope','ACTIVE')",[supervisor.id,a.id]);
    const group=await must('/api/payroll/policy-groups','POST',{code:'CONSOLE-'+key(),name:'Synthetic console roster',reason:'isolated QA'}),bundles=[];
    for(const w of [a,b]){
      bundles.push(await must('/api/payroll/worker-profile-bundle','POST',{worker_id:w.id,compensation_type:'HOURLY',payroll_policy_group_id:group.id,effective_from:'2000-01-01',primary_amount:12345,insurance_enabled:true,insurance_amount:321,insurance_source_reference:'Synthetic private source',reason:'isolated roster',idempotency_key:key()}));
      await must('/api/payroll/bank-accounts','POST',{worker_id:w.id,account_number:'111122223333',account_name:'Synthetic private account',bank_name:'Synthetic bank',effective_from:'2000-01-01',reason:'isolated roster'});
      await must('/api/payroll/adjustments','POST',{worker_id:w.id,period_start:'2017-01-01',period_end:'2017-01-31',item_type:'BONUS',item_direction:'EARNING',amount:10,reason:'isolated roster',idempotency_key:key()});
    }
    const before=await must('/api/payroll/workers?includeInactive=true'),row=before.find(w=>w.id===a.id);assert.equal(row.payroll_draft_count,2,'only assignment and profile drafts counted');assert.equal(row.has_current_payroll_profile,false);assert.equal(row.current_effective_from,null);
    for(const w of before)for(const forbidden of ['rate_amount','primary_amount','employee_amount','account_number','bank_account_number','insurance_draft_count','rate_draft_count','bank_draft_count'])assert.equal(w[forbidden],undefined,forbidden);
    for(const [endpoint,part]of [['compensation-assignments','assignment'],['worker-profiles','profile'],['rates','rate']])await must('/api/payroll/'+endpoint+'/'+bundles[0][part].id+'/approve','POST',{reason:'isolated roster approval'});
    const approved=(await must('/api/payroll/workers?includeInactive=true')).find(w=>w.id===a.id);assert.equal(approved.payroll_draft_count,0);assert.equal(approved.has_current_payroll_profile,true);assert.equal(approved.current_effective_from,'2000-01-01');
    for(const endpoint of ['compensation-assignments','worker-profiles','rates','insurance','bank-accounts','adjustments','team-assignments']){const rows=await must('/api/payroll/'+endpoint+'?workerId='+a.id);assert.ok(rows.length>0,endpoint+' fixture');assert.ok(rows.every(r=>r.worker_id===a.id),endpoint+' filter cannot include another worker');}
    const own=await request('/api/payroll/workers?includeInactive=true',employee.token);assert.equal(own.status,200);assert.deepEqual(own.body.map(w=>w.id),[a.id]);
    const team=await request('/api/payroll/workers?includeInactive=true',leader.token);assert.equal(team.status,200);assert.deepEqual(team.body.map(w=>w.id).sort(),[a.id,supervisor.id].sort());
    for(const endpoint of ['compensation-assignments','worker-profiles','insurance','bank-accounts','adjustments','team-assignments'])assert.equal((await request('/api/payroll/'+endpoint+'?workerId='+b.id,employee.token)).status,403,endpoint+' outside scope');
    await pool.query("update local_employee_permissions set enabled=false where user_id=$1 and permission_type='payroll_view'",[employee.id]);assert.equal((await request('/api/payroll/workers',employee.token)).status,403,'delegated view revocation effective on same session');
  });

  await check('filtered preview exposes approved unpaid eligible workers outside scope before lock; all-worker preview resolves it',async()=>{
    await pool.query("update local_workers set payroll_status='SUSPENDED' where payroll_status='ACTIVE'");
    const workers=[],group=await must('/api/payroll/policy-groups','POST',{code:'CONSOLE-'+key(),name:'Synthetic omission scope',reason:'isolated QA'});
    for(const name of ['A','B']){
      const w=await must('/api/workers','POST',{employee_code:'CONSOLE-SCOPE-'+name+'-'+key(),display_name:'Synthetic omitted person '+name,worker_type:'HELPER'});workers.push(w);
      const bundle=await must('/api/payroll/worker-profile-bundle','POST',{worker_id:w.id,compensation_type:'MONTHLY_HELPER',payroll_policy_group_id:group.id,effective_from:'2016-01-01',primary_amount:2600000,reason:'isolated QA',idempotency_key:key()});
      for(const [endpoint,row]of [['compensation-assignments',bundle.assignment],['rates',bundle.rate],['worker-profiles',bundle.profile]])if(row)await must('/api/payroll/'+endpoint+'/'+row.id+'/approve','POST',{reason:'isolated QA'});
    }
    const[a,b]=workers,bounds={period_start:'2016-01-01',period_end:'2016-01-31',standard_days:26};await approveLegacyPayrollFixture(pool,bounds.period_start,bounds.period_end,26);
    const source=await must('/api/attendance','POST',{worker_id:b.id,attendance_method:'DAY',work_date:'2016-01-15',day_units:1,idempotency_key:key()});await must('/api/attendance/status','POST',{attendance_record_id:source.id,target_status:'APPROVED',reason:'isolated QA',idempotency_key:key()});
    await pool.query("update local_workers set is_active=false,payroll_status='SUSPENDED',employment_end_date='2016-01-31' where id=$1",[b.id]);
    const pre=await must('/api/payroll/preflight?period_start=2016-01-01&period_end=2016-01-31&standard_days=26&worker_ids='+a.id);assert.equal(pre.is_ready,true);assert.equal(pre.lock_issues.length,0,'approved source is not a pending-source blocker');
    const filtered=await must('/api/payroll/runs','POST',{...bounds,worker_ids:[a.id],idempotency_key:key()}),d=await reconciliation(filtered);assert.equal(d.freshness.status,'CURRENT');assert.equal(d.scope_guard.status,'CHECKED');assert.equal(d.scope_guard.omitted_worker_count,1);assert.deepEqual(d.scope_guard.omitted_workers.map(w=>w.id),[b.id]);assert.equal(d.scope_guard.omitted_workers[0].employee_code,b.employee_code);assert.equal((await call('/api/payroll/runs/'+filtered.id+'/lock','POST',{})).status,409);
    const full=await must('/api/payroll/runs','POST',{...bounds,idempotency_key:key()}),all=await reconciliation(full);assert.equal(all.scope_guard.status,'CHECKED');assert.equal(all.scope_guard.omitted_worker_count,0);assert.deepEqual(all.scope_guard.omitted_workers,[]);assert.equal(all.freshness.status,'CURRENT');assert.deepEqual(all.rows.filter(r=>r.record_id).map(r=>r.worker_id).sort(),[a.id,b.id].sort());
    await must('/api/payroll/runs/'+full.id+'/lock','POST',{});const locked=await reconciliation(full);assert.deepEqual(locked.scope_guard,{status:'NOT_APPLICABLE',omitted_worker_count:0,omitted_workers:[]});await worker();assert.deepEqual(await reconciliation(full),locked,'locked guard never becomes a live omission projection');
  });
  console.log(JSON.stringify({suite:'payroll console',passed:passed.length,failed:failures.length,failures},null,2));
  if(failures.length)throw new Error(failures.length+' payroll console regression groups failed');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const child=spawn(process.execPath,['scripts/test-payroll-integrity-isolated.mjs','--console',...process.argv.slice(2)],{cwd:new URL('..',import.meta.url),windowsHide:true,stdio:'inherit',env:process.env});const[code]=await once(child,'exit');process.exitCode=code;}
