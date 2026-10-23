import type { Express } from 'express';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
type Queryable = Pick<PoolClient, 'query'>;
type Row = QueryResultRow;
export const payrollLocation = (value: unknown) => String(value || '').trim() || '__UNASSIGNED__';
const invalid = (message: string) => Object.assign(new Error(message), { status: 409, resolution_target: 'REVIEW' });
export const payrollOtType = (value: unknown) => {
  const type = String(value || '').toUpperCase().replace(/_OVERTIME$/, '');
  if (!['NORMAL','SUNDAY','HOLIDAY'].includes(type)) throw invalid('Loại tăng ca chưa được hỗ trợ; cần NORMAL, SUNDAY hoặc HOLIDAY.');
  return type;
};
export async function payrollSourceContext(db: Queryable, workerId: string, date: string) {
  const worker = (await db.query('select * from local_workers where id=$1',[workerId])).rows[0];
  if (!worker || (worker.employment_start_date && worker.employment_start_date>date) || (worker.employment_end_date && worker.employment_end_date<date)) throw Object.assign(invalid(`Nguồn ngày ${date} nằm ngoài thời gian làm việc; cần đối soát quyết toán.`),{resolution_target:'WORKER'});
  const [profiles, assignments] = await Promise.all([
    db.query("select * from local_worker_payroll_profiles where worker_id=$1 and status='APPROVED' and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date)",[workerId,date]),
    db.query("select a.* from local_worker_compensation_assignments a join local_payroll_policy_groups g on g.id=a.payroll_policy_group_id and g.is_active where a.worker_id=$1 and a.status='APPROVED' and a.effective_from<=$2::date and (a.effective_to is null or a.effective_to>=$2::date)",[workerId,date]),
  ]);
  if (profiles.rows.length!==1 || assignments.rows.length!==1) throw Object.assign(invalid(`Ngày ${date} cần đúng một hồ sơ nguồn và phân loại lương đã duyệt.`),{resolution_target:'WORKER'});
  return { worker, profile:profiles.rows[0], assignment:assignments.rows[0], location:payrollLocation(worker.location_code) };
}
export async function resolvePayrollCalendar(db: Queryable, start: string, end: string, location: string) {
  const rows = (await db.query("select *,standard_days::text days_numeric,daily_minutes::text minutes_numeric from local_payroll_calendar_versions where status='APPROVED' and period_start=$1::date and period_end=$2::date and location_code=$3",[start,end,location])).rows;
  if (rows.length!==1) throw invalid(`Cơ sở ${location==='__UNASSIGNED__'?'Chưa gán':location} thiếu lịch công đã duyệt đúng kỳ ${start}–${end}.`);
  return rows[0];
}
export async function resolvePayrollRule(db: Queryable, kind: string, date: string, group: string, location: string, overtimeType?: unknown) {
  const rows = (await db.query("select *,multiplier::text multiplier_numeric,fixed_rate::text fixed_numeric,meal_rate::text meal_numeric from local_payroll_rule_versions where status='APPROVED' and rule_kind=$1 and effective_from<=$2::date and effective_to>=$2::date and policy_group_id=$3 and (location_code is null or location_code=$4) and overtime_type is not distinct from $5::text",[kind,date,group,location,kind==='OT'?payrollOtType(overtimeType):null])).rows;
  if (rows.length!==1) throw Object.assign(invalid(`Ngày ${date} cần đúng một chính sách ${kind==='OT'?'tăng ca':'tiền ăn'} đã duyệt theo nhóm/cơ sở.`),{resolution_target:'POLICY'});
  return rows[0];
}
export async function payrollV3OvertimeRate(db: Queryable, context: Row, date: string, calendar: Row) {
  const rows = (await db.query(`select *,rate_amount::text amount_numeric from local_worker_rates where worker_id=$1 and status='APPROVED' and effective_from<=$2::date and (effective_to is null or effective_to>=$2::date)
    and (attendance_method='HOUR' or (attendance_method='DAY' and $3::text in ('MONTHLY_MANAGER','MONTHLY_HELPER')))`,[context.worker.id,date,context.assignment.compensation_type])).rows;
  const hourly=rows.filter(row=>row.attendance_method==='HOUR'), winners=hourly.length?hourly:rows;
  if (winners.length!==1) throw Object.assign(invalid(`Tăng ca ngày ${date} cần đúng một đơn giá cơ sở hợp lệ.`),{resolution_target:'WORKER'});
  const rate=winners[0];
  const amount=(await db.query("select case when $1='HOUR' then $2::numeric else $2::numeric/$3::numeric/($4::numeric/60) end::text unit_rate",[rate.attendance_method,rate.amount_numeric,calendar.days_numeric,calendar.minutes_numeric])).rows[0].unit_rate;
  if (Number(amount)<=0) throw invalid('Đơn giá tăng ca cơ sở phải lớn hơn 0.');
  return { unit_rate:amount,rate_id:rate.id,base_rate_amount:rate.amount_numeric,attendance_method:rate.attendance_method };
}

