import type { Json } from "./types";
import type { InventoryManagementDatabase } from "./inventory-management-types";

type TableDefinition<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type VersionStatus = "DRAFT" | "APPROVED" | "SUPERSEDED";
type InventoryUnit = "METER" | "KG" | "PIECE" | "ROLL" | "SET" | "BAG" | "BOX";

type BomTables = {
  product_manufacturing_profiles: TableDefinition<
    { id: string; tenant_id: string; product_id: string; manufacturing_type: string; finished_width: number | null; finished_length: number | null; finished_height: number | null; dimension_unit: "MM" | "CM" | "METER"; extra_dimensions: Json; default_bom_id: string | null; default_cutting_profile_id: string | null; is_active: boolean; created_by: string | null; updated_by: string | null; created_at: string; updated_at: string },
    { id?: string; tenant_id?: string; product_id: string; manufacturing_type: string; finished_width?: number | null; finished_length?: number | null; finished_height?: number | null; dimension_unit?: "MM" | "CM" | "METER"; extra_dimensions?: Json; default_bom_id?: string | null; default_cutting_profile_id?: string | null; is_active?: boolean; created_by?: string | null; updated_by?: string | null; created_at?: string; updated_at?: string }
  >;
  bom_headers: TableDefinition<
    { id: string; tenant_id: string; product_id: string; code: string; name: string; is_active: boolean; created_by: string | null; created_at: string; updated_at: string },
    { id?: string; tenant_id?: string; product_id: string; code: string; name: string; is_active?: boolean; created_by?: string | null; created_at?: string; updated_at?: string }
  >;
  bom_versions: TableDefinition<
    { id: string; tenant_id: string; bom_id: string; version_number: number; status: VersionStatus; effective_from: string | null; effective_to: string | null; notes: string | null; created_by: string | null; approved_by: string | null; approval_reason: string | null; created_at: string; updated_at: string; approved_at: string | null },
    { id?: string; tenant_id?: string; bom_id: string; version_number: number; status?: VersionStatus; effective_from?: string | null; effective_to?: string | null; notes?: string | null; created_by?: string | null; approved_by?: string | null; approval_reason?: string | null; created_at?: string; updated_at?: string; approved_at?: string | null }
  >;
  bom_lines: TableDefinition<
    { id: string; tenant_id: string; bom_version_id: string; inventory_item_id: string; line_type: string; quantity_method: "FIXED" | "PER_UNIT" | "FORMULA" | "CUTTING_ENGINE"; standard_quantity: number | null; unit: InventoryUnit; waste_rate: number; scrap_rate: number; formula_type: "PER_BATCH" | null; formula_parameters: Json; cutting_profile_id: string | null; sequence: number; notes: string | null; created_at: string; updated_at: string },
    { id?: string; tenant_id?: string; bom_version_id: string; inventory_item_id: string; line_type?: string; quantity_method: "FIXED" | "PER_UNIT" | "FORMULA" | "CUTTING_ENGINE"; standard_quantity?: number | null; unit: InventoryUnit; waste_rate?: number; scrap_rate?: number; formula_type?: "PER_BATCH" | null; formula_parameters?: Json; cutting_profile_id?: string | null; sequence: number; notes?: string | null; created_at?: string; updated_at?: string }
  >;
  cutting_profiles: TableDefinition<
    { id: string; tenant_id: string; product_id: string; code: string; name: string; manufacturing_type: string; is_active: boolean; created_by: string | null; created_at: string; updated_at: string },
    { id?: string; tenant_id?: string; product_id: string; code: string; name: string; manufacturing_type: string; is_active?: boolean; created_by?: string | null; created_at?: string; updated_at?: string }
  >;
  cutting_profile_versions: TableDefinition<
    { id: string; tenant_id: string; cutting_profile_id: string; version_number: number; status: VersionStatus; effective_from: string | null; effective_to: string | null; piece_width_rule: string; piece_length_rule: string; piece_width_parameter_cm: number | null; piece_length_parameter_cm: number | null; pieces_per_product: number; default_fabric_width_cm: number | null; pattern_direction: string; allow_rotation: boolean; requires_matching_pattern: boolean; pattern_repeat_cm: number | null; seam_allowance_cm: number; hem_allowance_cm: number; tuck_depth_cm: number; flap_allowance_cm: number; joining_allowed: boolean; joining_rule: string; joining_allowance_cm: number; standard_waste_rate: number; issue_rounding_increment: number; calculation_strategy: string; engine_version: string; notes: string | null; created_by: string | null; approved_by: string | null; approval_reason: string | null; created_at: string; updated_at: string; approved_at: string | null },
    { id?: string; tenant_id?: string; cutting_profile_id: string; version_number: number; status?: VersionStatus; effective_from?: string | null; effective_to?: string | null; piece_width_rule?: string; piece_length_rule?: string; piece_width_parameter_cm?: number | null; piece_length_parameter_cm?: number | null; pieces_per_product?: number; default_fabric_width_cm?: number | null; pattern_direction?: string; allow_rotation?: boolean; requires_matching_pattern?: boolean; pattern_repeat_cm?: number | null; seam_allowance_cm?: number; hem_allowance_cm?: number; tuck_depth_cm?: number; flap_allowance_cm?: number; joining_allowed?: boolean; joining_rule?: string; joining_allowance_cm?: number; standard_waste_rate?: number; issue_rounding_increment?: number; calculation_strategy?: string; engine_version?: string; notes?: string | null; created_by?: string | null; approved_by?: string | null; approval_reason?: string | null; created_at?: string; updated_at?: string; approved_at?: string | null }
  >;
  material_requirement_calculations: TableDefinition<
    { id: string; tenant_id: string; product_id: string; bom_version_id: string; quantity: number; effective_date: string; warehouse_id: string | null; calculation_engine_version: string; input_snapshot: Json; output_snapshot: Json; created_by: string | null; created_at: string },
    { id?: string; tenant_id?: string; product_id: string; bom_version_id: string; quantity: number; effective_date: string; warehouse_id?: string | null; calculation_engine_version: string; input_snapshot: Json; output_snapshot: Json; created_by?: string | null; created_at?: string }
  >;
};

