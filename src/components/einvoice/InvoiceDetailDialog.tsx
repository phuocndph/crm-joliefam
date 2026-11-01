import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  invoicePaymentLabels,
  invoiceSourceStateLabels,
  invoiceRequest,
  invoiceDownloadFile,
  invoiceDownloadBase64,
  type InvoiceDetail,
  type InvoiceCompany,
} from "@/lib/invoice-workspace-api";
import {
  InvoiceEvidencePanel,
  InvoiceChecklistPanel,
  InvoiceBusinessDocumentsPanel,
  InvoiceBusinessAttachmentPanel,
  InvoiceContractSplitPanel,
} from "./InvoiceDossierPanels";
import { InvoiceDraftDialog } from "./InvoiceDraftDialog";
import { InvoiceImportDialog } from "./InvoiceImportDialog";
import { toast } from "sonner";
const value = (v: unknown) => String(v ?? "—");
export function InvoiceDetailDialog({
  id,
  onClose,
  company,
  onSaved,
}: {
  id: string | null;
  onClose: () => void;
  company?: InvoiceCompany;
  onSaved: () => void;
}) {
  const cache = useQueryClient(),
    [why, setWhy] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [notes, setNotes] = useState(""),
    [contractId, setContractId] = useState(""),
    [amount, setAmount] = useState(""),
    [contractRevision, setContractRevision] = useState(""),
    [allocations, setAllocations] = useState<
      { contract_id: string; amount: string; source_revision: string }[]
    >([]),
    [sourceId, setSourceId] = useState(""),
    [paymentSource, setPaymentSource] = useState<Record<
      string,
      unknown
    > | null>(null),
    [paymentAmount, setPaymentAmount] = useState(""),
    [ack, setAck] = useState(false);
  const pending = useRef(false),
    generation = useRef(0);
  const detail = useQuery({
    queryKey: ["invoice-workspace", "detail", id],
    queryFn: ({ signal }) =>
      invoiceRequest<InvoiceDetail>(
        "/invoices/" + id,
        "GET",
        undefined,
        signal,
      ),
    enabled: !!id,
  });
  const d = detail.data,
    r = d?.invoice;
  const can = (cap: string) => company?.capabilities.includes(cap);
  const candidates = useQuery({
    queryKey: ["invoice-workspace", "contract-candidates", company?.id],
    queryFn: () =>
      invoiceRequest<Record<string, unknown>[]>(
        "/contracts?company_id=" + encodeURIComponent(company!.id),
      ),
    enabled: !!id && !!company?.capabilities.includes("link"),
  });
  const paymentCandidates = useQuery({
    queryKey: ["invoice-workspace", "payment-candidates", id],
    queryFn: () =>
      invoiceRequest<Record<string, unknown>[]>(
        "/invoices/" + id + "/payment-candidates",
      ),
    enabled: !!id && !!company?.capabilities.includes("link"),
  });
  const waitingFiles = useQuery({
    queryKey: ["invoice-workspace", "unassigned-files", company?.id],
    queryFn: () =>
      invoiceRequest<Record<string, unknown>[]>(
        "/unassigned-files?company_id=" + encodeURIComponent(company!.id),
      ),
    enabled: !!id && !!company?.capabilities.includes("files"),
  });

  useEffect(() => {
    generation.current++;
    setWhy("");
    setBusy(false);
    setError("");
    setNotes("");
    setContractId("");
    setContractRevision("");
    setAllocations([]);
    setPaymentSource(null);
    setSourceId("");
    setAck(false);
    const lifecycle = generation;
    return () => {
      lifecycle.current++;
    };
  }, [id]);
  useEffect(() => {
    if (d) {
      setNotes(
        value(
          d.invoice.internal_notes === "—"
            ? ""
            : (d.invoice.internal_notes ?? ""),
        ),
      );
      setAllocations(
        d.contracts.map((c) => ({
          contract_id: String(c.contract_id),
          amount: String(c.amount),
          source_revision: String(c.source_revision),
        })),
      );
    }
  }, [d]);
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ["invoice-workspace"] });
    onSaved();
  };
  const action = async (
    route: string,
    body: Record<string, unknown>,
    method = "POST",
  ) => {
    if (pending.current || !r) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const gen = generation.current;
    try {
      await invoiceRequest("/invoices/" + r.id + route, method, {
        expected_revision: r.revision,
        reason: why,
        ...body,
      });
      if (gen === generation.current) {
        toast.success("Đã lưu hồ sơ");
        setWhy("");
        await refresh();
      }
    } catch (e) {
      if (gen === generation.current)
        setError(e instanceof Error ? e.message : "Không lưu được.");
    } finally {
      pending.current = false;
      if (gen === generation.current) setBusy(false);
    }
  };
  const getContract = async () => {
    const gen = generation.current;
    try {
      const c = await invoiceRequest<{
        source_revision: string;
        total: string;
        remaining: string;
      }>("/contracts/" + encodeURIComponent(contractId) + "/summary");
      if (gen !== generation.current) return;
      setContractRevision(c.source_revision);
      setAmount(c.remaining);
      setError("");
    } catch (e) {
      if (gen === generation.current)
        setError(e instanceof Error ? e.message : "Không tải được.");
    }
  };
  const getPayment = async () => {
    if (!r) return;
    const gen = generation.current;
    try {
      const result = await invoiceRequest<Record<string, unknown>>(
        "/invoices/" +
          r.id +
          "/payment-source?" +
          new URLSearchParams({
            type: r.direction === "IN" ? "TRANSACTION" : "ORDER_PAYMENT",
            source_id: sourceId,
          }),
      );
      if (gen !== generation.current) return;
      setPaymentSource(result);
      setError("");
    } catch (e) {
      if (gen === generation.current)
        setError(e instanceof Error ? e.message : "Không tải được.");
    }
  };
  const preview = async () => {
    if (!r) return;
    const gen = generation.current;
    try {
      const p = await invoiceRequest<{ base64: string; filename: string }>(
        "/invoices/" + r.id + "/preview",
        "POST",
        {},
      );
      if (gen !== generation.current) return;
      invoiceDownloadBase64(p.base64, p.filename, "application/pdf");
    } catch (e) {
      if (gen === generation.current)
        setError(e instanceof Error ? e.message : "Không xem được.");
    }
  };
  return (
    <>
      <Dialog
        open={!!id}
        onOpenChange={(v) => {
          if (!v && !pending.current) onClose();
        }}
      >
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] min-w-0 max-w-4xl overflow-x-hidden overflow-y-auto [overflow-wrap:anywhere] [&>*]:min-w-0">
          <DialogHeader className="min-w-0 pr-8">
            <DialogTitle className="min-w-0 break-words">
              Hồ sơ hóa đơn {value(r?.invoice_number ?? r?.id)}
            </DialogTitle>
          </DialogHeader>
          {detail.isLoading ? (
            <p role="status">Đang tải hồ sơ…</p>
          ) : detail.isError ? (
            <div role="alert">
              {detail.error.message}
              <Button onClick={() => void detail.refetch()}>Thử lại</Button>
            </div>
          ) : (
            r &&
            d && (
              <>
                <p className="text-sm text-muted-foreground">
                  {r.source_kind === "CRM"
                    ? "Nháp CRM — chưa gửi Viettel"
                    : r.source_kind === "LEGACY"
                      ? "Dữ liệu cũ — chưa gắn doanh nghiệp"
                      : r.source_kind +
                        " · Trạng thái nguồn: " +
                        value(r.status)}{" "}
                  · Revision {r.revision}
                </p>
                {error && (
                  <p role="alert" className="text-destructive">
                    {error}
                  </p>
                )}
                <Tabs defaultValue="overview" className="w-full min-w-0 [&>*]:min-w-0 [&_select]:min-w-0 [&_select]:max-w-full [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2">
                  <TabsList className="flex h-auto w-full min-w-0 flex-wrap justify-start">
                    <TabsTrigger value="overview">Tổng quan</TabsTrigger>
                    <TabsTrigger value="files">XML/PDF gốc</TabsTrigger>
                    <TabsTrigger value="documents">
                      Hợp đồng & chứng từ
                    </TabsTrigger>
                    <TabsTrigger value="payments">Thanh toán</TabsTrigger>
                    <TabsTrigger value="history">Lịch sử</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="min-w-0 space-y-3">
                    {d.dossier && (
                      <>
                        <p className="text-sm">
                          Tiền: {invoicePaymentLabels[d.dossier.payment.state]}{" "}
                          · Đã phân bổ{" "}
                          {d.dossier.payment.allocated ?? "Chưa đủ quyền"} · Còn{" "}
                          {d.dossier.payment.remaining ?? "Chưa xác định"}{" "}
                          {r.currency}
                        </p>
                        <InvoiceChecklistPanel
                          key={r.id + ":checklist"}
                          detail={d}
                          company={company}
                          reason={why}
                          onSaved={() => void detail.refetch().then(onSaved)}
                        />
                      </>
                    )}
                    <InvoiceEvidencePanel
                      key={r.id + ":evidence"}
                      detail={d}
                      company={company}
                      reason={why}
                      onSaved={() => void detail.refetch().then(onSaved)}
                    />
                    <div className="grid min-w-0 gap-3 rounded border p-3 sm:grid-cols-2 [&>*]:min-w-0">
                      <p>
                        Người bán: {value(r.seller_name)} ·{" "}
                        {value(r.seller_tax_code)}
                      </p>
                      <p>
                        Người mua: {value(r.buyer_name)} ·{" "}
                        {value(r.buyer_tax_code)}
                      </p>
                      <p>
                        Trước thuế: {r.total_amount} · VAT: {r.vat_amount}
                      </p>
                      <p>
                        Tổng:{" "}
                        <strong>
                          {r.total_with_vat} {r.currency}
                        </strong>
                      </p>
                      <p>
                        Nguồn: {r.source_kind} ·{" "}
                        {invoiceSourceStateLabels[String(r.status)] ??
                          "Nguồn cần xác minh"}
                      </p>
                      <p>
                        Kiểm tra:{" "}
                        {r.review_state === "reviewed"
                          ? "Đã kiểm tra nội bộ"
                          : "Cần kiểm tra"}
                      </p>
                    </div>
                    {r.discrepancy?.length > 0 && (
                      <div
                        role="alert"
                        className="rounded border border-amber-300 p-3 text-sm"
                      >
                        {r.discrepancy.map((x, i) => (
                          <p key={i}>{x}</p>
                        ))}
                        <p>
                          Giữ nguyên tổng nguồn. Kiểm tra nội bộ không xác nhận
                          khấu trừ thuế.
                        </p>
                      </div>
                    )}
                    <div className="w-full min-w-0 max-w-full overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="text-left">Dòng hàng</th>
                            <th>SL</th>
                            <th>Đơn giá</th>
                            <th>VAT</th>
                            <th>Tổng</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.lines.map((line, i) => (
                            <tr className="border-t" key={i}>
                              <td className="py-2">{value(line.name)}</td>
                              <td>{value(line.quantity)}</td>
                              <td>{value(line.unit_price)}</td>
                              <td>{value(line.vat_rate)}</td>
                              <td>{value(line.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => void preview()}>
                        Bản xem nội bộ PDF
                      </Button>
                      {can("draft") &&
                        r.source_kind === "CRM" &&
                        r.is_draft && (
                          <Button
                            variant="outline"
                            onClick={() => setEdit(true)}
                          >
                            Sửa nháp CRM
                          </Button>
                        )}
                    </div>
                    <Label>Ghi chú nội bộ</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      disabled={busy || !why.trim() || !can("link")}
                      onClick={() => void action("/notes", { notes })}
                    >
                      Lưu ghi chú
                    </Button>
                    {can("review") && (
                      <div className="space-y-2 rounded border p-3">
                        <label className="flex gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={ack}
                            onChange={(e) => setAck(e.target.checked)}
                          />
                          Tôi đã xem và ghi rõ lý do đối với các chênh lệch
                        </label>
                        <Button
                          disabled={busy || !why.trim()}
                          onClick={() =>
                            void action("/review", {
                              state: "reviewed",
                              acknowledge_discrepancy: ack,
                            })
                          }
                        >
                          Đánh dấu đã kiểm tra
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="files" className="min-w-0 space-y-3">
                    <InvoiceBusinessAttachmentPanel
                      key={r.id + ":attachments"}
                      detail={d}
                      company={company}
                      reason={why}
                      onSaved={() => void detail.refetch().then(onSaved)}
                    />
                    <p className="text-sm">
                      Tệp gốc lưu bất biến, có checksum. Bản xem nội bộ không
                      phải bản gốc.
                    </p>
                    {!d.files.some(
                      (f) => f.media_type === "application/xml" && f.original,
                    ) && (
                      <p className="text-amber-700">
                        Thiếu XML gốc. Danh sách Excel không thay thế chứng từ
                        gốc.
                      </p>
                    )}
                    {d.files.map((f) => (
                      <div
                        key={value(f.id)}
                        className="rounded border p-3 text-sm"
                      >
                        <p>
                          {value(f.name)} ·{" "}
                          {f.purpose === "BUSINESS_ATTACHMENT"
                            ? "Hồ sơ nghiệp vụ đính kèm"
                            : f.purpose === "INTERNAL_PREVIEW"
                              ? "Bản xem nội bộ"
                              : f.original ? "XML/PDF gốc từ nguồn" : "Danh sách nguồn"}
                        </p>
                        <p className="break-all text-xs text-muted-foreground">
                          SHA256 {value(f.sha256)}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!can("files")}
                          onClick={() =>
                            void invoiceDownloadFile(value(f.id)).catch((e) =>
                              setError(e.message),
                            )
                          }
                        >
                          Tải tệp
                        </Button>
                      </div>
                    ))}
                    {can("import") && (
                      <Button onClick={() => setImportOpen(true)}>
                        Bổ sung XML/PDF
                      </Button>
                    )}
                    {!!waitingFiles.data?.length && (
                      <details>
                        <summary>
                          Tệp chưa gắn ({waitingFiles.data.length})
                        </summary>
                        <p className="text-sm">
                          PDF/tệp danh sách được gắn theo xác nhận thủ công có
                          lý do; không xác minh định danh hoặc thuế.
                        </p>
                        {waitingFiles.data.map((f) => (
                          <div
                            className="flex items-center justify-between gap-2 rounded border p-2"
                            key={value(f.id)}
                          >
                            <span className="text-sm">{value(f.name)}</span>
                            <Button
                              variant="outline"
                              disabled={
                                busy ||
                                !why.trim() ||
                                !can("import") ||
                                f.media_type === "application/xml"
                              }
                              onClick={() =>
                                void action("/attach-file", { file_id: f.id })
                              }
                            >
                              Gắn bằng chứng
                            </Button>
                          </div>
                        ))}
                      </details>
                    )}
                  </TabsContent>
                  <TabsContent value="documents" className="space-y-4">
                    {d.dossier && (
                      <InvoiceBusinessDocumentsPanel
                        key={r.id + ":business"}
                        detail={d}
                        company={company}
                        reason={why}
                        onSaved={() => void detail.refetch().then(onSaved)}
                      />
                    )}
                    <p className="text-sm">
                      Đầu vào dùng hồ sơ chi phí/giao nhận; hợp đồng bán chỉ
                      phân bổ đầu ra VND.
                    </p>
                    {r.direction === "OUT" && can("link") && (
                      <div className="space-y-2 rounded border p-3">
                        <Label>Hợp đồng bán</Label>
                        <div className="flex min-w-0 flex-wrap gap-2">
                          <select
                            className="h-11 min-w-0 max-w-full flex-1 basis-44 rounded border bg-background"
                            value={contractId}
                            onChange={(e) => {
                              setContractId(e.target.value);
                              setContractRevision("");
                            }}
                          >
                            <option value="">Chọn hợp đồng</option>
                            {candidates.data?.map((c) => (
                              <option key={value(c.id)} value={value(c.id)}>
                                {value(c.contract_number)} ·{" "}
                                {value(c.buyer_name)} · {value(c.total_amount)}{" "}
                                VND
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="outline"
                            onClick={() => void getContract()}
                          >
                            Đối chiếu
                          </Button>
                        </div>
                        {contractRevision && (
                          <div className="flex min-w-0 flex-wrap gap-2">
                            <Input
                              aria-label="Số tiền phân bổ"
                              value={amount}
                              onChange={(e) => setAmount(e.target.value)}
                            />
                            <Button
                              variant="outline"
                              onClick={() => {
                                setAllocations([
                                  ...allocations.filter(
                                    (a) => a.contract_id !== contractId,
                                  ),
                                  {
                                    contract_id: contractId,
                                    amount,
                                    source_revision: contractRevision,
                                  },
                                ]);
                                setContractRevision("");
                              }}
                            >
                              Thêm phân bổ
                            </Button>
                          </div>
                        )}
                        {allocations.map((a, i) => (
                          <div
                            key={a.contract_id}
                            className="flex flex-wrap justify-between gap-2 text-sm"
                          >
                            <span>
                              {a.contract_id} · {a.amount}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setAllocations(
                                  allocations.filter((_, n) => n !== i),
                                )
                              }
                            >
                              Gỡ
                            </Button>
                          </div>
                        ))}
                        <Button
                          disabled={busy || !why.trim()}
                          onClick={() =>
                            void action("/contracts", { allocations })
                          }
                        >
                          Lưu toàn bộ phân bổ
                        </Button>
                      </div>
                    )}
                    {d.contracts.map((c) => (
                      <p key={value(c.id)} className="text-sm">
                        {value(c.contract_number)} · {value(c.amount)}{" "}
                        {value(c.currency)} ·{" "}
                        {c.reservation ? "Giữ chỗ nháp" : "Đã phân bổ"}
                      </p>
                    ))}
                    {d.documents.map((doc) => (
                      <div
                        className="flex min-w-0 flex-wrap justify-between gap-2 rounded border p-2 text-sm"
                        key={value(doc.id)}
                      >
                        <span>
                          {value(doc.kind)} · {value(doc.reference)} ·{" "}
                          {value(doc.reason)}
                        </span>
                        {can("link") && (
                          <Button
                            variant="ghost"
                            disabled={busy || !why.trim()}
                            onClick={() =>
                              void action("/documents/" + doc.id, {}, "DELETE")
                            }
                          >
                            Gỡ
                          </Button>
                        )}
                      </div>
                    ))}
                  </TabsContent>
                  <TabsContent value="payments" className="min-w-0 space-y-3">
                    {d.dossier && (
                      <p className="text-sm">
                        {invoicePaymentLabels[d.dossier.payment.state]} · Đã
                        phân bổ {d.dossier.payment.allocated ?? "Chưa xác định"}{" "}
                        · Còn {d.dossier.payment.remaining ?? "Chưa xác định"}{" "}
                        {r.currency}. {d.dossier.payment.reason}
                      </p>
                    )}
                    <InvoiceContractSplitPanel
                      key={r.id + ":splits"}
                      detail={d}
                      company={company}
                      reason={why}
                      onSaved={() => void detail.refetch().then(onSaved)}
                    />
                    <p className="text-sm">
                      Phân bổ chứng từ tiền có sẵn; không tạo thu/chi. Đầu ra
                      dùng phiếu thu đơn hàng; đầu vào dùng giao dịch chi độc
                      lập, loại trừ dòng phản chiếu đơn hàng.
                    </p>
                    {d.payments.map((a) => (
                      <div
                        key={value(a.id)}
                        className="flex min-w-0 flex-wrap justify-between gap-2 rounded border p-3 text-sm"
                      >
                        <span>
                          {value(a.source_type)} · {value(a.source_id)} ·{" "}
                          {value(a.amount)} {value(a.currency)}
                        </span>
                        {can("link") && (
                          <Button
                            variant="ghost"
                            disabled={busy || !why.trim()}
                            onClick={() =>
                              void action("/payments/" + a.id, {}, "DELETE")
                            }
                          >
                            Gỡ
                          </Button>
                        )}
                      </div>
                    ))}
                    {can("link") && !r.is_draft && (
                      <div className="space-y-2">
                        <Label>
                          Chứng từ{" "}
                          {r.direction === "IN"
                            ? "chi độc lập"
                            : "thu đơn hàng"}
                        </Label>
                        <div className="flex min-w-0 flex-wrap gap-2">
                          <select
                            className="h-11 min-w-0 max-w-full flex-1 basis-44 rounded border bg-background"
                            value={sourceId}
                            onChange={(e) => {
                              setSourceId(e.target.value);
                              setPaymentSource(null);
                            }}
                          >
                            <option value="">Chọn chứng từ tiền</option>
                            {paymentCandidates.data?.map((c) => (
                              <option key={value(c.id)} value={value(c.id)}>
                                {value(c.date).slice(0, 10)} ·{" "}
                                {value(c.description)} · {value(c.amount)} VND
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="outline"
                            onClick={() => void getPayment()}
                          >
                            Đối chiếu nguồn
                          </Button>
                        </div>
                        {paymentSource && (
                          <>
                            <p className="text-sm">
                              Số tiền nguồn: {value(paymentSource.amount)} ·{" "}
                              {value(paymentSource.description)}
                            </p>
                            <Input
                              aria-label="Tiền phân bổ"
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                              placeholder="Tiền phân bổ"
                            />
                            <Button
                              disabled={busy || !why.trim()}
                              onClick={() =>
                                void action("/payments", {
                                  source_type:
                                    r.direction === "IN"
                                      ? "TRANSACTION"
                                      : "ORDER_PAYMENT",
                                  source_id: sourceId,
                                  source_revision: paymentSource.revision,
                                  amount: paymentAmount,
                                })
                              }
                            >
                              Lưu phân bổ tiền
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="history" className="min-w-0 space-y-3">
                    {d.history.map((h) => (
                      <div
                        key={value(h.id)}
                        className="rounded border p-3 text-sm"
                      >
                        <p>
                          {value(h.action)} · {value(h.created_at)}
                        </p>
                        <p>
                          {value(h.reason)} · {value(h.actor_id)}
                        </p>
                      </div>
                    ))}
                    {d.observations.map((o) => (
                      <details
                        key={value(o.id)}
                        className="rounded border p-3 text-sm"
                      >
                        <summary>
                          Bằng chứng {value(o.source)} · {value(o.observed_at)}
                        </summary>
                        <p className="break-all">
                          SHA256 {value(o.content_hash)}
                        </p>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
                          {JSON.stringify(o.payload, null, 2)}
                        </pre>
                      </details>
                    ))}
                  </TabsContent>
                </Tabs>
                <div className="sticky bottom-0 border-t bg-background pt-3">
                  <Label>Lý do cho thao tác hồ sơ</Label>
                  <Textarea
                    value={why}
                    onChange={(e) => setWhy(e.target.value)}
                    placeholder="Bắt buộc để lưu lịch sử"
                  />
                </div>
              </>
            )
          )}
        </DialogContent>
      </Dialog>
      {d && (
        <InvoiceDraftDialog
          open={edit}
          onOpenChange={setEdit}
          companyId={r?.company_id ?? ""}
          detail={d}
          onSaved={() => void refresh()}
        />
      )}
      <InvoiceImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        companyId={r?.company_id ?? ""}
        invoiceId={id ?? undefined}
        onSaved={() => void refresh()}
      />
    </>
  );
}
