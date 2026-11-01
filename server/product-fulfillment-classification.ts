import { createHash } from 'node:crypto';
import type express from 'express';
import type { PoolClient } from 'pg';
import { pool } from './db/bootstrap.js';
import { rawProductSnapshot } from './product-catalog-snapshot.js';
import {technicalSupplyBasisVersioned as technicalSupplyBasis,technicalSupplyRouteVersioned as technicalSupplyRoute} from './product-technical-versioned.js';

type Row = Record<string, unknown>;
export type ProductSupplyRoute = 'SEW' | 'PURCHASE' | 'UNCLASSIFIED';
export type ProductSupplyStatus = 'CONFIRMED' | 'UNCLASSIFIED' | 'REVIEW';
export type ProductSupplyState = {
 route: ProductSupplyRoute;
 status: ProductSupplyStatus;
 reason: string;
 revision: number;
 requires_split: boolean;
};
type Dependencies = {
 actor: () => string; role: () => string;
 transaction: <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;
 sendError: (res: express.Response, error: unknown) => void;
};
export const SUPPLY_RULE_VERSION = '2026-10-29.1';
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), {status}); };
const stable = (value: unknown): string => Array.isArray(value) ? '['+value.map(stable).join(',')+']' : value && typeof value === 'object' ? '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}' : JSON.stringify(value) ?? 'null';
const digest = (value: unknown) => createHash('sha256').update(stable(value)).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isLaborProduct = (row: Row) => /\bcong may\b/.test(normalize(row.category));
function classificationText(value: unknown) {
 // Preserve Vietnamese chần (quilting), which must never become chăn (duvet).
 const lexical=String(value??'').normalize('NFC').replace(/chần/giu,' quilt ').replace(/chân/giu,' leg ').replace(/[+;,\n()]/g,' componentboundary ');
 return normalize(lexical).replace(/\b(?:su dung cho|su dung voi|dung cho|dung voi|danh cho|phu hop voi)\b(.*?)(?=\bcomponentboundary\b|$)/g,(_match,reference:string)=>{
  // Explicit next items survive a usage phrase even without punctuation.
  const next=/\b(kem|va)\s+(?=(?:ruot (?:chan|goi)|vo (?:chan|goi)|ga|chan|khan|divan|divang|nem|dem)(?=\b|\d))/.exec(reference);
  if(!next)return ' ';
  const remaining=reference.slice(next.index);
  // Repeated mattress targets can be alternative use cases, not two sold items.
  if(next[1]==='va'&&/\b(?:nem|dem)(?=\b|\d)/.test(reference.slice(0,next.index))&&/^va (?:nem|dem)(?=\b|\d)/.test(remaining))return ' usageuncertain ';
  return ' '+remaining+' ';
 })
  .replace(/\bcomponentboundary\b/g,' ').replace(/\s+/g,' ').trim();
}
function supplyEvidence(text: string) {
 const protector=/\bbao ve (?:nem|dem)\b/.test(text);
 text=text.replace(/\bbao ve (?:nem|dem)\b/g,'protector');
 const inners=[...text.matchAll(/\bruot (?:chan|goi)(?=\b|\d)/g)];
 let sew=false,purchase=false,explicit=false;
 for(let i=0;i<inners.length;i++){
  const start=inners[i].index!,end=inners[i+1]?.index??text.length;
  const component=text.slice(start,end).split(/\b(?:va|kem|cong|voi)\b/)[0];
  const microfiber=/\bmicro(?:fiber)?\b/.test(component);
  const detail=component.replace(/^ruot (?:chan|goi)/,'').trim();
  if(microfiber)sew=true;else purchase=true;
  if(detail)explicit=true;
 }
 const outerText=text.replace(/\bruot (?:chan|goi)(?=\b|\d)/g,'ruot');
 const outer=/\b(?:vo goi|vo chan|ga|chan)\b/.test(outerText);
 const goods=/\b(?:nem|dem|khan|divan|divang)\b/.test(text)||/\bbo nhap\b/.test(text);
 if(outer)sew=true;if(goods)purchase=true;
 return {sew,purchase,explicit:explicit||outer||goods,inner:inners.length>0,protector};
}
function suggestCatalogSupply(row: Row): {route: ProductSupplyRoute; reason: string; requires_split: boolean} {
 const name=classificationText(row.name),category=classificationText(row.category),description=classificationText(row.description),specifications=classificationText(row.specifications);
 const text=[name,category].join(' '),nameEvidence=supplyEvidence(name),categoryEvidence=supplyEvidence(category);
 const protection = /\bbao ve (?:nem|dem)\b/.test(text);
 const compositionFields=[description,specifications].filter(value=>/\b(?:gom|bao gom|thanh phan|combo|set|kem)\b/.test(value));
 const compositionEvidence=compositionFields.map(supplyEvidence);
 const evidence=[nameEvidence,categoryEvidence,...compositionEvidence];
 const mixed=evidence.some(x=>x.sew)&&evidence.some(x=>x.purchase&&x.explicit);
 if (isLaborProduct(row)) return {route:'UNCLASSIFIED',reason:'Mã công may, không phải hàng bán.',requires_split:false};
 // Components within one name/composition are different from contradictory catalog fields.
 const compositionMixed=compositionEvidence.some(component=>component.sew&&component.purchase||component.purchase&&nameEvidence.sew||component.sew&&nameEvidence.purchase);
 const mixedComponents=nameEvidence.sew&&nameEvidence.purchase||compositionMixed;
 if (mixedComponents) return {route:'UNCLASSIFIED',reason:'Có cả hàng may và nhập; Sale cần tách từng món.',requires_split:true};
 if (/\busageuncertain\b/.test([name,category,description,specifications].join(' '))) return {route:'UNCLASSIFIED',reason:'Mục đích dùng hoặc thành phần chưa rõ; cần quản lý kiểm tra.',requires_split:false};
 const contradictory=nameEvidence.explicit&&categoryEvidence.explicit&&(
  nameEvidence.sew&&!nameEvidence.purchase&&categoryEvidence.purchase&&!categoryEvidence.sew||
  nameEvidence.purchase&&!nameEvidence.sew&&categoryEvidence.sew&&!categoryEvidence.purchase);
 const innerOuterConflict=nameEvidence.inner&&!categoryEvidence.inner&&categoryEvidence.sew||categoryEvidence.inner&&!nameEvidence.inner&&nameEvidence.sew;
 if (contradictory||mixed||innerOuterConflict) return {route:'UNCLASSIFIED',reason:'Thông tin sản phẩm có cách đáp ứng mâu thuẫn; cần quản lý kiểm tra.',requires_split:false};
 if (protection || /\btopper\b/.test(text)) return {route:'UNCLASSIFIED',reason:'Cần quản lý xác nhận cách đáp ứng.',requires_split:false};
 if (nameEvidence.sew||categoryEvidence.sew) return {route:'SEW',reason:'Nhóm hàng gia công hoặc ruột Microfiber cần may.',requires_split:false};
 if (nameEvidence.purchase||categoryEvidence.purchase) return {route:'PURCHASE',reason:'Nhóm hàng hoặc ruột chăn/gối nhập sẵn.',requires_split:false};
 return {route:'UNCLASSIFIED',reason:'Chưa có quy tắc rõ; cần quản lý xác nhận.',requires_split:false};
}
export function suggestProductSupply(row: Row): {route: ProductSupplyRoute; reason: string; requires_split: boolean} {
 const suggestion=suggestCatalogSupply(row),technicalRoute=technicalSupplyRoute(row.technical_confirmed_profile);
 if(!suggestion.requires_split&&technicalRoute&&suggestion.route!=='UNCLASSIFIED'&&technicalRoute!==suggestion.route)
  return {route:'UNCLASSIFIED',reason:'Đặc điểm đã xác nhận mâu thuẫn tên/danh mục; cần quản lý kiểm tra.',requires_split:false};
 return suggestion;
}
export function productSupplySnapshot(row: Row) {
 const raw=rawProductSnapshot(row),basis=technicalSupplyBasis(row.technical_confirmed_profile);
 // No confirmed facts means byte-identical fingerprints to item 1 V5.
 return basis?{...raw,technical_supply_basis:basis}:raw;
}
export const productSupplyFingerprint = (row: Row) => digest(productSupplySnapshot(row));
/**
 * The only canonical way operational flows may decide whether a product is
 * still classified. Suggestions deliberately do not participate here: they
 * are advice for a manager, never an automatic routing decision.
 */
