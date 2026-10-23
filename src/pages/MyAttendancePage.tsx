import { overtimeRetryKey } from "@/lib/attendance-retry";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRole } from "@/hooks/useUserRole";
import { localApi, type AttendanceDaySummary, type MyAttendanceContext } from "@/lib/local-api";
import MyProductionDispatch from "@/components/MyProductionDispatch";
import { attendanceDayNeedsCorrection } from "@/lib/attendance-workspace";
import {
  getLocalMe,
  getLocalUserSession,
  hasLocalUserSession,
  type LocalMe,
} from "@/lib/local-auth";
import { isLocalBackend } from "@/lib/runtime-config";
import type {
  FactoryAttendanceRow,
  FactoryAttendanceClosureRow,
  ProductionEntryProduct,
} from "@/integrations/supabase/production-execution-types";
import type { ProductEarnings } from "@/lib/production-dispatch-types";
import {
  CalendarCheck2,
  Check,
  Clock,
  Loader2,
  PackageCheck,
  Pencil,
  Send,
  ShieldCheck,
  Timer,
  Wallet,
} from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const monthKey = () => todayKey().slice(0, 7);
const fmtMoney = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("vi-VN").format(v) + " ₫";

const DAY_STATUS_LABEL: Record<string, string> = {
  PRESENT: "Có mặt",
  ABSENT: "Vắng mặt",
  PAID_LEAVE: "Nghỉ phép hưởng lương",
  UNPAID_LEAVE: "Nghỉ không lương",
  HOLIDAY: "Ngày lễ",
  OFF: "Nghỉ theo lịch",
};

type Method = "HOUR" | "DAY" | "OUTPUT";

const STATUS_LABEL: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "outline" | "destructive";
  }
> = {
  SUBMITTED: { label: "Chờ duyệt", variant: "secondary" },
  APPROVED: { label: "Đã duyệt", variant: "default" },
  REJECTED: { label: "Từ chối", variant: "destructive" },
  LOCKED: { label: "Đã khóa", variant: "outline" },
  REVERSED: { label: "Đã đảo", variant: "outline" },
};

