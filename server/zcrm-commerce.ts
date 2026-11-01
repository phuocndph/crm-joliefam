import {hydrateOrderFinancials} from './order-financial.js';
import {buildZcrmInvoiceBasis} from './zcrm-invoice-basis.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- bounded SQL/HTTP contract adapters validate at entry and exit. */
import express from 'express';
import type {Pool,PoolClient} from 'pg';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {runtime} from './runtime.js';
import {capabilities,cursorDecode,cursorEncode,dateOnly,decrypt,encrypt,encryptionReady,fail,fingerprint,ident,internalHash,list,normalize,obj,parseDraft,phone,sha,submission,sum,txt,uuid,vnd,ZcrmError,lineAmount,quantity,quantityUnits,type Draft} from './zcrm-domain.js';
import {assertActor,commercial,customerRow,customerRows,customerView,hydrateOrderStates,moneyLedgers,orderRow,orderSummary,orderView,priceDraft,productChoices,publicProduct,tombstone,type Connection} from './zcrm-data.js';
import {stageAttachments,publicTransport,type PublicTransport} from './zcrm-transfer.js';
import {startZcrmOutbox} from './zcrm-outbox.js';
type Data=Record<string,any>;
type Caller=(req:express.Request)=>Promise<{userId:string}|null>;
type Dependencies={app:express.Express;pool:Pool;resolveCaller:Caller;transport?:PublicTransport;worker?:boolean};
const feature=()=>process.env.LOCAL_ZCRM_API==='true';
const key=(req:express.Request)=>{const k=txt(req.get('Idempotency-Key'),200,true);if(!/^[A-Za-z0-9_.:-]{1,200}$/.test(k))fail('Mã yêu cầu không hợp lệ.',400);return k;};
async function transaction<T>(pool:Pool,fn:(client:PoolClient)=>Promise<T>){const client=await pool.connect();try{await client.query('begin');await client.query("set local statement_timeout='10000'");const value=await fn(client);await client.query('commit');return value;}catch(e){await client.query('rollback').catch(()=>undefined);throw e;}finally{client.release();}}
const authorizeWrite=(db:PoolClient)=>db.query("select set_config('zcrm.authorized_write','on',true)");
export async function assertZcrmOrderExecutable(db:Pick<Pool,'query'>,id:string|null|undefined){if(!id)return;const row=(await db.query('select approval_status from local_orders where id=$1',[id])).rows[0];if(row?.approval_status&&row.approval_status!=='approved')fail('Đơn ZCRM chưa được duyệt; chưa thể thu tiền, xuất kho, sản xuất hoặc tạo vận đơn.',409,'ORDER_NOT_APPROVED');}
export function zcrmSendError(res:express.Response,error:unknown){
 if(res.headersSent)return;
 if(error instanceof ZcrmError){res.status(error.status).json({message:error.message,code:error.code});return;}
 const e=error as {status?:number;message?:string};
 if(e.message?.includes('ZCRM_GUARD')){res.status(409).json({message:'Đơn chưa đủ điều kiện thực hiện. Hãy dùng luồng duyệt đơn ZCRM.',code:'ORDER_NOT_APPROVED'});return;}
 if(e.status===400){res.status(422).json({message:e.message,code:'VALIDATION'});return;}
 res.status(503).json({message:'CRM chưa xác nhận được kết quả. Tra cứu lại cùng mã yêu cầu trước khi gửi lại.',code:'CRM_UNAVAILABLE'});
}
function reply(res:express.Response,value:unknown,status=200){const body=JSON.stringify(value);if(Buffer.byteLength(body)>2000000)fail('Dữ liệu vượt giới hạn hợp đồng kết nối v1.',503,'RESPONSE_TOO_LARGE');res.status(status).type('application/json').send(body);}
function page<T>(req:express.Request,c:Connection,scope:unknown,rows:T[],rowKey:(r:T)=>string){
 const limit=Number(req.query.limit??20);if(!Number.isInteger(limit)||limit<1||limit>20)fail('Mỗi trang từ 1 đến 20 bản ghi.',400);
 const scopeHash=internalHash({connection:c.id,revision:c.revision,scope}),token=txt(req.query.cursor,500);let after='';
 if(token){const value=cursorDecode(token,c.token_hash);if(value.scope!==scopeHash||typeof value.after!=='string')fail('Con trỏ không thuộc bộ lọc hiện tại.',400,'INVALID_CURSOR');after=value.after;}
 const sorted=rows.sort((a,b)=>rowKey(a)<rowKey(b)?-1:rowKey(a)>rowKey(b)?1:0).filter(r=>!after||rowKey(r)>after),items=sorted.slice(0,limit);
 return {items,nextCursor:sorted.length>limit?cursorEncode({scope:scopeHash,after:rowKey(items[items.length-1])},c.token_hash):null};
}
async function lockConnection(db:PoolClient,c:Connection){const row=(await db.query('select * from zcrm.connections where id=$1 and enabled and token_hash=$2 for share',[c.id,c.token_hash])).rows[0];if(!row||!feature())fail('Kết nối đã tắt hoặc khóa đã thay đổi.',401,'UNAUTHORIZED');return row as Connection;}
async function receipt(db:PoolClient,c:Connection,k:string,operation:string,hash:string){
 await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['zcrm-request:'+c.id+':'+k]);
 const old=(await db.query('select * from zcrm.requests where connection_id=$1 and request_key=$2',[c.id,k])).rows[0];
 if(old&&(old.operation!==operation||old.fingerprint!==hash))fail('Mã yêu cầu đã dùng cho nội dung khác; chưa thay đổi dữ liệu.',409,'IDEMPOTENCY_CONFLICT');return old?.result;
}
const audit=(db:PoolClient,c:string|null,actor:string,action:string,id:string,detail:unknown={})=>db.query('insert into zcrm.audit(connection_id,actor_id,action,entity_id,detail) values($1,$2,$3,$4,$5::jsonb)',[c,actor,action,id,JSON.stringify(detail)]);
function requireSource(b:Data){if(b.source!=='ZCRM')fail('Nguồn yêu cầu phải là ZCRM.');}
function draftItems(d:Draft,p:Awaited<ReturnType<typeof priceDraft>>){return d.lines.map((l,i)=>({id:randomUUID(),product_id:l.productId,name:p.names[i],quantity:l.quantity,unit:l.unit,price:p.lines[i].unitPrice,total:p.lines[i].total,
 commerce_kind:l.kind,commerce_specifications:l.specifications,proposed_price:l.proposedPrice,variant:l.variant,warehouse_id:l.warehouseId,specifications:Object.entries(l.specifications).map(([k,v])=>k+': '+v).join('; ')}));}
