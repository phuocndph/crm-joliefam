import type { Json, Database } from "./types";

type TableDefinition<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type CostBehavior = "FIXED" | "VARIABLE" | "MIXED";
type Traceability = "DIRECT" | "INDIRECT" | "SHARED";
type TransactionStatus = "DRAFT" | "CONFIRMED" | "VOIDED";

type CostTables = {
  cost_categories: TableDefinition<
    { id: string; tenant_id: string; code: string; name: string; description: string | null; parent_id: string | null; level: number; is_active: boolean; default_behavior: CostBehavior; default_traceability: Traceability; created_at: string; updated_at: string },
    { id?: string; tenant_id?: string; code: string; name: string; description?: string | null; parent_id?: string | null; level?: number; is_active?: boolean; default_behavior?: CostBehavior; default_traceability?: Traceability; created_at?: string; updated_at?: string }
  >;
  cost_centers: TableDefinition<
    { id: string; tenant_id: string; code: string; name: string; parent_id: string | null; center_type: string; manager_user_id: string | null; manager_id: string | null; is_active: boolean; created_at: string; updated_at: string },
    { id?: string; tenant_id?: string; code: string; name: string; parent_id?: string | null; center_type?: string; manager_user_id?: string | null; manager_id?: string | null; is_active?: boolean; created_at?: string; updated_at?: string }
  >;
  cost_objects: TableDefinition<
    { id: string; tenant_id: string; object_type: string; source_id: string | null; display_code: string; display_name: string | null; status: string; is_active: boolean; created_at: string; updated_at: string },
    { id?: string; tenant_id?: string; object_type: string; source_id?: string | null; display_code: string; display_name?: string | null; status?: string; is_active?: boolean; created_at?: string; updated_at?: string }
  >;
  transaction_types: TableDefinition<
    { id: string; tenant_id: string; code: string; name: string; description: string | null; is_system: boolean; is_active: boolean; has_cash_impact: boolean; has_inventory_impact: boolean; can_create_cost: boolean; can_create_asset: boolean; default_effect_kind: string; default_direction: string; requires_counterparty: boolean; requires_cost_center: boolean; requires_cost_object: boolean; default_cost_category_id: string | null; default_cost_center_id: string | null; default_cost_behavior: CostBehavior | null; default_traceability: Traceability | null; created_at: string; updated_at: string },
    { id?: string; tenant_id?: string; code: string; name: string; description?: string | null; is_system?: boolean; is_active?: boolean; has_cash_impact?: boolean; has_inventory_impact?: boolean; can_create_cost?: boolean; can_create_asset?: boolean; default_effect_kind?: string; default_direction?: string; requires_counterparty?: boolean; requires_cost_center?: boolean; requires_cost_object?: boolean; default_cost_category_id?: string | null; default_cost_center_id?: string | null; default_cost_behavior?: CostBehavior | null; default_traceability?: Traceability | null; created_at?: string; updated_at?: string }
  >;
  business_transactions: TableDefinition<
    { id: string; tenant_id: string; manager_id: string | null; transaction_number: string; transaction_type_id: string; transaction_date: string; description: string; status: TransactionStatus; counterparty_type: string | null; counterparty_id: string | null; counterparty_name_snapshot: string | null; currency_code: string; subtotal: number; vat_amount: number; total_amount: number; payment_status: string | null; source_type: string | null; source_id: string | null; external_reference: string | null; idempotency_key: string; created_by: string | null; confirmed_by: string | null; voided_by: string | null; created_at: string; updated_at: string; confirmed_at: string | null; voided_at: string | null; void_reason: string | null },
    { id?: string; tenant_id?: string; manager_id?: string | null; transaction_number?: string; transaction_type_id: string; transaction_date?: string; description: string; status?: TransactionStatus; counterparty_type?: string | null; counterparty_id?: string | null; counterparty_name_snapshot?: string | null; currency_code?: string; subtotal?: number; vat_amount?: number; total_amount?: number; payment_status?: string | null; source_type?: string | null; source_id?: string | null; external_reference?: string | null; idempotency_key: string; created_by?: string | null; confirmed_by?: string | null; voided_by?: string | null; created_at?: string; updated_at?: string; confirmed_at?: string | null; voided_at?: string | null; void_reason?: string | null }
  >;
  business_transaction_lines: TableDefinition<
    { id: string; tenant_id: string; business_transaction_id: string; line_number: number; description: string; quantity: number; unit: string; unit_price: number; subtotal: number; vat_rate: number; vat_amount: number; total_amount: number; effect_kind: string; direction: string; cost_category_id: string | null; cost_center_id: string | null; cost_object_id: string | null; cost_behavior: CostBehavior | null; traceability: Traceability | null; classification_snapshot: Json; created_at: string },
    { id?: string; tenant_id?: string; business_transaction_id: string; line_number: number; description: string; quantity?: number; unit?: string; unit_price?: number; subtotal?: number; vat_rate?: number; vat_amount?: number; total_amount?: number; effect_kind?: string; direction?: string; cost_category_id?: string | null; cost_center_id?: string | null; cost_object_id?: string | null; cost_behavior?: CostBehavior | null; traceability?: Traceability | null; classification_snapshot?: Json; created_at?: string }
  >;
  business_transaction_links: TableDefinition<
    { id: string; tenant_id: string; business_transaction_id: string; link_type: string; linked_id: string; metadata: Json; created_by: string | null; created_at: string },
    { id?: string; tenant_id?: string; business_transaction_id: string; link_type: string; linked_id: string; metadata?: Json; created_by?: string | null; created_at?: string }
  >;
  audit_events: TableDefinition<
    { id: string; tenant_id: string; entity_type: string; entity_id: string; action: string; before_data: Json | null; after_data: Json | null; actor_id: string | null; reason: string | null; source: string; request_id: string | null; created_at: string },
    { id?: string; tenant_id?: string; entity_type: string; entity_id: string; action: string; before_data?: Json | null; after_data?: Json | null; actor_id?: string | null; reason?: string | null; source?: string; request_id?: string | null; created_at?: string }
  >;
  idempotency_keys: TableDefinition<
    { id: string; tenant_id: string; operation_type: string; business_key: string; payload_hash: string; actor_id: string | null; status: string; result_entity_id: string | null; first_seen_at: string; completed_at: string | null },
    { id?: string; tenant_id?: string; operation_type: string; business_key: string; payload_hash: string; actor_id?: string | null; status?: string; result_entity_id?: string | null; first_seen_at?: string; completed_at?: string | null }
  >;
};

type CostFunctions = {
  create_business_transaction: {
    Args: { p_transaction_type_id: string; p_transaction_date: string; p_description: string; p_idempotency_key: string; p_lines: Json; p_links?: Json; p_counterparty_type?: string; p_counterparty_id?: string; p_counterparty_name?: string; p_external_reference?: string };
    Returns: Json;
  };
  confirm_business_transaction: { Args: { p_transaction_id: string }; Returns: Json };
  void_business_transaction: { Args: { p_transaction_id: string; p_reason: string }; Returns: Json };
};

type ExistingPublic = Database["public"];

export type CostManagementDatabase = Omit<Database, "public"> & {
  public: Omit<ExistingPublic, "Tables" | "Functions"> & {
    Tables: ExistingPublic["Tables"] & CostTables;
    Functions: ExistingPublic["Functions"] & CostFunctions;
  };
};

