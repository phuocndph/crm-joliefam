import type { Json } from "./types";
import type { BomManagementDatabase } from "./bom-management-types";

type TableDefinition<Row, Insert, Update = Partial<Insert>> = {
  Row: Row; Insert: Insert; Update: Update; Relationships: [];
};

export type ProductionOrderStatus = "DRAFT" | "PLANNED" | "RELEASED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "ON_HOLD";
export type ProductionSourceType = "FROM_ORDER" | "FROM_STOCK_PLAN" | "MANUAL";
export type OperationStatus = "PENDING" | "READY" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
export type WorkerType = "CUTTER" | "SEWER" | "IRONING" | "QC" | "PACKER" | "HELPER" | "SUPERVISOR" | "GENERIC";
export type OperationEventType = "START" | "PAUSE" | "RESUME" | "COMPLETE" | "QUANTITY_REPORT" | "SCRAP_REPORT" | "REWORK";
export type CompensationType = "MONTHLY_MANAGER" | "MONTHLY_HELPER" | "PIECE_RATE" | "HOURLY";
export type LaborCostClassification = "DIRECT_LABOR" | "MANUFACTURING_OVERHEAD";
export type AttendanceMethod = "DAY" | "HOUR" | "OUTPUT";
export type AttendanceWorkflowStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "LOCKED" | "REVERSED";
export type AttendanceClosureStatus = "OPEN" | "EMPLOYEE_CONFIRMED" | "LEADER_CONFIRMED" | "REOPENED";
export type FactoryAttendanceDayStatus = "PRESENT" | "ABSENT" | "PAID_LEAVE" | "UNPAID_LEAVE" | "HOLIDAY" | "OFF";
export type OvertimeType = "NORMAL_OVERTIME" | "SUNDAY_OVERTIME" | "HOLIDAY_OVERTIME";
export type PayrollStatus = "ACTIVE" | "SUSPENDED" | "TERMINATED";
export type PayrollVersionStatus = "DRAFT" | "APPROVED" | "RETIRED";
export type BankAccountStatus = "DRAFT" | "VERIFIED" | "RETIRED";
export type PieceRateUnit = "PIECE" | "SET";
export type PayrollPermissionType =
  | "payroll_view"
  | "payroll_team_view"
  | "payroll_worker_manage"
  | "payroll_rate_view"
  | "payroll_rate_manage"
  | "payroll_policy_manage"
  | "payroll_insurance_manage"
  | "payroll_bank_manage"
  | "payroll_audit";
export type PayrollCapabilitySource = "ROLE" | "DELEGATED" | "NONE";

export interface ProductionOrder {
  id: string; tenant_id: string; production_order_number: string; production_batch_number: string;
  qr_token: string; product_id: string; quantity_planned: number; quantity_good: number;
  quantity_scrap: number; quantity_rework: number; status: ProductionOrderStatus;
  planned_start_date: string | null; planned_end_date: string | null;
  actual_start_at: string | null; actual_end_at: string | null;
  source_type: ProductionSourceType; source_id: string | null; order_id: string | null;
  cost_center_id: string | null; bom_version_id: string | null; routing_version_id: string | null;
  standard_minutes_total: number; material_issue_tolerance_percent: number;
  cutting_params_snapshot: Json; created_by: string | null; released_by: string | null;
  completed_by: string | null; cancelled_by: string | null; created_at: string; updated_at: string;
  released_at: string | null; completed_at: string | null; cancelled_at: string | null;
  cancel_reason: string | null; attendance_assignment_enforced?: boolean;
  production_order_group_id?: string | null;
}

export interface ProductionSourceOrder {
  id: string;
  order_number: string | null;
  display_order_number: string | null;
  status: string;
  delivery_date: string | null;
  total_amount: number | null;
  items: Json;
}

export interface ProductionFabricVariant {
  id: string;
  variant_name: string;
  color: string | null;
  width_code: string | null;
  weight: string | null;
  unit: string;
  fabric_type_name: string | null;
}

export interface ProductionBatch {
  id: string;
  tenant_id: string;
  production_order_id: string;
  batch_number: string;
  team_id: string | null;
  planned_quantity: number;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  idempotency_key: string | null;
}

export type ProductionStage = "CUTTING" | "SEWING" | "QUALITY_CHECK" | "REWORK" | "FOLDING" | "PACKING" | "SHIPPING";
export type ProductionStageStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "LOCKED" | "REVERSED";

export interface ProductionStageEvent {
  id: string;
  assignment_id?: string | null;
  tenant_id: string;
  production_order_id: string;
  production_batch_id: string | null;
  order_item_id: string | null;
  stage: ProductionStage;
  worker_id: string | null;
  team_id: string | null;
  quantity_received: number;
  quantity_good: number;
  quantity_rework: number;
  quantity_remake: number;
  quantity_defect: number;
  minutes_worked: number | null;
  event_type: "RECEIVE" | "OUTPUT" | "TRANSFER" | "ADJUSTMENT";
  status: ProductionStageStatus;
  occurred_at: string;
  created_by: string | null;
  approved_by: string | null;
  notes: string | null;
  created_at: string;
  idempotency_key: string | null;
  production_entry_id: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  reversed_by: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
}

export interface ProductionFabricAllocation {
  id: string;
  tenant_id: string;
  production_order_id: string;
  production_batch_id: string | null;
  fabric_variant_id: string | null;
  inventory_item_id: string | null;
  warehouse_id: string | null;
  reserved_quantity: number;
  issued_quantity: number;
  received_quantity: number;
  consumed_quantity: number;
  returned_quantity: number;
  scrap_quantity: number;
  created_at: string;
  idempotency_key: string | null;
  source_system: string;
  source_fabric_usage_id: string | null;
  source_fabric_transaction_id: string | null;
  issued_at: string | null;
  issued_by: string | null;
  notes: string | null;
}

export interface ProductionFabricStock {
  fabric_variant_id: string;
  variant_name: string;
  fabric_type_name: string | null;
  color: string | null;
  width_code: string | null;
  unit: string;
  warehouse_id: string;
  warehouse_name: string;
  current_stock: number;
  reserved_stock: number;
  available_stock: number;
}

export interface ProductionOrderItemMetadata {
  id: string;
  production_order_id: string;
  product_id: string;
  product_sku: string | null;
  product_name: string;
  fabric_variant_id: string | null;
  fabric_variant_name: string | null;
  source_order_item_key?: string | null;
  color: string | null;
  size: string | null;
  dimensions: string | null;
  planned_quantity: number;
  completed_quantity: number;
  notes: string | null;
  created_at: string;
}

export interface CreateProductionOrderGroupLine {
  product_id: string;
  quantity: number;
  fabric_variant_id: string | null;
  color?: string | null;
  size?: string | null;
  dimensions?: string | null;
  notes?: string | null;
  source_item_snapshot?: Json;
  source_order_item_key?: string | null;
}

export interface CreateProductionOrderGroupInput {
  order_id: string | null;
  source_type?: "FROM_ORDER" | "MANUAL";
  dispatch_priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  dispatch_reference?: string | null;
  dispatch_notes?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  notes?: string | null;
  lines: CreateProductionOrderGroupLine[];
}

export interface CreateProductionOrderGroupResult {
  group_id: string;
  idempotency_key: string;
  reused: boolean;
  order_count: number;
  orders: Array<{
    id: string;
    production_order_number: string;
    production_order_group_id: string;
    product_id: string;
    quantity_planned: number;
    status: ProductionOrderStatus;
    order_item_id: string;
    fabric_variant_id: string | null;
    color: string | null;
    size: string | null;
    dimensions: string | null;
    source_order_item_key?: string | null;
    production_batch_id?: string | null;
  }>;
}

