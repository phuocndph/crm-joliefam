/* eslint-disable @typescript-eslint/no-explicit-any */
import type express from 'express';
import type {PoolClient} from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {pool} from './db/bootstrap.js';
import {normalizeOrderLines,sameProductionLine} from './production-sales-workflow.js';
import {validateProductionSewingDecision} from './production-sewing-decision.js';
import {productSupplyClassificationState,productSupplySelection} from './product-fulfillment-classification.js';
type Row=Record<string,any>;
type DB=Pick<PoolClient,'query'>;
export type OrderShipmentDependencies={actor:()=>string;role:()=>string;transaction:<T>(fn:(client:PoolClient)=>Promise<T>)=>Promise<T>;lockShared:(client:PoolClient)=>Promise<void>;sendError:(res:express.Response,error:unknown)=>void};
const fail=(message:string,status=409):never=>{throw Object.assign(new Error(message),{status});};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const quantity=(value:unknown)=>{const text=String(value??'');if(!/^\d+(?:\.\d{1,4})?$/.test(text)||!(Number(text)>0)||Number(text)>9999999999)fail('Số lượng phải dương, tối đa 4 chữ số thập phân.',400);return text;};
const sourceSignature=(lines:Row[])=>JSON.stringify(lines.map(line=>({source_line_key:line.source_line_key,product_id:line.product_id,ordered_quantity:String(line.ordered_quantity),color:line.color||null,size:line.size||null,dimensions:line.dimensions||null})).sort((a,b)=>a.source_line_key.localeCompare(b.source_line_key)));
const publicSource=(source:Row)=>Object.fromEntries(['source_line_key','source_line_index','product_id','product_name','product_sku','ordered_quantity','color','size','dimensions','legacy'].filter(key=>source[key]!==undefined).map(key=>[key,source[key]]));
export const publicShipment=(shipment:Row)=>({...Object.fromEntries(['id','order_id','production_order_id','inventory_document_id','shipment_number','status','dispatched_at','delivered_at','recipient_name','delivery_evidence','carrier_reference','created_by','delivered_by','created_at'].map(key=>[key,shipment[key]])),lines:(shipment.lines||[]).map((line:Row)=>({...line,source_snapshot:publicSource(line.source_snapshot||{})})),receipts:shipment.receipts||[]});
const orderId=(value:unknown)=>{const text=String(value??'');if(!text.trim()||text.length>200||[...text].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127))fail('Mã đơn bán không hợp lệ.',400);return text;};

