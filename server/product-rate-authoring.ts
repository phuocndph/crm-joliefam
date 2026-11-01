import type express from 'express';
import type {Pool,PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {payrollCapability} from './permission-policy.js';
import {codeKey} from './product-labor-resolver.js';
import {preservePayrollApprovalHistory} from './payroll-approval-history.js';

type Action='CREATE'|'UPDATE'|'APPROVE'|'DISCARD';
type Db=Pick<PoolClient,'query'>;
const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status});};
export function stableProductRateJson(value:unknown):string {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(stableProductRateJson).join(',')+']';
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableProductRateJson((value as Record<string,unknown>)[key])).join(',')+'}';
}
const digest=(value:unknown)=>createHash('sha256').update(stableProductRateJson(value)).digest('hex');
export function productRateText(value:unknown,label:string):string{
  if(typeof value!=='string'||/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(value)||value.includes('\u0000'))fail(`${label} phải là chuỗi văn bản hợp lệ, không chứa ký tự rỗng.`);
  return value as string;
}
export function productRateUuid(value:unknown,label='Mã bản ghi'){
  const text=productRateText(value,label);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text))fail(`${label} không hợp lệ.`);
  return text.toLowerCase();
}
export function productRateDate(value:unknown,label='Ngày hiệu lực'){
  const text=productRateText(value,label);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))fail(`${label} phải có định dạng YYYY-MM-DD.`);
  const[y,m,d]=text.split('-').map(Number),leap=y%4===0&&(y%100!==0||y%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(y<1||m<1||m>12||d<1||d>days[m-1])fail(`${label} không hợp lệ.`);
  return text;
}
export function productRateExact(value:unknown){
  const text=productRateText(value,'Đơn giá');
  if(!/^\d{1,16}(?:\.\d{1,2})?$/.test(text))fail('Đơn giá phải là chuỗi số dương, tối đa 16 chữ số nguyên và 2 chữ số lẻ.');
  const[whole,fraction='']=text.split('.'),cents=fraction.padEnd(2,'0');
  if(BigInt(whole)*100n+BigInt(cents)<=0n)fail('Đơn giá phải lớn hơn 0.');
  return BigInt(whole).toString()+'.'+cents;
}
const normalized=(value:unknown,label:string,min:number,max:number)=>{
  const text=productRateText(value,label).normalize('NFC').trim();
  if(text.length<min||text.length>max)fail(`${label} cần từ ${min} đến ${max} ký tự.`);
  return text;
};
const optional=(value:unknown,label:string)=>value===null?null:normalized(value,label,1,1000);
export function parseProductRateAction(action:Action,input:unknown,routeId?:unknown){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('Nội dung đơn giá phải là một đối tượng.');
  const raw=input as Record<string,unknown>;
  const expected=action==='CREATE'||action==='UPDATE'?['product_id','piece_rate_code','piece_rate_name','rate','unit','effective_from','effective_to','source_reference','reason','idempotency_key']:['reason','idempotency_key'];
  if(action!=='CREATE')expected.push('expected_basis');
  const keys=Object.keys(raw);
  if(keys.length!==expected.length||keys.some(key=>!expected.includes(key)))fail('Nội dung thiếu trường bắt buộc hoặc có trường không được hỗ trợ.');
  // Validate every text/id before connecting, including rejected decimal/date spellings.
  for(const [key,value]of Object.entries(raw))if(value!==null)productRateText(value,key);
  const recordId=action==='CREATE'?null:productRateUuid(routeId);
  const reason=normalized(raw.reason,'Lý do',3,1000),key=productRateText(raw.idempotency_key,'Mã thao tác');
  if(!/^[A-Za-z0-9._:-]{8,200}$/.test(key))fail('Mã thao tác không hợp lệ.');
  const basis=action==='CREATE'?null:productRateText(raw.expected_basis,'Phiên bản nguồn');
  if(basis!==null&&!/^[a-f0-9]{64}$/.test(basis))fail('Phiên bản nguồn không hợp lệ. Hãy tải lại danh sách.');
  let draft:null|{product_id:string|null;piece_rate_code:string;piece_rate_name:string;rate:string;unit:string;effective_from:string;effective_to:string|null;source_reference:string|null}=null;
  if(action==='CREATE'||action==='UPDATE'){
    const code=normalized(raw.piece_rate_code,'Mã công Excel',1,120),name=normalized(raw.piece_rate_name,'Tên công việc',1,500),unit=productRateText(raw.unit,'Đơn vị');
    if(!codeKey(code)||codeKey(code).length>120)fail('Mã công Excel sau chuẩn hóa phải có từ 1 đến 120 ký tự.');
    if(!['PIECE','SET','HOUR','METER'].includes(unit))fail('Đơn vị phải là sản phẩm, bộ, giờ hoặc mét.');
    const from=productRateDate(raw.effective_from),to=raw.effective_to===null?null:productRateDate(raw.effective_to,'Ngày kết thúc');
    if(to!==null&&to<from)fail('Ngày kết thúc phải từ ngày hiệu lực trở đi.');
    draft={product_id:raw.product_id===null?null:productRateUuid(raw.product_id,'Sản phẩm liên kết'),piece_rate_code:code,piece_rate_name:name,rate:productRateExact(raw.rate),unit,effective_from:from,effective_to:to,source_reference:optional(raw.source_reference,'Nguồn tham chiếu')};
  }
  return{action,recordId,raw,reason,key,basis,draft};
}
export function productRateRequestHash(actor:string,request:ReturnType<typeof parseProductRateAction>){return digest({request_schema_version:1,actor_id:actor,action:request.action,route_record_id:request.recordId,body:request.raw});}

