import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  invoiceRequest,
  invoiceDownloadBlob,
  invoiceDownloadBase64,
  type InvoiceCompany,
  type InvoiceRecord,
} from "@/lib/invoice-workspace-api";
import { InvoiceDraftDialog } from "@/components/einvoice/InvoiceDraftDialog";
import { InvoiceImportDialog } from "@/components/einvoice/InvoiceImportDialog";
import {
  InvoiceProviderSettings,
  InvoiceSyncDialog,
} from "@/components/einvoice/InvoiceProviderControls";
import { InvoiceDetailDialog } from "@/components/einvoice/InvoiceDetailDialog";
import { isLocalBackend } from "@/lib/runtime-config";
import { toast } from "sonner";
import { Settings, Plus, Upload, RefreshCw, FileText } from "lucide-react";
import { invoiceBusinessDate, invoiceToday } from "@/lib/invoice-date";
import { useSearchParams } from "react-router-dom";
import {
  invoicePaymentLabels,
  invoiceSourceStateLabels,
} from "@/lib/invoice-workspace-api";
type List = {
  rows: InvoiceRecord[];
  stats: {
    total: number;
    incoming: number;
    outgoing: number;
    missing_files: number;
    unlinked: number;
  };
  page: number;
  limit: number;
};
const money = (v: unknown, c: string) => `${String(v ?? "0")} ${c}`;
const thisMonth = () => invoiceToday().slice(0, 7);
export default function EInvoiceManagement() {
  return isLocalBackend() ? (
    <InvoiceWorkspace />
  ) : (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Quản lý hóa đơn</h1>
      <p>
        Workspace hóa đơn cần backend local đã cập nhật. Không có thao tác
        ký/phát hành trong giao diện này.
      </p>
    </div>
  );
}
function InvoiceWorkspace() {
  const [urlParams] = useSearchParams();
  const cache = useQueryClient(),
    [companyId, setCompanyId] = useState(urlParams.get("company_id") ?? ""),
    [tab, setTab] = useState(urlParams.get("contract_id") ? "ALL" : "QUEUE"),
    [period, setPeriod] = useState(
      urlParams.get("contract_id") ? "" : thisMonth(),
    ),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [contractFilter, setContractFilter] = useState(
      urlParams.get("contract_id") ?? "",
    ),
    [paymentFilter, setPaymentFilter] = useState(""),
    [missingPdf, setMissingPdf] = useState(false),
    [missingBusiness, setMissingBusiness] = useState(false),
    [checklistFilter, setChecklistFilter] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [source, setSource] = useState(""),
    [missing, setMissing] = useState(false),
    [unlinked, setUnlinked] = useState(false),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<string | null>(null),
    [draft, setDraft] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [settings, setSettings] = useState(false),
    [sync, setSync] = useState(false),
    [periodOpen, setPeriodOpen] = useState(false),
    [error, setError] = useState(""),
    [why, setWhy] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [tax, setTax] = useState(""),
    [address, setAddress] = useState(""),
    [grantUser, setGrantUser] = useState(""),
    [grantCaps, setGrantCaps] = useState(["view"]),
    [adopt, setAdopt] = useState<null | {
      company_id: string;
      rows: Record<string, unknown>[];
    }>(null),
    [adoptCompany, setAdoptCompany] = useState("");
  const pending = useRef(false),
    generation = useRef(0);
  const companies = useQuery({
    queryKey: ["invoice-companies"],
    queryFn: () => invoiceRequest<InvoiceCompany[]>("/companies"),
  });
  useEffect(() => {
    if (!companyId && companies.data)
      setCompanyId(companies.data[0]?.id ?? "legacy");
  }, [companies.data, companyId]);
  useEffect(() => {
    setPage(1);
    setBusy(false);
    setSelected(null);
    setAdopt(null);
    generation.current++;
    const lifecycle = generation;
    return () => {
      lifecycle.current++;
    };
  }, [
    companyId,
    tab,
    period,
    from,
    to,
    contractFilter,
    paymentFilter,
    missingPdf,
    missingBusiness,
    checklistFilter,
    search,
    status,
    source,
    missing,
    unlinked,
  ]);
  const company = companies.data?.find((c) => c.id === companyId),
    can = (cap: string) => !!company?.capabilities.includes(cap);
  const users = useQuery({
    queryKey: ["invoice-users", companyId],
    queryFn: () =>
      invoiceRequest<Record<string, unknown>[]>(
        "/users?company_id=" + encodeURIComponent(companyId),
      ),
    enabled: settings && can("configure"),
  });
  const contractFilters = useQuery({
    queryKey: ["invoice-workspace", "contract-filters", companyId],
    queryFn: () =>
      invoiceRequest<Record<string, unknown>[]>(
        "/contracts?company_id=" + encodeURIComponent(companyId),
      ),
    enabled: !!company,
  });
  const params = new URLSearchParams({
    company_id: companyId,
    page: String(page),
    limit: "25",
    ...(period && !from && !to ? { period } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(contractFilter ? { contract_id: contractFilter } : {}),
    ...(paymentFilter ? { payment_state: paymentFilter } : {}),
    ...(missingPdf ? { missing_pdf: "true" } : {}),
    ...(missingBusiness ? { missing_business: "true" } : {}),
    ...(checklistFilter ? { checklist: checklistFilter } : {}),
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    ...(source ? { source } : {}),
    ...(missing ? { missing_file: "true" } : {}),
    ...(unlinked ? { unlinked: "true" } : {}),
    ...(tab === "QUEUE"
      ? { queue: "true" }
      : tab === "IN"
        ? { direction: "IN" }
        : tab === "OUT"
          ? { direction: "OUT" }
          : {}),
  });
  const invoices = useQuery({
    queryKey: ["invoice-workspace", "list", params.toString()],
    queryFn: ({ signal }) =>
      invoiceRequest<List>("/invoices?" + params, "GET", undefined, signal),
    enabled: !!companyId,
  });
  const periods = useQuery({
    queryKey: ["invoice-workspace", "periods", companyId, period],
    queryFn: () =>
      invoiceRequest<{
        rows: Record<string, unknown>[];
        changed_since_close: boolean;
      }>("/periods?" + new URLSearchParams({ company_id: companyId, period })),
    enabled: !!company && can("review") && !!period,
  });
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ["invoice-workspace"] });
    await cache.invalidateQueries({ queryKey: ["invoice-companies"] });
  };
  const run = async (fn: () => Promise<unknown>, success: string) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const gen = generation.current;
    try {
      await fn();
      if (gen === generation.current) {
        toast.success(success);
        setWhy("");
        await refresh();
      }
    } catch (e) {
      if (gen === generation.current)
        setError(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      pending.current = false;
      if (gen === generation.current) setBusy(false);
    }
  };
  const exportList = async () => {
    try {
      const result = await invoiceRequest<{
        filename: string;
        content: string;
        has_more: boolean;
      }>("/export?" + params);
      invoiceDownloadBlob(
        new Blob([result.content], { type: "text/csv;charset=utf-8" }),
        result.filename,
      );
      if (result.has_more)
        toast.info(
          "Đã xuất trang dữ liệu. Chuyển trang để xuất phần tiếp theo.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xuất được.");
    }
  };
  const exportDocs = async () => {
    try {
      const result = await invoiceRequest<{ filename: string; base64: string }>(
        "/export-documents",
        "POST",
        {
          company_id: companyId,
          invoice_ids: invoices.data?.rows.map((r) => r.id),
        },
      );
      invoiceDownloadBase64(result.base64, result.filename, "application/zip");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xuất được.");
    }
  };
  const adoption = async (id: string) => {
    if (!adoptCompany) return;
    await run(async () => {
      setAdopt(
        await invoiceRequest("/adoption/preview", "POST", {
          company_id: adoptCompany,
          ids: [id],
        }),
      );
    }, "Đã đối chiếu MST; xem trước khi xác nhận");
  };
  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FileText className="h-6 w-6" />
            Quản lý hóa đơn
          </h1>
          <p className="text-sm text-muted-foreground">
            Tiếp nhận bằng chứng, quản lý nháp và đối chiếu hồ sơ
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!can("import")}
            onClick={() => setSync(true)}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Đồng bộ
          </Button>
          <Button
            variant="outline"
            disabled={!can("import")}
            onClick={() => setImportOpen(true)}
          >
            <Upload className="mr-2 h-4 w-4" />
            Nhập tệp
          </Button>
          <Button disabled={!can("draft")} onClick={() => setDraft(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Tạo nháp
          </Button>
          <Button
            variant="outline"
            aria-label="Cấu hình doanh nghiệp và nguồn"
            onClick={() => setSettings(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="rounded border bg-muted/30 p-3 text-sm">
        Viettel: kiểm tra kết nối và đọc hóa đơn trong Cấu hình/Đồng bộ.
        CQT/đầu vào: nhập tệp tải hợp lệ. CRM không ký/phát hành hóa đơn.
      </div>
      {(error || companies.isError) && (
        <div
          role="alert"
          className="rounded border border-destructive p-3 text-sm"
        >
          <p>{error || companies.error?.message}</p>
          <Button
            variant="outline"
            onClick={() => {
              setError("");
              void companies.refetch();
              void invoices.refetch();
            }}
          >
            Thử lại
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Doanh nghiệp/MST</Label>
          <select
            className="h-10 w-full rounded border bg-background px-2"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="" disabled>
              Chọn doanh nghiệp
            </option>
            {companies.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legal_name} · {c.tax_code}
              </option>
            ))}
            <option value="legacy">Dữ liệu cũ — chưa gắn doanh nghiệp</option>
          </select>
        </div>
        <div>
          <Label>Kỳ xem (bỏ trống để xem tất cả)</Label>
          <Input
            type="month"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setFrom("");
              setTo("");
            }}
          />
        </div>
        <div>
          <Label>Tìm số, ký hiệu, đối tác/MST</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm hóa đơn…"
          />
        </div>
      </div>
      <details className="rounded border p-3">
        <summary>Bộ lọc ngày, hợp đồng, tiền và hồ sơ</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>Từ ngày</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPeriod("");
              }}
            />
          </div>
          <div>
            <Label>Đến ngày (bao gồm ngày này)</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPeriod("");
              }}
            />
          </div>
          <div>
            <Label>Hợp đồng</Label>
            <select
              className="h-10 w-full rounded border bg-background"
              value={contractFilter}
              onChange={(e) => setContractFilter(e.target.value)}
            >
              <option value="">Mọi hợp đồng</option>
              {contractFilters.data?.map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {String(c.contract_number)} · {String(c.buyer_name ?? "")}
                </option>
              ))}
            </select>
            {contractFilters.error && (
              <p className="text-xs text-destructive">
                {contractFilters.error.message}
              </p>
            )}
          </div>
          <div>
            <Label>Tình trạng tiền</Label>
            <select
              className="h-10 w-full rounded border bg-background"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
            >
              <option value="">Mọi tình trạng tiền</option>
              {Object.entries(invoicePaymentLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Đánh giá bộ hồ sơ</Label>
            <select
              className="h-10 w-full rounded border bg-background"
              value={checklistFilter}
              onChange={(e) => setChecklistFilter(e.target.value)}
            >
              <option value="">Mọi bộ hồ sơ</option>
              <option value="UNASSESSED">Còn mục chưa đánh giá</option>
              <option value="MISSING">Thiếu mục đã đánh dấu cần có</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={missingPdf}
                onChange={(e) => setMissingPdf(e.target.checked)}
              />
              Chưa có PDF gốc (kể cả không áp dụng)
            </label>
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={missingBusiness}
                onChange={(e) => setMissingBusiness(e.target.checked)}
              />
              Chưa có hợp đồng/hồ sơ chi phí hiện hành
            </label>
          </div>
        </div>
      </details>
      {companyId === "legacy" && (
        <div className="rounded border border-amber-300 p-3 text-sm">
          <p>
            Dữ liệu lịch sử vẫn theo quyền người phụ trách. Không đoán doanh
            nghiệp; chỉ tiếp nhận khi MST chứng minh một chiều.
          </p>
          <select
            aria-label="Doanh nghiệp để tiếp nhận dữ liệu cũ"
            className="mt-2 h-10 w-full rounded border bg-background"
            value={adoptCompany}
            onChange={(e) => setAdoptCompany(e.target.value)}
          >
            <option value="">
              Chọn doanh nghiệp để đối chiếu từng hóa đơn
            </option>
            {companies.data
              ?.filter((c) => c.capabilities.includes("import"))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legal_name} · {c.tax_code}
                </option>
              ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [
            "Đầu vào",
            invoices.data?.stats.incoming ?? 0,
            () => {
              setTab("IN");
              setMissing(false);
              setUnlinked(false);
            },
          ],
          [
            "Đầu ra",
            invoices.data?.stats.outgoing ?? 0,
            () => {
              setTab("OUT");
              setMissing(false);
              setUnlinked(false);
            },
          ],
          [
            "Chưa gắn hồ sơ",
            invoices.data?.stats.unlinked ?? 0,
            () => {
              setTab("ALL");
              setUnlinked(true);
              setMissing(false);
            },
          ],
          [
            "Thiếu XML gốc",
            invoices.data?.stats.missing_files ?? 0,
            () => {
              setTab("ALL");
              setMissing(true);
              setUnlinked(false);
            },
          ],
        ].map(([label, count, click]) => (
          <button
            key={String(label)}
            className="rounded-lg border p-4 text-left hover:bg-muted"
            onClick={click as () => void}
          >
            <span className="text-sm text-muted-foreground">
              {String(label)}
            </span>
            <p className="text-2xl font-semibold">{String(count)}</p>
          </button>
        ))}
      </div>
      {periods.data?.changed_since_close && (
        <p role="alert" className="rounded border border-amber-300 p-3 text-sm">
          Có bằng chứng hoặc hồ sơ thay đổi sau snapshot chốt kỳ. Mở lại và đối
          chiếu; snapshot cũ được giữ nguyên.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap rounded-lg border p-1">
          {[
            ["QUEUE", "Cần xử lý"],
            ["IN", "Đầu vào"],
            ["OUT", "Đầu ra"],
            ...(tab === "ALL" ? [["ALL", "Theo bộ lọc"]] : []),
          ].map(([id, label]) => (
            <Button
              key={id}
              variant={tab === id ? "secondary" : "ghost"}
              onClick={() => setTab(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!invoices.data?.rows.length}
            onClick={() => void exportList()}
          >
            Xuất danh sách/trang
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!can("files") || !invoices.data?.rows.length}
            onClick={() => void exportDocs()}
          >
            Xuất bộ chứng từ/trang
          </Button>
          {can("review") && (
            <Button
              size="sm"
              variant="outline"
              disabled={!period}
              onClick={() => setPeriodOpen(true)}
            >
              Kiểm tra & chốt kỳ
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Trạng thái xử lý"
          className="h-10 rounded border bg-background px-2"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Mọi trạng thái</option>
          <option value="draft">Nháp</option>
          <option value="needs_review">Cần kiểm tra</option>
          <option value="reviewed">Đã kiểm tra nội bộ</option>
        </select>
        <select
          aria-label="Nguồn hóa đơn"
          className="h-10 rounded border bg-background px-2"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          {[
            ["", "Mọi nguồn"],
            ["CRM", "Nháp CRM"],
            ["VIETTEL", "API Viettel chỉ đọc"],
            ["VIETTEL_FILE", "Tệp Viettel"],
            ["TAX_FILE", "Tệp cổng thuế"],
            ["USER_FILE", "Tệp bổ sung"],
            ["LEGACY", "Lịch sử"],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={missing}
            onChange={(e) => setMissing(e.target.checked)}
          />
          Thiếu XML gốc
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unlinked}
            onChange={(e) => setUnlinked(e.target.checked)}
          />
          Chưa gắn hồ sơ
        </label>
        <Button
          variant="ghost"
          onClick={() => {
            setStatus("");
            setSource("");
            setMissing(false);
            setUnlinked(false);
            setSearch("");
          }}
        >
          Xóa bộ lọc
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {invoices.isLoading ? (
            <p role="status" className="p-6">
              Đang tải hóa đơn…
            </p>
          ) : invoices.isError ? (
            <div role="alert" className="p-6">
              <p>{invoices.error.message}</p>
              <Button onClick={() => void invoices.refetch()}>
                Thử tải lại
              </Button>
            </div>
          ) : !invoices.data?.rows.length ? (
            <div className="space-y-2 p-8 text-center">
              <p>Chưa có hóa đơn trong phạm vi này.</p>
              <p className="text-sm text-muted-foreground">
                Chọn doanh nghiệp/kỳ khác hoặc nhập tệp hợp lệ. Dữ liệu cũ nằm ở
                phạm vi riêng.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-auto md:block">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      {[
                        "Số/ký hiệu · ngày",
                        "Đối tác/MST",
                        "Trước thuế · VAT · Tổng",
                        "Hợp đồng/hồ sơ",
                        "Xử lý",
                      ].map((h) => (
                        <th key={h} className="p-3 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.data.rows.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="p-3">
                          <button
                            className="text-left font-medium hover:underline"
                            onClick={() => setSelected(r.id)}
                          >
                            {r.invoice_number || "Nháp CRM"} ·{" "}
                            {r.invoice_series || "Chưa xác minh ký hiệu"}
                          </button>
                          <p className="text-xs text-muted-foreground">
                            {invoiceBusinessDate(r.issued_date ?? r.created_at)}
                          </p>
                        </td>
                        <td className="p-3">
                          {r.direction === "IN" ? r.seller_name : r.buyer_name}
                          <p className="text-xs text-muted-foreground">
                            {String(
                              r.direction === "IN"
                                ? (r.seller_tax_code ?? "")
                                : (r.buyer_tax_code ?? ""),
                            )}
                          </p>
                        </td>
                        <td className="p-3 tabular-nums">
                          <p>
                            {r.total_amount} · VAT {r.vat_amount}
                          </p>
                          <strong>{money(r.total_with_vat, r.currency)}</strong>
                        </td>
                        <td className="p-3">
                          {Number(r.contract_count) > 0
                            ? String(r.contract_count) + " hợp đồng"
                            : "Chưa phân bổ hợp đồng"}
                          <p className="text-xs text-muted-foreground">
                            {r.missing_xml
                              ? "Thiếu XML gốc"
                              : "Có XML bằng chứng"}
                          </p>
                        </td>
                        <td className="p-3">
                          <p>
                            {r.source_kind === "CRM"
                              ? "Nháp CRM"
                              : (invoiceSourceStateLabels[String(r.status)] ??
                                "Nguồn cần xác minh")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.review_state === "reviewed"
                              ? "Đã kiểm tra nội bộ"
                              : "Cần kiểm tra"}
                            <span className="block">
                              {invoicePaymentLabels[String(r.payment_state)] ??
                                "Chưa đánh giá tiền"}
                            </span>
                            <span className="block">
                              {r.checklist_unassessed
                                ? "Hồ sơ chưa đánh giá"
                                : r.checklist_missing
                                  ? "Thiếu hồ sơ cần có"
                                  : "Đã đánh giá bộ hồ sơ"}
                            </span>
                          </p>
                          {companyId === "legacy" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!adoptCompany || busy}
                              onClick={() => void adoption(r.id)}
                            >
                              Đối chiếu MST
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 p-3 md:hidden">
                {invoices.data.rows.map((r) => (
                  <button
                    key={r.id}
                    className="w-full space-y-2 rounded border p-3 text-left"
                    onClick={() => setSelected(r.id)}
                  >
                    <p className="font-medium">
                      {r.invoice_number || "Nháp CRM"} ·{" "}
                      {r.invoice_series || "Chưa xác minh ký hiệu"}
                    </p>
                    <p>{r.direction === "IN" ? r.seller_name : r.buyer_name}</p>
                    <p>
                      {money(r.total_with_vat, r.currency)} ·{" "}
                      {r.review_state === "reviewed"
                        ? "Đã kiểm tra"
                        : "Cần kiểm tra"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.missing_xml ? "Thiếu XML gốc" : "Có XML bằng chứng"}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between gap-3 text-sm">
        <p>
          {invoices.data?.stats.total ?? 0} hóa đơn · Trang {page}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page <= 1 || invoices.isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Trước
          </Button>
          <Button
            variant="outline"
            disabled={
              !invoices.data ||
              page * 25 >= invoices.data.stats.total ||
              invoices.isFetching
            }
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      </div>
      <InvoiceDraftDialog
        open={draft}
        onOpenChange={setDraft}
        companyId={companyId}
        onSaved={() => void refresh()}
      />
      <InvoiceImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        companyId={companyId}
        onSaved={() => void refresh()}
      />
      <InvoiceDetailDialog
        id={selected}
        onClose={() => setSelected(null)}
        company={company}
        onSaved={() => void refresh()}
      />
      {company && (
        <InvoiceSyncDialog
          key={company.id + ":sync"}
          company={company}
          open={sync}
          onOpenChange={setSync}
          onSaved={() => void refresh()}
        />
      )}
      <Dialog
        open={settings}
        onOpenChange={(v) => {
          if (!busy) setSettings(v);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Doanh nghiệp và quyền hóa đơn</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Quyền module hợp đồng và quyền doanh nghiệp đều được kiểm tra. Tài
            khoản nguồn được cấu hình riêng theo MST.
          </p>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Label>Tên pháp nhân mới</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
          <Label>MST</Label>
          <Input value={tax} onChange={(e) => setTax(e.target.value)} />
          <Label>Địa chỉ</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          <Button
            disabled={busy || !why.trim() || !name || !tax}
            onClick={() =>
              void run(async () => {
                const result = await invoiceRequest<InvoiceCompany>(
                  "/companies",
                  "POST",
                  { legal_name: name, tax_code: tax, address, reason: why },
                );
                setCompanyId(result.id);
                setName("");
                setTax("");
              }, "Đã tạo phạm vi doanh nghiệp")
            }
          >
            Tạo doanh nghiệp/MST
          </Button>
          {can("configure") && (
            <>
              <hr />
              <Label>Tài khoản được cấp quyền</Label>
              <select
                className="h-10 w-full rounded border bg-background"
                value={grantUser}
                onChange={(e) => setGrantUser(e.target.value)}
              >
                <option value="">Chọn người dùng</option>
                {users.data?.map((u) => (
                  <option key={String(u.user_id)} value={String(u.user_id)}>
                    {String(u.name || u.email)} · {String(u.email)}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["view", "Xem"],
                  ["import", "Nhập tệp"],
                  ["draft", "Soạn nháp"],
                  ["link", "Gắn/đối chiếu"],
                  ["review", "Kiểm tra/chốt"],
                  ["configure", "Cấu hình quyền"],
                  ["files", "Tải tệp gốc"],
                ].map(([cap, label]) => (
                  <label key={cap} className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={grantCaps.includes(cap)}
                      onChange={(e) =>
                        setGrantCaps(
                          e.target.checked
                            ? [...grantCaps, cap]
                            : grantCaps.filter((c) => c !== cap),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Button
                disabled={busy || !why.trim() || !grantUser}
                onClick={() =>
                  void run(
                    () =>
                      invoiceRequest(
                        "/companies/" + companyId + "/grants",
                        "POST",
                        {
                          user_id: grantUser,
                          capabilities: grantCaps,
                          reason: why,
                        },
                      ),
                    "Đã lưu phạm vi quyền",
                  )
                }
              >
                Lưu quyền doanh nghiệp đang chọn
              </Button>
            </>
          )}
          <Label>Lý do</Label>
          <Textarea value={why} onChange={(e) => setWhy(e.target.value)} />
          {company && can("configure") && (
            <InvoiceProviderSettings key={company.id} company={company} />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={periodOpen}
        onOpenChange={(v) => {
          if (!busy) setPeriodOpen(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kiểm tra kỳ {period}</DialogTitle>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <p className="text-sm">
            Chốt là snapshot nội bộ, không khóa tiếp nhận bằng chứng mới. Mọi
            thay đổi sau chốt được cảnh báo; bản cũ vẫn được giữ.
          </p>
          {periods.data?.rows.map((row) => (
            <div key={String(row.id)} className="rounded border p-3 text-sm">
              <p>
                {String(row.closed_at)} ·{" "}
                {row.reopened_at ? "Đã mở lại" : "Đang chốt"}
              </p>
              <p className="break-all text-xs">
                SHA256 {String(row.content_hash)}
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await invoiceRequest<{
                      filename: string;
                      content: string;
                    }>("/periods/" + row.id + "/export");
                    invoiceDownloadBlob(
                      new Blob([result.content], { type: "application/json" }),
                      result.filename,
                    );
                  }, "Đã tải snapshot kỳ")
                }
              >
                Tải snapshot đã chốt
              </Button>
              {!row.reopened_at && (
                <Button
                  variant="outline"
                  disabled={busy || !why.trim()}
                  onClick={() =>
                    void run(
                      () =>
                        invoiceRequest(
                          "/periods/" + row.id + "/reopen",
                          "POST",
                          { reason: why },
                        ),
                      "Đã mở lại kỳ",
                    )
                  }
                >
                  Mở lại có lý do
                </Button>
              )}
            </div>
          ))}
          <Label>Lý do chốt/mở lại</Label>
          <Textarea value={why} onChange={(e) => setWhy(e.target.value)} />
          <Button
            disabled={
              busy ||
              !why.trim() ||
              periods.data?.rows.some((r) => !r.reopened_at)
            }
            onClick={() =>
              void run(
                () =>
                  invoiceRequest("/periods/close", "POST", {
                    company_id: companyId,
                    period,
                    reason: why,
                  }),
                "Đã lưu snapshot kỳ",
              )
            }
          >
            Lưu snapshot chốt kỳ
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!adopt}
        onOpenChange={(v) => {
          if (!v && !busy) setAdopt(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận doanh nghiệp từ MST</DialogTitle>
          </DialogHeader>
          {adopt?.rows.map((r) => (
            <div key={String(r.id)} className="rounded border p-3 text-sm">
              <p>
                MST bán: {String(r.seller_tax_code)} · MST mua:{" "}
                {String(r.buyer_tax_code)}
              </p>
              <p>
                {r.eligible
                  ? "Đủ bằng chứng chiều " + r.direction
                  : "Chưa đủ bằng chứng — không được gắn"}
              </p>
            </div>
          ))}
          <p className="text-sm">
            Giữ quyền người phụ trách cũ, thêm quyền doanh nghiệp; không tự mở
            rộng phạm vi xem.
          </p>
          <Label>Lý do tiếp nhận</Label>
          <Textarea value={why} onChange={(e) => setWhy(e.target.value)} />
          <Button
            disabled={
              busy || !why.trim() || !adopt?.rows.every((r) => r.eligible)
            }
            onClick={() =>
              void run(async () => {
                await invoiceRequest("/adoption/commit", "POST", {
                  ...adopt,
                  reason: why,
                });
                setAdopt(null);
              }, "Đã gắn theo bằng chứng MST")
            }
          >
            Xác nhận gắn doanh nghiệp
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