export interface RoutingHeader { id: string; tenant_id: string; product_id: string; code: string; name: string; is_active: boolean; created_at: string }
export interface RoutingVersion {
  id: string; tenant_id: string; routing_id: string; version_number: number;
  status: "DRAFT" | "APPROVED" | "SUPERSEDED"; effective_from: string | null; effective_to: string | null;
  notes: string | null; created_by: string | null; approved_by: string | null; approval_reason: string | null;
  created_at: string; updated_at: string; approved_at: string | null;
}
export interface RoutingOperation {
  id: string; tenant_id: string; routing_version_id: string; operation_code: string; operation_name: string;
  sequence: number; cost_center_id: string | null; standard_minutes_per_unit: number; setup_minutes: number;
  machine_type: string | null; labor_skill: string | null; quantity_basis: string; is_optional: boolean;
  created_at: string; updated_at: string;
}
export type RoutingOperationInput = Omit<RoutingOperation, "id" | "routing_version_id" | "created_at" | "updated_at">;

export interface ProductionWorker {
  id: string; tenant_id: string; user_id: string | null; employee_code: string; display_name: string;
  primary_cost_center_id: string | null; worker_type: WorkerType; is_active: boolean;
  location_code?: string | null; position_title?: string | null; employment_type?: CompensationType | null;
  employment_start_date?: string | null; employment_end_date?: string | null; payroll_status?: PayrollStatus;
  created_by: string | null; created_at: string; updated_at: string;
}

export interface PayrollPolicyGroup {
  id: string; tenant_id: string; code: string; name: string; description: string | null;
  is_active: boolean; created_by: string | null; created_at: string; updated_at: string;
}

export interface PayrollCapability {
  permission_type: PayrollPermissionType;
  allowed: boolean;
  source: PayrollCapabilitySource;
  delegable: boolean;
}

export interface PayrollTeamAssignment {
  id: string; tenant_id: string; supervisor_worker_id: string; worker_id: string;
  effective_from: string; effective_to: string | null; status: "ACTIVE" | "RETIRED";
  reason: string; created_by: string | null; retired_by: string | null;
  created_at: string; updated_at: string; retired_at: string | null;
}

export interface WorkerCompensationAssignment {
  id: string; tenant_id: string; worker_id: string; compensation_type: CompensationType;
  payroll_policy_group_id: string; effective_from: string; effective_to: string | null;
  status: PayrollVersionStatus; reason: string; created_by: string | null; approved_by: string | null;
  created_at: string; updated_at: string; approved_at: string | null;
}

export interface ProductPieceRateVersion {
  id: string; tenant_id: string; product_id: string | null; piece_rate_code?: string | null; piece_rate_name?: string | null; unit: PieceRateUnit; rate: number;
  currency_code: string; effective_from: string; effective_to: string | null;
  status: PayrollVersionStatus; reason: string; source_reference: string | null;
  created_by: string | null; approved_by: string | null; created_at: string;
  updated_at: string; approved_at: string | null;
}

export interface SocialInsuranceVersion {
  id: string; tenant_id: string; worker_id: string; calculation_type: "FIXED_AMOUNT";
  employee_amount: number; currency_code: string; effective_from: string; effective_to: string | null;
  status: PayrollVersionStatus; source_reference: string; reason: string;
  created_by: string | null; approved_by: string | null; created_at: string;
  updated_at: string; approved_at: string | null;
}

export type PayrollAdjustmentStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "LOCKED";
export type PayrollAdjustmentDirection = "EARNING" | "DEDUCTION";

export interface PayrollAdjustment {
  id: string; worker_id: string; employee_code: string; worker_name: string;
  period_id: string; period_start: string; period_end: string;
  item_type: string; item_direction: PayrollAdjustmentDirection; amount: number;
  reason: string; source_reference: string | null; idempotency_key: string;
  status: PayrollAdjustmentStatus; created_by: string; submitted_by: string | null;
  approved_by: string | null; rejected_by: string | null; created_at: string;
  submitted_at: string | null; approved_at: string | null; rejected_at: string | null;
  locked_run_id: string | null; locked_at: string | null;
}

export interface BankAccountVersion {
  id: string; tenant_id: string; worker_id: string; account_number: string; account_name: string;
  bank_code: string | null; bank_name: string; is_primary: boolean; effective_from: string;
  effective_to: string | null; status: BankAccountStatus; source_reference: string | null;
  reason: string; created_by: string | null; verified_by: string | null; created_at: string;
  updated_at: string; verified_at: string | null;
}

export interface PayrollWorker {
  id: string; employee_code: string; display_name: string; user_id: string | null;
  worker_type: WorkerType; primary_cost_center_id: string | null; location_code: string | null;
  position_title: string | null; employment_type: CompensationType | null;
  employment_start_date: string | null; employment_end_date: string | null;
  payroll_status: PayrollStatus; is_active: boolean; current_assignment_id: string | null;
  current_compensation_type: CompensationType | null; current_policy_group_id: string | null;
  current_policy_group_code: string | null;
}

export interface PayrollProduct {
  id: string; sku: string | null; name: string; category: string | null;
  specifications: string | null; in_stock: boolean; price_list_id: string | null;
  price_list_name: string | null; price_list_year: number | null; sku_match_count: number;
  mapping_status: "UNIQUE_SKU" | "AMBIGUOUS_SKU" | "MISSING_SKU";
  current_rate_id: string | null;
  current_rate: number | null; current_rate_unit: PieceRateUnit | null;
  current_rate_effective_from: string | null; current_rate_effective_to: string | null;
}

export interface PayrollBankAccount {
  id: string; worker_id: string; account_number: string | null; account_number_masked: string;
  account_name: string; bank_code: string | null; bank_name: string; is_primary: boolean;
  effective_from: string; effective_to: string | null; status: BankAccountStatus;
  source_reference: string | null; reason: string; verified_at: string | null; created_at: string;
}

export interface ProductionOrderMaterialRequirement {
  id: string; tenant_id: string; production_order_id: string; inventory_item_id: string;
  bom_line_id: string | null; bom_version_id: string; requirement_method: string;
  standard_quantity: number; planned_quantity: number; waste_quantity_standard: number;
  unit: string; standard_unit_cost_snapshot: number | null; standard_material_cost_preview: number | null;
  cutting_profile_version_id: string | null; calculation_details: Json; created_at: string;
}

export interface ProductionOrderOperation {
  id: string; tenant_id: string; production_order_id: string; sequence: number;
  operation_code: string; operation_name: string; cost_center_id: string | null;
  standard_setup_minutes: number; standard_run_minutes_per_unit: number; standard_total_minutes: number;
  status: OperationStatus; quantity_input: number; quantity_good: number; quantity_scrap: number;
  quantity_rework: number; is_optional: boolean; planned_start: string | null; planned_end: string | null;
  actual_start: string | null; actual_end: string | null; operation_qr_code: string | null;
  created_at: string; updated_at: string;
}

export interface ProductionOperationLog {
  id: string; tenant_id: string; production_order_operation_id: string; event_type: OperationEventType;
  worker_id: string | null; quantity: number | null; reason_code: string | null;
  started_at: string | null; ended_at: string | null; duration_minutes: number | null;
  notes: string | null; created_by: string | null; created_at: string;
}

export interface ProductionOutput {
  id: string; tenant_id: string; production_order_id: string; product_id: string;
  quantity_good: number; quantity_scrap: number; output_date: string; warehouse_id: string | null;
  inventory_receipt_id: string | null; status: string; valuation_status: string;
  created_by: string | null; created_at: string;
}