export default function MyAttendancePage() {
  const { user, isReady: authReady } = useAuthReady();
  const { role, loading: roleLoading } = useUserRole(user);
  const { toast } = useToast();
  const localMode = isLocalBackend();
  const hasUser = hasLocalUserSession();

  const [me, setMe] = useState<LocalMe | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [attendanceContext, setAttendanceContext] =
    useState<MyAttendanceContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextRetry, setContextRetry] = useState(0);
  const [month, setMonth] = useState(monthKey());
  const [mode,setMode]=useState<'TODAY'|'MONTH'|'INCOME'|'PROFILE'>('TODAY');
  const [lastMonthMode, setLastMonthMode] = useState<'MONTH'|'INCOME'>('MONTH');
  useEffect(() => { if (mode === 'MONTH' || mode === 'INCOME') setLastMonthMode(mode); }, [mode]);
  const [daySummary,setDaySummary]=useState<AttendanceDaySummary|null>(null);
  const [summaryError,setSummaryError]=useState<string|null>(null);
  const [summaryLoading,setSummaryLoading]=useState(false);
  const [closures,setClosures]=useState<FactoryAttendanceClosureRow[]>([]);
  const [onlyMine,setOnlyMine]=useState(false);
  const [rowsState, setRows] = useState<FactoryAttendanceRow[]>([]);
  const [dayStatusesState, setDayStatuses] = useState<Record<string, unknown>[]>([]);
  const [overtimeState, setOvertime] = useState<Record<string, unknown>[]>([]);
  const [prodEntriesState, setProdEntries] = useState<Record<string, unknown>[]>([]);
  const [products, setProducts] = useState<ProductionEntryProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [earnings, setEarnings] = useState<ProductEarnings | null>(null);
  const [confirmingDay, setConfirmingDay] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [sourceLoadErrors,setSourceLoadErrors] = useState<string[]>([]);
  const [loadedMonth, setLoadedMonth] = useState("");
  const monthRequestRef = useRef(0);
  const currentMonthRef = useRef(month);
  currentMonthRef.current = month;

  const rows = useMemo(() => loadedMonth === month ? rowsState : [], [loadedMonth, month, rowsState]);
  const dayStatuses = loadedMonth === month ? dayStatusesState : [];
  const overtime = loadedMonth === month ? overtimeState : [];
  const prodEntries = useMemo(() => loadedMonth === month ? prodEntriesState : [], [loadedMonth, month, prodEntriesState]);

  // form state
  const [method, setMethod] = useState<Method>("HOUR");
  const [workDate, setWorkDate] = useState(todayKey());
  const [checkIn, setCheckIn] = useState("07:30");
  const [checkOut, setCheckOut] = useState("17:00");
  const [breakMin, setBreakMin] = useState("60");
  const [dayUnits, setDayUnits] = useState("1");
  const [dayStatus, setDayStatus] = useState("PRESENT");
  const [productId, setProductId] = useState("");
  const [outputQty, setOutputQty] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const overtimeDate=workDate;
  const [overtimeType, setOvertimeType] = useState("NORMAL");
  const [overtimeMinutes, setOvertimeMinutes] = useState("60");
  const [overtimeReason, setOvertimeReason] = useState("");
  const [submittingOvertime, setSubmittingOvertime] = useState(false);
  const attendanceRequestRef = useRef<{
    fingerprint: string;
    key: string;
  } | null>(null);

  const overtimeKeys = useRef(new Map<string,string>());
  const overtimeInFlight = useRef(false);
  const overtimeLifecycle = useRef({mounted:false,generation:0});
  const overtimeContext = useRef("");
  overtimeContext.current=JSON.stringify([user?.id,hasUser,me?.worker_id,workDate,attendanceContext,contextLoading,contextError]);
  const focusAttendance = useRef(false);
  useEffect(()=>{const state=overtimeLifecycle.current;state.mounted=true;state.generation++;
    return()=>{state.mounted=false;state.generation++;};},[]);
  useEffect(()=>{
    if(focusAttendance.current && mode==='TODAY' && !contextLoading && attendanceContext?.work_date===workDate) {
      const field=document.getElementById('attendance-edit-form');
      if(field){focusAttendance.current=false;field.focus();field.scrollIntoView({block:'center',behavior:'smooth'});}
    }
  },[mode,workDate,contextLoading,attendanceContext]);

  const loadAll = useCallback(async () => {
    if (!localMode || currentMonthRef.current !== month) return;
    const request = ++monthRequestRef.current;
    const session = getLocalUserSession()?.token;
    setLoadingRows(true);
    setLoadErrors([]);
    const results = await Promise.allSettled([
      localApi.myAttendance(`${month}-01`),
      localApi.myOvertime(`${month}-01`),
      localApi.myProductionEntries(`${month}-01`),
      localApi.myProductEarnings(month),
      localApi.myDayStatuses(`${month}-01`),
      localApi.myAttendanceClosures(month),
    ]);
    if (request !== monthRequestRef.current || currentMonthRef.current !== month || session!==getLocalUserSession()?.token) return;
    const [att, ot, pe, earningResult, days,closureResult] = results;
    setClosures(closureResult.status==='fulfilled'?closureResult.value:[]);
    setRows(att.status === "fulfilled" ? att.value.rows || [] : []);
    setOvertime(ot.status === "fulfilled" ? ot.value || [] : []);
    setProdEntries(pe.status === "fulfilled" ? pe.value || [] : []);
    setEarnings(earningResult.status === "fulfilled" ? earningResult.value : null);
    setDayStatuses(days.status === "fulfilled" ? days.value || [] : []);
    const labels = ["Công ngày/giờ", "Tăng ca", "Sản lượng", "Thu nhập sản lượng", "Trạng thái ngày", "Xác nhận ngày"];
    setLoadErrors(results.flatMap((result, index) => result.status === "rejected"
      ? [`${labels[index]}: ${result.reason instanceof Error ? result.reason.message : "Không tải được dữ liệu"}`] : []));
    setSourceLoadErrors(results.flatMap((result,index)=>index!==3 && result.status==='rejected' ? [labels[index]] : []));
    setLoadedMonth(month);
    setLoadingRows(false);
  }, [localMode, month]);

  useEffect(() => () => { monthRequestRef.current += 1; }, []);

  useEffect(() => {
    if (localMode && hasUser && me?.worker_id) void loadAll();
  }, [localMode, hasUser, me?.worker_id, loadAll]);

  useEffect(()=>{if(mode==='TODAY' && workDate.slice(0,7)!==month)setMonth(workDate.slice(0,7));},[mode,workDate,month]);
  useEffect(()=>{
    setDaySummary(null);setSummaryError(null);if(!localMode||!me?.worker_id)return;
    let cancelled=false;setSummaryLoading(true);
    localApi.myAttendanceDaySummary(workDate).then(value=>{if(!cancelled)setDaySummary(value);}).catch(error=>{if(!cancelled)setSummaryError(error instanceof Error?error.message:'Không tải được ngày.');}).finally(()=>{if(!cancelled)setSummaryLoading(false);});
    return ()=>{cancelled=true;};
  },[localMode,me?.worker_id,workDate,loadingRows]);
  const dayNeedsCorrection = !!daySummary && attendanceDayNeedsCorrection(daySummary.sources, !!daySummary.day_status);
  const monthDayNeedsCorrection = (date: string) => attendanceDayNeedsCorrection([
    ...rows.filter(row => row.work_date.slice(0,10) === date).map(row => ({status: row.workflow_status, isReversed: row.is_reversed})),
    ...prodEntries.filter(row => String(row.work_date).slice(0,10) === date).map(row => ({status: String(row.workflow_status), isReversed: !!row.is_reversed})),
    ...overtime.filter(row => String(row.work_date).slice(0,10) === date).map(row => ({status: String(row.status)})),
  ], dayStatuses.some(row => String(row.work_date).slice(0,10) === date));
  const canConfirmReviewedDay = !!daySummary && daySummary.work_date===workDate && daySummary.classified && !daySummary.payroll_locked && daySummary.closure?.status!=='LEADER_CONFIRMED' && !summaryLoading && !summaryError && loadedMonth === month && workDate.slice(0,7) === month && !loadingRows && sourceLoadErrors.length === 0;
  const confirmDay = async () => {
    if (!me?.worker_id || confirmingDay || !canConfirmReviewedDay) return;
    setConfirmingDay(true);
    try {
      await localApi.confirmMyAttendanceDay({ work_date: workDate, expected_revision:daySummary?.current_revision, idempotency_key: crypto.randomUUID() });
      toast({ title: `Đã xác nhận ngày ${workDate}` });
      await loadAll();
    } catch (error) {
      toast({ title: "Không thể xác nhận ngày công", description: error instanceof Error ? error.message : "Ngày đã bị khóa hoặc cần quản lý mở lại.", variant: "destructive" });
    } finally { setConfirmingDay(false); }
  };

  useEffect(() => {
    setProductId("");
  }, [method, workDate]);

  useEffect(() => {
    if (!localMode || !hasUser || method !== "OUTPUT" || !me?.worker_id) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }

    let cancelled = false;
    setLoadingProducts(true);
    localApi
      .productionProducts(workDate)
      .then((items) => {
        if (cancelled) return;
        setProducts((items || []).filter((item) => item.rate_available));
      })
      .catch((error) => {
        if (cancelled) return;
        setProducts([]);
        toast({
          title: "Không tải được danh sách sản phẩm",
          description: error instanceof Error ? error.message : "Lỗi",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [localMode, hasUser, me?.worker_id, method, workDate, toast]);

  useEffect(() => {
    if (!localMode || !hasUser || !me?.worker_id) {
      setAttendanceContext(null);
      setContextLoading(false);
      return;
    }
    let cancelled = false;
    setContextLoading(true);
    setContextError(null);
    localApi
      .myAttendanceContext(workDate)
      .then((context) => {
        if (cancelled) return;
        setAttendanceContext(context);
        if (context.primary_method) setMethod(context.primary_method);
      })
      .catch((error) => {
        if (cancelled) return;
        setAttendanceContext(null);
        setContextError(error instanceof Error ? error.message : "Không tải được cấu hình chấm công");
        toast({
          title: "Không tải được cấu hình chấm công",
          description: error instanceof Error ? error.message : "Lỗi",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [localMode, hasUser, me?.worker_id, workDate, contextRetry, toast]);

  useEffect(() => {
    if (attendanceContext?.mode === "MONTHLY") setDayStatus("PRESENT");
  }, [attendanceContext?.mode, workDate]);

  useEffect(() => {
    if (!localMode || !hasUser) {
      setMeLoading(false);
      return;
    }
    let cancelled = false;
    getLocalMe()
      .then((m) => {
        if (cancelled) return;
        setMe(m);
        // Gợi ý đúng hình thức theo hồ sơ công nhân để giảm thao tác nhầm.
        // Người dùng vẫn có thể đổi sang hình thức khác khi cần.
        if (m.worker_type === "SEWER") setMethod("OUTPUT");
        else if (m.worker_type === "HELPER") setMethod("DAY");
        else setMethod("HOUR");
      })
      .catch((e) => {
        if (!cancelled) toast({
          title: "Lỗi tài khoản",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        });
      })
      .finally(() => { if (!cancelled) setMeLoading(false); });
    return () => { cancelled = true; };
  }, [localMode, hasUser, toast]);

  const summary = useMemo(() => {
    const approvedStatuses = new Set(["APPROVED", "LOCKED"]);
    const submittedStatuses = new Set(["SUBMITTED"]);
    let approvedHours = 0;
    let submittedHours = 0;
    let approvedDays = 0;
    let submittedDays = 0;
    let approvedOutput = 0;
    let submittedOutput = 0;
    let approvedAmount = 0;
    let submittedAmount = 0;

    for (const row of rows) {
      const status = String(row.workflow_status || "SUBMITTED");
      if (
        row.is_reversed ||
        status === "REJECTED" ||
        row.attendance_method === "OUTPUT"
      )
        continue;
      const approved = approvedStatuses.has(status);
      const submitted = submittedStatuses.has(status);
      if (row.attendance_method === "HOUR") {
        if (approved) approvedHours += Number(row.work_hours || 0);
        if (submitted) submittedHours += Number(row.work_hours || 0);
      }
      if (row.attendance_method === "DAY") {
        if (approved) approvedDays += Number(row.day_units || 0);
        if (submitted) submittedDays += Number(row.day_units || 0);
      }
      const amount =
        row.cost_visible && row.calculated_amount !== null
          ? Number(row.calculated_amount || 0)
          : 0;
      if (approved) approvedAmount += amount;
      if (submitted) submittedAmount += amount;
    }

    for (const entry of prodEntries) {
      const status = String(
        entry.workflow_status || entry.status || "SUBMITTED",
      );
      if (entry.is_reversed || status === "REJECTED" || status === "REVERSED")
        continue;
      const quantity = Number(entry.quantity || 0);
      if (approvedStatuses.has(status)) approvedOutput += quantity;
      if (submittedStatuses.has(status)) submittedOutput += quantity;
      const amount =
        entry.cost_visible && entry.calculated_amount !== null
          ? Number(entry.calculated_amount || 0)
          : 0;
      if (approvedStatuses.has(status)) approvedAmount += amount;
      if (submittedStatuses.has(status)) submittedAmount += amount;
    }

    return {
      approvedHours,
      submittedHours,
      approvedDays,
      submittedDays,
      approvedOutput,
      submittedOutput,
      approvedAmount,
      submittedAmount,
    };
  }, [rows, prodEntries]);

  const contextReady = !contextLoading && !contextError && attendanceContext?.work_date === workDate && attendanceContext.configured;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me?.worker_id || !contextReady) return;
    if (method === "OUTPUT" && (!productId || Number(outputQty) <= 0)) {
      toast({
        title: "Thiếu thông tin sản lượng",
        description: "Chọn sản phẩm và nhập số lượng lớn hơn 0.",
        variant: "destructive",
      });
      return;
    }
    if (attendanceContext?.mode === "MONTHLY" && !DAY_STATUS_LABEL[dayStatus]) {
      toast({
        title: "Chọn trạng thái ngày công",
        description: "Vui lòng chọn trạng thái cho ngày làm việc.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const fingerprint = JSON.stringify({
        method,
        workDate,
        productId: method === "OUTPUT" ? productId : null,
        outputQty: method === "OUTPUT" ? outputQty : null,
        checkIn: method === "HOUR" ? checkIn : null,
        checkOut: method === "HOUR" ? checkOut : null,
        breakMin: method === "HOUR" ? breakMin : null,
        dayUnits: method === "DAY" ? dayUnits : null,
        dayStatus: attendanceContext?.mode === "MONTHLY" ? dayStatus : null,
        notes,
      });
      const previous = attendanceRequestRef.current;
      const idempotencyKey =
        previous?.fingerprint === fingerprint
          ? previous.key
          : crypto.randomUUID();
      attendanceRequestRef.current = { fingerprint, key: idempotencyKey };

      if (attendanceContext?.mode === "MONTHLY" && dayStatus !== "PRESENT") {
        await localApi.recordMyDayStatus({
          work_date: workDate,
          status: dayStatus,
          reason: notes || null,
          idempotency_key: idempotencyKey,
        });
      } else if (method === "OUTPUT") {
        const selectedRate = products.find((item) => item.id === productId);
        await localApi.recordMyProductionEntry({
          rate_id: productId,
          product_id: selectedRate?.product_id ?? null,
          piece_rate_code: selectedRate?.piece_rate_code ?? null,
          work_date: workDate,
          quantity: Number(outputQty),
          notes: notes || null,
          idempotency_key: idempotencyKey,
        });
      } else {
        const body: Record<string, unknown> = {
          work_date: workDate,
          attendance_method: method,
          notes: notes || null,
          idempotency_key: idempotencyKey,
        };
        if (method === "HOUR") {
          body.check_in_time = checkIn;
          body.check_out_time = checkOut;
          body.break_minutes = Number(breakMin || 0);
        } else {
          body.day_units = Number(dayUnits || 1);
        }
        await localApi.recordMyAttendance(body);
      }
      toast({
        title:
          attendanceContext?.mode === "MONTHLY" && dayStatus !== "PRESENT"
            ? "Đã gửi trạng thái ngày công"
            : method === "OUTPUT"
              ? "Đã gửi phiếu sản lượng"
              : "Đã ghi chấm công",
        description: "Bản ghi đang chờ quản lý duyệt.",
      });
      setNotes("");
      setOutputQty("");
      await loadAll();
      attendanceRequestRef.current = null;
    } catch (e2) {
      toast({
        title: "Không ghi được",
        description: e2 instanceof Error ? e2.message : "Lỗi",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const editRejected = (row: FactoryAttendanceRow) => {
    focusAttendance.current=true;
    setMode('TODAY');
    setMonth(String(row.work_date).slice(0,7));
    setWorkDate(String(row.work_date).slice(0, 10));
    setMethod(row.attendance_method as Method);
    setCheckIn(String(row.check_in_time || "07:30").slice(0, 5));
    setCheckOut(String(row.check_out_time || "17:00").slice(0, 5));
    setBreakMin(String(row.break_minutes ?? 60));
    setDayUnits(String(row.day_units ?? "1"));
    setOutputQty(String(row.output_quantity ?? ""));
    setNotes(
      row.workflow_reason
        ? `Sửa theo phản hồi quản lý: ${row.workflow_reason}`
        : "Sửa lại theo yêu cầu quản lý",
    );

  };

  const submitOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    if(overtimeInFlight.current || !overtimeLifecycle.current.mounted || !me?.worker_id || !hasUser) return;
    const payload={worker_id:me.worker_id,work_date:overtimeDate,overtime_type:overtimeType,overtime_minutes:Number(overtimeMinutes),reason:overtimeReason.trim()};
    const retry=overtimeRetryKey(overtimeKeys.current,payload,()=>crypto.randomUUID());
    const generation=overtimeLifecycle.current.generation;
    const context=overtimeContext.current;
    const session=getLocalUserSession()?.token;
    const reason=overtimeReason;
    const current=()=>overtimeLifecycle.current.mounted && overtimeLifecycle.current.generation===generation && overtimeContext.current===context && session===getLocalUserSession()?.token;
    overtimeInFlight.current=true;setSubmittingOvertime(true);
    try {
      await localApi.recordMyOvertime({work_date:payload.work_date,overtime_type:payload.overtime_type,overtime_minutes:payload.overtime_minutes,reason:payload.reason,idempotency_key:retry.key});
      // A known success consumes this key even if the user has navigated away.
      overtimeKeys.current.delete(retry.fingerprint);
      if(!current())return;
      toast({title:"Đã gửi tăng ca",description:"Bản ghi đang chờ quản lý duyệt."});
      setOvertimeReason(value=>value===reason ? "" : value);
      await loadAll();
    } catch(error) {
      if(current())toast({title:"Không ghi được tăng ca",description:error instanceof Error?error.message:"Lỗi",variant:"destructive"});
    } finally {
      overtimeInFlight.current=false;
      if(overtimeLifecycle.current.mounted && overtimeLifecycle.current.generation===generation)setSubmittingOvertime(false);
    }
  };

  if (!localMode) {
    return (
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Không khả dụng</AlertTitle>
        <AlertDescription>
          Trang này chỉ dùng cho bản local SQL.
        </AlertDescription>
      </Alert>
    );
  }
  if (authReady === false || roleLoading || meLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!hasUser) {
    return (
      <Alert variant="destructive">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Cần đăng nhập</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            Nhân viên cần đăng nhập bằng tài khoản được cấp để tự chấm công.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Đăng nhập</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!me?.worker_id) {
    return (
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Chưa liên kết hồ sơ công nhân</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>Tài khoản <b>{me?.email}</b> chưa được gắn với hồ sơ công nhân nào. Bạn có thể tự hoàn thiện hồ sơ trước; quản lý chỉ cần xác nhận liên kết sau đó.</p>
          <Button asChild variant="outline"><Link to="/my-profile">Hoàn thiện hồ sơ của tôi</Link></Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="attendance-page mx-auto max-w-6xl space-y-6 p-3 text-base sm:p-5 md:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Chấm công của tôi</h1>
        <p className="mt-1 text-base text-muted-foreground sm:text-lg">
          {me.worker_name} · Mã {me.employee_code} ·{" "}
          {role === "employee" ? "Nhân viên" : role}
        </p>
      </div>

      <nav className="grid grid-cols-3 gap-2" aria-label="Nội dung chấm công">
        <Button className="min-h-12 whitespace-normal px-2" aria-pressed={mode==='TODAY'} variant={mode==='TODAY'?'default':'outline'} onClick={()=>setMode('TODAY')}>Hôm nay</Button>
        <Button className="min-h-12 whitespace-normal px-2" aria-pressed={mode==='MONTH'||mode==='INCOME'} variant={mode==='MONTH'||mode==='INCOME'?'default':'outline'} onClick={()=>setMode(lastMonthMode)}>Công & thu nhập</Button>
        <Button className="min-h-12 whitespace-normal px-2" aria-pressed={mode==='PROFILE'} variant={mode==='PROFILE'?'default':'outline'} onClick={()=>setMode('PROFILE')}>Hồ sơ</Button>
      </nav>
      {(mode==='MONTH'||mode==='INCOME') && <nav className="flex flex-wrap gap-2" aria-label="Tra cứu tháng">{([['MONTH','Bảng công tháng'],['INCOME','Thu nhập sản lượng']] as const).map(([value,label])=><Button key={value} className="min-h-12" aria-pressed={mode===value} variant={mode===value?'secondary':'outline'} onClick={()=>setMode(value)}>{label}</Button>)}</nav>}
      {mode!=='PROFILE' && <div className="space-y-1"><Label htmlFor="attendance-context-date">{mode==='TODAY'?'Ngày đang ghi nhận':'Tháng tra cứu'}</Label>{mode==='TODAY'?<Input id="attendance-context-date" type="date" value={workDate} max={todayKey()} onChange={event=>{if(event.target.value)setWorkDate(event.target.value);}} className="max-w-xs"/>:<Input id="attendance-context-date" type="month" value={month} onChange={event=>{if(event.target.value)setMonth(event.target.value);}} className="max-w-xs"/>}</div>}
      <div hidden={mode!=='PROFILE'} className="space-y-4">
        <Card><CardHeader><CardTitle>Hồ sơ của tôi</CardTitle><CardDescription className="text-base">Xem và cập nhật thông tin cá nhân, liên hệ và tài khoản ngân hàng.</CardDescription></CardHeader><CardContent><Button asChild className="min-h-12"><Link to="/my-profile">Xem và chỉnh sửa hồ sơ</Link></Button></CardContent></Card>
        <Card><CardHeader><CardTitle>Cách chấm công đang áp dụng</CardTitle><CardDescription>Thông tin áp dụng cho ngày {workDate}.</CardDescription></CardHeader><CardContent className="space-y-3"><p className="text-lg font-semibold">{contextLoading?'Đang tải cấu hình…':attendanceContext?.label||'Chưa cấu hình'}</p><p>{contextError||attendanceContext?.instructions||'Liên hệ quản lý để kiểm tra hình thức và đơn giá được duyệt.'}</p><div className="flex flex-wrap gap-2">{attendanceContext?.components.map(component=><Badge key={component.rate_id} variant="secondary">{component.label}</Badge>)}</div><p className="text-sm text-muted-foreground">Cần điều chỉnh chế độ lương hoặc xem quy chế đang áp dụng: liên hệ quản lý nhân sự.</p></CardContent></Card>
      </div>
      <div hidden={mode!=='TODAY'} className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              Cách chấm công đã được cấu hình
            </p>
            <p className="mt-1 text-xl font-bold">
              {contextLoading
                ? "Đang tải cấu hình…"
                : attendanceContext?.label || "Chưa cấu hình"}
            </p>
            <p className="mt-1 text-base text-muted-foreground">
              {attendanceContext?.instructions ||
                "Liên hệ quản lý nếu thông tin chưa đúng."}
            </p>
          </div>
          {!!attendanceContext?.components.length && (
            <div className="flex flex-wrap gap-2">
              {attendanceContext.components.map((component) => (
                <Badge key={component.rate_id} variant="secondary" className="px-3 py-1 text-sm">
                  {component.label}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {contextError && <Alert variant="destructive"><AlertTitle>Chưa tải được cấu hình ngày {workDate}</AlertTitle><AlertDescription className="space-y-2"><p>{contextError}</p><Button variant="outline" size="sm" onClick={() => setContextRetry(value => value + 1)}>Thử tải lại cấu hình</Button></AlertDescription></Alert>}
      {/* Form ghi chấm công */}
      {contextReady ? <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-xl">
            <CalendarCheck2 className="h-5 w-5" /> Ghi chấm công hôm nay / ngày
            khác
          </CardTitle>
          <CardDescription className="text-base">
            Hệ thống đã chọn đúng biểu mẫu theo hồ sơ lương của bạn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="attendance-edit-form" tabIndex={-1} aria-label="Sửa và gửi lại chấm công" onSubmit={submit} className="grid gap-5 md:grid-cols-2">
            {method === "HOUR" && (
              <>
                <div className="space-y-2">
                  <Label>Giờ vào</Label>
                  <Input
                    type="time"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Giờ ra</Label>
                  <Input
                    type="time"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nghỉ giữa ca (phút)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={breakMin}
                    onChange={(e) => setBreakMin(e.target.value)}
                  />
                </div>
              </>
            )}
            {attendanceContext?.mode === "MONTHLY" && (
              <div className="space-y-2 md:col-span-2">
                <Label>Trạng thái ngày công</Label>
                <Select value={dayStatus} onValueChange={setDayStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRESENT">Có mặt</SelectItem>
                    <SelectItem value="PAID_LEAVE">Nghỉ phép hưởng lương</SelectItem>
                    <SelectItem value="UNPAID_LEAVE">Nghỉ không lương</SelectItem>
                    <SelectItem value="HOLIDAY">Ngày lễ</SelectItem>
                    <SelectItem value="OFF">Nghỉ theo lịch</SelectItem>
                    <SelectItem value="ABSENT">Vắng mặt</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Chọn “Có mặt” để ghi 1 ngày công; các trạng thái nghỉ sẽ được
                  gửi vào bảng ngày công để quản lý theo dõi.
                </p>
              </div>
            )}
            {method === "DAY" && attendanceContext?.mode !== "MONTHLY" && (
              <div className="space-y-2">
                <Label>Số ngày công</Label>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Số ngày công">
                  <Button type="button" className="min-h-12" variant={dayUnits==='0.5'?'default':'outline'} aria-pressed={dayUnits==='0.5'} onClick={()=>setDayUnits('0.5')}>Nửa công · 0,5</Button>
                  <Button type="button" className="min-h-12" variant={dayUnits==='1'?'default':'outline'} aria-pressed={dayUnits==='1'} onClick={()=>setDayUnits('1')}>Đủ công · 1</Button>
                </div>
              </div>
            )}
            {method === "OUTPUT" && (
              <>
                <div className="space-y-2 md:col-span-2">
                  <Label>Sản phẩm</Label>
                  <Select
                    value={productId}
                    onValueChange={setProductId}
                    disabled={loadingProducts}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          loadingProducts
                            ? "Đang tải sản phẩm..."
                            : "Chọn sản phẩm"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.piece_rate_code || "Chưa có mã công may Excel"}{" "}
                          · {product.name}
                          {product.sku &&
                          product.piece_rate_code &&
                          product.sku !== product.piece_rate_code
                            ? ` · SKU ${product.sku}`
                            : ""}
                          {product.rate_unit ? ` · ${product.rate_unit}` : ""}
                        </SelectItem>
                      ))}
                      {!loadingProducts && products.length === 0 && (
                        <div className="px-2 py-3 text-sm text-muted-foreground">
                          Chưa có sản phẩm được cấu hình đơn giá cho ngày này.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Số lượng sản phẩm</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={outputQty}
                    onChange={(e) => setOutputQty(e.target.value)}
                    required
                    placeholder="VD: 120"
                  />
                </div>
              </>
            )}

            <div className="space-y-2 md:col-span-2">
              <Label>Ghi chú (tuỳ chọn)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={1}
                placeholder="VD: ca sáng, làm đơn ..."
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={
                  submitting || !contextReady ||
                  (method === "OUTPUT" &&
                    (!productId || Number(outputQty) <= 0))
                }
                className="w-full md:w-auto"
              >
                {submitting
                  ? "Đang ghi..."
                  : attendanceContext?.mode === "MONTHLY" && dayStatus !== "PRESENT"
                    ? "Gửi trạng thái ngày công"
                    : method === "OUTPUT"
                    ? "Gửi phiếu sản lượng"
                    : "Ghi chấm công"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card> : <Alert>
        <ShieldCheck className="h-5 w-5" />
        <AlertTitle>{contextLoading || attendanceContext?.work_date !== workDate ? "Đang kiểm tra cách chấm công cho ngày đã chọn" : "Chưa có cách chấm công được duyệt"}</AlertTitle>
        <AlertDescription className="text-base">
          {contextError ? "Chưa tải được cấu hình ngày này. Dùng nút thử tải lại phía trên." : contextLoading || attendanceContext?.work_date !== workDate ? "Chờ cấu hình ngày này tải xong trước khi ghi công." : "Bạn chưa thể gửi chấm công cho ngày này. Quản lý cần cấu hình và duyệt đơn giá trong phần Thiết lập tiền lương."}
        </AlertDescription>
      </Alert>}

      </div>
      <div hidden={mode!=='MONTH'} className="space-y-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={onlyMine} onChange={event=>setOnlyMine(event.target.checked)}/>Cần tôi xác nhận</label>
        {loadingRows||loadedMonth!==month?<p>Đang tải ngày trong tháng…</p>:<div className="grid gap-3 sm:grid-cols-2">{[...new Set([...rows,...prodEntries,...overtime,...dayStatuses,...closures].map(row=>String(row.work_date).slice(0,10)))].sort().reverse().filter(date=>!onlyMine||!closures.some(row=>row.work_date.slice(0,10)===date&&(row.status==='LEADER_CONFIRMED'||(row.status==='EMPLOYEE_CONFIRMED'&&!monthDayNeedsCorrection(date)&&row.confirmed_revision!=null&&String(row.confirmed_revision)===String(row.current_revision))))).map(date=>{const closure=closures.find(row=>row.work_date.slice(0,10)===date);const needsCorrection=monthDayNeedsCorrection(date);return <Card key={date}><CardContent className="space-y-2 p-4"><p className="font-semibold">{date}</p><p className="text-sm">Công {rows.filter(row=>row.work_date.slice(0,10)===date).length} · Sản lượng {prodEntries.filter(row=>String(row.work_date).slice(0,10)===date).length} · Tăng ca {overtime.filter(row=>String(row.work_date).slice(0,10)===date).length}</p><p>{closure?.status==='LEADER_CONFIRMED'?'Đã chốt':needsCorrection?'Cần sửa · xem lý do từ chối và ghi nguồn thay thế':closure?.status==='EMPLOYEE_CONFIRMED'?(closure.confirmed_revision!=null&&String(closure.confirmed_revision)===String(closure.current_revision)?'Đã xác nhận':'Cần xác nhận lại'):'Chờ xem lại và xác nhận'}</p><Button variant="outline" className="w-full" onClick={()=>{setWorkDate(date);setMode('TODAY');}}>Mở ngày</Button></CardContent></Card>;})}</div>}
        {!loadingRows&&loadedMonth===month&&!rows.length&&!prodEntries.length&&!overtime.length&&!dayStatuses.length&&<p>Chưa có ngày được ghi nhận trong tháng. Khoảng trống không đồng nghĩa vắng mặt.</p>}
        <details><summary className="cursor-pointer py-2 font-medium">Trạng thái ngày chi tiết</summary>
      {dayStatuses.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">Ngày công đã gửi trong tháng</CardTitle>
            <CardDescription className="text-base">
              Các trạng thái này chờ quản lý kiểm tra theo quy trình của công ty.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ghi chú</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dayStatuses.map((item) => {
                    const status = String(item.status || "");
                    return (
                      <TableRow key={String(item.id || item.work_date)}>
                        <TableCell>{String(item.work_date || "").slice(0, 10)}</TableCell>
                        <TableCell>
                          <Badge variant={status === "PRESENT" ? "default" : "secondary"}>
                            {DAY_STATUS_LABEL[status] || status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-normal text-muted-foreground">
                          {String(item.reason || "—")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      </details></div>
      {loadErrors.length > 0 && <Alert variant="destructive">
        <AlertTitle>Dữ liệu tháng {month} chưa đầy đủ</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>Không dùng số liệu hiện tại để đối soát lương cho đến khi tải lại thành công.</p>
          {loadErrors.map(error => <p key={error}>{error}</p>)}
          <Button variant="outline" size="sm" disabled={loadingRows} onClick={() => void loadAll()}>Thử tải lại</Button>
        </AlertDescription>
      </Alert>}

      {mode==='TODAY'&&<details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Việc sản xuất và tiến độ</summary><p className="my-2 text-sm text-muted-foreground">Sản lượng đã báo cáo từ việc sản xuất xuất hiện trong tóm tắt ngày; không nhập lại cùng sản lượng bằng phiếu thủ công.</p><MyProductionDispatch /></details>}
      <div hidden={mode!=='INCOME'} className="space-y-6">

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
          <div><CardTitle className="text-xl">Thu nhập sản lượng của tôi</CardTitle><CardDescription className="text-base">Mã công may Excel là căn cứ tính tiền; SKU CRM chỉ là thông tin liên kết.</CardDescription></div>

        </CardHeader>
        <CardContent className="space-y-3">
          {workDate.slice(0,7) !== month && <p className="text-sm text-amber-700">Chọn tháng {workDate.slice(0,7)} để xem đầy đủ và xác nhận ngày {workDate}.</p>}
          {loadingRows || loadedMonth !== month ? <p className="text-sm text-muted-foreground">Đang tải thu nhập tháng {month}…</p> : !earnings ? <p className="text-sm text-muted-foreground">{loadErrors.some(error => error.startsWith("Thu nhập sản lượng:")) ? "Không tải được thu nhập. Vui lòng thử tải lại ở thông báo phía trên." : "Chưa có dữ liệu thu nhập sản lượng trong tháng này."}</p> : <>
            <div className="grid gap-2 sm:grid-cols-3"><div className="rounded border p-3"><div className="text-xs text-muted-foreground">Chờ duyệt</div><div className="text-lg font-semibold">{fmtMoney(earnings.pending_total)}</div></div><div className="rounded border p-3"><div className="text-xs text-muted-foreground">Đã duyệt</div><div className="text-lg font-semibold">{fmtMoney(earnings.approved_total)}</div></div><div className="rounded border p-3"><div className="text-xs text-muted-foreground">Đã khóa kỳ</div><div className="text-lg font-semibold">{fmtMoney(earnings.locked_total)}</div></div></div>
            {!!earnings.rows.length && <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead>Mã công</TableHead><TableHead className="text-right">SL đạt</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thành tiền</TableHead><TableHead>Lý do</TableHead></TableRow></TableHeader><TableBody>{earnings.rows.map(row=>{const status=String(row.approved_status||row.status||'SUBMITTED');const label=status==='LOCKED'?'Đã khóa':status==='APPROVED'?'Đã duyệt':'Chờ duyệt';const amount=row.approved_amount??row.pending_amount;return <TableRow key={row.id}><TableCell>{row.work_date}</TableCell><TableCell className="font-medium">{row.piece_rate_code||'—'}</TableCell><TableCell className="text-right">{Number(row.quantity_good||0).toLocaleString('vi-VN')}</TableCell><TableCell><Badge variant={status==='LOCKED'||status==='APPROVED'?'default':'secondary'}>{label}</Badge></TableCell><TableCell className="text-right">{fmtMoney(amount)}</TableCell><TableCell className="max-w-64 whitespace-normal text-xs text-muted-foreground">{row.unavailable_reason||row.eligibility_warning||'—'}</TableCell></TableRow>;})}</TableBody></Table></div>}
          </>}
        </CardContent>
      </Card>

      {/* Tổng kết tháng */}
      {!loadingRows && loadedMonth === month && !loadErrors.some(error => error.startsWith("Công ngày/giờ:") || error.startsWith("Sản lượng:")) && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <Clock className="h-8 w-8 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">
                {summary.approvedHours.toFixed(1)}
              </div>
              <div className="text-sm text-muted-foreground">
                Giờ đã duyệt · chờ {summary.submittedHours.toFixed(1)}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <CalendarCheck2 className="h-8 w-8 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">{summary.approvedDays}</div>
              <div className="text-sm text-muted-foreground">
                Ngày đã duyệt · chờ {summary.submittedDays}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <PackageCheck className="h-8 w-8 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">
                {summary.approvedOutput.toLocaleString("vi-VN")}
              </div>
              <div className="text-sm text-muted-foreground">
                Sản lượng đã duyệt · chờ{" "}
                {summary.submittedOutput.toLocaleString("vi-VN")}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-4">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">
                {fmtMoney(summary.approvedAmount)}
              </div>
              <div className="text-sm text-muted-foreground">
                Tiền công đã duyệt/khóa
                <div>Chờ duyệt: {fmtMoney(summary.submittedAmount)}</div>
                <div className="text-xs">Chưa gồm toàn bộ khoản lương tháng và tăng ca.</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>}

      {/* Tăng ca tự ghi */}
      </div>
      <details hidden={mode!=='TODAY'} className="rounded-lg border p-4">
      <summary className="flex min-h-12 cursor-pointer items-center text-lg font-semibold">Tăng ca · Đăng ký và xem lịch sử</summary>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Timer className="h-5 w-5" /> Đăng ký tăng ca
          </CardTitle>
          <CardDescription className="text-base">
            Nhập số phút và lý do; quản lý sẽ duyệt riêng với ngày công.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitOvertime} className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Loại tăng ca</Label>
              <Select value={overtimeType} onValueChange={setOvertimeType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Ngày thường</SelectItem>
                  <SelectItem value="WEEKEND">Cuối tuần</SelectItem>
                  <SelectItem value="HOLIDAY">Ngày lễ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Số phút</Label>
              <Input
                type="number"
                min="1"
                step="15"
                value={overtimeMinutes}
                onChange={(e) => setOvertimeMinutes(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Lý do</Label>
              <Input
                value={overtimeReason}
                onChange={(e) => setOvertimeReason(e.target.value)}
                placeholder="VD: Hoàn thành đơn gấp"
                required
              />
            </div>
            <div className="md:col-span-4 flex justify-end">
              <Button
                type="submit"
                disabled={submittingOvertime || !overtimeReason.trim()}
              >
                <Send className="mr-2 h-4 w-4" />
                {submittingOvertime ? "Đang gửi..." : "Gửi đăng ký tăng ca"}
              </Button>
            </div>
          </form>
          {overtime.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ngày</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Thời lượng</TableHead>
                    <TableHead>Lý do</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overtime.map((item) => (
                    <TableRow key={String(item.id)}>
                      <TableCell>
                        {String(item.work_date || "").slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        {item.overtime_type === "HOLIDAY"
                          ? "Ngày lễ"
                          : item.overtime_type === "WEEKEND"
                            ? "Cuối tuần"
                            : "Ngày thường"}
                      </TableCell>
                      <TableCell>
                        {Number(item.overtime_minutes || 0)} phút
                      </TableCell>
                      <TableCell className="max-w-80 whitespace-normal">
                        {String(item.reason || "—")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === "APPROVED" ||
                            item.status === "LOCKED"
                              ? "default"
                              : item.status === "REJECTED"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {item.status === "APPROVED"
                            ? "Đã duyệt"
                            : item.status === "LOCKED"
                              ? "Đã khóa"
                              : item.status === "REJECTED"
                                ? "Từ chối"
                                : "Chờ duyệt"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      </details>
      {mode==='TODAY'&&<Card><CardHeader><CardTitle>Xem lại toàn bộ ngày {workDate}</CardTitle><CardDescription>Kiểm tra các phiếu đã ghi trước khi xác nhận ngày.</CardDescription></CardHeader><CardContent className="space-y-3">
        {summaryLoading?<p>Đang tải toàn bộ nguồn…</p>:summaryError?<Alert variant="destructive"><AlertDescription>{summaryError}<Button variant="outline" onClick={()=>void loadAll()}>Thử lại</Button></AlertDescription></Alert>:daySummary&&<>
          <p className="font-medium">{daySummary.payroll_locked?'Đã khóa kỳ':daySummary.closure?.status==='LEADER_CONFIRMED'?'Đã chốt':dayNeedsCorrection?'Cần sửa':!daySummary.classified?'Chưa ghi nhận':daySummary.confirmation_current?'Đã xác nhận':daySummary.closure?.status==='EMPLOYEE_CONFIRMED'?'Cần xác nhận lại':'Chờ xác nhận'}</p>
          <p className="text-sm text-muted-foreground">Công {daySummary.sources.filter(row=>row.source_type==='ATTENDANCE').length} · Sản lượng {daySummary.sources.filter(row=>row.source_type==='PRODUCTION_ENTRY').length} · Tăng ca {daySummary.sources.filter(row=>row.source_type==='OVERTIME').length} · Trạng thái: {DAY_STATUS_LABEL[daySummary.day_status??'']??'Chưa ghi nhận'}</p>
          {!!daySummary.day_status_reason&&<p className="text-sm">Ghi chú trạng thái: {daySummary.day_status_reason}</p>}
          <div className="space-y-2">{daySummary.sources.map(source=><div key={source.source_type+source.id} className="rounded border p-3 text-sm"><span>{source.source_type==='ATTENDANCE'?'Công':source.source_type==='PRODUCTION_ENTRY'?'Sản lượng':'Tăng ca'} · {STATUS_LABEL[source.status]?.label??source.status}</span><p>{source.source_type==='ATTENDANCE'?(source.facts.method==='DAY'?`${source.facts.day_units} ngày công`:source.facts.method==='HOUR'?`${source.facts.check_in}–${source.facts.check_out} · nghỉ ${source.facts.break_minutes} phút · thực làm ${source.facts.worked_minutes} phút`:'Sản lượng cũ cần đối soát'):source.source_type==='PRODUCTION_ENTRY'?`${source.facts.product_name||source.facts.piece_rate_code||'Sản lượng'} · ${source.facts.quantity} sản phẩm`:`${source.facts.overtime_minutes} phút · ${source.facts.overtime_type==='SUNDAY_OVERTIME'?'Chủ nhật':source.facts.overtime_type==='HOLIDAY_OVERTIME'?'Ngày lễ':'Ngày thường'}`}</p>{!!source.facts.notes&&<p>Ghi chú: {String(source.facts.notes)}</p>}{!!source.facts.review_reason&&<p>Lý do xử lý: {String(source.facts.review_reason)}</p>}{source.recorded_by&&<p className="text-xs text-muted-foreground">Ghi bởi {source.recorded_by} · {source.recorded_at}</p>}<details className="text-xs text-muted-foreground"><summary className="flex min-h-12 cursor-pointer items-center">Mã phiếu</summary><p className="break-all">{source.id}</p></details></div>)}</div>
          <p className="text-sm">{dayNeedsCorrection?'Xem lý do từ chối và dùng biểu mẫu ghi chấm công ở trên để ghi nguồn thay thế đúng thực tế hoặc cập nhật trạng thái ngày.':daySummary.sources.some(row=>row.status==='SUBMITTED')?'Có nguồn chờ quản lý duyệt. Hãy xem lại mọi nguồn trước khi xác nhận.':!daySummary.classified?'Chưa có lịch ca để kết luận vắng mặt. Ghi công hoặc trạng thái đúng thực tế.':'Xem công, sản lượng, tăng ca và trạng thái trước khi xác nhận.'}</p>
          {daySummary.closure?.confirmation_actor_id&&<p className="text-sm">{daySummary.closure.confirmation_kind==='PROXY'?'Quản lý xác nhận hộ':'Người xác nhận'}: {daySummary.closure.confirmation_actor_name||daySummary.closure.confirmation_actor_id} · {daySummary.closure.confirmed_at} {daySummary.closure.confirmation_reason&&`· Lý do: ${daySummary.closure.confirmation_reason}`}</p>}
        </>}
        {daySummary?.closure?.status!=='LEADER_CONFIRMED'&&!daySummary?.payroll_locked&&<Button className="min-h-12 w-full sm:w-auto" disabled={confirmingDay||!canConfirmReviewedDay||daySummary?.confirmation_current} onClick={()=>void confirmDay()}><Check className="mr-2 h-4 w-4"/>{daySummary?.closure?.status==='EMPLOYEE_CONFIRMED'&&!daySummary?.confirmation_current?'Xác nhận lại toàn ngày':'Xác nhận toàn ngày'}</Button>}
        <p className="text-xs text-muted-foreground">Có sai lệch: liên hệ quản lý kèm ngày và mã phiếu. Nghỉ hưởng lương hiện cần đối soát quy tắc riêng.</p>
      </CardContent></Card>}
      <div hidden={mode!=='MONTH'} className="space-y-6">
      <details><summary className="cursor-pointer rounded border p-3 font-medium">Phiếu nguồn và lịch sử chi tiết</summary>
      {prodEntries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-xl">
              <PackageCheck className="h-5 w-5" /> Phiếu sản lượng chi tiết
            </CardTitle>
            <CardDescription className="text-base">
              Sản lượng được gửi riêng theo từng sản phẩm và không cộng trùng
              với bảng công cũ.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead className="text-right">Số lượng</TableHead>
                  <TableHead>Đơn vị</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ghi chú</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prodEntries.map((entry) => {
                  const status = String(
                    entry.workflow_status || entry.status || "SUBMITTED",
                  );
                  const st = STATUS_LABEL[status] || STATUS_LABEL.SUBMITTED;
                  const productName = String(
                    entry.product_name ||
                      entry.product_name_snapshot ||
                      "Sản phẩm",
                  );
                  const sku = String(
                    entry.product_sku || entry.product_sku_snapshot || "",
                  );
                  return (
                    <TableRow key={String(entry.id)}>
                      <TableCell className="whitespace-nowrap">
                        {String(entry.work_date || "").slice(0, 10)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{productName}</div>
                        {entry.piece_rate_code && (
                          <div className="text-xs text-muted-foreground">
                            Mã công: {String(entry.piece_rate_code)}
                          </div>
                        )}
                        {sku && sku !== String(entry.piece_rate_code || "") && (
                          <div className="text-xs text-muted-foreground">
                            SKU CRM: {sku}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {Number(entry.quantity || 0).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell>
                        {String(
                          entry.rate_unit ||
                            entry.rate_unit_snapshot ||
                            "PIECE",
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {entry.workflow_reason && (
                          <div className="mt-1 max-w-48 text-xs text-destructive">
                            {String(entry.workflow_reason)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-56 whitespace-normal text-sm text-muted-foreground">
                        {String(entry.notes || "—")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Bảng lịch sử */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-xl">Bảng công của tôi</CardTitle>
            <CardDescription className="text-base">
              Chỉ hiển thị dữ liệu của chính bạn
            </CardDescription>
          </div>

        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loadingRows ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Hình thức</TableHead>
                  <TableHead>Vào</TableHead>
                  <TableHead>Ra</TableHead>
                  <TableHead className="text-right">Giờ/Ngày/SL</TableHead>
                  <TableHead className="text-right">Đơn giá</TableHead>
                  <TableHead className="text-right">Thành tiền</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-8"
                    >
                      Chưa có bản ghi nào trong tháng này.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  const st =
                    STATUS_LABEL[String(r.workflow_status || "SUBMITTED")] ||
                    STATUS_LABEL.SUBMITTED;
                  const val =
                    r.attendance_method === "HOUR"
                      ? Number(r.work_hours || 0).toFixed(2)
                      : r.attendance_method === "DAY"
                        ? String(r.day_units ?? "")
                        : String(r.output_quantity ?? "");
                  return (
                    <TableRow
                      key={r.id}
                      className={r.is_reversed ? "opacity-50 line-through" : ""}
                    >
                      <TableCell className="whitespace-nowrap">
                        {r.work_date}
                      </TableCell>
                      <TableCell>
                        {r.attendance_method === "HOUR"
                          ? "Giờ"
                          : r.attendance_method === "DAY"
                            ? "Ngày"
                            : "Sản lượng"}
                      </TableCell>
                      <TableCell>{r.check_in_time || "—"}</TableCell>
                      <TableCell>{r.check_out_time || "—"}</TableCell>
                      <TableCell className="text-right">{val}</TableCell>
                      <TableCell className="text-right">
                        {fmtMoney(r.rate_amount)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmtMoney(r.calculated_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {r.is_reversed && (
                          <Badge variant="outline" className="ml-1">
                            Đã đảo
                          </Badge>
                        )}
                        {r.workflow_reason && (
                          <div className="mt-1 max-w-64 text-xs text-destructive">
                            {r.workflow_reason}
                          </div>
                        )}
                        {r.workflow_status === "REJECTED" && !r.is_reversed && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-2 min-h-11 px-3 text-sm"
                            onClick={() => editRejected(r)}
                          >
                            <Pencil className="mr-1 h-3 w-3" />
                            Sửa & gửi lại
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {(overtime.length > 0 || prodEntries.length > 0) && (
            <div className="mt-4 space-y-2 text-sm">
              {prodEntries.length > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <PackageCheck className="h-4 w-4" /> {prodEntries.length}{" "}
                  phiếu sản lượng chi tiết
                </div>
              )}
              {overtime.length > 0 && (
                <div className="text-muted-foreground">
                  {overtime.length} phiếu tăng ca
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </details>
      </div>
    </div>
  );
}
