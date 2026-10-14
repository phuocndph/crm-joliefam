import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Filter,
  Info,
  Loader2,
  PackageCheck,
  PackageSearch,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { isLocalBackend } from "@/lib/runtime-config";
import {
  listProductionEntriesMonth,
  listProductionEntryProducts,
  recordProductionEntry,
  reverseProductionEntry,
  setProductionEntryStatus,
} from "@/lib/production-execution";
import type {
  ProductionEntryProduct,
  ProductionEntryRow,
  ProductionWorker,
} from "@/integrations/supabase/production-execution-types";

type Props = {
  month: string;
  onMonthChange: (month: string) => void;
  workers: ProductionWorker[];
  canRecord: boolean;
  canApprove: boolean;
  canReverse: boolean;
};

const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
const statusLabels: Record<string, string> = {
  SUBMITTED: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  REVERSED: "Đã đảo",
};
const mappingLabels: Record<string, string> = {
  EXCEL_CODE: "Sẵn sàng",
  UNIQUE_SKU: "Sẵn sàng",
  AMBIGUOUS_SKU: "SKU trùng",
  MISSING_SKU: "Thiếu SKU",
};

function localDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateForMonth(month: string) {
  const current = localDateKey();
  return current.startsWith(month) ? current : `${month}-01`;
}

function maxDateForMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthEnd = new Date(year, monthNumber, 0);
  const lastDate = `${year}-${String(monthNumber).padStart(2, "0")}-${String(monthEnd.getDate()).padStart(2, "0")}`;
  return month === localDateKey().slice(0, 7) ? localDateKey() : lastDate;
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as { code?: string; message?: string };
    const message = value.message ?? "";
    if (
      value.code === "42883" ||
      value.code === "PGRST202" ||
      message.includes("production_entry")
    ) {
      return "Cơ sở dữ liệu chưa được cập nhật chức năng sản lượng theo sản phẩm. Hãy hoàn tất bản cập nhật giai đoạn 2 rồi tải lại.";
    }
    if (message) return message;
  }
  if (error instanceof Error) return error.message;
  return "Không thể hoàn tất thao tác sản lượng.";
}

function statusBadge(status: string, compact = false) {
  const className =
    status === "APPROVED"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "REJECTED" || status === "REVERSED"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <Badge
      variant="outline"
      className={`${className} ${compact ? "px-1.5 py-0 text-[11px]" : ""}`}
    >
      {statusLabels[status] ?? status}
    </Badge>
  );
}

function unitLabel(unit: string | null | undefined) {
  return unit === "SET" ? "bộ" : "SP";
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `Tháng ${Number(monthNumber)}/${year}`;
}

