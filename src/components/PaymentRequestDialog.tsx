import { useRef, useState } from "react";
import { OnlineStampSignature } from "@/components/OnlineStampSignature";
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
import { exportElementToPDF } from "@/lib/pdfUtils";
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, AlignmentType, BorderStyle, TabStopType, TabStopPosition } from "docx";
import { saveAs } from "file-saver";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any;
}

const formatDateParts = (d: string) => {
  if (!d) return { day: "...", month: "...", year: "..." };
  const date = new Date(d);
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    year: String(date.getFullYear()),
  };
};

export const PaymentRequestDialog = ({ open, onOpenChange, contract }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { settings: companySettings } = useTemplateSettings();
  const { toast } = useToast();
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentPhase, setPaymentPhase] = useState("remaining");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [showOnlineStamp, setShowOnlineStamp] = useState(false);
  const [documentNumber, setDocumentNumber] = useState("");

  if (!contract) return null;

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("vi-VN") : ".../.../...";

  const seller = contract.seller_info || {};
  const buyer = contract.buyer_info || {};
  const totalAmount = contract.total_amount || 0;
  const depositAmount = contract.deposit_amount || 0;
  const remainingAmount = totalAmount - depositAmount;

  const sellerName = companySettings.companyName || seller.company_name || "";
  const sellerBank = companySettings.bankInfo || seller.bank_info || "";
  const sellerTaxCode = companySettings.taxCode || seller.tax_code || "";
  const sellerAddress = companySettings.address || seller.address || "";
  const sellerPhone = companySettings.phone || seller.phone || "";
  const sellerRep = seller.representative || "";
  const sellerPos = seller.position || "Giám đốc";

  const buyerName = buyer.company_name || contract.customers?.company || contract.customers?.name || "...";
  const buyerAddress = buyer.address || contract.customers?.address || "";
  const buyerRep = buyer.representative || "";
  const buyerPos = buyer.position || "";

  const dateParts = formatDateParts(requestDate);

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
      .no-border td, .no-border th { border: none; }
    </style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    try {
      toast({ title: "Đang tạo PDF..." });
      await exportElementToPDF(printRef.current, `DNTT-${contract.contract_number}.pdf`);
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
      const sz = 22; // 11pt

      // Header table: company left, national motto right
      const headerTable = new DocxTable({
        rows: [new DocxTableRow({
          children: [
            new DocxTableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: sellerName.toUpperCase(), bold: true, size: 26, font })], alignment: AlignmentType.CENTER }),
                new Paragraph({ children: [new TextRun({ text: documentNumber ? `Số: ${documentNumber}` : "Số: .../ĐNTT", size: sz, font })], alignment: AlignmentType.CENTER }),
              ],
              borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
              verticalAlign: "center",
            }),
            new DocxTableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold: true, size: 26, font })], alignment: AlignmentType.CENTER }),
                new Paragraph({ children: [new TextRun({ text: "Độc lập – Tự do – Hạnh phúc", bold: true, size: 26, font })], alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 } } }),
                new Paragraph({ children: [new TextRun({ text: `Hà Nội, ngày ${dateParts.day} tháng ${dateParts.month} năm ${dateParts.year}`, italics: true, size: sz, font })], alignment: AlignmentType.CENTER, spacing: { before: 80 } }),
              ],
              borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
            }),
          ],
        })],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 }, insideHorizontal: { style: BorderStyle.NONE, size: 0 }, insideVertical: { style: BorderStyle.NONE, size: 0 } },
      });

      // Payment table with STT
      const paymentTableRows = [
        new DocxTableRow({
          children: ["STT", "Nội dung", "Thành tiền (VNĐ)"].map((text, i) =>
            new DocxTableCell({
              children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: sz, font })], alignment: AlignmentType.CENTER })],
              borders: borderStyle,
              width: { size: i === 0 ? 10 : i === 1 ? 55 : 35, type: WidthType.PERCENTAGE },
            })
          ),
        }),
        new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "1", size: sz, font })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Tổng giá trị Hợp đồng", size: sz, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(totalAmount), size: sz, font })], alignment: AlignmentType.RIGHT })], borders: borderStyle }),
          ],
        }),
        new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "2", size: sz, font })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: `Đã thanh toán đợt 1 (Đặt cọc ${contract.deposit_percentage || 70}%)`, size: sz, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(depositAmount), size: sz, font })], alignment: AlignmentType.RIGHT })], borders: borderStyle }),
          ],
        }),
        new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "3", size: sz, font })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Số tiền đề nghị thanh toán đợt này", bold: true, size: sz, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(selectedPhase.amount), bold: true, size: sz, font, color: "1a56db" })], alignment: AlignmentType.RIGHT })], borders: borderStyle }),
          ],
        }),
      ];

      const children: any[] = [
        headerTable,
        new Paragraph({ spacing: { before: 300 } }),
        new Paragraph({ children: [new TextRun({ text: "ĐỀ NGHỊ THANH TOÁN", bold: true, size: 32, font })], alignment: AlignmentType.CENTER, spacing: { before: 100 } }),
        new Paragraph({ children: [new TextRun({ text: `V/v: Đề nghị thanh toán theo Hợp đồng số ${contract.contract_number}`, italics: true, size: sz, font })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),

        new Paragraph({ children: [new TextRun({ text: `Kính gửi: ${buyerName}`, bold: true, size: sz + 2, font })], spacing: { after: 100 } }),
      ];

      if (buyerAddress) {
        children.push(new Paragraph({ children: [new TextRun({ text: `Địa chỉ: ${buyerAddress}`, size: sz, font })], spacing: { after: 200 } }));
      }

      // Seller info block
      children.push(
        new Paragraph({ children: [new TextRun({ text: "Đơn vị đề nghị thanh toán:", bold: true, size: sz, font })], spacing: { before: 100 } }),
        new Paragraph({ children: [new TextRun({ text: `- Tên đơn vị: ${sellerName}`, size: sz, font })] }),
      );
      if (sellerTaxCode) children.push(new Paragraph({ children: [new TextRun({ text: `- Mã số thuế: ${sellerTaxCode}`, size: sz, font })] }));
      if (sellerAddress) children.push(new Paragraph({ children: [new TextRun({ text: `- Địa chỉ: ${sellerAddress}`, size: sz, font })] }));
      if (sellerRep) children.push(new Paragraph({ children: [new TextRun({ text: `- Người đại diện: ${sellerRep} – Chức vụ: ${sellerPos}`, size: sz, font })] }));
      if (sellerPhone) children.push(new Paragraph({ children: [new TextRun({ text: `- Điện thoại: ${sellerPhone}`, size: sz, font })] }));

      children.push(
        new Paragraph({ spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: `Căn cứ Hợp đồng số ${contract.contract_number} ký ngày ${formatDate(contract.contract_date)} giữa hai bên về việc cung cấp hàng hóa, ${sellerName} kính đề nghị Quý Công ty thanh toán số tiền theo bảng chi tiết dưới đây:`, size: sz, font })], spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "I. BẢNG CHI TIẾT THANH TOÁN", bold: true, size: sz + 2, font })], spacing: { before: 100, after: 100 } }),
        new DocxTable({ rows: paymentTableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
        new Paragraph({ spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: "II. THÔNG TIN CHUYỂN KHOẢN", bold: true, size: sz + 2, font })], spacing: { before: 100, after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: `- Đơn vị thụ hưởng: ${sellerName}`, size: sz, font })] }),
      );

      if (sellerTaxCode) children.push(new Paragraph({ children: [new TextRun({ text: `- Mã số thuế: ${sellerTaxCode}`, size: sz, font })] }));
      if (sellerBank) children.push(new Paragraph({ children: [new TextRun({ text: `- Ngân hàng: ${sellerBank}`, size: sz, font })] }));
      children.push(new Paragraph({ children: [new TextRun({ text: `- Nội dung chuyển khoản: Thanh toán HĐ số ${contract.contract_number}`, size: sz, font })], spacing: { after: 200 } }));

      if (additionalNotes) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: "III. GHI CHÚ", bold: true, size: sz + 2, font })], spacing: { before: 100 } }),
          new Paragraph({ children: [new TextRun({ text: additionalNotes, size: sz, font })], spacing: { after: 200 } }),
        );
      }

      children.push(
        new Paragraph({ children: [new TextRun({ text: `Kính đề nghị Quý Công ty/Đơn vị sắp xếp thanh toán đúng hạn theo thông tin nêu trên.${sellerPhone ? ` Mọi thắc mắc xin vui lòng liên hệ theo số điện thoại: ${sellerPhone} để được hỗ trợ.` : ""}`, size: sz, font })], spacing: { before: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "Trân trọng./", size: sz, font })], spacing: { after: 300 } }),

        // Signature table
        new DocxTable({
          rows: [new DocxTableRow({
            children: [
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: "ĐẠI DIỆN BÊN BÁN", bold: true, size: sz, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: "(Ký, đóng dấu, ghi rõ họ tên)", italics: true, size: 18, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                  ...(sellerRep ? [new Paragraph({ children: [new TextRun({ text: sellerRep, bold: true, size: sz, font })], alignment: AlignmentType.CENTER })] : []),
                ],
                borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
              }),
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: "XÁC NHẬN BÊN MUA", bold: true, size: sz, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: "(Ký, đóng dấu, ghi rõ họ tên)", italics: true, size: 18, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                  ...(buyerRep ? [new Paragraph({ children: [new TextRun({ text: buyerRep, bold: true, size: sz, font })], alignment: AlignmentType.CENTER })] : []),
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 border rounded-lg bg-muted/30">
          <div>
            <Label>Số công văn</Label>
            <Input value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} placeholder="VD: 01/ĐNTT" />
          </div>
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
          <div className="md:col-span-4">
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
        <div ref={printRef} className="bg-white p-6 rounded-lg border" style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", lineHeight: 1.7, fontSize: "13px" }}>
          {/* Header: Company left + National motto right */}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
            <tbody>
              <tr>
                <td style={{ width: "45%", textAlign: "center", verticalAlign: "top", border: "none", padding: "0 8px" }}>
                  <p style={{ fontWeight: "bold", fontSize: "14px", marginBottom: 4 }}>{sellerName.toUpperCase()}</p>
                  <p style={{ fontSize: "13px" }}>
                    {documentNumber ? `Số: ${documentNumber}` : "Số: .../ĐNTT"}
                  </p>
                </td>
                <td style={{ width: "55%", textAlign: "center", verticalAlign: "top", border: "none", padding: "0 8px" }}>
                  <p style={{ fontWeight: "bold", fontSize: "14px", marginBottom: 0 }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                  <p style={{ fontWeight: "bold", fontSize: "14px", borderBottom: "2px solid #000", display: "inline-block", paddingBottom: 2, marginBottom: 6 }}>Độc lập – Tự do – Hạnh phúc</p>
                  <p style={{ fontSize: "13px", fontStyle: "italic", marginTop: 6 }}>
                    Hà Nội, ngày {dateParts.day} tháng {dateParts.month} năm {dateParts.year}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Title */}
          <div className="text-center" style={{ margin: "20px 0 12px" }}>
            <h2 style={{ fontWeight: "bold", fontSize: "16px", color: "#000", marginBottom: 4 }}>ĐỀ NGHỊ THANH TOÁN</h2>
            <p style={{ fontSize: "13px", fontStyle: "italic" }}>V/v: Đề nghị thanh toán theo Hợp đồng số {contract.contract_number}</p>
          </div>

          {/* Kính gửi */}
          <div style={{ marginTop: 16 }}>
            <p><strong>Kính gửi:</strong> {buyerName}</p>
            {buyerAddress && <p style={{ paddingLeft: 60 }}>Địa chỉ: {buyerAddress}</p>}
            {buyerRep && <p style={{ paddingLeft: 60 }}>Người đại diện: {buyerRep}{buyerPos ? ` – Chức vụ: ${buyerPos}` : ""}</p>}
          </div>

          {/* Bên đề nghị */}
          <div style={{ marginTop: 12 }}>
            <p><strong>Đơn vị đề nghị thanh toán:</strong></p>
            <p style={{ paddingLeft: 20 }}>- Tên đơn vị: {sellerName}</p>
            {sellerTaxCode && <p style={{ paddingLeft: 20 }}>- Mã số thuế: {sellerTaxCode}</p>}
            {sellerAddress && <p style={{ paddingLeft: 20 }}>- Địa chỉ: {sellerAddress}</p>}
            {sellerRep && <p style={{ paddingLeft: 20 }}>- Người đại diện: {sellerRep} – Chức vụ: {sellerPos}</p>}
            {sellerPhone && <p style={{ paddingLeft: 20 }}>- Điện thoại: {sellerPhone}</p>}
          </div>

          {/* Căn cứ */}
          <p style={{ marginTop: 12, textAlign: "justify" }}>
            Căn cứ Hợp đồng số <strong>{contract.contract_number}</strong> ký ngày {formatDate(contract.contract_date)} giữa hai bên về việc cung cấp hàng hóa, {sellerName} kính đề nghị Quý Công ty thanh toán số tiền theo bảng chi tiết dưới đây:
          </p>

          {/* Bảng thanh toán */}
          <p className="font-bold" style={{ marginTop: 16, marginBottom: 8 }}>I. BẢNG CHI TIẾT THANH TOÁN</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <th className="border border-gray-400 p-2 text-center" style={{ width: "10%" }}>STT</th>
                <th className="border border-gray-400 p-2 text-left" style={{ width: "55%" }}>Nội dung</th>
                <th className="border border-gray-400 p-2 text-right" style={{ width: "35%" }}>Thành tiền (VNĐ)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-400 p-2 text-center">1</td>
                <td className="border border-gray-400 p-2">Tổng giá trị Hợp đồng</td>
                <td className="border border-gray-400 p-2 text-right">{formatCurrency(totalAmount)}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2 text-center">2</td>
                <td className="border border-gray-400 p-2">Đã thanh toán đợt 1 (Đặt cọc {contract.deposit_percentage || 70}%)</td>
                <td className="border border-gray-400 p-2 text-right">{formatCurrency(depositAmount)}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2 text-center font-bold">3</td>
                <td className="border border-gray-400 p-2 font-bold">Số tiền đề nghị thanh toán đợt này</td>
                <td className="border border-gray-400 p-2 text-right font-bold" style={{ color: "#1a56db" }}>{formatCurrency(selectedPhase.amount)}</td>
              </tr>
            </tbody>
          </table>

          {/* Thông tin chuyển khoản */}
          <p className="font-bold" style={{ marginTop: 16, marginBottom: 8 }}>II. THÔNG TIN CHUYỂN KHOẢN</p>
          <div style={{ paddingLeft: 20 }}>
            <p>- Đơn vị thụ hưởng: <strong>{sellerName}</strong></p>
            {sellerTaxCode && <p>- Mã số thuế: {sellerTaxCode}</p>}
            {sellerBank && <p>- Ngân hàng: {sellerBank}</p>}
            <p>- Nội dung chuyển khoản: <strong>Thanh toán HĐ số {contract.contract_number}</strong></p>
          </div>

          {/* Ghi chú */}
          {additionalNotes && (
            <div style={{ marginTop: 16 }}>
              <p className="font-bold" style={{ marginBottom: 4 }}>III. GHI CHÚ</p>
              <p className="whitespace-pre-wrap" style={{ paddingLeft: 20 }}>{additionalNotes}</p>
            </div>
          )}

          {/* Kết */}
          <p style={{ marginTop: 16, textAlign: "justify" }}>
            Kính đề nghị Quý Công ty/Đơn vị sắp xếp thanh toán đúng hạn theo thông tin nêu trên.
            {sellerPhone ? ` Mọi thắc mắc xin vui lòng liên hệ theo số điện thoại: ${sellerPhone} để được hỗ trợ.` : ""}
          </p>
          <p style={{ marginTop: 4 }}>Trân trọng./</p>

          {/* Ký tên */}
          <div className="grid grid-cols-2 gap-8 text-center" style={{ marginTop: 32 }}>
            <div>
              <p style={{ fontWeight: "bold" }}>ĐẠI DIỆN BÊN BÁN</p>
              <p style={{ fontSize: "11px", fontStyle: "italic", color: "#6b7280" }}>(Ký, đóng dấu, ghi rõ họ tên)</p>
              <OnlineStampSignature show={showOnlineStamp} sellerRep={sellerRep} sellerPos={sellerPos} />
              {!showOnlineStamp && <div style={{ height: 80 }}></div>}
              {sellerRep && !showOnlineStamp && <p style={{ fontWeight: "bold", fontSize: "13px" }}>{sellerRep}</p>}
            </div>
            <div>
              <p style={{ fontWeight: "bold" }}>XÁC NHẬN BÊN MUA</p>
              <p style={{ fontSize: "11px", fontStyle: "italic", color: "#6b7280" }}>(Ký, đóng dấu, ghi rõ họ tên)</p>
              <div style={{ height: 80 }}></div>
              {buyerRep && <p style={{ fontWeight: "bold", fontSize: "13px" }}>{buyerRep}</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
