import { useEffect, useRef, useState } from "react";
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
  invoiceFilePayload,
  invoiceRequest,
} from "@/lib/invoice-workspace-api";
import { toast } from "sonner";
type PreviewLine = {
  name?: string | null;
  quantity?: string | null;
  unit?: string | null;
  unit_price?: string | null;
  vat_rate?: string | null;
};
type PreviewInvoice = {
  template_code: string;
  invoice_series: string;
  invoice_number: string;
  issued_date: string;
  direction?: "IN" | "OUT" | "UNASSIGNED";
  seller_name: string;
  seller_tax_code: string;
  buyer_name: string;
  buyer_tax_code: string;
  total_amount: string;
  vat_amount: string;
  total_with_vat: string;
  currency: string;
  lines?: PreviewLine[];
  discrepancy?: string[];
};
type Preview = {
  job_id: string;
  status: string;
  preview: PreviewInvoice[];
  files: Record<string, unknown>[];
  binding?: {
    kind: "VIETTEL_TT78_EXPLICIT_TYPE";
    xml_sha256: string;
    api_invoice_type: string;
    api_full_invoice_no: string;
    target_identity: PreviewInvoice;
    xml_identity: PreviewInvoice;
    checks: string[];
  } | null;
};
const previewText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : "Chưa có dữ liệu";
const directionText = (value: unknown) =>
  value === "IN" ? "Hóa đơn đầu vào" : value === "OUT" ? "Hóa đơn đầu ra" : "Chưa xác định chiều — cần kiểm tra";