export interface MaterialVarianceRow {
  inventory_item_id: string; unit: string; standard_quantity: number; planned_quantity: number;
  issued_quantity: number; returned_quantity: number; actual_consumption_quantity: number;
  quantity_variance: number; actual_material_cost: number | null; cost_visible: boolean;
  current_stock: number | null; shortage: number;
}

export interface MaterialVarianceResult {
  production_order_id: string; materials: MaterialVarianceRow[]; cost_visible: boolean;
}

export interface LaborVarianceResult {
  production_order_id: string; standard_minutes: number; actual_minutes: number;
  variance_minutes: number; efficiency_percent: number | null;
  direct_labor_cost?: number | null; manufacturing_overhead_cost?: number | null; total_labor_cost?: number | null;
  is_estimated?: boolean;
  cost_visible?: boolean;
  by_worker?: LaborCostByWorker[]; by_operation?: LaborCostByOperation[];
}

export interface WorkerCompensationProfile {
  id: string; tenant_id: string; worker_id: string; default_compensation_type: CompensationType;
  monthly_productive_minutes: number | null; currency_code: string; is_active: boolean;
  created_by: string | null; created_at: string; updated_at: string;
}

export interface WorkerCompensationRate {
  id: string; tenant_id: string; worker_id: string; compensation_type: CompensationType;
  effective_from: string; effective_to: string | null; hourly_rate: number | null;
  piece_rate: number | null; monthly_rate: number | null; monthly_productive_minutes: number | null;
  currency_code: string; unit_basis: string; reason: string | null; is_estimated: boolean;
  status?: PayrollVersionStatus; source_reference?: string | null; approved_by?: string | null;
  approved_at?: string | null; updated_at?: string; created_by: string | null; created_at: string;
}

export type PayrollSupplementalSourceType = "PIECE_OUTPUT" | "OVERTIME" | "MEALS" | "ALLOWANCES" | "DEDUCTIONS" | "INSURANCE";

export interface WorkerPayrollProfile {
  id: string;
  tenant_id: string;
  worker_id: string;
  piece_output_enabled: boolean;
  overtime_enabled: boolean;
  meal_enabled: boolean;
  allowances_enabled: boolean;
  deductions_enabled: boolean;
  insurance_enabled: boolean;
  fixed_allowance_amount: number;
  fixed_deduction_amount: number;
  effective_from: string;
  effective_to: string | null;
  status: PayrollVersionStatus;
  source_reference: string | null;
  reason: string;
  idempotency_key: string;
  request_hash: string;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
}

export interface ProductionOperationLaborFact {
  id: string; tenant_id: string; production_order_id: string; production_order_operation_id: string;
  worker_id: string; rate_id: string; compensation_type: CompensationType; quantity: number;
  accepted_quantity: number; minutes: number; fact_date: string; rate_amount: number;
  monthly_productive_minutes: number | null; calculated_amount: number;
  cost_classification: LaborCostClassification; is_estimated: boolean; formula_basis: string;
  source_log_id: string | null; idempotency_key: string; notes: string | null;
  created_by: string | null; created_at: string;
}

export interface LaborCostEntry {
  id: string; tenant_id: string; labor_fact_id: string; production_order_id: string;
  production_order_operation_id: string; worker_id: string; rate_id: string;
  cost_category_id: string; cost_center_id: string | null; cost_object_id: string | null;
  compensation_type: CompensationType; quantity: number; accepted_quantity: number;
  minutes: number; rate_amount: number; calculated_amount: number;
  cost_classification: LaborCostClassification; is_estimated: boolean; formula_basis: string;
  fact_date: string; created_by: string | null; created_at: string;
}

export interface LaborCostByWorker { worker_id: string; worker_name: string; amount: number; is_estimated: boolean; }
export interface LaborCostByOperation { operation_id: string; operation_name: string; amount: number; is_estimated: boolean; }
export type ProductionOrderLaborCost = LaborVarianceResult;

export interface ProductionAttendanceRow {
  id: string; production_order_id: string; production_order_operation_id: string;
  operation_code: string; operation_name: string; worker_id: string; employee_code: string;
  worker_name: string; worker_type: WorkerType; attendance_method: AttendanceMethod;
  work_date: string; day_units: number | null; work_hours: number | null;
  output_quantity: number | null; rate_amount: number | null; calculated_amount: number | null;
  cost_classification: LaborCostClassification; is_estimated: boolean; notes: string | null;
  created_at: string; cost_visible: boolean; is_reversed?: boolean; reversal_reason?: string | null;
}

export type FactoryAttendanceSource = "FACTORY" | "PRODUCTION_LEGACY";

export interface FactoryAttendanceRow {
  id: string; source_type: FactoryAttendanceSource;
  production_order_id: string | null; production_order_number: string | null;
  production_order_operation_id: string | null; operation_code: string | null; operation_name: string | null;
  worker_id: string; employee_code: string; worker_name: string; worker_type: WorkerType;
  attendance_method: AttendanceMethod; work_date: string; day_units: number | null;
  work_hours: number | null; check_in_time: string | null; check_out_time: string | null;
  break_minutes: number; worked_minutes?: number | null; monthly_salary_snapshot?: number | null; rate_basis?: string | null;
  output_quantity: number | null; activity_name: string | null;
  rate_amount: number | null; calculated_amount: number | null;
  cost_classification: LaborCostClassification; is_estimated: boolean; notes: string | null;
  created_at: string; cost_visible: boolean; is_reversed: boolean; reversal_reason: string | null;
  /** False when the compatibility RPC cannot return stored check-in/check-out fields. */
  time_clock_available?: boolean;
  workflow_status?: AttendanceWorkflowStatus;
  workflow_reason?: string | null;
  workflow_at?: string | null;
  closure_status?: AttendanceClosureStatus;
}

export interface FactoryAttendanceClosureRow {
  worker_id: string;
  work_date: string;
  status: AttendanceClosureStatus;
  reason: string | null;
  created_at: string;
}

export interface FactoryAttendanceDayStatusRow {
  worker_id: string;
  employee_code: string;
  worker_name: string;
  worker_type: WorkerType;
  work_date: string;
  status: FactoryAttendanceDayStatus;
  meal_eligible: boolean;
  reason: string | null;
  created_at: string;
}

export interface FactoryOvertimeRow {
  id: string;
  worker_id: string;
  employee_code: string;
  worker_name: string;
  worker_type: WorkerType;
  work_date: string;
  overtime_type: OvertimeType;
  overtime_minutes: number;
  reason: string;
  status: AttendanceWorkflowStatus;
  created_at: string;
}

/** Local SQL audit trail for attendance, production, overtime and day-close actions. */
export interface FactoryAttendanceHistoryRow {
  id: string;
  entity_type: "ATTENDANCE" | "PRODUCTION_ENTRY" | "OVERTIME" | "DAY_STATUS" | "DAY_CLOSURE" | string;
  entity_id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  actor_id: string | null;
  event_at: string;
  work_date: string | null;
  worker_id: string | null;
  employee_code: string | null;
  worker_name: string | null;
  worker_type: WorkerType | null;
}

export interface ProductionOrderWorkerAssignment {
  id: string; production_order_id: string; production_order_operation_id: string | null;
  worker_id: string; employee_code: string; worker_name: string; worker_type: WorkerType;
  assigned_from: string; assigned_to: string | null; notes: string | null; is_active: boolean;
}

export interface WorkerAttendanceMethod {
  worker_id: string; attendance_method: AttendanceMethod; compensation_type: CompensationType;
}

