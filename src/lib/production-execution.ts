import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  RoutingHeader, RoutingVersion, RoutingOperation, RoutingOperationInput,
  ProductionOrder, ProductionWorker, ProductionOrderMaterialRequirement,
  ProductionOrderOperation, ProductionOperationLog, ProductionOutput,
  MaterialVarianceResult, LaborVarianceResult,
} from "@/integrations/supabase/production-execution-types";

function asObject<T>(v: Json, label: string): T {
  if (!v || Array.isArray(v) || typeof v !== "object") throw new Error(`${label} không hợp lệ.`);
  return v as unknown as T;
}

// ── Routing ──
export async function listRoutingWorkspace(productId: string) {
  const { data: header, error: he } = await supabase.from("routing_headers").select("*").eq("product_id", productId).eq("is_active", true).maybeSingle();
  if (he) throw he;
  if (!header) return { header: null as RoutingHeader | null, versions: [] as RoutingVersion[] };
  const { data: versions, error } = await supabase.from("routing_versions").select("*").eq("routing_id", (header as RoutingHeader).id).order("version_number", { ascending: false });
  if (error) throw error;
  return { header: header as RoutingHeader, versions: (versions ?? []) as RoutingVersion[] };
}
export async function listRoutingOperations(versionId: string): Promise<RoutingOperation[]> {
  const { data, error } = await supabase.from("routing_operations").select("*").eq("routing_version_id", versionId).order("sequence");
  if (error) throw error;
  return (data ?? []) as RoutingOperation[];
}
export async function createRoutingDraft(productId: string, code: string, name: string, cloneVersionId?: string | null) {
  const { data, error } = await supabase.rpc("create_routing_draft", { p_product_id: productId, p_code: code, p_name: name, p_clone_version_id: cloneVersionId ?? null });
  if (error) throw error;
  return asObject<{ header: RoutingHeader; version: RoutingVersion }>(data, "Routing");
}
export async function saveRoutingDraft(versionId: string, input: { effective_from: string | null; effective_to: string | null; notes: string | null; operations: RoutingOperationInput[] }) {
  const { data, error } = await supabase.rpc("save_routing_draft", { p_version_id: versionId, p_effective_from: input.effective_from, p_effective_to: input.effective_to, p_notes: input.notes, p_operations: input.operations as unknown as Json });
  if (error) throw error;
  return asObject<{ id: string; status: string; operation_count: number }>(data, "Routing nháp");
}
export async function approveRoutingVersion(versionId: string, reason: string) {
  const { data, error } = await supabase.rpc("approve_routing_version", { p_version_id: versionId, p_reason: reason || null, p_supersede_previous: true });
  if (error) throw error;
  return asObject<RoutingVersion>(data, "Routing đã duyệt");
}

// ── Workers ──
export async function listProductionWorkers(): Promise<ProductionWorker[]> {
  const { data, error } = await supabase.from("production_workers").select("*").order("employee_code");
  if (error) throw error;
  return (data ?? []) as ProductionWorker[];
}
export async function createProductionWorker(input: { employee_code: string; display_name: string; worker_type?: string; user_id?: string | null; primary_cost_center_id?: string | null }) {
  const { data, error } = await supabase.rpc("create_production_worker", { p_employee_code: input.employee_code, p_display_name: input.display_name, p_worker_type: input.worker_type ?? "GENERIC", p_user_id: input.user_id ?? null, p_primary_cost_center_id: input.primary_cost_center_id ?? null });
  if (error) throw error;
  return asObject<ProductionWorker>(data, "Công nhân");
}

