import { getLocalUserSession } from "@/lib/local-auth";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  localApi,
  LocalApiError,
  type LocalProfileRequest,
} from "@/lib/local-api";
import {
  StatusFilterStrip,
  WorkspaceCommandBar,
} from "@/components/workspace/WorkspaceShell";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  FileCheck2,
  IdCard,
  Loader2,
  MapPin,
  PhoneCall,
  RefreshCw,
  Search,
  UserCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ProfileRequest = LocalProfileRequest & { reviewed_at?: string | null; review_note?: string | null };
type ProfileStatusFilter = "SUBMITTED" | "NEEDS_INFO" | "APPROVED";
type WorkerOption = {
  id: string;
  employee_code: string;
  display_name: string;
  worker_type?: string;
  is_active?: boolean;
  user_id?: string | null;
};

const labels: Record<string, string> = {
  first_name: "Tên",
  last_name: "Họ và tên đệm",
  phone: "Số điện thoại",
  date_of_birth: "Ngày sinh",
  gender: "Giới tính",
  nationality: "Quốc tịch",
  identity_number: "Số căn cước",
  identity_issued_date: "Ngày cấp căn cước",
  identity_issued_place: "Nơi cấp căn cước",
  permanent_address: "Địa chỉ thường trú",
  current_address: "Địa chỉ hiện tại",
  emergency_contact_name: "Người liên hệ khẩn cấp",
  emergency_contact_relationship: "Quan hệ",
  emergency_contact_phone: "Số điện thoại khẩn cấp",
  tax_code: "Mã số thuế",
  social_insurance_number: "Mã số BHXH",
  notes: "Ghi chú",
  bank_account_name: "Tên chủ tài khoản",
  bank_name: "Ngân hàng",
  bank_account_number: "Số tài khoản",
  bank_code: "Mã ngân hàng",
};

const fieldGroups = [
  {
    id: "identity",
    title: "Định danh & Căn cước",
    icon: IdCard,
    keys: [
      "last_name",
      "first_name",
      "date_of_birth",
      "gender",
      "nationality",
      "identity_number",
      "identity_issued_date",
      "identity_issued_place",
    ],
  },
  {
    id: "banking",
    title: "Ngân hàng nhận lương & Thuế / BHXH",
    icon: CreditCard,
    keys: [
      "bank_name",
      "bank_code",
      "bank_account_number",
      "bank_account_name",
      "tax_code",
      "social_insurance_number",
    ],
  },
  {
    id: "contact",
    title: "Liên hệ & Địa chỉ cư trú",
    icon: MapPin,
    keys: ["phone", "current_address", "permanent_address"],
  },
  {
    id: "emergency",
    title: "Liên hệ khẩn cấp & Ghi chú",
    icon: PhoneCall,
    keys: [
      "emergency_contact_name",
      "emergency_contact_relationship",
      "emergency_contact_phone",
      "notes",
    ],
  },
] as const;

const statusMeta: Record<
  ProfileStatusFilter,
  { label: string; badgeVariant: "default" | "secondary" | "outline" }
> = {
  SUBMITTED: { label: "Chờ xác nhận", badgeVariant: "default" },
  NEEDS_INFO: { label: "Cần bổ sung", badgeVariant: "secondary" },
  APPROVED: { label: "Đã duyệt", badgeVariant: "outline" },
};

const displayName = (item: ProfileRequest) =>
  [item.last_name, item.first_name].filter(Boolean).join(" ").trim() ||
  "Chưa cập nhật";

