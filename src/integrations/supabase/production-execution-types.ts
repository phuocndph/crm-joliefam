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
  cancel_reason: string | null;
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
  created_by: string | null; created_at: string; updated_at: string;
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
}

// ── Database type extension for Supabase client typing ──

type Unit = "METER" | "KG" | "PIECE" | "ROLL" | "SET" | "BAG" | "BOX";
type VersionStatus = "DRAFT" | "APPROVED" | "SUPERSEDED";

type ProductionTables = {
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
    { id: string; tenant_id: string; user_id: string | null; employee_code: string; display_name: string; primary_cost_center_id: string | null; worker_type: string; is_active: boolean; created_by: string | null; created_at: string; updated_at: string },
    { id?: string; tenant_id?: string; user_id?: string | null; employee_code: string; display_name: string; primary_cost_center_id?: string | null; worker_type?: string; is_active?: boolean; created_by?: string | null; created_at?: string; updated_at?: string }
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
};

type ExistingPublic = BomManagementDatabase["public"];

export type ProductionManagementDatabase = Omit<BomManagementDatabase, "public"> & {
  public: Omit<ExistingPublic, "Tables" | "Functions"> & {
    Tables: ExistingPublic["Tables"] & ProductionTables;
    Functions: ExistingPublic["Functions"] & ProductionFunctions;
  };
};