export default function ProductionOutputPanel({
  month,
  onMonthChange,
  workers,
  canRecord,
  canApprove,
  canReverse,
}: Props) {
  const { toast } = useToast();
  const localMode = isLocalBackend();
  const [rows, setRows] = useState<ProductionEntryRow[]>([]);
  const [products, setProducts] = useState<ProductionEntryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [workerFilter, setWorkerFilter] = useState("ALL");
  const [productFilter, setProductFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [entrySearch, setEntrySearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [entryOpen, setEntryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    workerId: "",
    productId: "",
    workDate: dateForMonth(month),
    quantity: "1",
    notes: "",
    idempotencyKey: crypto.randomUUID(),
  });
  const [reviewRow, setReviewRow] = useState<ProductionEntryRow | null>(null);
  const [reviewTarget, setReviewTarget] = useState<
    "APPROVED" | "REJECTED" | null
  >(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reversalRow, setReversalRow] = useState<ProductionEntryRow | null>(
    null,
  );
  const [reversalReason, setReversalReason] = useState("");

  const activeWorkers = useMemo(
    () =>
      workers
        .filter((worker) => worker.is_active)
        .sort((a, b) => a.display_name.localeCompare(b.display_name, "vi")),
    [workers],
  );
  const filteredRows = useMemo(() => {
    const query = entrySearch.trim().toLocaleLowerCase("vi");
    return rows.filter((row) => {
      const searchable =
        `${row.worker_name} ${row.employee_code} ${row.product_name} ${row.product_sku} ${row.notes ?? ""}`.toLocaleLowerCase(
          "vi",
        );
      return (
        (workerFilter === "ALL" || row.worker_id === workerFilter) &&
        (productFilter === "ALL" ||
          row.rate_id === productFilter ||
          row.product_id === productFilter) &&
        (statusFilter === "ALL" || row.workflow_status === statusFilter) &&
        (!query || searchable.includes(query))
      );
    });
  }, [entrySearch, productFilter, rows, statusFilter, workerFilter]);
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase("vi");
    return products.filter(
      (product) =>
        !query ||
        `${product.piece_rate_code ?? ""} ${product.sku ?? ""} ${product.name}`
          .toLocaleLowerCase("vi")
          .includes(query),
    );
  }, [productSearch, products]);
  const selectedProduct =
    products.find((product) => product.id === form.productId) ?? null;
  const counts = useMemo(
    () => ({
      all: filteredRows.length,
      submitted: filteredRows.filter(
        (row) => row.workflow_status === "SUBMITTED",
      ).length,
      approved: filteredRows.filter((row) => row.workflow_status === "APPROVED")
        .length,
      rejected: filteredRows.filter((row) => row.workflow_status === "REJECTED")
        .length,
    }),
    [filteredRows],
  );
  const approvedRows = filteredRows.filter(
    (row) => row.workflow_status === "APPROVED",
  );
  const visibleAmount =
    approvedRows.length > 0 && approvedRows.every((row) => row.cost_visible)
      ? approvedRows.reduce((sum, row) => sum + (row.calculated_amount ?? 0), 0)
      : approvedRows.length === 0
        ? 0
        : null;
  const totalQuantity = filteredRows
    .filter(
      (row) =>
        row.workflow_status !== "REJECTED" &&
        row.workflow_status !== "REVERSED",
    )
    .reduce((sum, row) => sum + row.quantity, 0);
  const unavailableProducts = products.filter(
    (product) => !product.rate_available,
  ).length;
  const quantityValue = Number(form.quantity);
  const dateValid =
    form.workDate.startsWith(`${month}-`) &&
    form.workDate <= maxDateForMonth(month);
  const entryValid =
    dateValid &&
    Boolean(form.workerId) &&
    Boolean(form.productId) &&
    Boolean(selectedProduct) &&
    selectedProduct?.rate_available &&
    Number.isFinite(quantityValue) &&
    quantityValue > 0;

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await listProductionEntriesMonth(`${month}-01`, true));
    } catch (error) {
      setRows([]);
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [month]);

  const loadProducts = useCallback(async (workDate: string) => {
    setProductsLoading(true);
    setProductError(null);
    try {
      setProducts(await listProductionEntryProducts(workDate));
    } catch (error) {
      setProducts([]);
      setProductError(errorMessage(error));
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);
  useEffect(() => {
    void loadProducts(form.workDate);
  }, [form.workDate, loadProducts]);
  useEffect(() => {
    const nextDate = dateForMonth(month);
    setForm((current) => ({
      ...current,
      workDate: current.workDate.startsWith(month)
        ? current.workDate
        : nextDate,
      productId: "",
    }));
  }, [month]);

  function openEntry() {
    const workerId =
      workerFilter !== "ALL" ? workerFilter : (activeWorkers[0]?.id ?? "");
    const workDate = dateForMonth(month);
    setForm({
      workerId,
      productId: "",
      workDate,
      quantity: "1",
      notes: "",
      idempotencyKey: crypto.randomUUID(),
    });
    setProductSearch("");
    setEntryOpen(true);
    void loadProducts(workDate);
  }

  function clearFilters() {
    setWorkerFilter("ALL");
    setProductFilter("ALL");
    setStatusFilter("ALL");
    setEntrySearch("");
  }

  async function submitEntry() {
    if (!entryValid || !selectedProduct) return;
    setBusy(true);
    try {
      await recordProductionEntry({
        worker_id: form.workerId,
        rate_id: selectedProduct.id,
        product_id: selectedProduct.product_id ?? null,
        piece_rate_code: selectedProduct.piece_rate_code ?? null,
        work_date: form.workDate,
        quantity: quantityValue,
        idempotency_key: form.idempotencyKey,
        notes: form.notes.trim() || null,
      });
      setEntryOpen(false);
      await loadEntries();
      toast({
        title: "Đã gửi sản lượng",
        description: "Bản ghi đang chờ duyệt.",
      });
    } catch (error) {
      toast({
        title: "Không thể ghi sản lượng",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitReview() {
    if (
      !reviewRow ||
      !reviewTarget ||
      (reviewTarget === "REJECTED" && !reviewReason.trim())
    )
      return;
    setBusy(true);
    try {
      await setProductionEntryStatus({
        production_entry_id: reviewRow.id,
        target_status: reviewTarget,
        reason: reviewReason.trim() || null,
        idempotency_key: crypto.randomUUID(),
      });
      setReviewRow(null);
      setReviewTarget(null);
      setReviewReason("");
      await loadEntries();
      toast({
        title:
          reviewTarget === "APPROVED"
            ? "Đã duyệt sản lượng"
            : "Đã từ chối sản lượng",
      });
    } catch (error) {
      toast({
        title: "Không thể cập nhật sản lượng",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitReversal() {
    if (!reversalRow || !reversalReason.trim()) return;
    setBusy(true);
    try {
      await reverseProductionEntry(
        reversalRow.id,
        reversalReason.trim(),
        crypto.randomUUID(),
      );
      setReversalRow(null);
      setReversalReason("");
      await loadEntries();
      toast({ title: "Đã đảo bản ghi sản lượng" });
    } catch (error) {
      toast({
        title: "Không thể đảo sản lượng",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Sản lượng theo sản phẩm
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                Ghi đúng sản phẩm, đúng người, đúng ngày
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Chọn mã công Excel có đơn giá đã duyệt. Bản ghi sẽ chuyển sang
                hàng chờ để quản lý kiểm tra.
              </p>
            </div>
          </div>
          {canRecord && (
            <Button
              onClick={openEntry}
              disabled={productsLoading || !activeWorkers.length}
              className="w-full shrink-0 bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
            >
              <Plus className="mr-2 h-4 w-4" />
              Ghi sản lượng
            </Button>
          )}
        </div>
        <div className="mt-5 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
          {[
            { step: "01", label: "Chọn ngày & nhân sự", icon: CalendarDays },
            { step: "02", label: "Chọn mã công Excel", icon: PackageCheck },
            { step: "03", label: "Gửi duyệt", icon: ClipboardCheck },
          ].map(({ step, label, icon: Icon }, index) => (
            <div
              key={step}
              className="flex items-center gap-2 rounded-lg border border-white/80 bg-white/70 px-3 py-2"
            >
              <span className="font-mono text-[11px] font-semibold text-emerald-700">
                {step}
              </span>
              <Icon className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-medium">{label}</span>
              {index < 2 && (
                <ChevronRight className="ml-auto hidden h-3.5 w-3.5 text-slate-300 sm:block" />
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className="border-slate-200 bg-white shadow-none">
          <CardContent className="p-3.5">
            <div className="text-xs text-muted-foreground">Kỳ xem</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {monthLabel(month)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-none">
          <CardContent className="p-3.5">
            <div className="text-xs text-muted-foreground">Tổng lượt</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {number.format(counts.all)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/60 shadow-none">
          <CardContent className="p-3.5">
            <div className="text-xs text-amber-800">Chờ duyệt</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-amber-900">
              {number.format(counts.submitted)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/60 shadow-none">
          <CardContent className="p-3.5">
            <div className="text-xs text-emerald-800">Đã duyệt</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-900">
              {number.format(counts.approved)}
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 border-slate-200 bg-white shadow-none lg:col-span-1">
          <CardContent className="p-3.5">
            <div className="text-xs text-muted-foreground">
              Sản lượng hợp lệ
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {number.format(totalQuantity)}{" "}
              <span className="text-sm font-medium text-muted-foreground">
                SP
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {(loadError || productError) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Chưa thể tải dữ liệu sản lượng</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{loadError || productError}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void loadEntries();
                void loadProducts(dateForMonth(month));
              }}
            >
              Thử tải lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!loadError && products.length > 0 && unavailableProducts > 0 && (
        <Alert className="border-amber-200 bg-amber-50/70 text-amber-950">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{unavailableProducts} mã chưa sẵn sàng</AlertTitle>
          <AlertDescription>
            Mã công may chưa có đơn giá hiệu lực sẽ vẫn hiển thị để rà soát
            nhưng không thể gửi duyệt.
          </AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="gap-4 border-b bg-slate-50/70 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal className="h-4 w-4 text-emerald-600" />
                Bộ lọc & tra cứu
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Lọc nhanh bản ghi trong {monthLabel(month).toLowerCase()}.
              </p>
            </div>
            {(workerFilter !== "ALL" ||
              productFilter !== "ALL" ||
              statusFilter !== "ALL" ||
              entrySearch) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={clearFilters}
                className="w-fit text-muted-foreground"
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Xóa bộ lọc
              </Button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative md:col-span-2 xl:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={entrySearch}
                onChange={(event) => setEntrySearch(event.target.value)}
                placeholder="Tìm người, SKU, sản phẩm..."
                className="h-9 pl-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tháng</Label>
              <Input
                type="month"
                max={localDateKey().slice(0, 7)}
                value={month}
                onChange={(event) =>
                  event.target.value && onMonthChange(event.target.value)
                }
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nhân sự</Label>
              <Select value={workerFilter} onValueChange={setWorkerFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tất cả nhân sự" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả nhân sự</SelectItem>
                  {activeWorkers.map((worker) => (
                    <SelectItem key={worker.id} value={worker.id}>
                      {worker.employee_code} · {worker.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sản phẩm</Label>
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tất cả sản phẩm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả sản phẩm</SelectItem>
                  {products
                    .filter((product) => product.rate_available)
                    .map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.sku} · {product.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="mr-1 inline-flex items-center gap-1.5 text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              Trạng thái:
            </span>
            {[
              { value: "ALL", label: "Tất cả", count: counts.all },
              {
                value: "SUBMITTED",
                label: "Chờ duyệt",
                count: counts.submitted,
              },
              { value: "APPROVED", label: "Đã duyệt", count: counts.approved },
              { value: "REJECTED", label: "Từ chối", count: counts.rejected },
            ].map((item) => (
              <Button
                key={item.value}
                size="sm"
                variant={statusFilter === item.value ? "secondary" : "ghost"}
                onClick={() => setStatusFilter(item.value)}
                className="h-7 rounded-full px-2.5 text-xs"
              >
                <span>{item.label}</span>
                <span className="ml-1 rounded-full bg-background px-1.5 py-0.5 tabular-nums">
                  {item.count}
                </span>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-xs text-muted-foreground sm:px-5">
            <span>
              {loading
                ? "Đang tải dữ liệu..."
                : `${number.format(filteredRows.length)} bản ghi phù hợp`}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CircleDollarSign className="h-3.5 w-3.5" />
              {visibleAmount === null
                ? "Chi phí ẩn theo quyền"
                : `Chi phí đã duyệt: ${money.format(visibleAmount)}`}
            </span>
          </div>
          {loading && (
            <div className="flex h-44 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            </div>
          )}
          {!loading && filteredRows.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <PackageSearch className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">
                Chưa có bản ghi phù hợp
              </h3>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Thử đổi bộ lọc hoặc ghi sản lượng mới cho nhân sự trong kỳ này.
              </p>
              {canRecord && (
                <Button
                  size="sm"
                  className="mt-4 bg-emerald-600 hover:bg-emerald-700"
                  onClick={openEntry}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Ghi sản lượng
                </Button>
              )}
            </div>
          )}
          <div className="divide-y sm:hidden">
            {!loading &&
              filteredRows.map((row) => (
                <div key={row.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">
                        {row.product_name}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {row.product_sku || "Chưa có SKU"} ·{" "}
                        {formatDate(row.work_date)}
                      </div>
                    </div>
                    {statusBadge(row.workflow_status)}
                  </div>
                  <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-800">
                          {row.worker_name}
                        </div>
                        <div className="text-muted-foreground">
                          {row.employee_code}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-muted-foreground">Số lượng</div>
                      <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">
                        {number.format(row.quantity)}{" "}
                        <span className="text-xs font-medium">
                          {unitLabel(row.rate_unit)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <div className="text-muted-foreground">
                      {row.cost_visible && row.rate_amount !== null
                        ? `${money.format(row.rate_amount)} / ${unitLabel(row.rate_unit)}`
                        : "Đơn giá ẩn"}
                      {row.workflow_reason && (
                        <div className="mt-1 max-w-[220px] text-red-700">
                          {row.workflow_reason}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {canApprove && row.workflow_status === "SUBMITTED" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReviewRow(row);
                              setReviewTarget("APPROVED");
                            }}
                            className="h-8 px-2.5"
                          >
                            <Check className="mr-1 h-3.5 w-3.5" />
                            Duyệt
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReviewRow(row);
                              setReviewTarget("REJECTED");
                            }}
                            className="h-8 px-2.5 text-red-700"
                          >
                            <X className="mr-1 h-3.5 w-3.5" />
                            Từ chối
                          </Button>
                        </>
                      )}
                      {canReverse && row.workflow_status === "APPROVED" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setReversalRow(row)}
                          className="h-8 px-2.5 text-muted-foreground"
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" />
                          Đảo
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow className="bg-slate-50/70">
                  <TableHead>Ngày</TableHead>
                  <TableHead>Nhân sự</TableHead>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead className="text-right">SL</TableHead>
                  <TableHead>Đơn giá</TableHead>
                  <TableHead>Thành tiền</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Ghi chú</TableHead>
                  <TableHead className="w-36 text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!loading &&
                  filteredRows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-slate-50/70">
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(row.work_date)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.worker_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.employee_code}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div
                          className="max-w-52 truncate font-medium"
                          title={row.product_name}
                        >
                          {row.product_name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.product_sku || "Chưa có SKU"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {number.format(row.quantity)}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          {unitLabel(row.rate_unit)}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {row.cost_visible && row.rate_amount !== null
                          ? `${money.format(row.rate_amount)} / ${unitLabel(row.rate_unit)}`
                          : "Ẩn"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm font-medium">
                        {row.cost_visible && row.calculated_amount !== null
                          ? money.format(row.calculated_amount)
                          : "Ẩn"}
                      </TableCell>
                      <TableCell>
                        {statusBadge(row.workflow_status, true)}
                        {row.workflow_reason && (
                          <div
                            className="mt-1 max-w-36 text-xs text-muted-foreground"
                            title={row.workflow_reason}
                          >
                            {row.workflow_reason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell
                        className="max-w-40 truncate text-sm text-muted-foreground"
                        title={row.notes ?? ""}
                      >
                        {row.notes || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canApprove &&
                            row.workflow_status === "SUBMITTED" && (
                              <>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  aria-label="Duyệt sản lượng"
                                  title="Duyệt sản lượng"
                                  onClick={() => {
                                    setReviewRow(row);
                                    setReviewTarget("APPROVED");
                                  }}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  aria-label="Từ chối sản lượng"
                                  title="Từ chối sản lượng"
                                  onClick={() => {
                                    setReviewRow(row);
                                    setReviewTarget("REJECTED");
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          {canReverse && row.workflow_status === "APPROVED" && (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Đảo sản lượng"
                              title="Đảo sản lượng"
                              onClick={() => setReversalRow(row)}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2.5 text-xs text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <span className="font-semibold">Lưu ý:</span> sản lượng chỉ được tính
          vào chi phí sau khi duyệt. Bản ghi bị từ chối hoặc đã đảo vẫn được giữ
          trong lịch sử để đối soát.
        </p>
      </div>

      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-2xl overflow-y-auto p-0">
          <DialogHeader className="border-b bg-slate-50/80 p-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <PackageCheck className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Ghi sản lượng theo sản phẩm</DialogTitle>
                <DialogDescription className="mt-1">
                  Điền 4 thông tin tối thiểu. Hệ thống tự áp dụng đơn giá đã
                  duyệt khi gửi.
                </DialogDescription>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
              <div className="rounded-lg bg-emerald-100/80 px-2 py-1.5 font-medium text-emerald-800">
                1. Người làm
              </div>
              <div className="rounded-lg bg-emerald-100/80 px-2 py-1.5 font-medium text-emerald-800">
                2. Sản phẩm
              </div>
              <div className="rounded-lg bg-emerald-100/80 px-2 py-1.5 font-medium text-emerald-800">
                3. Số lượng
              </div>
            </div>
          </DialogHeader>
          <div className="grid gap-5 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="production-output-worker">
                  Nhân sự <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={form.workerId}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, workerId: value }))
                  }
                >
                  <SelectTrigger id="production-output-worker">
                    <SelectValue placeholder="Chọn nhân sự" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeWorkers.map((worker) => (
                      <SelectItem key={worker.id} value={worker.id}>
                        {worker.employee_code} · {worker.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="production-output-date">
                  Ngày làm <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="production-output-date"
                  type="date"
                  min={`${month}-01`}
                  max={maxDateForMonth(month)}
                  value={form.workDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      workDate: event.target.value,
                      productId: "",
                    }))
                  }
                />
                {!dateValid && (
                  <p className="text-xs text-red-600">
                    Ngày phải nằm trong {monthLabel(month).toLowerCase()} và
                    không ở tương lai.
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="production-output-search">
                Tìm mã công may <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="production-output-search"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Nhập mã Excel, SKU CRM hoặc tên sản phẩm"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>
                Mã công Excel <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.productId}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, productId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      productsLoading
                        ? "Đang tải mã công may..."
                        : filteredProducts.length
                          ? "Chọn mã công may"
                          : "Không tìm thấy mã"
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
                      <div className="flex max-w-[480px] items-center justify-between gap-3">
                        <span className="truncate">
                          {(localMode ? product.piece_rate_code : product.piece_rate_code || product.sku) ||
                            (localMode ? "Chưa có mã công may Excel" : "Chưa có mã")}{" "}
                          · {product.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {product.rate_available ? "Sẵn sàng" : "Chưa có giá"}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedProduct ? (
                <div
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${(localMode ? selectedProduct.mapping_status === "EXCEL_CODE" : ["EXCEL_CODE", "UNIQUE_SKU"].includes(selectedProduct.mapping_status)) && selectedProduct.rate_available ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {(localMode ? selectedProduct.piece_rate_code : selectedProduct.piece_rate_code || selectedProduct.sku) ||
                        (localMode ? "Chưa có mã công may Excel" : "Chưa có mã")}{" "}
                      · {selectedProduct.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedProduct.sku &&
                      selectedProduct.piece_rate_code &&
                      selectedProduct.sku !== selectedProduct.piece_rate_code
                        ? "SKU CRM: " + selectedProduct.sku
                        : localMode
                          ? "Mã công may Excel là mã tính công"
                          : "Mã sản phẩm là căn cứ tính công"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {selectedProduct.rate_available ? (
                      <>
                        <div className="flex items-center justify-end gap-1 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Sẵn sàng
                        </div>
                        {selectedProduct.rate !== null && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {money.format(selectedProduct.rate)} /{" "}
                            {unitLabel(selectedProduct.rate_unit)}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-1 text-xs font-medium text-amber-800">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {(localMode ? selectedProduct.mapping_status !== "EXCEL_CODE" : !["EXCEL_CODE", "UNIQUE_SKU"].includes(selectedProduct.mapping_status))
                          ? mappingLabels[selectedProduct.mapping_status]
                          : "Chưa có đơn giá"}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Chỉ chọn sản phẩm có nhãn{" "}
                  <span className="font-medium text-emerald-700">Sẵn sàng</span>
                  .
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="production-output-quantity">
                Số lượng đạt <span className="text-red-500">*</span>
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="production-output-quantity"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.quantity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                  className="h-11 text-lg font-semibold tabular-nums sm:max-w-52"
                />
                <div className="flex flex-wrap gap-1.5">
                  {[1, 10, 50, 100].map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          quantity: String(value),
                        }))
                      }
                      className="h-9"
                    >
                      {value}
                    </Button>
                  ))}
                </div>
              </div>
              {form.quantity &&
                (!Number.isFinite(quantityValue) || quantityValue <= 0) && (
                  <p className="text-xs text-red-600">
                    Nhập số lượng lớn hơn 0.
                  </p>
                )}
              {selectedProduct && (
                <p className="text-xs text-muted-foreground">
                  Đơn vị ghi nhận:{" "}
                  <span className="font-medium">
                    {unitLabel(selectedProduct.rate_unit)}
                  </span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="production-output-notes">
                Ghi chú{" "}
                <span className="font-normal text-muted-foreground">
                  (tùy chọn)
                </span>
              </Label>
              <Textarea
                id="production-output-notes"
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="VD: Ca sáng, mã lô, ghi chú chất lượng..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 gap-2 border-t bg-white p-4 sm:static sm:p-5">
            <Button
              variant="outline"
              onClick={() => setEntryOpen(false)}
              disabled={busy}
            >
              Hủy
            </Button>
            <Button
              onClick={() => void submitEntry()}
              disabled={busy || productsLoading || !entryValid}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ClipboardCheck className="mr-2 h-4 w-4" />
              )}
              Gửi duyệt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reviewRow && reviewTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setReviewRow(null);
            setReviewTarget(null);
            setReviewReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewTarget === "APPROVED"
                ? "Duyệt sản lượng"
                : "Từ chối sản lượng"}
            </DialogTitle>
            <DialogDescription>
              Kiểm tra lại bản ghi trước khi cập nhật trạng thái.
            </DialogDescription>
          </DialogHeader>
          {reviewRow && (
            <div className="rounded-lg border bg-slate-50 p-3 text-sm">
              <div className="font-semibold text-slate-900">
                {reviewRow.product_name}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {reviewRow.worker_name} · {formatDate(reviewRow.work_date)}
              </div>
              <div className="mt-3 flex items-end justify-between">
                <span className="text-xs text-muted-foreground">Số lượng</span>
                <span className="text-xl font-semibold tabular-nums">
                  {number.format(reviewRow.quantity)}{" "}
                  <span className="text-sm font-medium">
                    {unitLabel(reviewRow.rate_unit)}
                  </span>
                </span>
              </div>
            </div>
          )}
          {reviewTarget === "REJECTED" && (
            <div className="space-y-2">
              <Label htmlFor="production-output-reject-reason">
                Lý do từ chối <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="production-output-reject-reason"
                autoFocus
                value={reviewReason}
                onChange={(event) => setReviewReason(event.target.value)}
                placeholder="Nêu rõ dữ liệu cần sửa để người ghi nhập lại."
                rows={3}
              />
            </div>
          )}
          {reviewTarget === "APPROVED" && (
            <div className="space-y-2">
              <Label htmlFor="production-output-approve-note">
                Ghi chú duyệt{" "}
                <span className="font-normal text-muted-foreground">
                  (tùy chọn)
                </span>
              </Label>
              <Textarea
                id="production-output-approve-note"
                value={reviewReason}
                onChange={(event) => setReviewReason(event.target.value)}
                rows={2}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewRow(null)}
              disabled={busy}
            >
              Hủy
            </Button>
            <Button
              onClick={() => void submitReview()}
              disabled={
                busy || (reviewTarget === "REJECTED" && !reviewReason.trim())
              }
              variant={reviewTarget === "REJECTED" ? "destructive" : "default"}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {reviewTarget === "APPROVED"
                ? "Duyệt bản ghi"
                : "Từ chối bản ghi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reversalRow)}
        onOpenChange={(open) => {
          if (!open) {
            setReversalRow(null);
            setReversalReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Đảo bản ghi sản lượng</DialogTitle>
            <DialogDescription>
              Dữ liệu gốc được giữ nguyên và đánh dấu đã đảo để bảo toàn lịch
              sử.
            </DialogDescription>
          </DialogHeader>
          {reversalRow && (
            <div className="rounded-lg border border-red-200 bg-red-50/70 p-3 text-sm">
              <div className="font-semibold text-red-900">
                {reversalRow.product_name}
              </div>
              <div className="mt-1 text-xs text-red-800/80">
                {reversalRow.worker_name} · {formatDate(reversalRow.work_date)}{" "}
                · {number.format(reversalRow.quantity)}{" "}
                {unitLabel(reversalRow.rate_unit)}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="production-output-reversal-reason">
              Lý do bắt buộc <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="production-output-reversal-reason"
              autoFocus
              value={reversalReason}
              onChange={(event) => setReversalReason(event.target.value)}
              placeholder="VD: Chọn nhầm nhân sự hoặc sản phẩm"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReversalRow(null)}
              disabled={busy}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitReversal()}
              disabled={busy || !reversalReason.trim()}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Xác nhận đảo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
