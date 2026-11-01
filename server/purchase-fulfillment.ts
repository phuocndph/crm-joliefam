/* eslint-disable @typescript-eslint/no-explicit-any */
/* Stock-first fulfillment for canonical PURCHASE sale lines. Inventory is
 * always derived from local_inventory_movements; holds only protect capacity. */
import type express from 'express';
import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {pool} from './db/bootstrap.js';
import {currentProductionLine,normalizeOrderLines,sameProductionLine} from './production-sales-workflow.js';
import {isLaborProduct,productSupplyClassificationState,productSupplySelection} from './product-fulfillment-classification.js';

type Row=Record<string,any>;
type Body=Record<string,unknown>;
type Dependencies={actor:()=>string;role:()=>string;transaction:<T>(handler:(client:PoolClient)=>Promise<T>)=>Promise<T>;capability:(client:Pick<PoolClient,'query'>,names:string[])=>Promise<void>;sendError:(res:express.Response,error:unknown)=>void};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status});};
const positive=(value:unknown,label:string)=>{const text=String(value??'').trim();if(!/^\d+(?:\.\d{1,4})?$/.test(text)||!(Number(text)>0))fail(`${label} phải là số dương, tối đa 4 chữ số thập phân.`);return text;};
const fingerprint=(action:string,body:Body)=>createHash('sha256').update(JSON.stringify({action,body})).digest('hex');
 const publicPlan=(row:Row)=>({id:row.id,request_line_id:row.sales_request_line_id,source_line_key:row.source_line_key,product_id:row.product_id,product_name:row.product_name,product_sku:row.product_sku,planned_quantity:String(row.planned_quantity),fulfillment_revision:Number(row.fulfillment_revision),inventory_item_id:row.inventory_item_id,inventory_item_code:row.inventory_item_code,inventory_item_name:row.inventory_item_name,warehouse_id:row.warehouse_id,warehouse_name:row.warehouse_name,base_unit:row.base_unit,status:row.status,physical_quantity:String(row.physical_quantity||0),reserved_quantity:String(row.reserved_quantity||0),available_quantity:String(row.available_quantity||0),held_quantity:String(row.held_quantity||0),needed_quantity:String(row.needed_quantity||0),received_quantity:String(row.received_quantity||0),shortage_quantity:String(row.shortage_quantity||0),shortage_id:row.shortage_id||null,source_changed:row.source_changed===true,reconciliation_required:row.reconciliation_required===true,source_validation_error:row.source_validation_error||null});

