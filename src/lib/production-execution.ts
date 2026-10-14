import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  RoutingHeader,
  RoutingVersion,
  RoutingOperation,
  RoutingOperationInput,
  ProductionOrder,
  ProductionWorker,
  ProductionOrderMaterialRequirement,
  ProductionOrderOperation,
  ProductionOperationLog,
  ProductionOutput,
  MaterialVarianceResult,
  LaborVarianceResult,
  WorkerCompensationProfile,
  WorkerCompensationRate,
  ProductionOperationLaborFact,
  LaborCostEntry,
  ProductionOrderLaborCost,
  AttendanceMethod,
  ProductionAttendanceRow,
  WorkerAttendanceMethod,
  ProductionOrderWorkerAssignment,
  FactoryAttendanceRow,
  FactoryAttendanceClosureRow,
  FactoryAttendanceDayStatusRow,
  FactoryAttendanceDayStatus,
  FactoryAttendanceHistoryRow,
  FactoryOvertimeRow,
  AttendanceWorkflowStatus,
  OvertimeType,
  ProductionEntryProduct,
  ProductionEntryRow,
  ProductionSourceOrder,
  ProductionFabricVariant,
  ProductionOrderItemMetadata,
  CreateProductionOrderGroupInput,
  CreateProductionOrderGroupResult,
  ProductionBatch,
  ProductionStageEvent,
  ProductionFabricAllocation,
  ProductionFabricStock,
} from "@/integrations/supabase/production-execution-types";
import { isLocalBackend } from "@/lib/runtime-config";
import {
  localApi,
  type LocalAttendanceBulkWorkflowInput,
  type LocalAttendanceBulkWorkflowResult,
  type LocalAttendanceBulkWorkflowSourceType,
} from "@/lib/local-api";

// These production endpoints are added alongside the local SQL runtime. Keep
// the adapter type local so this module remains buildable while an older local
// API bundle is being restarted/upgraded.
type LocalProductionApi = typeof localApi & {
  calculateProductionOrderLaborCost: (
    productionOrderId: string,
  ) => Promise<ProductionOrderLaborCost>;
  recordProductionScrap: (body: Record<string, unknown>) => Promise<unknown>;
  recordProductionRework: (body: Record<string, unknown>) => Promise<unknown>;
};
const localProductionApi = localApi as LocalProductionApi;

function asObject<T>(v: Json, label: string): T {
  if (!v || Array.isArray(v) || typeof v !== "object")
    throw new Error(`${label} không hợp lệ.`);
  return v as unknown as T;
}

