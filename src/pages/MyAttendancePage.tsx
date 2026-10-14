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
import { localApi, type MyAttendanceContext } from "@/lib/local-api";
import MyProductionDispatch from "@/components/MyProductionDispatch";
import {
  getLocalMe,
  hasLocalUserSession,
  type LocalMe,
} from "@/lib/local-auth";
import { isLocalBackend } from "@/lib/runtime-config";
import type {
  FactoryAttendanceRow,
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
  const [month, setMonth] = useState(monthKey());
  const [rows, setRows] = useState<FactoryAttendanceRow[]>([]);
  const [dayStatuses, setDayStatuses] = useState<Record<string, unknown>[]>([]);
  const [overtime, setOvertime] = useState<Record<string, unknown>[]>([]);
  const [prodEntries, setProdEntries] = useState<Record<string, unknown>[]>([]);
  const [products, setProducts] = useState<ProductionEntryProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [earnings, setEarnings] = useState<ProductEarnings | null>(null);
  const [confirmingDay, setConfirmingDay] = useState(false);

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
  const [overtimeDate, setOvertimeDate] = useState(todayKey());
  const [overtimeType, setOvertimeType] = useState("NORMAL");
  const [overtimeMinutes, setOvertimeMinutes] = useState("60");
  const [overtimeReason, setOvertimeReason] = useState("");
  const [submittingOvertime, setSubmittingOvertime] = useState(false);
  const attendanceRequestRef = useRef<{
    fingerprint: string;
    key: string;
  } | null>(null);

  const loadAll = useCallback(async () => {
    if (!localMode) return;
    setLoadingRows(true);
    try {
      const [att, ot, pe, earningResult] = await Promise.all([
        localApi.myAttendance(`${month}-01`),
        localApi.myOvertime(`${month}-01`).catch(() => []),
        localApi.myProductionEntries(`${month}-01`),
        localApi.myProductEarnings(month).catch(() => null),
      ]);
      setRows(att.rows || []);
      setOvertime(ot || []);
      setProdEntries(pe || []);
      setEarnings(earningResult);
      setDayStatuses(await localApi.myDayStatuses(`${month}-01`).catch(() => []));
    } catch (e) {
      toast({
        title: "Không tải được dữ liệu",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    } finally {
      setLoadingRows(false);
    }
  }, [localMode, month, toast]);

  const confirmDay = async () => {
    if (!me?.worker_id || confirmingDay) return;
    setConfirmingDay(true);
    try {
      await localApi.confirmMyAttendanceDay({ work_date: workDate, idempotency_key: crypto.randomUUID() });
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
  }, [localMode, hasUser, me?.worker_id, workDate, toast]);

  useEffect(() => {
    if (attendanceContext?.mode === "MONTHLY") setDayStatus("PRESENT");
  }, [attendanceContext?.mode, workDate]);

  useEffect(() => {
    if (!localMode || !hasUser) {
      setMeLoading(false);
      return;
    }
    getLocalMe()
      .then((m) => {
        setMe(m);
        // Gợi ý đúng hình thức theo hồ sơ công nhân để giảm thao tác nhầm.
        // Người dùng vẫn có thể đổi sang hình thức khác khi cần.
        if (m.worker_type === "SEWER") setMethod("OUTPUT");
        else if (m.worker_type === "HELPER") setMethod("DAY");
        else setMethod("HOUR");
        if (m.worker_id) loadAll();
      })
      .catch((e) =>
        toast({
          title: "Lỗi tài khoản",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        }),
      )
      .finally(() => setMeLoading(false));
  }, [localMode, hasUser, loadAll, toast]);

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me?.worker_id) return;
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitOvertime = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingOvertime(true);
    try {
      await localApi.recordMyOvertime({
        work_date: overtimeDate,
        overtime_type: overtimeType,
        overtime_minutes: Number(overtimeMinutes),
        reason: overtimeReason.trim(),
        idempotency_key: crypto.randomUUID(),
      });
      toast({
        title: "Đã gửi tăng ca",
        description: "Bản ghi đang chờ quản lý duyệt.",
      });
      setOvertimeReason("");
      await loadAll();
    } catch (e2) {
      toast({
        title: "Không ghi được tăng ca",
        description: e2 instanceof Error ? e2.message : "Lỗi",
        variant: "destructive",
      });
    } finally {
      setSubmittingOvertime(false);
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

      {/* Form ghi chấm công */}
      {attendanceContext?.configured ? <Card>
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
          <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-base font-semibold">Ngày làm việc</Label>
              <Input
                type="date"
                value={workDate}
                max={todayKey()}
                onChange={(e) => setWorkDate(e.target.value)}
                required
              />
            </div>

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
                <Select value={dayUnits} onValueChange={setDayUnits}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.5">0.5 ngày</SelectItem>
                    <SelectItem value="1">1 ngày</SelectItem>
                  </SelectContent>
                </Select>
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
                  submitting ||
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
        <AlertTitle>Chưa có cách chấm công được duyệt</AlertTitle>
        <AlertDescription className="text-base">
          Bạn chưa thể gửi chấm công cho ngày này. Quản lý cần cấu hình và duyệt
          đơn giá trong phần Thiết lập tiền lương.
        </AlertDescription>
      </Alert>}

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

      <MyProductionDispatch />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
          <div><CardTitle className="text-xl">Thu nhập sản lượng của tôi</CardTitle><CardDescription className="text-base">Mã công may Excel là căn cứ tính tiền; SKU CRM chỉ là thông tin liên kết.</CardDescription></div>
          <Button variant="outline" size="sm" disabled={confirmingDay} onClick={() => void confirmDay()}><Check className="mr-1.5 h-4 w-4" />Xác nhận ngày {workDate}</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {!earnings ? <p className="text-sm text-muted-foreground">Chưa có dữ liệu thu nhập sản lượng trong tháng này.</p> : <>
            <div className="grid gap-2 sm:grid-cols-3"><div className="rounded border p-3"><div className="text-xs text-muted-foreground">Chờ duyệt</div><div className="text-lg font-semibold">{fmtMoney(earnings.pending_total)}</div></div><div className="rounded border p-3"><div className="text-xs text-muted-foreground">Đã duyệt</div><div className="text-lg font-semibold">{fmtMoney(earnings.approved_total)}</div></div><div className="rounded border p-3"><div className="text-xs text-muted-foreground">Đã khóa kỳ</div><div className="text-lg font-semibold">{fmtMoney(earnings.locked_total)}</div></div></div>
            {!!earnings.rows.length && <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Ngày</TableHead><TableHead>Mã công</TableHead><TableHead className="text-right">SL đạt</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thành tiền</TableHead><TableHead>Lý do</TableHead></TableRow></TableHeader><TableBody>{earnings.rows.map(row=>{const status=String(row.approved_status||row.status||'SUBMITTED');const label=status==='LOCKED'?'Đã khóa':status==='APPROVED'?'Đã duyệt':'Chờ duyệt';const amount=row.approved_amount??row.pending_amount;return <TableRow key={row.id}><TableCell>{row.work_date}</TableCell><TableCell className="font-medium">{row.piece_rate_code||'—'}</TableCell><TableCell className="text-right">{Number(row.quantity_good||0).toLocaleString('vi-VN')}</TableCell><TableCell><Badge variant={status==='LOCKED'||status==='APPROVED'?'default':'secondary'}>{label}</Badge></TableCell><TableCell className="text-right">{fmtMoney(amount)}</TableCell><TableCell className="max-w-64 whitespace-normal text-xs text-muted-foreground">{row.unavailable_reason||row.eligibility_warning||'—'}</TableCell></TableRow>;})}</TableBody></Table></div>}
          </>}
        </CardContent>
      </Card>

      {/* Tổng kết tháng */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                {fmtMoney(summary.approvedAmount + summary.submittedAmount)}
              </div>
              <div className="text-sm text-muted-foreground">
                Tạm tính{" "}
                {summary.submittedAmount > 0 ? "(gồm phiếu chờ duyệt)" : ""}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tăng ca tự ghi */}
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
              <Label>Ngày tăng ca</Label>
              <Input
                type="date"
                value={overtimeDate}
                max={todayKey()}
                onChange={(e) => setOvertimeDate(e.target.value)}
                required
              />
            </div>
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
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
                className="w-full sm:w-40"
          />
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
    </div>
  );
}
