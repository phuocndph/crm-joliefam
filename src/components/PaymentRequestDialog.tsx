import { useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, FileDown, FileText } from "lucide-react";
import { useTemplateSettings } from "@/hooks/useTemplateSettings";
import { useToast } from "@/hooks/use-toast";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, AlignmentType, BorderStyle } from "docx";
import { saveAs } from "file-saver";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any;
}

export const PaymentRequestDialog = ({ open, onOpenChange, contract }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { settings: companySettings } = useTemplateSettings();
  const { toast } = useToast();
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentPhase, setPaymentPhase] = useState("remaining");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [showOnlineStamp, setShowOnlineStamp] = useState(false);

  if (!contract) return null;

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("vi-VN") : "—";

  const seller = contract.seller_info || {};
  const buyer = contract.buyer_info || {};
  const totalAmount = contract.total_amount || 0;
  const depositAmount = contract.deposit_amount || 0;
  const remainingAmount = totalAmount - depositAmount;

  const sellerName = companySettings.companyName || seller.company_name || "";
  const sellerBank = companySettings.bankInfo || seller.bank_info || "";
  const sellerTaxCode = companySettings.taxCode || seller.tax_code || "";
  const buyerName = buyer.company_name || contract.customers?.company || contract.customers?.name || "—";

  const phases = [
    { value: "deposit", label: `Đợt 1 - Đặt cọc (${contract.deposit_percentage || 70}%)`, amount: depositAmount },
    { value: "remaining", label: `Đợt 2 - Thanh toán còn lại (${100 - (contract.deposit_percentage || 70)}%)`, amount: remainingAmount },
    { value: "full", label: "Toàn bộ giá trị hợp đồng", amount: totalAmount },
  ];

  const selectedPhase = phases.find(p => p.value === paymentPhase) || phases[1];

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>DNTT - ${contract.contract_number}</title>
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
      pdf.save(`DNTT-${contract.contract_number}.pdf`);
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

      const paymentTableRows = [
        new DocxTableRow({
          children: ["Nội dung", "Giá trị"].map(text =>
            new DocxTableCell({
              children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, font })], alignment: AlignmentType.CENTER })],
              borders: borderStyle,
            })
          ),
        }),
        new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Tổng giá trị hợp đồng", size: 20, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(totalAmount), size: 20, font })], alignment: AlignmentType.RIGHT })], borders: borderStyle }),
          ],
        }),
        new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: `Đã thanh toán (đặt cọc ${contract.deposit_percentage || 70}%)`, size: 20, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(depositAmount), size: 20, font })], alignment: AlignmentType.RIGHT })], borders: borderStyle }),
          ],
        }),
        new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Số tiền đề nghị thanh toán", bold: true, size: 20, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(selectedPhase.amount), bold: true, size: 20, font, color: "1a56db" })], alignment: AlignmentType.RIGHT })], borders: borderStyle }),
          ],
        }),
      ];

      const children: any[] = [
        new Paragraph({ children: [new TextRun({ text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold: true, size: 24, font })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "Độc lập – Tự do – Hạnh phúc", bold: true, size: 24, font, underline: {} })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "————————", size: 20, font })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "ĐỀ NGHỊ THANH TOÁN", bold: true, size: 32, font, color: "1a56db" })], alignment: AlignmentType.CENTER, spacing: { before: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `(Theo Hợp đồng số: ${contract.contract_number})`, italics: true, size: 20, font })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `Ngày ${formatDate(requestDate)}`, italics: true, size: 20, font })], alignment: AlignmentType.RIGHT, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `Kính gửi: ${buyerName}`, bold: true, size: 22, font })], spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `Căn cứ Hợp đồng số ${contract.contract_number} ngày ${formatDate(contract.contract_date)} giữa ${sellerName} và ${buyerName}, chúng tôi đề nghị Quý khách hàng thanh toán theo chi tiết sau:`, size: 20, font })], spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "BẢNG TỔNG HỢP THANH TOÁN:", bold: true, size: 22, font })], spacing: { before: 100 } }),
        new DocxTable({ rows: paymentTableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
        new Paragraph({ children: [new TextRun({ text: "THÔNG TIN CHUYỂN KHOẢN:", bold: true, size: 22, font })], spacing: { before: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `Đơn vị thụ hưởng: ${sellerName}`, size: 20, font })] }),
      ];

      if (sellerTaxCode) children.push(new Paragraph({ children: [new TextRun({ text: `Mã số thuế: ${sellerTaxCode}`, size: 20, font })] }));
      if (sellerBank) children.push(new Paragraph({ children: [new TextRun({ text: `Ngân hàng: ${sellerBank}`, size: 20, font })] }));

      children.push(
        new Paragraph({ children: [new TextRun({ text: `Nội dung chuyển khoản: Thanh toán HĐ ${contract.contract_number}`, size: 20, font })], spacing: { after: 200 } }),
      );

      if (additionalNotes) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: "GHI CHÚ:", bold: true, size: 22, font })], spacing: { before: 100 } }),
          new Paragraph({ children: [new TextRun({ text: additionalNotes, size: 20, font })], spacing: { after: 200 } }),
        );
      }

      children.push(
        new Paragraph({ children: [new TextRun({ text: "Kính mong Quý khách hàng thanh toán đúng hạn. Trân trọng cảm ơn!", size: 20, font })], spacing: { before: 200, after: 200 } }),
        new DocxTable({
          rows: [new DocxTableRow({
            children: [
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: "NGƯỜI ĐỀ NGHỊ", bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên)", italics: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                ],
                borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
              }),
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: "XÁC NHẬN CỦA KHÁCH HÀNG", bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên)", italics: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                ],
                borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
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
      saveAs(blob, `DNTT-${contract.contract_number}.docx`);
      toast({ title: "Đã tải file Word thành công!" });
    } catch (err) {
      console.error("Word export error:", err);
      toast({ title: "Lỗi tạo file Word", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Đề nghị Thanh toán - {contract.contract_number}</DialogTitle>
        </DialogHeader>

        {/* Editable fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-4 border rounded-lg bg-muted/30">
          <div>
            <Label>Ngày đề nghị</Label>
            <Input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} />
          </div>
          <div>
            <Label>Đợt thanh toán</Label>
            <Select value={paymentPhase} onValueChange={setPaymentPhase}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {phases.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Số tiền đề nghị</Label>
            <Input value={formatCurrency(selectedPhase.amount)} readOnly className="bg-muted font-bold" />
          </div>
          <div className="md:col-span-3">
            <Label>Ghi chú thêm</Label>
            <Textarea value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} rows={2} placeholder="Ghi chú bổ sung (nếu có)..." />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />In</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadPDF}><FileDown className="h-4 w-4 mr-1" />Xuất PDF</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadWord}><FileText className="h-4 w-4 mr-1" />Xuất Word</Button>
          <div className="border-l mx-1 h-6" />
          <div className="flex items-center gap-2">
            <Switch checked={showOnlineStamp} onCheckedChange={setShowOnlineStamp} />
            <span className="text-xs font-medium">Ký & đóng dấu online</span>
          </div>
        </div>

        {/* Preview */}
        <div ref={printRef} className="bg-white p-8 rounded-lg border space-y-4 text-sm" style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", lineHeight: 1.7 }}>
          <div className="text-center space-y-1">
            <p className="font-bold text-sm">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p className="font-bold text-sm" style={{ textDecoration: "underline" }}>Độc lập – Tự do – Hạnh phúc</p>
            <p className="text-xs" style={{ color: "#6b7280" }}>————————</p>
          </div>

          <div className="text-center mt-4">
            <h2 className="text-lg font-bold" style={{ color: "#1a56db" }}>ĐỀ NGHỊ THANH TOÁN</h2>
            <p className="text-sm italic">(Theo Hợp đồng số: {contract.contract_number})</p>
          </div>

          <p className="text-right italic">Ngày {formatDate(requestDate)}</p>

          <p><strong>Kính gửi:</strong> {buyerName}</p>

          <p>Căn cứ Hợp đồng số {contract.contract_number} ngày {formatDate(contract.contract_date)} giữa {sellerName} và {buyerName}, chúng tôi đề nghị Quý khách hàng thanh toán theo chi tiết sau:</p>

          <p className="font-bold mt-4">BẢNG TỔNG HỢP THANH TOÁN:</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <th className="border border-gray-400 p-2 text-left">Nội dung</th>
                <th className="border border-gray-400 p-2 text-right w-40">Giá trị</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-400 p-2">Tổng giá trị hợp đồng</td>
                <td className="border border-gray-400 p-2 text-right">{formatCurrency(totalAmount)}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2">Đã thanh toán (đặt cọc {contract.deposit_percentage || 70}%)</td>
                <td className="border border-gray-400 p-2 text-right">{formatCurrency(depositAmount)}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2 font-bold">Số tiền đề nghị thanh toán</td>
                <td className="border border-gray-400 p-2 text-right font-bold" style={{ color: "#1a56db" }}>{formatCurrency(selectedPhase.amount)}</td>
              </tr>
            </tbody>
          </table>

          <p className="font-bold mt-4">THÔNG TIN CHUYỂN KHOẢN:</p>
          <div className="p-3 border rounded">
            <p><strong>Đơn vị thụ hưởng:</strong> {sellerName}</p>
            {sellerTaxCode && <p><strong>Mã số thuế:</strong> {sellerTaxCode}</p>}
            {sellerBank && <p><strong>Ngân hàng:</strong> {sellerBank}</p>}
            <p><strong>Nội dung CK:</strong> Thanh toán HĐ {contract.contract_number}</p>
          </div>

          {additionalNotes && (
            <>
              <p className="font-bold mt-4">GHI CHÚ:</p>
              <p className="whitespace-pre-wrap">{additionalNotes}</p>
            </>
          )}

          <p className="mt-4">Kính mong Quý khách hàng thanh toán đúng hạn. Trân trọng cảm ơn!</p>

          <div className="grid grid-cols-2 gap-8 pt-8 mt-8 text-center" style={{ borderTop: "1px solid #e5e7eb" }}>
            <div>
              <p className="font-bold">NGƯỜI ĐỀ NGHỊ</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>(Ký, đóng dấu)</p>
              {showOnlineStamp && (companySettings.stampUrl || companySettings.signatureUrl) ? (
                <div className="relative" style={{ height: 100 }}>
                  {companySettings.stampUrl && <img src={companySettings.stampUrl} alt="Dấu" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-60%, -50%)", width: 110, height: 110, opacity: 0.85, objectFit: "contain" }} />}
                  {companySettings.signatureUrl && <img src={companySettings.signatureUrl} alt="Ký" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-40%, -45%)", width: 90, height: 60, opacity: 0.9, objectFit: "contain" }} />}
                </div>
              ) : (
                <div style={{ height: 80 }}></div>
              )}
              {showOnlineStamp && seller.representative && <p className="font-bold">{seller.representative}</p>}
            </div>
            <div>
              <p className="font-bold">XÁC NHẬN CỦA KHÁCH HÀNG</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>(Ký, ghi rõ họ tên)</p>
              <div style={{ height: 80 }}></div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