// All dates/timestamps/rate remain database text. Do not hash numeric JSON through Number.
const projection=`r.id,r.product_id,r.piece_rate_code,r.piece_rate_name,r.rate::text rate_exact,r.rate_unit unit,
  r.effective_from::text effective_from,r.effective_to::text effective_to,r.status,r.reason,r.source_reference,
  r.source_row,r.continued_from_id,to_char(r.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created_at,
  to_char(r.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') updated_at`;
export type ProductRateBusinessRow={id:string;product_id:string|null;piece_rate_code:string|null;piece_rate_name:string|null;rate_exact:string;unit:string;effective_from:string;effective_to:string|null;status:string;reason:string|null;source_reference:string|null;source_row:number|null;continued_from_id:string|null;created_at:string;updated_at:string};
function business(row:ProductRateBusinessRow){return{id:row.id,product_id:row.product_id,code_key:codeKey(row.piece_rate_code),piece_rate_code:row.piece_rate_code,piece_rate_name:row.piece_rate_name,rate_exact:row.rate_exact,unit:row.unit,effective_from:row.effective_from,effective_to:row.effective_to,status:row.status,reason:row.reason,source_reference:row.source_reference,source_row:row.source_row,continued_from_id:row.continued_from_id,created_at:row.created_at,updated_at:row.updated_at};}
export function productRateBasis(target:ProductRateBusinessRow,approved:ProductRateBusinessRow[]){return digest({basis_schema_version:1,target:business(target),approved_code_set:approved.filter(row=>row.status==='APPROVED'&&codeKey(row.piece_rate_code)===codeKey(target.piece_rate_code)).sort((a,b)=>a.id.localeCompare(b.id)).map(business)});}
async function approvedSet(db:Db,code:string|null){
  // PostgreSQL lower() differs from ECMAScript for dotted I and final sigma.
  // One full batch and the canonical JS key keep list/basis/history identical.
  const rows=(await db.query(`select ${projection} from local_product_rates r where r.status='APPROVED' order by r.id`)).rows as ProductRateBusinessRow[];
  return rows.filter(row=>codeKey(row.piece_rate_code)===codeKey(code));
}
async function rowById(db:Db,id:string){return(await db.query(`select ${projection} from local_product_rates r where r.id=$1`,[id])).rows[0] as ProductRateBusinessRow|undefined;}
function dto(row:ProductRateBusinessRow,approved:ProductRateBusinessRow[],product?:{sku?:string;name?:string}){return{...row,tenant_id:'local-tenant',product_sku:product?.sku||null,display_name:row.piece_rate_name||product?.name||null,rate:Number(row.rate_exact),currency_code:'VND',created_by:null,approved_by:null,approved_at:null,basis:productRateBasis(row,approved)};}
export async function assertProductRateAuthoringAuthority(db:Db,actor:string,requestRole:string,write:boolean){
  if(!actor)fail('Cần đăng nhập.',401);
  const current=(await db.query(`select r.role,array(select permission_type from local_employee_permissions where user_id=p.user_id and enabled) grants
    from local_user_profiles p join local_user_roles r on r.user_id=p.user_id where p.user_id=$1 and p.is_active and r.is_active
    order by case r.role when 'admin' then 1 when 'manager' then 2 when 'accountant' then 3 when 'team_leader' then 4 else 5 end limit 1`,[actor])).rows[0];
  const role=String(current?.role||''),grants=new Set<string>(current?.grants||[]),allowed=write?['admin','manager']:['admin','manager','accountant'];
  if(role!==requestRole||!allowed.includes(role)||!(write?payrollCapability(role,'payroll_rate_manage',grants):payrollCapability(role,'payroll_rate_view',grants)||payrollCapability(role,'payroll_rate_manage',grants)))fail('Bạn không có quyền thao tác đơn giá.',403);
}
type Dependencies={pool:Pick<Pool,'connect'>;actor:()=>string;role:()=>string;lockShared:(client:PoolClient)=>Promise<void>;sendError:(res:express.Response,error:unknown)=>void};
export function registerProductRateAuthoring(app:express.Express,d:Dependencies){
  app.get('/api/payroll/product-rates',async(req,res)=>{
    let client:PoolClient|undefined;
    try{
      const params=new URL(req.originalUrl,'http://local.invalid').searchParams;
      if([...params.keys()].some(key=>key!=='productId')||params.getAll('productId').length>1)fail('Bộ lọc sản phẩm không hợp lệ.');
      const product=params.has('productId')?productRateUuid(params.get('productId'),'Sản phẩm liên kết'):null;
      client=await d.pool.connect();await client.query('begin isolation level repeatable read read only');
      await assertProductRateAuthoringAuthority(client,d.actor(),d.role(),false);
      const rows=(await client.query(`select ${projection},p.sku product_sku,p.name product_name from local_product_rates r left join local_products p on p.id=r.product_id ${product?'where r.product_id=$1':''} order by r.effective_from desc,r.created_at desc`,product?[product]:[])).rows;
      const approved=(await client.query(`select ${projection} from local_product_rates r where r.status='APPROVED' order by r.id`)).rows;
      const result=rows.map(row=>dto(row,approved,{sku:row.product_sku,name:row.product_name}));await client.query('commit');res.json(result);
    }catch(error){if(client)await client.query('rollback').catch(()=>undefined);d.sendError(res,error);}finally{client?.release();}
  });
  for(const action of ['CREATE','UPDATE','APPROVE','DISCARD'] as const){
    const route=action==='CREATE'?'/api/payroll/product-rates':`/api/payroll/product-rates/:id${action==='UPDATE'?'':'/'+action.toLowerCase()}`;
    const handler:express.RequestHandler=async(req,res)=>{
      let client:PoolClient|undefined;
      try{
        const request=parseProductRateAction(action,req.body,req.params.id),actor=d.actor(),requestRole=d.role(),requestHash=productRateRequestHash(actor,request);
        client=await d.pool.connect();await client.query('begin');await d.lockShared(client);
        await client.query("select pg_advisory_xact_lock(hashtextextended('payroll-product-rate-config',0))");
        await assertProductRateAuthoringAuthority(client,actor,requestRole,true);
        const receipt=(await client.query('select actor_id,action,record_id,request_hash,response_status,response_body from local_product_rate_action_receipts where idempotency_key=$1',[request.key])).rows[0];
        if(receipt){
          const identityMatches=receipt.actor_id===actor&&receipt.action===action&&(action==='CREATE'?receipt.record_id===receipt.response_body.id:receipt.record_id===request.recordId);
          if(!identityMatches||receipt.request_hash!==requestHash)fail('Mã thao tác đã dùng cho nội dung khác. Hãy tạo thao tác mới.',409);
          await client.query('commit');res.status(receipt.response_status).json(receipt.response_body);return;
        }
        let id=request.recordId;
        if(action!=='CREATE'){
          const locked=await client.query('select id from local_product_rates where id=$1 for update',[id]);
          if(!locked.rows.length)fail('Không tìm thấy đơn giá.',404);
          const current=(await rowById(client,id!))!;
          if(productRateBasis(current,await approvedSet(client,current.piece_rate_code))!==request.basis)fail('Nguồn đơn giá đã thay đổi. Hãy tải lại danh sách và kiểm tra trước khi lưu.',409);
          if(current.status!=='DRAFT')fail('Chỉ được thao tác bản nháp. Hãy tải lại danh sách.',409);
          if(action==='UPDATE'&&current.product_id!==request.draft!.product_id)fail('Không được đổi sản phẩm liên kết của bản nháp. Hãy tạo bản nháp mới.',409);
        }
        if(request.draft){
          const value=request.draft;
          if(value.product_id&&!(await client.query('select id from local_products where id=$1 and is_active=true',[value.product_id])).rows.length)fail('Không tìm thấy sản phẩm CRM đang hoạt động.',409);
          const values=[value.product_id,value.piece_rate_code,value.piece_rate_name,value.rate,value.unit,value.effective_from,value.effective_to,value.source_reference,request.reason];
          if(action==='CREATE')id=(await client.query(`insert into local_product_rates(product_id,piece_rate_code,piece_rate_name,rate,rate_unit,effective_from,effective_to,source_reference,reason,status,local_modified_at)
            values($1,$2,$3,$4::numeric,$5,$6,$7,$8,$9,'DRAFT',now()) returning id`,values)).rows[0].id;
          else await client.query(`update local_product_rates set product_id=$1,piece_rate_code=$2,piece_rate_name=$3,rate=$4::numeric,rate_unit=$5,effective_from=$6,effective_to=$7,source_reference=$8,reason=$9,updated_at=now(),local_modified_at=now() where id=$10`,[...values,id]);
        }else if(action==='APPROVE'){
          const current=(await rowById(client,id!))!;
          // Imported drafts must satisfy the same exact source contract before approval.
          parseProductRateAction('CREATE',{product_id:current.product_id,piece_rate_code:current.piece_rate_code,piece_rate_name:current.piece_rate_name,rate:current.rate_exact,unit:current.unit,effective_from:current.effective_from,effective_to:current.effective_to,source_reference:current.source_reference,reason:request.reason,idempotency_key:request.key});
          await preservePayrollApprovalHistory(client,'local_product_rates',id!,actor,request.reason);
          await client.query("update local_product_rates set status='APPROVED',updated_at=now(),local_modified_at=now() where id=$1",[id]);
        }else await client.query("update local_product_rates set status='RETIRED',updated_at=now(),local_modified_at=now() where id=$1",[id]);
        await client.query("insert into local_payroll_audit_events(entity_type,entity_id,action,reason,actor_id) values('product_rates',$1,$2,$3,$4)",[id,action,request.reason,actor]);
        const row=(await rowById(client,id!))!,product=row.product_id?(await client.query('select sku,name from local_products where id=$1',[row.product_id])).rows[0]:undefined;
        const response=dto(row,await approvedSet(client,row.piece_rate_code),product),status=action==='CREATE'?201:200;
        // Persist the exact JSON shape returned by express (including legacy NaN -> null).
        const body=JSON.parse(JSON.stringify(response));
        await client.query('insert into local_product_rate_action_receipts(idempotency_key,actor_id,action,record_id,request_hash,response_status,response_body) values($1,$2,$3,$4,$5,$6,$7::jsonb)',[request.key,actor,action,id,requestHash,status,JSON.stringify(body)]);
        await client.query('commit');res.status(status).json(body);
      }catch(error){if(client)await client.query('rollback').catch(()=>undefined);d.sendError(res,error);}finally{client?.release();}
    };
    if(action==='UPDATE')app.patch(route,handler);else app.post(route,handler);
  }
}