export async function payrollV3Checks(db: Queryable,start: string,end: string,workerIds: string[],standardDays: number|null) {
  const issues: Row[]=[], calendars: Row[]=[];
  const add=(worker:string,message:string,code='PAYROLL_V3_CONFIG',source?:Row)=>issues.push({severity:'BLOCKING',worker_id:worker,code,message,...(source?{source_type:source.kind,source_id:source.id,source_date:source.work_date}:{})});
  for (const id of workerIds) {
    const worker=(await db.query('select * from local_workers where id=$1',[id])).rows[0];
    try { const calendar=await resolvePayrollCalendar(db,start,end,payrollLocation(worker.location_code)); if (!calendars.some(row=>row.id===calendar.id)) calendars.push(calendar); if (standardDays!==null && (await db.query('select $1::numeric<>$2::numeric mismatch',[String(standardDays),calendar.days_numeric])).rows[0].mismatch) throw invalid('Ngày công nhập tay không khớp lịch đã duyệt; không được dùng làm giá trị thay thế.'); } catch(error) { add(id,(error as Error).message,'PAYROLL_CALENDAR'); }
    if ((!worker.is_active || worker.payroll_status!=='ACTIVE' || (worker.employment_end_date && worker.employment_end_date<end))) {
      const recurring=await db.query(`select 1 from local_worker_payroll_profiles where worker_id=$1 and status='APPROVED' and effective_from<=$3::date and (effective_to is null or effective_to>=$2::date)
        and (insurance_enabled or (allowances_enabled and fixed_allowance_amount>0) or (deductions_enabled and fixed_deduction_amount>0)) limit 1`,[id,start,end]);
      if (recurring.rows[0]) add(id,'Nhân sự nghỉ/tạm ngưng có BHXH hoặc khoản cố định theo kỳ. Cần quyết định quyết toán riêng; hệ thống chưa tự phân bổ/cộng dồn.','SETTLEMENT_RECURRING_UNRESOLVED');
    }
  }
  const sources=(await db.query(`select * from (select 'ATTENDANCE' kind,id,worker_id,work_date::text work_date,null::text overtime_type from local_attendance where workflow_status in ('APPROVED','LOCKED') and not is_reversed
    union all select 'PRODUCTION_ENTRY',id,worker_id,work_date::text,null from local_production_entries where workflow_status in ('APPROVED','LOCKED') and not is_reversed
    union all select 'OVERTIME',id,worker_id,work_date::text,overtime_type from local_overtime where status in ('APPROVED','LOCKED')
    union all select 'DAY_STATUS',id,worker_id,work_date::text,null from local_day_statuses where status='PRESENT' and meal_eligible) sources where work_date between $1 and $2 and worker_id=any($3::uuid[])`,[start,end,workerIds])).rows;
  for (const source of sources) try {
    const attendance=source.kind==='ATTENDANCE'?(await db.query('select attendance_method from local_attendance where id=$1',[source.id])).rows[0]:null;
    if(attendance?.attendance_method==='OUTPUT') {
      add(source.worker_id,`Nguồn công sản phẩm cũ ngày ${source.work_date} chưa được tính lương. Cần đối soát và chuyển sang nguồn sản lượng đã duyệt (production entry) trước khi tạo preview.`, 'LEGACY_OUTPUT_ATTENDANCE_SOURCE',source);
      continue;
    }
    const context=await payrollSourceContext(db,source.worker_id,source.work_date);
    if(attendance && ((attendance.attendance_method==='DAY'&&!['MONTHLY_MANAGER','MONTHLY_HELPER'].includes(context.assignment.compensation_type)) || (attendance.attendance_method==='HOUR'&&context.assignment.compensation_type!=='HOURLY')))throw invalid('Nguồn công ngày/giờ không khớp phân loại lương tại ngày phát sinh.');
    const sourceFlag: Record<string,string>={PRODUCTION_ENTRY:'piece_output_enabled',OVERTIME:'overtime_enabled',DAY_STATUS:'meal_enabled'};
    if (sourceFlag[source.kind] && !context.profile[sourceFlag[source.kind]]) throw invalid('Nguồn đã duyệt nằm ở ngày hồ sơ tắt nguồn thu nhập này; cần đối soát, không được bỏ qua khoản tiền.');
    if (source.kind==='OVERTIME'&&context.profile.overtime_enabled) { const rule=await resolvePayrollRule(db,'OT',source.work_date,context.assignment.payroll_policy_group_id,context.location,source.overtime_type); if(rule.calculation_method==='BASE_RATE_MULTIPLIER') await payrollV3OvertimeRate(db,context,source.work_date,await resolvePayrollCalendar(db,start,end,context.location)); }
    if(source.kind==='DAY_STATUS'&&context.profile.meal_enabled) await resolvePayrollRule(db,'MEAL',source.work_date,context.assignment.payroll_policy_group_id,context.location);
    if(source.kind==='ATTENDANCE') {const special=await db.query("select 1 from local_day_statuses where worker_id=$1 and work_date=$2::date and status in ('HOLIDAY','PAID_LEAVE')",[source.worker_id,source.work_date]);if(special.rows[0]) throw invalid('Công ngày lễ/nghỉ hưởng lương cần quy tắc riêng; chưa được tính như ngày thường.');}
  } catch(error) { add(source.worker_id,(error as Error).message,'PAYROLL_SOURCE_DATE',source);issues[issues.length-1].resolution_target=(error as Error & {resolution_target?:string}).resolution_target||'REVIEW'; }
  const unsupported=(await db.query("select id,worker_id from local_day_statuses where status='PAID_LEAVE' and work_date between $1::date and $2::date and worker_id=any($3::uuid[])",[start,end,workerIds])).rows;
  for(const row of unsupported)add(row.worker_id,'Nghỉ hưởng lương cần quy tắc riêng trước khi tính.','UNSUPPORTED_PAID_LEAVE',{kind:'DAY_STATUS',id:row.id});
  return {issues,calendars};
}