export interface ProductionEntryProduct {
  /** id is the selected rate id for the local production entry picker. */
  id: string;
  rate_id?: string;
  product_id?: string | null;
  piece_rate_code?: string | null;
  sku: string | null;
  name: string;
  category: string | null;
  price_list_name: string | null;
  mapping_status: "EXCEL_CODE" | "UNIQUE_SKU" | "AMBIGUOUS_SKU" | "MISSING_SKU";
  rate_available: boolean;
  rate_visible: boolean;
  rate: number | null;
  rate_unit: PieceRateUnit | null;
}

export interface ProductionEntryRow {
  id: string; worker_id: string; employee_code: string; worker_name: string; worker_type: WorkerType;
  rate_id?: string | null; product_id: string | null; product_sku: string | null; piece_rate_code?: string | null; product_name: string; work_date: string; quantity: number;
  production_order_operation_id: string | null; production_order_number: string | null;
  rate_unit: PieceRateUnit; rate_amount: number | null; calculated_amount: number | null;
  currency_code: string; workflow_status: AttendanceWorkflowStatus;
  workflow_reason: string | null; workflow_at: string; workflow_actor_id: string | null;
  notes: string | null; created_at: string; cost_visible: boolean;
}

// ── Database type extension for Supabase client typing ──

type Unit = "METER" | "KG" | "PIECE" | "ROLL" | "SET" | "BAG" | "BOX";
type VersionStatus = "DRAFT" | "APPROVED" | "SUPERSEDED";

