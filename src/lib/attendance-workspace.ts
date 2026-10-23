import type {
  AttendanceClosureStatus,
  AttendanceMethod,
  FactoryAttendanceClosureRow,
  FactoryAttendanceDayStatusRow,
  FactoryAttendanceRow,
  ProductionEntryRow,
  FactoryOvertimeRow,
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
  overtimeRows: FactoryOvertimeRow[];
  pendingRecordCount: number;
  pendingCounts: { attendance: number; production: number; overtime: number };
  confirmationStale: boolean;
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
  needsCorrection: boolean;
  isRecorded: boolean;
  closureStatus: AttendanceClosureStatus;
}

interface WorkerDayInput {
  workers: ProductionWorker[];
  attendanceMethods: WorkerAttendanceMethod[];
  attendanceRows: FactoryAttendanceRow[];
  productionEntries?: ProductionEntryRow[];
  overtimeRows?: FactoryOvertimeRow[];
  dayStatuses: FactoryAttendanceDayStatusRow[];
  closures: FactoryAttendanceClosureRow[];
  workDate: string;
}

const sum = (values: Array<number | null | undefined>) => values.reduce<number>((total, value) => total + Number(value || 0), 0);
const dateKey = (value: unknown) => String(value ?? "").slice(0, 10);

/** Rejection history needs action only while no replacement or day status resolves it. */
export function attendanceDayNeedsCorrection(
  sources: ReadonlyArray<{ status: string; isReversed?: boolean }>,
  hasDayStatus: boolean,
): boolean {
  const current = sources.filter(source => !source.isReversed && source.status !== "REVERSED");
  return !hasDayStatus && current.some(source => source.status === "REJECTED")
    && !current.some(source => source.status !== "REJECTED");
}

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
    .filter((worker) => (worker.is_active
      && (!worker.employment_start_date || worker.employment_start_date.slice(0,7)<=input.workDate.slice(0,7))
      && (!worker.employment_end_date || worker.employment_end_date.slice(0,7)>=input.workDate.slice(0,7)))
      || [...input.attendanceRows,...(input.productionEntries??[]),...(input.overtimeRows??[]),...input.dayStatuses,...input.closures].some(row=>row.worker_id===worker.id && dateKey(row.work_date).slice(0,7)===input.workDate.slice(0,7)))
    .map((worker) => {
      const entries = (entriesByWorker.get(worker.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const activeEntries = entries.filter((entry) => !entry.is_reversed && entry.workflow_status !== "REJECTED" && entry.workflow_status !== "REVERSED");
      const approvedEntries = activeEntries.filter((entry) => entry.workflow_status === "APPROVED" || entry.workflow_status === "LOCKED");
      const approvedLegacyOutputEntries = approvedEntries.filter((entry) => entry.attendance_method === "OUTPUT");
      const approvedPayrollEntries = approvedEntries.filter((entry) => entry.attendance_method !== "OUTPUT");
      const productionEntries = (productionEntriesByWorker.get(worker.id) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const activeProductionEntries = productionEntries.filter((entry) => !entry.is_reversed && entry.workflow_status !== "REJECTED" && entry.workflow_status !== "REVERSED");
      const approvedProductionEntries = activeProductionEntries.filter((entry) => entry.workflow_status === "APPROVED" || entry.workflow_status === "LOCKED");
      const legacyOutputEntries = activeEntries.filter((entry) => entry.attendance_method === "OUTPUT");
      const closure = closures.get(worker.id) ?? null;
      const overtimeRows=(input.overtimeRows??[]).filter(row=>row.worker_id===worker.id && dateKey(row.work_date)===dateKey(input.workDate));
      const pendingCounts={attendance:activeEntries.filter(row=>row.workflow_status==='SUBMITTED').length,production:activeProductionEntries.filter(row=>row.workflow_status==='SUBMITTED').length,overtime:overtimeRows.filter(row=>row.status==='SUBMITTED').length};
      const pendingRecordCount=pendingCounts.attendance+pendingCounts.production+pendingCounts.overtime;
      const sources = [
        ...entries.map(entry => ({ status: entry.workflow_status, isReversed: entry.is_reversed })),
        ...productionEntries.map(entry => ({ status: entry.workflow_status, isReversed: entry.is_reversed })),
        ...overtimeRows.map(entry => ({ status: entry.status, isReversed: false })),
      ];
      return {
        worker,
        attendanceMethod: methods.get(worker.id) ?? "DAY",
        entries,
        activeEntries,
        productionEntries,
        activeProductionEntries,
        overtimeRows,pendingCounts,pendingRecordCount,
        confirmationStale:closure?.status==='EMPLOYEE_CONFIRMED' && (closure.confirmed_revision==null || String(closure.confirmed_revision)!==String(closure.current_revision??'')),
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
        hasPending: pendingRecordCount>0,
        hasRejected: sources.some(source => !source.isReversed && source.status === "REJECTED"),
        needsCorrection: attendanceDayNeedsCorrection(sources, statuses.has(worker.id)),
        isRecorded: activeEntries.length > 0 || activeProductionEntries.length > 0 || overtimeRows.some(row=>!["REJECTED","REVERSED"].includes(row.status)) || statuses.has(worker.id),
        closureStatus: closure?.status ?? "OPEN",
      } satisfies WorkerDayAttendance;
    })
    .sort((a, b) => a.worker.display_name.localeCompare(b.worker.display_name, "vi"));
}

export function attendanceValueLabel(row: WorkerDayAttendance): string {
  if (row.needsCorrection) return "Nguồn đã bị từ chối; chưa có ghi nhận thay thế";
  const values: string[] = [];
  if (row.totalDayUnits > 0) values.push(`${row.totalDayUnits.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ngày công`);
  if (row.totalHours > 0) values.push(`${row.totalHours.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} giờ`);
  if (row.totalOutput > 0) values.push(`${row.totalOutput.toLocaleString("vi-VN")} sản phẩm`);
  if (row.legacyOutputQuantity > 0) values.push(`${row.legacyOutputQuantity.toLocaleString("vi-VN")} SP từ bản ghi cũ cần chuyển`);
  if (values.length > 0) return values.join(" · ");
  return row.dayStatus ? "Đã cập nhật trạng thái ngày" : row.overtimeRows.some(row=>!["REJECTED","REVERSED"].includes(row.status)) ? "Đã ghi nhận tăng ca" : "Chưa ghi nhận";
}

export function workerDayAction(row:WorkerDayAttendance): {label:string;reason:string;priority:number} {
  if(row.closureStatus==='LEADER_CONFIRMED')return {label:'Đã chốt',reason:'Muốn thay đổi cần quản lý mở lại có lý do.',priority:6};
  if(row.needsCorrection)return {label:'Cần sửa',reason:'Xem lý do từ chối và ghi nguồn thay thế đúng thực tế hoặc cập nhật trạng thái ngày trước khi xác nhận.',priority:0};
  if(row.confirmationStale)return {label:'Cần xác nhận lại',reason:'Nguồn đã đổi hoặc xác nhận cũ chưa có phiên bản. Nhân viên xem lại; quản lý được xác nhận hộ kèm lý do.',priority:1};
  if(row.hasPending)return {label:'Chờ duyệt',reason:`${row.pendingRecordCount} bản ghi: công ${row.pendingCounts.attendance}, sản lượng ${row.pendingCounts.production}, tăng ca ${row.pendingCounts.overtime}.`,priority:2};
  if(!row.isRecorded)return {label:'Chưa ghi nhận',reason:'Chưa có lịch ca để kết luận thiếu công hay vắng.',priority:7};
  if(row.closureStatus==='EMPLOYEE_CONFIRMED')return {label:'Có thể chốt',reason:'Đã xác nhận và không còn nguồn chờ duyệt; server kiểm tra lại khi chốt.',priority:4};
  return {label:'Chờ xác nhận',reason:'Nhân viên xem toàn ngày và xác nhận; quản lý có thể xác nhận hộ kèm lý do.',priority:3};
}

/** The day list and action queue use identical display filters. */
export function attendanceDayMatchesFilters(row: WorkerDayAttendance, method: "ALL" | AttendanceMethod, workflow: string) {
  const matchesMethod=method==='ALL' || row.attendanceMethod===method || row.activeEntries.some(entry=>entry.attendance_method===method) || (method==='OUTPUT' && row.activeProductionEntries.length>0);
  const matchesWorkflow=workflow==='ALL' || (workflow==='PENDING' && row.hasPending) || (workflow==='REJECTED' && row.hasRejected) || (workflow==='RECORDED' && row.isRecorded) || (workflow==='MISSING' && !row.isRecorded && !row.dayStatus) || (workflow==='CLOSED' && row.closureStatus==='LEADER_CONFIRMED');
  return matchesMethod && matchesWorkflow;
}
export function attendanceDayInQueue(row: WorkerDayAttendance, workDate:string, today:string, method: "ALL" | AttendanceMethod, workflow:string) {
  return workDate<=today && (row.isRecorded || row.needsCorrection) && row.closureStatus!=='LEADER_CONFIRMED' && attendanceDayMatchesFilters(row,method,workflow);
}
export function attendanceBulkScopeSignature(month:string,team:string,search:string,workerIds:readonly string[]) {
  return JSON.stringify([month,team,search,[...workerIds].sort()]);
}
