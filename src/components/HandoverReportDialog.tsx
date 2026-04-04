import { useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export const HandoverReportDialog = ({ open, onOpenChange, contract }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { settings: companySettings } = useTemplateSettings();
  const { toast } = useToast();
  const [handoverDate, setHandoverDate] = useState(new Date().toISOString().split("T")[0]);
  const [conclusion, setConclusion] = useState("Hàng hóa đạt yêu cầu chất lượng theo hợp đồng. Hai bên thống nhất nghiệm thu đạt.");
  const [notes, setNotes] = useState("");

  if (!contract) return null;

  const formatCurrency = (val: number) => (val || 0).toLocaleString("vi-VN") + " ₫";
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("vi-VN") : "—";

  const items = Array.isArray(contract.items) ? contract.items : [];
  const seller = contract.seller_info || {};
  const buyer = contract.buyer_info || {};
  const sellerName = seller.company_name || companySettings.companyName || "";
  const sellerRep = seller.representative || "...";
  const sellerPos = seller.position || "Giám đốc";
  const sellerAddr = seller.address || companySettings.address || "...";
  const sellerPhone = seller.phone || companySettings.phone || "";
  const sellerTax = seller.tax_code || companySettings.taxCode || "";
  const buyerName = buyer.company_name || contract.customers?.company || contract.customers?.name || "—";
  const buyerRep = buyer.representative || "...";
  const buyerPos = buyer.position || "";
  const buyerAddr = buyer.address || "";
  const buyerPhone = buyer.phone || "";
  const buyerTax = buyer.tax_code || "";

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>BBBG - ${contract.contract_number}</title>
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
      pdf.save(`BBBG-${contract.contract_number}.pdf`);
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

      const headerRow = new DocxTableRow({
        children: ["TT", "Tên sản phẩm", "Kích thước", "SL", "Tình trạng"].map((text, idx) =>
          new DocxTableCell({
            children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, font })], alignment: AlignmentType.CENTER })],
            borders: borderStyle,
            width: idx === 0 ? { size: 600, type: WidthType.DXA } : idx === 3 ? { size: 700, type: WidthType.DXA } : { size: 2000, type: WidthType.DXA },
          })
        ),
      });

      const itemRows = items.map((item: any, i: number) =>
        new DocxTableRow({
          children: [
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(i + 1), size: 20, font })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.name || "—", size: 20, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.specifications || item.description || "—", size: 20, font })] })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(item.quantity || 1), size: 20, font })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
            new DocxTableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Đạt", size: 20, font })], alignment: AlignmentType.CENTER })], borders: borderStyle }),
          ],
        })
      );

      const makePartyParagraphs = (label: string, name: string, rep: string, pos: string, addr: string, phone: string, tax: string) => {
        const paras: Paragraph[] = [
          new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 22, font })], spacing: { before: 100 } }),
          new Paragraph({ children: [new TextRun({ text: `Công ty: ${name}`, size: 20, font })] }),
          new Paragraph({ children: [new TextRun({ text: `Đại diện: ${rep}`, size: 20, font }), ...(pos ? [new TextRun({ text: `    Chức vụ: ${pos}`, size: 20, font })] : [])] }),
        ];
        if (addr) paras.push(new Paragraph({ children: [new TextRun({ text: `Địa chỉ: ${addr}`, size: 20, font })] }));
        if (phone) paras.push(new Paragraph({ children: [new TextRun({ text: `Điện thoại: ${phone}`, size: 20, font })] }));
        if (tax) paras.push(new Paragraph({ children: [new TextRun({ text: `MST: ${tax}`, size: 20, font })] }));
        return paras;
      };

      const children: any[] = [
        new Paragraph({ children: [new TextRun({ text: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", bold: true, size: 24, font })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "Độc lập – Tự do – Hạnh phúc", bold: true, size: 24, font, underline: {} })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: "————————", size: 20, font })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: "BIÊN BẢN BÀN GIAO", bold: true, size: 32, font, color: "1a56db" })], alignment: AlignmentType.CENTER, spacing: { before: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `(Kèm theo Hợp đồng số: ${contract.contract_number})`, italics: true, size: 20, font })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `Hôm nay, ngày ${formatDate(handoverDate)}, tại ${sellerAddr}`, size: 20, font })], spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: `Căn cứ Hợp đồng số ${contract.contract_number} ngày ${formatDate(contract.contract_date)}, hai bên tiến hành bàn giao như sau:`, size: 20, font })], spacing: { after: 200 } }),
        ...makePartyParagraphs("BÊN GIAO (Bên A):", sellerName, sellerRep, sellerPos, sellerAddr, sellerPhone, sellerTax),
        ...makePartyParagraphs("BÊN NHẬN (Bên B):", buyerName, buyerRep, buyerPos, buyerAddr, buyerPhone, buyerTax),
        new Paragraph({ children: [new TextRun({ text: "I. NỘI DUNG BÀN GIAO:", bold: true, size: 22, font })], spacing: { before: 200 } }),
        new DocxTable({ rows: [headerRow, ...itemRows], width: { size: 100, type: WidthType.PERCENTAGE } }),
        new Paragraph({ children: [new TextRun({ text: "II. KẾT LUẬN:", bold: true, size: 22, font })], spacing: { before: 200 } }),
        new Paragraph({ children: [new TextRun({ text: conclusion, size: 20, font })], spacing: { after: 100 } }),
      ];

      if (notes) {
        children.push(
          new Paragraph({ children: [new TextRun({ text: "III. GHI CHÚ:", bold: true, size: 22, font })], spacing: { before: 100 } }),
          new Paragraph({ children: [new TextRun({ text: notes, size: 20, font })], spacing: { after: 100 } }),
        );
      }

      children.push(
        new Paragraph({ children: [new TextRun({ text: `Biên bản được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị pháp lý như nhau.`, italics: true, size: 20, font })], spacing: { before: 200, after: 200 } }),
        new DocxTable({
          rows: [new DocxTableRow({
            children: [
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: "BÊN GIAO (BÊN A)", bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên)", italics: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: sellerRep !== "..." ? sellerRep : "", bold: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                ],
                borders: noBorder, width: { size: 50, type: WidthType.PERCENTAGE },
              }),
              new DocxTableCell({
                children: [
                  new Paragraph({ children: [new TextRun({ text: "BÊN NHẬN (BÊN B)", bold: true, size: 22, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ children: [new TextRun({ text: "(Ký, ghi rõ họ tên)", italics: true, size: 20, font })], alignment: AlignmentType.CENTER }),
                  new Paragraph({ text: "" }), new Paragraph({ text: "" }), new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: buyerRep !== "..." ? buyerRep : "", bold: true, size: 20, font })], alignment: AlignmentType.CENTER }),
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
      saveAs(blob, `BBBG-${contract.contract_number}.docx`);
      toast({ title: "Đã tải file Word thành công!" });
    } catch (err) {
      console.error("Word export error:", err);
      toast({ title: "Lỗi tạo file Word", variant: "destructive" });
    }
  };

  const PartyInfoBlock = ({ label, name, rep, pos, addr, phone, tax }: { label: string; name: string; rep: string; pos: string; addr: string; phone: string; tax: string }) => (
    <div className="p-3 border rounded">
      <p className="font-bold mb-1">{label}</p>
      <p><strong>Công ty:</strong> {name}</p>
      <p><strong>Đại diện:</strong> {rep}{pos ? <span className="ml-4"><strong>Chức vụ:</strong> {pos}</span> : null}</p>
      {addr && <p><strong>Địa chỉ:</strong> {addr}</p>}
      {(phone || tax) && (
        <p>
          {phone && <><strong>ĐT:</strong> {phone}</>}
          {phone && tax && <span className="mx-3">|</span>}
          {tax && <><strong>MST:</strong> {tax}</>}
        </p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Biên bản Bàn giao - {contract.contract_number}</DialogTitle>
        </DialogHeader>

        {/* Editable fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-4 border rounded-lg bg-muted/30">
          <div>
            <Label>Ngày bàn giao</Label>
            <Input type="date" value={handoverDate} onChange={e => setHandoverDate(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Kết luận nghiệm thu</Label>
            <Textarea value={conclusion} onChange={e => setConclusion(e.target.value)} rows={2} />
          </div>
          <div className="md:col-span-3">
            <Label>Ghi chú thêm</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Ghi chú bổ sung (nếu có)..." />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" />In</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadPDF}><FileDown className="h-4 w-4 mr-1" />Xuất PDF</Button>
          <Button size="sm" variant="outline" onClick={handleDownloadWord}><FileText className="h-4 w-4 mr-1" />Xuất Word</Button>
        </div>

        {/* Preview */}
        <div ref={printRef} className="bg-white p-8 rounded-lg border space-y-4 text-sm" style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", lineHeight: 1.7 }}>
          <div className="text-center space-y-1">
            <p className="font-bold text-sm">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p className="font-bold text-sm" style={{ textDecoration: "underline" }}>Độc lập – Tự do – Hạnh phúc</p>
            <p className="text-xs" style={{ color: "#6b7280" }}>————————</p>
          </div>

          <div className="text-center mt-4">
            <h2 className="text-lg font-bold" style={{ color: "#1a56db" }}>BIÊN BẢN BÀN GIAO</h2>
            <p className="text-sm italic">(Kèm theo Hợp đồng số: {contract.contract_number})</p>
          </div>

          <p>Hôm nay, ngày {formatDate(handoverDate)}, tại {sellerAddr}</p>
          <p>Căn cứ Hợp đồng số {contract.contract_number} ngày {formatDate(contract.contract_date)}, hai bên tiến hành bàn giao như sau:</p>

          <PartyInfoBlock label="BÊN GIAO (Bên A):" name={sellerName} rep={sellerRep} pos={sellerPos} addr={sellerAddr} phone={sellerPhone} tax={sellerTax} />
          <PartyInfoBlock label="BÊN NHẬN (Bên B):" name={buyerName} rep={buyerRep} pos={buyerPos} addr={buyerAddr} phone={buyerPhone} tax={buyerTax} />

          <p className="font-bold mt-4">I. NỘI DUNG BÀN GIAO:</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: "#f3f4f6" }}>
                <th className="border border-gray-400 p-2 text-center w-10">TT</th>
                <th className="border border-gray-400 p-2 text-left">Tên sản phẩm</th>
                <th className="border border-gray-400 p-2 text-left">Kích thước</th>
                <th className="border border-gray-400 p-2 text-center w-12">SL</th>
                <th className="border border-gray-400 p-2 text-center">Tình trạng</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, i: number) => (
                <tr key={i}>
                  <td className="border border-gray-400 p-2 text-center">{i + 1}</td>
                  <td className="border border-gray-400 p-2">{item.name || "—"}</td>
                  <td className="border border-gray-400 p-2">{item.specifications || item.description || "—"}</td>
                  <td className="border border-gray-400 p-2 text-center">{item.quantity || 1}</td>
                  <td className="border border-gray-400 p-2 text-center">Đạt</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="font-bold mt-4">II. KẾT LUẬN:</p>
          <p className="whitespace-pre-wrap">{conclusion}</p>

          {notes && (
            <>
              <p className="font-bold mt-4">III. GHI CHÚ:</p>
              <p className="whitespace-pre-wrap">{notes}</p>
            </>
          )}

          <p className="italic text-xs mt-4">Biên bản được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị pháp lý như nhau.</p>

          <div className="grid grid-cols-2 gap-8 pt-8 mt-8 text-center" style={{ borderTop: "1px solid #e5e7eb" }}>
            <div>
              <p className="font-bold">BÊN GIAO (BÊN A)</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>(Ký, ghi rõ họ tên)</p>
              <div style={{ height: 80 }}></div>
              {sellerRep !== "..." && <p className="font-bold">{sellerRep}</p>}
            </div>
            <div>
              <p className="font-bold">BÊN NHẬN (BÊN B)</p>
              <p className="text-xs italic" style={{ color: "#6b7280" }}>(Ký, ghi rõ họ tên)</p>
              <div style={{ height: 80 }}></div>
              {buyerRep !== "..." && <p className="font-bold">{buyerRep}</p>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