type ProductionTables = {
  production_order_items: TableDefinition<ProductionOrderItemMetadata & { source_order_item_id: string | null; source_order_item_key: string | null; tenant_id: string }, Partial<ProductionOrderItemMetadata> & { production_order_id: string; product_id: string; planned_quantity: number }>;
  production_batches: TableDefinition<ProductionBatch, Partial<ProductionBatch> & { production_order_id: string; batch_number: string; planned_quantity: number }>;
  production_stage_events: TableDefinition<ProductionStageEvent, Partial<ProductionStageEvent> & { production_order_id: string; stage: ProductionStage; quantity_received: number }>;
  production_fabric_allocations: TableDefinition<ProductionFabricAllocation, Partial<ProductionFabricAllocation> & { production_order_id: string }>;
  production_batch_workflow_events: TableDefinition<{ id: string; event_sequence: number; tenant_id: string; production_batch_id: string; status: ProductionBatch["status"]; reason: string | null; idempotency_key: string; actor_id: string | null; created_at: string }, { production_batch_id: string; status: ProductionBatch["status"]; idempotency_key: string }>;
  production_stage_event_workflow_events: TableDefinition<{ id: string; event_sequence: number; tenant_id: string; production_stage_event_id: string; status: "SUBMITTED" | "APPROVED" | "REJECTED" | "REVERSED"; reason: string | null; idempotency_key: string; actor_id: string | null; created_at: string }, { production_stage_event_id: string; status: "SUBMITTED" | "APPROVED" | "REJECTED" | "REVERSED"; idempotency_key: string }>;
  production_fabric_allocation_events: TableDefinition<{ id: string; event_sequence: number; tenant_id: string; production_fabric_allocation_id: string; action: "ISSUED" | "CONSUMED" | "RETURNED"; quantity: number; reason: string | null; idempotency_key: string; actor_id: string | null; created_at: string }, { production_fabric_allocation_id: string; action: "ISSUED" | "CONSUMED" | "RETURNED"; quantity: number; idempotency_key: string }>;
  payroll_policy_groups: TableDefinition<PayrollPolicyGroup, Partial<PayrollPolicyGroup> & { code: string; name: string }>;
  payroll_team_assignments: TableDefinition<PayrollTeamAssignment, Partial<PayrollTeamAssignment> & { supervisor_worker_id: string; worker_id: string; effective_from: string; reason: string }>;
  worker_compensation_assignments: TableDefinition<WorkerCompensationAssignment, Partial<WorkerCompensationAssignment> & { worker_id: string; compensation_type: CompensationType; payroll_policy_group_id: string; effective_from: string; reason: string }>;
  product_piece_rate_versions: TableDefinition<ProductPieceRateVersion, Partial<ProductPieceRateVersion> & { product_id: string; rate: number; effective_from: string; reason: string }>;
  employee_social_insurance_versions: TableDefinition<SocialInsuranceVersion, Partial<SocialInsuranceVersion> & { worker_id: string; employee_amount: number; effective_from: string; source_reference: string; reason: string }>;
  bank_accounts: TableDefinition<BankAccountVersion, Partial<BankAccountVersion> & { worker_id: string; account_number: string; account_name: string; bank_name: string; effective_from: string; reason: string }>;
  factory_attendance_records: TableDefinition<
    { id: string; tenant_id: string; worker_id: string; rate_id: string; compensation_type: CompensationType; attendance_method: AttendanceMethod; work_date: string; day_units: number; work_hours: number; check_in_time: string | null; check_out_time: string | null; break_minutes: number; output_quantity: number; standard_hours_per_day: number | null; activity_name: string | null; rate_amount: number; calculated_amount: number; cost_classification: LaborCostClassification; is_estimated: boolean; formula_basis: string; idempotency_key: string; notes: string | null; created_by: string | null; created_at: string },
    { id?: string; tenant_id?: string; worker_id: string; rate_id: string; compensation_type: CompensationType; attendance_method: AttendanceMethod; work_date: string; day_units?: number; work_hours?: number; check_in_time?: string | null; check_out_time?: string | null; break_minutes?: number; output_quantity?: number; standard_hours_per_day?: number | null; activity_name?: string | null; rate_amount: number; calculated_amount: number; cost_classification: LaborCostClassification; is_estimated?: boolean; formula_basis: string; idempotency_key: string; notes?: string | null; created_by?: string | null; created_at?: string }
  >;
  factory_attendance_reversals: TableDefinition<
    { id: string; tenant_id: string; attendance_record_id: string; worker_id: string; work_date: string; reversed_amount: number; reason: string; idempotency_key: string; created_by: string | null; created_at: string },
    { id?: string; tenant_id?: string; attendance_record_id: string; worker_id: string; work_date: string; reversed_amount: number; reason: string; idempotency_key: string; created_by?: string | null; created_at?: string }
  >;
  factory_attendance_workflow_events: TableDefinition<
    { id: string; tenant_id: string; attendance_record_id: string; status: AttendanceWorkflowStatus; reason: string | null; idempotency_key: string; actor_id: string | null; created_at: string },
    { id?: string; tenant_id?: string; attendance_record_id: string; status: AttendanceWorkflowStatus; reason?: string | null; idempotency_key: string; actor_id?: string | null; created_at?: string }
  >;
  factory_attendance_daily_closure_events: TableDefinition<
    { id: string; tenant_id: string; worker_id: string; work_date: string; status: Exclude<AttendanceClosureStatus, "OPEN">; reason: string | null; idempotency_key: string; actor_id: string | null; created_at: string },
    { id?: string; tenant_id?: string; worker_id: string; work_date: string; status: Exclude<AttendanceClosureStatus, "OPEN">; reason?: string | null; idempotency_key: string; actor_id?: string | null; created_at?: string }
  >;
  factory_attendance_day_status_events: TableDefinition<
    { id: string; event_sequence: number; tenant_id: string; worker_id: string; work_date: string; status: FactoryAttendanceDayStatus; meal_eligible: boolean; reason: string | null; idempotency_key: string; actor_id: string | null; created_at: string },
    { id?: string; event_sequence?: number; tenant_id?: string; worker_id: string; work_date: string; status: FactoryAttendanceDayStatus; meal_eligible?: boolean; reason?: string | null; idempotency_key: string; actor_id?: string | null; created_at?: string }
  >;
  factory_overtime_records: TableDefinition<
    { id: string; tenant_id: string; worker_id: string; work_date: string; overtime_type: OvertimeType; overtime_minutes: number; reason: string; idempotency_key: string; created_by: string | null; created_at: string },
    { id?: string; tenant_id?: string; worker_id: string; work_date: string; overtime_type: OvertimeType; overtime_minutes: number; reason: string; idempotency_key: string; created_by?: string | null; created_at?: string }
  >;
  factory_overtime_workflow_events: TableDefinition<
    { id: string; tenant_id: string; overtime_record_id: string; status: AttendanceWorkflowStatus; reason: string | null; idempotency_key: string; actor_id: string | null; created_at: string },
    { id?: string; tenant_id?: string; overtime_record_id: string; status: AttendanceWorkflowStatus; reason?: string | null; idempotency_key: string; actor_id?: string | null; created_at?: string }
  >;
  production_entries: TableDefinition<
    { id: string; tenant_id: string; worker_id: string; product_id: string; production_order_operation_id: string | null; work_date: string; quantity: number; product_sku_snapshot: string; product_name_snapshot: string; product_rate_version_id: string; rate_unit_snapshot: PieceRateUnit; rate_amount_snapshot: number; currency_code_snapshot: string; calculated_amount_snapshot: number; formula_basis: string; status: "SUBMITTED" | "APPROVED" | "REJECTED" | "REVERSED"; workflow_reason: string | null; workflow_actor_id: string | null; workflow_at: string; submitted_by: string | null; submitted_at: string; approved_by: string | null; approved_at: string | null; rejected_by: string | null; rejected_at: string | null; reversed_by: string | null; reversed_at: string | null; reversal_reason: string | null; idempotency_key: string; notes: string | null; created_by: string | null; created_at: string },
    { id?: string; tenant_id?: string; worker_id: string; product_id: string; production_order_operation_id?: string | null; work_date: string; quantity: number; product_sku_snapshot: string; product_name_snapshot: string; product_rate_version_id: string; rate_unit_snapshot: PieceRateUnit; rate_amount_snapshot: number; currency_code_snapshot?: string; calculated_amount_snapshot: number; formula_basis?: string; status?: "SUBMITTED" | "APPROVED" | "REJECTED" | "REVERSED"; workflow_reason?: string | null; workflow_actor_id?: string | null; workflow_at?: string; submitted_by?: string | null; submitted_at?: string; approved_by?: string | null; approved_at?: string | null; rejected_by?: string | null; rejected_at?: string | null; reversed_by?: string | null; reversed_at?: string | null; reversal_reason?: string | null; idempotency_key: string; notes?: string | null; created_by?: string | null; created_at?: string }
  >;
  production_entry_workflow_events: TableDefinition<
    { id: string; event_sequence: number; tenant_id: string; production_entry_id: string; status: Exclude<AttendanceWorkflowStatus, "LOCKED">; reason: string | null; idempotency_key: string; actor_id: string | null; created_at: string },
    { id?: string; event_sequence?: number; tenant_id?: string; production_entry_id: string; status: Exclude<AttendanceWorkflowStatus, "LOCKED">; reason?: string | null; idempotency_key: string; actor_id?: string | null; created_at?: string }
  >;
  production_order_worker_assignments: TableDefinition<ProductionOrderWorkerAssignment, Partial<ProductionOrderWorkerAssignment> & { production_order_id: string; worker_id: string; assigned_from: string }>;
  production_attendance_reversals: TableDefinition<{ id: string; tenant_id: string; labor_fact_id: string; labor_cost_entry_id: string | null; production_order_id: string; production_order_operation_id: string; worker_id: string; fact_date: string; reversed_amount: number; reason: string; idempotency_key: string; created_by: string | null; created_at: string }, Partial<{ id: string; tenant_id: string; labor_fact_id: string; labor_cost_entry_id: string | null; production_order_id: string; production_order_operation_id: string; worker_id: string; fact_date: string; reversed_amount: number; reason: string; idempotency_key: string; created_by: string | null; created_at: string }>>;
  worker_compensation_profiles: TableDefinition<WorkerCompensationProfile, Partial<WorkerCompensationProfile> & { worker_id: string; default_compensation_type: CompensationType }>;
  worker_compensation_rates: TableDefinition<WorkerCompensationRate, Partial<WorkerCompensationRate> & { worker_id: string; compensation_type: CompensationType; effective_from: string }>;
  production_operation_labor_facts: TableDefinition<ProductionOperationLaborFact, Partial<ProductionOperationLaborFact> & { production_order_id: string; production_order_operation_id: string; worker_id: string; rate_id: string; compensation_type: CompensationType }>;
  labor_cost_entries: TableDefinition<LaborCostEntry, Partial<LaborCostEntry> & { labor_fact_id: string; production_order_id: string; production_order_operation_id: string; worker_id: string; rate_id: string; cost_category_id: string; compensation_type: CompensationType }>;
  routing_headers: TableDefinition<
    { id: string; tenant_id: string; product_id: string; code: string; name: string; is_active: boolean; created_by: string | null; created_at: string; updated_at: string },
    { id?: string; tenant_id?: string; product_id: string; code: string; name: string; is_active?: boolean; created_by?: string | null; created_at?: string; updated_at?: string }
  >;
  routing_versions: TableDefinition<
    { id: string; tenant_id: string; routing_id: string; version_number: number; status: VersionStatus; effective_from: string | null; effective_to: string | null; notes: string | null; created_by: string | null; approved_by: string | null; approval_reason: string | null; created_at: string; updated_at: string; approved_at: string | null },
    { id?: string; tenant_id?: string; routing_id: string; version_number: number; status?: VersionStatus; effective_from?: string | null; effective_to?: string | null; notes?: string | null; created_by?: string | null; approved_by?: string | null; approval_reason?: string | null; created_at?: string; updated_at?: string; approved_at?: string | null }
  >;
  routing_operations: TableDefinition<
    { id: string; tenant_id: string; routing_version_id: string; operation_code: string; operation_name: string; sequence: number; cost_center_id: string | null; standard_minutes_per_unit: number; setup_minutes: number; machine_type: string | null; labor_skill: string | null; quantity_basis: string; is_optional: boolean; created_at: string; updated_at: string },
    { id?: string; tenant_id?: string; routing_version_id: string; operation_code: string; operation_name: string; sequence: number; cost_center_id?: string | null; standard_minutes_per_unit: number; setup_minutes?: number; machine_type?: string | null; labor_skill?: string | null; quantity_basis?: string; is_optional?: boolean; created_at?: string; updated_at?: string }
  >;
  production_workers: TableDefinition<
    { id: string; tenant_id: string; user_id: string | null; employee_code: string; display_name: string; primary_cost_center_id: string | null; worker_type: string; is_active: boolean; location_code: string | null; position_title: string | null; employment_type: CompensationType | null; employment_start_date: string | null; employment_end_date: string | null; payroll_status: PayrollStatus; created_by: string | null; created_at: string; updated_at: string },
    { id?: string; tenant_id?: string; user_id?: string | null; employee_code: string; display_name: string; primary_cost_center_id?: string | null; worker_type?: string; is_active?: boolean; location_code?: string | null; position_title?: string | null; employment_type?: CompensationType | null; employment_start_date?: string | null; employment_end_date?: string | null; payroll_status?: PayrollStatus; created_by?: string | null; created_at?: string; updated_at?: string }
  >;
  production_orders: TableDefinition<
    { id: string; tenant_id: string; production_order_number: string; production_batch_number: string; qr_token: string; product_id: string; quantity_planned: number; quantity_good: number; quantity_scrap: number; quantity_rework: number; status: ProductionOrderStatus; planned_start_date: string | null; planned_end_date: string | null; actual_start_at: string | null; actual_end_at: string | null; source_type: string; source_id: string | null; order_id: string | null; cost_center_id: string | null; bom_version_id: string | null; routing_version_id: string | null; standard_minutes_total: number; material_issue_tolerance_percent: number; cutting_params_snapshot: Json; created_by: string | null; released_by: string | null; completed_by: string | null; cancelled_by: string | null; created_at: string; updated_at: string; released_at: string | null; completed_at: string | null; cancelled_at: string | null; cancel_reason: string | null },
    { id?: string; tenant_id?: string; production_order_number: string; production_batch_number: string; qr_token?: string; product_id: string; quantity_planned: number; quantity_good?: number; quantity_scrap?: number; quantity_rework?: number; status?: ProductionOrderStatus; planned_start_date?: string | null; planned_end_date?: string | null; actual_start_at?: string | null; actual_end_at?: string | null; source_type?: string; source_id?: string | null; order_id?: string | null; cost_center_id?: string | null; bom_version_id?: string | null; routing_version_id?: string | null; standard_minutes_total?: number; material_issue_tolerance_percent?: number; cutting_params_snapshot?: Json; created_by?: string | null; released_by?: string | null; completed_by?: string | null; cancelled_by?: string | null; created_at?: string; updated_at?: string; released_at?: string | null; completed_at?: string | null; cancelled_at?: string | null; cancel_reason?: string | null }
  >;
  production_order_material_requirements: TableDefinition<
    { id: string; tenant_id: string; production_order_id: string; inventory_item_id: string; bom_line_id: string | null; bom_version_id: string; requirement_method: string; standard_quantity: number; planned_quantity: number; waste_quantity_standard: number; unit: Unit; standard_unit_cost_snapshot: number | null; standard_material_cost_preview: number | null; cutting_profile_version_id: string | null; calculation_details: Json; created_at: string },
    { id?: string; tenant_id?: string; production_order_id: string; inventory_item_id: string; bom_line_id?: string | null; bom_version_id: string; requirement_method: string; standard_quantity: number; planned_quantity: number; waste_quantity_standard?: number; unit: Unit; standard_unit_cost_snapshot?: number | null; standard_material_cost_preview?: number | null; cutting_profile_version_id?: string | null; calculation_details?: Json; created_at?: string }
  >;
  production_order_operations: TableDefinition<
    { id: string; tenant_id: string; production_order_id: string; sequence: number; operation_code: string; operation_name: string; cost_center_id: string | null; standard_setup_minutes: number; standard_run_minutes_per_unit: number; standard_total_minutes: number; status: OperationStatus; quantity_input: number; quantity_good: number; quantity_scrap: number; quantity_rework: number; is_optional: boolean; planned_start: string | null; planned_end: string | null; actual_start: string | null; actual_end: string | null; operation_qr_code: string | null; created_at: string; updated_at: string },
    { id?: string; tenant_id?: string; production_order_id: string; sequence: number; operation_code: string; operation_name: string; cost_center_id?: string | null; standard_setup_minutes?: number; standard_run_minutes_per_unit?: number; standard_total_minutes: number; status?: OperationStatus; quantity_input?: number; quantity_good?: number; quantity_scrap?: number; quantity_rework?: number; is_optional?: boolean; planned_start?: string | null; planned_end?: string | null; actual_start?: string | null; actual_end?: string | null; operation_qr_code?: string | null; created_at?: string; updated_at?: string }
  >;
  production_operation_logs: TableDefinition<
    { id: string; tenant_id: string; production_order_operation_id: string; event_type: string; worker_id: string | null; quantity: number | null; reason_code: string | null; started_at: string | null; ended_at: string | null; duration_minutes: number | null; notes: string | null; created_by: string | null; created_at: string },
    { id?: string; tenant_id?: string; production_order_operation_id: string; event_type: string; worker_id?: string | null; quantity?: number | null; reason_code?: string | null; started_at?: string | null; ended_at?: string | null; duration_minutes?: number | null; notes?: string | null; created_by?: string | null; created_at?: string }
  >;
  production_scrap_records: TableDefinition<
    { id: string; tenant_id: string; production_order_id: string; production_order_operation_id: string | null; quantity: number; reason_code: string; notes: string | null; created_by: string | null; created_at: string },
    { id?: string; tenant_id?: string; production_order_id: string; production_order_operation_id?: string | null; quantity: number; reason_code: string; notes?: string | null; created_by?: string | null; created_at?: string }
  >;
  production_rework_records: TableDefinition<
    { id: string; tenant_id: string; production_order_id: string; from_operation_id: string | null; target_operation_id: string | null; quantity: number; reason_code: string; notes: string | null; created_by: string | null; created_at: string },
    { id?: string; tenant_id?: string; production_order_id: string; from_operation_id?: string | null; target_operation_id?: string | null; quantity: number; reason_code: string; notes?: string | null; created_by?: string | null; created_at?: string }
  >;
  production_outputs: TableDefinition<
    { id: string; tenant_id: string; production_order_id: string; product_id: string; quantity_good: number; quantity_scrap: number; output_date: string; warehouse_id: string | null; inventory_receipt_id: string | null; status: string; valuation_status: string; created_by: string | null; created_at: string },
    { id?: string; tenant_id?: string; production_order_id: string; product_id: string; quantity_good: number; quantity_scrap?: number; output_date?: string; warehouse_id?: string | null; inventory_receipt_id?: string | null; status?: string; valuation_status?: string; created_by?: string | null; created_at?: string }
  >;
};