// ── Production Orders ──
export async function listProductionOrders(filters?: { status?: string; product_id?: string; order_id?: string }): Promise<ProductionOrder[]> {
  let q = supabase.from("production_orders").select("*").order("created_at", { ascending: false }).limit(200);
  if (filters?.status) q = q.eq("status", filters.status as unknown as never);
  if (filters?.product_id) q = q.eq("product_id", filters.product_id);
  if (filters?.order_id) q = q.eq("order_id", filters.order_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ProductionOrder[];
}
export async function getProductionOrder(id: string): Promise<ProductionOrder> {
  const { data, error } = await supabase.from("production_orders").select("*").eq("id", id).single();
  if (error) throw error;
  return data as ProductionOrder;
}
export async function createProductionOrder(input: { product_id: string; quantity: number; source_type?: string; order_id?: string | null; planned_start_date?: string | null; planned_end_date?: string | null; cost_center_id?: string | null }) {
  const { data, error } = await supabase.rpc("create_production_order", {
    p_product_id: input.product_id, p_quantity: input.quantity,
    p_source_type: input.source_type ?? "MANUAL", p_order_id: input.order_id ?? null,
    p_planned_start_date: input.planned_start_date ?? null, p_planned_end_date: input.planned_end_date ?? null,
    p_cost_center_id: input.cost_center_id ?? null,
  });
  if (error) throw error;
  return asObject<ProductionOrder>(data, "Lệnh sản xuất");
}
export async function releaseProductionOrder(id: string, effectiveDate?: string) {
  const { data, error } = await supabase.rpc("release_production_order", { p_production_order_id: id, p_effective_date: effectiveDate ?? null });
  if (error) throw error;
  return asObject<ProductionOrder & { material_count: number; operation_count: number; reused: boolean }>(data, "Phát hành");
}
export async function completeProductionOrder(id: string, quantityGood: number, quantityScrap = 0, warehouseId?: string | null) {
  const { data, error } = await supabase.rpc("complete_production_order", { p_production_order_id: id, p_quantity_good: quantityGood, p_quantity_scrap: quantityScrap, p_warehouse_id: warehouseId ?? null });
  if (error) throw error;
  return asObject<{ id: string; status: string; output: ProductionOutput; reused: boolean }>(data, "Hoàn thành");
}
export async function transitionProductionOrder(id: string, targetStatus: string, reason?: string) {
  const { data, error } = await supabase.rpc("transition_production_order_status", { p_production_order_id: id, p_target_status: targetStatus, p_reason: reason ?? null });
  if (error) throw error;
  return asObject<ProductionOrder>(data, "Chuyển trạng thái");
}

// ── Snapshots / operations / logs / variance ──
export async function listProductionMaterialRequirements(poId: string): Promise<ProductionOrderMaterialRequirement[]> {
  const { data, error } = await supabase.from("production_order_material_requirements").select("*").eq("production_order_id", poId).order("created_at");
  if (error) throw error;
  return (data ?? []) as ProductionOrderMaterialRequirement[];
}
export async function listProductionOperations(poId: string): Promise<ProductionOrderOperation[]> {
  const { data, error } = await supabase.from("production_order_operations").select("*").eq("production_order_id", poId).order("sequence");
  if (error) throw error;
  return (data ?? []) as ProductionOrderOperation[];
}
export async function listOperationLogs(operationId: string): Promise<ProductionOperationLog[]> {
  const { data, error } = await supabase.from("production_operation_logs").select("*").eq("production_order_operation_id", operationId).order("created_at");
  if (error) throw error;
  return (data ?? []) as ProductionOperationLog[];
}
export async function startProductionOperation(opId: string, workerId?: string | null) {
  const { data, error } = await supabase.rpc("start_production_operation", { p_operation_id: opId, p_worker_id: workerId ?? null });
  if (error) throw error;
  return asObject<ProductionOrderOperation>(data, "Công đoạn");
}
export async function completeProductionOperation(opId: string, quantityGood?: number | null, quantityScrap = 0, quantityRework = 0, workerId?: string | null) {
  const { data, error } = await supabase.rpc("complete_production_operation", { p_operation_id: opId, p_quantity_good: quantityGood ?? null, p_quantity_scrap: quantityScrap, p_quantity_rework: quantityRework, p_worker_id: workerId ?? null });
  if (error) throw error;
  return asObject<ProductionOrderOperation>(data, "Công đoạn");
}
export async function logProductionOperation(opId: string, eventType: string, opts?: { worker_id?: string | null; quantity?: number | null; reason_code?: string | null; started_at?: string | null; ended_at?: string | null; notes?: string | null }) {
  const { data, error } = await supabase.rpc("log_production_operation", {
    p_operation_id: opId, p_event_type: eventType, p_worker_id: opts?.worker_id ?? null,
    p_quantity: opts?.quantity ?? null, p_reason_code: opts?.reason_code ?? null,
    p_started_at: opts?.started_at ?? null, p_ended_at: opts?.ended_at ?? null, p_notes: opts?.notes ?? null,
  });
  if (error) throw error;
  return asObject<ProductionOperationLog>(data, "Log");
}
export async function getMaterialVariance(poId: string): Promise<MaterialVarianceResult> {
  const { data, error } = await supabase.rpc("get_production_order_variance", { p_production_order_id: poId });
  if (error) throw error;
  return asObject<MaterialVarianceResult>(data, "Variance vật tư");
}
export async function getLaborVariance(poId: string): Promise<LaborVarianceResult> {
  const { data, error } = await supabase.rpc("get_production_labor_variance", { p_production_order_id: poId });
  if (error) throw error;
  return asObject<LaborVarianceResult>(data, "Variance nhân công");
}
export async function getProductionOutputs(poId: string): Promise<ProductionOutput[]> {
  const { data, error } = await supabase.from("production_outputs").select("*").eq("production_order_id", poId);
  if (error) throw error;
  return (data ?? []) as ProductionOutput[];
}
export async function recordScrap(poId: string, quantity: number, reasonCode: string, operationId?: string | null) {
  const { data, error } = await supabase.rpc("record_production_scrap", { p_production_order_id: poId, p_quantity: quantity, p_reason_code: reasonCode, p_operation_id: operationId ?? null });
  if (error) throw error;
  return data;
}
export async function recordRework(poId: string, quantity: number, reasonCode: string, fromOp?: string | null, targetOp?: string | null) {
  const { data, error } = await supabase.rpc("record_production_rework", { p_production_order_id: poId, p_quantity: quantity, p_reason_code: reasonCode, p_from_operation_id: fromOp ?? null, p_target_operation_id: targetOp ?? null });
  if (error) throw error;
  return data;
}
