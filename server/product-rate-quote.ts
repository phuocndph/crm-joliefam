import type express from 'express';
import type {Pool,PoolClient} from 'pg';
import {payrollCapability} from './permission-policy.js';
import {codeKey,semanticText} from './product-labor-resolver.js';

type ProductRateQuoteBlocker='MISSING_RATE'|'AMBIGUOUS_RATE'|'INVALID_RATE_SOURCE'|'ZERO_RATE_UNSUPPORTED';

const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status});};
export function parseProductRateQuoteQuery(params:URLSearchParams){
  const keys=[...params.keys()];
  if(keys.length!==3||keys.some(key=>!['code','date','quantity'].includes(key))||['code','date','quantity'].some(key=>params.getAll(key).length!==1))fail('Chỉ nhận một mã công Excel, ngày làm và số lượng.');
  const code=codeKey(params.get('code'));
  if(code.includes('\u0000'))fail('Mã công Excel không được chứa ký tự rỗng.');
  if(!code||code.length>120)fail('Mã công Excel phải có từ 1 đến 120 ký tự.');
  const date=params.get('date')||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))fail('Ngày làm phải có định dạng YYYY-MM-DD.');
  const [year,month,day]=date.split('-').map(Number),leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(year<1||month<1||month>12||day<1||day>days[month-1])fail('Ngày làm không hợp lệ.');
  const raw=params.get('quantity')||'';
  if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(raw))fail('Số lượng phải là số thập phân dương, tối đa 10 chữ số nguyên và 2 chữ số lẻ.');
  const [whole,fraction='']=raw.split('.'),cents=fraction.padEnd(2,'0');
  if(BigInt(whole)*100n+BigInt(cents)<=0n)fail('Số lượng phải lớn hơn 0.');
  return{code_key:code,date,quantity:BigInt(whole).toString()+'.'+cents};
}

export async function inspectProductRate(db:Pick<PoolClient,'query'>,request:ReturnType<typeof parseProductRateQuoteQuery>){
  // SQL lower() differs from the canonical ECMAScript key for some Unicode.
  // Read every active approved row once, then count all matching canonical keys.
  // Only PostgreSQL numeric performs quantity × price, without a fixed amount cast.
  const rows=(await db.query(`select id rate_id,piece_rate_code,piece_rate_name,rate_unit,
      rate::text unit_rate,effective_from::text effective_from,effective_to::text effective_to,
      round($2::numeric(12,2)*rate,2)::text amount
    from local_product_rates
    where status='APPROVED' and effective_from<=$1::date and (effective_to is null or effective_to>=$1::date)
    order by id`,[request.date,request.quantity])).rows.filter(row=>codeKey(row.piece_rate_code)===request.code_key);
  const result={...(rows.length===1?rows[0]:{}),candidate_count:rows.length};
  const blockers:ProductRateQuoteBlocker[]=[];
  if(result.candidate_count===0)blockers.push('MISSING_RATE');
  else if(result.candidate_count>1)blockers.push('AMBIGUOUS_RATE');
  else if(!semanticText(result.piece_rate_name)||!['PIECE','SET','HOUR','METER'].includes(result.rate_unit)
    ||typeof result.unit_rate!=='string'||!/^\d{1,16}\.\d{2}$/.test(result.unit_rate)
    ||typeof result.amount!=='string'||!/^\d+\.\d{2}$/.test(result.amount))blockers.push('INVALID_RATE_SOURCE');
  else if(/^0(?:\.0+)?$/.test(result.unit_rate))blockers.push('ZERO_RATE_UNSUPPORTED');
  const available=blockers.length===0;
  return{quote_schema_version:1,kind:'CONFIG_PRICE_INSPECTION',status:available?'AVAILABLE':'BLOCKED',...request,
    recorded_unit:available?result.rate_unit:null,selected_rate_id:available?result.rate_id:null,
    effective_from:available?result.effective_from:null,effective_to:available?result.effective_to:null,
    unit_rate:available?result.unit_rate:null,line_amount:available?result.amount:null,
    candidate_count:result.candidate_count,blockers,quantity_basis:'RECORDED_UNIT',unit_confirmation:'NOT_ASSESSED',mapping_status:'NOT_ASSESSED',pay_ready:false,operational_activation:'DISABLED'} as const;
}

export async function assertProductRateQuoteAuthority(db:Pick<PoolClient,'query'>,actor:string,requestRole:string){
  if(!actor)fail('Cần đăng nhập.',401);
  const current=(await db.query(`select r.role,
      array(select permission_type from local_employee_permissions where user_id=p.user_id and enabled) grants
    from local_user_profiles p join local_user_roles r on r.user_id=p.user_id
    where p.user_id=$1 and p.is_active and r.is_active
    order by case r.role when 'admin' then 1 when 'manager' then 2 when 'accountant' then 3 when 'team_leader' then 4 else 5 end
    limit 1`,[actor])).rows[0];
  const role=String(current?.role||''),grants=new Set<string>(current?.grants||[]);
  if(role!==requestRole||!['admin','manager','accountant'].includes(role)||!(payrollCapability(role,'payroll_rate_view',grants)||payrollCapability(role,'payroll_rate_manage',grants)))fail('Bạn không có quyền kiểm tra đơn giá.',403);
}

type Dependencies={pool:Pick<Pool,'connect'>;actor:()=>string;role:()=>string;sendError:(res:express.Response,error:unknown)=>void};
export function registerProductRateQuote(app:express.Express,d:Dependencies){
  app.get('/api/payroll/product-rates/quote',async(req,res)=>{
    let client:PoolClient|undefined;
    try{
      const query=parseProductRateQuoteQuery(new URL(req.originalUrl,'http://local.invalid').searchParams);
      client=await d.pool.connect();
      await client.query('begin isolation level repeatable read read only');
      await assertProductRateQuoteAuthority(client,d.actor(),d.role());
      const quote=await inspectProductRate(client,query);
      await client.query('commit');
      res.json(quote);
    }catch(error){if(client)await client.query('rollback').catch(()=>undefined);d.sendError(res,error);}
    finally{client?.release();}
  });
}
