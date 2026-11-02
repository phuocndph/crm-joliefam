import type {PoolClient} from 'pg';

const fail:(message:string,status?:number)=>never=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
type Extra={description:string;quantity:string;unit:string;unit_price:string};
const decimal=(value:unknown,label:string,integerDigits:number,positive:boolean)=>{
 if(typeof value!=='string'&&typeof value!=='number')fail(`${label} phải là số hợp lệ.`);
 const text=String(value);
 if(!new RegExp(`^\\d{1,${integerDigits}}(?:\\.\\d{1,2})?$`).test(text)||!Number.isFinite(Number(text))||(positive&&Number(text)<=0))fail(`${label} phải ${positive?'lớn hơn 0':'không âm'}, tối đa ${integerDigits} chữ số phần nguyên và 2 chữ số thập phân.`);
 return text;
};
export function plannedExtraInputs(value:unknown):Extra[]{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>50)fail('Mỗi sản phẩm có tối đa 50 dòng cộng thêm đang dùng.');
 return value.map((raw,index)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail(`Cộng thêm dòng ${index+1} không hợp lệ.`);
  const row=raw as Record<string,unknown>;
  if(Object.keys(row).some(key=>!['description','quantity','unit','unit_price'].includes(key)))fail('Chỉ nhập nội dung, số lượng, đơn vị và đơn giá; thành tiền do hệ thống tính.');
  if(typeof row.description!=='string'||!row.description.trim()||row.description.trim().length>200||/[\p{Cc}\p{Cs}]/u.test(row.description))fail(`Nội dung cộng thêm dòng ${index+1} cần từ 1 đến 200 ký tự hợp lệ.`);
  if(typeof row.unit!=='string'||!['cái','lần','bộ','mét','giờ'].includes(row.unit))fail(`Đơn vị cộng thêm dòng ${index+1} không hợp lệ.`);
  return{description:row.description.trim(),quantity:decimal(row.quantity,'Số lượng cộng thêm',10,true),unit:row.unit,unit_price:decimal(row.unit_price,'Đơn giá cộng thêm',14,false)};
 });
}
export async function requirePlannedExtraCostAccess(client:Pick<PoolClient,'query'>,actor:string,role:string){
 if(['admin','manager'].includes(role))return;
 if(!(await client.query("select 1 from local_employee_permissions where user_id=$1 and permission_type='inventory_cost_view' and enabled",[actor])).rows[0])fail('Cần quyền xem chi phí để lập hoặc hủy dự toán cộng thêm.',403);
}
// Caller owns the transaction/idempotency and locks the V3 parent before additions.
export async function appendPlannedExtras(client:PoolClient,orderId:string,itemId:string,input:unknown,actor:string,role:string){
 const rows=plannedExtraInputs(input);if(!rows.length)return [];
 await requirePlannedExtraCostAccess(client,actor,role);
 const parent=(await client.query('select status,workflow_generation from local_production_orders where id=$1 for update',[orderId])).rows[0];
 if(!parent||parent.workflow_generation!=='WORKFLOW_V3'||!['DRAFT','PLANNED','RELEASED','IN_PROGRESS','ON_HOLD','COMPLETED'].includes(parent.status))fail('Lệnh không còn cho phép bổ sung dự toán cộng thêm.',409);
 if(!(await client.query('select 1 from local_production_order_items where id=$1 and production_order_id=$2',[itemId,orderId])).rows[0])fail('Sản phẩm không thuộc lệnh sản xuất.',409);
 const active=Number((await client.query("select count(*) n from local_production_planned_extras where order_item_id=$1 and status='PLANNED'",[itemId])).rows[0].n);
 if(active+rows.length>50)fail('Mỗi sản phẩm có tối đa 50 dòng cộng thêm đang dùng.');
 const saved=[];
 for(const row of rows){
  if((await client.query('select $1::numeric*$2::numeric>99999999999999.9999 too_large',[row.quantity,row.unit_price])).rows[0].too_large)fail('Thành tiền cộng thêm vượt giới hạn ghi nhận tiền công.');
  const extra=(await client.query('insert into local_production_planned_extras(production_order_id,order_item_id,description,quantity,unit,unit_price,created_by) values($1,$2,$3,$4,$5,$6,$7) returning *',[orderId,itemId,row.description,row.quantity,row.unit,row.unit_price,actor])).rows[0];
  saved.push(extra);
  // No monetary values in the general dispatch audit stream.
  await client.query("insert into local_dispatch_audit_events(production_order_id,action,actor_id,data) values($1,'ADD_PLANNED_EXTRA',$2,$3::jsonb)",[orderId,actor,JSON.stringify({extra_id:extra.id,order_item_id:itemId,description:extra.description,quantity:extra.quantity,unit:extra.unit})]);
 }
 return saved;
}
