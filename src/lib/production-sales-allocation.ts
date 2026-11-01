import type {ProductionSalesRequest,ProductionSalesRequestLine} from './production-dispatch-types';

export const productionSalesLineCanAllocate=(line:ProductionSalesRequestLine)=>line.fulfillment_route==='SEW'&&line.fulfillment_status==='CONFIRMED';
export function reconcileProductionSalesAllocation(previous:ProductionSalesRequest,queue:ProductionSalesRequest[]):{request:ProductionSalesRequest|null;retainedLineIds:string[];notice:string|null}{
 const fresh=queue.find(request=>request.id===previous.id);
 if(!fresh||fresh.order_id!==previous.order_id)return {request:null,retainedLineIds:[],notice:'Yêu cầu đang phân bổ không còn trong hàng đợi hoặc phạm vi được phép. Vui lòng mở lại yêu cầu hiện hành.'};
 if(fresh.status!=='ACCEPTED'||fresh.source_changed||fresh.source_validation_error)return {request:null,retainedLineIds:[],notice:'Yêu cầu không còn được tiếp nhận hoặc đơn nguồn đã thay đổi. Vui lòng kiểm tra lại trước khi lập đợt may.'};
 const retainedLineIds=fresh.lines.filter(line=>productionSalesLineCanAllocate(line)&&previous.lines.some(old=>productionSalesLineCanAllocate(old)&&old.id===line.id&&old.request_id===line.request_id&&old.product_id===line.product_id&&old.source_line_key===line.source_line_key&&JSON.stringify(old.source_line_snapshot)===JSON.stringify(line.source_line_snapshot))).map(line=>line.id);
 const changed=previous.lines.some(line=>productionSalesLineCanAllocate(line)&&!retainedLineIds.includes(line.id));
 return {request:fresh,retainedLineIds,notice:changed?'Dòng sản phẩm đã thay đổi hoặc không còn được may. Số lượng và ảnh của dòng đó đã được bỏ; vui lòng kiểm tra lại.':null};
}
export function productionSalesAllocationError(request:ProductionSalesRequest,quantities:Record<string,string>):string|null{
 if(request.status!=='ACCEPTED'||request.source_changed||request.source_validation_error)return 'Yêu cầu hoặc đơn nguồn đã thay đổi. Tải lại trước khi lập đợt may.';
 let positive=false;
 for(const line of request.lines){
  const raw=quantities[line.id]||'',quantity=raw.trim()?Number(raw):0,remaining=Number(line.requested_quantity)-Number(line.allocated_quantity);
  if(!Number.isFinite(quantity)||quantity<0)return 'Số lượng lập đợt phải là số hợp lệ và không âm.';
  if(quantity>0&&!productionSalesLineCanAllocate(line))return 'Dòng có số lượng đã không còn được xác nhận “May tại xưởng”. Xóa số lượng dòng này trước khi tiếp tục.';
  if(productionSalesLineCanAllocate(line)&&(!Number.isFinite(remaining)||remaining<0||quantity>remaining))return 'Số phân bổ vượt phần còn lại mới nhất. Vui lòng sửa số lượng; hệ thống không tự điều chỉnh.';
  if(quantity>0)positive=true;
 }
 return positive?null:'Chỉ nhập số lượng cho dòng đã xác nhận “May tại xưởng”.';
}
