import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Printer, FileDown, FileText } from "lucide-react";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
import { useToast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, AlignmentType, BorderStyle } from "docx";
import { saveAs } from "file-saver";
import { numberToVietnameseCurrency } from "@/lib/numberToText";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any;
}

export const AdvanceRequestDialog = ({ open, onOpenChange, contract }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { settings: companySettings } = useTemplateSettings();
  const { toast } = useToast();
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [requesterName, setRequesterName] = useState("");
  const [requesterTitle, setRequesterTitle] = useState("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(0);
  const [repayDeadline, setRepayDeadline] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  if (!contract) return null;

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("vi-VN") : "—";

  const seller = contract.seller_info || {};
  const companyName = seller.company_name || companySettings.companyName || "";

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>ĐNTU - ${contract.contract_number}</title>
    <style>
      @page { margin: 20mm; }
      body { font-family: 'Times New Roman', Times, serif; padding: 20px; font-size: 13px; line-height: 1.6; color: #000; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #333; padding: 6px 8px; }
      th { background: #f0f0f0; }
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .font-bold { font-weight: bold; }
    </style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    try {
      toast({ title: "Đang tạo PDF..." });
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdfWidth = 210;
      const margin = 10;
      const contentWidth = pdfWidth - margin * 2;
      const contentHeight = (canvas.height * contentWidth) / canvas.width;
      const pdfHeight = contentHeight + margin * 2;
      const pdf = new jsPDF("p", "mm", [pdfWidth, pdfHeight]);
      pdf.addImage(imgData, "JPEG", margin, margin, contentWidth, contentHeight);
      pdf.save(`DNTU-${contract.contract_number}.pdf`);
      toast({ title: "Đã tải PDF thành công!" });
    } catch {
      toast({ title: "Lỗi tạo PDF", variant: "destructive" });
    }
  };

  const handleDownloadWord = async () => {
    try {
      toast({ title: "Đang tạo file Word..." });
      const borderStyle = {
        top: { style: BorderStyle.SINGLE, size: 1 },
        bottom: { style: BorderStyle.SINGLE, size: 1 },
        left: { style: BorderStyle.SINGLE, size: 1 },
        right: { style: BorderStyle.SINGLE, size: 1 },
      };
      const noBorder = { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } };
      const font = "Times New Roman";

      const amountText = amount > 0 ? numberToVietnameseCurrency(amount) : "";

      const tableRows = [
        new DocxTableRow({
          children: ["STT", "Nội dung", "Số tiền"].map(text =>
            new DocxTableCell({
              children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, font })], alignment: AlignmentType.CENTER })],
              borders: borderStyle,
            })
          ),
        }),
        new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "1", size: 20, font })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: reason || "Tạm ứng thực hiện hợp đồng", size: 20, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(amount), size: 20, font })], alignment: AlignmentType.RIGHT })], borders: borderStyle }),
          ],
        }),
        new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "", size: 20, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Tổng cộng", bold: true, size: 20, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(amount), bold: true, size: 20, font, color: "1a56db" })], alignment: AlignmentType.RIGHT })], borders: borderStyle }),
          ],
        }),
      ];

      const children: any[] = [
        new Paragraph({ children: [new TextRun({ text: companyName, bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "————————", size: 20, font })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold: true, size: 24, font })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "Độc lập – Tự do – Hạnh phúc", bold: true, size: 24, font, underline: {} })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "————————", size: 20, font })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "GIẤY ĐỀ NGHỊ TẠM ỨNG", bold: true, size: 32, font, color: "1a56db" })], alignment: AlignmentType.CENTER, spacing: { before: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `(Theo Hợp đồng số: ${contract.contract_number})`, italics: true, size: 20, font })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `Ngày ${formatDate(requestDate)}`, italics: true, size: 20, font })], alignment: AlignmentType.RIGHT, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `Kính gửi: Ban Giám đốc ${companyName}`, bold: true, size: 22, font })], spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: `Tên tôi là: ${requesterName}`, size: 20, font })] }),
        new Paragraph({ children: [new TextRun({ text: `Chức vụ: ${requesterTitle}`, size: 20, font })], spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: `Đề nghị được tạm ứng số tiền để thực hiện Hợp đồng số ${contract.contract_number}, cụ thể như sau:`, size: 20, font })], spacing: { after: 200 } }),
        new DocxTable({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
      ];

      if (amountText) {
        children.push(new Paragraph({ children: [new TextRun({ text: `Bằng chữ: ${amountText}`, italics: true, size: 20, font })], spacing: { before: 100, after: 100 } }));
      }

      if (repayDeadline) {
        children.push(new Paragraph({ children: [new TextRun({ text: `Thời hạn hoàn ứng: ${formatDate(repayDeadline)}`, size: 20, font })], spacing: { after: 100 } }));
      }

      if (additionalNotes) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: "Ghi chú:", bold: true, size: 22, font })], spacing: { before: 100 } }),
          new Paragraph({ children: [new TextRun({ text: additionalNotes, size: 20, font })], spacing: { after: 200 } }),
        );
      }

      children.push(
        new Paragraph({ children: [new TextRun({ text: "Kính đề nghị Ban Giám đốc xem xét và phê duyệt. Trân trọng!", size: 20, font })], spacing: { before: 200, after: 200 } }),
        new DocxTable({
          rows: [new DocxTableRow({
            children: [
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: "NGƯỜI ĐỀ NGHỊ", bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên)", italics: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                ],
                borders: noBorder, width: { size: 33, type: WidthType.PERCENTAGE },
              }),
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: "KẾ TOÁN TRƯỞNG", bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên)", italics: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                ],
                borders: noBorder, width: { size: 34, type: WidthType.PERCENTAGE },
              }),
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: "GIÁM ĐỐC", bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên)", italics: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                ],
                borders: noBorder, width: { size: 33, type: WidthType.PERCENTAGE },
              }),
            ],
          })],
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 }, insideHorizontal: { style: BorderStyle.NONE, size: 0 }, insideVertical: { style: BorderStyle.NONE, size: 0 } },
        }),
      );

      const doc = new Document({
        sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 1080, right: 720 } } }, children }],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `DNTU-${contract.contract_number}.docx`);
      toast({ title: "Đã tải file Word thành công!" });
    } catch (err) {
      console.error("Word export error:", err);
      toast({ title: "Lỗi tạo file Word", variant: "destructive" });
    }
  };

  const amountText = amount > 0 ? numberToVietnameseCurrency(amount) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Đề nghị Tạm ứng - {contract.contract_number}</DialogTitle>
        </DialogHeader>

        {/* Editable fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-4 border rounded-lg bg-muted/30">
          <div>
            <Label>Ngày đề nghị</Label>
            <Input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} />
          </div>
          <div>
            <Label>Người đề nghị</Label>
            <Input value={requesterName} onChange={e => setRequesterName(e.target.value)} placeholder="Họ và tên..." />
          </div>
          <div>
            <Label>Chức vụ</Label>
            <Input value={requesterTitle} onChange={e => setRequesterTitle(e.target.value)} placeholder="Chức vụ..." />
          </div>
          <div>
            <Label>Số tiền tạm ứng</Label>
            <CurrencyInput value={amount} onChange={v => setAmount(v)} placeholder="Nhập số tiền..." />
          </div>
          <div>
            <Label>Thời hạn hoàn ứng</Label>
            <Input type="date" value={repayDeadline} onChange={e => setRepayDeadline(e.target.value)} />
          </div>
          <div>
            <Label>Lý do tạm ứng</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="VD: Mua vật tư thi công..." />
          </div>
          <div className="md:col-span-3">
            <Label>Ghi chú thêm</Label>
            <Textarea value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} rows={2} placeholder="Ghi chú bổ sung (nếu có)..." />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />In</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadPDF}><FileDown className="h-4 w-4 mr-1" />Xuất PDF</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadWord}><FileText className="h-4 w-4 mr-1" />Xuất Word</Button>
        </div>

        {/* Preview */}
        <div ref={printRef} className="bg-white p-8 rounded-lg border space-y-4 text-sm" style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", lineHeight: 1.7 }}>
          <div className="text-center">
            <p className="font-bold text-sm">{companyName}</p>
            <p className="text-xs" style={{ color: "#6b7280" }}>————————</p>
          </div>

          <div className="text-center space-y-1">
            <p className="font-bold text-sm">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p className="font-bold text-sm" style={{ textDecoration: "underline" }}>Độc lập – Tự do – Hạnh phúc</p>
            <p className="text-xs" style={{ color: "#6b7280" }}>————————</p>
          </div>

          <div className="text-center mt-4">
            <h2 className="text-lg font-bold" style={{ color: "#1a56db" }}>GIẤY ĐỀ NGHỊ TẠM ỨNG</h2>
            <p className="text-sm italic">(Theo Hợp đồng số: {contract.contract_number})</p>
          </div>

          <p className="text-right italic">Ngày {formatDate(requestDate)}</p>

          <p><strong>Kính gửi:</strong> Ban Giám đốc {companyName}</p>

          <div className="space-y-1">
            <p>Tên tôi là: <strong>{requesterName || "........................"}</strong></p>
            <p>Chức vụ: <strong>{requesterTitle || "........................"}</strong></p>
          </div>

          <p>Đề nghị được tạm ứng số tiền để thực hiện Hợp đồng số {contract.contract_number}, cụ thể như sau:</p>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <th className="border border-gray-400 p-2 text-center w-16">STT</th>
                <th className="border border-gray-400 p-2 text-left">Nội dung</th>
                <th className="border border-gray-400 p-2 text-right w-40">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-400 p-2 text-center">1</td>
                <td className="border border-gray-400 p-2">{reason || "Tạm ứng thực hiện hợp đồng"}</td>
                <td className="border border-gray-400 p-2 text-right">{formatCurrency(amount)}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2"></td>
                <td className="border border-gray-400 p-2 font-bold">Tổng cộng</td>
                <td className="border border-gray-400 p-2 text-right font-bold" style={{ color: "#1a56db" }}>{formatCurrency(amount)}</td>
              </tr>
            </tbody>
          </table>

          {amountText && <p className="italic">Bằng chữ: {amountText}</p>}

          {repayDeadline && <p><strong>Thời hạn hoàn ứng:</strong> {formatDate(repayDeadline)}</p>}

          {additionalNotes && (
            <>
              <p className="font-bold mt-4">GHI CHÚ:</p>
              <p className="whitespace-pre-wrap">{additionalNotes}</p>
            </>
          )}

          <p className="mt-4">Kính đề nghị Ban Giám đốc xem xét và phê duyệt. Trân trọng!</p>

          <div className="grid grid-cols-3 gap-4 pt-8 mt-8 text-center" style={{ borderTop: "1px solid #e5e7eb" }}>
            <div>
              <p className="font-bold">NGƯỜI ĐỀ NGHỊ</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>(Ký, ghi rõ họ tên)</p>
              <div style={{ height: 80 }}></div>
            </div>
            <div>
              <p className="font-bold">KẾ TOÁN TRƯỞNG</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>(Ký, ghi rõ họ tên)</p>
              <div style={{ height: 80 }}></div>
            </div>
            <div>
              <p className="font-bold">GIÁM ĐỐC</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>(Ký, ghi rõ họ tên)</p>
              <div style={{ height: 80 }}></div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
