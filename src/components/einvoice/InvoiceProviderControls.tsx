import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  invoiceRequest,
  type InvoiceCompany,
} from "@/lib/invoice-workspace-api";
import { invoiceToday } from "@/lib/invoice-date";
type Diagnostic = { code: string; message: string; next_action: string; http_status?: number };
type Account = {
  configured: boolean;
  enabled: boolean;
  username: string;
  page_start: number;
  revision: string;
  last_checked_at: string | null;
  last_check_status: string | null;
  last_check_code: string | null;
  last_check_diagnostic: Diagnostic | null;
};
const today = invoiceToday;
export function InvoiceProviderSettings({
  company,
}: {
  company: InvoiceCompany;
}) {
  const cache = useQueryClient(),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [enabled, setEnabled] = useState(false),
    [pageStart, setPageStart] = useState(1),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [from, setFrom] = useState(today()),
    [to, setTo] = useState(today());
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const route = "/companies/" + encodeURIComponent(company.id) + "/viettel";
  const account = useQuery({
    queryKey: ["invoice-provider", company.id],
    queryFn: ({ signal }) =>
      invoiceRequest<Account>(route, "GET", undefined, signal),
  });
  useEffect(() => {
    if (account.data) {
      setUsername(account.data.username);
      setEnabled(account.data.enabled);
      setPageStart(account.data.page_start);
    }
  }, [account.data]);
  const action = async (check: boolean) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (check) {
        const result = await invoiceRequest<{ note: string; normalization?: { checked: boolean; ready_count: number; unsupported_count: number; needs_review_count: number } }>(
          route + "/check",
          "POST",
          { from, to },
        );
        if (live.current) {
          const check = result.normalization;
          setMessage("Đã đọc được Viettel. " + result.note + (check?.checked ? ` Chuẩn hóa được ${check.ready_count} hóa đơn; chưa hỗ trợ ${check.unsupported_count}; có cảnh báo cần kiểm tra ${check.needs_review_count}.` + (check.unsupported_count ? " Có dữ liệu chưa phù hợp để nhập; cần đối chiếu cấu trúc hoặc độ chính xác nguồn trước khi đồng bộ." : " Chuẩn hóa được chưa xác nhận đủ tệp gốc hoặc tính hợp lệ pháp lý.") : ""));
        }
      } else {
        await invoiceRequest(route, "PUT", {
          expected_revision: account.data?.revision ?? "0",
          username,
          password,
          enabled,
          page_start: pageStart,
          reason,
        });
        if (live.current) {
          setPassword("");
          setMessage("Đã lưu tài khoản; cần kiểm tra đọc để xác nhận kết nối.");
        }
      }
    } catch (e) {
      if (live.current)
        setError(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      await Promise.allSettled([
        cache.invalidateQueries({ queryKey: ["invoice-provider", company.id] }),
        cache.invalidateQueries({ queryKey: ["invoice-capabilities", company.id] }),
      ]);
      if (live.current) setBusy(false);
    }
  };
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">Tài khoản API Viettel S-Invoice</h3>
      <p className="text-sm text-muted-foreground">
        MST {company.tax_code}. Bật quyền kết nối API cho tài khoản trên website
        Viettel. Tài khoản chỉ dùng API đọc hóa đơn bán ra và tải ZIP gốc; không
        ký/phát hành. Mật khẩu lưu riêng ở máy chủ, không trả về trình duyệt.
      </p>
      {account.isPending && <p>Đang tải cấu hình…</p>}
      {(error || account.error) && (
        <p role="alert" className="text-destructive">
          {error || account.error?.message}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <Label>Tên đăng nhập API</Label>
      <Input
        autoComplete="off"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <Label>
        Mật khẩu {account.data?.configured ? "(để trống để giữ hiện tại)" : ""}
      </Label>
      <Input
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Bật nguồn đọc Viettel
      </label>
      <details>
        <summary className="text-sm">Phân trang nâng cao</summary>
        <Label>Trang đầu theo tài khoản Viettel</Label>
        <select
          value={pageStart}
          onChange={(e) => setPageStart(Number(e.target.value))}
        >
          <option value={1}>1 (ví dụ tài liệu Viettel)</option>
          <option value={0}>0 (giới hạn bảng đặc tả)</option>
        </select>
        <p className="text-xs">
          Chỉ đổi khi tài khoản yêu cầu; hệ thống đối chiếu totalRows và không
          báo đủ khi trang lặp.
        </p>
      </details>
      <Label>Lý do thay đổi cấu hình</Label>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button
        disabled={
          busy || account.isPending || !!account.error || !reason.trim()
        }
        onClick={() => void action(false)}
      >
        Lưu cấu hình
      </Button>
      <p className="text-sm">
        Kiểm tra gần nhất: {account.data?.last_check_status ?? "Chưa kiểm tra"}{" "}
        {account.data?.last_check_code ?? ""}{" "}
        {account.data?.last_checked_at ?? ""}
      </p>
      {account.data?.last_check_diagnostic && (
        <p className="text-sm" role="status">
          {account.data.last_check_diagnostic.message}{" "}
          {account.data.last_check_diagnostic.next_action}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Từ ngày</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label>Đến ngày</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      <Button
        variant="outline"
        disabled={busy || !account.data?.enabled}
        onClick={() => void action(true)}
      >
        Kiểm tra đọc một trang (không nhập)
      </Button>
    </section>
  );
}
type Job = {
  id: string;
  actor_id: string;
  date_from: string;
  date_to: string;
  status: string;
  pages: number;
  received: number;
  last_error: string | null;
  diagnostic?: Diagnostic | null;
  can_resume?: boolean;
  outcomes?: {
    new: number;
    observed_update: number;
    existing: number;
    needs_review: number;
  };
  failed_attempts?: number;
};
export function InvoiceSyncDialog({
  company,
  open,
  onOpenChange,
  onSaved,
}: {
  company: InvoiceCompany;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const cache = useQueryClient(),
    [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today()),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    request = useRef<{ body: string; key: string } | null>(null),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const jobs = useQuery({
    queryKey: ["invoice-provider-jobs", company.id],
    queryFn: ({ signal }) =>
      invoiceRequest<Job[]>(
        "/sync-jobs?company_id=" + encodeURIComponent(company.id),
        "GET",
        undefined,
        signal,
      ),
    enabled: open,
  });
  const action = async (job?: Job) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = {
          company_id: company.id,
          source: "VIETTEL",
          from,
          to,
          reason,
        },
        hash = JSON.stringify(body);
      if (!request.current || request.current.body !== hash)
        request.current = { body: hash, key: crypto.randomUUID() };
      const result = await invoiceRequest<{ complete: boolean; job: Job }>(
        job ? "/sync-jobs/" + encodeURIComponent(job.id) + "/resume" : "/sync",
        "POST",
        job ? {} : { ...body, request_key: request.current.key },
      );
      if (live.current) {
        setMessage(
          result.complete
            ? "Đã đọc đủ số hóa đơn theo totalRows nguồn. Tệp gốc và nội dung vẫn cần kiểm tra riêng."
            : "Đã lưu checkpoint một trang. Bấm Tiếp tục để đọc trang kế tiếp.",
        );
        if (result.complete) request.current = null;
      }
      onSaved();
    } catch (e) {
      if (live.current)
        setError(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      await Promise.allSettled([cache.invalidateQueries({
        queryKey: ["invoice-provider-jobs", company.id],
      })]);
      if (live.current) setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Đọc hóa đơn bán ra từ Viettel</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          MST {company.tax_code}. Mỗi lượt tối đa 3 tháng, mỗi lần nhận một
          trang và lưu checkpoint. CQT/đầu vào: nhập tệp tải hợp lệ. API đọc
          không tạo nháp, ký hoặc phát hành.
        </p>
        {(error || jobs.error) && (
          <p role="alert" className="text-destructive">
            {error || jobs.error?.message}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Từ ngày</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label>Đến ngày</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <Label>Lý do tiếp nhận</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button
          disabled={
            busy || !reason.trim() || !company.capabilities.includes("import")
          }
          onClick={() => void action()}
        >
          Đọc trang đầu / thử lại yêu cầu
        </Button>
        {jobs.isPending && <p>Đang tải lịch sử…</p>}
        {jobs.data?.length === 0 && <p>Chưa có lượt đồng bộ.</p>}
        {jobs.data?.map((job) => (
          <div key={job.id} className="space-y-1 rounded border p-3 text-sm">
            <p>
              {String(job.date_from).slice(0, 10)} –{" "}
              {String(job.date_to).slice(0, 10)} · {job.status}
            </p>
            <p>
              {job.pages} trang · {job.received} hóa đơn nhận từ nguồn
            </p>
            {job.outcomes && (
              <p>
                Mới {job.outcomes.new} · Thêm bằng chứng{" "}
                {job.outcomes.observed_update} · Đã có {job.outcomes.existing} ·
                Cần kiểm tra {job.outcomes.needs_review}. Lượt lỗi{" "}
                {job.failed_attempts ?? 0}.
              </p>
            )}
            {job.last_error && (
              <p role="alert" className="text-destructive">
                {job.diagnostic ? `${job.diagnostic.message} ${job.diagnostic.next_action}` : job.last_error}
              </p>
            )}
            {job.status !== "COMPLETE" &&
              company.capabilities.includes("import") &&
              job.can_resume !== false && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void action(job)}
                >
                  Tiếp tục từ checkpoint
                </Button>
              )}
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