type ProductionFunctions = {
  has_payroll_permission: { Args: { p_permission?: string }; Returns: boolean };
  list_payroll_capabilities: { Args: Record<string, never>; Returns: PayrollCapability[] };
  replace_employee_permissions: { Args: { p_user_id: string; p_permissions: Json; p_reason?: string }; Returns: Json };
  create_payroll_team_assignment: { Args: { p_supervisor_worker_id: string; p_worker_id: string; p_effective_from: string; p_effective_to?: string | null; p_reason?: string | null }; Returns: Json };
  retire_payroll_team_assignment: { Args: { p_assignment_id: string; p_effective_to: string; p_reason: string }; Returns: Json };
  list_payroll_team_assignments: { Args: { p_supervisor_worker_id?: string | null; p_worker_id?: string | null; p_on_date?: string | null }; Returns: PayrollTeamAssignment[] };
  upsert_payroll_policy_group: { Args: { p_code: string; p_name: string; p_description?: string | null; p_is_active?: boolean; p_reason?: string | null }; Returns: Json };
  list_payroll_policy_groups: { Args: Record<string, never>; Returns: PayrollPolicyGroup[] };
  update_payroll_worker_master: { Args: { p_worker_id: string; p_location_code?: string | null; p_position_title?: string | null; p_employment_type?: CompensationType | null; p_employment_start_date?: string | null; p_employment_end_date?: string | null; p_payroll_status?: PayrollStatus; p_reason?: string | null }; Returns: Json };
  list_payroll_workers: { Args: { p_include_inactive?: boolean }; Returns: PayrollWorker[] };
  create_worker_compensation_assignment: { Args: { p_worker_id: string; p_compensation_type: CompensationType; p_payroll_policy_group_id: string; p_effective_from: string; p_effective_to?: string | null; p_reason?: string | null }; Returns: Json };
  approve_worker_compensation_assignment: { Args: { p_assignment_id: string; p_reason: string; p_supersede_previous?: boolean }; Returns: Json };
  update_worker_compensation_assignment_draft: { Args: { p_assignment_id: string; p_compensation_type: CompensationType; p_payroll_policy_group_id: string; p_effective_from: string; p_effective_to?: string | null; p_reason?: string | null }; Returns: Json };
  discard_worker_compensation_assignment_draft: { Args: { p_assignment_id: string; p_reason: string }; Returns: Json };
  list_worker_compensation_assignments: { Args: { p_worker_id?: string | null }; Returns: WorkerCompensationAssignment[] };
  resolve_worker_compensation_assignment: { Args: { p_worker_id: string; p_effective_date: string }; Returns: WorkerCompensationAssignment };
  list_payroll_products: { Args: { p_search?: string | null }; Returns: PayrollProduct[] };
  list_payroll_products_v2: { Args: { p_search?: string | null }; Returns: PayrollProduct[] };
  create_product_piece_rate_draft: { Args: { p_product_id: string; p_rate: number; p_effective_from: string; p_effective_to?: string | null; p_unit?: PieceRateUnit; p_reason?: string | null; p_source_reference?: string | null }; Returns: Json };
  approve_product_piece_rate: { Args: { p_rate_version_id: string; p_reason: string; p_supersede_previous?: boolean }; Returns: Json };
  update_product_piece_rate_draft: { Args: { p_rate_version_id: string; p_rate: number; p_effective_from: string; p_effective_to?: string | null; p_unit?: PieceRateUnit; p_source_reference?: string | null; p_reason?: string | null }; Returns: Json };
  discard_product_piece_rate_draft: { Args: { p_rate_version_id: string; p_reason: string }; Returns: Json };
  list_product_piece_rates: { Args: { p_product_id?: string | null }; Returns: ProductPieceRateVersion[] };
  resolve_product_piece_rate: { Args: { p_product_id: string; p_work_date: string }; Returns: ProductPieceRateVersion };
  create_social_insurance_draft: { Args: { p_worker_id: string; p_employee_amount: number; p_effective_from: string; p_effective_to?: string | null; p_source_reference?: string | null; p_reason?: string | null }; Returns: Json };
  approve_social_insurance_version: { Args: { p_version_id: string; p_reason: string; p_supersede_previous?: boolean }; Returns: Json };
  update_social_insurance_draft: { Args: { p_version_id: string; p_employee_amount: number; p_effective_from: string; p_effective_to?: string | null; p_source_reference?: string | null; p_reason?: string | null }; Returns: Json };
  discard_social_insurance_draft: { Args: { p_version_id: string; p_reason: string }; Returns: Json };
  list_social_insurance_versions: { Args: { p_worker_id?: string | null }; Returns: SocialInsuranceVersion[] };
  resolve_social_insurance_version: { Args: { p_worker_id: string; p_effective_date: string }; Returns: SocialInsuranceVersion };
  create_bank_account_draft: { Args: { p_worker_id: string; p_account_number: string; p_account_name: string; p_bank_name: string; p_bank_code?: string | null; p_is_primary?: boolean; p_effective_from?: string; p_effective_to?: string | null; p_source_reference?: string | null; p_reason?: string | null }; Returns: Json };
  verify_bank_account: { Args: { p_bank_account_id: string; p_reason: string; p_supersede_previous?: boolean }; Returns: Json };
  update_bank_account_draft: { Args: { p_bank_account_id: string; p_account_number: string; p_account_name: string; p_bank_name: string; p_bank_code?: string | null; p_is_primary?: boolean; p_effective_from?: string; p_effective_to?: string | null; p_source_reference?: string | null; p_reason?: string | null }; Returns: Json };
  discard_bank_account_draft: { Args: { p_bank_account_id: string; p_reason: string }; Returns: Json };
  list_worker_bank_accounts: { Args: { p_worker_id?: string | null }; Returns: PayrollBankAccount[] };
  resolve_worker_compensation_rate: { Args: { p_worker_id: string; p_compensation_type: string; p_fact_date: string }; Returns: WorkerCompensationRate };
  list_worker_compensation_rates: { Args: { p_worker_id?: string | null }; Returns: WorkerCompensationRate[] };
  upsert_worker_compensation_profile: { Args: { p_worker_id: string; p_compensation_type: string; p_monthly_productive_minutes?: number | null }; Returns: Json };
  create_worker_compensation_rate: { Args: { p_worker_id: string; p_compensation_type: string; p_effective_from: string; p_effective_to?: string | null; p_hourly_rate?: number | null; p_piece_rate?: number | null; p_monthly_rate?: number | null; p_monthly_productive_minutes?: number | null; p_reason?: string | null; p_is_estimated?: boolean }; Returns: Json };
  create_worker_payroll_rate_draft: { Args: { p_worker_id: string; p_compensation_type: CompensationType; p_effective_from: string; p_effective_to?: string | null; p_hourly_rate?: number | null; p_piece_rate?: number | null; p_monthly_rate?: number | null; p_monthly_productive_minutes?: number | null; p_source_reference?: string | null; p_reason: string; p_is_estimated?: boolean }; Returns: Json };
  update_worker_payroll_rate_draft: { Args: { p_rate_id: string; p_effective_from: string; p_effective_to?: string | null; p_hourly_rate?: number | null; p_piece_rate?: number | null; p_monthly_rate?: number | null; p_monthly_productive_minutes?: number | null; p_source_reference?: string | null; p_reason: string; p_is_estimated?: boolean }; Returns: Json };
  approve_worker_payroll_rate: { Args: { p_rate_id: string; p_reason: string; p_supersede_previous?: boolean }; Returns: Json };
  discard_worker_payroll_rate_draft: { Args: { p_rate_id: string; p_reason: string }; Returns: Json };
  configure_worker_attendance_method: { Args: { p_worker_id: string; p_attendance_method: AttendanceMethod; p_rate_amount: number; p_effective_from: string; p_effective_to?: string | null; p_standard_days_per_month?: number; p_standard_hours_per_day?: number; p_reason?: string | null; p_is_estimated?: boolean }; Returns: Json };
  record_production_labor_fact: { Args: { p_production_order_operation_id: string; p_worker_id: string; p_quantity?: number; p_accepted_quantity?: number; p_minutes?: number; p_fact_date?: string; p_compensation_type?: string | null; p_idempotency_key?: string | null; p_source_log_id?: string | null; p_notes?: string | null }; Returns: Json };
  record_production_attendance: { Args: { p_production_order_operation_id: string; p_worker_id: string; p_attendance_method: AttendanceMethod; p_work_date?: string; p_day_units?: number | null; p_work_hours?: number | null; p_output_quantity?: number | null; p_standard_hours_per_day?: number; p_idempotency_key?: string | null; p_notes?: string | null }; Returns: Json };
  record_factory_attendance: { Args: { p_worker_id: string; p_attendance_method: AttendanceMethod; p_work_date?: string; p_day_units?: number | null; p_work_hours?: number | null; p_output_quantity?: number | null; p_standard_hours_per_day?: number; p_activity_name?: string | null; p_idempotency_key?: string | null; p_notes?: string | null }; Returns: Json };
  record_factory_hour_attendance: { Args: { p_worker_id: string; p_work_date: string; p_check_in_time: string; p_check_out_time: string; p_break_minutes?: number; p_activity_name?: string | null; p_idempotency_key?: string | null; p_notes?: string | null }; Returns: Json };
  list_factory_attendance_workers: { Args: Record<string, never>; Returns: ProductionWorker[] };
  list_factory_attendance_month: { Args: { p_month_start: string; p_include_reversed?: boolean }; Returns: FactoryAttendanceRow[] };
  list_factory_attendance_month_v2: { Args: { p_month_start: string; p_include_reversed?: boolean }; Returns: FactoryAttendanceRow[] };
  list_factory_attendance_month_v3: { Args: { p_month_start: string; p_include_reversed?: boolean }; Returns: FactoryAttendanceRow[] };
  reverse_factory_attendance: { Args: { p_attendance_record_id: string; p_reason: string; p_idempotency_key: string }; Returns: Json };
  set_factory_attendance_status: { Args: { p_attendance_record_id: string; p_target_status: string; p_reason?: string | null; p_idempotency_key?: string | null }; Returns: Json };
  set_factory_attendance_day_closure: { Args: { p_worker_id: string; p_work_date: string; p_target_status: string; p_reason?: string | null; p_idempotency_key?: string | null }; Returns: Json };
  list_factory_attendance_closures: { Args: { p_month_start: string }; Returns: FactoryAttendanceClosureRow[] };
  set_factory_attendance_day_status: { Args: { p_worker_id: string; p_work_date: string; p_status: FactoryAttendanceDayStatus; p_meal_eligible?: boolean; p_reason?: string | null; p_idempotency_key?: string | null }; Returns: Json };
  list_factory_attendance_day_status_month: { Args: { p_month_start: string }; Returns: FactoryAttendanceDayStatusRow[] };
  list_production_entry_products: { Args: { p_work_date?: string; p_search?: string | null }; Returns: ProductionEntryProduct[] };
  record_production_entry: { Args: { p_worker_id: string; p_product_id: string; p_work_date: string; p_quantity: number; p_production_order_operation_id?: string | null; p_idempotency_key?: string | null; p_notes?: string | null }; Returns: Json };
  set_production_entry_status: { Args: { p_production_entry_id: string; p_target_status: string; p_reason?: string | null; p_idempotency_key?: string | null }; Returns: Json };
  reverse_production_entry: { Args: { p_production_entry_id: string; p_reason: string; p_idempotency_key: string }; Returns: Json };
  list_production_entries_month: { Args: { p_month_start: string; p_include_reversed?: boolean }; Returns: ProductionEntryRow[] };
  record_factory_overtime: { Args: { p_worker_id: string; p_work_date: string; p_overtime_type: OvertimeType; p_overtime_minutes: number; p_reason: string; p_idempotency_key: string }; Returns: Json };
  set_factory_overtime_status: { Args: { p_overtime_record_id: string; p_target_status: string; p_reason?: string | null; p_idempotency_key?: string | null }; Returns: Json };
  list_factory_overtime_month: { Args: { p_month_start: string }; Returns: FactoryOvertimeRow[] };
  list_production_attendance: { Args: { p_production_order_id: string }; Returns: ProductionAttendanceRow[] };
  list_production_attendance_month: { Args: { p_production_order_id: string; p_month_start: string; p_include_reversed?: boolean }; Returns: ProductionAttendanceRow[] };
  list_worker_attendance_methods: { Args: Record<string, never>; Returns: WorkerAttendanceMethod[] };
  list_production_order_worker_assignments: { Args: { p_production_order_id: string }; Returns: ProductionOrderWorkerAssignment[] };
  assign_production_order_worker: { Args: { p_production_order_id: string; p_worker_id: string; p_production_order_operation_id?: string | null; p_assigned_from?: string; p_assigned_to?: string | null; p_notes?: string | null }; Returns: ProductionOrderWorkerAssignment };
  end_production_order_worker_assignment: { Args: { p_assignment_id: string; p_assigned_to?: string; p_reason?: string | null }; Returns: ProductionOrderWorkerAssignment };
  set_production_order_assignment_enforcement: { Args: { p_production_order_id: string; p_enforced: boolean; p_reason?: string | null }; Returns: ProductionOrder };
  reverse_production_attendance: { Args: { p_labor_fact_id: string; p_reason: string; p_idempotency_key: string }; Returns: Json };
  calculate_production_order_labor_cost: { Args: { p_production_order_id: string }; Returns: Json };
  resolve_effective_routing_version: { Args: { p_product_id: string; p_effective_date?: string }; Returns: string | null };
  create_routing_draft: { Args: { p_product_id: string; p_code: string; p_name: string; p_clone_version_id?: string | null }; Returns: Json };
  save_routing_draft: { Args: { p_version_id: string; p_effective_from: string | null; p_effective_to: string | null; p_notes: string | null; p_operations: Json }; Returns: Json };
  approve_routing_version: { Args: { p_version_id: string; p_reason?: string | null; p_supersede_previous?: boolean }; Returns: Json };
  create_production_worker: { Args: { p_employee_code: string; p_display_name: string; p_worker_type?: string; p_user_id?: string | null; p_primary_cost_center_id?: string | null }; Returns: Json };
  create_production_order: { Args: { p_product_id: string; p_quantity: number; p_source_type?: string; p_order_id?: string | null; p_planned_start_date?: string | null; p_planned_end_date?: string | null; p_cost_center_id?: string | null; p_material_issue_tolerance_percent?: number }; Returns: Json };
  release_production_order: { Args: { p_production_order_id: string; p_effective_date?: string }; Returns: Json };
  transition_production_order_status: { Args: { p_production_order_id: string; p_target_status: string; p_reason?: string | null }; Returns: Json };
  start_production_operation: { Args: { p_operation_id: string; p_worker_id?: string | null }; Returns: Json };
  complete_production_operation: { Args: { p_operation_id: string; p_quantity_good?: number | null; p_quantity_scrap?: number; p_quantity_rework?: number; p_worker_id?: string | null }; Returns: Json };
  log_production_operation: { Args: { p_operation_id: string; p_event_type: string; p_worker_id?: string | null; p_quantity?: number | null; p_reason_code?: string | null; p_started_at?: string | null; p_ended_at?: string | null; p_notes?: string | null }; Returns: Json };
  record_production_scrap: { Args: { p_production_order_id: string; p_quantity: number; p_reason_code: string; p_operation_id?: string | null; p_notes?: string | null }; Returns: Json };
  record_production_rework: { Args: { p_production_order_id: string; p_quantity: number; p_reason_code: string; p_from_operation_id?: string | null; p_target_operation_id?: string | null; p_notes?: string | null }; Returns: Json };
  complete_production_order: { Args: { p_production_order_id: string; p_quantity_good: number; p_quantity_scrap?: number; p_warehouse_id?: string | null }; Returns: Json };
  get_production_order_variance: { Args: { p_production_order_id: string }; Returns: Json };
  get_production_labor_variance: { Args: { p_production_order_id: string }; Returns: Json };
  set_production_batch_status: { Args: { p_production_batch_id: string; p_target_status: string; p_reason?: string | null; p_idempotency_key?: string | null }; Returns: Json };
  record_production_stage_event: { Args: { p_payload: Json; p_idempotency_key: string }; Returns: Json };
  set_production_stage_event_status: { Args: { p_production_stage_event_id: string; p_target_status: string; p_reason?: string | null; p_idempotency_key?: string | null }; Returns: Json };
  reverse_production_stage_event: { Args: { p_production_stage_event_id: string; p_reason: string; p_idempotency_key: string }; Returns: Json };
  issue_production_fabric: { Args: { p_production_order_id: string; p_production_batch_id: string; p_fabric_variant_id: string; p_warehouse_id: string; p_quantity: number; p_usage_date?: string | null; p_notes?: string | null; p_idempotency_key: string }; Returns: Json };
  update_production_fabric_allocation: { Args: { p_production_fabric_allocation_id: string; p_action: string; p_quantity: number; p_reason?: string | null; p_idempotency_key: string }; Returns: Json };
  list_production_fabric_stock: { Args: { p_fabric_variant_id?: string | null }; Returns: ProductionFabricStock[] };
};

type ExistingPublic = BomManagementDatabase["public"];

export type ProductionManagementDatabase = Omit<BomManagementDatabase, "public"> & {
  public: Omit<ExistingPublic, "Tables" | "Functions"> & {
    Tables: ExistingPublic["Tables"] & ProductionTables;
    Functions: ExistingPublic["Functions"] & ProductionFunctions;
  };
};
