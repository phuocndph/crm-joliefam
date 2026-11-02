import {readGhnProviderJson} from './ghn-provider-json.js';
import type express from 'express';
import type {Pool,PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ExternalReadAdapters,type GhnRuntimeConfig} from './external-read-adapters.js';
import {ghnPrincipal,ghnVisibleSql} from './ghn-tracking.js';
import {extractGhnOrderNumber} from './ghn-order-number.js';
const fail=(message:string,status=400)=>Object.assign(new Error(message),{status});
const code=z.string().trim().regex(/^[A-Za-z0-9_-]{3,60}$/);
const integer=(max:number,min=0)=>z.number().int().min(min).max(max);
export const ghnEditInfoSchema=z.object({to_name:z.string().trim().min(1).max(100),to_phone:z.string().regex(/^(?:0\d{9}|\+84\d{9})$/),to_address:z.string().trim().min(3).max(1000),to_district_id:integer(1000000,1),to_ward_code:z.string().regex(/^[A-Za-z0-9_-]{1,30}$/),weight:integer(50000,1),length:integer(150,1),width:integer(150,1),height:integer(150,1),note:z.string().max(2000),required_note:z.enum(['CHOTHUHANG','CHOXEMHANGKHONGTHU','KHONGCHOXEMHANG']),cod_failed_amount:integer(50000000)}).strict();
const inputSchema=z.object({idempotencyKey:z.string().uuid(),expectedFingerprint:z.string().length(64),info:ghnEditInfoSchema.optional(),codAmount:integer(50000000).optional()}).strict().refine(v=>v.info!==undefined||v.codAmount!==undefined);
type Input=z.infer<typeof inputSchema>;
type State='NOT_REQUESTED'|'READY'|'IN_FLIGHT'|'SUCCESS'|'FAILED'|'UNKNOWN';
type Attempt={id:string;actor_id:string;tracking_id:string;order_code:string;manager_id:string|null;tenant_id:string|null;order_id:string|null;shop_id:string;config_revision:number;config_mode:string;idempotency_key:string;payload_hash:string;request_data:Input;info_status:State;cod_status:State;result_data:Record<string,unknown>;snapshot_synced:boolean;updated_at:Date};
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const publicAttempt=(a:Attempt)=>({attemptId:a.id,info:{status:a.info_status},cod:{status:a.cod_status},snapshotSynced:a.snapshot_synced,...a.result_data});
const nullable=(v:unknown)=>v==null?null:String(v);
const terminal=['delivered','self_delivered','cancel','cancelled','returned','lost','damage'];
const relevant=(r:Record<string,unknown>)=>Object.fromEntries(['order_code','shop_id','status','is_new_to_address','to_province_name','to_ward_name','to_name','to_phone','to_address','to_district_id','to_ward_code','weight','length','width','height','note','required_note','cod_amount','cod_failed_amount'].map(k=>[k,r[k]??null]));
const matches=(expected:Record<string,unknown>,actual:Record<string,unknown>)=>Object.entries(expected).every(([k,v])=>typeof v==='number'?Number(actual[k])===v:String(actual[k]??'')===String(v));
/** All writes use fixed carrier URLs and durable operation states. UNKNOWN is never resent. */
export class GhnEditing {
 constructor(private pool:Pool,private adapter:ExternalReadAdapters,private fetcher:typeof fetch=fetch){}
 private async row(db:Pick<Pool,'query'>|Pick<PoolClient,'query'>,actor:string,orderCode:string,lock=false){
  const p=await ghnPrincipal(db,actor);
  const r=(await db.query(`select g.*,md5(to_jsonb(g)::text) row_revision from local_ghn_tracking g left join local_orders o on o.id=g.order_id where ${ghnVisibleSql} and g.ghn_order_code=$3 ${lock?'for update of g':''}`,[p.role,p.manager,orderCode])).rows[0];
  if(!r)throw fail('Không tìm thấy vận đơn trong phạm vi quản lý.',404);return r;
 }
 private async config(){const c=await this.adapter.snapshot();if(!c.configured||c.mode==='DISABLED')throw fail('GHN chưa được cấu hình hoặc đã tắt.',503);return c;}
 private async detailFor(row:Record<string,unknown>,config:GhnRuntimeConfig){
  const answer=await this.adapter.ghn({action:'get_order_detail',orderCode:row.ghn_order_code},config);
  const raw=answer.data?.rawData as Record<string,unknown>|undefined;
  if(!answer.success||!raw||raw.order_code!==row.ghn_order_code||!config.shops.includes(String(raw.shop_id)))throw fail('Không xác minh được vận đơn hoặc cửa hàng GHN.',502);
  const saved=(row.raw_data as {shop_id?:unknown}|null)?.shop_id;
  if(saved!=null&&String(saved)!==String(raw.shop_id))throw fail('Cửa hàng GHN khác bản lưu.',409);
  return raw;
 }
 private fingerprint(row:Record<string,unknown>,raw:Record<string,unknown>,config:GhnRuntimeConfig){return hash([row.row_revision,relevant(raw),config.mode,config.revision,config.source]);}
 async detail(actor:string,orderCode:string){
  code.parse(orderCode);const row=await this.row(this.pool,actor,orderCode),config=await this.config(),raw=await this.detailFor(row,config);
  const fresh=await this.row(this.pool,actor,orderCode),now=await this.config();
  if(row.row_revision!==fresh.row_revision||config.revision!==now.revision||config.mode!==now.mode||config.source!==now.source)throw fail('Vận đơn hoặc cấu hình thay đổi; hãy tải lại.',409);
  const pending=(await this.pool.query<Attempt>("select * from integration_private.ghn_edit_attempts where tracking_id=$1 and actor_id=$2 and (info_status in ('READY','IN_FLIGHT','UNKNOWN') or cod_status in ('READY','IN_FLIGHT','UNKNOWN')) order by created_at desc limit 1",[row.id,actor])).rows[0];
  return {data:raw,fingerprint:this.fingerprint(row,raw,config),pendingAttempt:pending?publicAttempt(pending):null};
 }
 private async locked(client:PoolClient,actor:string,orderCode:string,config?:GhnRuntimeConfig){
  await client.query('begin');await client.query("set local lock_timeout='5s'");
  await client.query("select pg_advisory_xact_lock_shared(hashtextextended('production-source-sync',0))");
  await client.query('lock table local_projection_tombstones in share mode');
  await client.query('select user_id from local_user_profiles where user_id=$1 for share',[actor]);
  await client.query('select user_id from local_user_roles where user_id=$1 order by role for share',[actor]);
  await client.query("select user_id from local_employee_permissions where user_id=$1 and permission_type in ('ghn_tracking','orders') order by permission_type for share",[actor]);
  await client.query("select pg_advisory_xact_lock_shared(hashtextextended('integration-private-ghn-settings',0))");
  if(config){const r=(await client.query('select mode,revision from integration_private.ghn_settings where id=true for share')).rows[0];const mode=config.source==='saved'?'ENABLED':'INHERIT_ENV';if((r&&(r.mode!==mode||Number(r.revision)!==config.revision))||(!r&&config.revision!==0))throw fail('Cấu hình GHN đã thay đổi.',409);}
  const row=await this.row(client,actor,orderCode,true);
  if(row.order_id)await client.query('select id from local_orders where id=$1 for share',[row.order_id]);
  return this.row(client,actor,orderCode,true);
 }
 private sameScope(a:Attempt,row:Record<string,unknown>){if(a.tracking_id!==row.id||a.order_id!==nullable(row.order_id)||a.manager_id!==nullable(row.manager_id)||a.tenant_id!==nullable(row.tenant_id))throw fail('Phạm vi vận đơn đã thay đổi.',409);}
 async get(actor:string,id:string){z.string().uuid().parse(id);const a=(await this.pool.query<Attempt>('select * from integration_private.ghn_edit_attempts where id=$1 and actor_id=$2',[id,actor])).rows[0];if(!a)throw fail('Không tìm thấy lượt cập nhật GHN.',404);this.sameScope(a,await this.row(this.pool,actor,a.order_code));return a;}
 async notDispatched(actor:string,input:unknown):Promise<boolean>{
  const key=(input as {idempotencyKey?:unknown}|null)?.idempotencyKey;
  if(!z.string().uuid().safeParse(key).success)return true;
  try{const a=(await this.pool.query<Attempt>('select * from integration_private.ghn_edit_attempts where actor_id=$1 and idempotency_key=$2',[actor,key])).rows[0];return !a||![a.info_status,a.cod_status].some(state=>['READY','IN_FLIGHT','SUCCESS','UNKNOWN'].includes(state));}catch{return false;}
 }
 async submit(actor:string,orderCode:string,input:unknown){
  code.parse(orderCode);const body=inputSchema.parse(input),payloadHash=hash(body);
  const existing=(await this.pool.query<Attempt>('select * from integration_private.ghn_edit_attempts where actor_id=$1 and idempotency_key=$2',[actor,body.idempotencyKey])).rows[0];
  if(existing){if(existing.payload_hash!==payloadHash||existing.order_code!==orderCode)throw fail('Mã lượt cập nhật đã dùng cho nội dung khác.',409);return publicAttempt(await this.get(actor,existing.id));}
  const row=await this.row(this.pool,actor,orderCode),config=await this.config(),raw=await this.detailFor(row,config);
  if(this.fingerprint(row,raw,config)!==body.expectedFingerprint)throw fail('Dữ liệu đã thay đổi. Tải lại vận đơn trước khi lưu.',409);
  if(raw.is_new_to_address===true&&body.info)throw fail('Chưa hỗ trợ sửa thông tin địa chỉ hai cấp tại đây. Hãy sửa trực tiếp trên GHN; COD vẫn có thể cập nhật riêng.',409);
  if(terminal.includes(String(raw.status)))throw fail('Vận đơn đã kết thúc; không thể chỉnh sửa.',409);
  const client=await this.pool.connect();let attempt:Attempt;
  try{const current=await this.locked(client,actor,orderCode,config);if(current.row_revision!==row.row_revision)throw fail('Vận đơn đã thay đổi.',409);
   attempt=(await client.query<Attempt>(`insert into integration_private.ghn_edit_attempts(actor_id,tracking_id,order_code,manager_id,tenant_id,order_id,shop_id,config_revision,config_mode,idempotency_key,payload_hash,request_data,info_status,cod_status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14) returning *`,[actor,row.id,orderCode,row.manager_id,row.tenant_id,row.order_id,String(raw.shop_id),config.revision,config.mode,body.idempotencyKey,payloadHash,JSON.stringify(body),body.info?'READY':'NOT_REQUESTED',body.codAmount!==undefined?'READY':'NOT_REQUESTED'])).rows[0];
   await client.query('commit');
  }catch(e){await client.query('rollback');if((e as {code?:string}).code==='23505')throw fail('Có lượt cập nhật chưa xác định kết quả. Hãy kiểm tra lượt trước.',409);throw e;}finally{client.release();}
  // Reservation serializes CRM callers. Recheck remote evidence once again
  // after reservation, before any POST; failed verification never dispatches.
  try { const latest=await this.detailFor(await this.row(this.pool,actor,orderCode),config);if(hash(relevant(latest))!==hash(relevant(raw)))throw fail('GHN đã thay đổi trước khi gửi. Hãy tải lại.',409); }
  catch(e){await this.pool.query("update integration_private.ghn_edit_attempts set info_status=case when info_status='READY' then 'FAILED' else info_status end,cod_status=case when cod_status='READY' then 'FAILED' else cod_status end,updated_at=now() where id=$1",[attempt.id]);throw e;}
  for(const operation of ['info','cod'] as const){
   if(attempt[`${operation}_status`]!=='READY')continue;
   const c=await this.pool.connect();
   try{const current=await this.locked(c,actor,orderCode,config);this.sameScope(attempt,current);
    const claim=await c.query(`update integration_private.ghn_edit_attempts set ${operation}_status='IN_FLIGHT',updated_at=now() where id=$1 and ${operation}_status='READY' returning id`,[attempt.id]);await c.query('commit');
    if(!claim.rows.length)continue;
   }catch(e){await c.query('rollback');await this.pool.query(`update integration_private.ghn_edit_attempts set ${operation}_status='FAILED',updated_at=now() where id=$1 and ${operation}_status='READY'`,[attempt.id]);throw e;}finally{c.release();}
   let state:State='UNKNOWN';
   try{const response=await this.fetcher('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/'+(operation==='info'?'update':'updateCOD'),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',Token:config.token,ShopId:attempt.shop_id},body:JSON.stringify({order_code:orderCode,...(operation==='info'?body.info:{cod_amount:body.codAmount})})});
    const value=await readGhnProviderJson(response);if(response.ok&&value.code===200)state='SUCCESS';else if(response.status>=400&&response.status<500||response.ok&&typeof value.code==='number'&&value.code!==200)state='FAILED';
   }catch{/* Carrier may have accepted: never retry this operation automatically. */}
   await this.pool.query(`update integration_private.ghn_edit_attempts set ${operation}_status=$2,updated_at=now() where id=$1 and ${operation}_status='IN_FLIGHT'`,[attempt.id,state]);
   attempt=(await this.pool.query<Attempt>('select * from integration_private.ghn_edit_attempts where id=$1',[attempt.id])).rows[0];
   // Do not dispatch another remote write after an uncertain result.
   if(state==='UNKNOWN'){await this.pool.query("update integration_private.ghn_edit_attempts set cod_status=case when cod_status='READY' then 'FAILED' else cod_status end where id=$1",[attempt.id]);break;}
  }
  return this.reconcile(actor,attempt.id);
 }
 async reconcile(actor:string,id:string){
  let a=await this.get(actor,id);const config=await this.config();
  if(a.config_revision!==config.revision||a.config_mode!==config.mode||!config.shops.includes(a.shop_id))return publicAttempt(a);
  let raw:Record<string,unknown>;
  const readRow=await this.row(this.pool,actor,a.order_code);
  try{raw=await this.detailFor(readRow,config);}catch{return publicAttempt(a);}
  if(String(raw.shop_id)!==a.shop_id)return publicAttempt(a);
  const client=await this.pool.connect();
  try{const row=await this.locked(client,actor,a.order_code,config);this.sameScope(a,row);
   if(row.row_revision!==readRow.row_revision){await client.query('rollback');return publicAttempt(await this.get(actor,id));}
   a=(await client.query<Attempt>('select * from integration_private.ghn_edit_attempts where id=$1 for update',[id])).rows[0];
   const infoMatch=a.request_data.info&&matches(a.request_data.info,raw),codMatch=a.request_data.codAmount!==undefined&&Number(raw.cod_amount)===a.request_data.codAmount;
   const aged=Date.now()-new Date(a.updated_at).getTime()>30000;
   const resolve=(state:State,match:unknown):State=>state==='READY'&&aged?'FAILED':(state==='UNKNOWN'||state==='IN_FLIGHT'&&aged)&&match?'SUCCESS':state;
   const info=resolve(a.info_status,infoMatch),codState=resolve(a.cod_status,codMatch);
   await client.query('update integration_private.ghn_edit_attempts set info_status=$2,cod_status=$3 where id=$1',[id,info,codState]);
   const successfulSectionsVerified=(info!=='SUCCESS'||infoMatch)&&(codState!=='SUCCESS'||codMatch);
   if((info==='SUCCESS'||codState==='SUCCESS')&&successfulSectionsVerified&&typeof raw.to_name==='string'&&typeof raw.to_phone==='string'&&Number.isSafeInteger(Number(raw.cod_amount))){
    await client.query(`update local_ghn_tracking set customer_name=$2,customer_phone=$3,customer_address=$4,package_weight=$5,cod_amount=$6,internal_order_code=$7,raw_data=coalesce(raw_data,'{}'::jsonb)||$8::jsonb,last_updated_at=now(),updated_at=now(),local_modified_at=now() where id=$1`,[row.id,raw.to_name,raw.to_phone,[raw.to_address,raw.to_ward_name,raw.to_district_name,raw.to_province_name].filter(Boolean).join(', '),raw.weight,raw.cod_amount,extractGhnOrderNumber(raw.to_name),JSON.stringify({...raw,local_ghn_status_refresh:{to_name:raw.to_name,status:raw.status,checked_at:new Date().toISOString()}})]);
    await client.query('update integration_private.ghn_edit_attempts set snapshot_synced=true where id=$1',[id]);a.snapshot_synced=true;
   }
   await client.query(`insert into local_auth_audit_events(entity_type,entity_id,action,actor_id,reason,after_data) values('ghn_tracking',$1,'EDIT_GHN_ORDER',$2,'Kết quả cập nhật GHN; không thay đổi tài chính hoặc đơn CRM',$3::jsonb)`,[row.id,actor,JSON.stringify({attempt_id:id,info_status:info,cod_status:codState,snapshot_synced:a.snapshot_synced})]);
   await client.query('commit');
  }catch{await client.query('rollback');}finally{client.release();}
  return publicAttempt(await this.get(actor,id));
 }
}
export function registerGhnEditing(app:express.Express,service:GhnEditing,actor:()=>string,sendError:(res:express.Response,error:unknown)=>void){
 app.get('/api/ghn-edit/:code/detail',async(req,res)=>{try{res.setHeader('Cache-Control','no-store');res.json(await service.detail(actor(),req.params.code));}catch(e){sendError(res,e);}});
 app.post('/api/ghn-edit/:code',async(req,res)=>{try{res.json(await service.submit(actor(),req.params.code,req.body));}catch(e){const error=e as {status?:number;message?:string};res.status(e instanceof z.ZodError?400:Number(error.status)||500).json({message:e instanceof z.ZodError?'Dữ liệu cập nhật GHN không hợp lệ.':error.status?error.message:'Chưa xác định được kết quả cập nhật GHN.',ghn_edit_not_dispatched:await service.notDispatched(actor(),req.body)});}});
 app.post('/api/ghn-edit-attempts/:id/reconcile',async(req,res)=>{try{res.json(await service.reconcile(actor(),req.params.id));}catch(e){sendError(res,e);}});
}