export function productSupplyClassificationState(product: Row, classification?: Row): ProductSupplyState {
 const revision=Number(classification?.version||0);
 const requires_split=suggestProductSupply(product).requires_split;
 if(!classification)return {route:'UNCLASSIFIED',status:'UNCLASSIFIED',reason:'Chưa có xác nhận cách đáp ứng từ quản lý.',revision,requires_split};
 if(classification.source_fingerprint!==productSupplyFingerprint(product))return {route:'UNCLASSIFIED',status:'REVIEW',reason:'Thông tin sản phẩm đã thay đổi sau lần xác nhận; cần quản lý xác nhận lại.',revision,requires_split};
 const route=classification.route==='SEW'||classification.route==='PURCHASE'?classification.route:'UNCLASSIFIED';
 if(route==='UNCLASSIFIED')return {route,status:'UNCLASSIFIED',reason:String(classification.reason||'Chưa xác định cách đáp ứng.'),revision,requires_split};
 return {route,status:'CONFIRMED',reason:String(classification.reason||'Đã được quản lý xác nhận.'),revision,requires_split};
}
const effectiveOwner = (row: Row) => String(row.manager_id || row.price_list_manager_id || '');
export const productSupplySelection = `select p.id,p.sku,p.name,p.category,p.specifications,p.description,p.price_list_id,p.tenant_id,p.manager_id,p.is_active,
 l.name price_list_name,l.manager_id price_list_manager_id,technical.snapshot technical_confirmed_profile
 from local_products p left join local_price_lists l on l.id=p.price_list_id
 left join lateral (
  select v.snapshot from local_manufacturing_records r join local_product_technical_versions v
   on v.product_id=p.id and v.profile_id=r.id and v.action='CONFIRM'
   and v.version::text=r.payload#>>'{extra_dimensions,technical_attributes,confirmed_version}'
  where r.record_type='manufacturing_profile' and r.product_id=p.id::text
   and coalesce((r.payload->>'is_active')::boolean,true)
  order by r.updated_at desc,r.id limit 1
 ) technical on true`;
