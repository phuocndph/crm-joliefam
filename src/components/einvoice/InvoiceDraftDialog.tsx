import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  invoiceRequest,
  type InvoiceCompany,
  type InvoiceDetail,
} from "@/lib/invoice-workspace-api";
import { toast } from "sonner";
import { invoiceBusinessDate, invoiceToday } from "@/lib/invoice-date";
type Line = {
  name: string;
  quantity: string;
  unit_price: string;
  vat_rate: string;
  source_line?: string;
  unit?: string;
};
type Source = {
  id: string;
  type: string;
  revision: string;
  buyer: Record<string, unknown>;
  lines: Line[];
  total_amount: string;
};
const newLine = (): Line => ({
  name: "",
  quantity: "1",
  unit_price: "0",
  vat_rate: "8",
});
export function InvoiceDraftDialog({
  open,
  onOpenChange,
  companyId = "",
  contractId,
  detail,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId?: string;
  contractId?: string;
  detail?: InvoiceDetail;
  onSaved?: () => void;
}) {
  const cache = useQueryClient();
  const [company, setCompany] = useState(companyId),
    [sourceType, setSourceType] = useState(
      contractId ? "CONTRACT" : "STANDALONE",
    ),
    [sourceId, setSourceId] = useState(contractId ?? ""),
    [source, setSource] = useState<Source | null>(null);
  const [lines, setLines] = useState<Line[]>([newLine()]),
    [buyer, setBuyer] = useState({
      company_name: "",
      tax_code: "",
      address: "",
    }),
    [currency, setCurrency] = useState("VND"),
    [why, setWhy] = useState(""),
    [reference, setReference] = useState(""),
    [notes, setNotes] = useState(""),
    [date, setDate] = useState(invoiceToday),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const [acceptSourceRefresh, setAcceptSourceRefresh] = useState(false);
  const inflight = useRef(false),
    keys = useRef(new Map<string, string>()),
    generation = useRef(0);
  const companies = useQuery({
    queryKey: ["invoice-companies"],
    queryFn: () => invoiceRequest<InvoiceCompany[]>("/companies"),
    enabled: open,
  });
  const sources = useQuery({
    queryKey: ["invoice-sources", company, sourceType],
    queryFn: () =>
      invoiceRequest<{ id: string; label: string; total_amount: string }[]>(
        "/sources?" +
          new URLSearchParams({ company_id: company, type: sourceType }),
      ),
    enabled: open && !!company && sourceType !== "STANDALONE",
  });
  useEffect(() => {
    if (open) {
      setCompany(detail?.invoice.company_id ?? companyId);
      setWhy("");
      setAcceptSourceRefresh(false);
      setError("");
      setSource(null);
      setSourceType(contractId ? "CONTRACT" : "STANDALONE");
      setSourceId(contractId ?? "");
      setLines([newLine()]);
      setBuyer({ company_name: "", tax_code: "", address: "" });
      setReference("");
      setNotes("");
      setDate(
        detail
          ? invoiceBusinessDate(detail.invoice.issued_date) || invoiceToday()
          : invoiceToday(),
      );
      if (detail) {
        const d = detail.draft_source;
        setCurrency(detail.invoice.currency);
        setLines(
          detail.lines.map((l) => ({
            ...l,
            name: String(l.name),
            quantity: String(l.quantity),
            unit_price: String(l.unit_price),
            vat_rate: String(l.vat_rate),
            source_line:
              l.source_line == null ? undefined : String(l.source_line),
          })),
        );
        setBuyer({
          company_name: detail.invoice.buyer_name ?? "",
          tax_code: String(detail.invoice.buyer_tax_code ?? ""),
          address: String(detail.invoice.buyer_address ?? ""),
        });
        setNotes(String(detail.invoice.internal_notes ?? ""));
        setReference(String(d.business_reference ?? ""));
        setSourceType(String(d.type ?? "STANDALONE"));
        setSourceId(String(d.source_id ?? ""));
      }
    }
    generation.current++;
    const lifecycle = generation;
    return () => {
      lifecycle.current++;
    };
  }, [open, companyId, contractId, detail]);
  useEffect(() => {
    if (!open || !company || !sourceId || sourceType === "STANDALONE") {
      setSource(null);
      return;
    }
    let active = true;
    setError("");
    void invoiceRequest<Source>(
      "/sources/" +
        sourceType +
        "/" +
        sourceId +
        "?company_id=" +
        encodeURIComponent(company) +
        (detail
          ? "&exclude_invoice_id=" + encodeURIComponent(detail.invoice.id)
          : ""),
    )
      .then((value) => {
        if (!active) return;
        if (
          detail &&
          !acceptSourceRefresh &&
          detail.draft_source.source_id === sourceId &&
          detail.draft_source.type === sourceType &&
          detail.draft_source.source_revision &&
          detail.draft_source.source_revision !== value.revision
        ) {
          setSource(null);
          setError(
            "Chứng từ nguồn đã thay đổi sau snapshot nháp. Chọn lại nguồn và đối chiếu trước khi lưu.",
          );
          return;
        }
        setSource(value);
        if (
          !detail ||
          acceptSourceRefresh ||
          detail.draft_source.source_id !== sourceId ||
          detail.draft_source.type !== sourceType
        ) {
          setLines(
            value.lines
              .filter((l) => Number(l.quantity) > 0)
              .map((l) => ({
                ...l,
                quantity: String(l.quantity),
                unit_price: String(l.unit_price),
                vat_rate: String(l.vat_rate),
              })),
          );
          setBuyer({
            company_name: String(
              value.buyer.company_name ?? value.buyer.name ?? "",
            ),
            tax_code: String(value.buyer.tax_code ?? ""),
            address: String(value.buyer.address ?? ""),
          });
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [open, company, sourceId, sourceType, detail, acceptSourceRefresh]);
  const save = async () => {
    if (inflight.current) return;
    const body = {
      company_id: company,
      expected_revision: detail?.invoice.revision,
      source_type: sourceType === "STANDALONE" ? undefined : sourceType,
      source_id: sourceType === "STANDALONE" ? undefined : sourceId,
      source_revision: source?.revision,
      currency,
      buyer,
      lines,
      business_reference: reference,
      reason: why,
      notes,
      invoice_date: date,
    };
    const fingerprint = JSON.stringify({
      operation: detail ? "PATCH_DRAFT" : "CREATE_DRAFT",
      invoice_id: detail?.invoice.id ?? null,
      body,
    });
    let key = keys.current.get(fingerprint);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(fingerprint, key);
    }
    const gen = generation.current;
    inflight.current = true;
    setSaving(true);
    setError("");
    try {
      await invoiceRequest(
        detail ? "/drafts/" + detail.invoice.id : "/drafts",
        detail ? "PATCH" : "POST",
        { ...body, request_key: key },
      );
      if (gen !== generation.current) return;
      keys.current.delete(fingerprint);
      await cache.invalidateQueries({ queryKey: ["invoice-workspace"] });
      toast.success("Đã lưu nháp CRM — chưa gửi Viettel");
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      if (gen === generation.current)
        setError(e instanceof Error ? e.message : "Không lưu được.");
    } finally {
      inflight.current = false;
      if (gen === generation.current) setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!inflight.current) onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {detail ? "Sửa" : "Tạo"} nháp CRM — chưa gửi Viettel
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Lưu snapshot và giữ chỗ phần đã chọn. Không ký/phát hành hoặc tự tạo
          thu/chi.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {detail && error.includes("nguồn đã thay đổi") && (
          <Button
            variant="outline"
            onClick={() => setAcceptSourceRefresh(true)}
          >
            Tải nguồn hiện tại để soạn lại và kiểm tra
          </Button>
        )}
        {companies.isError && (
          <p role="alert">
            Không tải được doanh nghiệp.{" "}
            <Button variant="outline" onClick={() => void companies.refetch()}>
              Thử lại
            </Button>
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Doanh nghiệp/MST</Label>
            <select
              className="h-10 w-full rounded border bg-background px-2"
              value={company}
              disabled={!!detail || saving}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="">Chọn doanh nghiệp</option>
              {companies.data
                ?.filter((c) => c.capabilities.includes("draft"))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.legal_name} · {c.tax_code}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label>Ngày nháp</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Nguồn nghiệp vụ</Label>
            <select
              className="h-10 w-full rounded border bg-background px-2"
              value={sourceType}
              disabled={saving}
              onChange={(e) => {
                setSourceType(e.target.value);
                setSourceId("");
              }}
            >
              <option value="STANDALONE">Độc lập — có lý do</option>
              <option value="CONTRACT">Hợp đồng bán</option>
              <option value="ORDER">Đơn hàng</option>
            </select>
          </div>
          {sourceType !== "STANDALONE" ? (
            <div>
              <Label>Chứng từ nguồn</Label>
              <select
                className="h-10 w-full rounded border bg-background px-2"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
              >
                <option value="">Chọn chứng từ</option>
                {sources.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label || s.id} · {s.total_amount}
                  </option>
                ))}
              </select>
              {sources.isError && (
                <Button
                  variant="outline"
                  onClick={() => void sources.refetch()}
                >
                  Thử tải lại nguồn
                </Button>
              )}
            </div>
          ) : (
            <div>
              <Label>Tham chiếu nghiệp vụ</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Mã đợt/biên bản/hồ sơ chi phí"
              />
            </div>
          )}
          <div>
            <Label>Tên người mua</Label>
            <Input
              disabled={sourceType === "CONTRACT"}
              value={buyer.company_name}
              onChange={(e) =>
                setBuyer({ ...buyer, company_name: e.target.value })
              }
            />
          </div>
          <div>
            <Label>MST người mua</Label>
            <Input
              disabled={sourceType === "CONTRACT"}
              value={buyer.tax_code}
              onChange={(e) => setBuyer({ ...buyer, tax_code: e.target.value })}
            />
          </div>
          <div>
            <Label>Địa chỉ</Label>
            <Input
              value={buyer.address}
              onChange={(e) => setBuyer({ ...buyer, address: e.target.value })}
            />
          </div>
          <div>
            <Label>Tiền tệ</Label>
            <Input
              value={currency}
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            />
          </div>
        </div>
        <p className="text-sm">
          Chọn số lượng từng dòng; xóa dòng không lập. Giá/thuế từ nguồn được
          máy chủ kiểm tra lại.
        </p>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <div
              key={i}
              className="grid grid-cols-2 gap-2 rounded border p-2 sm:grid-cols-6"
            >
              <Input
                aria-label={"Tên dòng " + (i + 1)}
                className="col-span-2"
                disabled={sourceType !== "STANDALONE"}
                value={line.name}
                placeholder="Tên hàng/dịch vụ"
                onChange={(e) =>
                  setLines(
                    lines.map((l, n) =>
                      n === i ? { ...l, name: e.target.value } : l,
                    ),
                  )
                }
              />
              <Input
                aria-label={"Số lượng dòng " + (i + 1)}
                value={line.quantity}
                placeholder="Số lượng"
                onChange={(e) =>
                  setLines(
                    lines.map((l, n) =>
                      n === i ? { ...l, quantity: e.target.value } : l,
                    ),
                  )
                }
              />
              <Input
                aria-label={"Đơn giá dòng " + (i + 1)}
                disabled={sourceType !== "STANDALONE"}
                value={line.unit_price}
                onChange={(e) =>
                  setLines(
                    lines.map((l, n) =>
                      n === i ? { ...l, unit_price: e.target.value } : l,
                    ),
                  )
                }
              />
              <Input
                aria-label={"VAT dòng " + (i + 1)}
                disabled={sourceType !== "STANDALONE"}
                value={line.vat_rate}
                placeholder="VAT % / KCT"
                onChange={(e) =>
                  setLines(
                    lines.map((l, n) =>
                      n === i ? { ...l, vat_rate: e.target.value } : l,
                    ),
                  )
                }
              />
              <Button
                variant="outline"
                onClick={() => setLines(lines.filter((_, n) => n !== i))}
              >
                Bỏ dòng
              </Button>
            </div>
          ))}
        </div>
        {sourceType === "STANDALONE" && (
          <Button
            variant="outline"
            onClick={() => setLines([...lines, newLine()])}
          >
            Thêm dòng
          </Button>
        )}
        <div>
          <Label>Lý do lập/sửa nháp</Label>
          <Textarea value={why} onChange={(e) => setWhy(e.target.value)} />
        </div>
        <div>
          <Label>Ghi chú hồ sơ</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Mẫu/ký hiệu: chưa xác minh. Tiền tính theo từng dòng, làm tròn theo
          đơn vị nhỏ nhất của tiền tệ (VND nguyên đồng; USD 2; TND 3 chữ số).
          Sửa nháp đã kiểm tra sẽ cần kiểm tra lại.
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button
            onClick={() => void save()}
            disabled={
              saving ||
              !company ||
              !why.trim() ||
              !lines.length ||
              (sourceType !== "STANDALONE" && !source)
            }
          >
            {saving ? "Đang lưu…" : "Lưu nháp CRM"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
