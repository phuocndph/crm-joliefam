import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BriefcaseBusiness, CalendarDays, Check, CircleDollarSign, Clock3, Download, History, Loader2, LockKeyhole, PackageCheck, Plus, RotateCcw, Settings2, Timer, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  attendanceMethodSummary,
  attendanceMetricForDay,
  attendancePendingCount,
  attendancePostedTotals,
  attendanceRejectedCount,
  attendanceTotals,
  calculateWorkedMinutes,
} from "@/lib/factory-attendance";
import {
  createProductionWorker,
  listFactoryAttendanceMonthWithMeta,
  listWorkerAttendanceMethods,
  listWorkerCompensationRates,
  recordFactoryAttendance,
  recordFactoryHourAttendance,
  listFactoryAttendanceClosures,
  listFactoryAttendanceDayStatusMonth,
  listFactoryOvertimeMonth,
  recordFactoryOvertime,
  reverseFactoryAttendance,
  reverseProductionAttendance,
  setFactoryAttendanceDayClosure,
  setFactoryAttendanceDayStatus,
  setFactoryAttendanceStatus,
  setFactoryOvertimeStatus,
} from "@/lib/production-execution";
import { exportFactoryAttendanceWorkbook } from "@/lib/factory-attendance-export";
import ProductionOutputPanel from "@/components/ProductionOutputPanel";
import type {
  AttendanceMethod,
  CompensationType,
  FactoryAttendanceRow,
  ProductionWorker,
  WorkerAttendanceMethod,
  WorkerCompensationRate,
  WorkerType,
  AttendanceClosureStatus,
  AttendanceWorkflowStatus,
  FactoryAttendanceClosureRow,
  FactoryAttendanceDayStatus,
  FactoryAttendanceDayStatusRow,
  FactoryOvertimeRow,
  OvertimeType,
} from "@/integrations/supabase/production-execution-types";

const padDatePart = (value: number) => String(value).padStart(2, "0");

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function localMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
}

function dateForMonth(monthKey: string) {
  return monthKey === localMonthKey() ? localDateKey() : `${monthKey}-01`;
}

function formatWorkDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatClockTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : null;
}

function timeClockDetail(row: FactoryAttendanceRow) {
  const checkIn = formatClockTime(row.check_in_time);
  const checkOut = formatClockTime(row.check_out_time);
  if (!checkIn || !checkOut) return null;
  return `${checkIn} - ${checkOut}${row.break_minutes > 0 ? ` · nghỉ ${row.break_minutes} phút` : ""}`;
}

type FactoryShiftKey = "MORNING" | "AFTERNOON" | "EVENING";

const factoryShifts: Array<{ key: FactoryShiftKey; label: string }> = [
  { key: "MORNING", label: "Ca sáng" },
  { key: "AFTERNOON", label: "Ca chiều" },
  { key: "EVENING", label: "Ca tối" },
];

function clockMinutes(value: string | null | undefined) {
  const formatted = formatClockTime(value);
  if (!formatted) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(formatted);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function shiftForAttendance(row: FactoryAttendanceRow): FactoryShiftKey | null {
  const minutes = clockMinutes(row.check_in_time);
  if (minutes === null) return null;
  if (minutes < 13 * 60) return "MORNING";
  if (minutes < 17 * 60) return "AFTERNOON";
  return "EVENING";
}

function attendanceMetricLabel(method: AttendanceMethod) {
  if (method === "DAY") return "Ngày công";
  if (method === "OUTPUT") return "Sản lượng";
  return "Tổng giờ làm";
}

function attendanceMetricUnit(method: AttendanceMethod) {
  if (method === "DAY") return "ngày";
  if (method === "OUTPUT") return "SP";
  return "giờ";
}

function shiftTimeValues(rows: FactoryAttendanceRow[], dateKey: string, shift: FactoryShiftKey, field: "check_in_time" | "check_out_time") {
  return rows
    .filter((row) => !row.is_reversed && row.work_date.slice(0, 10) === dateKey && row.attendance_method === "HOUR" && shiftForAttendance(row) === shift)
    .map((row) => formatClockTime(row[field]))
    .filter((value): value is string => Boolean(value));
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
      weekdayLabel: weekday === 0 ? "CN" : `T${weekday + 1}`,
      isWeekend: weekday === 0 || weekday === 6,
      isSunday: weekday === 0,
    };
  });
}

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

const attendanceMethods: AttendanceMethod[] = ["DAY", "HOUR", "OUTPUT"];

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

const workflowLabels: Record<AttendanceWorkflowStatus, string> = {
  SUBMITTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  LOCKED: "Đã khóa",
  REVERSED: "Đã đảo",
};

const closureLabels: Record<AttendanceClosureStatus, string> = {
  OPEN: "Chưa chốt",
  EMPLOYEE_CONFIRMED: "Nhân sự đã chốt",
  LEADER_CONFIRMED: "Quản lý đã chốt",
  REOPENED: "Đã mở lại",
};

const dayStatusLabels: Record<FactoryAttendanceDayStatus, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Vắng",
  PAID_LEAVE: "Nghỉ phép hưởng lương",
  UNPAID_LEAVE: "Nghỉ không lương",
  HOLIDAY: "Ngày lễ",
  OFF: "Nghỉ",
};

const dayStatusShortLabels: Record<FactoryAttendanceDayStatus, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Vắng",
  PAID_LEAVE: "NPL",
  UNPAID_LEAVE: "NKL",
  HOLIDAY: "Lễ",
  OFF: "Nghỉ",
};

function dayStatusBadgeClass(status: FactoryAttendanceDayStatus) {
  if (status === "PRESENT") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "PAID_LEAVE" || status === "HOLIDAY") return "border-sky-300 bg-sky-50 text-sky-800";
  if (status === "OFF") return "border-slate-300 bg-slate-50 text-slate-700";
  return "border-red-300 bg-red-50 text-red-800";
}

function closureActionLabel(status: AttendanceClosureStatus) {
  if (status === "LEADER_CONFIRMED") return "Mở lại";
  if (status === "EMPLOYEE_CONFIRMED") return "Chốt ngày";
  return "Xác nhận ngày";
}

const overtimeLabels: Record<OvertimeType, string> = {
  NORMAL_OVERTIME: "Tăng ca ngày thường",
  SUNDAY_OVERTIME: "Tăng ca Chủ nhật",
  HOLIDAY_OVERTIME: "Tăng ca ngày lễ",
};

function workflowBadge(status: AttendanceWorkflowStatus | undefined) {
  const normalized = status ?? "APPROVED";
  const className = normalized === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-600"
    : normalized === "LOCKED" ? "bg-slate-700 hover:bg-slate-700"
      : normalized === "REJECTED" || normalized === "REVERSED" ? "bg-red-600 hover:bg-red-600"
        : "bg-amber-500 text-amber-950 hover:bg-amber-500";
  return <Badge className={className}>{workflowLabels[normalized]}</Badge>;
}

const attendanceIcons: Record<AttendanceMethod, typeof CalendarDays> = {
  DAY: CalendarDays,
  HOUR: Clock3,
  OUTPUT: PackageCheck,
};

function compensationTypeForMethod(worker: ProductionWorker | null | undefined, method: AttendanceMethod): CompensationType {
  if (method === "DAY") return worker?.worker_type === "SUPERVISOR" ? "MONTHLY_MANAGER" : "MONTHLY_HELPER";
  if (method === "OUTPUT") return "PIECE_RATE";
  return "HOURLY";
}

function rateAmount(rate: WorkerCompensationRate | null | undefined) {
  if (!rate) return null;
  return rate.monthly_rate ?? rate.hourly_rate ?? rate.piece_rate;
}

function rateUnit(method: AttendanceMethod) {
  if (method === "DAY") return "/ tháng";
  if (method === "OUTPUT") return "/ sản phẩm";
  return "/ giờ";
}

function effectiveRate(
  rates: WorkerCompensationRate[],
  workerId: string,
  compensationType: CompensationType,
  workDate: string,
) {
  return rates
    .filter((rate) => rate.worker_id === workerId
      && rate.compensation_type === compensationType
      && rate.effective_from <= workDate
      && (!rate.effective_to || rate.effective_to >= workDate))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;
}

function defaultMethodForWorkerType(workerType?: WorkerType | null): AttendanceMethod {
  if (workerType === "SUPERVISOR" || workerType === "HELPER") return "DAY";
  if (workerType === "SEWER") return "OUTPUT";
  return "HOUR";
}

function defaultMethod(worker?: ProductionWorker | null): AttendanceMethod {
  return defaultMethodForWorkerType(worker?.worker_type);
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as { code?: string; message?: string };
    const message = value.message ?? "";
    if (message.includes("record_factory_hour_attendance")) {
      return "Cơ sở dữ liệu chưa được cập nhật để lưu giờ đến và giờ về.";
    }
    if (message.includes("factory_attendance_closures")
      || message.includes("factory_overtime")
      || message.includes("set_factory_attendance_status")
      || message.includes("set_factory_attendance_day_closure")) {
      return "Cơ sở dữ liệu chưa được cập nhật luồng duyệt/chốt chấm công.";
    }
    if (message.includes("factory_attendance_day_status")
      || message.includes("set_factory_attendance_day_status")
      || message.includes("list_factory_attendance_day_status_month")) {
      return "Cơ sở dữ liệu chưa được cập nhật chức năng trạng thái ngày công.";
    }
    if (message.includes("factory_attendance_workflow") || message.includes("list_factory_attendance_month_v3")) {
      return "Cơ sở dữ liệu chưa được cập nhật luồng duyệt/chốt chấm công.";
    }
    if (message.includes("list_worker_attendance_methods")) {
      return "Cơ sở dữ liệu chưa được cập nhật cấu hình hình thức chấm công cho nhân sự.";
    }
    if (message.includes("list_worker_compensation_rates")) {
      return "Cơ sở dữ liệu chưa được cập nhật lịch sử mức công nhân sự.";
    }
    if (value.code === "42883" || value.code === "PGRST202" || message.includes("list_factory_attendance_month")) {
      return "Cơ sở dữ liệu chưa được cập nhật chức năng chấm công xưởng độc lập.";
    }
    if (message) return message;
  }
  if (error instanceof Error) return error.message;
  return "Không thể hoàn tất thao tác.";
}

function attendanceValue(row: FactoryAttendanceRow) {
  if (row.attendance_method === "DAY") return `${number.format(row.day_units ?? 0)} ngày`;
  if (row.attendance_method === "HOUR") return `${number.format(row.work_hours ?? 0)} giờ`;
  return `${number.format(row.output_quantity ?? 0)} SP`;
}

function dailyWorkerSummary(rows: FactoryAttendanceRow[]) {
  const activeRows = rows.filter((row) => !row.is_reversed && (row.workflow_status ?? "APPROVED") !== "REJECTED");
  if (!activeRows.length) return null;
  const parts = attendanceMethods
    .map((method) => {
      const methodRows = activeRows.filter((row) => row.attendance_method === method);
      if (!methodRows.length) return null;
      const summary = attendanceMethodSummary(methodRows, method);
      return `${number.format(summary.value)} ${summary.unit}`;
    })
    .filter((value): value is string => Boolean(value));
  return `${parts.join(" · ")}${activeRows.length > 1 ? ` · ${activeRows.length} lượt` : ""}`;
}

function isOperationalAttendanceRow(row: FactoryAttendanceRow) {
  return !row.is_reversed && (row.workflow_status ?? "APPROVED") !== "REJECTED";
}

function aggregateWorkflowStatus(rows: FactoryAttendanceRow[]) {
  const statuses = new Set(rows.filter((row) => !row.is_reversed).map((row) => row.workflow_status ?? "APPROVED"));
  const operationalStatuses = new Set([...statuses].filter((status) => status !== "REJECTED"));
  if (operationalStatuses.has("SUBMITTED")) return "SUBMITTED" as const;
  if (operationalStatuses.size > 0 && [...operationalStatuses].every((status) => status === "LOCKED")) return "LOCKED" as const;
  if (operationalStatuses.size > 0) return "APPROVED" as const;
  if (statuses.has("REJECTED")) return "REJECTED" as const;
  return "APPROVED" as const;
}

function CompactAttendanceValues({ totals }: { totals: ReturnType<typeof attendanceTotals> }) {
  if (totals.day <= 0 && totals.hour <= 0 && totals.output <= 0) return null;
  return (
    <div className="space-y-0.5 text-[11px] leading-4">
      {totals.day > 0 && <div title="Ngày công"><span className="font-semibold text-emerald-700">N</span> {number.format(totals.day)}</div>}
      {totals.hour > 0 && <div title="Giờ công"><span className="font-semibold text-sky-700">G</span> {number.format(totals.hour)}</div>}
      {totals.output > 0 && <div title="Sản lượng"><span className="font-semibold text-amber-700">SP</span> {number.format(totals.output)}</div>}
    </div>
  );
}

type AttendanceWorkerDirectoryEntry = {
  worker_id: string;
  employee_code: string;
  worker_name: string;
  worker_type: WorkerType;
};

const missingWorkerLabel = "Nhân sự không còn trong danh sách";

type Props = {
  workers: ProductionWorker[];
  canRecord: boolean;
  canApproveAttendance: boolean;
  canReverse: boolean;
  canConfirmDay: boolean;
  canManageDayClosure: boolean;
  canManageWorkers: boolean;
  canViewRates: boolean;
  canManageRates: boolean;
  initialTab?: string;
  onWorkersChanged: () => Promise<void> | void;
};

const attendancePanelTabs = new Set(["DAY", "MONTH", "HISTORY", "OVERTIME", "PRODUCT_OUTPUT"]);
const normalizeAttendancePanelTab = (value?: string) => value && attendancePanelTabs.has(value) ? value : "DAY";

