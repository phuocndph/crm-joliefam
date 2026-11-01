/* eslint-disable @typescript-eslint/no-explicit-any -- SQL rows are checked at this interoperability boundary. */
import type {Pool,PoolClient} from 'pg';
import {orderFinancialProjection} from './order-financial.js';
import {type Draft,type DraftLine,fail,ident,internalHash,iso,list,normalize,obj,phone,sum,txt,vnd as strictVnd,lineAmount,quantity,quantityUnits} from './zcrm-domain.js';
export type Db=Pick<Pool|PoolClient,'query'>;
export type Connection={id:string;org_id:string;tenant_id:string;origin:string;enabled:boolean;token_hash:string;token_encrypted:string;webhook_encrypted:string;revision:number};
type Data=Record<string,any>;
export const tombstone=(table:string,alias:string)=>`not exists(select 1 from local_projection_tombstones t where t.source_table='${table}' and t.source_key=${alias}.id::text)`;
function incomplete(message:string):never{return fail(message,503,'DATA_INCOMPLETE');}
function vnd(value:unknown,label?:string){try{return strictVnd(value,label);}catch{return incomplete('Dữ liệu số tiền gốc chưa đầy đủ hoặc không phải VND nguyên.');}}
export async function customerRow(db:Db,c:Connection,id:string,lock=false){
 const row=(await db.query(`select x.* from local_customers x join zcrm.customer_grants g on g.customer_id=x.id and g.connection_id=$1
  where x.id=$2 and x.is_active and (x.tenant_id=$3 or x.tenant_id is null) and ${tombstone('customers','x')} for share of x,g`,[c.id,id,c.tenant_id])).rows[0];
 if(!row)fail('Không tìm thấy khách trong phạm vi kết nối.',404,'NOT_FOUND');return row as Data;
}
export function customerView(row:Data,origin:string|null){
 if(!['hotel','individual'].includes(row.commerce_kind))incomplete('Khách chưa được xác nhận loại cá nhân/khách sạn trong CRM.');
 const contacts=list(row.commerce_contacts,500).map(raw=>{const r=obj(raw);return {id:ident(r.id),name:txt(r.name,200),...(r.phone?{phone:txt(r.phone,40)}:{})};});
 const addresses=list(row.addresses,500).map(raw=>{const r=obj(raw);return {...(r.id?{id:ident(r.id)}:{}),name:txt(r.name,200),phone:txt(r.phone,40),address:txt(r.address,2000)};});
 if(!addresses.length&&row.address)addresses.push({name:'',phone:'',address:txt(row.address,2000)});
 return {id:ident(row.id),code:txt(row.customer_code||row.id,128),name:txt(row.name,200,true),kind:row.commerce_kind,...(row.phone?{phone:txt(row.phone,40)}:{}),contacts,addresses,...(origin?{url:origin+'/customers?customerId='+encodeURIComponent(row.id)}:{})};
}
export async function customerRows(db:Db,c:Connection,q:string){
 const rows=(await db.query(`select x.* from local_customers x join zcrm.customer_grants g on g.customer_id=x.id and g.connection_id=$1
  where x.is_active and x.commerce_kind is not null and (x.tenant_id=$2 or x.tenant_id is null) and ${tombstone('customers','x')} order by x.id`,[c.id,c.tenant_id])).rows as Data[];
 const term=normalize(q),digits=phone(q);return rows.filter(r=>!term||normalize([r.customer_code,r.name].join(' ')).includes(term)||digits.length>=3&&[r.phone,...(Array.isArray(r.phones)?r.phones.map(p=>p.number):[])].some(p=>phone(p).includes(digits)));
}
export async function assertActor(db:Db,c:Connection,id:string){
 const row=(await db.query(`select p.user_id,r.role,r.assigned_by from local_user_profiles p join zcrm.actor_mappings m on m.crm_user_id=p.user_id and m.connection_id=$1
 join lateral(select role,assigned_by from local_user_roles where user_id=p.user_id and is_active order by case role when 'admin' then 1 when 'manager' then 2 else 3 end limit 1) r on true
 where p.user_id=$2 and p.is_active and p.user_id<>'local-admin' for share of p,m`,[c.id,id])).rows[0];
 if(!row)fail('Nhân viên chưa được ghép hoặc đã bị khóa.',403,'ACTOR_FORBIDDEN');
 if(['admin','manager'].includes(row.role))return id;
 const manager=String(row.assigned_by||'');if(!manager||!(await db.query("select 1 from local_user_profiles p join local_user_roles r on r.user_id=p.user_id and r.is_active and r.role in ('admin','manager') where p.user_id=$1 and p.is_active",[manager])).rows[0])fail('Nhân viên chưa được gán quản lý CRM đang hoạt động.',403,'ACTOR_MANAGER_MISSING');
 return manager;
}
export async function productChoices(db:Db,c:Connection,lock=false,ids?:string[]){
 const rows=(await db.query(`select p.*,g.warehouse_ids from local_products p join zcrm.product_grants g on g.product_id=p.id and g.connection_id=$1
 where p.is_active and p.commerce_kind is not null and p.commerce_unit is not null and (p.tenant_id=$2 or p.tenant_id is null) and ${tombstone('products','p')}
 and ($3::uuid[] is null or p.id=any($3::uuid[])) order by p.id${lock?' for share of p,g':''}`,[c.id,c.tenant_id,ids||null])).rows as Data[];
 const products:Data[]=[];
 for(const r of rows){
  const warehouses=r.warehouse_ids as string[];
  const choices=warehouses.length?(await db.query('select id,name from local_inventory_warehouses where id=any($1::uuid[]) and is_active order by id'+(lock?' for share':''),[warehouses])).rows:[{id:'',name:''}];
  for(const w of choices){let available:number|null=null;
   if(w.id){const inventory=(await db.query(`select i.base_unit,coalesce(sum(m.quantity_delta),0)::numeric balance
    from local_production_product_inventory_maps pm join local_inventory_items i on i.id=pm.inventory_item_id and i.is_active
    left join local_inventory_movements m on m.inventory_item_id=i.id and m.warehouse_id=$2
    where pm.product_id=$1 group by i.base_unit`,[r.id,w.id])).rows[0];
    if(inventory&&inventory.base_unit===r.commerce_unit&&Number.isFinite(Number(inventory.balance)))available=Number(inventory.balance);
   }
   const price=r.price==null?null:vnd(r.price,'Giá bán sản phẩm');
   products.push({id:String(r.id),sku:txt(r.sku,128),name:txt(r.name,200,true),kind:r.commerce_kind,unit:txt(r.commerce_unit,30,true),price,
    ...(r.commerce_variant?{variant:txt(r.commerce_variant,200)}:{}),...(w.id?{warehouseId:String(w.id),warehouseName:txt(w.name,200)}:{}),available,
    updatedAt:iso(r.updated_at),requiredFields:list(r.commerce_required_fields,30).map(v=>txt(v,80,true)),_key:String(r.id)+'|'+String(w.id),_revision:iso(r.updated_at)});
  }
 }
 return products;
}
export function publicProduct(p:Data){const {_key,_revision,...result}=p;return result;}
export async function priceDraft(db:Db,c:Connection,draft:Draft,actor:string){
 await assertActor(db,c,actor);if(!draft.customerId)fail('Cần chọn khách đã liên kết.');await customerRow(db,c,draft.customerId,true);
 const choices=await productChoices(db,c,true,draft.lines.map(l=>l.productId)),warnings=new Set<string>(['Báo giá này chưa giữ kho. Phí giao hàng và VAT chưa thu ở bước gửi nháp (0 VND); quản lý xác nhận trước khi duyệt.']);
 const requested=new Map<string,bigint>();for(const line of draft.lines){const key=internalHash([line.productId,line.variant,line.warehouseId]);requested.set(key,(requested.get(key)||0n)+quantityUnits(line.quantity));}
 const signatures:unknown[]=[],lines=draft.lines.map((line,index)=>{
  const p=choices.find(p=>p.id===line.productId&&(p.variant||'')===line.variant&&(p.warehouseId||'')===line.warehouseId);
  if(!p)fail(`Dòng ${index+1}: sản phẩm, biến thể hoặc kho đã đổi/ngừng bán.`);
  if(p.kind!==line.kind||p.unit!==line.unit)fail(`Dòng ${index+1}: loại hàng hoặc đơn vị không khớp CRM.`);
  for(const field of p.requiredFields)if(!line.specifications[field]?.trim())fail(`Dòng ${index+1}: thiếu ${field}.`);
  if(line.kind==='stock'&&p.available!==null&&quantityUnits(p.available)<requested.get(internalHash([line.productId,line.variant,line.warehouseId]))!)fail(`Dòng ${index+1}: tổng số lượng cùng sản phẩm/biến thể/kho vượt tồn hiện tại.`);
  if(p.available===null)warnings.add('Có sản phẩm chưa xác định tồn khả dụng; CRM không xác nhận giữ kho.');
  if(line.kind==='custom')warnings.add('Giá hàng đặt riêng là giá đề xuất chờ quản lý duyệt.');
  const unitPrice=line.kind==='custom'?line.proposedPrice:p.price;if(unitPrice===null)fail(`Dòng ${index+1}: CRM chưa có giá bán/giá đề xuất.`,422,'PRICE_UNKNOWN');
  signatures.push({id:p.id,variant:p.variant||'',warehouseId:p.warehouseId||'',kind:p.kind,unit:p.unit,price:p.price,updatedAt:p.updatedAt,requiredFields:p.requiredFields});
  return {productId:line.productId,quantity:line.quantity,unitPrice,total:lineAmount(line.quantity,unitPrice)};
 });
 return {signature:internalHash(signatures),lines,subtotal:sum(lines.map(l=>l.total)),warnings:[...warnings],names:draft.lines.map(l=>choices.find(p=>p.id===l.productId&&(p.warehouseId||'')===l.warehouseId&&(p.variant||'')===l.variant)!.name as string)};
}
export async function orderRow(db:Db,c:Connection,customerId:string,id:string,lock=false){
 await customerRow(db,c,customerId,lock);
 const row=(await db.query(`select o.* from local_orders o where o.id=$1 and o.customer_id=$2 and o.tenant_id=$3 and ${tombstone('orders','o')}${lock?' for update':' for share'}`,[id,customerId,c.tenant_id])).rows[0];
 if(!row)fail('Không tìm thấy đơn đúng khách và tổ chức.',404,'NOT_FOUND');return row as Data;
}
export const status=(code:string,label:string)=>({code,label});
export async function hydrateOrderStates(db:Db,rows:Data[]):Promise<Data[]>{
 if(!rows.length)return rows;const ids=rows.map(r=>r.id);
 const tracking=await db.query(`select g.order_id::text order_id,g.ghn_status from local_ghn_tracking g where g.order_id::text=any($1::text[]) and ${tombstone('ghn_tracking','g')}`,[ids]);
 const shipments=await db.query('select order_id::text order_id,status from local_production_shipments where order_id::text=any($1::text[])',[ids]);
 const production=await db.query(`select p.order_id::text order_id,p.status from local_production_orders p where p.order_id::text=any($1::text[]) and ${tombstone('production_orders','p')}`,[ids]);
 const group=(items:Data[],field:string)=>{const result=new Map<string,string[]>();for(const row of items)result.set(row.order_id,[...(result.get(row.order_id)||[]),String(row[field]||'')]);return result;};
 const t=group(tracking.rows,'ghn_status'),s=group(shipments.rows,'status'),p=group(production.rows,'status');return rows.map(o=>({...o,_ghn_statuses:t.get(o.id)||[],_shipment_statuses:s.get(o.id)||[],_production_statuses:p.get(o.id)||[]}));
}
export function orderStatuses(o:Data,amounts?:Data){
 const approval=o.approval_status?status(o.approval_status,({pending:'Chờ duyệt',approved:'Đã duyệt',returned:'Cần bổ sung',rejected:'Đã từ chối'} as Data)[o.approval_status]):status('approved','Đơn CRM hiện có');
 const ghn:string[]=o._ghn_statuses||[],shipments:string[]=o._shipment_statuses||[],production:string[]=o._production_statuses||[];
 const issue=['delivery_fail','exception','lost','damage','return','waiting_to_return','returning','return_transporting','return_sorting','return_fail','returned'].some(s=>ghn.includes(s))||o.status==='returned';
 const moving=['shipped','delivering','partially_delivered'].includes(o.status)||shipments.some(status=>['DISPATCHED','PARTIALLY_DELIVERED'].includes(status))||['picking','picked','storing','transporting','sorting','delivering','money_collect_picking','money_collect_delivering'].some(s=>ghn.includes(s));
 // A carrier/dispatch confirmation proves that shipment was delivered, not
 // that every ordered line and quantity was fulfilled. Keep reconciliation
 // active until the canonical order explicitly confirms full completion.
 const deliveredEvidence=ghn.some(s=>['delivered','self_delivered'].includes(s))||shipments.some(status=>['DELIVERED','PARTIALLY_DELIVERED'].includes(status));
 const partial=o.status==='partially_delivered'||deliveredEvidence&&!['delivered','self_delivered'].includes(o.status);
 const partialLabel=o.status==='partially_delivered'||shipments.some(status=>['DISPATCHED','PARTIALLY_DELIVERED'].includes(status))||moving?'Đã giao một phần':'Đã giao kiện; chờ xác nhận đủ đơn';
 const hasProduction=production.some(s=>!['COMPLETED','CANCELLED','completed','cancelled'].includes(s));
 const cancelled=['cancel','cancelled'].includes(o.status)||o.approval_status==='rejected',completed=['delivered','self_delivered'].includes(o.status)&&!issue;
 const processing=cancelled?status('cancelled','Đã hủy'):issue?status('problem','Giao hàng cần xử lý'):completed?status('completed','Hoàn thành'):partial?status('partially_delivered',partialLabel):moving?status('shipping','Đang giao hàng'):hasProduction?status('production','Đang sản xuất'):status(o.status||'pending',o.status==='processing'?'Đang xử lý':o.status==='confirmed'?'Đã xác nhận':'Chờ xử lý');
 const payment=amounts?(amounts.due===0?status('paid','Đã đủ tiền'):amounts.collected>amounts.refunded?status('partial','Thanh toán một phần'):status('pending','Chưa thanh toán')):status(o.payment_status||'pending',({paid:'Đã thanh toán',partial:'Thanh toán một phần',pending:'Chưa thanh toán'} as Data)[o.payment_status]||'Theo trạng thái CRM');
 const delivery=issue?status('problem','Giao thất bại/hoàn hoặc sự cố'):completed?status('delivered','Đã giao'):partial?status('partially_delivered',partialLabel):moving?status('shipping','Đang giao'):status('pending','Chưa giao');
 return {approval,processing,payment,delivery};
}
export function orderSummary(o:Data){return {id:ident(o.id),customerId:ident(o.customer_id),code:txt(o.order_number||o.display_order_number||o.id,128),version:Number(o.integration_version),updatedAt:iso(o.updated_at||o.created_at),currency:'VND',total:vnd(o.total_amount),...orderStatuses(o,o.remaining_amount===undefined?undefined:{due:o.remaining_amount,collected:o.total_paid,refunded:o.refunded})};}
export function commercial(o:Data){
 const s=o.commercial_snapshot as Data|null;if(!s||s.complete!==true||s.historyComplete!==true||!s.provenance)incomplete('Đơn chưa có đối chiếu đầy đủ tiền, cọc thỏa thuận và lịch sử hoàn/trả. Quản lý cần xác nhận dữ liệu gốc.');
 const subtotal=vnd(s.subtotal),discount=vnd(s.discount),shipping=vnd(s.shipping),tax=vnd(s.tax),deposit=vnd(s.deposit),total=vnd(o.total_amount);
 if(discount>subtotal||subtotal-discount+shipping+tax!==total||deposit>total)incomplete('Snapshot tài chính không khớp tổng đơn.');
 return {subtotal,discount,shipping,tax,deposit};
}
export async function moneyLedgers(db:Db,o:Data){
 const s=commercial(o);
 const contracts=(await db.query(`select c.deposit_amount,c.total_amount,c.customer_id,c.tenant_id from local_contracts c where c.order_id=$1 and coalesce(c.status,'')<>'cancelled' and ${tombstone('contracts','c')} order by c.id`,[o.id])).rows as Data[];
 if(contracts.length>1)incomplete('Đơn có nhiều hợp đồng còn hiệu lực; cần đối chiếu điều khoản cọc trước khi tổng hợp.');
 if(contracts.length){const contract=contracts[0];if(contract.customer_id!==o.customer_id||contract.tenant_id!==o.tenant_id||vnd(contract.total_amount)!==vnd(o.total_amount))incomplete('Hợp đồng chưa khớp khách, đơn vị hoặc tổng tiền đơn.');s.deposit=vnd(contract.deposit_amount);if(s.deposit>vnd(o.total_amount))incomplete('Cọc hợp đồng vượt tổng đơn.');}
 const payments=(await db.query(`select p.* from local_order_payments p where p.order_id=$1 and ${tombstone('order_payments','p')} order by p.payment_date,p.id`,[o.id])).rows as Data[];
 const refunds=(await db.query('select * from local_order_refunds where order_id=$1 order by created_at,id',[o.id])).rows as Data[];
 const returns=(await db.query('select * from local_order_returns where order_id=$1 order by created_at,id',[o.id])).rows as Data[];
 if(payments.length+refunds.length>1000||returns.length>500)incomplete('Lịch sử đơn vượt giới hạn hợp đồng v1.');
 const signed=(rows:Data[],key:string)=>{const n=rows.reduce((s,r)=>s+BigInt(vnd(r[key]))*(r.reversal_of?-1n:1n),0n);if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))incomplete('Sổ tiền vượt giới hạn hoặc đảo phiếu không hợp lệ.');return Number(n);};
 const financial=orderFinancialProjection(o,sum(payments.map(p=>vnd(p.payment_amount))),signed(refunds,'amount'),signed(returns,'credit_amount'));
 const collected=financial.total_paid,refunded=financial.refunded,credit=financial.return_credit,due=financial.remaining_amount;
 return {amounts:{...s,collected,refunded,due,returnCredit:credit,netCollected:financial.net_collected},credit,payments,refunds,returns};
}
function lineView(raw:Data,original:DraftLine|undefined,approved:boolean){
 const kind=raw.commerce_kind||original?.kind;if(!['stock','custom'].includes(kind))incomplete('Dòng hàng chưa xác nhận loại có sẵn/đặt riêng.');
 const specs=raw.commerce_specifications||original?.specifications||(typeof raw.specifications==='string'?{quyCach:raw.specifications}:{});
 try{quantity(raw.quantity);const s=obj(specs);if(Object.keys(s).length>30||Object.entries(s).some(([k,v])=>k.length>80||typeof v!=='string'||v.length>2000))throw new Error();}catch{incomplete('Số lượng hoặc quy cách dòng hàng gốc không hợp lệ.');}
 return {productId:ident(raw.product_id||original?.productId),name:txt(raw.name,200,true),kind,...(raw.variant?{variant:txt(raw.variant,200)}:{}),...(raw.warehouse_id?{warehouseId:ident(raw.warehouse_id)}:{}),quantity:Number(raw.quantity),unit:txt(raw.unit||original?.unit,30,true),proposedPrice:kind==='custom'?(original?.proposedPrice??raw.proposed_price??null):null,specifications:specs,attachments:original?.attachments||[],...(approved||kind==='stock'?{unitPrice:vnd(raw.price,'Giá chính thức')}:{})};
}
export async function orderView(db:Db,o:Data,origin:string|null){
 if(!o._ghn_statuses)o=(await hydrateOrderStates(db,[o]))[0];
 const {amounts,payments,refunds,returns}=await moneyLedgers(db,o),draft=o.intake_draft as Draft|null;
 const items=list(o.items,100).map((r,i)=>lineView(obj(r),draft?.lines[i],!o.approval_status||o.approval_status==='approved'));
 const calculated=sum(items.map((l,i)=>lineAmount(l.quantity,vnd((o.items[i] as Data).price))));if(calculated!==amounts.subtotal)incomplete('Tổng dòng sản phẩm không khớp snapshot tài chính.');
 const productions=(await db.query(`select e.created_at,e.stage,e.status,e.quantity_good from local_production_stage_events e join local_production_orders p on p.id=e.production_order_id where p.order_id=$1 order by e.created_at,e.id limit 1001`,[o.id])).rows as Data[];
 if(productions.length>1000)incomplete('Lịch sử sản xuất vượt giới hạn v1.');
 const shipments=(await db.query('select * from local_production_shipments where order_id=$1 order by created_at,id',[o.id])).rows as Data[];
 const ghn=(await db.query(`select g.* from local_ghn_tracking g where g.order_id::text=$1 and ${tombstone('ghn_tracking','g')} order by g.created_at,g.id`,[o.id])).rows as Data[];
 if(shipments.length+ghn.length>500)incomplete('Lịch sử giao hàng vượt giới hạn v1.');
 const shipmentViews=[];
 for(const s of shipments){const lines=(await db.query(`select l.quantity,l.source_order_item_key from local_production_shipment_lines l where l.shipment_id=$1 order by l.id`,[s.id])).rows as Data[];
  const details=lines.map(l=>{const item=(o.items as Data[]).find(i=>'sale:'+o.id+':'+i.id===l.source_order_item_key||i.id===l.source_order_item_key);return {name:txt(item?.name||l.source_order_item_key),quantity:Number(l.quantity),unit:txt(item?.unit||'',30)};});
  shipmentViews.push({id:String(s.id),carrier:'CRM',trackingCode:String(s.carrier_reference||s.shipment_number),status:s.status,lines:details,history:[{date:iso(s.dispatched_at),label:'Đã xuất giao'},...(s.delivered_at?[{date:iso(s.delivered_at),label:'Đã xác nhận nhận hàng'}]:[])]});
 }
 for(const g of ghn){if(shipments.some(s=>s.carrier_reference===g.ghn_order_code))continue;shipmentViews.push({id:String(g.id),carrier:'GHN',trackingCode:String(g.ghn_order_code),status:String(g.ghn_status_text||g.ghn_status||'unknown'),lines:[],history:[],...(typeof g.tracking_url==='string'&&g.tracking_url.startsWith('https://')?{trackingUrl:g.tracking_url}:{})});}
 const returnViews=returns.map(r=>({id:r.id,status:r.reversal_of?'reversal':'finalized',refunded:sum(refunds.filter(f=>f.return_id===r.id&&!f.reversal_of&&!refunds.some(x=>x.reversal_of===f.id)).map(f=>vnd(f.amount))),lines:list(r.lines,100).map(raw=>{const l=obj(raw);return {name:txt(l.name),quantity:Number(l.quantity),unit:txt(l.unit)};})}));
 return {...orderSummary(o),...orderStatuses(o,amounts),...(origin?{url:origin+'/orders?orderId='+encodeURIComponent(o.id)}:{}),...(o.ordered_by?{orderedBy:o.ordered_by}:{}),...(o.recipient_snapshot?{recipient:o.recipient_snapshot}:{}),...(o.intake_submitted_by?{owner:o.intake_submitted_by}:{}),...(o.confirmed_delivery_date?{confirmedDeliveryDate:o.confirmed_delivery_date}:{}),...(o.desired_delivery_date?{desiredDate:o.desired_delivery_date}:{}),lines:items,amounts,
  payments:[...payments.map(p=>({id:p.id,date:iso(p.payment_date||p.created_at),type:String(p.payment_type||'receipt'),amount:vnd(p.payment_amount),...(p.notes?{note:txt(p.notes)}:{})})),...refunds.map(r=>({id:r.id,date:iso(r.created_at),type:r.reversal_of?'refund_reversal':'refund',amount:vnd(r.amount),note:txt(r.reason)}))],
  production:productions.map(p=>({date:iso(p.created_at),label:String(p.stage)+' · '+String(p.status),note:'Đạt: '+p.quantity_good})),shipments:shipmentViews,returns:returnViews};
}
