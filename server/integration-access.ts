import express from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { integrationCatalog, unsupportedIntegrationModules, resourceCatalog, type IntegrationGrant } from './integration-catalog.js';
import { integrationBusinessCapabilities,integrationBusinessTools } from './integration-business-catalog.js';
import {createIntegrationInternalDispatcher} from './integration-internal-principal.js';
import {registerIntegrationBusiness, businessInputSchema, businessToolSchema} from './integration-business.js';
import {permissionCatalog,validatePermissionChanges} from './permission-policy.js';
import { runtime } from './runtime.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
const allCatalog=[...integrationCatalog,...integrationBusinessCapabilities];
const capabilitySchema = z.string().refine(value=>allCatalog.some(c=>c.id===value),'Quyền không hỗ trợ.');
const reasonSchema = z.string().trim().min(3).max(300);
const idSchema = z.string().min(1).max(100);
const grantSchema = z.object({ capability: capabilitySchema, resource_ids: z.array(idSchema).max(500), secondary_ids: z.array(idSchema).max(500).default([]), contact_access: z.boolean().default(false), all_resources:z.boolean().default(false) }).strict();
const readInput = z.object({ id: idSchema.optional(), search: z.string().max(100).default(''), offset: z.coerce.number().int().min(0).max(10000).default(0), limit: z.coerce.number().int().min(1).max(100).default(30), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict();
const validDate = (value: string) => { const milliseconds = Date.parse(value); return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0,10) === value; };
type WorkBudget = { pending: number; routed: boolean; done: boolean; aborted: boolean; key_id?: string; settle: () => void; assertAlive: () => void };
export type Principal = { key_id: string; connection_id: string; token_hash: string; capabilities: string[]; request_id: string; work: WorkBudget };
type MachineRequest = express.Request & { integration?: Principal };
type Caller = { userId: string } | null;
const keyColumns = 'id,connection_id,name,prefix,capabilities,expires_at,revoked_at,last_used_at,created_at';
const selectColumns: Record<string,string> = {
 'products.read': 'r.id::text id,r.sku,r.name,r.category,r.rate_unit,r.is_active,r.updated_at',
 'customers.read': 'r.id,r.customer_code,r.name,r.company,r.current_status,r.is_active,r.updated_at',
 'orders.read': 'r.id,r.order_number,r.display_order_number,r.status,r.payment_status,r.delivery_date,r.created_at,r.updated_at',
 'quotes.read': 'r.id,r.quote_number,r.status,r.created_at,r.updated_at',
 'production.read': 'r.id::text id,r.production_order_number,r.production_batch_number,r.status,r.quantity_planned::text quantity_planned,r.quantity_good::text quantity_good,r.quantity_scrap::text quantity_scrap,r.quantity_rework::text quantity_rework,r.planned_start_date,r.planned_end_date,r.actual_start_at,r.actual_end_at,r.updated_at',
};
export const effectiveIntegrationGrants = (grants:IntegrationGrant[]) => allCatalog.filter(c=>grants.some(g=>g.capability===c.id&&(g.capability.startsWith('business.')||g.all_resources===true?g.all_resources===true:g.resource_ids.length&&(c.id!=='inventory.read'||g.secondary_ids.length))));
const effective=effectiveIntegrationGrants;

export function registerIntegrationAccess(app: express.Express, pool: Pool, resolveCaller: (req: express.Request) => Promise<Caller>) {
 const enabled = runtime.integrationEnabled;
 const audit = async (client: Pool | PoolClient, actor: string, action: string, outcome: string, connection: string | null = null, key: string | null = null, reason?: string, requestId: string = randomUUID(), details: object = {}) => {
  await client.query('insert into integration_access.audit(request_id,connection_id,key_id,actor_id,action,outcome,reason,details) values($1,$2,$3,$4,$5,$6,$7,$8)', [requestId,connection,key,actor,action,outcome,reason || null,JSON.stringify(details)]);
 };
 const transaction = async <T>(task: (client: PoolClient) => Promise<T>, assertAlive:()=>void=()=>{}) => {
  assertAlive();
  const client = await pool.connect();
  const guarded = new Proxy(client,{get(target,property){if(property==='query')return async(...args:Parameters<PoolClient['query']>)=>{assertAlive();const result=await Reflect.apply(target.query,target,args);assertAlive();return result;};return Reflect.get(target,property);}});
  try { assertAlive();await client.query('begin'); await client.query("set local statement_timeout='5s'"); await client.query("set local lock_timeout='2s'"); const result = await task(guarded); assertAlive();await client.query('commit'); return result; }
  catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
 };
 const errorResponse = (res: express.Response, error: unknown) => {
  if (res.headersSent || res.destroyed) return;
  const status = error instanceof z.ZodError ? 400 : Number((error as { status?: number }).status || 500);
  res.status(status).json({ message: status === 500 ? 'Không thể thực hiện yêu cầu kết nối. Vui lòng thử lại.' : error instanceof z.ZodError ? 'Dữ liệu yêu cầu không hợp lệ.' : (error as Error).message });
 };
 const run = (handler: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler => (req,res) => { const work=res.locals.integrationWork as WorkBudget|undefined;if(work)work.pending++;void Promise.resolve().then(()=>{work?.assertAlive();return handler(req,res);}).catch(async error => {
  if(res.locals.integrationAdmin)try{await audit(pool,res.locals.integrationAdmin,'management.request','DENIED');}catch{ /* fail closed, no data returned */ }
  errorResponse(res,error);
 }).finally(()=>{if(work){work.pending--;work.done=true;work.settle();}}); };
 const adminGuard: express.RequestHandler = (req,res,next) => {
  void (async() => {
   const caller = await resolveCaller(req);
   if (!caller || caller.userId === 'local-admin') throw fail(403,'Cần đăng nhập bằng tài khoản quản trị thật để quản lý kết nối.');
   const valid = await pool.query("select 1 from local_user_profiles p join local_user_roles r on r.user_id=p.user_id where p.user_id=$1 and p.is_active and r.is_active and r.role='admin'",[caller.userId]);
   if (!valid.rows[0]) throw fail(403,'Chỉ quản trị viên được quản lý API và Agent.');
   res.locals.integrationAdmin=caller.userId; res.setHeader('Cache-Control','no-store'); next();
  })().catch(error=>errorResponse(res,error));
 };
 // Use a dedicated router: there is no fallback to generic browser adapters.
 const admin = express.Router(); admin.use(adminGuard);
 admin.get('/catalog',run(async(_req,res)=>res.json({ enabled, capabilities: allCatalog, tools:integrationBusinessTools, execution_roles:['admin','manager','accountant','employee','team_leader'], execution_permissions:[...permissionCatalog], unsupported: unsupportedIntegrationModules, limits: { requests_per_minute: 60, concurrent_per_process: 4, max_rows:100 }, api:'/api/integrations/v1', mcp:'/api/mcp' })));
 admin.get('/connections',run(async(_req,res)=>res.json((await pool.query('select * from integration_access.connections order by created_at desc limit 200')).rows)));
 admin.post('/connections',run(async(req,res)=>{
  const data=z.object({name:z.string().trim().min(1).max(100),description:z.string().max(500).default(''),reason:reasonSchema}).strict().parse(req.body);
  const connection=await transaction(async client=>{ const row=(await client.query('insert into integration_access.connections(name,description,created_by) values($1,$2,$3) returning *',[data.name,data.description,res.locals.integrationAdmin])).rows[0]; await audit(client,res.locals.integrationAdmin,'connection.create','OK',row.id,null,data.reason); return row; });
  res.status(201).json(connection);
 }));
 admin.patch('/connections/:id',run(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id); const data=z.object({active:z.boolean(),version:z.number().int().positive(),reason:reasonSchema}).strict().parse(req.body);
  const row=await transaction(async client=>{const updated=(await client.query('update integration_access.connections set active=$2,policy_version=policy_version+1,updated_at=now() where id=$1 and policy_version=$3 returning *',[id,data.active,data.version])).rows[0]; if(!updated)throw fail(409,'Kết nối đã thay đổi. Hãy tải lại.'); await audit(client,res.locals.integrationAdmin,'connection.status','OK',id,null,data.reason);return updated;}); res.json(row);
 }));
 admin.get('/resources/:type',run(async(req,res)=>{
  const entry=resourceCatalog[String(req.params.type)];if(!entry)throw fail(400,'Loại tài nguyên không hỗ trợ.');
  const input=z.object({search:z.string().max(100).default(''),offset:z.coerce.number().int().min(0).max(10000).default(0)}).strict().parse(req.query);
  const rows=await pool.query(`select r.id::text id,r.${entry.code} code,r.${entry.name} name from ${entry.table} r where ${entry.active ? `r.${entry.active} and` : ''} not exists(select 1 from local_projection_tombstones t where t.source_table=$1 and t.source_key=r.id::text) and ($2='' or concat(r.${entry.code},' ',r.${entry.name}) ilike '%'||$2||'%') order by r.id limit 51 offset $3`,[entry.source,input.search,input.offset]);
  res.json({ rows:rows.rows.slice(0,50),has_more:rows.rows.length>50 });
 }));
 admin.get('/connections/:id/grants',run(async(req,res)=>{const id=z.string().uuid().parse(req.params.id);res.json(await transaction(async client=>{const connection=(await client.query('select policy_version from integration_access.connections where id=$1 for share',[id])).rows[0];if(!connection)throw fail(404,'Không tìm thấy kết nối.');const grants=(await client.query('select capability,resource_ids,secondary_ids,contact_access,all_resources from integration_access.grants where connection_id=$1 order by capability',[id])).rows;return {policy_version:connection.policy_version,grants};}));}));
 admin.put('/connections/:id/grants',run(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);const data=z.object({version:z.number().int().positive(),grants:z.array(grantSchema).max(150),reason:reasonSchema}).strict().parse(req.body);
  if(new Set(data.grants.map(g=>g.capability)).size!==data.grants.length)throw fail(400,'Không được lặp quyền.');
  const result=await transaction(async client=>{
   const updated=(await client.query('update integration_access.connections set policy_version=policy_version+1,updated_at=now() where id=$1 and policy_version=$2 returning *',[id,data.version])).rows[0];if(!updated)throw fail(409,'Quyền đã thay đổi. Hãy tải lại.');
   for(const grant of data.grants){
    if(grant.capability.startsWith('business.')){if(!grant.all_resources||grant.resource_ids.length||grant.secondary_ids.length||grant.contact_access)throw fail(400,'Quyền mở rộng cần phạm vi toàn mô-đun rõ ràng.');continue;}
    // Quản trị chọn rõ "Toàn bộ" thì không kèm danh sách từng hồ sơ; hồ sơ mới tạo sau này cũng nằm trong phạm vi.
    if(grant.all_resources&&(grant.resource_ids.length||grant.secondary_ids.length))throw fail(400,'Đã chọn toàn bộ thì không chọn thêm từng hồ sơ.');
    const definition=integrationCatalog.find(c=>c.id===grant.capability)!;
    if(grant.contact_access && grant.capability!=='customers.read')throw fail(400,'Quyền liên hệ chỉ dành cho khách hàng.');
    if(grant.secondary_ids.length && grant.capability!=='inventory.read')throw fail(400,'Phạm vi vật tư chỉ dành cho tồn kho.');
    for(const [resource,ids] of [[definition.resource,grant.resource_ids],[grant.capability==='inventory.read'?'inventory-items':definition.resource,grant.secondary_ids]] as [string,string[]][]){
     if(!ids.length)continue;const entry=resourceCatalog[resource];if(entry.idType==='uuid'){z.array(z.string().uuid()).parse(ids);for(let index=0;index<ids.length;index++)ids[index]=ids[index].toLowerCase();}const present=await client.query(`select r.id::text id from ${entry.table} r where r.id=any($1::${entry.idType}[]) ${entry.active?'and r.'+entry.active:''} and not exists(select 1 from local_projection_tombstones t where t.source_table=$2 and t.source_key=r.id::text)`,[ids,entry.source]);
     if(present.rows.length!==new Set(ids).size)throw fail(400,'Phạm vi chứa tài nguyên không tồn tại hoặc đã ngừng hoạt động.');
    }
   }
   await client.query('delete from integration_access.grants where connection_id=$1',[id]);
   for(const grant of data.grants)await client.query('insert into integration_access.grants(connection_id,capability,resource_ids,secondary_ids,contact_access,all_resources) values($1,$2,$3,$4,$5,$6)',[id,grant.capability,[...new Set(grant.resource_ids)],[...new Set(grant.secondary_ids)],grant.contact_access,grant.all_resources||false]);
   await audit(client,res.locals.integrationAdmin,'grants.replace','OK',id,null,data.reason,undefined,{version:updated.policy_version,grants:data.grants});return updated;
  });res.json(result);
 }));
 admin.get('/connections/:id/keys',run(async(req,res)=>{const id=z.string().uuid().parse(req.params.id);res.json((await pool.query(`select ${keyColumns} from integration_access.keys where connection_id=$1 order by created_at desc limit 200`,[id])).rows);}));
 admin.post('/connections/:id/keys',run(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);const data=z.object({name:z.string().trim().min(1).max(100),capabilities:z.array(capabilitySchema).min(1).max(150),expires_at:z.string().datetime(),reason:reasonSchema,rotate_key_id:z.string().uuid().optional()}).strict().parse(req.body);
  const expiry=Date.parse(data.expires_at);if(expiry<=Date.now()||expiry>Date.now()+366*86400000)throw fail(400,'Hạn khóa phải ở tương lai, tối đa 366 ngày.');
  const secret='jf_agent_'+randomBytes(32).toString('base64url');
  const key=await transaction(async client=>{
   const conn=(await client.query('select * from integration_access.connections where id=$1 for update',[id])).rows[0];if(!conn||!conn.active)throw fail(400,'Kết nối không hoạt động.');
   const grants=effective((await client.query('select capability,resource_ids,secondary_ids,contact_access,all_resources from integration_access.grants where connection_id=$1',[id])).rows as IntegrationGrant[]).map(c=>c.id);
   if(data.capabilities.some(c=>!grants.some(g=>g===c)))throw fail(400,'Khóa chỉ nhận quyền đã cấp với phạm vi cụ thể.');
   if(data.rotate_key_id){const old=await client.query('update integration_access.keys set revoked_at=now() where id=$1 and connection_id=$2 and revoked_at is null returning id',[data.rotate_key_id,id]);if(!old.rows[0])throw fail(409,'Khóa cũ không còn hoạt động.');}
   const row=(await client.query(`insert into integration_access.keys(connection_id,name,prefix,token_hash,capabilities,expires_at,created_by) values($1,$2,$3,$4,$5,$6,$7) returning ${keyColumns}`,[id,data.name,secret.slice(0,17),hash(secret),[...new Set(data.capabilities)],data.expires_at,res.locals.integrationAdmin])).rows[0];
   await audit(client,res.locals.integrationAdmin,data.rotate_key_id?'key.rotate':'key.create','OK',id,row.id,data.reason);return row;
  });res.status(201).json({key,secret});
 }));
 admin.post('/keys/:id/revoke',run(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id),data=z.object({reason:reasonSchema}).strict().parse(req.body);
  await transaction(async client=>{const conn=(await client.query('select connection_id from integration_access.keys where id=$1',[id])).rows[0];if(!conn)throw fail(404,'Không tìm thấy khóa.');await client.query('select 1 from integration_access.connections where id=$1 for update',[conn.connection_id]);await client.query('update integration_access.keys set revoked_at=coalesce(revoked_at,now()) where id=$1',[id]);await audit(client,res.locals.integrationAdmin,'key.revoke','OK',conn.connection_id,id,data.reason);});res.json({ok:true});
 }));
 admin.get('/logs',run(async(req,res)=>{
  const input=z.object({connection_id:z.string().uuid().optional(),offset:z.coerce.number().int().min(0).max(10000).default(0)}).strict().parse(req.query);
  res.json((await pool.query('select id,request_id,connection_id,key_id,actor_id,action,outcome,reason,created_at from integration_access.audit where ($1::uuid is null or connection_id=$1) order by created_at desc limit 100 offset $2',[input.connection_id||null,input.offset])).rows);
 }));
 admin.get('/connections/:id/execution',run(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  const row=(await pool.query("select s.user_id,s.actor_label,c.policy_version from integration_access.connections c left join integration_access.service_identities s on s.connection_id=c.id where c.id=$1",[id])).rows[0];
  if(!row)throw fail(404,'Không tìm thấy kết nối.');
  const role=row.user_id?(await pool.query('select role from local_user_roles where user_id=$1 and is_active',[row.user_id])).rows[0]?.role:null;
  const permissions=row.user_id?(await pool.query('select permission_type,enabled from local_employee_permissions where user_id=$1 order by permission_type',[row.user_id])).rows:[];
  res.json({...row,configured:Boolean(row.user_id),role:role||null,permissions});
 }));
 admin.put('/connections/:id/execution',run(async(req,res)=>{
  const id=z.string().uuid().parse(req.params.id);
  const data=z.object({version:z.number().int().positive(),role:z.enum(['admin','manager','accountant','employee','team_leader']),permissions:z.array(z.object({permission_type:z.string(),enabled:z.boolean()}).strict()).max(150),reason:reasonSchema}).strict().parse(req.body);
  validatePermissionChanges(data.permissions);
  const result=await transaction(async client=>{
   const connection=(await client.query('select id,policy_version from integration_access.connections where id=$1 for update',[id])).rows[0];
   if(!connection||connection.policy_version!==data.version)throw fail(409,'Kết nối đã thay đổi. Hãy tải lại.');
   let marker=(await client.query('select user_id,actor_label from integration_access.service_identities where connection_id=$1',[id])).rows[0];
   if(!marker){const userId=randomUUID(),actorLabel='agent:'+id;
    await client.query("insert into local_user_profiles(id,user_id,email,first_name,is_active,password_hash,is_snapshot_record,local_modified_at) values($1,$1,$2,$3,true,null,false,now())",[userId,'agent-'+id+'@integration.invalid',actorLabel]);
    marker=(await client.query('insert into integration_access.service_identities(connection_id,user_id,actor_label,configured_by) values($1,$2,$3,$4) returning user_id,actor_label',[id,userId,actorLabel,res.locals.integrationAdmin])).rows[0];
   }
   await client.query('select user_id from local_user_profiles where user_id=$1 for update',[marker.user_id]);
   await client.query("select set_config('integration_access.configuring_connection',$1,true)",[id]);
   await client.query('update local_user_roles set is_active=false,updated_at=now(),local_modified_at=now() where user_id=$1',[marker.user_id]);
   // Deliberately no assigned_by: service identity must never inherit its creator's ownership.
   await client.query("insert into local_user_roles(user_id,role,is_active,is_snapshot_record,local_modified_at) values($1,$2,true,false,now()) on conflict(user_id,role) do update set is_active=true,assigned_by=null,updated_at=now(),local_modified_at=now()",[marker.user_id,data.role]);
   await client.query('delete from local_employee_permissions where user_id=$1',[marker.user_id]);
   for(const permission of data.permissions)await client.query("insert into local_employee_permissions(user_id,permission_type,enabled,reason,is_snapshot_record,local_modified_at) values($1,$2,$3,$4,false,now())",[marker.user_id,permission.permission_type,permission.enabled,data.reason]);
   await client.query('update integration_access.service_identities set configured_by=$2,updated_at=now() where connection_id=$1',[id,res.locals.integrationAdmin]);
   const updated=(await client.query('update integration_access.connections set policy_version=policy_version+1,updated_at=now() where id=$1 returning policy_version',[id])).rows[0];
   await audit(client,res.locals.integrationAdmin,'execution.configure','OK',id,null,data.reason,undefined,{role:data.role,permission_count:data.permissions.length});
   return {...marker,...updated,configured:true,role:data.role,permissions:data.permissions};
  });res.json(result);
 }));
 admin.use((_req,res)=>res.status(404).json({message:'API quản trị kết nối không tồn tại.'}));
 app.use('/api/integration-access',admin);

 const ipAttempts=new Map<string,{minute:number,count:number}>(); const inflight=new Map<string,number>();
 let lastQuotaCleanup=0;let machineRequests=0;
 const machineGuard: express.RequestHandler=(req,res,next)=>{
  void (async()=>{
   res.setHeader('Cache-Control','no-store');const requestId=randomUUID();res.setHeader('X-Request-Id',requestId);
   if(!enabled)throw fail(503,'API và MCP Agent đang tắt trong cấu hình máy chủ.');
   if(machineRequests>=32)throw fail(429,'Máy chủ đang giới hạn số yêu cầu Agent đồng thời.');
   machineRequests++;let released=false;
   const work:WorkBudget={pending:1,routed:false,done:false,aborted:false,settle:()=>{if(!released&&work.pending===0&&(work.done||work.aborted||!work.routed)){released=true;machineRequests--;if(work.key_id){const remaining=(inflight.get(work.key_id)||1)-1;if(remaining<=0)inflight.delete(work.key_id);else inflight.set(work.key_id,remaining);}}},assertAlive:()=>{if(work.aborted||req.aborted||res.destroyed)throw fail(499,'Yêu cầu đã ngắt kết nối.');}};
   res.locals.integrationWork=work;
   const aborted=()=>{work.aborted=true;work.settle();};req.once('aborted',aborted);res.once('close',()=>{if(!res.writableFinished)aborted();});
   work.assertAlive();
   const guardedQuery=async(sql:string,values?:unknown[])=>{work.assertAlive();const result=await pool.query(sql,values);work.assertAlive();return result;};
   const host=req.get('host')||'';
   const allowedHost=runtime.publicOrigin?new URL(runtime.publicOrigin).host===host:[`localhost:${runtime.port}`,`127.0.0.1:${runtime.port}`].includes(host);
   if(!allowedHost)throw fail(403,'Host không được phép.');
   const origin=req.get('origin');if(origin&&!runtime.allowedOrigins.has(origin))throw fail(403,'Origin không được phép.');
   const address=req.socket.remoteAddress||'unknown',minute=Math.floor(Date.now()/60000);
   if(ipAttempts.size>=10000){for(const [ip,bucket]of ipAttempts)if(bucket.minute!==minute)ipAttempts.delete(ip);if(ipAttempts.size>=10000&&!ipAttempts.has(address))throw fail(429,'Máy chủ đang giới hạn yêu cầu xác thực.');}
   const bucket=ipAttempts.get(address);const updated=bucket?.minute===minute?{minute,count:bucket.count+1}:{minute,count:1};ipAttempts.set(address,updated);
   if(updated.count>240)throw fail(429,'Quá nhiều yêu cầu xác thực.');
   const token=req.get('authorization')?.match(/^Bearer (jf_agent_[A-Za-z0-9_-]{43})$/)?.[1];
   if(!token){if(updated.count<=10)await audit(pool,'anonymous','authentication','DENIED',null,null,undefined,requestId);throw fail(401,'Thiếu hoặc sai khóa API.');}
   const key=(await guardedQuery('select k.id key_id,k.connection_id,k.capabilities from integration_access.keys k join integration_access.connections c on c.id=k.connection_id where k.token_hash=$1 and k.revoked_at is null and k.expires_at>now() and c.active',[hash(token)])).rows[0];
   if(!key){if(updated.count<=10)await audit(pool,'anonymous','authentication','DENIED',null,null,undefined,requestId);throw fail(401,'Thiếu hoặc sai khóa API.');}
   if(Date.now()-lastQuotaCleanup>3600000){lastQuotaCleanup=Date.now();await guardedQuery("delete from integration_access.quotas where minute<now()-interval '2 days'");}
   const quota=(await guardedQuery("insert into integration_access.quotas(key_id,minute,requests) values($1,date_trunc('minute',now()),1) on conflict(key_id,minute) do update set requests=integration_access.quotas.requests+1 returning requests",[key.key_id])).rows[0];
   if(quota.requests>60){res.setHeader('Retry-After','60');if(quota.requests===61)await audit(pool,'agent:'+key.connection_id,'quota','DENIED',key.connection_id,key.key_id,undefined,requestId);throw fail(429,'Khóa vượt 60 yêu cầu mỗi phút.');}
   if((inflight.get(key.key_id)||0)>=4)throw fail(429,'Khóa đang có quá nhiều yêu cầu đồng thời.');
   work.assertAlive();inflight.set(key.key_id,(inflight.get(key.key_id)||0)+1);work.key_id=key.key_id;
   (req as MachineRequest).integration={...key,token_hash:hash(token),request_id:requestId,work};work.routed=true;next();
  })().catch(error=>errorResponse(res,error)).finally(()=>{const work=res.locals.integrationWork as WorkBudget|undefined;if(work){work.pending--;work.settle();}});
 };
 const withPrincipal=async <T>(principal:Principal,action:string,task:(client:PoolClient,grants:IntegrationGrant[])=>Promise<T>):Promise<T>=>{
  principal.work.pending++;
  try{return await transaction(async client=>{
  // Connection lock serializes reads with revoke/grant/status changes; no cached privileges.
  const conn=(await client.query('select id from integration_access.connections where id=$1 and active for share',[principal.connection_id])).rows[0];
  const key=(await client.query('select capabilities from integration_access.keys where id=$1 and token_hash=$2 and revoked_at is null and expires_at>now()',[principal.key_id,principal.token_hash])).rows[0];
  if(!conn||!key)throw fail(401,'Khóa không còn hiệu lực.');
  const grants=(await client.query('select capability,resource_ids,secondary_ids,contact_access,all_resources from integration_access.grants where connection_id=$1 and capability=any($2::text[])',[principal.connection_id,key.capabilities])).rows as IntegrationGrant[];
  const result=await task(client,grants);await client.query('update integration_access.keys set last_used_at=now() where id=$1',[principal.key_id]);await audit(client,'agent:'+principal.connection_id,action,'OK',principal.connection_id,principal.key_id,undefined,principal.request_id);return result;
 },principal.work.assertAlive).catch(async error=>{if(!principal.work.aborted)await audit(pool,'agent:'+principal.connection_id,action,'DENIED',principal.connection_id,principal.key_id,undefined,principal.request_id);throw error;});}
 finally{principal.work.pending--;principal.work.settle();}
 };
 const read=async(principal:Principal,capability:string,input:unknown)=>{
  let data:z.infer<typeof readInput>;
  try{data=readInput.parse(input);}catch(error){await audit(pool,'agent:'+principal.connection_id,capability,'INVALID',principal.connection_id,principal.key_id,undefined,principal.request_id);throw error;}
  return withPrincipal(principal,capability,async(client,grants)=>{
   const grant=grants.find(g=>g.capability===capability);if(!grant||!effective(grants).some(c=>c.id===capability))throw fail(403,'Kết nối chưa được cấp quyền hoặc phạm vi này.');
   const definition=integrationCatalog.find(c=>c.id===capability)!;
   if(data.id&&resourceCatalog[definition.resource].idType==='uuid')data.id=data.id.toLowerCase();
   const all=grant.all_resources===true;const scope=all?null:grant.resource_ids,secondary=all?null:grant.secondary_ids;
   if(data.id&&!all&&!grant.resource_ids.includes(data.id))throw fail(404,'Không tìm thấy tài nguyên trong phạm vi.');
   let rows:Record<string,unknown>[];
   if(capability==='inventory.read'){
    rows=(await client.query(`select m.warehouse_id::text warehouse_id,m.inventory_item_id::text inventory_item_id,i.base_unit unit,sum(m.quantity_delta)::text quantity_on_hand from local_inventory_movements m join local_inventory_warehouses w on w.id=m.warehouse_id join local_inventory_items i on i.id=m.inventory_item_id where ($1::uuid[] is null or m.warehouse_id=any($1::uuid[])) and ($2::uuid[] is null or m.inventory_item_id=any($2::uuid[])) and w.is_active and i.is_active and ($3::uuid is null or m.warehouse_id=$3::uuid) and not exists(select 1 from local_projection_tombstones t where (t.source_table='inventory_warehouses' and t.source_key=w.id::text) or (t.source_table='inventory_items' and t.source_key=i.id::text)) group by m.warehouse_id,m.inventory_item_id,i.base_unit order by m.warehouse_id,m.inventory_item_id limit $4 offset $5`,[scope,secondary,data.id||null,data.limit+1,data.offset])).rows;
   }else if(capability==='attendance.read'){
    if(!data.from||!data.to)throw fail(400,'Chấm công cần ngày từ và đến.');const from=Date.parse(data.from),to=Date.parse(data.to);if(!validDate(data.from)||!validDate(data.to)||to<from||to-from>31*86400000)throw fail(400,'Ngày chấm công phải hợp lệ, phạm vi tối đa 32 ngày.');
    rows=(await client.query(`select a.worker_id::text worker_id,a.work_date,a.attendance_method,a.workflow_status,sum(a.day_units)::text day_units,sum(a.work_hours)::text work_hours,sum(a.output_quantity)::text output_quantity from local_attendance a join local_workers w on w.id=a.worker_id where ($1::uuid[] is null or a.worker_id=any($1::uuid[])) and ($2::uuid is null or a.worker_id=$2::uuid) and a.work_date between $3::date and $4::date and not a.is_reversed and w.is_active and not exists(select 1 from local_projection_tombstones t where t.source_table='workers' and t.source_key=w.id::text) group by a.worker_id,a.work_date,a.attendance_method,a.workflow_status order by a.work_date,a.worker_id,a.attendance_method,a.workflow_status limit $5 offset $6`,[scope,data.id||null,data.from,data.to,data.limit+1,data.offset])).rows;
   }else{
    const entry=resourceCatalog[definition.resource];const columns=selectColumns[capability]+(capability==='customers.read'&&grant.contact_access?',r.email,r.phone,r.address':'');
    rows=(await client.query(`select ${columns} from ${entry.table} r where ($1::${entry.idType}[] is null or r.id=any($1::${entry.idType}[])) and ($2::${entry.idType} is null or r.id=$2::${entry.idType}) ${entry.active?'and r.'+entry.active:''} and not exists(select 1 from local_projection_tombstones t where t.source_table=$3 and t.source_key=r.id::text) and ($4='' or concat(r.${entry.code},' ',r.${entry.name}) ilike '%'||$4||'%') order by r.id limit $5 offset $6`,[scope,data.id||null,entry.source,data.search,data.limit+1,data.offset])).rows;
   }
   const result={data:rows.slice(0,data.limit),has_more:rows.length>data.limit,limit:data.limit,offset:data.offset};
   if(Buffer.byteLength(JSON.stringify(result))>131072)throw fail(413,'Kết quả vượt 128 KB. Hãy giảm số dòng mỗi trang.');
   return result;
  });
 };
 const business=registerIntegrationBusiness({pool,withPrincipal,effective,dispatch:createIntegrationInternalDispatcher(app)});
 const api=express.Router();api.use(machineGuard);
 api.get('/artifacts/:id',run(async(req,res)=>{const row=await business.artifact((req as MachineRequest).integration!,String(req.params.id));res.setHeader('Content-Type',row.content_type);res.setHeader('Content-Disposition',"attachment; filename=\"export.bin\"; filename*=UTF-8''"+encodeURIComponent(row.filename));res.send(row.content);}));
 api.get('/me',run(async(req,res)=>res.json(await withPrincipal((req as MachineRequest).integration!,'identity.read',async(_client,grants)=>({connection_id:(req as MachineRequest).integration!.connection_id,capabilities:effective(grants).map(c=>c.id)})))));
 api.get('/capabilities',run(async(req,res)=>res.json(await withPrincipal((req as MachineRequest).integration!,'capabilities.read',async(_client,grants)=>effective(grants)))));
 for(const definition of integrationCatalog){api.get('/'+definition.path,run(async(req,res)=>res.json(await read((req as MachineRequest).integration!,definition.id,req.query))));api.get('/'+definition.path+'/:id',run(async(req,res)=>res.json(await read((req as MachineRequest).integration!,definition.id,{...req.query,id:req.params.id}))));}
 api.use(run(async(req,res)=>{const principal=(req as MachineRequest).integration!;await audit(pool,'agent:'+principal.connection_id,'api.unsupported','DENIED',principal.connection_id,principal.key_id,undefined,principal.request_id);res.status(405).json({message:'API tích hợp hiện chỉ hỗ trợ tra cứu đã cấp quyền.'});}));app.use('/api/integrations/v1',api);
 // Reserve the entire prefix so wrong versions/methods cannot enter human authorization.
 app.use('/api/integrations',machineGuard,run(async(_req,res)=>res.status(404).json({message:'Phiên bản API không tồn tại.'})));
 const mcp=express.Router();mcp.use(machineGuard);
 mcp.post('/',run(async(req,res)=>{
  if(Array.isArray(req.body))throw fail(400,'MCP không hỗ trợ yêu cầu JSON-RPC theo lô.');
  if(Buffer.byteLength(JSON.stringify(req.body||{}))>32768)throw fail(413,'Yêu cầu MCP vượt 32 KB.');
  const principal=(req as MachineRequest).integration!;
  await audit(pool,'agent:'+principal.connection_id,'mcp.request','RECEIVED',principal.connection_id,principal.key_id,undefined,principal.request_id);
  const server=new Server({name:'joliefam-crm',version:'1.0.0'},{capabilities:{tools:{}}});
  const trackTool=async<T>(handler:()=>Promise<T>):Promise<T>=>{principal.work.pending++;try{principal.work.assertAlive();return await handler();}finally{principal.work.pending--;principal.work.settle();}};
  server.setRequestHandler(ListToolsRequestSchema,async()=>trackTool(()=>withPrincipal(principal,'mcp.tools.list',async(_client,grants)=>({tools:[...effective(grants).filter(c=>!c.id.startsWith('business.')).map(c=>({name:c.tool,description:c.label+' — chỉ đọc trong phạm vi được cấp',annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},inputSchema:{type:'object' as const,properties:{id:{type:'string'},search:{type:'string',maxLength:100},offset:{type:'integer',minimum:0,maximum:10000},limit:{type:'integer',minimum:1,maximum:100},from:{type:'string',description:'Ngày bắt đầu YYYY-MM-DD (chấm công)'},to:{type:'string',description:'Ngày kết thúc YYYY-MM-DD (chấm công)'}},...(c.id==='attendance.read'?{required:['from','to']}:{}),additionalProperties:false}})),...(await business.list(principal,grants)).map(businessToolSchema)]}))));
  server.setRequestHandler(CallToolRequestSchema,async request=>trackTool(async()=>{
   const definition=integrationCatalog.find(c=>c.tool===request.params.name);
   const businessDefinition=integrationBusinessTools.find(c=>c.name===request.params.name);
   try{if(businessDefinition){const result=await business.call(principal,businessDefinition,businessInputSchema.parse(request.params.arguments||{}));return {isError:result.status>=400,content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:result};}if(!definition)throw fail(403,'Công cụ không được hỗ trợ.');const result=await read(principal,definition.id,request.params.arguments||{});return {content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:result};}
   catch(error){if(!definition)await audit(pool,'agent:'+principal.connection_id,'mcp.tool.unsupported','DENIED',principal.connection_id,principal.key_id,undefined,principal.request_id);return {isError:true,content:[{type:'text' as const,text:error instanceof z.ZodError?'Tham số công cụ không hợp lệ.':Number((error as {status?:number}).status||500)===500?'Không thể truy vấn dữ liệu.':(error as Error).message}]};}
  }));
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  let closed=false;let resolveClosed:()=>void=()=>{};const disconnected=new Promise<void>(resolve=>{resolveClosed=resolve;});
  const close=()=>{if(closed)return;closed=true;resolveClosed();void transport.close();void server.close();};res.once('close',close);
  try{principal.work.assertAlive();await server.connect(transport);principal.work.assertAlive();await Promise.race([transport.handleRequest(req,res,req.body),disconnected]);}catch(error){close();throw error;}
 }));
 mcp.use(run(async(_req,res)=>res.status(405).json({message:'MCP không có phiên lưu lâu dài; chỉ hỗ trợ POST.'})));app.use('/api/mcp',mcp);
}
