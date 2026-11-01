import type { PoolClient } from "pg";
import {codeKey,semanticText} from './product-labor-resolver.js';

function validProductHistoryDate(value:unknown):value is string{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const[year,month,day]=value.split('-').map(Number),leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>=1&&month>=1&&month<=12&&day>=1&&day<=days[month-1];
}

// Product-rate identity is the canonical Excel code across every association.
async function preserveProductRateHistory(db:Pick<PoolClient,'query'>,replacementId:string,actor:string,reason:string){
  const target=(await db.query('select *,rate::text exact_rate,effective_from::text from_date,effective_to::text to_date from local_product_rates where id=$1',[replacementId])).rows[0];
  // Lock the complete approved batch in stable id order before JS canonical
  // filtering: SQL lower() is not codeKey for all Unicode strings.
  const rows=(await db.query(`select *,rate::text exact_rate,effective_from::text from_date,effective_to::text to_date from local_product_rates
    where status='APPROVED' order by id for update`)).rows.filter(row=>codeKey(row.piece_rate_code)===codeKey(target.piece_rate_code));
  const review=()=>{throw Object.assign(new Error('Nguồn đơn giá cần đối soát: trùng ngày, sai thông tin hoặc khác sản phẩm liên kết.'),{status:409});};
  for(const row of rows){
    if(!codeKey(row.piece_rate_code)||codeKey(row.piece_rate_code).length>120||!semanticText(row.piece_rate_name)||String(row.piece_rate_name).normalize('NFC').trim().length>500||!['PIECE','SET','HOUR','METER'].includes(row.rate_unit)||!/^\d{1,16}\.\d{2}$/.test(row.exact_rate)||/^0+\.00$/.test(row.exact_rate)||!validProductHistoryDate(row.from_date)||(row.to_date!==null&&(!validProductHistoryDate(row.to_date)||row.to_date<row.from_date)))review();
  }
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(rows[i].from_date<=(rows[j].to_date||'9999-12-31')&&rows[j].from_date<=(rows[i].to_date||'9999-12-31'))review();
  const predecessors=rows.filter(row=>row.from_date<=(target.to_date||'9999-12-31')&&(row.to_date||'9999-12-31')>=target.from_date);
  for(const row of predecessors)if(row.product_id!==target.product_id||row.rate_unit!==target.rate_unit||semanticText(row.piece_rate_name)!==semanticText(target.piece_rate_name))review();
  for(const row of predecessors){
    const continuations=await db.query(`with bounds as (select p.*,n.effective_from replacement_from,n.effective_to replacement_to from local_product_rates p join local_product_rates n on n.id=$2 where p.id=$1),
      segments as (select b.id,b.effective_from segment_from,b.replacement_from-1 segment_to from bounds b where b.effective_from<b.replacement_from
        union all select b.id,b.replacement_to+1,b.effective_to from bounds b where b.replacement_to is not null and b.replacement_to<date '9999-12-31' and (b.effective_to is null or b.effective_to>b.replacement_to)),
      clones as (select jsonb_populate_record(null::local_product_rates,to_jsonb(p)||jsonb_build_object('id',gen_random_uuid(),'continued_from_id',p.id,'effective_from',s.segment_from,'effective_to',s.segment_to,'created_at',now(),'updated_at',now(),'local_modified_at',now())) value from segments s join local_product_rates p on p.id=s.id)
      insert into local_product_rates select(value).* from clones returning id,effective_from::text,effective_to::text`,[row.id,replacementId]);
    await db.query("update local_product_rates set status='RETIRED',updated_at=now() where id=$1",[row.id]);
    await db.query("insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id)values('product_rates',$1,'REPLACE_RANGE',$2,$3)",[row.id,`${reason}; replaced_by=${replacementId}; continued_as=${continuations.rows.map(item=>item.id).join(',')||'none'}`,actor]);
    for(const tail of continuations.rows)await db.query("insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id)values('product_rates',$1,'CONTINUE_RANGE',$2,$3)",[tail.id,`${reason}; continued_from=${row.id}; replaced_by=${replacementId}; effective=${tail.effective_from}..${tail.effective_to||'infinity'}`,actor]);
  }
}

type HistoryTable = "local_worker_compensation_assignments" | "local_worker_payroll_profiles" | "local_worker_rates" | "local_social_insurance_versions" | "local_product_rates";
const entities: Record<HistoryTable, string> = {
  local_worker_compensation_assignments: "worker_compensation_assignments",
  local_worker_payroll_profiles: "worker_payroll_profiles",
  local_worker_rates: "worker_rates",
  local_social_insurance_versions: "social_insurance_versions",
  local_product_rates: "product_rates",
};

