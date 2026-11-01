export type DispatchQuantity = string | number;
export interface DispatchRate {id:string;piece_rate_code:string;piece_rate_name:string|null;rate_unit:string}
export interface DispatchMaterial {estimate_id:string;estimate_line_id:string;estimate_kind:string;inventory_item_code:string;inventory_item_name:string;warehouse_name:string;variant_name:string|null;color:string|null;width_code:string|null;unit:string;estimated_quantity:string;issued_quantity:string;returned_quantity:string}
export interface DispatchPayPreview {status:'READY'|'NON_PAYABLE'|'UNAVAILABLE';work_date:string;quantity_good:string;piece_rate_code:string|null;rate_unit:string|null;rate_amount:string|null;pending_amount:string|null;reason:string|null}
export interface DispatchAssignment {
  labor_basis_status?:'NON_PAYABLE'|'PINNED'|'RECONCILIATION_REQUIRED';
  reference_images?:string[];
  id: string; production_order_id: string; production_batch_id: string;order_item_id?:string|null;own_assignment?:boolean;
  dispatch_stage: 'CUTTING' | 'SEWING' | 'FINISHING' | 'COUNTING'; dispatch_status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  repair_ticket_id?:string|null;fabric_estimated_m?:string|null;fabric_issued_m?:string|null;materials?:DispatchMaterial[];no_material_required?:boolean;
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
  id: string; assignment_id: string; worker_name: string; stage: 'CUTTING' | 'SEWING' | 'FINISHING' | 'COUNTING'; work_date: string;
  quantity_received: DispatchQuantity; quantity_good: DispatchQuantity; quantity_rework: DispatchQuantity;
  quantity_remake: DispatchQuantity; quantity_defect: DispatchQuantity;
  status: string; notes: string | null; piece_rate_code: string | null; created_by: string;
  review_reason: string | null; reversal_reason: string | null; created_at: string;
  source_stage_event_id?: string | null; repair_kind?: 'REWORK' | 'REMAKE' | null; is_payable?: boolean;
}
export interface DispatchPublication {
  reference_images?:string[];product_notes?:string|null;dispatch_notes?:string|null;
  id:string;production_order_id:string;production_batch_id:string;order_item_id:string;stage:'CUTTING'|'SEWING'|'FINISHING'|'COUNTING';
  quantity:DispatchQuantity;claimed_quantity:DispatchQuantity;status:'OPEN'|'CLOSED'|'CANCELLED';eligible_worker_type:'CUTTER'|'SEWER'|'SEWING'|'IRONING'|'QC'|'PACKER';
  repair_ticket_id?:string|null;fabric_estimated_m?:string|null;fabric_issued_m?:string|null;materials?:DispatchMaterial[];no_material_required?:boolean;color?:string|null;size?:string|null;dimensions?:string|null;
  eligible_supervisor_worker_id:string|null;piece_rate_code:string|null;rate_unit:string|null;assigned_from:string;assigned_to:string|null;notes:string|null;
  production_order_number?:string;batch_number?:string;product_name?:string;product_sku?:string;created_at:string;
}
// Deliberately narrow projection for the cross-order review queue. No rates,
// worker bank/profile fields, audit payloads, materials or inventory costs.
export type ProductionQueueAssignment=Pick<DispatchAssignment,'id'|'production_order_id'|'production_batch_id'|'order_item_id'|'dispatch_stage'|'dispatch_status'|'production_order_number'|'order_status'|'batch_status'|'product_name'|'assigned_from'|'assigned_to'> & Partial<Pick<DispatchAssignment,'own_assignment'|'remaining_quantity'>>;
export type ProductionQueueReport=Pick<DispatchReport,'id'|'assignment_id'|'worker_name'|'stage'|'work_date'|'quantity_good'|'status'|'created_by'>;
export interface ProductionReviewQueueData {assignments:ProductionQueueAssignment[];reports:ProductionQueueReport[];total:number;has_more:boolean;next_cursor:string|null;limit:number}
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
  /** Canonical product-fulfillment projection. It never exposes product profiles or classification snapshots. */
  submitted_quantity?:DispatchQuantity;remaining_quantity?:DispatchQuantity;
  fulfillment_route?:'SEW'|'PURCHASE'|'UNCLASSIFIED';fulfillment_status?:'CONFIRMED'|'UNCLASSIFIED'|'REVIEW';fulfillment_reason?:string;fulfillment_requires_split?:boolean;fulfillment_revision?:number;
}
export interface ProductionSourceOrder {id:string;order_number:string|null;display_order_number:string|null;status:string;delivery_date:string|null;updated_at:string;items:ProductionSourceLine[];source_validation_error?:string|null}
export interface ProductionSalesRequestLine extends ProductionSourceLine {purchase_fulfillment_plan_id?:string|null;id:string;request_id:string;requested_quantity:DispatchQuantity;allocated_quantity:DispatchQuantity;source_line_snapshot:Record<string,unknown>}
export interface ProductionSalesRequest {id:string;order_id:string;order_number:string|null;display_order_number:string|null;status:string;due_date:string|null;priority:string;notes:string|null;submitted_by:string;submitted_at:string;review_reason:string|null;source_changed:boolean;source_validation_error?:string|null;expected_source_hash?:string|null;requested_quantity:DispatchQuantity;allocated_quantity:DispatchQuantity;lines:ProductionSalesRequestLine[]}
export interface PurchaseFulfillmentPlan {id:string;request_line_id:string;product_id:string;product_name:string;planned_quantity:DispatchQuantity;inventory_item_id:string;inventory_item_name:string;warehouse_id:string;warehouse_name:string;base_unit:string;status:'ACTIVE'|'RELEASED';physical_quantity:DispatchQuantity;reserved_quantity:DispatchQuantity;needed_quantity:DispatchQuantity;received_quantity:DispatchQuantity;available_quantity:DispatchQuantity;held_quantity:DispatchQuantity;shortage_quantity:DispatchQuantity;shortage_id:string|null;source_changed:boolean;reconciliation_required:boolean;source_validation_error:string|null}
export interface PurchaseFulfillmentData {request_id:string;plans:PurchaseFulfillmentPlan[];receipt_candidates:Array<{plan_id:string;inventory_movement_id:string;document_number:string;available_quantity:DispatchQuantity;unit:string}>}
export interface CuttingEstimateLine {required_quantity?:DispatchQuantity;executable_output_quantity?:DispatchQuantity;reconciliation_required?:boolean;id:string;estimate_id:string;order_item_id:string;fabric_variant_id:string|null;inventory_item_id:string;warehouse_id:string;inventory_item_code:string;inventory_item_name:string;warehouse_name:string;output_quantity:DispatchQuantity;calculation_method:string;unit_per_output:DispatchQuantity|null;waste_rate:DispatchQuantity;estimated_quantity:DispatchQuantity;issued_quantity:DispatchQuantity;returned_quantity:DispatchQuantity;override_reason:string|null;calculation_snapshot:Record<string,unknown>}
export interface CuttingEstimate {stock?:Array<{inventory_item_id:string;warehouse_id:string;unit:string;stock_quantity:DispatchQuantity;required_remaining:DispatchQuantity;shortage_quantity:DispatchQuantity}>;id:string;production_order_id:string;production_batch_id:string;version_number:number;status:string;estimate_kind?:'BASE'|'REMAKE'|'SUPPLEMENT'|string;no_material_required:boolean;reason:string|null;created_by:string;submitted_by:string|null;reviewed_by:string|null;review_reason:string|null;source_estimate_id?:string|null;supplement_estimate_id?:string|null;source_stage_event_id?:string|null;created_at:string;lines:CuttingEstimateLine[]}
export interface ProductEarningRow {id:string;work_date:string;quantity_good:DispatchQuantity;status:string;piece_rate_code:string|null;production_order_number:string|null;batch_number:string|null;pending_amount:number|null;approved_amount:number|null;approved_status:string|null;unavailable_reason:string|null;eligibility_warning?:string|null;source_kind:string;is_payable:boolean}
export interface ProductEarnings {worker:{id:string;employee_code:string;display_name:string};month:string;income_scope:'PRODUCT_OUTPUT_ONLY';pending_total:number;approved_total:number;locked_total:number;today_pending_total?:number;today_approved_total?:number;rows:ProductEarningRow[]}
export const dispatchToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
export const dispatchNumber = (value: DispatchQuantity | null | undefined) => Number(value || 0).toLocaleString('vi-VN', {maximumFractionDigits: 2});
export const dispatchLabels: Record<string,string> = {
  PENDING: 'Chờ nhận', ACCEPTED: 'Đã nhận', REJECTED: 'Từ chối', SUBMITTED: 'Chờ duyệt',
  APPROVED: 'Đã duyệt', REVERSED: 'Đã đảo', LOCKED: 'Đã khóa', CUTTING: 'Cắt', SEWING: 'May',FINISHING:'Gấp – là',COUNTING:'Kiểm đếm',DRAFT:'Nháp',
  PLANNED: 'Kế hoạch', RELEASED: 'Đã phát hành', IN_PROGRESS: 'Đang làm', ON_HOLD: 'Tạm dừng',
  CANCELLED: 'Đã hủy', COMPLETED: 'Hoàn thành', LOW: 'Thấp', NORMAL: 'Bình thường', HIGH: 'Cao', URGENT: 'Khẩn',
  ASSIGN: 'Giao việc', ACCEPT: 'Nhận việc', RETURN: 'Trả việc', REJECT_ASSIGNMENT: 'Từ chối việc',
  REPORT: 'Gửi báo cáo', CREATE_BATCH: 'Tạo lô', CHANGE_BATCH: 'Sửa lô', SPLIT_BATCH: 'Tách lô',
  OPEN:'Đang mở',CLOSED:'Đã đóng',RETURNED:'Trả lại',ADJUSTMENT_REQUIRED:'Cần điều chỉnh',
  REWORK:'Sửa lại',REMAKE:'Làm lại',PUBLISH:'Công khai việc',CLAIM:'Nhận việc mở',REPAIR_REPORT:'Báo sửa/làm lại',
  CREATE_ORDER: 'Tạo lệnh', RELEASE_ORDER: 'Phát hành', RESUME_ORDER: 'Tiếp tục lệnh',
  COMPLETE_ORDER: 'Hoàn thành lệnh', TRANSITION_ORDER: 'Đổi trạng thái lệnh', TRANSITION_BATCH: 'Đổi trạng thái lô',
};
