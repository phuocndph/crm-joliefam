import type {
  AttendanceClosureStatus,
  AttendanceMethod,
  FactoryAttendanceClosureRow,
  FactoryAttendanceDayStatusRow,
  FactoryAttendanceRow,
  ProductionEntryRow,
  ProductionWorker,
  WorkerAttendanceMethod,
} from "@/integrations/supabase/production-execution-types";

export interface WorkerDayAttendance {
  worker: ProductionWorker;
  attendanceMethod: AttendanceMethod;
  entries: FactoryAttendanceRow[];
  activeEntries: FactoryAttendanceRow[];
  productionEntries: ProductionEntryRow[];
  activeProductionEntries: ProductionEntryRow[];
  dayStatus: FactoryAttendanceDayStatusRow | null;
  closure: FactoryAttendanceClosureRow | null;
  totalDayUnits: number;
  totalHours: number;
  /** Sản lượng payroll mới, chỉ lấy từ local_production_entries. */
  totalOutput: number;
  /** Sản lượng còn nằm trong local_attendance OUTPUT (giữ lịch sử, không cộng payroll). */
  legacyOutputQuantity: number;
  legacyOutputEntryCount: number;
  /** Chi phí legacy đã duyệt, giữ riêng để đối soát nhưng không vào tổng payroll. */
  legacyApprovedAmount: number;
  approvedAmount: number;
  hasPending: boolean;
  hasRejected: boolean;
  isRecorded: boolean;
  closureStatus: AttendanceClosureStatus;
}

interface WorkerDayInput {
  workers: ProductionWorker[];
  attendanceMethods: WorkerAttendanceMethod[];
  attendanceRows: FactoryAttendanceRow[];
  productionEntries?: ProductionEntryRow[];
  dayStatuses: FactoryAttendanceDayStatusRow[];
  closures: FactoryAttendanceClosureRow[];
  workDate: string;
}

const sum = (values: Array<number | null | undefined>) => values.reduce<number>((total, value) => total + Number(value || 0), 0);
const dateKey = (value: unknown) => String(value ?? "").slice(0, 10);

export function buildWorkerDayAttendance(input: WorkerDayInput): WorkerDayAttendance[] {
  const methods = new Map(input.attendanceMethods.map((item) => [item.worker_id, item.attendance_method]));
  const entriesByWorker = new Map<string, FactoryAttendanceRow[]>();
  const productionEntriesByWorker = new Map<string, ProductionEntryRow[]>();

  for (const row of input.attendanceRows) {
    if (dateKey(row.work_date) !== dateKey(input.workDate)) continue;
    const current = entriesByWorker.get(row.worker_id) ?? [];
    current.push(row);
    entriesByWorker.set(row.worker_id, current);
  }

  for (const row of input.productionEntries ?? []) {
    if (dateKey(row.work_date) !== dateKey(input.workDate)) continue;
    const current = productionEntriesByWorker.get(row.worker_id) ?? [];
    current.push(row);
    productionEntriesByWorker.set(row.worker_id, current);
  }

  const statuses = new Map(
    input.dayStatuses
      .filter((item) => dateKey(item.work_date) === dateKey(input.workDate))
      .map((item) => [item.worker_id, item]),
  );
  const closures = new Map(
    input.closures
      .filter((item) => dateKey(item.work_date) === dateKey(input.workDate))
      .map((item) => [item.worker_id, item]),
  );

  return input.workers
    .filter((worker) => worker.is_active)
    .map((worker) => {
      const entries = (entriesByWorker.get(worker.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const activeEntries = entries.filter((entry) => !entry.is_reversed && entry.workflow_status !== "REJECTED");
      const approvedEntries = activeEntries.filter((entry) => entry.workflow_status === "APPROVED" || entry.workflow_status === "LOCKED");
      const approvedLegacyOutputEntries = approvedEntries.filter((entry) => entry.attendance_method === "OUTPUT");
      const approvedPayrollEntries = approvedEntries.filter((entry) => entry.attendance_method !== "OUTPUT");
      const productionEntries = (productionEntriesByWorker.get(worker.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const activeProductionEntries = productionEntries.filter((entry) => entry.workflow_status !== "REJECTED" && entry.workflow_status !== "REVERSED");
      const approvedProductionEntries = activeProductionEntries.filter((entry) => entry.workflow_status === "APPROVED" || entry.workflow_status === "LOCKED");
      const legacyOutputEntries = activeEntries.filter((entry) => entry.attendance_method === "OUTPUT");
      const closure = closures.get(worker.id) ?? null;
      return {
        worker,
        attendanceMethod: methods.get(worker.id) ?? "DAY",
        entries,
        activeEntries,
        productionEntries,
        activeProductionEntries,
        dayStatus: statuses.get(worker.id) ?? null,
        closure,
        totalDayUnits: sum(activeEntries.map((entry) => entry.day_units)),
        totalHours: sum(activeEntries.map((entry) => entry.work_hours)),
        // Payroll production is sourced from the product-entry workflow only.
        // Legacy OUTPUT attendance remains visible separately for migration.
        totalOutput: sum(activeProductionEntries.map((entry) => entry.quantity)),
        legacyOutputQuantity: sum(legacyOutputEntries.map((entry) => entry.output_quantity)),
        legacyOutputEntryCount: legacyOutputEntries.length,
        legacyApprovedAmount: sum(approvedLegacyOutputEntries.filter((entry) => entry.cost_visible).map((entry) => entry.calculated_amount)),
        approvedAmount: sum(approvedPayrollEntries.filter((entry) => entry.cost_visible).map((entry) => entry.calculated_amount))
          + sum(approvedProductionEntries.filter((entry) => entry.cost_visible).map((entry) => entry.calculated_amount)),
        hasPending: activeEntries.some((entry) => entry.workflow_status === "SUBMITTED")
          || activeProductionEntries.some((entry) => entry.workflow_status === "SUBMITTED"),
        hasRejected: entries.some((entry) => !entry.is_reversed && entry.workflow_status === "REJECTED")
          || productionEntries.some((entry) => entry.workflow_status === "REJECTED"),
        isRecorded: activeEntries.length > 0 || activeProductionEntries.length > 0,
        closureStatus: closure?.status ?? "OPEN",
      } satisfies WorkerDayAttendance;
    })
    .sort((a, b) => a.worker.display_name.localeCompare(b.worker.display_name, "vi"));
}

export function attendanceValueLabel(row: WorkerDayAttendance): string {
  const values: string[] = [];
  if (row.totalDayUnits > 0) values.push(`${row.totalDayUnits.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ngày công`);
  if (row.totalHours > 0) values.push(`${row.totalHours.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} giờ`);
  if (row.totalOutput > 0) values.push(`${row.totalOutput.toLocaleString("vi-VN")} sản phẩm`);
  if (row.legacyOutputQuantity > 0) values.push(`${row.legacyOutputQuantity.toLocaleString("vi-VN")} SP từ bản ghi cũ cần chuyển`);
  if (values.length > 0) return values.join(" · ");
  return row.dayStatus ? "Đã cập nhật trạng thái ngày" : "Chưa chấm công";
}