export function registerProductSupplyClassifications(app: express.Express, d: Dependencies) {
 const principal = () => { const actor=d.actor(),role=d.role(); if(!actor || !['admin','manager'].includes(role)) fail('Chỉ quản lý được phân loại sản phẩm.',403); return {actor,role}; };
 const visible = (row: Row, actor: string, role: string) => role==='admin' || !effectiveOwner(row) || effectiveOwner(row)===actor;
 const writable = (row: Row, actor: string, role: string) => role==='admin' || effectiveOwner(row)===actor;
 function project(row: Row, classification: Row | undefined, actor: string, role: string) {
  const fingerprint=productSupplyFingerprint(row),state=productSupplyClassificationState(row,classification);
  return {...row,technical_confirmed_profile:undefined,description:undefined,tenant_id:undefined,manager_id:undefined,price_list_manager_id:undefined,
   suggestion:suggestProductSupply(row),source_fingerprint:fingerprint,revision:Number(classification?.version||0),
   route:state.route,status:state.status,
   confirmed_at:classification?.created_at||null,confirmed_by:classification?.created_by||null,
   read_only:!writable(row,actor,role),read_only_reason:!writable(row,actor,role)?'Sản phẩm dùng chung; quản trị viên xác nhận.':null};
 }
 async function product(client: Pick<PoolClient,'query'>, id: string, actor: string, role: string, lock=false) {
  if(lock){const pointer=(await client.query('select id,price_list_id from local_products where id=$1 for update',[id])).rows[0];if(pointer?.price_list_id)await client.query('select id from local_price_lists where id=$1 for share',[pointer.price_list_id]);}
  const row=(await client.query(productSupplySelection+' where p.id=$1',[id])).rows[0];
  if(!row||!visible(row,actor,role)||isLaborProduct(row)) fail('Không tìm thấy sản phẩm trong phạm vi phụ trách.',404);
  return row as Row;
 }
 const base='/api/product-supply-classifications';
 app.get(base,async(req,res)=>{try{
  const {actor,role}=principal(),params: unknown[]=[],where: string[]=[];
  if(role!=='admin'){params.push(actor);where.push(`(coalesce(p.manager_id,l.manager_id)::text=$${params.length} or coalesce(p.manager_id,l.manager_id) is null)`);}
  const priceList=String(req.query.price_list_id||'');if(priceList){if(!uuid.test(priceList))fail('Bảng giá không hợp lệ.');params.push(priceList);where.push(`p.price_list_id=$${params.length}`);}
  const search=String(req.query.search||'').trim();if(search.length>200)fail('Từ khóa quá dài.');
  const status=String(req.query.status||'ALL');if(!['ALL','CONFIRMED','UNCLASSIFIED','REVIEW'].includes(status))fail('Bộ lọc không hợp lệ.');
  const limit=Number(req.query.limit||50),offset=Number(req.query.offset||0);if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)fail('Phân trang không hợp lệ.');
  const raw=(await pool.query(productSupplySelection+(where.length?' where '+where.join(' and '):'')+' order by p.name,p.id',params)).rows.filter(row=>!isLaborProduct(row));
  const histories=(await pool.query('select distinct on(product_id) * from local_product_supply_classifications order by product_id,version desc')).rows;
  const historyMap=new Map(histories.map(row=>[String(row.product_id),row]));
  const query=normalize(search),all=raw.filter(row=>!query||normalize([row.name,row.sku,row.category,row.specifications].join(' ')).includes(query)).map(row=>project(row,historyMap.get(String(row.id)),actor,role));
  const filtered=all.filter(row=>status==='ALL'||row.status===status);
  res.json({rows:filtered.slice(offset,offset+limit),total:filtered.length,counts:{all:all.length,confirmed:all.filter(x=>x.status==='CONFIRMED').length,unclassified:all.filter(x=>x.status==='UNCLASSIFIED').length,review:all.filter(x=>x.status==='REVIEW').length},
   price_lists:Array.from(new Map(raw.filter(x=>x.price_list_id).map(x=>[String(x.price_list_id),{id:x.price_list_id,name:x.price_list_name}])).values()),rule_version:SUPPLY_RULE_VERSION});
 }catch(error){d.sendError(res,error);}});
 app.get(base+'/:id',async(req,res)=>{try{
  const {actor,role}=principal(),id=String(req.params.id);if(!uuid.test(id))fail('Sản phẩm không hợp lệ.');
  const row=await product(pool,id,actor,role),classification=(await pool.query('select * from local_product_supply_classifications where product_id=$1 order by version desc limit 1',[id])).rows[0];
  res.json(project(row,classification,actor,role));
 }catch(error){d.sendError(res,error);}});
 app.get(base+'/:id/history',async(req,res)=>{try{
  const {actor,role}=principal();if(!uuid.test(String(req.params.id)))fail('Sản phẩm không hợp lệ.');
  await product(pool,String(req.params.id),actor,role);
  const rows=(await pool.query('select id,version,route,reason,created_by,created_at,source_fingerprint,rule_version from local_product_supply_classifications where product_id=$1 order by version desc',[req.params.id])).rows;
  res.json(rows);
 }catch(error){d.sendError(res,error);}});
 app.post(base+'/confirm',async(req,res)=>{try{
  const {actor,role}=principal(),body=req.body||{},key=String(body.idempotency_key||''),reason=String(body.reason||'').trim();
  if(!key||key.length>200)fail('Thiếu khóa chống gửi trùng.');if(reason.length<3||reason.length>1000)fail('Nhập lý do từ 3 đến 1.000 ký tự.');
  if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>100)fail('Chọn từ 1 đến 100 sản phẩm.');
  const rows: Row[]=body.rows;const ids=rows.map(x=>String(x.product_id||''));
  if(ids.some(id=>!uuid.test(id))||new Set(ids).size!==ids.length)fail('Danh sách sản phẩm không hợp lệ hoặc bị lặp.');
  for(const row of rows){if(!Number.isInteger(row.expected_revision)||Number(row.expected_revision)<0||!/^[a-f0-9]{64}$/.test(String(row.source_fingerprint||'')))fail('Thiếu phiên bản sản phẩm.');if(!['SEW','PURCHASE','UNCLASSIFIED'].includes(String(row.route)))fail('Cách đáp ứng không hợp lệ.');}
  const fingerprint=digest({rows:[...rows].sort((a,b)=>String(a.product_id).localeCompare(String(b.product_id))),reason});
  const result=await d.transaction(async client=>{
   await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['product-supply:'+key]);
   // Lock products in UUID order, then lock their current parent before checking inherited ownership.
   const products=new Map<string,Row>();for(const id of [...ids].sort()){
    const row=await product(client,id,actor,role,true);if(!writable(row,actor,role))fail('Sản phẩm dùng chung chỉ quản trị viên được xác nhận.',403);products.set(id,row);
   }
   const receipt=(await client.query('select * from local_product_supply_receipts where idempotency_key=$1',[key])).rows[0];
   if(receipt){if(receipt.actor_id!==actor||receipt.fingerprint!==fingerprint)fail('Khóa gửi trùng đã dùng cho nội dung khác.',409);return {...receipt.result,reused:true};}
   const confirmed=[];
   for(const input of rows){const row=products.get(String(input.product_id))!;
    const latest=(await client.query('select version from local_product_supply_classifications where product_id=$1 order by version desc limit 1',[row.id])).rows[0];
    if(Number(latest?.version||0)!==input.expected_revision||productSupplyFingerprint(row)!==input.source_fingerprint)fail('Sản phẩm hoặc phân loại đã thay đổi. Tải lại trước khi xác nhận.',409);
    const suggestion=suggestProductSupply(row);if(suggestion.requires_split&&input.route!=='UNCLASSIFIED')fail('Bộ có cả hàng may và nhập; Sale phải tách từng món trước.',409);
    if(input.use_suggestion===true&&(suggestion.route==='UNCLASSIFIED'||input.route!==suggestion.route))fail('Gợi ý chưa rõ hoặc đã thay đổi; cần quản lý chọn lại.',409);
    const version=Number(input.expected_revision)+1;
    await client.query('insert into local_product_supply_classifications(product_id,version,route,source_fingerprint,rule_version,source_snapshot,reason,created_by) values($1,$2,$3,$4,$5,$6::jsonb,$7,$8)',[row.id,version,input.route,input.source_fingerprint,SUPPLY_RULE_VERSION,JSON.stringify(productSupplySnapshot(row)),reason,actor]);
    confirmed.push({product_id:row.id,version,route:input.route});
   }
   const value={confirmed,reused:false};await client.query('insert into local_product_supply_receipts(idempotency_key,actor_id,fingerprint,result) values($1,$2,$3,$4::jsonb)',[key,actor,fingerprint,JSON.stringify(value)]);return value;
  });res.json(result);
 }catch(error){d.sendError(res,error);}});
}