export function createOrderShipmentService(d:OrderShipmentDependencies){
 const privileged=()=>['admin','manager'].includes(d.role());
 const has=async(db:DB,rights:string[])=>privileged()||Boolean((await db.query('select 1 from local_employee_permissions where user_id=$1 and enabled and permission_type=any($2::text[])',[d.actor(),rights])).rows[0]);
 const requireRights=async(db:DB,rights:string[])=>{if(!await has(db,rights))fail('Bạn chưa được cấp quyền giao hàng.',403);};
 async function authorize(db:DB,id:string,write=false,dispatch=false,lock=false){
  if(d.role()==='team_leader')fail('Tổ trưởng không được thao tác giao hàng.',403);
  await requireRights(db,write?['orders','ghn_tracking','shipping_companies']:['orders','ghn_tracking','shipping_companies','production_manage','production_sales_workflow','production_view','production_sales_submit']);
  if(dispatch){await requireRights(db,['inventory_documents']);await requireRights(db,['inventory_confirm']);}
  const sale=(await db.query(`select * from local_orders where id=$1${lock?' for update':''}`,[orderId(id)])).rows[0];
  if(!sale)fail('Không tìm thấy đơn bán.',404);
  if(!privileged()&&sale.manager_id!==d.actor()&&sale.assignee_id!==d.actor())fail('Chỉ được xử lý giao hàng của đơn mình phụ trách.',403);
  return sale as Row;
 }
 const snapshotMatches=(current:Row|undefined,snapshot:Row)=>snapshot.legacy
  ? Boolean(current&&String(current.product_id||'')===String(snapshot.product_id||'')&&['color','size','dimensions'].every(key=>String(current[key]||'')===String(snapshot[key]||'')))
  : sameProductionLine(current,snapshot);
 async function currentSupply(db:DB,id:string,route:string,revision?:number){
  await db.query('select id from local_products where id=$1 for share',[id]);
  const product=(await db.query(productSupplySelection+' where p.id=$1',[id])).rows[0];
  const classification=(await db.query('select * from local_product_supply_classifications where product_id=$1 order by version desc limit 1',[id])).rows[0];
  const state=product?productSupplyClassificationState(product,classification):null;
  if(!product||product.is_active===false||state?.status!=='CONFIRMED'||state.route!==route||(revision!==undefined&&state.revision!==revision))fail('Cách đáp ứng sản phẩm đã đổi; cần đối soát trước khi xuất giao.');
 }
 async function selection(db:DB,sale:Row,input:Row,lock=false){
  if(Boolean(input.output_id)===Boolean(input.purchase_plan_id))fail('Mỗi dòng chọn đúng một nguồn hàng.',400);
  if(!uuid.test(String(input.output_id||input.purchase_plan_id)))fail('Nguồn hàng không hợp lệ.',400);
  const source=await normalizeOrderLines(db,sale);
  if(input.output_id){
   const row=(await db.query(`select x.*,i.product_id,i.product_name,i.color,i.size,i.dimensions,i.fabric_variant_id,i.sewing_code_selection,i.source_order_item_key,i.sales_request_line_id,o.order_id,o.status production_status,o.workflow_generation,
    k.base_unit,k.is_active inventory_active,k.legacy_source_type,k.legacy_source_id,w.is_active warehouse_active,r.source_line_snapshot,r.ordered_quantity,
    coalesce((select sum(l.quantity) from local_production_shipment_lines l where l.output_id=x.id),0) used
    from local_production_outputs x join local_production_order_items i on i.id=x.order_item_id join local_production_orders o on o.id=x.production_order_id
    join local_inventory_items k on k.id=x.inventory_item_id join local_inventory_warehouses w on w.id=x.warehouse_id
    left join local_production_sales_request_lines r on r.id=i.sales_request_line_id
    where x.id=$1 and o.order_id::text=$2 and x.inventory_receipt_id is not null${lock?' for update of x,o':''}`,[input.output_id,sale.id])).rows[0];
   if(!row||!['RELEASED','IN_PROGRESS','COMPLETED'].includes(row.production_status)||row.workflow_generation!=='WORKFLOW_V3'||!row.inventory_active||!row.warehouse_active)fail('Chọn thành phẩm từ lệnh còn hiệu lực, đã nhập kho.');
   const current=source.find(line=>line.source_line_key===row.source_order_item_key);
   const saved=row.source_line_snapshot?{product_id:row.product_id,ordered_quantity:row.ordered_quantity,source_line_snapshot:row.source_line_snapshot}:{legacy:true,product_id:row.product_id,color:row.color,size:row.size,dimensions:row.dimensions};
   if(!snapshotMatches(current,saved))fail('Dòng đơn nguồn đã đổi; cần đối soát trước khi xuất giao.');
   if(row.base_unit!=='PIECE')fail('Chỉ xuất giao thành phẩm đơn vị CÁI; đơn vị khác cần quy đổi được phê duyệt.');
   const mapping=(await db.query('select inventory_item_id from local_production_product_inventory_maps where product_id=$1',[row.product_id])).rows[0];
   if(mapping&&String(mapping.inventory_item_id)!==String(row.inventory_item_id))fail('Ánh xạ mã thành phẩm đã đổi; cần đối soát trước khi xuất giao.');
   if(!mapping&&(!['products','product','PRODUCT'].includes(String(row.legacy_source_type||''))||String(row.legacy_source_id||'')!==String(row.product_id)))fail('Thành phẩm chưa có ánh xạ mã kho được xác nhận; cần đối soát trước khi xuất giao.');
   if(!await validateProductionSewingDecision(db,row))await currentSupply(db,row.product_id,'SEW');
   const available=(await db.query('select greatest($1::numeric-$2::numeric,0) quantity',[row.quantity_good,row.used])).rows[0].quantity;
   return {...row,output_id:row.id,purchase_plan_id:null,source_type:'SEW',source_line_key:row.source_order_item_key,current,available_quantity:String(available)};
  }
  const row=(await db.query(`select p.*,r.request_id,r.source_line_snapshot,r.ordered_quantity,r.requested_quantity,r.product_name,s.status request_status,
    k.is_active inventory_active,k.base_unit inventory_unit,w.is_active warehouse_active,
    coalesce((select sum(v.reserved_quantity-v.released_quantity-v.consumed_quantity) from local_purchase_stock_reservations v where v.plan_id=p.id),0) held
    from local_purchase_fulfillment_plans p join local_production_sales_request_lines r on r.id=p.sales_request_line_id join local_production_sales_requests s on s.id=r.request_id
    join local_inventory_items k on k.id=p.inventory_item_id join local_inventory_warehouses w on w.id=p.warehouse_id
    where p.id=$1 and p.order_id=$2${lock?' for update of p,r,s':''}`,[input.purchase_plan_id,sale.id])).rows[0];
  if(!row||row.status!=='ACTIVE'||row.request_status!=='ACCEPTED'||!row.inventory_active||!row.warehouse_active||row.base_unit!=='PIECE'||row.inventory_unit!=='PIECE')fail('Kế hoạch hàng nhập không còn đủ điều kiện xuất giao.');
  const current=source.find(line=>line.source_line_key===row.source_line_key);
  if(!sameProductionLine(current,{product_id:row.product_id,ordered_quantity:row.ordered_quantity,source_line_snapshot:row.source_line_snapshot}))fail('Dòng đơn nguồn đã đổi; cần đối soát trước khi xuất giao.');
  const mapping=(await db.query('select inventory_item_id from local_production_product_inventory_maps where product_id=$1',[row.product_id])).rows[0];
  if(!mapping||String(mapping.inventory_item_id)!==String(row.inventory_item_id))fail('Ánh xạ hàng nhập đã đổi; cần đối soát trước khi xuất giao.');
  await currentSupply(db,row.product_id,'PURCHASE',Number(row.fulfillment_revision));
  return {...row,output_id:null,purchase_plan_id:row.id,source_type:'PURCHASE',current,available_quantity:String(row.held)};
 }
 async function shipmentView(db:DB,id:string){
  const shipment=(await db.query('select * from local_production_shipments where id=$1',[id])).rows[0];
  if(!shipment)fail('Không tìm thấy phiếu giao.',404);
  const lines=(await db.query(`select l.*,m.document_id inventory_document_id from local_production_shipment_lines l join local_inventory_movements m on m.id=l.inventory_movement_id where l.shipment_id=$1 order by l.id`,[id])).rows;
  const receipts=(await db.query('select * from local_order_delivery_events where shipment_id=$1 order by created_at,id',[id])).rows;
  return {...shipment,lines,receipts};
 }
 async function command(action:string,body:Row,authorizeCommand:(client:PoolClient)=>Promise<unknown>,handler:(client:PoolClient,key:string)=>Promise<Row>){
  const key=String(body.idempotency_key||'').trim();if(!key||key.length>200)fail('Thiếu khóa chống gửi trùng hợp lệ.',400);
  const fingerprint=createHash('sha256').update(JSON.stringify({action,body})).digest('hex');
  return d.transaction(async client=>{
   await client.query("select pg_advisory_xact_lock(hashtextextended('production-source-sync',0))");await d.lockShared(client);
   await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`production-dispatch:${key}`]);
   await authorizeCommand(client);
   const replay=(await client.query('select * from local_dispatch_requests where idempotency_key=$1',[key])).rows[0];
   if(replay){if(replay.actor_id!==d.actor()||replay.fingerprint!==fingerprint)fail('Khóa gửi trùng đã dùng cho nội dung khác.');const shipmentId=replay.result?.shipment?.id;if(!shipmentId)fail('Kết quả giao hàng cũ chưa đủ dữ kiện; tải lại phiếu giao.');return {shipment:publicShipment(await shipmentView(client,shipmentId)),...(typeof replay.result.order_delivered==='boolean'?{order_delivered:replay.result.order_delivered}:{}),...(typeof replay.result.reconciliation_required==='boolean'?{reconciliation_required:replay.result.reconciliation_required}:{}),reused:true};}
   const result=await handler(client,key);await client.query('insert into local_dispatch_requests(idempotency_key,actor_id,fingerprint,result) values($1,$2,$3,$4::jsonb)',[key,d.actor(),fingerprint,JSON.stringify(result)]);return {...result,reused:false};
  });
 }
 async function dispatch(body:Row,legacy?:{productionOrderId:string;originalBody:Row}){
  const saleId=legacy?(await pool.query('select order_id from local_production_orders where id=$1',[legacy.productionOrderId])).rows[0]?.order_id:body.order_id;
  return command(legacy?`SHIP:${legacy.productionOrderId}`:`ORDER_SHIP:${saleId}`,legacy?.originalBody||body,
   client=>authorize(client,String(saleId||''),true,true),async(client,key)=>{
    const sale=await authorize(client,String(saleId||''),true,true,true);
    if(['cancelled','returned','delivered'].includes(String(sale.status).toLowerCase()))fail('Đơn bán không còn đủ điều kiện xuất giao.');
    const source=await normalizeOrderLines(client,sale);
    const previousShipments=(await client.query('select order_source_snapshot from local_production_shipments where order_id=$1',[sale.id])).rows;
    const priorLines=(await client.query('select l.source_order_item_key,l.source_snapshot from local_production_shipment_lines l join local_production_shipments s on s.id=l.shipment_id where s.order_id=$1',[sale.id])).rows;
    if(previousShipments.some(header=>Array.isArray(header.order_source_snapshot)&&sourceSignature(header.order_source_snapshot)!==sourceSignature(source))||priorLines.some(line=>!snapshotMatches(source.find(current=>current.source_line_key===line.source_order_item_key),line.source_snapshot)))fail('Đơn nguồn đã đổi sau khi xuất giao; cần đối soát trước khi giao tiếp.');
    const inputs=Array.isArray(body.lines)?body.lines as Row[]:[];if(!inputs.length||inputs.length>100)fail('Chọn từ 1 đến 100 dòng giao hàng.',400);
    const seen=new Set<string>(),selected:Row[]=[];
    for(const input of [...inputs].sort((a,b)=>String(a.output_id||a.purchase_plan_id).localeCompare(String(b.output_id||b.purchase_plan_id)))){
     const identity=String(input.output_id||input.purchase_plan_id);if(seen.has(identity))fail('Nguồn giao hàng bị lặp.',400);seen.add(identity);
     const row=await selection(client,sale,input,true);if(legacy&&String(row.production_order_id)!==legacy.productionOrderId)fail('Thành phẩm không thuộc lệnh được chọn.');
     const amount=quantity(input.quantity),used=(await client.query('select coalesce(sum(l.quantity),0) quantity from local_production_shipment_lines l join local_production_shipments s on s.id=l.shipment_id where s.order_id=$1 and l.source_order_item_key=$2',[sale.id,row.source_line_key])).rows[0].quantity;
     const previous=selected.filter(value=>value.source_line_key===row.source_line_key).map(value=>value.amount);
     if((await client.query('select $1::numeric>$2::numeric or $1::numeric+$3::numeric+coalesce((select sum(q) from unnest($5::numeric[]) q),0)>$4::numeric exceeds',[amount,row.available_quantity,used,row.current.ordered_quantity,previous])).rows[0].exceeds)fail('Giao vượt phần hàng sẵn có hoặc số lượng còn đặt của dòng đơn.');
     selected.push({...row,amount});
    }
    for(const stock of [...new Set(selected.map(row=>`${row.inventory_item_id}:${row.warehouse_id}`))].sort())await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`inventory-stock:${stock}`]);
    const productionIds=[...new Set(selected.map(row=>row.production_order_id).filter(Boolean))];
    const shipment=(await client.query('insert into local_production_shipments(production_order_id,order_id,shipment_number,carrier_reference,created_by,order_source_snapshot) values($1,$2,$3,$4,$5,$6::jsonb) returning *',[selected.every(row=>row.source_type==='SEW')&&productionIds.length===1?productionIds[0]:null,sale.id,`GH-${randomUUID().slice(0,12)}`,String(body.carrier_reference||'').slice(0,500)||null,d.actor(),JSON.stringify(await normalizeOrderLines(client,sale))])).rows[0];
    const documents:Row[]=[];
    for(const row of selected){
     const consumptions:Row[]=[];
     if(row.purchase_plan_id){
      const holds=(await client.query('select * from local_purchase_stock_reservations where plan_id=$1 and reserved_quantity>released_quantity+consumed_quantity order by created_at,id for update',[row.purchase_plan_id])).rows;
      let remaining=row.amount;
      for(const hold of holds){const take=(await client.query('select least($1::numeric,$2::numeric-$3::numeric-$4::numeric) quantity',[remaining,hold.reserved_quantity,hold.released_quantity,hold.consumed_quantity])).rows[0].quantity;if(Number(take)>0){await client.query('update local_purchase_stock_reservations set consumed_quantity=consumed_quantity+$2::numeric,updated_at=now() where id=$1',[hold.id,take]);consumptions.push({reservation_id:hold.id,quantity:String(take)});remaining=(await client.query('select $1::numeric-$2::numeric quantity',[remaining,take])).rows[0].quantity;}}
      if(Number(remaining)>0)fail('Phần giữ hàng đã thay đổi; tải lại trước khi xuất giao.');
     }
     const stock=(await client.query(`select coalesce(sum(quantity_delta),0) quantity,case when bool_or(value_delta is null) then null when sum(quantity_delta)>0 then sum(value_delta)/sum(quantity_delta) else null end cost from local_inventory_movements where inventory_item_id=$1 and warehouse_id=$2`,[row.inventory_item_id,row.warehouse_id])).rows[0];
     if((await client.query('select $1::numeric<$2::numeric insufficient',[stock.quantity,row.amount])).rows[0].insufficient)fail('Tồn kho không đủ để xuất giao.');
     const document=(await client.query(`insert into local_inventory_documents(document_number,document_type,status,transaction_at,warehouse_id,description,idempotency_key,production_order_id,created_by,confirmed_at) values($1,'ISSUE','CONFIRMED',now(),$2,$3,$4,$5,$6,now()) returning *`,[`PX-GH-${randomUUID().slice(0,12)}`,row.warehouse_id,`Xuất giao ${shipment.shipment_number}`,`order-shipment:${key}:${row.output_id||row.purchase_plan_id}`,row.production_order_id||null,d.actor()])).rows[0];
     await client.query('insert into local_inventory_document_lines(document_id,inventory_item_id,quantity,unit,input_unit_cost,description) values($1,$2,$3,$4,$5,$6)',[document.id,row.inventory_item_id,row.amount,row.base_unit,stock.cost,`Giao ${row.current.product_name}`]);
     const movement=(await client.query(`insert into local_inventory_movements(document_id,inventory_item_id,warehouse_id,movement_kind,quantity_delta,unit,unit_cost,value_delta,transaction_at,source_movement_id,created_by) values($1,$2,$3,'ISSUE',-$4::numeric,$5,$6,-$4::numeric*$6::numeric,now(),$7,$8) returning *`,[document.id,row.inventory_item_id,row.warehouse_id,row.amount,row.base_unit,stock.cost,row.output_id?row.inventory_movement_id:null,d.actor()])).rows[0];
     const shipmentLine=(await client.query('insert into local_production_shipment_lines(shipment_id,output_id,purchase_plan_id,source_order_item_key,quantity,inventory_movement_id,source_snapshot) values($1,$2,$3,$4,$5,$6,$7::jsonb) returning id',[shipment.id,row.output_id,row.purchase_plan_id,row.source_line_key,row.amount,movement.id,JSON.stringify(row.current)])).rows[0];
     for(const consumption of consumptions)await client.query('insert into local_shipment_hold_consumptions(shipment_line_id,reservation_id,quantity) values($1,$2,$3)',[shipmentLine.id,consumption.reservation_id,consumption.quantity]);
     await client.query("insert into local_inventory_audit_events(entity_type,entity_id,action,actor_id,reason) values('inventory_documents',$1,'CONFIRM',$2,$3)",[document.id,d.actor(),`Xuất giao ${shipment.shipment_number}`]);
     documents.push(document);
    }
    if(documents.length===1)await client.query('update local_production_shipments set inventory_document_id=$2 where id=$1',[shipment.id,documents[0].id]);
    return {shipment:publicShipment(await shipmentView(client,shipment.id))};
   });
 }
 async function deliver(id:string,body:Row,legacy=false){
  if(!uuid.test(id))fail('Phiếu giao không hợp lệ.',400);
  const pointer=(await pool.query('select order_id from local_production_shipments where id=$1',[id])).rows[0];if(!pointer)fail('Không tìm thấy phiếu giao.',404);
  return command(legacy?`DELIVER:${id}`:`ORDER_DELIVER:${id}`,body,client=>authorize(client,pointer.order_id,true),async client=>{
   const sale=await authorize(client,pointer.order_id,true,false,true);
   const shipment=(await client.query('select * from local_production_shipments where id=$1 for update',[id])).rows[0];
   const recipient=String(body.recipient_name||'').trim(),evidence=String(body.delivery_evidence||'').trim(),date=String(body.delivered_at||new Date().toISOString());
   if(!recipient||recipient.length>300||!evidence||evidence.length>4000||Number.isNaN(Date.parse(date))||Date.parse(date)>Date.now()+60000||Date.parse(date)<Date.parse(shipment.dispatched_at))fail('Nhập người nhận, bằng chứng và thời điểm giao hợp lệ.',400);
   const lines=(await client.query('select * from local_production_shipment_lines where shipment_id=$1 order by id for update',[id])).rows;
   const inputs=body.lines===undefined?(await client.query('select id shipment_line_id,quantity-delivered_quantity quantity from local_production_shipment_lines where shipment_id=$1 and delivered_quantity<quantity',[id])).rows:body.lines;
   if(!Array.isArray(inputs)||!inputs.length||inputs.length>100)fail('Chọn dòng và số lượng khách đã nhận.',400);
   const seen=new Set<string>();
   for(const input of inputs){const line=lines.find(value=>value.id===input.shipment_line_id);if(!line||seen.has(line.id))fail('Dòng nhận hàng không thuộc phiếu hoặc bị lặp.',400);seen.add(line.id);const amount=quantity(input.quantity);
    if((await client.query('select $1::numeric+$2::numeric>$3::numeric exceeds',[line.delivered_quantity,amount,line.quantity])).rows[0].exceeds)fail('Số nhận vượt phần đã xuất giao còn lại.');
    await client.query('insert into local_order_delivery_events(shipment_id,shipment_line_id,quantity,recipient_name,delivery_evidence,delivered_at,actor_id) values($1,$2,$3,$4,$5,$6,$7)',[id,line.id,amount,recipient,evidence,date,d.actor()]);
    await client.query('update local_production_shipment_lines set delivered_quantity=delivered_quantity+$2::numeric where id=$1',[line.id,amount]);
   }
   await client.query(`update local_production_shipments set status=case when not exists(select 1 from local_production_shipment_lines where shipment_id=$1 and delivered_quantity<quantity) then 'DELIVERED' else 'PARTIALLY_DELIVERED' end,recipient_name=$2,delivery_evidence=$3,delivered_at=$4,delivered_by=$5 where id=$1`,[id,recipient,evidence,date,d.actor()]);
   let all=false,reconciliationRequired=false;
   try{const source=await normalizeOrderLines(client,sale),delivered=(await client.query('select l.* from local_production_shipment_lines l join local_production_shipments s on s.id=l.shipment_id where s.order_id=$1',[sale.id])).rows;
    const headers=(await client.query('select order_source_snapshot from local_production_shipments where order_id=$1',[sale.id])).rows;
    reconciliationRequired=headers.some(header=>Array.isArray(header.order_source_snapshot)&&sourceSignature(header.order_source_snapshot)!==sourceSignature(source))||delivered.some(line=>!snapshotMatches(source.find(current=>current.source_line_key===line.source_order_item_key),line.source_snapshot));
    all=!reconciliationRequired&&source.length>0&&!['cancelled','returned'].includes(String(sale.status).toLowerCase())&&delivered.every(line=>snapshotMatches(source.find(current=>current.source_line_key===line.source_order_item_key),line.source_snapshot));
    for(const current of source){const total=(await client.query('select coalesce(sum(l.delivered_quantity),0) quantity from local_production_shipment_lines l join local_production_shipments s on s.id=l.shipment_id where s.order_id=$1 and l.source_order_item_key=$2',[sale.id,current.source_line_key])).rows[0].quantity;if((await client.query('select $1::numeric<>$2::numeric mismatch',[total,current.ordered_quantity])).rows[0].mismatch)all=false;}
   }catch(error){if(Number((error as {status?:number}).status)!==409)throw error;reconciliationRequired=true;}
   if(all)await client.query("update local_orders set status='delivered',updated_at=now(),local_modified_at=now() where id=$1",[sale.id]);
   return {shipment:publicShipment(await shipmentView(client,id)),order_delivered:all,reconciliation_required:reconciliationRequired};
  });
 }
 async function view(id:string){
  const sale=await authorize(pool,id);let source:Row[]=[],sourceChanged=false,validationError:string|null=null;
  try{source=await normalizeOrderLines(pool,sale);}catch(error){if(Number((error as {status?:number}).status)!==409)throw error;sourceChanged=true;validationError=String((error as Error).message);}
  const ids=(await pool.query('select id from local_production_shipments where order_id=$1 order by created_at desc,id',[sale.id])).rows;
  const shipments=await Promise.all(ids.map(row=>shipmentView(pool,row.id)));
  const snapshotIncomplete=shipments.some(shipment=>!Array.isArray(shipment.order_source_snapshot));
  if(shipments.some(shipment=>Array.isArray(shipment.order_source_snapshot)&&sourceSignature(shipment.order_source_snapshot)!==sourceSignature(source)||shipment.lines.some((line:Row)=>!snapshotMatches(source.find(current=>current.source_line_key===line.source_order_item_key),line.source_snapshot))))sourceChanged=true;
  const candidates:Row[]=[];
  if(!['cancelled','returned','delivered'].includes(String(sale.status).toLowerCase())&&source.length){
   const outputs=(await pool.query('select x.id from local_production_outputs x join local_production_orders o on o.id=x.production_order_id where o.order_id::text=$1 and x.inventory_receipt_id is not null',[sale.id])).rows;
   const plans=(await pool.query("select id from local_purchase_fulfillment_plans where order_id=$1 and status='ACTIVE'",[sale.id])).rows;
   for(const input of [...outputs.map(row=>({output_id:row.id})),...plans.map(row=>({purchase_plan_id:row.id}))]){try{const row=await selection(pool,sale,input);candidates.push({source_type:row.source_type,output_id:row.output_id,purchase_plan_id:row.purchase_plan_id,source_line_key:row.source_line_key,product_name:row.current.product_name,warehouse_id:row.warehouse_id,available_quantity:row.available_quantity});}catch(error){if(Number((error as {status?:number}).status)!==409)throw error;validationError=String((error as Error).message);}}
  }
  return {order_id:sale.id,source_changed:sourceChanged,snapshot_incomplete:snapshotIncomplete,source_validation_error:validationError,source_lines:source.map(publicSource),candidates,shipments:shipments.map(publicShipment)};
 }
 return {dispatch,deliver,view};
}

export function registerOrderShipments(app:express.Express,d:OrderShipmentDependencies){
 const service=createOrderShipmentService(d);
 app.get('/api/order-shipments',async(req,res)=>{try{res.json(await service.view(orderId(req.query.order_id)));}catch(error){d.sendError(res,error);}});
 app.post('/api/order-shipments',async(req,res)=>{try{const result=await service.dispatch(req.body||{});res.status(result.reused?200:201).json(result);}catch(error){d.sendError(res,error);}});
 app.post('/api/order-shipments/:id/deliver',async(req,res)=>{try{res.json(await service.deliver(String(req.params.id),req.body||{}));}catch(error){d.sendError(res,error);}});
 return service;
}
