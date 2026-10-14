import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock3, Loader2, PackageCheck, Plus, Settings2, UserPlus, UserRoundCheck, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import {
  configureWorkerAttendanceMethod,
  createProductionWorker,
  listProductionAttendance,
  listProductionAttendanceMonth,
  listProductionOrderWorkerAssignments,
  assignProductionOrderWorker,
  endProductionOrderWorkerAssignment,
  setProductionOrderAssignmentEnforcement,
  reverseProductionAttendance,
  listWorkerAttendanceMethods,
  recordProductionAttendance,
} from "@/lib/production-execution";
import type {
  AttendanceMethod,
  ProductionAttendanceRow,
  ProductionOrderOperation,
  ProductionWorker,
  ProductionOrderStatus,
  WorkerAttendanceMethod,
  ProductionOrderWorkerAssignment,
  WorkerType,
} from "@/integrations/supabase/production-execution-types";

const padDatePart = (value: number) => String(value).padStart(2, "0");

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function localMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function formatWorkDate(value: string) {
  const parsed = parseDateKey(value);
  return parsed ? `${padDatePart(parsed.day)}/${padDatePart(parsed.month)}/${parsed.year}` : value;
}

function daysForMonth(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return [];
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const count = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, monthIndex, day);
    const weekday = date.getDay();
    return {
      day,
      dateKey: `${year}-${padDatePart(monthIndex + 1)}-${padDatePart(day)}`,
      weekday,
      weekdayLabel: weekday === 0 ? "CN" : `T${weekday + 1}`,
      isWeekend: weekday === 0 || weekday === 6,
    };
  });
}

function dateForMonth(monthKey: string) {
  return monthKey === localMonthKey() ? localDateKey() : `${monthKey}-01`;
}

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

const workerTypeLabels: Record<WorkerType, string> = {
  CUTTER: "Thợ cắt",
  SEWER: "Thợ may",
  IRONING: "Thợ là",
  QC: "Kiểm hàng",
  PACKER: "Đóng gói",
  HELPER: "Thợ phụ",
  SUPERVISOR: "Quản lý",
  GENERIC: "Bán thời gian / Khác",
};

const attendanceLabels: Record<AttendanceMethod, string> = {
  DAY: "Theo ngày",
  HOUR: "Theo giờ",
  OUTPUT: "Theo sản lượng",
};

function defaultMethod(worker?: ProductionWorker | null): AttendanceMethod {
  if (worker?.worker_type === "SUPERVISOR" || worker?.worker_type === "HELPER") return "DAY";
  if (worker?.worker_type === "SEWER") return "OUTPUT";
  return "HOUR";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return "Không thể hoàn tất thao tác.";
}

function attendanceValue(row: ProductionAttendanceRow) {
  if (row.attendance_method === "DAY") return `${number.format(row.day_units ?? 0)} ngày`;
  if (row.attendance_method === "HOUR") return `${number.format(row.work_hours ?? 0)} giờ`;
  return `${number.format(row.output_quantity ?? 0)} sản phẩm`;
}

type AttendanceTotals = {
  day: number;
  hour: number;
  output: number;
  cost: number;
};

function attendanceTotals(rows: ProductionAttendanceRow[]): AttendanceTotals {
  return rows.filter((row) => !row.is_reversed).reduce<AttendanceTotals>((totals, row) => ({
    day: totals.day + (row.day_units ?? 0),
    hour: totals.hour + (row.work_hours ?? 0),
    output: totals.output + (row.output_quantity ?? 0),
    cost: totals.cost + (row.calculated_amount ?? 0),
  }), { day: 0, hour: 0, output: 0, cost: 0 });
}

function CompactAttendanceValues({ totals }: { totals: AttendanceTotals }) {
  const hasValue = totals.day > 0 || totals.hour > 0 || totals.output > 0;
  if (!hasValue) return null;
  return (
    <div className="space-y-0.5 text-[11px] leading-4">
      {totals.day > 0 && <div title="Ngày công"><span className="font-semibold text-emerald-700">N</span> {number.format(totals.day)}</div>}
      {totals.hour > 0 && <div title="Giờ công"><span className="font-semibold text-sky-700">G</span> {number.format(totals.hour)}</div>}
      {totals.output > 0 && <div title="Sản lượng"><span className="font-semibold text-amber-700">SP</span> {number.format(totals.output)}</div>}
    </div>
  );
}

type Props = {
  productionOrderId: string;
  productionOrderStatus: ProductionOrderStatus;
  assignmentEnforced: boolean;
  workers: ProductionWorker[];
  operations: ProductionOrderOperation[];
  canRecord: boolean;
  canReverse: boolean;
  canManageWorkers: boolean;
  onLaborChanged: () => Promise<void> | void;
  onWorkersChanged: () => Promise<void> | void;
};

