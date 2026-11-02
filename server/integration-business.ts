import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {integrationBusinessTools,type IntegrationBusinessTool} from './integration-business-catalog.js';
import type {IntegrationGrant} from './integration-catalog.js';
import type {Principal} from './integration-access.js';
import type {IntegrationDispatch,IntegrationDispatchResult} from './integration-internal-principal.js';
import {moduleRequirement} from './module-permissions.js';
import {payrollCapability} from './permission-policy.js';

const fail=(status:number,message:string)=>Object.assign(new Error(message),{status});
const scalar=z.union([z.string().max(2000),z.number().finite(),z.boolean(),z.null()]);
export const businessInputSchema=z.object({params:z.record(z.string().min(1).max(100)).default({}),query:z.record(scalar).default({}),body:z.record(z.unknown()).default({}),idempotency_key:z.string().min(8).max(128).optional(),reason:z.string().trim().min(3).max(300).optional()}).strict();
type Input=z.infer<typeof businessInputSchema>;
type Identity={userId:string;role:string;permissions:Set<string>};
type WithPrincipal=<T>(principal:Principal,action:string,task:(client:PoolClient,grants:IntegrationGrant[])=>Promise<T>)=>Promise<T>;
type Dependencies={pool:Pool;withPrincipal:WithPrincipal;effective:(grants:IntegrationGrant[])=>Array<{id:string}>;dispatch:IntegrationDispatch};
const stable=(value:unknown):string=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(item=>JSON.parse(stable(item))):Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,JSON.parse(stable(item))])):value??null);
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const secretName=/(?:password|passwd|secret|token|authorization|credential|api[_-]?key|stack|private[_-]?key)/i;
export function sanitizeIntegrationResult(value:unknown,depth=0):unknown{
 if(depth>15)return '[truncated]';
 if(value instanceof Date)return value.toISOString();
 if(Array.isArray(value))return value.slice(0,1000).map(item=>sanitizeIntegrationResult(item,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!secretName.test(key)).map(([key,item])=>[key,sanitizeIntegrationResult(item,depth+1)]));
 if(typeof value==='string')return value.slice(0,100000).replace(/jf_(?:agent|zcrm)_[A-Za-z0-9_-]+/g,'[redacted]').replace(/Bearer\s+[^\s"<>]+/gi,'Bearer [redacted]');
 return value;
}
const metadata=(tool:IntegrationBusinessTool)=>({module:tool.module,method:tool.method,path:tool.path,capability:tool.capability,provider_write:tool.action==='provider',admin_only:tool.admin,body_fields:tool.bodyFields||[],query_fields:tool.queryFields||[],fixed_fields:tool.fixedBody||{}});
export function businessToolSchema(tool:IntegrationBusinessTool){
 const parameters=[...tool.path.matchAll(/:([A-Za-z0-9_]+)/g)].map(match=>match[1]);
 return {name:tool.name,description:`${tool.method} ${tool.path} — API nghiệp vụ chính thức. ${tool.action==='provider'?'Có thể ghi tới nhà cung cấp ngoài. ':''}${tool.path.endsWith('/issue')||tool.path.endsWith('/provider-draft')?'Hiện trả lỗi 409 nếu nhà cung cấp chưa hỗ trợ. ':''}Gửi các trường theo hợp đồng API trong body/query; quyền, chủ sở hữu và kiểm tra nghiệp vụ vẫn áp dụng.`,annotations:{readOnlyHint:tool.action==='read',destructiveHint:tool.method==='DELETE'||tool.action==='provider',idempotentHint:true,openWorldHint:tool.action==='provider'},_meta:metadata(tool),inputSchema:{type:'object' as const,properties:{params:{type:'object',properties:Object.fromEntries(parameters.map(name=>[name,{type:'string',minLength:1,maxLength:100}])),required:parameters,additionalProperties:false},query:{type:'object',maxProperties:50,properties:Object.fromEntries((tool.queryFields||[]).map(field=>[field,{type:['string','number','boolean','null']}])),additionalProperties:{type:['string','number','boolean','null']}},body:{type:'object',maxProperties:200,properties:Object.fromEntries((tool.bodyFields||[]).map(field=>[field,{description:'Trường theo hợp đồng API nghiệp vụ.'}])),description:'Đối tượng JSON theo hợp đồng API nghiệp vụ; không nhận URL/SQL/tên bảng hoặc actor giả.'},idempotency_key:{type:'string',minLength:8,maxLength:128},reason:{type:'string',minLength:3,maxLength:300}},required:[...(parameters.length?['params']:[]),...(tool.action!=='read'?['idempotency_key','reason']:[])],additionalProperties:false}};
}
export function registerIntegrationBusiness(d:Dependencies){
 const identity=async(db:Pool|PoolClient,principal:Principal):Promise<Identity|null>=>{
  const row=(await db.query("select s.user_id,r.role from integration_access.service_identities s join local_user_profiles p on p.user_id=s.user_id and p.is_active join local_user_roles r on r.user_id=s.user_id and r.is_active where s.connection_id=$1 order by case r.role when 'admin' then 1 when 'manager' then 2 when 'accountant' then 3 when 'team_leader' then 4 else 5 end limit 1",[principal.connection_id])).rows[0];
  if(!row)return null;
  const permissions=(await db.query('select permission_type from local_employee_permissions where user_id=$1 and enabled',[row.user_id])).rows;
  return {userId:String(row.user_id),role:String(row.role),permissions:new Set(permissions.map(item=>String(item.permission_type)))};
 };
 const permitted=(tool:IntegrationBusinessTool,actor:Identity,body:Record<string,unknown>={})=>{
  if(tool.admin&&actor.role!=='admin')return false;
  const required=moduleRequirement(tool.method,tool.path.replace(/:[A-Za-z0-9_]+/g,'00000000-0000-4000-8000-000000000000'),body);
  if(required===false)return false;
  if(required!==null&&!['admin','manager'].includes(actor.role)&&(!required.length||!required.some(right=>actor.permissions.has(right))))return false;
  // Domain-owned payroll rights are narrower than ordinary module rights.
  if(tool.module==='payroll'&&actor.role!=='admin'){
   const capability=tool.path.includes('bank-accounts')?'payroll_bank_manage':tool.path.includes('insurance')?'payroll_insurance_manage':tool.path.includes('rates')?tool.action==='read'?'payroll_rate_view':'payroll_rate_manage':tool.path.includes('policy')||tool.path.includes('rule-versions')||tool.path.includes('calendar-versions')?'payroll_policy_manage':tool.path.includes('workers')||tool.path.includes('worker-profile')?tool.action==='read'?'payroll_view':'payroll_worker_manage':'payroll_view';
   if(!payrollCapability(actor.role,capability,actor.permissions))return false;
  }
  return true;
 };
 const list=async(principal:Principal,grants:IntegrationGrant[])=>{
  const actor=await identity(d.pool,principal);if(!actor)return [];
  const caps=new Set(d.effective(grants).map(entry=>entry.id));
  return integrationBusinessTools.filter(tool=>caps.has(tool.capability)&&permitted(tool,actor));
 };
 const call=async(principal:Principal,tool:IntegrationBusinessTool,input:Input):Promise<IntegrationDispatchResult>=>{
  if(!integrationBusinessTools.includes(tool))throw fail(403,'Công cụ không thuộc danh mục chính thức.');
  const requiredParams=[...tool.path.matchAll(/:([A-Za-z0-9_]+)/g)].map(match=>match[1]);
  if(Object.keys(input.params).length!==requiredParams.length||requiredParams.some(name=>!input.params[name]||/[\\/?#%\s]/.test(input.params[name])))throw fail(400,'Tham số đường dẫn không hợp lệ.');
  if(Object.keys(input.query).length>50||Object.keys(input.body).length>200||Buffer.byteLength(stable(input))>32768)throw fail(413,'Tham số công cụ vượt giới hạn.');
  for(const [name,value]of Object.entries(input.query))if(/^(?:limit|page_size|per_page)$/i.test(name)&&(Number(value)<1||Number(value)>100))throw fail(400,'Mỗi trang tối đa 100 dòng.');
  if(tool.action!=='read'&&(!input.idempotency_key||!input.reason))throw fail(400,'Thao tác ghi cần idempotency_key và lý do.');
  const path=tool.path.replace(/:([A-Za-z0-9_]+)/g,(_all,name:string)=>encodeURIComponent(input.params[name]));
  const query=new URLSearchParams(Object.entries(input.query).filter(([,value])=>value!==null).map(([key,value])=>[key,String(value)]));
  const body={...input.body};
  for(const [key,value]of Object.entries(tool.fixedBody||{})){if(Object.hasOwn(body,key)&&body[key]!==value)throw fail(400,'Không được thay đổi thao tác cố định của công cụ.');body[key]=value;}
  let commandId:string|undefined,actor:Identity|undefined,replay:IntegrationDispatchResult|undefined,authorizationHash='';
  await d.withPrincipal(principal,tool.name,async(db,grants)=>{
   if(!d.effective(grants).some(entry=>entry.id===tool.capability))throw fail(403,'Kết nối hoặc khóa chưa có quyền mô-đun này.');
   actor=await identity(db,principal)||undefined;
   if(!actor||!permitted(tool,actor,body))throw fail(403,'Danh tính dịch vụ chưa cấu hình hoặc không còn quyền nghiệp vụ.');
   const version=(await db.query('select policy_version from integration_access.connections where id=$1',[principal.connection_id])).rows[0]?.policy_version;
   authorizationHash=digest(stable({user:actor.userId,role:actor.role,permissions:[...actor.permissions].sort(),version}));
   if(actor.role!=='admin'){
    for(const field of ['manager_id','managerId'])if(Object.hasOwn(body,field)&&body[field]!==null&&body[field]!==actor.userId)throw fail(403,'Không được thay đổi chủ sở hữu ngoài phạm vi dịch vụ.');
    const table=tool.module==='orders'?'local_orders':tool.module==='quotes'?'local_quotes':tool.module==='customers'?'local_customers':tool.path.startsWith('/api/expenses')?'local_expenses':tool.path.startsWith('/api/transactions')?'local_transactions':null;
    if(table&&input.params.id){
     const owned=(await db.query(`select 1 from ${table} where id=$1 and manager_id=$2`,[input.params.id,actor.userId])).rows[0];
     if(!owned)throw fail(404,'Không tìm thấy hồ sơ trong phạm vi phụ trách.');
    }
    const orderId=input.params.orderId||String(body.order_id||body.orderId||'');
    if(orderId&&(tool.module==='finance'||tool.module==='shipping')){
     if(!(await db.query('select 1 from local_orders where id=$1 and manager_id=$2',[orderId,actor.userId])).rows[0])throw fail(404,'Không tìm thấy đơn trong phạm vi phụ trách.');
    }
   }
   // No forged audit actor or inherited creator ownership. Worker/product IDs
   // remain untouched; canonical domain handlers validate those assignments.
   for(const field of ['actor_id','actorId','created_by','createdBy'])if(Object.hasOwn(body,field)&&body[field]!==actor.userId)throw fail(403,'Không được giả danh người thực hiện.');
   if(tool.method==='POST'&&['/api/orders','/api/quotes','/api/customers','/api/expenses','/api/transactions','/api/legacy-production-orders'].includes(tool.path)){
    for(const field of ['manager_id','managerId'])if(Object.hasOwn(body,field)&&body[field]!==null&&body[field]!==actor.userId)throw fail(403,'Đơn được tạo thuộc danh tính dịch vụ; không được giả chủ sở hữu.');
    body.manager_id=actor.userId;delete body.managerId;
   }
   const userTarget=input.params.id||input.params.userId;
   if(userTarget&&tool.module==='users'){
    const service=(await db.query('select 1 from integration_access.service_identities where user_id=$1',[userTarget])).rows[0];
    if(service)throw fail(403,'Danh tính dịch vụ chỉ được quản lý qua cấu hình kết nối.');
   }
   if(tool.action!=='read'){
    const payloadHash=digest(stable({tool:tool.name,params:input.params,query:input.query,body,reason:input.reason}));
    const inserted=(await db.query("insert into integration_access.commands(connection_id,key_id,idempotency_hash,payload_hash,tool_name,reason,auth_hash,state) values($1,$2,$3,$4,$5,$6,$7,'IN_FLIGHT') on conflict(connection_id,idempotency_hash) do nothing returning id",[principal.connection_id,principal.key_id,digest(input.idempotency_key!),payloadHash,tool.name,input.reason,authorizationHash])).rows[0];
    if(!inserted){
     const existing=(await db.query('select * from integration_access.commands where connection_id=$1 and idempotency_hash=$2',[principal.connection_id,digest(input.idempotency_key!)])).rows[0];
     if(!existing||existing.payload_hash!==payloadHash||existing.tool_name!==tool.name)throw fail(409,'Mã thao tác đã dùng cho nội dung khác.');
     if(existing.auth_hash!==authorizationHash)throw fail(403,'Quyền thực thi đã thay đổi; không trả lại kết quả cũ ngoài phạm vi hiện tại.');
     if(existing.state==='IN_FLIGHT'||existing.state==='UNKNOWN')throw fail(409,'Thao tác đang chạy hoặc chưa rõ kết quả; cần đối soát, không gửi lại.');
     replay={status:existing.response_status,body:existing.response_body};return;
    }
    commandId=inserted.id;
   }
  });
  if(replay)return replay;
  if(!actor)throw fail(403,'Chưa cấu hình danh tính dịch vụ.');
  // Only inject fields supported by each concrete canonical contract. Strict
  // schemas (provider settings, GHN, etc.) must receive no invented fields.
  if(commandId){
   if(tool.path==='/api/ghn-orders'||/^\/api\/ghn-edit\/:code$/.test(tool.path))body.idempotencyKey=commandId;
   else if(tool.bodyFields?.includes('idempotency_key')||tool.path==='/api/quotes'||/^\/api\/(?:payroll\/(?:product-rates|labor-mappings|labor-code-requirements|monthly\/(?:adjustments|payments))|product-(?:supply-classifications|technical-profiles)|production-(?:workspace|dispatch|sales)|order-shipments|purchase-fulfillment|cutting-estimates)(?:\/|$)/.test(tool.path))body.idempotency_key=commandId;
  }
  let result:IntegrationDispatchResult;
  try{
   result=await d.dispatch({method:tool.method,path:path+(query.size?'?'+query.toString():''),body,principal:{userId:actor.userId,connectionId:principal.connection_id,keyId:principal.key_id,tokenHash:principal.token_hash,capability:tool.capability,commandId},requestId:principal.request_id});
   if(actor.role!=='admin'&&Array.isArray(result.body)&&['/api/orders','/api/customers','/api/quotes','/api/expenses','/api/transactions'].includes(tool.path))result.body=result.body.filter(row=>row&&typeof row==='object'&&String(row.manager_id||'')===actor!.userId);
   // The legacy invoice preview is the one canonical JSON binary envelope.
   // Decode only that fixed route/shape, with exact base64 and PDF validation.
   if(tool.method==='POST'&&tool.path==='/api/einvoices/:id/preview'&&result.status<400){
    const preview=result.body as {base64?:unknown;fileType?:unknown;fileName?:unknown}|null;
    if(!preview||preview.fileType!=='PDF'||typeof preview.base64!=='string'||!preview.base64.length||preview.base64.length>Math.ceil(16777216/3)*4||preview.base64.length%4!==0||/[^A-Za-z0-9+/=]/.test(preview.base64))throw fail(502,'Nội dung xem trước PDF không hợp lệ.');
    const bytes=Buffer.from(preview.base64,'base64');
    if(bytes.length>16777216||bytes.toString('base64')!==preview.base64||bytes.subarray(0,5).toString('ascii')!=='%PDF-')throw fail(502,'Nội dung xem trước PDF không hợp lệ.');
    result={...result,artifact:{bytes,contentType:'application/pdf',filename:typeof preview.fileName==='string'?preview.fileName:'invoice-preview.pdf'}};
   }
   if(result.artifact){
    const filename=result.artifact.filename.replace(/[^\p{L}\p{N}._ -]/gu,'_').slice(-150)||'export.bin';
    const artifact=(await d.pool.query('insert into integration_access.artifacts(connection_id,key_id,capability,tool_name,filename,content_type,content,auth_hash) values($1,$2,$3,$4,$5,$6,$7,$8) returning id,expires_at',[principal.connection_id,principal.key_id,tool.capability,tool.name,filename,result.artifact.contentType,result.artifact.bytes,authorizationHash])).rows[0];
    result={status:result.status,body:{artifact:{id:artifact.id,filename,content_type:result.artifact.contentType,size_bytes:result.artifact.bytes.length,expires_at:artifact.expires_at,download_path:'/api/integrations/v1/artifacts/'+artifact.id}}};
   }
   result={status:result.status,body:sanitizeIntegrationResult(result.body)};
   if(Buffer.byteLength(JSON.stringify(result))>1048576)throw fail(413,'Kết quả vượt 1 MB; hãy thu hẹp bộ lọc.');
   if(commandId)await d.pool.query('update integration_access.commands set state=$2,response_status=$3,response_body=$4::jsonb,updated_at=now() where id=$1',[commandId,result.status>=500?'UNKNOWN':result.status>=400?'FAILED':'SUCCEEDED',result.status,JSON.stringify(result.body)]);
  }catch(error){if(commandId)await d.pool.query("update integration_access.commands set state='UNKNOWN',updated_at=now() where id=$1",[commandId]).catch(()=>undefined);throw error;}
  // Revocation/downgrade during canonical work must not release private output.
  // Outcome remains durable, so reauthorization failure can never redispatch it.
  await d.withPrincipal(principal,tool.name+'.result',async(db,grants)=>{
   const current=await identity(db,principal);
   if(!current||!d.effective(grants).some(cap=>cap.id===tool.capability)||!permitted(tool,current,body))throw fail(403,'Quyền đã thay đổi trong khi xử lý; kết quả được giữ để đối soát.');
   const version=(await db.query('select policy_version from integration_access.connections where id=$1',[principal.connection_id])).rows[0]?.policy_version;
   if(digest(stable({user:current.userId,role:current.role,permissions:[...current.permissions].sort(),version}))!==authorizationHash)throw fail(403,'Quyền đã thay đổi trong khi xử lý; cần tải lại bằng quyền mới.');
  });
  return result;
 };
 const artifact=async(principal:Principal,id:string)=>d.withPrincipal(principal,'artifact.read',async(db,grants)=>{
  const row=(await db.query('select * from integration_access.artifacts where id=$1 and connection_id=$2 and key_id=$3 and expires_at>now()',[z.string().uuid().parse(id),principal.connection_id,principal.key_id])).rows[0];
  const tool=row&&integrationBusinessTools.find(tool=>tool.name===row.tool_name),actor=await identity(db,principal);
  if(!row||!tool||!actor||!d.effective(grants).some(cap=>cap.id===row.capability)||!permitted(tool,actor))throw fail(404,'Tệp không tồn tại hoặc quyền tải đã hết hiệu lực.');
  const version=(await db.query('select policy_version from integration_access.connections where id=$1',[principal.connection_id])).rows[0]?.policy_version;
  if(row.auth_hash!==digest(stable({user:actor.userId,role:actor.role,permissions:[...actor.permissions].sort(),version})))throw fail(403,'Quyền đã thay đổi; cần xuất lại tệp theo quyền hiện tại.');
  return row;
 });
 return {list,call,artifact};
}
