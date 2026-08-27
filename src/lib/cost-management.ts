import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type CostBehavior = "FIXED" | "VARIABLE" | "MIXED";
export type Traceability = "DIRECT" | "INDIRECT" | "SHARED";
export type BusinessTransactionStatus = "DRAFT" | "CONFIRMED" | "VOIDED";

export interface CostCategory {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  level: number;
  is_active: boolean;
  default_behavior: CostBehavior;
  default_traceability: Traceability;
  created_at: string;
  updated_at: string;
}

export interface CostCenter {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  parent_id: string | null;
  center_type: string;
  manager_user_id: string | null;
  manager_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CostObject {
  id: string;
  tenant_id: string;
  object_type: string;
  source_id: string | null;
  display_code: string;
  display_name: string | null;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransactionType {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  requires_counterparty: boolean;
  requires_cost_center: boolean;
  requires_cost_object: boolean;
  default_cost_category_id: string | null;
  default_cost_center_id: string | null;
  default_cost_behavior: CostBehavior | null;
  default_traceability: Traceability | null;
}

export interface BusinessTransaction {
  id: string;
  tenant_id: string;
  manager_id: string | null;
  transaction_number: string;
  transaction_type_id: string;
  transaction_date: string;
  description: string;
  status: BusinessTransactionStatus;
  counterparty_name_snapshot: string | null;
  currency_code: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  idempotency_key: string;
  created_by: string | null;
  confirmed_by: string | null;
  voided_by: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

export interface BusinessTransactionSummary extends BusinessTransaction {
  cost_center_ids: string[];
  cost_object_ids: string[];
}

export interface CostUser {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export interface AuditEvent {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface BusinessTransactionLineInput {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  cost_category_id?: string | null;
  cost_center_id?: string | null;
  cost_object_id?: string | null;
  cost_behavior?: CostBehavior | null;
  traceability?: Traceability | null;
  classification_snapshot?: Record<string, unknown>;
}

export interface BusinessTransactionLinkInput {
  link_type: string;
  linked_id: string;
  metadata?: Record<string, unknown>;
}

type RpcTransactionResult = {
  id: string;
  transaction_number: string;
  status: BusinessTransactionStatus;
  reused?: boolean;
};

function parseTransactionResult(value: Json): RpcTransactionResult {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error("Phản hồi giao dịch từ máy chủ không hợp lệ.");
  }
  const id = value.id;
  const transactionNumber = value.transaction_number;
  const status = value.status;
  if (typeof id !== "string" || typeof transactionNumber !== "string" || !["DRAFT", "CONFIRMED", "VOIDED"].includes(String(status))) {
    throw new Error("Phản hồi giao dịch từ máy chủ không đầy đủ.");
  }
  return {
    id,
    transaction_number: transactionNumber,
    status: status as BusinessTransactionStatus,
    reused: value.reused === true,
  };
}

export async function listCostCategories(): Promise<CostCategory[]> {
  const { data, error } = await supabase.from("cost_categories").select("*").order("code");
  if (error) throw error;
  return data ?? [];
}

export async function listCostCenters(): Promise<CostCenter[]> {
  const { data, error } = await supabase.from("cost_centers").select("*").order("code");
  if (error) throw error;
  return data ?? [];
}

export async function listCostObjects(): Promise<CostObject[]> {
  const { data, error } = await supabase.from("cost_objects").select("*").order("display_code");
  if (error) throw error;
  return data ?? [];
}

export async function listTransactionTypes(): Promise<TransactionType[]> {
  const { data, error } = await supabase.from("transaction_types").select("*").order("code");
  if (error) throw error;
  return data ?? [];
}

export async function listBusinessTransactions(): Promise<BusinessTransactionSummary[]> {
  const { data: transactions, error } = await supabase
    .from("business_transactions")
    .select("*")
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  if (!transactions?.length) return [];

  const { data: lines, error: lineError } = await supabase
    .from("business_transaction_lines")
    .select("business_transaction_id, cost_center_id, cost_object_id")
    .in("business_transaction_id", transactions.map((item) => item.id));
  if (lineError) throw lineError;

  const classifications = new Map<string, { centers: Set<string>; objects: Set<string> }>();
  for (const line of lines ?? []) {
    const current = classifications.get(line.business_transaction_id) ?? { centers: new Set<string>(), objects: new Set<string>() };
    if (line.cost_center_id) current.centers.add(line.cost_center_id);
    if (line.cost_object_id) current.objects.add(line.cost_object_id);
    classifications.set(line.business_transaction_id, current);
  }

  return transactions.map((item) => ({
    ...item,
    cost_center_ids: [...(classifications.get(item.id)?.centers ?? [])],
    cost_object_ids: [...(classifications.get(item.id)?.objects ?? [])],
  }));
}

export async function listCostUsers(): Promise<CostUser[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, email, first_name, last_name")
    .order("first_name");
  if (error) throw error;
  return data ?? [];
}

export async function listCostAuditEvents(): Promise<AuditEvent[]> {
  const { data, error } = await supabase
    .from("audit_events")
    .select("id, entity_type, entity_id, action, actor_id, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data ?? [];
}

export async function createCostCategory(input: Pick<CostCategory, "code" | "name" | "description" | "parent_id" | "default_behavior" | "default_traceability">) {
  const { data, error } = await supabase.from("cost_categories").insert({ ...input, tenant_id: "default" }).select().single();
  if (error) throw error;
  return data;
}

export async function updateCostCategory(id: string, input: Pick<CostCategory, "name" | "description" | "parent_id" | "default_behavior" | "default_traceability">) {
  const { data, error } = await supabase.from("cost_categories").update(input).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function createCostCenter(input: Pick<CostCenter, "code" | "name" | "center_type" | "parent_id">) {
  const { data, error } = await supabase.from("cost_centers").insert({ ...input, tenant_id: "default" }).select().single();
  if (error) throw error;
  return data;
}

export async function updateCostCenter(id: string, input: Pick<CostCenter, "name" | "center_type" | "parent_id">) {
  const { data, error } = await supabase.from("cost_centers").update(input).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function createCostObject(input: Pick<CostObject, "object_type" | "display_code" | "display_name">) {
  const { data, error } = await supabase.from("cost_objects").insert({ ...input, tenant_id: "default" }).select().single();
  if (error) throw error;
  return data;
}

export async function setMasterActive(table: "cost_categories" | "cost_centers" | "cost_objects", id: string, isActive: boolean) {
  const operation = table === "cost_categories"
    ? supabase.from("cost_categories").update({ is_active: isActive }).eq("id", id)
    : table === "cost_centers"
      ? supabase.from("cost_centers").update({ is_active: isActive }).eq("id", id)
      : supabase.from("cost_objects").update({ is_active: isActive }).eq("id", id);
  const { error } = await operation;
  if (error) throw error;
}

export async function createBusinessTransaction(input: {
  transaction_type_id: string;
  transaction_date: string;
  description: string;
  idempotency_key: string;
  counterparty_type?: string;
  counterparty_id?: string;
  counterparty_name?: string;
  external_reference?: string;
  lines: BusinessTransactionLineInput[];
  links?: BusinessTransactionLinkInput[];
}) {
  const { data, error } = await supabase.rpc("create_business_transaction", {
    p_transaction_type_id: input.transaction_type_id,
    p_transaction_date: input.transaction_date,
    p_description: input.description,
    p_idempotency_key: input.idempotency_key,
    p_lines: input.lines as unknown as Json,
    p_links: (input.links ?? []) as unknown as Json,
    ...(input.counterparty_type ? { p_counterparty_type: input.counterparty_type } : {}),
    ...(input.counterparty_id ? { p_counterparty_id: input.counterparty_id } : {}),
    ...(input.counterparty_name ? { p_counterparty_name: input.counterparty_name } : {}),
    ...(input.external_reference ? { p_external_reference: input.external_reference } : {}),
  });
  if (error) throw error;
  return parseTransactionResult(data);
}

export async function confirmBusinessTransaction(id: string) {
  const { data, error } = await supabase.rpc("confirm_business_transaction", { p_transaction_id: id });
  if (error) throw error;
  return parseTransactionResult(data);
}

export async function voidBusinessTransaction(id: string, reason: string) {
  const { data, error } = await supabase.rpc("void_business_transaction", { p_transaction_id: id, p_reason: reason });
  if (error) throw error;
  return parseTransactionResult(data);
}
