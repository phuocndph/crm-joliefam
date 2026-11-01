import {createHmac,randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {decrypt} from './zcrm-domain.js';
import {publicTransport,type PublicTransport} from './zcrm-transfer.js';
export async function deliverZcrmOutbox(pool:Pool,transport:PublicTransport=publicTransport){
 const client=await pool.connect();let event:Record<string,unknown>|undefined;
 const lease=randomUUID();
 try{await client.query('begin');
  event=(await client.query(`select o.*,c.origin,c.org_id,c.webhook_encrypted from zcrm.outbox o join zcrm.connections c on c.id=o.connection_id
   join zcrm.customer_grants g on g.connection_id=c.id and g.customer_id=o.customer_id join local_customers x on x.id=g.customer_id
   where c.enabled and (x.tenant_id=c.tenant_id or x.tenant_id is null)
   and (o.order_id is null or (x.is_active and not exists(select 1 from local_projection_tombstones t where t.source_table='customers' and t.source_key=x.id)
    and exists(select 1 from local_orders sale where sale.id=o.order_id and sale.customer_id=o.customer_id and sale.tenant_id=c.tenant_id
     and not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=sale.id))))
   and o.delivered_at is null and o.next_attempt_at<=now() and (o.lease_until is null or o.lease_until<now())
   order by o.next_attempt_at,o.created_at for update of o skip locked limit 1`)).rows[0];
  if(event)await client.query("update zcrm.outbox set lease_until=now()+interval '30 seconds',last_error=$2 where event_id=$1",[event.event_id,'lease:'+lease]);
  await client.query('commit');
 }catch(e){await client.query('rollback');throw e;}finally{client.release();}
 if(!event)return false;
 const timestamp=String(Date.now()),eventId=String(event.event_id),body=String(event.raw_body);
 try{
  const enabled=(await pool.query(`select c.* from zcrm.connections c join zcrm.customer_grants g on g.connection_id=c.id and g.customer_id=$2
   join local_customers x on x.id=g.customer_id where c.id=$1 and c.enabled and (x.tenant_id=c.tenant_id or x.tenant_id is null)
   and ($3::text is null or (x.is_active and not exists(select 1 from local_projection_tombstones t where t.source_table='customers' and t.source_key=x.id)
    and exists(select 1 from local_orders sale where sale.id=$3 and sale.customer_id=$2 and sale.tenant_id=c.tenant_id
     and not exists(select 1 from local_projection_tombstones t where t.source_table='orders' and t.source_key=sale.id))))`,[event.connection_id,event.customer_id,event.order_id])).rows[0];if(!enabled){await pool.query('update zcrm.outbox set lease_until=null,last_error=null where event_id=$1 and last_error=$2',[eventId,'lease:'+lease]);return false;}
  const url=new URL('/api/v1/joliefam/webhook/'+encodeURIComponent(String(enabled.org_id)),String(enabled.origin));
  const signature=createHmac('sha256',decrypt(String(enabled.webhook_encrypted))).update(timestamp+'.'+eventId+'.'+body).digest('hex');
  const response=await transport(url,{method:'POST',headers:{'Content-Type':'application/json','X-CRM-Timestamp':timestamp,'X-CRM-Event-Id':eventId,'X-CRM-Signature':signature},body,maxBytes:64000,timeoutMs:8000});
  if(response.status!==202)throw new Error('not accepted');
  await pool.query('update zcrm.outbox set delivered_at=now(),attempts=attempts+1,lease_until=null,last_error=null where event_id=$1 and last_error=$2',[eventId,'lease:'+lease]);
 }catch{
  await pool.query(`update zcrm.outbox set attempts=attempts+1,lease_until=null,last_error='ZCRM chưa xác nhận nhận sự kiện; hệ thống sẽ gửi lại.',
   next_attempt_at=now()+least(3600,power(2,least(attempts,10))*5)*interval '1 second' where event_id=$1 and last_error=$2`,[eventId,'lease:'+lease]);
 }
 return true;
}
export function startZcrmOutbox(pool:Pool,transport:PublicTransport=publicTransport){
 let busy=false;const timer=setInterval(()=>{if(busy)return;busy=true;void deliverZcrmOutbox(pool,transport).catch(()=>undefined).finally(()=>{busy=false;});},2000);timer.unref();return ()=>clearInterval(timer);
}