export default function ProfileReviewPanel() {
  const { toast } = useToast();
  const [salaryWorker, setSalaryWorker] = useState<string | null>(null);
  const [canSetupSalary, setCanSetupSalary] = useState(false);

  useEffect(() => {
    let active = true;
    void localApi
      .payrollCapabilities()
      .then(
        (rows) =>
          active &&
          setCanSetupSalary(
            [
              "payroll_worker_manage",
              "payroll_policy_manage",
              "payroll_rate_manage",
            ].every((permission) =>
              rows.some(
                (row) => row.permission_type === permission && row.allowed,
              ),
            ),
          ),
      )
      .catch(() => {
        if (active) setCanSetupSalary(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const [statusFilter, setStatusFilter] =
    useState<ProfileStatusFilter>("SUBMITTED");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ProfileRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<ProfileRequest | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const [workerRetry, setWorkerRetry] = useState(0);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreListFocus = useRef(false);
  const selectedVersion = useRef("");

  const lifecycle = useRef({ mounted: false, generation: 0 });
  const loadRequest = useRef(0);
  const reviewInFlight = useRef(false);

  useEffect(() => {
    const state = lifecycle.current;
    const requests = loadRequest;
    state.mounted = true;
    state.generation++;
    return () => {
      state.mounted = false;
      state.generation++;
      requests.current++;
      reviewInFlight.current = false;
    };
  }, []);

  const findSuggestedWorkerId = useCallback(
    (item: ProfileRequest | null, pool: WorkerOption[]) => {
      if (!item) return "";
      const linked = pool.filter(
        (w) => w.is_active !== false && w.user_id === item.user_id,
      );
      if (linked.length === 1) return linked[0].id;
      const targetName = displayName(item).toLowerCase();
      if (targetName && targetName !== "chưa cập nhật") {
        const matched = pool.filter(
          (w) =>
            w.is_active !== false &&
            !w.user_id &&
            w.display_name.trim().toLowerCase() === targetName,
        );
        if (matched.length === 1) return matched[0].id;
      }
      return "";
    },
    [],
  );

  const selectRequest = useCallback(
    (item: ProfileRequest | null, pool: WorkerOption[] = workers) => {
      if (reviewInFlight.current) return;
      if (item) restoreListFocus.current = false;
      setSelected(item);
      setNote("");
      setSelectedWorkerId(findSuggestedWorkerId(item, pool));
      setMobileDetailOpen(Boolean(item));
    },
    [findSuggestedWorkerId, workers],
  );

  const load = useCallback(
    async (refresh = false, targetStatus: ProfileStatusFilter = statusFilter, afterReview = false, autoSelect = true) => {
      if (!lifecycle.current.mounted || (reviewInFlight.current && !afterReview)) return;
      const request = ++loadRequest.current;
      const session = getLocalUserSession()?.token;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        const rows = await localApi.profileRequests(targetStatus);
        if (
          !lifecycle.current.mounted ||
          request !== loadRequest.current ||
          session !== getLocalUserSession()?.token
        )
          return;
        setItems(rows);
        setLoadError(null);
        setSelected((current) => {
          if (!autoSelect) return null;
          if (!current) return rows[0] ?? null;
          const updated = rows.find((r) => r.user_id === current.user_id);
          return updated ?? (rows[0] ?? null);
        });
      } catch (error) {
        if (
          lifecycle.current.mounted &&
          request === loadRequest.current &&
          session === getLocalUserSession()?.token
        ) {
          setLoadError(
            error instanceof Error ? error.message : "Vui lòng thử lại.",
          );
        }
      } finally {
        if (
          lifecycle.current.mounted &&
          request === loadRequest.current &&
          session === getLocalUserSession()?.token
        ) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    void load(false, statusFilter);
  }, [load, statusFilter]);

  useEffect(() => {
    let active = true;
    const session = getLocalUserSession()?.token;
    setWorkersLoading(true);
    setWorkerError(null);
    void localApi
      .workers()
      .then((rows) => {
        if (active && session === getLocalUserSession()?.token) {
          const workerRows = rows as WorkerOption[];
          setWorkers(workerRows);
          setWorkerError(null);
        }
      })
      .catch((error) => {
        if (active && session === getLocalUserSession()?.token) {
          setWorkerError(
            error instanceof Error ? error.message : "Vui lòng thử lại.",
          );
        }
      }).finally(() => {
        if (active && session === getLocalUserSession()?.token) setWorkersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workerRetry]);

  // Refresh may replace a request without a manual click. A different revision
  // must never inherit another review's worker choice or feedback.
  useEffect(() => {
    const version = selected ? `${selected.user_id}:${selected.revision}:${selected.status}` : "";
    if (selectedVersion.current === version) return;
    selectedVersion.current = version;
    setNote("");
    setSelectedWorkerId(findSuggestedWorkerId(selected, workers));
  }, [selected, findSuggestedWorkerId, workers]);

  useEffect(() => {
    if (!mobileDetailOpen || !selected || window.matchMedia("(min-width: 1024px)").matches) return;
    detailRef.current?.scrollIntoView({ block: "start" });
    detailRef.current?.focus({ preventScroll: true });
  }, [mobileDetailOpen, selected]);

  useEffect(() => {
    if (mobileDetailOpen || selected || !restoreListFocus.current) return;
    restoreListFocus.current = false;
    if (!lifecycle.current.mounted || reviewInFlight.current || window.matchMedia("(min-width: 1024px)").matches) return;
    listRef.current?.scrollIntoView({ block: "start" });
    listRef.current?.focus({ preventScroll: true });
  }, [mobileDetailOpen, selected]);

  useEffect(() => {
    if (selected && !selectedWorkerId && workers.length > 0) {
      const suggested = findSuggestedWorkerId(selected, workers);
      if (suggested) setSelectedWorkerId(suggested);
    }
  }, [findSuggestedWorkerId, selected, selectedWorkerId, workers]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const name = displayName(item).toLowerCase();
      const email = (item.email || "").toLowerCase();
      const phone = (item.phone || "").toLowerCase();
      const idNum = String(item.profile_data?.identity_number ?? "").toLowerCase();
      return (
        name.includes(term) ||
        email.includes(term) ||
        phone.includes(term) ||
        idNum.includes(term)
      );
    });
  }, [items, search]);

  useEffect(() => {
    if (selected && !filteredItems.some((item) => item.user_id === selected.user_id)) {
      selectRequest(null);
    }
  }, [filteredItems, selected, selectRequest]);

  const changeStatus = (status: ProfileStatusFilter) => {
    if (reviewInFlight.current || status === statusFilter) return;
    selectRequest(null);
    setItems([]);
    setSearch("");
    setLoading(true);
    setStatusFilter(status);
  };

  const closeDetail = () => {
    if (reviewInFlight.current) return;
    restoreListFocus.current = !window.matchMedia("(min-width: 1024px)").matches;
    selectRequest(null);
  };

  const review = async (decision: "APPROVED" | "NEEDS_INFO") => {
    if (!selected || selected.status !== "SUBMITTED" || statusFilter !== "SUBMITTED" || loading || refreshing || loadError || reviewInFlight.current || !lifecycle.current.mounted)
      return;
    const worker = workers.find((candidate) => candidate.id === selectedWorkerId && candidate.is_active !== false && (!candidate.user_id || candidate.user_id === selected.user_id));
    if (decision === "APPROVED" && (!worker || workersLoading || workerError)) {
      toast({
        title: "Chưa chọn hồ sơ công nhân",
        description: "Hãy chọn hồ sơ công nhân tương ứng trước khi duyệt.",
        variant: "destructive",
      });
      return;
    }
    if (decision === "NEEDS_INFO" && !note.trim()) {
      toast({
        title: "Cần ghi rõ nội dung",
        description: "Hãy nêu thông tin nhân viên cần bổ sung.",
        variant: "destructive",
      });
      return;
    }
    const generation = lifecycle.current.generation;
    const session = getLocalUserSession()?.token;
    const current = () =>
      lifecycle.current.mounted &&
      lifecycle.current.generation === generation &&
      session === getLocalUserSession()?.token;
    reviewInFlight.current = true;
    setSaving(true);
    try {
      await localApi.reviewProfileRequest(selected.user_id, {
        decision,
        expected_revision: selected.revision,
        note: note.trim() || undefined,
        worker_id: selectedWorkerId || undefined,
      });
      if (!current()) return;
      toast({
        title:
          decision === "APPROVED"
            ? "Đã duyệt và liên kết hồ sơ"
            : "Đã yêu cầu bổ sung",
        description: displayName(selected),
      });
      if (decision === "APPROVED") {
        setSalaryWorker(selectedWorkerId);
        setWorkerRetry((value) => value + 1);
      }
      setSelected(null);
      setNote("");
      setSelectedWorkerId("");
      setMobileDetailOpen(false);
      await load(true, statusFilter, true);
    } catch (error) {
      if (!current()) return;
      if (error instanceof LocalApiError && error.status === 409) {
        setSelected(null);
        setNote("");
        setSelectedWorkerId("");
        toast({
          title: "Hồ sơ đã thay đổi",
          description:
            "Đã đóng bản đang xem. Hãy mở lại hồ sơ sau khi danh sách tải xong để kiểm tra trước khi xử lý.",
          variant: "destructive",
        });
        setMobileDetailOpen(false);
        await load(true, statusFilter, true, false);
        return;
      }
      toast({
        title: "Không thể cập nhật hồ sơ",
        description:
          error instanceof Error ? error.message : "Vui lòng thử lại.",
        variant: "destructive",
      });
    } finally {
      if (current()) {
        reviewInFlight.current = false;
        setSaving(false);
      }
    }
  };

  const filledEntries = useMemo(() => {
    if (!selected?.profile_data) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const [key, value] of Object.entries(selected.profile_data)) {
      if (value !== null && value !== undefined && String(value).trim()) {
        map.set(key, String(value).trim());
      }
    }
    return map;
  }, [selected]);

  const uncategorizedEntries = useMemo(() => {
    const knownKeys = new Set<string>(
      fieldGroups.flatMap((group) => [...group.keys]),
    );
    return Array.from(filledEntries.entries()).filter(
      ([key]) => !knownKeys.has(key),
    );
  }, [filledEntries]);

  const eligibleWorkers = useMemo(() => {
    if (!selected) return [];
    return workers.filter(
      (worker) =>
        worker.is_active !== false &&
        (!worker.user_id || worker.user_id === selected.user_id),
    );
  }, [selected, workers]);

  return (
    <div className="min-w-0 space-y-3">
      <WorkspaceCommandBar
        title="Duyệt hồ sơ nhân sự"
        subtitle="Kiểm tra thông tin nhân viên tự khai và liên kết mã công nhân trước khi tính chấm công, tiền lương."
        badge={
          <Badge variant="secondary" className="tabular-nums">
            {items.length} hồ sơ
          </Badge>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true, statusFilter)}
            disabled={loading || refreshing || saving}
          >
            <RefreshCw
              className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")}
            />
            Làm mới
          </Button>
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <StatusFilterStrip
            className="border-0 bg-transparent p-0"
            ariaLabel="Lọc trạng thái hồ sơ nhân sự"
            items={[
              {
                id: "SUBMITTED",
                label: "Chờ xác nhận",
                count:
                  statusFilter === "SUBMITTED" ? items.length : undefined,
                tone: "warning",
                icon: Clock,
                active: statusFilter === "SUBMITTED",
                onClick: saving ? undefined : () => changeStatus("SUBMITTED"),
              },
              {
                id: "NEEDS_INFO",
                label: "Đã yêu cầu bổ sung",
                count:
                  statusFilter === "NEEDS_INFO" ? items.length : undefined,
                tone: "danger",
                icon: AlertCircle,
                active: statusFilter === "NEEDS_INFO",
                onClick: saving ? undefined : () => changeStatus("NEEDS_INFO"),
              },
              {
                id: "APPROVED",
                label: "Đã duyệt",
                count:
                  statusFilter === "APPROVED" ? items.length : undefined,
                tone: "success",
                icon: CheckCircle2,
                active: statusFilter === "APPROVED",
                onClick: saving ? undefined : () => changeStatus("APPROVED"),
              },
            ]}
          />
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              disabled={saving}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm tên, email, SĐT, CCCD..."
              className="h-9 pl-9 text-sm"
              aria-label="Tìm kiếm hồ sơ"
            />
          </div>
        </div>
      </WorkspaceCommandBar>

      {salaryWorker && canSetupSalary && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-emerald-700" />
            <span>
              Hồ sơ cá nhân đã được duyệt và liên kết. Bước tiếp theo là thiết
              lập thông số lương cho nhân sự này.
            </span>
          </div>
          <Button asChild size="sm">
            <Link
              to={`/payroll-settings?tab=workers&worker=${encodeURIComponent(salaryWorker)}`}
            >
              Thiết lập lương cho nhân sự này
            </Link>
          </Button>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive bg-destructive/5 p-3 text-sm"
        >
          <p className="text-destructive">
            Không tải được hồ sơ chờ duyệt: {loadError}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true, statusFilter)}
            disabled={refreshing || saving}
          >
            Thử tải lại
          </Button>
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Đang tải hồ sơ...
          </CardContent>
        </Card>
      ) : loadError ? null : filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <FileCheck2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="font-medium text-foreground">
              {statusFilter === "SUBMITTED"
                ? "Chưa có hồ sơ nào chờ xác nhận."
                : "Không có hồ sơ phù hợp với bộ lọc hiện tại."}
            </p>
            {search.trim() && (
              <Button
                variant="link"
                size="sm"
                className="mt-1"
                onClick={() => setSearch("")}
              >
                Xóa từ khóa tìm kiếm
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-[360px_minmax(0,1fr)]">
          {/* Cột trái: Danh sách hồ sơ (Review Inbox) */}
          <Card ref={listRef} tabIndex={-1} aria-label="Danh sách hồ sơ" className={cn("min-w-0 scroll-mt-20 overflow-hidden lg:scroll-mt-4", mobileDetailOpen && selected && "hidden lg:block")}>
            <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30 px-3.5 py-2.5">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <FileCheck2 className="h-4 w-4 text-primary" />
                Danh sách ({filteredItems.length})
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {statusMeta[statusFilter].label}
              </span>
            </CardHeader>
            <CardContent className="max-h-[calc(100vh-15rem)] divide-y overflow-y-auto p-0">
              {filteredItems.map((item) => {
                const isSelected = selected?.user_id === item.user_id;
                const linkedWorker = workers.find(
                  (w) => w.user_id === item.user_id,
                );
                const fieldCount = Object.values(item.profile_data || {}).filter(
                  (v) => v !== null && v !== undefined && String(v).trim(),
                ).length;
                return (
                  <div
                    key={item.user_id}
                    className={cn(
                      "flex flex-col gap-1.5 p-3 transition-colors hover:bg-muted/50",
                      isSelected &&
                        "border-l-4 border-l-primary bg-primary/5 hover:bg-primary/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        disabled={saving || refreshing}
                        onClick={() => selectRequest(item)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="break-words font-semibold text-foreground [overflow-wrap:anywhere]">
                          {displayName(item)}
                        </p>
                        <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                          {item.email}
                        </p>
                      </button>
                      <Badge
                        variant={statusMeta[statusFilter].badgeVariant}
                        className="shrink-0 text-[10px]"
                      >
                        {fieldCount} thông tin
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>SĐT: {item.phone || "—"}</span>
                      <span>
                        {item.submitted_at
                          ? new Date(item.submitted_at).toLocaleString("vi-VN", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </span>
                    </div>
                    {linkedWorker && (
                      <div className="text-[11px] font-medium text-emerald-700">
                        Đã gắn mã: {linkedWorker.employee_code} ·{" "}
                        {linkedWorker.display_name}
                      </div>
                    )}
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        className="h-8 w-full text-xs"
                        disabled={saving || refreshing}
                        onClick={() => selectRequest(item)}
                      >
                        Xem và xử lý
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Cột phải: Khung đối chiếu chi tiết & Quyết định phê duyệt */}
          {selected ? (
            <Card
              ref={detailRef}
              tabIndex={-1}
              role="region"
              aria-label={`Kiểm tra hồ sơ — ${displayName(selected)}`}
              className={cn("min-w-0 scroll-mt-20 overflow-hidden lg:scroll-mt-4", !mobileDetailOpen && "hidden lg:block")}
            >
              <div className="border-b px-3 py-2 lg:hidden"><Button variant="ghost" size="sm" disabled={saving} onClick={closeDetail}><ArrowLeft className="mr-2 h-4 w-4" />Trở lại danh sách</Button></div>
              <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="break-words text-base font-semibold [overflow-wrap:anywhere]">
                      Kiểm tra hồ sơ — {displayName(selected)}
                    </CardTitle>
                    <Badge variant="outline" className="font-mono text-xs">
                      Phiên bản #{selected.revision}
                    </Badge>
                  </div>
                  <p className="mt-0.5 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    Email: {selected.email} · Gửi lúc:{" "}
                    {selected.submitted_at
                      ? new Date(selected.submitted_at).toLocaleString("vi-VN")
                      : "—"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={closeDetail}
                  disabled={saving}
                  title="Đóng chi tiết"
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>

              <CardContent className="space-y-4 p-4">
                {/* 4 nhóm thông tin có cấu trúc */}
                <div className="grid gap-3 md:grid-cols-2">
                  {fieldGroups.map((group) => {
                    const GroupIcon = group.icon;
                    const groupFields = group.keys.filter((key) =>
                      filledEntries.has(key),
                    );
                    return (
                      <div
                        key={group.id}
                        className="rounded-lg border bg-card p-3 shadow-sm"
                      >
                        <div className="mb-2.5 flex items-center justify-between border-b pb-1.5">
                          <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                            <GroupIcon className="h-3.5 w-3.5 text-primary" />
                            {group.title}
                          </h3>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {groupFields.length}/{group.keys.length} mục
                          </span>
                        </div>
                        {groupFields.length === 0 ? (
                          <p className="py-2 text-xs italic text-muted-foreground">
                            Nhân viên chưa kê khai mục này.
                          </p>
                        ) : (
                          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {groupFields.map((key) => (
                              <div
                                key={key}
                                className={cn(
                                  "rounded bg-muted/30 px-2.5 py-1.5",
                                  (key.includes("address") ||
                                    key === "notes") &&
                                    "sm:col-span-2",
                                )}
                              >
                                <dt className="text-[11px] text-muted-foreground">
                                  {labels[key] || key}
                                </dt>
                                <dd className="mt-0.5 break-words text-sm font-medium text-foreground">
                                  {filledEntries.get(key)}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                    );
                  })}
                </div>

                {uncategorizedEntries.length > 0 && (
                  <div className="rounded-lg border bg-muted/15 p-3">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Thông tin bổ sung khác
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {uncategorizedEntries.map(([key, value]) => (
                        <div
                          key={key}
                          className="rounded border bg-background px-2.5 py-1.5"
                        >
                          <p className="text-[11px] text-muted-foreground">
                            {labels[key] || key}
                          </p>
                          <p className="mt-0.5 break-words text-sm font-medium">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Khu vực liên kết mã công nhân & Phê duyệt */}
                {selected.status === "SUBMITTED" ? <div className="rounded-lg border bg-muted/20 p-3.5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Hồ sơ công nhân để liên kết (Bắt buộc khi duyệt)</Label>
                      {workerError && (
                        <div
                          role="alert"
                          className="flex items-center justify-between gap-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
                        >
                          <span>
                            Không tải được danh sách công nhân: {workerError}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              setWorkerRetry((value) => value + 1)
                            }
                          >
                            Thử lại
                          </Button>
                        </div>
                      )}
                      <Select
                        value={selectedWorkerId}
                        onValueChange={setSelectedWorkerId}
                        disabled={saving || refreshing || workersLoading || Boolean(workerError)}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder={workersLoading ? "Đang tải công nhân..." : "Chọn mã và tên công nhân"} />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleWorkers.map((worker) => (
                            <SelectItem key={worker.id} value={worker.id}>
                              {worker.employee_code} · {worker.display_name}
                              {worker.user_id === selected.user_id
                                ? " (đang liên kết)"
                                : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">
                        Hệ thống kiểm tra trùng liên kết và phiên bản hồ sơ
                        trong cùng giao dịch.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="profile-review-note">
                        Ghi chú phản hồi (Bắt buộc nếu yêu cầu bổ sung)
                      </Label>
                      <Textarea
                        id="profile-review-note"
                        rows={2}
                        className="bg-background"
                        value={note}
                        disabled={saving || refreshing}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Ví dụ: Vui lòng bổ sung số CCCD hoặc kiểm tra lại số tài khoản ngân hàng..."
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={closeDetail}
                      disabled={saving}
                    >
                      Đóng
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void review("NEEDS_INFO")}
                      disabled={saving || refreshing || !note.trim()}
                    >
                      {saving && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Yêu cầu bổ sung
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void review("APPROVED")}
                      disabled={saving || refreshing || workersLoading || Boolean(workerError) || !eligibleWorkers.some((worker) => worker.id === selectedWorkerId)}
                    >
                      {saving && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Duyệt và liên kết
                    </Button>
                  </div>
                </div> : <div className="space-y-2 rounded-lg border bg-muted/20 p-3.5 text-sm">
                  <Badge variant={statusMeta[selected.status as ProfileStatusFilter]?.badgeVariant ?? "outline"}>{statusMeta[selected.status as ProfileStatusFilter]?.label ?? selected.status}</Badge>
                  <p>Đã xử lý lúc: {selected.reviewed_at ? new Date(selected.reviewed_at).toLocaleString("vi-VN") : "Chưa có thông tin"}</p>
                  <p className="whitespace-pre-wrap break-words">Ghi chú phản hồi: {selected.review_note || "Không có ghi chú"}</p>
                  {selected.status === "NEEDS_INFO" && <p className="text-muted-foreground">Chờ nhân viên bổ sung và gửi lại hồ sơ để duyệt tiếp.</p>}
                  {selected.status === "APPROVED" && (() => {
                    const linked = workers.find((worker) => worker.user_id === selected.user_id);
                    return <><p>Công nhân đang liên kết: {linked ? `${linked.employee_code} · ${linked.display_name}` : workersLoading ? "Đang tải..." : workerError ? "Chưa tải được danh sách công nhân" : "Chưa có liên kết hiện tại"}</p>{linked && canSetupSalary && <Button asChild size="sm"><Link to={`/payroll-settings?tab=workers&worker=${encodeURIComponent(linked.id)}`}>Thiết lập lương cho nhân sự này</Link></Button>}</>;
                  })()}
                </div>}
              </CardContent>
            </Card>
          ) : (
            <Card className="hidden lg:block">
              <CardContent className="flex min-h-64 flex-col items-center justify-center p-6 text-center text-sm text-muted-foreground">
                <FileCheck2 className="mb-2 h-8 w-8 text-muted-foreground/40" />
                Chọn một hồ sơ ở cột bên trái để kiểm tra chi tiết và phê duyệt.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