function localDateKey(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function localSnapshotRows<T extends Record<string, unknown>>(
  table: string,
): Promise<T[]> {
  const result = await localApi.snapshot(table, { limit: 100 });
  return result.rows.map((row) => ({
    id: row.source_key,
    ...(row.payload || {}),
  })) as unknown as T[];
}

// ── Routing ──
export async function listRoutingWorkspace(productId: string) {
  if (isLocalBackend())
    return localApi.routingWorkspace(productId) as unknown as Promise<{
      header: RoutingHeader | null;
      versions: RoutingVersion[];
    }>;
  const { data: header, error: he } = await supabase
    .from("routing_headers")
    .select("*")
    .eq("product_id", productId)
    .eq("is_active", true)
    .maybeSingle();
  if (he) throw he;
  if (!header)
    return {
      header: null as RoutingHeader | null,
      versions: [] as RoutingVersion[],
    };
  const { data: versions, error } = await supabase
    .from("routing_versions")
    .select("*")
    .eq("routing_id", (header as RoutingHeader).id)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return {
    header: header as RoutingHeader,
    versions: (versions ?? []) as RoutingVersion[],
  };
}
export async function listRoutingOperations(
  versionId: string,
): Promise<RoutingOperation[]> {
  if (isLocalBackend())
    return localApi.routingOperations(versionId) as unknown as Promise<
      RoutingOperation[]
    >;
  const { data, error } = await supabase
    .from("routing_operations")
    .select("*")
    .eq("routing_version_id", versionId)
    .order("sequence");
  if (error) throw error;
  return (data ?? []) as RoutingOperation[];
}
export async function createRoutingDraft(
  productId: string,
  code: string,
  name: string,
  cloneVersionId?: string | null,
) {
  if (isLocalBackend())
    return localApi.createRoutingDraft({
      product_id: productId,
      code,
      name,
      clone_version_id: cloneVersionId ?? null,
    }) as unknown as Promise<{
      header: RoutingHeader;
      version: RoutingVersion;
    }>;
  const { data, error } = await supabase.rpc("create_routing_draft", {
    p_product_id: productId,
    p_code: code,
    p_name: name,
    p_clone_version_id: cloneVersionId ?? null,
  });
  if (error) throw error;
  return asObject<{ header: RoutingHeader; version: RoutingVersion }>(
    data,
    "Routing",
  );
}
export async function saveRoutingDraft(
  versionId: string,
  input: {
    effective_from: string | null;
    effective_to: string | null;
    notes: string | null;
    operations: RoutingOperationInput[];
  },
) {
  if (isLocalBackend())
    return localApi.saveRoutingDraft(versionId, input) as unknown as Promise<{
      id: string;
      status: string;
      operation_count: number;
    }>;
  const { data, error } = await supabase.rpc("save_routing_draft", {
    p_version_id: versionId,
    p_effective_from: input.effective_from,
    p_effective_to: input.effective_to,
    p_notes: input.notes,
    p_operations: input.operations as unknown as Json,
  });
  if (error) throw error;
  return asObject<{ id: string; status: string; operation_count: number }>(
    data,
    "Routing nháp",
  );
}
export async function approveRoutingVersion(versionId: string, reason: string) {
  if (isLocalBackend())
    return localApi.approveRoutingVersion(versionId, {
      reason,
    }) as unknown as Promise<RoutingVersion>;
  const { data, error } = await supabase.rpc("approve_routing_version", {
    p_version_id: versionId,
    p_reason: reason || null,
    p_supersede_previous: true,
  });
  if (error) throw error;
  return asObject<RoutingVersion>(data, "Routing đã duyệt");
}

// ── Workers ──
export async function listProductionWorkers(): Promise<ProductionWorker[]> {
  if (isLocalBackend()) return localApi.workers();
  const { data, error } = await supabase.rpc("list_factory_attendance_workers");
  if (error) throw error;
  return (data ?? []) as ProductionWorker[];
}
export async function listWorkerCompensationRates(
  workerId?: string | null,
): Promise<WorkerCompensationRate[]> {
  if (isLocalBackend()) return localApi.rates(workerId);
  const { data, error } = await supabase.rpc("list_worker_compensation_rates", {
    p_worker_id: workerId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as WorkerCompensationRate[];
}
export async function upsertWorkerCompensationProfile(input: {
  worker_id: string;
  compensation_type: string;
  monthly_productive_minutes?: number | null;
}): Promise<WorkerCompensationProfile> {
  if (isLocalBackend()) {
    return {
      id: `local-profile-${input.worker_id}`,
      tenant_id: "local-tenant",
      worker_id: input.worker_id,
      default_compensation_type:
        input.compensation_type as WorkerCompensationProfile["default_compensation_type"],
      monthly_productive_minutes: input.monthly_productive_minutes ?? null,
      currency_code: "VND",
      is_active: true,
      created_by: "local-admin",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  const { data, error } = await supabase.rpc(
    "upsert_worker_compensation_profile",
    {
      p_worker_id: input.worker_id,
      p_compensation_type: input.compensation_type,
      p_monthly_productive_minutes: input.monthly_productive_minutes ?? null,
    },
  );
  if (error) throw error;
  return asObject<WorkerCompensationProfile>(data, "Hồ sơ mức công");
}
export async function createWorkerCompensationRate(input: {
  worker_id: string;
  compensation_type: string;
  effective_from: string;
  effective_to?: string | null;
  hourly_rate?: number | null;
  piece_rate?: number | null;
  monthly_rate?: number | null;
  monthly_productive_minutes?: number | null;
  reason?: string | null;
  is_estimated?: boolean;
}): Promise<WorkerCompensationRate> {
  if (isLocalBackend()) return localApi.createRate(input);
  const { data, error } = await supabase.rpc(
    "create_worker_compensation_rate",
    {
      p_worker_id: input.worker_id,
      p_compensation_type: input.compensation_type,
      p_effective_from: input.effective_from,
      p_effective_to: input.effective_to ?? null,
      p_hourly_rate: input.hourly_rate ?? null,
      p_piece_rate: input.piece_rate ?? null,
      p_monthly_rate: input.monthly_rate ?? null,
      p_monthly_productive_minutes: input.monthly_productive_minutes ?? null,
      p_reason: input.reason ?? null,
      p_is_estimated: input.is_estimated ?? false,
    },
  );
  if (error) throw error;
  return asObject<WorkerCompensationRate>(data, "Mức công");
}
export async function configureWorkerAttendanceMethod(input: {
  worker_id: string;
  attendance_method: AttendanceMethod;
  rate_amount: number;
  effective_from: string;
  effective_to?: string | null;
  standard_days_per_month?: number;
  standard_hours_per_day?: number;
  reason?: string | null;
  is_estimated?: boolean;
}): Promise<{
  attendance_method: AttendanceMethod;
  profile: WorkerCompensationProfile;
  rate: WorkerCompensationRate;
}> {
  if (isLocalBackend()) return localApi.configureWorkerMethod(input);
  const { data, error } = await supabase.rpc(
    "configure_worker_attendance_method",
    {
      p_worker_id: input.worker_id,
      p_attendance_method: input.attendance_method,
      p_rate_amount: input.rate_amount,
      p_effective_from: input.effective_from,
      p_effective_to: input.effective_to ?? null,
      p_standard_days_per_month: input.standard_days_per_month ?? 26,
      p_standard_hours_per_day: input.standard_hours_per_day ?? 8,
      p_reason: input.reason ?? null,
      p_is_estimated: input.is_estimated ?? false,
    },
  );
  if (error) throw error;
  return asObject<{
    attendance_method: AttendanceMethod;
    profile: WorkerCompensationProfile;
    rate: WorkerCompensationRate;
  }>(data, "Cấu hình chấm công");
}
export async function recordProductionAttendance(input: {
  operation_id: string;
  worker_id: string;
  attendance_method: AttendanceMethod;
  work_date?: string;
  day_units?: number | null;
  work_hours?: number | null;
  output_quantity?: number | null;
  standard_hours_per_day?: number;
  idempotency_key: string;
  notes?: string | null;
}): Promise<{
  fact?: ProductionOperationLaborFact;
  entry?: LaborCostEntry;
  fact_id?: string;
  entry_id?: string;
  reused: boolean;
  attendance_method: AttendanceMethod;
  attendance_value: number;
  cost_visible: boolean;
}> {
  if (isLocalBackend())
    return localApi.recordProductionAttendance(input) as Promise<{
      fact?: ProductionOperationLaborFact;
      entry?: LaborCostEntry;
      fact_id?: string;
      entry_id?: string;
      reused: boolean;
      attendance_method: AttendanceMethod;
      attendance_value: number;
      cost_visible: boolean;
    }>;
  const { data, error } = await supabase.rpc("record_production_attendance", {
    p_production_order_operation_id: input.operation_id,
    p_worker_id: input.worker_id,
    p_attendance_method: input.attendance_method,
    p_work_date: input.work_date ?? localDateKey(),
    p_day_units: input.day_units ?? null,
    p_work_hours: input.work_hours ?? null,
    p_output_quantity: input.output_quantity ?? null,
    p_standard_hours_per_day: input.standard_hours_per_day ?? 8,
    p_idempotency_key: input.idempotency_key,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return asObject<{
    fact?: ProductionOperationLaborFact;
    entry?: LaborCostEntry;
    fact_id?: string;
    entry_id?: string;
    reused: boolean;
    attendance_method: AttendanceMethod;
    attendance_value: number;
    cost_visible: boolean;
  }>(data, "Chấm công");
}
export async function recordFactoryAttendance(input: {
  worker_id: string;
  attendance_method: AttendanceMethod;
  work_date?: string;
  day_units?: number | null;
  work_hours?: number | null;
  output_quantity?: number | null;
  standard_hours_per_day?: number;
  activity_name?: string | null;
  idempotency_key: string;
  notes?: string | null;
}): Promise<{
  id: string;
  reused: boolean;
  attendance_method: AttendanceMethod;
  attendance_value: number;
  cost_visible: boolean;
  calculated_amount: number | null;
}> {
  if (isLocalBackend())
    return localApi.recordFactoryAttendance(input) as Promise<{
      id: string;
      reused: boolean;
      attendance_method: AttendanceMethod;
      attendance_value: number;
      cost_visible: boolean;
      calculated_amount: number | null;
    }>;
  const { data, error } = await supabase.rpc("record_factory_attendance", {
    p_worker_id: input.worker_id,
    p_attendance_method: input.attendance_method,
    p_work_date: input.work_date ?? localDateKey(),
    p_day_units: input.day_units ?? null,
    p_work_hours: input.work_hours ?? null,
    p_output_quantity: input.output_quantity ?? null,
    p_standard_hours_per_day: input.standard_hours_per_day ?? 8,
    p_activity_name: input.activity_name ?? null,
    p_idempotency_key: input.idempotency_key,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return asObject<{
    id: string;
    reused: boolean;
    attendance_method: AttendanceMethod;
    attendance_value: number;
    cost_visible: boolean;
    calculated_amount: number | null;
  }>(data, "Chấm công xưởng");
}
export async function recordFactoryHourAttendance(input: {
  worker_id: string;
  work_date: string;
  check_in_time: string;
  check_out_time: string;
  break_minutes?: number;
  activity_name?: string | null;
  idempotency_key: string;
  notes?: string | null;
}): Promise<{
  id: string;
  reused: boolean;
  attendance_method: "HOUR";
  attendance_value: number;
  check_in_time: string;
  check_out_time: string;
  break_minutes: number;
  cost_visible: boolean;
  calculated_amount: number | null;
}> {
  if (isLocalBackend())
    return localApi.recordFactoryHourAttendance(input) as Promise<{
      id: string;
      reused: boolean;
      attendance_method: "HOUR";
      attendance_value: number;
      check_in_time: string;
      check_out_time: string;
      break_minutes: number;
      cost_visible: boolean;
      calculated_amount: number | null;
    }>;
  const { data, error } = await supabase.rpc("record_factory_hour_attendance", {
    p_worker_id: input.worker_id,
    p_work_date: input.work_date,
    p_check_in_time: input.check_in_time,
    p_check_out_time: input.check_out_time,
    p_break_minutes: input.break_minutes ?? 0,
    p_activity_name: input.activity_name ?? null,
    p_idempotency_key: input.idempotency_key,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return asObject<{
    id: string;
    reused: boolean;
    attendance_method: "HOUR";
    attendance_value: number;
    check_in_time: string;
    check_out_time: string;
    break_minutes: number;
    cost_visible: boolean;
    calculated_amount: number | null;
  }>(data, "Chấm công theo giờ");
}
export async function listFactoryAttendanceMonthWithMeta(
  monthStart: string,
  includeReversed = false,
): Promise<{
  rows: FactoryAttendanceRow[];
  timeClockAvailable: boolean;
  workflowAvailable: boolean;
}> {
  if (isLocalBackend())
    return localApi.factoryAttendance(monthStart, includeReversed);
  const workflow = await supabase.rpc("list_factory_attendance_month_v3", {
    p_month_start: monthStart,
    p_include_reversed: includeReversed,
  });
  if (!workflow.error) {
    const rows = (workflow.data ?? []).map((row) => ({
      ...(row as FactoryAttendanceRow),
      time_clock_available: true,
      workflow_status:
        (row as FactoryAttendanceRow).workflow_status ?? "APPROVED",
    }));
    return { rows, timeClockAvailable: true, workflowAvailable: true };
  }
  const missingWorkflow =
    workflow.error.code === "42883" ||
    workflow.error.code === "PGRST202" ||
    workflow.error.message.includes("list_factory_attendance_month_v3");
  if (!missingWorkflow) throw workflow.error;

  const current = await supabase.rpc("list_factory_attendance_month_v2", {
    p_month_start: monthStart,
    p_include_reversed: includeReversed,
  });
  if (!current.error) {
    const rows = (current.data ?? []).map((row) => ({
      ...(row as FactoryAttendanceRow),
      time_clock_available: true,
      workflow_status: (row as FactoryAttendanceRow).is_reversed
        ? "REVERSED"
        : "APPROVED",
    }));
    return { rows, timeClockAvailable: true, workflowAvailable: false };
  }
  const missingFunction =
    current.error.code === "42883" ||
    current.error.code === "PGRST202" ||
    current.error.message.includes("list_factory_attendance_month_v2");
  if (!missingFunction) throw current.error;

  const legacy = await supabase.rpc("list_factory_attendance_month", {
    p_month_start: monthStart,
    p_include_reversed: includeReversed,
  });
  if (legacy.error) throw legacy.error;
  const rows = (legacy.data ?? []).map((row) => ({
    ...row,
    check_in_time: null,
    check_out_time: null,
    break_minutes: 0,
    time_clock_available: false,
    workflow_status: row.is_reversed ? "REVERSED" : "APPROVED",
  })) as FactoryAttendanceRow[];
  return { rows, timeClockAvailable: false, workflowAvailable: false };
}

export async function listFactoryAttendanceMonth(
  monthStart: string,
  includeReversed = false,
): Promise<FactoryAttendanceRow[]> {
  const result = await listFactoryAttendanceMonthWithMeta(
    monthStart,
    includeReversed,
  );
  return result.rows;
}
export async function reverseFactoryAttendance(
  attendanceRecordId: string,
  reason: string,
  idempotencyKey: string,
) {
  if (isLocalBackend())
    return localApi.reverseFactoryAttendance(
      attendanceRecordId,
      reason,
      idempotencyKey,
    );
  const { data, error } = await supabase.rpc("reverse_factory_attendance", {
    p_attendance_record_id: attendanceRecordId,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return asObject<{
    id: string;
    attendance_record_id: string;
    reversed_amount?: number;
    reused: boolean;
  }>(data, "Đảo chấm công xưởng");
}

export async function setFactoryAttendanceStatus(input: {
  attendance_record_id: string;
  target_status: Exclude<AttendanceWorkflowStatus, "REVERSED">;
  reason?: string | null;
  idempotency_key: string;
}) {
  if (isLocalBackend()) return localApi.setFactoryAttendanceStatus(input);
  const { data, error } = await supabase.rpc("set_factory_attendance_status", {
    p_attendance_record_id: input.attendance_record_id,
    p_target_status: input.target_status,
    p_reason: input.reason ?? null,
    p_idempotency_key: input.idempotency_key,
  });
  if (error) throw error;
  return asObject<{
    id: string;
    attendance_record_id: string;
    status: AttendanceWorkflowStatus;
    reused: boolean;
  }>(data, "Quy trình duyệt chấm công");
}

export type FactoryAttendanceBulkWorkflowSourceType =
  LocalAttendanceBulkWorkflowSourceType;
export type FactoryAttendanceBulkWorkflowInput =
  LocalAttendanceBulkWorkflowInput;
export type FactoryAttendanceBulkWorkflowResult =
  LocalAttendanceBulkWorkflowResult;

/**
 * Batch approval belongs only to the local SQL workflow. Public/Supabase
 * deployments deliberately have no fallback RPC, so this cannot mutate them.
 */
export async function bulkFactoryAttendanceWorkflow(
  input: FactoryAttendanceBulkWorkflowInput,
): Promise<FactoryAttendanceBulkWorkflowResult> {
  if (!isLocalBackend())
    throw new Error(
      "Duyệt hàng loạt chỉ sẵn sàng trên máy chủ SQL cục bộ; không gọi Supabase.",
    );
  return localApi.bulkAttendanceWorkflow(input);
}

export async function listFactoryAttendanceClosures(
  monthStart: string,
): Promise<FactoryAttendanceClosureRow[]> {
  if (isLocalBackend()) return localApi.closures(monthStart);
  const { data, error } = await supabase.rpc(
    "list_factory_attendance_closures",
    { p_month_start: monthStart },
  );
  if (error) throw error;
  return (data ?? []) as FactoryAttendanceClosureRow[];
}

export async function setFactoryAttendanceDayStatus(input: {
  worker_id: string;
  work_date: string;
  status: FactoryAttendanceDayStatus;
  meal_eligible?: boolean;
  reason?: string | null;
  idempotency_key: string;
}) {
  if (isLocalBackend())
    return localApi.setDayStatus(input) as Promise<{
      id: string;
      worker_id: string;
      work_date: string;
      status: FactoryAttendanceDayStatus;
      meal_eligible: boolean;
      reused: boolean;
    }>;
  const { data, error } = await supabase.rpc(
    "set_factory_attendance_day_status",
    {
      p_worker_id: input.worker_id,
      p_work_date: input.work_date,
      p_status: input.status,
      p_meal_eligible: input.meal_eligible ?? false,
      p_reason: input.reason ?? null,
      p_idempotency_key: input.idempotency_key,
    },
  );
  if (error) throw error;
  return asObject<{
    id: string;
    worker_id: string;
    work_date: string;
    status: FactoryAttendanceDayStatus;
    meal_eligible: boolean;
    reused: boolean;
  }>(data, "Trạng thái ngày công");
}

export async function listFactoryAttendanceDayStatusMonth(
  monthStart: string,
): Promise<FactoryAttendanceDayStatusRow[]> {
  if (isLocalBackend()) return localApi.dayStatuses(monthStart);
  const { data, error } = await supabase.rpc(
    "list_factory_attendance_day_status_month",
    { p_month_start: monthStart },
  );
  if (error) throw error;
  return (data ?? []) as FactoryAttendanceDayStatusRow[];
}

export async function listProductionEntryProducts(
  workDate: string,
  search?: string,
): Promise<ProductionEntryProduct[]> {
  if (isLocalBackend()) return localApi.productionProducts(workDate, search);
  const { data, error } = await supabase.rpc("list_production_entry_products", {
    p_work_date: workDate,
    p_search: search?.trim() || null,
  });
  if (error) throw error;
  return (data ?? []) as ProductionEntryProduct[];
}

export async function listProductionEntriesMonth(
  monthStart: string,
  includeReversed = false,
): Promise<ProductionEntryRow[]> {
  if (isLocalBackend())
    return localApi.productionEntries(monthStart, includeReversed);
  const { data, error } = await supabase.rpc("list_production_entries_month", {
    p_month_start: monthStart,
    p_include_reversed: includeReversed,
  });
  if (error) throw error;
  return (data ?? []) as ProductionEntryRow[];
}

export async function recordProductionEntry(input: {
  worker_id: string;
  product_id?: string | null;
  rate_id?: string | null;
  piece_rate_code?: string | null;
  work_date: string;
  quantity: number;
  production_order_operation_id?: string | null;
  idempotency_key: string;
  notes?: string | null;
}) {
  if (isLocalBackend()) return localApi.recordProductionEntry(input);
  const { data, error } = await supabase.rpc("record_production_entry", {
    p_worker_id: input.worker_id,
    p_product_id: input.product_id ?? "",
    p_work_date: input.work_date,
    p_quantity: input.quantity,
    p_production_order_operation_id:
      input.production_order_operation_id ?? null,
    p_idempotency_key: input.idempotency_key,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return asObject<{
    id: string;
    reused: boolean;
    status: "SUBMITTED";
    cost_visible: boolean;
    calculated_amount: number | null;
  }>(data, "Sản lượng sản phẩm");
}

export async function setProductionEntryStatus(input: {
  production_entry_id: string;
  target_status: "SUBMITTED" | "APPROVED" | "REJECTED";
  reason?: string | null;
  idempotency_key: string;
}) {
  if (isLocalBackend()) return localApi.setProductionEntryStatus(input);
  const { data, error } = await supabase.rpc("set_production_entry_status", {
    p_production_entry_id: input.production_entry_id,
    p_target_status: input.target_status,
    p_reason: input.reason ?? null,
    p_idempotency_key: input.idempotency_key,
  });
  if (error) throw error;
  return asObject<{
    id: string;
    production_entry_id: string;
    status: string;
    reused: boolean;
  }>(data, "Quy trình duyệt sản lượng");
}

export async function reverseProductionEntry(
  productionEntryId: string,
  reason: string,
  idempotencyKey: string,
) {
  if (isLocalBackend())
    return localApi.reverseProductionEntry(
      productionEntryId,
      reason,
      idempotencyKey,
    );
  const { data, error } = await supabase.rpc("reverse_production_entry", {
    p_production_entry_id: productionEntryId,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return asObject<{
    id: string;
    production_entry_id: string;
    status: "REVERSED";
    reused: boolean;
  }>(data, "Đảo sản lượng");
}

export async function setFactoryAttendanceDayClosure(input: {
  worker_id: string;
  work_date: string;
  target_status: "EMPLOYEE_CONFIRMED" | "LEADER_CONFIRMED" | "REOPENED";
  reason?: string | null;
  idempotency_key: string;
}) {
  if (isLocalBackend()) return localApi.setDayClosure(input);
  const { data, error } = await supabase.rpc(
    "set_factory_attendance_day_closure",
    {
      p_worker_id: input.worker_id,
      p_work_date: input.work_date,
      p_target_status: input.target_status,
      p_reason: input.reason ?? null,
      p_idempotency_key: input.idempotency_key,
    },
  );
  if (error) throw error;
  return asObject<{
    id: string;
    worker_id: string;
    work_date: string;
    status: string;
    reused: boolean;
  }>(data, "Chốt ngày công");
}

export async function recordFactoryOvertime(input: {
  worker_id: string;
  work_date: string;
  overtime_type: OvertimeType;
  overtime_minutes: number;
  reason: string;
  idempotency_key: string;
}) {
  if (isLocalBackend()) return localApi.recordOvertime(input);
  const { data, error } = await supabase.rpc("record_factory_overtime", {
    p_worker_id: input.worker_id,
    p_work_date: input.work_date,
    p_overtime_type: input.overtime_type,
    p_overtime_minutes: input.overtime_minutes,
    p_reason: input.reason,
    p_idempotency_key: input.idempotency_key,
  });
  if (error) throw error;
  return asObject<{
    id: string;
    reused: boolean;
    status: AttendanceWorkflowStatus;
  }>(data, "Tăng ca");
}

export async function listFactoryOvertimeMonth(
  monthStart: string,
): Promise<FactoryOvertimeRow[]> {
  if (isLocalBackend()) return localApi.overtime(monthStart);
  const { data, error } = await supabase.rpc("list_factory_overtime_month", {
    p_month_start: monthStart,
  });
  if (error) throw error;
  return (data ?? []) as FactoryOvertimeRow[];
}

/** Load the local append-only workflow trail used by the attendance history tab. */
export async function listFactoryAttendanceHistoryMonth(
  monthStart: string,
): Promise<FactoryAttendanceHistoryRow[]> {
  if (isLocalBackend()) return localApi.attendanceHistory(monthStart);
  // The legacy public view has no equivalent local audit endpoint. Keep the
  // fallback empty rather than querying or mutating the public database.
  return [];
}

export async function setFactoryOvertimeStatus(input: {
  overtime_record_id: string;
  target_status: Exclude<AttendanceWorkflowStatus, "REVERSED">;
  reason?: string | null;
  idempotency_key: string;
}) {
  if (isLocalBackend()) return localApi.setOvertimeStatus(input);
  const { data, error } = await supabase.rpc("set_factory_overtime_status", {
    p_overtime_record_id: input.overtime_record_id,
    p_target_status: input.target_status,
    p_reason: input.reason ?? null,
    p_idempotency_key: input.idempotency_key,
  });
  if (error) throw error;
  return asObject<{
    id: string;
    status: AttendanceWorkflowStatus;
    reused: boolean;
  }>(data, "Quy trình duyệt tăng ca");
}
export async function listProductionAttendance(
  poId: string,
): Promise<ProductionAttendanceRow[]> {
  if (isLocalBackend())
    return localApi.productionAttendance(
      poId,
      `${new Date().toISOString().slice(0, 7)}-01`,
      true,
    );
  const { data, error } = await supabase.rpc("list_production_attendance", {
    p_production_order_id: poId,
  });
  if (error) throw error;
  return (data ?? []) as ProductionAttendanceRow[];
}
export async function listProductionAttendanceMonth(
  poId: string,
  monthStart: string,
  includeReversed = false,
): Promise<ProductionAttendanceRow[]> {
  if (isLocalBackend())
    return localApi.productionAttendance(poId, monthStart, includeReversed);
  const { data, error } = await supabase.rpc(
    "list_production_attendance_month",
    {
      p_production_order_id: poId,
      p_month_start: monthStart,
      p_include_reversed: includeReversed,
    },
  );
  if (error) {
    // Keep the attendance screen usable while the additive hardening migration
    // is being rolled out to an existing project. The legacy endpoint is
    // order-scoped, so the fallback only narrows its result to the requested
    // month and cannot fabricate reversal state.
    const missingMonthRpc =
      error.code === "42883" ||
      error.message?.includes("list_production_attendance_month");
    if (!missingMonthRpc) throw error;
    const legacyRows = await listProductionAttendance(poId);
    return legacyRows
      .filter((row) => row.work_date.slice(0, 7) === monthStart.slice(0, 7))
      .map((row) => ({ ...row, is_reversed: false, reversal_reason: null }));
  }
  return (data ?? []) as ProductionAttendanceRow[];
}
export async function listProductionOrderWorkerAssignments(
  poId: string,
): Promise<ProductionOrderWorkerAssignment[]> {
  if (isLocalBackend()) return localApi.assignments(poId);
  const { data, error } = await supabase.rpc(
    "list_production_order_worker_assignments",
    { p_production_order_id: poId },
  );
  if (error) throw error;
  return (data ?? []) as ProductionOrderWorkerAssignment[];
}
export async function assignProductionOrderWorker(input: {
  production_order_id: string;
  worker_id: string;
  production_order_operation_id?: string | null;
  assigned_from: string;
  assigned_to?: string | null;
  notes?: string | null;
}): Promise<ProductionOrderWorkerAssignment> {
  if (isLocalBackend()) return localApi.assign(input);
  const { data, error } = await supabase.rpc("assign_production_order_worker", {
    p_production_order_id: input.production_order_id,
    p_worker_id: input.worker_id,
    p_production_order_operation_id:
      input.production_order_operation_id ?? null,
    p_assigned_from: input.assigned_from,
    p_assigned_to: input.assigned_to ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return asObject<ProductionOrderWorkerAssignment>(data, "Phân công nhân sự");
}
export async function endProductionOrderWorkerAssignment(
  assignmentId: string,
  assignedTo: string,
  reason?: string | null,
): Promise<ProductionOrderWorkerAssignment> {
  if (isLocalBackend())
    return localApi.endAssignment(assignmentId, { assignedTo, reason });
  const { data, error } = await supabase.rpc(
    "end_production_order_worker_assignment",
    {
      p_assignment_id: assignmentId,
      p_assigned_to: assignedTo,
      p_reason: reason ?? null,
    },
  );
  if (error) throw error;
  return asObject<ProductionOrderWorkerAssignment>(data, "Kết thúc phân công");
}
export async function setProductionOrderAssignmentEnforcement(
  poId: string,
  enforced: boolean,
  reason: string,
): Promise<ProductionOrder> {
  if (isLocalBackend())
    return localApi.setAssignmentEnforcement({
      production_order_id: poId,
      enforced,
      reason,
    }) as unknown as Promise<ProductionOrder>;
  const { data, error } = await supabase.rpc(
    "set_production_order_assignment_enforcement",
    {
      p_production_order_id: poId,
      p_enforced: enforced,
      p_reason: reason || null,
    },
  );
  if (error) throw error;
  return asObject<ProductionOrder>(data, "Kiểm soát phân công");
}
export async function reverseProductionAttendance(
  laborFactId: string,
  reason: string,
  idempotencyKey: string,
) {
  if (isLocalBackend())
    return localApi.reverseProductionAttendance(
      laborFactId,
      reason,
      idempotencyKey,
    );
  const { data, error } = await supabase.rpc("reverse_production_attendance", {
    p_labor_fact_id: laborFactId,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return asObject<{
    id: string;
    labor_fact_id: string;
    reversed_amount?: number;
    reused: boolean;
  }>(data, "Đảo chấm công");
}
export async function listWorkerAttendanceMethods(
  onDate?: string,
): Promise<WorkerAttendanceMethod[]> {
  if (isLocalBackend()) return localApi.workerMethods(onDate);
  const { data, error } = await supabase.rpc("list_worker_attendance_methods");
  if (error) throw error;
  return (data ?? []) as WorkerAttendanceMethod[];
}
export async function calculateProductionOrderLaborCost(
  poId: string,
): Promise<ProductionOrderLaborCost> {
  if (isLocalBackend()) {
    // Local SQL exposes the same aggregate contract as the Supabase RPC.
    return localProductionApi.calculateProductionOrderLaborCost(
      poId,
    ) as unknown as Promise<ProductionOrderLaborCost>;
  }
  const { data, error } = await supabase.rpc(
    "calculate_production_order_labor_cost",
    { p_production_order_id: poId },
  );
  if (error) throw error;
  return asObject<ProductionOrderLaborCost>(data, "Chi phí nhân công");
}
export async function createProductionWorker(input: {
  employee_code: string;
  display_name: string;
  worker_type?: string;
  user_id?: string | null;
  primary_cost_center_id?: string | null;
}) {
  if (isLocalBackend()) return localApi.createWorker(input);
  const { data, error } = await supabase.rpc("create_production_worker", {
    p_employee_code: input.employee_code,
    p_display_name: input.display_name,
    p_worker_type: input.worker_type ?? "GENERIC",
    p_user_id: input.user_id ?? null,
    p_primary_cost_center_id: input.primary_cost_center_id ?? null,
  });
  if (error) throw error;
  return asObject<ProductionWorker>(data, "Công nhân");
}

// ── Production Orders ──
export async function listProductionOrders(filters?: {
  status?: string;
  product_id?: string;
  order_id?: string;
}): Promise<ProductionOrder[]> {
  if (isLocalBackend())
    return localApi.productionOrders(filters) as unknown as Promise<
      ProductionOrder[]
    >;
  let q = supabase
    .from("production_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters?.status) q = q.eq("status", filters.status as unknown as never);
  if (filters?.product_id) q = q.eq("product_id", filters.product_id);
  if (filters?.order_id) q = q.eq("order_id", filters.order_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ProductionOrder[];
}
export async function getProductionOrder(id: string): Promise<ProductionOrder> {
  if (isLocalBackend())
    return localApi.productionOrder(id) as unknown as Promise<ProductionOrder>;
  const { data, error } = await supabase
    .from("production_orders")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as ProductionOrder;
}
export async function createProductionOrder(input: {
  product_id: string;
  quantity: number;
  source_type?: string;
  order_id?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  cost_center_id?: string | null;
}) {
  if (isLocalBackend())
    return localApi.createProductionOrder(
      input,
    ) as unknown as Promise<ProductionOrder>;
  const { data, error } = await supabase.rpc("create_production_order", {
    p_product_id: input.product_id,
    p_quantity: input.quantity,
    p_source_type: input.source_type ?? "MANUAL",
    p_order_id: input.order_id ?? null,
    p_planned_start_date: input.planned_start_date ?? null,
    p_planned_end_date: input.planned_end_date ?? null,
    p_cost_center_id: input.cost_center_id ?? null,
  });
  if (error) throw error;
  return asObject<ProductionOrder>(data, "Lệnh sản xuất");
}

export async function createProductionOrderGroup(
  input: CreateProductionOrderGroupInput,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<CreateProductionOrderGroupResult> {
  if (isLocalBackend())
    return localApi.createProductionOrderGroup({
      ...input,
      idempotency_key: idempotencyKey,
    }) as unknown as Promise<CreateProductionOrderGroupResult>;
  const { data, error } = await supabase.rpc("create_production_order_group", {
    p_payload: input,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return asObject<CreateProductionOrderGroupResult>(data, "Nhóm lệnh sản xuất");
}

export async function listProductionSourceOrders(): Promise<
  ProductionSourceOrder[]
> {
  if (isLocalBackend()) {
    return (await localApi.productionSourceOrders()) as unknown as ProductionSourceOrder[];
  }
  const { data, error } = await supabase.rpc("list_production_source_orders");
  if (error) throw error;
  return (data ?? []) as ProductionSourceOrder[];
}

export async function listProductionFabricVariants(
  search?: string | null,
): Promise<ProductionFabricVariant[]> {
  if (isLocalBackend()) {
    const rows =
      await localSnapshotRows<Record<string, unknown>>("fabric_variants");
    const term = (search || "").trim().toLocaleLowerCase("vi");
    return rows
      .filter(
        (row) =>
          !term ||
          `${row.variant_name || row.name || ""} ${row.color || ""}`
            .toLocaleLowerCase("vi")
            .includes(term),
      )
      .map((row) => ({
        id: String(row.id),
        variant_name: String(row.variant_name || row.name || ""),
        color: row.color as string | null,
        width_code: row.width_code as string | null,
        weight: row.weight as string | null,
        unit: String(row.unit || "METER"),
        fabric_type_name: row.fabric_type_name as string | null,
      }));
  }
  const { data, error } = await supabase.rpc(
    "list_production_fabric_variants",
    { p_search: search?.trim() || null },
  );
  if (error) throw error;
  return (data ?? []) as ProductionFabricVariant[];
}

export async function listProductionOrderItemsMetadata(
  productionOrderId: string,
): Promise<ProductionOrderItemMetadata[]> {
  if (isLocalBackend())
    return localApi.productionOrderItems(
      productionOrderId,
    ) as unknown as Promise<ProductionOrderItemMetadata[]>;
  const { data, error } = await supabase.rpc("list_production_order_items", {
    p_production_order_id: productionOrderId,
  });
  if (error) throw error;
  return (data ?? []) as ProductionOrderItemMetadata[];
}

export async function listProductionBatches(
  productionOrderId: string,
): Promise<ProductionBatch[]> {
  if (isLocalBackend())
    return localApi.productionBatches(productionOrderId) as unknown as Promise<
      ProductionBatch[]
    >;
  const { data, error } = await supabase.rpc("list_production_batches", {
    p_production_order_id: productionOrderId,
  });
  if (error) throw error;
  return (data ?? []) as ProductionBatch[];
}

export async function listProductionStageEvents(
  productionOrderId: string,
): Promise<ProductionStageEvent[]> {
  if (isLocalBackend())
    return localApi.productionStageEvents(
      productionOrderId,
    ) as unknown as Promise<ProductionStageEvent[]>;
  const { data, error } = await supabase.rpc("list_production_stage_events", {
    p_production_order_id: productionOrderId,
  });
  if (error) throw error;
  return (data ?? []) as ProductionStageEvent[];
}

export async function listProductionFabricAllocations(
  productionOrderId: string,
): Promise<ProductionFabricAllocation[]> {
  if (isLocalBackend())
    return localApi.productionFabricAllocations(
      productionOrderId,
    ) as unknown as Promise<ProductionFabricAllocation[]>;
  const { data, error } = await supabase.rpc(
    "list_production_fabric_allocations",
    { p_production_order_id: productionOrderId },
  );
  if (error) throw error;
  return (data ?? []) as ProductionFabricAllocation[];
}

export async function listProductionFabricStock(
  fabricVariantId?: string | null,
): Promise<ProductionFabricStock[]> {
  if (isLocalBackend())
    return localApi.productionFabricStock(
      fabricVariantId,
    ) as unknown as Promise<ProductionFabricStock[]>;
  const { data, error } = await supabase.rpc("list_production_fabric_stock", {
    p_fabric_variant_id: fabricVariantId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ProductionFabricStock[];
}

export async function setProductionBatchStatus(input: {
  production_batch_id: string;
  target_status: string;
  reason?: string | null;
  idempotency_key?: string;
}): Promise<ProductionBatch> {
  if (isLocalBackend()) {
    return localApi.setProductionBatchStatus(input.production_batch_id, {
      target_status: input.target_status,
      reason: input.reason ?? null,
      idempotency_key: input.idempotency_key ?? crypto.randomUUID(),
    }) as unknown as Promise<ProductionBatch>;
  }
  const { data, error } = await supabase.rpc("set_production_batch_status", {
    p_production_batch_id: input.production_batch_id,
    p_target_status: input.target_status,
    p_reason: input.reason ?? null,
    p_idempotency_key: input.idempotency_key ?? crypto.randomUUID(),
  });
  if (error) throw error;
  return asObject<ProductionBatch>(data, "Trạng thái lô sản xuất");
}

export async function recordProductionStageEvent(
  payload: Omit<
    Partial<ProductionStageEvent>,
    "id" | "tenant_id" | "status" | "created_at"
  > & {
    production_order_id: string;
    production_batch_id: string;
    stage: string;
    worker_id: string;
    quantity_received: number;
    quantity_good: number;
    quantity_rework?: number;
    quantity_remake?: number;
    quantity_defect?: number;
    occurred_at?: string | null;
    notes?: string | null;
  },
  idempotencyKey = crypto.randomUUID(),
): Promise<ProductionStageEvent> {
  if (isLocalBackend()) {
    return localApi.createProductionStageEvent({
      ...payload,
      idempotency_key: idempotencyKey,
    }) as unknown as Promise<ProductionStageEvent>;
  }
  const { data, error } = await supabase.rpc("record_production_stage_event", {
    p_payload: payload as unknown as Json,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return asObject<ProductionStageEvent>(data, "Sự kiện công đoạn");
}

export async function setProductionStageEventStatus(input: {
  production_stage_event_id: string;
  target_status: string;
  reason?: string | null;
  idempotency_key?: string;
}): Promise<ProductionStageEvent> {
  if (isLocalBackend()) {
    return localApi.setProductionStageEventStatus(
      input.production_stage_event_id,
      {
        target_status: input.target_status,
        reason: input.reason ?? null,
        idempotency_key: input.idempotency_key ?? crypto.randomUUID(),
      },
    ) as unknown as Promise<ProductionStageEvent>;
  }
  const { data, error } = await supabase.rpc(
    "set_production_stage_event_status",
    {
      p_production_stage_event_id: input.production_stage_event_id,
      p_target_status: input.target_status,
      p_reason: input.reason ?? null,
      p_idempotency_key: input.idempotency_key ?? crypto.randomUUID(),
    },
  );
  if (error) throw error;
  return asObject<ProductionStageEvent>(data, "Duyệt công đoạn");
}

export async function reverseProductionStageEvent(
  id: string,
  reason: string,
  idempotencyKey = crypto.randomUUID(),
): Promise<ProductionStageEvent> {
  if (isLocalBackend()) {
    return localApi.reverseProductionStageEvent(id, {
      reason,
      idempotency_key: idempotencyKey,
    }) as unknown as Promise<ProductionStageEvent>;
  }
  const { data, error } = await supabase.rpc("reverse_production_stage_event", {
    p_production_stage_event_id: id,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return asObject<ProductionStageEvent>(data, "Đảo công đoạn");
}

export async function issueProductionFabric(input: {
  production_order_id: string;
  production_batch_id: string;
  fabric_variant_id: string;
  warehouse_id: string;
  quantity: number;
  usage_date?: string | null;
  notes?: string | null;
  idempotency_key?: string;
}): Promise<ProductionFabricAllocation> {
  if (isLocalBackend()) {
    return localApi.issueProductionFabric({
      ...input,
      usage_date: input.usage_date ?? localDateKey(),
      idempotency_key: input.idempotency_key ?? crypto.randomUUID(),
    }) as unknown as Promise<ProductionFabricAllocation>;
  }
  const { data, error } = await supabase.rpc("issue_production_fabric", {
    p_production_order_id: input.production_order_id,
    p_production_batch_id: input.production_batch_id,
    p_fabric_variant_id: input.fabric_variant_id,
    p_warehouse_id: input.warehouse_id,
    p_quantity: input.quantity,
    p_usage_date: input.usage_date ?? localDateKey(),
    p_notes: input.notes ?? null,
    p_idempotency_key: input.idempotency_key ?? crypto.randomUUID(),
  });
  if (error) throw error;
  return asObject<ProductionFabricAllocation>(data, "Cấp vải");
}

export async function updateProductionFabricAllocation(input: {
  production_fabric_allocation_id: string;
  action: "CONSUMED" | "RETURNED";
  quantity: number;
  reason?: string | null;
  idempotency_key?: string;
}): Promise<ProductionFabricAllocation> {
  if (isLocalBackend()) {
    return localApi.updateProductionFabricAllocation(
      input.production_fabric_allocation_id,
      {
        action: input.action,
        quantity: input.quantity,
        reason: input.reason ?? null,
        idempotency_key: input.idempotency_key ?? crypto.randomUUID(),
      },
    ) as unknown as Promise<ProductionFabricAllocation>;
  }
  const { data, error } = await supabase.rpc(
    "update_production_fabric_allocation",
    {
      p_production_fabric_allocation_id: input.production_fabric_allocation_id,
      p_action: input.action,
      p_quantity: input.quantity,
      p_reason: input.reason ?? null,
      p_idempotency_key: input.idempotency_key ?? crypto.randomUUID(),
    },
  );
  if (error) throw error;
  return asObject<ProductionFabricAllocation>(data, "Cập nhật vải");
}
export async function releaseProductionOrder(
  id: string,
  effectiveDate?: string,
) {
  if (isLocalBackend())
    return localApi.releaseProductionOrder(id, {
      effective_date: effectiveDate ?? null,
    });
  const { data, error } = await supabase.rpc("release_production_order", {
    p_production_order_id: id,
    p_effective_date: effectiveDate ?? null,
  });
  if (error) throw error;
  return asObject<
    ProductionOrder & {
      material_count: number;
      operation_count: number;
      reused: boolean;
    }
  >(data, "Phát hành");
}
export async function completeProductionOrder(
  id: string,
  quantityGood: number,
  quantityScrap = 0,
  warehouseId?: string | null,
) {
  if (isLocalBackend())
    return localApi.completeProductionOrder(id, {
      quantityGood,
      quantityScrap,
      warehouseId,
    });
  const { data, error } = await supabase.rpc("complete_production_order", {
    p_production_order_id: id,
    p_quantity_good: quantityGood,
    p_quantity_scrap: quantityScrap,
    p_warehouse_id: warehouseId ?? null,
  });
  if (error) throw error;
  return asObject<{
    id: string;
    status: string;
    output: ProductionOutput;
    reused: boolean;
  }>(data, "Hoàn thành");
}
export async function transitionProductionOrder(
  id: string,
  targetStatus: string,
  reason?: string,
) {
  if (isLocalBackend())
    return localApi.transitionProductionOrder(id, { targetStatus, reason });
  const { data, error } = await supabase.rpc(
    "transition_production_order_status",
    {
      p_production_order_id: id,
      p_target_status: targetStatus,
      p_reason: reason ?? null,
    },
  );
  if (error) throw error;
  return asObject<ProductionOrder>(data, "Chuyển trạng thái");
}

// ── Snapshots / operations / logs / variance ──
export async function listProductionMaterialRequirements(
  poId: string,
): Promise<ProductionOrderMaterialRequirement[]> {
  if (isLocalBackend())
    return localApi.productionMaterialRequirements(poId) as unknown as Promise<
      ProductionOrderMaterialRequirement[]
    >;
  const { data, error } = await supabase
    .from("production_order_material_requirements")
    .select("*")
    .eq("production_order_id", poId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ProductionOrderMaterialRequirement[];
}
export async function listProductionOperations(
  poId: string,
): Promise<ProductionOrderOperation[]> {
  if (isLocalBackend())
    return localApi.productionOperations(poId) as unknown as Promise<
      ProductionOrderOperation[]
    >;
  const { data, error } = await supabase
    .from("production_order_operations")
    .select("*")
    .eq("production_order_id", poId)
    .order("sequence");
  if (error) throw error;
  return (data ?? []) as ProductionOrderOperation[];
}
export async function listOperationLogs(
  operationId: string,
): Promise<ProductionOperationLog[]> {
  if (isLocalBackend())
    return localApi.productionOperationLogs(operationId) as unknown as Promise<
      ProductionOperationLog[]
    >;
  const { data, error } = await supabase
    .from("production_operation_logs")
    .select("*")
    .eq("production_order_operation_id", operationId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ProductionOperationLog[];
}
export async function startProductionOperation(
  opId: string,
  workerId?: string | null,
) {
  if (isLocalBackend())
    return localApi.startProductionOperation(opId, {
      worker_id: workerId ?? null,
    }) as unknown as Promise<ProductionOrderOperation>;
  const { data, error } = await supabase.rpc("start_production_operation", {
    p_operation_id: opId,
    p_worker_id: workerId ?? null,
  });
  if (error) throw error;
  return asObject<ProductionOrderOperation>(data, "Công đoạn");
}
export async function completeProductionOperation(
  opId: string,
  quantityGood?: number | null,
  quantityScrap = 0,
  quantityRework = 0,
  workerId?: string | null,
) {
  if (isLocalBackend())
    return localApi.completeProductionOperation(opId, {
      quantity_good: quantityGood ?? null,
      quantity_scrap: quantityScrap,
      quantity_rework: quantityRework,
      worker_id: workerId ?? null,
    }) as unknown as Promise<ProductionOrderOperation>;
  const { data, error } = await supabase.rpc("complete_production_operation", {
    p_operation_id: opId,
    p_quantity_good: quantityGood ?? null,
    p_quantity_scrap: quantityScrap,
    p_quantity_rework: quantityRework,
    p_worker_id: workerId ?? null,
  });
  if (error) throw error;
  return asObject<ProductionOrderOperation>(data, "Công đoạn");
}
export async function logProductionOperation(
  opId: string,
  eventType: string,
  opts?: {
    worker_id?: string | null;
    quantity?: number | null;
    reason_code?: string | null;
    started_at?: string | null;
    ended_at?: string | null;
    notes?: string | null;
  },
) {
  if (isLocalBackend()) {
    return localApi.createProductionOperationLog(opId, {
      event_type: eventType,
      worker_id: opts?.worker_id ?? null,
      quantity: opts?.quantity ?? null,
      reason_code: opts?.reason_code ?? null,
      started_at: opts?.started_at ?? null,
      ended_at: opts?.ended_at ?? null,
      notes: opts?.notes ?? null,
    }) as unknown as Promise<ProductionOperationLog>;
  }
  const { data, error } = await supabase.rpc("log_production_operation", {
    p_operation_id: opId,
    p_event_type: eventType,
    p_worker_id: opts?.worker_id ?? null,
    p_quantity: opts?.quantity ?? null,
    p_reason_code: opts?.reason_code ?? null,
    p_started_at: opts?.started_at ?? null,
    p_ended_at: opts?.ended_at ?? null,
    p_notes: opts?.notes ?? null,
  });
  if (error) throw error;
  return asObject<ProductionOperationLog>(data, "Log");
}
export async function getMaterialVariance(
  poId: string,
): Promise<MaterialVarianceResult> {
  if (isLocalBackend()) {
    const requirements = await listProductionMaterialRequirements(poId);
    const materials = requirements.map((row) => ({
      inventory_item_id: row.inventory_item_id,
      unit: row.unit,
      standard_quantity: Number(row.standard_quantity || 0),
      planned_quantity: Number(row.planned_quantity || 0),
      issued_quantity: 0,
      returned_quantity: 0,
      actual_consumption_quantity: 0,
      quantity_variance: 0,
      actual_material_cost: null,
      cost_visible: false,
      current_stock: null,
      shortage: 0,
    }));
    return { production_order_id: poId, materials, cost_visible: false };
  }
  const { data, error } = await supabase.rpc("get_production_order_variance", {
    p_production_order_id: poId,
  });
  if (error) throw error;
  return asObject<MaterialVarianceResult>(data, "Variance vật tư");
}
export async function getLaborVariance(
  poId: string,
): Promise<LaborVarianceResult> {
  if (isLocalBackend()) {
    // Keep the local view on the same aggregate used by payroll and labor
    // costing.  Deriving this from operation timestamps can leave a few
    // fractional minutes after a fast start/complete action, which renders as
    // `0` in the UI while producing an inflated efficiency percentage.
    const result = await calculateProductionOrderLaborCost(poId);
    const actualMinutes = Number(result.actual_minutes || 0);
    if (actualMinutes > 0 && actualMinutes < 0.01) {
      const standardMinutes = Number(result.standard_minutes || 0);
      return {
        ...result,
        actual_minutes: 0,
        variance_minutes: -standardMinutes,
        efficiency_percent: null,
      };
    }
    return result;
  }
  const { data, error } = await supabase.rpc("get_production_labor_variance", {
    p_production_order_id: poId,
  });
  if (error) throw error;
  return asObject<LaborVarianceResult>(data, "Variance nhân công");
}
export async function getProductionOutputs(
  poId: string,
): Promise<ProductionOutput[]> {
  if (isLocalBackend())
    return localApi.productionOutputs(poId) as unknown as Promise<
      ProductionOutput[]
    >;
  const { data, error } = await supabase
    .from("production_outputs")
    .select("*")
    .eq("production_order_id", poId);
  if (error) throw error;
  return (data ?? []) as ProductionOutput[];
}
export async function recordScrap(
  poId: string,
  quantity: number,
  reasonCode: string,
  operationId?: string | null,
) {
  if (isLocalBackend()) {
    return localProductionApi.recordProductionScrap({
      production_order_id: poId,
      quantity,
      reason_code: reasonCode,
      operation_id: operationId ?? null,
    });
  }
  const { data, error } = await supabase.rpc("record_production_scrap", {
    p_production_order_id: poId,
    p_quantity: quantity,
    p_reason_code: reasonCode,
    p_operation_id: operationId ?? null,
  });
  if (error) throw error;
  return data;
}
export async function recordRework(
  poId: string,
  quantity: number,
  reasonCode: string,
  fromOp?: string | null,
  targetOp?: string | null,
) {
  if (isLocalBackend()) {
    return localProductionApi.recordProductionRework({
      production_order_id: poId,
      quantity,
      reason_code: reasonCode,
      from_operation_id: fromOp ?? null,
      target_operation_id: targetOp ?? null,
    });
  }
  const { data, error } = await supabase.rpc("record_production_rework", {
    p_production_order_id: poId,
    p_quantity: quantity,
    p_reason_code: reasonCode,
    p_from_operation_id: fromOp ?? null,
    p_target_operation_id: targetOp ?? null,
  });
  if (error) throw error;
  return data;
}
