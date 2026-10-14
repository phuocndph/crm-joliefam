export type DispatchQuantity = string | number;
export interface DispatchRate {id:string;piece_rate_code:string;piece_rate_name:string|null;rate_unit:string}
export interface DispatchAssignment {
  id: string; production_order_id: string; production_batch_id: string;
  dispatch_stage: 'CUTTING' | 'SEWING'; dispatch_status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  worker_id: string; worker_name: string; employee_code: string;
  production_order_number: string; batch_number: string; order_status: string; batch_status: string;
  allocated_quantity: DispatchQuantity; accepted_quantity: DispatchQuantity | null;
  returned_quantity: DispatchQuantity; remaining_quantity: DispatchQuantity; consumed_quantity: DispatchQuantity;
  assigned_from: string; assigned_to: string | null; notes: string | null; discrepancy_reason: string | null;
  piece_rate_code: string | null; rate_unit: string | null; product_name: string | null; product_sku: string | null;
  color: string | null; size: string | null; dimensions: string | null; product_notes: string | null;
  dispatch_priority: string; dispatch_reference: string | null; dispatch_notes: string | null;
}
export interface DispatchReport {
  id: string; assignment_id: string; worker_name: string; stage: 'CUTTING' | 'SEWING'; work_date: string;
  quantity_received: DispatchQuantity; quantity_good: DispatchQuantity; quantity_rework: DispatchQuantity;
  quantity_remake: DispatchQuantity; quantity_defect: DispatchQuantity;
  status: string; notes: string | null; piece_rate_code: string | null; created_by: string;
  review_reason: string | null; reversal_reason: string | null; created_at: string;
  source_stage_event_id?: string | null; repair_kind?: 'REWORK' | 'REMAKE' | null; is_payable?: boolean;
}
export interface DispatchPublication {
  id:string;production_order_id:string;production_batch_id:string;order_item_id:string;stage:'CUTTING'|'SEWING';
  quantity:DispatchQuantity;claimed_quantity:DispatchQuantity;status:'OPEN'|'CLOSED'|'CANCELLED';eligible_worker_type:'CUTTER'|'SEWER'|'SEWING';
  eligible_supervisor_worker_id:string|null;piece_rate_code:string|null;rate_unit:string|null;assigned_from:string;assigned_to:string|null;notes:string|null;
  production_order_number?:string;batch_number?:string;product_name?:string;product_sku?:string;created_at:string;
}
export interface DispatchBatch {
  id: string; batch_number: string; status: string; planned_quantity: DispatchQuantity;
  cutting_good: DispatchQuantity; sewing_good: DispatchQuantity;
  cutting_reserved: DispatchQuantity; sewing_reserved: DispatchQuantity;
}
export interface DispatchAudit {
  id: string; action: string; quantity: DispatchQuantity | null; reason: string | null; created_at: string;
}
export interface ProductionDispatchData {
  order: Record<string, unknown> | null; assignments: DispatchAssignment[]; reports: DispatchReport[];
  batches: DispatchBatch[]; publications: DispatchPublication[]; audit: DispatchAudit[];
  progress: Array<{batch_id: string; cutting_available: number; sewing_available: number}>;
}
export interface ProductionSourceLine {
  source_line_key:string;source_line_index:number;product_id:string|null;product_sku:string;product_name:string;ordered_quantity:number;color:unknown;size:unknown;dimensions:unknown;
}
export interface ProductionSourceOrder {id:string;order_number:string|null;display_order_number:string|null;status:string;delivery_date:string|null;updated_at:string;items:ProductionSourceLine[];source_validation_error?:string|null}
export interface ProductionSalesRequestLine extends ProductionSourceLine {id:string;request_id:string;requested_quantity:DispatchQuantity;allocated_quantity:DispatchQuantity;source_line_snapshot:Record<string,unknown>}
export interface ProductionSalesRequest {id:string;order_id:string;order_number:string|null;display_order_number:string|null;status:string;due_date:string|null;priority:string;notes:string|null;submitted_by:string;submitted_at:string;review_reason:string|null;source_changed:boolean;source_validation_error?:string|null;expected_source_hash?:string|null;requested_quantity:DispatchQuantity;allocated_quantity:DispatchQuantity;lines:ProductionSalesRequestLine[]}
export interface CuttingEstimateLine {id:string;estimate_id:string;order_item_id:string;fabric_variant_id:string|null;inventory_item_id:string;warehouse_id:string;inventory_item_code:string;inventory_item_name:string;warehouse_name:string;output_quantity:DispatchQuantity;calculation_method:string;unit_per_output:DispatchQuantity|null;waste_rate:DispatchQuantity;estimated_quantity:DispatchQuantity;issued_quantity:DispatchQuantity;returned_quantity:DispatchQuantity;override_reason:string|null;calculation_snapshot:Record<string,unknown>}
export interface CuttingEstimate {id:string;production_order_id:string;production_batch_id:string;version_number:number;status:string;estimate_kind?:'BASE'|'REMAKE'|'SUPPLEMENT'|string;no_material_required:boolean;reason:string|null;created_by:string;submitted_by:string|null;reviewed_by:string|null;review_reason:string|null;source_estimate_id?:string|null;supplement_estimate_id?:string|null;source_stage_event_id?:string|null;created_at:string;lines:CuttingEstimateLine[]}
export interface ProductEarningRow {id:string;work_date:string;quantity_good:DispatchQuantity;status:string;piece_rate_code:string|null;production_order_number:string|null;batch_number:string|null;pending_amount:number|null;approved_amount:number|null;approved_status:string|null;unavailable_reason:string|null;eligibility_warning?:string|null;source_kind:string;is_payable:boolean}
export interface ProductEarnings {worker:{id:string;employee_code:string;display_name:string};month:string;income_scope:'PRODUCT_OUTPUT_ONLY';pending_total:number;approved_total:number;locked_total:number;rows:ProductEarningRow[]}
export const dispatchToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
export const dispatchNumber = (value: DispatchQuantity | null | undefined) => Number(value || 0).toLocaleString('vi-VN', {maximumFractionDigits: 2});
export const dispatchLabels: Record<string,string> = {
  PENDING: 'Chờ nhận', ACCEPTED: 'Đã nhận', REJECTED: 'Từ chối', SUBMITTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt', REVERSED: 'Đã đảo', LOCKED: 'Đã khóa', CUTTING: 'Cắt', SEWING: 'May',
  PLANNED: 'Kế hoạch', RELEASED: 'Đã phát hành', IN_PROGRESS: 'Đang làm', ON_HOLD: 'Tạm dừng',
  CANCELLED: 'Đã hủy', COMPLETED: 'Hoàn thành', LOW: 'Thấp', NORMAL: 'Bình thường', HIGH: 'Cao', URGENT: 'Khẩn',
  ASSIGN: 'Giao việc', ACCEPT: 'Nhận việc', RETURN: 'Trả việc', REJECT_ASSIGNMENT: 'Từ chối việc',
  REPORT: 'Gửi báo cáo', CREATE_BATCH: 'Tạo lô', CHANGE_BATCH: 'Sửa lô', SPLIT_BATCH: 'Tách lô',
  OPEN:'Đang mở',CLOSED:'Đã đóng',RETURNED:'Trả lại',ADJUSTMENT_REQUIRED:'Cần điều chỉnh',
  REWORK:'Sửa lại',REMAKE:'Làm lại',PUBLISH:'Công khai việc',CLAIM:'Nhận việc mở',REPAIR_REPORT:'Báo sửa/làm lại',
  CREATE_ORDER: 'Tạo lệnh', RELEASE_ORDER: 'Phát hành', RESUME_ORDER: 'Tiếp tục lệnh',
  COMPLETE_ORDER: 'Hoàn thành lệnh', TRANSITION_ORDER: 'Đổi trạng thái lệnh', TRANSITION_BATCH: 'Đổi trạng thái lô',
};
