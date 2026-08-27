import type { Json } from "./types";
import type { CostManagementDatabase } from "./cost-management-types";

type TableDefinition<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type InventoryItemType = "RAW_MATERIAL" | "SUPPLY" | "SEMI_FINISHED" | "FINISHED_GOOD" | "PACKAGING" | "OTHER";
type InventoryUnit = "METER" | "KG" | "PIECE" | "ROLL" | "SET" | "BAG" | "BOX";
type InventoryDocumentType = "RECEIPT" | "ISSUE" | "RETURN_IN" | "RETURN_OUT" | "TRANSFER" | "ADJUSTMENT" | "OPENING_BALANCE";
type InventoryDocumentStatus = "DRAFT" | "CONFIRMED" | "VOIDED";

type InventoryTables = {
  inventory_items: TableDefinition<
    {
      id: string; tenant_id: string; manager_id: string | null; code: string; name: string;
      item_type: InventoryItemType; base_unit: InventoryUnit; category: string | null; is_active: boolean;
      legacy_source_type: "FABRIC_VARIANT" | null; legacy_source_id: string | null;
      created_at: string; updated_at: string;
    },
    {
      id?: string; tenant_id?: string; manager_id?: string | null; code: string; name: string;
      item_type: InventoryItemType; base_unit: InventoryUnit; category?: string | null; is_active?: boolean;
      legacy_source_type?: "FABRIC_VARIANT" | null; legacy_source_id?: string | null;
      created_at?: string; updated_at?: string;
    }
  >;
  warehouse_locations: TableDefinition<
    {
      id: string; tenant_id: string; manager_id: string | null; warehouse_id: string; code: string;
      name: string; parent_id: string | null; is_active: boolean; created_at: string; updated_at: string;
    },
    {
      id?: string; tenant_id?: string; manager_id?: string | null; warehouse_id: string; code: string;
      name: string; parent_id?: string | null; is_active?: boolean; created_at?: string; updated_at?: string;
    }
  >;
  inventory_documents: TableDefinition<
    {
      id: string; tenant_id: string; manager_id: string | null; document_number: string;
      document_type: InventoryDocumentType; status: InventoryDocumentStatus; transaction_at: string;
      warehouse_id: string | null; to_warehouse_id: string | null; business_transaction_id: string | null;
      description: string; counterparty_name_snapshot: string | null; external_reference: string | null;
      reason: string | null; idempotency_key: string; subtotal: number; vat_amount: number; total_amount: number;
      created_by: string | null; confirmed_by: string | null; voided_by: string | null;
      created_at: string; updated_at: string; confirmed_at: string | null; voided_at: string | null; void_reason: string | null;
    },
    {
      id?: string; tenant_id?: string; manager_id?: string | null; document_number?: string;
      document_type: InventoryDocumentType; status?: InventoryDocumentStatus; transaction_at?: string;
      warehouse_id?: string | null; to_warehouse_id?: string | null; business_transaction_id?: string | null;
      description: string; counterparty_name_snapshot?: string | null; external_reference?: string | null;
      reason?: string | null; idempotency_key: string; subtotal?: number; vat_amount?: number; total_amount?: number;
      created_by?: string | null; confirmed_by?: string | null; voided_by?: string | null;
      created_at?: string; updated_at?: string; confirmed_at?: string | null; voided_at?: string | null; void_reason?: string | null;
    }
  >;
  inventory_document_lines: TableDefinition<
    {
      id: string; tenant_id: string; document_id: string; line_number: number; inventory_item_id: string;
      location_id: string | null; to_location_id: string | null; description: string | null; quantity: number;
      unit: InventoryUnit; input_unit_cost: number | null; vat_rate: number; input_subtotal: number;
      vat_amount: number; input_total: number; posted_unit_cost: number | null; posted_total_cost: number | null;
      adjustment_direction: "INCREASE" | "DECREASE" | null; source_movement_id: string | null;
      cost_center_id: string | null; cost_object_id: string | null; created_at: string; updated_at: string;
    },
    {
      id?: string; tenant_id?: string; document_id: string; line_number: number; inventory_item_id: string;
      location_id?: string | null; to_location_id?: string | null; description?: string | null; quantity: number;
      unit: InventoryUnit; input_unit_cost?: number | null; vat_rate?: number; input_subtotal?: number;
      vat_amount?: number; input_total?: number; posted_unit_cost?: number | null; posted_total_cost?: number | null;
      adjustment_direction?: "INCREASE" | "DECREASE" | null; source_movement_id?: string | null;
      cost_center_id?: string | null; cost_object_id?: string | null; created_at?: string; updated_at?: string;
    }
  >;
  inventory_movements: TableDefinition<
    {
      id: string; movement_sequence: number; tenant_id: string; document_id: string; document_line_id: string;
      inventory_item_id: string; warehouse_id: string; location_id: string | null; movement_kind: string;
      quantity_delta: number; unit: InventoryUnit; unit_cost: number; value_delta: number; running_quantity: number;
      running_average_cost: number; running_inventory_value: number; transaction_at: string;
      source_type: string | null; source_id: string | null; source_movement_id: string | null;
      created_by: string | null; created_at: string;
    },
    Record<string, never>
  >;
  inventory_balances: TableDefinition<
    {
      id: string; tenant_id: string; inventory_item_id: string; warehouse_id: string; location_id: string | null;
      quantity_on_hand: number; average_unit_cost: number; inventory_value: number;
      last_movement_at: string | null; last_movement_sequence: number | null; updated_at: string;
    },
    Record<string, never>
  >;
};

