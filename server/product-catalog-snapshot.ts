import {createHash} from 'node:crypto';
type Row=Record<string,unknown>;
export const stableProductJson=(value:unknown):string=>Array.isArray(value)?'['+value.map(stableProductJson).join(',')+']':value&&typeof value==='object'?'{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+stableProductJson(item)).join(',')+'}':JSON.stringify(value)??'null';
export const productDigest=(value:unknown)=>createHash('sha256').update(stableProductJson(value)).digest('hex');
export const rawProductSnapshot=(row:Row)=>Object.fromEntries(['id','sku','name','category','specifications','description','price_list_id','tenant_id','manager_id','price_list_manager_id','is_active'].map(key=>[key,row[key]??null]));
export const rawProductFingerprint=(row:Row)=>productDigest(rawProductSnapshot(row));
export const productEffectiveOwner=(row:Row)=>String(row.manager_id||row.price_list_manager_id||'');
export const productCatalogSelection=`select p.id,p.sku,p.name,p.category,p.specifications,p.description,p.price_list_id,p.tenant_id,p.manager_id,p.is_active,
 l.name price_list_name,l.manager_id price_list_manager_id from local_products p left join local_price_lists l on l.id=p.price_list_id`;