export function registerZcrmCommerce({app,pool,resolveCaller,transport=publicTransport,worker=true}:Dependencies){
 if(feature()&&!encryptionReady())throw new Error('LOCAL_ZCRM_API=true cần ZCRM_ENCRYPTION_KEY là khóa hex 32 byte hợp lệ.');
 const router=express.Router(),inflight=new Map<string,number>();
 router.use(async(req,res,next)=>{
  try{
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
   if(!feature())fail('Cổng ZCRM chưa được bật trên máy chủ.',503,'INTEGRATION_DISABLED');
   if(req.get('origin'))fail('Khóa dịch vụ chỉ dùng giữa hai máy chủ.',403,'FORBIDDEN');
   if(runtime.production&&runtime.publicOrigin&&req.hostname!==new URL(runtime.publicOrigin).hostname)fail('Host không hợp lệ.',403,'FORBIDDEN');
   const match=/^Bearer (jf_zcrm_[A-Za-z0-9_-]{32,200})$/.exec(req.get('authorization')||'');if(!match)fail('Khóa kết nối không hợp lệ.',401,'UNAUTHORIZED');
   const connection=(await pool.query('select * from zcrm.connections where token_hash=$1 and enabled',[sha(match[1])])).rows[0] as Connection|undefined;if(!connection)fail('Khóa kết nối không hợp lệ.',401,'UNAUTHORIZED');
   if((inflight.get(connection.id)||0)>=4)fail('Kết nối đang xử lý quá nhiều yêu cầu.',429,'BUSY');
   if([...inflight.values()].reduce((s,n)=>s+n,0)>=4)fail('Cổng kết nối đang bận. Thử lại sau.',429,'BUSY');
   inflight.set(connection.id,(inflight.get(connection.id)||0)+1);let released=false;const release=()=>{if(!released){released=true;inflight.set(connection.id,Math.max(0,(inflight.get(connection.id)||1)-1));}};res.locals.zcrmRelease=release;
   const quota=(await pool.query(`insert into zcrm.quotas(connection_id,minute,requests) values($1,date_trunc('minute',now()),1)
    on conflict(connection_id,minute) do update set requests=zcrm.quotas.requests+1 returning requests`,[connection.id])).rows[0];
   if(quota.requests>120)fail('Quá nhiều yêu cầu trong một phút.',429,'RATE_LIMIT');
   // Slots are held until handler work settles, even when the caller disconnects.
   res.locals.zcrmConnection=connection;res.locals.zcrmRelease=release;next();
  }catch(e){res.locals.zcrmRelease?.();zcrmSendError(res,e);}
 });
 const route=(method:'get'|'post',path:string,handler:(req:express.Request,res:express.Response,c:Connection)=>Promise<unknown>|unknown)=>router[method](path,async(req,res)=>{try{const result=await handler(req,res,res.locals.zcrmConnection);if(!res.headersSent)reply(res,result);}catch(e){zcrmSendError(res,e);}finally{res.locals.zcrmRelease?.();}});
 route('get','/capabilities',()=>capabilities);
 route('get','/customers',async(req,_res,c)=>transaction(pool,async db=>{await lockConnection(db,c);const q=txt(req.query.q,200);return page(req,c,{kind:'customers',q},(await customerRows(db,c,q)).map(r=>customerView(r,runtime.publicOrigin)),r=>r.id);}));
 route('get','/customers/:id',async(req,_res,c)=>transaction(pool,async db=>{await lockConnection(db,c);return customerView(await customerRow(db,c,ident(req.params.id)),runtime.publicOrigin);}));
 route('post','/customers',async(req,_res,c)=>{
  const b=obj(req.body);requireSource(b);const name=txt(b.name,200,true),p=txt(b.phone,40,true),kind=b.kind;if(kind!=='hotel'&&kind!=='individual')fail('Chọn loại khách cá nhân hoặc khách sạn.');const digits=phone(p);if(!/^0\d{8,10}$/.test(digits))fail('Số điện thoại chưa hợp lệ.');
  const requestKey=key(req),hash=internalHash({name,phone:digits,kind,source:'ZCRM'});
  return transaction(pool,async db=>{c=await lockConnection(db,c);const old=await receipt(db,c,requestKey,'customer',hash);if(old)return old;
   await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['zcrm-customer:'+c.tenant_id]);
   const candidates=(await db.query(`select id,phone,phones,name from local_customers x where x.is_active and (x.tenant_id=$1 or x.tenant_id is null) and ${tombstone('customers','x')}`,[c.tenant_id])).rows as Data[];
   if(candidates.some(x=>[x.phone,...(Array.isArray(x.phones)?x.phones.map(p=>p.number):[])].some(p=>phone(p)===digits)||normalize(x.name)===normalize(name)))fail('Đã có khách trùng điện thoại hoặc tên. Tìm và xác nhận hồ sơ hiện có.',409,'CUSTOMER_EXISTS');
   const id=randomUUID(),code='KH-'+id;const row=(await db.query(`insert into local_customers(id,customer_code,name,phone,commerce_kind,tenant_id,notes,local_modified_at,is_snapshot_record)
    values($1,$2,$3,$4,$5,$6,'Nguồn: ZCRM',now(),false) returning *`,[id,code,name,p,kind,c.tenant_id])).rows[0];
   await db.query('insert into zcrm.customer_grants values($1,$2)',[c.id,id]);
   // A new grant is installed after INSERT, so explicitly emit its first customer event.
   await db.query('insert into zcrm.outbox(connection_id,customer_id,version,raw_body) values($1,$2,1,$3)',[c.id,id,JSON.stringify({customerId:id,version:1})]);
   const result=customerView(row,runtime.publicOrigin);await db.query("insert into zcrm.requests(connection_id,request_key,operation,fingerprint,result) values($1,$2,'customer',$3,$4::jsonb)",[c.id,requestKey,hash,JSON.stringify(result)]);await audit(db,c.id,'ZCRM','customer.create',id);return result;
  });
 });
 const orderList=async(db:PoolClient,c:Connection,customerId:string)=>{await customerRow(db,c,customerId);const rows=(await db.query(`select o.* from local_orders o where o.customer_id=$1 and o.tenant_id=$2 and ${tombstone('orders','o')} order by o.id for share`,[customerId,c.tenant_id])).rows as Data[];return hydrateOrderStates(db,await hydrateOrderFinancials(db,rows));};
 route('get','/customers/:id/summary',async(req,_res,c)=>transaction(pool,async db=>{await lockConnection(db,c);const rows=(await orderList(db,c,ident(req.params.id))).filter(o=>o.status!=='cancelled'&&(!o.approval_status||o.approval_status==='approved'));
  rows.forEach(commercial);
  for(let offset=0;offset<rows.length;offset+=500){const batch=rows.slice(offset,offset+500),contracts=(await db.query(`select c.order_id,c.deposit_amount,c.total_amount,c.customer_id,c.tenant_id from local_contracts c where c.order_id=any($1::text[]) and coalesce(c.status,'')<>'cancelled' and ${tombstone('contracts','c')}`,[batch.map(o=>o.id)])).rows as Data[];
   for(const o of batch){const linked=contracts.filter(c=>c.order_id===o.id);if(linked.length>1||linked.some(c=>c.customer_id!==o.customer_id||c.tenant_id!==o.tenant_id||vnd(c.total_amount)!==vnd(o.total_amount)||vnd(c.deposit_amount)>vnd(o.total_amount)))fail('Hợp đồng chưa khớp dữ liệu tài chính của đơn; cần đối chiếu.',503,'DATA_INCOMPLETE');}
  }
  return {currency:'VND',orderCount:rows.length,netSales:sum(rows.map(o=>vnd(o.total_amount)-o.return_credit)),collected:sum(rows.map(o=>o.net_collected)),due:sum(rows.map(o=>o.remaining_amount)),activeOrderCount:rows.filter(o=>!['delivered','self_delivered'].includes(o.status)).length};
 }));
 route('get','/customers/:id/orders',async(req,_res,c)=>transaction(pool,async db=>{await lockConnection(db,c);const customerId=ident(req.params.id),q=txt(req.query.q,200),filter=txt(req.query.status,30),from=dateOnly(req.query.from),to=dateOnly(req.query.to);if(from&&to&&from>to)fail('Khoảng ngày không hợp lệ.',400);
  if(filter&&!['active','pending_approval','production','shipping','problem','completed','cancelled'].includes(filter))fail('Bộ lọc trạng thái không hợp lệ.',400);
  const rows=(await orderList(db,c,customerId)).filter(o=>{
   const s=orderSummary(o),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(o.created_at));
   if(q&&!normalize([o.order_number,o.display_order_number].join(' ')).includes(normalize(q))||from&&day<from||to&&day>to)return false;
   if(!filter)return true;if(filter==='active')return !['completed','cancelled'].includes(s.processing.code);if(filter==='pending_approval')return o.approval_status==='pending';if(filter==='production')return s.processing.code==='production'||o.status==='processing'&&(o._production_statuses as string[]).some(p=>!['COMPLETED','CANCELLED','completed','cancelled'].includes(p));if(filter==='shipping')return ['shipping','partially_delivered'].includes(s.delivery.code);if(filter==='problem')return s.delivery.code==='problem'||o.approval_status==='returned';return s.processing.code===filter;
  });return page(req,c,{kind:'orders',customerId,q,filter,from,to},rows.map(orderSummary),r=>r.id);
 }));
 route('get','/customers/:id/orders/:orderId',async(req,_res,c)=>transaction(pool,async db=>{await lockConnection(db,c);return orderView(db,await orderRow(db,c,ident(req.params.id),ident(req.params.orderId)),runtime.publicOrigin);}));
 route('get','/products',async(req,_res,c)=>transaction(pool,async db=>{await lockConnection(db,c);const q=txt(req.query.q,200),rows=(await productChoices(db,c)).filter(p=>!q||normalize([p.name,p.sku].join(' ')).includes(normalize(q))),result=page(req,c,{kind:'products',q},rows,r=>String(r._key));return {...result,items:result.items.map(publicProduct)};}));
 route('post','/quotes',async(req,_res,c)=>{
  const b=obj(req.body);requireSource(b);const draft=parseDraft(b.draft);submission(draft);const hash=fingerprint(draft);if(b.fingerprint!==hash)fail('Dấu kiểm tra nội dung nháp không khớp.',409,'DRAFT_CHANGED');const actor=ident(b.actorId);
  return transaction(pool,async db=>{c=await lockConnection(db,c);const priced=await priceDraft(db,c,draft,actor),token=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+10*60*1000).toISOString();
   const result={token,fingerprint:hash,expiresAt,currency:'VND',subtotal:priced.subtotal,discount:0,shipping:0,tax:0,total:priced.subtotal,warnings:priced.warnings,lines:priced.lines};
   await db.query('insert into zcrm.quotes(token,connection_id,customer_id,actor_id,fingerprint,draft,product_signature,result,expires_at) values($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9)',[token,c.id,draft.customerId,actor,hash,JSON.stringify(draft),priced.signature,JSON.stringify(result),expiresAt]);return result;
  });
 });
 route('get','/requests/:key',async(req,_res,c)=>transaction(pool,async db=>{await lockConnection(db,c);const r=(await db.query("select result,order_id from zcrm.requests where connection_id=$1 and request_key=$2 and operation='draft'",[c.id,txt(req.params.key,200,true)])).rows[0];
  if(!r)return {found:false};const stored=r.result as Data;await orderRow(db,c,stored.order.customerId,r.order_id);return {found:true,...stored};
 }));
 route('post','/draft-orders',async(req,_res,c)=>{
  const b=obj(req.body);requireSource(b);const draft=parseDraft(b.draft),actor=ident(b.actorId),requestKey=key(req),hash=fingerprint(draft),existing=b.existingOrderId?ident(b.existingOrderId):null;
  // URLs may expire, but are not part of the business identity. Declarations are.
  const payloadHash=internalHash({draft,actor,existing,quoteToken:txt(b.quoteToken,200,true),fingerprint:txt(b.fingerprint,64,true)});
  // A session lock spans validation and transfers without holding a business
  // transaction open. Normal concurrent callers wait and replay the same result;
  // a bounded lock timeout is uncertain 503, never a definitive 409/422.
  const lease=await pool.connect(),leaseName='zcrm-inflight:'+c.id+':'+requestKey;let leased=false;
  try {
  await lease.query("set statement_timeout='12000'");await lease.query('select pg_advisory_lock(hashtextextended($1,0))',[leaseName]);leased=true;
  const replay=await transaction(pool,async db=>{c=await lockConnection(db,c);const result=await receipt(db,c,requestKey,'draft',payloadHash);if(result){const stored=result as Data;await orderRow(db,c,stored.order.customerId,stored.order.id);}return result;});if(replay)return replay;
  submission(draft);if(b.fingerprint!==hash)fail('Nội dung nháp đã đổi.',409,'DRAFT_CHANGED');
  // Bound and validate the quote before any transfer; successful receipt replay is above.
  await transaction(pool,async db=>{await lockConnection(db,c);await assertActor(db,c,actor);const q=(await db.query('select * from zcrm.quotes where token=$1 and connection_id=$2',[b.quoteToken,c.id])).rows[0];if(!q||q.fingerprint!==hash||q.actor_id!==actor||q.customer_id!==draft.customerId||new Date(q.expires_at).getTime()<=Date.now())fail('Báo giá hết hạn hoặc không thuộc nháp/nhân viên hiện tại.',409,'QUOTE_EXPIRED');});
  const staged=await stageAttachments(draft,b.attachments,c.origin,c.org_id,decrypt(c.token_encrypted),transport);
  try{return await transaction(pool,async db=>{c=await lockConnection(db,c);const old=await receipt(db,c,requestKey,'draft',payloadHash);if(old)return old;
   const manager=await assertActor(db,c,actor);const q=(await db.query('select * from zcrm.quotes where token=$1 and connection_id=$2 for share',[b.quoteToken,c.id])).rows[0];
   if(!q||q.fingerprint!==hash||q.actor_id!==actor||q.customer_id!==draft.customerId||new Date(q.expires_at).getTime()<=Date.now())fail('Báo giá đã hết hạn. Kiểm tra giá lại.',409,'QUOTE_EXPIRED');
   const priced=await priceDraft(db,c,draft,actor);if(priced.signature!==q.product_signature||priced.subtotal!==q.result.subtotal)fail('Giá hoặc sản phẩm đã đổi; chưa ghi đơn. Kiểm tra giá lại.',409,'PRICE_CHANGED');
   let id=randomUUID(),number='ZCRM-'+id,revision=1;
   if(existing){const current=await orderRow(db,c,draft.customerId!,existing,true);if(current.intake_connection_id!==c.id||current.intake_created_by!==actor||current.approval_status!=='returned')fail('Chỉ người tạo được gửi lại đúng đơn đã trả bổ sung.',409,'REVISION_FORBIDDEN');id=current.id;number=current.order_number;revision=current.approval_revision+1;}
   await authorizeWrite(db);const items=draftItems(draft,priced),snapshot={complete:true,subtotal:priced.subtotal,discount:0,shipping:0,tax:0,deposit:0,provenance:'ZCRM quote '+q.token+'; chưa thỏa thuận cọc/phí/VAT, chờ duyệt',historyComplete:true};
   if(existing)await db.query(`update local_orders set items=$2::jsonb,total_amount=$3,subtotal=$3,vat_amount=0,vat_rate=0,intake_draft=$4::jsonb,commercial_snapshot=$5::jsonb,
    approval_status='pending',approval_revision=$6,intake_submitted_by=$7,ordered_by=$8,recipient_snapshot=$9::jsonb,desired_delivery_date=$10,notes=$11,status='pending',reviewed_by=null,reviewed_at=null,approval_reason=null,local_modified_at=now() where id=$1`,[id,JSON.stringify(items),priced.subtotal,JSON.stringify(draft),JSON.stringify(snapshot),revision,actor,draft.orderedBy,JSON.stringify(draft.recipient),draft.desiredDate||null,draft.notes]);
   else await db.query(`insert into local_orders(id,customer_id,order_number,display_order_number,tenant_id,manager_id,status,payment_status,items,total_amount,subtotal,vat_amount,vat_rate,include_vat,
    intake_source,intake_created_by,intake_submitted_by,intake_connection_id,approval_status,approval_revision,ordered_by,recipient_snapshot,desired_delivery_date,intake_draft,commercial_snapshot,notes,created_at,updated_at,local_modified_at,is_snapshot_record)
    values($1,$2,$3,$3,$4,$15,'pending','pending',$6::jsonb,$7,$7,0,0,false,'ZCRM',$5,$5,$8,'pending',1,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb,$14,now(),now(),now(),false)`,[id,draft.customerId,number,c.tenant_id,actor,JSON.stringify(items),priced.subtotal,c.id,draft.orderedBy,JSON.stringify(draft.recipient),draft.desiredDate||null,JSON.stringify(draft),JSON.stringify(snapshot),draft.notes,manager]);
   for(const f of staged.files)await db.query('insert into zcrm.attachments(order_id,revision,media_id,name,mime,size,sha256,content) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,revision,f.mediaId,f.name,f.mime,f.size,f.hash,await readFile(f.path)]);
   const saved=(await db.query('select * from local_orders where id=$1',[id])).rows[0],result={order:await orderView(db,saved,runtime.publicOrigin)};
   // Serialize/size-check before commit, so no postcommit failure is misclassified.
   if(Buffer.byteLength(JSON.stringify(result))>2000000)fail('Nội dung đơn vượt giới hạn kết nối v1.',422,'ORDER_TOO_LARGE');
   await db.query("insert into zcrm.requests(connection_id,request_key,operation,fingerprint,order_id,result) values($1,$2,'draft',$3,$4,$5::jsonb)",[c.id,requestKey,payloadHash,id,JSON.stringify(result)]);await audit(db,c.id,actor,existing?'draft.resubmit':'draft.submit',id,{revision});return result;
  });}finally{await staged.cleanup();}
  } finally {try{if(leased)await lease.query('select pg_advisory_unlock(hashtextextended($1,0))',[leaseName]);await lease.query('set statement_timeout=0');lease.release();}catch{lease.release(true);}}
 });
 router.use((_req,res)=>{res.locals.zcrmRelease?.();res.status(404).json({message:'Không có API ZCRM này.',code:'NOT_FOUND'});});
 app.use('/api/zcrm/v1',router);
 registerZcrmHuman(app,pool,resolveCaller);
 if(feature()&&worker)startZcrmOutbox(pool,transport);
}

