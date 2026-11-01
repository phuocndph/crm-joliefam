import { getLocalUserSession } from "@/lib/local-auth";
import { useSearchParams } from "react-router-dom";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRole } from "@/hooks/useUserRole";
import { localApi, type AttendanceDaySummary, type AttendanceBulkPreview } from "@/lib/local-api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import type {
  AttendanceMethod,
  AttendanceWorkflowStatus,
  FactoryAttendanceDayStatus,
  FactoryAttendanceRow,
  FactoryOvertimeRow,
  OvertimeType,
  ProductionEntryProduct,
  ProductionEntryRow,
  ProductionWorker,
} from "@/integrations/supabase/production-execution-types";
import {
  bulkFactoryAttendanceWorkflow,
  quickCreateProductionWorker,
  listFactoryAttendanceClosures,
  listFactoryAttendanceDayStatusMonth,
  listFactoryAttendanceHistoryMonth,
  listFactoryAttendanceMonthWithMeta,
  listFactoryOvertimeMonth,
  listProductionEntriesMonth,
  listProductionEntryProducts,
  listWorkerAttendanceMethods,
  recordFactoryAttendance,
  recordFactoryHourAttendance,
  recordFactoryOvertime,
  recordProductionEntry,
  reverseFactoryAttendance,
  reverseProductionEntry,
  setFactoryAttendanceDayClosure,
  setFactoryAttendanceDayStatus,
  setFactoryAttendanceStatus,
  setFactoryOvertimeStatus,
  setProductionEntryStatus,
} from "@/lib/production-execution";
import { isLocalBackend } from "@/lib/runtime-config";
import {
  attendanceValueLabel,
  attendanceDayMatchesFilters,
  attendanceDayInQueue,
  attendanceBulkScopeSignature,
  workerDayAction,
  buildWorkerDayAttendance,
  type WorkerDayAttendance,
} from "@/lib/attendance-workspace";
import { exportFactoryAttendanceWorkbook } from "@/lib/factory-attendance-export";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Filter,
  History,
  LockKeyhole,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  X,
} from "lucide-react";

import { payrollSourceDate } from '@/lib/payroll-reconciliation';

interface AttendanceWorkspaceV2Props {
  workers: ProductionWorker[];
  canRecord: boolean;
  canApproveAttendance: boolean;
  canReverse: boolean;
  canConfirmDay: boolean;
  canManageDayClosure: boolean;
  canSetDayStatus: boolean;
  initialMonth?: string;
  initialDate?: string;
  onWorkersChanged?: () => Promise<void> | void;
}

type QuickEntryForm = {
  workerId: string;
  method: AttendanceMethod;
  dayUnits: string;
  checkInTime: string;
  checkOutTime: string;
  breakMinutes: string;
  productId: string;
  outputQuantity: string;
  activityName: string;
  notes: string;
};

const workerTypeLabels: Record<string, string> = {
  CUTTER: "Tổ cắt",
  SEWER: "Tổ may",
  IRONING: "Tổ ủi",
  QC: "Tổ QC",
  PACKER: "Tổ đóng gói",
  HELPER: "Tổ phụ trợ",
  SUPERVISOR: "Quản lý xưởng",
  GENERIC: "Khác",
};

const methodLabels: Record<AttendanceMethod, string> = {
  DAY: "Ngày công",
  HOUR: "Theo giờ",
  OUTPUT: "Theo sản lượng",
};
const statusLabels: Record<AttendanceWorkflowStatus, string> = {
  SUBMITTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  LOCKED: "Đã khóa",
  REVERSED: "Đã đảo",
};
const dayStatusLabels: Record<FactoryAttendanceDayStatus, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Vắng",
  PAID_LEAVE: "Nghỉ phép hưởng lương",
  UNPAID_LEAVE: "Nghỉ không lương",
  HOLIDAY: "Ngày lễ",
  OFF: "Ngày nghỉ",
};

