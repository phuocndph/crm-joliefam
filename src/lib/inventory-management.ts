import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { isLocalBackend } from "@/lib/runtime-config";
import { localApi } from "@/lib/local-api";

export type InventoryItemType = "RAW_MATERIAL" | "SUPPLY" | "SEMI_FINISHED" | "FINISHED_GOOD" | "PACKAGING" | "OTHER";
export type InventoryUnit = "METER" | "KG" | "PIECE" | "ROLL" | "SET" | "BAG" | "BOX";
export type InventoryDocumentType = "RECEIPT" | "ISSUE" | "RETURN_IN" | "RETURN_OUT" | "TRANSFER" | "ADJUSTMENT" | "OPENING_BALANCE";
export type InventoryDocumentStatus = "DRAFT" | "CONFIRMED" | "VOIDED";

export interface InventoryItem {
  id: string;
  tenant_id: string;
  manager_id: string | null;
  code: string;
  name: string;
  item_type: InventoryItemType;
  base_unit: InventoryUnit;
  category: string | null;
  is_active: boolean;
  legacy_source_type: "FABRIC_VARIANT" | null;
  legacy_source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryWarehouse { id: string; name: string; address: string | null; warehouse_type: string; code?: string | null; is_active?: boolean }
export interface InventoryBusinessTransaction {
  id: string; transaction_number: string; transaction_date: string; description: string;
  counterparty_name: string | null; total_amount: number | null;
}
export interface InventoryDashboardSummary {
  active_item_count: number; stocked_balance_count: number; draft_document_count: number;
  warehouse_count: number; total_inventory_value: number | null;
}
export interface InventoryBalance {
  id: string; inventory_item_id: string; item_code: string; item_name: string; item_type: string;
  warehouse_id: string; warehouse_name: string; location_id: string | null; location_name: string | null;
  quantity_on_hand: number; unit: InventoryUnit; average_unit_cost: number | null; inventory_value: number | null;
  last_movement_at: string | null;
}
export interface InventoryDocument {
  id: string; document_number: string; document_type: InventoryDocumentType; status: InventoryDocumentStatus;
  transaction_at: string; warehouse_id: string | null; warehouse_name: string | null; to_warehouse_id: string | null;
  to_warehouse_name: string | null; description: string; counterparty_name: string | null; external_reference: string | null;
  subtotal: number | null; vat_amount: number | null; total_amount: number | null; created_by: string | null;
  confirmed_at: string | null; voided_at: string | null; void_reason: string | null;
  production_order_id: string | null; production_order_number: string | null; cutting_estimate_id?: string | null;
}
export interface ProductionOrderForIssue {
  id: string; production_order_number: string; product_id: string; product_name: string | null; status: string; quantity_planned: number;
}
export interface InventoryMovement {
  id: string; movement_sequence: number; document_id: string; document_number: string; inventory_item_id: string;
  item_code: string; item_name: string; warehouse_id: string; warehouse_name: string; movement_kind: string;
  quantity_delta: number; unit: InventoryUnit; unit_cost: number | null; value_delta: number | null;
  running_quantity: number; running_average_cost: number | null; running_inventory_value: number | null;
  transaction_at: string; created_by: string | null; source_movement_id: string | null;
}
export interface InventoryReturnSource {
  id: string; document_number: string; inventory_item_id: string; warehouse_id: string; location_id: string | null;
  movement_kind: string; original_quantity: number; returned_quantity: number; remaining_quantity: number;
  unit: InventoryUnit; transaction_at: string;
}
export interface InventoryReconciliation {
  inventory_item_id: string; warehouse_id: string; location_id: string | null; ledger_quantity: number;
  balance_quantity: number; quantity_difference: number; ledger_value: number; balance_value: number; value_difference: number;
}
export interface InventoryAuditEvent {
  id: string; entity_type: string; entity_id: string; action: string; actor_id: string | null;
  reason: string | null; created_at: string;
}
export interface InventoryDocumentLineInput {
  inventory_item_id: string; quantity: number; unit: InventoryUnit; description?: string | null;
  input_unit_cost?: number | null; vat_rate?: number; adjustment_direction?: "INCREASE" | "DECREASE" | null;
  source_movement_id?: string | null; location_id?: string | null; to_location_id?: string | null;
  cost_center_id?: string | null; cost_object_id?: string | null;
}

export type InventoryDocumentResult = { id: string; document_number: string; status: InventoryDocumentStatus; reused?: boolean };

function parseDocumentResult(value: Json): InventoryDocumentResult {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("Phản hồi phiếu kho từ máy chủ không hợp lệ.");
  const { id, document_number: documentNumber, status, reused } = value;
  if (typeof id !== "string" || typeof documentNumber !== "string" || !["DRAFT", "CONFIRMED", "VOIDED"].includes(String(status))) {
    throw new Error("Phản hồi phiếu kho từ máy chủ không đầy đủ.");
  }
  return { id, document_number: documentNumber, status: status as InventoryDocumentStatus, reused: reused === true };
}

export async function listInventoryItems(): Promise<InventoryItem[]> {
  if (isLocalBackend()) return localApi.inventoryItems();
  const { data, error } = await supabase.from("inventory_items").select("*").order("code");
  if (error) throw error;
  return data ?? [];
}

export async function createInventoryItem(input: Pick<InventoryItem, "code" | "name" | "item_type" | "base_unit" | "category">) {
  if (isLocalBackend()) return localApi.createInventoryItem(input);
  const { data, error } = await supabase.from("inventory_items").insert({ ...input, tenant_id: "default" }).select().single();
  if (error) throw error;
  return data;
}

export async function updateInventoryItem(id: string, input: Pick<InventoryItem, "name" | "item_type" | "base_unit" | "category">) {
  if (isLocalBackend()) return localApi.updateInventoryItem(id, input);
  const { data, error } = await supabase.from("inventory_items").update(input).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function setInventoryItemActive(id: string, isActive: boolean) {
  if (isLocalBackend()) { await localApi.setInventoryItemActive(id, isActive); return; }
  const { error } = await supabase.from("inventory_items").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
}

export async function listInventoryWarehouses(): Promise<InventoryWarehouse[]> {
  if (isLocalBackend()) return localApi.inventoryWarehouses();
  const { data, error } = await supabase.rpc("list_inventory_warehouses", {});
  if (error) throw error;
  return data ?? [];
}

export async function listInventoryBusinessTransactions(documentType: InventoryDocumentType): Promise<InventoryBusinessTransaction[]> {
  if (isLocalBackend()) return localApi.inventoryBusinessTransactions(documentType);
  const { data, error } = await supabase.rpc("list_inventory_business_transactions", { p_document_type: documentType });
  if (error) throw error;
  return data ?? [];
}

export async function getInventoryDashboardSummary(): Promise<InventoryDashboardSummary> {
  if (isLocalBackend()) {
    const rows = await localApi.inventorySummary();
    if (!rows[0]) throw new Error("Không nhận được số liệu tổng hợp kho.");
    return rows[0] as unknown as InventoryDashboardSummary;
  }
  const { data, error } = await supabase.rpc("get_inventory_dashboard_summary", {});
  if (error) throw error;
  const summary = data?.[0];
  if (!summary) throw new Error("Không nhận được số liệu tổng hợp kho.");
  return summary;
}

export async function listInventoryBalances(): Promise<InventoryBalance[]> {
  if (isLocalBackend()) return localApi.inventoryBalances();
  const { data, error } = await supabase.rpc("list_inventory_balances", {});
  if (error) throw error;
  return (data ?? []) as InventoryBalance[];
}

export async function listInventoryDocuments(limit = 500): Promise<InventoryDocument[]> {
  if (isLocalBackend()) return localApi.inventoryDocuments(limit);
  const { data, error } = await supabase.rpc("list_inventory_documents", { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as InventoryDocument[];
}

export async function listInventoryMovements(itemId?: string | null, limit = 1000): Promise<InventoryMovement[]> {
  if (isLocalBackend()) return localApi.inventoryMovements(itemId, limit);
  const { data, error } = await supabase.rpc("list_inventory_movements", { p_inventory_item_id: itemId ?? null, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as InventoryMovement[];
}

export async function listInventoryReturnSources(): Promise<InventoryReturnSource[]> {
  if (isLocalBackend()) return localApi.inventoryReturnSources();
  const { data, error } = await supabase.rpc("list_inventory_return_sources", {});
  if (error) throw error;
  return (data ?? []) as InventoryReturnSource[];
}

export async function reconcileInventoryBalances(): Promise<InventoryReconciliation[]> {
  if (isLocalBackend()) return localApi.inventoryReconciliation();
  const { data, error } = await supabase.rpc("reconcile_inventory_balances", {});
  if (error) throw error;
  return data ?? [];
}

export async function listInventoryAuditEvents(): Promise<InventoryAuditEvent[]> {
  if (isLocalBackend()) return localApi.inventoryAudit();
  const { data, error } = await supabase.rpc("list_inventory_audit_events", { p_limit: 300 });
  if (error) throw error;
  return data ?? [];
}

export async function createInventoryDocument(input: {
  document_type: InventoryDocumentType; transaction_at: string; warehouse_id: string; to_warehouse_id?: string | null;
  description: string; idempotency_key: string; lines: InventoryDocumentLineInput[]; business_transaction_id?: string | null;
  counterparty_name?: string | null; external_reference?: string | null; reason?: string | null; production_order_id?: string | null;
}) {
  if (isLocalBackend()) return parseDocumentResult(await localApi.createInventoryDocument(input) as unknown as Json);
  const { data, error } = await supabase.rpc("create_inventory_document", {
    p_document_type: input.document_type,
    p_transaction_at: input.transaction_at,
    p_warehouse_id: input.warehouse_id,
    p_to_warehouse_id: input.to_warehouse_id ?? null,
    p_description: input.description,
    p_idempotency_key: input.idempotency_key,
    p_lines: input.lines as unknown as Json,
    p_business_transaction_id: input.business_transaction_id ?? null,
    p_counterparty_name: input.counterparty_name ?? null,
    p_external_reference: input.external_reference ?? null,
    p_reason: input.reason ?? null,
    p_production_order_id: input.production_order_id ?? null,
  });
  if (error) throw error;
  return parseDocumentResult(data);
}

export async function confirmInventoryDocument(id: string) {
  if (isLocalBackend()) return parseDocumentResult(await localApi.confirmInventoryDocument(id) as unknown as Json);
  const { data, error } = await supabase.rpc("confirm_inventory_document", { p_document_id: id });
  if (error) throw error;
  return parseDocumentResult(data);
}

export async function voidInventoryDocument(id: string, reason: string) {
  if (isLocalBackend()) return parseDocumentResult(await localApi.voidInventoryDocument(id, reason) as unknown as Json);
  const { data, error } = await supabase.rpc("void_inventory_document", { p_document_id: id, p_reason: reason });
  if (error) throw error;
  return parseDocumentResult(data);
}

export async function listProductionOrdersForIssue(): Promise<ProductionOrderForIssue[]> {
  if (isLocalBackend()) return localApi.inventoryProductionOrders();
  const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: Error | null }>)("list_production_orders_for_issue");
  if (error) throw error;
  return (data ?? []) as ProductionOrderForIssue[];
}
