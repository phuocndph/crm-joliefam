import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  invoicePaymentLabels,
  invoiceRequest,
  invoiceFilePayload,
  type InvoiceDetail,
  type InvoiceCompany,
  type InvoiceContractSplitEditor,
  invoiceSessionScope,
} from "@/lib/invoice-workspace-api";
import { invoiceToday } from "@/lib/invoice-date";
import {
  invoiceDecimal,
  invoiceMinor,
  invoiceAmount,
  providerDecimal,
  providerRatesEqual,
} from "@/lib/invoice-money";
type Row = Record<string, unknown>;
const label = (v: unknown) => (v == null ? "Chưa có" : String(v));
const delta = (source: unknown, computed: unknown, provider = false) => {
  if (source == null || computed == null) return "Chưa đủ trường nguồn";
  try {
    const a = (provider ? providerDecimal : invoiceDecimal)(source, 6, true),
      b = invoiceDecimal(computed, 6, true),
      n = ((a.n * b.d - b.n * a.d) * 1000000n) / (a.d * b.d),
      abs = n < 0n ? -n : n;
    return (
      `${n < 0n ? "-" : ""}${abs / 1000000n}.${String(abs % 1000000n).padStart(6, "0")}`.replace(
        /\.?0+$/,
        "",
      ) || "0"
    );
  } catch {
    return "Chưa diễn giải được";
  }
};
const itemLabels: Record<string, string> = {
  XML: "XML hóa đơn gốc",
  PDF: "PDF hóa đơn gốc",
  CONTRACT_OR_COST: "Hợp đồng hoặc hồ sơ chi phí",
  APPENDIX: "Phụ lục/mốc",
  DELIVERY: "Giao nhận",
  ACCEPTANCE: "Nghiệm thu",
  PAYMENT_EVIDENCE: "Chứng từ tiền",
};
function useDossierAction(d: InvoiceDetail, onSaved: () => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, [d.invoice.id]);
  const run = async (route: string, body: Row | (() => Promise<Row>), method = "POST", sessionScope?: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const payload = typeof body === "function" ? await body() : body;
      await invoiceRequest(
        "/invoices/" + encodeURIComponent(d.invoice.id) + route,
        method,
        { ...payload, expected_revision: payload.expected_revision ?? d.invoice.revision },
        undefined,
        sessionScope,
      );
      if (live.current) onSaved();
    } catch (e) {
      if (live.current)
        setError(e instanceof Error ? e.message : "Không xử lý được.");
    } finally {
      if (live.current) setBusy(false);
    }
  };
  return { busy, error, run };
}
export function InvoiceEvidencePanel({
  detail,
  company,
  reason,
  onSaved,
}: {
  detail: InvoiceDetail;
  company?: InvoiceCompany;
  reason: string;
  onSaved: () => void;
}) {
  const action = useDossierAction(detail, onSaved),
    relations = useQuery({
      queryKey: [
        "invoice-workspace",
        "relation-candidates",
        detail.invoice.id,
        detail.invoice.revision,
      ],
      queryFn: () =>
        invoiceRequest<Row[]>(
          "/invoices/" + detail.invoice.id + "/relation-candidates",
        ),
    });
  return (
    <div className="space-y-3">
      <details className="rounded border p-3">
        <summary className="font-medium">
          Tiền nguồn · Tiền kiểm tra · Chênh lệch
        </summary>
        <p className="my-2 text-xs text-muted-foreground">
          Tiền nguồn giữ nguyên từng observation, kể cả trường thiếu/null và mã
          thuế chưa diễn giải. Tiền kiểm tra theo phép tính CRM; không ghi đè
          chứng từ gốc.
        </p>
        {!detail.source_evidence?.length && (
          <p className="text-sm">
            Chưa có dòng/nhóm thuế nguyên bản; bổ sung XML hoặc đồng bộ nguồn.
          </p>
        )}
        {detail.source_evidence?.map((e) => {
          const source = (e.payload ?? {}) as Row,
            index = Number(e.ordinal),
            isViettel = e.spec === "VIETTEL_2.54";
          const groupLines =
            e.evidence_type === "TAX_GROUP"
              ? detail.lines.filter(
                  (l) =>
                    isViettel ? providerRatesEqual(l.vat_rate, source.TSuat ?? source.vatPercentage) : String(l.vat_rate).replace("%", "") ===
                    String(source.TSuat ?? source.vatPercentage).replace(
                      "%",
                      "",
                    ),
                )
              : [];
          const computed =
            e.evidence_type === "LINE"
              ? detail.lines[index]
              : e.evidence_type === "TAX_GROUP" && groupLines.length
                ? Object.fromEntries(
                    ["subtotal", "vat_amount", "total"].map((k) => [
                      k,
                      invoiceAmount(
                        groupLines.reduce(
                          (sum, line) =>
                            sum +
                            invoiceMinor(line[k], detail.invoice.currency),
                          0n,
                        ),
                        detail.invoice.currency,
                      ),
                    ]),
                  )
                : undefined;
          return (
            <details
              key={label(e.id)}
              className="mb-2 rounded border p-2 text-sm"
            >
              <summary>
                {e.evidence_type === "LINE"
                  ? "Dòng nguồn"
                  : e.evidence_type === "TAX_GROUP"
                    ? "Nhóm thuế nguồn"
                    : "Tham chiếu hóa đơn gốc"}{" "}
                {index + 1} ·{" "}
                {label(
                  source.THHDVu ??
                    source.itemName ??
                    source.TSuat ??
                    source.vatPercentage,
                )}
              </summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div>
                  <strong>Tiền nguồn</strong>
                  <p>
                    Trước thuế:{" "}
                    {label(
                      source.ThTien ??
                        source.itemTotalAmountAfterDiscount ??
                        source.itemTotalAmountWithoutVat ??
                        source.vatTaxableAmount,
                    )}
                  </p>
                  <p>
                    VAT:{" "}
                    {label(
                      source.TThue ?? source.vatAmount ?? source.vatTaxAmount,
                    )}
                  </p>
                  <p>
                    Tổng:{" "}
                    {label(source.TgTien ?? source.itemTotalAmountWithVat)}
                  </p>
                  <p>
                    Tính chất/chiết khấu:{" "}
                    {label(source.TChat ?? source.selection)} ·{" "}
                    {label(source.CKhau ?? source.itemDiscount)} ·{" "}
                    {label(source.isIncreaseItem)}
                  </p>
                </div>
                <div>
                  <strong>Tiền kiểm tra</strong>
                  <p>Trước thuế: {label(computed?.subtotal)}</p>
                  <p>VAT: {label(computed?.vat_amount)}</p>
                  <p>Tổng: {label(computed?.total)}</p>
                </div>
                <div>
                  <strong>Chênh lệch</strong>
                  <p>
                    Trước thuế:{" "}
                    {delta(
                      source.ThTien ??
                        source.itemTotalAmountAfterDiscount ??
                        source.itemTotalAmountWithoutVat ??
                        source.vatTaxableAmount,
                      computed?.subtotal,
                      isViettel,
                    )}
                  </p>
                  <p>
                    VAT:{" "}
                    {delta(
                      source.TThue ?? source.vatAmount ?? source.vatTaxAmount,
                      computed?.vat_amount,
                      isViettel,
                    )}
                  </p>
                  <p>
                    Tổng:{" "}
                    {delta(
                      source.TgTien ?? source.itemTotalAmountWithVat,
                      computed?.total,
                      isViettel,
                    )}
                  </p>
                  <p>
                    {detail.invoice.discrepancy
                      ?.filter((s) => s.includes("Dòng nguồn " + (index + 1)))
                      .join(" · ") ||
                      "Chưa có chênh lệch được xác định; trường thiếu không được coi là 0."}
                  </p>
                </div>
              </div>
              <p className="mt-2 break-all text-xs">
                {label(e.spec)} · {label(e.source_path)} · SHA256{" "}
                {label(e.content_hash)}
              </p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">
                {JSON.stringify(source, null, 2)}
              </pre>
            </details>
          );
        })}
      </details>
      <details className="rounded border p-3">
        <summary className="font-medium">
          Quan hệ điều chỉnh / thay thế từ nguồn
        </summary>
        {relations.isPending && <p>Đang đối chiếu…</p>}
        {relations.error && (
          <p role="alert" className="text-destructive">
            {relations.error.message}
          </p>
        )}
        <p className="my-2 text-xs text-muted-foreground">Xác nhận dưới đây chỉ đối chiếu liên hệ theo định danh. Kỳ tài chính còn kiểm tra trạng thái phát hành và ngữ nghĩa tăng/giảm; thiếu căn cứ sẽ chặn chốt kỳ.</p>
        {relations.data?.length === 0 && (
          <p className="text-sm">
            Nguồn chưa có tham chiếu gốc đủ thông tin. Không tự ghép số hóa đơn.
          </p>
        )}
        {relations.data?.map((e) => (
          <div
            className="mt-2 space-y-2 rounded border p-2 text-sm"
            key={label(e.id)}
          >
            <p>
              {e.kind === "REPLACES"
                ? "Thay thế"
                : e.kind === "ADJUSTS"
                  ? "Điều chỉnh"
                  : "Chưa rõ loại"}{" "}
              ·{" "}
              {e.resolution === "EXACT_CANDIDATE"
                ? "Có một ứng viên khớp nguồn"
                : e.resolution === "CONFLICTING_EVIDENCE"
                  ? "Bằng chứng xung đột"
                  : e.resolution === "AMBIGUOUS"
                    ? "Nhiều ứng viên"
                    : "Chưa có hóa đơn gốc khớp"}
            </p>
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(e.payload, null, 2)}
            </pre>
            {company?.capabilities.includes("review") &&
              e.resolution === "EXACT_CANDIDATE" && (
                <Button
                  disabled={action.busy || !reason.trim()}
                  onClick={() =>
                    void action.run("/relations", {
                      evidence_id: e.id,
                      original_id: (e.candidate_ids as string[])[0],
                      reason,
                    })
                  }
                >
                  Xác nhận quan hệ theo bằng chứng
                </Button>
              )}
          </div>
        ))}
      </details>
      {action.error && (
        <p role="alert" className="text-destructive">
          {action.error}
        </p>
      )}
    </div>
  );
}
export function InvoiceChecklistPanel({
  detail,
  company,
  reason,
  onSaved,
}: {
  detail: InvoiceDetail;
  company?: InvoiceCompany;
  reason: string;
  onSaved: () => void;
}) {
  const action = useDossierAction(detail, onSaved);
  return (
    <details className="rounded border p-3">
      <summary className="font-medium">
        Bộ hồ sơ cần kiểm tra (
        {
          detail.dossier.checklist.filter(
            (c) => c.assessment === "NOT_ASSESSED" || c.missing,
          ).length
        }{" "}
        mục)
      </summary>
      <p className="my-2 text-xs">
        Chọn cần có hoặc không áp dụng cho từng mục. Không áp dụng phải có lý
        do; dịch vụ không bị ép tạo hợp đồng/giao hàng giả. Mật độ đủ hồ sơ
        không xác nhận tính hợp lệ thuế.
      </p>
      {detail.dossier.checklist.map((c) => (
        <div
          key={c.item}
          className="my-2 flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"
        >
          <div>
            <strong>{itemLabels[c.item]}</strong>
            <p>
              {c.present ? "Đã có bằng chứng hiện hành" : "Chưa có bằng chứng"}{" "}
              ·{" "}
              {c.assessment === "NOT_ASSESSED"
                ? "Chưa đánh giá"
                : c.assessment === "REQUIRED"
                  ? "Cần có"
                  : "Không áp dụng"}
            </p>
            {c.reason && <p className="text-xs">Lý do: {c.reason}</p>}
          </div>
          {company?.capabilities.includes("review") && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={action.busy || !reason.trim()}
                onClick={() =>
                  void action.run("/checklist", {
                    item: c.item,
                    assessment: "REQUIRED",
                    reason,
                  })
                }
              >
                Cần có
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={action.busy || !reason.trim()}
                onClick={() =>
                  void action.run("/checklist", {
                    item: c.item,
                    assessment: "NOT_APPLICABLE",
                    reason,
                  })
                }
              >
                Không áp dụng
              </Button>
            </div>
          )}
        </div>
      ))}
      {action.error && (
        <p role="alert" className="text-destructive">
          {action.error}
        </p>
      )}
    </details>
  );
}
type Source = {
  id: string;
  source_type: string;
  revision: string;
  snapshot: Row;
  amount: string | null;
  currency: string | null;
  internal: boolean;
  reasons: string[];
};
export function InvoiceBusinessDocumentsPanel({
  detail,
  company,
  reason,
  onSaved,
}: {
  detail: InvoiceDetail;
  company?: InvoiceCompany;
  reason: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false),
    [type, setType] = useState("BUSINESS_TRANSACTION"),
    [sourceId, setSourceId] = useState(""),
    [kind, setKind] = useState("COST"),
    [axis, setAxis] = useState("EVIDENCE"),
    [amount, setAmount] = useState(""),
    [reference, setReference] = useState(""),
    [date, setDate] = useState(invoiceToday),
    [party, setParty] = useState(""),
    [total, setTotal] = useState(""),
    [fileId, setFileId] = useState(""),
    [search, setSearch] = useState(""),
    [confirmCompany,setConfirmCompany] = useState(false),
    [associationEvidence,setAssociationEvidence] = useState("");
  const action = useDossierAction(detail, onSaved),
    can = company?.capabilities.includes("link");
  const sources = useQuery({
      queryKey: [
        "invoice-workspace",
        "business-sources",
        detail.invoice.id,
        type,
        search,
      ],
      queryFn: ({ signal }) =>
        invoiceRequest<Source[]>(
          "/invoices/" +
            detail.invoice.id +
            "/business-sources?" +
            new URLSearchParams({ type, search }),
          "GET",
          undefined,
          signal,
        ),
      enabled: open && !!can && type !== "EXTERNAL",
    }),
    source = sources.data?.find((s) => s.id === sourceId);
  return (
    <section className="space-y-3">
      <h3 className="font-medium">Chứng từ nghiệp vụ liên kết</h3>
      {!detail.dossier.business_links.length && (
        <p className="text-sm">
          Chưa có hồ sơ chuẩn/ngoài hệ thống đã được xem xét. Các tham chiếu văn
          bản cũ chưa xác minh được giữ riêng.
        </p>
      )}
      {detail.dossier.business_links.map((link) => (
        <div
          key={label(link.id)}
          className="space-y-1 rounded border p-3 text-sm"
        >
          <strong>{label(link.reference)}</strong>
          <p>
            {label(link.kind)} ·{" "}
            {link.source_type === "EXTERNAL"
              ? "Hồ sơ ngoài đã xem xét"
              : link.verification_state === "INTERNAL_EDITABLE"
                ? "Biên bản nội bộ còn sửa được, chưa phải nghiệm thu ký"
                : link.verification_state === "UNVERIFIED_ASSOCIATION"
                  ? "Chưa xác minh doanh nghiệp của phiếu kho"
                  : "Liên kết chứng từ chuẩn"}{" "}
            ·{" "}
            {link.axis === "EVIDENCE"
              ? "Bằng chứng"
              : link.axis === "OBLIGATION"
                ? "Trục nghĩa vụ"
                : "Trục giao nhận"}
          </p>
          {link.amount != null && (
            <p>
              {label(link.amount)} {label(link.currency)}
            </p>
          )}
          {link.stale === true && (
            <p role="alert" className="text-amber-700">
              Nguồn đã đổi; snapshot cũ được giữ, cần xem lại.
            </p>
          )}
          <details>
            <summary>Snapshot chứng từ</summary>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(link.source_snapshot, null, 2)}
            </pre>
          </details>
          {can && (
            <Button
              size="sm"
              variant="outline"
              disabled={action.busy || !reason.trim()}
              onClick={() =>
                void action.run(
                  "/business-links/" + link.id,
                  { reason },
                  "DELETE",
                )
              }
            >
              Gỡ liên kết có lý do
            </Button>
          )}
        </div>
      ))}
      {can && (
        <details
          open={open}
          onToggle={(e) => setOpen(e.currentTarget.open)}
          className="rounded border p-3"
        >
          <summary>Gắn chứng từ / hồ sơ ngoài hệ thống</summary>
          <div className="mt-3 space-y-3">
            <Label>Nguồn hồ sơ</Label>
            <select
              className="h-10 w-full rounded border bg-background"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setSourceId("");
                setAxis("EVIDENCE");
                setConfirmCompany(false);
                setAssociationEvidence("");
              }}
            >
              {[
                ["CONTRACT", "Hợp đồng"],
                ["BUSINESS_TRANSACTION", "Chứng từ nghiệp vụ chi phí"],
                ["PRODUCTION_SHIPMENT", "Lô giao thành phẩm"],
                ["INVENTORY_DOCUMENT", "Phiếu kho (pháp nhân cần kiểm tra)"],
                ["CONTRACT_DOCUMENT", "Biên bản bàn giao nội bộ hợp đồng"],
                ["EXTERNAL", "Hồ sơ ngoài hệ thống có tệp"],
              ].map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <Label>Loại hồ sơ</Label>
            <select
              className="h-10 w-full rounded border bg-background"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {[
                ["COST", "Chi phí/mua"],
                ["CONTRACT", "Hợp đồng"],
                ["APPENDIX", "Phụ lục/mốc"],
                ["DELIVERY", "Giao nhận"],
                ["ACCEPTANCE", "Nghiệm thu"],
                ["OTHER", "Khác"],
              ].map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            {type === "EXTERNAL" ? (
              <>
                <p className="text-xs">
                  Cần quyền kiểm tra; tải tệp trong tab XML/PDF trước. Không tự
                  tạo sổ mua hàng/nghiệm thu.
                </p>
                <Label>Mã/tham chiếu</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
                <Label>Ngày chứng từ</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <Label>Đối tác/pháp nhân</Label>
                <Input
                  value={party}
                  onChange={(e) => setParty(e.target.value)}
                />
                <Label>Tệp hồ sơ ngoài</Label>
                <select
                  className="h-10 w-full rounded border bg-background"
                  value={fileId}
                  onChange={(e) => setFileId(e.target.value)}
                >
                  <option value="">Chọn tệp đính kèm nghiệp vụ</option>
                  {detail.files
                    .filter((f) => f.purpose === "BUSINESS_ATTACHMENT")
                    .map((f) => (
                      <option key={label(f.id)} value={label(f.id)}>
                        {label(f.name)}
                      </option>
                    ))}
                </select>
                <Label>
                  Giá trị nguồn được người kiểm tra xác nhận (nếu phân bổ)
                </Label>
                <Input
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
              </>
            ) : (
              <>
                <Label>Tìm tham chiếu / đối tác</Label>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {sources.isPending && <p>Đang tìm nguồn có quyền…</p>}
                {sources.error && (
                  <p role="alert" className="text-destructive">
                    {sources.error.message}
                  </p>
                )}
                <select
                  className="h-10 w-full rounded border bg-background"
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                >
                  <option value="">Chọn chứng từ theo mã/ngày/đối tác</option>
                  {sources.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {label(s.snapshot.label)} · {label(s.snapshot.date)} ·{" "}
                      {label(s.snapshot.counterparty)}
                    </option>
                  ))}
                </select>
                {source && (
                  <div className="rounded bg-muted p-2 text-sm">
                    <p>{source.reasons.join(" · ")}</p>
                    <p>
                      {source.amount ?? "Chưa có cơ sở tiền"}{" "}
                      {source.currency ?? ""}. Gợi ý không tự gắn.
                    </p>
                  </div>
                )}
                {sources.data?.length === 0 && (
                  <p className="text-sm">
                    Không có chứng từ phù hợp hoặc chưa có quyền nguồn.
                  </p>
                )}
              </>
            )}
            {type === "INVENTORY_DOCUMENT" && (
              <div className="space-y-2 rounded border p-2">
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={confirmCompany} onChange={e=>setConfirmCompany(e.target.checked)} />
                  Tôi đã đối chiếu phiếu kho này thuộc doanh nghiệp/MST của hóa đơn đang mở.
                </label>
                <Label>Căn cứ xác nhận doanh nghiệp của phiếu kho</Label>
                <Input value={associationEvidence} onChange={e=>setAssociationEvidence(e.target.value)} placeholder="Mã hồ sơ/đơn hàng, chứng từ giao nhận hoặc căn cứ đã kiểm tra" />
              </div>
            )}
            <Label>Mục đích liên kết</Label>
            <select
              className="h-10 w-full rounded border bg-background"
              value={axis}
              onChange={(e) => setAxis(e.target.value)}
            >
              <option value="EVIDENCE">Chỉ bằng chứng</option>
              <option value="OBLIGATION">Phân bổ nghĩa vụ (riêng trục)</option>
              <option value="FULFILMENT">Phân bổ giao nhận (riêng trục)</option>
            </select>
            {axis !== "EVIDENCE" && (
              <>
                <Label>Giá trị phân bổ · {detail.invoice.currency}</Label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="text-xs">
                  Không cộng nghĩa vụ + giao nhận + tiền thu thành tổng. Hợp
                  đồng và thanh toán dùng phân bổ chuẩn ở mục tương ứng.
                </p>
              </>
            )}
            <Button
              disabled={
                action.busy ||
                !reason.trim() ||
                (type === "EXTERNAL" ? !fileId : !source) ||
                (type === "INVENTORY_DOCUMENT" && (!confirmCompany || !associationEvidence.trim() || !company?.capabilities.includes("review")))
              }
              onClick={() =>
                void action.run("/business-links", {
                  source_type: type,
                  source_id: sourceId,
                  source_revision: source?.revision,
                  association_company_id: type === "INVENTORY_DOCUMENT" && confirmCompany ? detail.invoice.company_id : undefined,
                  association_evidence: type === "INVENTORY_DOCUMENT" ? associationEvidence : undefined,
                  kind,
                  axis,
                  amount: axis === "EVIDENCE" ? undefined : amount,
                  reference,
                  document_date: date,
                  counterparty: party,
                  file_id: fileId,
                  document_total: total || undefined,
                  currency: detail.invoice.currency,
                  reason,
                })
              }
            >
              Gắn hồ sơ đã xem xét
            </Button>
          </div>
        </details>
      )}
      {action.error && (
        <p role="alert" className="text-destructive">
          {action.error}
        </p>
      )}
    </section>
  );
}
export function InvoiceBusinessAttachmentPanel({
  detail,
  company,
  reason,
  onSaved,
}: {
  detail: InvoiceDetail;
  company?: InvoiceCompany;
  reason: string;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    action = useDossierAction(detail, onSaved);
  if (
    !company?.capabilities.includes("files") ||
    !company.capabilities.includes("link")
  )
    return null;
  return (
    <details className="rounded border p-3">
      <summary>Bổ sung tệp hồ sơ nghiệp vụ</summary>
      <p className="my-2 text-xs">
        Tệp được lưu bất biến/checksum. XML ở đây là hồ sơ đính kèm, không thay
        thế XML hóa đơn gốc.
      </p>
      <Input
        type="file"
        accept=".pdf,.xml,.png,.jpg,.jpeg,.docx,.xlsx"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <Button
        className="mt-2"
        disabled={action.busy || !reason.trim() || !file}
        onClick={() => {
          if (file)
            void action.run("/business-attachments", async () => {
              const [payload] = await invoiceFilePayload([file]);
              return { ...payload, reason };
            });
        }}
      >
        Lưu tệp hồ sơ nghiệp vụ
      </Button>
      {action.error && (
        <p role="alert" className="text-destructive">
          {action.error}
        </p>
      )}
    </details>
  );
}
export function InvoiceContractSplitPanel({detail,company,reason,onSaved}: {
  detail:InvoiceDetail; company?:InvoiceCompany; reason:string; onSaved:()=>void;
}) {
  const [allocationId,setAllocationId]=useState("");
  const scope=invoiceSessionScope();
  if(!company?.capabilities.includes("link")||detail.invoice.direction!=="OUT")return null;
  return <details className="min-w-0 max-w-full rounded border p-3 [overflow-wrap:anywhere]">
    <summary>Chia khoản thu cho hợp đồng cùng đơn hàng</summary>
    <p className="my-2 text-xs">Tải phần chia đã lưu trước khi sửa. Lưu chỉ thay phần chia của khoản được chọn, không thay phiếu thu hoặc số tiền đã phân bổ vào hóa đơn.</p>
    <Label htmlFor="split-allocation">Khoản thu đã phân bổ</Label>
    <select id="split-allocation" className="my-2 min-h-11 w-full min-w-0 max-w-full rounded border bg-background" value={allocationId} onChange={e=>setAllocationId(e.target.value)}>
      <option value="">Chọn khoản thu đã phân bổ</option>
      {detail.payments.filter(p=>p.source_type==="ORDER_PAYMENT").map(p=><option key={label(p.id)} value={label(p.id)}>Khoản thu · {label(p.amount)} {label(p.currency)} · {label(p.created_at)}</option>)}
    </select>
    {allocationId && <InvoiceSavedSplitEditor key={`${detail.invoice.id}:${allocationId}:${scope}`} detail={detail} allocationId={allocationId} reason={reason} onSaved={onSaved} scope={scope}/>}
  </details>;
}
function InvoiceSavedSplitEditor({detail,allocationId,reason,onSaved,scope}: {
  detail:InvoiceDetail;allocationId:string;reason:string;onSaved:()=>void;scope:string;
}) {
  const [loadRevision,setLoadRevision]=useState(String(detail.invoice.revision)),[epoch,setEpoch]=useState(0),
    [baseline,setBaseline]=useState<InvoiceContractSplitEditor|null>(null),
    [splits,setSplits]=useState<InvoiceContractSplitEditor["splits"]>([]),
    [contractId,setContractId]=useState(""),[amount,setAmount]=useState(""),
    [clearConfirmed,setClearConfirmed]=useState(false),[saved,setSaved]=useState(false);
  const action=useDossierAction(detail,()=>{setSaved(true);onSaved();});
  const query=useQuery({
    queryKey:["invoice-workspace","saved-contract-splits",detail.invoice.id,allocationId,loadRevision,scope,epoch],
    queryFn:({signal})=>invoiceRequest<InvoiceContractSplitEditor>("/invoices/"+encodeURIComponent(detail.invoice.id)+"/payments/"+encodeURIComponent(allocationId)+"/contract-splits","GET",undefined,signal,scope),
    staleTime:0,gcTime:0,refetchOnWindowFocus:false,
  });
  useEffect(()=>{
    if(query.data && !baseline){setBaseline(query.data);setSplits(query.data.splits.map(s=>({...s})));}
  },[query.data,baseline]);
  const dirty=!!baseline && JSON.stringify(splits)!==JSON.stringify(baseline.splits),
    revisionChanged=!!baseline && String(detail.invoice.revision)!==baseline.invoice_revision,
    sessionChanged=invoiceSessionScope()!==scope,
    locked=!baseline||!baseline.editable||revisionChanged||sessionChanged||query.isFetching||!!query.error||saved||action.busy;
  const reload=()=>{setBaseline(null);setSplits([]);setContractId("");setAmount("");setClearConfirmed(false);setSaved(false);setLoadRevision(String(detail.invoice.revision));setEpoch(n=>n+1);onSaved();};
  let total="Chưa hợp lệ",remaining="Chưa hợp lệ";
  try {
    const sum=splits.reduce((n,s)=>{
      const exact=invoiceDecimal(s.amount,6),minor=invoiceMinor(s.amount,"VND");
      if(exact.n!==minor*exact.d || minor<=0n)throw new Error();
      return n+minor;
    },0n);
    total=invoiceAmount(sum,"VND");
    if(baseline)remaining=invoiceAmount(invoiceMinor(baseline.allocation_amount,"VND")-sum,"VND");
  }catch{/* Invalid draft remains visible and cannot be saved. */}
  const validDraft=total!=="Chưa hợp lệ" && remaining!=="Chưa hợp lệ" && !remaining.startsWith("-");
  return <div className="min-w-0 max-w-full space-y-3 break-words">
    {query.isPending && <p role="status">Đang tải danh sách chia đã lưu…</p>}
    {query.error && <p role="alert" className="text-destructive">{query.error.message}. Chưa thể lưu; tải lại để đối chiếu.</p>}
    {revisionChanged && <p role="alert" className="text-amber-700">Hóa đơn đã thay đổi sau khi tải phần chia. Bản sửa đang giữ trên màn hình; tải lại rõ ràng trước khi lưu.</p>}
    {sessionChanged && <p role="alert">Phiên đăng nhập đã đổi; mở lại hồ sơ trước khi sửa phần chia.</p>}
    {baseline && !query.error && !sessionChanged && <>
      <p className="text-sm">Khoản đã phân bổ: {baseline.allocation_amount} VND · Đã chia trên bản lưu: {baseline.total} VND · Còn lại trên bản lưu: {baseline.remaining} VND</p>
      {!baseline.editable && <p role="alert" className="text-amber-700">Chỉ xem: {baseline.reasons.join(" ")}</p>}
      {baseline.splits.length===0 && !dirty && <p>Chưa có phần chia đã lưu cho khoản thu này.</p>}
      {splits.map((s,index)=><div key={s.contract_id} className="space-y-2 rounded border p-2">
        <Label htmlFor={`split-amount-${index}`}>Hợp đồng {s.contract_number} · Phần thu (VND)</Label>
        <Input id={`split-amount-${index}`} inputMode="decimal" disabled={locked} value={s.amount} onChange={e=>{setSplits(xs=>xs.map(x=>x.contract_id===s.contract_id?{...x,amount:e.target.value}:x));setClearConfirmed(false);}}/>
        <Button type="button" variant="outline" className="h-auto min-h-11 w-full whitespace-normal sm:w-auto" disabled={locked} onClick={()=>{setSplits(xs=>xs.filter(x=>x.contract_id!==s.contract_id));setClearConfirmed(false);}}>Bỏ phần chia hợp đồng {s.contract_number}</Button>
      </div>)}
      <Label htmlFor="split-contract">Thêm hợp đồng đã phân bổ hóa đơn</Label>
      <select id="split-contract" className="min-h-11 w-full min-w-0 max-w-full rounded border bg-background" disabled={locked} value={contractId} onChange={e=>setContractId(e.target.value)}>
        <option value="">Chọn hợp đồng</option>
        {detail.contracts.filter(c=>!splits.some(s=>s.contract_id===c.contract_id)).map(c=><option key={label(c.contract_id)} value={label(c.contract_id)}>{label(c.contract_number)}</option>)}
      </select>
      <Label htmlFor="split-new-amount">Phần thu mới (VND, nguyên đồng)</Label>
      <Input id="split-new-amount" inputMode="decimal" disabled={locked} value={amount} onChange={e=>setAmount(e.target.value)}/>
      <Button type="button" variant="outline" className="h-auto min-h-11 w-full whitespace-normal sm:w-auto" disabled={locked||!contractId||!amount||splits.some(s=>s.contract_id===contractId)} onClick={()=>{setSplits(xs=>[...xs,{contract_id:contractId,contract_number:label(detail.contracts.find(c=>c.contract_id===contractId)?.contract_number),amount}]);setContractId("");setAmount("");setClearConfirmed(false);}}>Thêm phần chia</Button>
      <p className="text-sm">Tổng bản sửa: {total} VND · Còn lại: {remaining} VND</p>
      {dirty && <p className="text-sm">Có bản sửa chưa lưu; tải lại sẽ bỏ bản sửa này.</p>}
      <Button className="h-auto min-h-11 w-full whitespace-normal sm:w-auto" disabled={locked||!dirty||!splits.length||!validDraft||!reason.trim()} onClick={()=>void action.run("/payments/"+encodeURIComponent(allocationId)+"/contract-splits",{splits:splits.map(({contract_id,amount})=>({contract_id,amount})),source_revision:baseline.source_revision,expected_revision:baseline.invoice_revision,reason},"POST",scope)}>Lưu danh sách chia khoản thu</Button>
      {baseline.splits.length>0 && <div className="space-y-2 rounded border p-3">
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-5" disabled={locked} checked={clearConfirmed} onChange={e=>setClearConfirmed(e.target.checked)}/>Tôi xác nhận xóa toàn bộ phần chia đã lưu của khoản thu này. Khoản thu và tiền phân bổ vào hóa đơn được giữ nguyên.</label>
        <Button variant="destructive" className="h-auto min-h-11 w-full whitespace-normal sm:w-auto" disabled={locked||!clearConfirmed||!reason.trim()} onClick={()=>void action.run("/payments/"+encodeURIComponent(allocationId)+"/contract-splits",{splits:[],clear:true,source_revision:baseline.source_revision,expected_revision:baseline.invoice_revision,reason},"POST",scope)}>Xóa toàn bộ phần chia đã lưu</Button>
      </div>}
    </>}
    <Button type="button" variant="outline" className="h-auto min-h-11 w-full whitespace-normal sm:w-auto" disabled={action.busy||query.isFetching||sessionChanged} onClick={reload}>{dirty?"Bỏ bản sửa và tải lại phần chia đã lưu":"Tải lại phần chia đã lưu"}</Button>
    {saved && <p role="status">Đã lưu. Tải lại để xem phần chia hiện hành trước khi sửa tiếp.</p>}
    {action.error && <p role="alert" className="text-destructive">{action.error}</p>}
  </div>;
}