/** Caller holds the source guard, configuration advisory lock and a transaction.
 * Money and date arithmetic stay in PostgreSQL; original approved facts are never rewritten.
 */
export async function preservePayrollApprovalHistory(db: Pick<PoolClient, "query">, table: HistoryTable, replacementId: string, actor: string, reason: string) {
  if(String(table)==='local_product_rates')return preserveProductRateHistory(db,replacementId,actor,reason);
  if (!Object.hasOwn(entities, table)) throw new Error("Bảng phiên bản lương không hợp lệ.");
  const scope = table === "local_product_rates"
    ? "((n.product_id is not null and p.product_id=n.product_id) or (n.product_id is null and p.product_id is null and lower(p.piece_rate_code)=lower(n.piece_rate_code)))"
    : `p.worker_id=n.worker_id${table === "local_worker_rates" ? " and p.attendance_method=n.attendance_method" : ""}`;
  const overlap = "p.effective_from <= coalesce(n.effective_to,'infinity'::date) and coalesce(p.effective_to,'infinity'::date) >= n.effective_from";
  const predecessors = await db.query(`select p.id from ${table} p join ${table} n on n.id=$1 where p.id<>n.id and p.status='APPROVED' and ${scope} and ${overlap} order by p.id for update of p`, [replacementId]);
  if (!predecessors.rows.length) return;
  const ids = predecessors.rows.map(row => row.id);
  const ambiguous = await db.query(`select 1 from ${table} p join ${table} n on n.id=$2 join ${table} b on b.id<>p.id and b.status='APPROVED' where p.id=any($1::uuid[]) and ${table === "local_product_rates" ? "((p.product_id is not null and b.product_id=p.product_id) or (p.product_id is null and b.product_id is null and lower(b.piece_rate_code)=lower(p.piece_rate_code)))" : `b.worker_id=p.worker_id${table === "local_worker_rates" ? " and b.attendance_method=p.attendance_method" : ""}`} and p.effective_from <= coalesce(b.effective_to,'infinity'::date) and coalesce(p.effective_to,'infinity'::date)>=b.effective_from limit 1`, [ids, replacementId]);
  if (ambiguous.rows.length) throw Object.assign(new Error("Các phiên bản đã duyệt đang giao ngày; cần đối soát trước khi thay thế."), {status: 409});
  for (const original of predecessors.rows) {
    // Include all numeric business fields through the database composite row, without a JS conversion.
    const continuations = await db.query(`with bounds as (
      select p.*, n.effective_from replacement_from,n.effective_to replacement_to from ${table} p join ${table} n on n.id=$2 where p.id=$1
    ), segments as (
      select b.id, b.effective_from segment_from, b.replacement_from-1 segment_to from bounds b where b.effective_from < b.replacement_from
      union all
      select b.id, b.replacement_to+1, b.effective_to from bounds b where b.replacement_to is not null and (b.effective_to is null or b.effective_to>b.replacement_to)
    ), clones as (
      select jsonb_populate_record(null::${table},to_jsonb(p) || jsonb_build_object(
        'id',gen_random_uuid(),'continued_from_id',p.id,'effective_from',s.segment_from,'effective_to',s.segment_to,
        'created_at',now(),'updated_at',now(),'local_modified_at',now(),
        'idempotency_key','continuation:' || p.id::text || ':' || $2::text || ':' || s.segment_from::text,
        'request_hash',md5(p.id::text || ':' || $2::text || ':' || s.segment_from::text || ':' || coalesce(s.segment_to::text,'infinity'))
      )) value from segments s join ${table} p on p.id=s.id
    ) insert into ${table} select (value).* from clones returning id,effective_from::text,effective_to::text`, [original.id, replacementId]);
    await db.query(`update ${table} set status='RETIRED',updated_at=now() where id=$1`, [original.id]);
    await db.query("insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values($1,$2,'REPLACE_RANGE',$3,$4)", [entities[table], original.id, `${reason}; replaced_by=${replacementId}; continued_as=${continuations.rows.map(row => row.id).join(",") || "none"}`, actor]);
    for (const continuation of continuations.rows) await db.query("insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values($1,$2,'CONTINUE_RANGE',$3,$4)", [entities[table], continuation.id, `${reason}; continued_from=${original.id}; replaced_by=${replacementId}; effective=${continuation.effective_from}..${continuation.effective_to || "infinity"}`, actor]);
  }
}
