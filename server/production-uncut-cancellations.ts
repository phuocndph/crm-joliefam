import type {PoolClient} from 'pg';

/** Parent order must already be locked. No side effects or float calculations. */
export async function cuttingScope(client:Pick<PoolClient,'query'>,orderId:string,batchId:string|null,itemId:string|null){
  return (await client.query(`select
   coalesce((select sum(quantity) from local_production_uncut_cancellations where production_order_id=$1 and ($2::uuid is null or production_batch_id=$2) and ($3::uuid is null or order_item_id=$3)),0) cancelled,
   coalesce((select sum(coalesce(accepted_quantity,allocated_quantity)-returned_quantity) from local_assignments where production_order_id=$1 and ($2::uuid is null or production_batch_id=$2) and ($3::uuid is null or order_item_id=$3) and dispatch_stage='CUTTING' and repair_ticket_id is null and dispatch_status<>'REJECTED'),0) reserved,
   coalesce((select sum(quantity_received) from local_production_stage_events e join local_assignments a on a.id=e.assignment_id and a.repair_ticket_id is null where e.production_order_id=$1 and ($2::uuid is null or e.production_batch_id=$2) and ($3::uuid is null or e.order_item_id=$3) and e.stage='CUTTING' and e.source_stage_event_id is null and e.status in ('SUBMITTED','APPROVED','LOCKED')),0) processed,
   coalesce((select sum(greatest(p.quantity-coalesce((select sum(coalesce(accepted_quantity,allocated_quantity)-returned_quantity) from local_assignments where publication_id=p.id and dispatch_status<>'REJECTED'),0),0)) from local_production_job_publications p where p.production_order_id=$1 and ($2::uuid is null or p.production_batch_id=$2) and ($3::uuid is null or p.order_item_id=$3) and p.stage='CUTTING' and p.repair_ticket_id is null and p.status='OPEN'),0) open`,[orderId,batchId,itemId])).rows[0] as {cancelled:string;reserved:string;processed:string;open:string};
}

export async function assertWholeCancellationUnstarted(client:PoolClient,orderId:string,batchId?:string){
  const started=(await client.query(`select 1 where
   exists(select 1 from local_assignments where production_order_id=$1 and ($2::uuid is null or production_batch_id=$2)) or
   exists(select 1 from local_production_job_publications where production_order_id=$1 and ($2::uuid is null or production_batch_id=$2)) or
   exists(select 1 from local_production_stage_events where production_order_id=$1 and ($2::uuid is null or production_batch_id=$2)) or
   exists(select 1 from local_production_outputs where production_order_id=$1 and ($2::uuid is null or production_batch_id=$2)) or
   exists(select 1 from local_inventory_documents d where production_order_id=$1 and ($2::uuid is null or cutting_estimate_id is null or exists(select 1 from local_cutting_estimates where id=d.cutting_estimate_id and production_batch_id=$2))) or
   exists(select 1 from local_production_uncut_cancellations where production_order_id=$1 and ($2::uuid is null or production_batch_id=$2))`,[orderId,batchId||null])).rows[0];
  if(started)throw Object.assign(new Error('Lệnh đã có giao việc, vật tư hoặc kết quả. Không hủy toàn lệnh; dùng hủy phần chưa cắt và đối chiếu phần đã làm.'),{status:409});
}

export async function executableEstimateOutput(client:Pick<PoolClient,'query'>,batchId:string,itemId:string,originalOutput:string|number){
  return (await client.query(`select greatest(least($3::numeric,
   b.planned_quantity-coalesce((select sum(quantity) from local_production_uncut_cancellations where production_batch_id=b.id),0),
   i.planned_quantity-coalesce((select sum(quantity) from local_production_uncut_cancellations where order_item_id=i.id),0)),0) quantity
   from local_production_batches b join local_production_order_items i on i.production_order_id=b.production_order_id and i.id=$2 where b.id=$1`,[batchId,itemId,originalOutput])).rows[0]?.quantity??'0';
}
