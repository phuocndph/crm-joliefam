import type {Express,Response} from 'express';
import type {Pool,PoolClient} from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import {payrollCapability} from './permission-policy.js';
import {capturePayrollSourceFingerprint} from './payroll-snapshot.js';
import {readPayrollReconciliation} from './payroll-reconciliation.js';

type Body=Record<string,unknown>;
type Deps={pool:Pool;actor:()=>string;role:()=>string;sync:(body:Body)=>Promise<Body>;preflight:(db:PoolClient,start:string,end:string,days:number|null,ids:string[]|null)=>Promise<{blocking_count:number;lock_blocking_count:number;issues:unknown[];lock_issues:unknown[]}>;audit:(table:string,id:string,action:string,reason:string,db:PoolClient)=>Promise<unknown>;sendError:(res:Response,error:unknown)=>void};
const fail=(message:string,status=409)=>Object.assign(new Error(message),{status});
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const decimal=(value:unknown)=>{const text=String(value??'');if(!/^\d{1,14}(?:\.\d{1,6})?$/.test(text))throw fail('Số tiền phải không âm và có tối đa 6 chữ số thập phân.',400);return text;};
function period(month:unknown){const value=String(month);const match=/^(\d{1,4})-(0[1-9]|1[0-2])$/.exec(value);if(!match||Number(match[1])<1)throw fail('Tháng lương không hợp lệ.',400);const year=Number(match[1]),monthNumber=Number(match[2]);const leap=year%4===0&&(year%100!==0||year%400===0);const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][monthNumber-1];const normalized=`${String(year).padStart(4,'0')}-${match[2]}`;return {start:normalized+'-01',end:normalized+'-'+String(days).padStart(2,'0')};}
export function registerPayrollMonthly(app:Express,d:Deps){
  const capability=async(db:Pick<PoolClient,'query'>,permission:string)=>{const grants=(await db.query('select permission_type from local_employee_permissions where user_id=$1 and enabled',[d.actor()])).rows;return ['admin','manager','accountant'].includes(d.role())&&payrollCapability(d.role(),permission,new Set(grants.map(row=>String(row.permission_type))));};
  const requireCap=async(db:Pick<PoolClient,'query'>,permission:string)=>{if(!await capability(db,permission))throw fail('Bạn không có quyền thao tác bảng lương này.',403);};
  const transaction=async<T>(fn:(db:PoolClient)=>Promise<T>)=>{const db=await d.pool.connect();try{await db.query('begin');await db.query("select pg_advisory_xact_lock(hashtextextended('local-attendance-payroll-source-guard',0))");const value=await fn(db);await db.query('commit');return value;}catch(error){await db.query('rollback');throw error;}finally{db.release();}};
  const runBasis=async(db:PoolClient,body:Body,payable=false)=>{
    await requireCap(db,'payroll_view');
    const {start,end}=period(body.month);
    const run=(await db.query(`select r.*,p.period_start::text,p.period_end::text,p.status period_status from local_payroll_runs r join local_payroll_periods p on p.id=r.period_id where r.id=$1`,[String(body.run_id||'')])).rows[0];
    if(!run||run.period_start!==start||run.period_end!==end||!['PREVIEW','LOCKED'].includes(run.status)|| (run.status==='PREVIEW'&&run.period_status==='CLOSED'))throw fail('Bản tính không còn hiện hành. Hãy tải lại tháng lương.');
    const scope=run.config_snapshot?.worker_scope;
    const fingerprint=run.config_snapshot?.source_fingerprint?.sha256;
    if(!scope||typeof fingerprint!=='string'||fingerprint!==body.expected_fingerprint)throw fail('Cơ sở tính đã thay đổi. Hãy tải lại.');
    if(run.status==='PREVIEW'){
      const requestedScope=scope.requested_worker_ids ?? undefined;
      const current=await capturePayrollSourceFingerprint(db,start,end,run.standard_days_snapshot===null?null:Number(run.standard_days_snapshot),requestedScope);
      if(current.sha256!==fingerprint)throw fail('Nguồn lương đã thay đổi. Hãy tải lại tháng lương.');
      const check=await d.preflight(db,start,end,run.standard_days_snapshot===null?null:Number(run.standard_days_snapshot),requestedScope ?? null);
      const blocking=check.issues.some(issue=>{const row=issue as {code:string;severity:string};return row.severity==='BLOCKING'&&(payable||!row.code.startsWith('UNAPPROVED_'));});
      const scopedPending=check.lock_issues.some(issue=>scope.resolved_worker_ids.includes(String((issue as {worker_id:string}).worker_id)));
      if(blocking||(payable&&scopedPending))throw fail('Còn nguồn hoặc cấu hình chưa duyệt; chưa thể xác nhận hay xuất thanh toán.');
    }
    if((await db.query("select 1 from local_payroll_exceptions where run_id=$1 and severity='BLOCKING' and resolved_at is null limit 1",[run.id])).rows[0])throw fail('Bản tính còn ngoại lệ chặn.');
    return {run,fingerprint,start,end};
  };
  const slots=async(db:Pick<PoolClient,'query'>,periodId:string,workerId?:string)=>(await db.query(`select worker_id,
    coalesce(sum(case when item_direction='EARNING' then amount when item_direction='DEDUCTION' then -amount else 0 end) filter(where item_type='BONUS'),0)::text bonus,
    coalesce(sum(case when item_direction='DEDUCTION' then amount when item_direction='EARNING' then -amount else 0 end) filter(where item_type='PENALTY'),0)::text penalty,
    coalesce(sum(case when item_direction='DEDUCTION' then amount when item_direction='EARNING' then -amount else 0 end) filter(where item_type='SALARY_ADVANCE'),0)::text advance
    from local_payroll_adjustments where period_id=$1 and status in ('APPROVED','LOCKED') and source_reference like 'MONTHLY_SLOT:%' and ($2::uuid is null or worker_id=$2) group by worker_id`,[periodId,workerId??null])).rows;
  const latestEvents=async(db:Pick<PoolClient,'query'>,start:string)=>(await db.query(`select distinct on(worker_id) id,worker_id,run_id,record_id,payment_amount::text,source_fingerprint,status,reason,actor_id,created_at from local_payroll_payment_events where month=$1::date order by worker_id,created_at desc,id desc`,[start])).rows;
  const command=async(db:PoolClient,body:Body,kind:string)=>{
    const key=String(body.idempotency_key||'');if(key.length<8||key.length>200)throw fail('Thiếu khóa gửi lại hợp lệ.',400);
    const requestHash=hash({kind,body});
    const previous=(await db.query('select * from local_payroll_monthly_commands where idempotency_key=$1',[key])).rows[0];
    if(previous){if(previous.actor_id!==d.actor()||previous.request_hash!==requestHash||previous.command_kind!==kind)throw fail('Khóa gửi lại đã dùng cho yêu cầu khác.');return {key,requestHash,previous:previous.result};}
    return {key,requestHash,previous:null};
  };
  app.post('/api/payroll/monthly/sync',async(req,res)=>{res.setHeader('cache-control','no-store');try{
    await requireCap(d.pool,'payroll_view');const {start,end}=period(req.body.month);
    const run=await d.sync({period_start:start,period_end:end,...(Object.hasOwn(req.body,'worker_ids')?{worker_ids:req.body.worker_ids}:{})});
    const reconciliation=await readPayrollReconciliation(d.pool,String(run.id));
    const metadata=await transaction(async db=>{
      await requireCap(db,'payroll_view');
      const bankAllowed=await capability(db,'payroll_bank_manage');
      const banks=bankAllowed?(await db.query(`select worker_id,bank_name,bank_code,account_number,account_name from local_payroll_bank_accounts where status='VERIFIED' and is_primary and btrim(coalesce(account_number,''))<>'' and effective_from<=$1::date and (effective_to is null or effective_to>=$1::date)`,[end])).rows:[];
      const events=await latestEvents(db,start);const byWorker=new Map(events.map(row=>[String(row.worker_id),row]));
      const fingerprint=run.config_snapshot&&typeof run.config_snapshot==='object'?(run.config_snapshot as Body).source_fingerprint as Body:undefined;
      await runBasis(db,{month:req.body.month,run_id:run.id,expected_fingerprint:fingerprint?.sha256});
      const scopedIds=new Set(reconciliation.rows.filter(row=>row.record_id).map(row=>String(row.worker_id)));
      const payments=reconciliation.rows.filter(row=>row.record_id).map(row=>{const event=byWorker.get(String(row.worker_id));return {worker_id:row.worker_id,event_id:event?.id??null,status:!event||event.status==='VOID'?'UNPAID':event.run_id===run.id&&event.record_id===row.record_id&&event.source_fingerprint===fingerprint?.sha256&&String(event.payment_amount)===String(row.payment_amount)?'PAID':'NEEDS_REVIEW',confirmed_amount:event?.payment_amount??null,confirmed_fingerprint:event?.source_fingerprint??null,confirmed_run_id:event?.run_id??null,confirmed_record_id:event?.record_id??null,confirmed_at:event?.created_at??null};});
      const requestedScope=(run.config_snapshot as {worker_scope:{requested_worker_ids:string[]|null}}).worker_scope.requested_worker_ids ?? undefined;
      const check=run.status==='LOCKED'?null:await d.preflight(db,start,end,run.standard_days_snapshot===null?null:Number(run.standard_days_snapshot),requestedScope ?? null);
      const scopedLockIssues=(check?.lock_issues??[]).filter(issue=>scopedIds.has(String((issue as {worker_id:string}).worker_id)));
      return {fingerprint:fingerprint?.sha256,slots:(await slots(db,String(run.period_id))).filter(row=>scopedIds.has(String(row.worker_id))),payments,banks:banks.filter(row=>scopedIds.has(String(row.worker_id))),issues:check?.issues??[],lock_issues:scopedLockIssues,payment_ready:(!check||check.blocking_count===0&&scopedLockIssues.length===0)&&reconciliation.totals.blocking_exception_count===0&&(reconciliation.freshness.status==='CURRENT'||run.status==='LOCKED'),capabilities:{adjustments:await capability(db,'payroll_worker_manage'),payments:await capability(db,'payroll_audit'),bank:bankAllowed}};
    });
    res.json({...reconciliation,monthly:metadata});
  }catch(error){const detail=error as {preflight?:unknown};if(detail.preflight)res.status(409).json({message:(error as Error).message,preflight:detail.preflight});else d.sendError(res,error);}});
  app.post('/api/payroll/monthly/adjustments',async(req,res)=>{try{res.json(await transaction(async db=>{
    await requireCap(db,'payroll_view');await requireCap(db,'payroll_worker_manage');const cmd=await command(db,req.body,'ADJUSTMENT');if(cmd.previous)return {...cmd.previous,reused:true};
    const basis=await runBasis(db,req.body);if(basis.run.status!=='PREVIEW'||basis.run.period_status==='CLOSED')throw fail('Kỳ đã khóa; dùng kỳ điều chỉnh riêng.');
    const workerId=String(req.body.worker_id||'');if(!(await db.query('select 1 from local_payroll_records where run_id=$1 and worker_id=$2',[basis.run.id,workerId])).rows[0])throw fail('Nhân sự nằm ngoài bản tính.',403);
    const slot=String(req.body.slot||'');const type={bonus:'BONUS',penalty:'PENALTY',advance:'SALARY_ADVANCE'}[slot];if(!type)throw fail('Loại ô điều chỉnh không hợp lệ.',400);
    const value=decimal(req.body.value),expected=decimal(req.body.expected_amount);const reason=String(req.body.reason||'').trim();if(reason.length<3||reason.length>1000)throw fail('Nhập lý do từ 3 đến 1000 ký tự.',400);
    const current=(await slots(db,String(basis.run.period_id),workerId))[0]?.[slot]??'0';
    const numbers=(await db.query('select $1::numeric=$2::numeric matches,($3::numeric-$1::numeric)::text delta',[current,expected,value])).rows[0];if(!numbers.matches)throw fail('Ô đã được người khác sửa. Hãy tải lại.');
    let adjustmentId:string|null=null;
    if(Number(numbers.delta)!==0){const negative=String(numbers.delta).startsWith('-');const direction=slot==='bonus'?(negative?'DEDUCTION':'EARNING'):(negative?'EARNING':'DEDUCTION');
      adjustmentId=(await db.query(`insert into local_payroll_adjustments(worker_id,period_id,item_type,item_direction,amount,reason,source_reference,idempotency_key,request_hash,status,created_by,submitted_by,approved_by,submitted_at,approved_at)
        values($1,$2,$3,$4,abs($5::numeric),$6,$7,$8,$9,'APPROVED',$10,$10,$10,now(),now()) returning id`,[workerId,basis.run.period_id,type,direction,numbers.delta,reason,'MONTHLY_SLOT:'+slot,cmd.key,cmd.requestHash,d.actor()])).rows[0].id;
      await d.audit('payroll_adjustments',adjustmentId!,'MONTHLY_DELTA',reason,db);
    }
    const result={adjustment_id:adjustmentId,value,slot,reused:false};await db.query("insert into local_payroll_monthly_commands(idempotency_key,actor_id,request_hash,command_kind,result) values($1,$2,$3,'ADJUSTMENT',$4::jsonb)",[cmd.key,d.actor(),cmd.requestHash,JSON.stringify(result)]);return result;
  }));}catch(error){d.sendError(res,error);}});
  app.post('/api/payroll/monthly/payments',async(req,res)=>{try{res.json(await transaction(async db=>{
    await requireCap(db,'payroll_view');await requireCap(db,'payroll_audit');const cmd=await command(db,req.body,'PAYMENT');if(cmd.previous)return {...cmd.previous,reused:true};
    const basis=await runBasis(db,req.body,true);const status=String(req.body.status||'');const reason=String(req.body.reason||'').trim();if(!['PAID','VOID'].includes(status)||reason.length<3||reason.length>1000)throw fail('Trạng thái hoặc lý do xác nhận không hợp lệ.',400);
    const requested=req.body.workers;if(!Array.isArray(requested)||!requested.length||requested.length>500)throw fail('Chọn từ 1 đến 500 nhân sự.',400);
    const events=await latestEvents(db,basis.start);const commandId=randomUUID();const output:Array<{worker_id:string;event_id:string}>=[];const seen=new Set<string>();
    // The command and all events commit together, including bulk conflicts.
    await db.query("insert into local_payroll_monthly_commands(id, idempotency_key,actor_id,request_hash,command_kind,result) values($1,$2,$3,$4,'PAYMENT',$5::jsonb)",[commandId,cmd.key,d.actor(),cmd.requestHash,JSON.stringify({command_id:commandId,reused:false})]);
    for(const request of requested){const workerId=String(request.worker_id||'');if(seen.has(workerId))throw fail('Nhân sự bị trùng.',400);seen.add(workerId);
      const record=(await db.query('select id,payment_amount::text from local_payroll_records where run_id=$1 and worker_id=$2 and payment_amount>0',[basis.run.id,workerId])).rows[0];if(!record)throw fail('Nhân sự ngoài bản tính hoặc số thanh toán không dương.');
      if(!(await db.query('select $1::numeric=$2::numeric matches',[record.payment_amount,decimal(request.expected_amount)])).rows[0].matches)throw fail('Số thanh toán đã đổi. Hãy tải lại.');
      const event=events.find(row=>String(row.worker_id)===workerId);if((event?.id??null)!==(request.expected_event_id??null))throw fail('Trạng thái đã được người khác xác nhận. Hãy tải lại.');
      const stale=!!event&&(String(event.run_id)!==String(basis.run.id)||String(event.record_id)!==String(record.id)||String(event.source_fingerprint)!==String(basis.fingerprint)||String(event.payment_amount)!==String(record.payment_amount));
      if(req.body.review_previous_event===true){
        if(!event||event.status!=='PAID'||!stale||request.expected_previous_fingerprint!==event.source_fingerprint||request.expected_previous_run_id!==event.run_id||request.expected_previous_record_id!==event.record_id)throw fail('Lần trả cần đối soát đã thay đổi. Hãy tải lại.');
        if(!(await db.query('select $1::numeric=$2::numeric matches',[event.payment_amount,decimal(request.expected_previous_amount)])).rows[0].matches)throw fail('Số tiền lần trả trước đã thay đổi. Hãy tải lại.');
      }else if(stale)throw fail('Lần xác nhận trước thuộc bản tính khác; trạng thái cần đối soát lại.');
      if(status==='PAID'&&event?.status==='PAID'&&!stale)throw fail('Nhân sự đã được xác nhận trả theo bản tính hiện hành.');
      if(status==='VOID'&&(!event||event.status!=='PAID'))throw fail('Chưa có xác nhận đã trả để hủy.');
      const id=randomUUID();await db.query(`insert into local_payroll_payment_events(id,command_id,month,worker_id,run_id,record_id,payment_amount,source_fingerprint,prior_event_id,status,reason,actor_id) values($1,$2,$3::date,$4,$5,$6,$7::numeric,$8,$9,$10,$11,$12)`,[id,commandId,basis.start,workerId,basis.run.id,record.id,record.payment_amount,basis.fingerprint,event?.id??null,status,reason,d.actor()]);
      await d.audit('payroll_payment_events',id,req.body.review_previous_event===true?(status==='PAID'?'RECONFIRM':'RECONCILE_VOID'):status,reason,db);output.push({worker_id:workerId,event_id:id});
    }return {command_id:commandId,reused:false};
  }));}catch(error){d.sendError(res,error);}});
  app.post('/api/payroll/monthly/export',async(req,res)=>{try{
    const format=String(req.query.format||'payroll');if(!['payroll','bank'].includes(format))throw fail('Định dạng không hợp lệ.',400);
    const buffer=await transaction(async db=>{await requireCap(db,'payroll_view');if(format==='bank')await requireCap(db,'payroll_bank_manage');const basis=await runBasis(db,req.body,true);
      const records=(await db.query(`select r.id,r.worker_id,r.payment_amount::text,r.gross_amount::text,r.deductions_amount::text,r.net_amount::text,r.employee_identity_snapshot,w.display_name,w.employee_code from local_payroll_records r join local_workers w on w.id=r.worker_id where r.run_id=$1 order by r.worker_id`,[basis.run.id])).rows;
      const ids=req.body.worker_ids;if(ids!==undefined&&(!Array.isArray(ids)||!ids.length||ids.some(id=>!records.some(row=>row.worker_id===id))))throw fail('Phạm vi xuất không hợp lệ.',400);
      const selected=ids?records.filter(row=>(ids as string[]).includes(row.worker_id)):records;if(!selected.length)throw fail('Không có nhân sự để xuất.');
      const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet(format==='bank'?'Ngân hàng':'Bảng lương');ws.addRow([basis.run.status==='LOCKED'?'Bảng lương đã khóa':'Bản tính hiện hành – chưa chốt']);ws.addRow(['Tháng',String(req.body.month),'Run',String(basis.run.id)]);
      ws.addRow(format==='bank'?['Mã NV','Họ tên','Ngân hàng','Số tài khoản','Chủ tài khoản','Số tiền']:['Mã NV','Họ tên','Tổng thu nhập','Khấu trừ','Sau khấu trừ','Thanh toán']);
      const safe=(v:unknown)=>{const s=String(v??'');return /^[=+\-@\t\r]/.test(s)?"'"+s:s;};
      for(const row of selected){const identity=row.employee_identity_snapshot;let values:unknown[]=[safe(identity?.employee_code??row.employee_code),safe(identity?.display_name??row.display_name)];
        if(format==='bank'){const banks=(await db.query(`select bank_name,account_number,account_name from local_payroll_bank_accounts where worker_id=$1 and status='VERIFIED' and is_primary and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date) and btrim(coalesce(account_number,''))<>''`,[row.worker_id,basis.end])).rows;if(banks.length!==1||!banks[0].bank_name||!banks[0].account_name||Number(row.payment_amount)<=0)throw fail('Mỗi nhân sự cần một tài khoản ngân hàng đã xác minh đầy đủ và số thanh toán dương.');values=[...values,safe(banks[0].bank_name),safe(banks[0].account_number),safe(banks[0].account_name),row.payment_amount];}
        else values=[...values,row.gross_amount,row.deductions_amount,row.net_amount,row.payment_amount];
        const excelRow=ws.addRow(values as string[]);excelRow.eachCell(cell=>{cell.numFmt='@';});
      }ws.columns.forEach(column=>{column.width=24;});return Buffer.from(await wb.xlsx.writeBuffer());
    });res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(`payroll-${String(req.body.month)}-${format}.xlsx`).send(buffer);
  }catch(error){d.sendError(res,error);}});
}