export function registerPurchaseFulfillment(app:express.Express,d:Dependencies){
 const privileged=()=>['admin','manager'].includes(d.role());
  const requirePlanAccess=async(client:Pick<PoolClient,'query'>,write=false,receipt=false)=>{
  await d.capability(client,['production_manage','production_sales_workflow']);
   await d.capability(client,['inventory_view']);
   if(write)await d.capability(client,['inventory_documents']);
  if(receipt)await d.capability(client,['inventory_confirm']);
 };
 async function requestScope(client:Pick<PoolClient,'query'>,requestId:string,lock=false){
  if(!uuid.test(requestId))fail('Yêu cầu Sale không hợp lệ.');
  const request=(await client.query(`select r.*,o.status order_status,o.manager_id,o.assignee_id,o.items order_items
    from local_production_sales_requests r join local_orders o on o.id=r.order_id where r.id=$1${lock?' for update of r,o':''}`,[requestId])).rows[0];
  if(!request)fail('Không tìm thấy yêu cầu Sale.',404);
  if(!privileged()&&request.submitted_by!==d.actor()&&request.manager_id!==d.actor()&&request.assignee_id!==d.actor())fail('Bạn không có quyền xử lý đơn Sale này.',403);
  return request as Row;
 }
 async function currentLine(client:Pick<PoolClient,'query'>,request:Row,line:Row,allowStale=false){
  if(!allowStale){
   if(request.status!=='ACCEPTED')fail('Yêu cầu Sale phải được tiếp nhận trước khi xử lý hàng nhập.',409);
   if(['cancelled','returned'].includes(String(request.order_status||'').toLowerCase()))fail('Đơn nguồn đã hủy/hoàn; hãy đối chiếu và giải phóng phần giữ hàng khi cần.',409);
   const lines=await normalizeOrderLines(client,{id:request.order_id,items:request.order_items});
   if(!sameProductionLine(currentProductionLine(lines,line),line))fail('Nội dung đơn nguồn đã thay đổi; cần đối chiếu trước khi xử lý hàng nhập.',409);
  }
 }
 async function purchaseProduct(client:Pick<PoolClient,'query'>,productId:string){
  const pointer=(await client.query('select id,price_list_id from local_products where id=$1 for update',[productId])).rows[0];
  if(!pointer)fail('Sản phẩm không còn trong danh mục local.',409);
  if(pointer.price_list_id)await client.query('select id from local_price_lists where id=$1 for share',[pointer.price_list_id]);
  const product=(await client.query(productSupplySelection+' where p.id=$1',[productId])).rows[0] as Row|undefined;
  if(!product||product.is_active===false||isLaborProduct(product))fail('Sản phẩm không còn đủ điều kiện xử lý hàng nhập.',409);
  const classification=(await client.query('select * from local_product_supply_classifications where product_id=$1 order by version desc limit 1 for update',[productId])).rows[0] as Row|undefined;
  const state=productSupplyClassificationState(product!,classification);
  if(state.status!=='CONFIRMED'||state.route!=='PURCHASE')fail(`Sản phẩm chưa được xác nhận là hàng nhập sẵn: ${state.reason}`,409);
  return {product,state};
 }
 async function lockStock(client:Pick<PoolClient,'query'>,itemId:string,warehouseId:string){
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`inventory-stock:${itemId}:${warehouseId}`]);
  const [physical,held]=await Promise.all([
   client.query('select coalesce(sum(quantity_delta),0) quantity from local_inventory_movements where inventory_item_id=$1 and warehouse_id=$2',[itemId,warehouseId]),
   client.query(`select coalesce(sum(r.reserved_quantity-r.released_quantity-r.consumed_quantity),0) quantity
     from local_purchase_stock_reservations r join local_purchase_fulfillment_plans p on p.id=r.plan_id
     where p.inventory_item_id=$1 and p.warehouse_id=$2 and r.reserved_quantity>r.released_quantity+r.consumed_quantity`,[itemId,warehouseId]),
  ]);
  return {physical:String(physical.rows[0].quantity||0),held:String(held.rows[0].quantity||0)};
 }
  async function command<T>(action:string,body:Body,authorize:(client:PoolClient)=>Promise<void>,handler:(client:PoolClient)=>Promise<T>){
  const key=String(body.idempotency_key||'').trim();if(!key||key.length>200)fail('Cần khóa chống gửi trùng hợp lệ.');const hash=fingerprint(action,body);
  return d.transaction(async client=>{
    // Sales requests, releases and purchase receipts acquire this first.  Their
    // row-lock orders differ by design, so the shared operation lock prevents a
    // cyclic wait without weakening the source or inventory row locks below.
    await client.query("select pg_advisory_xact_lock(hashtextextended('production-source-sync',0))");
   await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`purchase-fulfillment:${key}`]);
    // A cached command is only a response cache, never an authorization cache.
    // Verify the current role/grants and current request ownership before it can
    // be replayed after responsibilities have changed.
    await authorize(client);
   const existing=(await client.query('select * from local_purchase_fulfillment_commands where idempotency_key=$1',[key])).rows[0];
   if(existing){if(existing.actor_id!==d.actor()||existing.action!==action||existing.fingerprint!==hash)fail('Khóa chống gửi trùng đã được dùng cho nội dung khác.',409);return {...existing.result,reused:true} as T&{reused:boolean};}
   const result=await handler(client);await client.query('insert into local_purchase_fulfillment_commands(idempotency_key,actor_id,action,fingerprint,result) values($1,$2,$3,$4,$5::jsonb)',[key,d.actor(),action,hash,JSON.stringify(result)]);return {...(result as object),reused:false} as T&{reused:boolean};
  });
 }
 async function detail(client:Pick<PoolClient,'query'>,request:Row){
  const lines=(await client.query(`select l.*,p.name product_current_name,p.sku product_current_sku,pm.inventory_item_id mapped_inventory_item_id,
    i.code mapped_inventory_item_code,i.name mapped_inventory_item_name,i.base_unit mapped_base_unit
    from local_production_sales_request_lines l join local_products p on p.id=l.product_id
    left join local_production_product_inventory_maps pm on pm.product_id=l.product_id
    left join local_inventory_items i on i.id=pm.inventory_item_id and i.is_active
    where l.request_id=$1 order by l.source_line_index`,[request.id])).rows as Row[];
  const plans=(await client.query(`select distinct on (p.sales_request_line_id) p.*,i.code inventory_item_code,i.name inventory_item_name,w.name warehouse_name,
    coalesce((select sum(m.quantity_delta) from local_inventory_movements m where m.inventory_item_id=p.inventory_item_id and m.warehouse_id=p.warehouse_id),0) physical_quantity,
    coalesce((select sum(r.reserved_quantity-r.released_quantity-r.consumed_quantity) from local_purchase_stock_reservations r join local_purchase_fulfillment_plans allp on allp.id=r.plan_id where allp.inventory_item_id=p.inventory_item_id and allp.warehouse_id=p.warehouse_id),0) reserved_quantity,
    coalesce((select sum(r.reserved_quantity-r.released_quantity-r.consumed_quantity) from local_purchase_stock_reservations r where r.plan_id=p.id),0) held_quantity,
    coalesce((select sum(r.consumed_quantity) from local_purchase_stock_reservations r join local_purchase_fulfillment_plans history on history.id=r.plan_id where history.sales_request_line_id=p.sales_request_line_id),0) consumed_quantity,
    s.id shortage_id,coalesce(s.requested_quantity-s.received_quantity-s.cancelled_quantity,0) shortage_quantity,
    coalesce(s.received_quantity,0) received_quantity
    from local_purchase_fulfillment_plans p join local_inventory_items i on i.id=p.inventory_item_id join local_inventory_warehouses w on w.id=p.warehouse_id
    left join local_purchase_shortage_demands s on s.plan_id=p.id where p.sales_request_line_id=any($1::uuid[]) order by p.sales_request_line_id,p.created_at desc,p.id desc`,[lines.map(line=>line.id)])).rows as Row[];
  const planByLine=new Map(plans.map(plan=>[String(plan.sales_request_line_id),plan]));
  const projected=[] as Row[];
  for(const line of lines){
   const plan=planByLine.get(String(line.id));
   if(!plan)continue;
   const sourceLines=await normalizeOrderLines(client,{id:request.order_id,items:request.order_items});
    const sourceLineChanged=!sameProductionLine(currentProductionLine(sourceLines,line),line)||['cancelled','returned'].includes(String(request.order_status||'').toLowerCase());
    const product=line.product_id?(await client.query(productSupplySelection+' where p.id=$1',[line.product_id])).rows[0] as Row|undefined:undefined;
    const classification=product?(await client.query('select * from local_product_supply_classifications where product_id=$1 order by version desc limit 1',[line.product_id])).rows[0] as Row|undefined:undefined;
    const state=product?productSupplyClassificationState(product,classification):undefined;
    const classificationChanged=!state||state.status!=='CONFIRMED'||state.route!=='PURCHASE'||Number(plan.fulfillment_revision)!==Number(state.revision);
    const sourceChanged=sourceLineChanged||classificationChanged;
    const sourceValidationError=classificationChanged
      ? !state?'Sản phẩm không còn trong danh mục local; cần đối soát trước khi tiếp tục.'
        : `Cách đáp ứng sản phẩm đã thay đổi (${state.reason}); cần đối soát kế hoạch hàng nhập.`
      : null;
   const physical=String(plan.physical_quantity||0),reserved=String(plan.reserved_quantity||0),held=String(plan.held_quantity||0);
   const values=(await client.query('select greatest($1::numeric-$2::numeric,0) available,greatest($3::numeric-$4::numeric-$5::numeric,0) needed',[physical,reserved,line.requested_quantity,held,plan.consumed_quantity])).rows[0];
    projected.push({...plan,product_name:line.product_name,product_sku:line.product_sku,physical_quantity:physical,reserved_quantity:reserved,held_quantity:held,available_quantity:String(values.available),needed_quantity:String(values.needed),source_changed:sourceChanged,reconciliation_required:classificationChanged,source_validation_error:sourceValidationError});
  }
  const planIds=projected.map(row=>row.id);
   const candidates=planIds.length?(await client.query(`select p.id plan_id,m.id inventory_movement_id,d.document_number,m.transaction_at,m.quantity_delta,m.unit,
    coalesce((select sum(a.quantity) from local_purchase_receipt_allocations a where a.inventory_movement_id=m.id),0) allocated_quantity,
    greatest(m.quantity_delta-coalesce((select sum(a.quantity) from local_purchase_receipt_allocations a where a.inventory_movement_id=m.id),0),0) available_quantity
    from local_purchase_fulfillment_plans p join local_inventory_movements m on m.inventory_item_id=p.inventory_item_id and m.warehouse_id=p.warehouse_id
    join local_inventory_documents d on d.id=m.document_id
    where p.id=any($1::uuid[]) and p.status='ACTIVE' and d.status='CONFIRMED' and d.document_type='RECEIPT' and m.movement_kind='RECEIPT' and m.quantity_delta>0 and m.unit=p.base_unit
    order by m.transaction_at desc,m.id`,[planIds])).rows.map((row:Row)=>({...row,quantity:String(row.quantity_delta),allocated_quantity:String(row.allocated_quantity),available_quantity:String(row.available_quantity)})):[];
  return {request_id:request.id,plans:projected.map(publicPlan),receipt_candidates:candidates.map((row:Row)=>({plan_id:row.plan_id,inventory_movement_id:row.inventory_movement_id,document_number:row.document_number,transaction_at:row.transaction_at,quantity:row.quantity,allocated_quantity:row.allocated_quantity,available_quantity:row.available_quantity,unit:row.unit}))};
 }
 app.get('/api/purchase-fulfillment',async(req,res)=>{try{await requirePlanAccess(pool);const request=await requestScope(pool,String(req.query.request_id||''));res.json(await detail(pool,request));}catch(error){d.sendError(res,error);}});
 app.post('/api/purchase-fulfillment/plans',async(req,res)=>{try{const result=await command('PLAN',req.body||{},async client=>{await requirePlanAccess(client,true);await requestScope(client,String(req.body.request_id||''));},async client=>{
  await requirePlanAccess(client,true);const request=await requestScope(client,String(req.body.request_id||''),true);if(request.status!=='ACCEPTED')fail('Yêu cầu Sale phải được tiếp nhận trước khi giữ hàng.',409);
  const inputs=Array.isArray(req.body.lines)?req.body.lines as Body[]:[];if(!inputs.length||inputs.length>100)fail('Chọn từ 1 đến 100 dòng hàng nhập cần xử lý.');
  const byId=new Map<string,Body>();for(const input of inputs){const id=String(input.request_line_id||'');if(!uuid.test(id)||byId.has(id))fail('Danh sách dòng hàng nhập không hợp lệ hoặc bị lặp.');byId.set(id,input);}
  const locked=new Map<string,Row>();for(const id of [...byId.keys()].sort()){const line=(await client.query('select * from local_production_sales_request_lines where id=$1 and request_id=$2 for update',[id,request.id])).rows[0];if(!line)fail('Dòng hàng nhập không thuộc yêu cầu Sale.');locked.set(id,line);}
  const created:Row[]=[];
  for(const id of [...byId.keys()].sort()){
   const input=byId.get(id)!,line=locked.get(id)!;await currentLine(client,request,line);
   const {product,state}=await purchaseProduct(client,String(line.product_id));
   const itemId=String(input.inventory_item_id||''),warehouseId=String(input.warehouse_id||'');if(!uuid.test(itemId)||!uuid.test(warehouseId)||input.confirm_product_mapping!==true)fail('Chọn mã kho, kho thực hiện và xác nhận ánh xạ sản phẩm trước khi giữ hàng.');
   const inventory=(await client.query("select * from local_inventory_items where id=$1 and is_active and item_type='FINISHED_GOOD' for update",[itemId])).rows[0];const warehouse=(await client.query('select * from local_inventory_warehouses where id=$1 and is_active for share',[warehouseId])).rows[0];if(!inventory||!warehouse)fail('Mã thành phẩm kho hoặc kho thực hiện không còn hoạt động.',409);if(String(inventory.base_unit)!=='PIECE')fail('Hàng nhập theo đơn hiện chỉ hỗ trợ mã kho đơn vị CÁI. Cần cấu hình quy đổi được phê duyệt trước khi dùng đơn vị khác.',409);
   const mapping=(await client.query('select * from local_production_product_inventory_maps where product_id=$1 for update',[line.product_id])).rows[0];
   if(mapping&&String(mapping.inventory_item_id)!==itemId)fail('Sản phẩm đã có ánh xạ mã kho khác; cần đối soát riêng, không tự đổi khi đang lập kế hoạch.',409);
   if(!mapping)await client.query('insert into local_production_product_inventory_maps(product_id,inventory_item_id,created_by) values($1,$2,$3)',[line.product_id,itemId,d.actor()]);
   let plan=(await client.query("select * from local_purchase_fulfillment_plans where sales_request_line_id=$1 and status='ACTIVE' for update",[line.id])).rows[0] as Row|undefined;
   if(plan&&(String(plan.inventory_item_id)!==itemId||String(plan.warehouse_id)!==warehouseId||String(plan.base_unit)!==String(inventory.base_unit)))fail('Kế hoạch đã có ánh xạ kho khác; hãy dùng đúng kế hoạch đã xác nhận hoặc giải phóng phần giữ trước.',409);
   if(plan&&Number(plan.fulfillment_revision)!==Number(state.revision))fail('Cách đáp ứng sản phẩm đã thay đổi; hãy đối soát và giải phóng kế hoạch cũ trước khi lập lại.',409);
   if(!plan&&(await client.query(`select exists(select 1 from local_purchase_fulfillment_plans p join local_purchase_stock_reservations r on r.plan_id=p.id where p.sales_request_line_id=$1 and r.consumed_quantity>0) consumed`,[line.id])).rows[0].consumed)fail('Kế hoạch trước đã có hàng tiêu thụ; cần đối soát phần đã đáp ứng trước khi lập lại để tránh giữ trùng.',409);
   if(!plan){const snapshot={source_line_key:line.source_line_key,source_line_snapshot:line.source_line_snapshot,ordered_quantity:String(line.ordered_quantity),requested_quantity:String(line.requested_quantity),product_id:line.product_id,fulfillment_revision:state.revision};plan=(await client.query(`insert into local_purchase_fulfillment_plans(sales_request_line_id,order_id,source_line_key,product_id,fulfillment_revision,source_snapshot,inventory_item_id,warehouse_id,base_unit,planned_quantity,created_by) values($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) returning *`,[line.id,request.order_id,line.source_line_key,line.product_id,state.revision,JSON.stringify(snapshot),itemId,warehouseId,inventory.base_unit,line.requested_quantity,d.actor()])).rows[0];}
   const activePlan=plan as Row;
   const existing=(await client.query(`select coalesce(sum(reserved_quantity-released_quantity-consumed_quantity),0) held from local_purchase_stock_reservations where plan_id=$1`,[activePlan.id])).rows[0].held;
   const demand=(await client.query('select * from local_purchase_shortage_demands where plan_id=$1 for update',[activePlan.id])).rows[0] as Row|undefined;
   const outstanding=demand?String((await client.query('select greatest($1::numeric-$2::numeric-$3::numeric,0) quantity',[demand.requested_quantity,demand.received_quantity,demand.cancelled_quantity])).rows[0].quantity):'0';
   const consumed=(await client.query('select coalesce(sum(r.consumed_quantity),0) quantity from local_purchase_stock_reservations r join local_purchase_fulfillment_plans history on history.id=r.plan_id where history.sales_request_line_id=$1',[line.id])).rows[0].quantity;
   const covered=(await client.query('select greatest($1::numeric-$2::numeric-$3::numeric-$4::numeric,0) quantity',[line.requested_quantity,existing,outstanding,consumed])).rows[0].quantity;
   const stock=await lockStock(client,itemId,warehouseId);const reserve=String((await client.query('select greatest(least($1::numeric,$2::numeric-$3::numeric),0) quantity',[covered,stock.physical,stock.held])).rows[0].quantity);const shortage=String((await client.query('select greatest($1::numeric-$2::numeric,0) quantity',[covered,reserve])).rows[0].quantity);
   if((await client.query('select $1::numeric>0 positive',[reserve])).rows[0].positive)await client.query('insert into local_purchase_stock_reservations(plan_id,reservation_kind,reserved_quantity,created_by) values($1,$2,$3,$4)',[activePlan.id,'ON_HAND',reserve,d.actor()]);
   if((await client.query('select $1::numeric>0 positive',[shortage])).rows[0].positive){if(demand)await client.query("update local_purchase_shortage_demands set requested_quantity=requested_quantity+$2::numeric,status='ACTIVE',updated_at=now() where id=$1",[demand.id,shortage]);else await client.query("insert into local_purchase_shortage_demands(plan_id,requested_quantity,status,created_by) values($1,$2,'ACTIVE',$3)",[activePlan.id,shortage,d.actor()]);}
   const availableBefore=(await client.query('select greatest($1::numeric-$2::numeric,0) quantity',[stock.physical,stock.held])).rows[0].quantity;
   await client.query("update local_purchase_fulfillment_plans set status='ACTIVE',updated_at=now() where id=$1",[activePlan.id]);await client.query("insert into local_purchase_fulfillment_events(plan_id,action,actor_id,data) values($1,'PLAN',$2,$3::jsonb)",[activePlan.id,d.actor(),JSON.stringify({reserved_quantity:reserve,shortage_quantity:shortage,physical_quantity:stock.physical,available_before:String(availableBefore)})]);created.push(activePlan);
  }
  const view=await detail(client,request);return {plans:view.plans,receipt_candidates:view.receipt_candidates};
 });res.status(result.reused?200:201).json(result);}catch(error){d.sendError(res,error);}});
 app.post('/api/purchase-fulfillment/plans/:id/release',async(req,res)=>{try{const result=await command(`RELEASE:${req.params.id}`,req.body||{},async client=>{
  await requirePlanAccess(client,true);if(!uuid.test(String(req.params.id)))fail('Kế hoạch hàng nhập không hợp lệ.');const pointer=(await client.query('select sales_request_line_id from local_purchase_fulfillment_plans where id=$1',[req.params.id])).rows[0];const requestId=pointer&&(await client.query('select request_id from local_production_sales_request_lines where id=$1',[pointer.sales_request_line_id])).rows[0]?.request_id;await requestScope(client,String(requestId||''));
 },async client=>{
  await requirePlanAccess(client,true);if(!uuid.test(String(req.params.id)))fail('Kế hoạch hàng nhập không hợp lệ.');const reason=String(req.body.reason||'').trim();if(reason.length<3||reason.length>1000)fail('Nhập lý do giải phóng từ 3 đến 1.000 ký tự.');
  const plan=(await client.query('select * from local_purchase_fulfillment_plans where id=$1 for update',[req.params.id])).rows[0] as Row|undefined;if(!plan)fail('Không tìm thấy kế hoạch hàng nhập.',404);const activePlan=plan as Row;
  const request=await requestScope(client,String((await client.query('select request_id from local_production_sales_request_lines where id=$1',[activePlan.sales_request_line_id])).rows[0]?.request_id||''),true);
  const released=(await client.query('update local_purchase_stock_reservations set released_quantity=reserved_quantity-consumed_quantity,updated_at=now() where plan_id=$1 and reserved_quantity>released_quantity+consumed_quantity returning reserved_quantity,released_quantity,consumed_quantity',[activePlan.id])).rows;
  const demand=(await client.query('select * from local_purchase_shortage_demands where plan_id=$1 for update',[activePlan.id])).rows[0] as Row|undefined;if(demand)await client.query("update local_purchase_shortage_demands set cancelled_quantity=requested_quantity-received_quantity,status=case when received_quantity>=requested_quantity then 'SATISFIED' else 'CANCELLED' end,updated_at=now() where id=$1",[demand.id]);
  await client.query("update local_purchase_fulfillment_plans set status='RELEASED',updated_at=now() where id=$1",[activePlan.id]);await client.query("insert into local_purchase_fulfillment_events(plan_id,action,actor_id,reason,data) values($1,'RELEASE',$2,$3,$4::jsonb)",[activePlan.id,d.actor(),reason,JSON.stringify({released_rows:released.length})]);return {plan_id:activePlan.id,status:'RELEASED',request_id:request.id};
 });res.json(result);}catch(error){d.sendError(res,error);}});
 app.post('/api/purchase-fulfillment/shortages/:id/receipts',async(req,res)=>{try{const result=await command(`RECEIVE:${req.params.id}`,req.body||{},async client=>{
  await requirePlanAccess(client,true,true);if(!uuid.test(String(req.params.id)))fail('Nhu cầu hàng nhập không hợp lệ.');const pointer=(await client.query(`select l.request_id from local_purchase_shortage_demands d join local_purchase_fulfillment_plans p on p.id=d.plan_id join local_production_sales_request_lines l on l.id=p.sales_request_line_id where d.id=$1`,[req.params.id])).rows[0];await requestScope(client,String(pointer?.request_id||''));
 },async client=>{
  await requirePlanAccess(client,true,true);if(!uuid.test(String(req.params.id)))fail('Nhu cầu hàng nhập không hợp lệ.');const quantity=positive(req.body.quantity,'Số lượng nhận'),movementId=String(req.body.inventory_movement_id||'');if(!uuid.test(movementId))fail('Chọn phiếu nhập kho đã xác nhận.');
  const demand=(await client.query('select * from local_purchase_shortage_demands where id=$1 for update',[req.params.id])).rows[0] as Row|undefined;if(!demand)fail('Không tìm thấy nhu cầu nhập.',404);const activeDemand=demand as Row;const plan=(await client.query('select * from local_purchase_fulfillment_plans where id=$1 for update',[activeDemand.plan_id])).rows[0] as Row;
  if(plan.status!=='ACTIVE')fail('Kế hoạch đã giải phóng; không thể nhận hàng vào phần giữ cũ.',409);const request=await requestScope(client,String((await client.query('select request_id from local_production_sales_request_lines where id=$1',[plan.sales_request_line_id])).rows[0]?.request_id||''),true);const line=(await client.query('select * from local_production_sales_request_lines where id=$1 for update',[plan.sales_request_line_id])).rows[0] as Row;await currentLine(client,request,line);const {state}=await purchaseProduct(client,String(line.product_id));if(Number(plan.fulfillment_revision)!==Number(state.revision))fail('Cách đáp ứng sản phẩm đã thay đổi; cần đối soát kế hoạch trước khi nhận hàng.',409);
  const inventory=(await client.query("select id from local_inventory_items where id=$1 and is_active and item_type='FINISHED_GOOD' for share",[plan.inventory_item_id])).rows[0],warehouse=(await client.query('select id from local_inventory_warehouses where id=$1 and is_active for share',[plan.warehouse_id])).rows[0],mapping=(await client.query('select inventory_item_id from local_production_product_inventory_maps where product_id=$1 for update',[line.product_id])).rows[0];if(!inventory||!warehouse||!mapping||String(mapping.inventory_item_id)!==String(plan.inventory_item_id))fail('Mã hàng, kho hoặc ánh xạ sản phẩm của kế hoạch đã thay đổi; cần đối soát trước khi nhận hàng.',409);
  const movement=(await client.query(`select m.*,doc.status document_status,doc.document_type from local_inventory_movements m join local_inventory_documents doc on doc.id=m.document_id where m.id=$1 for update`,[movementId])).rows[0] as Row|undefined;if(!movement||movement.document_status!=='CONFIRMED'||movement.document_type!=='RECEIPT'||movement.movement_kind!=='RECEIPT'||!(Number(movement.quantity_delta)>0)||String(movement.inventory_item_id)!==String(plan.inventory_item_id)||String(movement.warehouse_id)!==String(plan.warehouse_id)||String(movement.unit)!==String(plan.base_unit))fail('Chỉ được nhận từ biến động nhập kho đã xác nhận, cùng mã hàng, kho và đơn vị.',409);const confirmedMovement=movement as Row;
  await client.query('select id from local_purchase_receipt_allocations where inventory_movement_id=$1 for update',[confirmedMovement.id]);
  const stock=await lockStock(client,String(plan.inventory_item_id),String(plan.warehouse_id));
  const caps=(await client.query(`select
    $1::numeric>greatest($2::numeric-$3::numeric-$4::numeric,0) exceeds_outstanding,
    $1::numeric>greatest($5::numeric-coalesce((select sum(a.quantity) from local_purchase_receipt_allocations a where a.inventory_movement_id=$6),0),0) exceeds_movement,
    $1::numeric>greatest($7::numeric-$8::numeric,0) exceeds_available`,[quantity,activeDemand.requested_quantity,activeDemand.received_quantity,activeDemand.cancelled_quantity,confirmedMovement.quantity_delta,confirmedMovement.id,stock.physical,stock.held])).rows[0];
  if(caps.exceeds_outstanding||caps.exceeds_movement)fail('Số lượng nhận vượt nhu cầu còn thiếu hoặc phần chưa liên kết của phiếu nhập.',409);
  if(caps.exceeds_available)fail('Tồn khả dụng đã được giữ cho đơn khác; tải lại trước khi nhận hàng.',409);
  await client.query('insert into local_purchase_receipt_allocations(shortage_demand_id,inventory_movement_id,quantity,created_by) values($1,$2,$3,$4)',[activeDemand.id,confirmedMovement.id,quantity,d.actor()]);await client.query("update local_purchase_shortage_demands set received_quantity=received_quantity+$2::numeric,status=case when received_quantity+$2::numeric>=requested_quantity then 'SATISFIED' else 'ACTIVE' end,updated_at=now() where id=$1",[activeDemand.id,quantity]);await client.query("insert into local_purchase_stock_reservations(plan_id,reservation_kind,reserved_quantity,created_by) values($1,'RECEIPT',$2,$3)",[plan.id,quantity,d.actor()]);await client.query("update local_purchase_fulfillment_plans set status='ACTIVE',updated_at=now() where id=$1",[plan.id]);await client.query("insert into local_purchase_fulfillment_events(plan_id,action,actor_id,data) values($1,'RECEIVE',$2,$3::jsonb)",[plan.id,d.actor(),JSON.stringify({shortage_id:activeDemand.id,inventory_movement_id:confirmedMovement.id,quantity})]);const view=await detail(client,request);return {plans:view.plans,receipt_candidates:view.receipt_candidates};
 });res.json(result);}catch(error){d.sendError(res,error);}});
}
