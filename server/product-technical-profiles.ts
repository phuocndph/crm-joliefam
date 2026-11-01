import type express from 'express';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {pool} from './db/bootstrap.js';
import {productCatalogSelection,productEffectiveOwner,rawProductFingerprint,productDigest,stableProductJson} from './product-catalog-snapshot.js';
import {isLaborProduct} from './product-fulfillment-classification.js';
import {manufacturingFamilies} from './product-technical-schema.js';
import {hasVersionedTechnicalProof,supportedTechnicalVersion,validateVersionedTechnicalValues,versionedApplicableFields,technicalMetadata} from './product-technical-versioned.js';
type Row=Record<string,unknown>;
type Database=Pick<PoolClient,'query'>;
async function readTechnicalSnapshot<T>(work:(client:PoolClient)=>Promise<T>){const client=await pool.connect();try{await client.query('begin isolation level repeatable read read only');const result=await work(client);await client.query('commit');return result;}catch(error){await client.query('rollback');throw error;}finally{client.release();}}
type Dependencies={actor:()=>string;role:()=>string;transaction:<T>(fn:(client:PoolClient)=>Promise<T>)=>Promise<T>;sendError:(res:express.Response,error:unknown)=>void};
const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status});};
const object=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const searchText=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const namespace=(profile:Row)=>object(object(profile.extra_dimensions).technical_attributes);
const canonicalFields=['manufacturing_type','finished_width','finished_length','finished_height','dimension_unit','is_active'] as const;
function dimension(value:unknown,label:string){if(value===null||value===undefined||value==='')return null;const text=String(value);if(!/^\d+(?:\.\d{1,4})?$/.test(text)||!Number.isFinite(Number(text))||Number(text)<=0||Number(text)>10000000)fail(`${label} phải là số dương, tối đa 4 chữ số thập phân.`);return Number(text);}
export async function currentTechnicalProfile(db:Database,id:string,lock=false){
  const rows=(await db.query("select * from local_manufacturing_records where record_type='manufacturing_profile' and product_id=$1 order by coalesce((payload->>'is_active')::boolean,true) desc,updated_at desc,id"+(lock?' for update':''),[id])).rows;
  if(rows.filter(row=>object(row.payload).is_active!==false).length>1)fail('Có nhiều hồ sơ sản xuất đang hoạt động; cần kiểm tra trước.',409);
  const row=rows[0];const revision=Number((await db.query('select coalesce(max(version),0)::int version from local_product_technical_versions where product_id=$1',[id])).rows[0].version);
  const profile:Row|null=row?{...object(row.payload),id:row.id,product_id:id}:null,version=profile?namespace(profile).confirmed_version:null;
  const confirmed=row&&Number.isSafeInteger(version)&&Number(version)>0?(await db.query("select snapshot,source_fingerprint from local_product_technical_versions where product_id=$1 and profile_id=$2 and version=$3 and action='CONFIRM'",[id,row.id,version])).rows[0]:null;
  return {row,profile,revision,confirmed};
 }
/** Read-only batch counterpart using exactly the same canonical selection/proof. */
export async function currentTechnicalProfiles(db:Database,ids:string[]){
 const records=(await db.query("select * from local_manufacturing_records where record_type='manufacturing_profile' and product_id=any($1::text[]) order by product_id,coalesce((payload->>'is_active')::boolean,true) desc,updated_at desc,id",[ids])).rows;
 const versions=(await db.query('select * from local_product_technical_versions where product_id=any($1::uuid[])',[ids])).rows;
 const grouped=new Map<string,typeof records>(),audits=new Map<string,typeof versions>();
 for(const row of records){const key=String(row.product_id);grouped.set(key,[...(grouped.get(key)||[]),row]);}
 for(const row of versions){const key=String(row.product_id);audits.set(key,[...(audits.get(key)||[]),row]);}
 return new Map(ids.map(id=>{const rows=grouped.get(id)||[],history=audits.get(id)||[];if(rows.filter(row=>object(row.payload).is_active!==false).length>1)fail('Có nhiều hồ sơ sản xuất đang hoạt động; cần kiểm tra trước.',409);const row=rows[0],profile:Row|null=row?{...object(row.payload),id:row.id,product_id:id}:null,version=profile?namespace(profile).confirmed_version:null;const confirmed=row&&Number.isSafeInteger(version)&&Number(version)>0?history.find(v=>v.profile_id===row.id&&Number(v.version)===version&&v.action==='CONFIRM')||null:null;return[id,{row,profile,revision:history.reduce((n,v)=>Math.max(n,Number(v.version)),0),confirmed}] as const;}));
}
export const hasTechnicalProof=hasVersionedTechnicalProof;
export function technicalProfileStatus(profile:Row|null,fingerprint:string,confirmed?:Row|null){if(!profile)return 'EMPTY';if(profile.is_active===false)return 'INACTIVE';const attributes=namespace(profile);if(!supportedTechnicalVersion(attributes.schema_version)||attributes.status==='CONFIRMED'&&!hasTechnicalProof(profile,confirmed))return 'LEGACY_UNCONFIRMED';if(attributes.status==='CONFIRMED'&&attributes.confirmed_raw_source_fingerprint!==fingerprint)return 'REVIEW';return attributes.status==='CONFIRMED'?'CONFIRMED':'DRAFT';}

