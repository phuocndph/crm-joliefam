import type {Pool,PoolClient} from 'pg';
import {invoiceSourceUnits,invoiceSourceAmount} from './invoice-financial.js';
type Row=Record<string,unknown>;
type Db=Pick<Pool|PoolClient,'query'>;
export type OrderFinancialSchema='full-ledgers'|'verified-item5a-receipts-only';
const invalid=():never=>{throw Object.assign(new Error('Sổ thu/hoàn/trả của đơn chưa khớp chứng từ gốc; cần đối chiếu.'),{status:503,code:'DATA_INCOMPLETE'});};
const units=(value:unknown)=>{try{const n=invoiceSourceUnits(value??0);if(n<0n)return invalid();return n;}catch{return invalid();}};
const amount=(n:bigint)=>{const value=Number(invoiceSourceAmount(n));if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)return invalid();return value;};
/** Cash receipts, refunds and liability credits are separate ledgers. Shipping state never reverses money. */
export function orderFinancialProjection(order:Row,receipts:unknown,refunds:unknown,credits:unknown){
 const total=units(order.total_amount),paid=units(receipts),refunded=units(refunds),credit=units(credits);
 if(refunded>paid||credit>total)return invalid();
 const net=paid-refunded,due=total-credit-net;
 return {total_paid:amount(paid),refunded:amount(refunded),return_credit:amount(credit),net_collected:amount(net),remaining_amount:amount(due>0n?due:0n),payment_status:due<=0n?'paid':net>0n?'partial':'pending'};
}
const orderFinancialLedgerSql=(schema:OrderFinancialSchema)=>schema==='full-ledgers'
 ? `select o.id order_id,o.total_amount canonical_total,p.amount receipt_amount,p.payment_count,p.first_payment_date,p.last_payment_date,r.amount refunded,c.amount credit
   from local_orders o
   left join lateral(select coalesce(sum(p.payment_amount),0)::text amount,count(*)::int payment_count,min(p.payment_date) first_payment_date,max(p.payment_date) last_payment_date from local_order_payments p where p.order_id=o.id and not exists(select 1 from local_projection_tombstones t where t.source_table='order_payments' and t.source_key=p.id::text)) p on true
   left join lateral(select coalesce(sum(case when reversal_of is null then amount else -amount end),0)::text amount from local_order_refunds where order_id=o.id) r on true
   left join lateral(select coalesce(sum(case when reversal_of is null then credit_amount else -credit_amount end),0)::text amount from local_order_returns where order_id=o.id) c on true
   where o.id=any($1::text[])`
 : `select o.id order_id,o.total_amount canonical_total,p.amount receipt_amount,p.payment_count,p.first_payment_date,p.last_payment_date,'0'::text refunded,'0'::text credit
   from local_orders o
   left join lateral(select coalesce(sum(p.payment_amount),0)::text amount,count(*)::int payment_count,min(p.payment_date) first_payment_date,max(p.payment_date) last_payment_date from local_order_payments p where p.order_id=o.id and not exists(select 1 from local_projection_tombstones t where t.source_table='order_payments' and t.source_key=p.id::text)) p on true
   where o.id=any($1::text[])`;
/** One database snapshot and indexed aggregates for each bounded batch; never one network query per order. */
export async function hydrateOrderFinancials<T extends Row>(db:Db,orders:T[],schema:OrderFinancialSchema='full-ledgers'):Promise<(T&ReturnType<typeof orderFinancialProjection>)[]>{
 const result:(T&ReturnType<typeof orderFinancialProjection>)[]=[];
 for(let offset=0;offset<orders.length;offset+=500){
  const batch=orders.slice(offset,offset+500),ids=batch.map(o=>String(o.id));
  const ledger=(await db.query(orderFinancialLedgerSql(schema),[ids])).rows;
  const byOrder=new Map(ledger.map(r=>[String(r.order_id),r]));
  for(const order of batch){const row=byOrder.get(String(order.id));if(!row)invalid();result.push({...order,payment_count:row.payment_count||0,first_payment_date:row.first_payment_date||null,last_payment_date:row.last_payment_date||null,...orderFinancialProjection(order,row.receipt_amount,row.refunded,row.credit)});}

 }
 return result;
}
/** Shared SQL form for whole-list statistics; caller supplies already authorized scoped_orders. */
const fullOrderFinancialCtes=`
 ,receipt_totals as(select p.order_id,sum(p.payment_amount) paid from local_order_payments p join scoped_orders o on o.id=p.order_id where not exists(select 1 from local_projection_tombstones t where t.source_table='order_payments' and t.source_key=p.id::text) group by p.order_id)
 ,refund_totals as(select r.order_id,sum(case when r.reversal_of is null then r.amount else -r.amount end) refunded from local_order_refunds r join scoped_orders o on o.id=r.order_id group by r.order_id)
 ,credit_totals as(select r.order_id,sum(case when r.reversal_of is null then r.credit_amount else -r.credit_amount end) credit from local_order_returns r join scoped_orders o on o.id=r.order_id group by r.order_id)
 ,financial_orders as(select o.*,(coalesce(p.paid,0)<0 or coalesce(r.refunded,0)<0 or coalesce(r.refunded,0)>coalesce(p.paid,0) or coalesce(c.credit,0)<0 or coalesce(c.credit,0)>o.total_amount) finance_incomplete,coalesce(p.paid,0) total_paid,coalesce(r.refunded,0) refunded,coalesce(c.credit,0) return_credit,coalesce(p.paid,0)-coalesce(r.refunded,0) net_collected,greatest(o.total_amount-coalesce(c.credit,0)-coalesce(p.paid,0)+coalesce(r.refunded,0),0) remaining_amount from scoped_orders o left join receipt_totals p on p.order_id=o.id left join refund_totals r on r.order_id=o.id left join credit_totals c on c.order_id=o.id)`;

export const orderFinancialCtes=(schema:OrderFinancialSchema='full-ledgers')=>schema==='full-ledgers'?fullOrderFinancialCtes:`
 ,receipt_totals as(select p.order_id,sum(p.payment_amount) paid from local_order_payments p join scoped_orders o on o.id=p.order_id where not exists(select 1 from local_projection_tombstones t where t.source_table='order_payments' and t.source_key=p.id::text) group by p.order_id)
 ,financial_orders as(select o.*,(coalesce(p.paid,0)<0 or 0::numeric>o.total_amount) finance_incomplete,coalesce(p.paid,0) total_paid,0::numeric refunded,0::numeric return_credit,coalesce(p.paid,0) net_collected,greatest(o.total_amount-coalesce(p.paid,0),0) remaining_amount from scoped_orders o left join receipt_totals p on p.order_id=o.id)`;

/** Customer list preserves its credit alias without reading ledgers absent before Item5A migration 075. */
export const customerListCreditDerivedSql=(schema:OrderFinancialSchema='full-ledgers')=>schema==='full-ledgers'
 ? `left join(select order_id,sum(case when reversal_of is null then credit_amount else -credit_amount end) amount from local_order_returns group by order_id) credit on credit.order_id=o.id`
 : `left join(select null::text order_id,0::numeric amount where false) credit on credit.order_id=o.id`;