export function registerPayrollRules(app: Express,db:Pool,actor:()=>string,role:()=>string) {
  for(const [resource,table,fields] of [
    ['rule-versions','local_payroll_rule_versions',['policy_group_id','location_code','rule_kind','overtime_type','calculation_method','multiplier','fixed_rate','meal_rate','effective_from','effective_to','reason','source_reference']],
    ['calendar-versions','local_payroll_calendar_versions',['period_start','period_end','location_code','standard_days','daily_minutes','reason','source_reference']],
  ] as const) {
    app.get(`/api/payroll/${resource}`,async(_req,res)=>{try {if(!['admin','manager','accountant'].includes(role()))return res.status(403).json({message:'Không có quyền xem cấu hình payroll.'});res.json((await db.query(`select * from ${table} order by created_at desc,id`)).rows);}catch{res.status(500).json({message:'Không đọc được cấu hình payroll.'});}});
    const mutate=(operation:'create'|'update'|'approve'|'delete')=>async(req:import('express').Request,res:import('express').Response)=>{
      if(!['admin','manager'].includes(role()))return res.status(403).json({message:'Chỉ quản trị viên/quản lý được duyệt cấu hình payroll.'});
      const client=await db.connect();try {await client.query('begin');await client.query("select pg_advisory_xact_lock_shared(hashtextextended('local-attendance-payroll-source-guard',0))");await client.query("select pg_advisory_xact_lock(hashtextextended('local-payroll-version-config',0))");
        let row:Row; if(operation==='create') {const values=fields.map(field=>req.body[field]=== ''?null:req.body[field]??null);row=(await client.query(`insert into ${table}(${fields.join(',')},created_by) values(${values.map((_,n)=>'$'+(n+1)).join(',')},$${values.length+1}) returning *`,[...values,actor()])).rows[0];}
        else {const previous=(await client.query(`select * from ${table} where id=$1 for update`,[req.params.id])).rows[0];if(!previous)throw invalid('Không tìm thấy phiên bản.');if(previous.status!=='DRAFT')throw invalid('Phiên bản đã duyệt không được sửa/xóa.');
          if(operation==='delete')row=(await client.query(`delete from ${table} where id=$1 returning *`,[req.params.id])).rows[0];
          else if(operation==='approve') {if(!String(req.body.reason||'').trim())throw invalid('Cần lý do duyệt.');row=(await client.query(`update ${table} set status='APPROVED',approved_by=$2,approved_at=now() where id=$1 returning *`,[req.params.id,actor()])).rows[0];}
          else {const submitted=fields.filter(field=>Object.hasOwn(req.body,field));if(!submitted.length)throw invalid('Không có nội dung cập nhật.');row=(await client.query(`update ${table} set ${submitted.map((field,n)=>field+'=$'+(n+2)).join(',')} where id=$1 returning *`,[req.params.id,...submitted.map(field=>req.body[field]===''?null:req.body[field])])).rows[0];}
        }
        await client.query("insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values($1,$2,$3,$4,$5)",[resource,row.id,operation.toUpperCase(),String(req.body.reason||row.reason),actor()]);await client.query('commit');res.status(operation==='create'?201:200).json(row);
      }catch(error){await client.query('rollback');res.status(Number((error as Row).status||400)).json({message:error instanceof Error?error.message:'Cấu hình payroll không hợp lệ.'});}finally{client.release();}
    };
    app.post(`/api/payroll/${resource}`,mutate('create'));app.patch(`/api/payroll/${resource}/:id`,mutate('update'));app.post(`/api/payroll/${resource}/:id/approve`,mutate('approve'));app.delete(`/api/payroll/${resource}/:id`,mutate('delete'));
  }
}