export default function FactoryAttendancePanel({
  workers,
  canRecord,
  canApproveAttendance,
  canReverse,
  canConfirmDay,
  canManageDayClosure,
  canManageWorkers,
  canViewRates,
  canManageRates,
  initialTab,
  onWorkersChanged,
}: Props) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(() => normalizeAttendancePanelTab(initialTab));
  const [selectedWorkDate, setSelectedWorkDate] = useState(localDateKey());
  const [selectedMonth, setSelectedMonth] = useState(localMonthKey());
  const [rows, setRows] = useState<FactoryAttendanceRow[]>([]);
  const [timeClockAvailable, setTimeClockAvailable] = useState<boolean | null>(null);
  const [workflowAvailable, setWorkflowAvailable] = useState<boolean | null>(null);
  const [closureAvailable, setClosureAvailable] = useState<boolean | null>(null);
  const [overtimeAvailable, setOvertimeAvailable] = useState<boolean | null>(null);
  const [workflowDataError, setWorkflowDataError] = useState<string | null>(null);
  const [closures, setClosures] = useState<FactoryAttendanceClosureRow[]>([]);
  const [overtimeRows, setOvertimeRows] = useState<FactoryOvertimeRow[]>([]);
  const [dayStatuses, setDayStatuses] = useState<FactoryAttendanceDayStatusRow[]>([]);
  const [dayStatusAvailable, setDayStatusAvailable] = useState<boolean | null>(null);
  const [dayStatusError, setDayStatusError] = useState<string | null>(null);
  const [workerMethods, setWorkerMethods] = useState<WorkerAttendanceMethod[]>([]);
  const [workerRates, setWorkerRates] = useState<WorkerCompensationRate[]>([]);
  const [methodsLoaded, setMethodsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [methodsError, setMethodsError] = useState<string | null>(null);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [workerFilter, setWorkerFilter] = useState("ALL");
  const [methodFilter, setMethodFilter] = useState<AttendanceMethod | "ALL">("ALL");
  const [workflowFilter, setWorkflowFilter] = useState<AttendanceWorkflowStatus | "ALL">("ALL");
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [workerOpen, setWorkerOpen] = useState(false);
  const [reversalRow, setReversalRow] = useState<FactoryAttendanceRow | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [workflowRow, setWorkflowRow] = useState<FactoryAttendanceRow | null>(null);
  const [workflowTarget, setWorkflowTarget] = useState<Exclude<AttendanceWorkflowStatus, "REVERSED"> | null>(null);
  const [workflowReason, setWorkflowReason] = useState("");
  const [closureTarget, setClosureTarget] = useState<{ workerId: string; workDate: string; current: AttendanceClosureStatus } | null>(null);
  const [closureReason, setClosureReason] = useState("");
  const [dayStatusTarget, setDayStatusTarget] = useState<{ workerId: string; workDate: string } | null>(null);
  const [dayStatusForm, setDayStatusForm] = useState({
    status: "PRESENT" as FactoryAttendanceDayStatus,
    mealEligible: false,
    reason: "",
  });
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const [overtimeForm, setOvertimeForm] = useState({ workerId: "", workDate: localDateKey(), type: "NORMAL_OVERTIME" as OvertimeType, minutes: "60", reason: "", idempotencyKey: crypto.randomUUID() });
  const [overtimeWorkflowRow, setOvertimeWorkflowRow] = useState<FactoryOvertimeRow | null>(null);
  const [overtimeWorkflowTarget, setOvertimeWorkflowTarget] = useState<Exclude<AttendanceWorkflowStatus, "REVERSED"> | null>(null);
  const [overtimeWorkflowReason, setOvertimeWorkflowReason] = useState("");
  const loadRequestRef = useRef(0);
  const [attendanceForm, setAttendanceForm] = useState({
    workerId: "", method: "HOUR" as AttendanceMethod, workDate: localDateKey(),
    dayUnits: "1", checkInTime: "08:00", checkOutTime: "17:00", breakMinutes: "60",
    outputQuantity: "1", standardHoursPerDay: "8",
    activityName: "", notes: "", idempotencyKey: crypto.randomUUID(),
  });
  const [workerForm, setWorkerForm] = useState({ employeeCode: "", displayName: "", workerType: "GENERIC" as WorkerType });
  const canAccessRates = canViewRates || canManageRates;

  useEffect(() => {
    setActiveTab(normalizeAttendancePanelTab(initialTab));
  }, [initialTab]);

  const activeWorkers = useMemo(
    () => workers.filter((worker) => worker.is_active).sort((a, b) => a.display_name.localeCompare(b.display_name, "vi")),
    [workers],
  );

  const methodForWorker = useCallback((worker?: ProductionWorker | null) => (
    workerMethods.find((item) => item.worker_id === worker?.id)?.attendance_method ?? defaultMethod(worker)
  ), [workerMethods]);

  const compensationTypeForWorkerMethod = useCallback((worker: ProductionWorker | null | undefined, method: AttendanceMethod) => (
    workerMethods.find((item) => item.worker_id === worker?.id && item.attendance_method === method)?.compensation_type
      ?? compensationTypeForMethod(worker, method)
  ), [workerMethods]);

  const loadData = useCallback(async (monthOverride?: string) => {
    const monthToLoad = monthOverride ?? selectedMonth;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);
    const [attendanceResult, methodResult, rateResult] = await Promise.allSettled([
      listFactoryAttendanceMonthWithMeta(`${monthToLoad}-01`, true),
      listWorkerAttendanceMethods(),
      canAccessRates ? listWorkerCompensationRates() : Promise.resolve([] as WorkerCompensationRate[]),
    ]);
    if (requestId !== loadRequestRef.current) return;
    if (attendanceResult.status === "fulfilled") {
      setRows(attendanceResult.value.rows);
      setTimeClockAvailable(attendanceResult.value.timeClockAvailable);
      setWorkflowAvailable(attendanceResult.value.workflowAvailable);
    }
    else {
      setRows([]);
      setTimeClockAvailable(null);
      setWorkflowAvailable(null);
      setLoadError(errorMessage(attendanceResult.reason));
    }
    if (methodResult.status === "fulfilled") {
      setWorkerMethods(methodResult.value);
      setMethodsError(null);
    } else {
      setWorkerMethods([]);
      setMethodsError(errorMessage(methodResult.reason));
    }
    if (rateResult.status === "fulfilled") {
      setWorkerRates(rateResult.value);
      setRatesError(null);
    } else {
      setWorkerRates([]);
      setRatesError(errorMessage(rateResult.reason));
    }
    const [closureResult, overtimeResult, dayStatusResult] = await Promise.allSettled([
      listFactoryAttendanceClosures(`${monthToLoad}-01`),
      listFactoryOvertimeMonth(`${monthToLoad}-01`),
      listFactoryAttendanceDayStatusMonth(`${monthToLoad}-01`),
    ]);
    if (requestId !== loadRequestRef.current) return;
    setClosures(closureResult.status === "fulfilled" ? closureResult.value : []);
    setClosureAvailable(closureResult.status === "fulfilled");
    setOvertimeRows(overtimeResult.status === "fulfilled" ? overtimeResult.value : []);
    setOvertimeAvailable(overtimeResult.status === "fulfilled");
    setDayStatuses(dayStatusResult.status === "fulfilled" ? dayStatusResult.value : []);
    setDayStatusAvailable(dayStatusResult.status === "fulfilled");
    setDayStatusError(dayStatusResult.status === "fulfilled" ? null : errorMessage(dayStatusResult.reason));
    const workflowErrors = [closureResult, overtimeResult]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => errorMessage(result.reason));
    setWorkflowDataError(workflowErrors.length ? workflowErrors.join(" · ") : null);
    setMethodsLoaded(true);
    setLoading(false);
  }, [canAccessRates, selectedMonth]);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    if (selectedWorkDate.slice(0, 7) !== selectedMonth) {
      setSelectedWorkDate(dateForMonth(selectedMonth));
    }
  }, [selectedMonth, selectedWorkDate]);

  const selectedMonthStart = `${selectedMonth}-01`;
  const selectedMonthEnd = daysForMonth(selectedMonth).at(-1)?.dateKey ?? selectedMonthStart;
  const monthDays = useMemo(() => daysForMonth(selectedMonth), [selectedMonth]);
  const selectedAttendanceWorker = activeWorkers.find((worker) => worker.id === attendanceForm.workerId);
  const attendanceCompensationType = compensationTypeForWorkerMethod(selectedAttendanceWorker, attendanceForm.method);
  const attendanceEffectiveRate = effectiveRate(workerRates, attendanceForm.workerId, attendanceCompensationType, attendanceForm.workDate);

  const filteredRows = useMemo(() => rows.filter((row) => (
    (workerFilter === "ALL" || row.worker_id === workerFilter)
    && (methodFilter === "ALL" || row.attendance_method === methodFilter)
    && (workflowFilter === "ALL" || (row.workflow_status ?? "APPROVED") === workflowFilter)
  )), [methodFilter, rows, workflowFilter, workerFilter]);

  const filteredOvertimeRows = useMemo(() => overtimeRows.filter((row) => (
    (workerFilter === "ALL" || row.worker_id === workerFilter)
    && (workflowFilter === "ALL" || row.status === workflowFilter)
  )), [overtimeRows, workflowFilter, workerFilter]);
  const filteredDayStatuses = useMemo(
    () => dayStatuses
      .filter((row) => workerFilter === "ALL" || row.worker_id === workerFilter)
      .sort((a, b) => b.work_date.localeCompare(a.work_date) || a.worker_name.localeCompare(b.worker_name, "vi")),
    [dayStatuses, workerFilter],
  );
  const filteredClosures = useMemo(
    () => closures
      .filter((row) => workerFilter === "ALL" || row.worker_id === workerFilter)
      .sort((a, b) => b.work_date.localeCompare(a.work_date)),
    [closures, workerFilter],
  );
  const overtimeMinutesTotal = useMemo(
    () => filteredOvertimeRows.reduce((total, row) => total + row.overtime_minutes, 0),
    [filteredOvertimeRows],
  );

  const workerDirectory = useMemo(() => {
    const directory = new Map<string, AttendanceWorkerDirectoryEntry>();
    const addWorker = (entry: AttendanceWorkerDirectoryEntry) => {
      const existing = directory.get(entry.worker_id);
      if (!existing) {
        directory.set(entry.worker_id, entry);
        return;
      }
      // A closure may be the only record for an inactive worker and therefore
      // starts with a placeholder. Replace that placeholder when a richer
      // historical row is available, while never replacing real metadata with
      // the placeholder.
      if (existing.worker_name === missingWorkerLabel && entry.worker_name !== missingWorkerLabel) {
        directory.set(entry.worker_id, entry);
      }
    };
    activeWorkers.forEach((worker) => addWorker({
      worker_id: worker.id, employee_code: worker.employee_code, worker_name: worker.display_name, worker_type: worker.worker_type,
    }));
    rows.forEach((row) => addWorker({
      worker_id: row.worker_id, employee_code: row.employee_code, worker_name: row.worker_name, worker_type: row.worker_type,
    }));
    dayStatuses.forEach((row) => addWorker({
      worker_id: row.worker_id, employee_code: row.employee_code, worker_name: row.worker_name, worker_type: row.worker_type,
    }));
    overtimeRows.forEach((row) => addWorker({
      worker_id: row.worker_id, employee_code: row.employee_code, worker_name: row.worker_name, worker_type: row.worker_type,
    }));
    closures.forEach((row) => addWorker({
      worker_id: row.worker_id, employee_code: row.worker_id, worker_name: missingWorkerLabel, worker_type: "GENERIC",
    }));
    return [...directory.values()].sort((a, b) => a.worker_name.localeCompare(b.worker_name, "vi"));
  }, [activeWorkers, closures, dayStatuses, overtimeRows, rows]);

  const sheetWorkers = useMemo(() => workerDirectory
    .filter((worker) => workerFilter === "ALL" || worker.worker_id === workerFilter)
    .filter((worker) => {
      if (methodFilter === "ALL") return true;
      const workerHasAttendanceRows = rows.some((row) => row.worker_id === worker.worker_id);
      if (workerHasAttendanceRows) {
        // Historical rows are the source of truth for inactive workers. Do
        // not fall back to the current worker-type default when they have a
        // recorded method that does not match the filter.
        return rows.some((row) => row.worker_id === worker.worker_id && row.attendance_method === methodFilter);
      }
      const configuredMethod = workerMethods.find((item) => item.worker_id === worker.worker_id)?.attendance_method;
      return (configuredMethod ?? defaultMethodForWorkerType(worker.worker_type)) === methodFilter;
    })
    .map((worker) => ({ worker, rows: filteredRows.filter((row) => row.worker_id === worker.worker_id) })),
  [filteredRows, methodFilter, rows, workerDirectory, workerFilter, workerMethods]);

  // Auxiliary sheets have no attendance method of their own. Keep the full
  // scoped directory for export so a method filter cannot remove their names.
  const exportWorkers = useMemo(
    () => workerDirectory.filter((worker) => workerFilter === "ALL" || worker.worker_id === workerFilter),
    [workerDirectory, workerFilter],
  );

  const totals = useMemo(() => attendanceTotals(filteredRows), [filteredRows]);
  const postedTotals = useMemo(() => attendancePostedTotals(filteredRows), [filteredRows]);
  const pendingCount = useMemo(() => attendancePendingCount(filteredRows), [filteredRows]);
  const rejectedCount = useMemo(() => attendanceRejectedCount(filteredRows), [filteredRows]);
  const postedRows = useMemo(
    () => filteredRows.filter((row) => !row.is_reversed && (row.workflow_status ?? "APPROVED") !== "SUBMITTED" && (row.workflow_status ?? "APPROVED") !== "REJECTED"),
    [filteredRows],
  );
  const costVisible = postedRows.length > 0 && postedRows.every((row) => row.cost_visible && row.calculated_amount !== null);
  const dailyRows = useMemo(
    () => rows.filter((row) => row.work_date.slice(0, 10) === selectedWorkDate),
    [rows, selectedWorkDate],
  );
  const dailyTotals = useMemo(() => attendanceTotals(dailyRows), [dailyRows]);
  const dailyPendingCount = useMemo(() => attendancePendingCount(dailyRows), [dailyRows]);
  const dailyRejectedCount = useMemo(() => attendanceRejectedCount(dailyRows), [dailyRows]);
  const dailyStatusCount = useMemo(
    () => dayStatuses.filter((item) => item.work_date.slice(0, 10) === selectedWorkDate).length,
    [dayStatuses, selectedWorkDate],
  );
  const timeClockMigrationPending = timeClockAvailable === false;
  const workflowMigrationPending = workflowAvailable === false;
  const dayStatusMigrationPending = dayStatusAvailable === false;
  const canUseAttendanceMethod = (method: AttendanceMethod) => method !== "HOUR" || timeClockAvailable === true;
  const hasRecordableWorker = activeWorkers.some((worker) => canUseAttendanceMethod(methodForWorker(worker)));
  // Day classification affects payroll/meal eligibility, so it is a manager
  // action. Operators can still submit their own attendance and confirm a day.
  const canSetDayStatus = canManageDayClosure;

  const dayStatusMap = useMemo(
    () => new Map(dayStatuses.map((item) => [`${item.worker_id}:${item.work_date.slice(0, 10)}`, item])),
    [dayStatuses],
  );

  function closureFor(workerId: string, workDate: string): FactoryAttendanceClosureRow | null {
    return closures.find((item) => item.worker_id === workerId && item.work_date.slice(0, 10) === workDate) ?? null;
  }

  function dayStatusFor(workerId: string, workDate: string): FactoryAttendanceDayStatusRow | null {
    return dayStatusMap.get(`${workerId}:${workDate}`) ?? null;
  }

  function dayAllowsAttendance(workerId: string, workDate: string) {
    const status = dayStatusFor(workerId, workDate);
    return !status || status.status === "PRESENT" || status.status === "HOLIDAY";
  }

  function openAttendanceDialog(workerOverride?: ProductionWorker, workDateOverride?: string, methodOverride?: AttendanceMethod) {
    const worker = workerOverride
      ?? activeWorkers.find((item) => item.id === workerFilter)
      ?? activeWorkers[0];
    const workDate = workDateOverride ?? dateForMonth(selectedMonth);
    const existingDayStatus = worker ? dayStatusFor(worker.id, workDate) : null;
    if (existingDayStatus && !dayAllowsAttendance(worker?.id ?? "", workDate)) {
      toast({ title: "Ngày đã được đánh dấu nghỉ/vắng", description: "Hãy cập nhật lại trạng thái ngày thành Có mặt trước khi ghi chấm công.", variant: "destructive" });
      return;
    }
    if (worker && closureFor(worker.id, workDate)?.status === "LEADER_CONFIRMED") {
      toast({ title: "Ngày công đã chốt", description: "Hãy mở lại ngày công trước khi ghi bổ sung.", variant: "destructive" });
      return;
    }
    const method = methodOverride ?? methodForWorker(worker);
    if (method === "HOUR" && timeClockAvailable !== true) {
      toast({ title: "Chưa thể chấm theo giờ", description: "Cơ sở dữ liệu chưa được cập nhật chức năng ghi giờ đến và giờ về.", variant: "destructive" });
      return;
    }
    setAttendanceForm({
      workerId: worker?.id ?? "", method, workDate,
      dayUnits: "1", checkInTime: "08:00", checkOutTime: "17:00", breakMinutes: "60",
      outputQuantity: "1", standardHoursPerDay: "8",
      activityName: "", notes: "", idempotencyKey: crypto.randomUUID(),
    });
    setAttendanceOpen(true);
  }

  async function submitAttendance(continueToNext = false) {
    if (attendanceForm.method === "HOUR" && timeClockAvailable !== true) {
      toast({ title: "Chưa thể chấm theo giờ", description: "Cơ sở dữ liệu chưa được cập nhật chức năng ghi giờ đến và giờ về.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (attendanceForm.method === "HOUR") {
        await recordFactoryHourAttendance({
          worker_id: attendanceForm.workerId,
          work_date: attendanceForm.workDate,
          check_in_time: attendanceForm.checkInTime,
          check_out_time: attendanceForm.checkOutTime,
          break_minutes: Number(attendanceForm.breakMinutes),
          activity_name: attendanceForm.activityName.trim() || null,
          idempotency_key: attendanceForm.idempotencyKey,
          notes: attendanceForm.notes.trim() || null,
        });
      } else {
        await recordFactoryAttendance({
          worker_id: attendanceForm.workerId,
          attendance_method: attendanceForm.method,
          work_date: attendanceForm.workDate,
          day_units: attendanceForm.method === "DAY" ? Number(attendanceForm.dayUnits) : null,
          work_hours: null,
          output_quantity: attendanceForm.method === "OUTPUT" ? Number(attendanceForm.outputQuantity) : null,
          standard_hours_per_day: Number(attendanceForm.standardHoursPerDay),
          activity_name: attendanceForm.activityName.trim() || null,
          idempotency_key: attendanceForm.idempotencyKey,
          notes: attendanceForm.notes.trim() || null,
        });
      }
      const attendanceMonth = attendanceForm.workDate.slice(0, 7);
      setSelectedMonth(attendanceMonth);
      setSelectedWorkDate(attendanceForm.workDate);
      await loadData(attendanceMonth);
      const currentIndex = activeWorkers.findIndex((worker) => worker.id === attendanceForm.workerId);
      const nextWorker = continueToNext && currentIndex >= 0 ? activeWorkers[currentIndex + 1] : null;
      if (nextWorker) {
        setAttendanceForm({
          workerId: nextWorker.id,
          method: methodForWorker(nextWorker),
          workDate: attendanceForm.workDate,
          dayUnits: "1",
          checkInTime: "08:00",
          checkOutTime: "17:00",
          breakMinutes: "60",
          outputQuantity: "1",
          standardHoursPerDay: "8",
          activityName: "",
          notes: "",
          idempotencyKey: crypto.randomUUID(),
        });
        toast({ title: "Đã lưu", description: `Chuyển sang ${nextWorker.display_name}.` });
      } else {
        setAttendanceOpen(false);
        toast({ title: "Đã ghi nhận chấm công xưởng" });
      }
    } catch (error) {
      toast({ title: "Không thể chấm công", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function submitReversal() {
    if (!reversalRow) return;
    setBusy(true);
    try {
      if (reversalRow.source_type === "PRODUCTION_LEGACY") {
        await reverseProductionAttendance(reversalRow.id, reversalReason.trim(), crypto.randomUUID());
      } else {
        await reverseFactoryAttendance(reversalRow.id, reversalReason.trim(), crypto.randomUUID());
      }
      setReversalRow(null);
      setReversalReason("");
      await loadData();
      toast({ title: "Đã đảo bản ghi chấm công" });
    } catch (error) {
      toast({ title: "Không thể đảo bản ghi", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function submitWorkflow() {
    if (!workflowRow || !workflowTarget) return;
    setBusy(true);
    try {
      await setFactoryAttendanceStatus({
        attendance_record_id: workflowRow.id,
        target_status: workflowTarget,
        reason: workflowReason.trim() || null,
        idempotency_key: crypto.randomUUID(),
      });
      setWorkflowRow(null);
      setWorkflowTarget(null);
      setWorkflowReason("");
      await loadData();
      toast({ title: workflowTarget === "APPROVED" ? "Đã duyệt chấm công" : workflowTarget === "REJECTED" ? "Đã từ chối chấm công" : "Đã khóa chấm công" });
    } catch (error) {
      toast({ title: "Không thể cập nhật trạng thái", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function submitClosure() {
    if (!closureTarget) return;
    const targetStatus = closureTarget.current === "OPEN" || closureTarget.current === "REOPENED"
      ? "EMPLOYEE_CONFIRMED" as const
      : closureTarget.current === "EMPLOYEE_CONFIRMED"
        ? "LEADER_CONFIRMED" as const
        : "REOPENED" as const;
    setBusy(true);
    try {
      await setFactoryAttendanceDayClosure({
        worker_id: closureTarget.workerId,
        work_date: closureTarget.workDate,
        target_status: targetStatus,
        reason: closureReason.trim() || null,
        idempotency_key: crypto.randomUUID(),
      });
      setClosureTarget(null);
      setClosureReason("");
      await loadData();
      toast({ title: targetStatus === "LEADER_CONFIRMED" ? "Đã chốt ngày ở cấp quản lý" : targetStatus === "REOPENED" ? "Đã mở lại ngày công" : "Đã xác nhận ngày công" });
    } catch (error) {
      toast({ title: "Không thể cập nhật chốt ngày", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function openDayStatusDialog(workerId: string, workDate: string) {
    const current = dayStatusFor(workerId, workDate);
    setDayStatusTarget({ workerId, workDate });
    setDayStatusForm({
      status: current?.status ?? "PRESENT",
      mealEligible: current?.meal_eligible ?? false,
      reason: current?.reason ?? "",
    });
  }

  async function submitDayStatus() {
    if (!dayStatusTarget) return;
    setBusy(true);
    try {
      await setFactoryAttendanceDayStatus({
        worker_id: dayStatusTarget.workerId,
        work_date: dayStatusTarget.workDate,
        status: dayStatusForm.status,
        meal_eligible: dayStatusForm.status === "PRESENT" ? dayStatusForm.mealEligible : false,
        reason: dayStatusForm.reason.trim() || null,
        idempotency_key: crypto.randomUUID(),
      });
      const month = dayStatusTarget.workDate.slice(0, 7);
      setDayStatusTarget(null);
      setDayStatusForm({ status: "PRESENT", mealEligible: false, reason: "" });
      await loadData(month);
      toast({ title: "Đã cập nhật trạng thái ngày công" });
    } catch (error) {
      toast({ title: "Không thể cập nhật trạng thái ngày công", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function submitOvertime() {
    setBusy(true);
    try {
      await recordFactoryOvertime({
        worker_id: overtimeForm.workerId,
        work_date: overtimeForm.workDate,
        overtime_type: overtimeForm.type,
        overtime_minutes: Number(overtimeForm.minutes),
        reason: overtimeForm.reason.trim(),
        idempotency_key: overtimeForm.idempotencyKey,
      });
      setOvertimeOpen(false);
      setOvertimeForm((current) => ({ ...current, minutes: "60", reason: "", idempotencyKey: crypto.randomUUID() }));
      await loadData(overtimeForm.workDate.slice(0, 7));
      toast({ title: "Đã ghi nhận tăng ca", description: "Bản ghi đang chờ duyệt." });
    } catch (error) {
      toast({ title: "Không thể ghi nhận tăng ca", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function submitOvertimeWorkflow() {
    if (!overtimeWorkflowRow || !overtimeWorkflowTarget) return;
    setBusy(true);
    try {
      await setFactoryOvertimeStatus({
        overtime_record_id: overtimeWorkflowRow.id,
        target_status: overtimeWorkflowTarget,
        reason: overtimeWorkflowReason.trim() || null,
        idempotency_key: crypto.randomUUID(),
      });
      setOvertimeWorkflowRow(null);
      setOvertimeWorkflowTarget(null);
      setOvertimeWorkflowReason("");
      await loadData();
      toast({ title: "Đã cập nhật trạng thái tăng ca" });
    } catch (error) {
      toast({ title: "Không thể cập nhật tăng ca", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function submitWorker() {
    setBusy(true);
    try {
      await createProductionWorker({
        employee_code: workerForm.employeeCode.trim(),
        display_name: workerForm.displayName.trim(),
        worker_type: workerForm.workerType,
      });
      await onWorkersChanged();
      setWorkerForm({ employeeCode: "", displayName: "", workerType: "GENERIC" });
      setWorkerOpen(false);
      toast({ title: "Đã tạo nhân sự" });
    } catch (error) {
      toast({ title: "Không thể tạo nhân sự", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const attendanceDateValid = attendanceForm.workDate >= selectedMonthStart
    && attendanceForm.workDate <= selectedMonthEnd
    && attendanceForm.workDate <= localDateKey();
  const sameDayRows = rows.filter((row) => row.worker_id === attendanceForm.workerId
    && row.work_date.slice(0, 10) === attendanceForm.workDate
    && !row.is_reversed
    && (row.workflow_status ?? "APPROVED") !== "REJECTED");
  const existingDayUnits = sameDayRows.reduce((total, row) => total + (row.day_units ?? 0), 0);
  const existingWorkHours = sameDayRows.reduce((total, row) => total + (row.work_hours ?? 0), 0);
  const existingOutputQuantity = sameDayRows.reduce((total, row) => total + (row.output_quantity ?? 0), 0);
  const workedTime = calculateWorkedMinutes(attendanceForm.checkInTime, attendanceForm.checkOutTime, attendanceForm.breakMinutes);
  const calculatedWorkHours = workedTime.minutes / 60;
  const aggregateError = attendanceForm.method === "DAY" && existingDayUnits + Number(attendanceForm.dayUnits) > 2
    ? `Tổng ngày công sẽ vượt 2 ngày; hiện đã có ${number.format(existingDayUnits)}.`
    : attendanceForm.method === "HOUR" && !workedTime.error && existingWorkHours + calculatedWorkHours > 24
      ? `Tổng giờ công sẽ vượt 24 giờ; hiện đã có ${number.format(existingWorkHours)}.`
      : null;
  const selectedAttendanceClosure = closureFor(attendanceForm.workerId, attendanceForm.workDate);
  const attendanceDayOpen = dayAllowsAttendance(attendanceForm.workerId, attendanceForm.workDate)
    && selectedAttendanceClosure?.status !== "LEADER_CONFIRMED";
  const attendanceValueError = attendanceForm.method === "DAY"
    ? (!Number.isFinite(Number(attendanceForm.dayUnits)) || Number(attendanceForm.dayUnits) <= 0 || Number(attendanceForm.dayUnits) > 2
      ? "Ngày công phải nằm trong khoảng 0 đến 2 ngày cho mỗi lượt."
      : !Number.isFinite(Number(attendanceForm.standardHoursPerDay)) || Number(attendanceForm.standardHoursPerDay) <= 0 || Number(attendanceForm.standardHoursPerDay) > 24
        ? "Giờ chuẩn mỗi ngày phải lớn hơn 0 và không quá 24 giờ."
        : null)
    : attendanceForm.method === "OUTPUT"
      ? (!Number.isFinite(Number(attendanceForm.outputQuantity)) || Number(attendanceForm.outputQuantity) <= 0
        ? "Sản lượng phải lớn hơn 0."
        : attendanceForm.activityName.trim().length <= 1 ? "Hãy nhập công việc hoặc sản phẩm." : null)
      : null;
  const validAttendance = methodsLoaded && !methodsError && attendanceDateValid && attendanceDayOpen && !aggregateError
    && Boolean(selectedAttendanceWorker)
    && methodForWorker(selectedAttendanceWorker) === attendanceForm.method
    && (attendanceForm.method !== "HOUR" || timeClockAvailable === true)
    && (!canAccessRates || Boolean(attendanceEffectiveRate))
    && !attendanceValueError
    && (attendanceForm.method === "DAY"
      ? Number(attendanceForm.dayUnits) > 0 && Number(attendanceForm.standardHoursPerDay) > 0
      : attendanceForm.method === "HOUR"
        ? !workedTime.error && calculatedWorkHours > 0
        : Number(attendanceForm.outputQuantity) > 0 && attendanceForm.activityName.trim().length > 1);
  const validWorker = workerForm.employeeCode.trim().length >= 2 && workerForm.displayName.trim().length >= 2;
  const currentAttendanceWorkerIndex = activeWorkers.findIndex((worker) => worker.id === attendanceForm.workerId);
  const hasNextAttendanceWorker = currentAttendanceWorkerIndex >= 0 && currentAttendanceWorkerIndex < activeWorkers.length - 1;
  const AttendanceIcon = attendanceIcons[attendanceForm.method];
  const validOvertime = Boolean(overtimeForm.workerId)
    && overtimeForm.workDate <= localDateKey()
    && Number.isInteger(Number(overtimeForm.minutes))
    && Number(overtimeForm.minutes) > 0
    && Number(overtimeForm.minutes) <= 1440
    && overtimeForm.reason.trim().length >= 2;

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      await exportFactoryAttendanceWorkbook({
        month: selectedMonth,
        workers: exportWorkers,
        rows: filteredRows,
        dayStatuses: filteredDayStatuses,
        overtimeRows: filteredOvertimeRows,
        closures: filteredClosures,
        filters: {
          workerLabel: workerFilter === "ALL" ? "Tất cả nhân sự" : workerDirectory.find((worker) => worker.worker_id === workerFilter)?.worker_name,
          methodLabel: methodFilter === "ALL" ? "Tất cả hình thức" : attendanceLabels[methodFilter],
          workflowLabel: workflowFilter === "ALL" ? "Tất cả trạng thái" : workflowLabels[workflowFilter],
        },
      });
      toast({ title: "Đã xuất bảng chấm công", description: `Đã tạo file Excel tháng ${selectedMonth.replace("-", "/")}.` });
    } catch (error) {
      toast({ title: "Không thể xuất Excel", description: errorMessage(error), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
          <TabsList className="flex h-auto w-full justify-start overflow-x-auto sm:w-auto">
            <TabsTrigger value="DAY" className="shrink-0 gap-1 px-2 sm:px-3"><CalendarDays className="h-4 w-4" />Ngày</TabsTrigger>
            <TabsTrigger value="MONTH" className="shrink-0 gap-1 px-2 sm:px-3"><CalendarDays className="h-4 w-4" />Tháng</TabsTrigger>
            <TabsTrigger value="HISTORY" className="shrink-0 gap-1 px-2 sm:px-3"><History className="h-4 w-4" />Lịch sử</TabsTrigger>
            <TabsTrigger value="OVERTIME" className="shrink-0 gap-1 px-2 sm:px-3"><Timer className="h-4 w-4" />Tăng ca</TabsTrigger>
            <TabsTrigger value="PRODUCT_OUTPUT" className="shrink-0 gap-1 px-2 sm:px-3"><PackageCheck className="h-4 w-4" /><span className="sm:hidden">SP</span><span className="hidden sm:inline">Sản lượng SP</span></TabsTrigger>
          </TabsList>
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
          {canManageWorkers && <Button size="sm" variant="outline" onClick={() => setWorkerOpen(true)} aria-label="Quản lý nhân sự"><UserPlus className="h-4 w-4 md:mr-2" /><span className="hidden md:inline">Nhân sự</span></Button>}
          {canManageRates && <Button asChild size="sm" variant="outline"><Link to="/payroll-settings?tab=worker-rates" aria-label="Quản lý mức công"><Settings2 className="h-4 w-4 md:mr-2" /><span className="hidden md:inline">Mức công</span></Link></Button>}
           {activeTab !== "PRODUCT_OUTPUT" && <Button size="sm" variant="outline" onClick={() => void handleExport()} aria-label="Xuất bảng chấm công Excel" disabled={exporting || loading || (!filteredRows.length && !filteredDayStatuses.length && !filteredOvertimeRows.length && !filteredClosures.length)}>{exporting ? <Loader2 className="h-4 w-4 animate-spin md:mr-2" /> : <Download className="h-4 w-4 md:mr-2" />}<span className="hidden md:inline">Xuất Excel</span></Button>}
           {canRecord && activeTab !== "PRODUCT_OUTPUT" && <Button size="sm" onClick={() => openAttendanceDialog(undefined, activeTab === "DAY" ? selectedWorkDate : undefined)} disabled={!hasRecordableWorker || !methodsLoaded || Boolean(methodsError) || Boolean(loadError)}><Plus className="mr-2 h-4 w-4" />Chấm công</Button>}
            {canRecord && activeTab !== "PRODUCT_OUTPUT" && <Button size="sm" variant="outline" onClick={() => { setOvertimeForm((current) => ({ ...current, workerId: workerFilter !== "ALL" ? workerFilter : activeWorkers[0]?.id ?? "", workDate: selectedWorkDate })); setOvertimeOpen(true); }} disabled={!activeWorkers.length || overtimeAvailable !== true}><Timer className="mr-2 h-4 w-4" />Tăng ca</Button>}
          </div>
        </div>

        {methodsError && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">Không tải được cấu hình mức công: {methodsError}. Chức năng ghi nhận đã tạm khóa.</div>}
        {ratesError && canAccessRates && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">Không tải được lịch sử mức công: {ratesError}.</div>}
        {timeClockMigrationPending && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Cơ sở dữ liệu hiện chưa hỗ trợ ghi giờ vào/ra. Bảng vẫn hiển thị tổng giờ và giữ nguyên dữ liệu; cần cập nhật cơ sở dữ liệu để lưu, xem đầy đủ giờ đến và giờ về.</div>}
        {workflowMigrationPending && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Cơ sở dữ liệu chưa có luồng duyệt/chốt chấm công mới. Bản ghi cũ vẫn xem được; hãy cập nhật cơ sở dữ liệu trước khi dùng chức năng duyệt, chốt ngày và tăng ca.</div>}
        {workflowDataError && !workflowMigrationPending && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Không tải được dữ liệu chốt ngày hoặc tăng ca: {workflowDataError}</div>}
        {dayStatusMigrationPending && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Cơ sở dữ liệu chưa được cập nhật chức năng trạng thái ngày công. Bảng chấm công vẫn hoạt động; chức năng ghi có mặt/vắng/nghỉ sẽ mở sau khi triển khai migration.</div>}
        {dayStatusError && !dayStatusMigrationPending && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Không tải được trạng thái ngày công: {dayStatusError}</div>}
        {loadError ? (
          <div className="rounded-md border border-destructive/40 p-4 text-sm text-destructive">
            <div>{loadError}</div>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => void loadData()}>Thử tải lại</Button>
          </div>
        ) : loading ? (
          <div className="flex h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            <TabsContent value="DAY" className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
                <div className="w-full max-w-56 space-y-1">
                  <Label htmlFor="factory-attendance-day" className="text-xs">Ngày chấm công</Label>
                  <Input id="factory-attendance-day" type="date" max={localDateKey()} value={selectedWorkDate} onChange={(event) => {
                    if (!event.target.value) return;
                    setSelectedWorkDate(event.target.value);
                    setSelectedMonth(event.target.value.slice(0, 7));
                  }} className="h-9" />
                </div>
                <div className="grid w-full grid-cols-3 gap-3 text-sm sm:w-auto sm:min-w-[460px]">
                   <div><div className="text-xs text-muted-foreground">Ngày công</div><div className="font-medium">{number.format(dailyTotals.day)}</div></div>
                   <div><div className="text-xs text-muted-foreground">Giờ công</div><div className="font-medium">{number.format(dailyTotals.hour)}</div></div>
                   <div><div className="text-xs text-muted-foreground">Sản lượng</div><div className="font-medium">{number.format(dailyTotals.output)}</div></div>
                   <div className="col-span-3 text-xs text-muted-foreground sm:col-span-3">{dailyPendingCount > 0 && <span className="mr-3 text-amber-700">Chờ duyệt: {dailyPendingCount}</span>}{dailyRejectedCount > 0 && <span className="mr-3 text-red-700">Từ chối: {dailyRejectedCount}</span>}{dailyPendingCount === 0 && dailyRejectedCount === 0 && (dailyRows.length > 0 ? <span>Dữ liệu đã ghi nhận; chi phí chỉ tính khi đã duyệt/khóa.</span> : dailyStatusCount > 0 ? <span>Đã cập nhật trạng thái ngày cho {dailyStatusCount} nhân sự.</span> : <span>Chưa có dữ liệu cho ngày này.</span>)}</div>
                 </div>
              </div>

              <div className="divide-y rounded-md border sm:hidden">
                 {activeWorkers.map((worker) => {
                    const workerRows = dailyRows.filter((row) => row.worker_id === worker.id && !row.is_reversed);
                    const workerOperationalRows = workerRows.filter(isOperationalAttendanceRow);
                    const workerRejectedRows = workerRows.filter((row) => (row.workflow_status ?? "APPROVED") === "REJECTED");
                    const workerPostedRows = workerOperationalRows.filter((row) => (row.workflow_status ?? "APPROVED") === "APPROVED" || (row.workflow_status ?? "APPROVED") === "LOCKED");
                   const workerPostedTotals = attendancePostedTotals(workerRows);
                   const workerCostVisible = workerPostedRows.length > 0
                     && workerPostedRows.every((row) => row.cost_visible && row.calculated_amount !== null);
                  const workerMethod = methodForWorker(worker);
                  const hourlyDetails = workerRows.filter((row) => row.attendance_method === "HOUR").map(timeClockDetail).filter(Boolean);
                    const workerStatus = workerRows.length ? aggregateWorkflowStatus(workerRows) : undefined;
                    const workerClosure = closureFor(worker.id, selectedWorkDate);
                    const closureStatus = workerClosure?.status ?? "OPEN";
                    const workerDayStatus = dayStatusFor(worker.id, selectedWorkDate);
                    const canChangeClosure = closureAvailable === true
                      && (closureStatus === "EMPLOYEE_CONFIRMED" || closureStatus === "LEADER_CONFIRMED" ? canManageDayClosure : canConfirmDay);
                    const canChangeDayStatus = canSetDayStatus && dayStatusAvailable === true && closureStatus !== "LEADER_CONFIRMED";
                  return <div key={worker.id} className="space-y-3 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><div className="truncate font-medium">{worker.display_name}</div><div className="text-xs text-muted-foreground">{worker.employee_code} · {workerTypeLabels[worker.worker_type]}</div></div>
                      <div className="flex shrink-0 flex-col items-end gap-1"><Badge variant="outline">{attendanceLabels[workerMethod]}</Badge>{workerStatus && workflowBadge(workerStatus)}</div>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                       <div className="min-w-0 text-sm">
                          {workerOperationalRows.length ? <><div>{dailyWorkerSummary(workerRows)}</div>{hourlyDetails.length > 0 && <div className="truncate text-xs text-muted-foreground">{hourlyDetails.join("; ")}</div>}{workerDayStatus && <div className="mt-1 text-xs text-muted-foreground">Trạng thái ngày: {dayStatusLabels[workerDayStatus.status]}{workerDayStatus.meal_eligible ? " · tiền ăn" : ""}</div>}{workerPostedRows.length > 0 && workerCostVisible && <div className="mt-1 text-xs text-muted-foreground">Đã duyệt: {money.format(workerPostedTotals.cost)}</div>}{workerRows.some((row) => (row.workflow_status ?? "APPROVED") === "SUBMITTED") && <div className="mt-1 text-xs text-amber-700">Có bản ghi chờ duyệt</div>}</> : workerRejectedRows.length ? <div className="space-y-1"><Badge variant="outline" className="border-red-300 bg-red-50 text-red-800">Bản ghi bị từ chối</Badge><div className="text-xs text-red-700">Chưa tính vào công; hãy chấm lại hoặc sửa rồi gửi lại.</div>{workerDayStatus && <div className="text-xs text-muted-foreground">Trạng thái ngày: {dayStatusLabels[workerDayStatus.status]}</div>}</div> : workerDayStatus ? <div className="space-y-1"><Badge variant="outline" className={dayStatusBadgeClass(workerDayStatus.status)}>{dayStatusLabels[workerDayStatus.status]}</Badge>{workerDayStatus.meal_eligible && <span className="ml-2 text-xs text-emerald-700">Có tiền ăn</span>}{workerDayStatus.reason && <div className="text-xs text-muted-foreground">{workerDayStatus.reason}</div>}</div> : <span className="text-muted-foreground">Chưa cập nhật</span>}{workerClosure && workerClosure.status !== "OPEN" && <div className="mt-1 text-xs font-medium text-slate-600">Chốt ngày: {closureLabels[workerClosure.status]}</div>}
                      </div>
                        <div className="flex flex-wrap justify-end gap-1">{canChangeDayStatus && <Button size="sm" variant="ghost" onClick={() => openDayStatusDialog(worker.id, selectedWorkDate)}><CalendarDays className="mr-1.5 h-4 w-4" />{workerDayStatus ? "Trạng thái" : "Ghi trạng thái"}</Button>}{canRecord && canUseAttendanceMethod(workerMethod) && dayAllowsAttendance(worker.id, selectedWorkDate) && closureStatus !== "LEADER_CONFIRMED" && <Button size="sm" variant={workerOperationalRows.length ? "outline" : "default"} onClick={() => openAttendanceDialog(worker, selectedWorkDate)}><Plus className="mr-1.5 h-4 w-4" />{workerOperationalRows.length ? "Ghi thêm" : workerRejectedRows.length ? "Chấm lại" : "Chấm"}</Button>}{workflowAvailable && workerRows.some((row) => row.source_type === "FACTORY" && row.workflow_status === "SUBMITTED") && canApproveAttendance && <Button size="sm" variant="outline" onClick={() => { const row = workerRows.find((item) => item.source_type === "FACTORY" && item.workflow_status === "SUBMITTED"); if (row) { setWorkflowRow(row); setWorkflowTarget("APPROVED"); } }}><Check className="mr-1.5 h-4 w-4" />Duyệt</Button>}{canChangeClosure && <Button size="sm" variant="ghost" onClick={() => setClosureTarget({ workerId: worker.id, workDate: selectedWorkDate, current: closureStatus })}>{closureStatus === "LEADER_CONFIRMED" ? <LockKeyhole className="mr-1.5 h-4 w-4" /> : <Check className="mr-1.5 h-4 w-4" />}{closureActionLabel(closureStatus)}</Button>}</div>
                    </div>
                  </div>;
                })}
                {!activeWorkers.length && <div className="p-6 text-center text-sm text-muted-foreground">Chưa có nhân sự đang hoạt động</div>}
              </div>

              <div className="hidden overflow-x-auto rounded-md border sm:block">
                <Table disableWrapper className="min-w-[760px]">
                  <TableHeader><TableRow><TableHead>Nhân sự</TableHead><TableHead>Vị trí</TableHead><TableHead>Hình thức</TableHead><TableHead>Đã ghi nhận</TableHead><TableHead className="text-right">Chi phí</TableHead><TableHead className="w-28 text-right">Thao tác</TableHead></TableRow></TableHeader>
                  <TableBody>
                   {activeWorkers.map((worker) => {
                    const workerRows = dailyRows.filter((row) => row.worker_id === worker.id && !row.is_reversed);
                    const workerOperationalRows = workerRows.filter(isOperationalAttendanceRow);
                    const workerRejectedRows = workerRows.filter((row) => (row.workflow_status ?? "APPROVED") === "REJECTED");
                    const workerPostedRows = workerOperationalRows.filter((row) => (row.workflow_status ?? "APPROVED") === "APPROVED" || (row.workflow_status ?? "APPROVED") === "LOCKED");
                   const workerPostedTotals = attendancePostedTotals(workerRows);
                   const workerCostVisible = workerPostedRows.length > 0
                     && workerPostedRows.every((row) => row.cost_visible && row.calculated_amount !== null);
                      const workerMethod = methodForWorker(worker);
                      const hourlyDetails = workerRows.filter((row) => row.attendance_method === "HOUR").map(timeClockDetail).filter(Boolean);
                        const workerStatus = workerRows.length ? aggregateWorkflowStatus(workerRows) : undefined;
                        const workerClosure = closureFor(worker.id, selectedWorkDate);
                        const closureStatus = workerClosure?.status ?? "OPEN";
                        const workerDayStatus = dayStatusFor(worker.id, selectedWorkDate);
                        const canChangeClosure = closureAvailable === true
                          && (closureStatus === "EMPLOYEE_CONFIRMED" || closureStatus === "LEADER_CONFIRMED" ? canManageDayClosure : canConfirmDay);
                        const canChangeDayStatus = canSetDayStatus && dayStatusAvailable === true && closureStatus !== "LEADER_CONFIRMED";
                      return <TableRow key={worker.id}>
                        <TableCell><div className="font-medium">{worker.display_name}</div><div className="text-xs text-muted-foreground">{worker.employee_code}</div></TableCell>
                        <TableCell>{workerTypeLabels[worker.worker_type]}</TableCell>
                        <TableCell><div className="flex flex-wrap gap-1"><Badge variant="outline">{attendanceLabels[workerMethod]}</Badge>{workerStatus && workflowBadge(workerStatus)}</div></TableCell>
                        <TableCell>
                           {workerOperationalRows.length ? <div><div>{dailyWorkerSummary(workerRows)}</div>{hourlyDetails.length > 0 && <div className="mt-0.5 text-xs text-muted-foreground">{hourlyDetails.join("; ")}</div>}{workerDayStatus && <div className="mt-1 text-xs text-muted-foreground">Trạng thái ngày: {dayStatusLabels[workerDayStatus.status]}{workerDayStatus.meal_eligible ? " · tiền ăn" : ""}</div>}</div> : workerRejectedRows.length ? <div><Badge variant="outline" className="border-red-300 bg-red-50 text-red-800">Bản ghi bị từ chối</Badge><div className="mt-1 text-xs text-red-700">Chưa tính vào công; cần chấm lại hoặc sửa rồi gửi lại.</div>{workerDayStatus && <div className="mt-1 text-xs text-muted-foreground">Trạng thái ngày: {dayStatusLabels[workerDayStatus.status]}</div>}</div> : workerDayStatus ? <div><Badge variant="outline" className={dayStatusBadgeClass(workerDayStatus.status)}>{dayStatusLabels[workerDayStatus.status]}</Badge>{workerDayStatus.meal_eligible && <div className="mt-1 text-xs text-emerald-700">Có tiền ăn</div>}{workerDayStatus.reason && <div className="mt-1 text-xs text-muted-foreground">{workerDayStatus.reason}</div>}</div> : <span className="text-muted-foreground">Chưa cập nhật</span>}{workerClosure && workerClosure.status !== "OPEN" && <div className="mt-1 text-xs font-medium text-slate-600">Chốt ngày: {closureLabels[workerClosure.status]}</div>}
                        </TableCell>
                         <TableCell className="text-right font-medium">{!workerPostedRows.length ? (workerRows.length ? "Chờ duyệt" : "-") : workerCostVisible ? money.format(workerPostedTotals.cost) : "Ẩn"}</TableCell>
                          <TableCell className="text-right"><div className="flex flex-wrap justify-end gap-1">{canChangeDayStatus && <Button size="sm" variant="ghost" onClick={() => openDayStatusDialog(worker.id, selectedWorkDate)}><CalendarDays className="mr-1.5 h-4 w-4" />{workerDayStatus ? "Trạng thái" : "Ghi trạng thái"}</Button>}{canRecord && canUseAttendanceMethod(workerMethod) && dayAllowsAttendance(worker.id, selectedWorkDate) && closureStatus !== "LEADER_CONFIRMED" && <Button size="sm" variant={workerOperationalRows.length ? "outline" : "default"} onClick={() => openAttendanceDialog(worker, selectedWorkDate)}><Plus className="mr-1.5 h-4 w-4" />{workerOperationalRows.length ? "Ghi thêm" : workerRejectedRows.length ? "Chấm lại" : "Chấm"}</Button>}{workflowAvailable && workerRows.some((row) => row.source_type === "FACTORY" && row.workflow_status === "SUBMITTED") && canApproveAttendance && <Button size="sm" variant="outline" onClick={() => { const row = workerRows.find((item) => item.source_type === "FACTORY" && item.workflow_status === "SUBMITTED"); if (row) { setWorkflowRow(row); setWorkflowTarget("APPROVED"); } }}><Check className="mr-1.5 h-4 w-4" />Duyệt</Button>}{canChangeClosure && <Button size="sm" variant="ghost" onClick={() => setClosureTarget({ workerId: worker.id, workDate: selectedWorkDate, current: closureStatus })}>{closureStatus === "LEADER_CONFIRMED" ? <LockKeyhole className="mr-1.5 h-4 w-4" /> : <Check className="mr-1.5 h-4 w-4" />}{closureActionLabel(closureStatus)}</Button>}</div></TableCell>
                      </TableRow>;
                    })}
                    {!activeWorkers.length && <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Chưa có nhân sự đang hoạt động</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="MONTH" className="space-y-4">
              <div className="flex flex-wrap items-end gap-3 border-b pb-4">
                <div className="w-full max-w-48 space-y-1"><Label htmlFor="factory-attendance-month" className="text-xs">Tháng chấm công</Label><Input id="factory-attendance-month" type="month" max={localMonthKey()} value={selectedMonth} onChange={(event) => event.target.value && setSelectedMonth(event.target.value)} className="h-9" /></div>
                <div className="min-w-52 flex-1 space-y-1"><Label className="text-xs">Nhân sự</Label><Select value={workerFilter} onValueChange={setWorkerFilter}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả nhân sự</SelectItem>{workerDirectory.map((worker) => <SelectItem key={worker.worker_id} value={worker.worker_id}>{worker.employee_code} · {worker.worker_name}</SelectItem>)}</SelectContent></Select></div>
                <div className="min-w-44 flex-1 space-y-1"><Label className="text-xs">Hình thức</Label><Select value={methodFilter} onValueChange={(value) => setMethodFilter(value as AttendanceMethod | "ALL")}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả hình thức</SelectItem><SelectItem value="DAY">Theo ngày</SelectItem><SelectItem value="HOUR">Theo giờ</SelectItem><SelectItem value="OUTPUT">Theo sản lượng</SelectItem></SelectContent></Select></div>
                <div className="min-w-44 flex-1 space-y-1"><Label className="text-xs">Luồng duyệt</Label><Select value={workflowFilter} onValueChange={(value) => setWorkflowFilter(value as AttendanceWorkflowStatus | "ALL")}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả trạng thái</SelectItem><SelectItem value="SUBMITTED">Chờ duyệt</SelectItem><SelectItem value="APPROVED">Đã duyệt</SelectItem><SelectItem value="REJECTED">Từ chối</SelectItem><SelectItem value="LOCKED">Đã khóa</SelectItem><SelectItem value="REVERSED">Đã đảo</SelectItem></SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b pb-4 text-sm sm:grid-cols-5">
                <div className="col-span-2 sm:col-span-1"><div className="text-xs text-muted-foreground">Toàn xưởng</div><div className="font-medium">Tháng {selectedMonth.slice(5, 7)}/{selectedMonth.slice(0, 4)}</div></div>
                 <div><div className="text-xs text-muted-foreground">Ngày công đã ghi</div><div className="font-medium">{number.format(totals.day)}</div></div><div><div className="text-xs text-muted-foreground">Giờ công đã ghi</div><div className="font-medium">{number.format(totals.hour)}</div></div><div><div className="text-xs text-muted-foreground">Sản lượng đã ghi</div><div className="font-medium">{number.format(totals.output)}</div></div><div><div className="text-xs text-muted-foreground">Chi phí đã duyệt</div><div className="font-medium">{!postedRows.length ? (pendingCount ? "Chờ duyệt" : "-") : costVisible ? money.format(postedTotals.cost) : "Ẩn theo quyền"}</div></div>
                 <div className="col-span-2 text-xs text-muted-foreground sm:col-span-5">{pendingCount > 0 && <span className="mr-3 text-amber-700">{pendingCount} bản ghi chờ duyệt</span>}{rejectedCount > 0 && <span className="text-red-700">{rejectedCount} bản ghi bị từ chối</span>}{pendingCount === 0 && rejectedCount === 0 && <span>Chi phí chỉ lấy bản ghi đã duyệt/khóa; bản ghi bị từ chối không được cộng.</span>}</div>
              </div>
              <div className="rounded-md border border-emerald-200 bg-background shadow-sm">
                <div className="border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  Ô trống có dấu <span className="font-semibold text-primary">+</span> để ghi công. Bản ghi theo giờ được xếp theo ca dựa trên giờ đến; ngày và sản lượng giữ đúng đơn vị gốc.
                </div>
                <div className="max-w-full overflow-x-auto overscroll-x-contain">
                  <Table disableWrapper className="table-fixed text-xs" style={{ minWidth: `${510 + monthDays.length * 64}px` }}>
                    <colgroup>
                      <col style={{ width: "170px" }} />
                      <col style={{ width: "90px" }} />
                      <col style={{ width: "90px" }} />
                      {monthDays.map((day) => <col key={day.dateKey} style={{ width: "64px" }} />)}
                      <col style={{ width: "160px" }} />
                    </colgroup>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead colSpan={monthDays.length + 4} className="h-12 border-b border-emerald-200 bg-emerald-50 px-3 text-center text-base font-bold uppercase tracking-normal text-red-700">
                          BẢNG CHẤM CÔNG THÁNG {selectedMonth.slice(5, 7)}/{selectedMonth.slice(0, 4)} - GIA LỘC HƯNG PHÁT
                        </TableHead>
                      </TableRow>
                      <TableRow className="hover:bg-transparent">
                        <TableHead rowSpan={2} className="sticky left-0 z-40 w-[170px] border-r border-emerald-200 bg-emerald-100 px-3 align-middle text-emerald-950 shadow-[2px_0_0_rgb(167_243_208)]"><div>Tháng {selectedMonth.slice(5, 7)}/{selectedMonth.slice(0, 4)}</div><div className="mt-0.5 text-[10px] font-normal">Nhân sự</div></TableHead>
                        <TableHead rowSpan={2} className="sticky left-[170px] z-40 w-[90px] border-r border-emerald-200 bg-emerald-100 px-2 text-center align-middle text-emerald-950 shadow-[2px_0_0_rgb(167_243_208)]">Ca</TableHead>
                        <TableHead rowSpan={2} className="sticky left-[260px] z-40 w-[90px] border-r border-emerald-200 bg-emerald-100 px-2 text-center align-middle text-emerald-950 shadow-[2px_0_0_rgb(167_243_208)]">Chi tiết</TableHead>
                        {monthDays.map((day) => <TableHead key={day.dateKey} className={`h-8 w-[64px] border-r border-emerald-200 bg-emerald-100 px-1 text-center align-middle ${day.isWeekend ? "bg-slate-100" : ""}`}><span className={day.isSunday ? "text-red-700" : "text-emerald-950"}>{day.day}</span></TableHead>)}
                        <TableHead rowSpan={2} className="sticky right-0 z-40 w-[160px] border-l border-emerald-200 bg-emerald-100 px-3 align-middle text-emerald-950 shadow-[-2px_0_0_rgb(167_243_208)]">Tổng tháng</TableHead>
                      </TableRow>
                      <TableRow className="hover:bg-transparent">
                        {monthDays.map((day) => <TableHead key={day.dateKey} className={`h-7 w-[64px] border-r border-emerald-200 bg-emerald-50 px-1 text-center text-[10px] font-normal ${day.isWeekend ? "bg-slate-100" : ""}`}><span className={day.isSunday ? "text-red-700" : "text-emerald-900"}>{day.weekdayLabel}</span></TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                       {sheetWorkers.map(({ worker, rows: workerRows }) => {
                         const activeWorkerRows = workerRows.filter(isOperationalAttendanceRow);
                         const rejectedWorkerRows = workerRows.filter((row) => !row.is_reversed && (row.workflow_status ?? "APPROVED") === "REJECTED");
                       const workerTotals = attendanceTotals(activeWorkerRows);
                       const workerPostedTotals = attendancePostedTotals(activeWorkerRows);
                       const workerPostedRows = activeWorkerRows.filter((row) => (row.workflow_status ?? "APPROVED") === "APPROVED" || (row.workflow_status ?? "APPROVED") === "LOCKED");
                       const workerPendingCount = attendancePendingCount(activeWorkerRows);
                       const workerCostVisible = workerPostedRows.length > 0 && workerPostedRows.every((row) => row.cost_visible && row.calculated_amount !== null);
                        const activeWorker = activeWorkers.find((item) => item.id === worker.worker_id);
                         const recordedMethods = new Set(activeWorkerRows.map((row) => row.attendance_method));
                        const profileMethod = activeWorker
                          ? methodForWorker(activeWorker)
                          : [...recordedMethods][0] ?? "HOUR";
                        const hasHourRows = activeWorkerRows.some((row) => row.attendance_method === "HOUR");
                        const recordedMethod = recordedMethods.size === 1 ? [...recordedMethods][0] : null;
                        const workerMethod: AttendanceMethod = methodFilter === "ALL" ? (recordedMethod ?? (hasHourRows ? "HOUR" : profileMethod)) : methodFilter;
                        const workerRate = activeWorker
                          ? effectiveRate(workerRates, worker.worker_id, compensationTypeForWorkerMethod(activeWorker, workerMethod), selectedMonthEnd < localDateKey() ? selectedMonthEnd : localDateKey())
                          : null;
                          const canQuickRecord = (day: { dateKey: string }) => Boolean(
                             canRecord
                             && activeWorker
                             && canUseAttendanceMethod(workerMethod)
                             && dayAllowsAttendance(worker.worker_id, day.dateKey)
                             && day.dateKey <= localDateKey()
                             && closureFor(worker.worker_id, day.dateKey)?.status !== "LEADER_CONFIRMED",
                           );
                         const canChangeDayStatusCell = (day: { dateKey: string }) => Boolean(
                           canSetDayStatus
                           && dayStatusAvailable === true
                           && day.dateKey <= localDateKey()
                           && closureFor(worker.worker_id, day.dateKey)?.status !== "LEADER_CONFIRMED",
                         );
                         const metricForDay = (dayKey: string) => attendanceMetricForDay(activeWorkerRows.filter((row) => row.work_date.slice(0, 10) === dayKey), workerMethod);
                         const metricText = (value: number) => value > 0 ? number.format(value) : "";
                         const renderMetricCell = (day: { dateKey: string; isWeekend: boolean }, value: string, label: string, rowKey: string) => (
                           <TableCell key={`${rowKey}-${day.dateKey}`} className={`h-10 w-[64px] border-r p-0 text-center align-middle ${day.isWeekend ? "bg-muted/30" : ""}`}>
                             {(() => {
                               const status = dayStatusFor(worker.worker_id, day.dateKey);
                               const statusText = status ? dayStatusShortLabels[status.status] : "";
                                const title = status
                                  ? `${dayStatusLabels[status.status]}${status.meal_eligible ? " · đủ điều kiện tiền ăn" : ""}${status.reason ? ` · ${status.reason}` : ""}`
                                  : value ? `Đã ghi nhận ${value} ${label}; bấm để ghi thêm` : `Chấm công ${formatWorkDate(day.dateKey)}`;
                                const statusBlocksAttendance = Boolean(status && !dayAllowsAttendance(worker.worker_id, day.dateKey));
                                if (!value && status && statusBlocksAttendance && canChangeDayStatusCell(day)) {
                                  return <button type="button" className={`flex h-10 w-full items-center justify-center px-1 text-[10px] font-medium transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${dayStatusBadgeClass(status.status)}`} aria-label={`Sửa trạng thái ${worker.worker_name} ngày ${formatWorkDate(day.dateKey)}`} onClick={() => openDayStatusDialog(worker.worker_id, day.dateKey)} title={title}>{statusText}</button>;
                                }
                                if (!value && status && statusBlocksAttendance) {
                                  return <span className={`flex h-10 w-full items-center justify-center px-1 text-[10px] font-medium ${dayStatusBadgeClass(status.status)}`} title={title}>{statusText}</span>;
                                }
                                // For PRESENT/HOLIDAY, an empty cell remains a
                                // quick attendance entry. If the operator can
                                // only edit statuses, keep the status dialog
                                // available as the fallback action.
                                if (!value && status && !canQuickRecord(day) && canChangeDayStatusCell(day)) {
                                  return <button type="button" className={`flex h-10 w-full items-center justify-center px-1 text-[10px] font-medium transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${dayStatusBadgeClass(status.status)}`} aria-label={`Sửa trạng thái ${worker.worker_name} ngày ${formatWorkDate(day.dateKey)}`} onClick={() => openDayStatusDialog(worker.worker_id, day.dateKey)} title={title}>{statusText}</button>;
                                }
                                return canQuickRecord(day) ? <button type="button" className="flex h-10 w-full items-center justify-center px-1 font-medium transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset" aria-label={`Chấm công ${worker.worker_name} ngày ${formatWorkDate(day.dateKey)}`} onClick={() => openAttendanceDialog(activeWorker, day.dateKey, workerMethod)} title={title}>
                                 {value || <Plus className="h-3.5 w-3.5 text-muted-foreground/45" />}
                               </button> : <span className={value ? "font-medium" : "text-muted-foreground/45"} title={title}>{value}</span>;
                             })()}
                           </TableCell>
                         );
                         const renderStaticMetricCell = (day: { dateKey: string; isWeekend: boolean }, value: string, rowKey: string) => {
                           const status = dayStatusFor(worker.worker_id, day.dateKey);
                           const displayValue = value || (status ? dayStatusShortLabels[status.status] : "");
                           const statusTitle = status ? `${dayStatusLabels[status.status]}${status.meal_eligible ? " · đủ điều kiện tiền ăn" : ""}${status.reason ? ` · ${status.reason}` : ""}` : "";
                           return (
                           <TableCell key={`${rowKey}-${day.dateKey}`} className={`h-10 w-[64px] border-r p-0 text-center align-middle ${day.isWeekend ? "bg-emerald-50/70 dark:bg-emerald-950/30" : "bg-emerald-100/70 dark:bg-emerald-950/30"}`}>
                             <span className={`${value ? "font-semibold" : status ? `font-semibold ${dayStatusBadgeClass(status.status)}` : "text-muted-foreground/45"} inline-flex h-10 w-full items-center justify-center px-1 text-[10px]`} title={statusTitle}>{displayValue}</span>
                           </TableCell>
                           );
                         };
                        const renderTimeCell = (day: { dateKey: string; isWeekend: boolean }, shift: FactoryShiftKey, field: "check_in_time" | "check_out_time", rowKey: string) => {
                          const values = shiftTimeValues(activeWorkerRows, day.dateKey, shift, field);
                          const textValue = values.join(" · ");
                          const displayValue = values.length > 1 ? `${values[0]} +${values.length - 1}` : values[0] ?? "";
                          return <TableCell key={`${rowKey}-${day.dateKey}`} className={`h-10 w-[64px] border-r p-0 text-center align-middle ${day.isWeekend ? "bg-muted/30" : ""}`}>
                            {canQuickRecord(day) ? <button type="button" className="flex h-10 w-full items-center justify-center px-1 text-[11px] transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset" aria-label={`Chấm công ${worker.worker_name} ngày ${formatWorkDate(day.dateKey)}`} onClick={() => openAttendanceDialog(activeWorker, day.dateKey, "HOUR")} title={textValue ? `${field === "check_in_time" ? "Giờ đến" : "Giờ về"}: ${textValue}` : `Chấm công ${formatWorkDate(day.dateKey)}`}>
                               {displayValue || <Plus className="h-3.5 w-3.5 text-muted-foreground/45" />}
                             </button> : <span className={displayValue ? "font-medium" : "text-muted-foreground/45"}>{displayValue}</span>}
                          </TableCell>;
                        };
                        const renderWorkerCell = (rowSpan: number) => <TableCell rowSpan={rowSpan} className="sticky left-0 z-30 w-[170px] border-r bg-emerald-50/40 px-3 py-2 align-top shadow-[2px_0_0_hsl(var(--border))] dark:bg-emerald-950/20"><div className="truncate font-medium" title={worker.worker_name}>{worker.worker_name}</div><div className="truncate text-[11px] text-muted-foreground">{worker.employee_code} · {workerTypeLabels[worker.worker_type] ?? worker.worker_type}</div>{canAccessRates && <div className={`mt-1 text-[10px] ${workerRate ? "text-muted-foreground" : "font-medium text-amber-700"}`}>{workerRate ? `${money.format(rateAmount(workerRate) ?? 0)} ${rateUnit(workerMethod)}` : "Chưa có mức công"}</div>}</TableCell>;
                         const renderTotalCell = (key: string, className = "") => <TableCell key={key} className={`sticky right-0 z-30 w-[160px] border-l border-emerald-300 bg-emerald-100 px-3 py-2 align-middle shadow-[-2px_0_0_hsl(var(--border))] dark:bg-emerald-950/40 ${className}`}><CompactAttendanceValues totals={workerTotals} /><div className="mt-1 border-t border-emerald-300/70 pt-1 text-[11px] font-medium dark:border-emerald-700">CP đã duyệt: {!workerPostedRows.length ? (activeWorkerRows.length ? "Chờ duyệt" : "-") : workerCostVisible ? money.format(workerPostedTotals.cost) : "Ẩn"}</div>{workerPendingCount > 0 && <div className="mt-0.5 text-[10px] text-amber-700">Chờ duyệt: {workerPendingCount}</div>}{rejectedWorkerRows.length > 0 && <div className="mt-0.5 text-[10px] text-red-700">Từ chối: {rejectedWorkerRows.length}</div>}</TableCell>;
                        const renderBlankTotalCell = (key: string) => <TableCell key={key} aria-hidden="true" className="sticky right-0 z-20 w-[160px] border-l border-slate-200 bg-background px-3 py-2 shadow-[-2px_0_0_hsl(var(--border))]" />;

                        if (workerMethod === "HOUR") {
                          return [
                            ...factoryShifts.flatMap((shift, shiftIndex) => [
                              <TableRow key={`${worker.worker_id}-${shift.key}-in`}>
                                {shiftIndex === 0 && renderWorkerCell(factoryShifts.length * 2 + 1)}
                                <TableCell rowSpan={2} className="sticky left-[170px] z-20 w-[90px] border-r bg-background px-2 text-center align-middle shadow-[2px_0_0_hsl(var(--border))]">{shift.label}</TableCell>
                                <TableCell className="sticky left-[260px] z-20 w-[90px] border-r bg-background px-2 align-middle shadow-[2px_0_0_hsl(var(--border))]">Giờ đến</TableCell>
                                {monthDays.map((day) => renderTimeCell(day, shift.key, "check_in_time", `${worker.worker_id}-${shift.key}-in`))}
                                {renderBlankTotalCell(`${worker.worker_id}-${shift.key}-in-total`)}
                              </TableRow>,
                              <TableRow key={`${worker.worker_id}-${shift.key}-out`}>
                                <TableCell className="sticky left-[260px] z-20 w-[90px] border-r bg-background px-2 align-middle shadow-[2px_0_0_hsl(var(--border))]">Giờ về</TableCell>
                                {monthDays.map((day) => renderTimeCell(day, shift.key, "check_out_time", `${worker.worker_id}-${shift.key}-out`))}
                                {renderBlankTotalCell(`${worker.worker_id}-${shift.key}-out-total`)}
                              </TableRow>,
                            ]),
                              <TableRow key={`${worker.worker_id}-total`} className="border-t-2 border-emerald-300 bg-emerald-100/80 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/50">
                                <TableCell colSpan={2} className="sticky left-[170px] z-20 w-[180px] border-r border-emerald-300 bg-emerald-100 px-2 text-center font-semibold dark:bg-emerald-950/40">Tổng giờ làm</TableCell>
                              {monthDays.map((day) => renderStaticMetricCell(day, metricText(metricForDay(day.dateKey)), `${worker.worker_id}-hour-total`))}
                              {renderTotalCell(`${worker.worker_id}-hour-total`)}
                            </TableRow>,
                          ];
                        }

                        return [
                              <TableRow key={`${worker.worker_id}-metric`}>
                                {renderWorkerCell(2)}
                            <TableCell className="sticky left-[170px] z-20 w-[90px] border-r bg-background px-2 text-center align-middle shadow-[2px_0_0_hsl(var(--border))]">-</TableCell>
                            <TableCell className="sticky left-[260px] z-20 w-[90px] border-r bg-background px-2 align-middle shadow-[2px_0_0_hsl(var(--border))]">{workerMethod === "DAY" ? "Ngày công" : "Sản lượng"}</TableCell>
                            {monthDays.map((day) => renderMetricCell(day, metricText(metricForDay(day.dateKey)), attendanceMetricUnit(workerMethod), `${worker.worker_id}-metric`))}
                            {renderBlankTotalCell(`${worker.worker_id}-metric-total`)}
                          </TableRow>,
                          <TableRow key={`${worker.worker_id}-total`} className="border-t-2 border-emerald-300 bg-emerald-100/80 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/50">
                            <TableCell colSpan={2} className="sticky left-[170px] z-20 w-[180px] border-r border-emerald-300 bg-emerald-100 px-2 text-center font-semibold dark:bg-emerald-950/40">{attendanceMetricLabel(workerMethod)}</TableCell>
                            {monthDays.map((day) => renderStaticMetricCell(day, metricText(metricForDay(day.dateKey)), `${worker.worker_id}-metric-total`))}
                            {renderTotalCell(`${worker.worker_id}-metric-total-summary`)}
                          </TableRow>,
                        ];
                      })}
                      {!sheetWorkers.length && <TableRow><TableCell colSpan={monthDays.length + 4} className="h-24 text-center text-muted-foreground">Chưa có nhân sự phù hợp bộ lọc</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

             <TabsContent value="HISTORY" className="space-y-4">
              <div className="flex flex-wrap items-end gap-3 border-b pb-4">
                 <div className="w-full max-w-48 space-y-1"><Label className="text-xs">Tháng</Label><Input type="month" max={localMonthKey()} value={selectedMonth} onChange={(event) => event.target.value && setSelectedMonth(event.target.value)} className="h-9" /></div>
                <div className="min-w-52 flex-1 space-y-1"><Label className="text-xs">Nhân sự</Label><Select value={workerFilter} onValueChange={setWorkerFilter}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả nhân sự</SelectItem>{workerDirectory.map((worker) => <SelectItem key={worker.worker_id} value={worker.worker_id}>{worker.employee_code} · {worker.worker_name}</SelectItem>)}</SelectContent></Select></div>
                <div className="min-w-44 flex-1 space-y-1"><Label className="text-xs">Hình thức</Label><Select value={methodFilter} onValueChange={(value) => setMethodFilter(value as AttendanceMethod | "ALL")}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả hình thức</SelectItem><SelectItem value="DAY">Theo ngày</SelectItem><SelectItem value="HOUR">Theo giờ</SelectItem><SelectItem value="OUTPUT">Theo sản lượng</SelectItem></SelectContent></Select></div>
                <div className="min-w-44 flex-1 space-y-1"><Label className="text-xs">Luồng duyệt</Label><Select value={workflowFilter} onValueChange={(value) => setWorkflowFilter(value as AttendanceWorkflowStatus | "ALL")}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả trạng thái</SelectItem><SelectItem value="SUBMITTED">Chờ duyệt</SelectItem><SelectItem value="APPROVED">Đã duyệt</SelectItem><SelectItem value="REJECTED">Từ chối</SelectItem><SelectItem value="LOCKED">Đã khóa</SelectItem><SelectItem value="REVERSED">Đã đảo</SelectItem></SelectContent></Select></div>
               </div>
               {dayStatusAvailable === true && <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50/40 p-3">
                 <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-medium text-sky-950">Trạng thái ngày công</div><div className="text-xs text-sky-900/80">Các ngày không có bản ghi dương được ghi rõ để không nhầm với chưa nhập.</div></div><Badge variant="outline" className="border-sky-300 bg-background">{filteredDayStatuses.length} ngày</Badge></div>
                 <div className="overflow-x-auto rounded-md border bg-background">
                   <Table disableWrapper className="min-w-[720px] text-sm">
                     <TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead>Nhân sự</TableHead><TableHead>Trạng thái</TableHead><TableHead>Tiền ăn</TableHead><TableHead>Lý do</TableHead><TableHead>Cập nhật</TableHead></TableRow></TableHeader>
                     <TableBody>
                       {filteredDayStatuses.map((item) => <TableRow key={`${item.worker_id}-${item.work_date}`}>
                         <TableCell className="whitespace-nowrap">{formatWorkDate(item.work_date)}</TableCell>
                         <TableCell><div className="font-medium">{item.worker_name}</div><div className="text-xs text-muted-foreground">{item.employee_code}</div></TableCell>
                         <TableCell><Badge variant="outline" className={dayStatusBadgeClass(item.status)}>{dayStatusLabels[item.status]}</Badge></TableCell>
                         <TableCell>{item.meal_eligible ? <span className="text-emerald-700">Đủ điều kiện</span> : "-"}</TableCell>
                         <TableCell className="max-w-72 whitespace-normal">{item.reason || "-"}</TableCell>
                         <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString("vi-VN")}</TableCell>
                       </TableRow>)}
                       {!filteredDayStatuses.length && <TableRow><TableCell colSpan={6} className="h-16 text-center text-muted-foreground">Chưa có trạng thái ngày được ghi trong tháng này</TableCell></TableRow>}
                     </TableBody>
                   </Table>
                 </div>
               </div>}
               <div className="overflow-x-auto rounded-md border">
              <Table disableWrapper className="min-w-[1380px]">
                <TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead>Nhân sự</TableHead><TableHead>Vị trí</TableHead><TableHead>Công việc</TableHead><TableHead>Nguồn</TableHead><TableHead>Hình thức</TableHead><TableHead>Luồng duyệt</TableHead><TableHead>Thời gian</TableHead><TableHead className="text-right">Khối lượng</TableHead><TableHead className="text-right">Thành tiền</TableHead><TableHead>Ghi chú / thao tác</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filteredRows.map((row) => <TableRow key={`${row.source_type}-${row.id}`}>
                    <TableCell className="whitespace-nowrap">{formatWorkDate(row.work_date)}</TableCell>
                    <TableCell><div className="font-medium">{row.worker_name}</div><div className="text-xs text-muted-foreground">{row.employee_code}</div></TableCell>
                    <TableCell>{workerTypeLabels[row.worker_type] ?? row.worker_type}</TableCell>
                    <TableCell className="max-w-56 whitespace-normal"><div>{row.activity_name || "Công việc xưởng"}</div>{row.operation_code && <div className="text-xs text-muted-foreground">{row.operation_code}</div>}</TableCell>
                    <TableCell>{row.source_type === "FACTORY" ? <Badge variant="outline"><BriefcaseBusiness className="mr-1 h-3 w-3" />Xưởng</Badge> : <div><Badge variant="secondary">Lịch sử lệnh</Badge><div className="mt-1 text-xs text-muted-foreground">{row.production_order_number}</div></div>}</TableCell>
                    <TableCell><Badge variant={row.is_reversed ? "destructive" : "outline"}>{row.is_reversed ? "Đã đảo" : attendanceLabels[row.attendance_method]}</Badge></TableCell>
                    <TableCell>{workflowBadge(row.workflow_status)}</TableCell>
                    <TableCell className="whitespace-nowrap">{timeClockDetail(row) || "-"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{attendanceValue(row)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">{row.cost_visible && row.calculated_amount !== null ? money.format(row.calculated_amount) : "Ẩn"}{row.is_estimated && <Badge variant="outline" className="ml-2">Ước tính</Badge>}</TableCell>
                     <TableCell className="max-w-80 whitespace-normal text-sm text-muted-foreground"><div>{row.is_reversed ? `Đã đảo${row.reversal_reason ? `: ${row.reversal_reason}` : ""}` : row.notes || "-"}</div>{workflowAvailable && row.source_type === "FACTORY" && !row.is_reversed && (canApproveAttendance || canReverse) && <div className="mt-1 flex flex-wrap gap-1">{row.workflow_status === "SUBMITTED" && canApproveAttendance && <><Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setWorkflowRow(row); setWorkflowTarget("APPROVED"); }}><Check className="mr-1 h-3 w-3" />Duyệt</Button><Button size="sm" variant="outline" className="h-7 px-2 text-xs text-destructive" onClick={() => { setWorkflowRow(row); setWorkflowTarget("REJECTED"); }}><X className="mr-1 h-3 w-3" />Từ chối</Button></>}{row.workflow_status === "APPROVED" && canReverse && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setWorkflowRow(row); setWorkflowTarget("LOCKED"); }}><LockKeyhole className="mr-1 h-3 w-3" />Khóa</Button>}{row.workflow_status === "REJECTED" && canRecord && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setWorkflowRow(row); setWorkflowTarget("SUBMITTED"); }}><ArrowRight className="mr-1 h-3 w-3" />Gửi lại</Button>}{canReverse && <Button size="icon" variant="ghost" className="h-7 w-7" title="Đảo bản ghi" onClick={() => setReversalRow(row)}><RotateCcw className="h-3.5 w-3.5" /></Button>}</div>}{!workflowAvailable && canReverse && !row.is_reversed && <Button size="icon" variant="ghost" className="ml-1 h-7 w-7" title="Đảo bản ghi" onClick={() => setReversalRow(row)}><RotateCcw className="h-3.5 w-3.5" /></Button>}</TableCell>
                  </TableRow>)}
                  {!filteredRows.length && <TableRow><TableCell colSpan={11} className="h-24 text-center text-muted-foreground">Chưa có chấm công trong tháng này</TableCell></TableRow>}
                </TableBody>
              </Table>
              </div>
            </TabsContent>

            <TabsContent value="OVERTIME" className="space-y-4">
               <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
                 <div><div className="text-sm font-medium">Tăng ca độc lập</div><div className="text-xs text-muted-foreground">Ghi số phút thực tế; tiền tăng ca sẽ do bộ máy tính lương áp dụng chính sách sau khi duyệt.</div></div>
                 <div className="flex items-end gap-3"><div className="text-right text-xs text-muted-foreground"><div>Tổng phút đang lọc</div><div className="text-sm font-semibold text-foreground">{number.format(overtimeMinutesTotal)} phút</div></div>{canRecord && overtimeAvailable === true && <Button size="sm" onClick={() => { setOvertimeForm((current) => ({ ...current, workerId: workerFilter !== "ALL" ? workerFilter : activeWorkers[0]?.id ?? "", workDate: selectedWorkDate })); setOvertimeOpen(true); }}><Plus className="mr-2 h-4 w-4" />Ghi tăng ca</Button>}</div>
               </div>
               <div className="flex flex-wrap items-end gap-3 border-b pb-4">
                 <div className="min-w-52 flex-1 space-y-1"><Label className="text-xs">Nhân sự</Label><Select value={workerFilter} onValueChange={setWorkerFilter}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả nhân sự</SelectItem>{workerDirectory.map((worker) => <SelectItem key={worker.worker_id} value={worker.worker_id}>{worker.employee_code} · {worker.worker_name}</SelectItem>)}</SelectContent></Select></div>
                 <div className="min-w-44 flex-1 space-y-1"><Label className="text-xs">Luồng duyệt</Label><Select value={workflowFilter} onValueChange={(value) => setWorkflowFilter(value as AttendanceWorkflowStatus | "ALL")}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả trạng thái</SelectItem><SelectItem value="SUBMITTED">Chờ duyệt</SelectItem><SelectItem value="APPROVED">Đã duyệt</SelectItem><SelectItem value="REJECTED">Từ chối</SelectItem><SelectItem value="LOCKED">Đã khóa</SelectItem></SelectContent></Select></div>
               </div>
              <div className="overflow-x-auto rounded-md border">
                <Table disableWrapper className="min-w-[980px]">
                  <TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead>Nhân sự</TableHead><TableHead>Loại</TableHead><TableHead className="text-right">Phút</TableHead><TableHead>Lý do</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
                  <TableBody>
                     {filteredOvertimeRows.map((row) => <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{formatWorkDate(row.work_date)}</TableCell>
                      <TableCell><div className="font-medium">{row.worker_name}</div><div className="text-xs text-muted-foreground">{row.employee_code}</div></TableCell>
                      <TableCell>{overtimeLabels[row.overtime_type]}</TableCell>
                      <TableCell className="text-right tabular-nums">{number.format(row.overtime_minutes)}</TableCell>
                      <TableCell className="max-w-72 whitespace-normal">{row.reason}</TableCell>
                      <TableCell>{workflowBadge(row.status)}</TableCell>
                       <TableCell className="text-right"><div className="flex justify-end gap-1">{canApproveAttendance && row.status === "SUBMITTED" && <><Button size="sm" variant="outline" onClick={() => { setOvertimeWorkflowRow(row); setOvertimeWorkflowTarget("APPROVED"); }}><Check className="mr-1 h-3 w-3" />Duyệt</Button><Button size="sm" variant="outline" className="text-destructive" onClick={() => { setOvertimeWorkflowRow(row); setOvertimeWorkflowTarget("REJECTED"); }}><X className="mr-1 h-3 w-3" />Từ chối</Button></>}{canReverse && row.status === "APPROVED" && <Button size="sm" variant="outline" onClick={() => { setOvertimeWorkflowRow(row); setOvertimeWorkflowTarget("LOCKED"); }}><LockKeyhole className="mr-1 h-3 w-3" />Khóa</Button>}{canRecord && row.status === "REJECTED" && <Button size="sm" variant="outline" onClick={() => { setOvertimeWorkflowRow(row); setOvertimeWorkflowTarget("SUBMITTED"); }}><ArrowRight className="mr-1 h-3 w-3" />Gửi lại</Button>}</div></TableCell>
                    </TableRow>)}
                     {!filteredOvertimeRows.length && <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Chưa có tăng ca phù hợp bộ lọc</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="PRODUCT_OUTPUT" className="space-y-4">
              <ProductionOutputPanel
                month={selectedMonth}
                onMonthChange={setSelectedMonth}
                workers={workers}
                canRecord={canRecord}
                canApprove={canApproveAttendance}
                canReverse={canReverse}
              />
            </TabsContent>
          </>
        )}
      </Tabs>

      <Dialog open={attendanceOpen} onOpenChange={setAttendanceOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>Chấm công xưởng</DialogTitle><DialogDescription>Ghi nhận công việc theo nhân sự và ngày, không cần chọn lệnh sản xuất.</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Nhân sự</Label><Select value={attendanceForm.workerId} onValueChange={(value) => { const worker = activeWorkers.find((item) => item.id === value); setAttendanceForm((current) => ({ ...current, workerId: value, method: methodForWorker(worker) })); }}><SelectTrigger><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger><SelectContent>{activeWorkers.map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} · {worker.display_name}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Hình thức theo hồ sơ</Label><div className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm"><AttendanceIcon className="h-4 w-4" />{attendanceLabels[attendanceForm.method]}</div></div>
            </div>
            {canAccessRates && <div className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${attendanceEffectiveRate ? "bg-muted/30" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
              <div className="flex min-w-0 items-center gap-2"><CircleDollarSign className="h-4 w-4 shrink-0" /><div className="truncate">{attendanceEffectiveRate ? "Mức công áp dụng" : "Chưa có mức công cho ngày này"}</div></div>
              {attendanceEffectiveRate && <div className="whitespace-nowrap font-medium">{money.format(rateAmount(attendanceEffectiveRate) ?? 0)} {rateUnit(attendanceForm.method)}</div>}
            </div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>Ngày làm</Label><Input type="date" min={selectedMonthStart} max={localDateKey() < selectedMonthEnd ? localDateKey() : selectedMonthEnd} value={attendanceForm.workDate} onChange={(event) => setAttendanceForm((current) => ({ ...current, workDate: event.target.value }))} /></div>
              {attendanceForm.method === "DAY" && <div className="space-y-2"><Label>Số ngày công</Label><Input type="number" min="0.25" max="2" step="0.25" value={attendanceForm.dayUnits} onChange={(event) => setAttendanceForm((current) => ({ ...current, dayUnits: event.target.value }))} /></div>}
              {attendanceForm.method === "OUTPUT" && <div className="space-y-2"><Label>Sản lượng đạt</Label><Input type="number" min="0.01" step="0.01" value={attendanceForm.outputQuantity} onChange={(event) => setAttendanceForm((current) => ({ ...current, outputQuantity: event.target.value }))} /></div>}
            </div>
            {attendanceForm.method === "HOUR" && <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2"><Label>Giờ đến</Label><Input type="time" step="60" value={attendanceForm.checkInTime} onChange={(event) => setAttendanceForm((current) => ({ ...current, checkInTime: event.target.value }))} /></div>
              <div className="space-y-2"><Label>Giờ về</Label><Input type="time" step="60" value={attendanceForm.checkOutTime} onChange={(event) => setAttendanceForm((current) => ({ ...current, checkOutTime: event.target.value }))} /></div>
              <div className="space-y-2"><Label>Nghỉ (phút)</Label><Input type="number" min="0" step="5" value={attendanceForm.breakMinutes} onChange={(event) => setAttendanceForm((current) => ({ ...current, breakMinutes: event.target.value }))} /></div>
              <div className={`sm:col-span-3 rounded-md border px-3 py-2 text-sm ${workedTime.error ? "border-destructive/40 text-destructive" : "bg-muted/40"}`}>
                {workedTime.error || <><span className="text-muted-foreground">Giờ làm thực tế: </span><span className="font-semibold">{number.format(calculatedWorkHours)} giờ</span></>}
              </div>
            </div>}
            {!attendanceDateValid && <div className="text-xs text-destructive">Ngày làm phải nằm trong tháng đang chọn và không được ở tương lai.</div>}
             {aggregateError && <div className="text-xs text-destructive">{aggregateError}</div>}
            {attendanceValueError && <div className="text-xs text-destructive">{attendanceValueError}</div>}
            {sameDayRows.length > 0 && <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">Ngày này đã ghi nhận: {existingDayUnits > 0 ? `${number.format(existingDayUnits)} ngày công` : ""}{existingDayUnits > 0 && (existingWorkHours > 0 || existingOutputQuantity > 0) ? " · " : ""}{existingWorkHours > 0 ? `${number.format(existingWorkHours)} giờ` : ""}{existingWorkHours > 0 && existingOutputQuantity > 0 ? " · " : ""}{existingOutputQuantity > 0 ? `${number.format(existingOutputQuantity)} sản phẩm` : ""}. Chỉ ghi thêm khi đây là một lượt công việc khác.</div>}
            {attendanceForm.method === "DAY" && <div className="space-y-2"><Label>Giờ chuẩn / ngày</Label><Input type="number" min="0.25" max="24" step="0.5" value={attendanceForm.standardHoursPerDay} onChange={(event) => setAttendanceForm((current) => ({ ...current, standardHoursPerDay: event.target.value }))} /></div>}
            <div className="space-y-2"><Label>{attendanceForm.method === "OUTPUT" ? "Công việc / sản phẩm" : "Công việc (tùy chọn)"}</Label><Input value={attendanceForm.activityName} onChange={(event) => setAttendanceForm((current) => ({ ...current, activityName: event.target.value }))} placeholder={attendanceForm.method === "OUTPUT" ? "VD: May vỏ gối 50x70" : "VD: Dọn kho, đóng gói, kiểm hàng"} /></div>
            <div className="space-y-2"><Label>Ghi chú</Label><Textarea value={attendanceForm.notes} onChange={(event) => setAttendanceForm((current) => ({ ...current, notes: event.target.value }))} /></div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0"><Button variant="outline" onClick={() => setAttendanceOpen(false)}>Đóng</Button>{hasNextAttendanceWorker && <Button variant="secondary" onClick={() => void submitAttendance(true)} disabled={!validAttendance || busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}Lưu và người tiếp</Button>}<Button onClick={() => void submitAttendance()} disabled={!validAttendance || busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ghi nhận</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reversalRow)} onOpenChange={(open) => { if (!open) { setReversalRow(null); setReversalReason(""); } }}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Đảo bản ghi chấm công</DialogTitle><DialogDescription>Dữ liệu gốc được giữ nguyên và đánh dấu đã đảo để bảo toàn lịch sử.</DialogDescription></DialogHeader><div className="space-y-2"><Label>Lý do bắt buộc</Label><Textarea autoFocus value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="VD: Chọn nhầm nhân sự" /></div><DialogFooter><Button variant="outline" onClick={() => setReversalRow(null)}>Hủy</Button><Button variant="destructive" onClick={() => void submitReversal()} disabled={busy || !reversalReason.trim()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Xác nhận đảo</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(workflowRow && workflowTarget)} onOpenChange={(open) => { if (!open) { setWorkflowRow(null); setWorkflowTarget(null); setWorkflowReason(""); } }}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>{workflowTarget ? workflowLabels[workflowTarget] : "Cập nhật luồng duyệt"}</DialogTitle><DialogDescription>{workflowRow ? `${workflowRow.worker_name} · ${formatWorkDate(workflowRow.work_date)} · ${attendanceValue(workflowRow)}` : ""}</DialogDescription></DialogHeader><div className="space-y-2"><Label>{workflowTarget === "APPROVED" ? "Ghi chú duyệt (tùy chọn)" : "Lý do"}{workflowTarget !== "APPROVED" && " *"}</Label><Textarea autoFocus value={workflowReason} onChange={(event) => setWorkflowReason(event.target.value)} placeholder={workflowTarget === "REJECTED" ? "Nêu rõ dữ liệu cần sửa" : "Ghi chú xử lý"} /></div><DialogFooter><Button variant="outline" onClick={() => setWorkflowRow(null)}>Hủy</Button><Button onClick={() => void submitWorkflow()} disabled={busy || (workflowTarget !== "APPROVED" && !workflowReason.trim())}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{workflowTarget === "APPROVED" ? "Duyệt" : workflowTarget === "REJECTED" ? "Từ chối" : workflowTarget === "LOCKED" ? "Khóa" : "Gửi lại"}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(dayStatusTarget)} onOpenChange={(open) => { if (!open) { setDayStatusTarget(null); setDayStatusForm({ status: "PRESENT", mealEligible: false, reason: "" }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Trạng thái ngày công</DialogTitle><DialogDescription>{dayStatusTarget ? `${formatWorkDate(dayStatusTarget.workDate)} · ${activeWorkers.find((worker) => worker.id === dayStatusTarget.workerId)?.display_name ?? "Nhân sự"}` : "Ghi rõ ngày có mặt, vắng hoặc nghỉ để không nhầm với chưa nhập."}</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2"><Label>Trạng thái</Label><Select value={dayStatusForm.status} onValueChange={(value) => setDayStatusForm((current) => ({ ...current, status: value as FactoryAttendanceDayStatus, mealEligible: value === "PRESENT" ? current.mealEligible : false }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(dayStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <label className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${dayStatusForm.status === "PRESENT" ? "" : "opacity-50"}`}><Checkbox checked={dayStatusForm.mealEligible} disabled={dayStatusForm.status !== "PRESENT"} onCheckedChange={(checked) => setDayStatusForm((current) => ({ ...current, mealEligible: checked === true }))} /><span>Đủ điều kiện tiền ăn</span></label>
            <div className="space-y-2"><Label>Lý do / ghi chú</Label><Textarea value={dayStatusForm.reason} onChange={(event) => setDayStatusForm((current) => ({ ...current, reason: event.target.value }))} placeholder="VD: Nghỉ phép đã duyệt, nghỉ lễ, nghỉ không lương..." /></div>
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">Trạng thái được lưu theo lịch sử append-only. Muốn sửa, hãy tạo trạng thái mới; dữ liệu cũ vẫn được giữ để đối soát.</div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDayStatusTarget(null)}>Hủy</Button><Button onClick={() => void submitDayStatus()} disabled={busy || dayStatusAvailable !== true}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Lưu trạng thái</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(closureTarget)} onOpenChange={(open) => { if (!open) { setClosureTarget(null); setClosureReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{closureTarget ? (closureTarget.current === "OPEN" || closureTarget.current === "REOPENED" ? "Xác nhận ngày công" : closureTarget.current === "EMPLOYEE_CONFIRMED" ? "Chốt ngày ở cấp quản lý" : "Mở lại ngày công") : "Chốt ngày công"}</DialogTitle><DialogDescription>{closureTarget ? `${formatWorkDate(closureTarget.workDate)} · ${activeWorkers.find((worker) => worker.id === closureTarget.workerId)?.display_name ?? "Nhân sự"}` : ""}</DialogDescription></DialogHeader>
          {closureTarget?.current === "LEADER_CONFIRMED" && <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Mở lại sẽ cho phép bổ sung dữ liệu sau khi đã chốt. Lý do được lưu vào nhật ký.</div>}
          <div className="space-y-2"><Label>Lý do {closureTarget?.current === "LEADER_CONFIRMED" ? "*" : "(tùy chọn)"}</Label><Textarea value={closureReason} onChange={(event) => setClosureReason(event.target.value)} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setClosureTarget(null)}>Hủy</Button><Button onClick={() => void submitClosure()} disabled={busy || (closureTarget?.current === "LEADER_CONFIRMED" && !closureReason.trim())}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{closureTarget?.current === "EMPLOYEE_CONFIRMED" ? "Chốt ngày" : closureTarget?.current === "LEADER_CONFIRMED" ? "Mở lại" : "Xác nhận"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={overtimeOpen} onOpenChange={setOvertimeOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Ghi nhận tăng ca</DialogTitle><DialogDescription>Chỉ nhập thời lượng và lý do. Hệ thống không cho nhập tiền tăng ca trực tiếp.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Nhân sự</Label><Select value={overtimeForm.workerId} onValueChange={(value) => setOvertimeForm((current) => ({ ...current, workerId: value }))}><SelectTrigger><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger><SelectContent>{activeWorkers.map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} · {worker.display_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Ngày</Label><Input type="date" max={localDateKey()} value={overtimeForm.workDate} onChange={(event) => setOvertimeForm((current) => ({ ...current, workDate: event.target.value }))} /></div></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Loại tăng ca</Label><Select value={overtimeForm.type} onValueChange={(value) => setOvertimeForm((current) => ({ ...current, type: value as OvertimeType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(overtimeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Số phút</Label><Input type="number" min="1" max="1440" step="15" value={overtimeForm.minutes} onChange={(event) => setOvertimeForm((current) => ({ ...current, minutes: event.target.value }))} /></div></div><div className="space-y-2"><Label>Lý do *</Label><Textarea value={overtimeForm.reason} onChange={(event) => setOvertimeForm((current) => ({ ...current, reason: event.target.value }))} placeholder="VD: Hoàn tất đơn gấp" /></div></div><DialogFooter><Button variant="outline" onClick={() => setOvertimeOpen(false)}>Hủy</Button><Button onClick={() => void submitOvertime()} disabled={!validOvertime || busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Gửi tăng ca</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(overtimeWorkflowRow && overtimeWorkflowTarget)} onOpenChange={(open) => { if (!open) { setOvertimeWorkflowRow(null); setOvertimeWorkflowTarget(null); setOvertimeWorkflowReason(""); } }}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>{overtimeWorkflowTarget ? workflowLabels[overtimeWorkflowTarget] : "Tăng ca"}</DialogTitle><DialogDescription>{overtimeWorkflowRow ? `${overtimeWorkflowRow.worker_name} · ${formatWorkDate(overtimeWorkflowRow.work_date)} · ${overtimeWorkflowRow.overtime_minutes} phút` : ""}</DialogDescription></DialogHeader><div className="space-y-2"><Label>Lý do {overtimeWorkflowTarget !== "APPROVED" && "*"}</Label><Textarea value={overtimeWorkflowReason} onChange={(event) => setOvertimeWorkflowReason(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setOvertimeWorkflowRow(null)}>Hủy</Button><Button onClick={() => void submitOvertimeWorkflow()} disabled={busy || (overtimeWorkflowTarget !== "APPROVED" && !overtimeWorkflowReason.trim())}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Xác nhận</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={workerOpen} onOpenChange={setWorkerOpen}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Thêm nhân sự xưởng</DialogTitle><DialogDescription>Tạo nhân sự dùng chung cho bảng công và sản xuất.</DialogDescription></DialogHeader><div className="grid gap-4"><div className="space-y-2"><Label>Mã nhân sự</Label><Input value={workerForm.employeeCode} onChange={(event) => setWorkerForm((current) => ({ ...current, employeeCode: event.target.value }))} placeholder="VD: MAY-01" /></div><div className="space-y-2"><Label>Họ tên</Label><Input value={workerForm.displayName} onChange={(event) => setWorkerForm((current) => ({ ...current, displayName: event.target.value }))} /></div><div className="space-y-2"><Label>Vị trí</Label><Select value={workerForm.workerType} onValueChange={(value) => setWorkerForm((current) => ({ ...current, workerType: value as WorkerType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(workerTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setWorkerOpen(false)}>Đóng</Button><Button onClick={() => void submitWorker()} disabled={!validWorker || busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Tạo nhân sự</Button></DialogFooter></DialogContent>
      </Dialog>

    </div>
  );
}
