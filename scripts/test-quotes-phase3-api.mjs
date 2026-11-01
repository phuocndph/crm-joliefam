// Real local API, sanitized OS-only child environment, disposable DB at 127.0.0.1:16543.
// Reuses strict harness outbound HTTP/socket denial; no .env or operational data.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const parentUrl=new URL('./test-sales-quote-fixes-isolated.mjs',import.meta.url);
let source=await readFile(parentUrl,'utf8');
const marker="  console.log('SALES QUOTE FIXES: strict assertions passed; no operational records touched.');";
const extra=String.raw`
  const phase3Rows=[];
  const insertPhase3=async(id,status,created,assignee=null,owner=manager,number='PHASE3-ORDER-'+id)=>{
    const price=1000+phase3Rows.length,items=[{name:'test phase3 line',quantity:1,price,total:price}];
    const data={customerName:'test phase3 saved '+id,customerPhone:'0900-'+id,customerEmail:id+'@fixture.invalid',customerAddress:'Địa chỉ snapshot '+id,items,subtotal:price,vatAmount:0,includeVAT:false,vatRate:0,total:price,totalAmount:price,payment1:0,payment2:0,remaining:price};
    const notes='Khách hàng: '+data.customerName+'\nĐiện thoại: '+data.customerPhone+'\nEmail: '+data.customerEmail+'\nĐịa chỉ: '+data.customerAddress;
    const row=(await pool.query('insert into local_quotes(id,quote_number,manager_id,assignee_id,status,created_at,updated_at,subtotal,vat_rate,vat_amount,include_vat,total_amount,items,quote_data,notes)values($1,$2,$3,$4,$5,$6,$6,$7,0,0,false,$7,$8::jsonb,$9::jsonb,$10)returning *',[id,number,owner,assignee,status,created,price,JSON.stringify(items),JSON.stringify(data),notes])).rows[0];phase3Rows.push(row);return row;
  };
  const phase3Query=(path,query)=>call(path+'?'+new URLSearchParams(query));
  await check('phase3: stable newest ordering precedes pagination with ties, old drafts and null dates',async()=>{
    for(let index=1;index<=70;index++)await insertPhase3('phase3-row-'+String(index).padStart(3,'0'),['draft','sent','approved','rejected','expired'][index%5],'2026-10-20T05:00:00Z',index%3===0?null:'phase3-assignee-'+index%2);
    await insertPhase3('phase3-row-old','draft','2020-01-01T00:00:00Z');await insertPhase3('phase3-row-null','draft',null);
    await insertPhase3('phase3-row-foreign','approved','2027-01-01T00:00:00Z',null,otherManager);
    const query={search:'phase3-order',limit:'50',offset:'0'},first=ok(await phase3Query('/api/quotes',query)),second=ok(await phase3Query('/api/quotes',{...query,offset:'50'}));
    const expected=phase3Rows.filter(row=>row.manager_id===manager).sort((a,b)=>(b.created_at?b.created_at.getTime():-Infinity)-(a.created_at?a.created_at.getTime():-Infinity)||b.id.localeCompare(a.id)).map(row=>row.id);
    assert.equal(first.length,50);assert.deepEqual([...first,...second].map(row=>row.id),expected);assert.equal(new Set([...first,...second].map(row=>row.id)).size,72);assert.equal(second.at(-2).id,'phase3-row-old');assert.equal(second.at(-1).id,'phase3-row-null');assert.ok(first.some(row=>row.status==='approved'),'old draft is not promoted');
    assert.deepEqual(ok(await phase3Query('/api/quotes',query)).map(row=>row.id),first.map(row=>row.id),'same tied page order is stable');
  });
  await check('phase3: list/stats share combined status/assignee/search/date membership and approved-only value',async()=>{
    for(const extra of [{},{status:'sent'},{status:'draft'},{assigneeId:'__unassigned__'},{assigneeId:'phase3-assignee-1'},{status:'approved',assigneeId:'phase3-assignee-0',dateFrom:'2026-10-20',dateTo:'2026-10-20'}]){
      const query={search:'  PHASE3-ORDER  ',limit:'5000',...extra};
      const rows=ok(await phase3Query('/api/quotes',query)),stats=ok(await phase3Query('/api/quotes/stats',query));
      assert.equal(stats.total,rows.length);assert.equal(stats.approved_count,rows.filter(row=>row.status==='approved').length);assert.equal(Number(stats.approved_value),rows.filter(row=>row.status==='approved').reduce((sum,row)=>sum+row.total_amount,0));assert.ok(rows.every(row=>row.manager_id===manager));
      if(extra.status)assert.ok(rows.every(row=>row.status===extra.status));if(extra.assigneeId)assert.ok(rows.every(row=>extra.assigneeId==='__unassigned__'?row.assignee_id==null:row.assignee_id===extra.assigneeId));
    }
    for(const search of ['phase3-row-037@fixture.invalid','0900-phase3-row-037',' Địa chỉ snapshot phase3-row-037 ']){const rows=ok(await phase3Query('/api/quotes',{search}));assert.deepEqual(rows.map(row=>row.id),['phase3-row-037']);assert.equal(ok(await phase3Query('/api/quotes/stats',{search})).total,1);}
    const q=await insertPhase3('phase3-literal-%_test','draft','2026-10-20T05:00:00Z',null,manager,'PHASE3-LITERAL-%_test');assert.deepEqual(ok(await phase3Query('/api/quotes',{search:'%_test'})).map(row=>row.id),[q.id],'wildcards are literal search text');
  });
  await check('phase3: inclusive Vietnam calendar date boundaries are identical on list/stats; invalid filters reject 400',async()=>{
    for(const [suffix,time]of [['before','2026-10-19T16:59:59.999Z'],['start','2026-10-19T17:00:00Z'],['last','2026-10-20T16:59:59.999Z'],['after','2026-10-20T17:00:00Z']])await insertPhase3('phase3-boundary-'+suffix,'approved',time,null,manager,'PHASE3-BOUNDARY-'+suffix);
    const query={search:'phase3-boundary',dateFrom:'2026-10-20',dateTo:'2026-10-20'},rows=ok(await phase3Query('/api/quotes',query));assert.deepEqual(rows.map(row=>row.id),['phase3-boundary-last','phase3-boundary-start']);assert.equal(ok(await phase3Query('/api/quotes/stats',query)).total,2);
    for(const filter of [{dateFrom:'2026-02-30'},{dateTo:'2026-13-01'},{dateFrom:'20/10/2026'},{dateFrom:'2026-10-21',dateTo:'2026-10-20'},{status:'not-a-status'}])for(const path of ['/api/quotes','/api/quotes/stats'])assert.equal((await phase3Query(path,filter)).status,400,JSON.stringify({path,filter}));
    for(const filter of [{limit:'abc'},{offset:'NaN'},{offset:'1.5'}])assert.equal((await phase3Query('/api/quotes',filter)).status,400);
  });
  await check('phase3: filtered list/stats remain scoped for employees, managers and admin with matching totals',async()=>{
    const password='Phase3FixtureOnly!222',salt=randomBytes(16).toString('hex'),hash='scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex'),employee=randomUUID(),admin=randomUUID(),originalToken=token;
    for(const [id,roleName]of [[employee,'employee'],[admin,'admin']]){await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[id,id+'@fixture.invalid',hash]);await pool.query('insert into local_user_roles(user_id,role,assigned_by)values($1,$2,$3)',[id,roleName,roleName==='employee'?manager:null]);}
    await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'quotes',true)",[employee]);
    token=ok(await call('/api/local-auth/login','POST',{email:employee+'@fixture.invalid',password})).token;
    for(const path of ['/api/quotes','/api/quotes/stats'])assert.equal((await phase3Query(path,{search:'phase3-order',managerId:otherManager,status:'approved'})).status,403);
    const own=ok(await phase3Query('/api/quotes',{search:'phase3-order',status:'sent',limit:'5000'}));assert.ok(own.every(row=>row.manager_id===manager));assert.equal(ok(await phase3Query('/api/quotes/stats',{search:'phase3-order',status:'sent'})).total,own.length);
    const sent=own[0];assert.equal((await call('/api/quotes/'+sent.id+'/approve','POST',{})).status,403,'sent action still requires approval permission');
    await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'quote_approval',true)",[employee]);
    const approved=ok(await call('/api/quotes/'+sent.id+'/approve','POST',{}));assert.equal(approved.quote.status,'approved');assert.equal(ok(await call('/api/quotes/'+sent.id+'/approve','POST',{})).order.id,approved.order.id);
    const rejected=ok(await call('/api/quotes/'+own[1].id,'PATCH',{status:'rejected'}));assert.equal(rejected.status,'rejected','sent can be rejected without cycling through draft');
    token=ok(await call('/api/local-auth/login','POST',{email:admin+'@fixture.invalid',password})).token;
    const foreign=ok(await phase3Query('/api/quotes',{search:'phase3-order',managerId:otherManager}));assert.deepEqual(foreign.map(row=>row.id),['phase3-row-foreign']);assert.equal(ok(await phase3Query('/api/quotes/stats',{search:'phase3-order',managerId:otherManager})).total,1);
    token=originalToken;
  });
  await check('phase3: rejection permission is enforced before mutation; ordinary draft edits and authorized draft/sent rejection remain available',async()=>{
    const originalToken=token,password='Phase3RejectionOnly!222',salt=randomBytes(16).toString('hex'),hash='scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex'),employee=randomUUID();
    await pool.query('insert into local_user_profiles(id,user_id,email,password_hash,is_active)values($1,$1,$2,$3,true)',[employee,employee+'@fixture.invalid',hash]);
    await pool.query("insert into local_user_roles(user_id,role,assigned_by)values($1,'employee',$2)",[employee,manager]);
    await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'quotes',true)",[employee]);
    const candidates=[];for(const status of ['draft','sent'])candidates.push(await insertPhase3('phase3-rejection-denied-'+status,status,'2026-10-20T05:00:00Z'));
    const residue=async()=>(await pool.query('select (select count(*) from local_quotes)::int quotes,(select count(*) from local_customers)::int customers,(select count(*) from local_orders)::int orders,(select count(*) from local_order_payments)::int payments')).rows[0];
    token=ok(await call('/api/local-auth/login','POST',{email:employee+'@fixture.invalid',password})).token;
    for(const candidate of candidates){
      const before=(await pool.query('select * from local_quotes where id=$1',[candidate.id])).rows[0],counts=await residue();
      assert.equal((await call('/api/quotes/'+candidate.id,'PATCH',{status:'rejected',customer:{name:'test forbidden rejection '+candidate.id}})).status,403);
      assert.deepEqual((await pool.query('select * from local_quotes where id=$1',[candidate.id])).rows[0],before,'denied rejection leaves complete quote unchanged');
      assert.deepEqual(await residue(),counts,'denied rejection creates no customer/order/payment residue');
    }
    const edited=ok(await call('/api/quotes/'+candidates[0].id,'PATCH',{quote_number:'PHASE3-DRAFT-EDIT-ALLOWED'}));assert.equal(edited.status,'draft');assert.equal(edited.quote_number,'PHASE3-DRAFT-EDIT-ALLOWED');
    await pool.query("insert into local_employee_permissions(user_id,permission_type,enabled)values($1,'quote_approval',true)",[employee]);
    for(const actor of ['employee','manager']){
      token=actor==='manager'?originalToken:token;
      for(const status of ['draft','sent']){
        const candidate=await insertPhase3('phase3-rejection-'+actor+'-'+status,status,'2026-10-20T05:00:00Z'),counts=await residue();
        assert.equal(ok(await call('/api/quotes/'+candidate.id,'PATCH',{status:'rejected'})).status,'rejected');
        assert.deepEqual(await residue(),counts,'authorized rejection creates no customer/order/payment residue');
      }
    }
    token=ok(await call('/api/local-auth/login','POST',{email:employee+'@fixture.invalid',password})).token;
    const foreign=phase3Rows.find(row=>row.id==='phase3-row-foreign'),before=(await pool.query('select * from local_quotes where id=$1',[foreign.id])).rows[0];
    assert.equal((await call('/api/quotes/'+foreign.id,'PATCH',{status:'rejected'})).status,403,'approval permission cannot bypass quote owner scope');
    assert.deepEqual((await pool.query('select * from local_quotes where id=$1',[foreign.id])).rows[0],before);
    token=originalToken;
  });
`;
assert.ok(source.includes(marker));
source=source.replace(marker,()=>extra+'\n'+marker).replace(/^import .*;\r?\n/gm,'').replace("const repo = fileURLToPath(new URL('..', import.meta.url));","const repo = fileURLToPath(new URL('..', "+JSON.stringify(parentUrl.href)+"));").replace("await readFile(new URL('./test-quote-customer-isolated.mjs', import.meta.url), 'utf8')","await readFile(new URL('./test-quote-customer-isolated.mjs', "+JSON.stringify(parentUrl.href)+"), 'utf8')");
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
await new AsyncFunction('assert','spawn','spawnSync','once','createServer','randomBytes','randomUUID','scryptSync','readFile','fileURLToPath','pg',source)(assert,spawn,spawnSync,once,createServer,randomBytes,randomUUID,scryptSync,readFile,fileURLToPath,pg);
