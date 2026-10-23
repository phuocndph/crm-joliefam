import { payrollWorkerMasterIssue } from "@/lib/payroll-worker-validation";
import { useEffect, useMemo, useRef, useState } from "react";
import PayrollVersionSettings from "@/components/PayrollVersionSettings";
import { listenPermissionRefresh } from '@/lib/permission-refresh';
import { useUserRole } from '@/hooks/useUserRole';
import { useEmployeePermissions } from '@/hooks/useEmployeePermissions';
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  CalendarCheck2,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  Eye,
  EyeOff,
  Filter,
  FileText,
  Landmark,
  Loader2,
  LockKeyhole,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { isLocalBackend } from "@/lib/runtime-config";
import { useAuthReady } from "@/hooks/useAuthReady";
import PayrollBundleReview from "@/components/payroll/PayrollBundleReview";
import { localApi } from "@/lib/local-api";
import type {
  CompensationType,
  PayrollBankAccount,
  PayrollAdjustment,
  PayrollCapability,
  PayrollPermissionType,
  PayrollPolicyGroup,
  PayrollProduct,
  PayrollTeamAssignment,
  PayrollWorker,
  ProductPieceRateVersion,
  SocialInsuranceVersion,
  WorkerCompensationAssignment,
  WorkerCompensationRate,
  WorkerPayrollProfile,
} from "@/integrations/supabase/production-execution-types";
import {
  approveProductPieceRate,
  approveSocialInsuranceVersion,
  approveWorkerCompensationAssignment,
  approveWorkerPayrollProfile,
  approveWorkerPayrollRate,
  createBankAccountDraft,
  createPayrollTeamAssignment,
  createProductPieceRateDraft,
  createSocialInsuranceDraft,
  createWorkerCompensationAssignment,
  createWorkerPayrollProfileDraft,
  createWorkerPayrollRateDraft,
  discardBankAccountDraft,
  discardProductPieceRateDraft,
  discardSocialInsuranceDraft,
  discardWorkerCompensationAssignmentDraft,
  discardWorkerPayrollProfileDraft,
  discardWorkerPayrollRateDraft,
  listPayrollCapabilities,
  listPayrollPolicyGroups,
  listPayrollProducts,
  listPayrollTeamAssignments,
  listPayrollWorkers,
  listProductPieceRates,
  listSocialInsuranceVersions,
  listWorkerBankAccounts,
  listWorkerCompensationAssignments,
  listWorkerPayrollProfiles,
  listWorkerPayrollRates,
  retirePayrollTeamAssignment,
  saveWorkerPayrollBundle,
  updateBankAccountDraft,
  updatePayrollWorkerMaster,
  updateProductPieceRateDraft,
  updateSocialInsuranceDraft,
  updateWorkerCompensationAssignmentDraft,
  updateWorkerPayrollProfileDraft,
  updateWorkerPayrollRateDraft,
  upsertPayrollPolicyGroup,
  verifyBankAccount,
} from "@/lib/payroll-master-data";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PayrollDialogContent as DialogContent } from "@/components/payroll/PayrollDialogContent";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import PayrollMonthWorkbench from "@/components/payroll/PayrollMonthWorkbench";
import PayrollBankProposal from "@/components/payroll/PayrollBankProposal";
import PayrollWorkerRoster from "@/components/payroll/PayrollWorkerRoster";

const today = () => new Date().toISOString().slice(0, 10);
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const wholeNumber = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const emptyRecordList: Record<string, unknown>[] = [];
const compensationLabels: Record<CompensationType, string> = {
  MONTHLY_MANAGER: "Quản lý lương tháng",
  MONTHLY_HELPER: "Thợ phụ lương tháng",
  PIECE_RATE: "Thợ may theo sản phẩm",
  HOURLY: "Nhân viên theo giờ",
};
const payrollTabOptions = [["runs","Bảng lương tháng"],["workers","Nhân sự & mức lương"],["policies","Thiết lập chung"]];
const payrollSettingsTabs = new Set(["overview", "workers", "policies", "groups", "worker-rates", "rates", "insurance", "banks", "adjustments", "runs"]);

const normalizeSearchText = (value: unknown) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").trim();

const isPayrollTestWorker = (worker: Pick<PayrollWorker, "employee_code" | "display_name">) =>
  /^(?:HARDEN|PAYTEST)(?:[-_ ]|$)/i.test(`${worker.employee_code ?? ""}`.trim())
  || /^(?:HARDEN|PAYTEST)(?:[-_ ]|$)/i.test(`${worker.display_name ?? ""}`.trim());

function TableToolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2 ${className}`}>{children}</div>;
}


function RecordFilters({ search, onSearch, status, onStatus, statuses }: {
  search: string; onSearch: (value: string) => void; status: string; onStatus: (value: string) => void; statuses: [string, string][];
}) {
  return <TableToolbar>
    <div className="relative w-full min-w-0 flex-1 sm:min-w-[220px]"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Tìm dữ liệu trong bảng" placeholder="Tìm mã, tên nhân sự hoặc nội dung…" value={search} onChange={(event) => onSearch(event.target.value)} className="pl-9" /></div>
    <Select value={status} onValueChange={onStatus}><SelectTrigger aria-label="Lọc trạng thái" className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Mọi trạng thái</SelectItem>{statuses.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
    {(search || status !== "ALL") && <Button variant="ghost" size="sm" onClick={() => { onSearch(""); onStatus("ALL"); }}>Xóa lọc</Button>}
  </TableToolbar>;
}

function PayrollHelp({ title = "Hướng dẫn", children }: { title?: string; children: ReactNode }) {
  return <details className="rounded-lg border bg-muted/10 px-3 text-sm">
    <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-muted-foreground lg:min-h-9 lg:py-2">{title}</summary>
    <div className="space-y-3 border-t py-3 text-sm text-muted-foreground">{children}</div>
  </details>;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Không thể hoàn tất thao tác.";
}

function statusBadge(status: string) {
  const variant = status === "APPROVED" || status === "VERIFIED" || status === "ACTIVE"
    ? "default"
    : status === "DRAFT" ? "secondary" : "outline";
  const label = status === "APPROVED" ? "Đã duyệt"
    : status === "VERIFIED" ? "Đã xác minh"
    : status === "ACTIVE" ? "Đang hiệu lực"
    : status === "DRAFT" ? "Nháp"
    : status === "SUBMITTED" ? "Chờ duyệt"
    : status === "REJECTED" ? "Đã từ chối"
    : status === "SUSPENDED" ? "Tạm dừng"
    : status === "TERMINATED" ? "Đã nghỉ việc"
    : status === "RETIRED" ? "Đã kết thúc"
    : status === "PREVIEW" ? "Xem trước"
    : status === "SUPERSEDED" ? "Đã thay thế"
    : status === "LOCKED" ? "Đã khóa" : status;
  return <Badge variant={variant}>{label}</Badge>;
}

function payrollContextLink(path:string, context:URLSearchParams, workerId?:string) {
  const [base,query='']=path.split('?'); const next=new URLSearchParams(query);
  for(const key of ['month','location']) {const value=context.get(key);if(value)next.set(key,value);}
  if(workerId)next.set('worker',workerId);
  if(base!=='/payroll-settings') {const back=new URLSearchParams(context);back.set('tab','runs');next.set('returnTo','/payroll-settings?'+back.toString());}
  return base+'?'+next.toString();
}

function EmptyRow({ columns, message }: { columns: number; message: string }) {
  return <TableRow><TableCell colSpan={columns} className="h-24 text-center text-muted-foreground">{message}</TableCell></TableRow>;
}

function DeniedPanel({ message }: { message: string }) {
  return (
    <Alert>
      <ShieldCheck className="h-4 w-4" />
      <AlertTitle>Không có quyền thao tác</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

const isEffectiveVersion = (effectiveFrom: string, effectiveTo: string | null, asOf = today()) =>
  effectiveFrom <= asOf && (!effectiveTo || effectiveTo >= asOf);

function latestWorkerVersion<T extends { worker_id: string; status?: string; effective_from: string; effective_to: string | null; created_at?: string }>(
  rows: T[],
  workerId: string,
  status: string,
  asOf?: string,
): T | undefined {
  return rows
    .filter((row) => row.worker_id === workerId && row.status === status && (!asOf || isEffectiveVersion(row.effective_from, row.effective_to, asOf)))
    .sort((left, right) => `${right.effective_from}|${right.created_at ?? ""}`.localeCompare(`${left.effective_from}|${left.created_at ?? ""}`))[0];
}

type PayrollOverviewProps = {
  workers: PayrollWorker[];
  groups: PayrollPolicyGroup[];
  assignments: WorkerCompensationAssignment[];
  workerRates: WorkerCompensationRate[];
  productRates: ProductPieceRateVersion[];
  insurance: SocialInsuranceVersion[];
  adjustments: PayrollAdjustment[];
  runs: Record<string, unknown>[];
  canSeeRates: boolean;
  canSeeInsurance: boolean;
};

function PayrollOverviewTab({
  workers,
  groups,
  assignments,
  workerRates,
  productRates,
  insurance,
  adjustments,
  runs,
  canSeeRates,
  canSeeInsurance,
}: PayrollOverviewProps) {
  const [search, setSearch] = useState("");
  const [readinessFilter, setReadinessFilter] = useState<"ALL" | "READY" | "NEEDS_ACTION">("ALL");
  const asOf = today();
  const activeWorkers = workers.filter((worker) => worker.is_active && worker.payroll_status === "ACTIVE");
  const currentPieceRates = productRates.filter((rate) => rate.status === "APPROVED" && isEffectiveVersion(rate.effective_from, rate.effective_to, asOf));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const frameworkRows = activeWorkers.map((worker) => {
    const assignment = assignments
      .filter((item) => item.worker_id === worker.id && item.status === "APPROVED" && isEffectiveVersion(item.effective_from, item.effective_to, asOf))
      .sort((left, right) => right.effective_from.localeCompare(left.effective_from))[0];
    const compensationType = assignment?.compensation_type ?? worker.current_compensation_type ?? worker.employment_type;
    const primaryRate = workerRates
      .filter((rate) => rate.worker_id === worker.id && rate.status === "APPROVED" && isEffectiveVersion(rate.effective_from, rate.effective_to, asOf) && (!compensationType || rate.compensation_type === compensationType))
      .sort((left, right) => right.effective_from.localeCompare(left.effective_from))[0];
    const insuranceVersion = insurance
      .filter((version) => version.worker_id === worker.id && version.status === "APPROVED" && isEffectiveVersion(version.effective_from, version.effective_to, asOf))
      .sort((left, right) => right.effective_from.localeCompare(left.effective_from))[0];
    const workerAdjustments = adjustments.filter((item) => item.worker_id === worker.id && !["REJECTED", "LOCKED"].includes(item.status));
    const issues: string[] = [];
    if (!compensationType) issues.push("Thiếu phân loại lương");
    if (!(assignment?.payroll_policy_group_id || worker.current_policy_group_id)) issues.push("Thiếu nhóm chính sách");
    if (compensationType === "PIECE_RATE" && currentPieceRates.length === 0) issues.push("Thiếu đơn giá sản phẩm");
    if (compensationType && compensationType !== "PIECE_RATE" && !primaryRate) issues.push("Thiếu mức lương hiệu lực");
    const group = groupById.get(assignment?.payroll_policy_group_id ?? worker.current_policy_group_id ?? "");
    return { worker, compensationType, primaryRate, insuranceVersion, workerAdjustments, issues, group };
  });
  const readyWorkers = frameworkRows.filter((row) => row.issues.length === 0).length;
  const visibleFrameworkRows = frameworkRows.filter((row) => {
    const term = normalizeSearchText(search);
    const matchesSearch = !term || normalizeSearchText(`${row.worker.display_name} ${row.worker.employee_code} ${row.worker.position_title}`).includes(term);
    const matchesStatus = readinessFilter === "ALL" || (readinessFilter === "READY" ? row.issues.length === 0 : row.issues.length > 0);
    return matchesSearch && matchesStatus;
  });
  const pendingApprovals = assignments.filter((item) => item.status === "DRAFT").length
    + workerRates.filter((item) => item.status === "DRAFT").length
    + productRates.filter((item) => item.status === "DRAFT").length
    + insurance.filter((item) => item.status === "DRAFT").length
    + adjustments.filter((item) => ["DRAFT", "SUBMITTED"].includes(item.status)).length;
  const latestRun = runs[0];
  const workflowStages = [
    { step: "01", title: "Hồ sơ nhân sự", description: "Phân loại hình thức lương và nhóm chính sách", path: "/payroll-settings?tab=workers", Icon: UsersRound },
    { step: "02", title: "Quy chế lương", description: "Chuẩn hóa công thức, phạm vi và ngày hiệu lực", path: "/payroll-settings?tab=policies", Icon: FileText },
    { step: "03", title: "Mức lương & đơn giá", description: "Lương tháng, lương giờ và đơn giá sản phẩm", path: "/payroll-settings?tab=worker-rates", Icon: CircleDollarSign },
    { step: "04", title: "Chấm công", description: "Ngày công, giờ làm, sản lượng và trạng thái ngày", path: "/production-attendance", Icon: CalendarCheck2 },
    { step: "05", title: "Đối soát", description: "Duyệt nguồn, phụ cấp, khấu trừ và ngoại lệ", path: "/payroll-settings?tab=adjustments", Icon: ClipboardCheck },
    { step: "06", title: "Kỳ lương", description: "Tính thử, kiểm tra, khóa và xuất bảng lương", path: "/payroll-settings?tab=runs", Icon: Landmark },
  ];

  const primaryRateLabel = (row: typeof frameworkRows[number]) => {
    if (!canSeeRates) return "Không có quyền xem";
    if (row.compensationType === "PIECE_RATE") return currentPieceRates.length > 0 ? `${currentPieceRates.length} đơn giá hiệu lực` : "Chưa có đơn giá";
    if (!row.primaryRate) return "Chưa thiết lập";
    if (row.compensationType === "HOURLY") return `${money.format(row.primaryRate.hourly_rate ?? 0)}/giờ`;
    return `${money.format(row.primaryRate.monthly_rate ?? 0)}/tháng`;
  };

  return <div className="space-y-5">


    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span>Đang tính lương: <strong className="text-foreground">{activeWorkers.length.toLocaleString("vi-VN")}</strong></span>
      <span>Sẵn sàng: <strong className="text-emerald-700">{readyWorkers.toLocaleString("vi-VN")}</strong></span>
      <span>Cần hoàn thiện: <strong className="text-amber-700">{(frameworkRows.length - readyWorkers).toLocaleString("vi-VN")}</strong></span>
      <span>Nháp / chờ duyệt: <strong className="text-foreground">{pendingApprovals.toLocaleString("vi-VN")}</strong></span>
      <span className="inline-flex items-center gap-1">Kỳ gần nhất: {latestRun ? statusBadge(String(latestRun.status)) : "Chưa có"}</span>
    </div>



    <div className="overflow-hidden rounded-xl border bg-card"><div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3"><div><h2 className="font-semibold">Ma trận cấu hình nhân sự</h2></div><Badge variant="outline">{visibleFrameworkRows.length}/{frameworkRows.length} · {asOf}</Badge></div><TableToolbar><div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên, mã nhân sự…" className="h-9 pl-8" /></div><Select value={readinessFilter} onValueChange={(value: typeof readinessFilter) => setReadinessFilter(value)}><SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả trạng thái</SelectItem><SelectItem value="READY">Đã thiết lập cơ bản</SelectItem><SelectItem value="NEEDS_ACTION">Cần hoàn thiện</SelectItem></SelectContent></Select>{(search || readinessFilter !== "ALL") && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setReadinessFilter("ALL"); }}>Xóa lọc</Button>}</TableToolbar><div className="max-h-[520px] overflow-auto"><Table disableWrapper className="min-w-[1320px]"><TableHeader className="sticky top-0 z-10 bg-muted/95"><TableRow><TableHead className="sticky left-0 z-20 w-[240px] bg-muted/95">Nhân sự</TableHead><TableHead>Loại lương chính</TableHead><TableHead>Nhóm chính sách</TableHead><TableHead>Mức lương / đơn giá</TableHead><TableHead>Sản phẩm bổ sung</TableHead><TableHead>BHXH</TableHead><TableHead>Phụ cấp / khấu trừ</TableHead><TableHead>Trạng thái khung</TableHead></TableRow></TableHeader><TableBody>{visibleFrameworkRows.length === 0 ? <EmptyRow columns={8} message={frameworkRows.length ? "Không có dòng phù hợp bộ lọc." : "Chưa có nhân sự đang hoạt động."} /> : visibleFrameworkRows.map((row) => <TableRow key={row.worker.id} className={row.issues.length ? "bg-amber-50/40" : undefined}><TableCell className="sticky left-0 z-[1] bg-background"><div className="font-medium">{row.worker.display_name}</div><div className="text-xs text-muted-foreground">{row.worker.employee_code} · {row.worker.position_title || "Chưa có vị trí"}</div></TableCell><TableCell>{row.compensationType ? compensationLabels[row.compensationType] : <span className="text-amber-700">Chưa phân loại</span>}</TableCell><TableCell>{row.group?.code ?? row.worker.current_policy_group_code ?? <span className="text-amber-700">Chưa gán</span>}</TableCell><TableCell className="font-medium">{primaryRateLabel(row)}</TableCell><TableCell>{currentPieceRates.length > 0 ? row.compensationType === "PIECE_RATE" ? "Nguồn thu nhập chính" : "Cộng khi có sản lượng duyệt" : "Chưa có đơn giá hiệu lực"}</TableCell><TableCell>{!canSeeInsurance ? "Không có quyền xem" : row.insuranceVersion ? money.format(row.insuranceVersion.employee_amount) : "Chưa tham gia / cấu hình"}</TableCell><TableCell>{row.workerAdjustments.length > 0 ? `${row.workerAdjustments.length} khoản đang xử lý` : "Không có khoản mở"}</TableCell><TableCell>{row.issues.length === 0 ? <Badge className="bg-emerald-600">Sẵn sàng khung</Badge> : <div className="space-y-1">{row.issues.map((issue) => <div key={issue} className="text-xs text-amber-800">• {issue}</div>)}</div>}</TableCell></TableRow>)}</TableBody></Table></div></div>
    <PayrollHelp title="Hướng dẫn vận hành"><p>Kiểm tra các mục còn thiếu trong bảng, hoàn thiện và duyệt nguồn trước khi tính lương. Chỉ khóa kỳ khi đã đối soát và không còn lỗi chặn. Mục Quy chế lương hiện là danh mục công thức tham khảo, chưa có quy trình ban hành.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workflowStages.map(({ step, title, description, path, Icon }) => <Link key={step} to={path} className="group flex min-w-0 items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-xs font-medium text-muted-foreground">BƯỚC {step}</p><p className="font-medium">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div><ArrowRight className="mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link>)}</div></PayrollHelp>
  </div>;
}

const payrollFrameworkPolicies = [
  { code: "POL-MONTHLY", name: "Lương tháng theo ngày công", audience: "Nhân sự lương tháng", source: "Ngày công đã duyệt", formula: "Lương tháng / ngày chuẩn × ngày công hưởng lương" },
  { code: "POL-HOURLY", name: "Lương theo giờ", audience: "Nhân sự lương giờ", source: "Phút làm việc đã duyệt", formula: "Phút thực tế / 60 × đơn giá giờ" },
  { code: "POL-PIECE", name: "Lương theo sản phẩm", audience: "Nhân sự có sản lượng", source: "Sản lượng đạt đã duyệt", formula: "Số lượng đạt × đơn giá sản phẩm hiệu lực" },
  { code: "POL-COMBINED", name: "Lương kết hợp", audience: "Lương tháng/giờ có thêm sản phẩm", source: "Từng nguồn thu nhập đã duyệt", formula: "Lương chính + sản phẩm + tăng ca + khoản cộng" },
  { code: "POL-OVERTIME", name: "Tăng ca và ngày đặc biệt", audience: "Theo nhóm chính sách", source: "Phút tăng ca, loại ngày", formula: "Giờ tăng ca × đơn giá hoặc hệ số hiệu lực" },
  { code: "POL-MEAL", name: "Tiền ăn và phụ cấp", audience: "Theo cơ sở/nhóm", source: "Ngày đủ điều kiện và điều chỉnh", formula: "Số suất × đơn giá + khoản cộng đã duyệt" },
  { code: "POL-INSURANCE", name: "BHXH và các khoản khấu trừ", audience: "Nhân sự tham gia", source: "Mức BHXH/khấu trừ hiệu lực", formula: "Khấu trừ từng dòng, không gộp không rõ nguồn" },
  { code: "POL-PAYROLL", name: "Duyệt, tính và khóa kỳ", audience: "Quản lý và kế toán", source: "Toàn bộ nguồn đã duyệt", formula: "Tổng thu nhập − tổng khấu trừ = thực nhận" },
] as const;

function PayrollPoliciesTab() {
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="outline">Chưa ban hành</Badge><span className="text-muted-foreground">Công thức tham khảo, chưa phải văn bản quy chế đã duyệt.</span></div>

    <div className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-4 py-3"><h2 className="font-semibold">Danh mục quy chế cần hoàn thiện</h2></div><div className="overflow-x-auto"><Table className="min-w-[1050px]"><TableHeader><TableRow><TableHead>Mã</TableHead><TableHead>Quy chế</TableHead><TableHead>Đối tượng</TableHead><TableHead>Dữ liệu đầu vào</TableHead><TableHead>Công thức khung</TableHead><TableHead>Nhân viên xem</TableHead><TableHead>Trạng thái</TableHead></TableRow></TableHeader><TableBody>{payrollFrameworkPolicies.map((policy) => <TableRow key={policy.code}><TableCell className="font-mono text-xs">{policy.code}</TableCell><TableCell className="font-medium">{policy.name}</TableCell><TableCell>{policy.audience}</TableCell><TableCell>{policy.source}</TableCell><TableCell className="max-w-[320px]">{policy.formula}</TableCell><TableCell><Badge variant="outline">Chưa công bố</Badge></TableCell><TableCell><Badge variant="secondary">Tham khảo</Badge></TableCell></TableRow>)}</TableBody></Table></div></div>
    <PayrollHelp title="Hướng dẫn đọc quy chế"><p>Bảng dưới là danh mục văn bản tham khảo để đối chiếu. Các phiên bản cấu hình tính lương và lịch công ở phía trên được duyệt riêng; chức năng đính kèm hoặc ban hành văn bản cho nhân viên chưa có.</p><p>Khi đối soát, kiểm tra nhóm chính sách và ngày hiệu lực của từng nhân sự, cùng các nguồn đã duyệt trong kỳ.</p></PayrollHelp>
  </div>;
}

type PendingAction = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  run: (reason: string) => Promise<unknown>;
};

type RequestAction = (action: PendingAction) => void;

type WorkerForm = {
  id: string; location_code: string; position_title: string;
  employment_start_date: string; employment_end_date: string;
  payroll_status: "ACTIVE" | "SUSPENDED" | "TERMINATED"; reason: string;
};

type CentralPayrollProfileForm = {
  worker_id: string;
  idempotency_key: string;
  selected_drafts?: {assignment_id?:string|null;profile_id?:string|null;rate_id?:string|null;insurance_id?:string|null};
  location_code: string;
  position_title: string;
  employment_start_date: string;
  employment_end_date: string;
  payroll_status: PayrollWorker["payroll_status"];
  compensation_type: CompensationType | "";
  payroll_policy_group_id: string;
  effective_from: string;
  effective_to: string;
  primary_amount: string;
  monthly_productive_minutes: string;
  piece_output_enabled: boolean;
  overtime_enabled: boolean;
  meal_enabled: boolean;
  allowances_enabled: boolean;
  deductions_enabled: boolean;
  insurance_enabled: boolean;
  fixed_allowance_amount: string;
  fixed_deduction_amount: string;
  insurance_amount: string;
  insurance_source_reference: string;
  source_reference: string;
  reason: string;
};

function WorkersTab({
  workers, groups, assignments, profiles, workerRates, insurance, adjustments, productRates, teams, dataReady, dataError, canManage, canManagePolicies, canManageRates, canManageInsurance, requestAction, refresh,
}: {
  workers: PayrollWorker[];
  dataReady: boolean;
  dataError?: unknown;
  groups: PayrollPolicyGroup[];
  assignments: WorkerCompensationAssignment[];
  profiles: WorkerPayrollProfile[];
  workerRates: WorkerCompensationRate[];
  insurance: SocialInsuranceVersion[];
  adjustments: PayrollAdjustment[];
  productRates: ProductPieceRateVersion[];
  teams: PayrollTeamAssignment[];
  canManage: boolean;
  canManagePolicies: boolean;
  canManageRates: boolean;
  canManageInsurance: boolean;
  requestAction: RequestAction;
  refresh: () => Promise<void>;
}) {
  const [workerParams,setWorkerParams] = useSearchParams();
  const [profileStep,setProfileStep] = useState(0);
  const [bundleWorker,setBundleWorker] = useState<string|null>(null);
  const [search, setSearch] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [readinessFilter, setReadinessFilter] = useState("ALL");
  const [draftFilter, setDraftFilter] = useState("ALL");
  const [compensationFilter, setCompensationFilter] = useState("ALL");
  const [payrollStatusFilter, setPayrollStatusFilter] = useState("ALL");
  const [workerForm, setWorkerForm] = useState<WorkerForm | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<{
    id?: string; worker_id: string; compensation_type: CompensationType | "";
    payroll_policy_group_id: string; effective_from: string; effective_to: string; reason: string;
  } | null>(null);
  const [profileForm, setProfileForm] = useState<CentralPayrollProfileForm | null>(null);
  const [teamForm, setTeamForm] = useState({ supervisor_worker_id: "", worker_id: "", effective_from: today(), effective_to: "", reason: "" });
  const [teamOpen, setTeamOpen] = useState(false);

  const assertDataReady = () => { if (!dataReady) throw new Error("Dữ liệu hồ sơ lương chưa đầy đủ. Hãy tải lại trước khi chỉnh sửa hoặc duyệt."); };
  const saveWorker = useMutation({
    mutationFn: async (form: WorkerForm) => { assertDataReady(); const issue=payrollWorkerMasterIssue(form);if(issue)throw new Error(issue);return updatePayrollWorkerMaster({
      worker_id: form.id,
      location_code: form.location_code || null,
      position_title: form.position_title || null,
      employment_start_date: form.employment_start_date || null,
      employment_end_date: form.employment_end_date || null,
      payroll_status: form.payroll_status,
      reason: form.reason,
    }); },
    onSuccess: async () => { toast.success("Đã cập nhật hồ sơ nhân sự"); setWorkerForm(null); await refresh(); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const saveAssignment = useMutation({
    mutationFn: async (form: NonNullable<typeof assignmentForm>) => {
      assertDataReady();
      if (!form.compensation_type) throw new Error("Hãy chọn hình thức lương.");
      return form.id
      ? updateWorkerCompensationAssignmentDraft({
          id: form.id, worker_id: form.worker_id, compensation_type: form.compensation_type,
          payroll_policy_group_id: form.payroll_policy_group_id,
          effective_from: form.effective_from, effective_to: form.effective_to || null, reason: form.reason,
        } as Parameters<typeof updateWorkerCompensationAssignmentDraft>[0])
      : createWorkerCompensationAssignment({
          worker_id: form.worker_id, compensation_type: form.compensation_type,
          payroll_policy_group_id: form.payroll_policy_group_id,
          effective_from: form.effective_from, effective_to: form.effective_to || null, reason: form.reason,
        });
    },
    onSuccess: async () => { toast.success("Đã lưu phân loại lương nháp"); setAssignmentForm(null); await refresh(); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const saveCentralProfile = useMutation({
    mutationFn: async (form: CentralPayrollProfileForm) => {
      assertDataReady();
      if (!form.compensation_type) throw new Error("Hãy chọn hình thức lương chính.");
      if (isLocalBackend()) {
        return saveWorkerPayrollBundle({
          worker_id: form.worker_id,
          idempotency_key: form.idempotency_key,
          selected_drafts: form.selected_drafts,
          location_code: form.location_code || null,
          position_title: form.position_title || null,
          employment_start_date: form.employment_start_date || null,
          employment_end_date: form.employment_end_date || null,
          payroll_status: form.payroll_status,
          compensation_type: form.compensation_type,
          payroll_policy_group_id: form.payroll_policy_group_id,
          primary_amount: form.primary_amount === "" ? null : Number(form.primary_amount),
          monthly_productive_minutes: form.monthly_productive_minutes === "" ? null : Number(form.monthly_productive_minutes),
          piece_output_enabled: form.piece_output_enabled,
          overtime_enabled: form.overtime_enabled,
          meal_enabled: form.meal_enabled,
          allowances_enabled: form.allowances_enabled,
          deductions_enabled: form.deductions_enabled,
          ...(canManageInsurance ? {insurance_enabled:form.insurance_enabled,insurance_amount:form.insurance_amount === "" ? null : Number(form.insurance_amount),insurance_source_reference:form.insurance_source_reference || null} : {}),
          fixed_allowance_amount: Number(form.fixed_allowance_amount) || 0,
          fixed_deduction_amount: Number(form.fixed_deduction_amount) || 0,

          effective_from: form.effective_from,
          effective_to: form.effective_to || null,
          source_reference: form.source_reference || null,
          reason: form.reason,
        });
      }
      // Refresh the affected worker's drafts before each save. This makes a retry
      // after a partial failure update the existing drafts instead of creating duplicates.
      const [freshAssignments, freshRates, freshProfiles, freshInsurance] = await Promise.all([
        listWorkerCompensationAssignments(form.worker_id),
        listWorkerPayrollRates(form.worker_id),
        listWorkerPayrollProfiles(form.worker_id),
        listSocialInsuranceVersions(form.worker_id),
      ]);
      const assignmentDraft = freshAssignments.filter((item) => item.status === "DRAFT").sort((left, right) => right.effective_from.localeCompare(left.effective_from))[0];
      const assignmentInput = {
        worker_id: form.worker_id,
        compensation_type: form.compensation_type,
        payroll_policy_group_id: form.payroll_policy_group_id,
        effective_from: form.effective_from,
        effective_to: form.effective_to || null,
        reason: form.reason,
      };
      const assignment = assignmentDraft
        ? await updateWorkerCompensationAssignmentDraft({ id: assignmentDraft.id, ...assignmentInput })
        : await createWorkerCompensationAssignment(assignmentInput);
      const amount = Number(form.primary_amount);
      if (form.compensation_type !== "PIECE_RATE" && Number.isFinite(amount) && amount > 0) {
        const rateDraft = freshRates.filter((item) => item.compensation_type === form.compensation_type && item.status === "DRAFT").sort((left, right) => right.effective_from.localeCompare(left.effective_from))[0];
        const rateInput = {
          effective_from: form.effective_from,
          effective_to: form.effective_to || null,
          hourly_rate: form.compensation_type === "HOURLY" ? amount : null,
          monthly_rate: form.compensation_type === "HOURLY" ? null : amount,
          piece_rate: null,
          monthly_productive_minutes: form.compensation_type === "HOURLY" ? null : Number(form.monthly_productive_minutes) || null,
          source_reference: form.source_reference || null,
          reason: form.reason,
          is_estimated: false,
        };
        if (rateDraft) await updateWorkerPayrollRateDraft({ id: rateDraft.id, ...rateInput });
        else await createWorkerPayrollRateDraft({ worker_id: form.worker_id, compensation_type: form.compensation_type, ...rateInput });
      }
      const profileDraft = freshProfiles.filter((item) => item.status === "DRAFT").sort((left, right) => right.effective_from.localeCompare(left.effective_from))[0];
      const profileInput = {
        worker_id: form.worker_id,
        piece_output_enabled: form.piece_output_enabled,
        overtime_enabled: form.overtime_enabled,
        meal_enabled: form.meal_enabled,
        allowances_enabled: form.allowances_enabled,
        deductions_enabled: form.deductions_enabled,
        insurance_enabled: form.insurance_enabled,
        fixed_allowance_amount: Number(form.fixed_allowance_amount) || 0,
        fixed_deduction_amount: Number(form.fixed_deduction_amount) || 0,
        effective_from: form.effective_from,
        effective_to: form.effective_to || null,
        source_reference: form.source_reference || null,
        reason: form.reason,
        idempotency_key: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-worker-profile`,
      };
      const { idempotency_key: _profileKey, ...profileUpdateInput } = profileInput;
      void _profileKey;
      const profile = profileDraft
        ? await updateWorkerPayrollProfileDraft({ id: profileDraft.id, ...profileUpdateInput })
        : await createWorkerPayrollProfileDraft(profileInput);
      if (form.insurance_enabled && Number(form.insurance_amount) > 0) {
        const insuranceDraft = freshInsurance.filter((item) => item.status === "DRAFT").sort((left, right) => right.effective_from.localeCompare(left.effective_from))[0];
        const insuranceInput = { worker_id: form.worker_id, employee_amount: Number(form.insurance_amount), effective_from: form.effective_from, effective_to: form.effective_to || null, source_reference: form.insurance_source_reference.trim(), reason: form.reason };
        if (insuranceDraft) await updateSocialInsuranceDraft({ id: insuranceDraft.id, employee_amount: insuranceInput.employee_amount, effective_from: insuranceInput.effective_from, effective_to: insuranceInput.effective_to, source_reference: insuranceInput.source_reference, reason: insuranceInput.reason });
        else await createSocialInsuranceDraft(insuranceInput);
      }
      if (canManage) {
        await updatePayrollWorkerMaster({
          worker_id: form.worker_id,
          location_code: form.location_code || null,
          position_title: form.position_title || null,
          employment_start_date: form.employment_start_date || null,
          employment_end_date: form.employment_end_date || null,
          payroll_status: form.payroll_status,
          reason: form.reason,
        });
      }
      return { assignment, profile };
    },
    onSuccess: async () => { toast.success(isLocalBackend()?"Đã lưu hồ sơ nhân sự và bộ lương nháp trong một giao dịch":"Đã lưu hồ sơ lương"); setProfileForm(null); await refresh(); },
    onError: (error) => toast.error(`Chưa thể hoàn tất hồ sơ lương: ${errorMessage(error)}. Biểu mẫu vẫn mở để thử lại.`),
  });
  const saveTeam = useMutation({
    mutationFn: () => { assertDataReady(); return createPayrollTeamAssignment({
      ...teamForm, effective_to: teamForm.effective_to || null,
    }); },
    onSuccess: async () => {
      toast.success("Đã phân công nhân sự cho tổ trưởng");
      setTeamOpen(false);
      setTeamForm({ supervisor_worker_id: "", worker_id: "", effective_from: today(), effective_to: "", reason: "" });
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const openCentralProfile = (worker: PayrollWorker) => {
    if (!dataReady) { toast.error("Dữ liệu hồ sơ lương chưa đầy đủ."); return; }
    if ([assignments,profiles,workerRates,canManageInsurance?insurance:[]].some(rows=>rows.filter(row=>row.worker_id===worker.id&&row.status==='DRAFT').length>1)) {toast.error('Có nhiều bản nháp. Hãy đối chiếu và chọn đúng bộ phiên bản trước; dùng danh mục nâng cao để sửa từng bản.');return;}
    setProfileStep(0);
    const approvedAssignment = latestWorkerVersion(assignments, worker.id, "APPROVED", today());
    const draftAssignment = latestWorkerVersion(assignments, worker.id, "DRAFT");
    const compensationType = draftAssignment?.compensation_type ?? approvedAssignment?.compensation_type ?? worker.current_compensation_type ?? "";
    const approvedProfile = latestWorkerVersion(profiles, worker.id, "APPROVED", today());
    const draftProfile = latestWorkerVersion(profiles, worker.id, "DRAFT");
    const profile = draftProfile ?? approvedProfile;
    const approvedRate = latestWorkerVersion(workerRates.filter((rate) => rate.compensation_type === compensationType), worker.id, "APPROVED", today());
    const draftRate = latestWorkerVersion(workerRates.filter((rate) => rate.compensation_type === compensationType), worker.id, "DRAFT");
    const rate = draftRate ?? approvedRate;
    const approvedInsurance = latestWorkerVersion(insurance, worker.id, "APPROVED", today());
    const draftInsurance = latestWorkerVersion(insurance, worker.id, "DRAFT");
    const insuranceVersion = draftInsurance ?? approvedInsurance;
    const primaryAmount = compensationType === "HOURLY" ? rate?.hourly_rate : compensationType === "PIECE_RATE" ? null : rate?.monthly_rate;
    setProfileForm({
      worker_id: worker.id,
      selected_drafts:{assignment_id:draftAssignment?.id||null,profile_id:draftProfile?.id||null,rate_id:draftRate?.id||null,...(canManageInsurance?{insurance_id:draftInsurance?.id||null}:{})},
      idempotency_key: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${worker.id}-payroll-bundle`,
      location_code: worker.location_code ?? "",
      position_title: worker.position_title ?? "",
      employment_start_date: worker.employment_start_date ?? "",
      employment_end_date: worker.employment_end_date ?? "",
      payroll_status: worker.payroll_status,
      compensation_type: compensationType,
      payroll_policy_group_id: draftAssignment?.payroll_policy_group_id ?? approvedAssignment?.payroll_policy_group_id ?? worker.current_policy_group_id ?? "",
      effective_from: draftAssignment?.effective_from ?? draftProfile?.effective_from ?? today(),
      effective_to: draftAssignment?.effective_to ?? draftProfile?.effective_to ?? "",
      primary_amount: primaryAmount == null ? "" : String(primaryAmount),
      monthly_productive_minutes: rate?.monthly_productive_minutes == null ? "" : String(rate.monthly_productive_minutes),
      piece_output_enabled: profile?.piece_output_enabled ?? compensationType === "PIECE_RATE",
      overtime_enabled: profile?.overtime_enabled ?? false,
      meal_enabled: profile?.meal_enabled ?? false,
      allowances_enabled: profile?.allowances_enabled ?? false,
      deductions_enabled: profile?.deductions_enabled ?? false,
      insurance_enabled: profile?.insurance_enabled ?? Boolean(insuranceVersion),
      fixed_allowance_amount: String(profile?.fixed_allowance_amount ?? 0),
      fixed_deduction_amount: String(profile?.fixed_deduction_amount ?? 0),
      insurance_amount: insuranceVersion ? String(insuranceVersion.employee_amount) : "",
      insurance_source_reference: insuranceVersion?.source_reference ?? "Hồ sơ lương tập trung",
      source_reference: profile?.source_reference ?? "Hồ sơ lương tập trung",
      reason: "",
    });
  };

  const draftCountFor = (workerId: string) => assignments.filter((item) => item.worker_id === workerId && item.status === "DRAFT").length
    + profiles.filter((item) => item.worker_id === workerId && item.status === "DRAFT").length
    + workerRates.filter((item) => item.worker_id === workerId && item.status === "DRAFT").length
    + insurance.filter((item) => item.worker_id === workerId && item.status === "DRAFT").length;

  const filtered = workers.filter((worker) => (!workerParams.get("worker") || worker.id===workerParams.get("worker")) &&
    normalizeSearchText(`${worker.employee_code} ${worker.display_name} ${worker.position_title ?? ""}`)
      .includes(normalizeSearchText(search)),
  );
  const workerName = (id: string) => workers.find((worker) => worker.id === id)?.display_name ?? id;
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const approvedProductRates = productRates.filter((rate) => rate.status === "APPROVED" && isEffectiveVersion(rate.effective_from, rate.effective_to));
  const canConfigureCentralProfile = isLocalBackend() && canManage && canManagePolicies && canManageRates;
  const workerMasterIssue = workerForm ? payrollWorkerMasterIssue(workerForm) : null;
  const centralProfileIssue = profileForm
    ? payrollWorkerMasterIssue(profileForm)
      || (profileForm.effective_to && profileForm.effective_to < profileForm.effective_from ? "Ngày kết thúc hiệu lực không được trước ngày bắt đầu."
        : profileForm.allowances_enabled && !(Number(profileForm.fixed_allowance_amount)>0) ? "Phụ cấp cố định đang bật cần có số tiền lớn hơn 0."
        : profileForm.deductions_enabled && !(Number(profileForm.fixed_deduction_amount)>0) ? "Khấu trừ cố định đang bật cần có số tiền lớn hơn 0." : null)
    : null;
  const allProfileRows = filtered.map((worker) => {
    const assignment = latestWorkerVersion(assignments, worker.id, "APPROVED", today());
    const compensationType = assignment?.compensation_type ?? worker.current_compensation_type;
    const profile = latestWorkerVersion(profiles, worker.id, "APPROVED", today());
    const primaryRate = compensationType ? latestWorkerVersion(workerRates.filter((rate) => rate.compensation_type === compensationType), worker.id, "APPROVED", today()) : undefined;
    const insuranceVersion = latestWorkerVersion(insurance, worker.id, "APPROVED", today());
    const workerAdjustments = adjustments.filter((item) => item.worker_id === worker.id && !["REJECTED", "LOCKED"].includes(item.status));
    const issues: string[] = [];
    if (!assignment) issues.push("Thiếu phân loại lương đã duyệt");
    if (!(assignment?.payroll_policy_group_id || worker.current_policy_group_id)) issues.push("Thiếu nhóm chính sách");
    if (compensationType === "PIECE_RATE" && approvedProductRates.length === 0) issues.push("Thiếu đơn giá sản phẩm");
    if (compensationType && compensationType !== "PIECE_RATE" && !primaryRate) issues.push("Thiếu mức lương chính");
    if (isLocalBackend() && !profile) issues.push("Thiếu cấu hình nguồn bổ sung đã duyệt");
    if (profile?.piece_output_enabled && approvedProductRates.length === 0) issues.push("Nguồn sản lượng chưa có đơn giá");
    if (canManageInsurance && profile?.insurance_enabled && !insuranceVersion) issues.push("BHXH chưa được duyệt");
    if (profile?.allowances_enabled && profile.fixed_allowance_amount <= 0) issues.push("Phụ cấp cố định chưa có số tiền");
    if (profile?.deductions_enabled && profile.fixed_deduction_amount <= 0) issues.push("Khấu trừ cố định chưa có số tiền");
    return { worker, assignment, compensationType, profile, primaryRate, insuranceVersion, workerAdjustments, issues, draftCount: draftCountFor(worker.id), group: groupMap.get(assignment?.payroll_policy_group_id ?? worker.current_policy_group_id ?? "") };
  });
  const profileRows = allProfileRows.filter((row) =>
    (readinessFilter === "ALL" || (readinessFilter === "READY" ? row.issues.length === 0 : row.issues.length > 0))
    && (draftFilter === "ALL" || (draftFilter === "DRAFT" ? row.draftCount > 0 : row.draftCount === 0))
    && (compensationFilter === "ALL" || row.compensationType === compensationFilter)
    && (payrollStatusFilter === "ALL" || row.worker.payroll_status === payrollStatusFilter),
  );
  const visibleWorkerIds = new Set(profileRows.map((row) => row.worker.id));
  const visibleAssignments = assignments.filter((item) => visibleWorkerIds.has(item.worker_id));
  const visibleTeams = teams.filter((item) => visibleWorkerIds.has(item.worker_id) || visibleWorkerIds.has(item.supervisor_worker_id));
  const missingCentralPermissions = [
    !canManage && "quản lý nhân sự", !canManagePolicies && "quản lý chính sách",
    !canManageRates && "quản lý mức lương",
  ].filter(Boolean);
  const centralProfileMissing = profileForm ? [
    !profileForm.compensation_type && "Chọn hình thức lương chính",
    !profileForm.payroll_policy_group_id && "Chọn nhóm chính sách",
    !profileForm.effective_from && "Điền ngày bắt đầu hiệu lực",
    !profileForm.reason.trim() && "Ghi lý do thay đổi",
    profileForm.compensation_type && profileForm.compensation_type !== "PIECE_RATE" && !(Number(profileForm.primary_amount) > 0) && "Điền mức lương chính lớn hơn 0 đồng",
    canManageInsurance && profileForm.insurance_enabled && !(Number(profileForm.insurance_amount) > 0) && "Điền mức BHXH lớn hơn 0 đồng",
    canManageInsurance && profileForm.insurance_enabled && !profileForm.insurance_source_reference.trim() && "Điền nguồn tham chiếu BHXH",
    centralProfileIssue,
  ].filter((item): item is string => typeof item === "string" && item.length > 0) : [];
  const workerFilterControls = <div className="grid w-full min-w-0 grid-cols-2 gap-2 lg:w-auto lg:flex lg:flex-wrap">
          <Select value={readinessFilter} onValueChange={setReadinessFilter}><SelectTrigger aria-label="Lọc độ hoàn thiện" className="lg:w-[155px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Độ hoàn thiện: tất cả</SelectItem><SelectItem value="READY">Đã thiết lập cơ bản</SelectItem><SelectItem value="NEEDS_ACTION">Cần hoàn thiện</SelectItem></SelectContent></Select>
          <Select value={draftFilter} onValueChange={setDraftFilter}><SelectTrigger aria-label="Lọc bản nháp" className="lg:w-[140px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Bản nháp: tất cả</SelectItem><SelectItem value="DRAFT">Có bản nháp</SelectItem><SelectItem value="NO_DRAFT">Không có nháp</SelectItem></SelectContent></Select>
          <Select value={compensationFilter} onValueChange={setCompensationFilter}><SelectTrigger aria-label="Lọc hình thức lương" className="lg:w-[170px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Mọi hình thức lương</SelectItem>{Object.entries(compensationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          <Select value={payrollStatusFilter} onValueChange={setPayrollStatusFilter}><SelectTrigger aria-label="Lọc trạng thái lương" className="lg:w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Trạng thái: tất cả</SelectItem><SelectItem value="ACTIVE">Đang tính lương</SelectItem><SelectItem value="SUSPENDED">Tạm dừng</SelectItem><SelectItem value="TERMINATED">Đã nghỉ việc</SelectItem></SelectContent></Select>
        </div>;
  const workerActions = (row: typeof profileRows[number]) => <div className="flex flex-wrap justify-end gap-1">
    {row.draftCount > 0 && canConfigureCentralProfile && <Button size="sm" variant="outline" onClick={() => { if (dataReady) setBundleWorker(row.worker.id); }}><Check className="mr-1 h-3.5 w-3.5" />Đối chiếu {row.draftCount} nháp</Button>}
    {canConfigureCentralProfile && <Button size="sm" onClick={() => openCentralProfile(row.worker)}><Settings2 className="mr-1 h-3.5 w-3.5" />Thiết lập</Button>}
    {canManagePolicies && !canConfigureCentralProfile && <Button size="sm" variant="outline" onClick={() => setAssignmentForm({ worker_id: row.worker.id, compensation_type: row.compensationType ?? "", payroll_policy_group_id: row.assignment?.payroll_policy_group_id ?? row.worker.current_policy_group_id ?? "", effective_from: today(), effective_to: "", reason: "" })}>Phân loại</Button>}
    {canManage && <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" aria-label={`Sửa hồ sơ ${row.worker.display_name}`} title="Sửa hồ sơ nhân sự" onClick={() => setWorkerForm({ id: row.worker.id, location_code: row.worker.location_code ?? "", position_title: row.worker.position_title ?? "", employment_start_date: row.worker.employment_start_date ?? "", employment_end_date: row.worker.employment_end_date ?? "", payroll_status: row.worker.payroll_status, reason: "" })}><Pencil className="h-4 w-4" /></Button>}
  </div>;
  const primaryPayLabel = (row: typeof profileRows[number]) => row.compensationType === "PIECE_RATE"
    ? `${approvedProductRates.length} đơn giá sản phẩm`
    : row.primaryRate ? `${money.format(row.compensationType === "HOURLY" ? row.primaryRate.hourly_rate ?? 0 : row.primaryRate.monthly_rate ?? 0)} / ${row.compensationType === "HOURLY" ? "giờ" : "tháng"}` : "Chưa có mức lương";


  if (!dataReady) return <Alert variant={dataError ? "destructive" : "default"}>
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>{dataError ? "Chưa tải đủ hồ sơ lương" : "Đang tải đầy đủ hồ sơ lương…"}</AlertTitle>
    <AlertDescription className="space-y-2"><p>{dataError ? errorMessage(dataError) : "Chờ các danh mục theo quyền tải xong trước khi thiết lập, chỉnh sửa hoặc duyệt."}</p><Button variant="outline" size="sm" onClick={() => void refresh()}>Thử tải lại</Button></AlertDescription>
  </Alert>;

  return (
    <div className="space-y-5">
      <TableToolbar>
        <div className="relative min-w-0 flex-1 lg:min-w-[240px] lg:max-w-xs"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Tìm nhân sự" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, tên hoặc vị trí" className="pl-9" /></div>
        <div className="hidden min-w-0 lg:block">{workerFilterControls}</div>
        <Button variant="outline" className="shrink-0 lg:hidden" aria-expanded={mobileFiltersOpen} aria-controls="payroll-worker-filters" onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}><Filter className="mr-1 h-4 w-4" />Bộ lọc{[readinessFilter, draftFilter, compensationFilter, payrollStatusFilter].some((value) => value !== "ALL") && <span className="ml-1">({[readinessFilter, draftFilter, compensationFilter, payrollStatusFilter].filter((value) => value !== "ALL").length})</span>}</Button>
        {mobileFiltersOpen && <div id="payroll-worker-filters" className="w-full lg:hidden">{workerFilterControls}</div>}
        {(search || [readinessFilter, draftFilter, compensationFilter, payrollStatusFilter].some((value) => value !== "ALL")) && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setReadinessFilter("ALL"); setDraftFilter("ALL"); setCompensationFilter("ALL"); setPayrollStatusFilter("ALL"); }}>Xóa lọc</Button>}
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          {canManagePolicies && <Button variant="outline" size="sm" onClick={() => setAssignmentForm({ worker_id: "", compensation_type: "", payroll_policy_group_id: "", effective_from: today(), effective_to: "", reason: "" })}><Plus className="mr-1 h-4 w-4" />Phân loại lương</Button>}
          {canManage && <Button variant="outline" size="sm" onClick={() => { setTeamForm({ supervisor_worker_id: "", worker_id: "", effective_from: today(), effective_to: "", reason: "" }); setTeamOpen(true); }}><Network className="mr-1 h-4 w-4" />Phân công tổ</Button>}
        </div>
      </TableToolbar>
      {isLocalBackend() && !canConfigureCentralProfile && missingCentralPermissions.length > 0 && <p className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">Thiết lập hồ sơ tập trung cần đủ quyền: {missingCentralPermissions.join(", ")}. Bạn vẫn có thể thao tác các phần đã được cấp quyền.</p>}

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b px-3 py-3 sm:px-4"><div><h3 className="hidden text-base font-semibold lg:block">Hồ sơ lương tập trung</h3></div><div className="flex gap-2"><Badge className="bg-emerald-600">{profileRows.filter((row) => row.issues.length === 0).length} đã thiết lập cơ bản</Badge><Badge variant="outline">{profileRows.filter((row) => row.issues.length > 0).length} cần hoàn thiện</Badge></div></div>
        <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
          {profileRows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Không có nhân sự phù hợp bộ lọc.</p>}
          {profileRows.map((row) => <article key={row.worker.id} className="rounded-lg border bg-background p-3">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="break-words font-semibold">{row.worker.display_name}</h4><p className="text-xs text-muted-foreground">{row.worker.employee_code} · {row.worker.position_title || "Chưa có vị trí"}</p></div>{statusBadge(row.worker.payroll_status)}</div>
            <p className="mt-3 text-sm">{row.compensationType ? compensationLabels[row.compensationType] : "Chưa phân loại lương"}</p><p className="font-semibold tabular-nums">{primaryPayLabel(row)}</p>
            <div className="my-3">{row.issues.length === 0 ? <Badge className="bg-emerald-600">Đã thiết lập · chưa kiểm tra kỳ</Badge> : <Badge variant="outline" className="text-amber-800">{row.issues.length} mục cần hoàn thiện</Badge>}</div>
            {workerActions(row)}
            <details className="mt-3 border-t pt-2"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Xem đầy đủ hồ sơ</summary>
              <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-2 text-sm [&_dt]:text-muted-foreground [&_dd]:min-w-0 [&_dd]:break-words">
                <dt>Cơ sở / vị trí</dt><dd>{row.worker.location_code || "Chưa có"} / {row.worker.position_title || "Chưa có"}</dd>
                <dt>Ngày vào / nghỉ</dt><dd>{row.worker.employment_start_date || "Chưa có"} / {row.worker.employment_end_date || "Chưa nghỉ"}</dd>
                <dt>Nhóm chính sách</dt><dd>{row.group ? `${row.group.code} · ${row.group.name}` : "Chưa gán"}</dd>
                <dt>Nguồn bổ sung</dt><dd>{[row.profile?.piece_output_enabled && "Sản lượng", row.profile?.overtime_enabled && "Tăng ca", row.profile?.meal_enabled && "Tiền ăn", row.profile?.allowances_enabled && "Phụ cấp", row.profile?.deductions_enabled && "Khấu trừ"].filter(Boolean).join(", ") || (row.profile ? "Không áp dụng" : "Chưa duyệt cấu hình")}</dd>
                <dt>BHXH</dt><dd>{!canManageInsurance?"Theo quyền bảo hiểm":row.profile?.insurance_enabled ? row.insuranceVersion ? money.format(row.insuranceVersion.employee_amount) : "Chờ cấu hình" : "Không áp dụng"}</dd>
                <dt>Phụ cấp cố định</dt><dd>+{money.format(row.profile?.allowances_enabled ? row.profile.fixed_allowance_amount : 0)}</dd>
                <dt>Khấu trừ cố định</dt><dd>−{money.format(row.profile?.deductions_enabled ? row.profile.fixed_deduction_amount : 0)}</dd>
                <dt>Hiệu lực</dt><dd>{row.assignment ? `${row.assignment.effective_from} đến ${row.assignment.effective_to || "không giới hạn"}` : "Chưa có"}</dd>
                <dt>Bản nháp</dt><dd>{row.draftCount}</dd>
              </dl>
              {row.issues.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-amber-800">{row.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
            </details>
          </article>)}
        </div>
      </div>

      <details className="rounded-xl border bg-card p-3 sm:p-4">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Lịch sử phân loại lương <span className="ml-2 text-sm font-normal text-muted-foreground">({visibleAssignments.length}/{assignments.length} phiên bản)</span></summary>
      <div className="mb-4"><p className="text-sm text-muted-foreground">Theo dõi các phiên bản lương theo thời gian</p></div>
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Nhân sự</TableHead><TableHead>Loại lương</TableHead><TableHead>Hiệu lực</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader>
          <TableBody>
            {visibleAssignments.length === 0 && <EmptyRow columns={5} message="Không có phân loại lương phù hợp bộ lọc." />}
            {visibleAssignments.map((assignment) => <TableRow key={assignment.id}>
              <TableCell>{workerName(assignment.worker_id)}</TableCell><TableCell>{compensationLabels[assignment.compensation_type]}</TableCell>
              <TableCell>{assignment.effective_from} → {assignment.effective_to || "không giới hạn"}</TableCell><TableCell>{statusBadge(assignment.status)}</TableCell>
              <TableCell className="space-x-1 text-right">{canManagePolicies && assignment.status === "DRAFT" && <>
                <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" title="Sửa nháp" onClick={() => setAssignmentForm({ id: assignment.id, worker_id: assignment.worker_id, compensation_type: assignment.compensation_type, payroll_policy_group_id: assignment.payroll_policy_group_id, effective_from: assignment.effective_from, effective_to: assignment.effective_to ?? "", reason: assignment.reason })}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" title="Duyệt" onClick={() => requestAction({ title: "Duyệt phân loại lương", description: "Phiên bản cũ bị kết thúc tự động nếu khoảng hiệu lực nối tiếp.", confirmLabel: "Duyệt", run: (reason) => approveWorkerCompensationAssignment(assignment.id, reason) })}><Check className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" title="Hủy nháp" onClick={() => requestAction({ title: "Hủy phân loại nháp", description: "Bản nháp sẽ bị xóa và lưu dấu vết kiểm toán.", confirmLabel: "Hủy nháp", destructive: true, run: (reason) => discardWorkerCompensationAssignmentDraft(assignment.id, reason) })}><Trash2 className="h-4 w-4" /></Button>
              </>}</TableCell>
            </TableRow>)}
          </TableBody></Table>
        </div>
      </details>

      <details className="rounded-xl border bg-card p-3 sm:p-4">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Phạm vi tổ phụ trách <span className="ml-2 text-sm font-normal text-muted-foreground">({visibleTeams.length}/{teams.length} phân công)</span></summary>
      <div className="mb-4"><p className="text-sm text-muted-foreground">Quản lý quan hệ tổ trưởng và nhân sự</p></div>
        <div className="overflow-x-auto"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Tổ trưởng</TableHead><TableHead>Nhân sự</TableHead><TableHead>Hiệu lực</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>
          {visibleTeams.length === 0 && <EmptyRow columns={5} message="Không có phân công tổ phù hợp bộ lọc." />}
          {visibleTeams.map((team) => <TableRow key={team.id}><TableCell>{workerName(team.supervisor_worker_id)}</TableCell><TableCell>{workerName(team.worker_id)}</TableCell><TableCell>{team.effective_from} → {team.effective_to || "không giới hạn"}</TableCell><TableCell>{statusBadge(team.status)}</TableCell><TableCell className="text-right">{canManage && team.status === "ACTIVE" && <Button variant="outline" size="sm" onClick={() => requestAction({ title: "Kết thúc phân công tổ", description: "Ngày kết thúc mặc định là hôm nay.", confirmLabel: "Kết thúc", destructive: true, run: (reason) => retirePayrollTeamAssignment(team.id, today(), reason) })}>Kết thúc</Button>}</TableCell></TableRow>)}
        </TableBody></Table></div>
      </details>

      {bundleWorker&&<PayrollBundleReview key={bundleWorker} workerId={bundleWorker} workerName={workerName(bundleWorker)} groups={groups} versions={{assignment_id:assignments.filter(row=>row.worker_id===bundleWorker&&row.status==='DRAFT'),profile_id:profiles.filter(row=>row.worker_id===bundleWorker&&row.status==='DRAFT'),rate_id:workerRates.filter(row=>row.worker_id===bundleWorker&&row.status==='DRAFT'),...(canManageInsurance?{insurance_id:insurance.filter(row=>row.worker_id===bundleWorker&&row.status==='DRAFT')}:{})}} onClose={()=>setBundleWorker(null)} onApproved={refresh} />}
      {workerParams.get('worker')&&<Button variant="outline" onClick={()=>{const next=new URLSearchParams(workerParams);next.delete('worker');setWorkerParams(next);}}>Xem tất cả nhân sự</Button>}
      <Dialog open={!!profileForm} onOpenChange={(open) => !open && !saveCentralProfile.isPending && setProfileForm(null)}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>Thiết lập hồ sơ lương</DialogTitle><DialogDescription>Thiết lập hồ sơ nhân sự, lương chính và các nguồn cộng trừ bổ sung. Thông tin nhân sự áp dụng ngay khi lưu; phiên bản lương và BHXH chờ duyệt.</DialogDescription></DialogHeader>{profileForm && <div className="space-y-5">
        <ol className="grid grid-cols-3 gap-2 text-xs">{['Cách trả lương','Các khoản áp dụng','Kiểm tra & lưu nháp'].map((label,index)=><li key={label}><Button size="sm" variant={profileStep===index?'default':'outline'} className="h-auto w-full whitespace-normal" onClick={()=>setProfileStep(index)}>{index+1}. {label}</Button></li>)}</ol>
        {profileStep===2&&<div className="space-y-2 rounded border p-3 text-sm"><h4 className="font-semibold">3. Kiểm tra thay đổi trước khi lưu</h4><p>Cách trả: {compensationLabels[profileForm.compensation_type as CompensationType]||'Chưa chọn'} · Mức mới: {profileForm.primary_amount?money.format(Number(profileForm.primary_amount)):'Theo bảng giá sản phẩm'}</p><p>Mức cũ: {(()=>{const old=latestWorkerVersion(workerRates,profileForm.worker_id,'APPROVED',profileForm.effective_from);return old?money.format(Number(old.monthly_rate??old.hourly_rate??0)):'Chưa có';})()}</p><p>Hiệu lực: {profileForm.effective_from} → {profileForm.effective_to||'không giới hạn'}. Sau lưu, mở “Đối chiếu nháp” để duyệt đúng bộ.</p><p>Thông tin nhân sự áp dụng ngay: cơ sở {profileForm.location_code||'Chưa gán'}, vào làm {profileForm.employment_start_date||'Chưa có'}, trạng thái {profileForm.payroll_status}.</p>{!canManageInsurance&&<p>BHXH giữ nguyên trên máy chủ; tài khoản này không chỉnh sửa khoản bảo hiểm. Ngân hàng xác minh ở danh mục riêng.</p>}</div>}
        <div className="rounded-lg border bg-muted/30 p-3"><div className="font-medium">{workerName(profileForm.worker_id)}</div><p className="text-xs text-muted-foreground">Lương và khoản cố định lưu nháp; cơ sở, ngày làm và trạng thái nhân sự áp dụng ngay.</p></div>
        <div className={profileStep===0?"space-y-3":"hidden"}><div><h4 className="font-medium">Thông tin nhân sự · áp dụng ngay khi lưu</h4><p className="text-xs text-muted-foreground">Thông tin nền dùng chung cho chấm công và tính lương.</p></div><div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Cơ sở</Label><Input value={profileForm.location_code} onChange={(event) => setProfileForm({ ...profileForm, location_code: event.target.value })} /></div>
          <div className="space-y-1.5"><Label>Vị trí</Label><Input value={profileForm.position_title} onChange={(event) => setProfileForm({ ...profileForm, position_title: event.target.value })} /></div>
          <div className="space-y-1.5"><Label>Ngày vào làm</Label><Input type="date" value={profileForm.employment_start_date} onChange={(event) => setProfileForm({ ...profileForm, employment_start_date: event.target.value })} /></div>
          <div className="space-y-1.5"><Label>Ngày nghỉ việc</Label><Input type="date" value={profileForm.employment_end_date} onChange={(event) => setProfileForm({ ...profileForm, employment_end_date: event.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Trạng thái lương</Label><Select value={profileForm.payroll_status} onValueChange={(value: PayrollWorker["payroll_status"]) => setProfileForm({ ...profileForm, payroll_status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Hoạt động</SelectItem><SelectItem value="SUSPENDED">Tạm dừng</SelectItem><SelectItem value="TERMINATED">Đã nghỉ</SelectItem></SelectContent></Select></div>
        </div></div>
        <div className={profileStep===0?"space-y-3":"hidden"}><div><h4 className="font-medium">1. Cách trả lương · lưu phiên bản nháp</h4><p className="text-xs text-muted-foreground">Mỗi nhân sự chỉ có một hình thức lương chính tại một thời điểm.</p></div><div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Hình thức lương chính</Label><Select value={profileForm.compensation_type} onValueChange={(value: CompensationType) => setProfileForm({ ...profileForm, compensation_type: value, selected_drafts:{...profileForm.selected_drafts,rate_id:null}, primary_amount: "", piece_output_enabled: value === "PIECE_RATE" ? true : profileForm.piece_output_enabled })}><SelectTrigger><SelectValue placeholder="Chọn hình thức lương" /></SelectTrigger><SelectContent>{Object.entries(compensationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Nhóm chính sách</Label><Select value={profileForm.payroll_policy_group_id} onValueChange={(value) => setProfileForm({ ...profileForm, payroll_policy_group_id: value })}><SelectTrigger><SelectValue placeholder="Chọn nhóm chính sách" /></SelectTrigger><SelectContent>{groups.filter((group) => group.is_active).map((group) => <SelectItem key={group.id} value={group.id}>{group.code} - {group.name}</SelectItem>)}</SelectContent></Select></div>
          {profileForm.compensation_type && profileForm.compensation_type !== "PIECE_RATE" && <div className="space-y-1.5"><Label>{profileForm.compensation_type === "HOURLY" ? "Đơn giá giờ (đồng/giờ)" : "Mức lương tháng (đồng/tháng)"}</Label><Input type="number" min="0" value={profileForm.primary_amount} onChange={(event) => setProfileForm({ ...profileForm, primary_amount: event.target.value })} /></div>}
          {profileForm.compensation_type && profileForm.compensation_type !== "HOURLY" && profileForm.compensation_type !== "PIECE_RATE" && <div className="space-y-1.5"><Label>Phút năng suất chuẩn / tháng</Label><p className="text-xs text-muted-foreground">Tổng phút làm việc chuẩn trong tháng, dùng làm căn cứ phân bổ chi phí.</p><Input type="number" min="1" value={profileForm.monthly_productive_minutes} onChange={(event) => setProfileForm({ ...profileForm, monthly_productive_minutes: event.target.value })} /></div>}
          <div className="space-y-1.5"><Label>Hiệu lực từ</Label><Input type="date" value={profileForm.effective_from} onChange={(event) => setProfileForm({ ...profileForm, effective_from: event.target.value })} /></div>
          <div className="space-y-1.5"><Label>Đến ngày</Label><Input type="date" value={profileForm.effective_to} onChange={(event) => setProfileForm({ ...profileForm, effective_to: event.target.value })} /></div>
        </div></div>
        <div className={profileStep===1?"space-y-3":"hidden"}><div><h4 className="font-medium">2. Các khoản áp dụng</h4><p className="text-xs text-muted-foreground">Mỗi nguồn được bật độc lập và chỉ áp dụng sau khi phiên bản được duyệt.</p></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[{ key: "piece_output_enabled", label: "Sản lượng sản phẩm", hint: "Từ sản lượng đã duyệt" }, { key: "overtime_enabled", label: "Tăng ca", hint: "Theo chính sách chung đã duyệt" }, { key: "meal_enabled", label: "Tiền ăn", hint: "Theo ngày đủ điều kiện" }, { key: "allowances_enabled", label: "Phụ cấp cố định", hint: "Cộng mỗi kỳ" }, { key: "deductions_enabled", label: "Khấu trừ cố định", hint: "Trừ mỗi kỳ" }, { key: "insurance_enabled", label: "BHXH", hint: "Theo phiên bản BHXH" }].filter(source=>source.key!=="insurance_enabled"||canManageInsurance).map((source) => <div key={source.key} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><Label htmlFor={`profile-${source.key}`}>{source.label}</Label><p className="text-xs text-muted-foreground">{source.hint}</p></div><Switch id={`profile-${source.key}`} checked={Boolean(profileForm[source.key as keyof CentralPayrollProfileForm])} onCheckedChange={(checked) => setProfileForm({ ...profileForm, [source.key]: checked })} /></div>)}
        </div><div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Phụ cấp cố định / kỳ (đồng)</Label><Input type="number" min="0" disabled={!profileForm.allowances_enabled} value={profileForm.fixed_allowance_amount} onChange={(event) => setProfileForm({ ...profileForm, fixed_allowance_amount: event.target.value })} /></div>
          <div className="space-y-1.5"><Label>Khấu trừ cố định / kỳ (đồng)</Label><Input type="number" min="0" disabled={!profileForm.deductions_enabled} value={profileForm.fixed_deduction_amount} onChange={(event) => setProfileForm({ ...profileForm, fixed_deduction_amount: event.target.value })} /></div>
        </div></div>
        {canManageInsurance && profileForm.insurance_enabled && profileStep===1 && <div className="space-y-3"><h4 className="font-medium">4. Bảo hiểm</h4><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Mức BHXH nhân viên</Label><Input type="number" min="0" value={profileForm.insurance_amount} onChange={(event) => setProfileForm({ ...profileForm, insurance_amount: event.target.value })} /></div><div className="space-y-1.5"><Label>Nguồn tham chiếu BHXH</Label><Input value={profileForm.insurance_source_reference} onChange={(event) => setProfileForm({ ...profileForm, insurance_source_reference: event.target.value })} /></div></div></div>}
        <div className={profileStep===2?"grid gap-3 sm:grid-cols-2":"hidden"}><div className="space-y-1.5"><Label>Nguồn tham chiếu</Label><Input value={profileForm.source_reference} onChange={(event) => setProfileForm({ ...profileForm, source_reference: event.target.value })} placeholder="Quyết định / hợp đồng / hồ sơ" /></div><div className="space-y-1.5"><Label>Lý do thay đổi</Label><Textarea value={profileForm.reason} onChange={(event) => setProfileForm({ ...profileForm, reason: event.target.value })} placeholder="Bắt buộc để lưu nhật ký" /></div></div>
        </div>}
        {centralProfileMissing.length > 0 && <Alert id="central-profile-requirements" tabIndex={-1} className="border-amber-200 bg-amber-50"><AlertTitle>Cần hoàn thiện trước khi lưu</AlertTitle><AlertDescription><ul className="list-disc space-y-1 pl-4">{centralProfileMissing.map((issue) => <li key={issue}>{issue}</li>)}</ul></AlertDescription></Alert>}
        <DialogFooter className="flex-col items-stretch sm:flex-col">
          {centralProfileMissing.length > 0 && <div className="flex w-full items-center justify-between gap-2 text-xs text-amber-800"><span>Còn {centralProfileMissing.length} mục cần hoàn thiện</span><Button variant="ghost" size="sm" onClick={() => { const requirements = document.getElementById("central-profile-requirements"); requirements?.scrollIntoView({ block: "center", behavior: "smooth" }); requirements?.focus({ preventScroll: true }); }}>Xem yêu cầu</Button></div>}
          <div className="flex w-full gap-2"><Button className="min-w-20" variant="outline" disabled={saveCentralProfile.isPending} onClick={() => setProfileForm(null)}>Hủy</Button><Button variant="outline" disabled={profileStep===0||saveCentralProfile.isPending} onClick={()=>setProfileStep(step=>step-1)}>Quay lại</Button>{profileStep<2?<Button className="flex-1" onClick={()=>setProfileStep(step=>step+1)}>Tiếp tục</Button>:<Button className="min-w-0 flex-1" title="Lưu các phiên bản nháp" aria-label="Lưu các phiên bản nháp" disabled={centralProfileMissing.length > 0 || saveCentralProfile.isPending} onClick={() => profileForm && saveCentralProfile.mutate(profileForm)}>{saveCentralProfile.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lưu nháp</Button>}</div>
        </DialogFooter></DialogContent></Dialog>

      <Dialog open={!!workerForm} onOpenChange={(open) => !open && !saveWorker.isPending && setWorkerForm(null)}><DialogContent><DialogHeader><DialogTitle>Cập nhật hồ sơ nhân sự</DialogTitle></DialogHeader>{workerForm && <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Cơ sở</Label><Input value={workerForm.location_code} onChange={(e) => setWorkerForm({ ...workerForm, location_code: e.target.value })} /></div>
        <div className="space-y-2"><Label>Vị trí</Label><Input value={workerForm.position_title} onChange={(e) => setWorkerForm({ ...workerForm, position_title: e.target.value })} /></div>
        <div className="space-y-2"><Label>Ngày bắt đầu</Label><Input type="date" value={workerForm.employment_start_date} onChange={(e) => setWorkerForm({ ...workerForm, employment_start_date: e.target.value })} /></div>
        <div className="space-y-2"><Label>Ngày nghỉ việc</Label><Input type="date" value={workerForm.employment_end_date} onChange={(e) => setWorkerForm({ ...workerForm, employment_end_date: e.target.value })} /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Trạng thái lương</Label><Select value={workerForm.payroll_status} onValueChange={(value: WorkerForm["payroll_status"]) => setWorkerForm({ ...workerForm, payroll_status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Hoạt động</SelectItem><SelectItem value="SUSPENDED">Tạm dừng</SelectItem><SelectItem value="TERMINATED">Đã nghỉ</SelectItem></SelectContent></Select></div>
        <div className="space-y-2 sm:col-span-2"><Label>Lý do thay đổi</Label><Textarea value={workerForm.reason} onChange={(e) => setWorkerForm({ ...workerForm, reason: e.target.value })} /></div>
      </div>}{workerMasterIssue&&<p role="alert" className="text-sm text-destructive">{workerMasterIssue}</p>}<DialogFooter><Button variant="outline" disabled={saveWorker.isPending} onClick={() => setWorkerForm(null)}>Hủy</Button><Button disabled={!workerForm?.reason.trim() || !!workerMasterIssue || saveWorker.isPending} onClick={() => workerForm && saveWorker.mutate(workerForm)}>{saveWorker.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lưu</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={!!assignmentForm} onOpenChange={(open) => !open && !saveAssignment.isPending && setAssignmentForm(null)}><DialogContent><DialogHeader><DialogTitle>{assignmentForm?.id ? "Sửa phân loại nháp" : "Tạo phân loại lương"}</DialogTitle></DialogHeader>{assignmentForm && <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label>Nhân sự</Label><Select disabled={!!assignmentForm.id} value={assignmentForm.worker_id} onValueChange={(value) => setAssignmentForm({ ...assignmentForm, worker_id: value })}><SelectTrigger><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger><SelectContent>{workers.filter(worker=>!isLocalBackend()||!workerParams.get("worker")||worker.id===workerParams.get("worker")).map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} - {worker.display_name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Hình thức lương</Label><Select value={assignmentForm.compensation_type} onValueChange={(value: CompensationType) => setAssignmentForm({ ...assignmentForm, compensation_type: value })}><SelectTrigger><SelectValue placeholder="Chọn hình thức lương" /></SelectTrigger><SelectContent>{Object.entries(compensationLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Nhóm chính sách</Label><Select value={assignmentForm.payroll_policy_group_id} onValueChange={(value) => setAssignmentForm({ ...assignmentForm, payroll_policy_group_id: value })}><SelectTrigger><SelectValue placeholder="Chọn nhóm" /></SelectTrigger><SelectContent>{groups.filter((group) => group.is_active).map((group) => <SelectItem key={group.id} value={group.id}>{group.code} - {group.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Từ ngày</Label><Input type="date" value={assignmentForm.effective_from} onChange={(e) => setAssignmentForm({ ...assignmentForm, effective_from: e.target.value })} /></div>
        <div className="space-y-2"><Label>Đến ngày</Label><Input type="date" value={assignmentForm.effective_to} onChange={(e) => setAssignmentForm({ ...assignmentForm, effective_to: e.target.value })} /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Lý do</Label><Textarea value={assignmentForm.reason} onChange={(e) => setAssignmentForm({ ...assignmentForm, reason: e.target.value })} /></div>
      </div>}<DialogFooter><Button variant="outline" disabled={saveAssignment.isPending} onClick={() => setAssignmentForm(null)}>Hủy</Button><Button disabled={!assignmentForm?.compensation_type || !assignmentForm?.worker_id || !assignmentForm?.payroll_policy_group_id || !assignmentForm?.reason.trim() || saveAssignment.isPending} onClick={() => assignmentForm && saveAssignment.mutate(assignmentForm)}>{saveAssignment.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lưu nháp</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={teamOpen} onOpenChange={(open) => !saveTeam.isPending && setTeamOpen(open)}><DialogContent><DialogHeader><DialogTitle>Phân công tổ phụ trách</DialogTitle></DialogHeader><div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Tổ trưởng</Label><Select value={teamForm.supervisor_worker_id} onValueChange={(value) => setTeamForm({ ...teamForm, supervisor_worker_id: value })}><SelectTrigger><SelectValue placeholder="Chọn tổ trưởng" /></SelectTrigger><SelectContent>{workers.filter((worker) => worker.user_id).map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} - {worker.display_name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Nhân sự</Label><Select value={teamForm.worker_id} onValueChange={(value) => setTeamForm({ ...teamForm, worker_id: value })}><SelectTrigger><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger><SelectContent>{workers.filter(worker=>!isLocalBackend()||!workerParams.get("worker")||worker.id===workerParams.get("worker")).map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} - {worker.display_name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Từ ngày</Label><Input type="date" value={teamForm.effective_from} onChange={(e) => setTeamForm({ ...teamForm, effective_from: e.target.value })} /></div>
        <div className="space-y-2"><Label>Đến ngày</Label><Input type="date" value={teamForm.effective_to} onChange={(e) => setTeamForm({ ...teamForm, effective_to: e.target.value })} /></div>
        <div className="space-y-2 sm:col-span-2"><Label>Lý do</Label><Textarea value={teamForm.reason} onChange={(e) => setTeamForm({ ...teamForm, reason: e.target.value })} /></div>
      </div><DialogFooter><Button variant="outline" disabled={saveTeam.isPending} onClick={() => setTeamOpen(false)}>Hủy</Button><Button disabled={!teamForm.supervisor_worker_id || !teamForm.worker_id || !teamForm.reason.trim() || saveTeam.isPending} onClick={() => saveTeam.mutate()}>{saveTeam.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Phân công</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function PolicyGroupsTab({ groups, canManage, refresh }: { groups: PayrollPolicyGroup[]; canManage: boolean; refresh: () => Promise<void> }) {
  const [form, setForm] = useState<{ id?: string; code: string; name: string; description: string; is_active: boolean; reason: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const visibleGroups = groups.filter((group) => {
    const term = normalizeSearchText(search);
    return (!term || normalizeSearchText(`${group.code} ${group.name} ${group.description}`).includes(term))
      && (statusFilter === "ALL" || (statusFilter === "ACTIVE" ? group.is_active : !group.is_active));
  });
  const mutation = useMutation({ mutationFn: (value: NonNullable<typeof form>) => upsertPayrollPolicyGroup(value), onSuccess: async () => { toast.success("Đã lưu nhóm chính sách"); setForm(null); await refresh(); }, onError: (error) => toast.error(errorMessage(error)) });
  return <div className="space-y-4"><TableToolbar><div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã hoặc tên nhóm…" /></div><Select value={statusFilter} onValueChange={(value: typeof statusFilter) => setStatusFilter(value)}><SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả ({groups.length})</SelectItem><SelectItem value="ACTIVE">Đang dùng ({groups.filter((item) => item.is_active).length})</SelectItem><SelectItem value="INACTIVE">Ngừng dùng ({groups.filter((item) => !item.is_active).length})</SelectItem></SelectContent></Select>{(search || statusFilter !== "ALL") && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("ALL"); }}>Xóa lọc</Button>}{canManage && <Button onClick={() => setForm({ code: "", name: "", description: "", is_active: true, reason: "" })}><Plus className="h-4 w-4" />Thêm nhóm</Button>}</TableToolbar><div className="overflow-x-auto border bg-background"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Mã</TableHead><TableHead>Tên nhóm</TableHead><TableHead>Mô tả</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{visibleGroups.length === 0 && <EmptyRow columns={5} message={groups.length ? "Không có nhóm phù hợp." : "Chưa có nhóm chính sách."} />}{visibleGroups.map((group) => <TableRow key={group.id}><TableCell className="font-medium">{group.code}</TableCell><TableCell>{group.name}</TableCell><TableCell>{group.description || "-"}</TableCell><TableCell>{group.is_active ? <Badge>Đang dùng</Badge> : <Badge variant="outline">Ngừng dùng</Badge>}</TableCell><TableCell className="text-right">{canManage && <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" onClick={() => setForm({ id: group.id, code: group.code, name: group.name, description: group.description ?? "", is_active: group.is_active, reason: "" })}><Pencil className="h-4 w-4" /></Button>}</TableCell></TableRow>)}</TableBody></Table></div>
    <Dialog open={!!form} onOpenChange={(open) => !open && !mutation.isPending && setForm(null)}><DialogContent><DialogHeader><DialogTitle>{form?.id ? "Cập nhật nhóm chính sách" : "Thêm nhóm chính sách"}</DialogTitle></DialogHeader>{form && <div className="space-y-4"><div className="space-y-2"><Label>Mã nhóm</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div><div className="space-y-2"><Label>Tên nhóm</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div><div className="space-y-2"><Label>Mô tả</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div><div className="flex items-center justify-between"><Label htmlFor="policy-active">Cho phép sử dụng</Label><Switch id="policy-active" checked={form.is_active} onCheckedChange={(value) => setForm({ ...form, is_active: value })} /></div><div className="space-y-2"><Label>Lý do thay đổi</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div></div>}<DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setForm(null)}>Hủy</Button><Button disabled={!form?.code.trim() || !form?.name.trim() || !form?.reason.trim() || mutation.isPending} onClick={() => form && mutation.mutate(form)}>{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lưu</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

const workerRateTypes: CompensationType[] = ["MONTHLY_MANAGER", "MONTHLY_HELPER", "HOURLY"];
type WorkerRateForm = {
  id?: string; worker_id: string; compensation_type: CompensationType; amount: string;
  monthly_productive_minutes: string; effective_from: string; effective_to: string;
  source_reference: string; reason: string; is_estimated: boolean;
};

function WorkerRatesTab({ workers, rates, canManage, requestAction, refresh }: {
  workers: PayrollWorker[]; rates: WorkerCompensationRate[]; canManage: boolean;
  requestAction: RequestAction; refresh: () => Promise<void>;
}) {
  const eligibleWorkers = workers.filter((worker) => worker.current_compensation_type !== "PIECE_RATE");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [workerFilter, setWorkerFilter] = useState("ALL");
  const [form, setForm] = useState<WorkerRateForm | null>(null);
  const visibleRates = rates.filter((rate) => {
    const worker = workers.find((item) => item.id === rate.worker_id);
    const term = normalizeSearchText(search);
    return rate.compensation_type !== "PIECE_RATE" && (workerFilter === "ALL" || rate.worker_id === workerFilter)
      && (statusFilter === "ALL" || rate.status === statusFilter)
      && (!term || normalizeSearchText(`${worker?.display_name} ${worker?.employee_code} ${rate.source_reference}`).includes(term));
  });
  const workerName = (id: string) => workers.find((worker) => worker.id === id)?.display_name ?? id;
  const amountFor = (rate: WorkerCompensationRate) => rate.compensation_type === "HOURLY" ? rate.hourly_rate : rate.monthly_rate;
  const mutation = useMutation({
    mutationFn: (value: WorkerRateForm) => {
      const input = {
        effective_from: value.effective_from,
        effective_to: value.effective_to || null,
        hourly_rate: value.compensation_type === "HOURLY" ? Number(value.amount) : null,
        monthly_rate: value.compensation_type === "HOURLY" ? null : Number(value.amount),
        piece_rate: null,
        monthly_productive_minutes: value.compensation_type === "HOURLY" ? null : Number(value.monthly_productive_minutes),
        source_reference: value.source_reference || null,
        reason: value.reason,
        is_estimated: value.is_estimated,
      };
      return value.id
        ? updateWorkerPayrollRateDraft({ id: value.id, ...input })
        : createWorkerPayrollRateDraft({ worker_id: value.worker_id, compensation_type: value.compensation_type, ...input });
    },
    onSuccess: async () => { toast.success("Đã lưu mức lương nháp"); setForm(null); await refresh(); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const openCreate = () => {
    const worker = eligibleWorkers[0];
    const currentType = worker?.current_compensation_type;
    const compensationType = currentType && workerRateTypes.includes(currentType) ? currentType : "MONTHLY_HELPER";
    setForm({ worker_id: worker?.id ?? "", compensation_type: compensationType, amount: "", monthly_productive_minutes: "", effective_from: today(), effective_to: "", source_reference: "luong_tong", reason: "", is_estimated: false });
  };
  const formValid = !!form?.worker_id && !!form.amount && Number(form.amount) >= 0 && !!form.effective_from
    && !!form.reason.trim() && (form.compensation_type === "HOURLY" || Number(form.monthly_productive_minutes) > 0);

  return <div className="space-y-4">
    <TableToolbar><div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên hoặc mã nhân sự…" /></div><Select value={workerFilter} onValueChange={setWorkerFilter}><SelectTrigger className="h-9 w-[210px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả nhân sự</SelectItem>{workers.map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} - {worker.display_name}</SelectItem>)}</SelectContent></Select><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Mọi trạng thái</SelectItem><SelectItem value="DRAFT">Nháp</SelectItem><SelectItem value="APPROVED">Đã duyệt</SelectItem></SelectContent></Select>{(search || workerFilter !== "ALL" || statusFilter !== "ALL") && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setWorkerFilter("ALL"); setStatusFilter("ALL"); }}>Xóa lọc</Button>}{canManage && <Button onClick={openCreate} disabled={!eligibleWorkers.length}><Plus className="h-4 w-4" />Thêm mức lương</Button>}</TableToolbar>
    <p className="text-xs text-muted-foreground">Đơn giá sản phẩm: <Link className="font-medium text-primary underline underline-offset-2" to="/payroll-settings?tab=rates">Bảng giá công may</Link></p>
    <div className="overflow-x-auto border bg-background"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Nhân sự</TableHead><TableHead>Hình thức</TableHead><TableHead>Mức lương</TableHead><TableHead>Phút chuẩn/tháng</TableHead><TableHead>Hiệu lực</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>
      {visibleRates.length === 0 && <EmptyRow columns={7} message="Chưa có mức lương tháng hoặc giờ." />}
      {visibleRates.map((rate) => <TableRow key={rate.id}><TableCell>{workerName(rate.worker_id)}</TableCell><TableCell>{compensationLabels[rate.compensation_type]}</TableCell><TableCell className="font-medium">{money.format(amountFor(rate) ?? 0)}{rate.compensation_type === "HOURLY" ? "/giờ" : "/tháng"}{rate.is_estimated && <div className="text-xs text-amber-700">Ước tính</div>}</TableCell><TableCell>{rate.monthly_productive_minutes ?? "-"}</TableCell><TableCell>{rate.effective_from} → {rate.effective_to || "không giới hạn"}</TableCell><TableCell>{statusBadge(rate.status ?? "APPROVED")}</TableCell><TableCell className="space-x-1 text-right">{canManage && rate.status === "DRAFT" && <><Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" title="Sửa nháp" onClick={() => setForm({ id: rate.id, worker_id: rate.worker_id, compensation_type: rate.compensation_type, amount: String(amountFor(rate) ?? ""), monthly_productive_minutes: String(rate.monthly_productive_minutes ?? ""), effective_from: rate.effective_from, effective_to: rate.effective_to ?? "", source_reference: rate.source_reference ?? "", reason: rate.reason ?? "", is_estimated: rate.is_estimated })}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" title="Duyệt riêng mức lương" aria-label="Duyệt riêng mức lương" onClick={() => requestAction({ title: "Duyệt riêng mức lương", description: "Thao tác này chỉ duyệt đơn giá tháng/giờ. Phân loại lương, nhóm chính sách và các nguồn bổ sung vẫn cần được duyệt ở tab Nhân sự bằng nút số nháp để hồ sơ sẵn sàng tính lương.", confirmLabel: "Duyệt riêng", run: (reason) => approveWorkerPayrollRate(rate.id, reason) })}><Check className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" title="Hủy nháp" onClick={() => requestAction({ title: "Hủy mức lương nháp", description: "Bản nháp sẽ bị xóa và lưu vào nhật ký.", confirmLabel: "Hủy nháp", destructive: true, run: (reason) => discardWorkerPayrollRateDraft(rate.id, reason) })}><Trash2 className="h-4 w-4" /></Button></>}</TableCell></TableRow>)}
    </TableBody></Table></div>
    <Dialog open={!!form} onOpenChange={(open) => !open && !mutation.isPending && setForm(null)}><DialogContent><DialogHeader><DialogTitle>{form?.id ? "Sửa mức lương nháp" : "Thêm mức lương nhân sự"}</DialogTitle></DialogHeader>{form && <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2"><Label>Nhân sự</Label><Select disabled={!!form.id} value={form.worker_id} onValueChange={(value) => { const worker = workers.find((item) => item.id === value); const type = worker?.current_compensation_type && workerRateTypes.includes(worker.current_compensation_type) ? worker.current_compensation_type : form.compensation_type; setForm({ ...form, worker_id: value, compensation_type: type }); }}><SelectTrigger><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger><SelectContent>{eligibleWorkers.map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} - {worker.display_name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Hình thức lương</Label><Select disabled={!!form.id} value={form.compensation_type} onValueChange={(value: CompensationType) => setForm({ ...form, compensation_type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{workerRateTypes.map((value) => <SelectItem key={value} value={value}>{compensationLabels[value]}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>{form.compensation_type === "HOURLY" ? "Lương mỗi giờ" : "Lương mỗi tháng"}</Label><Input type="number" min="0" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></div>
      {form.compensation_type !== "HOURLY" && <div className="space-y-2 sm:col-span-2"><Label>Phút công chuẩn trong tháng</Label><Input type="number" min="1" value={form.monthly_productive_minutes} onChange={(event) => setForm({ ...form, monthly_productive_minutes: event.target.value })} /><p className="text-xs text-muted-foreground">Nhập số phút công chuẩn theo lịch hoặc quy định đã chọn cho kỳ này. Hệ thống không tự giả định số ngày làm việc.</p></div>}
      <div className="space-y-2"><Label>Từ ngày</Label><Input type="date" value={form.effective_from} onChange={(event) => setForm({ ...form, effective_from: event.target.value })} /></div><div className="space-y-2"><Label>Đến ngày</Label><Input type="date" value={form.effective_to} onChange={(event) => setForm({ ...form, effective_to: event.target.value })} /></div>
      <div className="space-y-2 sm:col-span-2"><Label>Nguồn</Label><Input value={form.source_reference} onChange={(event) => setForm({ ...form, source_reference: event.target.value })} /></div><div className="flex items-center justify-between sm:col-span-2"><Label htmlFor="worker-rate-estimated">Mức tạm tính</Label><Switch id="worker-rate-estimated" checked={form.is_estimated} onCheckedChange={(value) => setForm({ ...form, is_estimated: value })} /></div><div className="space-y-2 sm:col-span-2"><Label>Lý do</Label><Textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></div>
    </div>}<DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setForm(null)}>Hủy</Button><Button disabled={!formValid || mutation.isPending} onClick={() => form && mutation.mutate(form)}>{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lưu nháp</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

type RateForm = { id?: string; product_id: string; piece_rate_code: string; piece_rate_name: string; rate: string; unit: "PIECE" | "SET"; effective_from: string; effective_to: string; source_reference: string; reason: string };
type RateSortKey = "sku" | "name" | "rate" | "effective_from";

function ProductRatesTab({ products, rates, canManage, requestAction, refresh }: { products: PayrollProduct[]; rates: ProductPieceRateVersion[]; canManage: boolean; requestAction: RequestAction; refresh: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<RateSortKey>("sku");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [form, setForm] = useState<RateForm | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [preparedExport, setPreparedExport] = useState<{ filename: string; download: () => void; rowCount: number } | null>(null);
  const exportInFlight = useRef(false);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const mutation = useMutation({
    mutationFn: (value: RateForm) => value.id
      ? updateProductPieceRateDraft({ id: value.id, product_id: value.product_id || null, piece_rate_code: value.piece_rate_code, piece_rate_name: value.piece_rate_name || null, rate: Number(value.rate), unit: value.unit, effective_from: value.effective_from, effective_to: value.effective_to || null, source_reference: value.source_reference || null, reason: value.reason } as Parameters<typeof updateProductPieceRateDraft>[0])
      : createProductPieceRateDraft({ product_id: value.product_id || null, piece_rate_code: value.piece_rate_code, piece_rate_name: value.piece_rate_name || null, rate: Number(value.rate), unit: value.unit, effective_from: value.effective_from, effective_to: value.effective_to || null, source_reference: value.source_reference || null, reason: value.reason }),
    onSuccess: async () => { toast.success("Đã lưu đơn giá nháp"); setForm(null); await refresh(); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const productFor = (id: string | null | undefined) => id ? productById.get(id) : undefined;
  const productSku = (id: string | null | undefined) => productFor(id)?.sku || "Chưa có mã SKU";
  const productName = (id: string | null | undefined) => {
    const product = productFor(id);
    if (!product) return "Sản phẩm không còn trong danh mục";
    return product.name;
  };
  const sourceKind = (source: string | null) => source && /^excel:/i.test(source) ? "EXCEL" : "MANUAL";
  const sourceLabel = (source: string | null) => source && /^excel:/i.test(source) ? "Excel" : source ? "Thủ công" : "Chưa ghi";
  const excelRateCount = rates.filter((rate) => sourceKind(rate.source_reference) === "EXCEL").length;
  const draftRateCount = rates.filter((rate) => rate.status === "DRAFT").length;
  const activeRateCount = rates.filter((rate) => rate.status === "APPROVED" && isEffectiveVersion(rate.effective_from, rate.effective_to)).length;
  const visibleRates = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("vi");
    const filtered = rates.filter((rate) => {
      const product = rate.product_id ? productById.get(rate.product_id) : undefined;
      const searchable = [rate.piece_rate_code, rate.piece_rate_name, product?.sku, product?.name, product?.category, rate.source_reference, rate.effective_from].filter(Boolean).join(" ").toLocaleLowerCase("vi");
      return (!term || searchable.includes(term))
        && (statusFilter === "ALL" || rate.status === statusFilter)
        && (sourceFilter === "ALL" || sourceKind(rate.source_reference) === sourceFilter);
    });
    return [...filtered].sort((left, right) => {
      let comparison = 0;
      if (sortBy === "rate") comparison = Number(left.rate) - Number(right.rate);
      else if (sortBy === "effective_from") comparison = left.effective_from.localeCompare(right.effective_from);
      else {
        const leftProduct = left.product_id ? productById.get(left.product_id) : undefined;
        const rightProduct = right.product_id ? productById.get(right.product_id) : undefined;
        const leftValue = sortBy === "sku" ? left.piece_rate_code || leftProduct?.sku || "Chưa có mã" : left.piece_rate_name || leftProduct?.name || "Sản phẩm không còn trong danh mục";
        const rightValue = sortBy === "sku" ? right.piece_rate_code || rightProduct?.sku || "Chưa có mã" : right.piece_rate_name || rightProduct?.name || "Sản phẩm không còn trong danh mục";
        comparison = leftValue.localeCompare(rightValue, "vi", { numeric: true, sensitivity: "base" });
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [productById, rates, search, sortBy, sortDirection, sourceFilter, statusFilter]);
  const hasFilters = !!search.trim() || statusFilter !== "ALL" || sourceFilter !== "ALL";
  const clearFilters = () => { setSearch(""); setStatusFilter("ALL"); setSourceFilter("ALL"); };
  const toggleSort = (value: RateSortKey) => {
    if (sortBy === value) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSortBy(value); setSortDirection("asc"); }
  };
  const exportExcel = async () => {
    if (exportInFlight.current || !visibleRates.length) return;
    exportInFlight.current = true;
    setExporting(true);
    setExportError(null);
    setPreparedExport(null);
    const rows = visibleRates.map((rate) => ({
      productCode: rate.piece_rate_code || (!isLocalBackend() ? productSku(rate.product_id) : ""), productName: rate.piece_rate_name || productName(rate.product_id),
      rate: rate.rate, unit: rate.unit, effectiveFrom: rate.effective_from,
      effectiveTo: rate.effective_to, source: rate.source_reference, status: rate.status,
    }));
    try {
      const { exportPayrollRatesExcel } = await import("@/lib/payroll-rates-export");
      const prepared = await exportPayrollRatesExcel(rows, today());
      setPreparedExport({ ...prepared, rowCount: rows.length });
      toast.success(prepared.autoDownloadStarted
        ? `Đã xuất Excel gồm ${rows.length.toLocaleString("vi-VN")} dòng theo bộ lọc hiện tại`
        : "Đã tạo tệp Excel. Bấm Tải lại tệp Excel để nhận tệp.");
    } catch (error) {
      const message = errorMessage(error);
      setExportError(message);
      toast.error(`Chưa thể xuất Excel: ${message}`);
    } finally {
      exportInFlight.current = false;
      setExporting(false);
    }
  };
  return <div className="space-y-4">




    {exportError && <Alert variant="destructive"><AlertTitle>Chưa thể xuất Excel</AlertTitle><AlertDescription className="space-y-2"><p>{exportError}</p><Button variant="outline" size="sm" disabled={exporting || !visibleRates.length} onClick={() => void exportExcel()}>Thử xuất lại</Button></AlertDescription></Alert>}
    {preparedExport && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/10 px-3 py-2"><div className="min-w-0 flex-1 text-xs"><p className="break-words font-medium"> {preparedExport.filename}</p><p className="text-xs text-muted-foreground">{preparedExport.rowCount.toLocaleString("vi-VN")} dòng · bộ lọc và thứ tự lúc tạo tệp.</p></div><Button variant="outline" size="sm" onClick={() => { try { preparedExport.download(); setExportError(null); } catch (error) { const message = errorMessage(error); setExportError(message); toast.error(`Chưa thể tải tệp Excel: ${message}`); } }}><Download className="mr-1 h-4 w-4" />Tải lại tệp Excel</Button></div>}
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="border-b bg-muted/20 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Bảng giá công may</h2>{isLocalBackend() && <p className="mt-1 text-xs text-muted-foreground">Mã công may Excel là mã dùng để tính lương sản lượng. Không dùng SKU CRM.</p>}</div>{canManage && <Button onClick={() => setForm({ product_id: products[0]?.id ?? "", piece_rate_code: "", piece_rate_name: "", rate: "", unit: "PIECE", effective_from: today(), effective_to: "", source_reference: "don-gia-moi", reason: "" })}><Plus className="h-4 w-4" />Thêm đơn giá</Button>}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1 sm:max-w-[360px]"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, tên công việc, nguồn..." className="h-9 pl-9" aria-label="Tìm trong bảng giá công may" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-9 w-[155px]" aria-label="Lọc trạng thái"><Filter className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả trạng thái</SelectItem><SelectItem value="APPROVED">Đã duyệt</SelectItem><SelectItem value="DRAFT">Nháp</SelectItem><SelectItem value="RETIRED">Đã kết thúc</SelectItem></SelectContent></Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}><SelectTrigger className="h-9 w-[135px]" aria-label="Lọc nguồn"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Tất cả nguồn</SelectItem><SelectItem value="EXCEL">Nhập từ Excel</SelectItem><SelectItem value="MANUAL">Thủ công</SelectItem></SelectContent></Select>
          <Select value={sortBy} onValueChange={(value: RateSortKey) => { setSortBy(value); setSortDirection("asc"); }}><SelectTrigger className="h-9 w-[150px]" aria-label="Sắp xếp"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sku">Sắp theo mã công may</SelectItem><SelectItem value="name">Sắp theo tên</SelectItem><SelectItem value="rate">Sắp theo đơn giá</SelectItem><SelectItem value="effective_from">Sắp theo ngày</SelectItem></SelectContent></Select>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => toggleSort(sortBy)} title={sortDirection === "asc" ? "Đang tăng dần, bấm để giảm dần" : "Đang giảm dần, bấm để tăng dần"} aria-label="Đổi chiều sắp xếp"><ArrowUpDown className="h-4 w-4" /></Button>
          {hasFilters && <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}><X className="mr-1 h-4 w-4" />Xóa lọc</Button>}
          <Button variant="outline" size="sm" className="h-9" onClick={() => void exportExcel()} disabled={exporting || !visibleRates.length} aria-busy={exporting}>{exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}{exporting ? "Đang tạo Excel…" : "Xuất Excel"}</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3 py-2 text-xs text-muted-foreground"><span>Hiển thị <strong className="text-foreground">{visibleRates.length.toLocaleString("vi-VN")}</strong> / {rates.length.toLocaleString("vi-VN")} dòng</span><span>Hiệu lực: <strong className="text-emerald-700">{activeRateCount.toLocaleString("vi-VN")}</strong></span><span>Nguồn Excel: {excelRateCount.toLocaleString("vi-VN")}</span><span>Nháp: <strong className="text-amber-700">{draftRateCount.toLocaleString("vi-VN")}</strong></span></div>
      <div className="relative isolate max-h-[620px] overflow-auto">
        <Table disableWrapper className="min-w-[1240px] table-fixed border-collapse text-sm [&_td]:overflow-hidden [&_th]:overflow-hidden">
          <TableHeader className="sticky top-0 z-30 bg-slate-100 dark:bg-slate-900 [&_th]:border-b [&_th]:border-r [&_th]:border-slate-300 [&_th]:dark:border-slate-700">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[58px] overflow-hidden px-2 py-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-200">STT</TableHead>
              <TableHead className="w-[170px] overflow-hidden px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">{isLocalBackend() ? "Mã công may Excel" : "Mã SP"}</TableHead>
              <TableHead className="w-[300px] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Tên công việc / sản phẩm</TableHead>
              <TableHead className="w-[150px] px-3 py-2 text-right text-xs font-semibold text-slate-700 dark:text-slate-200">Đơn giá (đồng)</TableHead>
              <TableHead className="w-[110px] px-3 py-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-200">ĐVT</TableHead>
              <TableHead className="w-[185px] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Hiệu lực</TableHead>
              <TableHead className="w-[190px] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Nguồn</TableHead>
              <TableHead className="w-[110px] px-3 py-2 text-center text-xs font-semibold text-slate-700 dark:text-slate-200">Trạng thái</TableHead>
              <TableHead className="w-[160px] px-3 py-2 text-right text-xs font-semibold text-slate-700 dark:text-slate-200">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRates.length === 0 && <EmptyRow columns={9} message="Chưa có đơn giá phù hợp. Thử xóa bộ lọc hoặc nhập mã khác." />}
            {visibleRates.map((rate, index) => {
              const product = productFor(rate.product_id);
              const source = rate.source_reference || "";
              return <TableRow key={rate.id} className="group odd:bg-background even:bg-slate-50 hover:bg-blue-50 dark:odd:bg-slate-950 dark:even:bg-slate-900 dark:hover:bg-slate-800 [&_td]:border-b [&_td]:border-r [&_td]:border-slate-200 [&_td]:dark:border-slate-800">
                <TableCell className="overflow-hidden px-2 py-2 text-center tabular-nums text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="overflow-hidden px-3 py-2"><span className="block truncate font-mono text-xs font-semibold" title={rate.piece_rate_code || productSku(rate.product_id)}>{rate.piece_rate_code || (!isLocalBackend() ? productSku(rate.product_id) : "Chưa có mã công may")}</span>{isLocalBackend() && !rate.piece_rate_code && <div className="truncate text-[11px] text-amber-700">Cần bổ sung mã Excel</div>}</TableCell>
                <TableCell className="px-3 py-2"><div className="truncate font-medium" title={rate.piece_rate_name || productName(rate.product_id)}>{rate.piece_rate_name || productName(rate.product_id)}</div>{product?.category && normalizeSearchText(product.category) !== "cong may" && <div className="truncate text-xs text-muted-foreground">{product.category}</div>}</TableCell>
                <TableCell className="px-3 py-2 text-right tabular-nums"><span className="font-semibold">{wholeNumber.format(Number(rate.rate))}</span><span className="ml-1 text-xs text-muted-foreground">₫</span></TableCell>
                <TableCell className="px-3 py-2 text-center">{rate.unit === "SET" ? "Bộ" : "Sản phẩm"}</TableCell>
                <TableCell className="px-3 py-2 text-xs"><div>{rate.effective_from}</div><div className="text-muted-foreground">→ {rate.effective_to || "Không giới hạn"}</div></TableCell>
                <TableCell className="px-3 py-2">{source ? <details><summary className="min-h-11 cursor-pointer py-3 text-xs font-medium lg:min-h-8 lg:py-2" aria-label={`Xem nguồn của ${rate.piece_rate_code || productSku(rate.product_id)}`}>{sourceLabel(rate.source_reference)}</summary><p className="break-words text-xs text-muted-foreground">{source}</p></details> : <span className="text-xs text-muted-foreground">Chưa ghi</span>}</TableCell>
                <TableCell className="px-3 py-2 text-center">{statusBadge(rate.status)}</TableCell>
                <TableCell className="px-3 py-2 text-right"><div className="flex justify-end gap-1">{canManage && rate.status === "DRAFT" ? <><Button variant="ghost" size="icon" className="h-11 w-11 lg:h-8 lg:w-8" title="Sửa nháp" aria-label="Sửa đơn giá nháp" onClick={() => setForm({ id: rate.id, product_id: rate.product_id ?? "", piece_rate_code: rate.piece_rate_code ?? "", piece_rate_name: rate.piece_rate_name ?? "", rate: String(rate.rate), unit: rate.unit, effective_from: rate.effective_from, effective_to: rate.effective_to ?? "", source_reference: rate.source_reference ?? "", reason: rate.reason })}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-700" title="Duyệt" aria-label="Duyệt đơn giá" onClick={() => requestAction({ title: "Duyệt đơn giá", description: "Đơn giá được chọn theo ngày thực hiện sản lượng.", confirmLabel: "Duyệt", run: (reason) => approveProductPieceRate(rate.id, reason) })}><Check className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Hủy nháp" aria-label="Hủy đơn giá nháp" onClick={() => requestAction({ title: "Hủy đơn giá nháp", description: "Bản nháp sẽ bị xóa.", confirmLabel: "Hủy nháp", destructive: true, run: (reason) => discardProductPieceRateDraft(rate.id, reason) })}><Trash2 className="h-4 w-4" /></Button></> : ["APPROVED", "RETIRED"].includes(rate.status) ? <span className="inline-flex h-11 w-11 items-center justify-center text-muted-foreground lg:h-8 lg:w-8" title="Đơn giá đã duyệt hoặc kết thúc, không sửa trực tiếp" role="img" aria-label="Đơn giá đã khóa chỉnh sửa"><LockKeyhole className="h-4 w-4" /></span> : null}</div></TableCell>
              </TableRow>;
            })}
          </TableBody>
        </Table>
      </div>
    </div>

    <PayrollHelp><p>{isLocalBackend() ? "Mã công may Excel là mã tính lương sản lượng và bắt buộc với mọi đơn giá mới. SKU CRM chỉ để liên kết sản phẩm, không dùng để tính lương." : "Mỗi đơn giá áp dụng theo ngày hiệu lực và cần được duyệt trước khi tính lương."}</p><p>Cuộn để xem thêm cột; bấm tên nguồn để đọc đầy đủ tham chiếu. Dòng đã duyệt hoặc kết thúc không sửa trực tiếp: tạo phiên bản nháp mới nếu cần thay đổi.</p><p>Xuất Excel lấy các dòng theo bộ lọc và thứ tự hiện tại, dùng để xem và đối chiếu; tệp xuất không thay thế mẫu nhập hàng loạt.</p></PayrollHelp>
    <Dialog open={!!form} onOpenChange={(open) => !open && !mutation.isPending && setForm(null)}><DialogContent><DialogHeader><DialogTitle>{form?.id ? "Sửa đơn giá nháp" : "Thêm đơn giá sản phẩm"}</DialogTitle></DialogHeader>{form && <div className="grid gap-4 sm:grid-cols-2">{isLocalBackend() && <><div className="space-y-2 sm:col-span-2"><Label>Mã công may Excel <span className="text-destructive">*</span></Label><Input autoFocus value={form.piece_rate_code} onChange={(e) => setForm({ ...form, piece_rate_code: e.target.value })} placeholder="Ví dụ: MAY-AO-001" /><p className="text-xs text-muted-foreground">Nhập đúng cột <strong>ma_sp</strong> trong bảng Excel. Không nhập SKU CRM.</p></div><div className="space-y-2 sm:col-span-2"><Label>Tên công việc / sản phẩm</Label><Input value={form.piece_rate_name} onChange={(e) => setForm({ ...form, piece_rate_name: e.target.value })} placeholder="Ví dụ: May thân áo" /></div></>}<div className="space-y-2 sm:col-span-2"><Label>Sản phẩm CRM liên kết <span className="text-xs font-normal text-muted-foreground">{isLocalBackend() ? "(tùy chọn)" : "*"}</span></Label><Select disabled={!!form.id} value={form.product_id || "__none__"} onValueChange={(value) => setForm({ ...form, product_id: value === "__none__" ? "" : value })}><SelectTrigger><SelectValue placeholder="Chọn nếu có" /></SelectTrigger><SelectContent>{isLocalBackend() && <SelectItem value="__none__">Không liên kết CRM</SelectItem>}{products.map((product) => <SelectItem key={product.id} value={product.id}>{productSku(product.id)} - {product.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Đơn giá</Label><Input type="number" min="0" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div><div className="space-y-2"><Label>Đơn vị</Label><Select value={form.unit} onValueChange={(value: RateForm["unit"]) => setForm({ ...form, unit: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PIECE">Sản phẩm</SelectItem><SelectItem value="SET">Bộ</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Từ ngày</Label><Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} /></div><div className="space-y-2"><Label>Đến ngày</Label><Input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} /></div><div className="space-y-2 sm:col-span-2"><Label>Nguồn</Label><Input value={form.source_reference} onChange={(e) => setForm({ ...form, source_reference: e.target.value })} /></div><div className="space-y-2 sm:col-span-2"><Label>Lý do</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div></div>}<DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setForm(null)}>Hủy</Button><Button disabled={(isLocalBackend() && !form?.piece_rate_code.trim()) || (!isLocalBackend() && !form?.product_id) || !form?.rate || Number(form.rate) < 0 || !form?.reason.trim() || mutation.isPending} onClick={() => form && mutation.mutate(form)}>{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lưu nháp</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

type InsuranceForm = { id?: string; worker_id: string; employee_amount: string; effective_from: string; effective_to: string; source_reference: string; reason: string };
function InsuranceTab({ workers, versions, canManage, requestAction, refresh }: { workers: PayrollWorker[]; versions: SocialInsuranceVersion[]; canManage: boolean; requestAction: RequestAction; refresh: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [form, setForm] = useState<InsuranceForm | null>(null);
  const mutation = useMutation({ mutationFn: (value: InsuranceForm) => value.id ? updateSocialInsuranceDraft({ id: value.id, worker_id: value.worker_id, employee_amount: Number(value.employee_amount), effective_from: value.effective_from, effective_to: value.effective_to || null, source_reference: value.source_reference, reason: value.reason } as Parameters<typeof updateSocialInsuranceDraft>[0]) : createSocialInsuranceDraft({ worker_id: value.worker_id, employee_amount: Number(value.employee_amount), effective_from: value.effective_from, effective_to: value.effective_to || null, source_reference: value.source_reference, reason: value.reason }), onSuccess: async () => { toast.success("Đã lưu mức BHXH nháp"); setForm(null); await refresh(); }, onError: (error) => toast.error(errorMessage(error)) });
  const workerName = (id: string) => workers.find((worker) => worker.id === id)?.display_name ?? id;
  const visibleVersions = versions.filter((version) => {
    const worker = workers.find((item) => item.id === version.worker_id);
    return (statusFilter === "ALL" || version.status === statusFilter) && normalizeSearchText(`${worker?.employee_code ?? ""} ${workerName(version.worker_id)} ${version.source_reference}`).includes(normalizeSearchText(search));
  });
  if (!canManage) return <DeniedPanel message="Chỉ kế toán hoặc quản trị viên được quản lý BHXH." />;
  return <div className="space-y-4"><div className="flex justify-end"><Button onClick={() => setForm({ worker_id: "", employee_amount: "", effective_from: today(), effective_to: "", source_reference: "nv đóng bhxh", reason: "" })}><Plus className="h-4 w-4" />Thêm mức BHXH</Button></div><RecordFilters search={search} onSearch={setSearch} status={statusFilter} onStatus={setStatusFilter} statuses={[["DRAFT","Nháp"],["APPROVED","Đã duyệt"],["RETIRED","Đã kết thúc"]]} /><div className="overflow-x-auto border bg-background"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Nhân sự</TableHead><TableHead>Mức nhân viên đóng</TableHead><TableHead>Hiệu lực</TableHead><TableHead>Nguồn</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{visibleVersions.length === 0 && <EmptyRow columns={6} message="Không có mức BHXH phù hợp bộ lọc." />}{visibleVersions.map((version) => <TableRow key={version.id}><TableCell>{workerName(version.worker_id)}</TableCell><TableCell className="font-medium">{money.format(version.employee_amount)}</TableCell><TableCell>{version.effective_from} → {version.effective_to || "không giới hạn"}</TableCell><TableCell>{version.source_reference}</TableCell><TableCell>{statusBadge(version.status)}</TableCell><TableCell className="space-x-1 text-right">{version.status === "DRAFT" && <><Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" title="Sửa mức BHXH nháp" aria-label={`Sửa mức BHXH nháp · ${workerName(version.worker_id)}`} onClick={() => setForm({ id: version.id, worker_id: version.worker_id, employee_amount: String(version.employee_amount), effective_from: version.effective_from, effective_to: version.effective_to ?? "", source_reference: version.source_reference, reason: version.reason })}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" title="Duyệt mức BHXH" aria-label={`Duyệt mức BHXH · ${workerName(version.worker_id)}`} onClick={() => requestAction({ title: "Duyệt mức BHXH", description: "Phiên bản đã duyệt không thể sửa trực tiếp.", confirmLabel: "Duyệt", run: (reason) => approveSocialInsuranceVersion(version.id, reason) })}><Check className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" title="Hủy BHXH nháp" aria-label={`Hủy BHXH nháp · ${workerName(version.worker_id)}`} onClick={() => requestAction({ title: "Hủy BHXH nháp", description: "Bản nháp sẽ bị xóa.", confirmLabel: "Hủy nháp", destructive: true, run: (reason) => discardSocialInsuranceDraft(version.id, reason) })}><Trash2 className="h-4 w-4" /></Button></>}</TableCell></TableRow>)}</TableBody></Table></div>
    <Dialog open={!!form} onOpenChange={(open) => !open && !mutation.isPending && setForm(null)}><DialogContent><DialogHeader><DialogTitle>{form?.id ? "Sửa BHXH nháp" : "Thêm mức BHXH"}</DialogTitle></DialogHeader>{form && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Nhân sự</Label><Select disabled={!!form.id} value={form.worker_id} onValueChange={(value) => setForm({ ...form, worker_id: value })}><SelectTrigger><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger><SelectContent>{workers.map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} - {worker.display_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Số tiền</Label><Input type="number" min="0" value={form.employee_amount} onChange={(e) => setForm({ ...form, employee_amount: e.target.value })} /></div><div className="space-y-2"><Label>Nguồn</Label><Input value={form.source_reference} onChange={(e) => setForm({ ...form, source_reference: e.target.value })} /></div><div className="space-y-2"><Label>Từ ngày</Label><Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} /></div><div className="space-y-2"><Label>Đến ngày</Label><Input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} /></div><div className="space-y-2 sm:col-span-2"><Label>Lý do</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div></div>}<DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setForm(null)}>Hủy</Button><Button disabled={!form?.worker_id || !form?.employee_amount || Number(form.employee_amount) < 0 || !form?.source_reference.trim() || !form?.reason.trim() || mutation.isPending} onClick={() => form && mutation.mutate(form)}>{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lưu nháp</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

type BankForm = { id?: string; worker_id: string; account_number: string; account_name: string; bank_name: string; bank_code: string; is_primary: boolean; effective_from: string; effective_to: string; source_reference: string; reason: string };
function BankAccountsTab({ workers, accounts, canManage, requestAction, refresh }: { workers: PayrollWorker[]; accounts: PayrollBankAccount[]; canManage: boolean; requestAction: RequestAction; refresh: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [form, setForm] = useState<BankForm | null>(null);
  const mutation = useMutation({ mutationFn: (value: BankForm) => value.id
    ? updateBankAccountDraft({ id: value.id, account_number: value.account_number, account_name: value.account_name, bank_name: value.bank_name, bank_code: value.bank_code || null, is_primary: value.is_primary, effective_from: value.effective_from, effective_to: value.effective_to || null, source_reference: value.source_reference || null, reason: value.reason })
    : createBankAccountDraft({ worker_id: value.worker_id, account_number: value.account_number, account_name: value.account_name, bank_name: value.bank_name, bank_code: value.bank_code || null, is_primary: value.is_primary, effective_from: value.effective_from, effective_to: value.effective_to || null, source_reference: value.source_reference || null, reason: value.reason }), onSuccess: async () => { toast.success("Đã lưu tài khoản nháp"); setForm(null); await refresh(); }, onError: (error) => toast.error(errorMessage(error)) });
  const workerName = (id: string) => workers.find((worker) => worker.id === id)?.display_name ?? id;
  const visibleAccounts = accounts.filter((account) => {
    const worker = workers.find((item) => item.id === account.worker_id);
    return (statusFilter === "ALL" || account.status === statusFilter) && normalizeSearchText(`${worker?.employee_code ?? ""} ${workerName(account.worker_id)} ${account.account_name} ${account.bank_name} ${account.account_number_masked}`).includes(normalizeSearchText(search));
  });
  if (!canManage) return <DeniedPanel message="Chỉ kế toán hoặc quản trị viên được xem và quản lý tài khoản nhận lương." />;
  return <div className="space-y-4"><div className="flex justify-end"><Button onClick={() => setForm({ worker_id: "", account_number: "", account_name: "", bank_name: "", bank_code: "", is_primary: true, effective_from: today(), effective_to: "", source_reference: "PL", reason: "" })}><Plus className="h-4 w-4" />Thêm tài khoản</Button></div><RecordFilters search={search} onSearch={setSearch} status={statusFilter} onStatus={setStatusFilter} statuses={[["DRAFT","Nháp"],["VERIFIED","Đã xác minh"],["RETIRED","Đã kết thúc"]]} /><div className="overflow-x-auto border bg-background"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Nhân sự</TableHead><TableHead>Tài khoản</TableHead><TableHead>Ngân hàng</TableHead><TableHead>Hiệu lực</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{visibleAccounts.length === 0 && <EmptyRow columns={6} message="Không có tài khoản phù hợp bộ lọc." />}{visibleAccounts.map((account) => <TableRow key={account.id}><TableCell>{workerName(account.worker_id)}</TableCell><TableCell><div className="font-mono">{account.account_number_masked}</div><div className="text-xs text-muted-foreground">{account.account_name}</div></TableCell><TableCell>{account.bank_name}{account.bank_code ? ` (${account.bank_code})` : ""}</TableCell><TableCell>{account.effective_from} → {account.effective_to || "không giới hạn"}</TableCell><TableCell>{statusBadge(account.status)}</TableCell><TableCell className="space-x-1 text-right">{account.status === "DRAFT" && <><Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" title="Sửa tài khoản nháp" aria-label={`Sửa tài khoản nháp · ${workerName(account.worker_id)}`} onClick={() => setForm({ id: account.id, worker_id: account.worker_id, account_number: account.account_number ?? "", account_name: account.account_name, bank_name: account.bank_name, bank_code: account.bank_code ?? "", is_primary: account.is_primary, effective_from: account.effective_from, effective_to: account.effective_to ?? "", source_reference: account.source_reference ?? "", reason: account.reason })}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" title="Xác minh tài khoản" aria-label={`Xác minh tài khoản · ${workerName(account.worker_id)}`} onClick={() => requestAction({ title: "Xác minh tài khoản", description: "Tài khoản đã xác minh không thể sửa trực tiếp.", confirmLabel: "Xác minh", run: (reason) => verifyBankAccount(account.id, reason) })}><Check className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-11 w-11 lg:h-10 lg:w-10" title="Hủy tài khoản nháp" aria-label={`Hủy tài khoản nháp · ${workerName(account.worker_id)}`} onClick={() => requestAction({ title: "Hủy tài khoản nháp", description: "Bản nháp sẽ bị xóa; số tài khoản không được ghi vào nhật ký.", confirmLabel: "Hủy nháp", destructive: true, run: (reason) => discardBankAccountDraft(account.id, reason) })}><Trash2 className="h-4 w-4" /></Button></>}</TableCell></TableRow>)}</TableBody></Table></div>
    <Dialog open={!!form} onOpenChange={(open) => !open && !mutation.isPending && setForm(null)}><DialogContent><DialogHeader><DialogTitle>{form?.id ? "Sửa tài khoản nháp" : "Thêm tài khoản nhận lương"}</DialogTitle></DialogHeader>{form && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Nhân sự</Label><Select disabled={!!form.id} value={form.worker_id} onValueChange={(value) => setForm({ ...form, worker_id: value })}><SelectTrigger><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger><SelectContent>{workers.map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} - {worker.display_name}</SelectItem>)}</SelectContent></Select></div>{isLocalBackend()&&<PayrollBankProposal key={`${form.id||"new"}:${form.worker_id}`} workerId={form.worker_id} current={form} onApply={proposal=>setForm({...form,...proposal})}/>}<div className="space-y-2"><Label>Số tài khoản</Label><Input inputMode="numeric" autoComplete="off" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} /></div><div className="space-y-2"><Label>Tên chủ tài khoản</Label><Input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} /></div><div className="space-y-2"><Label>Ngân hàng</Label><Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div><div className="space-y-2"><Label>Mã ngân hàng</Label><Input value={form.bank_code} onChange={(e) => setForm({ ...form, bank_code: e.target.value.toUpperCase() })} /></div><div className="space-y-2"><Label>Từ ngày</Label><Input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} /></div><div className="space-y-2"><Label>Đến ngày</Label><Input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} /></div><div className="flex items-center justify-between sm:col-span-2"><Label htmlFor="bank-primary">Tài khoản nhận lương chính</Label><Switch id="bank-primary" checked={form.is_primary} onCheckedChange={(value) => setForm({ ...form, is_primary: value })} /></div><div className="space-y-2 sm:col-span-2"><Label>Nguồn</Label><Input value={form.source_reference} onChange={(e) => setForm({ ...form, source_reference: e.target.value })} /></div><div className="space-y-2 sm:col-span-2"><Label>Lý do</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div></div>}<DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setForm(null)}>Hủy</Button><Button disabled={!form?.worker_id || !form?.effective_from || !form?.account_number.trim() || !form?.account_name.trim() || !form?.bank_name.trim() || !form?.reason.trim() || mutation.isPending} onClick={() => form && mutation.mutate(form)}>{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lưu nháp</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

type AdjustmentForm = {
  worker_id: string; period_start: string; period_end: string; item_type: string;
  item_direction: "EARNING" | "DEDUCTION"; amount: string; source_reference: string; reason: string;
};
const adjustmentTypes = [
  ["ALLOWANCE", "Phụ cấp"], ["BONUS", "Thưởng"], ["SALES_COMMISSION", "Hoa hồng"],
  ["OTHER_ALLOWANCE", "Khoản cộng khác"], ["SALARY_ADVANCE", "Tạm ứng"], ["PENALTY", "Phạt"],
  ["PENALTY_DAMAGE", "Bồi thường"], ["OTHER_DEDUCTION", "Khấu trừ khác"],
  ["MANUAL_ADJUSTMENT", "Điều chỉnh thủ công"],
] as const;
function LocalPayrollAdjustmentsTab({ workers, adjustments, canManage, requestAction, refresh }: { workers: PayrollWorker[]; adjustments: PayrollAdjustment[]; canManage: boolean; requestAction: RequestAction; refresh: () => Promise<void> }) {
  const [contextParams, setContextParams] = useSearchParams();
  const contextWorker = contextParams.get("worker");
  const contextLocation = contextParams.get("location");
  const contextMonth = contextParams.get("month");
  const monthMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(contextMonth || "");
  const contextStart = monthMatch ? `${contextMonth}-01` : null;
  const contextEnd = monthMatch ? `${contextMonth}-${String(new Date(Number(monthMatch[1]), Number(monthMatch[2]), 0).getDate()).padStart(2,"0")}` : null;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [form, setForm] = useState<AdjustmentForm | null>(null);
  const mutation = useMutation({
    mutationFn: (value: AdjustmentForm) => localApi.createPayrollAdjustment({ ...value, amount: Number(value.amount), idempotency_key: `ui-adjustment-${value.worker_id}-${value.period_start}-${Date.now()}` }),
    onSuccess: async () => { toast.success("Đã lưu điều chỉnh lương nháp"); setForm(null); await refresh(); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const workerName = (id: string) => workers.find((worker) => worker.id === id)?.display_name ?? id;
  const visibleAdjustments = adjustments.filter((adjustment) => {
    const worker = workers.find((item) => item.id === adjustment.worker_id);
    const typeLabel = adjustmentTypes.find(([value]) => value === adjustment.item_type)?.[1] ?? adjustment.item_type;
    if (contextWorker && adjustment.worker_id !== contextWorker) return false;
    if (contextLocation && contextLocation !== "ALL" && (worker?.location_code || "__UNASSIGNED__") !== contextLocation) return false;
    if (contextStart && contextEnd && (adjustment.period_start > contextEnd || adjustment.period_end < contextStart)) return false;
    return (statusFilter === "ALL" || adjustment.status === statusFilter) && normalizeSearchText(`${worker?.employee_code ?? adjustment.employee_code ?? ""} ${workerName(adjustment.worker_id)} ${typeLabel} ${adjustment.source_reference ?? ""} ${adjustment.period_start} ${adjustment.period_end}`).includes(normalizeSearchText(search));
  });
  const createForm = () => setForm({ worker_id: "", period_start: today().slice(0, 7) + "-01", period_end: today(), item_type: "ALLOWANCE", item_direction: "EARNING", amount: "", source_reference: "", reason: "" });
  if (!canManage) return <DeniedPanel message="Cần quyền quản lý nhân sự hoặc chính sách lương để tạo điều chỉnh." />;
  return <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Phụ cấp và khấu trừ</h2></div><Button onClick={createForm} disabled={!workers.length}><Plus className="mr-2 h-4 w-4" />Tạo điều chỉnh</Button></div>
    {(contextWorker || contextStart || (contextLocation && contextLocation !== "ALL")) && <div className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm"><span>Phạm vi: {contextMonth || "Mọi kỳ"} · {contextWorker ? workerName(contextWorker) : "Mọi nhân sự"} · {contextLocation || "ALL"}</span><Button variant="ghost" size="sm" onClick={() => { const next=new URLSearchParams(contextParams); for(const key of ["worker","month","location"]) next.delete(key); setContextParams(next); }}>Bỏ lọc ngữ cảnh</Button></div>}
    <RecordFilters search={search} onSearch={setSearch} status={statusFilter} onStatus={setStatusFilter} statuses={[["DRAFT","Nháp"],["SUBMITTED","Chờ duyệt"],["APPROVED","Đã duyệt"],["REJECTED","Đã từ chối"],["LOCKED","Đã khóa"]]} />
    <div className="overflow-x-auto rounded-lg border bg-background"><Table className="min-w-[760px]"><TableHeader><TableRow><TableHead>Kỳ</TableHead><TableHead>Nhân sự</TableHead><TableHead>Loại</TableHead><TableHead>Hướng</TableHead><TableHead>Số tiền</TableHead><TableHead>Trạng thái</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{visibleAdjustments.length === 0 ? <EmptyRow columns={7} message="Không có điều chỉnh phù hợp bộ lọc." /> : visibleAdjustments.map((adjustment) => <TableRow key={adjustment.id}><TableCell>{adjustment.period_start} → {adjustment.period_end}</TableCell><TableCell><div className="font-medium">{workerName(adjustment.worker_id)}</div><div className="text-xs text-muted-foreground">{adjustment.employee_code}</div></TableCell><TableCell>{adjustmentTypes.find(([value]) => value === adjustment.item_type)?.[1] ?? adjustment.item_type}</TableCell><TableCell className={adjustment.item_direction === "DEDUCTION" ? "text-rose-600" : "text-emerald-700"}>{adjustment.item_direction === "DEDUCTION" ? "Khấu trừ" : "Khoản cộng"}</TableCell><TableCell className="font-medium">{money.format(adjustment.amount)}</TableCell><TableCell>{statusBadge(adjustment.status)}</TableCell><TableCell className="space-x-1 text-right">{adjustment.status === "DRAFT" && <><Button variant="outline" size="sm" onClick={() => requestAction({ title: "Gửi duyệt điều chỉnh", description: "Điều chỉnh sẽ chờ người có quyền duyệt trước khi tính lương.", confirmLabel: "Gửi duyệt", run: (reason) => localApi.submitPayrollAdjustment(adjustment.id, { reason }) })}>Gửi duyệt</Button><Button variant="ghost" size="sm" onClick={() => requestAction({title:"Hủy khoản nháp",description:"Khoản nháp sẽ bị từ chối và không được tính lương. Cần ghi rõ lý do.",confirmLabel:"Hủy nháp",destructive:true,run:(reason)=>localApi.rejectPayrollAdjustment(adjustment.id,{reason})})}>Hủy nháp</Button></>}{adjustment.status === "SUBMITTED" && <><Button size="sm" onClick={() => requestAction({ title: "Duyệt điều chỉnh", description: "Khoản đã duyệt sẽ được đưa vào lần tính tiếp theo và không sửa trực tiếp.", confirmLabel: "Duyệt", run: (reason) => localApi.approvePayrollAdjustment(adjustment.id, { reason }) })}><Check className="mr-1 h-4 w-4" />Duyệt</Button><Button variant="ghost" size="sm" onClick={() => requestAction({ title: "Từ chối điều chỉnh", description: "Khoản bị từ chối sẽ không vào bảng lương.", confirmLabel: "Từ chối", destructive: true, run: (reason) => localApi.rejectPayrollAdjustment(adjustment.id, { reason }) })}>Từ chối</Button></>}</TableCell></TableRow>)}</TableBody></Table></div>
    <PayrollHelp><p>Khoản cộng hoặc khấu trừ cần có lý do và nguồn tham chiếu. Lưu nháp, gửi duyệt rồi mới tính lương; khoản đã đưa vào kỳ khóa không sửa trực tiếp.</p></PayrollHelp>
    <Dialog open={!!form} onOpenChange={(open) => !open && !mutation.isPending && setForm(null)}><DialogContent><DialogHeader><DialogTitle>Tạo điều chỉnh lương</DialogTitle></DialogHeader>{form && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Nhân sự</Label><Select value={form.worker_id} onValueChange={(value) => setForm({ ...form, worker_id: value })}><SelectTrigger><SelectValue placeholder="Chọn nhân sự" /></SelectTrigger><SelectContent>{workers.map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.employee_code} - {worker.display_name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Loại điều chỉnh</Label><Select value={form.item_type} onValueChange={(value) => setForm({ ...form, item_type: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{adjustmentTypes.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Hướng</Label><Select value={form.item_direction} onValueChange={(value: "EARNING" | "DEDUCTION") => setForm({ ...form, item_direction: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EARNING">Khoản cộng</SelectItem><SelectItem value="DEDUCTION">Khấu trừ</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Từ ngày</Label><Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} /></div><div className="space-y-2"><Label>Đến ngày</Label><Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} /></div><div className="space-y-2"><Label>Số tiền</Label><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div><div className="space-y-2"><Label>Nguồn tham chiếu</Label><Input value={form.source_reference} onChange={(e) => setForm({ ...form, source_reference: e.target.value })} placeholder="Phiếu, quyết định, bảng kê..." /></div><div className="space-y-2 sm:col-span-2"><Label>Lý do</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Bắt buộc để đối soát và lưu nhật ký" /></div></div>}<DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setForm(null)}>Hủy</Button><Button disabled={!form?.worker_id || !form?.amount || Number(form.amount) <= 0 || !form?.reason.trim() || mutation.isPending} onClick={() => form && mutation.mutate(form)}>{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Lưu nháp</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

export default function PayrollSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isReady: authReady } = useAuthReady();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionReason, setActionReason] = useState("");
  const queryClient = useQueryClient();
  const { role } = useUserRole(user);
  const { hasPermission } = useEmployeePermissions(user,role);
  useEffect(() => listenPermissionRefresh(() => { void queryClient.invalidateQueries({ queryKey: ['payroll-settings'] }); }), [queryClient]);
  const capabilitiesQuery = useQuery({ queryKey: ["payroll-settings", "capabilities", user?.id], queryFn: () => listPayrollCapabilities(user?.id), enabled: !!user });
  const capabilityMap = useMemo(() => new Map((capabilitiesQuery.isError ? [] : capabilitiesQuery.data ?? []).map((item) => [item.permission_type, item])), [capabilitiesQuery.data, capabilitiesQuery.isError]);
  const can = (permission: PayrollPermissionType) => capabilityMap.get(permission)?.allowed === true;
  const canView = can("payroll_view");
  const canManageWorkers = can("payroll_worker_manage");
  const canManagePolicies = can("payroll_policy_manage");
  const canViewRates = can("payroll_rate_view");
  const canManageRates = can("payroll_rate_manage");
  const canManageInsurance = can("payroll_insurance_manage");
  const canManageBanks = can("payroll_bank_manage");
  const canManageAdjustments = canManageWorkers || canManagePolicies;
  const canViewRuns = canView && ['admin','manager','accountant'].includes(role || '');
  const canManageRuns = canViewRuns && canManagePolicies;
  const capabilityReady = capabilitiesQuery.isSuccess;
  const workerAccess = capabilityReady && (canView || canManageWorkers || canManagePolicies || canManageInsurance || canManageBanks);

  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab && payrollSettingsTabs.has(requestedTab) && (!["runs", "adjustments"].includes(requestedTab) || isLocalBackend()) ? requestedTab === "overview" ? (isLocalBackend()?"runs":"workers") : requestedTab : isLocalBackend()?"runs":"workers";
  const primaryTab = ["workers","worker-rates","insurance","banks"].includes(activeTab)?"workers":["policies","groups","rates"].includes(activeTab)?"policies":"runs";
  const navigateTab=(tab:string)=>{const next=new URLSearchParams(searchParams);next.set("tab",tab);setSearchParams(next);};
  const focusedWorker = activeTab === "workers" && isLocalBackend() ? searchParams.get("worker") : null;
  const loadWorkerDetails = !isLocalBackend() || !!focusedWorker;
  const detailKey = focusedWorker || "all";
  useEffect(()=>{setPendingAction(null);setActionReason("");},[focusedWorker,role,capabilitiesQuery.data]);
  const scopeKey = `${user?.id || ''}:${role || ''}:${JSON.stringify(capabilitiesQuery.data || [])}`;
  const workersQuery = useQuery({ queryKey: ["payroll-settings", "workers", scopeKey], queryFn: () => listPayrollWorkers(true), enabled: ["workers", "worker-rates", "insurance", "banks", "adjustments", "runs"].includes(activeTab) && workerAccess });
  const groupsQuery = useQuery({ queryKey: ["payroll-settings", "groups", scopeKey], queryFn: listPayrollPolicyGroups, enabled: (activeTab === "groups" || activeTab === "workers" && loadWorkerDetails) && capabilityReady && (canView || canManagePolicies) });
  const assignmentsQuery = useQuery({ queryKey: ["payroll-settings", "assignments", scopeKey, activeTab === "workers" ? detailKey : "all"], queryFn: () => listWorkerCompensationAssignments(activeTab === "workers" ? focusedWorker : undefined), enabled: activeTab === "workers" && loadWorkerDetails && capabilityReady && (canView || canManagePolicies) });
  const workerProfilesQuery = useQuery({ queryKey: ["payroll-settings", "worker-profiles", scopeKey, activeTab === "workers" ? detailKey : "all"], queryFn: () => listWorkerPayrollProfiles(activeTab === "workers" ? focusedWorker : undefined), enabled: activeTab === "workers" && loadWorkerDetails && isLocalBackend() && workerAccess });
  const teamsQuery = useQuery({ queryKey: ["payroll-settings", "teams", scopeKey, detailKey], queryFn: () => listPayrollTeamAssignments({ worker_id: focusedWorker }), enabled: activeTab === "workers" && loadWorkerDetails && capabilityReady && (canView || canManageWorkers) });
  const productsQuery = useQuery({ queryKey: ["payroll-settings", "products", scopeKey], queryFn: () => listPayrollProducts(), enabled: ["rates"].includes(activeTab) && capabilityReady && (canViewRates || canManageRates) });
  const ratesQuery = useQuery({ queryKey: ["payroll-settings", "rates", scopeKey], queryFn: () => listProductPieceRates(), enabled: (activeTab === "rates" || activeTab === "workers" && loadWorkerDetails) && capabilityReady && (canViewRates || canManageRates) });
  const workerRatesQuery = useQuery({ queryKey: ["payroll-settings", "worker-rates", scopeKey, activeTab === "workers" ? detailKey : "all"], queryFn: () => listWorkerPayrollRates(activeTab === "workers" ? focusedWorker : undefined), enabled: (activeTab === "worker-rates" || activeTab === "workers" && loadWorkerDetails) && capabilityReady && (canViewRates || canManageRates) });
  const insuranceQuery = useQuery({ queryKey: ["payroll-settings", "insurance", scopeKey, activeTab === "workers" ? detailKey : "all"], queryFn: () => listSocialInsuranceVersions(activeTab === "workers" ? focusedWorker : undefined), enabled: (activeTab === "insurance" || activeTab === "workers" && loadWorkerDetails) && capabilityReady && canManageInsurance });
  const banksQuery = useQuery({ queryKey: ["payroll-settings", "banks", scopeKey], queryFn: () => listWorkerBankAccounts(), enabled: ["banks"].includes(activeTab) && capabilityReady && canManageBanks });
  const adjustmentsQuery = useQuery({ queryKey: ["payroll-settings", "adjustments", scopeKey, activeTab === "workers" ? detailKey : "all"], queryFn: () => localApi.payrollAdjustments({workerId: activeTab === "workers" ? focusedWorker : undefined}), enabled: (activeTab === "adjustments" || activeTab === "workers" && loadWorkerDetails) && isLocalBackend() && capabilityReady && (canView || canManageAdjustments) });
  const localRunsQuery = useQuery({ queryKey: ["payroll-settings", "runs", scopeKey], queryFn: () => localApi.payrollRuns(), enabled: ["runs"].includes(activeTab) && isLocalBackend() && capabilityReady && canViewRuns });

  const workerEditingQueries = [
    workersQuery,
    ...((canView || canManagePolicies) ? [groupsQuery, assignmentsQuery] : []),
    ...(isLocalBackend() && workerAccess ? [workerProfilesQuery] : []),
    ...((canView || canManageWorkers) ? [teamsQuery] : []),
    ...((canViewRates || canManageRates) ? [ratesQuery, workerRatesQuery] : []),
    ...(canManageInsurance ? [insuranceQuery] : []),
    ...(isLocalBackend() && (canView || canManageAdjustments) ? [adjustmentsQuery] : []),
  ];
  const workerEditingReady = loadWorkerDetails && workerEditingQueries.every(query => query.isSuccess && !query.isFetching);
  const workerEditingError = workerEditingQueries.find(query => query.isError)?.error;

  const [showPayrollTestWorkers, setShowPayrollTestWorkers] = useState(false);
  const allPayrollWorkers = useMemo(() => workersQuery.data ?? [], [workersQuery.data]);
  const testPayrollWorkers = useMemo(() => allPayrollWorkers.filter(isPayrollTestWorker), [allPayrollWorkers]);
  const visiblePayrollWorkers = useMemo(
    () => showPayrollTestWorkers ? allPayrollWorkers : allPayrollWorkers.filter((worker) => !isPayrollTestWorker(worker)),
    [allPayrollWorkers, showPayrollTestWorkers],
  );
  const visiblePayrollWorkerIds = useMemo(() => new Set(visiblePayrollWorkers.map((worker) => worker.id)), [visiblePayrollWorkers]);
  const filterPayrollWorkerRows = <T extends { worker_id: string }>(rows: T[]) => rows.filter((row) => visiblePayrollWorkerIds.has(row.worker_id));
  const visibleAssignments = filterPayrollWorkerRows(assignmentsQuery.data ?? []);
  const visibleWorkerProfiles = filterPayrollWorkerRows((workerProfilesQuery.data ?? []) as WorkerPayrollProfile[]);
  const visibleWorkerRates = filterPayrollWorkerRows(workerRatesQuery.data ?? []);
  const visibleInsurance = filterPayrollWorkerRows((insuranceQuery.data ?? []) as SocialInsuranceVersion[]);
  const visibleBanks = filterPayrollWorkerRows((banksQuery.data ?? []) as PayrollBankAccount[]);
  const visibleAdjustments = filterPayrollWorkerRows((adjustmentsQuery.data ?? []) as PayrollAdjustment[]);
  const visibleTeams = (teamsQuery.data ?? []).filter((team) => visiblePayrollWorkerIds.has(team.worker_id) && visiblePayrollWorkerIds.has(team.supervisor_worker_id));

  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["payroll-settings"] }); };
  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!pendingAction || !actionReason.trim()) throw new Error("Lý do là bắt buộc.");
      return pendingAction.run(actionReason.trim());
    },
    onSuccess: async () => { toast.success("Đã hoàn tất thao tác"); setPendingAction(null); setActionReason(""); await refresh(); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const requestAction: RequestAction = (action) => { setPendingAction(action); setActionReason(""); };

  const dataQueries = [workersQuery, groupsQuery, assignmentsQuery, workerProfilesQuery, teamsQuery, productsQuery, ratesQuery, workerRatesQuery, insuranceQuery, banksQuery, adjustmentsQuery, localRunsQuery];
  const firstError = dataQueries.find((query) => query.isError)?.error;
  const capabilities = capabilitiesQuery.data ?? [];
  const TestWorkerVisibilityIcon = showPayrollTestWorkers ? EyeOff : Eye;

  if (!authReady || !user || capabilitiesQuery.isLoading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (capabilitiesQuery.isError) return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Không thể kiểm tra quyền tiền lương</AlertTitle><AlertDescription className="space-y-3"><p>{errorMessage(capabilitiesQuery.error)}</p><Button variant="outline" size="sm" onClick={() => void capabilitiesQuery.refetch()}>Thử lại</Button></AlertDescription></Alert>;
  if (!capabilities.some((item) => item.allowed)) return <DeniedPanel message="Tài khoản chưa được cấp quyền xem hoặc quản lý dữ liệu lương." />;

  return <div className="mx-auto w-full max-w-[1500px] space-y-4 [&_button:not([role=switch])]:min-h-11 [&_a.inline-flex]:min-h-11 [&_input]:min-h-11 lg:[&_button:not([role=switch])]:min-h-9 lg:[&_input]:min-h-10 lg:[&_a.inline-flex]:min-h-9">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div className="flex min-w-0 flex-wrap items-center gap-2"><h1 className="flex min-h-11 min-w-0 items-center text-lg font-semibold tracking-tight sm:text-xl lg:min-h-9">Tiền lương</h1>{testPayrollWorkers.length > 0 && <Badge variant="outline" className="text-[11px]">{showPayrollTestWorkers ? "Đang hiện dữ liệu kiểm thử" : `Đang ẩn ${testPayrollWorkers.length} dòng kiểm thử`}</Badge>}</div>
      <div className="flex flex-wrap items-center justify-end gap-1 xl:col-start-3">
        {testPayrollWorkers.length > 0 && <Button variant={showPayrollTestWorkers ? "secondary" : "outline"} size="sm" className="h-11 lg:h-9" onClick={() => setShowPayrollTestWorkers((value) => !value)}><TestWorkerVisibilityIcon className="mr-1.5 h-4 w-4" />{showPayrollTestWorkers ? "Ẩn dữ liệu kiểm thử" : `Hiện dữ liệu kiểm thử (${testPayrollWorkers.length})`}</Button>}
        <Button asChild variant="outline" size="sm" className="h-11 w-11 px-0 lg:h-9 lg:w-auto lg:px-3"><Link to="/production-attendance" aria-label="Chấm công xưởng" title="Chấm công xưởng"><CalendarCheck2 className="h-4 w-4 lg:mr-1.5" /><span className="hidden lg:inline">Chấm công xưởng</span></Link></Button>
        <Button variant="ghost" size="icon" className="h-11 w-11 lg:h-9 lg:w-9" onClick={() => void refresh()} aria-label="Tải lại dữ liệu"><RefreshCw className="h-4 w-4" /></Button>
      </div>
    </div>
    {dataQueries.some(query=>query.isFetching)&&<p role="status" className="text-xs text-muted-foreground">Đang tải dữ liệu từng phần…</p>}
    {firstError && <Alert className="border-amber-300 bg-amber-50 text-amber-950" variant="default"><AlertTriangle className="h-4 w-4" /><AlertTitle>Một phần dữ liệu chưa tải được</AlertTitle><AlertDescription>{errorMessage(firstError)} <Button variant="outline" size="sm" onClick={()=>void refresh()}>Thử lại phần dữ liệu</Button></AlertDescription></Alert>}
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1" aria-label="Phân hệ tiền lương">{payrollTabOptions.filter(([value])=>isLocalBackend()||value!=='runs').map(([value,label])=><Button key={value} variant={primaryTab===value?'default':'ghost'} className="h-auto min-h-12 whitespace-normal px-2 text-xs sm:text-sm" onClick={()=>navigateTab(value)}>{label}</Button>)}</div>
    <div className="flex flex-wrap gap-2">{(primaryTab==='workers'?[["workers","Hồ sơ lương"],["worker-rates","Mức lương nâng cao"],["insurance","BHXH theo quyền"],["banks","Ngân hàng theo quyền"]]:primaryTab==='policies'?[["policies","Tăng ca, tiền ăn & lịch công"],["groups","Nhóm áp dụng"],["rates","Bảng giá công may"]]:[["runs","Tính và đối soát"],["adjustments","Khoản cộng / trừ trong tháng"]]).map(([value,label])=><Button size="sm" key={value} variant={activeTab===value?'secondary':'outline'} onClick={()=>navigateTab(value)}>{label}</Button>)}</div>
    {searchParams.get('month')&&primaryTab!=='runs'&&<Button asChild variant="outline"><Link to={payrollContextLink('/payroll-settings?tab=runs',searchParams)}>← Trở lại kỳ {searchParams.get('month')}</Link></Button>}
    <Tabs value={activeTab} onValueChange={navigateTab} className="space-y-4">
      <TabsContent value="overview"><PayrollOverviewTab workers={visiblePayrollWorkers} groups={groupsQuery.data ?? []} assignments={visibleAssignments} workerRates={visibleWorkerRates} productRates={ratesQuery.data ?? []} insurance={visibleInsurance} adjustments={visibleAdjustments} runs={(localRunsQuery.data ?? []) as Record<string, unknown>[]} canSeeRates={canViewRates || canManageRates} canSeeInsurance={canManageInsurance} /></TabsContent>
      <TabsContent value="workers">{canView || canManageWorkers || canManagePolicies ? isLocalBackend() && !focusedWorker ? <PayrollWorkerRoster workers={visiblePayrollWorkers} ready={workersQuery.isSuccess && !workersQuery.isFetching} error={workersQuery.error} refresh={refresh} /> : <WorkersTab key={`${scopeKey}:${focusedWorker || "all"}`} dataReady={workerEditingReady} dataError={workerEditingError} workers={visiblePayrollWorkers} groups={groupsQuery.data ?? []} assignments={visibleAssignments} profiles={visibleWorkerProfiles} workerRates={visibleWorkerRates} insurance={visibleInsurance} adjustments={visibleAdjustments} productRates={ratesQuery.data ?? []} teams={visibleTeams} canManage={canManageWorkers} canManagePolicies={canManagePolicies} canManageRates={canManageRates} canManageInsurance={canManageInsurance} requestAction={requestAction} refresh={refresh} /> : <DeniedPanel message="Cần quyền xem hoặc quản lý nhân sự thuộc phân hệ tiền lương." />}</TabsContent>
      <TabsContent value="policies">{canView || canManagePolicies ? <div className="space-y-4">{isLocalBackend() && canViewRuns && <PayrollVersionSettings key={scopeKey} canManage={canManagePolicies} scopeKey={scopeKey} />}<PayrollHelp title="Hướng dẫn và tài liệu công thức tham khảo"><PayrollPoliciesTab /></PayrollHelp></div> : <DeniedPanel message="Cần quyền xem hoặc quản lý chính sách lương." />}</TabsContent>
      <TabsContent value="groups">{canView || canManagePolicies ? <PolicyGroupsTab groups={groupsQuery.data ?? []} canManage={canManagePolicies} refresh={refresh} /> : <DeniedPanel message="Cần quyền xem hoặc quản lý chính sách lương." />}</TabsContent>
      <TabsContent value="worker-rates">{canViewRates || canManageRates ? <WorkerRatesTab workers={visiblePayrollWorkers} rates={visibleWorkerRates} canManage={canManageRates} requestAction={requestAction} refresh={refresh} /> : <DeniedPanel message="Cần quyền xem mức lương nhân sự." />}</TabsContent>
      <TabsContent value="rates">{canViewRates || canManageRates ? <ProductRatesTab products={productsQuery.data ?? []} rates={ratesQuery.data ?? []} canManage={canManageRates} requestAction={requestAction} refresh={refresh} /> : <DeniedPanel message="Cần quyền xem đơn giá sản phẩm." />}</TabsContent>
       <TabsContent value="insurance"><InsuranceTab workers={visiblePayrollWorkers} versions={visibleInsurance} canManage={canManageInsurance} requestAction={requestAction} refresh={refresh} /></TabsContent>
       <TabsContent value="banks"><BankAccountsTab key={scopeKey} workers={visiblePayrollWorkers} accounts={visibleBanks} canManage={canManageBanks} requestAction={requestAction} refresh={refresh} /></TabsContent>
       {isLocalBackend() && <TabsContent value="adjustments"><LocalPayrollAdjustmentsTab workers={visiblePayrollWorkers} adjustments={visibleAdjustments} canManage={canManageAdjustments} requestAction={requestAction} refresh={refresh} /></TabsContent>}
       {isLocalBackend() && <TabsContent value="runs">{canViewRuns ? <PayrollMonthWorkbench canSources={hasPermission("production_view") || hasPermission("production_operations") || hasPermission("production_manage")} canPolicies={canManagePolicies} canWorkers={canManageWorkers} canAdjustments={canManageAdjustments} key={scopeKey} scopeKey={scopeKey} runs={(localRunsQuery.data ?? []) as Record<string, unknown>[]} workers={visiblePayrollWorkers} workersReady={workersQuery.isSuccess} canManage={canManageRuns} refresh={refresh} /> : <DeniedPanel message="Kỳ lương tổng hợp chỉ dành cho quản lý, kế toán và quản trị viên. Nhân viên xem thu nhập tại Chấm công của tôi." />}</TabsContent>}
    </Tabs>
    <Dialog open={!!pendingAction} onOpenChange={(open) => { if (!open && !actionMutation.isPending) { setPendingAction(null); setActionReason(""); } }}><DialogContent><DialogHeader><DialogTitle>{pendingAction?.title}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">{pendingAction?.description}</p><div className="space-y-2"><Label>Lý do</Label><Textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)} placeholder="Ghi rõ lý do để lưu nhật ký" /></div><DialogFooter><Button variant="outline" disabled={actionMutation.isPending} onClick={() => { setPendingAction(null); setActionReason(""); }}>Hủy</Button><Button variant={pendingAction?.destructive ? "destructive" : "default"} disabled={!actionReason.trim() || actionMutation.isPending} onClick={() => actionMutation.mutate()}>{actionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{pendingAction?.confirmLabel}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
