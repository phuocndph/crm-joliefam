import type {PoolClient} from 'pg';
import {isLaborProduct,productSupplyClassificationState,productSupplyFingerprint,productSupplySelection,type ProductSupplyState} from './product-fulfillment-classification.js';
import {productDigest} from './product-catalog-snapshot.js';
import {assertZcrmOrderExecutable} from './zcrm-commerce.js';

type Row=Record<string,unknown>;
type DB=Pick<PoolClient,'query'>;
function fail(message:string):never{throw Object.assign(new Error(message),{status:409});}
export const productionSewingItemFingerprint=(item:Row)=>productDigest({product_id:item.product_id||null,color:item.color||null,size:item.size||null,dimensions:item.dimensions||null,fabric_variant_id:item.fabric_variant_id||null});
export const productionSewingSourceFingerprint=(line:Row)=>productDigest({source_line_key:line.source_line_key,product_id:line.product_id,ordered_quantity:String(line.ordered_quantity),color:line.color||null,size:line.size||null,dimensions:line.dimensions||null});
/** A chosen approved code is a decision for this order line, never a catalogue write. */
export function productionSewingEligibility(product:Row|undefined,state:ProductSupplyState){
 const reason=!product?'Sản phẩm không còn trong danh mục local.':product.is_active===false?'Sản phẩm đã ngừng dùng.':isLaborProduct(product)?'Mã công may không phải hàng hóa để sản xuất.':state.requires_split?'Bộ gồm hàng may và hàng nhập; cần tách từng món trên đơn.':state.status==='CONFIRMED'&&state.route==='PURCHASE'?'Sản phẩm đã xác nhận nhập sẵn; không lập lệnh may.':state.status==='REVIEW'?'Thông tin sản phẩm đã thay đổi sau xác nhận; cần đối soát danh mục.':state.status==='UNCLASSIFIED'&&state.revision>0?'Sản phẩm đã được xác nhận chưa xác định; cần đối soát danh mục.':null;
 return{sewing_selection_allowed:!reason,sewing_selection_reason:reason};
}
export async function productionSewingProduct(db:DB,id:string,lock=false){
 if(lock){const pointer=(await db.query('select id,price_list_id from local_products where id=$1 for share',[id])).rows[0];if(pointer?.price_list_id)await db.query('select id from local_price_lists where id=$1 for share',[pointer.price_list_id]);}
 const product=(await db.query(productSupplySelection+' where p.id=$1',[id])).rows[0] as Row|undefined;
 const classification=(await db.query('select * from local_product_supply_classifications where product_id=$1 order by version desc limit 1',[id])).rows[0];
 const state=product?productSupplyClassificationState(product,classification):{route:'UNCLASSIFIED' as const,status:'UNCLASSIFIED' as const,reason:'Không tìm thấy sản phẩm.',revision:0,requires_split:false};
 return{product,state,...productionSewingEligibility(product,state)};
}
export async function snapshotProductionSewingDecision(db:DB,item:Row,actor:string,source?:{order_id:string;line:Row}){
 const current=await productionSewingProduct(db,String(item.product_id||''),true);
 if(!current.sewing_selection_allowed)fail(current.sewing_selection_reason||'Dòng hàng không đủ điều kiện may.');
 if(source&&String(source.line.product_id)!==String(item.product_id))fail('Sản phẩm đã chọn không khớp dòng đơn nguồn.');
 return{basis:'ORDER_LINE_CODE_SELECTION',order_id:source?.order_id||null,source_line_key:source?.line.source_line_key||null,source_fingerprint:source?productionSewingSourceFingerprint(source.line):null,product_id:item.product_id,product_fingerprint:productSupplyFingerprint(current.product!),observed_fulfillment:{route:current.state.route,status:current.state.status,revision:current.state.revision},actor_id:actor};
}
/** Shipping validates provenance and current usability without requiring a current pay rate. */
export async function validateProductionSewingDecision(db:DB,item:Row){
 const selection=item.sewing_code_selection as Row|undefined,decision=selection?.production_decision as Row|undefined;
 if(!decision)return false; // Snapshots made before the order-line decision retain legacy routing.
 if(selection?.kind!=='ORDER_SELECTION'||decision.basis!=='ORDER_LINE_CODE_SELECTION'||decision.product_id!==item.product_id||selection.item_fingerprint!==productionSewingItemFingerprint(item))fail('Căn cứ may của dòng lệnh không còn khớp; cần đối soát.');
 const current=await productionSewingProduct(db,String(item.product_id),true);
 if(!current.sewing_selection_allowed||decision.product_fingerprint!==productSupplyFingerprint(current.product!))fail(current.sewing_selection_reason||'Thông tin sản phẩm đã đổi so với quyết định may; cần đối soát.');
 const parent=(await db.query('select order_id from local_production_orders where id=$1',[item.production_order_id])).rows[0];
 if(!parent||String(parent.order_id||'')!==String(decision.order_id||''))fail('Nguồn lệnh không khớp quyết định may.');
 if(decision.order_id){
  const sale=(await db.query('select id,items,status from local_orders where id=$1 for share',[decision.order_id])).rows[0];
  if(!sale||['cancelled','returned'].includes(String(sale.status).toLowerCase()))fail('Đơn nguồn đã hủy hoặc không còn tồn tại.');
  await assertZcrmOrderExecutable(db,String(sale.id));
  const {normalizeOrderLines}=await import('./production-sales-workflow.js');
  const source=(await normalizeOrderLines(db,sale)).find(line=>line.source_line_key===decision.source_line_key);
  if(!source||item.source_order_item_key!==decision.source_line_key||decision.source_fingerprint!==productionSewingSourceFingerprint(source))fail('Dòng đơn nguồn đã đổi so với quyết định may; cần đối soát.');
 }
 return true;
}