export default function ProductionAttendancePanel({
  productionOrderId,
  productionOrderStatus,
  assignmentEnforced,
  workers,
  operations,
  canRecord,
  canReverse,
  canManageWorkers,
  onLaborChanged,
  onWorkersChanged,
}: Props) {
  const { toast } = useToast();
  const loadRequestRef = useRef(0);
  const currentProductionOrderIdRef = useRef(productionOrderId);
  currentProductionOrderIdRef.current = productionOrderId;
  const [rows, setRows] = useState<ProductionAttendanceRow[]>([]);
  const [loadedProductionOrderId, setLoadedProductionOrderId] = useState(productionOrderId);
  const [workerMethods, setWorkerMethods] = useState<WorkerAttendanceMethod[]>([]);
  const [assignments, setAssignments] = useState<ProductionOrderWorkerAssignment[]>([]);
  const [workerMethodsLoaded, setWorkerMethodsLoaded] = useState(false);
  const [workerMethodsError, setWorkerMethodsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [workerOpen, setWorkerOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({ workerId: "", operationId: "", assignedFrom: localDateKey(), assignedTo: "", notes: "" });
  const [assignmentEndId, setAssignmentEndId] = useState<string | null>(null);
  const [assignmentEndDate, setAssignmentEndDate] = useState(localDateKey());
  const [assignmentEndReason, setAssignmentEndReason] = useState("");
  const [enforcementBusy, setEnforcementBusy] = useState(false);
  const [assignmentEnforcedState, setAssignmentEnforcedState] = useState(assignmentEnforced);
  const [reversalId, setReversalId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(localMonthKey());
  const [workerFilter, setWorkerFilter] = useState("ALL");
  const [methodFilter, setMethodFilter] = useState<AttendanceMethod | "ALL">("ALL");
  const [attendanceForm, setAttendanceForm] = useState({
    workerId: "",
    operationId: "",
    method: "HOUR" as AttendanceMethod,
    workDate: localDateKey(),
    dayUnits: "1",
    workHours: "8",
    outputQuantity: "",
    standardHoursPerDay: "8",
    notes: "",
    idempotencyKey: crypto.randomUUID(),
  });
  const [workerForm, setWorkerForm] = useState({ employeeCode: "", displayName: "", workerType: "GENERIC" as WorkerType });
  const [rateForm, setRateForm] = useState({
    workerId: "",
    method: "HOUR" as AttendanceMethod,
    rateAmount: "",
    effectiveFrom: localDateKey(),
    effectiveTo: "",
    standardDaysPerMonth: "26",
    standardHoursPerDay: "8",
    reason: "",
  });

  const loadRows = useCallback(async () => {
    const requestedProductionOrderId = productionOrderId;
    if (requestedProductionOrderId !== currentProductionOrderIdRef.current) return;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    setRows([]);
    setWorkerMethods([]);
    setWorkerMethodsLoaded(false);
    setWorkerMethodsError(null);
    try {
      const [attendanceResult, methodResult, assignmentResult] = await Promise.allSettled([
        listProductionAttendanceMonth(requestedProductionOrderId, `${selectedMonth}-01`, true),
        listWorkerAttendanceMethods(),
        listProductionOrderWorkerAssignments(requestedProductionOrderId),
      ]);
      if (requestId !== loadRequestRef.current || requestedProductionOrderId !== currentProductionOrderIdRef.current) return;
      if (attendanceResult.status === "rejected") throw attendanceResult.reason;
      setRows(attendanceResult.value);
      setLoadedProductionOrderId(requestedProductionOrderId);
      if (methodResult.status === "fulfilled") {
        setWorkerMethods(methodResult.value);
        setWorkerMethodsLoaded(true);
      } else {
        setWorkerMethodsError(errorMessage(methodResult.reason));
      }
      setAssignments(assignmentResult.status === "fulfilled" ? assignmentResult.value : []);
    } catch (error) {
      if (requestId !== loadRequestRef.current || requestedProductionOrderId !== currentProductionOrderIdRef.current) return;
      setRows([]);
      setLoadedProductionOrderId(requestedProductionOrderId);
      setLoadError(errorMessage(error));
    } finally {
      if (requestId === loadRequestRef.current && requestedProductionOrderId === currentProductionOrderIdRef.current) setLoading(false);
    }
  }, [productionOrderId, selectedMonth]);

  useEffect(() => {
    setAttendanceOpen(false);
    setRateOpen(false);
    setAttendanceForm((current) => ({ ...current, operationId: "", idempotencyKey: crypto.randomUUID() }));
    void loadRows();
    return () => { loadRequestRef.current += 1; };
  }, [loadRows]);

  useEffect(() => {
    setAssignmentEnforcedState(assignmentEnforced);
  }, [assignmentEnforced, productionOrderId]);

  const activeWorkers = useMemo(() => workers.filter((worker) => worker.is_active), [workers]);
  const selectedAttendanceWorker = activeWorkers.find((worker) => worker.id === attendanceForm.workerId);
  const selectedAttendanceOperation = operations.find((operation) => operation.id === attendanceForm.operationId);
  const selectedRateWorker = activeWorkers.find((worker) => worker.id === rateForm.workerId);
  // Attendance remains valid while a released order is temporarily paused;
  // the server-side RPC enforces the same allowlist.
  const canPostForStatus = ["RELEASED", "IN_PROGRESS", "ON_HOLD"].includes(productionOrderStatus);
  const methodForWorker = useCallback((worker?: ProductionWorker | null): AttendanceMethod => (
    workerMethods.find((item) => item.worker_id === worker?.id)?.attendance_method ?? defaultMethod(worker)
  ), [workerMethods]);

  const monthDays = useMemo(() => daysForMonth(selectedMonth), [selectedMonth]);
  const selectedMonthStart = `${selectedMonth}-01`;
  const selectedMonthEnd = monthDays.length ? monthDays[monthDays.length - 1].dateKey : selectedMonthStart;
  const assignmentsInMonth = useMemo(() => assignments.filter((assignment) => (
    assignment.assigned_from <= selectedMonthEnd
    && (!assignment.assigned_to || assignment.assigned_to >= selectedMonthStart)
  )), [assignments, selectedMonthEnd, selectedMonthStart]);
  const assignmentMethod = useCallback((assignment: ProductionOrderWorkerAssignment): AttendanceMethod => (
    methodForWorker(activeWorkers.find((worker) => worker.id === assignment.worker_id))
  ), [activeWorkers, methodForWorker]);
  const visibleRows = useMemo(
    () => loadedProductionOrderId === productionOrderId ? rows : [],
    [loadedProductionOrderId, productionOrderId, rows],
  );
  const rowsInMonth = useMemo(
    () => visibleRows.filter((row) => row.work_date.slice(0, 7) === selectedMonth),
    [visibleRows, selectedMonth],
  );
  const monthWorkerOptions = useMemo(() => {
    const byWorker = new Map<string, ProductionAttendanceRow>();
    rowsInMonth.forEach((row) => {
      if (!byWorker.has(row.worker_id)) byWorker.set(row.worker_id, row);
    });
    assignmentsInMonth.forEach((assignment) => {
      if (!byWorker.has(assignment.worker_id)) byWorker.set(assignment.worker_id, {
        id: `assignment-${assignment.id}`, production_order_id: assignment.production_order_id,
        production_order_operation_id: assignment.production_order_operation_id ?? "", operation_code: "", operation_name: "",
        worker_id: assignment.worker_id, employee_code: assignment.employee_code, worker_name: assignment.worker_name,
        worker_type: assignment.worker_type, attendance_method: assignmentMethod(assignment),
        work_date: `${selectedMonth}-01`, day_units: null, work_hours: null, output_quantity: null, rate_amount: null,
        calculated_amount: null, cost_classification: "DIRECT_LABOR", is_estimated: false, notes: null, created_at: "", cost_visible: false,
      });
    });
    return Array.from(byWorker.values()).sort((left, right) => left.worker_name.localeCompare(right.worker_name, "vi"));
  }, [assignmentMethod, assignmentsInMonth, rowsInMonth, selectedMonth]);
  const filteredRows = useMemo(() => rowsInMonth
    .filter((row) => workerFilter === "ALL" || row.worker_id === workerFilter)
    .filter((row) => methodFilter === "ALL" || row.attendance_method === methodFilter),
  [methodFilter, rowsInMonth, workerFilter]);
  const sheetWorkers = useMemo(() => {
    const byWorker = new Map<string, ProductionAttendanceRow[]>();
    filteredRows.forEach((row) => {
      const workerRows = byWorker.get(row.worker_id) ?? [];
      workerRows.push(row);
      byWorker.set(row.worker_id, workerRows);
    });
    assignmentsInMonth.forEach((assignment) => {
      if (!byWorker.has(assignment.worker_id)
        && (workerFilter === "ALL" || workerFilter === assignment.worker_id)
        && (methodFilter === "ALL" || assignmentMethod(assignment) === methodFilter)) {
        byWorker.set(assignment.worker_id, []);
      }
    });
    return Array.from(byWorker.entries())
      .map(([workerId, workerRows]) => {
        const assignment = assignments.find((item) => item.worker_id === workerId);
        const worker = workerRows[0] ?? {
          id: `assignment-${assignment?.id ?? workerId}`, production_order_id: productionOrderId,
          production_order_operation_id: assignment?.production_order_operation_id ?? "", operation_code: "", operation_name: "",
          worker_id: workerId, employee_code: assignment?.employee_code ?? "", worker_name: assignment?.worker_name ?? "",
          worker_type: assignment?.worker_type ?? "GENERIC", attendance_method: assignment ? assignmentMethod(assignment) : methodForWorker(activeWorkers.find((item) => item.id === workerId)),
          work_date: `${selectedMonth}-01`, day_units: null, work_hours: null, output_quantity: null, rate_amount: null,
          calculated_amount: null, cost_classification: "DIRECT_LABOR" as const, is_estimated: false, notes: null, created_at: "", cost_visible: false,
        } as ProductionAttendanceRow;
        return { workerId, worker, rows: workerRows };
      })
      .sort((left, right) => left.worker.worker_name.localeCompare(right.worker.worker_name, "vi"));
  }, [activeWorkers, assignmentMethod, assignments, assignmentsInMonth, filteredRows, methodFilter, methodForWorker, productionOrderId, selectedMonth, workerFilter]);
  const overallTotals = useMemo(() => attendanceTotals(filteredRows), [filteredRows]);
  const overallCostVisible = filteredRows.length > 0
    && filteredRows.every((row) => row.cost_visible && row.calculated_amount !== null);
  const detailedRows = useMemo(() => [...filteredRows].sort((left, right) => {
    const dateOrder = right.work_date.localeCompare(left.work_date);
    return dateOrder || right.created_at.localeCompare(left.created_at);
  }), [filteredRows]);

  useEffect(() => {
    if (workerFilter !== "ALL" && !monthWorkerOptions.some((row) => row.worker_id === workerFilter)) {
      setWorkerFilter("ALL");
    }
  }, [monthWorkerOptions, workerFilter]);

  const actionBlockers = [
    !activeWorkers.length ? "Chưa có nhân sự đang hoạt động. Hãy tạo nhân sự trước khi chấm công." : null,
    !operations.length ? "Lệnh này chưa có công đoạn để ghi nhận chấm công." : null,
    !canPostForStatus ? "Trạng thái hiện tại của lệnh chưa cho phép ghi nhận chấm công." : null,
  ].filter((message): message is string => Boolean(message));

  function openAttendanceDialog() {
    const worker = activeWorkers[0];
    setAttendanceForm({
      workerId: worker?.id ?? "",
      operationId: operations[0]?.id ?? "",
      method: methodForWorker(worker),
      workDate: dateForMonth(selectedMonth),
      dayUnits: "1",
      workHours: "8",
      outputQuantity: "",
      standardHoursPerDay: "8",
      notes: "",
      idempotencyKey: crypto.randomUUID(),
    });
    setAttendanceOpen(true);
  }

  function openRateDialog() {
    if (!workerMethodsLoaded || workerMethodsError) return;
    const worker = activeWorkers[0];
    setRateForm({
      workerId: worker?.id ?? "",
      method: methodForWorker(worker),
      rateAmount: "",
      effectiveFrom: localDateKey(),
      effectiveTo: "",
      standardDaysPerMonth: "26",
      standardHoursPerDay: "8",
      reason: "",
    });
    setRateOpen(true);
  }

  function openAssignmentDialog() {
    const worker = activeWorkers[0];
    setAssignmentForm({ workerId: worker?.id ?? "", operationId: "", assignedFrom: dateForMonth(selectedMonth), assignedTo: "", notes: "" });
    setAssignmentOpen(true);
  }

  async function submitAssignment() {
    if (!assignmentForm.workerId || !assignmentForm.assignedFrom) return;
    setBusy(true);
    try {
      await assignProductionOrderWorker({
        production_order_id: productionOrderId,
        worker_id: assignmentForm.workerId,
        production_order_operation_id: assignmentForm.operationId || null,
        assigned_from: assignmentForm.assignedFrom,
        assigned_to: assignmentForm.assignedTo || null,
        notes: assignmentForm.notes.trim() || null,
      });
      toast({ title: "Đã phân công nhân sự" });
      setAssignmentOpen(false);
      await loadRows();
    } catch (error) {
      toast({ title: "Không thể phân công", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function submitAssignmentEnd() {
    if (!assignmentEndId) return;
    setBusy(true);
    try {
      await endProductionOrderWorkerAssignment(assignmentEndId, assignmentEndDate, assignmentEndReason.trim() || null);
      toast({ title: "Đã kết thúc phân công" });
      setAssignmentEndId(null);
      setAssignmentEndDate(localDateKey());
      setAssignmentEndReason("");
      await loadRows();
    } catch (error) {
      toast({ title: "Không thể kết thúc phân công", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleAssignmentEnforcement() {
    setEnforcementBusy(true);
    try {
      const nextValue = !assignmentEnforcedState;
      await setProductionOrderAssignmentEnforcement(productionOrderId, nextValue, `${nextValue ? "Bật" : "Tắt"} kiểm soát phân công từ bảng chấm công`);
      setAssignmentEnforcedState(nextValue);
      toast({ title: nextValue ? "Đã bật kiểm soát phân công" : "Đã tắt kiểm soát phân công" });
      await loadRows();
    } catch (error) {
      toast({ title: "Không thể bật kiểm soát phân công", description: errorMessage(error), variant: "destructive" });
    } finally {
      setEnforcementBusy(false);
    }
  }

  async function submitReversal() {
    if (!reversalId || !reversalReason.trim()) return;
    setBusy(true);
    try {
      await reverseProductionAttendance(reversalId, reversalReason.trim(), crypto.randomUUID());
      toast({ title: "Đã đảo bản ghi chấm công" });
      setReversalId(null);
      setReversalReason("");
      await loadRows();
      await onLaborChanged();
    } catch (error) {
      toast({ title: "Không thể đảo bản ghi", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function submitAttendance() {
    if (!workerMethodsLoaded || workerMethodsError || !selectedAttendanceWorker || !selectedAttendanceOperation) {
      toast({
        title: "Không thể chấm công",
        description: "Dữ liệu nhân sự, công đoạn hoặc hình thức công không còn hợp lệ. Hãy đóng biểu mẫu và mở lại.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      await recordProductionAttendance({
        operation_id: attendanceForm.operationId,
        worker_id: attendanceForm.workerId,
        attendance_method: attendanceForm.method,
        work_date: attendanceForm.workDate,
        day_units: attendanceForm.method === "DAY" ? Number(attendanceForm.dayUnits) : null,
        work_hours: attendanceForm.method === "HOUR" ? Number(attendanceForm.workHours) : null,
        output_quantity: attendanceForm.method === "OUTPUT" ? Number(attendanceForm.outputQuantity) : null,
        standard_hours_per_day: Number(attendanceForm.standardHoursPerDay),
        idempotency_key: attendanceForm.idempotencyKey,
        notes: attendanceForm.notes.trim() || null,
      });
      toast({ title: "Đã ghi nhận chấm công" });
      setAttendanceOpen(false);
      setSelectedMonth(attendanceForm.workDate.slice(0, 7));
      await loadRows();
      await onLaborChanged();
    } catch (error) {
      toast({ title: "Không thể chấm công", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function submitWorker() {
    setBusy(true);
    try {
      await createProductionWorker({
        employee_code: workerForm.employeeCode.trim().toUpperCase(),
        display_name: workerForm.displayName.trim(),
        worker_type: workerForm.workerType,
      });
      toast({ title: "Đã thêm nhân sự sản xuất" });
      setWorkerOpen(false);
      setWorkerForm({ employeeCode: "", displayName: "", workerType: "GENERIC" });
      await onWorkersChanged();
    } catch (error) {
      toast({ title: "Không thể thêm nhân sự", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function submitRate() {
    if (!workerMethodsLoaded || workerMethodsError || !selectedRateWorker) {
      toast({
        title: "Không thể lưu mức công",
        description: "Chưa tải được cấu hình hình thức công hiện tại. Hãy tải lại dữ liệu trước khi thay đổi mức công.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      await configureWorkerAttendanceMethod({
        worker_id: rateForm.workerId,
        attendance_method: rateForm.method,
        rate_amount: Number(rateForm.rateAmount),
        effective_from: rateForm.effectiveFrom,
        effective_to: rateForm.effectiveTo || null,
        standard_days_per_month: Number(rateForm.standardDaysPerMonth),
        standard_hours_per_day: Number(rateForm.standardHoursPerDay),
        reason: rateForm.reason.trim() || null,
      });
      toast({ title: "Đã lưu hình thức và mức công" });
      setWorkerMethods((current) => [
        ...current.filter((item) => item.worker_id !== rateForm.workerId),
        {
          worker_id: rateForm.workerId,
          attendance_method: rateForm.method,
          compensation_type: rateForm.method === "DAY"
            ? selectedRateWorker?.worker_type === "SUPERVISOR" ? "MONTHLY_MANAGER" : "MONTHLY_HELPER"
            : rateForm.method === "HOUR" ? "HOURLY" : "PIECE_RATE",
        },
      ]);
      setRateOpen(false);
    } catch (error) {
      toast({ title: "Không thể lưu mức công", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const attendanceDateWithinMonth = attendanceForm.workDate >= selectedMonthStart && attendanceForm.workDate <= selectedMonthEnd;
  const attendanceRowsForWorkerDate = visibleRows.filter((row) => (
    row.worker_id === attendanceForm.workerId
    && row.work_date.slice(0, 10) === attendanceForm.workDate
    && !row.is_reversed
  ));
  const existingDayUnits = attendanceRowsForWorkerDate.reduce((total, row) => total + (row.day_units ?? 0), 0);
  const existingWorkHours = attendanceRowsForWorkerDate.reduce((total, row) => total + (row.work_hours ?? 0), 0);
  const attendanceAggregateError = attendanceForm.method === "DAY" && existingDayUnits + Number(attendanceForm.dayUnits) > 2
    ? `Tổng ngày công của nhân sự này trong ngày sẽ vượt 2 ngày (đã có ${number.format(existingDayUnits)}).`
    : attendanceForm.method === "HOUR" && existingWorkHours + Number(attendanceForm.workHours) > 24
      ? `Tổng giờ công của nhân sự này trong ngày sẽ vượt 24 giờ (đã có ${number.format(existingWorkHours)}).`
      : null;
  const validAttendance = workerMethodsLoaded
    && !workerMethodsError
    && attendanceDateWithinMonth
    && !attendanceAggregateError
    && Boolean(selectedAttendanceWorker && selectedAttendanceOperation && attendanceForm.workDate)
    && (attendanceForm.method === "DAY"
      ? Number(attendanceForm.dayUnits) > 0 && Number(attendanceForm.standardHoursPerDay) > 0
      : attendanceForm.method === "HOUR"
        ? Number(attendanceForm.workHours) > 0
        : Number(attendanceForm.outputQuantity) > 0);
  const validWorker = workerForm.employeeCode.trim().length >= 2 && workerForm.displayName.trim().length >= 2;
  const validRate = workerMethodsLoaded && !workerMethodsError && Boolean(selectedRateWorker && rateForm.effectiveFrom && rateForm.rateAmount.trim()) && Number(rateForm.rateAmount) >= 0
    && (rateForm.method !== "DAY" || (Number(rateForm.standardDaysPerMonth) > 0 && Number(rateForm.standardHoursPerDay) > 0));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-medium">Bảng chấm công</h4>
          <div className="text-xs text-muted-foreground">Theo dõi ngày công của riêng lệnh sản xuất này</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageWorkers && <Button size="sm" variant="outline" onClick={() => setWorkerOpen(true)}><UserPlus className="mr-2 h-4 w-4" />Nhân sự</Button>}
          {canManageWorkers && <Button size="sm" variant="outline" onClick={openAssignmentDialog} disabled={!activeWorkers.length}><UserRoundCheck className="mr-2 h-4 w-4" />Phân công</Button>}
          {canManageWorkers && <Button size="sm" variant="outline" onClick={openRateDialog} disabled={!activeWorkers.length || !workerMethodsLoaded || Boolean(workerMethodsError)}><Settings2 className="mr-2 h-4 w-4" />Mức công</Button>}
          {canRecord && <Button size="sm" onClick={openAttendanceDialog} disabled={!canPostForStatus || !activeWorkers.length || !operations.length || !workerMethodsLoaded || Boolean(workerMethodsError)}><Plus className="mr-2 h-4 w-4" />Chấm công</Button>}
        </div>
      </div>

      {actionBlockers.length > 0 && (
        <div className="space-y-1 text-xs text-amber-700">
          {actionBlockers.map((message) => <div key={message}>{message}</div>)}
        </div>
      )}
      {workerMethodsError && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Không tải được cấu hình hình thức công: {workerMethodsError}. Đã tạm khóa ghi nhận để tránh dùng hình thức suy đoán sai.
        </div>
      )}
      {assignments.length > 0 && (
        <div className="space-y-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{assignments.length} phân công. Nhân sự chưa phát sinh công vẫn được hiển thị trong bảng tháng.</span>
            {canManageWorkers && (
              <Button size="sm" variant="outline" onClick={() => void toggleAssignmentEnforcement()} disabled={enforcementBusy}>
                {enforcementBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <UserRoundCheck className="mr-2 h-3.5 w-3.5" />}
                {assignmentEnforcedState ? "Tắt kiểm soát phân công" : "Bật kiểm soát phân công"}
              </Button>
            )}
          </div>
          {canManageWorkers && (
            <div className="flex flex-wrap gap-2">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="flex items-center gap-1 rounded border bg-background px-2 py-1">
                  <span>{assignment.employee_code} · {assignment.worker_name}</span>
                  <span className="text-muted-foreground">({assignment.assigned_from}{assignment.assigned_to ? ` - ${assignment.assigned_to}` : " - đang hoạt động"})</span>
                  {assignment.is_active && <Button type="button" size="icon" variant="ghost" className="h-6 w-6" title="Kết thúc phân công" onClick={() => { setAssignmentEndId(assignment.id); setAssignmentEndDate(localDateKey() < assignment.assigned_from ? assignment.assigned_from : localDateKey()); setAssignmentEndReason(""); }}><RotateCcw className="h-3 w-3" /></Button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 border-y py-3">
        <div className="min-w-40 space-y-1">
          <Label htmlFor="attendance-month" className="text-xs">Tháng chấm công</Label>
          <Input
            id="attendance-month"
            type="month"
            value={selectedMonth}
            onChange={(event) => event.target.value && setSelectedMonth(event.target.value)}
            className="h-9"
          />
        </div>
        <div className="min-w-52 space-y-1">
          <Label className="text-xs">Nhân sự trong tháng</Label>
          <Select value={workerFilter} onValueChange={setWorkerFilter}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả nhân sự được phân công</SelectItem>
              {monthWorkerOptions.map((row) => <SelectItem key={row.worker_id} value={row.worker_id}>{row.employee_code} · {row.worker_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-44 space-y-1">
          <Label className="text-xs">Hình thức</Label>
          <Select value={methodFilter} onValueChange={(value) => setMethodFilter(value as AttendanceMethod | "ALL")}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả hình thức</SelectItem>
              <SelectItem value="DAY">Theo ngày</SelectItem>
              <SelectItem value="HOUR">Theo giờ</SelectItem>
              <SelectItem value="OUTPUT">Theo sản lượng</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="pb-2 text-xs text-muted-foreground">{filteredRows.length} lượt phù hợp</div>
      </div>

      {loadError ? (
        <div className="rounded-md border border-destructive/40 p-4 text-sm text-destructive">{loadError}</div>
      ) : loading ? (
        <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b pb-3 text-sm sm:grid-cols-5">
            <div className="col-span-2 sm:col-span-1">
              <div className="text-xs text-muted-foreground">Phân bổ cho lệnh này</div>
              <div className="font-medium">Tháng {selectedMonth.slice(5, 7)}/{selectedMonth.slice(0, 4)}</div>
            </div>
            <div><div className="text-xs text-muted-foreground">Ngày công</div><div className="font-medium">{number.format(overallTotals.day)}</div></div>
            <div><div className="text-xs text-muted-foreground">Giờ công</div><div className="font-medium">{number.format(overallTotals.hour)}</div></div>
            <div><div className="text-xs text-muted-foreground">Sản lượng</div><div className="font-medium">{number.format(overallTotals.output)}</div></div>
            <div>
              <div className="text-xs text-muted-foreground">Chi phí phân bổ</div>
              <div className="font-medium">{overallCostVisible ? money.format(overallTotals.cost) : filteredRows.length ? "Ẩn theo quyền" : "-"}</div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h5 className="text-sm font-medium">Bảng tháng</h5>
                <p className="text-xs text-muted-foreground">N: ngày công · G: giờ công · SP: sản lượng. Kéo ngang để xem đủ ngày.</p>
              </div>
              <div className="text-xs text-muted-foreground">Chỉ tổng hợp dữ liệu đã ghi nhận cho lệnh đang chọn, không phải bảng lương toàn công ty.</div>
            </div>
            <div className="max-w-full overflow-x-auto rounded-md border">
              <Table disableWrapper className="table-fixed" style={{ minWidth: `${390 + monthDays.length * 58}px` }}>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[210px] border-r bg-background px-3 xl:sticky xl:left-0 xl:z-20">Nhân sự</TableHead>
                    {monthDays.map((day) => (
                      <TableHead key={day.dateKey} className={`w-[58px] px-1 text-center ${day.isWeekend ? "bg-muted/60" : ""}`}>
                        <div className={day.weekday === 0 ? "text-destructive" : ""}>{day.day}</div>
                        <div className="text-[10px] font-normal">{day.weekdayLabel}</div>
                      </TableHead>
                    ))}
                    <TableHead className="w-[180px] border-l bg-background px-3">Tổng tháng</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheetWorkers.map(({ workerId, worker, rows: workerRows }) => {
                    const workerTotals = attendanceTotals(workerRows);
                     const workerCostVisible = workerRows.length > 0
                       && workerRows.every((row) => row.cost_visible && (row.is_reversed || row.calculated_amount !== null));
                    return (
                      <TableRow key={workerId}>
                        <TableCell className="w-[210px] border-r bg-background px-3 py-2 xl:sticky xl:left-0 xl:z-10">
                          <div className="truncate font-medium" title={worker.worker_name}>{worker.worker_name}</div>
                          <div className="truncate text-xs text-muted-foreground">{worker.employee_code} · {workerTypeLabels[worker.worker_type] ?? worker.worker_type}</div>
                        </TableCell>
                        {monthDays.map((day) => {
                          const dayRows = workerRows.filter((row) => row.work_date.slice(0, 10) === day.dateKey);
                          return (
                            <TableCell key={day.dateKey} className={`h-14 w-[58px] px-1.5 py-1 text-center align-middle ${day.isWeekend ? "bg-muted/30" : ""}`}>
                              <CompactAttendanceValues totals={attendanceTotals(dayRows)} />
                            </TableCell>
                          );
                        })}
                        <TableCell className="w-[180px] border-l bg-background px-3 py-2">
                          <CompactAttendanceValues totals={workerTotals} />
                          <div className="mt-1 truncate border-t pt-1 text-[11px] font-medium" title={workerCostVisible ? money.format(workerTotals.cost) : "Chi phí bị ẩn theo quyền"}>
                             CP: {!workerRows.length ? "-" : workerCostVisible ? money.format(workerTotals.cost) : "Ẩn"}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!sheetWorkers.length && (
                    <TableRow>
                      <TableCell colSpan={monthDays.length + 2} className="h-24 text-center text-muted-foreground">
                        Chưa có chấm công trong tháng {selectedMonth.slice(5, 7)}/{selectedMonth.slice(0, 4)} cho lệnh này
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <div className="mb-2">
              <h5 className="text-sm font-medium">Chi tiết lượt chấm công</h5>
              <p className="text-xs text-muted-foreground">Dữ liệu chi tiết theo bộ lọc tháng, nhân sự và hình thức ở trên.</p>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table disableWrapper className="min-w-[1120px]">
                <TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead>Nhân sự</TableHead><TableHead>Vị trí</TableHead><TableHead>Công đoạn</TableHead><TableHead>Hình thức</TableHead><TableHead className="text-right">Khối lượng</TableHead><TableHead className="text-right">Mức công</TableHead><TableHead className="text-right">Thành tiền</TableHead><TableHead>Ghi chú</TableHead></TableRow></TableHeader>
                <TableBody>
                  {detailedRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{formatWorkDate(row.work_date)}</TableCell>
                      <TableCell><div className="font-medium">{row.worker_name}</div><div className="text-xs text-muted-foreground">{row.employee_code}</div></TableCell>
                      <TableCell>{workerTypeLabels[row.worker_type] ?? row.worker_type}</TableCell>
                      <TableCell><div>{row.operation_name}</div><div className="text-xs text-muted-foreground">{row.operation_code}</div></TableCell>
                      <TableCell><Badge variant={row.is_reversed ? "destructive" : "outline"}>{row.is_reversed ? "Đã đảo" : attendanceLabels[row.attendance_method]}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap text-right">{attendanceValue(row)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{row.cost_visible && row.rate_amount !== null ? money.format(row.rate_amount) : "Ẩn"}</TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium">{row.cost_visible && row.calculated_amount !== null ? money.format(row.calculated_amount) : "Ẩn"}{row.is_estimated && <Badge variant="outline" className="ml-2">Ước tính</Badge>}</TableCell>
                      <TableCell className="max-w-64 whitespace-normal text-sm text-muted-foreground">
                        {row.is_reversed ? `Đã đảo${row.reversal_reason ? `: ${row.reversal_reason}` : ""}` : row.notes || "-"}
                        {canReverse && !row.is_reversed && <Button size="icon" variant="ghost" className="ml-1 h-7 w-7" title="Đảo bản ghi" onClick={() => setReversalId(row.id)}><RotateCcw className="h-3.5 w-3.5" /></Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!detailedRows.length && <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">Chưa có chấm công trong tháng {selectedMonth.slice(5, 7)}/{selectedMonth.slice(0, 4)} cho lệnh này</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      <Dialog open={attendanceOpen} onOpenChange={setAttendanceOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>Chấm công lệnh sản xuất</DialogTitle><DialogDescription className="sr-only">Ghi nhận ngày công, giờ công hoặc sản lượng cho một công đoạn.</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Nhân sự</Label><Select value={attendanceForm.workerId} onValueChange={(value) => { const worker = activeWorkers.find((item) => item.id === value); setAttendanceForm((current) => ({ ...current, workerId: value, method: methodForWorker(worker) })); }}><SelectTrigger><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger><SelectContent>{activeWorkers.map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} · {worker.display_name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Vị trí</Label><div className="flex h-10 items-center rounded-md border px-3 text-sm">{selectedAttendanceWorker ? workerTypeLabels[selectedAttendanceWorker.worker_type] : "-"}</div></div>
            </div>
            <div className="space-y-2"><Label>Công đoạn</Label><Select value={attendanceForm.operationId} onValueChange={(value) => setAttendanceForm((current) => ({ ...current, operationId: value }))}><SelectTrigger><SelectValue placeholder="Chọn công đoạn" /></SelectTrigger><SelectContent>{operations.map((operation) => <SelectItem key={operation.id} value={operation.id}>{operation.sequence}. {operation.operation_name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2">
              <Label>Hình thức</Label>
              <ToggleGroup type="single" value={attendanceForm.method} onValueChange={(value) => value && setAttendanceForm((current) => ({ ...current, method: value as AttendanceMethod }))} className="grid grid-cols-3">
                <ToggleGroupItem value="DAY" aria-label="Theo ngày" className="gap-2"><CalendarDays className="h-4 w-4" /><span className="hidden sm:inline">Theo ngày</span></ToggleGroupItem>
                <ToggleGroupItem value="HOUR" aria-label="Theo giờ" className="gap-2"><Clock3 className="h-4 w-4" /><span className="hidden sm:inline">Theo giờ</span></ToggleGroupItem>
                <ToggleGroupItem value="OUTPUT" aria-label="Theo sản lượng" className="gap-2"><PackageCheck className="h-4 w-4" /><span className="hidden sm:inline">Sản lượng</span></ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Ngày làm</Label><Input type="date" min={selectedMonthStart} max={selectedMonthEnd} value={attendanceForm.workDate} onChange={(event) => setAttendanceForm((current) => ({ ...current, workDate: event.target.value }))} /></div>
              {attendanceForm.method === "DAY" && <div className="space-y-2"><Label>Số ngày công</Label><Input type="number" min="0.25" max="2" step="0.25" value={attendanceForm.dayUnits} onChange={(event) => setAttendanceForm((current) => ({ ...current, dayUnits: event.target.value }))} /></div>}
              {attendanceForm.method === "HOUR" && <div className="space-y-2"><Label>Số giờ</Label><Input type="number" min="0.25" max="24" step="0.25" value={attendanceForm.workHours} onChange={(event) => setAttendanceForm((current) => ({ ...current, workHours: event.target.value }))} /></div>}
              {attendanceForm.method === "OUTPUT" && <div className="space-y-2"><Label>Sản lượng đạt</Label><Input type="number" min="0.01" step="0.01" value={attendanceForm.outputQuantity} onChange={(event) => setAttendanceForm((current) => ({ ...current, outputQuantity: event.target.value }))} /></div>}
            </div>
            {!attendanceDateWithinMonth && <div className="text-xs text-destructive">Ngày làm phải nằm trong tháng {selectedMonth.slice(5, 7)}/{selectedMonth.slice(0, 4)} đang chọn.</div>}
            {attendanceAggregateError && (
              <div className="text-xs text-destructive">
                {attendanceAggregateError} Giới hạn này chỉ kiểm tra dữ liệu của lệnh đang tải.
              </div>
            )}
            {attendanceForm.method === "DAY" && <div className="space-y-2"><Label>Giờ chuẩn / ngày</Label><Input type="number" min="1" max="24" step="0.5" value={attendanceForm.standardHoursPerDay} onChange={(event) => setAttendanceForm((current) => ({ ...current, standardHoursPerDay: event.target.value }))} /></div>}
            <div className="space-y-2"><Label>Ghi chú</Label><Textarea value={attendanceForm.notes} onChange={(event) => setAttendanceForm((current) => ({ ...current, notes: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAttendanceOpen(false)}>Đóng</Button><Button onClick={submitAttendance} disabled={!validAttendance || busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Ghi nhận</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignmentOpen} onOpenChange={setAssignmentOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Phân công nhân sự cho lệnh</DialogTitle><DialogDescription className="sr-only">Chọn nhân sự, phạm vi công đoạn và thời gian được phép chấm công.</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2"><Label>Nhân sự</Label><Select value={assignmentForm.workerId} onValueChange={(value) => setAssignmentForm((current) => ({ ...current, workerId: value }))}><SelectTrigger><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger><SelectContent>{activeWorkers.map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} · {worker.display_name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Công đoạn (bỏ trống = toàn lệnh)</Label><Select value={assignmentForm.operationId || "ALL"} onValueChange={(value) => setAssignmentForm((current) => ({ ...current, operationId: value === "ALL" ? "" : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Toàn bộ lệnh</SelectItem>{operations.map((operation) => <SelectItem key={operation.id} value={operation.id}>{operation.sequence}. {operation.operation_name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Từ ngày</Label><Input type="date" value={assignmentForm.assignedFrom} onChange={(event) => setAssignmentForm((current) => ({ ...current, assignedFrom: event.target.value }))} /></div><div className="space-y-2"><Label>Đến ngày (tùy chọn)</Label><Input type="date" value={assignmentForm.assignedTo} onChange={(event) => setAssignmentForm((current) => ({ ...current, assignedTo: event.target.value }))} /></div></div>
            <div className="space-y-2"><Label>Ghi chú</Label><Textarea value={assignmentForm.notes} onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAssignmentOpen(false)}>Đóng</Button><Button onClick={() => void submitAssignment()} disabled={busy || !assignmentForm.workerId || !assignmentForm.assignedFrom}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Lưu phân công</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(assignmentEndId)} onOpenChange={(open) => { if (!open) { setAssignmentEndId(null); setAssignmentEndReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Kết thúc phân công</DialogTitle><DialogDescription>Lịch sử chấm công cũ vẫn được giữ nguyên.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Ngày làm việc cuối cùng</Label><Input type="date" value={assignmentEndDate} onChange={(event) => setAssignmentEndDate(event.target.value)} /></div>
            <div className="space-y-2"><Label>Lý do / ghi chú</Label><Textarea value={assignmentEndReason} onChange={(event) => setAssignmentEndReason(event.target.value)} placeholder="VD: Chuyển sang lệnh khác" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAssignmentEndId(null)}>Hủy</Button><Button variant="destructive" onClick={() => void submitAssignmentEnd()} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Kết thúc</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reversalId)} onOpenChange={(open) => { if (!open) { setReversalId(null); setReversalReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Đảo bản ghi chấm công</DialogTitle><DialogDescription>Thông tin gốc sẽ được giữ nguyên; hệ thống tạo một sự kiện đảo để đưa số liệu về đúng.</DialogDescription></DialogHeader>
          <div className="space-y-2"><Label>Lý do bắt buộc</Label><Textarea autoFocus value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="VD: Chọn nhầm nhân sự" /></div>
          <DialogFooter><Button variant="outline" onClick={() => setReversalId(null)}>Hủy</Button><Button variant="destructive" onClick={() => void submitReversal()} disabled={busy || !reversalReason.trim()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Xác nhận đảo</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={workerOpen} onOpenChange={setWorkerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Thêm nhân sự sản xuất</DialogTitle><DialogDescription className="sr-only">Tạo hồ sơ nhân sự dùng trong lệnh sản xuất.</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2"><Label>Mã nhân sự</Label><Input value={workerForm.employeeCode} onChange={(event) => setWorkerForm((current) => ({ ...current, employeeCode: event.target.value }))} placeholder="VD: MAY-01" /></div>
            <div className="space-y-2"><Label>Họ tên</Label><Input value={workerForm.displayName} onChange={(event) => setWorkerForm((current) => ({ ...current, displayName: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Vị trí</Label><Select value={workerForm.workerType} onValueChange={(value) => setWorkerForm((current) => ({ ...current, workerType: value as WorkerType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(workerTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setWorkerOpen(false)}>Đóng</Button><Button onClick={submitWorker} disabled={!validWorker || busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Tạo nhân sự</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>Cấu hình hình thức và mức công</DialogTitle><DialogDescription className="sr-only">Thiết lập cách chấm công và đơn giá có hiệu lực cho nhân sự.</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2"><Label>Nhân sự</Label><Select value={rateForm.workerId} onValueChange={(value) => { const worker = activeWorkers.find((item) => item.id === value); setRateForm((current) => ({ ...current, workerId: value, method: methodForWorker(worker) })); }}><SelectTrigger><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger><SelectContent>{activeWorkers.map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} · {worker.display_name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Vị trí</Label><div className="flex h-10 items-center rounded-md border px-3 text-sm">{selectedRateWorker ? workerTypeLabels[selectedRateWorker.worker_type] : "-"}</div></div><div className="space-y-2"><Label>Hình thức</Label><Select value={rateForm.method} onValueChange={(value) => setRateForm((current) => ({ ...current, method: value as AttendanceMethod }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DAY">Theo ngày</SelectItem><SelectItem value="HOUR">Theo giờ</SelectItem><SelectItem value="OUTPUT">Theo sản lượng</SelectItem></SelectContent></Select></div></div>
            <div className="space-y-2"><Label>{rateForm.method === "DAY" ? "Lương tháng" : rateForm.method === "HOUR" ? "Đơn giá / giờ" : "Đơn giá / sản phẩm"}</Label><Input type="number" min="0" step="1000" value={rateForm.rateAmount} onChange={(event) => setRateForm((current) => ({ ...current, rateAmount: event.target.value }))} /></div>
            {rateForm.method === "DAY" && <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Ngày chuẩn / tháng</Label><Input type="number" min="1" step="0.5" value={rateForm.standardDaysPerMonth} onChange={(event) => setRateForm((current) => ({ ...current, standardDaysPerMonth: event.target.value }))} /></div><div className="space-y-2"><Label>Giờ chuẩn / ngày</Label><Input type="number" min="1" max="24" step="0.5" value={rateForm.standardHoursPerDay} onChange={(event) => setRateForm((current) => ({ ...current, standardHoursPerDay: event.target.value }))} /></div></div>}
            <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label>Hiệu lực từ</Label><Input type="date" value={rateForm.effectiveFrom} onChange={(event) => setRateForm((current) => ({ ...current, effectiveFrom: event.target.value }))} /></div><div className="space-y-2"><Label>Đến ngày</Label><Input type="date" value={rateForm.effectiveTo} onChange={(event) => setRateForm((current) => ({ ...current, effectiveTo: event.target.value }))} /></div></div>
            <div className="space-y-2"><Label>Lý do / ghi chú</Label><Textarea value={rateForm.reason} onChange={(event) => setRateForm((current) => ({ ...current, reason: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRateOpen(false)}>Đóng</Button><Button onClick={submitRate} disabled={!validRate || busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Lưu mức công</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