const dateKey = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
const monthKey = (date: string) => `${date.slice(0, 7)}-01`;
const monthInputKey = (date: string) => date.slice(0, 7);
const daysForMonth = (month: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match)
    return [] as Array<{
      dateKey: string;
      day: number;
      weekdayLabel: string;
      isWeekend: boolean;
    }>;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const count = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, monthNumber - 1, day);
    const weekday = date.getDay();
    return {
      dateKey: `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
      weekdayLabel: weekday === 0 ? "CN" : `T${weekday + 1}`,
      isWeekend: weekday === 0 || weekday === 6,
    };
  });
};
const makeIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
type ReasonSubmission = { reason: string; key: string; generation: number };
type AttendanceReasonAction =
  | { kind: "ATTENDANCE_REVERSE"; id: string }
  | { kind: "ATTENDANCE_WORKFLOW"; id: string; target: "REJECTED" | "LOCKED" }
  | { kind: "PRODUCTION_REVERSE"; id: string }
  | { kind: "PRODUCTION_WORKFLOW"; id: string; target: "REJECTED" }
  | { kind: "OVERTIME_WORKFLOW"; id: string; target: "REJECTED" | "LOCKED"; fromDayDetail: boolean }
  | { kind: "APPROVE_CLOSE" }
  | { kind: "CLOSURE"; target: "EMPLOYEE_CONFIRMED" | "REOPENED" };
type PendingAttendanceReason = {
  action: AttendanceReasonAction; requestId: string; workerId: string; workDate: string;
  title: string; required: boolean; contextDate: string; contextWorkerId: string | null;
  sourceSignature?: string; reviewedSignature?: string;
};
const reasonDaySignature = (summary: AttendanceDaySummary) => JSON.stringify({
  revision: summary.current_revision, fingerprint: summary.source_fingerprint,
  closure: summary.closure, dayStatus: summary.day_status, dayStatusReason: summary.day_status_reason,
  locked: summary.payroll_locked,
});
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Không thể tải dữ liệu chấm công.";
const amount = (value: number) =>
  `${Math.round(value).toLocaleString("vi-VN")} đ`;
const productUnitLabel = (value: string | null | undefined) =>
  value === "SET" ? "bộ" : "SP";
const clockMinutes = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
    ? hours * 60 + minutes
    : null;
};

const overtimeLabels: Record<OvertimeType, string> = {
  NORMAL_OVERTIME: "Tăng ca ngày thường",
  SUNDAY_OVERTIME: "Tăng ca Chủ nhật",
  HOLIDAY_OVERTIME: "Tăng ca ngày lễ",
};

const dayStatusShortLabels: Record<FactoryAttendanceDayStatus, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Vắng",
  PAID_LEAVE: "NPL",
  UNPAID_LEAVE: "NKL",
  HOLIDAY: "Lễ",
  OFF: "Nghỉ",
};

const historyEntityLabels: Record<string, string> = {
  ATTENDANCE: "Ngày / giờ",
  PRODUCTION_ENTRY: "Sản lượng",
  OVERTIME: "Tăng ca",
  DAY_STATUS: "Trạng thái ngày",
  DAY_CLOSURE: "Chốt ngày",
};

const historyActionLabels: Record<string, string> = {
  CREATE: "Tạo",
  STATUS: "Đổi trạng thái",
  BULK_STATUS: "Duyệt hàng loạt",
  REVERSE: "Đảo bản ghi",
  UPSERT: "Cập nhật",
};

type WorkspaceView = "QUEUE" | "DAY" | "MONTH" | "HISTORY" | "OVERTIME";

type OvertimeForm = {
  workerId: string;
  workDate: string;
  type: OvertimeType;
  minutes: string;
  reason: string;
};

function workflowBadge(status: AttendanceWorkflowStatus | undefined) {
  const value = status ?? "APPROVED";
  const classes: Record<AttendanceWorkflowStatus, string> = {
    SUBMITTED: "border-amber-300 bg-amber-50 text-amber-800",
    APPROVED: "border-emerald-300 bg-emerald-50 text-emerald-800",
    REJECTED: "border-red-300 bg-red-50 text-red-800",
    LOCKED: "border-slate-300 bg-slate-100 text-slate-700",
    REVERSED: "border-slate-300 bg-slate-100 text-slate-600",
  };
  return (
    <Badge variant="outline" className={classes[value]}>
      {statusLabels[value]}
    </Badge>
  );
}

function closureBadge(status: WorkerDayAttendance["closureStatus"]) {
  const label =
    status === "OPEN" || status === "REOPENED"
      ? "Mở"
      : status === "EMPLOYEE_CONFIRMED"
        ? "NV đã xác nhận"
        : "Đã chốt";
  return (
    <Badge
      variant="outline"
      className={
        status === "LEADER_CONFIRMED"
          ? "border-slate-300 bg-slate-100 text-slate-700"
          : "border-blue-300 bg-blue-50 text-blue-800"
      }
    >
      {label}
    </Badge>
  );
}

function entrySummary(entry: FactoryAttendanceRow) {
  if (entry.attendance_method === "DAY")
    return `${Number(entry.day_units || 0).toLocaleString("vi-VN")} ngày công`;
  if (entry.attendance_method === "HOUR")
    return `${Number(entry.worked_minutes == null ? entry.work_hours || 0 : entry.worked_minutes / 60).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} giờ`;
  return `${Number(entry.output_quantity || 0).toLocaleString("vi-VN")} sản phẩm`;
}

export default function AttendanceWorkspaceV2({
  workers,
  canRecord: canRecordPermission,
  canApproveAttendance: canApproveAttendancePermission,
  canReverse: canReversePermission,
  canConfirmDay: canConfirmDayPermission,
  canManageDayClosure: canManageDayClosurePermission,
  canSetDayStatus: canSetDayStatusPermission,
  initialMonth,
  initialDate,
  onWorkersChanged,
}: AttendanceWorkspaceV2Props) {
  const isMobile = useIsMobile();
  const [urlParams,setUrlParams]=useSearchParams();
  const {user}=useAuthReady();const {role}=useUserRole(user);
  const canProxyConfirm=['admin','manager'].includes(role||'');
  const [detailSummary,setDetailSummary]=useState<AttendanceDaySummary|null>(null);
  const [detailError,setDetailError]=useState<string|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [bulkPreview,setBulkPreview]=useState<AttendanceBulkPreview|null>(null);
  const [selectedDate, setSelectedDate] = useState(() => payrollSourceDate(urlParams.get("date")||initialDate,urlParams.get("month")||initialMonth||'') || (/^\d{4}-(0[1-9]|1[0-2])$/.test(initialMonth||"") ? `${initialMonth}-01` : dateKey()));
  const [view, setView] = useState<WorkspaceView>(() => {
    const rawMode = (urlParams.get("mode") || "").toUpperCase();
    if (rawMode === "MATRIX" || rawMode === "MONTH") return "MONTH";
    if (rawMode === "DAILY" || rawMode === "DAY") return "DAY";
    if (rawMode === "OVERTIME" || rawMode === "HISTORY") return rawMode as WorkspaceView;
    if (rawMode === "QUEUE") return "DAY";
    return "DAY";
  });
  const [search, setSearch] = useState(urlParams.get("search")||"");
  const [team, setTeam] = useState(urlParams.get("team")||"ALL");
  const [methodFilter, setMethodFilter] = useState<"ALL" | AttendanceMethod>(
    "ALL",
  );
  const [workflowFilter, setWorkflowFilter] = useState("ALL");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const activeAdvancedFilters = [team, methodFilter, workflowFilter].filter((value) => value !== "ALL").length;
  const [attendanceRowsState, setAttendanceRows] = useState<FactoryAttendanceRow[]>(
    [],
  );
  const [productionEntriesState, setProductionEntries] = useState<
    ProductionEntryRow[]
  >([]);
  const [overtimeRowsState, setOvertimeRows] = useState<FactoryOvertimeRow[]>([]);
  const [overtimeAvailable, setOvertimeAvailable] = useState(true);
  const [products, setProducts] = useState<ProductionEntryProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [dayStatusesState, setDayStatuses] = useState<
    Awaited<ReturnType<typeof listFactoryAttendanceDayStatusMonth>>
  >([]);
  const [closuresState, setClosures] = useState<
    Awaited<ReturnType<typeof listFactoryAttendanceClosures>>
  >([]);
  const [historyEventsState, setHistoryEvents] = useState<
    Awaited<ReturnType<typeof listFactoryAttendanceHistoryMonth>>
  >([]);
  const [workerMethodsState, setWorkerMethods] = useState<
    Awaited<ReturnType<typeof listWorkerAttendanceMethods>>
  >([]);
  const [meta, setMeta] = useState<{
    timeClockAvailable: boolean;
    workflowAvailable: boolean;
  }>({ timeClockAvailable: true, workflowAvailable: true });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedWorker, setSelectedWorker] =
    useState<WorkerDayAttendance | null>(null);
  const [entryTarget, setEntryTarget] = useState<WorkerDayAttendance | null>(
    null,
  );
  const [entryForm, setEntryForm] = useState<QuickEntryForm>({
    workerId: "",
    method: "DAY",
    dayUnits: "1",
    checkInTime: "08:00",
    checkOutTime: "17:00",
    breakMinutes: "60",
    productId: "",
    outputQuantity: "1",
    activityName: "",
    notes: "",
  });
  const [dayStatusForm, setDayStatusForm] = useState<{
    status: FactoryAttendanceDayStatus;
    mealEligible: boolean;
    reason: string;
  }>({ status: "PRESENT", mealEligible: false, reason: "" });
  const [saving, setSaving] = useState(false);
  const [pendingReason, setPendingReason] = useState<PendingAttendanceReason | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [reasonFieldInvalid, setReasonFieldInvalid] = useState(false);
  const [reasonSnapshot, setReasonSnapshot] = useState<AttendanceDaySummary | null>(null);
  const [reasonPreparing, setReasonPreparing] = useState(false);
  const [reasonSubmitting, setReasonSubmitting] = useState(false);
  const reasonActiveRef = useRef<string | null>(null);
  const reasonInFlightRef = useRef(false);
  const reasonRetryRef = useRef<{ signature: string; key: string } | null>(null);
  const reasonTriggerRef = useRef<HTMLElement | null>(null);
  const reasonTextareaRef = useRef<HTMLTextAreaElement>(null);
  const reasonValidateRef = useRef<(pending: PendingAttendanceReason, summary: AttendanceDaySummary) => boolean>(()=>false);
  const reasonDispatchRef = useRef<(pending: PendingAttendanceReason, submission: ReasonSubmission) => Promise<boolean | void>>(async()=>false);
  const reasonRenderValidateRef = useRef(reasonValidateRef.current);
  const reasonRenderDispatchRef = useRef(reasonDispatchRef.current);
  const reasonLifecycleRef = useRef({mounted:false,generation:0});
  const reasonGenerationCurrent = (generation: number) => reasonLifecycleRef.current.mounted && reasonLifecycleRef.current.generation===generation;
  const reasonSubmissionCurrent = (submission?: ReasonSubmission) => !submission || reasonGenerationCurrent(submission.generation);
  useEffect(()=>{
    const lifecycle=reasonLifecycleRef.current;
    const generation=++lifecycle.generation;
    lifecycle.mounted=true;
    // Restore proxies on every setup, including StrictMode's setup/cleanup/setup.
    reasonValidateRef.current=(pending,summary)=>lifecycle.mounted && reasonActiveRef.current===pending.requestId && reasonRenderValidateRef.current(pending,summary);
    reasonDispatchRef.current=async(pending,submission)=>lifecycle.mounted && lifecycle.generation===submission.generation && reasonActiveRef.current===pending.requestId ? reasonRenderDispatchRef.current(pending,submission) : false;
    return ()=>{
      if (lifecycle.generation!==generation) return;
      lifecycle.mounted=false; lifecycle.generation++;
      reasonActiveRef.current=null; reasonRetryRef.current=null; reasonInFlightRef.current=false; reasonTriggerRef.current=null;
      reasonValidateRef.current=()=>false; reasonDispatchRef.current=async()=>false;
    };
  },[]);



  const [bulkApprovalOpen, setBulkApprovalOpen] = useState(false);
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const [overtimeForm, setOvertimeForm] = useState<OvertimeForm>({
    workerId: "",
    workDate: dateKey(),
    type: "NORMAL_OVERTIME",
    minutes: "60",
    reason: "",
  });
  const [methodError, setMethodError] = useState<string | null>(null);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [loadedMonth, setLoadedMonth] = useState("");
  const [loadedMethodsDate, setLoadedMethodsDate] = useState("");
  const attendanceRows = useMemo(() => loadedMonth === monthKey(selectedDate) ? attendanceRowsState : [], [loadedMonth, selectedDate, attendanceRowsState]);
  const productionEntries = useMemo(() => loadedMonth === monthKey(selectedDate) ? productionEntriesState : [], [loadedMonth, selectedDate, productionEntriesState]);
  const overtimeRows = useMemo(() => loadedMonth === monthKey(selectedDate) ? overtimeRowsState : [], [loadedMonth, selectedDate, overtimeRowsState]);
  const dayStatuses = useMemo(() => loadedMonth === monthKey(selectedDate) ? dayStatusesState : [], [loadedMonth, selectedDate, dayStatusesState]);
  const closures = useMemo(() => loadedMonth === monthKey(selectedDate) ? closuresState : [], [loadedMonth, selectedDate, closuresState]);
  const historyEvents = useMemo(() => loadedMonth === monthKey(selectedDate) ? historyEventsState : [], [loadedMonth, selectedDate, historyEventsState]);
  const workerMethods = useMemo(() => loadedMethodsDate === selectedDate ? workerMethodsState : [], [loadedMethodsDate, selectedDate, workerMethodsState]);
  const sourceReady = loadedMonth === monthKey(selectedDate) && loadedMethodsDate === selectedDate && !loading && !loadError && !methodsLoading && !methodError;
  const canRecord = canRecordPermission && sourceReady;
  const canApproveAttendance = canApproveAttendancePermission && sourceReady;
  const canReverse = canReversePermission && sourceReady;
  const canConfirmDay = canConfirmDayPermission && sourceReady;
  const canManageDayClosure = canManageDayClosurePermission && sourceReady;
  const dayStatusWritable =
    canSetDayStatusPermission && sourceReady &&
    selectedWorker?.closureStatus !== "LEADER_CONFIRMED" &&
    selectedDate <= dateKey();
  const canSetDayStatus = dayStatusWritable;

  const workspaceMonth = monthKey(selectedDate);
  const currentDateRef = useRef(selectedDate);
  currentDateRef.current = selectedDate;
  const monthRequestRef = useRef(0);
  const methodRequestRef = useRef(0);
  const productRequestRef = useRef(0);

  const loadMonth = useCallback(async () => {
    if (monthKey(currentDateRef.current) !== workspaceMonth) return;
    const request = ++monthRequestRef.current;
    setLoading(true);
    setLoadError(null);
    setRefreshing(true);
    const results = await Promise.allSettled([
      listFactoryAttendanceMonthWithMeta(workspaceMonth, true),
      listProductionEntriesMonth(workspaceMonth, true),
      listFactoryAttendanceDayStatusMonth(workspaceMonth),
      listFactoryAttendanceClosures(workspaceMonth),
      listFactoryOvertimeMonth(workspaceMonth),
      listFactoryAttendanceHistoryMonth(workspaceMonth),
    ]);
    if (request !== monthRequestRef.current || monthKey(currentDateRef.current) !== workspaceMonth) return;
    const [attendanceResult, productionResult, dayResult, closureResult, overtimeResult, historyResult] = results;
    setAttendanceRows(attendanceResult.status === "fulfilled" ? attendanceResult.value.rows : []);
    setProductionEntries(productionResult.status === "fulfilled" ? productionResult.value : []);
    setMeta(attendanceResult.status === "fulfilled" ? {
      timeClockAvailable: attendanceResult.value.timeClockAvailable,
      workflowAvailable: attendanceResult.value.workflowAvailable,
    } : { timeClockAvailable: false, workflowAvailable: false });
    setDayStatuses(dayResult.status === "fulfilled" ? dayResult.value : []);
    setClosures(closureResult.status === "fulfilled" ? closureResult.value : []);
    setOvertimeRows(overtimeResult.status === "fulfilled" ? overtimeResult.value : []);
    setHistoryEvents(historyResult.status === "fulfilled" ? historyResult.value : []);
    setOvertimeAvailable(overtimeResult.status === "fulfilled");
    const labels = ["Công ngày/giờ", "Sản lượng", "Trạng thái ngày", "Chốt ngày", "Tăng ca", "Lịch sử"];
    const failures = results.flatMap((result, index) => result.status === "rejected" ? [`${labels[index]}: ${errorMessage(result.reason)}`] : []);
    setLoadError(failures.length ? failures.join("; ") : null);
    setLoadedMonth(workspaceMonth);
    setLoading(false);
    setRefreshing(false);
  }, [workspaceMonth]);

  const loadMethods = useCallback(async () => {
    if (currentDateRef.current !== selectedDate) return;
    const request = ++methodRequestRef.current;
    setMethodsLoading(true);
    setMethodError(null);
    try {
      const result = await listWorkerAttendanceMethods(selectedDate);
      if (request !== methodRequestRef.current || currentDateRef.current !== selectedDate) return;
      setWorkerMethods(result);
    } catch (error) {
      if (request !== methodRequestRef.current || currentDateRef.current !== selectedDate) return;
      setWorkerMethods([]);
      setMethodError(errorMessage(error));
    } finally {
      if (request === methodRequestRef.current && currentDateRef.current === selectedDate) { setLoadedMethodsDate(selectedDate); setMethodsLoading(false); }
    }
  }, [selectedDate]);

  const loadWorkspace = useCallback(async () => {
    await Promise.all([loadMonth(), loadMethods()]);
  }, [loadMonth, loadMethods]);

  const loadProducts = useCallback(async () => {
    const request = ++productRequestRef.current;
    setProductsLoading(true);
    setProductError(null);
    try {
      const result = await listProductionEntryProducts(selectedDate);
      if (request === productRequestRef.current && currentDateRef.current === selectedDate) setProducts(result);
    } catch (error) {
      if (request !== productRequestRef.current || currentDateRef.current !== selectedDate) return;
      setProducts([]);
      setProductError(errorMessage(error));
    } finally {
      if (request === productRequestRef.current && currentDateRef.current === selectedDate) setProductsLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadMonth();
    return () => { monthRequestRef.current += 1; };
  }, [loadMonth]);

  useEffect(() => {
    void loadMethods();
    setEntryTarget(null);
    setProducts([]);
    setProductsLoading(false);
    return () => { methodRequestRef.current += 1; productRequestRef.current += 1; };
  }, [loadMethods]);

  const lastUrlRef=useRef(urlParams.toString());
  useEffect(()=>{
    const current=urlParams.toString();
    if(current!==lastUrlRef.current){lastUrlRef.current=current;const date=payrollSourceDate(urlParams.get('date'),urlParams.get('month')||'');if(date)setSelectedDate(date);const mode=urlParams.get('mode');if(['QUEUE','DAY','MONTH','HISTORY','OVERTIME'].includes(mode||''))setView(mode as WorkspaceView);setTeam(urlParams.get('team')||'ALL');setSearch(urlParams.get('search')||'');return;}
    const next=new URLSearchParams(urlParams);next.set('date',selectedDate);next.set('month',selectedDate.slice(0,7));next.set('mode',view);next.set('team',team);if(search)next.set('search',search);else next.delete('search');if(next.toString()!==current){lastUrlRef.current=next.toString();setUrlParams(next,{replace:true});}
  },[selectedDate,view,team,search,urlParams,setUrlParams]);
  const detailWorkerId=selectedWorker?.worker.id;
  useEffect(()=>{
    setDetailSummary(null);setDetailError(null);if(!isLocalBackend()||!detailWorkerId)return;
    let cancelled=false;setDetailLoading(true);localApi.attendanceDaySummary(detailWorkerId,selectedDate).then(value=>{if(!cancelled)setDetailSummary(value);}).catch(error=>{if(!cancelled)setDetailError(errorMessage(error));}).finally(()=>{if(!cancelled)setDetailLoading(false);});return()=>{cancelled=true;};
  },[detailWorkerId,selectedDate,loading]);
  const workerDays = useMemo(
    () =>
      buildWorkerDayAttendance({
        workers,
        attendanceMethods: workerMethods,
        attendanceRows,
        productionEntries,
        overtimeRows,
        dayStatuses,
        closures,
        workDate: selectedDate,
      }),
    [
      attendanceRows,
      closures,
      dayStatuses,
      productionEntries,
      overtimeRows,
      selectedDate,
      workerMethods,
      workers,
    ],
  );
  const openedPayrollDayRef=useRef('');
  useEffect(()=>{const id=urlParams.get('worker'),date=urlParams.get('date');const key=`${id}:${date}`;if(id&&date===selectedDate&&sourceReady&&openedPayrollDayRef.current!==key){const row=workerDays.find(item=>item.worker.id===id);if(row){openedPayrollDayRef.current=key;setSelectedWorker(row);}}},[urlParams,selectedDate,sourceReady,workerDays]);
  const teams = useMemo(
    () =>
      [...new Set(workerDays.map((item) => item.worker.worker_type))].sort(),
    [workerDays],
  );
  const visibleWorkers = useMemo(
    () =>
      workerDays.filter((item) => {
        const normalized = search.trim().toLocaleLowerCase("vi");
        const matchesSearch =
          !normalized ||
          `${item.worker.display_name} ${item.worker.employee_code}`
            .toLocaleLowerCase("vi")
            .includes(normalized);
        return (
          matchesSearch &&
          attendanceDayMatchesFilters(item,methodFilter,workflowFilter) &&
          (team === "ALL" || item.worker.worker_type === team)
        );
      }),
    [methodFilter, search, team, workerDays, workflowFilter],
  );

  const today = dateKey();
  const selectedDateIsFuture = selectedDate > today;
  const selectedMonth = monthInputKey(selectedDate);
  // Monthly views follow the caller's people scope, independent of the
  // currently selected day's attendance method/status.
  const allowedWorkerIds = useMemo(() => new Set(workers.map((worker) => worker.id)), [workers]);
  const filteredOvertimeRows = useMemo(() => overtimeRows.filter((row) =>
    allowedWorkerIds.has(row.worker_id) &&
    (team === "ALL" || row.worker_type === team) &&
    (!search.trim() || `${row.worker_name} ${row.employee_code}`.toLocaleLowerCase("vi").includes(search.trim().toLocaleLowerCase("vi"))) &&
    (workflowFilter === "ALL" ||
      (workflowFilter === "PENDING" && row.status === "SUBMITTED") ||
      (workflowFilter === "REJECTED" && row.status === "REJECTED") ||
      (workflowFilter === "RECORDED" && row.status !== "SUBMITTED" && row.status !== "REJECTED")),
  ), [allowedWorkerIds, overtimeRows, search, team, workflowFilter]);
  const visibleWorkerIds = useMemo(
    () =>
      new Set(
        workerDays.map((row) => row.worker.id),
      ),
    [workerDays],
  );
  const selectedDateHasData = useMemo(
    () =>
      attendanceRows.some(
        (row) =>
          visibleWorkerIds.has(row.worker_id) &&
          row.work_date.slice(0, 10) === selectedDate,
      ) ||
      productionEntries.some(
        (row) =>
          visibleWorkerIds.has(row.worker_id) &&
          row.work_date.slice(0, 10) === selectedDate,
      ) ||
      dayStatuses.some(
        (row) =>
          visibleWorkerIds.has(row.worker_id) &&
          row.work_date.slice(0, 10) === selectedDate,
      ) ||
      closures.some(
        (row) =>
          visibleWorkerIds.has(row.worker_id) &&
          row.work_date.slice(0, 10) === selectedDate,
      ) ||
      overtimeRows.some(
        (row) =>
          visibleWorkerIds.has(row.worker_id) &&
          row.work_date.slice(0, 10) === selectedDate,
      ),
    [
      attendanceRows,
      closures,
      dayStatuses,
      overtimeRows,
      productionEntries,
      selectedDate,
      visibleWorkerIds,
    ],
  );
  const nearestDataDate = useMemo(() => {
    const dates = new Set<string>();
    const addDate = (workerId: string, value: string) => {
      const day = value.slice(0, 10);
      if (visibleWorkerIds.has(workerId) && day <= today) dates.add(day);
    };
    attendanceRows.forEach((row) => addDate(row.worker_id, row.work_date));
    productionEntries.forEach((row) => addDate(row.worker_id, row.work_date));
    dayStatuses.forEach((row) => addDate(row.worker_id, row.work_date));
    closures.forEach((row) => addDate(row.worker_id, row.work_date));
    overtimeRows.forEach((row) => addDate(row.worker_id, row.work_date));
    return [...dates].sort().at(-1) ?? null;
  }, [
    attendanceRows,
    closures,
    dayStatuses,
    overtimeRows,
    productionEntries,
    today,
    visibleWorkerIds,
  ]);
  const monthDays = useMemo(() => daysForMonth(selectedMonth), [selectedMonth]);
  const monthRowsByWorker = useMemo(() => {
    const result = new Map<string, Map<string, WorkerDayAttendance>>();
    monthDays.forEach((day) => {
      const dayRows = buildWorkerDayAttendance({
        workers,
        attendanceMethods: workerMethods,
        attendanceRows,
        productionEntries,
        overtimeRows,
        dayStatuses,
        closures,
        workDate: day.dateKey,
      });
      dayRows.forEach((row) => {
        const workerDaysForMonth =
          result.get(row.worker.id) ?? new Map<string, WorkerDayAttendance>();
        workerDaysForMonth.set(day.dateKey, row);
        result.set(row.worker.id, workerDaysForMonth);
      });
    });
    return result;
  }, [
    attendanceRows,
    closures,
    dayStatuses,
    monthDays,
    productionEntries,
    overtimeRows,
    workerMethods,
    workers,
  ]);
  const queueRows=useMemo(()=>[...monthRowsByWorker.values()].flatMap(days=>[...days.entries()].map(([workDate,row])=>({workDate,row}))).filter(({workDate,row})=>attendanceDayInQueue(row,workDate,today,methodFilter,workflowFilter)&&(!search.trim()||`${row.worker.display_name} ${row.worker.employee_code}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')))&&(team==='ALL'||row.worker.worker_type===team)).sort((a,b)=>workerDayAction(a.row).priority-workerDayAction(b.row).priority||a.workDate.localeCompare(b.workDate)||a.row.worker.display_name.localeCompare(b.row.worker.display_name)),[monthRowsByWorker,today,search,team,methodFilter,workflowFilter]);
  useEffect(()=>{if(!selectedWorker)return;const current=workerDays.find(row=>row.worker.id===selectedWorker.worker.id);if(current&&current!==selectedWorker)setSelectedWorker(current);},[workerDays,selectedWorker]);
  const matrixWorkers = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("vi");
    return workers
      .filter((worker) => monthRowsByWorker.has(worker.id))
      .filter(
        (worker) =>
          !normalized ||
          `${worker.display_name} ${worker.employee_code}`
            .toLocaleLowerCase("vi")
            .includes(normalized),
      )
      .filter((worker) => team === "ALL" || worker.worker_type === team)
      .filter((worker) => {
        const rows = [...(monthRowsByWorker.get(worker.id)?.values() ?? [])];
        const configuredMethod = workerMethods.find(
          (item) => item.worker_id === worker.id,
        )?.attendance_method;
        if (
          methodFilter !== "ALL" &&
          !rows.some(
            (row) =>
              row.attendanceMethod === methodFilter ||
              row.activeEntries.some(
                (entry) => entry.attendance_method === methodFilter,
              ) ||
              (methodFilter === "OUTPUT" &&
                row.activeProductionEntries.length > 0),
          ) &&
          configuredMethod !== methodFilter
        )
          return false;
        if (workflowFilter === "ALL") return true;
        if (workflowFilter === "PENDING")
          return rows.some((row) => row.hasPending);
        if (workflowFilter === "REJECTED")
          return rows.some((row) => row.hasRejected);
        if (workflowFilter === "RECORDED")
          return rows.some((row) => row.isRecorded);
        if (workflowFilter === "MISSING")
          return rows.some((row) => !row.isRecorded && !row.dayStatus);
        return rows.some((row) => row.closureStatus === "LEADER_CONFIRMED");
      })
      .sort((a, b) => a.display_name.localeCompare(b.display_name, "vi"));
  }, [
    methodFilter,
    monthRowsByWorker,
    search,
    team,
    workflowFilter,
    workerMethods,
    workers,
  ]);
  const monthTotals = useMemo(
    () =>
      matrixWorkers.reduce(
        (totals, worker) => {
          [...(monthRowsByWorker.get(worker.id)?.values() ?? [])].forEach(
            (row) => {
              totals.day += row.totalDayUnits;
              totals.hours += row.totalHours;
              totals.output += row.totalOutput;
              totals.pending += row.hasPending ? 1 : 0;
              totals.amount += row.approvedAmount;
            },
          );
          return totals;
        },
        { day: 0, hours: 0, output: 0, pending: 0, amount: 0 },
      ),
    [matrixWorkers, monthRowsByWorker],
  );
  const legacyOutputSummary = useMemo(
    () =>
      visibleWorkers.reduce(
        (summary, row) => ({
          quantity: summary.quantity + row.legacyOutputQuantity,
          entries: summary.entries + row.legacyOutputEntryCount,
          workers: summary.workers + (row.legacyOutputEntryCount > 0 ? 1 : 0),
          amount: summary.amount + row.legacyApprovedAmount,
        }),
        { quantity: 0, entries: 0, workers: 0, amount: 0 },
      ),
    [visibleWorkers],
  );
  const monthLegacyOutputSummary = useMemo(
    () =>
      matrixWorkers.reduce(
        (summary, worker) => {
          [...(monthRowsByWorker.get(worker.id)?.values() ?? [])].forEach(
            (row) => {
              summary.quantity += row.legacyOutputQuantity;
              summary.entries += row.legacyOutputEntryCount;
              summary.amount += row.legacyApprovedAmount;
            },
          );
          return summary;
        },
        { quantity: 0, entries: 0, amount: 0 },
      ),
    [matrixWorkers, monthRowsByWorker],
  );
  // Bulk approval follows the manager's actual people scope (team + search),
  // not view-only method/status filters that could otherwise hide pending facts
  // for the same selected worker.
  const bulkApprovalScopeWorkers = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("vi");
    return workers
      .filter((worker) => monthRowsByWorker.has(worker.id))
      .filter((worker) => team === "ALL" || worker.worker_type === team)
      .filter(
        (worker) =>
          !normalized ||
          `${worker.display_name} ${worker.employee_code}`
            .toLocaleLowerCase("vi")
            .includes(normalized),
      );
  }, [search, team, workers,monthRowsByWorker]);
  const bulkApprovalScopeWorkerIds = useMemo(
    () => bulkApprovalScopeWorkers.map((worker) => worker.id).sort(),
    [bulkApprovalScopeWorkers],
  );
  const bulkScopeSignature=attendanceBulkScopeSignature(selectedMonth,team,search,bulkApprovalScopeWorkerIds);
  const bulkScopeRef=useRef(bulkScopeSignature);
  const bulkSessionIdentity=getLocalUserSession()?.token;
  const bulkSessionRef=useRef(bulkSessionIdentity);
  const bulkGeneration=useRef(0);
  const bulkInFlight=useRef(false);
  const bulkReviewed=useRef<{signature:string;month:string;workerIds:string[];label:string;key:string;preview:AttendanceBulkPreview}|null>(null);
  // Invalidate synchronously: a response can arrive before the scope effect runs.
  if(bulkScopeRef.current!==bulkScopeSignature || bulkSessionRef.current!==bulkSessionIdentity){bulkScopeRef.current=bulkScopeSignature;bulkSessionRef.current=bulkSessionIdentity;bulkGeneration.current++;bulkReviewed.current=null;}
  useEffect(()=>{setBulkPreview(null);setBulkApprovalOpen(false);
    if(bulkInFlight.current){bulkInFlight.current=false;setSaving(false);}
  },[bulkScopeSignature,bulkSessionIdentity]);
  useEffect(()=>()=>{bulkGeneration.current++;bulkInFlight.current=false;bulkReviewed.current=null;},[]);
  const bulkPendingCounts = useMemo(() => {
    const scopedWorkerIds = new Set(bulkApprovalScopeWorkerIds);
    const inSelectedMonth = (workerId: string, workDate: string) =>
      scopedWorkerIds.has(workerId) && workDate.slice(0, 7) === selectedMonth;
    return {
      ATTENDANCE: attendanceRows.filter(
        (row) =>
          inSelectedMonth(row.worker_id, row.work_date) &&
          !row.is_reversed &&
          row.workflow_status === "SUBMITTED",
      ).length,
      PRODUCTION_ENTRY: productionEntries.filter(
        (row) =>
          inSelectedMonth(row.worker_id, row.work_date) &&
          row.workflow_status === "SUBMITTED",
      ).length,
      OVERTIME: overtimeRows.filter(
        (row) =>
          inSelectedMonth(row.worker_id, row.work_date) &&
          row.status === "SUBMITTED",
      ).length,
    };
  }, [
    attendanceRows,
    bulkApprovalScopeWorkerIds,
    overtimeRows,
    productionEntries,
    selectedMonth,
  ]);
  const bulkPendingTotal =
    bulkPendingCounts.ATTENDANCE +
    bulkPendingCounts.PRODUCTION_ENTRY +
    bulkPendingCounts.OVERTIME;
  const bulkApprovalAvailable =
    isLocalBackend() && canApproveAttendance && meta.workflowAvailable && !loading && !loadError && !methodError && !methodsLoading;
  const bulkApprovalScopeLabel = useMemo(
    () =>
      [
        `Tháng ${selectedMonth.replace("-", "/")}`,
        team === "ALL" ? "Tất cả tổ" : (workerTypeLabels[team] ?? team),
        search.trim() ? `Tìm: “${search.trim()}”` : "Không giới hạn tên/mã",
        `${bulkApprovalScopeWorkerIds.length.toLocaleString("vi-VN")} nhân sự`,
      ].join(" · "),
    [bulkApprovalScopeWorkerIds.length, search, selectedMonth, team],
  );
  const historyRows = useMemo(() => {
    type HistoryItem = {
      id: string;
      workerId: string | null;
      date: string;
      worker: string;
      code: string;
      kind: string;
      detail: string;
      status: string;
      reason: string;
      createdAt: string;
      amount: number | null;
    };
    const items: HistoryItem[] = [];
    attendanceRows.forEach((entry) =>
      items.push({
        id: `attendance-${entry.id}`,
        workerId: entry.worker_id,
        date: entry.work_date.slice(0, 10),
        worker: entry.worker_name,
        code: entry.employee_code,
        kind: entry.attendance_method === "OUTPUT" ? "Sản lượng" : "Ngày / giờ",
        detail: entrySummary(entry),
        status: entry.is_reversed
          ? "REVERSED"
          : (entry.workflow_status ?? "APPROVED"),
        reason: entry.workflow_reason ?? entry.notes ?? "",
        createdAt: entry.created_at,
        amount: entry.cost_visible ? entry.calculated_amount : null,
      }),
    );
    productionEntries.forEach((entry) =>
      items.push({
        id: `production-${entry.id}`,
        workerId: entry.worker_id,
        date: entry.work_date.slice(0, 10),
        worker: entry.worker_name,
        code: entry.employee_code,
        kind: "Sản lượng",
        detail: `${entry.product_name} · ${entry.quantity.toLocaleString("vi-VN")} ${productUnitLabel(entry.rate_unit)}`,
        status: entry.workflow_status,
        reason: entry.workflow_reason ?? entry.notes ?? "",
        createdAt: entry.created_at,
        amount: entry.cost_visible ? entry.calculated_amount : null,
      }),
    );
    overtimeRows.forEach((entry) =>
      items.push({
        id: `overtime-${entry.id}`,
        workerId: entry.worker_id,
        date: entry.work_date.slice(0, 10),
        worker: entry.worker_name,
        code: entry.employee_code,
        kind: "Tăng ca",
        detail: `${overtimeLabels[entry.overtime_type]} · ${entry.overtime_minutes.toLocaleString("vi-VN")} phút`,
        status: entry.status,
        reason: entry.reason,
        createdAt: entry.created_at,
        amount: null,
      }),
    );
    dayStatuses.forEach((entry) =>
      items.push({
        id: `day-status-${entry.worker_id}-${entry.work_date}`,
        workerId: entry.worker_id,
        date: entry.work_date.slice(0, 10),
        worker: entry.worker_name,
        code: entry.employee_code,
        kind: "Trạng thái ngày",
        detail: `${dayStatusLabels[entry.status]}${entry.meal_eligible ? " · Có tiền ăn" : ""}`,
        status: entry.status,
        reason: entry.reason ?? "",
        createdAt: entry.created_at,
        amount: null,
      }),
    );
    historyEvents.forEach((event) => {
      const from = event.from_status
        ? (statusLabels[event.from_status as AttendanceWorkflowStatus] ??
          dayStatusLabels[event.from_status as FactoryAttendanceDayStatus] ??
          event.from_status)
        : "—";
      const to = event.to_status
        ? (statusLabels[event.to_status as AttendanceWorkflowStatus] ??
          dayStatusLabels[event.to_status as FactoryAttendanceDayStatus] ??
          event.to_status)
        : "—";
      const actor = event.actor_id ? ` · ${event.actor_id}` : "";
      items.push({
        id: `audit-${event.id}`,
        workerId: event.worker_id,
        date: event.work_date?.slice(0, 10) ?? "—",
        worker: event.worker_name ?? "Không xác định",
        code: event.employee_code ?? "—",
        kind: "Quy trình duyệt",
        detail: `${historyEntityLabels[event.entity_type] ?? event.entity_type} · ${historyActionLabels[event.action] ?? event.action}: ${from} → ${to}${actor}`,
        status: event.to_status ?? event.action,
        reason: event.reason ?? "",
        createdAt: event.event_at,
        amount: null,
      });
    });
    return items
      .filter((item) => Boolean(item.workerId && allowedWorkerIds.has(item.workerId)))
      .filter(
        (item) =>
          !search.trim() ||
          `${item.worker} ${item.code}`
            .toLocaleLowerCase("vi")
            .includes(search.trim().toLocaleLowerCase("vi")),
      )
      .filter(
        (item) =>
          team === "ALL" ||
          workers.find((worker) => worker.id === item.workerId)
            ?.worker_type === team,
      )
      .filter(
        (item) =>
          workflowFilter === "ALL" ||
          (workflowFilter === "PENDING" && item.status === "SUBMITTED") ||
          (workflowFilter === "REJECTED" && item.status === "REJECTED") ||
          (workflowFilter === "RECORDED" &&
            item.status !== "SUBMITTED" &&
            item.status !== "REJECTED") ||
          (workflowFilter === "MISSING" && false) ||
          (workflowFilter === "CLOSED" && item.status === "LEADER_CONFIRMED"),
      )
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt),
      );
  }, [
    allowedWorkerIds,
    attendanceRows,
    dayStatuses,
    historyEvents,
    overtimeRows,
    productionEntries,
    search,
    team,
    workers,
    workflowFilter,
  ]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase("vi");
    return products
      .filter((product) => product.rate_available)
      .filter(
        (product) =>
          !query ||
          `${product.piece_rate_code ?? ""} ${product.sku ?? ""} ${product.name}`
            .toLocaleLowerCase("vi")
            .includes(query),
      )
      .slice(0, 100);
  }, [productSearch, products]);
  const unavailableProductCount = useMemo(
    () => products.filter((product) => !product.rate_available).length,
    [products],
  );
  const selectedProduct =
    products.find((product) => product.id === entryForm.productId) ?? null;
  const kpis = useMemo(
    () => ({
      workers: visibleWorkers.length,
      recorded: visibleWorkers.filter((item) => item.isRecorded).length,
      pending: visibleWorkers.filter((item) => item.hasPending).length,
      closed: visibleWorkers.filter(
        (item) => item.closureStatus === "LEADER_CONFIRMED",
      ).length,
      hours: visibleWorkers.reduce((total, item) => total + item.totalHours, 0),
      output: visibleWorkers.reduce(
        (total, item) => total + item.totalOutput,
        0,
      ),
    }),
    [visibleWorkers],
  );
  const kpiCards = [
    {
      label: "Nhân sự",
      value: kpis.workers.toLocaleString("vi-VN"),
      Icon: Users,
      color: "text-primary",
    },
    {
      label: "Người/ngày ghi nhận",
      value: kpis.recorded.toLocaleString("vi-VN"),
      Icon: CalendarCheck2,
      color: "text-emerald-600",
    },
    {
      label: "Người/ngày chờ duyệt",
      value: kpis.pending.toLocaleString("vi-VN"),
      Icon: Clock3,
      color: "text-amber-600",
    },
    {
      label: "Người/ngày đã chốt",
      value: kpis.closed.toLocaleString("vi-VN"),
      Icon: LockKeyhole,
      color: "text-slate-600",
    },
    {
      label: "Giờ / sản lượng",
      value: `${kpis.hours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h · ${kpis.output.toLocaleString("vi-VN")} SP`,
      Icon: Sparkles,
      color: "text-violet-600",
    },
  ];

  const [quickWorkerName, setQuickWorkerName] = useState("");
  const [quickWorkerSaving, setQuickWorkerSaving] = useState(false);
  const hasConfiguredAttendanceMethod = (
    workerId: string,
    method: AttendanceMethod,
  ) =>
    workerMethods.some(
      (item) => item.worker_id === workerId && item.attendance_method === method,
    );

  const handleQuickCreateWorker = async () => {
    const trimmed = quickWorkerName.trim();
    if (!trimmed || quickWorkerSaving) return;
    setQuickWorkerSaving(true);
    try {
      const created = await quickCreateProductionWorker({
        display_name: trimmed,
        worker_type: team !== "ALL" ? team : "SEWER",
      });
      setQuickWorkerName("");
      toast.success(`Đã thêm "${created.display_name}" (${created.employee_code}) — có thể chấm công; thiết lập lương trước khi duyệt.`);
      await Promise.all([loadWorkspace(), Promise.resolve(onWorkersChanged?.())]);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setQuickWorkerSaving(false);
    }
  };

  const handleInlineDayClick = async (
    row: WorkerDayAttendance,
    targetUnits: 1 | 0.5 | 0,
  ) => {
    if (!canRecord || saving || selectedDateIsFuture) return;
    if (row.closureStatus === "LEADER_CONFIRMED") {
      toast.error("Ngày công đã khóa, mở khóa trước khi sửa.");
      return;
    }
    setSaving(true);
    try {
      const activeDayEntries = row.entries.filter(
        (entry) =>
          entry.source_type === "FACTORY" &&
          !entry.is_reversed &&
          entry.attendance_method === "DAY" &&
          entry.workflow_status !== "REJECTED",
      );
      if (targetUnits === 0) {
        for (const entry of activeDayEntries) {
          if (entry.workflow_status === "APPROVED" && canReverse) {
            await reverseFactoryAttendance(
              entry.id,
              "Đổi sang trạng thái Nghỉ trực tiếp",
              makeIdempotencyKey(),
            ).catch(() => undefined);
          } else if (entry.workflow_status === "SUBMITTED" && canApproveAttendance) {
            await setFactoryAttendanceStatus({
              attendance_record_id: entry.id,
              target_status: "REJECTED",
              reason: "Đổi sang trạng thái Nghỉ trực tiếp",
              idempotency_key: makeIdempotencyKey(),
            }).catch(() => undefined);
          }
        }
        await setFactoryAttendanceDayStatus({
          worker_id: row.worker.id,
          work_date: selectedDate,
          status: "ABSENT",
          meal_eligible: false,
          reason: "Chấm nghỉ nhanh",
          idempotency_key: makeIdempotencyKey(),
        });
        toast.success(`Đã đánh dấu Nghỉ cho ${row.worker.display_name}`);
        await loadWorkspace();
        return;
      }

      if (
        row.dayStatus &&
        ["ABSENT", "PAID_LEAVE", "UNPAID_LEAVE", "OFF"].includes(
          row.dayStatus.status,
        )
      ) {
        await setFactoryAttendanceDayStatus({
          worker_id: row.worker.id,
          work_date: selectedDate,
          status: "PRESENT",
          meal_eligible: targetUnits >= 1,
          reason: "Chấm công trực tiếp",
          idempotency_key: makeIdempotencyKey(),
        }).catch(() => undefined);
      }

      if (
        activeDayEntries.length === 1 &&
        Number(activeDayEntries[0].day_units) === targetUnits
      ) {
        if (
          activeDayEntries[0].workflow_status === "SUBMITTED" &&
          canApproveAttendance &&
          hasConfiguredAttendanceMethod(row.worker.id, "DAY")
        ) {
          await setFactoryAttendanceStatus({
            attendance_record_id: activeDayEntries[0].id,
            target_status: "APPROVED",
            reason: "Duyệt nhanh 1 chạm",
            idempotency_key: makeIdempotencyKey(),
          });
          toast.success(`Đã duyệt ${targetUnits} công cho ${row.worker.display_name}`);
          await loadWorkspace();
        }
        return;
      }

      for (const entry of activeDayEntries) {
        if (entry.workflow_status === "APPROVED" && canReverse) {
          await reverseFactoryAttendance(
            entry.id,
            `Đổi sang ${targetUnits} công`,
            makeIdempotencyKey(),
          ).catch(() => undefined);
        } else if (entry.workflow_status === "SUBMITTED" && canApproveAttendance) {
          await setFactoryAttendanceStatus({
            attendance_record_id: entry.id,
            target_status: "REJECTED",
            reason: `Đổi sang ${targetUnits} công`,
            idempotency_key: makeIdempotencyKey(),
          }).catch(() => undefined);
        }
      }

      const created = await recordFactoryAttendance({
        worker_id: row.worker.id,
        attendance_method: "DAY",
        work_date: selectedDate,
        day_units: targetUnits,
        work_hours: null,
        output_quantity: null,
        activity_name: null,
        notes: null,
        idempotency_key: makeIdempotencyKey(),
      });

      if (
        canApproveAttendance &&
        created?.id &&
        hasConfiguredAttendanceMethod(row.worker.id, "DAY")
      ) {
        await setFactoryAttendanceStatus({
          attendance_record_id: created.id,
          target_status: "APPROVED",
          reason: "Chấm công trực tiếp",
          idempotency_key: makeIdempotencyKey(),
        }).catch(() => undefined);
      }

      toast.success(`Đã chấm ${targetUnits} công cho ${row.worker.display_name}`);
      await loadWorkspace();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAllFullDay = async () => {
    if (!canRecord || saving || selectedDateIsFuture) return;
    const targets = visibleWorkers.filter((row) => {
      const blocked = Boolean(
        row.dayStatus &&
          ["ABSENT", "PAID_LEAVE", "UNPAID_LEAVE", "OFF"].includes(
            row.dayStatus.status,
          ),
      );
      return (
        !blocked &&
        row.closureStatus !== "LEADER_CONFIRMED" &&
        row.totalDayUnits === 0 &&
        row.totalHours === 0 &&
        row.totalOutput === 0
      );
    });
    if (targets.length === 0) {
      toast.info("Tất cả nhân sự đang hiển thị đã được chấm công hôm nay.");
      return;
    }
    setSaving(true);
    try {
      let count = 0;
      for (const row of targets) {
        const created = await recordFactoryAttendance({
          worker_id: row.worker.id,
          attendance_method: "DAY",
          work_date: selectedDate,
          day_units: 1,
          work_hours: null,
          output_quantity: null,
          activity_name: null,
          notes: null,
          idempotency_key: makeIdempotencyKey(),
        });
        if (
          canApproveAttendance &&
          created?.id &&
          hasConfiguredAttendanceMethod(row.worker.id, "DAY")
        ) {
          await setFactoryAttendanceStatus({
            attendance_record_id: created.id,
            target_status: "APPROVED",
            reason: "Chấm đủ công cả danh sách",
            idempotency_key: makeIdempotencyKey(),
          }).catch(() => undefined);
        }
        count += 1;
      }
      toast.success(`Đã chấm 1 công cho ${count} nhân sự.`);
      await loadWorkspace();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openEntry = (
    row: WorkerDayAttendance,
    method: AttendanceMethod = row.attendanceMethod,
  ) => {
    setEntryTarget(row);
    setEntryForm({
      workerId: row.worker.id,
      method,
      dayUnits: "1",
      checkInTime: "08:00",
      checkOutTime: "17:00",
      breakMinutes: "60",
      productId: "",
      outputQuantity: "1",
      activityName: "",
      notes: "",
    });
    setProductSearch("");
    if (method === "OUTPUT") void loadProducts();
  };

  const openDetails = (row: WorkerDayAttendance) => {
    setSelectedWorker(row);
    setDayStatusForm({
      status: row.dayStatus?.status ?? "PRESENT",
      mealEligible: row.dayStatus?.meal_eligible ?? false,
      reason: row.dayStatus?.reason ?? "",
    });
  };

  const [outputMode,setOutputMode]=useState<'ASSIGNMENT'|'STANDALONE'>('ASSIGNMENT');
  const [outputAssignment,setOutputAssignment]=useState(''),[standaloneReason,setStandaloneReason]=useState('');
  const [receivedWork,setReceivedWork]=useState<Array<{id:string;piece_rate_code:string;product_name:string;production_order_number:string;remaining_quantity:string}>>([]),[receivedWorkError,setReceivedWorkError]=useState('');
  const receivedWorkWorkerId=entryTarget?.worker.id;
  useEffect(()=>{let active=true;setReceivedWork([]);setOutputAssignment('');setStandaloneReason('');setOutputMode('ASSIGNMENT');setReceivedWorkError('');if(!receivedWorkWorkerId||entryForm.method!=='OUTPUT')return;void localApi.receivedProductionWork(receivedWorkWorkerId,selectedDate).then(rows=>{if(active)setReceivedWork(rows.filter(row=>Number(row.remaining_quantity)>0));}).catch(error=>{if(active)setReceivedWorkError(errorMessage(error));});return()=>{active=false;};},[receivedWorkWorkerId,entryForm.method,selectedDate]);
  const handleQuickEntry = async () => {
    if (!entryTarget || !canRecord) return;
    if (selectedDateIsFuture) {
      toast.error("Ngày chấm công không được ở tương lai.");
      return;
    }
    if (entryTarget.closureStatus === "LEADER_CONFIRMED") {
      toast.error("Ngày công đã chốt ở cấp quản lý, không thể ghi thêm.");
      return;
    }
    if (
      entryTarget.dayStatus &&
      ["ABSENT", "PAID_LEAVE", "UNPAID_LEAVE", "OFF"].includes(
        entryTarget.dayStatus.status,
      )
    ) {
      toast.error(
        `Không thể chấm công: ngày đã đánh dấu ${dayStatusLabels[entryTarget.dayStatus.status]}.`,
      );
      return;
    }
    if (entryForm.method === "HOUR" && !meta.timeClockAvailable) {
      toast.error(
        "Chấm theo giờ chưa được bật vì phần cập nhật cơ sở dữ liệu cho chấm công giờ chưa sẵn sàng.",
      );
      return;
    }
    const dayUnits = Number(entryForm.dayUnits);
    if (
      entryForm.method === "DAY" &&
      (!Number.isFinite(dayUnits) || dayUnits <= 0)
    ) {
      toast.error("Nhập số ngày công lớn hơn 0.");
      return;
    }
    const checkInMinutes = clockMinutes(entryForm.checkInTime);
    const checkOutMinutes = clockMinutes(entryForm.checkOutTime);
    const breakMinutes = Number(entryForm.breakMinutes);
    const outputQuantity = Number(entryForm.outputQuantity);
    if (entryForm.method === "OUTPUT"&&outputMode==='ASSIGNMENT') {
      if(!outputAssignment||!Number.isFinite(outputQuantity)||outputQuantity<=0){toast.error('Chọn việc đã nhận và số lượng đạt.');return;}
    }
    if (entryForm.method === "OUTPUT"&&outputMode==='STANDALONE') {
      if(standaloneReason.trim().length<3){toast.error('Nhập lý do chấm ngoài lệnh ít nhất 3 ký tự.');return;}
      if (
        !entryForm.productId ||
        !selectedProduct ||
        !selectedProduct.rate_available
      ) {
        toast.error("Chọn mã công may có đơn giá đang hiệu lực.");
        return;
      }
      if (!Number.isFinite(outputQuantity) || outputQuantity <= 0) {
        toast.error("Nhập số lượng sản phẩm lớn hơn 0.");
        return;
      }
    }
    if (entryForm.method === "HOUR") {
      if (checkInMinutes === null || checkOutMinutes === null) {
        toast.error("Giờ vào và giờ ra phải đúng định dạng HH:MM.");
        return;
      }
      if (checkOutMinutes <= checkInMinutes) {
        toast.error("Giờ ra phải sau giờ vào trong cùng ngày.");
        return;
      }
      if (
        !Number.isFinite(breakMinutes) ||
        breakMinutes < 0 ||
        breakMinutes >= checkOutMinutes - checkInMinutes
      ) {
        toast.error(
          "Thời gian nghỉ phải từ 0 phút và nhỏ hơn tổng thời gian có mặt.",
        );
        return;
      }
    }
    setSaving(true);
    try {
      const commonInput = {
        worker_id: entryForm.workerId,
        work_date: selectedDate,
        activity_name: entryForm.activityName.trim() || null,
        notes: entryForm.notes.trim() || null,
        idempotency_key: makeIdempotencyKey(),
      };
      if(entryForm.method==='OUTPUT'&&outputMode==='ASSIGNMENT'){
        await localApi.reportProductionDispatchAssignment(outputAssignment,{work_date:selectedDate,quantity_good:entryForm.outputQuantity,quantity_rework:0,quantity_remake:0,quantity_defect:0,notes:entryForm.notes.trim()||null,idempotency_key:commonInput.idempotency_key});
      } else if (entryForm.method === "OUTPUT") {
        const created = await recordProductionEntry({
          standalone_reason:standaloneReason.trim(),
          work_kind:['srem','srem1h'].includes(String(selectedProduct.piece_rate_code||'').toLowerCase())?'CURTAIN_REPAIR':undefined,
          worker_id: entryForm.workerId,
          rate_id: selectedProduct.id,
          product_id: selectedProduct.product_id ?? null,
          piece_rate_code: selectedProduct.piece_rate_code ?? null,
          work_date: selectedDate,
          quantity: outputQuantity,
          idempotency_key: commonInput.idempotency_key,
          notes:
            [entryForm.activityName.trim(), entryForm.notes.trim()]
              .filter(Boolean)
              .join(" · ") || null,
        });
        if (canApproveAttendance && created?.id) {
          await setProductionEntryStatus({
            production_entry_id: String(created.id),
            target_status: "APPROVED",
            reason: "Ghi sản lượng trực tiếp",
            idempotency_key: makeIdempotencyKey(),
          }).catch(() => undefined);
        }
      } else if (entryForm.method === "HOUR") {
        const created = await recordFactoryHourAttendance({
          ...commonInput,
          check_in_time: entryForm.checkInTime,
          check_out_time: entryForm.checkOutTime,
          break_minutes: breakMinutes,
        });
        if (
          canApproveAttendance &&
          created?.id &&
          hasConfiguredAttendanceMethod(entryForm.workerId, "HOUR")
        ) {
          await setFactoryAttendanceStatus({
            attendance_record_id: created.id,
            target_status: "APPROVED",
            reason: "Chấm giờ trực tiếp",
            idempotency_key: makeIdempotencyKey(),
          }).catch(() => undefined);
        }
      } else {
        const created = await recordFactoryAttendance({
          ...commonInput,
          attendance_method: "DAY",
          day_units: dayUnits,
          work_hours: null,
          output_quantity: null,
        });
        if (
          canApproveAttendance &&
          created?.id &&
          hasConfiguredAttendanceMethod(entryForm.workerId, "DAY")
        ) {
          await setFactoryAttendanceStatus({
            attendance_record_id: created.id,
            target_status: "APPROVED",
            reason: "Chấm công trực tiếp",
            idempotency_key: makeIdempotencyKey(),
          }).catch(() => undefined);
        }
      }
      toast.success(
        entryForm.method === "OUTPUT"
          ? "Đã ghi sản lượng thành công"
          : "Đã chấm công thành công",
      );
      setEntryTarget(null);
      await loadWorkspace();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const requestAttendanceReason = async (
    action: AttendanceReasonAction, workerId: string, workDate: string,
    title: string, required: boolean, source?: unknown, reviewed?: AttendanceDaySummary,
  ) => {
    if (!reasonLifecycleRef.current.mounted || saving || reasonActiveRef.current || reasonInFlightRef.current || !sourceReady) return;
    const generation=reasonLifecycleRef.current.generation;
    const requestId = makeIdempotencyKey();
    reasonTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    reasonActiveRef.current = requestId;
    reasonRetryRef.current = null;
    setReasonText(""); setReasonError(null); setReasonFieldInvalid(false); setReasonSnapshot(null); setReasonPreparing(true);
    setPendingReason({action,requestId,workerId,workDate,title,required,contextDate:selectedDate,contextWorkerId:selectedWorker?.worker.id ?? null,
      sourceSignature:source ? JSON.stringify(source) : undefined,reviewedSignature:reviewed ? reasonDaySignature(reviewed) : undefined});
    try {
      const summary = await localApi.attendanceDaySummary(workerId,workDate);
      if (!reasonGenerationCurrent(generation) || reasonActiveRef.current !== requestId) return;
      if (summary.worker_id !== workerId || summary.work_date !== workDate || (reviewed && reasonDaySignature(reviewed)!==reasonDaySignature(summary))) {
        setReasonError('Nguồn ngày đã thay đổi. Đóng hộp thoại, tải lại và xem lại ngày trước khi thao tác.');
        return;
      }
      setReasonSnapshot(summary);
    } catch (error) {
      if (reasonGenerationCurrent(generation) && reasonActiveRef.current === requestId) setReasonError(errorMessage(error));
    } finally {
      if (reasonGenerationCurrent(generation) && reasonActiveRef.current === requestId) setReasonPreparing(false);
    }
  };

  const handleReverse = async (entry: FactoryAttendanceRow, submission?: ReasonSubmission) => {
    if (!reasonSubmissionCurrent(submission)) return;
    if (
      !canReverse ||
      entry.workflow_status !== "APPROVED" ||
      entry.is_reversed
    )
      return;
    if (!submission) return requestAttendanceReason({kind:'ATTENDANCE_REVERSE',id:entry.id},entry.worker_id,entry.work_date.slice(0,10),'Đảo bản ghi chấm công',true,entry);
    const reason = submission.reason;
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await reverseFactoryAttendance(
        entry.id,
        reason.trim(),
        submission?.key ?? makeIdempotencyKey(),
      );
      if (!reasonSubmissionCurrent(submission)) return;
      toast.success("Đã đảo bản ghi chấm công");
      await loadWorkspace();
      if (!submission) setSelectedWorker(null);
      return true;
    } catch (error) {
      if (reasonSubmissionCurrent(submission)) toast.error(errorMessage(error));
    } finally {
      if (reasonSubmissionCurrent(submission)) setSaving(false);
    }
  };

  const handleWorkflow = async (
    entry: FactoryAttendanceRow,
    target: Exclude<AttendanceWorkflowStatus, "REVERSED">,
    submission?: ReasonSubmission,
  ) => {
    if (!reasonSubmissionCurrent(submission)) return;
    if (!meta.workflowAvailable || !canApproveAttendance) return;
    if (!submission && (target === 'REJECTED' || target === 'LOCKED')) return requestAttendanceReason({kind:'ATTENDANCE_WORKFLOW',id:entry.id,target},entry.worker_id,entry.work_date.slice(0,10),target==='REJECTED'?'Từ chối bản ghi chấm công':'Khóa bản ghi chấm công',target==='REJECTED',entry);
    const reason = submission?.reason ?? '';
    if (target === "REJECTED" && !reason.trim()) return;
    setSaving(true);
    try {
      await setFactoryAttendanceStatus({
        attendance_record_id: entry.id,
        target_status: target,
        reason: reason?.trim() || null,
        idempotency_key: submission?.key ?? makeIdempotencyKey(),
      });
      if (!reasonSubmissionCurrent(submission)) return;
      toast.success(`Đã chuyển trạng thái: ${statusLabels[target]}`);
      await loadWorkspace();
      if (!submission) setSelectedWorker(null);
      return true;
    } catch (error) {
      if (reasonSubmissionCurrent(submission)) toast.error(errorMessage(error));
    } finally {
      if (reasonSubmissionCurrent(submission)) setSaving(false);
    }
  };

  const handleProductionWorkflow = async (
    entry: ProductionEntryRow,
    target: "APPROVED" | "REJECTED",
    submission?: ReasonSubmission,
  ) => {
    if (!reasonSubmissionCurrent(submission)) return;
    if (!sourceReady || !canApproveAttendance) return;
    if (!submission && target === 'REJECTED') return requestAttendanceReason({kind:'PRODUCTION_WORKFLOW',id:entry.id,target},entry.worker_id,entry.work_date.slice(0,10),'Từ chối sản lượng',true,entry);
    const reason = submission?.reason ?? '';
    if (target === "REJECTED" && !reason.trim()) return;
    setSaving(true);
    try {
      await setProductionEntryStatus({
        production_entry_id: entry.id,
        target_status: target,
        reason: reason?.trim() || null,
        idempotency_key: submission?.key ?? makeIdempotencyKey(),
      });
      if (!reasonSubmissionCurrent(submission)) return;
      toast.success(`Đã chuyển trạng thái sản lượng: ${statusLabels[target]}`);
      await loadWorkspace();
      if (!submission) setSelectedWorker(null);
      return true;
    } catch (error) {
      if (reasonSubmissionCurrent(submission)) toast.error(errorMessage(error));
    } finally {
      if (reasonSubmissionCurrent(submission)) setSaving(false);
    }
  };

  const handleProductionReverse = async (entry: ProductionEntryRow, submission?: ReasonSubmission) => {
    if (!reasonSubmissionCurrent(submission)) return;
    if (!canReverse || entry.workflow_status !== "APPROVED") return;
    if (!submission) return requestAttendanceReason({kind:'PRODUCTION_REVERSE',id:entry.id},entry.worker_id,entry.work_date.slice(0,10),'Đảo bản ghi sản lượng',true,entry);
    const reason = submission.reason;
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await reverseProductionEntry(
        entry.id,
        reason.trim(),
        submission?.key ?? makeIdempotencyKey(),
      );
      if (!reasonSubmissionCurrent(submission)) return;
      toast.success("Đã đảo bản ghi sản lượng");
      await loadWorkspace();
      if (!submission) setSelectedWorker(null);
      return true;
    } catch (error) {
      if (reasonSubmissionCurrent(submission)) toast.error(errorMessage(error));
    } finally {
      if (reasonSubmissionCurrent(submission)) setSaving(false);
    }
  };

  const handleOvertime = async () => {
    if (!canRecord) return;
    const minutes = Number(overtimeForm.minutes);
    if (!overtimeForm.workerId) {
      toast.error("Chọn nhân sự cần ghi tăng ca.");
      return;
    }
    if (!overtimeForm.workDate || overtimeForm.workDate > dateKey()) {
      toast.error("Ngày tăng ca không được ở tương lai.");
      return;
    }
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) {
      toast.error("Số phút tăng ca phải là số nguyên từ 1 đến 1.440.");
      return;
    }
    if (overtimeForm.reason.trim().length < 2) {
      toast.error("Nhập lý do tăng ca.");
      return;
    }
    setSaving(true);
    try {
      await recordFactoryOvertime({
        worker_id: overtimeForm.workerId,
        work_date: overtimeForm.workDate,
        overtime_type: overtimeForm.type,
        overtime_minutes: minutes,
        reason: overtimeForm.reason.trim(),
        idempotency_key: makeIdempotencyKey(),
      });
      toast.success("Đã gửi tăng ca chờ duyệt");
      setOvertimeOpen(false);
      setOvertimeForm((current) => ({ ...current, minutes: "60", reason: "" }));
      await loadWorkspace();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleOvertimeWorkflow = async (
    entry: FactoryOvertimeRow,
    target: "APPROVED" | "REJECTED" | "LOCKED",
    fromDayDetail = false,
    submission?: ReasonSubmission,
  ) => {
    if (!reasonSubmissionCurrent(submission)) return;
    if (saving) return;
    if (fromDayDetail && (!selectedWorker || !detailSummary || detailLoading || detailError
      || detailSummary.worker_id !== selectedWorker.worker.id || detailSummary.work_date !== selectedDate
      || entry.worker_id !== selectedWorker.worker.id || entry.work_date.slice(0,10) !== selectedDate
      || detailSummary.payroll_locked || detailSummary.closure?.status === "LEADER_CONFIRMED"
      || selectedWorker.closureStatus === "LEADER_CONFIRMED" || entry.status !== "SUBMITTED"
      || !detailSummary.sources.some(source => source.source_type === "OVERTIME" && source.id === entry.id && source.status === "SUBMITTED"))) return;
    if (!meta.workflowAvailable || !sourceReady || !canApproveAttendance) {
      toast.error("Luồng duyệt chưa sẵn sàng.");
      return;
    }
    if (!submission && (target === 'REJECTED' || target === 'LOCKED')) return requestAttendanceReason({kind:'OVERTIME_WORKFLOW',id:entry.id,target,fromDayDetail},entry.worker_id,entry.work_date.slice(0,10),target==='REJECTED'?'Từ chối tăng ca':'Khóa tăng ca',target==='REJECTED',entry,fromDayDetail ? detailSummary ?? undefined : undefined);
    const reason = submission?.reason ?? '';
    if (target === "REJECTED" && !reason.trim()) return;
    setSaving(true);
    try {
      await setFactoryOvertimeStatus({
        overtime_record_id: entry.id,
        target_status: target,
        reason: reason?.trim() || null,
        idempotency_key: submission?.key ?? makeIdempotencyKey(),
      });
      if (!reasonSubmissionCurrent(submission)) return;
      toast.success(`Đã chuyển tăng ca sang ${statusLabels[target]}`);
      await loadWorkspace();
      return true;
    } catch (error) {
      if (reasonSubmissionCurrent(submission)) toast.error(errorMessage(error));
    } finally {
      if (reasonSubmissionCurrent(submission)) setSaving(false);
    }
  };

  const openBulkApprovalDialog = async () => {
    if (!bulkApprovalAvailable || bulkPendingTotal===0 || bulkInFlight.current || saving || !reasonLifecycleRef.current.mounted) return;
    const scope={signature:bulkScopeSignature,month:selectedMonth,workerIds:[...bulkApprovalScopeWorkerIds],label:bulkApprovalScopeLabel};
    const generation=++bulkGeneration.current;
    const session=getLocalUserSession()?.token;
    const current=()=>reasonLifecycleRef.current.mounted && bulkGeneration.current===generation && bulkScopeRef.current===scope.signature && session===getLocalUserSession()?.token;
    bulkInFlight.current=true;setSaving(true);setBulkPreview(null);bulkReviewed.current=null;
    try {
      const preview=await localApi.previewAttendanceBulk({month:scope.month,worker_ids:scope.workerIds,source_types:['ATTENDANCE','PRODUCTION_ENTRY','OVERTIME'],target_status:'APPROVED'});
      if(!current())return;
      const key=makeIdempotencyKey();
      bulkReviewed.current={...scope,key,preview};
      setBulkPreview(preview);setBulkApprovalOpen(true);
    } catch(error){if(current())toast.error(errorMessage(error));}
    finally{if(current()){bulkInFlight.current=false;setSaving(false);}}
  };

  const handleBulkApproval = async () => {
    const reviewed=bulkReviewed.current;
    if(!bulkApprovalAvailable || !reviewed || reviewed.signature!==bulkScopeRef.current || !bulkPreview || bulkInFlight.current || saving) return;
    const generation=++bulkGeneration.current;
    const session=getLocalUserSession()?.token;
    const current=()=>reasonLifecycleRef.current.mounted && bulkGeneration.current===generation && reviewed.signature===bulkScopeRef.current && session===getLocalUserSession()?.token;
    bulkInFlight.current=true;setSaving(true);
    try {
      const result=await bulkFactoryAttendanceWorkflow({target_status:'APPROVED',month:reviewed.month,worker_ids:reviewed.workerIds,source_types:['ATTENDANCE','PRODUCTION_ENTRY','OVERTIME'],idempotency_key:reviewed.key,preview_fingerprint:reviewed.preview.fingerprint});
      if(!current())return;
      const counts=result.processed.by_source;
      const action=result.reused?'Đã xác nhận lại lượt duyệt hàng loạt':'Đã duyệt';
      toast.success(`${action} ${result.processed.count.toLocaleString('vi-VN')} bản ghi: công ${counts.ATTENDANCE.toLocaleString('vi-VN')} · sản lượng ${counts.PRODUCTION_ENTRY.toLocaleString('vi-VN')} · tăng ca ${counts.OVERTIME.toLocaleString('vi-VN')}${result.skipped.count>0?` · bỏ qua ${result.skipped.count.toLocaleString('vi-VN')} bản ghi đã thay đổi`:''}.`);
      setBulkApprovalOpen(false);bulkReviewed.current=null;
      await loadWorkspace();
    }catch(error){if(current())toast.error(errorMessage(error));}
    finally{if(current()){bulkInFlight.current=false;setSaving(false);}}
  };

  const handleExport = async () => {
    if (!sourceReady) { toast.error("Dữ liệu chưa đầy đủ. Hãy tải lại trước khi xuất bảng chấm công."); return; }
    if (
      !attendanceRows.length &&
      !productionEntries.length &&
      !overtimeRows.length &&
      !dayStatuses.length &&
      !closures.length
    ) {
      toast.info("Chưa có dữ liệu để xuất.");
      return;
    }
    setSaving(true);
    try {
      await exportFactoryAttendanceWorkbook({
        month: selectedMonth,
        workers: workers.map((worker) => ({
          worker_id: worker.id,
          employee_code: worker.employee_code,
          worker_name: worker.display_name,
          worker_type: worker.worker_type,
        })),
        rows: attendanceRows,
        dayStatuses,
        overtimeRows,
        closures,
        productionEntries,
        filters: {
          workerLabel:
            team === "ALL" ? "Tất cả tổ" : (workerTypeLabels[team] ?? team),
          methodLabel:
            methodFilter === "ALL"
              ? "Tất cả hình thức"
              : methodLabels[methodFilter],
          workflowLabel:
            workflowFilter === "ALL" ? "Tất cả trạng thái" : workflowFilter,
        },
      });
      toast.success(`Đã xuất Excel tháng ${selectedMonth.replace("-", "/")}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleApproveClose=async(submission?: ReasonSubmission)=>{
    if (!reasonSubmissionCurrent(submission)) return;
    if(!sourceReady||!selectedWorker||!detailSummary||detailLoading||detailError||detailSummary.work_date!==selectedDate||detailSummary.worker_id!==selectedWorker.worker.id||!canApproveAttendance||!canManageDayClosure||detailSummary.payroll_locked||detailSummary.closure?.status==='LEADER_CONFIRMED')return;
    const proxy=!detailSummary.confirmation_current||detailSummary.closure?.status!=='EMPLOYEE_CONFIRMED';
    if(proxy&&!canProxyConfirm)return;
    if(proxy&&!submission)return requestAttendanceReason({kind:'APPROVE_CLOSE'},selectedWorker.worker.id,selectedDate,'Xác nhận hộ, duyệt và chốt ngày',true,undefined,detailSummary);
    const reason=submission?.reason??'';if(proxy&&!reason.trim())return;
    setSaving(true);try{await localApi.approveCloseAttendanceDay({worker_id:selectedWorker.worker.id,work_date:selectedDate,expected_revision:detailSummary.current_revision,source_fingerprint:detailSummary.source_fingerprint,proxy_confirm:proxy,reason:reason?.trim()||null,idempotency_key:submission?.key??makeIdempotencyKey()});if(!reasonSubmissionCurrent(submission))return;toast.success('Đã duyệt nguồn và chốt ngày trong cùng giao dịch');await loadWorkspace();return true;}catch(error){if(reasonSubmissionCurrent(submission))toast.error(errorMessage(error));}finally{if(reasonSubmissionCurrent(submission))setSaving(false);}
  };
  const handleClosure = async (row: WorkerDayAttendance, submission?: ReasonSubmission) => {
    if (!reasonSubmissionCurrent(submission)) return;
    if(!detailSummary || detailSummary.worker_id!==row.worker.id || detailSummary.work_date!==selectedDate || detailLoading || detailError)return;
    const next =
      row.closureStatus === "OPEN" || row.closureStatus === "REOPENED" || row.confirmationStale
        ? "EMPLOYEE_CONFIRMED"
        : row.closureStatus === "EMPLOYEE_CONFIRMED"
          ? "LEADER_CONFIRMED"
          : "REOPENED";
    if (next === "EMPLOYEE_CONFIRMED" && !canConfirmDay) return;
    if (
      (next === "LEADER_CONFIRMED" || next === "REOPENED") &&
      !canManageDayClosure
    )
      return;
    if (next==='EMPLOYEE_CONFIRMED' && !canProxyConfirm) return;
    if (!submission && (next==='REOPENED' || next==='EMPLOYEE_CONFIRMED')) return requestAttendanceReason({kind:'CLOSURE',target:next},row.worker.id,selectedDate,next==='REOPENED'?'Mở lại ngày công':'Quản lý xác nhận hộ',true,undefined,detailSummary);
    const reason = submission?.reason ?? '';
    if (["REOPENED","EMPLOYEE_CONFIRMED"].includes(next) && !reason.trim()) return;
    setSaving(true);
    try {
      await setFactoryAttendanceDayClosure({
        worker_id: row.worker.id,
        work_date: selectedDate,
        target_status: next,
        expected_revision:detailSummary.current_revision,
        reason: reason?.trim() || null,
        idempotency_key: submission?.key ?? makeIdempotencyKey(),
      });
      if (!reasonSubmissionCurrent(submission)) return;
      toast.success(
        next === "REOPENED" ? "Đã mở lại ngày công" : "Đã cập nhật chốt ngày",
      );
      await loadWorkspace();
      return true;
    } catch (error) {
      if (reasonSubmissionCurrent(submission)) toast.error(errorMessage(error));
    } finally {
      if (reasonSubmissionCurrent(submission)) setSaving(false);
    }
  };

  // These refs always point at the current render's permissions, loaded rows,
  // selected day and dispatchers, including after the submit-time source read.
  reasonRenderValidateRef.current = (pending, summary) => {
    if (!sourceReady || saving || selectedDate !== pending.contextDate || (selectedWorker?.worker.id ?? null) !== pending.contextWorkerId
      || summary.worker_id !== pending.workerId || summary.work_date !== pending.workDate || summary.payroll_locked) return false;
    const action = pending.action;
    const reopening = action.kind === 'CLOSURE' && action.target === 'REOPENED';
    if (summary.closure?.status === 'LEADER_CONFIRMED' && !reopening) return false;
    if (pending.reviewedSignature && (!selectedWorker || !detailSummary || detailLoading || detailError
      || selectedWorker.worker.id !== pending.workerId || detailSummary.worker_id !== pending.workerId || detailSummary.work_date !== pending.workDate
      || reasonDaySignature(detailSummary) !== pending.reviewedSignature)) return false;
    switch (action.kind) {
      case 'ATTENDANCE_REVERSE': {
        const entry = attendanceRows.find(row=>row.id===action.id);
        return !!entry && canReverse && entry.workflow_status==='APPROVED' && !entry.is_reversed && JSON.stringify(entry)===pending.sourceSignature;
      }
      case 'ATTENDANCE_WORKFLOW': {
        const entry = attendanceRows.find(row=>row.id===action.id);
        return !!entry && canApproveAttendance && meta.workflowAvailable && !entry.is_reversed
          && entry.workflow_status===(action.target==='LOCKED'?'APPROVED':'SUBMITTED') && JSON.stringify(entry)===pending.sourceSignature;
      }
      case 'PRODUCTION_REVERSE': {
        const entry = productionEntries.find(row=>row.id===action.id);
        return !!entry && canReverse && !entry.is_reversed && entry.workflow_status==='APPROVED' && JSON.stringify(entry)===pending.sourceSignature;
      }
      case 'PRODUCTION_WORKFLOW': {
        const entry = productionEntries.find(row=>row.id===action.id);
        return !!entry && canApproveAttendance && !entry.is_reversed && entry.workflow_status==='SUBMITTED' && JSON.stringify(entry)===pending.sourceSignature;
      }
      case 'OVERTIME_WORKFLOW': {
        const entry = overtimeRows.find(row=>row.id===action.id);
        return !!entry && canApproveAttendance && meta.workflowAvailable && entry.worker_id===pending.workerId && entry.work_date.slice(0,10)===pending.workDate
          && entry.status===(action.target==='LOCKED'?'APPROVED':'SUBMITTED') && JSON.stringify(entry)===pending.sourceSignature;
      }
      case 'APPROVE_CLOSE':
        return !!selectedWorker && !!detailSummary && canApproveAttendance && canManageDayClosure && canProxyConfirm && detailSummary.classified
          && (!detailSummary.confirmation_current || detailSummary.closure?.status!=='EMPLOYEE_CONFIRMED');
      case 'CLOSURE': {
        if (!selectedWorker || !detailSummary) return false;
        const next = selectedWorker.closureStatus==='OPEN' || selectedWorker.closureStatus==='REOPENED' || selectedWorker.confirmationStale
          ? 'EMPLOYEE_CONFIRMED' : selectedWorker.closureStatus==='EMPLOYEE_CONFIRMED' ? 'LEADER_CONFIRMED' : 'REOPENED';
        return next===action.target && (action.target==='EMPLOYEE_CONFIRMED' ? canConfirmDay && canProxyConfirm : canManageDayClosure);
      }
    }
  };
  reasonRenderDispatchRef.current = async (pending, submission) => {
    const action = pending.action;
    switch (action.kind) {
      case 'ATTENDANCE_REVERSE': {const row=attendanceRows.find(entry=>entry.id===action.id);return row ? handleReverse(row,submission) : false;}
      case 'ATTENDANCE_WORKFLOW': {const row=attendanceRows.find(entry=>entry.id===action.id);return row ? handleWorkflow(row,action.target,submission) : false;}
      case 'PRODUCTION_REVERSE': {const row=productionEntries.find(entry=>entry.id===action.id);return row ? handleProductionReverse(row,submission) : false;}
      case 'PRODUCTION_WORKFLOW': {const row=productionEntries.find(entry=>entry.id===action.id);return row ? handleProductionWorkflow(row,action.target,submission) : false;}
      case 'OVERTIME_WORKFLOW': {const row=overtimeRows.find(entry=>entry.id===action.id);return row ? handleOvertimeWorkflow(row,action.target,action.fromDayDetail,submission) : false;}
      case 'APPROVE_CLOSE': return handleApproveClose(submission);
      case 'CLOSURE': return selectedWorker ? handleClosure(selectedWorker,submission) : false;
    }
  };
  const closeAttendanceReason = () => {
    if (!reasonLifecycleRef.current.mounted || reasonInFlightRef.current) return;
    reasonActiveRef.current = null; reasonRetryRef.current = null;
    setPendingReason(null); setReasonText(''); setReasonError(null); setReasonSnapshot(null); setReasonPreparing(false);
  };
  const submitAttendanceReason = async () => {
    if (!reasonLifecycleRef.current.mounted || reasonInFlightRef.current || saving || !pendingReason || reasonPreparing || !reasonSnapshot) return;
    const generation=reasonLifecycleRef.current.generation;
    const reason = reasonText.trim();
    if (pendingReason.required && !reason) {
      setReasonFieldInvalid(true); setReasonError('Vui lòng nhập lý do trước khi xác nhận.'); reasonTextareaRef.current?.focus(); return;
    }
    const pending = pendingReason;
    if (!reasonValidateRef.current(pending,reasonSnapshot)) {
      setReasonError('Ngày, nguồn hoặc quyền thao tác đã thay đổi. Đóng hộp thoại và xem lại ngày trước khi thao tác.'); setReasonSnapshot(null); return;
    }
    // Set synchronously before the first await, so rapid clicks/Enter cannot duplicate a mutation.
    reasonInFlightRef.current = true; setReasonSubmitting(true); setReasonError(null); setReasonFieldInvalid(false);
    try {
      const current = await localApi.attendanceDaySummary(pending.workerId,pending.workDate);
      if (!reasonGenerationCurrent(generation)) return;
      if (reasonActiveRef.current !== pending.requestId || reasonDaySignature(current)!==reasonDaySignature(reasonSnapshot)
        || !reasonValidateRef.current(pending,current)) {
        setReasonError('Nguồn hoặc xác nhận ngày đã thay đổi. Đóng hộp thoại, tải lại và xem lại toàn ngày.'); setReasonSnapshot(null); return;
      }
      const signature = JSON.stringify({action:pending.action,workerId:pending.workerId,date:pending.workDate,snapshot:reasonDaySignature(reasonSnapshot),reason});
      if (reasonRetryRef.current?.signature !== signature) reasonRetryRef.current = {signature,key:makeIdempotencyKey()};
      if (!reasonGenerationCurrent(generation) || reasonActiveRef.current!==pending.requestId) return;
      const success = await reasonDispatchRef.current(pending,{reason,key:reasonRetryRef.current.key,generation});
      if (!reasonGenerationCurrent(generation)) return;
      if (success) {
        reasonActiveRef.current=null; reasonRetryRef.current=null; setPendingReason(null); setReasonText(''); setReasonSnapshot(null);
      } else setReasonError('Chưa hoàn tất thao tác. Lý do được giữ lại; kiểm tra thông báo lỗi và thử lại khi dữ liệu còn đúng.');
    } catch (error) {
      if (reasonGenerationCurrent(generation)) setReasonError(errorMessage(error));
    } finally {
      if (reasonGenerationCurrent(generation)) {reasonInFlightRef.current=false; setReasonSubmitting(false);}
    }
  };

  const handleDayStatus = async () => {
    if (!selectedWorker || !canSetDayStatus) return;
    if (selectedDateIsFuture) {
      toast.error("Ngày trạng thái công không được ở tương lai.");
      return;
    }
    if (selectedWorker.closureStatus === "LEADER_CONFIRMED") {
      toast.error(
        "Ngày công đã chốt ở cấp quản lý, không thể sửa trạng thái ngày.",
      );
      return;
    }
    setSaving(true);
    try {
      await setFactoryAttendanceDayStatus({
        worker_id: selectedWorker.worker.id,
        work_date: selectedDate,
        status: dayStatusForm.status,
        meal_eligible:
          dayStatusForm.status === "PRESENT" && dayStatusForm.mealEligible,
        reason: dayStatusForm.reason.trim() || null,
        idempotency_key: makeIdempotencyKey(),
      });
      toast.success("Đã cập nhật trạng thái ngày");
      await loadWorkspace();
      setSelectedWorker(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const pendingEntry = (row: WorkerDayAttendance) =>
    row.entries.find(
      (entry) =>
        entry.source_type === "FACTORY" &&
        !entry.is_reversed &&
        entry.workflow_status === "SUBMITTED",
    );
  const pendingProductionEntry = (row: WorkerDayAttendance) =>
    row.productionEntries.find(
      (entry) => entry.workflow_status === "SUBMITTED",
    );
  const canClosure = (row: WorkerDayAttendance) =>
    row.closureStatus === "OPEN" || row.closureStatus === "REOPENED"
      ? canConfirmDay
      : canManageDayClosure;

  return (
    <div className="min-w-0 space-y-2.5">
      {(loadError || methodError) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Không thể tải bảng chấm công</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {[loadError, methodError && `Cấu hình hình thức: ${methodError}`]
                .filter(Boolean)
                .join("; ")}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadWorkspace()}
            >
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Tabs
        value={view === "QUEUE" ? "DAY" : view}
        onValueChange={(value) => setView(value as WorkspaceView)}
        className="space-y-2.5"
      >
        {/* THANH CÔNG CỤ DUY NHẤT GỌN 1 HÀNG */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-2.5 py-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <TabsList className="h-9 bg-muted/70 p-0.5">
              <TabsTrigger value="DAY" className="h-8 px-2.5 text-xs sm:text-sm">
                Nhập theo ngày
              </TabsTrigger>
              <TabsTrigger value="MONTH" className="h-8 px-2.5 text-xs sm:text-sm">
                Lưới công tháng
              </TabsTrigger>
              <TabsTrigger value="OVERTIME" className="h-8 px-2.5 text-xs sm:text-sm">
                Tăng ca
              </TabsTrigger>
              <TabsTrigger value="HISTORY" className="h-8 px-2.5 text-xs sm:text-sm">
                Lịch sử
              </TabsTrigger>
            </TabsList>

            {view === "DAY" || view === "QUEUE" ? (
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  max={today}
                  value={selectedDate <= today ? selectedDate : today}
                  onChange={(event) => {
                    if (event.target.value && event.target.value <= today)
                      setSelectedDate(event.target.value);
                  }}
                  className="h-9 w-[142px] px-2 text-xs sm:text-sm"
                  aria-label="Chọn ngày chấm công"
                />
                {selectedDate !== today && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2 text-xs"
                    onClick={() => setSelectedDate(today)}
                  >
                    Hôm nay
                  </Button>
                )}
                {!loading &&
                  selectedDate === today &&
                  !selectedDateHasData &&
                  nearestDataDate &&
                  nearestDataDate !== today && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 border-blue-200 bg-blue-50/70 px-2 text-xs text-blue-800 hover:bg-blue-100"
                      onClick={() => setSelectedDate(nearestDataDate)}
                    >
                      Mở {nearestDataDate.slice(8, 10)}/{nearestDataDate.slice(5, 7)}
                    </Button>
                  )}
              </div>
            ) : (
              <Input
                type="month"
                max={today.slice(0, 7)}
                value={selectedMonth}
                onChange={(event) => {
                  if (
                    event.target.value &&
                    event.target.value <= today.slice(0, 7)
                  )
                    setSelectedDate(
                      `${event.target.value}-${
                        selectedDate.slice(8, 10) <=
                        String(
                          new Date(
                            Number(event.target.value.slice(0, 4)),
                            Number(event.target.value.slice(5, 7)),
                            0,
                          ).getDate(),
                        ).padStart(2, "0")
                          ? selectedDate.slice(8, 10)
                          : String(
                              new Date(
                                Number(event.target.value.slice(0, 4)),
                                Number(event.target.value.slice(5, 7)),
                                0,
                              ).getDate(),
                            ).padStart(2, "0")
                      }`,
                    );
                }}
                className="h-9 w-[145px] px-2 text-xs sm:text-sm"
                aria-label="Chọn tháng"
              />
            )}

            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger
                className="h-9 w-[130px] text-xs sm:text-sm"
                aria-label="Lọc theo tổ"
              >
                <SelectValue placeholder="Tất cả tổ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả tổ</SelectItem>
                {teams.map((item) => (
                  <SelectItem key={item} value={item}>
                    {workerTypeLabels[item] ?? item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
              <SelectTrigger
                className="h-9 w-[135px] text-xs sm:text-sm"
                aria-label="Lọc nhanh trạng thái chấm công"
              >
                <SelectValue placeholder="Mọi trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Mọi trạng thái</SelectItem>
                <SelectItem value="PENDING">Chờ duyệt ({kpis.pending})</SelectItem>
                <SelectItem value="MISSING">Chưa chấm</SelectItem>
                <SelectItem value="CLOSED">Đã chốt ngày</SelectItem>
                <SelectItem value="REJECTED">Bị từ chối</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative min-w-[170px] flex-1 sm:w-52">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-8 text-xs sm:text-sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm tên, mã NV..."
                aria-label="Tìm nhân viên"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {canRecord && (
              <div className="flex items-center gap-1">
                <Input
                  value={quickWorkerName}
                  onChange={(event) => setQuickWorkerName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleQuickCreateWorker();
                    }
                  }}
                  placeholder="Nhập tên NV mới…"
                  aria-label="Nhập tên nhân viên mới"
                  className="h-9 w-40 px-2.5 text-xs sm:text-sm"
                  disabled={quickWorkerSaving}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-9 px-2.5 text-xs"
                  onClick={() => void handleQuickCreateWorker()}
                  disabled={quickWorkerSaving || !quickWorkerName.trim()}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Thêm NV
                </Button>
              </div>
            )}
            {canRecord && (view === "DAY" || view === "QUEUE") && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 border-emerald-300 bg-emerald-50/70 px-2.5 text-xs text-emerald-800 hover:bg-emerald-100"
                onClick={() => void handleMarkAllFullDay()}
                disabled={saving || selectedDateIsFuture}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Chấm 1 công tất cả
              </Button>
            )}
            {bulkApprovalAvailable && bulkPendingTotal > 0 && (
              <Button
                size="sm"
                className="h-9 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
                onClick={() => void openBulkApprovalDialog()}
                disabled={saving}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Duyệt tất cả ({bulkPendingTotal})
              </Button>
            )}
            {canRecord && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1 px-2.5 text-xs"
                onClick={() => {
                  setOvertimeForm((current) => ({
                    ...current,
                    workerId:
                      current.workerId ||
                      visibleWorkers[0]?.worker.id ||
                      workers.find((worker) => worker.is_active)?.id ||
                      "",
                    workDate: selectedDate,
                  }));
                  setOvertimeOpen(true);
                }}
                disabled={!overtimeAvailable}
              >
                <Timer className="h-3.5 w-3.5" />
                + Tăng ca
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1 px-2.5 text-xs"
              onClick={() => void handleExport()}
              disabled={saving || !sourceReady}
            >
              <Download className="h-3.5 w-3.5" />
              Xuất Excel
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => void loadWorkspace()}
              disabled={refreshing}
              aria-label="Tải lại"
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
              />
            </Button>
          </div>
        </div>

        <TabsContent value="DAY" className="mt-0">
          {loading ? (
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table disableWrapper className="min-w-[860px]">
                    <TableHeader>
                      <TableRow className="bg-muted/70">
                        <TableHead className="sticky left-0 z-20 min-w-[220px] bg-muted/95 px-3 py-2 text-xs">
                          Nhân sự
                        </TableHead>
                        {[
                          "Chấm công (1 chạm)",
                          "Sản lượng / Giờ",
                          "Thành tiền",
                          "Thao tác",
                        ].map((label) => (
                          <TableHead
                            key={label}
                            className="px-3 py-2 text-xs"
                          >
                            {label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.from({ length: 6 }).map((_, index) => (
                        <TableRow key={index}>
                          <TableCell className="sticky left-0 bg-background px-3 py-2">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="mt-1 h-3 w-24" />
                          </TableCell>
                          {["day", "output", "approved", "actions"].map(
                            (cell) => (
                              <TableCell key={cell} className="px-3 py-2">
                                <Skeleton
                                  className={
                                    cell === "actions"
                                      ? "h-8 w-28"
                                      : "h-7 w-24"
                                  }
                                />
                              </TableCell>
                            ),
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : visibleWorkers.length === 0 ? (
            <Card>
              <CardContent className="flex min-h-40 flex-col items-center justify-center gap-1.5 p-6 text-center">
                <p className="text-sm font-medium">Không có nhân sự phù hợp</p>
                <p className="text-xs text-muted-foreground">
                  Gõ tên vào ô "Nhập tên NV mới…" phía trên để thêm nhân sự và chấm công ngay.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-background">
              <div className="max-h-[calc(100vh-11.5rem)] min-h-[18rem] overflow-auto">
                <Table disableWrapper className="min-w-[860px] table-fixed border-collapse text-sm">
                  <TableHeader className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900 [&_th]:border-b [&_th]:border-r [&_th]:border-slate-200">
                    <TableRow>
                      <TableHead className="sticky left-0 z-20 w-[230px] min-w-[230px] bg-slate-100 px-3 py-2 text-xs font-semibold dark:bg-slate-900">
                        Nhân sự ({visibleWorkers.length})
                      </TableHead>
                      <TableHead className="w-[230px] px-3 py-2 text-center text-xs font-semibold">
                        Chấm công nhanh (1 chạm)
                      </TableHead>
                      <TableHead className="w-[180px] px-3 py-2 text-right text-xs font-semibold">
                        Sản lượng / Giờ
                      </TableHead>
                      <TableHead className="w-[140px] px-3 py-2 text-right text-xs font-semibold">
                        Thành tiền
                      </TableHead>
                      <TableHead className="w-[160px] px-3 py-2 text-right text-xs font-semibold">
                        Thao tác
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_td]:border-b [&_td]:border-r [&_td]:border-slate-100">
                    {visibleWorkers.map((row) => {
                      const entry = pendingEntry(row);
                      const outputEntry = pendingProductionEntry(row);
                      const blockedDay = Boolean(
                        row.dayStatus &&
                        [
                          "ABSENT",
                          "PAID_LEAVE",
                          "UNPAID_LEAVE",
                          "OFF",
                        ].includes(row.dayStatus.status),
                      );
                      const isLocked =
                        !canRecord ||
                        selectedDateIsFuture ||
                        row.closureStatus === "LEADER_CONFIRMED";
                      const isFullDay = !blockedDay && row.totalDayUnits === 1;
                      const isHalfDay = !blockedDay && row.totalDayUnits === 0.5;
                      return (
                        <TableRow
                          key={row.worker.id}
                          className={cn(
                            "odd:bg-background even:bg-slate-50/50 hover:bg-blue-50/30",
                            row.hasPending && "bg-amber-50/60",
                          )}
                        >
                          <TableCell
                            className={cn(
                              "sticky left-0 z-[1] px-3 py-1.5",
                              row.hasPending
                                ? "bg-amber-50/95"
                                : "bg-background",
                            )}
                          >
                            <div className="min-w-0">
                              <p
                                className="truncate font-medium text-foreground"
                                title={row.worker.display_name}
                              >
                                {row.worker.display_name}
                              </p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {row.worker.employee_code} ·{" "}
                                {workerTypeLabels[row.worker.worker_type] ??
                                  row.worker.worker_type}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="px-2 py-1.5 text-center">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant={isFullDay ? "default" : "outline"}
                                className={cn(
                                  "h-7 px-2.5 text-xs font-medium",
                                  isFullDay &&
                                    "bg-emerald-600 text-white hover:bg-emerald-700",
                                )}
                                onClick={() => void handleInlineDayClick(row, 1)}
                                disabled={saving || isLocked}
                              >
                                1 công
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={isHalfDay ? "default" : "outline"}
                                className={cn(
                                  "h-7 px-2.5 text-xs font-medium",
                                  isHalfDay &&
                                    "bg-blue-600 text-white hover:bg-blue-700",
                                )}
                                onClick={() =>
                                  void handleInlineDayClick(row, 0.5)
                                }
                                disabled={saving || isLocked}
                              >
                                0.5
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={blockedDay ? "default" : "outline"}
                                className={cn(
                                  "h-7 px-2.5 text-xs font-medium",
                                  blockedDay &&
                                    "bg-slate-600 text-white hover:bg-slate-700",
                                )}
                                onClick={() => void handleInlineDayClick(row, 0)}
                                disabled={saving || isLocked}
                              >
                                Nghỉ
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="px-2.5 py-1.5 text-right tabular-nums">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-xs font-medium">
                                {row.totalOutput > 0
                                  ? `${row.totalOutput.toLocaleString("vi-VN")} SP`
                                  : row.totalHours > 0
                                    ? `${row.totalHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`
                                    : "—"}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => openEntry(row, "OUTPUT")}
                                disabled={saving || isLocked || blockedDay}
                              >
                                + SL
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="px-3 py-1.5 text-right font-semibold tabular-nums text-emerald-700">
                            {row.approvedAmount > 0 ? amount(row.approvedAmount) : "—"}
                            {row.activeEntries.some(
                              (item) =>
                                item.workflow_status === "SUBMITTED" &&
                                ["DAY", "HOUR"].includes(item.attendance_method) &&
                                item.calculated_amount == null,
                            ) && (
                              <p className="mt-0.5 text-[10px] font-normal text-amber-700">
                                Chờ thiết lập lương
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="px-2.5 py-1.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {entry &&
                                meta.workflowAvailable &&
                                canApproveAttendance &&
                                entry.workflow_status === "SUBMITTED" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 border-emerald-300 bg-emerald-50 px-2 text-xs text-emerald-800 hover:bg-emerald-100"
                                    onClick={() =>
                                      void handleWorkflow(entry, "APPROVED")
                                    }
                                    disabled={saving}
                                  >
                                    <Check className="mr-1 h-3 w-3" />
                                    Duyệt
                                  </Button>
                                )}
                              {outputEntry && canApproveAttendance && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 border-emerald-300 bg-emerald-50 px-2 text-xs text-emerald-800 hover:bg-emerald-100"
                                  onClick={() =>
                                    void handleProductionWorkflow(
                                      outputEntry,
                                      "APPROVED",
                                    )
                                  }
                                  disabled={saving}
                                >
                                  <Check className="mr-1 h-3 w-3" />
                                  Duyệt SL
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => openDetails(row)}
                              >
                                Chi tiết
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="MONTH" className="mt-0">
          <div className="overflow-hidden rounded-lg border bg-background">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs">
              <span>
                Tháng <strong>{selectedMonth.replace("-", "/")}</strong> ·{" "}
                <strong>{matrixWorkers.length}</strong> nhân sự
              </span>
              <span className="tabular-nums text-muted-foreground">
                Tổng:{" "}
                <strong className="text-foreground">
                  {monthTotals.day.toLocaleString("vi-VN", {
                    maximumFractionDigits: 2,
                  })}
                </strong>{" "}
                công ·{" "}
                <strong className="text-foreground">
                  {monthTotals.hours.toLocaleString("vi-VN", {
                    maximumFractionDigits: 1,
                  })}
                </strong>{" "}
                giờ ·{" "}
                <strong className="text-foreground">
                  {monthTotals.output.toLocaleString("vi-VN")}
                </strong>{" "}
                SP · Thành tiền:{" "}
                <strong className="text-emerald-700">
                  {amount(monthTotals.amount)}
                </strong>
              </span>
            </div>
            <div className="max-h-[calc(100vh-14.5rem)] min-h-[20rem] overflow-auto">
              <Table
                disableWrapper
                className="min-w-max border-separate border-spacing-0 text-xs"
              >
                <TableHeader className="sticky top-0 z-30">
                  <TableRow>
                    <TableHead className="sticky left-0 z-40 w-[220px] min-w-[220px] border-b border-r bg-muted px-3 py-2 font-semibold">
                      Nhân sự
                    </TableHead>
                    {monthDays.map((day) => (
                      <TableHead
                        key={day.dateKey}
                        className={cn(
                          "w-[74px] min-w-[74px] border-b border-r px-1 py-2 text-center",
                          day.isWeekend
                            ? "bg-slate-100 text-slate-600"
                            : "bg-muted",
                        )}
                      >
                        <span className="block font-semibold">{day.day}</span>
                        <span className="text-[10px] font-normal">
                          {day.weekdayLabel}
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="w-[110px] min-w-[110px] border-b bg-muted px-2 py-2 text-right">
                      Tổng
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrixWorkers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={monthDays.length + 2}
                        className="h-32 text-center text-muted-foreground"
                      >
                        Không có nhân sự phù hợp với bộ lọc hiện tại.
                      </TableCell>
                    </TableRow>
                  ) : (
                    matrixWorkers.map((worker) => {
                      const dayMap =
                        monthRowsByWorker.get(worker.id) ??
                        new Map<string, WorkerDayAttendance>();
                      const rows = [...dayMap.values()];
                      const totals = rows.reduce(
                        (sum, row) => ({
                          day: sum.day + row.totalDayUnits,
                          hours: sum.hours + row.totalHours,
                          output: sum.output + row.totalOutput,
                          pending: sum.pending + (row.hasPending ? 1 : 0),
                        }),
                        { day: 0, hours: 0, output: 0, pending: 0 },
                      );
                      return (
                        <TableRow key={worker.id} className="group">
                          <TableCell className="sticky left-0 z-20 border-b border-r bg-background px-3 py-2 align-top group-hover:bg-primary/[0.04]">
                            <p
                              className="max-w-[190px] truncate font-medium"
                              title={worker.display_name}
                            >
                              {worker.display_name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {worker.employee_code} ·{" "}
                              {workerTypeLabels[worker.worker_type] ??
                                worker.worker_type}
                            </p>
                          </TableCell>
                          {monthDays.map((day) => {
                            const row = dayMap.get(day.dateKey);
                            const status = row?.dayStatus?.status;
                            const blocked =
                              status &&
                              [
                                "ABSENT",
                                "PAID_LEAVE",
                                "UNPAID_LEAVE",
                                "OFF",
                              ].includes(status);
                            const cellText = blocked
                              ? dayStatusShortLabels[status]
                              : row && row.isRecorded
                                ? [
                                    row.totalDayUnits > 0
                                      ? `${row.totalDayUnits.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}C`
                                      : "",
                                    row.totalHours > 0
                                      ? `${row.totalHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`
                                      : "",
                                    row.totalOutput > 0
                                      ? `${row.totalOutput.toLocaleString("vi-VN")}SP`
                                      : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")
                                : status
                                  ? dayStatusShortLabels[status]
                                  : "—";
                            const future = day.dateKey > today;
                            return (
                              <TableCell
                                key={day.dateKey}
                                className={cn(
                                  "border-b border-r p-0 text-center align-middle",
                                  day.isWeekend && "bg-slate-50",
                                )}
                              >
                                <button
                                  type="button"
                                  disabled={future}
                                  className={cn(
                                    "flex min-h-[46px] w-full flex-col items-center justify-center gap-0.5 px-1 py-1 transition-colors hover:bg-primary/10",
                                    row?.hasPending && "bg-amber-50",
                                    row?.hasRejected &&
                                      !row.hasPending &&
                                      "bg-red-50",
                                    blocked && "bg-slate-100 text-slate-500",
                                    future &&
                                      "cursor-not-allowed opacity-50 hover:bg-transparent",
                                  )}
                                  title={
                                    future
                                      ? "Không thể mở ngày tương lai"
                                      : row
                                        ? attendanceValueLabel(row)
                                        : "Chưa có dữ liệu"
                                  }
                                  onClick={() => {
                                    if (future) return;
                                    setSelectedDate(day.dateKey);
                                    setView("DAY");
                                    if (row) openDetails(row);
                                  }}
                                >
                                  {cellText || "—"}
                                  {row?.hasPending && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  )}
                                </button>
                              </TableCell>
                            );
                          })}
                          <TableCell className="border-b bg-background px-2 py-2 text-right align-top">
                            <p className="font-semibold tabular-nums">
                              {totals.day > 0
                                ? `${totals.day.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}C`
                                : "—"}
                            </p>
                            <p className="text-[11px] text-muted-foreground tabular-nums">
                              {totals.hours > 0
                                ? `${totals.hours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`
                                : ""}
                              {totals.output > 0
                                ? ` · ${totals.output.toLocaleString("vi-VN")} SP`
                                : ""}
                            </p>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="HISTORY" className="mt-0">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b px-4 py-3">
              <div>
                <CardTitle className="text-base">
                  Lịch sử thao tác tháng {selectedMonth.replace("-", "/")}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Theo dõi bản ghi, quy trình duyệt và lý do xử lý để đối soát.
                </p>
              </div>
              <Badge variant="secondary">
                {historyRows.length.toLocaleString("vi-VN")} sự kiện
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-23rem)] overflow-auto">
                <Table disableWrapper className="min-w-[980px]">
                  <TableHeader className="sticky top-0 z-10 bg-muted/95">
                    <TableRow>
                      <TableHead className="bg-muted/95">Ngày</TableHead>
                      <TableHead className="bg-muted/95">Nhân sự</TableHead>
                      <TableHead className="bg-muted/95">Loại</TableHead>
                      <TableHead className="bg-muted/95">Nội dung</TableHead>
                      <TableHead className="bg-muted/95">Trạng thái</TableHead>
                      <TableHead className="bg-muted/95">
                        Lý do / ghi chú
                      </TableHead>
                      <TableHead className="bg-muted/95 text-right">
                        Số tiền
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="h-32 text-center text-muted-foreground"
                        >
                          Chưa có lịch sử trong tháng.
                        </TableCell>
                      </TableRow>
                    ) : (
                      historyRows.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="whitespace-nowrap tabular-nums">
                            {item.date}
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{item.worker}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.code}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{item.kind}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[280px]">
                            {item.detail}
                          </TableCell>
                          <TableCell>
                            {item.status in statusLabels ? (
                              workflowBadge(
                                item.status as AttendanceWorkflowStatus,
                              )
                            ) : (
                              <Badge variant="outline">
                                {dayStatusLabels[
                                  item.status as FactoryAttendanceDayStatus
                                ] ?? item.status}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell
                            className="max-w-[260px] truncate"
                            title={item.reason}
                          >
                            {item.reason || "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {item.amount ? amount(item.amount) : "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="OVERTIME" className="mt-0">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b px-4 py-3">
              <div>
                <CardTitle className="text-base">
                  Tăng ca tháng {selectedMonth.replace("-", "/")}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nhập thời lượng và lý do; tiền tăng ca được tính theo chính
                  sách sau khi duyệt.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="tabular-nums">
                  {filteredOvertimeRows
                    .reduce((total, row) => total + row.overtime_minutes, 0)
                    .toLocaleString("vi-VN")}{" "}
                  phút
                </Badge>
                {canRecord && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setOvertimeForm((current) => ({
                        ...current,
                        workerId:
                          current.workerId ||
                          workers.find((worker) => worker.is_active)?.id ||
                          "",
                        workDate: selectedDate,
                      }));
                      setOvertimeOpen(true);
                    }}
                    disabled={!overtimeAvailable}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Ghi tăng ca
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-23rem)] overflow-auto">
                <Table disableWrapper className="min-w-[900px]">
                  <TableHeader className="sticky top-0 z-10 bg-muted/95">
                    <TableRow>
                      <TableHead className="bg-muted/95">Ngày</TableHead>
                      <TableHead className="bg-muted/95">Nhân sự</TableHead>
                      <TableHead className="bg-muted/95">Loại</TableHead>
                      <TableHead className="bg-muted/95 text-right">
                        Phút
                      </TableHead>
                      <TableHead className="bg-muted/95">Lý do</TableHead>
                      <TableHead className="bg-muted/95">Trạng thái</TableHead>
                      <TableHead className="bg-muted/95 text-right">
                        Thao tác
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOvertimeRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="h-32 text-center text-muted-foreground"
                        >
                          Chưa có dữ liệu tăng ca.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOvertimeRows
                        .map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="whitespace-nowrap">
                              {row.work_date.slice(0, 10)}
                            </TableCell>
                            <TableCell>
                              <p className="font-medium">{row.worker_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {row.employee_code}
                              </p>
                            </TableCell>
                            <TableCell>
                              {overtimeLabels[row.overtime_type]}
                            </TableCell>
                            <TableCell className="text-right font-medium tabular-nums">
                              {row.overtime_minutes.toLocaleString("vi-VN")}
                            </TableCell>
                            <TableCell
                              className="max-w-[240px] truncate"
                              title={row.reason}
                            >
                              {row.reason}
                            </TableCell>
                            <TableCell>{workflowBadge(row.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {row.status === "SUBMITTED" &&
                                  canApproveAttendance && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8"
                                        onClick={() =>
                                          void handleOvertimeWorkflow(
                                            row,
                                            "APPROVED",
                                          )
                                        }
                                        disabled={saving}
                                      >
                                        <Check className="mr-1 h-3.5 w-3.5" />
                                        Duyệt
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-destructive"
                                        onClick={() =>
                                          void handleOvertimeWorkflow(
                                            row,
                                            "REJECTED",
                                          )
                                        }
                                        disabled={saving}
                                      >
                                        <X className="mr-1 h-3.5 w-3.5" />
                                        Từ chối
                                      </Button>
                                    </>
                                  )}
                                {row.status === "APPROVED" && canReverse && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8"
                                    onClick={() =>
                                      void handleOvertimeWorkflow(row, "LOCKED")
                                    }
                                    disabled={saving}
                                  >
                                    <LockKeyhole className="mr-1 h-3.5 w-3.5" />
                                    Khóa
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={bulkApprovalOpen}
        onOpenChange={(open) => {
          if (saving) return;
          setBulkApprovalOpen(open);
          if (!open) {bulkReviewed.current=null;setBulkPreview(null);}
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Duyệt toàn bộ bản ghi chờ duyệt?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkReviewed.current?.label ?? bulkApprovalScopeLabel}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Chỉ duyệt các bản ghi đang ở trạng thái <strong>Chờ duyệt</strong>
              . Máy chủ xử lý một giao dịch duy nhất: nếu một bản ghi không thể
              duyệt, toàn bộ lượt duyệt hàng loạt sẽ được giữ nguyên.
            </p>
            <div className="grid gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Ngày / giờ</p>
                <p className="font-semibold tabular-nums">
                  {(bulkPreview?.counts.ATTENDANCE??0).toLocaleString("vi-VN")}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sản lượng</p>
                <p className="font-semibold tabular-nums">
                  {(bulkPreview?.counts.PRODUCTION_ENTRY??0).toLocaleString("vi-VN")}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tăng ca</p>
                <p className="font-semibold tabular-nums">
                  {(bulkPreview?.counts.OVERTIME??0).toLocaleString("vi-VN")}
                </p>
              </div>
            </div>
            <Alert className="border-amber-200 bg-amber-50/70 text-amber-950">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <AlertDescription>
                Bản ghi sản lượng cũ (nếu có) vẫn được duyệt để đối soát, nhưng{" "}
                <strong>không được cộng vào tiền lương</strong>. Hãy chuyển dần
                sang “Sản lượng theo sản phẩm”.
              </AlertDescription>
            </Alert>
          </div>
          <p className="text-sm">{bulkPreview?.worker_day_count??0} người/ngày · Phạm vi toàn tháng, theo tổ/tìm người; bỏ qua bộ lọc hình thức và trạng thái hiển thị.</p><AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Hủy</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => void handleBulkApproval()}
              disabled={saving || (bulkPreview?.record_count??0) === 0}
            >
              {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}Xác
              nhận duyệt {(bulkPreview?.record_count??0).toLocaleString("vi-VN")} bản ghi
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet
        open={Boolean(selectedWorker)}
        onOpenChange={(open) => !open && setSelectedWorker(null)}
      >
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={
            isMobile
              ? "max-h-[92vh] overflow-y-auto"
              : "w-full overflow-y-auto sm:max-w-xl"
          }
        >
          {selectedWorker && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedWorker.worker.display_name}</SheetTitle>
                <SheetDescription>
                  {selectedWorker.worker.employee_code} · {selectedDate} ·{" "}
                  {workerTypeLabels[selectedWorker.worker.worker_type] ??
                    selectedWorker.worker.worker_type}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-3 py-4">
                <p className="font-medium">{workerDayAction(selectedWorker).label}</p><p className="text-sm">{workerDayAction(selectedWorker).reason}</p>
                {detailLoading?<p>Đang kiểm tra toàn ngày…</p>:detailError?<Alert variant="destructive"><AlertDescription>{detailError}<Button variant="outline" onClick={()=>void loadWorkspace()}>Thử lại</Button></AlertDescription></Alert>:detailSummary&&<>
                  {detailSummary.payroll_locked&&<Alert><AlertDescription>Đã khóa kỳ lương; dùng quy trình điều chỉnh.</AlertDescription></Alert>}
                  <p className="text-sm">{detailSummary.sources.filter(row=>row.status==='SUBMITTED').length} bản ghi chờ duyệt · Trạng thái ngày: {dayStatusLabels[detailSummary.day_status as FactoryAttendanceDayStatus]||'Chưa ghi nhận'}</p>
                  {detailSummary.sources.map(source=>{
                    const overtimeEntry = source.source_type === 'OVERTIME'
                      ? selectedWorker.overtimeRows.find(row => row.id === source.id && row.worker_id === selectedWorker.worker.id && row.work_date.slice(0,10) === selectedDate)
                      : undefined;
                    const overtimeActionDisabled = !overtimeEntry || overtimeEntry.status !== 'SUBMITTED'
                      || !sourceReady || !canApproveAttendance || !meta.workflowAvailable || saving || detailLoading || !!detailError
                      || detailSummary.worker_id !== selectedWorker.worker.id || detailSummary.work_date !== selectedDate
                      || detailSummary.payroll_locked || detailSummary.closure?.status === 'LEADER_CONFIRMED' || selectedWorker.closureStatus === 'LEADER_CONFIRMED';
                    return <div key={source.source_type+source.id} className="rounded border p-3 text-sm"><p className="font-medium">{source.source_type==='ATTENDANCE'?'Công':source.source_type==='PRODUCTION_ENTRY'?'Sản lượng':'Tăng ca'} · {statusLabels[source.status as AttendanceWorkflowStatus]||source.status}</p><p>{source.source_type==='ATTENDANCE'?(source.facts.method==='DAY'?`${source.facts.day_units} ngày công`:source.facts.method==='HOUR'?`${source.facts.check_in}–${source.facts.check_out} · nghỉ ${source.facts.break_minutes} phút · ${source.facts.worked_minutes} phút`:'Công sản lượng cũ cần đối soát'):source.source_type==='PRODUCTION_ENTRY'?`${source.facts.product_name||source.facts.piece_rate_code||'Sản lượng'} · ${source.facts.quantity} sản phẩm`:`${source.facts.overtime_minutes} phút`}</p>{!!source.facts.notes&&<p>{String(source.facts.notes)}</p>}{!!source.facts.review_reason&&<p>Lý do: {String(source.facts.review_reason)}</p>}{source.recorded_by&&<p className="text-xs text-muted-foreground">Ghi bởi {source.recorded_by} · {source.recorded_at}</p>}
                    {source.source_type === 'OVERTIME' && source.status === 'SUBMITTED' && canApproveAttendancePermission && <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={overtimeActionDisabled} onClick={()=>{if(overtimeEntry)void handleOvertimeWorkflow(overtimeEntry,'APPROVED',true);}}>Duyệt tăng ca</Button>
                      <Button size="sm" variant="outline" className="text-destructive" disabled={overtimeActionDisabled} onClick={()=>{if(overtimeEntry)void handleOvertimeWorkflow(overtimeEntry,'REJECTED',true);}}>Từ chối tăng ca</Button>
                    </div>}
                    </div>;
                  })}
                  {selectedWorker.needsCorrection && <div className="space-y-2 rounded border p-3">
                    <p className="text-sm">Giữ phiếu bị từ chối để đối soát; ghi nguồn thay thế đúng thực tế.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" disabled={!canRecord || saving || detailLoading || !!detailError || detailSummary.worker_id !== selectedWorker.worker.id || detailSummary.work_date !== selectedDate || detailSummary.payroll_locked || selectedWorker.closureStatus === 'LEADER_CONFIRMED' || detailSummary.closure?.status === 'LEADER_CONFIRMED'} onClick={()=>openEntry(selectedWorker)}>Ghi công / sản lượng thay thế</Button>
                      {selectedWorker.overtimeRows.some(row=>row.status==='REJECTED') && <Button variant="outline" disabled={!canRecord || !overtimeAvailable || saving || detailLoading || !!detailError || detailSummary.worker_id !== selectedWorker.worker.id || detailSummary.work_date !== selectedDate || detailSummary.payroll_locked || selectedWorker.closureStatus === 'LEADER_CONFIRMED' || detailSummary.closure?.status === 'LEADER_CONFIRMED'} onClick={()=>{setOvertimeForm({workerId:selectedWorker.worker.id,workDate:selectedDate,type:'NORMAL_OVERTIME',minutes:'60',reason:''});setOvertimeOpen(true);}}>Ghi tăng ca thay thế</Button>}
                    </div>
                  </div>}
                  {detailSummary.closure?.confirmation_actor_id&&<p className="text-sm">{detailSummary.closure.confirmation_kind==='PROXY'?'Xác nhận hộ':'Xác nhận'}: {detailSummary.closure.confirmation_actor_name||detailSummary.closure.confirmation_actor_id} · {detailSummary.closure.confirmed_at} {detailSummary.closure.confirmation_reason&&`· ${detailSummary.closure.confirmation_reason}`}</p>}
                  {!detailSummary.payroll_locked&&detailSummary.closure?.status!=='LEADER_CONFIRMED'&&<Button className="w-full" disabled={!sourceReady||saving||!detailSummary.classified||!canApproveAttendance||!canManageDayClosure||(!detailSummary.confirmation_current&&!canProxyConfirm)} onClick={()=>void handleApproveClose()}>{(!detailSummary.confirmation_current||detailSummary.closure?.status!=='EMPLOYEE_CONFIRMED')?'Xác nhận hộ có lý do, duyệt & chốt':'Duyệt & chốt ngày'}</Button>}
                  {!detailSummary.confirmation_current&&!canProxyConfirm&&<p className="text-sm">Cần nhân viên xác nhận lại hoặc quản lý xác nhận hộ. Tổ trưởng không được xác nhận hộ.</p>}
                </>}
              </div>
              <details><summary className="cursor-pointer rounded border p-3 font-medium">Chi tiết nguồn và thao tác khác</summary>
              <div className="space-y-5 py-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      Tổng ghi nhận
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {attendanceValueLabel(selectedWorker)}
                    </p>
                    {selectedWorker.legacyOutputQuantity > 0 && (
                      <p className="mt-1 text-xs text-amber-700">
                        Sản lượng từ bản ghi cũ này không cộng vào tổng tiền
                        lương.
                      </p>
                    )}
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Đã duyệt</p>
                    <p className="mt-1 text-lg font-semibold">
                      {selectedWorker.approvedAmount
                        ? amount(selectedWorker.approvedAmount)
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedWorker.hasPending && workflowBadge("SUBMITTED")}
                  {selectedWorker.hasRejected && workflowBadge("REJECTED")}
                  {selectedWorker.legacyOutputEntryCount > 0 && (
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-amber-800"
                    >
                      Bản ghi cũ cần chuyển đổi
                    </Badge>
                  )}
                  {closureBadge(selectedWorker.closureStatus)}
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Bản ghi trong ngày</h3>
                    {canRecord && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedWorker(null);
                          openEntry(selectedWorker);
                        }}
                        disabled={
                          selectedWorker.closureStatus === "LEADER_CONFIRMED" ||
                          Boolean(
                            selectedWorker.dayStatus &&
                            [
                              "ABSENT",
                              "PAID_LEAVE",
                              "UNPAID_LEAVE",
                              "OFF",
                            ].includes(selectedWorker.dayStatus.status),
                          )
                        }
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Ghi thêm
                      </Button>
                    )}
                  </div>
                  {selectedWorker.entries.length === 0 ? (
                    <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      Chưa có bản ghi ngày/giờ.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedWorker.entries.map((entry) => (
                        <div key={entry.id} className="rounded-md border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">
                                {methodLabels[entry.attendance_method]} ·{" "}
                                {entrySummary(entry)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {entry.activity_name || "Không có hoạt động"}
                                {entry.notes ? ` · ${entry.notes}` : ""}
                              </p>
                            </div>
                            {workflowBadge(
                              entry.is_reversed
                                ? "REVERSED"
                                : entry.workflow_status,
                            )}
                          </div>
                           {entry.workflow_status === "SUBMITTED" &&
                             ["DAY", "HOUR"].includes(entry.attendance_method) &&
                             entry.rate_amount == null && (
                               <p className="mt-2 text-xs text-amber-700">
                                 Chờ thiết lập và duyệt lương trước khi duyệt công.
                               </p>
                             )}
                          {entry.workflow_status === "SUBMITTED" &&
                            !entry.is_reversed &&
                            meta.workflowAvailable &&
                            canApproveAttendance && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    void handleWorkflow(entry, "APPROVED")
                                  }
                                  disabled={saving}
                                >
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                  Duyệt
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive"
                                  onClick={() =>
                                    void handleWorkflow(entry, "REJECTED")
                                  }
                                  disabled={saving}
                                >
                                  <X className="mr-1 h-3.5 w-3.5" />
                                  Từ chối
                                </Button>
                              </div>
                            )}
                          {entry.workflow_status === "APPROVED" &&
                            !entry.is_reversed &&
                            canReverse && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    void handleWorkflow(entry, "LOCKED")
                                  }
                                  disabled={saving}
                                >
                                  <LockKeyhole className="mr-1 h-3.5 w-3.5" />
                                  Khóa bản ghi
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleReverse(entry)}
                                  disabled={saving}
                                >
                                  <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                                  Đảo bản ghi
                                </Button>
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Sản lượng theo sản phẩm</h3>
                    {canRecord && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedWorker(null);
                          openEntry(selectedWorker, "OUTPUT");
                        }}
                        disabled={
                          selectedWorker.closureStatus === "LEADER_CONFIRMED" ||
                          Boolean(
                            selectedWorker.dayStatus &&
                            [
                              "ABSENT",
                              "PAID_LEAVE",
                              "UNPAID_LEAVE",
                              "OFF",
                            ].includes(selectedWorker.dayStatus.status),
                          )
                        }
                      >
                        <PackageCheck className="mr-1 h-4 w-4" />
                        Ghi sản lượng
                      </Button>
                    )}
                  </div>
                  {selectedWorker.productionEntries.length === 0 ? (
                    <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                      Chưa có sản lượng trong ngày.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedWorker.productionEntries.map((entry) => (
                        <div key={entry.id} className="rounded-md border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p
                                className="truncate font-medium"
                                title={entry.product_name}
                              >
                                {entry.piece_rate_code ||
                                  entry.product_sku ||
                                  "Chưa có mã"}{" "}
                                · {entry.product_name} ·{" "}
                                {entry.quantity.toLocaleString("vi-VN")}{" "}
                                {productUnitLabel(entry.rate_unit)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {entry.piece_rate_code
                                  ? `Mã công: ${entry.piece_rate_code}`
                                  : entry.product_sku || "Chưa có mã"}
                                {entry.notes ? ` · ${entry.notes}` : ""}
                              </p>
                            </div>
                            {workflowBadge(entry.workflow_status)}
                          </div>
                          {entry.workflow_status === "SUBMITTED" &&
                            canApproveAttendance && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    void handleProductionWorkflow(
                                      entry,
                                      "APPROVED",
                                    )
                                  }
                                  disabled={saving}
                                >
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                  Duyệt sản lượng
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive"
                                  onClick={() =>
                                    void handleProductionWorkflow(
                                      entry,
                                      "REJECTED",
                                    )
                                  }
                                  disabled={saving}
                                >
                                  <X className="mr-1 h-3.5 w-3.5" />
                                  Từ chối
                                </Button>
                              </div>
                            )}
                          {entry.workflow_status === "APPROVED" &&
                            canReverse && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2"
                                onClick={() =>
                                  void handleProductionReverse(entry)
                                }
                                disabled={saving}
                              >
                                <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                                Đảo sản lượng
                              </Button>
                            )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-medium">Trạng thái ngày công</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Trạng thái</Label>
                      <Select
                        value={dayStatusForm.status}
                        onValueChange={(value) =>
                          setDayStatusForm((current) => ({
                            ...current,
                            status: value as FactoryAttendanceDayStatus,
                            mealEligible:
                              value === "PRESENT"
                                ? current.mealEligible
                                : false,
                          }))
                        }
                        disabled={!canSetDayStatus}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(dayStatusLabels).map(
                            ([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={dayStatusForm.mealEligible}
                        disabled={
                          !canSetDayStatus || dayStatusForm.status !== "PRESENT"
                        }
                        onChange={(event) =>
                          setDayStatusForm((current) => ({
                            ...current,
                            mealEligible: event.target.checked,
                          }))
                        }
                      />
                      Đủ điều kiện tiền ăn
                    </label>
                  </div>
                  <Textarea
                    value={dayStatusForm.reason}
                    onChange={(event) =>
                      setDayStatusForm((current) => ({
                        ...current,
                        reason: event.target.value,
                      }))
                    }
                    placeholder="Lý do hoặc ghi chú"
                    disabled={!canSetDayStatus}
                  />
                  <Button
                    onClick={() => void handleDayStatus()}
                    disabled={!canSetDayStatus || saving}
                  >
                    Lưu trạng thái ngày
                  </Button>
                </div>
              </div>
              </details>
              <SheetFooter className="gap-2 sm:justify-between">
                <Button variant="outline" onClick={()=>{const index=queueRows.findIndex(item=>item.row.worker.id===selectedWorker.worker.id&&item.workDate===selectedDate);const next=queueRows[index+1]||queueRows[0];if(next){setSelectedDate(next.workDate);openDetails(next.row);}else setSelectedWorker(null);}} disabled={saving||!queueRows.length}>Người tiếp theo</Button>
                <Button
                  variant="outline"
                  onClick={() => void handleClosure(selectedWorker)}
                  disabled={!canClosure(selectedWorker) || saving || detailLoading || !!detailError || !detailSummary || (selectedWorker.closureStatus!=="LEADER_CONFIRMED"&&!canProxyConfirm&&!detailSummary.confirmation_current)}
                >
                  {selectedWorker.closureStatus === "LEADER_CONFIRMED"
                    ? "Mở lại ngày"
                    : "Cập nhật chốt ngày"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSelectedWorker(null)}
                >
                  Đóng
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!pendingReason} onOpenChange={open=>{if(!open)closeAttendanceReason();}}>
        <DialogContent className="z-[70] flex max-h-[90dvh] w-[calc(100%-1rem)] flex-col overflow-hidden p-4 sm:max-w-lg sm:p-6 [&>button]:hidden"
          onOpenAutoFocus={event=>{event.preventDefault();if(reasonLifecycleRef.current.mounted)reasonTextareaRef.current?.focus();}}
          onCloseAutoFocus={event=>{event.preventDefault();if(reasonLifecycleRef.current.mounted)reasonTriggerRef.current?.focus();}}
          onEscapeKeyDown={event=>{if(reasonInFlightRef.current)event.preventDefault();}}
          onPointerDownOutside={event=>{if(reasonInFlightRef.current)event.preventDefault();}}
          onInteractOutside={event=>{if(reasonInFlightRef.current)event.preventDefault();}}>
          <DialogHeader><DialogTitle>{pendingReason?.title || 'Nhập lý do'}</DialogTitle><DialogDescription>
            {workers.find(worker=>worker.id===pendingReason?.workerId)?.display_name || pendingReason?.workerId} · {pendingReason?.workDate}
            <span className="mt-1 block">{pendingReason?.required?'Bắt buộc nhập lý do.':'Lý do tùy chọn; chọn Hủy để không thực hiện thao tác.'} Nguồn ngày sẽ được kiểm tra lại trước khi gửi.</span>
          </DialogDescription></DialogHeader>
          <form className="flex min-h-0 flex-col gap-4" onSubmit={event=>{event.preventDefault();void submitAttendanceReason();}}>
            <div className="min-h-0 space-y-2 overflow-y-auto px-1">
              <Label htmlFor="attendance-action-reason">Lý do {pendingReason?.required?'(bắt buộc)':'(tùy chọn)'}</Label>
              <Textarea ref={reasonTextareaRef} id="attendance-action-reason" value={reasonText}
                disabled={reasonSubmitting} aria-required={pendingReason?.required} aria-invalid={reasonFieldInvalid}
                aria-describedby={reasonError?'attendance-action-reason-error':undefined}
                onChange={event=>{setReasonText(event.target.value);setReasonFieldInvalid(false);}}
                className="min-h-28"/>
              {reasonPreparing && <p role="status" className="text-sm">Đang kiểm tra nguồn ngày…</p>}
              {reasonError && <p id="attendance-action-reason-error" role="alert" className="text-sm text-destructive">{reasonError}</p>}
            </div>
            <DialogFooter className="shrink-0 gap-2">
              <Button type="button" variant="outline" disabled={reasonSubmitting} onClick={closeAttendanceReason}>Hủy</Button>
              <Button type="submit" disabled={reasonSubmitting || reasonPreparing || !reasonSnapshot || saving}>
                {reasonSubmitting && <RefreshCw className="mr-2 h-4 w-4 animate-spin"/>}{reasonSubmitting?'Đang xử lý…':'Xác nhận thao tác'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet open={overtimeOpen} onOpenChange={setOvertimeOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={
            isMobile ? "max-h-[92vh] overflow-y-auto" : "w-full sm:max-w-lg"
          }
        >
          <SheetHeader>
            <SheetTitle>Ghi nhận tăng ca</SheetTitle>
            <SheetDescription>
              Chỉ nhập thời lượng và lý do. Tiền tăng ca sẽ do chính sách lương
              tính sau khi duyệt.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-5">
            <div className="space-y-1.5">
              <Label>Nhân sự</Label>
              <Select
                value={overtimeForm.workerId}
                onValueChange={(value) =>
                  setOvertimeForm((current) => ({
                    ...current,
                    workerId: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhân sự" />
                </SelectTrigger>
                <SelectContent>
                  {workers
                    .filter((worker) => monthRowsByWorker.has(worker.id))
                    .map((worker) => (
                      <SelectItem key={worker.id} value={worker.id}>
                        {worker.employee_code} · {worker.display_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Ngày</Label>
                <Input
                  type="date"
                  max={dateKey()}
                  value={overtimeForm.workDate}
                  onChange={(event) =>
                    setOvertimeForm((current) => ({
                      ...current,
                      workDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Loại tăng ca</Label>
                <Select
                  value={overtimeForm.type}
                  onValueChange={(value) =>
                    setOvertimeForm((current) => ({
                      ...current,
                      type: value as OvertimeType,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(overtimeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Số phút</Label>
              <Input
                type="number"
                min="1"
                max="1440"
                step="15"
                value={overtimeForm.minutes}
                onChange={(event) =>
                  setOvertimeForm((current) => ({
                    ...current,
                    minutes: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Tối đa 1.440 phút cho một ngày.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>
                Lý do <span className="text-red-500">*</span>
              </Label>
              <Textarea
                value={overtimeForm.reason}
                onChange={(event) =>
                  setOvertimeForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                placeholder="Ví dụ: Hoàn tất đơn gấp"
              />
            </div>
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Bản ghi tăng ca sẽ ở trạng thái <strong>Chờ duyệt</strong>.
              </AlertDescription>
            </Alert>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOvertimeOpen(false)}>
              Hủy
            </Button>
            <Button onClick={() => void handleOvertime()} disabled={saving || !canRecord}>
              {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}Gửi
              tăng ca
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={Boolean(entryTarget)}
        onOpenChange={(open) => !open && setEntryTarget(null)}
      >
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={
            isMobile ? "max-h-[92vh] overflow-y-auto" : "w-full sm:max-w-lg"
          }
        >
          <SheetHeader>
            <SheetTitle>Ghi chấm công nhanh</SheetTitle>
            <SheetDescription>
              {entryTarget?.worker.display_name} · {selectedDate}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-5">
            <div className="space-y-1.5">
              <Label>Hình thức chấm</Label>
              <Select
                value={entryForm.method}
                onValueChange={(value) => {
                  const method = value as AttendanceMethod;
                  setEntryForm((current) => ({
                    ...current,
                    method,
                    productId: method === "OUTPUT" ? current.productId : "",
                  }));
                  if (method === "OUTPUT") void loadProducts();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(methodLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Có thể ghi nhiều hình thức trong cùng một ngày; mỗi bản ghi sẽ
                chờ duyệt riêng.
              </p>
            </div>
            {entryForm.method === "DAY" && (
              <div className="space-y-1.5">
                <Label>Số ngày công</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.25"
                  value={entryForm.dayUnits}
                  onChange={(event) =>
                    setEntryForm((current) => ({
                      ...current,
                      dayUnits: event.target.value,
                    }))
                  }
                />
              </div>
            )}
            {entryForm.method === "HOUR" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Giờ vào</Label>
                  <Input
                    type="time"
                    step="60"
                    value={entryForm.checkInTime}
                    onChange={(event) =>
                      setEntryForm((current) => ({
                        ...current,
                        checkInTime: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Giờ ra</Label>
                  <Input
                    type="time"
                    step="60"
                    value={entryForm.checkOutTime}
                    onChange={(event) =>
                      setEntryForm((current) => ({
                        ...current,
                        checkOutTime: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Thời gian nghỉ (phút)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={entryForm.breakMinutes}
                    onChange={(event) =>
                      setEntryForm((current) => ({
                        ...current,
                        breakMinutes: event.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Số giờ công được máy chủ tính từ giờ vào, giờ ra và thời
                    gian nghỉ.
                  </p>
                </div>
              </div>
            )}
            {entryForm.method==='OUTPUT'&&<div className="space-y-3 border p-3"><Label>Nguồn sản lượng</Label><Select value={outputMode} onValueChange={value=>setOutputMode(value as 'ASSIGNMENT'|'STANDALONE')}><SelectTrigger className="min-h-11"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ASSIGNMENT">Việc sản xuất đã nhận</SelectItem><SelectItem value="STANDALONE">Ngoài lệnh · quản lý xác nhận riêng</SelectItem></SelectContent></Select>{outputMode==='ASSIGNMENT'?<><Label>Việc đã nhận</Label><Select value={outputAssignment} onValueChange={setOutputAssignment}><SelectTrigger className="min-h-11"><SelectValue placeholder="Chọn việc đã nhận"/></SelectTrigger><SelectContent>{receivedWork.map(work=><SelectItem key={work.id} value={work.id}>{work.production_order_number} · {work.product_name} · {work.piece_rate_code} · Còn {work.remaining_quantity}</SelectItem>)}</SelectContent></Select>{receivedWorkError&&<p role="alert" className="text-sm text-destructive">{receivedWorkError}</p>}{!receivedWork.length&&!receivedWorkError&&<p className="text-sm text-muted-foreground">Nhân sự chưa có việc đã nhận còn số lượng trong ngày.</p>}<Label>Số lượng đạt</Label><Input className="min-h-11" type="number" min="0.01" step="0.01" value={entryForm.outputQuantity} onChange={event=>setEntryForm(current=>({...current,outputQuantity:event.target.value}))}/><p className="text-sm text-muted-foreground">Báo cáo này đi cùng việc sản xuất, chờ duyệt tại công đoạn và không tạo phiếu lương thứ hai.</p></>:<><Label>Lý do ngoài lệnh / công sửa rèm riêng</Label><Input className="min-h-11" value={standaloneReason} maxLength={1000} onChange={event=>setStandaloneReason(event.target.value)} placeholder="Nêu công việc và lý do không thuộc lệnh"/></>}</div>}
            {entryForm.method === "OUTPUT" && outputMode==='STANDALONE' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Tìm mã công may</Label>
                  <Input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Nhập mã Excel, tên hoặc SKU CRM"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Mã công may <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={entryForm.productId}
                    onValueChange={(value) =>
                      setEntryForm((current) => ({
                        ...current,
                        productId: value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          productsLoading
                            ? "Đang tải mã công may..."
                            : filteredProducts.length
                              ? "Chọn mã công may có đơn giá"
                              : "Không có mã phù hợp"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredProducts.map((product) => (
                        <SelectItem
                          key={product.id}
                          value={product.id}
                          disabled={!product.rate_available}
                        >
                          <div className="flex max-w-[420px] items-center justify-between gap-3">
                            <span className="truncate">
                              {product.piece_rate_code ||
                                product.sku ||
                                "Chưa có mã"}{" "}
                              · {product.name}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {product.rate !== null
                                ? `${product.rate.toLocaleString("vi-VN")} đ/${productUnitLabel(product.rate_unit)}`
                                : "Chưa có giá"}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedProduct && (
                    <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="block truncate font-medium">
                          {selectedProduct.piece_rate_code ||
                            selectedProduct.sku ||
                            "Chưa có mã"}{" "}
                          · {selectedProduct.name}
                        </span>
                        {selectedProduct.sku &&
                          selectedProduct.piece_rate_code &&
                          selectedProduct.sku !==
                            selectedProduct.piece_rate_code && (
                            <span className="block text-xs text-muted-foreground">
                              SKU CRM: {selectedProduct.sku}
                            </span>
                          )}
                      </div>
                      <span className="shrink-0 text-emerald-700">
                        {selectedProduct.rate !== null
                          ? `${selectedProduct.rate.toLocaleString("vi-VN")} đ/${productUnitLabel(selectedProduct.rate_unit)}`
                          : "Đã có đơn giá"}
                      </span>
                    </div>
                  )}
                  {productError && (
                    <p className="text-xs text-red-600">{productError}</p>
                  )}
                  {!productError && unavailableProductCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {unavailableProductCount.toLocaleString("vi-VN")} mã chưa
                      có đơn giá hiệu lực.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    Số lượng đạt <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={entryForm.outputQuantity}
                    onChange={(event) =>
                      setEntryForm((current) => ({
                        ...current,
                        outputQuantity: event.target.value,
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Đơn giá sẽ được máy chủ chốt theo ngày làm.
                  </p>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Hoạt động</Label>
              <Input
                value={entryForm.activityName}
                onChange={(event) =>
                  setEntryForm((current) => ({
                    ...current,
                    activityName: event.target.value,
                  }))
                }
                placeholder="Ví dụ: May thân áo"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ghi chú</Label>
              <Textarea
                value={entryForm.notes}
                onChange={(event) =>
                  setEntryForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Không bắt buộc"
              />
            </div>
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                Bản ghi sẽ ở trạng thái <strong>Chờ duyệt</strong> cho đến khi
                người có quyền xác nhận.
              </AlertDescription>
            </Alert>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEntryTarget(null)}>
              Hủy
            </Button>
            <Button
              onClick={() => void handleQuickEntry()}
              disabled={
                saving || !canRecord ||
                (entryForm.method === "OUTPUT" && (outputMode==='ASSIGNMENT'?!outputAssignment:(!selectedProduct || !selectedProduct.rate_available||standaloneReason.trim().length<3)))
              }
            >
              {saving && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              {entryForm.method === "OUTPUT"
                ? "Gửi sản lượng"
                : "Lưu chấm công"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
