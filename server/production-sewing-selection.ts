import type {PoolClient} from 'pg';
import {canonicalLaborCatalog,loadLaborRequirements} from './product-labor-requirements.js';
import {codeKey} from './product-labor-resolver.js';
import {laborCodeUsagePolicy} from './product-labor-usage-policy.js';
import {loadEffectiveApprovedProductRates,resolveRuntimePieceRate,lockProductRateConfigShared} from './product-rate-consumption.js';
import {productionSewingItemFingerprint,snapshotProductionSewingDecision,validateProductionSewingDecision} from './production-sewing-decision.js';

type DB=Pick<PoolClient,'query'>;
type Row=Record<string,unknown>;
function fail(message:string,status=409):never{throw Object.assign(new Error(message),{status});}
export const sewingSelectionDate=(value:unknown)=>{
 const date=String(value||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)fail('Ngày chọn mã may không hợp lệ.',400);
 return date;
};
const activeOtherStage=(event:Row|undefined,date:string)=>event?.action==='APPROVE'&&(!event.effective_to||String(event.effective_to)>=date)&&['OTHER_STAGE','NOT_APPLICABLE'].includes(String((event.definition as Row|undefined)?.disposition));
const normalized=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/\s+/g,' ').trim();
export async function lockProductionSewingCatalog(db:DB){
 await lockProductRateConfigShared(db);
 await db.query("select pg_advisory_xact_lock_shared(hashtextextended('labor-mapping-writer',0))");
}
/** Full effective rate set is classified before filtering or pagination. */
export async function productionSewingCatalog(db:DB,date:string,search='',offset=0){
 sewingSelectionDate(date);
 if(search.length>200||!Number.isSafeInteger(offset)||offset<0)fail('Bộ lọc mã may không hợp lệ.',400);
 const catalog=await canonicalLaborCatalog(db,date),rates=await loadEffectiveApprovedProductRates(db,date),requirements=await loadLaborRequirements(db,date);
 const rows=catalog.rows.map(row=>{
  let reason:string|null=null,price:string|null=null;
  try{
   if(row.status!=='AVAILABLE')fail('Mã trùng hoặc thiếu tên / đơn vị; cần kiểm tra danh mục.');
   if(row.unit!=='PIECE')fail('Chỉ chọn mã may tính theo CÁI.');
   if(laborCodeUsagePolicy(row.code)||activeOtherStage(requirements.get(row.key),date))fail('Mã thuộc sửa chữa / công đoạn khác, không dùng cho may sản phẩm.');
   price=resolveRuntimePieceRate(rates,{date,pieceRateCode:row.code}).rate_exact;
  }catch(error){reason=error instanceof Error?error.message:'Mã chưa sẵn sàng.';}
  return{piece_rate_code:row.code,name:row.name,rate_unit:row.unit,rate_exact:price,selectable:!reason,reason,code_semantic_fingerprint:row.semantic_fingerprint,requirement_id:row.requirement?.stream_id||null,requirement_version:row.requirement?.version||null,requirement_content_hash:row.requirement?.content_hash||null};
 }).filter(row=>normalized(row.piece_rate_code+' '+row.name).includes(normalized(search))).sort((a,b)=>a.piece_rate_code.localeCompare(b.piece_rate_code,'vi'));
 return{rows:rows.slice(offset,offset+50),total:rows.length,date,offset,limit:50};
}
async function currentCode(db:DB,date:string,code:string){
 const row=(await canonicalLaborCatalog(db,date)).rows.find(row=>row.key===codeKey(code));
 if(!row||row.status!=='AVAILABLE'||row.unit!=='PIECE')fail('Mã may không còn sẵn sàng trong ngày đã chọn. Tải lại danh sách mã may.');
 const event=(await loadLaborRequirements(db,date)).get(row.key);
 if(laborCodeUsagePolicy(row.code)||activeOtherStage(event,date))fail('Mã thuộc sửa chữa / công đoạn khác, không dùng cho may sản phẩm.');
 const rate=resolveRuntimePieceRate(await loadEffectiveApprovedProductRates(db,date),{date,pieceRateCode:code});
 return{row,rate};
}
/** Optional for legacy callers; the basic composer requires an explicit choice per selected line. */
export async function snapshotProductionSewingSelection(db:DB,item:Row,value:unknown,at:unknown,actor:string,source?:{order_id:string;line:Row}){
 if(value===undefined)return null;
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Mã may đã chọn không hợp lệ.',400);
 const input=value as Row,allowed=['piece_rate_code','code_semantic_fingerprint','requirement_id','requirement_version','requirement_content_hash'];
 if(Object.keys(input).some(key=>!allowed.includes(key))||typeof input.piece_rate_code!=='string'||!input.piece_rate_code.trim()||input.piece_rate_code.length>200)fail('Thông tin mã may đã chọn không hợp lệ.',400);
 const decision=await snapshotProductionSewingDecision(db,item,actor,source);
 const date=sewingSelectionDate(at);await lockProductionSewingCatalog(db);
 const{row,rate}=await currentCode(db,date,String(input.piece_rate_code)),requirement=row.requirement;
 if(input.code_semantic_fingerprint!==row.semantic_fingerprint||input.requirement_id!==(requirement?.stream_id||null)||input.requirement_version!==(requirement?.version||null)||input.requirement_content_hash!==(requirement?.content_hash||null))fail('Danh mục mã may đã thay đổi. Chọn lại mã cho dòng sản phẩm.');
 return{version:1,kind:'ORDER_SELECTION',piece_rate_code:rate.piece_rate_code,rate_unit:'PIECE',code_semantic_fingerprint:row.semantic_fingerprint,requirement_id:requirement?.stream_id||null,requirement_version:requirement?.version||null,requirement_content_hash:requirement?.content_hash||null,item_fingerprint:productionSewingItemFingerprint(item),selected_for_date:date,selected_by:actor,applicability:'MANAGER_ORDER_LINE_SELECTION',production_decision:decision};
}
export async function resolveProductionSewingSelection(db:DB,item:Row,date:string){
 const selection=item.sewing_code_selection as Row;
 await validateProductionSewingDecision(db,item);
 if(selection.version!==1||selection.kind!=='ORDER_SELECTION'||selection.rate_unit!=='PIECE'||selection.item_fingerprint!==productionSewingItemFingerprint(item))fail('Đặc điểm dòng sản phẩm đã đổi so với mã may đã chọn; quản lý cần đối soát.');
 const{row,rate}=await currentCode(db,date,String(selection.piece_rate_code)),requirement=row.requirement;
 if(selection.code_semantic_fingerprint!==row.semantic_fingerprint||selection.requirement_id!=null&&(!requirement||selection.requirement_id!==requirement.stream_id||selection.requirement_version!==requirement.version||selection.requirement_content_hash!==requirement.content_hash))fail('Nội dung hoặc yêu cầu mã may đã đổi; quản lý cần đối soát trước khi giao may.');
 return{basis:{...selection,kind:'ORDER_SELECTION',piece_rate_code:String(rate.piece_rate_code),product_id:item.product_id,order_item_id:item.id,resolved_for_date:date,rate_id:rate.id},rate};
}
