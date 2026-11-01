import { useState } from "react";
import type { PayrollBankAccount, PayrollWorker } from "@/lib/payroll-master-data";
import { quickCreateProductionWorker } from "@/lib/production-execution";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pencil, Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

type Summary = PayrollWorker & { current_effective_from?: string; current_effective_to?: string | null; payroll_draft_count?: number; has_current_payroll_profile?: boolean };
const compensationNames: Record<string, string> = { MONTHLY_MANAGER: "Quản lý lương tháng", MONTHLY_HELPER: "Lương ngày / tháng", PIECE_RATE: "Theo sản lượng may", HOURLY: "Theo giờ" };
const payrollStatuses: Record<string, string> = { ACTIVE: "Đang làm việc", SUSPENDED: "Tạm dừng tính lương", TERMINATED: "Đã nghỉ việc" };
const today = () => new Date().toISOString().slice(0, 10);

export default function PayrollWorkerRoster({ workers, banks = [], ready, refreshing = false, error, canManage, refresh, onEditWorker }: { workers: Summary[]; banks?: PayrollBankAccount[]; ready: boolean; refreshing?: boolean; error: unknown; canManage: boolean; refresh: () => Promise<void>; onEditWorker: (workerId: string) => void }) {
  const [search, setSearch] = useState("");
  const [quickName, setQuickName] = useState("");
  const [creating, setCreating] = useState(false);
  const rows = workers.filter((worker) => `${worker.employee_code} ${worker.display_name} ${worker.position_title || ""}`.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")));
  const bankForWorker = (workerId: string) => {
    const asOf = today();
    const accounts = banks.filter((account) => account.worker_id === workerId && account.status !== "RETIRED" && account.effective_from <= asOf && (!account.effective_to || account.effective_to >= asOf)).sort((left, right) => Number(right.is_primary) - Number(left.is_primary) || right.effective_from.localeCompare(left.effective_from));
    return accounts.find((account) => account.status === "VERIFIED") || accounts[0] || null;
  };
  const handleQuickAddWorker = async () => {
    const displayName = quickName.trim();
    if (!canManage || !displayName || creating) return;
    setCreating(true);
    try {
      const created = await quickCreateProductionWorker({ display_name: displayName });
      setQuickName("");
      toast.success(`Đã thêm ${created.display_name}. Có thể chấm công ngay; thiết lập và duyệt lương trước khi duyệt công/tính lương.`);
      await refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Không thể thêm nhân sự."); } finally { setCreating(false); }
  };
  if (!ready) return <Alert variant={error ? "destructive" : "default"}><AlertDescription className="flex flex-wrap items-center justify-between gap-2"><span>{error instanceof Error ? error.message : error ? "Không tải được danh sách nhân sự." : "Đang tải danh sách nhân sự…"}</span><Button variant="outline" size="sm" disabled={!error} onClick={() => void refresh()}>Thử lại</Button></AlertDescription></Alert>;
  const workerIdentity = (worker: Summary) => <div className="min-w-0"><p className="truncate font-medium">{worker.display_name}</p><p className="text-xs text-muted-foreground">{worker.employee_code}<span className="hidden md:inline"> · {payrollStatuses[worker.payroll_status] || worker.payroll_status}</span></p></div>;
  const workerBank = (worker: Summary) => { const bank = bankForWorker(worker.id); return bank ? <div className="min-w-0 text-xs"><p className="truncate font-medium">{bank.bank_name}</p><p className="font-mono text-muted-foreground">{bank.account_number_masked}</p>{bank.status !== "VERIFIED" && <p className="text-amber-700">Chưa xác minh</p>}</div> : <span className="text-xs text-muted-foreground">Chưa có tài khoản hiệu lực</span>; };
  return <section className="space-y-3 rounded-xl border bg-card p-3 sm:p-4" aria-label="Danh sách nhân sự">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-base font-semibold">Nhân sự ({rows.length})</h2>{refreshing && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Đang làm mới</span>}</div>
    <div className="flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Tìm nhân sự" placeholder="Tìm tên hoặc mã nhân sự…" className="min-h-11 pl-9 text-base sm:text-sm" value={search} onChange={(event) => setSearch(event.target.value)} /></div>{canManage && <div className="flex min-w-0 gap-2"><Input aria-label="Nhập tên nhân sự mới" placeholder="Họ tên nhân sự mới" className="min-h-11 min-w-0 text-base sm:w-52 sm:text-sm" value={quickName} onChange={(event) => setQuickName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleQuickAddWorker(); } }} disabled={creating} /><Button className="min-h-11 shrink-0" disabled={creating || !quickName.trim()} onClick={() => void handleQuickAddWorker()}><Plus className="mr-1 h-4 w-4" />{creating ? "Đang thêm" : "Thêm"}</Button></div>}</div>
    {!rows.length ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Không có nhân sự phù hợp.</div> : <><div className="space-y-2 md:hidden">{rows.map((worker) => <article key={worker.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-3">{workerIdentity(worker)}<Badge variant={worker.payroll_status === "ACTIVE" ? "default" : "secondary"}>{payrollStatuses[worker.payroll_status] || worker.payroll_status}</Badge></div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Hình thức lương</p><p>{compensationNames[worker.current_compensation_type || ""] || "Chưa thiết lập"}</p></div><div><p className="text-xs text-muted-foreground">Tài khoản nhận lương</p>{workerBank(worker)}</div></div><Button className="mt-3 min-h-11 w-full" variant="outline" onClick={() => onEditWorker(worker.id)}><Pencil className="mr-2 h-4 w-4" />{canManage ? "Sửa hồ sơ" : "Xem hồ sơ"}</Button></article>)}</div><div className="hidden overflow-x-auto rounded-lg border md:block"><Table className="min-w-[720px]"><TableHeader className="bg-muted/50"><TableRow><TableHead>Nhân sự</TableHead><TableHead>Hình thức lương</TableHead><TableHead>Tài khoản nhận lương</TableHead><TableHead className="text-right">Thao tác</TableHead></TableRow></TableHeader><TableBody>{rows.map((worker) => <TableRow key={worker.id}><TableCell className="py-3">{workerIdentity(worker)}</TableCell><TableCell className="py-3 text-sm">{compensationNames[worker.current_compensation_type || ""] || "Chưa thiết lập"}</TableCell><TableCell className="py-3">{workerBank(worker)}</TableCell><TableCell className="py-3 text-right"><Button variant="outline" size="sm" className="min-h-10" onClick={() => onEditWorker(worker.id)}><Pencil className="mr-1.5 h-3.5 w-3.5" />{canManage ? "Sửa" : "Xem"}</Button></TableCell></TableRow>)}</TableBody></Table></div></>}
  </section>;
}