export function InvoiceImportDialog({
  open,
  onOpenChange,
  companyId,
  invoiceId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyId: string;
  invoiceId?: string;
  onSaved: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]),
    [source, setSource] = useState("TAX_FILE"),
    [why, setWhy] = useState(""),
    [mapping, setMapping] = useState("{}"),
    [preview, setPreview] = useState<Preview | null>(null),
    [bindingConfirmed, setBindingConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false),
    key = useRef(""),
    generation = useRef(0);
  useEffect(() => {
    generation.current++;
    if (open) {
      setPreview(null);
      setBindingConfirmed(false);
      setFiles([]);
      setWhy("");
      setError("");
      key.current = crypto.randomUUID();
    }
    const lifecycle = generation;
    return () => {
      lifecycle.current++;
    };
  }, [open, companyId, invoiceId]);
  const parse = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    const gen = generation.current;
    try {
      const data = await invoiceFilePayload(files);
      const result = await invoiceRequest<Preview>("/import/preview", "POST", {
        company_id: companyId,
        invoice_id: invoiceId,
        request_key: key.current,
        source,
        files: data,
        mapping: JSON.parse(mapping),
        reason: why,
      });
      if (gen === generation.current) {
        setPreview(result);
        setBindingConfirmed(false);
        setError("");
      }
    } catch (e) {
      if (gen === generation.current)
        setError(e instanceof Error ? e.message : "Không đọc được tệp.");
    } finally {
      pending.current = false;
      if (gen === generation.current) setBusy(false);
    }
  };
  const commit = async () => {
    if (!preview || pending.current || (preview.binding && !bindingConfirmed)) return;
    pending.current = true;
    setBusy(true);
    const gen = generation.current;
    try {
      await invoiceRequest("/import/" + preview.job_id + "/commit", "POST", preview.binding ? { confirm_original_binding: bindingConfirmed } : {});
      if (gen === generation.current) {
        toast.success(
          "Đã tiếp nhận bằng chứng; kiểm tra chênh lệch trong hồ sơ",
        );
        onSaved();
        onOpenChange(false);
      }
    } catch (e) {
      if (gen === generation.current)
        setError(e instanceof Error ? e.message : "Không nhập được.");
    } finally {
      pending.current = false;
      if (gen === generation.current) setBusy(false);
    }
  };
  const changed = () => {
    setPreview(null);
    setBindingConfirmed(false);
    key.current = crypto.randomUUID();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!pending.current) onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] min-w-0 max-w-3xl overflow-x-hidden overflow-y-auto [overflow-wrap:anywhere] [&>*]:min-w-0 [&_select]:min-w-0 [&_select]:max-w-full [&_button]:max-w-full [&_button]:whitespace-normal">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle>
            {invoiceId ? "Bổ sung bằng chứng gốc" : "Nhập tệp hóa đơn"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          XML HDon/DLHDon, XLSX một sheet, CSV, ZIP tệp ở thư mục gốc; PDF cần
          hóa đơn đích hoặc một hóa đơn duy nhất trong lượt nhập. Tối đa 15MB
          nén, 40MB giải nén. Chỉ có danh sách sẽ ghi rõ thiếu XML gốc.
        </p>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div>
          <Label htmlFor="invoice-import-source">Nguồn tệp</Label>
          <select
            id="invoice-import-source"
            className="h-11 w-full min-w-0 max-w-full rounded border bg-background"
            value={source}
            disabled={busy}
            onChange={(e) => {
              setSource(e.target.value);
              changed();
            }}
          >
            <option value="TAX_FILE">Tệp tải hợp lệ từ cổng thuế</option>
            <option value="VIETTEL_FILE">Tệp từ Viettel</option>
            <option value="USER_FILE">Bằng chứng do người dùng bổ sung</option>
          </select>
        </div>
        <Label htmlFor="invoice-import-files">Chọn tệp hóa đơn</Label>
        <Input
          id="invoice-import-files"
          className="min-w-0 max-w-full"
          aria-label="Chọn tệp hóa đơn"
          type="file"
          multiple
          accept=".xml,.pdf,.xlsx,.csv,.zip"
          disabled={busy}
          onChange={(e) => {
            setFiles(Array.from(e.target.files ?? []));
            changed();
          }}
        />
        <details>
          <summary className="cursor-pointer text-sm">
            Ánh xạ cột Excel/CSV và mẫu cột
          </summary>
          <p className="my-2 text-xs">
            Cột chuẩn: seller_tax_code, seller_name, seller_address,
            buyer_tax_code, buyer_name, buyer_address, invoice_number,
            template_code, invoice_series, issued_date (YYYY-MM-DD), currency,
            status, total_amount, vat_amount, total_with_vat. Ánh xạ JSON ví dụ:{" "}
            {`{"seller_tax_code":"MST người bán"}`}. Không đoán cột hoặc số
            tiền.
          </p>
          <Textarea
            aria-label="Ánh xạ cột JSON"
            value={mapping}
            disabled={busy}
            onChange={(e) => {
              setMapping(e.target.value);
              changed();
            }}
          />
        </details>
        <div>
          <Label htmlFor="invoice-import-reason">Lý do/nguồn nhận tệp</Label>
          <Textarea
            id="invoice-import-reason"
            value={why}
            disabled={busy}
            onChange={(e) => {
              setWhy(e.target.value);
              changed();
            }}
          />
        </div>
        {preview && (
          <div className="min-w-0 space-y-2">
            <p className="font-medium">
              Đã đọc {preview.preview?.length ?? 0} hóa đơn — chưa ghi sổ
            </p>
            <p className="text-sm text-amber-700">
              Đọc nội dung XML chưa xác minh chữ ký số hoặc tính hợp lệ pháp lý của hóa đơn.
            </p>
            {preview.binding && <section className="min-w-0 space-y-2 rounded border border-amber-300 p-3 text-sm">
              <h3 className="font-semibold">Đối chiếu XML gốc với hồ sơ Viettel đích</h3>
              <p>Máy chủ đã đối chiếu loại hóa đơn API với mẫu pháp lý XML, MST hai bên, ký hiệu/số, ngày, tiền tệ và ba tổng tiền chính xác; chưa xác minh chữ ký số hoặc tính hợp lệ pháp lý.</p>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="min-w-0"><strong>Hồ sơ Viettel đích</strong><p>Mã mẫu API: {previewText(preview.binding.target_identity.template_code)}</p><p>Ký hiệu/số: {previewText(preview.binding.target_identity.invoice_series)} · {previewText(preview.binding.target_identity.invoice_number)}</p><p>Số đầy đủ API: {previewText(preview.binding.api_full_invoice_no)}</p><p>Loại hóa đơn API: {previewText(preview.binding.api_invoice_type)}</p></div>
                <div className="min-w-0"><strong>XML được bổ sung</strong><p>Mẫu pháp lý XML: {previewText(preview.binding.xml_identity.template_code)}</p><p>Ký hiệu/số: {previewText(preview.binding.xml_identity.invoice_series)} · {previewText(preview.binding.xml_identity.invoice_number)}</p><p>Ngày: {previewText(preview.binding.xml_identity.issued_date)}</p><p>Tổng: {previewText(preview.binding.xml_identity.total_with_vat)} {previewText(preview.binding.xml_identity.currency)}</p></div>
              </div>
              <p className="break-all text-xs">SHA256 XML: {preview.binding.xml_sha256}</p>
              <p>Chỉ thêm bằng chứng vào hồ sơ đích; giữ nguyên định danh XML và thông tin/tiền chuẩn của hồ sơ. Hồ sơ vẫn cần kiểm tra.</p>
              <label className="flex min-h-11 items-start gap-2"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={bindingConfirmed} disabled={busy} onChange={event=>setBindingConfirmed(event.target.checked)}/><span>Tôi đã đối chiếu và xác nhận XML gốc này thuộc hồ sơ Viettel đích.</span></label>
            </section>}
            <div className="max-h-96 min-w-0 space-y-2 overflow-y-auto">
              {preview.preview?.map((r, i) => (
                <div key={i} className="min-w-0 space-y-2 rounded border p-3 text-sm">
                  <p>
                    Ký hiệu {previewText(r.invoice_series)} · Số {previewText(r.invoice_number)} ·{" "}
                    Ngày {previewText(r.issued_date)}
                  </p>
                  <p className="font-medium">{directionText(r.direction)} · Cần kiểm tra</p>
                  <p>
                    Người bán: {previewText(r.seller_name)} · MST {previewText(r.seller_tax_code)}
                  </p>
                  <p>
                    Người mua: {previewText(r.buyer_name)} · MST {previewText(r.buyer_tax_code)}
                  </p>
                  <p>
                    Trước thuế {previewText(r.total_amount)} · VAT{" "}
                    {previewText(r.vat_amount)} · Tổng {previewText(r.total_with_vat)}{" "}
                    {previewText(r.currency)}
                  </p>
                  <details className="min-w-0">
                    <summary className="min-h-11 cursor-pointer py-2">Xem dòng hàng đã đọc ({Array.isArray(r.lines) ? r.lines.length : 0})</summary>
                    {Array.isArray(r.lines) && r.lines.length ? (
                      <div className="w-full min-w-0 max-w-full overflow-x-auto" role="region" aria-label={`Dòng hàng hóa đơn ${i + 1}`} tabIndex={0}>
                        <table className="w-full min-w-[36rem] text-left text-xs">
                          <thead><tr><th className="p-2" scope="col">Tên hàng/dịch vụ</th><th className="p-2" scope="col">Số lượng</th><th className="p-2" scope="col">Đơn vị</th><th className="p-2" scope="col">Đơn giá</th><th className="p-2" scope="col">Thuế suất VAT</th></tr></thead>
                          <tbody>{r.lines.map((entry, j) => {
                            const line = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : {};
                            return <tr key={j} className="border-t"><td className="p-2">{previewText(line.name)}</td><td className="p-2">{previewText(line.quantity)}</td><td className="p-2">{previewText(line.unit)}</td><td className="p-2">{previewText(line.unit_price)}</td><td className="p-2">{previewText(line.vat_rate)}</td></tr>;
                          })}</tbody>
                        </table>
                      </div>
                    ) : <p>Chưa có dữ liệu dòng hàng trong phần xem trước.</p>}
                  </details>
                  {Array.isArray(r.discrepancy) && r.discrepancy.length > 0 ? (
                    <div className="text-amber-700">
                      <p className="font-medium">Danh sách cần kiểm tra:</p>
                      <ul aria-label="Cảnh báo cần kiểm tra" className="space-y-1">
                        {r.discrepancy.map((m, j) => <li key={j} className="flex items-start gap-2"><span aria-hidden="true">□</span><span className="min-w-0">{previewText(m)}</span></li>)}
                      </ul>
                    </div>
                  ) : <p className="text-muted-foreground">Bước đọc chưa ghi nhận chênh lệch; vẫn cần kiểm tra chứng từ.</p>}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Xác nhận dùng payload và bytes đã staging trên máy chủ; sửa tệp
              phải xem trước lại.
            </p>
          </div>
        )}
        <DialogFooter className="min-w-0 gap-2 [&_button]:h-auto [&_button]:min-h-11 [&_button]:py-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Hủy
          </Button>
          <Button
            variant="outline"
            disabled={busy || !files.length || !why.trim()}
            onClick={() => void parse()}
          >
            {busy ? "Đang xử lý…" : "Xem trước tệp"}
          </Button>
          <Button disabled={busy || !preview || (!!preview.binding && !bindingConfirmed)} onClick={() => void commit()}>
            Xác nhận tiếp nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