export function registerProductTechnicalProfiles(app:express.Express,d:Dependencies){
 const principal=(write=false)=>{const actor=d.actor(),role=d.role();if(!actor)fail('Cần đăng nhập.',401);if(write&&!['admin','manager'].includes(role))fail('Chỉ quản lý được cấu hình đặc điểm sản phẩm.',403);return {actor,role};};
 async function getProduct(db:Database,id:string,lock=false){
  if(!uuid.test(id))fail('Mã sản phẩm không hợp lệ.');
  if(lock){const row=(await db.query('select id,price_list_id from local_products where id=$1 for update',[id])).rows[0];if(row?.price_list_id)await db.query('select id from local_price_lists where id=$1 for share',[row.price_list_id]);}
  const row=(await db.query(productCatalogSelection+' where p.id=$1',[id])).rows[0];if(!row||isLaborProduct(row))fail('Không tìm thấy sản phẩm vật lý.',404);return row as Row;
 }
 function scope(row:Row,actor:string,role:string,write=false){const owner=productEffectiveOwner(row);
  if(role!=='admin'&&owner&&owner!==actor){if(role==='manager'||write)fail('Không tìm thấy sản phẩm trong phạm vi phụ trách.',404);}
  if(write&&role!=='admin'&&owner!==actor)fail('Sản phẩm dùng chung chỉ quản trị viên được cấu hình.',403);
 }
 const publicProduct=(row:Row)=>({id:row.id,sku:row.sku,name:row.name,category:row.category,specifications:row.specifications,price_list_name:row.price_list_name,is_active:row.is_active});
 async function detail(db:Database,id:string,actor:string,role:string){const product=await getProduct(db,id);scope(product,actor,role);const value=await currentTechnicalProfile(db,id),fingerprint=rawProductFingerprint(product);
  return {product:publicProduct(product),profile:value.profile,revision:value.revision,source_fingerprint:fingerprint,status:technicalProfileStatus(value.profile,fingerprint,value.confirmed),read_only:role!=='admin'&&productEffectiveOwner(product)!==actor,
   schema:technicalMetadata(namespace(value.profile||{}).schema_version===2?2:1),authoring_schemas:[technicalMetadata(1),technicalMetadata(2)],code_readiness:'NOT_EVALUATED'};
 }
 async function save(id:string,body:Row,legacy:boolean){
  const {actor,role}=principal(true),key=String(body.idempotency_key||''),reason=String(body.reason||'').trim();
  const revision=body.expected_revision??body._revision,fingerprint=body.source_fingerprint??body._source_fingerprint;
  if(!Number.isInteger(revision)||Number(revision)<0||!/^[a-f\d]{64}$/.test(String(fingerprint||'')))fail('Thiếu phiên bản hồ sơ. Tải lại trước khi lưu.',409);
  if(!key||key.length>200)fail('Thiếu khóa chống gửi trùng.');if(reason.length<3||reason.length>1000)fail('Nhập lý do từ 3 đến 1.000 ký tự.');
  const allowed=new Set(['id','product_id',...canonicalFields,'extra_dimensions','technical_values','target_schema_version','action','expected_revision','source_fingerprint','_revision','_source_fingerprint','idempotency_key','reason']);
  for(const field of Object.keys(body))if(!allowed.has(field))fail(`Trường ${field} không được phép sửa qua hồ sơ.`);
  const action=legacy?'LEGACY_EDIT':String(body.action||'DRAFT');if(!['DRAFT','CONFIRM','LEGACY_EDIT'].includes(action)||!legacy&&action==='LEGACY_EDIT')fail('Thao tác hồ sơ không hợp lệ.');
  const requestHash=productDigest({id,legacy,body});
  return d.transaction(async client=>{
   await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['technical-receipt:'+key]);
   const product=await getProduct(client,id,true);scope(product,actor,role,true);
   const existing=await currentTechnicalProfile(client,id,true),old:Row=existing.profile||{},oldExtra=object(old.extra_dimensions),oldAttributes=namespace(old);
   if(rawProductFingerprint(product)!==fingerprint)fail('Nguồn sản phẩm đã thay đổi. Tải lại trước khi lưu.',409);
   const receipt=(await client.query('select * from local_product_technical_receipts where idempotency_key=$1',[key])).rows[0];
   if(receipt){if(receipt.actor_id!==actor||receipt.fingerprint!==requestHash)fail('Khóa chống gửi trùng đã dùng cho nội dung khác.',409);return {...receipt.result,reused:true};}
   if(existing.revision!==revision)fail('Hồ sơ hoặc sản phẩm đã thay đổi. Tải lại trước khi lưu.',409);
   if(old.extra_dimensions!==undefined&&old.extra_dimensions!==null&&(typeof old.extra_dimensions!=='object'||Array.isArray(old.extra_dimensions)))fail('Kích thước bổ sung của hồ sơ cũ chưa đúng định dạng. Cần kiểm tra trước khi sửa.',409);
   if(body.id&&body.id!==old.id||body.product_id&&body.product_id!==id)fail('Hồ sơ không thuộc sản phẩm này.');
   const extras=body.extra_dimensions===undefined?{}:object(body.extra_dimensions);
   if(body.extra_dimensions!==undefined&&(!body.extra_dimensions||Array.isArray(body.extra_dimensions)||typeof body.extra_dimensions!=='object'))fail('Kích thước bổ sung phải là đối tượng.');
   if('technical_attributes' in extras&&stableProductJson(extras.technical_attributes)!==stableProductJson(oldAttributes))fail('Thông tin xác nhận kỹ thuật do máy chủ quản lý; hãy dùng biểu mẫu đặc điểm.');
   if(legacy&&body.technical_values!==undefined)fail('Dùng biểu mẫu đặc điểm để sửa kỹ thuật.');
   const next:Row={...old,id:existing.row?.id||randomUUID(),product_id:id};
   for(const field of canonicalFields)if(body[field]!==undefined)next[field]=body[field];
   next.manufacturing_type=next.manufacturing_type||'UNKNOWN';if(!manufacturingFamilies.some(([family])=>family===next.manufacturing_type))fail('Loại sản phẩm không hợp lệ.');
   next.dimension_unit=next.dimension_unit||'CM';if(!['MM','CM','METER'].includes(String(next.dimension_unit)))fail('Đơn vị kích thước không hợp lệ.');
   for(const [field,label]of [['finished_width','Chiều rộng'],['finished_length','Chiều dài'],['finished_height','Chiều cao']])next[field]=dimension(next[field],label);
   if(next.is_active===undefined)next.is_active=true;if(typeof next.is_active!=='boolean')fail('Trạng thái hoạt động không hợp lệ.');
   const family=String(next.manufacturing_type),oldValues=object(oldAttributes.values),storedSchema=oldAttributes.schema_version===undefined?1:oldAttributes.schema_version;
   if(!supportedTechnicalVersion(storedSchema))fail('Hồ sơ có schema chưa hỗ trợ; cần kiểm tra.',409);
   if(legacy&&body.target_schema_version!==undefined)fail('Biểu mẫu cũ không đổi schema.');
   const schemaVersion=body.target_schema_version===undefined?storedSchema:body.target_schema_version;
   if(!supportedTechnicalVersion(schemaVersion)||storedSchema===2&&schemaVersion===1)fail('Không thể hạ hoặc chọn schema không hỗ trợ.');
   const targetSchema=schemaVersion as 1|2;
   let values:Record<string,string>={};
   try{values=validateVersionedTechnicalValues(schemaVersion,family,legacy||body.technical_values===undefined?Object.fromEntries(Object.entries(oldValues).filter(([key])=>versionedApplicableFields(targetSchema,family,oldValues).some(field=>field.key===key))):body.technical_values);}catch(error){fail(error instanceof Error?error.message:'Đặc điểm không hợp lệ.');}
   const relevantChanged=canonicalFields.some(field=>stableProductJson(old[field])!==stableProductJson(next[field]))||stableProductJson(oldValues)!==stableProductJson(values)
    ||Object.keys(extras).some(field=>field!=='technical_attributes'&&stableProductJson(oldExtra[field])!==stableProductJson(extras[field]));
   const version=existing.revision+1,confirmed=action==='CONFIRM';
   const attributes:Row={schema_version:schemaVersion,values,status:confirmed?'CONFIRMED':legacy&&!relevantChanged&&oldAttributes.status==='CONFIRMED'&&hasTechnicalProof(old,existing.confirmed)?'CONFIRMED':'DRAFT',
    confirmed_version:confirmed?version:oldAttributes.confirmed_version??null,
    confirmed_raw_source_fingerprint:confirmed?fingerprint:oldAttributes.confirmed_raw_source_fingerprint??null,
    last_saved_by:actor,last_saved_at:new Date().toISOString()};
   next.extra_dimensions={...oldExtra,...extras,technical_attributes:attributes};
   await client.query("insert into local_manufacturing_records(id,record_type,product_id,status,payload,local_modified_at) values($1,'manufacturing_profile',$2,'ACTIVE',$3::jsonb,now()) on conflict(id) do update set payload=excluded.payload,updated_at=now(),local_modified_at=now()",[next.id,id,JSON.stringify(next)]);
   await client.query('insert into local_product_technical_versions(product_id,profile_id,version,action,source_fingerprint,snapshot,reason,created_by)values($1,$2,$3,$4,$5,$6::jsonb,$7,$8)',[id,next.id,version,action,fingerprint,JSON.stringify(next),reason,actor]);
   const result={profile:next,revision:version,source_fingerprint:fingerprint,status:technicalProfileStatus(next,String(fingerprint),confirmed?{snapshot:next,source_fingerprint:fingerprint}:existing.confirmed),reused:false};
   await client.query('insert into local_product_technical_receipts(idempotency_key,actor_id,fingerprint,result)values($1,$2,$3,$4::jsonb)',[key,actor,requestHash,JSON.stringify(result)]);return result;
  });
 }
 const base='/api/product-technical-profiles';
 app.get(base+'/catalog',async(req,res)=>{try{
  const {actor,role}=principal(true),search=String(req.query.search||'').trim(),limit=Number(req.query.limit||50),offset=Number(req.query.offset||0);if(search.length>200||!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)fail('Bộ lọc sản phẩm không hợp lệ.');
  const params:unknown[]=role==='admin'?[]:[actor],condition=role==='admin'?'true':"(coalesce(p.manager_id,l.manager_id)::text=$1 or coalesce(p.manager_id,l.manager_id) is null)";
  const all=(await pool.query(productCatalogSelection+' where '+condition+' order by p.name,p.id',params)).rows.filter(row=>!isLaborProduct(row));
  const normalized=searchText(search),rows=all.filter(row=>!normalized||searchText([row.name,row.sku,row.category].join(' ')).includes(normalized));
  res.json({rows:rows.slice(offset,offset+limit).map(publicProduct),total:rows.length});
 }catch(error){d.sendError(res,error);}});
 app.get(base+'/:id/history',async(req,res)=>{try{const {actor,role}=principal(true),product=await getProduct(pool,String(req.params.id));scope(product,actor,role);
  res.json((await pool.query('select version,action,reason,created_at,created_by,source_fingerprint,snapshot from local_product_technical_versions where product_id=$1 order by version desc',[product.id])).rows);
 }catch(error){d.sendError(res,error);}});
 app.get(base+'/:id',async(req,res)=>{try{const {actor,role}=principal(true);res.json(await readTechnicalSnapshot(client=>detail(client,String(req.params.id),actor,role)));}catch(error){d.sendError(res,error);}});
 app.put(base+'/:id',async(req,res)=>{try{res.json(await save(String(req.params.id),req.body||{},false));}catch(error){d.sendError(res,error);}});
 // Both the legacy form and new editor use this writer; no shadow profile master.
 app.get('/api/manufacturing/products/:productId/profile',async(req,res)=>{try{const {actor,role}=principal();const value=await readTechnicalSnapshot(client=>detail(client,String(req.params.productId),actor,role));
  res.json(value.profile?{...value.profile,_revision:value.revision,_source_fingerprint:value.source_fingerprint,_technical_status:value.status,_read_only:value.read_only}:null);
 }catch(error){d.sendError(res,error);}});
 app.put('/api/manufacturing/products/:productId/profile',async(req,res)=>{try{const value=await save(String(req.params.productId),req.body||{},true);res.json({...object(value.profile),_revision:value.revision,_source_fingerprint:value.source_fingerprint,_technical_status:value.status});}catch(error){d.sendError(res,error);}});
}