function registerZcrmHuman(app:express.Express,pool:Pool,resolveCaller:Caller){
 const router=express.Router();
 router.use(async(req,res,next)=>{try{res.setHeader('Cache-Control','no-store');const caller=await resolveCaller(req);if(!caller||caller.userId==='local-admin')fail('Cần đăng nhập bằng tài khoản CRM thật.',401,'UNAUTHORIZED');
  const r=(await pool.query(`select p.user_id,r.role from local_user_profiles p join local_user_roles r on r.user_id=p.user_id and r.is_active where p.user_id=$1 and p.is_active
   order by case r.role when 'admin' then 1 when 'manager' then 2 else 3 end limit 1`,[caller.userId])).rows[0];if(!r||!['admin','manager'].includes(r.role))fail('Chỉ quản trị viên hoặc quản lý được thao tác.',403,'FORBIDDEN');res.locals.actor=r.user_id;res.locals.role=r.role;next();}catch(e){zcrmSendError(res,e);}});
 const route=(method:'get'|'post'|'put',path:string,handler:(req:express.Request,res:express.Response)=>Promise<unknown>)=>router[method](path,async(req,res)=>{try{const value=await handler(req,res);if(!res.headersSent)reply(res,value);}catch(e){zcrmSendError(res,e);}});
 const admin=(res:express.Response)=>{if(res.locals.role!=='admin')fail('Chỉ quản trị viên được cấu hình kết nối.',403,'FORBIDDEN');return String(res.locals.actor);};
 const settingsView=async(db:Pick<Pool,'query'>)=>{
  const connections=(await db.query(`select id,org_id,tenant_id,name,origin,enabled,revision,created_at,updated_at from zcrm.connections order by created_at,id`)).rows;
  for(const c of connections){c.actor_mappings=(await db.query('select zcrm_user_id,crm_user_id from zcrm.actor_mappings where connection_id=$1',[c.id])).rows;c.customer_ids=(await db.query('select customer_id from zcrm.customer_grants where connection_id=$1',[c.id])).rows.map(r=>r.customer_id);c.product_grants=(await db.query('select product_id,warehouse_ids from zcrm.product_grants where connection_id=$1',[c.id])).rows;c.outbox=(await db.query(`select count(*)::int pending,count(*) filter(where attempts>0)::int retrying,max(last_error) last_error from zcrm.outbox where connection_id=$1 and delivered_at is null`,[c.id])).rows[0];}
  return {featureEnabled:feature(),encryptionReady:encryptionReady(),apiUrl:(runtime.publicOrigin||'https://crm.joliefam.vn')+'/api/zcrm/v1',connections};
 };
 route('get','/settings',async(_req,res)=>{admin(res);return settingsView(pool);});
 route('get','/catalog',async(req,res)=>{admin(res);const q='%'+txt(req.query.q,200).toLowerCase()+'%',kind=String(req.query.kind||'customers');
  if(kind==='customers')return (await pool.query(`select id,customer_code,name,tenant_id,commerce_kind,commerce_contacts,addresses from local_customers x where x.is_active and ${tombstone('customers','x')} and (lower(name) like $1 or lower(coalesce(customer_code,'')) like $1 or coalesce(phone,'') like $1) order by name,id limit 100`,[q])).rows;
  if(kind==='products')return (await pool.query(`select id,sku,name,tenant_id,commerce_kind,commerce_unit,commerce_variant,commerce_required_fields,price from local_products x where x.is_active and ${tombstone('products','x')} and (lower(name) like $1 or lower(sku) like $1) order by name,id limit 100`,[q])).rows;
  if(kind==='users')return (await pool.query("select user_id id,concat_ws(' ',first_name,last_name) name,email from local_user_profiles where is_active and user_id<>'local-admin' and (lower(email) like $1 or lower(concat_ws(' ',first_name,last_name)) like $1) order by email limit 100",[q])).rows;
  if(kind==='warehouses')return (await pool.query('select id,name,code from local_inventory_warehouses where is_active order by name limit 100')).rows;
  if(kind==='tenants')return (await pool.query("select distinct tenant_id id from (select tenant_id from local_customers union select tenant_id from local_products union select tenant_id from local_orders) t where nullif(btrim(tenant_id),'') is not null order by tenant_id limit 100")).rows;
  fail('Danh mục không hợp lệ.',400);
 });
 route('post','/connections',async(req,res)=>{
  const actor=admin(res),b=obj(req.body),id=b.id?uuid(b.id):randomUUID(),org=ident(b.org_id),tenant=ident(b.tenant_id),name=txt(b.name,200,true),origin=txt(b.origin||'https://zcrm.joliefam.vn',250,true);
  const {safeOrigin}=await import('./zcrm-domain.js');safeOrigin(origin);if(!/^[A-Za-z0-9_-]{1,128}$/.test(org))fail('Mã tổ chức ZCRM không hợp lệ.');
  const mappings=list(b.actor_mappings??[],500).map(v=>{const m=obj(v);return {zcrm:ident(m.zcrm_user_id),crm:ident(m.crm_user_id)};}),customers=list(b.customer_ids??[],10000).map(ident),products=list(b.product_grants??[],10000).map(v=>{const p=obj(v);return {id:uuid(p.product_id),warehouses:list(p.warehouse_ids??[],100).map(uuid)};});
  if(typeof b.enabled!=='boolean')fail('Cần chọn bật hoặc tắt.');if(new Set(customers).size!==customers.length||new Set(products.map(p=>p.id)).size!==products.length||new Set(mappings.map(m=>m.zcrm)).size!==mappings.length||new Set(mappings.map(m=>m.crm)).size!==mappings.length)fail('Danh sách cấp quyền hoặc ghép nhân viên có mục trùng.');
  let oneTime:Data={};
  const result=await transaction(pool,async db=>{const old=(await db.query('select * from zcrm.connections where id=$1 for update',[id])).rows[0] as Data|undefined;
   if(old&&b.revision!==old.revision)fail('Cấu hình đã đổi; tải lại trước khi lưu.',409,'REVISION_CONFLICT');if(old&&(old.org_id!==org||old.tenant_id!==tenant))fail('Mã tổ chức và phạm vi CRM không được đổi sau khi tạo; tạo kết nối mới.',409);
   let token=txt(b.token,4000),secret=txt(b.webhook_secret,4000);if(b.generate_secrets===true){token='jf_zcrm_'+randomBytes(32).toString('base64url');secret=randomBytes(32).toString('hex');oneTime={token,webhook_secret:secret};}
   if(token&&!/^jf_zcrm_[A-Za-z0-9_-]{32,200}$/.test(token))fail('Khóa cần tiền tố jf_zcrm_ và tối thiểu 32 ký tự ngẫu nhiên.');if(secret&&secret.length<32)fail('Khóa ký webhook tối thiểu 32 ký tự.');if(!old&&(!token||!secret))fail('Cần khóa API và khóa ký webhook.');if(!encryptionReady())fail('Cần cấu hình ZCRM_ENCRYPTION_KEY trên máy chủ trước.',503,'ENCRYPTION_NOT_READY');
   if(b.enabled&&(!feature()||!mappings.length||!customers.length||!products.length))fail('Cần bật cổng máy chủ và chọn rõ nhân viên, khách, sản phẩm trước khi bật kết nối.');
   for(const m of mappings)if(!(await db.query("select 1 from local_user_profiles where user_id=$1 and is_active and user_id<>'local-admin' for share",[m.crm])).rows[0])fail('Nhân viên CRM không còn hoạt động.');
   for(const customer of customers){const r=(await db.query('select tenant_id,commerce_kind from local_customers where id=$1 and is_active for share',[customer])).rows[0];if(!r||r.tenant_id&&r.tenant_id!==tenant||!r.commerce_kind)fail('Khách khác phạm vi hoặc chưa xác nhận loại khách.');}
   for(const p of products){const r=(await db.query('select tenant_id,commerce_kind,commerce_unit from local_products where id=$1 and is_active for share',[p.id])).rows[0];if(!r||r.tenant_id&&r.tenant_id!==tenant||!r.commerce_kind||!r.commerce_unit)fail('Sản phẩm khác phạm vi hoặc chưa khai báo loại/đơn vị bán.');if(p.warehouses.length&&(await db.query('select id from local_inventory_warehouses where id=any($1::uuid[]) and is_active for share',[p.warehouses])).rows.length!==p.warehouses.length)fail('Kho không còn hoạt động.');}
   const tokenHash=token?sha(token):old!.token_hash,tokenEncrypted=token?encrypt(token):old!.token_encrypted,webhookEncrypted=secret?encrypt(secret):old!.webhook_encrypted;
   if(old)await db.query('update zcrm.connections set name=$2,origin=$3,enabled=$4,token_hash=$5,token_encrypted=$6,webhook_encrypted=$7,revision=revision+1,updated_by=$8,updated_at=now() where id=$1',[id,name,origin,b.enabled,tokenHash,tokenEncrypted,webhookEncrypted,actor]);
   else await db.query('insert into zcrm.connections(id,org_id,tenant_id,name,origin,enabled,token_hash,token_encrypted,webhook_encrypted,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)',[id,org,tenant,name,origin,b.enabled,tokenHash,tokenEncrypted,webhookEncrypted,actor]);
   await db.query('delete from zcrm.actor_mappings where connection_id=$1',[id]);await db.query('delete from zcrm.customer_grants where connection_id=$1',[id]);await db.query('delete from zcrm.product_grants where connection_id=$1',[id]);
   for(const m of mappings)await db.query('insert into zcrm.actor_mappings values($1,$2,$3)',[id,m.zcrm,m.crm]);for(const cid of customers)await db.query('insert into zcrm.customer_grants values($1,$2)',[id,cid]);for(const p of products)await db.query('insert into zcrm.product_grants values($1,$2,$3)',[id,p.id,p.warehouses]);
   await audit(db,id,actor,'connection.save',id,{enabled:b.enabled,customerCount:customers.length,productCount:products.length,actorCount:mappings.length,rotated:!!token||!!secret});return {id};
  });return {...result,...(Object.keys(oneTime).length?{one_time_secrets:oneTime}:{})};
 });
 route('post','/customers/:id/profile',async(req,res)=>{
  const actor=admin(res),b=obj(req.body);if(b.kind!=='hotel'&&b.kind!=='individual')fail('Chọn loại khách.');const contacts=list(b.contacts??[],500).map(raw=>{const c=obj(raw);return {id:c.id?ident(c.id):randomUUID(),name:txt(c.name,200,true),phone:txt(c.phone,40)};});if(new Set(contacts.map(c=>c.id)).size!==contacts.length)fail('Mã người liên hệ bị trùng.');
  const addresses=b.addresses===undefined?undefined:list(b.addresses,500).map(raw=>{const a=obj(raw);if(a.isPrimary!==undefined&&typeof a.isPrimary!=='boolean')fail('Địa chỉ chính phải là boolean.');return {id:a.id?ident(a.id):randomUUID(),name:txt(a.name,200),phone:txt(a.phone,40),address:txt(a.address,2000,true),...(a.label!==undefined?{label:txt(a.label,200)}:{}),...(a.isPrimary!==undefined?{isPrimary:a.isPrimary}:{})};});
  return transaction(pool,async db=>{const row=(await db.query('update local_customers set commerce_kind=$2,commerce_contacts=$3::jsonb,addresses=coalesce($4::jsonb,addresses),updated_at=now(),local_modified_at=now() where id=$1 and is_active returning id',[ident(req.params.id),b.kind,JSON.stringify(contacts),addresses?JSON.stringify(addresses):null])).rows[0];if(!row)fail('Không tìm thấy khách.',404);await audit(db,null,actor,'customer.profile',row.id);return row;});
 });
 route('post','/products/:id/profile',async(req,res)=>{const actor=admin(res),b=obj(req.body);if(b.kind!=='stock'&&b.kind!=='custom')fail('Chọn hàng có sẵn hoặc đặt riêng.');const unit=txt(b.unit,30,true),variant=txt(b.variant,200),required=list(b.requiredFields??[],30).map(v=>txt(v,80,true));return transaction(pool,async db=>{const row=(await db.query('update local_products set commerce_kind=$2,commerce_unit=$3,commerce_variant=$4,commerce_required_fields=$5::jsonb,updated_at=now() where id=$1 and is_active returning id',[uuid(req.params.id),b.kind,unit,variant,JSON.stringify(required)])).rows[0];if(!row)fail('Không tìm thấy sản phẩm.',404);await audit(db,null,actor,'product.profile',row.id);return row;});});
 const humanOrder=async(db:Pick<Pool,'query'>,res:express.Response,id:string,lock=false)=>{const row=(await db.query(`select o.* from local_orders o where id=$1 and ${tombstone('orders','o')}${lock?' for update':''}`,[id])).rows[0] as Data|undefined;if(!row||res.locals.role!=='admin'&&row.manager_id!==res.locals.actor)fail('Không tìm thấy đơn trong phạm vi phụ trách.',404,'NOT_FOUND');return row;};
 route('get','/review-orders',async(req,res)=>{const statusFilter=txt(req.query.status,20)||'pending';if(!['pending','approved','returned','rejected','all'].includes(statusFilter))fail('Trạng thái không hợp lệ.');const rows=(await pool.query(`select o.id,o.order_number,o.approval_status,o.approval_revision,o.total_amount,o.created_at,o.intake_submitted_by,c.name customer_name from local_orders o left join local_customers c on c.id=o.customer_id where o.intake_source='ZCRM' and ($1='all' or o.approval_status=$1) and ($2='admin' or o.manager_id=$3) and ${tombstone('orders','o')} order by o.created_at desc,o.id limit 100`,[statusFilter,res.locals.role,res.locals.actor])).rows;return {items:rows};});
 route('get','/orders/:id',async(req,res)=>transaction(pool,async db=>{const row=await humanOrder(db,res,ident(req.params.id));const attachments=(await db.query('select id,revision,media_id,name,mime,size,sha256 from zcrm.attachments where order_id=$1 order by revision,id',[row.id])).rows;const history=(await db.query('select action,actor_id,detail,created_at from zcrm.audit where entity_id=$1 order by id',[row.id])).rows;return {order:await orderView(db,row,runtime.publicOrigin),review_unit_prices:list(row.items,100).map(r=>vnd(obj(r).price)),review_vat_rate:row.commercial_snapshot?.invoice_basis?.vat_rate??(Number(row.commercial_snapshot?.tax||0)===0?'0':null),revision:row.approval_revision,reason:row.approval_reason,attachments,history};}));
 route('get','/attachments/:id',async(req,res)=>{const row=(await pool.query('select * from zcrm.attachments where id=$1',[uuid(req.params.id)])).rows[0];if(!row)fail('Không tìm thấy tài liệu.',404);await humanOrder(pool,res,row.order_id);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(row.name));res.type('application/octet-stream').send(row.content);return null;});
 const humanReceipt=async(db:PoolClient,res:express.Response,body:Data,operation:string,id:string)=>{const k=txt(body.idempotency_key,200,true),hash=internalHash({body,operation,id});await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['zcrm-human:'+res.locals.actor+':'+k]);const old=(await db.query('select * from zcrm.human_receipts where actor_id=$1 and request_key=$2',[res.locals.actor,k])).rows[0];if(old&&old.fingerprint!==hash)fail('Mã thao tác đã dùng cho nội dung khác.',409);return {old:old?.result,key:k,hash};};
 const saveHumanReceipt=(db:PoolClient,res:express.Response,r:{key:string;hash:string},result:unknown)=>db.query('insert into zcrm.human_receipts(actor_id,request_key,fingerprint,result) values($1,$2,$3,$4::jsonb)',[res.locals.actor,r.key,r.hash,JSON.stringify(result)]);
 route('post','/orders/:id/review',async(req,res)=>{const b=obj(req.body),id=ident(req.params.id);return transaction(pool,async db=>{
  const row=await humanOrder(db,res,id,true),receipt=await humanReceipt(db,res,b,'review',id);if(receipt.old)return receipt.old;if(b.expected_revision!==row.approval_revision)fail('Đơn đã đổi. Tải lại trước khi duyệt.',409,'REVISION_CONFLICT');if(row.approval_status!=='pending')fail('Chỉ xử lý đơn đang chờ duyệt.',409);
  const action=txt(b.action,20,true),reason=txt(b.reason,2000,action!=='approve');if(!['approve','return','reject'].includes(action))fail('Quyết định không hợp lệ.');let snapshot=row.commercial_snapshot,items=row.items,confirmed:string|null=null;
  if(action==='approve'){
   const prices=b.unit_prices===undefined?(items as Data[]).map(i=>vnd(i.price)):list(b.unit_prices,100).map(v=>vnd(v));if(prices.length!==items.length)fail('Đơn giá phải đủ từng dòng.');
   items=(items as Data[]).map((l,i)=>({...l,price:prices[i],total:lineAmount(Number(l.quantity),prices[i])}));const subtotal=sum(items.map((i:Data)=>i.total)),discount=vnd(b.discount??0),shipping=vnd(b.shipping??0),deposit=vnd(b.deposit??0);if(discount>subtotal)fail('Giảm giá vượt giá trị đơn.');if(b.vat_rate===undefined&&vnd(b.tax??0)>0)fail('Cần xác nhận thuế suất VAT, không chỉ nhập tiền thuế.');const basis=buildZcrmInvoiceBasis(items,discount,shipping,b.vat_rate??0),tax=vnd(basis.vat_amount);if(b.tax!==undefined&&vnd(b.tax)!==tax)fail('Tiền VAT không khớp thuế suất và các dòng hóa đơn sau giảm giá/phí giao.');const total=sum([subtotal-discount,shipping,tax]);if(deposit>total)fail('Cọc vượt giá trị đơn.');confirmed=dateOnly(b.confirmed_delivery_date)||null;
   snapshot={complete:true,historyComplete:true,subtotal,discount,shipping,tax,deposit,invoice_basis:basis,provenance:'Quản lý '+res.locals.actor+' duyệt ngày '+new Date().toISOString()};
  }
  await authorizeWrite(db);const approval=action==='approve'?'approved':action==='return'?'returned':'rejected';
  await db.query(`update local_orders set approval_status=$2,approval_reason=$3,reviewed_by=$4,reviewed_at=now(),approval_revision=approval_revision+1,
   items=$5::jsonb,commercial_snapshot=$6::jsonb,total_amount=$7,subtotal=$8,vat_amount=$9,confirmed_delivery_date=$10::date,delivery_date=$10::date::timestamptz,
   include_vat=($11::numeric>0),vat_rate=$11::numeric,status=case when $2='rejected' then 'cancelled' else 'pending' end,local_modified_at=now() where id=$1`,[id,approval,reason,res.locals.actor,JSON.stringify(items),JSON.stringify(snapshot),snapshot.subtotal-snapshot.discount+snapshot.shipping+snapshot.tax,snapshot.subtotal,snapshot.tax,confirmed,snapshot.invoice_basis?.vat_rate??0]);
  await audit(db,row.intake_connection_id,res.locals.actor,'order.'+action,id,{reason,revision:row.approval_revision+1});const result={id,approval_status:approval,revision:row.approval_revision+1};await saveHumanReceipt(db,res,receipt,result);return result;
 });});
 route('post','/orders/:id/invoice-basis',async(req,res)=>{const b=obj(req.body),id=ident(req.params.id);return transaction(pool,async db=>{
  const row=await humanOrder(db,res,id,true),receipt=await humanReceipt(db,res,b,'invoice-basis',id);if(receipt.old)return receipt.old;
  if(row.intake_source!=='ZCRM'||row.approval_status!=='approved')fail('Chỉ đối chiếu cơ sở hóa đơn cho đơn ZCRM đã duyệt.',409);
  if(row.commercial_snapshot?.invoice_basis)fail('Cơ sở hóa đơn đã được duyệt và được giữ nguyên. Không thể thay thuế suất bằng thao tác đối chiếu hồ sơ cũ.',409);
  if(b.expected_revision!==row.approval_revision)fail('Đơn đã đổi. Tải lại trước khi đối chiếu.',409,'REVISION_CONFLICT');
  const reason=txt(b.reason,2000,true),s=commercial(row);if(b.vat_rate===undefined)fail('Cần xác nhận thuế suất VAT.');
  const basis=buildZcrmInvoiceBasis(row.items,s.discount,s.shipping,b.vat_rate);
  if(vnd(basis.total)!==vnd(row.total_amount)||vnd(basis.vat_amount)!==s.tax)fail('Thuế suất/cơ sở hóa đơn không khớp tiền đã duyệt. Cần đối chiếu điều khoản gốc; không được tự thay số tiền.',409);
  if((await db.query("select 1 from local_einvoices where source_snapshot->>'type'='ORDER' and source_snapshot->>'source_id'=$1 and status not in ('cancelled','replaced') limit 1",[id])).rows[0])fail('Đơn đã có hóa đơn/nháp được giữ chỗ; cần đối chiếu chứng từ hiện hữu trước.',409);
  await authorizeWrite(db);await db.query('update local_orders set commercial_snapshot=$2::jsonb,include_vat=($3::numeric>0),vat_rate=$3,approval_revision=approval_revision+1,local_modified_at=now() where id=$1',[id,JSON.stringify({...row.commercial_snapshot,invoice_basis:basis}),basis.vat_rate]);
  await audit(db,row.intake_connection_id,res.locals.actor,'order.invoice-basis',id,{reason,vat_rate:basis.vat_rate});const result={id,revision:row.approval_revision+1};await saveHumanReceipt(db,res,receipt,result);return result;
 });});
 route('post','/orders/:id/reconcile',async(req,res)=>{const actor=admin(res),b=obj(req.body),id=ident(req.params.id);return transaction(pool,async db=>{const row=await humanOrder(db,res,id,true),receipt=await humanReceipt(db,res,b,'reconcile',id);if(receipt.old)return receipt.old;
  if(row.intake_source==='ZCRM')fail('Đơn ZCRM dùng thao tác duyệt đơn để xác nhận giá.',409);if(b.history_complete!==true)fail('Cần xác nhận đã đối chiếu lịch sử thu/hoàn/trả gốc.');
  const provenance=txt(b.provenance,2000,true),subtotal=vnd(b.subtotal),discount=vnd(b.discount),shipping=vnd(b.shipping),tax=vnd(b.tax),deposit=vnd(b.deposit);if(discount>subtotal||subtotal-discount+shipping+tax!==vnd(row.total_amount)||deposit>vnd(row.total_amount))fail('Các số tiền đối chiếu không khớp tổng đơn.');
  const incoming=list(b.lines,100);if(incoming.length!==row.items.length)fail('Cần đối chiếu đủ từng dòng hàng.');const items=(row.items as Data[]).map((r,i)=>{const l=obj(incoming[i]);if(l.kind!=='stock'&&l.kind!=='custom')fail('Dòng hàng chưa có loại hàng.');return {...r,id:r.id||randomUUID(),product_id:ident(l.productId),commerce_kind:l.kind,unit:txt(l.unit,30,true),commerce_specifications:obj(l.specifications??{})};});
  if(sum(items.map(i=>lineAmount(Number((i as Data).quantity),vnd((i as Data).price))))!==subtotal)fail('Tổng dòng hàng không khớp số tiền đối chiếu.');
  await db.query('update local_orders set commercial_snapshot=$2::jsonb,items=$3::jsonb,local_modified_at=now() where id=$1',[id,JSON.stringify({complete:true,historyComplete:true,subtotal,discount,shipping,tax,deposit,provenance}),JSON.stringify(items)]);await audit(db,null,actor,'order.reconcile',id,{provenance});const result={id,reconciled:true};await saveHumanReceipt(db,res,receipt,result);return result;
 });});
 for(const ledger of ['returns','refunds'] as const)route('post','/orders/:id/'+ledger,async(req,res)=>{const b=obj(req.body),id=ident(req.params.id);return transaction(pool,async db=>{
  const row=await humanOrder(db,res,id,true),receipt=await humanReceipt(db,res,b,ledger,id);if(receipt.old)return receipt.old;await assertZcrmOrderExecutable(db,id);const ledgers=await moneyLedgers(db,row),reason=txt(b.reason,2000,true),newId=randomUUID(),reverse=b.reversal_of?ident(b.reversal_of):null;
  if(ledger==='returns'){
   let credit=vnd(b.credit_amount??0),lines:Data[]=[],original:Data|undefined;
   if(reverse){original=ledgers.returns.find(r=>r.id===reverse&&!r.reversal_of);if(!original||ledgers.returns.some(r=>r.reversal_of===reverse))fail('Phiếu trả đã đảo hoặc không thuộc đơn.',409);credit=vnd(original.credit_amount);lines=original.lines;}
   else{lines=list(b.lines,100).map(raw=>{const l=obj(raw),lineId=ident(l.line_id),item=(row.items as Data[]).find(i=>i.id===lineId);if(!item)fail('Dòng trả không thuộc đơn.');const q=quantity(l.quantity),units=quantityUnits(q),sold=quantityUnits(item.quantity);if(units>sold)fail('Số lượng trả không hợp lệ.');
    const prior=ledgers.returns.reduce((s,r)=>s+(r.lines as Data[]).filter(x=>x.line_id===lineId).reduce((n,x)=>n+quantityUnits(x.quantity),0n)*(r.reversal_of?-1n:1n),0n);if(prior+units>sold)fail('Tổng hàng trả vượt số đã bán.');return {line_id:lineId,name:txt(item.name),quantity:q,unit:txt(item.unit)};});if(!lines.length||new Set(lines.map(l=>l.line_id)).size!==lines.length)fail('Cần chọn dòng trả, không lặp dòng.');if(BigInt(ledgers.credit)+BigInt(credit)>BigInt(vnd(row.total_amount)))fail('Giảm công nợ do trả hàng vượt tổng đơn.');}
   await db.query('insert into local_order_returns(id,order_id,credit_amount,lines,reason,reversal_of,created_by) values($1,$2,$3,$4::jsonb,$5,$6,$7)',[newId,id,credit,JSON.stringify(lines),reason,reverse,res.locals.actor]);
  }else{
   let amount=vnd(b.amount),paymentId=ident(b.payment_id),returnId=b.return_id?ident(b.return_id):null;
   if(reverse){const original=ledgers.refunds.find(r=>r.id===reverse&&!r.reversal_of);if(!original||ledgers.refunds.some(r=>r.reversal_of===reverse))fail('Phiếu hoàn đã đảo hoặc không thuộc đơn.',409);amount=vnd(original.amount);paymentId=original.payment_id;returnId=original.return_id;}
   else{if(!amount)fail('Số tiền hoàn phải lớn hơn 0.');const payment=ledgers.payments.find(p=>p.id===paymentId);if(!payment)fail('Khoản thu gốc không thuộc đơn hoặc đã xóa.');const refunded=ledgers.refunds.filter(r=>r.payment_id===paymentId).reduce((s,r)=>s+BigInt(vnd(r.amount))*(r.reversal_of?-1n:1n),0n);if(refunded+BigInt(amount)>BigInt(vnd(payment.payment_amount)))fail('Hoàn tiền vượt khoản thu gốc.');if(returnId){const ret=ledgers.returns.find(r=>r.id===returnId&&!r.reversal_of);if(!ret||ledgers.returns.some(r=>r.reversal_of===returnId))fail('Phiếu trả không còn hiệu lực.');const prior=ledgers.refunds.filter(r=>r.return_id===returnId).reduce((s,r)=>s+BigInt(vnd(r.amount))*(r.reversal_of?-1n:1n),0n);if(prior+BigInt(amount)>BigInt(vnd(ret.credit_amount)))fail('Tiền hoàn vượt giá trị phiếu trả.');}}
   await db.query('insert into local_order_refunds(id,order_id,payment_id,return_id,amount,reason,reversal_of,created_by) values($1,$2,$3,$4,$5,$6,$7,$8)',[newId,id,paymentId,returnId,amount,reason,reverse,res.locals.actor]);
  }
  await audit(db,row.intake_connection_id,res.locals.actor,'order.'+ledger,id,{ledgerId:newId,reversalOf:reverse});const result={id:newId,order_id:id};await saveHumanReceipt(db,res,receipt,result);return result;
 });});
 router.use((_req,res)=>res.status(404).json({message:'Không có thao tác này.',code:'NOT_FOUND'}));app.use('/api/zcrm-admin',router);
}