type InventoryFunctions = {
  create_inventory_document: {
    Args: {
      p_document_type: string; p_transaction_at: string; p_warehouse_id: string; p_to_warehouse_id: string | null;
      p_description: string; p_idempotency_key: string; p_lines: Json; p_business_transaction_id?: string | null;
      p_counterparty_name?: string | null; p_external_reference?: string | null; p_reason?: string | null;
      p_production_order_id?: string | null;
    };
    Returns: Json;
  };
  confirm_inventory_document: { Args: { p_document_id: string }; Returns: Json };
  void_inventory_document: { Args: { p_document_id: string; p_reason: string }; Returns: Json };
  list_production_orders_for_issue: { Args: Record<string, never>; Returns: Array<{ id: string; production_order_number: string; product_id: string; product_name: string | null; status: string; quantity_planned: number }> };
  list_inventory_warehouses: { Args: Record<string, never>; Returns: Array<{ id: string; name: string; address: string | null; warehouse_type: string }> };
  list_inventory_business_transactions: { Args: { p_document_type: string }; Returns: Array<{
    id: string; transaction_number: string; transaction_date: string; description: string;
    counterparty_name: string | null; total_amount: number | null;
  }> };
  get_inventory_dashboard_summary: { Args: Record<string, never>; Returns: Array<{
    active_item_count: number; stocked_balance_count: number; draft_document_count: number;
    warehouse_count: number; total_inventory_value: number | null;
  }> };
  list_inventory_return_sources: { Args: Record<string, never>; Returns: Array<{
    id: string; document_number: string; inventory_item_id: string; warehouse_id: string; location_id: string | null;
    movement_kind: string; original_quantity: number; returned_quantity: number; remaining_quantity: number;
    unit: string; transaction_at: string;
  }> };
  list_inventory_balances: { Args: Record<string, never>; Returns: Array<{
    id: string; inventory_item_id: string; item_code: string; item_name: string; item_type: string;
    warehouse_id: string; warehouse_name: string; location_id: string | null; location_name: string | null;
    quantity_on_hand: number; unit: string; average_unit_cost: number | null; inventory_value: number | null;
    last_movement_at: string | null;
  }> };
  list_inventory_documents: { Args: { p_limit?: number }; Returns: Array<{
    id: string; document_number: string; document_type: string; status: string; transaction_at: string;
    warehouse_id: string | null; warehouse_name: string | null; to_warehouse_id: string | null; to_warehouse_name: string | null;
    description: string; counterparty_name: string | null; external_reference: string | null;
    subtotal: number | null; vat_amount: number | null; total_amount: number | null; created_by: string | null;
    confirmed_at: string | null; voided_at: string | null; void_reason: string | null;
    production_order_id: string | null; production_order_number: string | null;
  }> };
  list_inventory_movements: { Args: { p_inventory_item_id?: string | null; p_limit?: number }; Returns: Array<{
    id: string; movement_sequence: number; document_id: string; document_number: string; inventory_item_id: string;
    item_code: string; item_name: string; warehouse_id: string; warehouse_name: string; movement_kind: string;
    quantity_delta: number; unit: string; unit_cost: number | null; value_delta: number | null;
    running_quantity: number; running_average_cost: number | null; running_inventory_value: number | null;
    transaction_at: string; created_by: string | null; source_movement_id: string | null;
  }> };
  list_inventory_audit_events: { Args: { p_limit?: number }; Returns: Array<{
    id: string; entity_type: string; entity_id: string; action: string; actor_id: string | null; reason: string | null; created_at: string;
  }> };
  reconcile_inventory_balances: { Args: Record<string, never>; Returns: Array<{
    inventory_item_id: string; warehouse_id: string; location_id: string | null; ledger_quantity: number;
    balance_quantity: number; quantity_difference: number; ledger_value: number; balance_value: number; value_difference: number;
  }> };
};

type ExistingPublic = CostManagementDatabase["public"];

export type InventoryManagementDatabase = Omit<CostManagementDatabase, "public"> & {
  public: Omit<ExistingPublic, "Tables" | "Functions"> & {
    Tables: ExistingPublic["Tables"] & InventoryTables;
    Functions: ExistingPublic["Functions"] & InventoryFunctions;
  };
};
