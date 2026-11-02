/* eslint-disable @typescript-eslint/no-explicit-any */
import type {PoolClient} from 'pg';
import {resolveDispatchProductLabor} from './product-labor-mappings.js';
import {selectRuntimePieceRate} from './product-rate-consumption.js';
import {codeKey} from './product-labor-resolver.js';
import {productDigest} from './product-catalog-snapshot.js';
import {canonicalLaborCatalog} from './product-labor-requirements.js';
import {laborCodeUsagePolicy} from './product-labor-usage-policy.js';
import {resolveProductionSewingSelection} from './production-sewing-selection.js';
type Row=Record<string,any>;
type DB=Pick<PoolClient,'query'>;
const fail=(message:string):never=>{throw Object.assign(new Error(message),{status:409});};
export async function assertPaidCurtainRepair(db:DB,code:string,date:string){
 if(!laborCodeUsagePolicy(code))fail('Chỉ chọn mã sửa rèm được quản lý cho phép.');
 const source=(await canonicalLaborCatalog(db,date)).rows.find(row=>row.key===codeKey(code));
 if(source?.status!=='AVAILABLE'||source.unit!=='PIECE'||!source.requirement||source.requirement.definition.disposition!=='OTHER_STAGE'||source.requirement.definition.stage!=='REPAIR')fail('Mã sửa rèm chưa có chính sách sửa đã duyệt, đơn vị CÁI và hiệu lực phù hợp.');
 return selectRuntimePieceRate(db,{date,pieceRateCode:code});
}
export async function resolveDispatchLabor(db:DB,orderId:string,itemId:string,date:string){
 const item=(await db.query('select * from local_production_order_items where id=$1 and production_order_id=$2',[itemId,orderId])).rows[0];
 if(!item?.product_id)fail('Chọn đúng dòng sản phẩm của lệnh để xác định mã công.');
 if(item.sewing_code_selection)return resolveProductionSewingSelection(db,item,date);
 // Order-specific size/color/fabric overrides require an explicit confirmed
 // product profile; never guess a mapping from the name or a manual code.
 const product=(await db.query('select id,price_list_id,specifications from local_products where id=$1 for share',[item.product_id])).rows[0];
 if(product?.price_list_id)await db.query('select id from local_price_lists where id=$1 for share',[product.price_list_id]);
 await db.query("select id from local_manufacturing_records where product_id=$1 and record_type='manufacturing_profile' for share",[String(item.product_id)]);
 const result=await resolveDispatchProductLabor(db,String(item.product_id),date,false);
 if(result.code_status!=='RESOLVED'||!result.match)fail(result.reason||'Chưa xác định được mã công từ hồ sơ đã duyệt.');
 const match=result.match!;
 if(match.labor_unit!=='PIECE'||match.source_unit!=='PIECE'||String(match.conversion_factor)!=='1')fail('Giao việc may hiện chỉ hỗ trợ mã công theo CÁI với hệ số 1 đã xác nhận.');
 const rate=await selectRuntimePieceRate(db,{date,pieceRateCode:String(match.piece_rate_code)});
 const context=result.proof as Row;
 const itemProof={product_id:item.product_id,color:item.color||null,size:item.size||null,dimensions:item.dimensions||null,fabric_variant_id:item.fabric_variant_id||null};
 const profile=(await db.query("select payload from local_manufacturing_records where record_type='manufacturing_profile' and product_id=$1 and coalesce((payload->>'is_active')::boolean,true) order by updated_at desc,id limit 1",[String(item.product_id)])).rows[0]?.payload as Row|undefined;
 const normalize=(value:unknown)=>String(value||'').toLowerCase().replace(/\s+/g,'').replace(/×/g,'x');
 const dimensionFits=(value:unknown)=>{if(!value)return true;if(normalize(value)===normalize(product?.specifications))return true;const raw=String(value).toLowerCase(),numbers=raw.match(/\d+(?:[.,]\d+)?/g)?.map(number=>Number(number.replace(',','.')))||[];const multiplier=raw.includes('mm')?1:raw.includes('cm')?10:raw.includes('m')?1000:profile?.dimension_unit==='MM'?1:profile?.dimension_unit==='METER'?1000:10;const facts=result.facts;const expected=[facts.width_mm,facts.length_mm,...(facts.height_mm&&Number(facts.height_mm)>0?[facts.height_mm]:[])].filter(Boolean).map(Number);return numbers.length===expected.length&&numbers.every((number,index)=>number*multiplier===expected[index]);};
 if(!dimensionFits(item.dimensions)||!dimensionFits(item.size)||/quy cách riêng|thay đổi cách may|đổi cách may/i.test(String(item.notes||'')))fail('Quy cách riêng của đơn cần đối soát hồ sơ kỹ thuật trước khi giao may.');
 const basis={version:1,kind:'PRODUCT_MAPPING',product_id:item.product_id,order_item_id:item.id,item_fingerprint:productDigest(itemProof),piece_rate_code:String(rate.piece_rate_code),rate_unit:'PIECE',code_semantic_fingerprint:match.code_semantic_fingerprint,decision_id:match.decision_id,decision_version:match.decision_version,source_fingerprint:result.source_fingerprint,context_fingerprint:result.context_fingerprint,facts_fingerprint:result.facts_fingerprint,classification_version:context.classification_version,technical_profile_id:context.technical_profile_id,technical_revision:context.technical_revision,requirement_id:match.requirement_id,requirement_version:match.requirement_version,requirement_content_hash:match.requirement_content_hash,contract_version:match.contract_version,resolved_for_date:date,rate_id:rate.id};
 return {basis,rate};
}
const stableBasis=(basis:Row)=>Object.fromEntries(Object.entries(basis).filter(([key])=>!['resolved_for_date','rate_id'].includes(key)));
export async function validateDispatchLabor(db:DB,assignment:Row,date:string){
 const stage=assignment.dispatch_stage||assignment.stage;
 if(stage!=='SEWING'||assignment.repair_ticket_id)return null;
 if(!assignment.labor_basis)fail('Việc lịch sử chưa có căn cứ mã công; quản lý cần đối soát trước khi tiếp tục.');
 const current=await resolveDispatchLabor(db,assignment.production_order_id,assignment.order_item_id,date);
 if(productDigest(stableBasis(current.basis))!==productDigest(stableBasis(assignment.labor_basis))||codeKey(assignment.piece_rate_code)!==codeKey(current.basis.piece_rate_code)||assignment.rate_unit!=='PIECE')fail('Đặc điểm, ánh xạ hoặc yêu cầu mã công đã đổi; cần quản lý đối soát, không tự đổi mã công của việc đã giao.');
 return current;
}
export const publicLaborAssignment=(row:Row)=>{const {labor_basis,...publicRow}=row;return {...publicRow,labor_basis_status:row.repair_ticket_id?'NON_PAYABLE':labor_basis?'PINNED':'RECONCILIATION_REQUIRED'};};