type BomFunctions = {
  save_product_manufacturing_profile: { Args: { p_product_id: string; p_manufacturing_type: string; p_finished_width: number; p_finished_length: number; p_finished_height?: number | null; p_dimension_unit?: string; p_extra_dimensions?: Json; p_is_active?: boolean }; Returns: Json };
  create_bom_draft: { Args: { p_product_id: string; p_code: string; p_name: string; p_clone_version_id?: string | null }; Returns: Json };
  save_bom_draft: { Args: { p_version_id: string; p_effective_from: string | null; p_effective_to: string | null; p_notes: string | null; p_lines: Json }; Returns: Json };
  approve_bom_version: { Args: { p_version_id: string; p_reason?: string | null; p_supersede_previous?: boolean }; Returns: Json };
  create_cutting_profile_draft: { Args: { p_product_id: string; p_code: string; p_name: string; p_manufacturing_type: string; p_clone_version_id?: string | null }; Returns: Json };
  save_cutting_profile_draft: { Args: { p_version_id: string; p_effective_from: string | null; p_effective_to: string | null; p_configuration: Json }; Returns: Json };
  approve_cutting_profile_version: { Args: { p_version_id: string; p_reason?: string | null; p_supersede_previous?: boolean }; Returns: Json };
  resolve_effective_bom_version: { Args: { p_product_id: string; p_effective_date?: string }; Returns: string | null };
  resolve_effective_cutting_profile_version: { Args: { p_cutting_profile_id: string; p_effective_date?: string }; Returns: string | null };
  calculate_cutting_consumption: { Args: { p_cutting_profile_version_id: string; p_quantity: number; p_fabric_width_cm?: number | null; p_allow_draft?: boolean }; Returns: Json };
  calculate_standard_material_requirements: { Args: { p_product_id: string; p_quantity: number; p_effective_date?: string; p_bom_version_id?: string | null; p_allow_draft?: boolean; p_warehouse_id?: string | null; p_save_snapshot?: boolean }; Returns: Json };
};

type ExistingPublic = InventoryManagementDatabase["public"];

export type BomManagementDatabase = Omit<InventoryManagementDatabase, "public"> & {
  public: Omit<ExistingPublic, "Tables" | "Functions"> & {
    Tables: ExistingPublic["Tables"] & BomTables;
    Functions: ExistingPublic["Functions"] & BomFunctions;
  };
};
